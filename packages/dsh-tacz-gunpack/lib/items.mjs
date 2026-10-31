/**
 * TACZ item data writers (DSH side): ammo, attachments, recipes and
 * `allow_attachments` tags.
 *
 * This module writes JSON only. Geometry (`*_geo.json`), UV/slot textures
 * (`*.png`) and slot icons belong to the modeler; every writer reports the
 * asset files it references but did not find as `missing`, so the caller knows
 * what still has to be produced.
 *
 * All writes stay inside `projectRoot` and inside `packDir`; ids are validated
 * against `^[a-z0-9_]+$` before any path is built.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";
import { insideRoot, writeTextAtomic } from "./paths.mjs";

/** Recipe type every TACZ gun-smith-table recipe uses. */
export const RECIPE_TYPE = "tacz:gun_smith_table_crafting";

/** Recipe kinds accepted by {@link createItemRecipe}. */
export const ITEM_KINDS = ["gun", "ammo", "attachment"];

/** Default attachment install/uninstall sounds. */
export const DEFAULT_ATTACHMENT_SOUNDS = {
  install: "tacz:attachments/attachment_general_b",
  uninstall: "tacz:attachments/attachment_general_uninstall",
};

/** Default attachment data block. */
export const DEFAULT_ATTACHMENT_DATA = { weight: 0 };

const ID_RE = /^[a-z0-9_]+$/;
const REF_RE = /^([a-z0-9_]+):([a-z0-9_./-]+)$/;
const TAG_RE = /^#([a-z0-9_]+):([a-z0-9_./-]+)$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/** Pack-relative posix path. */
function relOf(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

/** True when the path is an existing regular file. */
function isFile(file) {
  try {
    return fs.existsSync(file) && fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** True when the path is an existing directory. */
function isDir(dir) {
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** Reads and parses JSON, throwing a contextual error. */
function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${label}: invalid JSON at ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Writes JSON with 2-space indent and a trailing newline. */
function writeJson(file, value, overwrite, label) {
  if (fs.existsSync(file) && !overwrite) {
    throw new Error(`${label}: refusing to overwrite ${file}. Pass overwrite: true to replace it.`);
  }
  writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

/** Rejects an id that could escape its directory. */
function assertId(value, label) {
  if (typeof value !== "string" || !ID_RE.test(value)) {
    throw new Error(`${label} must match ^[a-z0-9_]+$, got ${JSON.stringify(value)}.`);
  }
  return value;
}

/** Rejects a missing or blank string. */
function assertText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

/** Splits `namespace:path`, or undefined. */
function splitRef(value) {
  if (typeof value !== "string") return undefined;
  const match = REF_RE.exec(value.trim());
  return match ? { namespace: match[1], target: match[2] } : undefined;
}

/** Builds a `namespace:path` reference, defaulting the namespace. */
function makeRef(namespace, value, fallback) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : fallback;
  if (typeof raw !== "string" || !raw.trim()) throw new Error("A TACZ reference is required here.");
  const ref = raw.includes(":") ? raw.trim() : `${namespace}:${raw.trim()}`;
  if (!splitRef(ref)) throw new Error(`Invalid TACZ reference ${JSON.stringify(ref)}; expected "namespace:path".`);
  return ref;
}

/** Last segment of a reference target (the file stem). */
function lastSegment(target) {
  const parts = String(target).split("/");
  return parts[parts.length - 1];
}

/** Resolves pack/namespace context and validates the two roots. */
function resolveContext({ projectRoot, packDir }) {
  const pack = path.resolve(String(packDir ?? ""));
  const root = projectRoot === undefined ? pack : path.resolve(String(projectRoot));
  if (!isDir(pack)) throw new Error(`pack_dir not found: ${pack}`);
  if (!insideRoot(root, pack)) throw new Error(`pack_dir must stay inside project_root (${root}), got ${pack}.`);
  const metaPath = path.join(pack, "gunpack.meta.json");
  if (!isFile(metaPath)) throw new Error(`gunpack.meta.json missing: ${metaPath}`);
  const meta = readJson(metaPath, "gunpack.meta.json");
  const namespace = meta?.namespace;
  if (typeof namespace !== "string" || !ID_RE.test(namespace)) {
    throw new Error(`gunpack.meta.json namespace must match ^[a-z0-9_]+$, got ${JSON.stringify(namespace)}.`);
  }
  if (namespace === "tacz") throw new Error('gunpack.meta.json namespace must not be "tacz".');
  return { root, pack, namespace };
}

/** Builds one pack path and proves it stays under both roots. */
function packPath(root, pack, ...segments) {
  const file = path.join(pack, ...segments);
  if (!insideRoot(pack, file)) throw new Error(`Refusing to write outside pack_dir: ${file}`);
  if (!insideRoot(root, file)) throw new Error(`Refusing to write outside project_root: ${file}`);
  return file;
}

/** Absolute path of an asset referenced by `namespace:path`. */
function assetFile(pack, ref, kind) {
  const split = splitRef(ref);
  if (!split) throw new Error(`Invalid asset reference ${JSON.stringify(ref)}.`);
  const rel = kind === "model" ? `geo_models/${split.target}.json` : `textures/${split.target}.png`;
  return path.join(pack, "assets", split.namespace, ...rel.split("/"));
}

/** Lists JSON files directly under a directory. */
function listJsonFiles(dir) {
  if (!isDir(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
    .map(entry => path.join(dir, entry.name))
    .sort();
}

/** Lists immediate sub-directories of a directory. */
function listDirs(dir) {
  if (!isDir(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

/** Merges one language key into zh_cn.json and en_us.json without dropping keys. */
function mergeLang(root, pack, namespace, key, value) {
  const written = [];
  for (const locale of ["zh_cn", "en_us"]) {
    const file = packPath(root, pack, "assets", namespace, "lang", `${locale}.json`);
    let existing = {};
    if (fs.existsSync(file)) {
      const parsed = readJson(file, `assets/${namespace}/lang/${locale}.json`);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`assets/${namespace}/lang/${locale}.json must contain a JSON object.`);
      }
      existing = parsed;
    }
    const merged = { ...existing, [key]: value };
    writeTextAtomic(file, `${JSON.stringify(merged, null, 2)}\n`);
    written.push(relOf(pack, file));
  }
  return written;
}

/** Collects the referenced asset files that do not exist yet. */
function missingAssets(pack, references) {
  return references
    .map(({ ref, kind }) => assetFile(pack, ref, kind))
    .filter(file => !isFile(file))
    .map(file => relOf(pack, file))
    .sort();
}

/**
 * Creates an ammo item: index, display and language entries.
 *
 * @param {object} options
 * @param {string} options.projectRoot studio workspace; every write must stay inside it.
 * @param {string} options.packDir pack root that holds gunpack.meta.json.
 * @param {string} options.ammoId lower-case snake_case id.
 * @param {string} options.displayName zh_cn/en_us name value.
 * @param {number} [options.stackSize=64] stack_size.
 * @param {number} [options.sort=10] sort order.
 * @param {string} [options.tracerColor] "#RRGGBB" tracer tint.
 * @param {string} [options.model] model reference, default `ns:ammo/<id>`; the official ammo geometry has no `_geo` suffix.
 * @param {string} [options.texture] texture reference, default `ns:ammo/uv/<id>`.
 * @param {string} [options.slot] slot icon reference, default `ns:ammo/slot/<id>`.
 * @param {string} [options.shellModel] shell model reference.
 * @param {string} [options.shellTexture] shell texture reference.
 * @param {boolean} [options.overwrite=false] replace existing index/display files.
 * @returns {{ok: true, files: string[], missing: string[]}}
 */
export function createAmmoItem({
  projectRoot,
  packDir,
  ammoId,
  displayName,
  stackSize = 64,
  sort = 10,
  tracerColor,
  model,
  texture,
  slot,
  shellModel,
  shellTexture,
  overwrite = false,
}) {
  const { root, pack, namespace } = resolveContext({ projectRoot, packDir });
  const id = assertId(ammoId, "ammoId");
  const name = assertText(displayName, "displayName");
  if (!Number.isInteger(stackSize) || stackSize <= 0) throw new Error("stackSize must be a positive integer.");
  if (!Number.isFinite(sort)) throw new Error("sort must be a finite number.");
  let tracer;
  if (tracerColor !== undefined) {
    tracer = assertText(tracerColor, "tracerColor");
    if (!COLOR_RE.test(tracer)) throw new Error(`tracerColor must look like "#RRGGBB", got ${JSON.stringify(tracer)}.`);
  }

  const modelRef = makeRef(namespace, model, `ammo/${id}`);
  const textureRef = makeRef(namespace, texture, `ammo/uv/${id}`);
  const slotRef = makeRef(namespace, slot, `ammo/slot/${id}`);
  const hasShell = shellModel !== undefined || shellTexture !== undefined;
  const shellModelRef = hasShell ? makeRef(namespace, shellModel, `shell/${id}_shell`) : undefined;
  const shellTextureRef = hasShell ? makeRef(namespace, shellTexture, `shell/${id}_shell`) : undefined;

  const indexFile = packPath(root, pack, "data", namespace, "index", "ammo", `${id}.json`);
  const displayFile = packPath(root, pack, "assets", namespace, "display", "ammo", `${id}_display.json`);

  const index = {
    name: `${namespace}.ammo.${id}.name`,
    display: `${namespace}:${id}_display`,
    stack_size: stackSize,
    sort,
  };

  const display = {
    model: modelRef,
    texture: textureRef,
    slot: slotRef,
  };
  // The wiki keeps tracer_color in the ammo display file, not the index.
  if (tracer !== undefined) display.tracer_color = tracer;
  if (hasShell) display.shell = { model: shellModelRef, texture: shellTextureRef };

  const files = [];
  files.push(relOf(pack, writeJson(indexFile, index, overwrite, `ammo index ${id}`)));
  files.push(relOf(pack, writeJson(displayFile, display, overwrite, `ammo display ${id}`)));
  files.push(...mergeLang(root, pack, namespace, index.name, name));

  const references = [
    { ref: modelRef, kind: "model" },
    { ref: textureRef, kind: "texture" },
    { ref: slotRef, kind: "texture" },
  ];
  if (hasShell) {
    references.push({ ref: shellModelRef, kind: "model" }, { ref: shellTextureRef, kind: "texture" });
  }

  return { ok: true, files: files.sort(), missing: missingAssets(pack, references) };
}

/**
 * Creates an attachment item: index, data, display and language entries.
 *
 * @param {object} options
 * @param {string} options.projectRoot studio workspace; every write must stay inside it.
 * @param {string} options.packDir pack root that holds gunpack.meta.json.
 * @param {string} options.attachmentId lower-case snake_case id.
 * @param {string} options.type attachment type (`scope`, `muzzle`, `stock`, ...).
 * @param {string} options.displayName zh_cn/en_us name value.
 * @param {object} [options.data={}] attachment data merged over `{weight: 0}`.
 * @param {string} [options.model] default `ns:attachment/<id>_geo`.
 * @param {string} [options.texture] default `ns:attachment/uv/<id>`.
 * @param {string} [options.slot] default `ns:attachment/slot/<id>`.
 * @param {{install?: string, uninstall?: string}} [options.sounds] install/uninstall sound keys.
 * @param {boolean} [options.overwrite=false] replace existing index/data/display files.
 * @returns {{ok: true, files: string[], missing: string[]}}
 */
export function createAttachmentItem({
  projectRoot,
  packDir,
  attachmentId,
  type,
  displayName,
  data = {},
  model,
  texture,
  slot,
  sounds,
  display: displayExtras = {},
  overwrite = false,
}) {
  const { root, pack, namespace } = resolveContext({ projectRoot, packDir });
  const id = assertId(attachmentId, "attachmentId");
  const name = assertText(displayName, "displayName");
  const attachmentType = assertId(type, "type");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("data must be a JSON object.");
  if (sounds !== undefined && (!sounds || typeof sounds !== "object" || Array.isArray(sounds))) {
    throw new Error("sounds must be an object with install/uninstall keys.");
  }
  if (!displayExtras || typeof displayExtras !== "object" || Array.isArray(displayExtras)) {
    throw new Error("display must be a JSON object of extra display fields.");
  }

  const modelRef = makeRef(namespace, model, `attachment/${id}_geo`);
  const textureRef = makeRef(namespace, texture, `attachment/uv/${id}`);
  const slotRef = makeRef(namespace, slot, `attachment/slot/${id}`);
  const soundKeys = {
    install: makeRef(namespace, sounds?.install, DEFAULT_ATTACHMENT_SOUNDS.install),
    uninstall: makeRef(namespace, sounds?.uninstall, DEFAULT_ATTACHMENT_SOUNDS.uninstall),
  };

  const indexFile = packPath(root, pack, "data", namespace, "index", "attachments", `${id}.json`);
  const dataFile = packPath(root, pack, "data", namespace, "data", "attachments", `${id}_data.json`);
  const displayFile = packPath(root, pack, "assets", namespace, "display", "attachments", `${id}_display.json`);

  const index = {
    name: `${namespace}.attachment.${id}.name`,
    display: `${namespace}:${id}_display`,
    data: `${namespace}:${id}_data`,
    type: attachmentType,
    sort: 10,
  };
  const attachmentData = { ...DEFAULT_ATTACHMENT_DATA, ...data };
  // Wiki attachment/display: slot is required; the rest are optional official
  // fields (zoom/scope/sight/views/views_fov/fov/adapter/lod/laser/show_mount/
  // show_muzzle/muzzle_flash_offset/text_show). Callers pass them through
  // verbatim so the DSH side stays the single source of truth.
  const display = {
    slot: slotRef,
    model: modelRef,
    texture: textureRef,
    sounds: soundKeys,
    ...displayExtras,
  };

  const files = [];
  files.push(relOf(pack, writeJson(indexFile, index, overwrite, `attachment index ${id}`)));
  files.push(relOf(pack, writeJson(dataFile, attachmentData, overwrite, `attachment data ${id}`)));
  files.push(relOf(pack, writeJson(displayFile, display, overwrite, `attachment display ${id}`)));
  files.push(...mergeLang(root, pack, namespace, index.name, name));

  const missing = missingAssets(pack, [
    { ref: modelRef, kind: "model" },
    { ref: textureRef, kind: "texture" },
    { ref: slotRef, kind: "texture" },
  ]);

  return { ok: true, files: files.sort(), missing };
}

/** Normalizes one recipe material entry. */
function normalizeMaterial(namespace, material, index) {
  if (!material || typeof material !== "object" || Array.isArray(material)) {
    throw new Error(`materials[${index}] must be an object like { item: { tag }, count }.`);
  }
  const item = material.item;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`materials[${index}].item must be an object with a "tag" or "item" key.`);
  }
  const key = typeof item.tag === "string" ? "tag" : typeof item.item === "string" ? "item" : undefined;
  if (!key) throw new Error(`materials[${index}].item needs a "tag" or "item" string.`);
  const value = makeRef(namespace, item[key], item[key]);
  if (!Number.isInteger(material.count) || material.count <= 0) {
    throw new Error(`materials[${index}].count must be a positive integer.`);
  }
  return { item: { [key]: value }, count: material.count };
}

/** Normalizes one recipe result. */
function normalizeResult(namespace, kind, result) {
  if (typeof result === "string") result = { id: result };
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("result must be an object like { type, id, count?, group? } or a result id string.");
  }
  const id = makeRef(namespace, result.id, result.id);
  const type = result.type === undefined ? kind : assertId(result.type, "result.type");
  const normalized = { type, id };
  if (result.count !== undefined) {
    if (!Number.isInteger(result.count) || result.count <= 0) throw new Error("result.count must be a positive integer.");
    normalized.count = result.count;
  }
  if (result.group !== undefined) normalized.group = assertText(result.group, "result.group");
  return normalized;
}

/**
 * Creates a `tacz:gun_smith_table_crafting` recipe.
 *
 * @param {object} options
 * @param {string} options.projectRoot studio workspace; every write must stay inside it.
 * @param {string} options.packDir pack root that holds gunpack.meta.json.
 * @param {"gun"|"ammo"|"attachment"} options.kind recipe folder.
 * @param {string} options.id recipe id (also the result item id by default).
 * @param {Array<{item: {tag?: string, item?: string}, count: number}>} options.materials
 * @param {{type?: string, id?: string, count?: number, group?: string}|string} [options.result]
 * @param {boolean} [options.overwrite=false] replace an existing recipe file.
 * @returns {{ok: true, file: string}}
 */
export function createItemRecipe({ projectRoot, packDir, kind, id, materials, result, overwrite = false }) {
  const { root, pack, namespace } = resolveContext({ projectRoot, packDir });
  if (!ITEM_KINDS.includes(kind)) throw new Error(`kind must be one of ${ITEM_KINDS.join(", ")}, got ${JSON.stringify(kind)}.`);
  const recipeId = assertId(id, "id");
  if (!Array.isArray(materials) || materials.length === 0) throw new Error("materials must be a non-empty array.");
  const normalizedMaterials = materials.map((material, index) => normalizeMaterial(namespace, material, index));
  const normalizedResult = normalizeResult(namespace, kind, result === undefined ? { id: recipeId } : result);

  const recipe = {
    materials: normalizedMaterials,
    result: normalizedResult,
    type: RECIPE_TYPE,
  };
  const file = packPath(root, pack, "data", namespace, "recipes", kind, `${recipeId}.json`);
  writeJson(file, recipe, overwrite, `recipe ${kind}/${recipeId}`);
  return { ok: true, file: relOf(pack, file) };
}

/** Normalizes one `#namespace:path` tag entry. */
function normalizeTag(namespace, value, index) {
  const raw = assertText(value, `tags[${index}]`);
  const body = raw.startsWith("#") ? raw.slice(1) : raw;
  const tag = `#${body.includes(":") ? body : `${namespace}:${body}`}`;
  if (!TAG_RE.test(tag)) throw new Error(`tags[${index}] must look like "#namespace:path", got ${JSON.stringify(value)}.`);
  return tag;
}

/**
 * Writes the `allow_attachments` tag array for one gun.
 *
 * @param {object} options
 * @param {string} options.projectRoot studio workspace; every write must stay inside it.
 * @param {string} options.packDir pack root that holds gunpack.meta.json.
 * @param {string} options.gunId gun the tags belong to.
 * @param {string[]} options.tags entries like `"#tacz:scope"` or `"tacz:scope"`.
 * @param {boolean} [options.overwrite=false] replace an existing tag file.
 * @returns {{ok: true, file: string}}
 */
export function createAttachmentTag({ projectRoot, packDir, gunId, tags, overwrite = false }) {
  const { root, pack, namespace } = resolveContext({ projectRoot, packDir });
  const gun = assertId(gunId, "gunId");
  if (!Array.isArray(tags) || tags.length === 0) throw new Error("tags must be a non-empty array of strings.");
  const normalized = tags.map((tag, index) => normalizeTag(namespace, tag, index));
  const file = packPath(root, pack, "data", namespace, "tacz_tags", "attachments", "allow_attachments", `${gun}.json`);
  writeJson(file, normalized, overwrite, `allow_attachments ${gun}`);
  return { ok: true, file: relOf(pack, file) };
}

/** Records one verification error. */
function errorOf(code, message, file, root) {
  return { code, message, path: relOf(root, file) };
}

/** Records one verification warning. */
function warningOf(code, message, file, root) {
  return { code, message, path: relOf(root, file) };
}

/** Reads JSON for verification; a missing or invalid file becomes an error. */
function readJsonForVerify(file, root, errors, label) {
  const rel = relOf(root, file);
  if (!isFile(file)) {
    errors.push({ code: "missing_json", message: `${label}: missing ${rel}`, path: rel });
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push({ code: "invalid_json", message: `${label}: invalid JSON at ${rel}: ${error instanceof Error ? error.message : String(error)}`, path: rel });
    return undefined;
  }
}

/** Verifies one display asset reference; a missing file is an error. */
function checkAssetRef(root, value, kind, code, label, errors) {
  const split = splitRef(value);
  if (!split) {
    errors.push({ code, message: `${label}: ${JSON.stringify(value)} is not a "namespace:path" reference`, path: "" });
    return;
  }
  const file = assetFile(root, value, kind);
  if (isFile(file)) return;
  const rel = kind === "model" ? `geo_models/${split.target}.json` : `textures/${split.target}.png`;
  errors.push({ code, message: `${label}: missing assets/${split.namespace}/${rel}`, path: relOf(root, file) });
}

/** Absolute path of one index file for a recipe result. */
function indexFile(pack, namespace, kind, id) {
  const folder = kind === "gun" ? "guns" : kind === "ammo" ? "ammo" : "attachments";
  return path.join(pack, "data", namespace, "index", folder, `${id}.json`);
}

/** Collects the ammo checks: index fields, display file, display references. */
function verifyAmmo(root, namespaces, errors, counters) {
  for (const namespace of namespaces) {
    for (const file of listJsonFiles(path.join(root, "data", namespace, "index", "ammo"))) {
      const index = readJsonForVerify(file, root, errors, "ammo index");
      if (index === undefined) continue;
      if (!index || typeof index !== "object" || Array.isArray(index)) {
        errors.push(errorOf("ammo_index", `${relOf(root, file)} must contain a JSON object`, file, root));
        continue;
      }
      counters.ammo++;
      if (typeof index.name !== "string" || !index.name.trim()) errors.push(errorOf("ammo_name", `${relOf(root, file)} has no "name" language key`, file, root));
      if (!Number.isInteger(index.stack_size) || index.stack_size <= 0) errors.push(errorOf("ammo_stack_size", `${relOf(root, file)} needs a positive integer "stack_size"`, file, root));
      const displayRef = splitRef(index.display);
      if (!displayRef) {
        if (index.display === undefined) errors.push(errorOf("ammo_display", `${relOf(root, file)} has no "display" reference`, file, root));
        else errors.push(errorOf("ammo_display_ref", `${relOf(root, file)} display is not a "namespace:path" reference`, file, root));
        continue;
      }
      const stem = lastSegment(displayRef.target);
      const displayFile = path.join(root, "assets", displayRef.namespace, "display", "ammo", `${stem}.json`);
      const display = readJsonForVerify(displayFile, root, errors, `ammo display ${stem}`);
      if (!display || typeof display !== "object" || Array.isArray(display)) continue;
      const label = relOf(root, displayFile);
      checkAssetRef(root, display.model, "model", "ammo_display_model", label, errors);
      checkAssetRef(root, display.texture, "texture", "ammo_display_texture", label, errors);
      checkAssetRef(root, display.slot, "texture", "ammo_display_slot", label, errors);
      if (display.shell === undefined) continue;
      const shell = display.shell;
      if (!shell || typeof shell !== "object" || !splitRef(shell.model) || !splitRef(shell.texture)) {
        errors.push(errorOf("ammo_shell_pair", `${label} shell needs both "model" and "texture" references`, displayFile, root));
        continue;
      }
      checkAssetRef(root, shell.model, "model", "ammo_shell_model", label, errors);
      checkAssetRef(root, shell.texture, "texture", "ammo_shell_texture", label, errors);
    }
  }
}

/** Collects the attachment checks: index fields, display/data files, references. */
function verifyAttachments(root, namespaces, errors, counters) {
  for (const namespace of namespaces) {
    for (const file of listJsonFiles(path.join(root, "data", namespace, "index", "attachments"))) {
      const index = readJsonForVerify(file, root, errors, "attachment index");
      if (index === undefined) continue;
      if (!index || typeof index !== "object" || Array.isArray(index)) {
        errors.push(errorOf("attachment_index", `${relOf(root, file)} must contain a JSON object`, file, root));
        continue;
      }
      counters.attachments++;
      const label = relOf(root, file);
      for (const key of ["name", "display", "data", "type"]) {
        if (typeof index[key] !== "string" || !index[key].trim()) errors.push(errorOf(`attachment_${key}`, `${label} has no "${key}"`, file, root));
      }
      const displayRef = splitRef(index.display);
      if (displayRef) {
        const stem = lastSegment(displayRef.target);
        const displayFile = path.join(root, "assets", displayRef.namespace, "display", "attachments", `${stem}.json`);
        const display = readJsonForVerify(displayFile, root, errors, `attachment display ${stem}`);
        if (display && typeof display === "object" && !Array.isArray(display)) {
          const displayLabel = relOf(root, displayFile);
          checkAssetRef(root, display.model, "model", "attachment_display_model", displayLabel, errors);
          checkAssetRef(root, display.texture, "texture", "attachment_display_texture", displayLabel, errors);
          checkAssetRef(root, display.slot, "texture", "attachment_display_slot", displayLabel, errors);
        }
      }
      const dataRef = splitRef(index.data);
      if (dataRef) {
        const dataFile = path.join(root, "data", dataRef.namespace, "data", "attachments", `${lastSegment(dataRef.target)}.json`);
        if (!isFile(dataFile)) errors.push(errorOf("attachment_data_file", `${label} data: missing ${relOf(root, dataFile)}`, dataFile, root));
      }
    }
  }
}

/** Collects the recipe checks: every result id must resolve inside the pack or to `tacz:`. */
function verifyRecipes(root, namespaces, errors, warnings) {
  for (const namespace of namespaces) {
    for (const kind of listDirs(path.join(root, "data", namespace, "recipes"))) {
      for (const file of listJsonFiles(path.join(root, "data", namespace, "recipes", kind))) {
        const recipe = readJsonForVerify(file, root, errors, `recipe ${kind}`);
        if (recipe === undefined) continue;
        if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
          errors.push(errorOf("recipe_shape", `${relOf(root, file)} must contain a JSON object`, file, root));
          continue;
        }
        const result = recipe.result;
        if (!result || typeof result !== "object" || Array.isArray(result)) {
          errors.push(errorOf("recipe_result", `${relOf(root, file)} has no "result" object`, file, root));
          continue;
        }
        const ref = splitRef(result.id);
        if (!ref) {
          errors.push(errorOf("recipe_result_ref", `${relOf(root, file)} result.id is not a "namespace:id" reference`, file, root));
          continue;
        }
        if (ref.namespace === "tacz") continue;
        if (!namespaces.has(ref.namespace)) {
          warnings.push(warningOf("foreign_recipe_result", `${relOf(root, file)} result "${result.id}" uses foreign namespace "${ref.namespace}"`, file, root));
          continue;
        }
        const target = lastSegment(ref.target);
        const resolved = ITEM_KINDS.some(itemKind => isFile(indexFile(root, ref.namespace, itemKind, target)));
        if (!resolved) errors.push(errorOf("recipe_result_missing", `${relOf(root, file)} result "${result.id}" has no matching index in the pack`, file, root));
      }
    }
  }
}

/** Collects the allow_attachments tag checks. */
function verifyTags(root, namespaces, errors, warnings) {
  for (const namespace of namespaces) {
    const tagDir = path.join(root, "data", namespace, "tacz_tags", "attachments", "allow_attachments");
    for (const file of listJsonFiles(tagDir)) {
      const value = readJsonForVerify(file, root, errors, "allow_attachments tag");
      if (value === undefined) continue;
      if (!Array.isArray(value)) {
        errors.push(errorOf("tag_not_array", `${relOf(root, file)} must be a JSON array of strings`, file, root));
        continue;
      }
      if (value.some(entry => typeof entry !== "string")) {
        errors.push(errorOf("tag_not_strings", `${relOf(root, file)} must contain only strings`, file, root));
        continue;
      }
      value.forEach((entry, position) => {
        const match = TAG_RE.exec(entry);
        if (!match) {
          errors.push(errorOf("tag_entry", `${relOf(root, file)}[${position}] is not a "#namespace:path" tag: ${JSON.stringify(entry)}`, file, root));
          return;
        }
        if (match[1] !== "tacz" && !namespaces.has(match[1])) {
          warnings.push(warningOf("tag_foreign_namespace", `${relOf(root, file)}[${position}] references foreign namespace "${match[1]}"`, file, root));
        }
      });
    }
  }
}

/** Warns when a gun data file has no allow_attachment_types. */
function verifyGunAttachmentTypes(root, namespaces, errors, warnings) {
  for (const namespace of namespaces) {
    for (const file of listJsonFiles(path.join(root, "data", namespace, "index", "guns"))) {
      const index = readJsonForVerify(file, root, errors, "gun index");
      if (!index || typeof index !== "object" || Array.isArray(index)) continue;
      const dataRef = splitRef(index.data);
      if (!dataRef) continue;
      const dataFile = path.join(root, "data", dataRef.namespace, "data", "guns", `${lastSegment(dataRef.target)}.json`);
      if (!isFile(dataFile)) continue;
      const gunData = readJsonForVerify(dataFile, root, errors, "gun data");
      if (!gunData || typeof gunData !== "object" || Array.isArray(gunData)) continue;
      if (!Array.isArray(gunData.allow_attachment_types) || gunData.allow_attachment_types.length === 0) {
        warnings.push(warningOf("allow_attachment_types_missing", `${relOf(root, dataFile)} has no allow_attachment_types; the gun workbench will not show attachment slots`, dataFile, root));
      }
    }
  }
}

/**
 * Verifies the item side of one pack: ammo, attachments, recipes and tags.
 *
 * Checks are reported, never thrown: `ok` is `errors.length === 0`.
 *
 * @param {string} packDir pack root.
 * @returns {{ok: boolean, errors: Array<{code: string, message: string, path: string}>, warnings: Array<{code: string, message: string, path: string}>, ammo: number, attachments: number}}
 */
export function verifyItems(packDir) {
  const root = path.resolve(String(packDir ?? ""));
  const errors = [];
  const warnings = [];
  const counters = { ammo: 0, attachments: 0 };
  if (!isDir(root)) {
    errors.push({ code: "pack_missing", message: `pack_dir not found: ${root}`, path: "" });
    return { ok: false, errors, warnings, ammo: counters.ammo, attachments: counters.attachments };
  }

  const metaPath = path.join(root, "gunpack.meta.json");
  const meta = isFile(metaPath) ? readJsonForVerify(metaPath, root, errors, "gunpack.meta.json") : undefined;
  const namespaces = new Set(listDirs(path.join(root, "data")));
  if (typeof meta?.namespace === "string" && ID_RE.test(meta.namespace)) namespaces.add(meta.namespace);
  if (namespaces.size === 0 && typeof meta?.namespace !== "string") {
    warnings.push({ code: "no_namespace", message: "gunpack.meta.json has no usable namespace and data/ has no namespace folder", path: "gunpack.meta.json" });
  }

  verifyAmmo(root, namespaces, errors, counters);
  verifyAttachments(root, namespaces, errors, counters);
  verifyRecipes(root, namespaces, errors, warnings);
  verifyTags(root, namespaces, errors, warnings);
  verifyGunAttachmentTypes(root, namespaces, errors, warnings);

  return { ok: errors.length === 0, errors, warnings, ammo: counters.ammo, attachments: counters.attachments };
}



