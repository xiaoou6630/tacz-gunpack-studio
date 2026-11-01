# modeler — lesson log

Full history, kept out of the system prompt by default. The learner or the role
itself reads this file when it needs the long form.

## Learned lesson — 2026-11-01T16:00:00.000Z

Whether a gun comes out crude or polished depends less on model strength than on
**running the checks and going back to redo the work**. DP-12 spent three hours
on repeated screenshot fixes (`.scratch/` still holds `slot_approved_before_fix.png`
next to `slot_after_fix.png`), and KSG was sent back by `REOPEN` four times.
danuvia_43m only reached INIT → RESEARCH → BLUEPRINT; once `GEOMETRY` stalled it
kept adding cubes in place (96 → 126) and never reached the painting stage.
Quick tell: read the `history` array in `.tacz/builds/<gun>.json`; if it contains
no `REOPEN`, the build never iterated.

## Learned lesson — 2026-11-01T16:00:01.000Z

`tacz_texture_init` lays a base coat; it does not paint a texture. Its ceiling is
one flat material colour per face plus a 1px bevel — measured at 5–9 distinct
colours. DP-12's 217 colours and KSG's 430 are shading painted pixel by pixel
afterwards. So when the gate reports too few `distinct_colours`, the correct
response is **to paint**, not to add more cubes. Reference numbers: DP-12 spans
14 luminance bands (16 → 223) with 23% of adjacent pixels differing; danuvia has
5 colours and 0% variation.

## Learned lesson — 2026-11-01T16:00:02.000Z

Bedrock geometry cubes have no `name` field, so a project reopened from
`*_geo.json` names every cube after its bone — usually all `AKM`. `materialForName("AKM")`
then matches no material rule and the whole gun is painted one flat grey. Two
countermeasures: name cubes after their part at creation time
(`receiver_core`/`barrel_body`/`stock_butt`), or accept the built-in index-based
rotation of steel/steel_dark/polymer/wood when they are unnamed.

## Learned lesson — 2026-11-01T16:00:03.000Z

A colour outside the palette covering most of the atlas (for example `#3bbb2f`
over 90%) means someone ran `paint_fill_tool` with `fill_mode="color"` across the
whole canvas. `TACZ_MATERIALS` holds only nine colours and green is not one of
them, so that fill came from a later manual pass. Rule: `fill_mode` may only be
`face` or `selection`, and colours must come from `TACZ_MATERIALS` or the design
brief's `palette.swatches`.

## Learned lesson — 2026-11-01T16:00:04.000Z

A verification script must add no runtime. DP-12's `verify_m1_m4.py` imported
Pillow, so it silently stops working on any machine without Python installed.
Use `tools/check-pack-geometry.mjs` instead — pure Node, decoding the PNG through
`node:zlib`. It runs five hard checks and two advisory warnings; KSG passes and
danuvia fails three, which separates good from bad accurately.

## Learned lesson — 2026-10-30T12:16:12.273Z

For end-cap parts (muzzle cap, buttplate, scope ring cap) the inner core must
stop at least 0.2 unit short of each cap on the z axis. Otherwise the cap face
and the core face are co-planar and same-facing, producing flickering seams when
the camera moves (DP-12's first pass produced 96 such pairs). Check: after export,
compare every cube AABB pair; the count of pairs sharing a plane and a normal
with positive overlap area must be 0.

## Learned lesson — 2026-10-30T12:16:16.226Z

Sub-components (handguard rail, rail teeth, sling loop, foregrip) must not float
0.1–0.2 unit off the body; they become separate connected components and the
reviewer records them as a major defect. After building, self-check that the AABB
connected-component count is 1 (counting contact after inflate). A floating part
must either touch the body or gain a connecting block that welds it on.

## Learned lesson — 2026-10-30T12:16:18.672Z

`tacz_icon_render`'s side camera has a fixed zoom and a visible window of about
11 units, so a full-size 42-unit gun is cropped to a mid-section close-up. Scale
all bones down proportionally (for example 0.24), centre and render, then restore
the original sizes one by one. Read the resulting 64px PNG back to confirm both
the muzzle and the buttplate sit inside the frame.

## Learned lesson — 2026-10-30T12:16:20.541Z

`tacz_gun export` re-lays the UV atlas, so any UV conclusion from before the
export is stale once the geometry changes. After every export, re-run all four
checks — per-face UV rectangles unique, no overlap, inside `[0, atlas size]`, no
fully transparent visible face — rather than reusing the previous result.

## Learned lesson — 2026-10-30T12:16:22.062Z

Do not leave write-probe files such as `_write_test.txt` under `assets/` or
`refs/`. The sandbox ACE is not inherited by directories created later, so the
shell cannot delete them afterwards and they pollute the zip entry count. Probe
outside the pack root, or delete in the same session and confirm with `glob` that
nothing remains.
