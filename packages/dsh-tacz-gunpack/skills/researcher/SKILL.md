---
name: tacz-researcher
description: Find gun reference images and real specifications, write a design brief, and keep a source manifest. Reference images never enter the pack.
whenToUse: Use at the start of a gun build, or when proportions, materials, mechanics, or animation needs are uncertain.
---

# TACZ Researcher

## Procedure

1. Turn the request into 4–6 queries: model + "side view", "disassembly", "receiver", "magazine", "texture reference", "specifications".
2. `tacz_reference action="search"` for specifications and text sources.
3. `tacz_reference action="images"` with `root` and `count` 3–6 → `refs/<slug>/img-*.{png,jpg,webp}` + `manifest.json`.
4. Read images with `read_image` (one at a time). Extract:
   - overall proportions (stock:receiver:barrel);
   - receiver/handguard/stock/magazine shape;
   - sight height and muzzle device;
   - material palette;
   - fire mode/ammo class, barrel layout, trigger mechanism;
   - whether animation/state machine is needed (pump, bolt, double barrel, fire selector).
5. Write `refs/<slug>/design-brief.json`:
   ```json
   {
     "gun_id": "dp12",
     "display_name": "DP-12",
     "type": "shotgun",
     "ammo": "tacz:12g",
     "proportions": {"receiver": 22, "barrel": 14, "stock": 8},
     "parts": ["receiver", "barrels", "pump", "stock", "grip", "sight"],
     "palette": {"receiver": "polymer_dark", "barrels": "steel"},
     "mechanics": {"barrels": "side_by_side", "trigger": "single_trigger_two_pulls"},
     "animation": {"needed": true, "state_machine": true},
     "notes": ["..."]
   }
   ```
6. Return the handoff JSON with brief and manifest paths.

## When you are unsure

- The role skills and tool results are your source of truth. If a fact is in neither, and the pack on disk does not show it, **ask the user** with `ask_user_question` instead of guessing.
- Never invent file layouts, field names, group names, bone names, numbers, or sound keys. A wrong guess costs a full rebuild.
- Never search the workspace for a spec document: this skill is self-contained and there is no spec file to find. If the skill does not cover a detail, ask.
- Ask only about decisions the user owns (caliber, style, mechanics, whether animation is needed). Anything a tool can answer, answer by running the tool first.
- If a required input is missing, return `status="blocked"` with `next=["need:user:<question>"]` and the concrete question, rather than producing partial work built on an assumption.

## Rules

- Images stay in `refs/`; never copy them into `assets/`.
- Record source URL beside every image.
- Write only under `refs/` and `specs/`. Never create or edit pack files, geometry, data, or scripts; if the task asks, return `status="blocked"` with `next=["need:modeler"]` / `need:data-smith`.
- If image download fails, report it and fall back to text specs.
- Mark uncertain dimensions `"estimate": true`; never invent.

## Self-checks

- [ ] Barrel layout (side-by-side vs over-under) and trigger mechanism confirmed from a source.
- [ ] Ammo id cross-checked against the TACZ ammo table.
- [ ] Animation/state machine need recorded in the brief.
- [ ] Every `notes` claim has a source or is marked as estimate.
