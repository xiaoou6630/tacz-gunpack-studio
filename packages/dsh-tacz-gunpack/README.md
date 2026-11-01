# dsh-tacz-gunpack

DeepSeek Harness plugin for the **TACZ Gun Studio**: a Team Lead plus five role teammates, each with its own mutable `SKILL.md`, working against the Blockbench MCP TACZ tools. It covers modeling, data, animation/state-machine references, review, and self-learning.

## What it adds

| Tool | Purpose |
|---|---|
| `tacz_status` | Tools, skills, roles, MCP row state. |
| `tacz_delegate` | Legacy: spawn `modeler`, `reviewer`, `data-smith`, `researcher`, or `learner` with its own skill and JSON handoff. Presets that mount Agent Teams should use the Team tools instead. |
| `tacz_reference` | DSH web search or Bing Images reference board under `refs/<slug>/`. |
| `tacz_spec` | Local-first official TACZ baseline resolver (`TACZ_SOURCE`, `vendor/TACZ`, cache), then GitHub `MCModderAnchor/TACZ@1.20.1`. |
| `tacz_build` | Deterministic build controller: `.tacz/builds/<gun>.json`, stage machine, artifact gates, blocked/resume, human `ack`. |
| `tacz_verify` | Cross-check display/index references against files; reports missing animation/state-machine/model/texture/slot targets and temp residue; includes a pack SHA-256 fingerprint. |
| `tacz_skill` | `list`, `read`, `lessons`, `learn` (source-aware, LESSONS.md + changelog), `distill`, `history`, `rollback`. |
| `tacz_install_mcp` | Idempotently add the `mcp-blockbench` row (official `@deepseek-ai/dsh-mcp-client`, streamable HTTP `http://127.0.0.1:3000/bb-mcp`). |
| `tacz_install_preset` | Check whether the 「TACZ 枪包工坊」 mode is registered by this bundle. |

Command: `/tacz status | roles | install-mcp | install-preset | learn <role> <text> | rollback <role>`.

## Six roles

| Role | Skill | Responsibility |
|---|---|---|
| director (main AI) | `tacz-gunpack` | Intake, scheduling, gates, final delivery. |
| `modeler` | `tacz-modeler` | Template, cubes/groups, UV atlas, texture, preview. |
| `reviewer` | `tacz-reviewer` | Read-only proportions, structure, UV, icon, data, animation/state machine, references. |
| `data-smith` | `tacz-data-smith` | Profile, index/data/display/lang, animation/state machine/sounds references, pack validation. |
| `researcher` | `tacz-researcher` | Reference search, design brief, source manifest. |
| `learner` | `tacz-learner` | Lessons, distillation, versioned skills, rollback. |

## How the team is called

The director uses the built-in **DeepSeek Agent Teams** tools from the `@deepseek-ai/dsh-experimental-agent-team-profile` bundle:

- `spawn_teammate` creates `modeler`, `reviewer`, `data-smith`, `researcher`, `learner`;
- `team_task_create` / `team_task_update` carry the per-role task, owner, and write scopes;
- `send_message` steers a running teammate or returns review findings;
- `wait_agent` waits for progress, `list_agents` re-reads the roster.

The preset deliberately mounts **no** legacy `tool-subagent-control` / `tool-subagent` rows: the Agent Teams profile layer disables the global ones, and a second copy inside the preset scope would compete with the Team tools for the same names.

`tacz_delegate` is kept for compositions without the Team bundle. It builds the child prompt from the role's `SKILL.md` body, lists the expanded tool allow-list as prompt guidance (the current subagent contract has no per-start tool filter), and passes the structured `status/summary/artifacts/findings/next` schema through `ctx.subagents.startActivation({ delivery: "caller" })`.

## Tool policy per role

The Blockbench MCP bridge exposes 80+ global tools. `lib/team-policy.mjs` trims them at `agent/created`:

| Role | Blockbench tools |
|---|---|
| `lead` | unrestricted; legacy `tacz_delegate` / `subagent` denied |
| `modeler` | modeling, texture, rigging, animation, render, TACZ export/validate |
| `reviewer` | read-only inspection + `tacz_pack` / `tacz_model_validate` / `tacz_icon_render` |
| `data-smith` | `tacz_gun` / `tacz_pack` / validate only |
| `researcher`, `learner` | none |

This is the main prompt-size reduction: a teammate no longer carries all 80 Blockbench schemas. Set `teamToolPolicy: false` in the plugin row config to disable it.

## Animation and state machine

- [docs/tacz-animation-state-machine.md](../../docs/tacz-animation-state-machine.md) documents display fields (`animation`, `state_machine`, `state_machine_param`, `sounds`), Bedrock 1.8.0 animation JSON, the Lua state-machine structure/API, and the review checklist.
- [docs/tacz-spec.md](../../docs/tacz-spec.md) is the canonical, verified pack layout/naming/data/reference checklist.
- [docs/tacz-baseline-source.md](../../docs/tacz-baseline-source.md) defines the portable source order: local `TACZ_SOURCE` / `vendor/TACZ` / jar extract / cache, then GitHub `MCModderAnchor/TACZ@1.20.1`.
- `data-smith` owns display references and Lua; `modeler` owns animation-ready bones/pivots; `reviewer` checks references, names, loops, and Lua syntax.
- The studio still uses the modeler for the rig; add a dedicated animator role only when the user asks for full animation production.

## PTC mode

The preset mounts `@deepseek-ai/dsh-agent-tool-presentation` with `mode: ptc`.
The model sees only `run_code` plus a generated TypeScript SDK; it writes one
program to batch cube edits, keyframes, validations, and Team calls instead of
one native tool call per step. This is the main "use the model at full strength"
switch. The host must compose `ptc-runtime` (`@deepseek-ai/dsh-ptc-runtime-node`);
a deployment without it refuses to mount the preset. Image-bearing results
(screenshots/icons) arrive as deferred context, and per-role tool restrictions
still limit the SDK's visible bindings.

## Role enforcement

Each teammate gets a scoped **role contract** at `agent/created`, even when the parent session is a
standard coding agent (the latest `ai枪包2.0` session did exactly that, so the researcher inherited a
generic coding prompt). The contract names its only job and write scope. The same hook installs a
native `write`/`edit` path guard: researcher `refs/`/`specs/`, modeler `models/`/`output/`, data-smith
`data/` + `assets/<ns>/{display,lang,animations,scripts}`, reviewer none, learner only the skills
root. Blockbench tool restrictions now apply to teammates regardless of the parent preset. When the
first teammate is created, the Lead also gets a contract telling it to delegate and audit changed
files against task write scopes.

PTC caveat: `run_code` is a general program, so the native `write`/`edit` guard cannot sandbox Node
filesystem calls inside it. For PTC sessions the role contract and the Lead's `git diff` audit are the
boundary; if you need hard isolation for non-art roles, run those roles in native mode or separate
worktrees.

## Build controller

`tacz_build` is the deterministic one-gun controller: `INIT → RESEARCH → BLUEPRINT → GEOMETRY → DATA → REVIEW → PACKAGE → READY → DONE`. It owns `.tacz/builds/<gun>.json`, refuses wrong stage/owner advances, re-reads artifacts instead of trusting summaries, binds `REVIEW` to the pack fingerprint, and requires the human in-game `ack` before `DONE`. Full stage/artifact schema: [docs/tacz-build-controller.md](../../docs/tacz-build-controller.md).

## Lessons

`skills/<role>/SKILL.md` stays short; full learned lessons live in `skills/<role>/LESSONS.md` and are loaded only on demand. `tacz_skill action="learn" ... source="vendor/TACZ|repo@ref#sha" apply=false` appends to `LESSONS.md` and `CHANGELOG.jsonl` without inflating every prompt; `tacz_skill action="lessons"` reads the full history.

## Deliverables

The final handoff is `output/<gun>.zip` plus `models/<gun>.bbmodel`; the pack directory is the source, not the only archive. The modeler exports the editable project before handoff, and the director packages into `output/`.

## Install

The plugin is a zero-dependency ESM package. It has no `@deepseek-ai/*` imports, so it can be loaded by absolute path or as a link/bundle.

### Option A: bundle install (current desktop profile)

The desktop profile now contains:

- `dependencies["dsh-tacz-gunpack"] = "link:E:/daima/TCZ AI钱包/dsh-tacz-gunpack"`
- `dsh.profile.bundles` includes `dsh-tacz-gunpack`
- `dsh.profile.bundles` also includes `@deepseek-ai/dsh-experimental-agent-team-profile` (host Agent Teams tools)
- `node_modules/dsh-tacz-gunpack` is a directory junction to this package
- `plugin_manager` shows the bundle `installed: true`; `set_bundle` returned `application: "applied"`
- the package ships `locale/{en,zh}.json`, `icon.svg`, and `engines.dsh`; see the repository README

`plugin_manager install_bundle` itself may fail with `ERR_PNPM_UNEXPECTED_STORE` when the profile's pnpm store is v10 and the installer uses v11. In that case, add the three entries above manually (junction avoids re-running pnpm), then call:

```javascript
plugin_manager({ action: "set_bundle", target: "dsh-tacz-gunpack", enabled: true })
```

### Option B: path install (development)

Add to `~/.dsh/profiles/<profile>/cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-tacz-gunpack
      name: "E:/path/to/dsh-tacz-gunpack/index.mjs"
```

Do **not** keep this row when the bundle is also enabled: the loader rejects the duplicate id.

Then call `tacz_install_mcp` (or add the row manually) and reload the page/new session.

### Mode

This bundle registers the mode itself: `index.mjs` waits for the optional
`agentPresets` service and calls `ctx.agentPresets.register()` with
`preset/definition.mjs` (21 plugin rows: director persona + standard tools + a
workflow-only delegation group + PTC presentation). It is **not** a
`.agent-presets` directory: this DSH version's `agent-preset-registry` only lists
programmatically registered definitions.

The mode expects the profile's `@deepseek-ai/dsh-experimental-agent-team-profile` bundle to be enabled; that host layer supplies `spawn_teammate`, `team_task_*`, `send_message`, and `wait_agent` to every member. The preset does not mount the legacy subagent control/tools, so the Team tools are the only delegation surface.

Add one bundle to `dsh.profile.bundles`, link it into `node_modules`, then:

```javascript
plugin_manager({ action: "set_bundle", target: "dsh-tacz-gunpack", enabled: true })
```

Set `config.installMode: false` on the plugin row if you want the tools without
the mode. `preset-switch/api` should list `tacz-gunpack` with the display name
**「TACZ 枪包工坊」**. Start a **new session** and select it; an already-started
session keeps the preset revision it started with.

## Blockbench MCP row

`tacz_install_mcp` appends:

```yaml
- insert:
    - id: mcp-blockbench
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: blockbench
        transport: streamable-http
        url: http://127.0.0.1:3000/bb-mcp
```

The patch is backed up first. The official bridge exposes tools as `mcp__blockbench__*`; the TACZ tools appear as `mcp__blockbench__tacz_pack`, etc.

## Learning

Skills live in `~/.dsh/tacz-gunpack/skills/<role>/SKILL.md` and are seeded from this package.

- `learn` appends `LESSONS.md` and, with `apply:true`, appends a dated lesson to `SKILL.md`.
- `distill` asks a configured teacher route (`provider` + `model`) for a complete rewrite; it validates frontmatter, size, and credentials before writing.
- Every rewrite copies the previous file to `versions/<UTC>.md`; `rollback` restores the newest version.
- `CHANGELOG.jsonl` records role, reason, timestamp, bytes.

Default limits: 32KB per skill; no credential-looking strings; role directory only.

## Workflow

1. `tacz_status`; install the MCP row if missing. Create the pack skeleton, then `tacz_build action="init"` and advance `INIT` as `lead`.
2. `spawn_teammate name=researcher` after a `team_task_create`; it writes `refs/<slug>/design-brief.json` + `manifest.json`; advance `RESEARCH`.
3. `spawn_teammate name=modeler`; it writes `models/<gun>-blueprint.json`, advances `BLUEPRINT`, then builds/export and advances `GEOMETRY`. On a geometry-only re-export after data edits, pass `preserve_docs=true`.
4. `spawn_teammate name=data-smith`; profile + JSON + validate; advance `DATA`.
5. `spawn_teammate name=reviewer`; it writes `reviews/<gun>.json` with the `tacz_verify` fingerprint and advances `REVIEW`.
6. `tacz_verify`, then `mcp__blockbench__tacz_pack action="package" out="<project>/output/<gun>.zip"`; advance `PACKAGE`. Only after the user's in-game test call `tacz_build action="ack" confirmed=true`.
7. `spawn_teammate name=learner` with this round's defects.

The controller refuses wrong-stage/wrong-owner advances; a gate failure is `BLOCKED`, fixed with `resume`. Between steps use `wait_agent`, `team_task_list`, and `send_message`.

## Verification

```powershell
node --test tests/*.test.mjs
```

The 24 tests cover seeding, frontmatter, versioned rewrites, rollback, lessons, role tool expansion, MCP row idempotency, tool registration, status, reference search, delegate activation, official baseline resolution, pack reference verification, and the per-role tool policy.

## License

MIT for this plugin. The Blockbench MCP fork is GPL-3.0-only; TACZ is referenced as a format source only.
