# TACZ Gun Packs for Blockbench MCP

This is a fork of [Blockbench MCP](https://github.com/jasonjgardner/blockbench-mcp-plugin) **v1.10.1** with a TACZ gun-pack layer. It keeps the upstream MCP server, tools, prompts, resources, and panel, and adds **nine** `tacz_*` tools.

License: **GPL-3.0-only**, inherited from upstream. If you distribute a build, publish the corresponding source and changes. See [`SOURCE.txt`](SOURCE.txt) for the full change list.

## New tools

| Tool | What it does |
|---|---|
| `tacz_pack` | Create / inspect / validate / package a TACZ pack. Creates `gunpack.meta.json`, `assets/<ns>/gunpack_info.json`, model/texture/display/lang/data/recipe directories. |
| `tacz_gun` | `new` builds a Bedrock gun project from a category template; `open` imports an existing `*_geo.json` + PNG **and its `*.animation.json`**; `export` writes geometry, UV PNG, 64x64 slot icon, index/data/display JSON, and language keys, then validates. |
| `tacz_ammo` | Ammo art only: geometry at `geo_models/ammo/<id>.json` (**no `_geo` suffix**), UV atlas, slot icon. `art_only` is the default. |
| `tacz_attachment` | Attachment art only: geometry at `geo_models/attachment/<id>_geo.json`, UV atlas, slot icon. Types: scope, stock, muzzle, grip, laser, extended_mag. |
| `tacz_model_validate` | Bedrock format, required groups, locator groups, cube sizes, texture size, UV bounds. |
| `tacz_texture_init` | Creates/assigns the 128x128 atlas, runs Auto UV, paints material-colored faces. |
| `tacz_icon_render` | Offscreen render → alpha crop. `target="slot"` gives 64x64 isometric-right, muzzle right; `target="hud"` gives 384x128 side view, muzzle left. Shading off for both. |
| `tacz_template_list` | Lists categories, group/cube counts, texture size, default profile. |
| `tacz_guide` | Workflow/model/texture/data/validate guide text. |

## TACZ conventions encoded

- Blockbench format: **Bedrock** (`bedrock`), export codec `bedrock`.
- Axes: +Y up, +X right, muzzle toward **-Z**.
- Texture: **128x128** RGBA atlas by default, per-face UVs.
- Slot icon: **64x64** PNG.
- Paths:
  - `assets/<ns>/geo_models/gun/<id>_geo.json`
  - `assets/<ns>/textures/gun/uv/<id>.png`
  - `assets/<ns>/textures/gun/slot/<id>.png`
  - `assets/<ns>/display/guns/<id>_display.json`
  - `assets/<ns>/lang/{zh_cn,en_us}.json`
  - `data/<ns>/index/guns/<id>.json`
  - `data/<ns>/data/guns/<id>_data.json`
  - `data/<ns>/recipes/gun/<id>.json` (optional)
- Group tree (from the default AK-47): `camera`, `root → bone2 → AKM`, `positioning → fixed/ground/thirdperson_hand`, `views → idle_view/iron_view`, `positioning2 → stock_pos/muzzle_pos/shell/scope_pos/muzzle_flash`, `lefthand/lefthand_pos`, `righthand/righthand_pos`.

## Build

```powershell
cd blockbench-mcp-tacz
npx -y bun install --ignore-scripts
npx -y bun run build
npx -y bun test
```

`dist/mcp.js` is the plugin file.

`--ignore-scripts` is used because the `electron` postinstall download is not needed for this plugin build and may fail offline.

## Load in Blockbench

1. Disable/uninstall the store version of **MCP Server v1.10.1** (same plugin id).
2. `File → Plugins → Load Plugin from File` → `dist/mcp.js`.
3. Settings → General: port `3000`, endpoint `/bb-mcp`, host loopback.
4. Use MCP Inspector (`bun run inspect`) or connect a client to `http://127.0.0.1:3000/bb-mcp`.

> Reloading the plugin with `Plugins.registered.mcp.loadFromFile(...)` closes the current HTTP session. Clients with reconnect enabled will reconnect; otherwise reload the client.

## File-write note

Blockbench's scoped `fs` wrapper is unreliable when a file is removed and renamed over an existing path. This fork writes files **directly** (`writeFileSync`) instead of temp-file + rename, so re-exporting over existing assets works. Packaging writes the zip **inside the pack root** by default; move it out with a host file tool if you need `<pack>.zip` next to the pack.

## Demo

`../packs/demo_tacz` is a generated sample: namespace `demo`, rifle `dmr01`, 21 bones / 12 cubes, 128x128 UV, 64x64 icon, `tacz_pack validate` 0 errors/0 warnings. The zip is at `../packs/demo_tacz.zip`.

## Upstream

The upstream tool set (cubes, meshes, textures, UV, animation, GeckoLib, Hytale, export, camera, history) is untouched. New code lives in:

- `lib/tacz/` — paths, templates, pack/data generation, validation, zip, texture, icon, model.
- `server/tools/tacz.ts` — tool registration.
- `prompts/tacz_gun_workflow.md`, `.agents/skills/tacz-gun-modeling/SKILL.md`.

## License

GPL-3.0-only. See `LICENSE`. The TACZ default pack is used only as a format reference; its assets are not copied into generated packs.
