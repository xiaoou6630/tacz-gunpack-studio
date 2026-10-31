/**
 * Renders a TACZ container icon from the live Blockbench model using the
 * plugin's offscreen view pipeline, then crops the alpha bounds and scales to
 * the default 64x64 slot size.
 *
 * @module
 */
/// <reference types="blockbench-types" />
import { TACZ_DEFAULT_ICON_SIZE } from "@/lib/tacz/constants";
import {
  createOffscreenView,
  deleteOffscreenView,
  loadViewAngle,
  renderViewToDataUrl,
  resolveView,
} from "@/lib/views";

/** Options for the icon renderer. */
export interface IIconRenderOptions {
  /** Square slot size, or the width of a non-square target. */
  targetSize?: number;
  /** Non-square target height (HUD 384x128); defaults to `targetSize`. */
  targetHeight?: number;
  angle?: "side" | "iso" | "front";
  owner?: string;
  padding?: number;
  /** Also disable viewport shading. Independent of `style`. */
  flat?: boolean;
  /** Mirror the finished icon horizontally, so the muzzle points right. */
  flipX?: boolean;
  /** `render` keeps the shaded 3D render (official slot style); `flat` paints the alpha silhouette with one solid color (official HUD style). */
  style?: "render" | "flat";
  /** Solid fill for `style: flat` (hex). */
  color?: string;
  /** 1px outline for `style: flat` (hex). */
  outline?: string;
}

/** One rendered icon. */
export interface IIconRenderResult {
  data_url: string;
  width: number;
  height: number;
  view: string;
}

/** Camera presets for TACZ gun icons. */
const ANGLES = {
  side: { position: [90, 10, -8], target: [0, 8, -8], projection: "orthographic" as const, zoom: 1.15 },
  iso: { position: [70, 24, -60], target: [0, 8, -6], projection: "orthographic" as const, zoom: 1.05 },
  front: { position: [0, 10, 60], target: [0, 8, -6], projection: "orthographic" as const, zoom: 1.15 },
};

/** Decodes a data URL into an image. */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Blockbench returned an icon image that could not be decoded."));
    image.src = dataUrl;
  });
}

/** Toggles Blockbench's viewport shading through the native action. */
function setShading(enabled: boolean): void {
  const toggle = (BarItems as unknown as Record<string, { value?: boolean; trigger?: () => void } | undefined>).toggle_shading;
  if (!toggle || typeof toggle.trigger !== "function") return;
  if (Boolean(toggle.value) !== enabled) toggle.trigger();
}

/** Parses `#rrggbb` into RGB; falls back to the TACZ blue-gray. */
function hexRgb(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/.exec(String(hex ?? "").trim());
  if (!match) return fallback;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Paints the icon's alpha silhouette with one solid color plus an optional outline. */
async function flattenIcon(dataUrl: string, width: number, height: number, color: string | undefined, outline: string | undefined): Promise<string> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a 2D canvas for the flat TACZ icon.");
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const fill = hexRgb(color, [111, 119, 128]);
  const edge = hexRgb(outline, [35, 38, 42]);
  const alphaAt = (x: number, y: number): number => pixels.data[(y * width + x) * 4 + 3];
  const opaque = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && alphaAt(x, y) > 8;
  const outlined = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!opaque(x, y) && (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1))) outlined[y * width + x] = 1;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (opaque(x, y)) {
        pixels.data[index] = fill[0];
        pixels.data[index + 1] = fill[1];
        pixels.data[index + 2] = fill[2];
        pixels.data[index + 3] = 255;
      } else if (outlined[y * width + x]) {
        pixels.data[index] = edge[0];
        pixels.data[index + 1] = edge[1];
        pixels.data[index + 2] = edge[2];
        pixels.data[index + 3] = 255;
      }
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Crops the transparent border, then fits the model into a target box with padding. */
async function cropAndScale(dataUrl: string, targetWidth: number, targetHeight: number, paddingRatio: number, flipX = false): Promise<string> {
  const image = await loadImage(dataUrl);
  const source = document.createElement("canvas");
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) throw new Error("Could not create a 2D canvas for the TACZ icon.");
  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (pixels[(y * source.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) throw new Error("The TACZ icon render is empty; check the model and camera.");
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const padding = Math.max(0, Math.round(Math.min(targetWidth, targetHeight) * paddingRatio));
  const contentWidth = Math.max(1, targetWidth - padding * 2);
  const contentHeight = Math.max(1, targetHeight - padding * 2);
  const scale = Math.min(contentWidth / width, contentHeight / height);
  const drawWidth = Math.max(1, Math.round(width * scale));
  const drawHeight = Math.max(1, Math.round(height * scale));
  const output = document.createElement("canvas");
  output.width = targetWidth;
  output.height = targetHeight;
  const outputContext = output.getContext("2d");
  if (!outputContext) throw new Error("Could not create a 2D canvas for the TACZ icon.");
  outputContext.imageSmoothingEnabled = false;
  outputContext.clearRect(0, 0, targetWidth, targetHeight);
  outputContext.save();
  if (flipX) {
    outputContext.translate(targetWidth, 0);
    outputContext.scale(-1, 1);
  }
  outputContext.drawImage(
    source,
    minX, minY, width, height,
    Math.round((targetWidth - drawWidth) / 2),
    Math.round((targetHeight - drawHeight) / 2),
    drawWidth, drawHeight,
  );
  outputContext.restore();
  return output.toDataURL("image/png");
}

/**
 * Renders one icon from the active project.
 *
 * @param options - Target size, camera preset, session owner, and padding ratio.
 * @throws When the offscreen view cannot be created or the render is empty.
 */
export async function renderIcon(options: IIconRenderOptions = {}): Promise<IIconRenderResult> {
  if (!Project) throw new Error("No project is open.");
  const targetWidth = options.targetSize ?? TACZ_DEFAULT_ICON_SIZE;
  const targetHeight = options.targetHeight ?? targetWidth;
  const flat = options.flat === true;
  const previousShading = Boolean((BarItems as unknown as Record<string, { value?: boolean } | undefined>).toggle_shading?.value);
  if (flat) setShading(false);
  const viewId = `tacz_icon_${Date.now().toString(36)}`;
  const created = createOffscreenView({
    id: viewId,
    width: 512,
    height: 512,
    antialias: true,
    copyFrom: "none",
    owner: options.owner,
  });
  try {
    const preview = resolveView(created.id);
    loadViewAngle(preview, ANGLES[options.angle ?? "side"]);
    const rendered = renderViewToDataUrl(preview);
    const cropped = await cropAndScale(rendered, targetWidth, targetHeight, options.padding ?? 0.04, options.flipX === true);
    const final = options.style === "flat"
      ? await flattenIcon(cropped, targetWidth, targetHeight, options.color, options.outline)
      : cropped;
    return { data_url: final, width: targetWidth, height: targetHeight, view: created.id };
  } finally {
    if (flat) setShading(previousShading);
    try {
      deleteOffscreenView(viewId);
    } catch {
      // The session owner may already have disposed it.
    }
  }
}
