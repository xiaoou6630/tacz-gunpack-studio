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
6. `tacz_texture_init` assigns Auto UV and paints each face with one flat material colour derived from the **cube name**. That is a base coat, not a texture: its ceiling is one colour per face plus a 1px bevel, measured at 5–9 distinct colours. **Then paint.** DP-12 (217 colours) and KSG (430) both got there by shading face by face after the base coat, not by running `tacz_texture_init` harder.
   - **Size the atlas to the work, not to the default.** 256×256 leaves room for 1356 unique rectangles; 128×128 is enough only for a simple gun. KSG used 256 and DP-12 used 128 — pick what fits, and state it in the handoff.
   - **Name every cube after its part** (`receiver_core`, `barrel_body`, `stock_butt`, `grip_wall`…). A cube left named `AKM` matches no material rule and the whole gun comes out one flat grey.
   - **`AKM` is a group, not a cube name.** TACZ's template bone chain is `root → bone2 → AKM → positioning2`, and every gun keeps it because the state machine, animations and attachment system resolve nodes by that chain. Never delete `AKM`, `camera`, `root`, `positioning`, `views` or the locators.
   - **Why cubes end up named `AKM`:** Bedrock geometry cubes carry only `origin`, `size` and `uv` — there is no `name` field. Exporting drops every cube name, and reopening a `*_geo.json` names each cube after its bone. So a project that was named correctly can come back with 63 cubes all called `AKM`. If you reopen an exported geo, re-name the cubes before running `tacz_texture_init`, or the atlas pass will paint them all `steel`.
   - **Never fill the atlas with one colour.** `paint_fill_tool` with `fill_mode="color"` repaints every pixel of the canvas; that is what turns a gun into a solid block of one hue. Restrict fills to `fill_mode="face"` or `selection`. This is the one painting rule that must not bend.
   - **Colours come from evidence, not imagination.** Sample them from the design brief's `palette.swatches` (the researcher derives these from real reference photos) or from the reference images directly. `TACZ_MATERIALS` is a starting palette for the base coat, not a limit on shading — DP-12's 217 colours and KSG's 430 are all off-palette shades. What is forbidden is a colour with no source behind it.
   - **Use the whole atlas.** Auto UV packs upward from v=0, so the bottom rows often stay empty: KSG left 23% of its height unused and DP-12 left 26%. After Auto UV, either scale the layout to fill the atlas or shrink the canvas to what is actually used.
   - Target: ≥64 distinct colours and ≥20% atlas coverage. `tacz_model_validate` fails the model otherwise.
7. Textures/geometry milestone → one `capture_screenshot` from front/right/iso; fix silhouette issues before more detail. Do not screenshot after every cube.
8. **Verify with numbers, not with your eyes.** The two packs that shipped clean (DP-12 and KSG) were not built better, they were *checked harder*: every pass ended with a script that re-read the exported files and printed measurements. Run:
   ```
   node <studio>/tools/check-pack-geometry.mjs <pack_dir> <gun_id>
   ```
   It needs only Node — no Python, no pip, nothing the user must install. Exit code 1 means the pack is not ready.
   - Hard checks (must pass): cube count ≥120, distinct colours ≥64, atlas coverage ≥20%, unique UV rectangles, UV inside the atlas bounds.
   - Advisory warnings (record them, do not block): co-planar same-facing pairs, floating sub-parts inside one bone.
   - **Do not "fix" a warning by shrinking the model.** Warnings describe known cosmetic risks; KSG ships with 108 co-planar pairs and 8 minor findings and is still a good pack.
9. Icons — per the official wiki (`gun/display/03_hud`):
   - `tacz_icon_render target="slot"`: **isometric-right camera, shading OFF, muzzle pointing RIGHT**, cropped square to 64×64.
   - `tacz_icon_render target="hud"`: **side view, shading OFF, muzzle pointing LEFT**, 3:1 at 384×128 (180×60 / 192×64 also accepted). Long guns align to the centre axis, short guns (pistols) align right.
   - Verify the slot silhouette fills the frame without clipping and the HUD is unshaded.
   - The camera window is narrow (~11 units): a full-length model is cropped to a mid-section. Scale all bones down proportionally, render, then restore — that is how DP-12 got its icon.
10. `tacz_gun action="export" art_only=true`, then `tacz_model_validate` and `tacz_pack action="validate"`. Never pass `preserve_docs=false` with documents enabled on a pack whose data the data-smith owns.
11. **Re-check after every export.** `tacz_gun export` re-lays the UV atlas, so any UV conclusion from before the export is stale. Re-run step 8 every time; do not reuse earlier results.
12. If the brief requires animation, export the animation-ready rig and hand the bone list to data-smith.
13. Archive the editable project: `export_model codec_id="project"` to `<workspace>/models/<gun>.bbmodel` before handoff; never leave the only copy in the live Blockbench session.

## Audit your own work, then reopen

The KSG build that shipped well was not built in one pass. Its history holds four `REOPEN` entries, and the one that mattered most reads:

> art standard audit: **37.5 grid vs 31.8**, **69 cubes LOD-level**, **6361 UV overlaps**, **36 colours**

Nobody told it that. It audited itself, found four concrete defects, and went back. That loop is the difference between a good pack and a stuck one — not a better model, not a better prompt.

**After every export, audit before advancing.** Answer these from measurements, not from memory:

| Ask | Measure with |
|---|---|
| Is the overall size right? | `check-pack-geometry.mjs` bounds vs `design-brief.json` `scale.tacz_units.overall` |
| Enough detail? | `cube_count` |
| Any UV overlap? | `uv_unique` |
| Enough colours? | `distinct_colours` |
| Is the atlas used? | `atlas_coverage` and the UV v-range |
| Any floating or co-planar parts? | the two advisory warnings |

**When the audit finds a defect, `tacz_build action="reopen"`** with the numbers in `note` — for example `reopen stage=GEOMETRY note="37.5 grid vs 31.8; 69 cubes; 6361 UV overlaps"`. Do not wait for a gate to block you, and do not advance on the assumption that the previous pass was fine.

**The contract can be wrong, and reality wins.** KSG's own rig contract specified 37.5 units, 10 high and 5 wide; the finished gun is 31.8 / 8.5 / 3.7 because the real weapon measures 26.1 in, which is 31.8 units at 48 per metre. When a contract number contradicts the real-world dimension in the design brief, follow the real dimension and record why in the `REOPEN` note. The same contract asked for a 128×128 atlas; the shipped pack uses 256×256 because 1356 unique UV rectangles do not fit in 128.

## When a gate keeps failing

The danuvia_43m build stalled at `GEOMETRY` and the modeler responded by adding cubes — 96, then 126 — while the real problems (a 2.94× oversize model and a 5-colour atlas) went untouched. Adding detail to a wrong foundation wastes the pass.

**If the `GEOMETRY` gate fails twice, stop adding cubes and answer these in order:**

| Question | Where the answer is | If wrong |
|---|---|---|
| Is the overall length right? | `design-brief.json` → `scale.tacz_units.overall` | Go back to `BLUEPRINT`; the proportions are wrong and no amount of detail fixes it |
| Does the atlas have colours? | `check-pack-geometry.mjs` → `distinct_colours` | Paint. Do not add cubes |
| Is the atlas painted across its area? | `check-pack-geometry.mjs` → `atlas_coverage` | Fill the background first, then shade inside the UV rectangles |
| Are the UVs unique? | `check-pack-geometry.mjs` → `uv_unique` | Re-run `tacz_texture_init`; do not hand-patch rectangles |

Only after all four are answered should you add detail. Report which of the four was wrong in the handoff, so the lesson is not lost.

**Never bypass the controller.** Writing data files with `tacz_item` or exporting with `tacz_gun` while the build is still at `GEOMETRY` produces a pack that no gate and no review ever saw — that is exactly how danuvia_43m reached the user with 96 cubes and 5 colours while its `stage` had not moved since `BLUEPRINT`.

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
