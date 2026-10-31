/**
 * Cross-checks TACZ pack references against the files on disk. `tacz_pack
 * validate` checks structure; this catches a display/index reference whose
 * target file is missing (for example `animation: ns:dp12` without
 * `animations/dp12.animation.json`).
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Splits `namespace:path` and rejects a reserved namespace. */
function splitRef(value) {
  if (typeof value !== "string" || !value.includes(":")) return undefined;
  const [namespace, ...rest] = value.split(":");
  if (!namespace || !rest.length) return undefined;
  return { namespace, target: rest.join(":") };
}

/** Returns a path under a namespace, refusing traversal. */
function assetPath(packDir, namespace, rel) {
  const root = path.resolve(packDir, "assets", namespace);
  const file = path.resolve(root, ...rel.split("/"));
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return undefined;
  return file;
}

/** Checks one file and records a readable result. */
function checkFile(packDir, namespace, rel, label, errors) {
  if (!namespace || !rel) return;
  const file = assetPath(packDir, namespace, rel);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    errors.push(`${label}: missing assets/${namespace}/${rel}`);
  }
}

/** Reads a JSON file, returning undefined when absent/invalid. */
function readJson(file, errors) {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`invalid JSON ${file}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/** Recursively lists files under a directory. */
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Verifies one pack directory.
 *
 * @param {string} packDir absolute pack root.
 * @returns {{ok: boolean, errors: string[], warnings: string[], checked: number}} report.
 */
export function verifyPack(packDir) {
  const root = path.resolve(String(packDir ?? ""));
  const errors = [];
  const warnings = [];
  let checked = 0;
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return { ok: false, errors: [`pack_dir not found: ${root}`], warnings, checked };
  }
  const meta = readJson(path.join(root, "gunpack.meta.json"), errors);
  if (meta?.namespace === "tacz") errors.push("namespace must not be tacz");
  const assetsRoot = path.join(root, "assets");
  if (!fs.existsSync(assetsRoot)) errors.push("assets/ is missing");
  const displays = walk(assetsRoot).filter(file => file.endsWith("_display.json"));
  if (displays.length === 0) warnings.push("no assets/*/display/guns/*_display.json found");

  for (const file of displays) {
    const display = readJson(file, errors);
    if (!display) continue;
    const model = splitRef(display.model);
    if (model && model.target.startsWith("gun/")) {
      checked++;
      checkFile(root, model.namespace, `geo_models/${model.target}.json`, `${file} model`, errors);
    }
    for (const key of ["texture", "slot", "hud"]) {
      const ref = splitRef(display[key]);
      if (!ref) continue;
      checked++;
      checkFile(root, ref.namespace, `textures/${ref.target}.png`, `${file} ${key}`, errors);
    }
    for (const key of ["lod"]) {
      const lod = display[key];
      const ref = splitRef(lod?.model);
      if (ref) { checked++; checkFile(root, ref.namespace, `geo_models/${ref.target}.json`, `${file} lod.model`, errors); }
      const tex = splitRef(lod?.texture);
      if (tex) { checked++; checkFile(root, tex.namespace, `textures/${tex.target}.png`, `${file} lod.texture`, errors); }
    }
    const animation = splitRef(display.animation);
    if (animation) {
      checked++;
      const rel = `animations/${animation.target}.animation.json`;
      const expected = assetPath(root, animation.namespace, rel);
      if (!expected || !fs.existsSync(expected)) {
        const legacy = assetPath(root, animation.namespace, `animations/${animation.target}.json`);
        errors.push(`${file} animation: missing assets/${animation.namespace}/${rel}${legacy && fs.existsSync(legacy) ? " (found legacy .json without .animation)" : ""}`);
      }
    }
    const stateMachine = splitRef(display.state_machine);
    if (stateMachine) {
      checked++;
      checkFile(root, stateMachine.namespace, `scripts/${stateMachine.target}.lua`, `${file} state_machine`, errors);
    }
    if (display.sounds && typeof display.sounds === "object") {
      warnings.push(`${file} sounds: keys not filesystem-verified (${Object.keys(display.sounds).length} keys)`);
    }
    if (!display.animation) warnings.push(`${file} has no animation reference`);
  }

  for (const file of walk(path.join(root, "data")).filter(item => item.endsWith(".json"))) {
    const data = readJson(file, errors);
    if (!data) continue;
    for (const key of ["display", "data"]) {
      const ref = splitRef(data[key]);
      if (!ref) continue;
      checked++;
      if (key === "display") checkFile(root, ref.namespace, `display/guns/${ref.target}.json`, `${file} display`, errors);
      else {
        const rel = `data/${ref.namespace}/data/guns/${path.basename(ref.target)}.json`;
        if (!fs.existsSync(path.join(root, ...rel.split("/")))) errors.push(`${file} data: missing ${rel}`);
      }
    }
  }

  for (const file of walk(root)) {
    const base = path.basename(file);
    if (base === "_write_test.txt" || base.endsWith(".tmp") || base.endsWith(".bak")) {
      warnings.push(`residue: ${path.relative(root, file).replace(/\\/g, "/")}`);
    }
  }

  const hash = crypto.createHash("sha256");
  for (const file of walk(root).sort()) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    hash.update(rel);
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }

  return { ok: errors.length === 0, errors, warnings, checked, fingerprint: hash.digest("hex") };
}
