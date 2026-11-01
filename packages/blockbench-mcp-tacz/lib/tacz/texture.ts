/**
 * TACZ atlas seeding. The geometry uses per-face UVs; this module assigns the
 * project texture, runs Auto UV, and paints every face with a category color so
 * a freshly scaffolded gun is readable before the modeler adds detail.
 *
 * @module
 */
/// <reference types="blockbench-types" />
import { runUndoableEdit } from "@/lib/undo";
import { TACZ_MATERIALS } from "@/lib/tacz/constants";

/** Material palette accepted by the initial atlas pass. */
export type TaczMaterial = keyof typeof TACZ_MATERIALS;

/** Result of the initial atlas pass. */
export interface IAtlasResult {
  texture: string;
  size: [number, number];
  faces: number;
  cubes: number;
  empty_faces: number;
  /** Cubes whose name carried no part information, so the material was guessed. */
  unnamed_cubes: number;
}

/**
 * Chooses a default material from a template cube name.
 *
 * Bedrock geometry has no `name` field for cubes, so a project reopened from
 * `*_geo.json` names every cube after its bone — usually `AKM`. That name
 * matches none of the rules below and used to fall through to plain `steel`,
 * turning the whole gun one flat grey. The fallback now varies by cube index
 * so neighbouring parts at least differ, and callers are told when the name
 * carried no information.
 */
export function materialForName(name: string, index = 0): string {
  const lower = name.toLowerCase();
  if (/(stock|wood|handguard|grip)/.test(lower)) return lower.includes("grip") ? "polymer" : "wood";
  if (/(mag|bolt|barrel|muzzle|receiver|tube|steel)/.test(lower)) return lower.includes("muzzle") || lower.includes("mag") ? "steel_dark" : "steel";
  if (/(sight|scope|rail)/.test(lower)) return "steel_dark";
  if (/(glass|lens)/.test(lower)) return "glass";
  if (/(accent|warhead|tip)/.test(lower)) return "accent";
  // A bone name (`AKM`, `root`, `bone2`) says nothing about the part. Spread
  // the four structural materials so the blockout is still readable.
  const fallback = ["steel", "steel_dark", "polymer", "wood"];
  return fallback[index % fallback.length];
}

/** True when a cube name carries part information rather than just a bone name. */
export function hasPartName(name: string): boolean {
  const lower = name.toLowerCase();
  return /(stock|wood|handguard|grip|mag|bolt|barrel|muzzle|receiver|tube|sight|scope|rail|glass|lens|accent|trigger|hammer|safety|pump)/.test(lower);
}

/** Returns the project texture, creating one if the project has none. */
function ensureTexture(size: [number, number], name: string): Texture {
  const existing = Texture.all[0];
  if (existing) {
    if (existing.width !== size[0] || existing.height !== size[1]) {
      existing.width = size[0];
      existing.height = size[1];
      existing.canvas.width = size[0];
      existing.canvas.height = size[1];
    }
    return existing;
  }
  const texture = new Texture({ name, width: size[0], height: size[1], internal: true });
  runUndoableEdit({ textures: [texture], bitmap: true }, "TACZ created UV texture", () => {
    const { ctx, canvas } = texture.getActiveCanvas();
    canvas.width = size[0];
    canvas.height = size[1];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    texture.updateSource(canvas.toDataURL("image/png", 1));
    texture.updateLayerChanges(true);
    texture.add(false);
    Canvas.updateAll();
  });
  return texture;
}

/** Paints one face rectangle with a base color and a one-pixel bevel. */
function paintFace(ctx: CanvasRenderingContext2D, uv: readonly number[], color: string): boolean {
  const [u1, v1, u2, v2] = uv.map(value => Math.round(Number(value)));
  const x = Math.min(u1, u2);
  const y = Math.min(v1, v2);
  const width = Math.max(1, Math.abs(u2 - u1));
  const height = Math.max(1, Math.abs(v2 - v1));
  if (![x, y, width, height].every(Number.isFinite)) return false;
  if (width <= 0 || height <= 0) return false;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
  if (width > 2 && height > 2) {
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(x, y, width, 1);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(x, y + height - 1, width, 1);
  }
  return true;
}

/**
 * Assigns the project texture to every cube, runs Auto UV, and paints each face
 * with a material color.
 *
 * @param options - Atlas size, palette override, and texture name.
 */
export function initializeAtlas(options: { size: [number, number]; palette?: Record<string, string>; name?: string }): IAtlasResult {
  if (!Project) throw new Error("No project is open. Run tacz_gun action=\"new\" first.");
  const texture = ensureTexture(options.size, options.name ?? `${Project.name}_uv`);
  const palette = { ...TACZ_MATERIALS, ...options.palette };
  const { ctx, canvas } = texture.getActiveCanvas();
  canvas.width = options.size[0];
  canvas.height = options.size[1];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  Project.texture_width = options.size[0];
  Project.texture_height = options.size[1];
  for (const cube of Cube.all) {
    // Box UV squeezes all six faces of a cube into one small net, so a whole
    // gun covers only a sliver of the atlas (measured: 9% coverage on a 96-cube
    // model, against 74-100% for the hand-authored DP-12 and KSG). Per-face UV
    // lets Auto UV spread the faces across the atlas, which is what makes
    // shading and detail possible later.
    if (cube.box_uv && Format?.optional_box_uv) {
      try {
        // Blockbench's own dialog uses setUVMode(false) for "Switch to Per-face UV".
        (cube as unknown as { setUVMode?: (box: boolean) => void }).setUVMode?.(false);
      } catch {
        // Some formats refuse the conversion; keep the box UV rather than fail.
      }
    }
    cube.applyTexture(texture, true);
    cube.mapAutoUV();
  }
  let faces = 0;
  let empty = 0;
  let unnamed = 0;
  let index = 0;
  for (const cube of Cube.all) {
    if (!hasPartName(cube.name)) unnamed += 1;
    const material = materialForName(cube.name, index);
    index += 1;
    const color = palette[material] ?? palette.steel;
    for (const face of Object.values(cube.faces)) {
      const uv = face.uv as unknown as readonly number[] | undefined;
      if (!uv || uv.length !== 4 || paintFace(ctx, uv, color) === false) empty += 1;
      else faces += 1;
    }
  }
  texture.updateSource(canvas.toDataURL("image/png", 1));
  texture.updateLayerChanges(true);
  texture.select();
  Canvas.updateAll();
  return { texture: texture.name, size: [options.size[0], options.size[1]], faces, cubes: Cube.all.length, empty_faces: empty, unnamed_cubes: unnamed };
}
