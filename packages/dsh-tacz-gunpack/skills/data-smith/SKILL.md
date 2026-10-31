---
name: tacz-data-smith
description: Fill TACZ profiles and verify index/data/display/lang, ammunition, animation/state machine/sounds references, and full-pack validation.
whenToUse: Use when a model is exported and the pack needs valid TACZ gameplay data, display, language, animation/state machine, sounds, or recipes.
---

# TACZ Data Smith

## Inputs

- Pack root, namespace, gun id, category, modeler profile notes.
- Reference values from the default pack; do not copy its assets.
- Whether animation/state machine/sounds are required.

## Procedure

1. Read existing `data/<ns>/index/guns/<id>.json`, `data/<ns>/data/guns/<id>_data.json`, and `assets/<ns>/display/guns/<id>_display.json`.
2. Build the profile:
   - `ammo` (valid TACZ id), `ammo_amount` > 0, `rpm` 1–1200;
   - `bolt`, `fire_mode`, reload feed/cooldown, weight, recoil, inaccuracy;
   - keep the block structure the validator expects.
3. Write the documents with the DSH `tacz_item` tool, not with a Blockbench export:
   - ammo: `tacz_item action="ammo"` → `data/<ns>/index/ammo/<id>.json`, `assets/<ns>/display/ammo/<id>_display.json`, lang keys.
   - attachment: `tacz_item action="attachment"` → index + data + display + lang.
   - recipe: `tacz_item action="recipe" kind="gun|ammo|attachment"` with `materials` and `result`.
   - tags: `tacz_item action="tag" gun_id="<gun>" tags=["#tacz:scope", ...]`.
   - verify: `tacz_item action="verify"`; the returned `missing` list is the handoff for the modeler (geometry/UV/slot files still to produce).
   - art handoff: the modeler creates the matching geometry with `tacz_ammo` / `tacz_attachment`; their `export` is art-only (geo/UV/slot) and never touches your JSON.
4. **Animation / state machine / sounds** (only when the gun needs them):
   - `animation`: `ns:name` → `assets/<ns>/animations/<name>.animation.json` (Bedrock 1.8.0); the display value is `ns:name` without the file suffix.
   - `state_machine`: `ns:name` → `assets/<ns>/scripts/<name>.lua`; optional `state_machine_param`;
   - `use_default_animation`: `rifle`/`pistol`; `third_person_animation`: `default`;
   - `sounds`: map actions to existing sound keys.
   - The `tacz_*` tools export geometry/data/icon only; write the animation JSON and Lua yourself.
   - Clip names must match `runAnimation(...)` in the official `default_state_machine.lua`: `static_idle`, `static_semi`, `static_bolt_caught`, `draw`, `put_away`, `shoot`, `bolt` (not `bolt_action`), `reload_tactical`, `reload_empty`, `inspect`, `inspect_empty`.
5. `tacz_pack action="validate"`; fix every error; warnings need a written reason.
6. Re-read the exported JSON and confirm the fields above actually landed.

## PTC usage

- Batch profile writes, export, validate, and JSON read-backs in one `run_code` program where possible.
- Return the validation object and changed paths from the program; do not make one tool call per field.

## When you are unsure

- The role skills and tool results are your source of truth. If a fact is in neither, and the pack on disk does not show it, **ask the user** with `ask_user_question` instead of guessing.
- Never invent file layouts, field names, group names, bone names, numbers, or sound keys. A wrong guess costs a full rebuild.
- Never search the workspace for a spec document: this skill is self-contained and there is no spec file to find. If the skill does not cover a detail, ask.
- Ask only about decisions the user owns (caliber, style, mechanics, whether animation is needed). Anything a tool can answer, answer by running the tool first.
- If a required input is missing, return `status="blocked"` with `next=["need:user:<question>"]` and the concrete question, rather than producing partial work built on an assumption.

## Rules

- Data lives on the DSH side. The Blockbench side only writes geometry/UV/slot (`art_only=true`); never expect or hand-edit the exported data/display/lang.
- `allow_attachment_types` must stay on the gun data (`["scope","muzzle","extended_mag"]` for shotguns); tags alone are not enough for the workbench to show attachment slots.
- Attachments need both a tag (`data/<ns>/tacz_tags/attachments/allow_attachments/<gun>.json`) and a model anchor (`muzzle_pos`/`scope_pos`/`stock_pos`/`grip_pos`/`laser_pos`); refit groups (`refit_view` etc.) are required or the attachment screen renders the gun off-camera.

- Do not hand-edit paths unless the validator shows a concrete mismatch.
- `index.name` is a language key present in `zh_cn.json`; `display.model/texture/slot` are namespace-relative without extensions.
- Never use namespace `tacz`.
- Keep `third_person_animation: "default"` unless a specific animation exists.
- Do not edit geometry, textures, or icons; modeler owns them. Do not model or write code/scripts for another role; if a task asks, return `status="blocked"` with `next=["need:modeler"]`.
- After you edit data/display/lang, any later modeler geometry export must use `art_only=true`; the Blockbench side must never rewrite your data.
- Icons (wiki `gun/display/03_hud`): slot is 64×64, isometric right, shading off, muzzle **right**; HUD is 384×128 3:1, side view, shading off, muzzle **left**. Verify both exist in `display.slot` / `display.hud`.
- Return the handoff JSON with validation result and exact files changed.

## Official baseline source

- Pack rules are in the Director skill's *Pack format reference* section; it is self-contained, so do not search the workspace for a spec file.
- `tacz_spec action="locate"` first. A local `TACZ_SOURCE`, `vendor/TACZ`, or previous cache wins; only then GitHub.
- Missing a baseline file: `tacz_spec action="fetch" path="scripts/default_state_machine.lua"` (also fetch the reference `animations/*.animation.json` and `display/guns/*_display.json` you are comparing against).
- GitHub repo is `MCModderAnchor/TACZ@1.20.1`; the cache records repo/ref/sha under `~/.dsh/tacz-gunpack/spec-cache/`.
- Never write a machine-specific absolute path into a lesson or skill.
- If neither the skill nor a tool result answers a pack-format question, ask the user instead of guessing.

## Self-checks

- [ ] Shotgun/special guns: capacity = total loaded rounds; reload type matches (manual/pump).
- [ ] Shotgun inaccuracy is shotgun-scale, not rifle-scale.
- [ ] `bullet.life` and `damage_adjust` are independent; `life` ≥0.05 s.
- [ ] Every animation/state machine/sound reference resolves.
- [ ] `tacz_verify` reports no missing references.
- [ ] `tacz_pack action="validate"` 0 error.
