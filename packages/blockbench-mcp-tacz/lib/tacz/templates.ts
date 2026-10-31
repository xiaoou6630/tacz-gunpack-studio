/**
 * Built-in TACZ gun templates. Coordinates are Blockbench pixels (16 = one
 * block), the gun points along -Z, and every template carries the groups the
 * default AK-47 model uses for camera, positioning, views, and locators.
 *
 * @module
 */
import {
  TACZ_DEFAULT_TEXTURE_SIZE,
  TACZ_PROFILE_DEFAULTS,
  type TaczGunType,
} from "@/lib/tacz/constants";

/** One cube in a template, including the group it belongs to. */
export interface ITaczTemplateCube {
  name: string;
  group: string;
  from: [number, number, number];
  to: [number, number, number];
  material: string;
  /** Optional pivot override; defaults to [0, 0, 0]. */
  origin?: [number, number, number];
}

/** One named group in a template. `parent` refers to another template group. */
export interface ITaczTemplateGroup {
  name: string;
  parent?: string;
  pivot: [number, number, number];
  rotation?: [number, number, number];
}

/** Public metadata and editable defaults for one gun category. */
export interface ITaczGunTemplate {
  type: TaczGunType;
  label: string;
  description: string;
  texture_size: [number, number];
  groups: ITaczTemplateGroup[];
  cubes: ITaczTemplateCube[];
  profile: {
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
  };
}

/** Groups shared by every category; coordinates come from the default AK-47. */
const COMMON_GROUPS: ITaczTemplateGroup[] = [
  { name: "camera", pivot: [2.5, 12, 13.75] },
  { name: "root", pivot: [0, 8.2, 6.5] },
  { name: "bone2", parent: "root", pivot: [0, 8, 2] },
  { name: "AKM", parent: "bone2", pivot: [0, 0, 0] },
  { name: "positioning", pivot: [0, 0, 0] },
  { name: "fixed", parent: "positioning", pivot: [1.35, 8.275, -0.05] },
  { name: "ground", parent: "positioning", pivot: [0, -4, 2] },
  { name: "thirdperson_hand", parent: "positioning", pivot: [0, 6.825, 5.425] },
  { name: "views", pivot: [2, 12, 12] },
  { name: "idle_view", parent: "views", pivot: [2.5, 12, 13.75] },
  { name: "iron_view", parent: "views", pivot: [0, 10.8875, 10.15625] },
  { name: "refit_view", parent: "views", pivot: [20, 9, -2], rotation: [0, 89.9, 0] },
  { name: "refit_muzzle_view", parent: "views", pivot: [12, 9, -26], rotation: [0, 120, 0] },
  { name: "refit_stock_view", parent: "views", pivot: [12, 9, 12], rotation: [0, 90, 0] },
  { name: "refit_scope_view", parent: "views", pivot: [10, 12, 9], rotation: [0, 50, 0] },
  { name: "refit_extended_mag_view", parent: "views", pivot: [12, 2.275, -25], rotation: [170, 60, 180] },
  { name: "positioning2", parent: "AKM", pivot: [0, 0, 0] },
  { name: "stock_pos", parent: "positioning2", pivot: [0, 8.65, 13.425] },
  { name: "muzzle_pos", parent: "positioning2", pivot: [0, 8.55, -25] },
  { name: "shell", parent: "positioning2", pivot: [-0.5, 9.15, 0.225] },
  { name: "scope_pos", parent: "positioning2", pivot: [0, 11.325, 5.275] },
  { name: "muzzle_flash", parent: "positioning2", pivot: [0, 8.55, -26] },
  { name: "lefthand", parent: "bone2", pivot: [-6, 19, 0] },
  { name: "lefthand_pos", parent: "lefthand", pivot: [0, 8, 0] },
  { name: "righthand", parent: "bone2", pivot: [6, 19, 0] },
  { name: "righthand_pos", parent: "righthand", pivot: [0, 8, 0] },
];

/** Builds a template from a cube list plus the shared group tree. */
function template(
  type: TaczGunType,
  label: string,
  description: string,
  cubes: ITaczTemplateCube[],
  profileOverrides: Partial<ITaczGunTemplate["profile"]> = {},
): ITaczGunTemplate {
  return {
    type,
    label,
    description,
    texture_size: [...TACZ_DEFAULT_TEXTURE_SIZE] as [number, number],
    groups: COMMON_GROUPS,
    cubes,
    profile: { ...TACZ_PROFILE_DEFAULTS[type], ...profileOverrides },
  };
}

const RIFLE_CUBES: ITaczTemplateCube[] = [
  { name: "receiver", group: "AKM", from: [-2, 6, -10], to: [2, 10, 12], material: "steel_dark" },
  { name: "barrel", group: "AKM", from: [-1, 7, -24], to: [1, 9, -10], material: "steel" },
  { name: "gas_tube", group: "AKM", from: [-1, 8, -20], to: [1, 9, -8], material: "steel_dark" },
  { name: "handguard", group: "AKM", from: [-2, 6, -18], to: [2, 9, -8], material: "wood" },
  { name: "stock", group: "AKM", from: [-1.5, 6, 12], to: [1.5, 10, 20], material: "wood" },
  { name: "grip", group: "AKM", from: [-1, 2, 6], to: [1, 6, 9], material: "polymer" },
  { name: "magazine", group: "AKM", from: [-1.5, 0, 0], to: [1.5, 6, 4], material: "steel_dark" },
  { name: "trigger_guard", group: "AKM", from: [-1, 5, 4], to: [1, 6, 7], material: "steel" },
  { name: "sight_rear", group: "AKM", from: [-1, 10, 2], to: [1, 12, 4], material: "steel" },
  { name: "sight_front", group: "AKM", from: [-1, 10, -6], to: [1, 12, -5], material: "steel" },
  { name: "muzzle", group: "AKM", from: [-1, 7, -25], to: [1, 9, -24], material: "steel_dark" },
  { name: "bolt", group: "AKM", from: [-2.1, 8, -2], to: [-1.6, 9, 1], material: "steel" },
];

export const TACZ_TEMPLATES: Record<TaczGunType, ITaczGunTemplate> = {
  rifle: template("rifle", "Rifle", "Magazine-fed assault rifle.", RIFLE_CUBES, {}),
  pistol: template("pistol", "Pistol", "Compact semi-automatic handgun.", [
    { name: "slide", group: "AKM", from: [-1.4, 8, -6], to: [1.4, 11, 1], material: "steel" },
    { name: "frame", group: "AKM", from: [-1.2, 5, -5], to: [1.2, 8, 2], material: "polymer" },
    { name: "barrel", group: "AKM", from: [-0.7, 8.5, -9], to: [0.7, 10, -6], material: "steel_dark" },
    { name: "grip", group: "AKM", from: [-1.1, 1, 1], to: [1.1, 6, 4], material: "polymer" },
    { name: "magazine", group: "AKM", from: [-0.9, 0, 0.5], to: [0.9, 5, 2.5], material: "steel_dark" },
    { name: "trigger_guard", group: "AKM", from: [-0.8, 4, -1], to: [0.8, 5, 2], material: "steel" },
    { name: "sight_rear", group: "AKM", from: [-0.8, 11, -1], to: [0.8, 12, 0], material: "steel" },
    { name: "sight_front", group: "AKM", from: [-0.6, 11, -5.5], to: [0.6, 12, -4.5], material: "steel" },
    { name: "muzzle", group: "AKM", from: [-0.6, 8.5, -10], to: [0.6, 10, -9], material: "steel_dark" },
  ], { rpm: 300, damage: 5 }),

  smg: template("smg", "SMG", "Compact automatic submachine gun.", [
    { name: "receiver", group: "AKM", from: [-1.8, 6, -8], to: [1.8, 10, 8], material: "steel_dark" },
    { name: "barrel", group: "AKM", from: [-1, 7, -18], to: [1, 9, -8], material: "steel" },
    { name: "handguard", group: "AKM", from: [-1.8, 6, -14], to: [1.8, 9, -8], material: "polymer" },
    { name: "stock", group: "AKM", from: [-1.4, 6, 8], to: [1.4, 10, 15], material: "polymer" },
    { name: "grip", group: "AKM", from: [-1, 2, 4], to: [1, 6, 7], material: "polymer" },
    { name: "magazine", group: "AKM", from: [-1.2, 0, 0], to: [1.2, 6, 3], material: "steel_dark" },
    { name: "trigger_guard", group: "AKM", from: [-1, 5, 2], to: [1, 6, 5], material: "steel" },
    { name: "sight_rear", group: "AKM", from: [-1, 10, 0], to: [1, 11.5, 2], material: "steel" },
    { name: "sight_front", group: "AKM", from: [-1, 10, -6], to: [1, 11.5, -5], material: "steel" },
    { name: "muzzle", group: "AKM", from: [-0.9, 7, -19], to: [0.9, 9, -18], material: "steel_dark" },
  ], { ammo_amount: 30, rpm: 800 }),

  shotgun: template("shotgun", "Shotgun", "Manual-action tube-fed shotgun.", [
    { name: "receiver", group: "AKM", from: [-2, 6, -10], to: [2, 10, 10], material: "steel_dark" },
    { name: "barrel", group: "AKM", from: [-1.2, 7, -30], to: [1.2, 9, -10], material: "steel" },
    { name: "tube", group: "AKM", from: [-1, 6, -28], to: [1, 7, -10], material: "steel_dark" },
    { name: "stock", group: "AKM", from: [-1.5, 6, 10], to: [1.5, 10, 20], material: "wood" },
    { name: "grip", group: "AKM", from: [-1, 2, 5], to: [1, 6, 8], material: "wood" },
    { name: "pump", group: "AKM", from: [-2, 5.5, -22], to: [2, 8, -16], material: "polymer" },
    { name: "trigger_guard", group: "AKM", from: [-1, 5, 3], to: [1, 6, 6], material: "steel" },
    { name: "sight_rear", group: "AKM", from: [-1, 10, 1], to: [1, 11.5, 3], material: "steel" },
    { name: "sight_front", group: "AKM", from: [-0.7, 10, -8], to: [0.7, 11.5, -7], material: "steel" },
    { name: "muzzle", group: "AKM", from: [-1.1, 7, -31], to: [1.1, 9, -30], material: "steel_dark" },
  ], { ammo_amount: 6, rpm: 120, damage: 8 }),

  sniper: template("sniper", "Sniper Rifle", "Bolt-action precision rifle with optic.", [
    { name: "receiver", group: "AKM", from: [-2, 6, -12], to: [2, 10, 14], material: "steel_dark" },
    { name: "barrel", group: "AKM", from: [-1, 7, -34], to: [1, 9, -12], material: "steel" },
    { name: "stock", group: "AKM", from: [-1.6, 6, 14], to: [1.6, 10, 24], material: "polymer" },
    { name: "grip", group: "AKM", from: [-1, 2, 7], to: [1, 6, 10], material: "polymer" },
    { name: "magazine", group: "AKM", from: [-1.2, 1, 1], to: [1.2, 6, 5], material: "steel_dark" },
    { name: "scope", group: "AKM", from: [-1.4, 11, -2], to: [1.4, 13, 6], material: "polymer" },
    { name: "scope_glass", group: "AKM", from: [-1, 11.4, -2.2], to: [1, 12.6, -1.8], material: "glass" },
    { name: "trigger_guard", group: "AKM", from: [-1, 5, 4], to: [1, 6, 7], material: "steel" },
    { name: "bipod", group: "AKM", from: [-2, 4, -14], to: [-1.6, 7, -12], material: "steel_dark" },
    { name: "muzzle", group: "AKM", from: [-1, 7, -35], to: [1, 9, -34], material: "steel_dark" },
  ], { ammo_amount: 5, rpm: 60, damage: 18 }),

  mg: template("mg", "Machine Gun", "Belt-fed support machine gun.", [
    { name: "receiver", group: "AKM", from: [-2.5, 5, -12], to: [2.5, 11, 14], material: "steel_dark" },
    { name: "barrel", group: "AKM", from: [-1.4, 6, -30], to: [1.4, 10, -12], material: "steel" },
    { name: "heat_shield", group: "AKM", from: [-1.8, 6, -28], to: [1.8, 10, -18], material: "steel_dark" },
    { name: "stock", group: "AKM", from: [-2, 5, 14], to: [2, 10, 24], material: "polymer" },
    { name: "grip", group: "AKM", from: [-1.2, 1, 8], to: [1.2, 5, 11], material: "polymer" },
    { name: "ammo_box", group: "AKM", from: [-4, 2, -4], to: [-2.5, 9, 6], material: "steel_dark" },
    { name: "trigger_guard", group: "AKM", from: [-1.2, 4, 5], to: [1.2, 5, 8], material: "steel" },
    { name: "sight_rear", group: "AKM", from: [-1, 11, 2], to: [1, 12.5, 4], material: "steel" },
    { name: "sight_front", group: "AKM", from: [-0.8, 10, -10], to: [0.8, 12, -9], material: "steel" },
    { name: "muzzle", group: "AKM", from: [-1.2, 6, -31], to: [1.2, 10, -30], material: "steel_dark" },
  ], { ammo_amount: 100, rpm: 700, damage: 10 }),

  rpg: template("rpg", "Rocket Launcher", "Shoulder-fired rocket launcher.", [
    { name: "tube", group: "AKM", from: [-2, 6, -26], to: [2, 10, 22], material: "steel_dark" },
    { name: "muzzle_cone", group: "AKM", from: [-3, 5, -30], to: [3, 11, -26], material: "steel" },
    { name: "rear_cone", group: "AKM", from: [-3, 5, 22], to: [3, 11, 26], material: "steel" },
    { name: "grip", group: "AKM", from: [-1, 2, 6], to: [1, 6, 9], material: "polymer" },
    { name: "trigger_guard", group: "AKM", from: [-1, 5, 3], to: [1, 6, 6], material: "steel" },
    { name: "optic", group: "AKM", from: [-1.5, 10, -6], to: [1.5, 12.5, 2], material: "polymer" },
    { name: "warhead", group: "AKM", from: [-2, 6, -28], to: [2, 10, -24], material: "accent" },
    { name: "muzzle", group: "AKM", from: [-1.5, 7, -31], to: [1.5, 9, -30], material: "steel_dark" },
  ], { ammo_amount: 1, rpm: 30, damage: 30 }),
};

/** Returns one template, or throws with the accepted category names. */
export function getTemplate(type: string): ITaczGunTemplate {
  const templateValue = (TACZ_TEMPLATES as Record<string, ITaczGunTemplate | undefined>)[type];
  if (!templateValue) {
    throw new Error(`Unknown gun type "${type}". Accepted: ${Object.keys(TACZ_TEMPLATES).join(", ")}.`);
  }
  return templateValue;
}

/** One ammo or attachment template: small, readable placeholder geometry. */
export interface ITaczItemTemplate {
  kind: string;
  label: string;
  description: string;
  texture_size: [number, number];
  groups: ITaczTemplateGroup[];
  cubes: ITaczTemplateCube[];
}

/**
 * Positioning groups an ammo stack model needs (wiki `ammo/display`):
 * `fixed` (item frame), `thirdperson_hand` (held in third person) and
 * `ground` (dropped item). Their content is never rendered.
 */
const AMMO_POSITIONING_GROUPS: ITaczTemplateGroup[] = [
  { name: "root", pivot: [0, 0, 0] },
  { name: "positioning", pivot: [0, 0, 0] },
  { name: "fixed", parent: "positioning", pivot: [0, 1, 0] },
  { name: "thirdperson_hand", parent: "positioning", pivot: [0, 0.5, 1] },
  { name: "ground", parent: "positioning", pivot: [0, -1, 0] },
];

/**
 * Scope groups from wiki `attachment/attachment`: `scope_body` is the shell,
 * `ocular_ring` the eyepiece frame, `ocular` the lens (cull every face except
 * south), `division` the reticle plane and `scope_view` the aiming camera.
 */
const SCOPE_GROUPS: ITaczTemplateGroup[] = [
  { name: "root", pivot: [0, 0, 0] },
  { name: "scope_body", pivot: [0, 2, 0] },
  { name: "ocular_ring", parent: "scope_body", pivot: [0, 2, 5] },
  { name: "ocular", parent: "scope_body", pivot: [0, 2, 4.8] },
  { name: "division", parent: "scope_body", pivot: [0, 2, 4.5] },
  { name: "scope_view", parent: "scope_body", pivot: [0, 2, 6] },
];

/**
 * Builds an item template. Items hang off one `root` bone at the origin, use a
 * small atlas, and keep few cubes: they are placeholder silhouettes the modeler
 * replaces, not finished models.
 */
function itemTemplate(
  kind: string,
  label: string,
  description: string,
  textureSize: [number, number],
  cubes: ITaczTemplateCube[],
  groups: ITaczTemplateGroup[] = [{ name: "root", pivot: [0, 0, 0] }],
): ITaczItemTemplate {
  return {
    kind,
    label,
    description,
    texture_size: [...textureSize] as [number, number],
    groups,
    cubes,
  };
}

/**
 * Ammo and attachment templates. Every placeholder stays under 30 cubes, and
 * the scope keeps a tube plus two lens faces: TACZ optics read the lens planes
 * for the sight picture.
 */
export const TACZ_ITEM_TEMPLATES: Record<string, ITaczItemTemplate> = {
  ammo_12g: itemTemplate("ammo_12g", "12 Gauge Shell", "Shotgun shell placeholder: red hull, brass head, primer.", [32, 32], [
    { name: "hull", group: "root", from: [-1, 0, -2.5], to: [1, 2, 2.5], material: "accent" },
    { name: "brass_head", group: "root", from: [-1, 0, 2.5], to: [1, 2, 4], material: "brass" },
    { name: "primer", group: "root", from: [-0.4, 0, 4], to: [0.4, 0.5, 4.2], material: "steel_dark" },
  ], AMMO_POSITIONING_GROUPS),
  ammo_9mm: itemTemplate("ammo_9mm", "9mm Round", "Pistol round placeholder: brass case, round nose, primer.", [32, 32], [
    { name: "case", group: "root", from: [-0.5, 0, -1], to: [0.5, 1, 1], material: "brass" },
    { name: "bullet", group: "root", from: [-0.4, 0, -2], to: [0.4, 1, -1], material: "steel" },
    { name: "primer", group: "root", from: [-0.25, 0, 1], to: [0.25, 0.3, 1.2], material: "steel_dark" },
  ], AMMO_POSITIONING_GROUPS),
  ammo_762: itemTemplate("ammo_762", "7.62x39 Round", "Rifle round placeholder: bottleneck case and pointed bullet.", [32, 32], [
    { name: "case", group: "root", from: [-0.6, 0, -1.5], to: [0.6, 1.2, 2.5], material: "brass" },
    { name: "neck", group: "root", from: [-0.45, 0.2, 2.5], to: [0.45, 1, 3], material: "brass" },
    { name: "bullet", group: "root", from: [-0.4, 0.2, 3], to: [0.4, 1, 5], material: "steel" },
    { name: "primer", group: "root", from: [-0.3, 0, -1.7], to: [0.3, 0.3, -1.5], material: "steel_dark" },
  ], AMMO_POSITIONING_GROUPS),
  scope: itemTemplate("scope", "Scope", "Optic placeholder: scope_body tube, ocular_ring, ocular lens, division reticle and scope_view camera.", [64, 64], [
    { name: "tube", group: "scope_body", from: [-1, 1, -5], to: [1, 3, 5], material: "polymer" },
    { name: "bell", group: "scope_body", from: [-1.3, 0.7, -6], to: [1.3, 3.3, -5], material: "polymer" },
    { name: "mount", group: "scope_body", from: [-0.6, 0, -2], to: [0.6, 1, 2], material: "steel_dark" },
    { name: "turret", group: "scope_body", from: [-0.5, 3, -1], to: [0.5, 4, 1], material: "steel_dark" },
    // ocular_ring is the eyepiece frame drawn while aiming; keep it thin.
    { name: "ring", group: "ocular_ring", from: [-1.15, 0.85, 4.9], to: [1.15, 3.15, 5.2], material: "steel_dark" },
    // ocular is the lens plane: only its south face is kept in the real model.
    { name: "lens", group: "ocular", from: [-0.9, 1.1, 4.8], to: [0.9, 2.9, 4.8], material: "glass" },
    // division is the reticle image plane.
    { name: "reticle", group: "division", from: [-0.8, 1.2, 4.5], to: [0.8, 2.8, 4.5], material: "accent" },
  ], SCOPE_GROUPS),
  muzzle: itemTemplate("muzzle", "Muzzle Device", "Muzzle brake placeholder: body, side ports and tip.", [64, 64], [
    { name: "body", group: "root", from: [-1, 1, -3], to: [1, 3, 3], material: "steel_dark" },
    { name: "ports", group: "root", from: [-1.2, 1.6, -1], to: [1.2, 2.4, 1], material: "steel" },
    { name: "tip", group: "root", from: [-0.8, 1.2, -3.4], to: [0.8, 2.8, -3], material: "steel" },
  ]),
  stock: itemTemplate("stock", "Stock", "Stock placeholder: body, butt pad and cheek rest.", [64, 64], [
    { name: "body", group: "root", from: [-1.5, 0, 0], to: [1.5, 2, 10], material: "polymer" },
    { name: "butt", group: "root", from: [-1.5, 0, 10], to: [1.5, 3, 12], material: "polymer" },
    { name: "cheek", group: "root", from: [-1, 2, 2], to: [1, 3, 8], material: "steel_dark" },
  ]),
  grip: itemTemplate("grip", "Grip", "Foregrip placeholder: body, base and rail clamp.", [64, 64], [
    { name: "body", group: "root", from: [-1, 0, -2], to: [1, 6, 2], material: "polymer" },
    { name: "base", group: "root", from: [-1.2, -1, -2.4], to: [1.2, 0, 2.4], material: "steel_dark" },
    { name: "rail", group: "root", from: [-1.2, 0, -2.4], to: [1.2, 0.6, 2.4], material: "steel" },
  ]),
  laser: itemTemplate("laser", "Laser", "Laser placeholder: body, emitter lens and switch.", [32, 32], [
    { name: "body", group: "root", from: [-1, 0, -2], to: [1, 2, 2], material: "steel_dark" },
    { name: "emitter", group: "root", from: [-0.4, 0.5, -2.4], to: [0.4, 1.5, -2], material: "accent" },
    { name: "switch", group: "root", from: [-1.2, 0.5, -1], to: [-1, 1.5, 1], material: "steel" },
  ]),
  extended_mag: itemTemplate("extended_mag", "Extended Magazine", "Extended magazine placeholder: body, base plate and feed lips.", [64, 64], [
    { name: "body", group: "root", from: [-1.5, -6, -2], to: [1.5, 0, 2], material: "steel_dark" },
    { name: "base", group: "root", from: [-1.5, -7, -2], to: [1.5, -6, 2], material: "steel" },
    { name: "feed", group: "root", from: [-1, 0, -1], to: [1, 2, 1], material: "steel" },
  ]),
};

/** Returns one ammo/attachment template, or throws with the accepted kinds. */
export function getItemTemplate(kind: string): ITaczItemTemplate {
  const templateValue = (TACZ_ITEM_TEMPLATES as Record<string, ITaczItemTemplate | undefined>)[kind];
  if (!templateValue) {
    throw new Error(`Unknown item template "${kind}". Accepted: ${Object.keys(TACZ_ITEM_TEMPLATES).join(", ")}.`);
  }
  return templateValue;
}
