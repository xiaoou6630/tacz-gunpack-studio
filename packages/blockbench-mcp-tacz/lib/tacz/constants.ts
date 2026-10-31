/**
 * TACZ pack constants: paths, runtime group names, and defaults.
 *
 * Verified against the 1.20.1 default gun pack
 * (`assets/tacz/custom/tacz_default_gun`): Bedrock Entity geometry, 128x128
 * UV texture, 64x64 slot icon, gun forward along -Z.
 *
 * @module
 */

/** Blockbench format that compiles to TACZ `geo_models/gun/*_geo.json`. */
export const TACZ_FORMAT_ID = "bedrock";

/** Default UV texture size used by the default pack's `ak47_geo`. */
export const TACZ_DEFAULT_TEXTURE_SIZE: readonly [number, number] = [128, 128];

/** Default container icon size used by `textures/gun/slot/*.png`. */
export const TACZ_DEFAULT_ICON_SIZE = 64;

/** Official HUD icon size (`textures/gun/hud/*.png`, 3:1). */
export const TACZ_DEFAULT_HUD_SIZE: readonly [number, number] = [384, 128];

/**
 * Official slot icon style, from the wiki (gun/display/03_hud):
 * isometric-right camera, **shading turned off** in Blockbench, muzzle to the
 * right, cropped square to 64x64.
 */
export const TACZ_SLOT_STYLE = {
  angle: "iso" as const,
  flipX: false,
  flat: true,
  style: "render" as const,
  size: TACZ_DEFAULT_ICON_SIZE,
};

/**
 * Official HUD icon style, from the wiki (gun/display/03_hud):
 * side view with the muzzle to the **left**, flat unshaded tones, 3:1 at
 * 384x128. The official ak47 HUD is dominated by a single #C1C1C1 tone.
 */
export const TACZ_HUD_STYLE = {
  angle: "side" as const,
  flipX: true,
  flat: true,
  style: "render" as const,
  size: TACZ_DEFAULT_HUD_SIZE,
};

/** Maximum texture edge accepted before the validator warns. */
export const TACZ_MAX_TEXTURE_SIZE = 1024;

/** Group names TACZ and its animations address directly. */
export const TACZ_REQUIRED_GROUPS = [
  "camera",
  "root",
  "positioning",
  "views",
  "AKM",
  "positioning2",
  "lefthand",
  "righthand",
] as const;

/** Locator/attachment groups that make a gun usable and refittable. */
export const TACZ_LOCATOR_GROUPS = [
  "fixed",
  "ground",
  "thirdperson_hand",
  "idle_view",
  "iron_view",
  "refit_view",
  "refit_muzzle_view",
  "refit_stock_view",
  "refit_scope_view",
  "refit_extended_mag_view",
  "refit_grip_view",
  "refit_laser_view",
  "stock_pos",
  "muzzle_pos",
  "grip_pos",
  "laser_pos",
  "shell",
  "scope_pos",
  "muzzle_flash",
  "lefthand_pos",
  "righthand_pos",
] as const;

/** Default material colors used by the automatic atlas pass. */
export const TACZ_MATERIALS: Record<string, string> = {
  steel: "#737b82",
  steel_dark: "#4d5459",
  polymer: "#2b2d2f",
  wood: "#8a5a32",
  rubber: "#1f2224",
  brass: "#b08d3f",
  glass: "#8fb6c9",
  accent: "#c2542e",
  warning: "#d7b33d",
};

/** Gun categories accepted by TACZ's index `type` field. */
export const TACZ_GUN_TYPES = [
  "pistol",
  "rifle",
  "smg",
  "shotgun",
  "sniper",
  "mg",
  "rpg",
] as const;

export type TaczGunType = (typeof TACZ_GUN_TYPES)[number];

/** Default profile values for each category; the modeler/data tools may override. */
export const TACZ_PROFILE_DEFAULTS: Record<TaczGunType, {
  ammo: string;
  ammo_amount: number;
  rpm: number;
  damage: number;
  fire_mode: string[];
  bolt: string;
  reload_empty: number;
  reload_tactical: number;
  cooldown_empty: number;
  cooldown_tactical: number;
  weight: number;
}> = {
  pistol: { ammo: "tacz:9mm", ammo_amount: 15, rpm: 300, damage: 5, fire_mode: ["semi"], bolt: "closed_bolt", reload_empty: 1.8, reload_tactical: 1.1, cooldown_empty: 2.2, cooldown_tactical: 1.5, weight: 1.1 },
  rifle: { ammo: "tacz:762x39", ammo_amount: 30, rpm: 600, damage: 9, fire_mode: ["auto", "semi"], bolt: "closed_bolt", reload_empty: 2.25, reload_tactical: 1.55, cooldown_empty: 2.6, cooldown_tactical: 2.0, weight: 3.5 },
  smg: { ammo: "tacz:9mm", ammo_amount: 30, rpm: 800, damage: 5, fire_mode: ["auto", "semi"], bolt: "closed_bolt", reload_empty: 1.9, reload_tactical: 1.3, cooldown_empty: 2.3, cooldown_tactical: 1.7, weight: 2.6 },
  shotgun: { ammo: "tacz:12g", ammo_amount: 6, rpm: 120, damage: 8, fire_mode: ["semi"], bolt: "manual_action", reload_empty: 2.4, reload_tactical: 2.4, cooldown_empty: 2.9, cooldown_tactical: 2.9, weight: 3.8 },
  sniper: { ammo: "tacz:308", ammo_amount: 5, rpm: 60, damage: 18, fire_mode: ["semi"], bolt: "manual_action", reload_empty: 2.8, reload_tactical: 2.4, cooldown_empty: 3.3, cooldown_tactical: 2.9, weight: 5.0 },
  mg: { ammo: "tacz:762x54", ammo_amount: 100, rpm: 700, damage: 10, fire_mode: ["auto"], bolt: "open_bolt", reload_empty: 4.5, reload_tactical: 3.8, cooldown_empty: 5.0, cooldown_tactical: 4.3, weight: 8.0 },
  rpg: { ammo: "tacz:rpg_rocket", ammo_amount: 1, rpm: 30, damage: 30, fire_mode: ["semi"], bolt: "manual_action", reload_empty: 3.5, reload_tactical: 3.5, cooldown_empty: 4.0, cooldown_tactical: 4.0, weight: 6.5 },
};

/** Files that must exist before a pack can be called valid. */
export const TACZ_PACK_FILES = {
  meta: "gunpack.meta.json",
  info: "assets/{ns}/gunpack_info.json",
  index: "data/{ns}/index/guns/{id}.json",
  data: "data/{ns}/data/guns/{id}_data.json",
  display: "assets/{ns}/display/guns/{id}_display.json",
  model: "assets/{ns}/geo_models/gun/{id}_geo.json",
  texture: "assets/{ns}/textures/gun/uv/{id}.png",
  icon: "assets/{ns}/textures/gun/slot/{id}.png",
  langZh: "assets/{ns}/lang/zh_cn.json",
  langEn: "assets/{ns}/lang/en_us.json",
} as const;

/** Directory prefixes excluded from a packaged gun pack. */
export const TACZ_PACKAGE_EXCLUDES = [
  "node_modules",
  ".git",
  "work",
  "refs",
  ".DS_Store",
] as const;

/** Skill name exposed by the plugin's shipped agent skill. */
export const TACZ_SKILL_NAME = "tacz-gun-modeling";
