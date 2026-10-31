/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createTool, type IToolSpec } from "@/lib/factories";
import { STATUS_EXPERIMENTAL, STATUS_STABLE } from "@/lib/constants";
import { createJsonResult } from "@/lib/tool-results";
import { imageContent } from "@/lib/util";
import { TACZ_DEFAULT_ICON_SIZE, TACZ_DEFAULT_TEXTURE_SIZE, TACZ_GUN_TYPES, TACZ_HUD_STYLE, TACZ_SLOT_STYLE, type TaczGunType } from "@/lib/tacz/constants";
import {
  createPack,
  listGuns,
  packagePack,
  readNamespace,
  readPackSummary,
  validatePack,
  writeGunDocuments,
} from "@/lib/tacz/pack";
import { compileGeometry, createGunProject, currentTexturePng, getGunProjectMeta, openGunProject } from "@/lib/tacz/model";
import {
  TACZ_ATTACHMENT_TYPES,
  createAmmoProject,
  createAttachmentProject,
  getItemProjectMeta,
  openAmmoProject,
  openAttachmentProject,
} from "@/lib/tacz/items";
import { initializeAtlas } from "@/lib/tacz/texture";
import { renderIcon } from "@/lib/tacz/icon";
import { validateCurrentModel } from "@/lib/tacz/validate";
import { TACZ_TEMPLATES, getTemplate } from "@/lib/tacz/templates";
import {
  exists,
  pathModule,
  readBytes,
  readJson,
  resolvePackDir,
  writeBytesAtomic,
  writeTextAtomic,
} from "@/lib/tacz/paths";

/** Pack-level actions. */
export const taczPackParameters = z.object({
  action: z.enum(["create", "info", "list_guns", "validate", "package"]).describe("Pack operation."),
  pack_dir: z.string().describe("Absolute path to the TACZ pack root.").optional(),
  namespace: z.string().regex(/^[a-z0-9_]+$/).describe("Resource namespace; required for create.").optional(),
  name: z.string().optional().describe("Pack display name."),
  description: z.string().optional().describe("Pack description."),
  author: z.string().optional().describe("Pack author."),
  version: z.string().optional().describe("Pack version, e.g. 1.0.0."),
  overwrite: z.boolean().optional().default(false).describe("Replace existing metadata or documents."),
  out: z.string().optional().describe("Absolute zip path for package; defaults to <pack_dir>/<pack-name>.zip. Blockbench's scoped fs keeps writes inside the pack root; move the zip out with a host file tool if needed."),
});

/** Gun-level actions. */
export const taczGunParameters = z.object({
  action: z.enum(["new", "open", "export"]).describe("Gun operation."),
  pack_dir: z.string().describe("Absolute path to the TACZ pack root."),
  gun_id: z.string().regex(/^[a-z0-9_]+$/).describe("Gun item ID (lower-case snake_case)."),
  type: z.enum(TACZ_GUN_TYPES).optional().describe("Gun category; required for new."),
  display_name: z.string().optional().describe("English display name."),
  profile: z.record(z.unknown()).optional().describe("Partial data profile; omitted fields use the category defaults."),
  texture_size: z.array(z.number().int().min(16).max(1024)).length(2).optional().describe("Texture [width, height]; defaults to 128x128."),
  namespace: z.string().regex(/^[a-z0-9_]+$/).optional().describe("Namespace; read from gunpack.meta.json when omitted."),
  overwrite: z.boolean().optional().default(false).describe("Replace existing model, texture, icon, and JSON files."),
  preserve_docs: z.boolean().optional().default(false).describe("Keep existing data/display/lang files; use when re-exporting geometry after the data-smith edited them."),
  art_only: z.boolean().optional().default(false).describe("Write only geometry, UV texture, and slot icon. Skip index/data/display/lang so the DSH side owns all data. Validation is skipped in this mode."),
});

/** Ammo and attachment project actions (art side). */
export const taczItemParameters = z.object({
  action: z.enum(["new", "open", "export"]).describe("Item operation."),
  kind: z.enum(["ammo", "attachment"]).describe("Item kind: ammo or attachment."),
  pack_dir: z.string().describe("Absolute path to the TACZ pack root."),
  item_id: z.string().regex(/^[a-z0-9_]+$/).describe("Ammo/attachment ID (lower-case snake_case)."),
  type: z.string().optional().describe(`Attachment type; one of ${TACZ_ATTACHMENT_TYPES.join(", ")}. Required for attachment new.`),
  display_name: z.string().optional().describe("English display name."),
  template: z.string().optional().describe("Override the item template kind, e.g. ammo_12g, scope, grip."),
  texture_size: z.array(z.number().int().min(16).max(1024)).length(2).optional().describe("Texture [width, height]; defaults to the template size."),
  namespace: z.string().regex(/^[a-z0-9_]+$/).optional().describe("Namespace; read from gunpack.meta.json when omitted."),
  overwrite: z.boolean().optional().default(false).describe("Replace existing geometry, texture and slot icon files."),
  art_only: z.boolean().optional().default(true).describe("Write geometry, UV texture and slot icon only; never write data/display/lang. The DSH side owns item documents."),
});

/** Atlas initialization. */
export const taczTextureParameters = z.object({
  size: z.array(z.number().int().min(16).max(1024)).length(2).optional().default([...TACZ_DEFAULT_TEXTURE_SIZE]).describe("Atlas [width, height]."),
  palette: z.record(z.string()).optional().describe("Material color overrides, e.g. { steel: '#7b8288' }."),
  name: z.string().optional().describe("Texture name; defaults to <project>_uv."),
});

/** Icon render and optional write. */
export const taczIconParameters = z.object({
  pack_dir: z.string().optional().describe("When set, write the icon into the pack's slot or hud folder."),
  gun_id: z.string().regex(/^[a-z0-9_]+$/).optional().describe("Gun ID used for the output file name."),
  namespace: z.string().regex(/^[a-z0-9_]+$/).optional().describe("Namespace; read from gunpack.meta.json when omitted."),
  target: z.enum(["slot", "hud"]).optional().default("slot").describe("slot writes textures/gun/slot/<id>.png (64x64, isometric-right camera, shading off, muzzle right); hud writes textures/gun/hud/<id>.png (384x128, side view, shading off, muzzle left)."),
  target_size: z.number().int().min(16).max(1024).optional().describe("Icon width; defaults to the target's official size (64 slot, 384 hud)."),
  target_height: z.number().int().min(16).max(1024).optional().describe("Icon height; defaults to the target's official size (64 slot, 128 hud)."),
  angle: z.enum(["side", "iso", "front"]).optional().describe("Camera preset; defaults to the target's official angle (iso slot, side hud)."),
  padding: z.number().min(0).max(0.25).optional().default(0.04).describe("Padding ratio."),
  flat: z.boolean().optional().default(true).describe("Disable viewport shading. The wiki requires shading off for BOTH slot and hud, so the default is true."),
  flip_x: z.boolean().optional().describe("Mirror horizontally. The official slot points the muzzle RIGHT (false); the official hud points it LEFT (true). Defaults per target."),
  style: z.enum(["render", "flat"]).optional().describe("render keeps the model's own colors (official slot and hud); flat paints one solid color and is NOT the official look. Defaults per target."),
  color: z.string().optional().describe("Solid fill for style=flat (#RRGGBB); ignored by style=render."),
  outline: z.string().optional().describe("1px outline for style=flat (#RRGGBB); ignored by style=render."),
  write: z.boolean().optional().default(true).describe("Write the PNG when pack_dir and gun_id are provided."),
});

/** Template listing. */
export const taczTemplateParameters = z.object({
  type: z.enum(TACZ_GUN_TYPES).optional().describe("Return one category instead of every template."),
});

/** Short guide text. */
export const taczGuideParameters = z.object({
  topic: z.enum(["workflow", "model", "texture", "data", "validate"]).optional().default("workflow").describe("Guide section."),
});

const PACK_TOOL: IToolSpec = {
  name: "tacz_pack",
  description:
    "Create, inspect, validate, or package a TACZ gun pack. Creates the standard assets/data skeleton, reads gunpack.meta.json, lists guns, runs cross-file validation, and writes a store-only zip. Paths are absolute local paths; the pack namespace must not be \"tacz\".",
  annotations: { title: "TACZ Pack", destructiveHint: true, openWorldHint: true },
  parameters: taczPackParameters,
  status: STATUS_EXPERIMENTAL,
};

const GUN_TOOL: IToolSpec = {
  name: "tacz_gun",
  description:
    "Create a Bedrock Entity gun project from a TACZ template, open an existing pack gun for editing, or export the current project into a TACZ pack. `new` builds the default AK-47 group tree (camera/root/AKM/positioning/views/locators) and a readable template; `export` writes the geometry, UV texture, 64x64 slot icon, index/data/display JSON, and language keys, then validates the pack. Set `preserve_docs=true` to keep existing data/display/lang on a geometry re-export.",
  annotations: { title: "TACZ Gun", destructiveHint: true, openWorldHint: true },
  parameters: taczGunParameters,
  status: STATUS_EXPERIMENTAL,
};

const MODEL_VALIDATE_TOOL: IToolSpec = {
  name: "tacz_model_validate",
  description:
    "Validate the live Blockbench project against TACZ conventions: Bedrock Entity format, required groups, locator groups, cube sizes, texture size, and UV bounds. Read-only.",
  annotations: { title: "Validate TACZ Model", readOnlyHint: true },
  parameters: z.object({ strict: z.boolean().optional().default(false).describe("Treat missing locator groups as errors.") }),
  status: STATUS_STABLE,
};

const TEXTURE_TOOL: IToolSpec = {
  name: "tacz_texture_init",
  description:
    "Create or resize the project's TACZ UV atlas, assign it to every cube, run Auto UV, and paint each face with a material color derived from the cube name. Use texture painting tools afterwards for detail.",
  annotations: { title: "Initialize TACZ Atlas", destructiveHint: true },
  parameters: taczTextureParameters,
  status: STATUS_EXPERIMENTAL,
};

const ICON_TOOL: IToolSpec = {
  name: "tacz_icon_render",
  description:
    "Render the current model from an offscreen camera, crop the transparent bounds, scale to a TACZ icon, and optionally write it into the pack. `target=\"slot\"` writes assets/<ns>/textures/gun/slot/<id>.png (64x64, shaded render, muzzle right); `target=\"hud\"` writes assets/<ns>/textures/gun/hud/<id>.png (384x128, flat solid-color silhouette, muzzle right). Returns an image content block plus metadata.",
  annotations: { title: "Render TACZ Icon", readOnlyHint: false },
  parameters: taczIconParameters,
  status: STATUS_EXPERIMENTAL,
};

const AMMO_TOOL: IToolSpec = {
  name: "tacz_ammo",
  description:
    "Create, open or export an ammo item's ART in a TACZ pack: geometry at assets/<ns>/geo_models/ammo/<id>_geo.json, UV atlas at textures/ammo/uv/<id>.png and slot icon at textures/ammo/slot/<id>.png. `new` builds a placeholder shell/round from the item template; `export` writes the geometry, UV and slot icon only (art_only). The ammo index/display/lang JSON belongs to the DeepSeek Harness side.",
  annotations: { title: "TACZ Ammo Art", destructiveHint: true, openWorldHint: true },
  parameters: taczItemParameters,
  status: STATUS_EXPERIMENTAL,
};

const ATTACHMENT_TOOL: IToolSpec = {
  name: "tacz_attachment",
  description:
    "Create, open or export an attachment's ART in a TACZ pack: geometry at assets/<ns>/geo_models/attachment/<id>_geo.json, UV atlas at textures/attachment/uv/<id>.png and slot icon at textures/attachment/slot/<id>.png. `new` builds a placeholder from the attachment template (scope, muzzle, stock, grip, laser, extended_mag); `export` writes geometry, UV and slot icon only (art_only). The attachment index/data/display/lang JSON belongs to the DeepSeek Harness side.",
  annotations: { title: "TACZ Attachment Art", destructiveHint: true, openWorldHint: true },
  parameters: taczItemParameters,
  status: STATUS_EXPERIMENTAL,
};

const TEMPLATE_TOOL: IToolSpec = {
  name: "tacz_template_list",
  description: "List the built-in TACZ gun categories, their dimensions, group/cube counts, and default profile values.",
  annotations: { title: "List TACZ Templates", readOnlyHint: true },
  parameters: taczTemplateParameters,
  status: STATUS_STABLE,
};

const GUIDE_TOOL: IToolSpec = {
  name: "tacz_guide",
  description: "Return a compact TACZ modeling, texture, data, or validation guide for the agent.",
  annotations: { title: "TACZ Guide", readOnlyHint: true },
  parameters: taczGuideParameters,
  status: STATUS_STABLE,
};

/** All TACZ tool docs, exported for the generated API documentation. */
export const taczToolDocs: IToolSpec[] = [
  PACK_TOOL,
  GUN_TOOL,
  AMMO_TOOL,
  ATTACHMENT_TOOL,
  MODEL_VALIDATE_TOOL,
  TEXTURE_TOOL,
  ICON_TOOL,
  TEMPLATE_TOOL,
  GUIDE_TOOL,
];

function requirePackDir(value: string | undefined): string {
  if (!value) throw new Error("tacz_pack: pack_dir is required (absolute path to the pack root).");
  return resolvePackDir(value, "tacz_pack");
}

function requireGunId(value: string | undefined): string {
  if (!value) throw new Error("tacz_gun: gun_id is required.");
  return value;
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("The rendered icon is not a data URL.");
  return new Uint8Array(Buffer.from(dataUrl.slice(comma + 1), "base64"));
}

function iconPath(packDir: string, namespace: string, gunId: string, target: "slot" | "hud" = "slot"): string {
  return pathModule().join(packDir, "assets", namespace, "textures", "gun", target, `${gunId}.png`);
}

/** Pack-relative paths for one ammo/attachment item's art. */
function itemArtPaths(kind: "ammo" | "attachment", namespace: string, itemId: string): {
  geometry: string;
  uv: string;
  slot: string;
} {
  return {
    geometry: `assets/${namespace}/geo_models/${kind}/${itemId}_geo.json`,
    uv: `assets/${namespace}/textures/${kind}/uv/${itemId}.png`,
    slot: `assets/${namespace}/textures/${kind}/slot/${itemId}.png`,
  };
}

/** Reads the item kind/type/namespace for export, falling back to the live project meta. */
function itemExportContext(kind: "ammo" | "attachment", args: { namespace?: string; type?: string; item_id: string }, packDir: string) {
  const meta = getItemProjectMeta();
  const sameItem = meta && meta.kind === kind && meta.item_id === args.item_id ? meta : undefined;
  const namespace = args.namespace ?? sameItem?.namespace ?? readNamespace(packDir);
  return { namespace, type: args.type ?? sameItem?.type, meta: sameItem };
}

/**
 * Runs `tacz_ammo` / `tacz_attachment`: new, open, or an art-only export.
 *
 * Export never writes data/display/lang: those belong to the DSH side.
 */
async function exportItemArt(
  args: { action: "new" | "open" | "export"; pack_dir: string; item_id: string; namespace?: string; type?: string; display_name?: string; template?: string; texture_size?: number[]; overwrite?: boolean; art_only?: boolean },
  kind: "ammo" | "attachment",
): Promise<CallToolResult> {
  const packDir = requirePackDir(args.pack_dir);
  const path = pathModule();
  if (args.action === "new") {
    let namespace = args.namespace;
    if (!namespace) {
      if (!exists(path.join(packDir, "gunpack.meta.json"), "tacz_item")) throw new Error("tacz_item new: namespace is required for a new pack.");
      namespace = readNamespace(packDir);
    }
    if (!exists(path.join(packDir, "gunpack.meta.json"), "tacz_item")) createPack({ packDir, namespace, overwrite: false });
    if (kind === "attachment" && !args.type) throw new Error("tacz_attachment new: type is required (scope, muzzle, stock, grip, laser, extended_mag).");
    const textureSize = args.texture_size as [number, number] | undefined;
    const result = kind === "ammo"
      ? createAmmoProject({ packDir, namespace, ammoId: args.item_id, displayName: args.display_name, textureSize, template: args.template })
      : createAttachmentProject({ packDir, namespace, attachmentId: args.item_id, type: args.type as string, displayName: args.display_name, textureSize, template: args.template });
    return createJsonResult({
      action: args.action,
      kind,
      ...result,
      next: `Shape the ${kind}, run tacz_texture_init, then tacz_${kind} action="export".`,
    });
  }
  const namespace = args.namespace ?? getItemProjectMeta()?.namespace ?? readNamespace(packDir);
  const paths = itemArtPaths(kind, namespace, args.item_id);
  const geometryFull = path.join(packDir, ...paths.geometry.split("/"));
  const uvFull = path.join(packDir, ...paths.uv.split("/"));
  if (args.action === "open") {
    if (!exists(geometryFull, "tacz_item")) throw new Error(`Missing geometry: ${geometryFull}`);
    const geometryText = new TextDecoder().decode(readBytes(geometryFull, "tacz_item"));
    const textureBytes = readBytes(uvFull, "tacz_item") ?? undefined;
    const result = kind === "ammo"
      ? openAmmoProject({ packDir, namespace, ammoId: args.item_id, displayName: args.display_name, geometryText, textureBytes })
      : openAttachmentProject({ packDir, namespace, attachmentId: args.item_id, type: args.type ?? "grip", displayName: args.display_name, geometryText, textureBytes });
    return createJsonResult({ action: args.action, kind, ...result, next: `Edit the project, then tacz_${kind} action="export".` });
  }
  const geometry = compileGeometry(args.item_id);
  writeTextAtomic(geometryFull, geometry.text, "tacz_item", args.overwrite);
  writeBytesAtomic(uvFull, currentTexturePng(), "tacz_item", args.overwrite);
  const icon = await renderIcon({ targetSize: TACZ_SLOT_STYLE.size, angle: TACZ_SLOT_STYLE.angle, flat: TACZ_SLOT_STYLE.flat, flipX: TACZ_SLOT_STYLE.flipX, style: TACZ_SLOT_STYLE.style });
  const slotFull = path.join(packDir, ...paths.slot.split("/"));
  writeBytesAtomic(slotFull, decodeDataUrl(icon.data_url), "tacz_item", args.overwrite);
  return createJsonResult({
    action: args.action,
    kind,
    pack_dir: packDir,
    namespace,
    item_id: args.item_id,
    art_only: args.art_only !== false,
    geometry_source: geometry.source,
    files: [paths.geometry, paths.uv, paths.slot],
    icon: { width: icon.width, height: icon.height, written_to: slotFull },
    data_note: "index/data/display/lang are written by the DSH side (tacz_item); this export never touches them.",
  });
}

const GUIDE_TEXT: Record<string, string> = {
  workflow: `# TACZ gun workflow
1. tacz_pack action="create" with a unique namespace.
2. tacz_gun action="new" with type and gun_id; the template creates the AK-47 group tree.
3. tacz_texture_init to create the 128x128 atlas and per-face UVs.
4. Sculpt with place_cube/modify_cube/group tools; keep the gun pointing -Z, Y up, X right.
5. Paint or refine the atlas with texture tools; render previews with capture_screenshot.
6. tacz_icon_render target="slot" (64x64, isometric right, shading off, muzzle right) and target="hud" (384x128 3:1, side view, shading off, muzzle left).
7. tacz_gun action="export" art_only=true writes geo_models/gun, textures/gun/uv, textures/gun/slot and textures/gun/hud but no data/display/lang; the DSH side owns those. Drop art_only only for a standalone one-shot pack.
8. tacz_pack action="validate", tacz_verify, then action="package".`,
  model: `# TACZ model conventions
- Format: Bedrock Entity; file lands in assets/<ns>/geo_models/gun/<id>_geo.json.
- Axes: +Y up, +X right, the muzzle points toward -Z.
- Groups that TACZ reads: camera, root, bone2, AKM, positioning (fixed/ground/thirdperson_hand), views (idle_view/iron_view/refit_view/refit_muzzle_view/refit_stock_view/refit_scope_view/refit_extended_mag_view/refit_grip_view/refit_laser_view), positioning2 (stock_pos/muzzle_pos/grip_pos/laser_pos/shell/scope_pos/muzzle_flash), lefthand/righthand and their *_pos locators.
- Missing refit_*_view groups make the attachment screen render the gun off-camera; missing *_pos groups make the attachment slots unusable.
- Keep a muzzle group near the barrel tip; the flash group sits one unit beyond it.
- Texture: 128x128 power-of-two atlas; each cube face has its own UV rectangle.`,
  texture: `# TACZ texture conventions
- One 128x128 RGBA PNG per gun at textures/gun/uv/<id>.png.
- Use per-face UVs, 1px bevel edges, and material colors: steel, steel_dark, polymer, wood, rubber, brass, glass, accent.
- Slot icon: 64x64, isometric-right camera, shading OFF, muzzle RIGHT. HUD icon: 384x128 3:1, side view, shading OFF, muzzle LEFT. Both icons are unshaded, per wiki gun/display/03_hud.
- The default pack uses 128x128 UV textures, 64x64 slot icons and 384x128 HUD icons.`,
  data: `# TACZ data fields
- index: name, display, data, type, item_type, sort.
- data: ammo, ammo_amount, bolt, rpm, bullet{life, damage, speed, gravity, friction, pierce}, reload{feed,cooldown}, draw_time, put_away_time, aim_time, sprint_time, fire_mode, recoil, inaccuracy, allow_attachment_types.
- display: model, texture, slot, hud, lod, third_person_animation, animation, state_machine, state_machine_param, muzzle_flash, shell, sounds, offhand_show, hotbar_show, transform.
- ammo index: name, display, stack_size, sort, tracer_color. attachment index: name, display, data, type, sort.
- Keep rpm <= 1200 and ammo_amount > 0.`,
  validate: `# Validation checklist
- gunpack.meta.json namespace matches assets/data directories.
- Every index.display/index.data reference resolves.
- Every display.model/texture/slot/hud file exists.
- Geometry has minecraft:geometry and format_version 1.12.0.
- Texture is a power of two <= 1024; slot icon is 64x64; HUD icon is 384x128.
- rpm 1..1200, ammo_amount > 0, reload and inaccuracy blocks present.
- Language key <ns>.gun.<id>.name exists in zh_cn.json.
- allow_attachment_types lists the categories the model has mount points for.`,
};

/** Registers the TACZ pack/model tools. Call once during plugin load. */
export function registerTaczTools(): void {
  createTool(PACK_TOOL.name, {
    ...PACK_TOOL,
    async execute(args) {
      const packDir = args.action === "create" || args.action === "package" ? requirePackDir(args.pack_dir) : args.pack_dir ? resolvePackDir(args.pack_dir, "tacz_pack") : undefined;
      if (args.action === "create") {
        if (!args.namespace) throw new Error("tacz_pack create: namespace is required.");
        return createJsonResult({ action: args.action, ...createPack({
          packDir: packDir as string,
          namespace: args.namespace,
          name: args.name,
          description: args.description,
          author: args.author,
          version: args.version,
          overwrite: args.overwrite,
        }) });
      }
      if (!packDir) throw new Error(`tacz_pack ${args.action}: pack_dir is required.`);
      if (args.action === "info") return createJsonResult({ action: args.action, ...readPackSummary(packDir) });
      if (args.action === "list_guns") return createJsonResult({ action: args.action, pack_dir: packDir, guns: listGuns(packDir) });
      if (args.action === "validate") return createJsonResult({ action: args.action, ...validatePack(packDir) });
      return createJsonResult({ action: args.action, ...packagePack(packDir, args.out) });
    },
  }, PACK_TOOL.status);

  createTool(GUN_TOOL.name, {
    ...GUN_TOOL,
    async execute(args) {
      const packDir = requirePackDir(args.pack_dir);
      const path = pathModule();
      if (args.action === "new") {
        if (!args.type) throw new Error("tacz_gun new: type is required.");
        let namespace = args.namespace;
        if (!namespace) {
          if (!exists(path.join(packDir, "gunpack.meta.json"), "tacz_gun")) throw new Error("tacz_gun new: namespace is required for a new pack.");
          namespace = readNamespace(packDir);
        }
        if (!exists(path.join(packDir, "gunpack.meta.json"), "tacz_gun")) {
          createPack({ packDir, namespace, overwrite: false });
        }
        const result = createGunProject({
          packDir,
          namespace,
          gunId: args.gun_id,
          type: args.type,
          displayName: args.display_name,
          textureSize: args.texture_size as [number, number] | undefined,
          profile: (args.profile ?? {}) as Record<string, unknown>,
          overwrite: args.overwrite,
        });
        return createJsonResult({
          action: args.action,
          ...result,
          next: "Run tacz_texture_init, sculpt with the model tools, then tacz_gun action=\"export\".",
        });
      }
      if (args.action === "open") {
        const namespace = args.namespace ?? readNamespace(packDir);
        const geometryPath = path.join(packDir, "assets", namespace, "geo_models", "gun", `${args.gun_id}_geo.json`);
        const texturePath = path.join(packDir, "assets", namespace, "textures", "gun", "uv", `${args.gun_id}.png`);
        if (!exists(geometryPath, "tacz_gun")) throw new Error(`Missing geometry: ${geometryPath}`);
        const index = readJson(path.join(packDir, "data", namespace, "index", "guns", `${args.gun_id}.json`), "tacz_gun") as { type?: unknown };
        const type = (typeof index.type === "string" ? index.type : args.type ?? "rifle") as TaczGunType;
        // TACZ keeps animations beside the model; without reading them a reopened
        // project shows an empty Animate tab even though the pack has clips.
        const animationPath = path.join(packDir, "assets", namespace, "animations", `${args.gun_id}.animation.json`);
        const animationText = exists(animationPath, "tacz_gun")
          ? new TextDecoder().decode(readBytes(animationPath, "tacz_gun"))
          : undefined;
        const result = openGunProject({
          packDir,
          namespace,
          gunId: args.gun_id,
          type,
          displayName: args.display_name,
          geometryText: new TextDecoder().decode(readBytes(geometryPath, "tacz_gun")),
          textureBytes: readBytes(texturePath, "tacz_gun") ?? undefined,
          animationText,
        });
        return createJsonResult({ action: args.action, ...result, next: "Edit the project, then tacz_gun action=\"export\"." });
      }
      const meta = getGunProjectMeta();
      const type = args.type ?? meta?.type;
      if (!type) throw new Error("tacz_gun export: type is required when the TACZ project metadata is not available (for example after a plugin reload).");
      const namespace = args.namespace ?? meta?.namespace ?? readNamespace(packDir);
      const geometry = compileGeometry(args.gun_id);
      const uvPath = path.join(packDir, "assets", namespace, "textures", "gun", "uv", `${args.gun_id}.png`);
      const geometryPath = path.join(packDir, "assets", namespace, "geo_models", "gun", `${args.gun_id}_geo.json`);
      writeTextAtomic(geometryPath, geometry.text, "tacz_gun", args.overwrite);
      writeBytesAtomic(uvPath, currentTexturePng(), "tacz_gun", args.overwrite);
      const icon = await renderIcon({ targetSize: TACZ_SLOT_STYLE.size, angle: TACZ_SLOT_STYLE.angle, flat: TACZ_SLOT_STYLE.flat, flipX: TACZ_SLOT_STYLE.flipX, style: TACZ_SLOT_STYLE.style });
      const iconFile = iconPath(packDir, namespace, args.gun_id, "slot");
      writeBytesAtomic(iconFile, decodeDataUrl(icon.data_url), "tacz_gun", args.overwrite);
      const hud = await renderIcon({ targetSize: TACZ_HUD_STYLE.size[0], targetHeight: TACZ_HUD_STYLE.size[1], angle: TACZ_HUD_STYLE.angle, flat: TACZ_HUD_STYLE.flat, flipX: TACZ_HUD_STYLE.flipX, style: TACZ_HUD_STYLE.style });
      const hudFile = iconPath(packDir, namespace, args.gun_id, "hud");
      writeBytesAtomic(hudFile, decodeDataUrl(hud.data_url), "tacz_gun", args.overwrite);
      const docs = args.art_only
        ? { namespace, files: [], missing: [] }
        : writeGunDocuments({
            packDir,
            namespace,
            gunId: args.gun_id,
            type,
            displayName: args.display_name ?? meta?.display_name,
            profile: (args.profile ?? meta?.profile ?? {}) as Record<string, unknown>,
            overwrite: args.overwrite,
            preserveDocs: args.preserve_docs,
          });
      const validation = args.art_only ? null : validatePack(packDir);
      return createJsonResult({
        action: args.action,
        pack_dir: packDir,
        namespace,
        gun_id: args.gun_id,
        art_only: Boolean(args.art_only),
        geometry_source: geometry.source,
        files: [...docs.files, `assets/${namespace}/geo_models/gun/${args.gun_id}_geo.json`, `assets/${namespace}/textures/gun/uv/${args.gun_id}.png`, `assets/${namespace}/textures/gun/slot/${args.gun_id}.png`, `assets/${namespace}/textures/gun/hud/${args.gun_id}.png`],
        missing: docs.missing,
        validation,
        icon: { width: icon.width, height: icon.height, written_to: iconFile },
        hud: { width: hud.width, height: hud.height, written_to: hudFile },
      });
    },
  }, GUN_TOOL.status);

  createTool(MODEL_VALIDATE_TOOL.name, {
    ...MODEL_VALIDATE_TOOL,
    async execute({ strict }) {
      return createJsonResult(validateCurrentModel({ strict }) as unknown as Record<string, unknown>);
    },
  }, MODEL_VALIDATE_TOOL.status);

  createTool(TEXTURE_TOOL.name, {
    ...TEXTURE_TOOL,
    async execute({ size, palette, name }) {
      return createJsonResult(initializeAtlas({ size: size as [number, number], palette, name }) as unknown as Record<string, unknown>);
    },
  }, TEXTURE_TOOL.status);

  createTool(ICON_TOOL.name, {
    ...ICON_TOOL,
    async execute(args, context): Promise<CallToolResult> {
      const target = args.target ?? "slot";
      const style = args.style ?? TACZ_SLOT_STYLE.style;
      const resolved = target === "hud"
        ? { ...TACZ_HUD_STYLE, style: args.style ?? TACZ_HUD_STYLE.style }
        : { ...TACZ_SLOT_STYLE, style };
      const icon = await renderIcon({
        targetSize: args.target_size ?? resolved.size[0],
        targetHeight: args.target_height ?? (target === "hud" ? TACZ_HUD_STYLE.size[1] : undefined),
        angle: args.angle ?? resolved.angle,
        padding: args.padding,
        owner: context?.sessionId,
        flat: args.flat ?? resolved.flat,
        flipX: args.flip_x ?? resolved.flipX,
        style: resolved.style,
        color: args.color,
        outline: args.outline,
      });
      let written: string | null = null;
      if (args.write && args.pack_dir && args.gun_id) {
        const packDir = resolvePackDir(args.pack_dir, "tacz_icon_render");
        const namespace = args.namespace ?? readNamespace(packDir);
        written = iconPath(packDir, namespace, args.gun_id, target);
        writeBytesAtomic(written, decodeDataUrl(icon.data_url), "tacz_icon_render", true);
      }
      const metadata = { target, width: icon.width, height: icon.height, written_to: written, view: icon.view };
      return {
        content: [...imageContent(icon.data_url).content, { type: "text", text: JSON.stringify(metadata, null, 2) }],
        structuredContent: metadata,
      };
    },
  }, ICON_TOOL.status);

  createTool(AMMO_TOOL.name, {
    ...AMMO_TOOL,
    async execute(args) {
      return exportItemArt(args, "ammo");
    },
  }, AMMO_TOOL.status);

  createTool(ATTACHMENT_TOOL.name, {
    ...ATTACHMENT_TOOL,
    async execute(args) {
      return exportItemArt(args, "attachment");
    },
  }, ATTACHMENT_TOOL.status);

  createTool(TEMPLATE_TOOL.name, {
    ...TEMPLATE_TOOL,
    async execute({ type }) {
      const entries = type ? [getTemplate(type)] : Object.values(TACZ_TEMPLATES);
      return createJsonResult({
        templates: entries.map(template => ({
          type: template.type,
          label: template.label,
          description: template.description,
          texture_size: template.texture_size,
          groups: template.groups.length,
          cubes: template.cubes.length,
          profile: template.profile,
        })),
      });
    },
  }, TEMPLATE_TOOL.status);

  createTool(GUIDE_TOOL.name, {
    ...GUIDE_TOOL,
    async execute({ topic }) {
      return GUIDE_TEXT[topic ?? "workflow"] ?? GUIDE_TEXT.workflow;
    },
  }, GUIDE_TOOL.status);
}
