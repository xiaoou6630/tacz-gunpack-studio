/**
 * Texture-quality gates for TACZ gun packs.
 *
 * The structural checks in `validate.ts` answer "will it load?" This module
 * answers a different question: "will it look like a gun, or like an untextured
 * block pile?"
 *
 * The failure this exists for: a modeler built 96 cubes but never ran
 * `tacz_texture_init`, so every cube kept `uv_offset = null`. On export every
 * face collapsed to `uv: [0,0]` and the whole gun sampled a single pixel of the
 * atlas. The model loaded fine and looked like grey mush.
 *
 * Thresholds come from measuring a good model against a broken one and against
 * the official packs, not from taste:
 *
 *                       good (ours)   broken (ours)   official m870
 *   distinct colours         434*          14             424
 *   atlas coverage           74%*          2%             high
 *   unique face UV           74%           33%            100%
 *
 * (*) measured on the bbmodel's face rectangles; the texture numbers come from
 * `tools/diagnose-texture.py`.
 *
 * @module
 */
/// <reference types="blockbench-types" />

/** One quality finding. */
export interface IQualityIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
}

/** Quality thresholds. Tuned so the broken example fails and the good one passes. */
export const TACZ_QUALITY = {
  /** Distinct non-transparent colours a painted atlas should have. */
  minDistinctColors: 64,
  /** Share of the atlas that should carry pixels, as a percentage. */
  minCoveragePercent: 20,
  /** Share of face UV rectangles that should be unique, as a percentage. */
  minUniqueUvPercent: 70,
  /** Cubes below this are LOD-grade; official high-poly guns use 273-761. */
  minCubes: 120,
  /** How many colours to sample before giving up (keeps the check cheap). */
  sampleLimit: 65536,
} as const;

/** Counts distinct opaque colours and covered pixels in one canvas. */
function analyzeCanvas(canvas: HTMLCanvasElement): { distinct: number; covered: number; total: number } {
  const width = canvas.width;
  const height = canvas.height;
  const total = width * height;
  if (total === 0) return { distinct: 0, covered: 0, total: 0 };
  const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!context) return { distinct: 0, covered: 0, total };
  const data = context.getImageData(0, 0, width, height).data;
  const colors = new Set<number>();
  let covered = 0;
  const step = Math.max(1, Math.floor(total / TACZ_QUALITY.sampleLimit));
  for (let pixel = 0; pixel < total; pixel += step) {
    const offset = pixel * 4;
    const alpha = data[offset + 3];
    if (alpha === 0) continue;
    covered++;
    // Pack RGB into one integer so the Set stays small.
    colors.add((data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]);
  }
  const sampled = Math.ceil(total / step);
  return { distinct: colors.size, covered: (covered / sampled) * 100, total: sampled };
}

/** Counts how many face UV rectangles are unique across the project. */
function uvUniqueness(): { total: number; unique: number; percent: number } {
  const rectangles: string[] = [];
  for (const cube of Cube.all) {
    for (const face of Object.values(cube.faces)) {
      const uv = face?.uv as unknown as readonly number[] | undefined;
      if (!uv || uv.length !== 4) continue;
      const rounded = uv.map(value => Math.round(Number(value)));
      rectangles.push(rounded.join(","));
    }
  }
  const total = rectangles.length;
  const unique = new Set(rectangles).size;
  return { total, unique, percent: total === 0 ? 0 : (unique / total) * 100 };
}

/**
 * Runs the quality gates against the live project.
 *
 * Errors mean the export would look broken; warnings mean it would look flat
 * but still be recognisable.
 */
export function validateTextureQuality(): { ok: boolean; issues: IQualityIssue[]; stats: Record<string, number> } {
  const issues: IQualityIssue[] = [];
  const stats: Record<string, number> = {};

  if (!Project) throw new Error("No project is open.");

  const texture = Texture.all[0] ?? null;
  if (texture) {
    const canvas = (texture as unknown as { canvas?: HTMLCanvasElement }).canvas;
    if (canvas && canvas.width > 0) {
      const { distinct, covered } = analyzeCanvas(canvas);
      stats.distinct_colors = distinct;
      stats.coverage_percent = Math.round(covered);
      if (distinct < TACZ_QUALITY.minDistinctColors) {
        issues.push({
          code: "TEXTURE_FLAT",
          severity: "error",
          message: `The atlas has only ${distinct} distinct colours (minimum ${TACZ_QUALITY.minDistinctColors}). Official packs use 400+. This is what an unpainted atlas looks like: run tacz_texture_init, then paint shading and detail.`,
        });
      }
      if (covered < TACZ_QUALITY.minCoveragePercent) {
        issues.push({
          code: "TEXTURE_EMPTY",
          severity: "error",
          message: `Only ${Math.round(covered)}% of the atlas carries pixels (minimum ${TACZ_QUALITY.minCoveragePercent}%). Most faces have nowhere to sample from, so the model renders as a flat silhouette.`,
        });
      }
    }
  }

  const uv = uvUniqueness();
  stats.uv_faces = uv.total;
  stats.uv_unique_percent = Math.round(uv.percent);
  if (uv.total > 0 && uv.percent < TACZ_QUALITY.minUniqueUvPercent) {
    issues.push({
      code: "UV_OVERLAP",
      severity: "error",
      message: `${uv.total - uv.unique} of ${uv.total} faces share a UV rectangle (${Math.round(uv.percent)}% unique, minimum ${TACZ_QUALITY.minUniqueUvPercent}%). Overlapping faces sample the same texels, which is why the surface reads as one flat colour. Run tacz_texture_init and let Auto UV assign each face its own rectangle.`,
    });
  }

  stats.cubes = Cube.all.length;
  if (Cube.all.length > 0 && Cube.all.length < TACZ_QUALITY.minCubes) {
    issues.push({
      code: "DETAIL_LOW",
      severity: "warning",
      message: `${Cube.all.length} cubes is LOD-grade detail (official high-poly guns use 273-761). Fine for a blockout; add detail before shipping.`,
    });
  }

  return {
    ok: issues.every(issue => issue.severity !== "error"),
    issues,
    stats,
  };
}
