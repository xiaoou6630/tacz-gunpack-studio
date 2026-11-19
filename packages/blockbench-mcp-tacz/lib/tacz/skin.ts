/**
 * Minimal Minecraft skin tools, added temporarily for the AI-moe skin experiment.
 *
 * This is deliberately separate from the TACZ gun-pack tools. A skin is not a
 * gun pack: the body is a fixed 64x64 layout, geometry cannot be added, and the
 * only freedom is base colour plus an overlay layer. Reusing the gun pipeline
 * would mean fighting assumptions that do not apply.
 *
 * The two constraints that shape this module:
 *
 * 1. **The layout is fixed.** Minecraft skins use a standard 64x64 atlas where
 *    each body part owns a known rectangle. This module carries that map so a
 *    caller can paint "the head" or "the torso" without knowing the offsets.
 *
 * 2. **No extra geometry.** Tails, wings, horns and long hair can only be drawn
 *    as flat colour on the overlay layer. Anything that must protrude is out of
 *    scope by definition.
 *
 * @module
 */
/// <reference types="blockbench-types" />

/**
 * Standard 64x64 skin layout.
 *
 * Each entry is the `[u, v]` origin of that part's unwrap. A part's unwrap is a
 * 2x2 arrangement of face rectangles whose sizes come from the model dimensions:
 * head 8x8x8, body 8x12x4, arm 4x12x4 (classic) or 3x12x4 (slim), leg 4x12x4.
 *
 * Values are the widely used layout from the Minecraft wiki skin page.
 */
export const SKIN_LAYOUT = {
  head: { u: 0, v: 0, size: [8, 8, 8] },
  body: { u: 16, v: 16, size: [8, 12, 4] },
  rightArm: { u: 40, v: 16, size: [4, 12, 4] },
  rightLeg: { u: 0, v: 16, size: [4, 12, 4] },
  leftArm: { u: 32, v: 48, size: [4, 12, 4] },
  leftLeg: { u: 16, v: 48, size: [4, 12, 4] },
} as const;

/** Overlay origins: the same parts on the second (outer) layer. */
export const SKIN_OVERLAY_LAYOUT = {
  hat: { u: 32, v: 0, size: [8, 8, 8] },
  jacket: { u: 16, v: 32, size: [8, 12, 4] },
  rightSleeve: { u: 40, v: 32, size: [4, 12, 4] },
  rightPants: { u: 0, v: 32, size: [4, 12, 4] },
  leftSleeve: { u: 48, v: 48, size: [4, 12, 4] },
  leftPants: { u: 0, v: 48, size: [4, 12, 4] },
} as const;

/** A body part name from the layout maps. */
export type SkinPart = keyof typeof SKIN_LAYOUT;
/** An overlay part name from the layout maps. */
export type SkinOverlay = keyof typeof SKIN_OVERLAY_LAYOUT;

/** One painted rectangle in the atlas. */
export interface ISkinFill {
  part: SkinPart | SkinOverlay;
  /** `base` paints the inner layer, `overlay` the outer one. */
  layer: "base" | "overlay";
  /** Hex colour, `#rrggbb` or `#rrggbbaa`. */
  color: string;
  /** Optional inset in pixels, to leave a margin inside the part. */
  inset?: number;
}

/** Result of a paint pass. */
export interface ISkinPaintResult {
  texture: string;
  size: [number, number];
  painted: number;
  parts: string[];
}

/**
 * Creates or resizes the project's skin texture to 64x64 and clears it.
 *
 * Minecraft's modern skin format is 64x64. The 64x32 legacy format has no
 * overlay layer for the arms and legs, so it is not used here.
 */
export function ensureSkinTexture(name = "skin"): Texture {
  if (!Project) throw new Error("No project is open. Run tacz_skin action=\"new\" first.");
  let texture = Texture.all[0];
  const size = 64;
  if (texture) {
    if (texture.width !== size || texture.height !== size) {
      texture.width = size;
      texture.height = size;
      texture.canvas.width = size;
      texture.canvas.height = size;
    }
  } else {
    texture = new Texture({ name, width: size, height: size, internal: true });
    texture.add(false);
  }
  Project.texture_width = size;
  Project.texture_height = size;
  return texture;
}

/** Parses `#rgb`, `#rrggbb` or `#rrggbbaa` into canvas-ready values. */
function parseColor(color: string): { css: string; alpha: number } {
  const hex = color.replace(/^#/, "");
  if (hex.length === 3) {
    const [r, g, b] = hex.split("");
    return { css: `#${r}${r}${g}${g}${b}${b}`, alpha: 1 };
  }
  if (hex.length === 6) return { css: `#${hex}`, alpha: 1 };
  if (hex.length === 8) {
    const alpha = parseInt(hex.slice(6, 8), 16) / 255;
    return { css: `#${hex.slice(0, 6)}`, alpha };
  }
  throw new Error(`Unsupported colour "${color}": use #rgb, #rrggbb or #rrggbbaa.`);
}

/**
 * Computes the full atlas rectangle a part's unwrap occupies.
 *
 * A part unwraps to width `2*(w+d)` and height `d+h`, where `w/h/d` are the
 * part's dimensions. Painting the whole unwrap is what "fill the head with skin
 * tone" means; per-face control is deliberately not offered, because at 8x8 per
 * face there is nothing finer worth exposing.
 */
export function partRect(part: SkinPart | SkinOverlay, layer: "base" | "overlay"): { x: number; y: number; width: number; height: number } {
  const table = layer === "base" ? SKIN_LAYOUT : SKIN_OVERLAY_LAYOUT;
  const entry = (table as Record<string, { u: number; v: number; size: readonly number[] }>)[part];
  if (!entry) throw new Error(`Unknown ${layer} part "${part}".`);
  const [w, h, d] = entry.size;
  return { x: entry.u, y: entry.v, width: 2 * (w + d), height: d + h };
}

/**
 * Paints one or more parts of the skin atlas.
 *
 * Each fill covers the part's whole unwrap. Overlapping fills are applied in
 * order, so a later part can correct an earlier one — useful when a body part
 * is mostly one colour with a band of another.
 */
export function paintSkin(fills: readonly ISkinFill[], options: { clear?: boolean; name?: string } = {}): ISkinPaintResult {
  if (!Project) throw new Error("No project is open.");
  const texture = ensureSkinTexture(options.name ?? "skin");
  const { ctx, canvas } = texture.getActiveCanvas();
  canvas.width = 64;
  canvas.height = 64;
  if (options.clear !== false) ctx.clearRect(0, 0, 64, 64);

  const paintedParts: string[] = [];
  let painted = 0;
  for (const fill of fills) {
    const rect = partRect(fill.part, fill.layer);
    const inset = Math.max(0, Math.min(fill.inset ?? 0, Math.floor(Math.min(rect.width, rect.height) / 2)));
    const { css, alpha } = parseColor(fill.color);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = css;
    ctx.fillRect(rect.x + inset, rect.y + inset, Math.max(1, rect.width - inset * 2), Math.max(1, rect.height - inset * 2));
    ctx.restore();
    paintedParts.push(`${fill.layer}:${fill.part}`);
    painted++;
  }

  texture.updateSource(canvas.toDataURL("image/png", 1));
  texture.updateLayerChanges(true);
  texture.select();
  Canvas.updateAll();
  return { texture: texture.name, size: [64, 64], painted, parts: paintedParts };
}

/**
 * Checks whether the current project is a skin and whether its atlas is usable.
 *
 * A skin is usable when the texture is 64x64 and the head's front face carries
 * at least one opaque pixel — an all-transparent skin renders as the default
 * Steve, which is almost never what the caller meant.
 */
export function validateSkin(): { ok: boolean; format: string; texture: string | null; issues: string[] } {
  const issues: string[] = [];
  const format = Format?.id ?? "unknown";
  if (format !== "skin") issues.push(`Project format is "${format}", expected "skin".`);
  const texture = Texture.all[0] ?? null;
  if (!texture) {
    issues.push("No texture: run tacz_skin action=\"paint\" first.");
    return { ok: false, format, texture: null, issues };
  }
  if (texture.width !== 64 || texture.height !== 64) {
    issues.push(`Texture is ${texture.width}x${texture.height}, expected 64x64.`);
  }
  // Sample the head's front face (8x8 at u=8, v=8) for opaque pixels.
  const canvas = (texture as unknown as { canvas?: HTMLCanvasElement }).canvas;
  if (canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
    if (ctx) {
      const data = ctx.getImageData(8, 8, 8, 8).data;
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
      if (opaque === 0) issues.push("The head's front face is fully transparent; the skin would render as default Steve.");
    }
  }
  return { ok: issues.length === 0, format, texture: texture.name, issues };
}
