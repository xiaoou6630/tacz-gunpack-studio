/**
 * TACZ pack layout and JSON generation. Paths and field names follow the
 * 1.20.1 default gun pack; the generated JSON intentionally omits comments so
 * it can be parsed by every tool.
 *
 * @module
 */
import { pngSize } from "@/lib/png";
import {
  TACZ_DEFAULT_ICON_SIZE,
  TACZ_DEFAULT_TEXTURE_SIZE,
  TACZ_GUN_TYPES,
  TACZ_MATERIALS,
  TACZ_MAX_TEXTURE_SIZE,
  TACZ_PACKAGE_EXCLUDES,
  TACZ_PROFILE_DEFAULTS,
  type TaczGunType,
} from "@/lib/tacz/constants";
import {
  ensureDir,
  exists,
  fsModule,
  listFiles,
  parseJsonc,
  pathModule,
  readBytes,
  readJson,
  readText,
  relativePath,
  resolvePackDir,
  writeJson,
  writeTextAtomic,
} from "@/lib/tacz/paths";
import { getTemplate } from "@/lib/tacz/templates";
import { zipPack } from "@/lib/tacz/zip";

/** Editable gun profile accepted by `tacz_gun` and `tacz_pack`. */
export interface ITaczGunProfile {
  ammo?: string;
  ammo_amount?: number;
  rpm?: number;
  damage?: number;
  fire_mode?: string[];
  bolt?: string;
  reload_empty?: number;
  reload_tactical?: number;
  cooldown_empty?: number;
  cooldown_tactical?: number;
  weight?: number;
  [key: string]: unknown;
}

/** Pack creation input. */
export interface ICreatePackInput {
  packDir: string;
  namespace: string;
  name?: string;
  description?: string;
  author?: string;
  version?: string;
  overwrite?: boolean;
}

/** Gun export input. */
export interface IWriteGunInput {
  packDir: string;
  namespace?: string;
  gunId: string;
  type: TaczGunType;
  displayName?: string;
  profile?: ITaczGunProfile;
  overwrite?: boolean;
  /** Keep existing data/display/lang files instead of rewriting them. */
  preserveDocs?: boolean;
}

/** One parsed gun entry in a pack summary. */
export interface IPackGun {
  id: string;
  type: string;
  index: string;
  data: string;
  display: string;
}

/** Pack metadata and gun list. */
export interface IPackSummary {
  pack_dir: string;
  namespace: string;
  name: string;
  guns: IPackGun[];
}

/** Validation issue. */
export interface IValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  path?: string;
}

/** Validation result. */
export interface IValidationResult {
  ok: boolean;
  errors: IValidationIssue[];
  warnings: IValidationIssue[];
  guns: number;
  files: number;
}

/** Joins a pack-relative path. */
function packPath(packDir: string, ...parts: string[]): string {
  return pathModule().join(packDir, ...parts);
}

/** Reads the namespace from `gunpack.meta.json`. */
export function readNamespace(packDir: string): string {
  const metaPath = packPath(packDir, "gunpack.meta.json");
  if (!exists(metaPath, "tacz_pack")) throw new Error(`Not a TACZ pack: ${metaPath} does not exist. Run tacz_pack action="create" first.`);
  const meta = readJson(metaPath, "tacz_pack") as { namespace?: unknown };
  if (typeof meta.namespace !== "string" || !/^[a-z0-9_]+$/.test(meta.namespace)) {
    throw new Error(`${metaPath}: "namespace" must be a lower-case resource namespace.`);
  }
  return meta.namespace;
}

/**
 * Creates the standard pack skeleton.
 *
 * @returns Written paths and the namespace.
 */
export function createPack(input: ICreatePackInput): { pack_dir: string; namespace: string; created: string[] } {
  const packDir = resolvePackDir(input.packDir, "tacz_pack");
  const namespace = input.namespace;
  if (!/^[a-z0-9_]+$/.test(namespace)) throw new Error(`namespace "${namespace}" must match ^[a-z0-9_]+$.`);
  if (namespace === "tacz") throw new Error('Do not use the reserved namespace "tacz"; pick a unique pack namespace.');
  const fs = fsModule("tacz_pack");
  const path = pathModule();
  const created: string[] = [];
  const add = (relative: string): void => {
    const full = packPath(packDir, ...relative.split("/"));
    if (!fs.existsSync(full)) created.push(relative);
    fs.mkdirSync(full, { recursive: true });
  };
  add("assets");
  add(`assets/${namespace}`);
  add(`assets/${namespace}/geo_models/gun`);
  add(`assets/${namespace}/textures/gun/uv`);
  add(`assets/${namespace}/textures/gun/slot`);
  add(`assets/${namespace}/display/guns`);
  add(`assets/${namespace}/lang`);
  add("data");
  add(`data/${namespace}`);
  add(`data/${namespace}/index/guns`);
  add(`data/${namespace}/data/guns`);
  add(`data/${namespace}/recipes/gun`);

  const metaPath = packPath(packDir, "gunpack.meta.json");
  if (!fs.existsSync(metaPath) || input.overwrite) {
    writeJson(metaPath, { namespace }, "tacz_pack", input.overwrite ?? false);
    created.push("gunpack.meta.json");
  }
  const infoPath = packPath(packDir, "assets", namespace, "gunpack_info.json");
  if (!fs.existsSync(infoPath) || input.overwrite) {
    writeJson(infoPath, {
      version: input.version ?? "1.0.0",
      name: input.name ?? "New TACZ Gun Pack",
      desc: input.description ?? "Created by the TACZ MCP tools.",
      license: "All Rights Reserved",
      authors: [input.author ?? "Unknown"],
      date: new Date().toISOString().slice(0, 10),
      url: "",
    }, "tacz_pack", input.overwrite ?? false);
    created.push(path.relative(packDir, infoPath).replace(/\\/g, "/"));
  }
  return { pack_dir: packDir, namespace, created };
}

/** Builds the minimal data JSON for a category and profile. */
export function buildGunData(type: TaczGunType, profile: ITaczGunProfile = {}): Record<string, unknown> {
  const defaults = TACZ_PROFILE_DEFAULTS[type];
  const merged = { ...defaults, ...profile };
  const rpm = Number(merged.rpm);
  const damage = Number(merged.damage);
  const ammoAmount = Number(merged.ammo_amount);
  return {
    ammo: String(merged.ammo),
    ammo_amount: ammoAmount,
    extended_mag_ammo_amount: [ammoAmount + 4, ammoAmount + 8, ammoAmount + 12],
    bolt: String(merged.bolt),
    rpm,
    bullet: {
      life: 0.8,
      bullet_amount: type === "shotgun" ? 8 : 1,
      damage,
      tracer_count_interval: 0,
      extra_damage: {
        armor_ignore: 0.2,
        head_shot_multiplier: 1.5,
        damage_adjust: [
          { distance: 30, damage },
          { distance: 60, damage: Math.max(1, damage * 0.8) },
          { distance: "infinite", damage: Math.max(1, damage * 0.6) },
        ],
      },
      speed: type === "sniper" ? 420 : type === "pistol" ? 180 : 320,
      gravity: 0.12,
      knockback: 0,
      friction: 0.02,
      ignite: false,
      pierce: type === "sniper" ? 2 : 0,
    },
    reload: {
      type: "magazine",
      infinite: false,
      feed: { empty: Number(merged.reload_empty), tactical: Number(merged.reload_tactical) },
      cooldown: { empty: Number(merged.cooldown_empty), tactical: Number(merged.cooldown_tactical) },
    },
    draw_time: 0.35,
    put_away_time: 0.4,
    aim_time: 0.2,
    sprint_time: 0.25,
    weight: Number(merged.weight),
    movement_speed: { base: 0, aim: -0.2, reload: -0.15 },
    fire_mode: Array.isArray(merged.fire_mode) ? merged.fire_mode.map(String) : ["semi"],
    allow_attachment_types: type === "pistol" ? ["scope", "extended_mag"] : ["scope", "stock", "muzzle", "extended_mag"],
    recoil: {
      pitch: [
        { time: 0, value: [0.6, 0.6] },
        { time: 0.2, value: [0.6, 0.6] },
        { time: 0.5, value: [-0.15, -0.15] },
        { time: 0.7, value: [0, 0] },
      ],
      yaw: [
        { time: 0, value: [-0.25, 0.15] },
        { time: 0.4, value: [0, 0] },
      ],
    },
    inaccuracy: {
      stand: 3,
      move: 4,
      sneak: 1.5,
      lie: 1,
      aim: 0.2,
    },
  };
}

/** Builds the index, display, data and language entries for one gun. */
export function buildGunDocuments(input: IWriteGunInput, namespace: string): {
  index: Record<string, unknown>;
  data: Record<string, unknown>;
  display: Record<string, unknown>;
  lang: Record<string, string>;
} {
  const template = getTemplate(input.type);
  const displayName = input.displayName ?? input.gunId.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
  const nameKey = `${namespace}.gun.${input.gunId}.name`;
  return {
    index: {
      name: nameKey,
      display: `${namespace}:${input.gunId}_display`,
      data: `${namespace}:${input.gunId}_data`,
      type: input.type,
      item_type: "modern_kinetic",
      sort: 10,
    },
    data: buildGunData(input.type, { ...template.profile, ...input.profile }),
    display: {
      model: `${namespace}:gun/${input.gunId}_geo`,
      texture: `${namespace}:gun/uv/${input.gunId}`,
      slot: `${namespace}:gun/slot/${input.gunId}`,
      third_person_animation: "default",
      transform: {
        scale: {
          thirdperson: [0.6, 0.6, 0.6],
          ground: [0.6, 0.6, 0.6],
          fixed: [1.2, 1.2, 1.2],
        },
      },
    },
    lang: { [nameKey]: displayName },
  };
}

/** Merges a language map into an existing JSON object. */
function mergeLang(path: string, additions: Record<string, string>): void {
  const existing = exists(path, "tacz_gun") ? (readJson(path, "tacz_gun") as Record<string, unknown>) : {};
  writeJson(path, { ...existing, ...additions }, "tacz_gun", true);
}

/**
 * Writes index/data/display/lang for a gun. The geometry and PNG files are
 * written by the model/texture/icon tools; this function validates that they
 * exist before declaring success.
 */
export function writeGunDocuments(input: IWriteGunInput): {
  namespace: string;
  files: string[];
  missing: string[];
} {
  const packDir = resolvePackDir(input.packDir, "tacz_gun");
  const namespace = input.namespace ?? readNamespace(packDir);
  if (namespace !== readNamespace(packDir)) throw new Error(`Namespace "${namespace}" does not match gunpack.meta.json.`);
  const documents = buildGunDocuments(input, namespace);
  const files: string[] = [];
  if (input.preserveDocs) {
    const expected = [
      `assets/${namespace}/geo_models/gun/${input.gunId}_geo.json`,
      `assets/${namespace}/textures/gun/uv/${input.gunId}.png`,
      `assets/${namespace}/textures/gun/slot/${input.gunId}.png`,
    ];
    const missing = expected.filter(relative => !exists(packPath(packDir, ...relative.split("/")), "tacz_gun"));
    return { namespace, files, missing };
  }
  const write = (relative: string, value: unknown): void => {
    const full = packPath(packDir, ...relative.split("/"));
    writeJson(full, value, "tacz_gun", input.overwrite ?? false);
    files.push(relative);
  };
  const overwrite = input.overwrite ?? false;
  write(`data/${namespace}/index/guns/${input.gunId}.json`, documents.index);
  write(`data/${namespace}/data/guns/${input.gunId}_data.json`, documents.data);
  write(`assets/${namespace}/display/guns/${input.gunId}_display.json`, documents.display);
  for (const [locale, name] of Object.entries({ zh_cn: "中文", en_us: "English" })) {
    const langPath = packPath(packDir, "assets", namespace, "lang", `${locale}.json`);
    if (exists(langPath, "tacz_gun") && !overwrite) {
      mergeLang(langPath, documents.lang);
    } else {
      writeJson(langPath, documents.lang, "tacz_gun", true);
    }
    files.push(`assets/${namespace}/lang/${locale}.json`);
    void name;
  }
  const expected = [
    `assets/${namespace}/geo_models/gun/${input.gunId}_geo.json`,
    `assets/${namespace}/textures/gun/uv/${input.gunId}.png`,
    `assets/${namespace}/textures/gun/slot/${input.gunId}.png`,
  ];
  const missing = expected.filter(relative => !exists(packPath(packDir, ...relative.split("/")), "tacz_gun"));
  return { namespace, files, missing };
}

/** Lists guns declared by `data/<ns>/index/guns`. */
export function listGuns(packDir: string): IPackGun[] {
  const resolved = resolvePackDir(packDir, "tacz_pack");
  const namespace = readNamespace(resolved);
  const fs = fsModule("tacz_pack");
  const dir = packPath(resolved, "data", namespace, "index", "guns");
  if (!fs.existsSync(dir)) return [];
  const guns: IPackGun[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const id = entry.name.slice(0, -5);
    const index = readJson(pathModule().join(dir, entry.name), "tacz_pack") as { display?: unknown; data?: unknown; type?: unknown };
    guns.push({
      id,
      type: typeof index.type === "string" ? index.type : "unknown",
      index: `data/${namespace}/index/guns/${entry.name}`,
      data: typeof index.data === "string" ? index.data : "",
      display: typeof index.display === "string" ? index.display : "",
    });
  }
  return guns.sort((a, b) => a.id.localeCompare(b.id));
}

/** Reads pack summary and gun list. */
export function readPackSummary(packDir: string): IPackSummary {
  const resolved = resolvePackDir(packDir, "tacz_pack");
  const namespace = readNamespace(resolved);
  const infoPath = packPath(resolved, "assets", namespace, "gunpack_info.json");
  const info = exists(infoPath, "tacz_pack") ? (readJson(infoPath, "tacz_pack") as { name?: unknown }) : {};
  return {
    pack_dir: resolved,
    namespace,
    name: typeof info.name === "string" ? info.name : "Unnamed pack",
    guns: listGuns(resolved),
  };
}

/** Converts a `namespace:path` reference to `path` and rejects foreign namespaces. */
function localReference(reference: string, namespace: string): string {
  const [refNamespace, ...rest] = reference.split(":");
  if (rest.length === 0) return reference;
  if (refNamespace !== namespace) throw new Error(`Reference "${reference}" points outside namespace "${namespace}".`);
  return rest.join(":");
}

/** Resolves a display/data reference to an absolute path. */
function referencePath(packDir: string, namespace: string, kind: "display" | "data", reference: string): string {
  const path = localReference(reference, namespace);
  return kind === "display"
    ? packPath(packDir, "assets", namespace, "display", "guns", `${path}.json`)
    : packPath(packDir, "data", namespace, "data", "guns", `${path}.json`);
}

/** Resolves a display model/texture/slot reference. */
function assetPath(packDir: string, namespace: string, kind: "model" | "texture" | "slot", reference: string): string {
  const path = localReference(reference, namespace);
  if (kind === "model") return packPath(packDir, "assets", namespace, "geo_models", `${path}.json`);
  if (kind === "texture") return packPath(packDir, "assets", namespace, "textures", `${path}.png`);
  return packPath(packDir, "assets", namespace, "textures", `${path}.png`);
}

/**
 * Validates a whole pack: namespace, references, files, geometry, textures,
 * icon size, numeric ranges, and language keys.
 */
export function validatePack(packDir: string): IValidationResult {
  const errors: IValidationIssue[] = [];
  const warnings: IValidationIssue[] = [];
  const resolved = resolvePackDir(packDir, "tacz_pack");
  let namespace = "";
  try {
    namespace = readNamespace(resolved);
  } catch (error) {
    errors.push({ code: "PACK_META", severity: "error", message: error instanceof Error ? error.message : String(error) });
    return { ok: false, errors, warnings, guns: 0, files: 0 };
  }
  const files = listFiles(resolved, TACZ_PACKAGE_EXCLUDES, "tacz_pack");
  const fs = fsModule("tacz_pack");
  const infoPath = packPath(resolved, "assets", namespace, "gunpack_info.json");
  if (!fs.existsSync(infoPath)) errors.push({ code: "PACK_INFO", severity: "error", message: `Missing ${relativePath(resolved, infoPath)}.`, path: relativePath(resolved, infoPath) });
  const guns = listGuns(resolved);
  if (guns.length === 0) warnings.push({ code: "NO_GUNS", severity: "warning", message: "The pack has no guns yet." });

  for (const gun of guns) {
    const index = readJson(packPath(resolved, ...gun.index.split("/")), "tacz_pack") as { name?: unknown; display?: unknown; data?: unknown; type?: unknown };
    if (typeof index.name !== "string") errors.push({ code: "INDEX_NAME", severity: "error", message: `Gun "${gun.id}" has no name key.`, path: gun.index });
    if (typeof index.display !== "string" || typeof index.data !== "string") {
      errors.push({ code: "INDEX_REF", severity: "error", message: `Gun "${gun.id}" must have string display/data references.`, path: gun.index });
      continue;
    }
    if (!TACZ_GUN_TYPES.includes(index.type as TaczGunType)) errors.push({ code: "INDEX_TYPE", severity: "error", message: `Gun "${gun.id}" has unknown type "${String(index.type)}".`, path: gun.index });

    let display: { model?: unknown; texture?: unknown; slot?: unknown } = {};
    try {
      const displayPath = referencePath(resolved, namespace, "display", index.display);
      display = readJson(displayPath, "tacz_pack") as typeof display;
    } catch (error) {
      errors.push({ code: "DISPLAY_READ", severity: "error", message: String(error), path: gun.id });
    }
    for (const [field, value] of Object.entries({ model: display.model, texture: display.texture, slot: display.slot })) {
      if (typeof value !== "string") {
        errors.push({ code: "DISPLAY_FIELD", severity: "error", message: `Gun "${gun.id}" display.${field} must be a resource reference.`, path: gun.id });
        continue;
      }
      const kind = field as "model" | "texture" | "slot";
      const file = assetPath(resolved, namespace, kind, value);
      if (!fs.existsSync(file)) errors.push({ code: "ASSET_MISSING", severity: "error", message: `Missing ${kind} file ${relativePath(resolved, file)}.`, path: gun.id });
      if (kind === "model" && fs.existsSync(file)) {
        try {
          const geometry = parseJsonc(readText(file, "tacz_pack")) as { format_version?: unknown; "minecraft:geometry"?: unknown };
          if (!Array.isArray(geometry["minecraft:geometry"])) errors.push({ code: "GEOMETRY_SHAPE", severity: "error", message: `${relativePath(resolved, file)} has no minecraft:geometry array.`, path: gun.id });
          if (typeof geometry.format_version !== "string") warnings.push({ code: "GEOMETRY_VERSION", severity: "warning", message: `${relativePath(resolved, file)} has no format_version.`, path: gun.id });
        } catch (error) {
          errors.push({ code: "GEOMETRY_JSON", severity: "error", message: String(error), path: gun.id });
        }
      }
      if (kind === "texture" && fs.existsSync(file)) {
        try {
          const size = pngSize(fs.readFileSync(file));
          if (size.width > TACZ_MAX_TEXTURE_SIZE || size.height > TACZ_MAX_TEXTURE_SIZE) errors.push({ code: "TEXTURE_SIZE", severity: "error", message: `Texture ${size.width}x${size.height} exceeds ${TACZ_MAX_TEXTURE_SIZE}px.`, path: gun.id });
          if ((size.width & (size.width - 1)) !== 0 || (size.height & (size.height - 1)) !== 0) warnings.push({ code: "TEXTURE_POT", severity: "warning", message: `Texture ${size.width}x${size.height} is not a power of two.`, path: gun.id });
        } catch (error) {
          errors.push({ code: "TEXTURE_PNG", severity: "error", message: String(error), path: gun.id });
        }
      }
      if (kind === "slot" && fs.existsSync(file)) {
        try {
          const size = pngSize(fs.readFileSync(file));
          if (size.width !== TACZ_DEFAULT_ICON_SIZE || size.height !== TACZ_DEFAULT_ICON_SIZE) warnings.push({ code: "ICON_SIZE", severity: "warning", message: `Slot icon is ${size.width}x${size.height}; the default pack uses ${TACZ_DEFAULT_ICON_SIZE}x${TACZ_DEFAULT_ICON_SIZE}.`, path: gun.id });
        } catch (error) {
          errors.push({ code: "ICON_PNG", severity: "error", message: String(error), path: gun.id });
        }
      }
    }

    try {
      const dataPath = referencePath(resolved, namespace, "data", index.data);
      const data = readJson(dataPath, "tacz_pack") as { rpm?: unknown; ammo_amount?: unknown; ammo?: unknown; bolt?: unknown; reload?: unknown; inaccuracy?: unknown };
      const rpm = Number(data.rpm);
      if (!Number.isFinite(rpm) || rpm <= 0 || rpm > 1200) errors.push({ code: "DATA_RPM", severity: "error", message: `Gun "${gun.id}" rpm must be within 1..1200 (got ${String(data.rpm)}).`, path: gun.id });
      const ammoAmount = Number(data.ammo_amount);
      if (!Number.isFinite(ammoAmount) || ammoAmount <= 0) errors.push({ code: "DATA_AMMO_AMOUNT", severity: "error", message: `Gun "${gun.id}" ammo_amount must be > 0.`, path: gun.id });
      if (typeof data.ammo !== "string" || !data.ammo.includes(":")) errors.push({ code: "DATA_AMMO", severity: "error", message: `Gun "${gun.id}" needs an ammo reference like "tacz:762x39".`, path: gun.id });
      if (typeof data.bolt !== "string") warnings.push({ code: "DATA_BOLT", severity: "warning", message: `Gun "${gun.id}" has no bolt type.`, path: gun.id });
      if (typeof data.reload !== "object" || data.reload === null) errors.push({ code: "DATA_RELOAD", severity: "error", message: `Gun "${gun.id}" has no reload block.`, path: gun.id });
      if (typeof data.inaccuracy !== "object" || data.inaccuracy === null) errors.push({ code: "DATA_INACCURACY", severity: "error", message: `Gun "${gun.id}" has no inaccuracy block.`, path: gun.id });
    } catch (error) {
      errors.push({ code: "DATA_READ", severity: "error", message: String(error), path: gun.id });
    }

    const langZh = packPath(resolved, "assets", namespace, "lang", "zh_cn.json");
    if (fs.existsSync(langZh) && typeof index.name === "string") {
      const lang = readJson(langZh, "tacz_pack") as Record<string, unknown>;
      if (!(index.name in lang)) errors.push({ code: "LANG_KEY", severity: "error", message: `zh_cn.json is missing "${index.name}".`, path: gun.id });
    }
  }
  return { ok: errors.length === 0, errors, warnings, guns: guns.length, files: files.length };
}

/** Packages a pack into `<pack_dir>/<pack-name>.zip`, excluding work directories. */
export function packagePack(packDir: string, outPath?: string): { path: string; files: number; bytes: number } {
  const resolved = resolvePackDir(packDir, "tacz_pack");
  const path = pathModule();
  const target = outPath ?? path.join(resolved, `${path.basename(resolved)}.zip`);
  return zipPack(resolved, target, TACZ_PACKAGE_EXCLUDES, "tacz_pack");
}

/** Returns the default texture/icon sizes for a pack's first gun, for UI defaults. */
export function packDefaults(): { texture: [number, number]; icon: number; materials: Record<string, string> } {
  return {
    texture: [...TACZ_DEFAULT_TEXTURE_SIZE] as [number, number],
    icon: TACZ_DEFAULT_ICON_SIZE,
    materials: { ...TACZ_MATERIALS },
  };
}
