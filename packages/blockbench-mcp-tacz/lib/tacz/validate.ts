/**
 * Runtime checks on the live Blockbench project before a TACZ export.
 *
 * @module
 */
/// <reference types="blockbench-types" />
import { TACZ_FORMAT_ID, TACZ_LOCATOR_GROUPS, TACZ_REQUIRED_GROUPS } from "@/lib/tacz/constants";

/** One model validation issue. */
export interface IModelIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
}

/** Model validation result. */
export interface IModelValidationResult {
  ok: boolean;
  format: string;
  groups: number;
  cubes: number;
  texture: { name: string; width: number; height: number } | null;
  errors: IModelIssue[];
  warnings: IModelIssue[];
}

/** Collects missing required groups. */
function missingGroups(required: readonly string[]): string[] {
  const names = new Set(Group.all.map(group => group.name));
  return required.filter(name => !names.has(name));
}

/**
 * Validates the live project for TACZ export.
 *
 * @param options - When `strict`, missing locator groups become errors.
 */
export function validateCurrentModel(options: { strict?: boolean } = {}): IModelValidationResult {
  if (!Project) throw new Error("No project is open.");
  const errors: IModelIssue[] = [];
  const warnings: IModelIssue[] = [];
  const format = Format?.id ?? "unknown";
  if (format !== TACZ_FORMAT_ID) errors.push({ code: "FORMAT", severity: "error", message: `Expected project format "${TACZ_FORMAT_ID}", got "${format}".` });
  const missing = missingGroups(TACZ_REQUIRED_GROUPS);
  if (missing.length) errors.push({ code: "GROUPS_REQUIRED", severity: "error", message: `Missing required groups: ${missing.join(", ")}.` });
  const missingLocators = missingGroups(TACZ_LOCATOR_GROUPS);
  if (missingLocators.length) {
    const issue: IModelIssue = { code: "GROUPS_LOCATOR", severity: options.strict ? "error" : "warning", message: `Missing locator groups: ${missingLocators.join(", ")}.` };
    if (options.strict) errors.push(issue); else warnings.push(issue);
  }
  if (Cube.all.length === 0) errors.push({ code: "NO_CUBES", severity: "error", message: "The project has no cubes." });
  if (Cube.all.length > 300) warnings.push({ code: "CUBE_COUNT", severity: "warning", message: `${Cube.all.length} cubes may exceed TACZ's practical render budget.` });
  for (const cube of Cube.all) {
    const size = cube.to.map((value, index) => Math.abs(value - cube.from[index]));
    if (size.some(value => !Number.isFinite(value) || value <= 0)) {
      errors.push({ code: "CUBE_SIZE", severity: "error", message: `Cube "${cube.name}" has a non-positive or invalid size.` });
    }
  }
  const texture = Texture.all[0] ?? null;
  if (!texture) {
    errors.push({ code: "NO_TEXTURE", severity: "error", message: "The project has no texture. Run tacz_texture_init." });
  } else {
    if (texture.width <= 0 || texture.height <= 0) errors.push({ code: "TEXTURE_SIZE", severity: "error", message: "The project texture has no pixels." });
    if (texture.width > 1024 || texture.height > 1024) errors.push({ code: "TEXTURE_TOO_LARGE", severity: "error", message: `Texture ${texture.width}x${texture.height} exceeds 1024px.` });
    if ((texture.width & (texture.width - 1)) !== 0 || (texture.height & (texture.height - 1)) !== 0) warnings.push({ code: "TEXTURE_POT", severity: "warning", message: `Texture ${texture.width}x${texture.height} is not a power of two.` });
    for (const cube of Cube.all) {
      for (const [faceName, face] of Object.entries(cube.faces)) {
        const uv = face.uv as unknown as readonly number[] | undefined;
        if (!uv || uv.length !== 4) continue;
        const [u1, v1, u2, v2] = uv;
        if ([u1, v1, u2, v2].some(value => !Number.isFinite(value)) || Math.min(u1, u2) < 0 || Math.min(v1, v2) < 0 || Math.max(u1, u2) > texture.width || Math.max(v1, v2) > texture.height) {
          warnings.push({ code: "UV_BOUNDS", severity: "warning", message: `Cube "${cube.name}" face "${faceName}" UV is outside the ${texture.width}x${texture.height} texture.` });
        }
      }
    }
  }
  return { ok: errors.length === 0, format, groups: Group.all.length, cubes: Cube.all.length, texture: texture ? { name: texture.name, width: texture.width, height: texture.height } : null, errors, warnings };
}
