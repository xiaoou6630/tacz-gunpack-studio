/// <reference types="three" />
/// <reference types="blockbench-types" />
/**
 * TACZ ammo and attachment support: document builders, pack writers,
 * Blockbench project helpers, listers, and validation.
 *
 * Builders, writers, listers and `validateItems` never touch Blockbench
 * globals, so they run under Bun in tests; only the project helpers reference
 * the live editor. Paths follow the official 1.20.1 default pack:
 *
 * - ammo: `data/<ns>/index/ammo/<id>.json`,
 *   `assets/<ns>/display/ammo/<id>_display.json`,
 *   `assets/<ns>/geo_models/ammo/<id>.json` (no `_geo` suffix),
 *   `assets/<ns>/textures/ammo/uv/<id>.png`,
 *   `assets/<ns>/textures/ammo/slot/<id>.png`.
 * - attachments: `data/<ns>/index/attachments/<id>.json`,
 *   `data/<ns>/data/attachments/<id>_data.json`,
 *   `assets/<ns>/display/attachments/<id>_display.json`,
 *   `assets/<ns>/geo_models/attachment/<id>_geo.json`,
 *   `assets/<ns>/textures/attachment/uv/<id>.png`,
 *   `assets/<ns>/textures/attachment/slot/<id>.png`.
 *
 * @module
 */
import { pngSize } from "@/lib/png";
import { TACZ_FORMAT_ID, TACZ_MAX_TEXTURE_SIZE } from "@/lib/tacz/constants";
import { readNamespace, type IValidationIssue } from "@/lib/tacz/pack";
import {
  exists,
  fsModule,
  pathModule,
  readJson,
  relativePath,
  resolvePackDir,
  writeJson,
} from "@/lib/tacz/paths";
import { getItemTemplate, type ITaczItemTemplate, type ITaczTemplateCube } from "@/lib/tacz/templates";
import { createGroupWithUndo } from "@/lib/group-creation";
import { runUndoableEdit } from "@/lib/undo";
import { importGeoModel, parseGeoJson, selectGeometry } from "@/server/tools/import";

/** Ammo or attachment: the two item categories this module writes. */
export type TaczItemKind = "ammo" | "attachment";

/**
 * Attachment slot categories accepted by the gun's `allow_attachment_types`
 * and used as the attachment index `type` (wiki: gun/data/15_attachment).
 * `bayonet` is NOT a slot: the official bayonet uses `muzzle`.
 */
export const TACZ_ATTACHMENT_TYPES = [
  "scope",
  "stock",
  "muzzle",
  "grip",
  "laser",
  "extended_mag",
] as const;

/**
 * Attachment index `type` values that exist in the official pack but are not
 * mount slots: ammo modifications are filtered by the `ammo_mod` tag.
 */
export const TACZ_ATTACHMENT_NON_SLOT_TYPES = ["ammo_mod"] as const;

/** Permission labels shown when a tool touches the disk. */
const AMMO_LABEL = "tacz_ammo";
const ATTACHMENT_LABEL = "tacz_attachment";

/** Joins a pack-relative path. */
function packPath(packDir: string, ...parts: string[]): string {
  return pathModule().join(packDir, ...parts);
}

/** Resolves a POSIX-style pack-relative path. */
function packFile(packDir: string, relative: string): string {
  return packPath(packDir, ...relative.split("/"));
}

/** Rejects values that cannot be a TACZ resource name. */
function assertName(value: string, field: string, label: string): void {
  if (!/^[a-z0-9_]+$/.test(value)) {
    throw new Error(`${label}: ${field} "${value}" must match ^[a-z0-9_]+$ (lower-case letters, digits, underscores).`);
  }
}

/** "assault_rifle" -> "Assault Rifle". */
function displayNameFromId(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

/** Whether a value is a plain JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Pack-relative index path for one item. */
function indexFile(kind: TaczItemKind, namespace: string, id: string): string {
  return kind === "ammo" ? `data/${namespace}/index/ammo/${id}.json` : `data/${namespace}/index/attachments/${id}.json`;
}

/** Pack-relative attachment data path; ammo has no data file. */
function dataFile(namespace: string, id: string): string {
  return `data/${namespace}/data/attachments/${id}_data.json`;
}

/** Pack-relative display path for one item. */
function displayFile(kind: TaczItemKind, namespace: string, id: string): string {
  return kind === "ammo"
    ? `assets/${namespace}/display/ammo/${id}_display.json`
    : `assets/${namespace}/display/attachments/${id}_display.json`;
}

/** Pack-relative geometry path for one item. */
function modelFile(kind: TaczItemKind, namespace: string, id: string): string {
  return kind === "ammo"
    ? `assets/${namespace}/geo_models/ammo/${id}.json`
    : `assets/${namespace}/geo_models/attachment/${id}_geo.json`;
}

/** Pack-relative UV texture path for one item. */
function textureFile(kind: TaczItemKind, namespace: string, id: string): string {
  return kind === "ammo"
    ? `assets/${namespace}/textures/ammo/uv/${id}.png`
    : `assets/${namespace}/textures/attachment/uv/${id}.png`;
}

/** Pack-relative slot icon path for one item. */
function slotFile(kind: TaczItemKind, namespace: string, id: string): string {
  return kind === "ammo"
    ? `assets/${namespace}/textures/ammo/slot/${id}.png`
    : `assets/${namespace}/textures/attachment/slot/${id}.png`;
}

/** Converts a `namespace:path` reference to `path` and rejects foreign namespaces. */
function localReference(reference: string, namespace: string): string {
  const [refNamespace, ...rest] = reference.split(":");
  if (rest.length === 0) return reference;
  if (refNamespace !== namespace) throw new Error(`Reference "${reference}" points outside namespace "${namespace}".`);
  return rest.join(":");
}

/** Resolves a display model/texture/slot reference to an absolute path. */
function assetReferencePath(packDir: string, namespace: string, kind: "model" | "texture" | "slot", reference: string): string {
  const path = localReference(reference, namespace);
  if (kind === "model") return packPath(packDir, "assets", namespace, "geo_models", `${path}.json`);
  return packPath(packDir, "assets", namespace, "textures", `${path}.png`);
}

/**
 * Resolves a display or data reference to an absolute path. Ammo and
 * attachments live in different folders, so the category decides where the
 * file is read from.
 */
function documentPath(
  packDir: string,
  namespace: string,
  kind: "display" | "data",
  category: TaczItemKind,
  reference: string,
): string {
  const path = localReference(reference, namespace);
  if (kind === "display") {
    const folder = category === "ammo" ? "ammo" : "attachments";
    return packPath(packDir, "assets", namespace, "display", folder, `${path}.json`);
  }
  return packPath(packDir, "data", namespace, "data", "attachments", `${path}.json`);
}

/** Input for {@link buildAmmoDocuments}. */
export interface IAmmoDocumentInput {
  namespace: string;
  ammoId: string;
  displayName?: string;
  stackSize?: number;
  sort?: number;
  /** Optional tracer tint such as `#ffcc00`. */
  tracerColor?: string;
  model?: string;
  texture?: string;
  slot?: string;
  shellModel?: string;
  shellTexture?: string;
}

/** Input for {@link buildAttachmentDocuments}. */
export interface IAttachmentDocumentInput {
  namespace: string;
  attachmentId: string;
  /** Free string; see {@link TACZ_ATTACHMENT_TYPES} for the official categories. */
  type: string;
  displayName?: string;
  data?: Record<string, unknown>;
  model?: string;
  texture?: string;
  slot?: string;
  zoom?: number[];
  /** `scope` = tube magnifier (ACOG/LPVO); `sight` = red dot/holographic. Mutually exclusive per the wiki. */
  scope?: boolean;
  sight?: boolean;
  /** `views`: one view-group index per `zoom` entry (magnified scopes only). */
  views?: number[];
  /** `views_fov`: gun render FOV per `zoom` entry (magnified scopes only). */
  viewsFov?: number[];
  fov?: number;
  adapter?: string;
  sounds?: Record<string, string>;
  /** `show_mount`: render the gun's `mount` group while this optic is installed. */
  showMount?: boolean;
  /** `show_muzzle`: keep the gun's default muzzle (bayonets). */
  showMuzzle?: boolean;
  /** `muzzle_flash_offset`: muzzle particle origin shift, in model units (16 = 1 block). */
  muzzleFlashOffset?: number;
  /** `lod`: low-detail model/texture pair for distant rendering. */
  lod?: { model?: string; texture?: string };
  /** `laser`: laser sight configuration. */
  laser?: Record<string, unknown>;
  /** `text_show`: dynamic text groups on the attachment model. */
  textShow?: Record<string, unknown>;
}

/** Documents generated for one ammo item. */
export interface IAmmoDocuments {
  index: Record<string, unknown>;
  display: Record<string, unknown>;
  lang: Record<string, string>;
}

/** Documents generated for one attachment. */
export interface IAttachmentDocuments {
  index: Record<string, unknown>;
  data: Record<string, unknown>;
  display: Record<string, unknown>;
  lang: Record<string, string>;
}

/** Default attachment sounds, per the wiki's list of shared official keys. */
const DEFAULT_ATTACHMENT_SOUNDS: Record<string, string> = {
  install: "tacz:attachments/attachment_general_b",
  uninstall: "tacz:attachments/attachment_general_uninstall",
};

/**
 * Builds the index, display and language entries for one ammo item.
 *
 * @param input - Namespace, id, display name, and optional reference overrides.
 * @throws When the namespace or id is not a valid resource name.
 */
export function buildAmmoDocuments(input: IAmmoDocumentInput): IAmmoDocuments {
  const { namespace, ammoId } = input;
  assertName(namespace, "namespace", AMMO_LABEL);
  assertName(ammoId, "ammoId", AMMO_LABEL);
  const displayName = input.displayName ?? displayNameFromId(ammoId);
  const nameKey = `${namespace}.ammo.${ammoId}.name`;
  const index: Record<string, unknown> = {
    name: nameKey,
    display: `${namespace}:${ammoId}_display`,
    stack_size: input.stackSize ?? 64,
    sort: input.sort ?? 10,
  };
  // The wiki keeps tracer_color in the ammo display file, not the index.
  const display: Record<string, unknown> = {
    model: input.model ?? `${namespace}:ammo/${ammoId}`,
    texture: input.texture ?? `${namespace}:ammo/uv/${ammoId}`,
    slot: input.slot ?? `${namespace}:ammo/slot/${ammoId}`,
  };
  if (input.tracerColor) display.tracer_color = input.tracerColor;
  if (input.shellModel && input.shellTexture) {
    display.shell = { model: input.shellModel, texture: input.shellTexture };
  }
  return { index, display, lang: { [nameKey]: displayName } };
}

/**
 * Builds the index, data, display and language entries for one attachment.
 *
 * @param input - Namespace, id, type, display name, and optional overrides.
 * @throws When the namespace or id is not a valid resource name, or `type` is blank.
 */
export function buildAttachmentDocuments(input: IAttachmentDocumentInput): IAttachmentDocuments {
  const { namespace, attachmentId, type } = input;
  assertName(namespace, "namespace", ATTACHMENT_LABEL);
  assertName(attachmentId, "attachmentId", ATTACHMENT_LABEL);
  if (!type.trim()) throw new Error(`${ATTACHMENT_LABEL}: type must not be blank.`);
  const displayName = input.displayName ?? displayNameFromId(attachmentId);
  const nameKey = `${namespace}.attachment.${attachmentId}.name`;
  const index: Record<string, unknown> = {
    name: nameKey,
    display: `${namespace}:${attachmentId}_display`,
    data: `${namespace}:${attachmentId}_data`,
    type,
    sort: 10,
  };
  const display: Record<string, unknown> = {
    slot: input.slot ?? `${namespace}:attachment/slot/${attachmentId}`,
    model: input.model ?? `${namespace}:attachment/${attachmentId}_geo`,
    texture: input.texture ?? `${namespace}:attachment/uv/${attachmentId}`,
    sounds: { ...DEFAULT_ATTACHMENT_SOUNDS, ...(input.sounds ?? {}) },
  };
  if (input.zoom) display.zoom = [...input.zoom];
  if (input.scope !== undefined) display.scope = input.scope;
  if (input.sight !== undefined) display.sight = input.sight;
  if (input.views) display.views = [...input.views];
  if (input.viewsFov) display.views_fov = [...input.viewsFov];
  if (input.fov !== undefined) display.fov = input.fov;
  if (input.adapter) display.adapter = input.adapter;
  if (input.showMount !== undefined) display.show_mount = input.showMount;
  if (input.showMuzzle !== undefined) display.show_muzzle = input.showMuzzle;
  if (input.muzzleFlashOffset !== undefined) display.muzzle_flash_offset = input.muzzleFlashOffset;
  if (input.lod) display.lod = { ...input.lod };
  if (input.laser) display.laser = { ...input.laser };
  if (input.textShow) display.text_show = { ...input.textShow };
  return {
    index,
    data: input.data ?? { weight: 0 },
    display,
    lang: { [nameKey]: displayName },
  };
}

/** Result of writing one item's documents. */
export interface IWriteItemDocumentsResult {
  namespace: string;
  files: string[];
  missing: string[];
}

/** Merges language additions into an existing JSON object without dropping other keys. */
function mergeLang(file: string, additions: Record<string, string>, label: string): void {
  const existing = exists(file, label) ? (readJson(file, label) as Record<string, unknown>) : {};
  writeJson(file, { ...existing, ...additions }, label, true);
}

/** Writes both locale files for one item, merging rather than clobbering. */
function writeLangFiles(packDir: string, namespace: string, lang: Record<string, string>, label: string, files: string[]): void {
  for (const locale of ["zh_cn", "en_us"]) {
    const relative = `assets/${namespace}/lang/${locale}.json`;
    mergeLang(packFile(packDir, relative), lang, label);
    files.push(relative);
  }
}

/** Files an item's display references must resolve to. */
function expectedItemFiles(kind: TaczItemKind, namespace: string, id: string): string[] {
  return [modelFile(kind, namespace, id), textureFile(kind, namespace, id), slotFile(kind, namespace, id)];
}

/**
 * Writes index/display/lang for one ammo item, then reports any art still
 * missing. Geometry and PNGs are written by the model/texture/icon tools.
 */
export function writeAmmoDocuments(input: IAmmoDocumentInput & { packDir: string; overwrite?: boolean }): IWriteItemDocumentsResult {
  const packDir = resolvePackDir(input.packDir, AMMO_LABEL);
  const namespace = input.namespace ?? readNamespace(packDir);
  if (namespace !== readNamespace(packDir)) throw new Error(`Namespace "${namespace}" does not match gunpack.meta.json.`);
  const documents = buildAmmoDocuments({ ...input, namespace });
  const overwrite = input.overwrite ?? false;
  const files: string[] = [];
  const write = (relative: string, value: unknown): void => {
    writeJson(packFile(packDir, relative), value, AMMO_LABEL, overwrite);
    files.push(relative);
  };
  write(indexFile("ammo", namespace, input.ammoId), documents.index);
  write(displayFile("ammo", namespace, input.ammoId), documents.display);
  writeLangFiles(packDir, namespace, documents.lang, AMMO_LABEL, files);
  const missing = expectedItemFiles("ammo", namespace, input.ammoId)
    .filter(relative => !exists(packFile(packDir, relative), AMMO_LABEL));
  return { namespace, files, missing };
}

/**
 * Writes index/data/display/lang for one attachment, then reports any art still
 * missing. Geometry and PNGs are written by the model/texture/icon tools.
 */
export function writeAttachmentDocuments(
  input: IAttachmentDocumentInput & { packDir: string; overwrite?: boolean },
): IWriteItemDocumentsResult {
  const packDir = resolvePackDir(input.packDir, ATTACHMENT_LABEL);
  const namespace = input.namespace ?? readNamespace(packDir);
  if (namespace !== readNamespace(packDir)) throw new Error(`Namespace "${namespace}" does not match gunpack.meta.json.`);
  const documents = buildAttachmentDocuments({ ...input, namespace });
  const overwrite = input.overwrite ?? false;
  const files: string[] = [];
  const write = (relative: string, value: unknown): void => {
    writeJson(packFile(packDir, relative), value, ATTACHMENT_LABEL, overwrite);
    files.push(relative);
  };
  write(indexFile("attachment", namespace, input.attachmentId), documents.index);
  write(dataFile(namespace, input.attachmentId), documents.data);
  write(displayFile("attachment", namespace, input.attachmentId), documents.display);
  writeLangFiles(packDir, namespace, documents.lang, ATTACHMENT_LABEL, files);
  const missing = expectedItemFiles("attachment", namespace, input.attachmentId)
    .filter(relative => !exists(packFile(packDir, relative), ATTACHMENT_LABEL));
  return { namespace, files, missing };
}

/** Project metadata kept beside the live Blockbench project. */
export interface IItemProjectMeta {
  pack_dir: string;
  namespace: string;
  kind: TaczItemKind;
  item_id: string;
  /** Attachment category; undefined for ammo. */
  type?: string;
  display_name: string;
  texture_size: [number, number];
}

/** Module-level metadata keyed by project UUID; Blockbench projects do not carry arbitrary fields. */
const itemProjectMeta = new Map<string, IItemProjectMeta>();

/** Reads metadata for the active project. */
export function getItemProjectMeta(): IItemProjectMeta | undefined {
  return Project ? itemProjectMeta.get(Project.uuid) : undefined;
}

/** Saves metadata for the active project. */
function setItemProjectMeta(meta: IItemProjectMeta): void {
  if (!Project) throw new Error("No project is open.");
  itemProjectMeta.set(Project.uuid, meta);
}

/** Reads a numeric texture size from a geometry description. */
function geometryTextureSize(geometry: unknown): [number, number] {
  const list = (geometry as { "minecraft:geometry"?: unknown })["minecraft:geometry"];
  const first = Array.isArray(list) ? list[0] : undefined;
  const description = first && typeof first === "object" ? (first as { description?: unknown }).description : undefined;
  const width = description && typeof description === "object" ? Number((description as { texture_width?: unknown }).texture_width) : NaN;
  const height = description && typeof description === "object" ? Number((description as { texture_height?: unknown }).texture_height) : NaN;
  return [Number.isFinite(width) && width > 0 ? width : 32, Number.isFinite(height) && height > 0 ? height : 32];
}

/** Creates a blank project texture sized for the item and adds it to the project. */
function addItemTexture(size: [number, number], name: string): Texture {
  const texture = new Texture({ name, width: size[0], height: size[1], internal: true });
  runUndoableEdit({ textures: [texture], bitmap: true }, "TACZ created item UV texture", () => {
    const { ctx, canvas } = texture.getActiveCanvas();
    canvas.width = size[0];
    canvas.height = size[1];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#2b2d2f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    texture.updateSource(canvas.toDataURL("image/png", 1));
    texture.updateLayerChanges(true);
    texture.add(false);
    Canvas.updateAll();
  });
  return texture;
}

/** Creates one cube constrained to its template group and maps it onto the atlas. */
function addItemCube(cubeDef: ITaczTemplateCube, groups: Map<string, Group>, texture: Texture): Cube {
  const parent = groups.get(cubeDef.group);
  if (!parent) throw new Error(`Template group "${cubeDef.group}" was not created.`);
  const cube = new Cube({
    name: cubeDef.name,
    from: [...cubeDef.from] as [number, number, number],
    to: [...cubeDef.to] as [number, number, number],
    origin: [...(cubeDef.origin ?? [0, 0, 0])] as [number, number, number],
    autouv: 1,
  });
  cube.init().addTo(parent);
  cube.applyTexture(texture, true);
  cube.mapAutoUV();
  return cube;
}

/** Ammo id -> template kind. Unknown calibers use the rifle round placeholder. */
function ammoTemplateKind(ammoId: string): string {
  const id = ammoId.toLowerCase();
  if (id.includes("12g") || id.includes("12ga") || id.includes("gauge")) return "ammo_12g";
  if (id.includes("9mm") || id.includes("9x19") || id.includes("9x18")) return "ammo_9mm";
  return "ammo_762";
}

/** Attachment type -> template kind. Types without a placeholder use the grip body. */
function attachmentTemplateKind(type: string): string {
  try {
    getItemTemplate(type);
    return type;
  } catch {
    return "grip";
  }
}

/** Resolves the template for one item, preferring an explicit override. */
function itemTemplate(kind: TaczItemKind, id: string, type: string | undefined, override: string | undefined): ITaczItemTemplate {
  const templateKind = override ?? (kind === "ammo" ? ammoTemplateKind(id) : attachmentTemplateKind(type ?? "grip"));
  return getItemTemplate(templateKind);
}

/** Result of creating a template project. */
export interface ICreateItemProjectResult {
  project: string;
  uuid: string;
  format: string;
  texture: string;
  texture_size: [number, number];
  groups: number;
  cubes: number;
}

/** Shared body of the ammo and attachment project creators. */
function createItemProject(
  kind: TaczItemKind,
  input: {
    packDir: string;
    namespace: string;
    itemId: string;
    type?: string;
    displayName?: string;
    textureSize?: [number, number];
    template?: string;
  },
): ICreateItemProjectResult {
  const formats = Formats as unknown as Record<string, ModelFormat | undefined>;
  const format = formats[TACZ_FORMAT_ID];
  if (!format) throw new Error(`Blockbench has no "${TACZ_FORMAT_ID}" format. Available formats: ${Object.keys(formats).sort().join(", ")}.`);
  const template = itemTemplate(kind, input.itemId, input.type, input.template);
  const size: [number, number] = input.textureSize ?? template.texture_size;
  const created = newProject(format);
  if (!created || !Project) throw new Error("Blockbench failed to create the TACZ project.");
  Project.name = input.displayName ?? input.itemId;
  Project.texture_width = size[0];
  Project.texture_height = size[1];
  const texture = addItemTexture(size, `${input.itemId}_uv`);
  const groups = new Map<string, Group>();
  for (const groupDef of template.groups) {
    const group = createGroupWithUndo(
      { name: groupDef.name, origin: [...groupDef.pivot] as [number, number, number], rotation: [...(groupDef.rotation ?? [0, 0, 0])] as [number, number, number] },
      groupDef.parent ?? "root",
      [],
      undefined,
      `TACZ added group ${groupDef.name}`,
    );
    groups.set(groupDef.name, group);
  }
  const cubes: Cube[] = [];
  runUndoableEdit({ elements: cubes, outliner: true }, "TACZ placed item template cubes", () => {
    for (const cubeDef of template.cubes) cubes.push(addItemCube(cubeDef, groups, texture));
    Canvas.updateAll();
  });
  setItemProjectMeta({
    pack_dir: input.packDir,
    namespace: input.namespace,
    kind,
    item_id: input.itemId,
    type: input.type,
    display_name: input.displayName ?? input.itemId,
    texture_size: size,
  });
  return {
    project: Project.name,
    uuid: Project.uuid,
    format: Format?.id ?? TACZ_FORMAT_ID,
    texture: texture.name,
    texture_size: size,
    groups: template.groups.length,
    cubes: template.cubes.length,
  };
}

/**
 * Creates a Bedrock Entity project from an ammo template.
 *
 * @throws When Bedrock Entity is unavailable, the template is unknown, or Blockbench rejects a group/cube.
 */
export function createAmmoProject(input: {
  packDir: string;
  namespace: string;
  ammoId: string;
  displayName?: string;
  textureSize?: [number, number];
  template?: string;
}): ICreateItemProjectResult {
  assertName(input.namespace, "namespace", AMMO_LABEL);
  assertName(input.ammoId, "ammoId", AMMO_LABEL);
  return createItemProject("ammo", { ...input, itemId: input.ammoId });
}

/**
 * Creates a Bedrock Entity project from an attachment template.
 *
 * @throws When Bedrock Entity is unavailable, the template is unknown, or Blockbench rejects a group/cube.
 */
export function createAttachmentProject(input: {
  packDir: string;
  namespace: string;
  attachmentId: string;
  type: string;
  displayName?: string;
  textureSize?: [number, number];
  template?: string;
}): ICreateItemProjectResult {
  assertName(input.namespace, "namespace", ATTACHMENT_LABEL);
  assertName(input.attachmentId, "attachmentId", ATTACHMENT_LABEL);
  if (!input.type.trim()) throw new Error(`${ATTACHMENT_LABEL}: type must not be blank.`);
  return createItemProject("attachment", { ...input, itemId: input.attachmentId });
}

/** Shared body of the ammo and attachment project openers. */
function openItemProject(
  kind: TaczItemKind,
  input: {
    packDir: string;
    namespace: string;
    itemId: string;
    type?: string;
    displayName?: string;
    geometryText: string;
    textureBytes?: Uint8Array;
  },
): { project: string; groups: number; cubes: number; texture_size: [number, number] } {
  const formats = Formats as unknown as Record<string, ModelFormat | undefined>;
  const format = formats[TACZ_FORMAT_ID];
  if (!format) throw new Error(`Blockbench has no "${TACZ_FORMAT_ID}" format.`);
  const created = newProject(format);
  if (!created || !Project) throw new Error("Blockbench failed to create the TACZ project.");
  Project.name = input.displayName ?? input.itemId;
  const model = parseGeoJson(input.geometryText);
  const geometry = selectGeometry(model);
  const size = geometryTextureSize(model);
  Project.texture_width = size[0];
  Project.texture_height = size[1];
  const texture = addItemTexture(size, `${input.itemId}_uv`);
  if (input.textureBytes) {
    const dataUrl = `data:image/png;base64,${Buffer.from(input.textureBytes).toString("base64")}`;
    texture.fromDataURL(dataUrl);
    texture.updateLayerChanges(true);
    void texture.img.decode().catch(() => undefined);
  }
  importGeoModel(geometry);
  for (const cube of Cube.all) cube.applyTexture(texture, true);
  Canvas.updateAll();
  setItemProjectMeta({
    pack_dir: input.packDir,
    namespace: input.namespace,
    kind,
    item_id: input.itemId,
    type: input.type,
    display_name: input.displayName ?? input.itemId,
    texture_size: size,
  });
  return { project: Project.name, groups: Group.all.length, cubes: Cube.all.length, texture_size: size };
}

/** Opens an existing ammo `*_geo.json` plus its PNG texture in a new Bedrock Entity project. */
export function openAmmoProject(input: {
  packDir: string;
  namespace: string;
  ammoId: string;
  displayName?: string;
  geometryText: string;
  textureBytes?: Uint8Array;
}): { project: string; groups: number; cubes: number; texture_size: [number, number] } {
  return openItemProject("ammo", { ...input, itemId: input.ammoId });
}

/** Opens an existing attachment `*_geo.json` plus its PNG texture in a new Bedrock Entity project. */
export function openAttachmentProject(input: {
  packDir: string;
  namespace: string;
  attachmentId: string;
  type: string;
  displayName?: string;
  geometryText: string;
  textureBytes?: Uint8Array;
}): { project: string; groups: number; cubes: number; texture_size: [number, number] } {
  return openItemProject("attachment", { ...input, itemId: input.attachmentId });
}

/** One ammo entry in a pack summary. */
export interface IPackAmmo {
  id: string;
  index: string;
  display: string;
  /** Ammo has no category in the official layout; kept for a uniform shape. */
  type?: string;
}

/** One attachment entry in a pack summary. */
export interface IPackAttachment {
  id: string;
  type: string;
  index: string;
  display: string;
  data: string;
}

/** Item validation result. */
export interface IItemValidationResult {
  ok: boolean;
  errors: IValidationIssue[];
  warnings: IValidationIssue[];
  ammo: number;
  attachments: number;
}

/** Reads the JSON files in one index directory, sorted by id. */
function readIndexDir(packDir: string, namespace: string, folder: "ammo" | "attachments", label: string): Array<{ id: string; file: string; index: Record<string, unknown> }> {
  const fs = fsModule(label);
  const dir = packPath(packDir, "data", namespace, "index", folder);
  if (!fs.existsSync(dir)) return [];
  const entries: Array<{ id: string; file: string; index: Record<string, unknown> }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const file = pathModule().join(dir, entry.name);
    const parsed = readJson(file, label);
    entries.push({ id: entry.name.slice(0, -5), file, index: isRecord(parsed) ? parsed : {} });
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

/** Lists ammo declared by `data/<ns>/index/ammo`. */
export function listAmmo(packDir: string): IPackAmmo[] {
  const resolved = resolvePackDir(packDir, AMMO_LABEL);
  const namespace = readNamespace(resolved);
  return readIndexDir(resolved, namespace, "ammo", AMMO_LABEL).map(({ id, index }) => {
    const entry: IPackAmmo = {
      id,
      index: `data/${namespace}/index/ammo/${id}.json`,
      display: typeof index.display === "string" ? index.display : "",
    };
    if (typeof index.type === "string") entry.type = index.type;
    return entry;
  });
}

/** Lists attachments declared by `data/<ns>/index/attachments`. */
export function listAttachments(packDir: string): IPackAttachment[] {
  const resolved = resolvePackDir(packDir, ATTACHMENT_LABEL);
  const namespace = readNamespace(resolved);
  return readIndexDir(resolved, namespace, "attachments", ATTACHMENT_LABEL).map(({ id, index }) => ({
    id,
    type: typeof index.type === "string" ? index.type : "unknown",
    index: `data/${namespace}/index/attachments/${id}.json`,
    display: typeof index.display === "string" ? index.display : "",
    data: typeof index.data === "string" ? index.data : "",
  }));
}

/** Adds one issue to the matching list. */
function report(list: IValidationIssue[], issue: IValidationIssue): void {
  list.push(issue);
}

/** Checks one display asset reference: existence, geometry shape, texture size. */
function checkAsset(
  packDir: string,
  namespace: string,
  itemId: string,
  kind: "model" | "texture" | "slot",
  reference: string,
  errors: IValidationIssue[],
  warnings: IValidationIssue[],
): void {
  let file: string;
  try {
    file = assetReferencePath(packDir, namespace, kind, reference);
  } catch (error) {
    report(errors, { code: "DISPLAY_REF_NAMESPACE", severity: "error", message: String(error), path: itemId });
    return;
  }
  const fs = fsModule("tacz_pack");
  if (!fs.existsSync(file)) {
    report(errors, { code: "ASSET_MISSING", severity: "error", message: `Missing ${kind} file ${relativePath(packDir, file)}.`, path: itemId });
    return;
  }
  if (kind === "model") {
    try {
      const geometry = readJson(file, "tacz_pack") as { "minecraft:geometry"?: unknown };
      if (!Array.isArray(geometry["minecraft:geometry"])) {
        report(errors, { code: "GEOMETRY_SHAPE", severity: "error", message: `${relativePath(packDir, file)} has no minecraft:geometry array.`, path: itemId });
      }
    } catch (error) {
      report(errors, { code: "GEOMETRY_JSON", severity: "error", message: String(error), path: itemId });
    }
    return;
  }
  try {
    const size = pngSize(fs.readFileSync(file));
    if (size.width > TACZ_MAX_TEXTURE_SIZE || size.height > TACZ_MAX_TEXTURE_SIZE) {
      report(errors, { code: "TEXTURE_SIZE", severity: "error", message: `Texture ${size.width}x${size.height} exceeds ${TACZ_MAX_TEXTURE_SIZE}px.`, path: itemId });
    }
    if ((size.width & (size.width - 1)) !== 0 || (size.height & (size.height - 1)) !== 0) {
      report(warnings, { code: "TEXTURE_POT", severity: "warning", message: `Texture ${size.width}x${size.height} is not a power of two.`, path: itemId });
    }
  } catch (error) {
    report(errors, { code: "TEXTURE_PNG", severity: "error", message: String(error), path: itemId });
  }
}

/** Checks the display fields every item needs, including an ammo shell pair. */
function checkDisplay(
  packDir: string,
  namespace: string,
  itemId: string,
  display: Record<string, unknown>,
  errors: IValidationIssue[],
  warnings: IValidationIssue[],
): void {
  for (const field of ["model", "texture", "slot"] as const) {
    const value = display[field];
    if (typeof value !== "string") {
      report(errors, { code: "DISPLAY_FIELD", severity: "error", message: `Item "${itemId}" display.${field} must be a resource reference.`, path: itemId });
      continue;
    }
    checkAsset(packDir, namespace, itemId, field, value, errors, warnings);
  }
  if (display.shell !== undefined) {
    const shell = isRecord(display.shell) ? display.shell : undefined;
    if (!shell) {
      report(warnings, { code: "DISPLAY_SHELL", severity: "warning", message: `Item "${itemId}" display.shell must be an object with model and texture.`, path: itemId });
      return;
    }
    for (const field of ["model", "texture"] as const) {
      const value = shell[field];
      if (typeof value !== "string") {
        report(warnings, { code: "DISPLAY_SHELL", severity: "warning", message: `Item "${itemId}" display.shell.${field} must be a resource reference.`, path: itemId });
        continue;
      }
      checkAsset(packDir, namespace, itemId, field, value, errors, warnings);
    }
  }
}

/** Checks that the locale files carry the item's name key. */
function checkLang(packDir: string, namespace: string, itemId: string, nameKey: string, errors: IValidationIssue[]): void {
  for (const locale of ["zh_cn", "en_us"]) {
    const file = packPath(packDir, "assets", namespace, "lang", `${locale}.json`);
    if (!fsModule("tacz_pack").existsSync(file)) {
      report(errors, { code: "LANG_FILE", severity: "error", message: `Missing assets/${namespace}/lang/${locale}.json.`, path: itemId });
      continue;
    }
    const lang = readJson(file, "tacz_pack") as Record<string, unknown>;
    if (!(nameKey in lang)) {
      report(errors, { code: "LANG_KEY", severity: "error", message: `${locale}.json is missing "${nameKey}".`, path: itemId });
    }
  }
}

/**
 * Validates every ammo and attachment in a pack: index fields, display
 * references, geometry/texture files, language keys, and the attachment data
 * file. Warnings cover non-fatal style problems such as non-power-of-two UVs.
 */
export function validateItems(packDir: string): IItemValidationResult {
  const errors: IValidationIssue[] = [];
  const warnings: IValidationIssue[] = [];
  const resolved = resolvePackDir(packDir, "tacz_pack");
  let namespace = "";
  try {
    namespace = readNamespace(resolved);
  } catch (error) {
    report(errors, { code: "PACK_META", severity: "error", message: error instanceof Error ? error.message : String(error) });
    return { ok: false, errors, warnings, ammo: 0, attachments: 0 };
  }

  const ammoEntries = readIndexDir(resolved, namespace, "ammo", "tacz_pack");
  for (const { id, index } of ammoEntries) {
    if (typeof index.name !== "string") {
      report(errors, { code: "INDEX_NAME", severity: "error", message: `Ammo "${id}" has no name key.`, path: id });
    }
    if (typeof index.display !== "string") {
      report(errors, { code: "INDEX_REF", severity: "error", message: `Ammo "${id}" must have a string display reference.`, path: id });
      continue;
    }
    const stackSize = Number(index.stack_size);
    if (!Number.isFinite(stackSize) || stackSize <= 0) {
      report(errors, { code: "AMMO_STACK_SIZE", severity: "error", message: `Ammo "${id}" stack_size must be > 0.`, path: id });
    }
    let display: Record<string, unknown> = {};
    try {
      display = readJson(documentPath(resolved, namespace, "display", "ammo", index.display), "tacz_pack") as Record<string, unknown>;
    } catch (error) {
      report(errors, { code: "DISPLAY_READ", severity: "error", message: String(error), path: id });
    }
    // tracer_color lives in the display file; the wiki requires #RRGGBB.
    const tracer = display.tracer_color;
    if (tracer !== undefined && !(typeof tracer === "string" && /^#[0-9a-fA-F]{6}$/.test(tracer))) {
      report(warnings, { code: "AMMO_TRACER_COLOR", severity: "warning", message: `Ammo "${id}" display.tracer_color must be #RRGGBB; other forms are silently ignored at runtime.`, path: id });
    }
    checkDisplay(resolved, namespace, id, display, errors, warnings);
    if (typeof index.name === "string") checkLang(resolved, namespace, id, index.name, errors);
  }

  const attachmentEntries = readIndexDir(resolved, namespace, "attachments", "tacz_pack");
  for (const { id, index } of attachmentEntries) {
    if (typeof index.name !== "string") {
      report(errors, { code: "INDEX_NAME", severity: "error", message: `Attachment "${id}" has no name key.`, path: id });
    }
    if (typeof index.display !== "string" || typeof index.data !== "string") {
      report(errors, { code: "INDEX_REF", severity: "error", message: `Attachment "${id}" must have string display/data references.`, path: id });
      continue;
    }
    if (typeof index.type !== "string" || !index.type.trim()) {
      report(errors, { code: "ATTACHMENT_TYPE", severity: "error", message: `Attachment "${id}" needs a type such as "scope" or "muzzle".`, path: id });
    } else if (!(TACZ_ATTACHMENT_TYPES as readonly string[]).includes(index.type)) {
      report(warnings, { code: "ATTACHMENT_TYPE_KNOWN", severity: "warning", message: `Attachment "${id}" type "${index.type}" is not one of the official categories.`, path: id });
    }
    let data: unknown;
    try {
      data = readJson(documentPath(resolved, namespace, "data", "attachment", index.data), "tacz_pack");
    } catch (error) {
      report(errors, { code: "DATA_READ", severity: "error", message: String(error), path: id });
    }
    if (data !== undefined && !isRecord(data)) {
      report(errors, { code: "DATA_SHAPE", severity: "error", message: `Attachment "${id}" data file must be a JSON object.`, path: id });
    }
    let display: Record<string, unknown> = {};
    try {
      display = readJson(documentPath(resolved, namespace, "display", "attachment", index.display), "tacz_pack") as Record<string, unknown>;
    } catch (error) {
      report(errors, { code: "DISPLAY_READ", severity: "error", message: String(error), path: id });
    }
    checkDisplay(resolved, namespace, id, display, errors, warnings);
    if (typeof display.sounds !== "object" || display.sounds === null) {
      report(warnings, { code: "DISPLAY_SOUNDS", severity: "warning", message: `Attachment "${id}" has no sounds block; the workbench plays no install sound.`, path: id });
    }
    if (typeof index.name === "string") checkLang(resolved, namespace, id, index.name, errors);
  }

  return { ok: errors.length === 0, errors, warnings, ammo: ammoEntries.length, attachments: attachmentEntries.length };
}

