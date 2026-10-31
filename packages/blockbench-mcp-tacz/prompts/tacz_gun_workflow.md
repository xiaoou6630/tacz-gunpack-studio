# TACZ Gun Pack Workflow

You are building content for the Minecraft mod **Timeless and Classics Zero (TACZ)** through the Blockbench MCP tools.

## Non-negotiables

- Project format: **Bedrock Entity**, not Java Block.
- Gun orientation: **+Y is up, +X is right, the muzzle points toward -Z**.
- Texture: **128x128** RGBA atlas by default; each cube face has its own UV rectangle.
- Slot icon: **64x64** PNG at `assets/<namespace>/textures/gun/slot/<gun_id>.png`. Official style (wiki `gun/display/03_hud`): **isometric-right camera, viewport shading OFF, muzzle pointing RIGHT**.
- HUD icon: **384x128** PNG at `assets/<namespace>/textures/gun/hud/<gun_id>.png`, 3:1 (180x60 and 192x64 are also accepted). Official style: **side view, shading OFF, muzzle pointing LEFT**. Long guns align to the centre axis, pistols align right.
- Model file: `assets/<namespace>/geo_models/gun/<gun_id>_geo.json`.
- Data files: `data/<namespace>/index/guns/<gun_id>.json`, `data/<namespace>/data/guns/<gun_id>_data.json`.
- Display file: `assets/<namespace>/display/guns/<gun_id>_display.json`.
- Never use the reserved namespace `tacz`.

## Art / data split

Blockbench owns art. DeepSeek Harness owns data.

- `tacz_gun action="export" art_only=true` writes geometry, UV texture, slot icon and HUD icon only. It does **not** write index/data/display/lang.
- Never hand-write `data/`, `display/`, `lang/`, recipes, tags or scripts from the Blockbench side.
- `tacz_gun action="export"` without `art_only` still writes the documents; use it only for a standalone one-shot pack.

## Required group tree

Start from `tacz_template_list` or `tacz_gun action="new"`. The default tree is:

```text
camera
root
└─ bone2
   ├─ AKM (receiver, barrel, stock, grip, magazine, sights, muzzle)
   ├─ lefthand → lefthand_pos
   └─ righthand → righthand_pos
positioning
├─ fixed
├─ ground
└─ thirdperson_hand
views
├─ idle_view
├─ iron_view
├─ refit_view
├─ refit_muzzle_view
├─ refit_stock_view
├─ refit_scope_view
├─ refit_extended_mag_view
├─ refit_grip_view
└─ refit_laser_view
AKM
└─ positioning2
   ├─ stock_pos
   ├─ muzzle_pos
   ├─ grip_pos
   ├─ laser_pos
   ├─ shell
   ├─ scope_pos
   └─ muzzle_flash
```

Keep those names exactly. TACZ animations and attachments address them directly.

The `refit_*_view` groups are attachment-screen camera anchors. A model without them renders off-camera ("the gun flies into the sky") when the player opens the modification screen. `grip_pos` / `laser_pos` / `muzzle_pos` / `scope_pos` / `stock_pos` are the attachment mount points.

## Steps

1. **Pack** — `tacz_pack action="create"` with a unique namespace. If the pack exists, use `action="info"`.
2. **Template** — `tacz_gun action="new"` with `type` (`rifle`, `pistol`, `smg`, `shotgun`, `sniper`, `mg`, `rpg`) and a snake_case `gun_id`.
3. **Shape** — use `place_cube`, `modify_cube`, group tools, and UV operations. Work in passes: receiver → barrel/handguard → stock/grip → magazine → sights → muzzle. Keep the silhouette readable at 64px.
4. **Atlas** — `tacz_texture_init` to create the 128x128 atlas, assign it to every cube, run Auto UV, and seed material colors. Then paint details with the texture tools.
5. **Preview** — `capture_screenshot` from an offscreen view (front, right, iso). Check proportions, clipping, and whether the muzzle/sight are visible.
6. **Icons** — `tacz_icon_render target="slot"` (isometric right, shading off, muzzle right, 64x64) and `tacz_icon_render target="hud"` (side, shading off, muzzle left, 384x128). Both write into the pack when `pack_dir` and `gun_id` are given.
7. **Export** — `tacz_gun action="export" art_only=true`. It writes geometry, UV PNG, slot icon and HUD icon.
8. **Validate** — `tacz_model_validate` for the live project and `tacz_pack action="validate"` for the whole pack. Blockers must be zero before packaging.
9. **Package** — `tacz_pack action="package"`.

## Ammo and attachments

Ammo and attachments follow the same art/data split.

- Art: `tacz_ammo` / `tacz_attachment` create, open and export item geometry, UV atlas and slot icon. Ammo uses `assets/<ns>/geo_models/ammo/<id>.json` (no `_geo` suffix), `textures/ammo/uv/<id>.png`, `textures/ammo/slot/<id>.png`. Attachments use `assets/<ns>/geo_models/attachment/<id>_geo.json`, `textures/attachment/uv/<id>.png`, `textures/attachment/slot/<id>.png`.
- Data: the DeepSeek Harness side writes `data/<ns>/index/ammo/<id>.json`, `data/<ns>/index/attachments/<id>.json`, the matching `data/` files, recipes and `tacz_tags/attachments/allow_attachments/<gun>.json`.
- A gun needs `allow_attachment_types` in its data file **and** the matching `*_pos` groups in its model before the workbench shows attachment slots.

## Data profile

`tacz_gun action="export"` accepts a partial `profile`:

- `ammo`: use a default TACZ ammo id such as `tacz:762x39`, `tacz:556x45`, `tacz:9mm`, `tacz:12g`, `tacz:308`.
- `ammo_amount`, `rpm` (1–1200), `damage`, `fire_mode` (`auto`, `semi`, `burst`).
- `bolt`: `closed_bolt`, `open_bolt`, or `manual_action`.
- `reload_empty`, `reload_tactical`, `cooldown_empty`, `cooldown_tactical`.
- `weight`.

Unspecified fields come from the category template.

## Review checklist

- [ ] Gun points -Z; muzzle is at the most negative Z.
- [ ] `muzzle_pos` and `muzzle_flash` sit at the barrel tip.
- [ ] `stock_pos`, `scope_pos`, `grip_pos`, `laser_pos`, `shell`, `lefthand_pos`, `righthand_pos` exist.
- [ ] All `refit_*_view` groups exist under `views`.
- [ ] No cube has a zero size; no UV is outside the atlas.
- [ ] Texture is a power of two and ≤ 1024.
- [ ] Slot icon is 64x64, unshaded, muzzle right, readable at 1x.
- [ ] HUD icon is 384x128 3:1, unshaded, muzzle left.
- [ ] `rpm` is 1–1200; `ammo_amount` > 0.
- [ ] `allow_attachment_types` lists every attachment category the model has a mount point for.
- [ ] `tacz_pack action="validate"` returns `ok: true`.
