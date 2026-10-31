/**
 * Blockbench project helpers for TACZ. The template is created from the
 * default AK-47 group tree; the gun points along -Z and uses a 128x128 atlas.
 *
 * @module
 */
/// <reference types="three" />
/// <reference types="blockbench-types" />
import { TACZ_FORMAT_ID } from "@/lib/tacz/constants";
import type { ITaczGunTemplate } from "@/lib/tacz/templates";
import { getTemplate } from "@/lib/tacz/templates";
import { createGroupWithUndo } from "@/lib/group-creation";
import { runUndoableEdit } from "@/lib/undo";
import { importGeoModel, parseGeoJson, selectGeometry } from "@/server/tools/import";
import type { TaczGunType } from "@/lib/tacz/constants";

/** Project metadata kept beside the live Blockbench project. */
export interface IGunProjectMeta {
  pack_dir: string;
  namespace: string;
  gun_id: string;
  type: TaczGunType;
  display_name: string;
  texture_size: [number, number];
  profile: Record<string, unknown>;
}

/** Module-level metadata keyed by project UUID; Blockbench projects do not carry arbitrary fields. */
const projectMeta = new Map<string, IGunProjectMeta>();

/** Saves metadata for the active project. */
export function setGunProjectMeta(meta: IGunProjectMeta): void {
  if (!Project) throw new Error("No project is open.");
  projectMeta.set(Project.uuid, meta);
}

/** Reads metadata for the active project. */
export function getGunProjectMeta(): IGunProjectMeta | undefined {
  return Project ? projectMeta.get(Project.uuid) : undefined;
}

/** Reads a numeric texture size from a geometry description. */
function geometryTextureSize(geometry: unknown): [number, number] {
  const list = (geometry as { "minecraft:geometry"?: unknown })["minecraft:geometry"];
  const first = Array.isArray(list) ? list[0] : undefined;
  const description = first && typeof first === "object" ? (first as { description?: unknown }).description : undefined;
  const width = description && typeof description === "object" ? Number((description as { texture_width?: unknown }).texture_width) : NaN;
  const height = description && typeof description === "object" ? Number((description as { texture_height?: unknown }).texture_height) : NaN;
  return [Number.isFinite(width) && width > 0 ? width : 128, Number.isFinite(height) && height > 0 ? height : 128];
}

/** Creates a blank project texture sized for the gun and adds it to the project. */
function addProjectTexture(size: [number, number], name: string): Texture {
  const texture = new Texture({ name, width: size[0], height: size[1], internal: true });
  runUndoableEdit({ textures: [texture], bitmap: true }, "TACZ created UV texture", () => {
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

/** Creates a cube constrained to the template group. */
function addCube(cubeDef: ITaczGunTemplate["cubes"][number], groups: Map<string, Group>, texture: Texture): Cube {
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

/** Result of creating a template project. */
export interface ICreateGunProjectResult {
  project: string;
  uuid: string;
  format: string;
  texture: string;
  texture_size: [number, number];
  groups: number;
  cubes: number;
}

/**
 * Creates a Bedrock Entity project from a TACZ gun template.
 *
 * @param input - Gun identity, pack metadata, and optional template overrides.
 * @throws When Bedrock Entity is unavailable, the template is unknown, or Blockbench rejects a group/cube.
 */
export function createGunProject(input: {
  packDir: string;
  namespace: string;
  gunId: string;
  type: TaczGunType;
  displayName?: string;
  textureSize?: [number, number];
  profile?: Record<string, unknown>;
  overwrite?: boolean;
}): ICreateGunProjectResult {
  const formats = Formats as unknown as Record<string, ModelFormat | undefined>;
  const format = formats[TACZ_FORMAT_ID];
  if (!format) throw new Error(`Blockbench has no "${TACZ_FORMAT_ID}" format. Available formats: ${Object.keys(formats).sort().join(", ")}.`);
  const template = getTemplate(input.type);
  const size: [number, number] = input.textureSize ?? template.texture_size;
  const created = newProject(format);
  if (!created || !Project) throw new Error("Blockbench failed to create the TACZ project.");
  Project.name = input.displayName ?? input.gunId;
  Project.texture_width = size[0];
  Project.texture_height = size[1];
  const texture = addProjectTexture(size, `${input.gunId}_uv`);

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
  runUndoableEdit({ elements: cubes, outliner: true }, "TACZ placed template cubes", () => {
    for (const cubeDef of template.cubes) cubes.push(addCube(cubeDef, groups, texture));
    Canvas.updateAll();
  });
  setGunProjectMeta({
    pack_dir: input.packDir,
    namespace: input.namespace,
    gun_id: input.gunId,
    type: input.type,
    display_name: input.displayName ?? input.gunId,
    texture_size: size,
    profile: input.profile ?? {},
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

/** Opens an existing `*_geo.json` plus its PNG texture in a new Bedrock Entity project. */
export function openGunProject(input: {
  packDir: string;
  namespace: string;
  gunId: string;
  type: TaczGunType;
  displayName?: string;
  geometryText: string;
  textureBytes?: Uint8Array;
}): { project: string; groups: number; cubes: number; texture_size: [number, number] } {
  const formats = Formats as unknown as Record<string, ModelFormat | undefined>;
  const format = formats[TACZ_FORMAT_ID];
  if (!format) throw new Error(`Blockbench has no "${TACZ_FORMAT_ID}" format.`);
  const created = newProject(format);
  if (!created || !Project) throw new Error("Blockbench failed to create the TACZ project.");
  Project.name = input.displayName ?? input.gunId;
  const model = parseGeoJson(input.geometryText);
  const geometry = selectGeometry(model);
  const size = geometryTextureSize(model);
  Project.texture_width = size[0];
  Project.texture_height = size[1];
  const texture = addProjectTexture(size, `${input.gunId}_uv`);
  if (input.textureBytes) {
    const dataUrl = `data:image/png;base64,${Buffer.from(input.textureBytes).toString("base64")}`;
    texture.fromDataURL(dataUrl);
    texture.updateLayerChanges(true);
    void texture.img.decode().catch(() => undefined);
  }
  importGeoModel(geometry);
  for (const cube of Cube.all) cube.applyTexture(texture, true);
  Canvas.updateAll();
  setGunProjectMeta({
    pack_dir: input.packDir,
    namespace: input.namespace,
    gun_id: input.gunId,
    type: input.type,
    display_name: input.displayName ?? input.gunId,
    texture_size: size,
    profile: {},
  });
  return { project: Project.name, groups: Group.all.length, cubes: Cube.all.length, texture_size: size };
}

/** Active project texture, falling back to the first project texture. */
export function currentTexture(): Texture {
  const selected = Texture.selected;
  if (selected) return selected;
  const first = Texture.all[0];
  if (!first) throw new Error("The project has no texture. Run tacz_texture_init first.");
  return first;
}

/**
 * Compiles the active project through Blockbench's Bedrock codec.
 *
 * @returns Geometry JSON text and the path that produced it.
 * @throws When no project is open or the codec cannot compile.
 */
export function compileGeometry(gunId?: string): { text: string; source: "codec" | "fallback" } {
  if (!Project) throw new Error("No project is open.");
  const codec = (Codecs as unknown as Record<string, { compile?: () => unknown } | undefined>).bedrock;
  if (codec && typeof codec.compile === "function") {
    const raw = codec.compile();
    const text = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
    const parsed = parseGeoJson(text) as { format_version?: unknown; "minecraft:geometry"?: Array<{ description?: Record<string, unknown> }> };
    if (!Array.isArray(parsed["minecraft:geometry"])) throw new Error("The Bedrock codec returned no minecraft:geometry array.");
    if (typeof parsed.format_version !== "string") parsed.format_version = "1.12.0";
    const description = parsed["minecraft:geometry"][0]?.description;
    if (description && typeof description === "object") {
      description.identifier = `geometry.${(gunId ?? String(Project.name ?? "tacz")).toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
    }
    return { text: JSON.stringify(parsed, null, 2), source: "codec" };
  }
  return { text: JSON.stringify(buildFallbackGeometry(), null, 2), source: "fallback" };
}

/** Minimal Bedrock geometry fallback when the codec is unavailable. */
function buildFallbackGeometry(): Record<string, unknown> {
  const bones = Group.all.map(group => {
    const parent = group.parent instanceof Group ? group.parent.name : undefined;
    return {
      name: group.name,
      ...(parent ? { parent } : {}),
      pivot: [...group.origin] as [number, number, number],
      ...(group.rotation.some(value => value !== 0) ? { rotation: [...group.rotation] as [number, number, number] } : {}),
      cubes: group.children
        .filter((child): child is Cube => child instanceof Cube)
        .map(cube => {
          const origin = cube.from.map((value, index) => Math.min(value, cube.to[index])) as [number, number, number];
          const size = cube.from.map((value, index) => Math.abs(cube.to[index] - value)) as [number, number, number];
          return {
            origin,
            size,
            uv: cube.box_uv && Array.isArray(cube.uv_offset) ? [...cube.uv_offset] : [0, 0],
          };
        }),
    };
  });
  return {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: {
        identifier: `geometry.${String(Project?.name ?? "tacz").toLowerCase().replace(/[^a-z0-9_]/g, "_")}`,
        texture_width: Project?.texture_width ?? 128,
        texture_height: Project?.texture_height ?? 128,
        visible_bounds_width: 4,
        visible_bounds_height: 3,
        visible_bounds_offset: [0, 1.5, 0],
      },
      bones,
    }],
  };
}

/** Returns the active texture as PNG bytes. */
export function currentTexturePng(): Uint8Array {
  const texture = currentTexture();
  const dataUrl = texture.canvas.toDataURL("image/png");
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Blockbench returned an invalid texture data URL.");
  return new Uint8Array(Buffer.from(dataUrl.slice(comma + 1), "base64"));
}
