/**
 * Repairs the ww2_rare pack's ammunition and attachment layout against the
 * official tacz_default_gun conventions.
 *
 * The pack loads (verifyPack says ok) but three things are wrong in ways that
 * only show in game:
 *
 * 1. Ammo models are named <id>_geo.json and referenced as `ammo/<id>_geo`.
 *    Official ammo models are <id>.json, referenced as `ammo/<id>`. Guns keep
 *    the _geo suffix, attachments keep it too — ammo is the exception, and this
 *    pack applied the gun rule to ammunition.
 *
 * 2. Ammo and attachment display files sit in display/guns/. Official packs
 *    keep them in display/ammo/ and display/attachments/. The pack has copies
 *    in both places, so a stale duplicate is also present.
 *
 * 3. nagant_m1895 has no allow_attachments tag file while danuvia_43m does.
 *
 * Usage: node tools/repair-pack-layout.mjs <pack_dir> <namespace> [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";

const [packDir, ns, ...flags] = process.argv.slice(2);
if (!packDir || !ns) {
  console.error("usage: node tools/repair-pack-layout.mjs <pack_dir> <namespace> [--dry-run]");
  process.exit(2);
}
const dryRun = flags.includes("--dry-run");
const assets = path.join(packDir, "assets", ns);
const data = path.join(packDir, "data", ns);
const changes = [];

/** Reads JSON, or returns undefined when the file is absent. */
function readJson(file) {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/** Writes JSON only when it actually changed. */
function writeJson(file, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === text) return;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, "utf8");
  }
  changes.push(`${dryRun ? "would write" : "wrote"} ${path.relative(packDir, file)}`);
}

/** Moves a file, creating the destination directory. */
function moveFile(from, to) {
  if (!fs.existsSync(from)) return;
  if (fs.existsSync(to)) {
    // Destination already correct; drop the stale duplicate.
    if (!dryRun) fs.rmSync(from, { force: true });
    changes.push(`${dryRun ? "would remove duplicate" : "removed duplicate"} ${path.relative(packDir, from)}`);
    return;
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
  }
  changes.push(`${dryRun ? "would move" : "moved"} ${path.relative(packDir, from)} -> ${path.relative(packDir, to)}`);
}

// --- 1. ammo models lose the _geo suffix ---------------------------------
const ammoModelDir = path.join(assets, "geo_models", "ammo");
if (fs.existsSync(ammoModelDir)) {
  for (const file of fs.readdirSync(ammoModelDir)) {
    if (!file.endsWith("_geo.json")) continue;
    const fixed = file.replace(/_geo\.json$/, ".json");
    moveFile(path.join(ammoModelDir, file), path.join(ammoModelDir, fixed));
  }
}

// --- 2. display files move out of display/guns ---------------------------
const indexAmmo = path.join(data, "index", "ammo");
const indexAttach = path.join(data, "index", "attachments");
const ammoIds = fs.existsSync(indexAmmo) ? fs.readdirSync(indexAmmo).map(f => f.replace(/\.json$/, "")) : [];
const attachIds = fs.existsSync(indexAttach) ? fs.readdirSync(indexAttach).map(f => f.replace(/\.json$/, "")) : [];

for (const id of ammoIds) {
  const file = `${id}_display.json`;
  moveFile(path.join(assets, "display", "guns", file), path.join(assets, "display", "ammo", file));
}
for (const id of attachIds) {
  const file = `${id}_display.json`;
  moveFile(path.join(assets, "display", "guns", file), path.join(assets, "display", "attachments", file));
}

// --- 3. rewrite display references ---------------------------------------
for (const id of ammoIds) {
  const file = path.join(assets, "display", "ammo", `${id}_display.json`);
  const display = readJson(file);
  if (!display) continue;
  let touched = false;
  if (typeof display.model === "string" && display.model.endsWith("_geo")) {
    display.model = display.model.replace(/_geo$/, "");
    touched = true;
  }
  if (touched) writeJson(file, display);
}

// --- 4. ammo index must not carry tracer_color ---------------------------
// tracer_color belongs in display, not index; a pack that puts it in the index
// silently loses it.
for (const id of ammoIds) {
  const file = path.join(indexAmmo, `${id}.json`);
  const index = readJson(file);
  if (!index) continue;
  if ("tracer_color" in index) {
    delete index.tracer_color;
    writeJson(file, index);
    changes.push(`removed tracer_color from index/ammo/${id}.json (it belongs in display)`);
  }
}

// --- 4b. attachment data must not sit in data/guns ----------------------
// A pack that copies attachment data into data/guns leaves a duplicate the
// loader can pick up instead of the real file under data/attachments.
for (const id of attachIds) {
  const wrong = path.join(data, "data", "guns", `${id}_data.json`);
  if (!fs.existsSync(wrong)) continue;
  if (!dryRun) fs.rmSync(wrong, { force: true });
  changes.push(`${dryRun ? "would remove" : "removed"} misplaced ${path.relative(packDir, wrong)}`);
}

// --- 5. every gun needs an allow_attachments tag file --------------------
const gunIndexDir = path.join(data, "index", "guns");
const gunIds = fs.existsSync(gunIndexDir) ? fs.readdirSync(gunIndexDir).map(f => f.replace(/\.json$/, "")) : [];
for (const id of gunIds) {
  const tagFile = path.join(data, "tacz_tags", "attachments", "allow_attachments", `${id}.json`);
  if (fs.existsSync(tagFile)) continue;
  const gunData = readJson(path.join(data, "data", "guns", `${id}_data.json`)) ?? {};
  const allowed = gunData.allow_attachment_types ?? [];
  const tags = allowed.map(t => `#tacz:${t}`);
  writeJson(tagFile, tags);
}

console.log(`${changes.length} change(s):`);
for (const c of changes) console.log(`  ${c}`);
if (changes.length === 0) console.log("  nothing to repair");
