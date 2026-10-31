---
name: tacz-gun-modeling
description: Build a TACZ gun pack in Blockbench MCP: template groups, -Z muzzle orientation, 128x128 per-face UV atlas, 64x64 slot icon, index/data/display JSON, validation, and packaging.
whenToUse: Use when the user asks for a TACZ / Timeless and Classics Zero gun, gun pack, weapon model, or wants an existing TACZ pack edited.
---

# TACZ Gun Modeling Skill

## Before touching geometry

1. Confirm the target is **TACZ** (Timeless and Classics Zero), not a generic Bedrock entity.
2. Call `tacz_template_list` and pick a category.
3. Call `tacz_pack action="create"` with a unique namespace (never `tacz`).
4. Call `tacz_gun action="new"`; this creates the camera/root/AKM/positioning/views/locator tree.

## Geometry rules

- Bedrock Entity format only.
- +Y up, +X right, muzzle toward **-Z**.
- 16 Blockbench units = 1 Minecraft block.
- Keep the receiver, barrel/handguard, stock, grip, magazine, sights, and muzzle as separate cubes so they can be adjusted independently.
- Empty locator groups (`muzzle_pos`, `muzzle_flash`, `scope_pos`, `shell`, `stock_pos`, `lefthand_pos`, `righthand_pos`) are part of the interface; do not delete them.
- Use `modify_cube` to resize and reposition; avoid rebuilding the whole model for a small fix.

## Atlas rules

- `tacz_texture_init` creates a 128x128 atlas, applies it to every cube, runs Auto UV, and seeds material colors.
- Paint with the texture tools; keep 1px bevel highlights and darker bottom edges.
- Material names: `steel`, `steel_dark`, `polymer`, `wood`, `rubber`, `brass`, `glass`, `accent`, `warning`.
- Do not leave a visible face fully transparent.

## Export and validation

1. `tacz_icon_render` (side view, 64x64).
2. `tacz_gun action="export"` with the profile.
3. `tacz_model_validate` and `tacz_pack action="validate"`.
4. Fix every `error`; warnings need a reason.
5. `tacz_pack action="package"`.

## Failure handling

- No Bedrock Entity format → update Blockbench; do not export a Java block.
- Icon render empty → check camera framing and that cubes are visible.
- Pack validation says missing file → export the model/texture/icon before validating.
- Namespace `tacz` → choose a new namespace.
