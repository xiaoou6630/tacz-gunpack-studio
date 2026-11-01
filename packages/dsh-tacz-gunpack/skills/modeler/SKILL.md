---
name: tacz-modeler
description: Build a TACZ gun in Blockbench MCP: animation-ready bones, geometry, 128x128 UV atlas, texture, render checks, and a 64x64 slot icon.
whenToUse: Use when a TACZ design brief needs a rig, geometry, UVs, texture, icon, or animation-ready bones.
---

# TACZ Modeler

## Inputs

- `refs/<slug>/design-brief.json` (or a direct brief).
- Pack root, namespace, gun id, category, texture size (default 128×128).
- Whether the gun needs animation/state machine (then bones and pivots matter more).

## Procedure

1. Read the existing pack and `refs/<slug>/design-brief.json`; the Lead owns `tacz_pack create` / `tacz_gun new`. Do not create a second pack.
2. Write `models/<gun>-blueprint.json` first. It is a **work order, not a model**:
   - `parts[]`: `name`, `bone`, optional `description` (proportions, real dimensions), and **`cubes: []` — always empty**.
   - `bones[]`: `name`, `parent`, `pivot`.
   - The `BLUEPRINT` gate only checks that `parts` and `bones` are non-empty arrays.
   - **Never write cube geometry into the blueprint.** `from`/`to`/`size` arrays there are not modelling; nothing reads them, and they are not a substitute for building in Blockbench. Geometry is created in Blockbench in step 5, and only there.
   Return after the `BLUEPRINT` gate; do not start cubes before it passes.
3. Read `tacz_template_list` for category defaults. Keep `camera`, `root`, `AKM`, `positioning`, `views`, and locator groups.
4. **Rig first** — create the bones that must move: bolt, magazine, safety, trigger, pump, barrels, hammer. Each moving part gets its own bone; pivots sit at the real rotation point. Keep `lefthand` / `righthand` / `camera` / `constraint` groups.
5. **Blockout** in this order: receiver → barrel/handguard → stock → grip → magazine → sights → muzzle. Batch cubes: one `place_cube` call with multiple elements per pass, not one cube per step.
6. `tacz_texture_init` 128×128; assign UV; paint with the texture tools. Keep a 1px bevel and no fully transparent visible faces.
7. Textures/geometry milestone → one `capture_screenshot` from front/right/iso; fix silhouette issues before more detail. Do not screenshot after every cube.
8. Icons — per the official wiki (`gun/display/03_hud`):
   - `tacz_icon_render target="slot"`: **isometric-right camera, shading OFF, muzzle pointing RIGHT**, cropped square to 64×64.
   - `tacz_icon_render target="hud"`: **side view, shading OFF, muzzle pointing LEFT**, 3:1 at 384×128 (180×60 / 192×64 also accepted). Long guns align to the centre axis, short guns (pistols) align right.
   - Verify the slot silhouette fills the frame without clipping and the HUD is unshaded.
9. `tacz_gun action="export" art_only=true`, then `tacz_model_validate` and `tacz_pack action="validate"`. Never pass `preserve_docs=false` with documents enabled on a pack whose data the data-smith owns.
10. If the brief requires animation, export the animation-ready rig and hand the bone list to data-smith.
11. Archive the editable project: `export_model codec_id="project"` to `<workspace>/models/<gun>.bbmodel` before handoff; never leave the only copy in the live Blockbench session.

## When you are unsure

- The role skills and tool results are your source of truth. If a fact is in neither, and the pack on disk does not show it, **ask the user** with `ask_user_question` instead of guessing.
- Never invent file layouts, field names, group names, bone names, numbers, or sound keys. A wrong guess costs a full rebuild.
- Never search the workspace for a spec document: this skill is self-contained and there is no spec file to find. If the skill does not cover a detail, ask.
- Ask only about decisions the user owns (caliber, style, mechanics, whether animation is needed). Anything a tool can answer, answer by running the tool first.
- If a required input is missing, return `status="blocked"` with `next=["need:user:<question>"]` and the concrete question, rather than producing partial work built on an assumption.

## Hard rules

- Muzzle at the most negative Z; sights +Y; stock +Z; 16 units per block.
- Art only: `tacz_gun action="export" art_only=true` writes geometry/UV/slot/HUD but **no data/display/lang**. The DSH side owns all data; never hand-write index/data/display/lang/recipes/tags.
- Icons (official wiki `gun/display/03_hud`): slot = 64×64, **isometric right, shading OFF, muzzle RIGHT**; HUD = 384×128 3:1, **side view, shading OFF, muzzle LEFT**. Shading is OFF for both; do not paint them as a one-colour silhouette.
- Attachment screen anchors: every gun needs `refit_view`, `refit_muzzle_view`, `refit_stock_view`, `refit_scope_view`, `refit_extended_mag_view`, `refit_grip_view`, `refit_laser_view` under `views`, plus `muzzle_pos`/`scope_pos`/`stock_pos`/`grip_pos`/`laser_pos` under `positioning2`. Missing refit groups render the gun off-camera when the player opens the modification screen.
- Ammo and attachments are art too: `tacz_ammo` / `tacz_attachment` create, open and export their geometry, UV atlas and slot icon; the DSH side writes their JSON.
- Never delete `camera`, `root`, `AKM`, `positioning`, `views`, or locator groups.
- Do not edit `data/`, `display/`, or scripts; data-smith owns those. Do not write application code or JSON/scripts by hand; if a task asks for data/code work, return `status="blocked"` with `next=["need:data-smith"]`.
- Use Blockbench MCP for pack geometry/textures; only archive `.bbmodel` under `models/` and build output under `output/`.
- Do not leave probe/temporary files in the pack.
- `status=ok` only if `tacz_model_validate` has no errors and the icon is non-empty.

## PTC usage

- Work inside `run_code`: loop `place_cube`/`modify_cube` over element arrays, and loop keyframe creation for animation. One program per blockout/paint/export pass.
- Return the values you need (`get_project_info`, validation, icon metadata) from the program; screenshots and icons arrive as deferred images.
- Split a program when a later step depends on a rendered image; do not split per cube.

## Self-check before handoff

- [ ] Geometry forms **one connected component** (no floating 0.1–0.2-unit parts).
- [ ] No coplanar same-facing faces on visible surfaces (end caps must be shorter than their core).
- [ ] All cubes inside the expected AABB; no rotated oddities.
- [ ] UV: every face unique, inside [0,128], no fully transparent visible face.
- [ ] After every export, re-check UV and icon (export reorders the atlas).
- [ ] Icon: muzzle and stock both inside the 64×64 frame.

## Official baseline source

- Animation clip names and bone hierarchy must match the official default state machine. Use `tacz_spec action="locate"` first, then `fetch` if needed; GitHub fallback is `MCModderAnchor/TACZ@1.20.1`.
- Do not hardcode a local jar/source path in a lesson; record local vs GitHub + repo/ref/sha.

## Output

Handoff JSON; `artifacts` lists geometry JSON, UV PNG, slot icon, screenshot, and (if any) animation export paths.
