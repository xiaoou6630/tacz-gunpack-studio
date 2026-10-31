/**
 * dsh-tacz-gunpack — DeepSeek Harness host plugin.
 *
 * The plugin owns the six-role studio: it seeds mutable role skills, exposes
 * them to the skill registry, registers the legacy role-delegate tool,
 * downloads reference boards, installs the Blockbench MCP bridge row, and
 * registers the TACZ Gun Studio agent mode from the same bundle.
 * Presets delegate through the built-in Agent Teams tools; `tacz_delegate` is
 * kept only for compositions that have no Team bundle. The actual TACZ modeling
 * and pack generation live in the Blockbench MCP plugin.
 *
 * @module
 */
import path from "node:path";
import { defineTool } from "./lib/define-tool.mjs";
import { createDelegate } from "./lib/delegate.mjs";
import { createReference } from "./lib/reference.mjs";
import { locateOfficialSources, resolveOfficialFile } from "./lib/official-spec.mjs";
import { installMcpRow, findProfileDir, MCP_URL } from "./lib/mcp-install.mjs";
import { installTaczMode } from "./lib/preset-mode.mjs";
import { createTeamToolPolicy } from "./lib/team-policy.mjs";
import { verifyPack } from "./lib/verify-pack.mjs";
import { createAmmoItem, createAttachmentItem, createAttachmentTag, createItemRecipe, verifyItems } from "./lib/items.mjs";
import { advanceBuild, ackBuild, gateFor, initBuild, loadBuild, reopenBuild, resumeBuild, statusBuild } from "./lib/build-state.mjs";
import { TACZ_PRESET } from "./preset/definition.mjs";
import { ROLES, roleRoster } from "./lib/roles.mjs";
import {
  distillSkill,
  learnLesson,
  listSkills,
  readSkill,
  readLessons,
  rollbackSkill,
  seedSkills,
  skillHistory,
  validateSkill,
  writeSkill,
} from "./lib/skills.mjs";
import { readText } from "./lib/paths.mjs";

const TOOL_OUTPUT = {
  schema: { type: "object", additionalProperties: true },
  render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }],
};

// Team role contracts and the per-role write guard live in lib/team-policy.mjs
// and lib/role-contract.mjs; they are installed on agent/created.

/** Builds a compact status object for the tool and command. */
async function buildStatus(ctx, config = {}) {
  const tools = ctx.get("tools");
  const schemas = tools && typeof tools.schemas === "function" ? tools.schemas() : [];
  const blockbench = schemas.map(tool => tool.name).filter(name => name.startsWith("mcp__blockbench__")).sort();
  const taCZ = blockbench.filter(name => /^mcp__blockbench__tacz_/.test(name));
  const skills = listSkills();
  const profilePatch = path.join(findProfileDir(), "cordis.patch.yml");
  const mcpInstalled = (readText(profilePatch) ?? "").includes("mcp-blockbench");
  const agentPresets = ctx.get("agentPresets");
  let presets = [];
  if (agentPresets && typeof agentPresets.list === "function") {
    try {
      presets = (await agentPresets.list()).map(preset => ({
        id: preset.id,
        name: preset.name ?? preset.id,
        trust: preset.trust ?? null,
        broken: preset.broken ?? null,
      }));
    } catch (error) {
      presets = [{ id: "error", name: String(error), trust: null, broken: String(error) }];
    }
  }
  return {
    ok: true,
    blockbench_mcp_url: config.mcpUrl || MCP_URL,
    blockbench_mcp_url_default: MCP_URL,
    mcp_row_installed: mcpInstalled,
    blockbench_tool_count: blockbench.length,
    tacz_tool_count: taCZ.length,
    tacz_tools: taCZ,
    skills: skills.map(skill => ({ role: skill.role, name: skill.name, bytes: skill.bytes })),
    roles: roleRoster(),
    preset_roots: (agentPresets?.roots ?? []).map(root => ({ path: root.path, trust: root.trust })),
    preset_authorable: agentPresets?.authorable ?? null,
    presets,
    subagents: (() => {
      const subagents = ctx.get("subagents");
      try {
        return subagents ? subagents.list() : [];
      } catch {
        return [];
      }
    })(),
    config: {
      defaultProjectRoot: config.defaultProjectRoot ?? "",
      learning: config.learning ?? {},
    },
  };
}

/** Registers every tool, command, and skill provider. */
export function apply(ctx, config = {}) {
  const logger = ctx.logger ?? console;
  const seeded = seedSkills();
  logger.info?.(`[dsh-tacz-gunpack] skills seeded at ${seeded.root} (${seeded.copied.length} new)`);
  createTeamToolPolicy(ctx, config);

  // Wire the Blockbench MCP bridge automatically. Requiring the user to call
  // `tacz_install_mcp` first is a chicken-and-egg trap: the tool only exists
  // after this plugin loads, and the agent cannot see the mcp__blockbench__*
  // tools until that row is written. Doing it here means a fresh install works
  // after a single DSH restart.
  //
  // `autoInstallMcp: false` in the plugin row config disables it, for users who
  // manage the row themselves.
  if (config.autoInstallMcp !== false) {
    try {
      const result = installMcpRow({ profileDir: config.profileDir, url: config.mcpUrl });
      logger.info?.(
        result.already
          ? `[dsh-tacz-gunpack] Blockbench MCP row already present at ${result.url}`
          : `[dsh-tacz-gunpack] Blockbench MCP row installed into ${result.patch} (backup: ${result.backup})`,
      );
    } catch (error) {
      // Never abort plugin load: a read-only profile or an unwritable patch
      // path should degrade to "run tacz_install_mcp manually", not crash.
      logger.warn?.(`[dsh-tacz-gunpack] auto MCP install skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let invalidateSkills = () => {};
  const skills = ctx.get("skills");
  if (skills && typeof skills.registerProvider === "function") {
    ctx.effect(() => skills.registerProvider(control => {
      invalidateSkills = control.invalidate;
      return {
        name: "tacz-gunpack",
        async list() {
          return {
            candidates: listSkills().map(skill => ({
              name: skill.name,
              description: skill.description,
              whenToUse: skill.whenToUse || undefined,
              invocation: { modelInvocable: true, userInvocable: true },
              source: "custom",
              provider: "tacz-gunpack",
              path: skill.file,
              rank: 450,
              locator: { role: skill.role },
            })),
            complete: true,
          };
        },
        async get(candidate) {
          const role = candidate?.locator?.role;
          if (!role) return undefined;
          const skill = readSkill(role);
          return {
            name: skill.data.name ?? role,
            description: skill.data.description ?? "",
            whenToUse: skill.data.whenToUse,
            invocation: { modelInvocable: true, userInvocable: true },
            source: "custom",
            provider: "tacz-gunpack",
            path: skill.file,
            content: skill.body,
          };
        },
      };
    }));
  }

  const tools = ctx.get("tools");
  if (!tools || typeof tools.register !== "function") throw new Error("The DSH tools service is unavailable.");
  const delegate = createDelegate(ctx, config);
  const reference = createReference(ctx, config);

  const register = definition => ctx.effect(() => tools.register(defineTool(definition)));

  register({
    name: "tacz_status",
    description:
      "Show the TACZ studio status: whether the Blockbench MCP row is installed, how many mcp__blockbench__ tools and tacz_* tools are visible, the six roles, and the mutable skills. Use before delegating.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    output: TOOL_OUTPUT,
    async execute() {
      return await buildStatus(ctx, config);
    },
  });

  register({
    name: "tacz_delegate",
    description:
      "Legacy role delegation. Presets that mount the built-in Agent Teams bundle should use spawn_teammate / team_task_* / send_message / wait_agent instead. Roles: modeler, reviewer, data-smith, researcher, learner. The child receives the role's SKILL.md in its prompt, a role-specific tool allow-list as guidance, and must return a JSON handoff with status/summary/artifacts/findings/next.",
    parameters: {
      type: "object",
      properties: {
        role: { type: "string", enum: Object.keys(ROLES) },
        task: { type: "string", description: "Self-contained task for the role." },
        root: { type: "string", description: "Absolute project/pack root." },
        context: { type: "object", additionalProperties: true, description: "Optional JSON context: brief, paths, previous findings." },
        provider: { type: "string", description: "Optional model provider override." },
        model: { type: "string", description: "Optional model override." },
      },
      required: ["role", "task"],
      additionalProperties: false,
    },
    output: TOOL_OUTPUT,
    async execute(args, exec) {
      return delegate(args, exec);
    },
  });

  register({
    name: "tacz_reference",
    description:
      "Search references or download a reference image board. action=search uses the DSH web search; action=images fetches Bing Images, saves up to 8 images under refs/<slug>/, and writes manifest.json with source URLs and a license note.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "images"], default: "search" },
        query: { type: "string" },
        root: { type: "string", description: "Project root for images." },
        count: { type: "number", minimum: 1, maximum: 8, default: 4 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    output: TOOL_OUTPUT,
    async execute(args) {
      return reference(args);
    },
  });

  register({
    name: "tacz_spec",
    description:
      "Resolve the official TACZ default-pack baseline (default_state_machine.lua, reference animations, display files). Local first: TACZ_SOURCE, vendor/TACZ, a previous cache. If absent, fetch from the official GitHub repo MCModderAnchor/TACZ@1.20.1 and cache it. Actions: locate (list local sources/cache), fetch (download/copy one path). Never hardcode a local absolute path in a lesson.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["locate", "fetch"], default: "locate" },
        path: { type: "string", description: "Path under the official default pack, e.g. scripts/default_state_machine.lua, animations/ak47.animation.json, display/guns/ak47_display.json." },
        source: { type: "string", description: "Optional explicit extracted TACZ repo/pack directory." },
      },
      required: ["action"],
      additionalProperties: false,
    },
    output: TOOL_OUTPUT,
    async execute(args, exec) {
      const workingDirectory = ctx.get("workingDirectory");
      let cwd = config.defaultProjectRoot || process.cwd();
      try {
        if (workingDirectory && exec?.agent?.session) cwd = workingDirectory.get(exec.agent.session);
      } catch {
        // Keep the configured/process fallback when the session has no directory.
      }
      const options = {
        cwd,
        repo: config.officialRepo,
        ref: config.officialRef,
        cacheDir: config.specCacheDir,
      };
      if (args.action === "locate") {
        const located = locateOfficialSources(options);
        return {
          ...located,
          cwd,
          note: located.sources.some(source => source.jar)
            ? "A .jar source was found. Extract it and point TACZ_SOURCE at the extracted assets/tacz directory, or let fetch use GitHub."
            : "Put a TACZ source at vendor/TACZ, set TACZ_SOURCE, or let fetch use GitHub.",
        };
      }
      if (!args.path) throw new Error('tacz_spec fetch needs a path, e.g. "scripts/default_state_machine.lua".');
      return resolveOfficialFile(args.path, { ...options, source: args.source });
    },
  });

  register({
    name: "tacz_build",
    description:
      "Deterministic one-gun build controller. Owns .tacz/builds/<gun>.json, the stage state machine (INIT→RESEARCH→BLUEPRINT→GEOMETRY→DATA→REVIEW→PACKAGE→READY→DONE), artifact gates, blocked/resume, and the human in-game gate. Only the Lead advances stages; teammates produce artifacts.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["init", "status", "gate", "advance", "resume", "reopen", "ack"] },
        project_root: { type: "string", description: "Project root; defaults to the session working directory." },
        gun_id: { type: "string", description: "Lower-case gun id." },
        pack_dir: { type: "string", description: "Absolute pack root (init only)." },
        type: { type: "string", description: "Gun type for init." },
        overwrite: { type: "boolean", default: false, description: "Replace an existing build state on init." },
        stage: { type: "string", enum: ["INIT", "RESEARCH", "BLUEPRINT", "GEOMETRY", "DATA", "REVIEW", "PACKAGE"], description: "Current stage for advance." },
        owner: { type: "string", description: "Expected owner for advance (lead/researcher/modeler/data-smith/reviewer)." },
        artifacts: { type: "object", additionalProperties: true, description: "Optional evidence paths/hashes to record." },
        confirmed: { type: "boolean", description: "ack only: true after the in-game test." },
        note: { type: "string", description: "ack note." },
      },
      required: ["action", "gun_id"],
      additionalProperties: false,
    },
    output: TOOL_OUTPUT,
    async execute(args, exec) {
      const workingDirectory = ctx.get("workingDirectory");
      let root = args.project_root || config.defaultProjectRoot || process.cwd();
      try {
        if (!args.project_root && workingDirectory && exec?.agent?.session) root = workingDirectory.get(exec.agent.session);
      } catch {
        // Keep the configured/process fallback.
      }
      const gun = args.gun_id;
      if (args.action === "init") {
        if (!args.pack_dir) throw new Error('tacz_build init needs pack_dir.');
        return initBuild({ project_root: root, pack_dir: args.pack_dir, gun_id: gun, type: args.type, overwrite: args.overwrite === true });
      }
      if (args.action === "status") return statusBuild(root, gun);
      if (args.action === "gate") return gateFor(loadBuild(root, gun));
      if (args.action === "advance") {
        if (!args.stage || !args.owner) throw new Error("tacz_build advance needs stage and owner.");
        return advanceBuild({ project_root: root, gun_id: gun, stage: args.stage, owner: args.owner, artifacts: args.artifacts });
      }
      if (args.action === "resume") return resumeBuild({ project_root: root, gun_id: gun });
      if (args.action === "reopen") {
        if (!args.stage) throw new Error("tacz_build reopen needs a stage.");
        return reopenBuild({ project_root: root, gun_id: gun, stage: args.stage, reason: args.note });
      }
      return ackBuild({ project_root: root, gun_id: gun, confirmed: args.confirmed, note: args.note });
    },
  });

  register({
    name: "tacz_verify",
    description:
      "Cross-check a TACZ pack's display/index references against files on disk. Catches missing animation/state-machine/model/texture/slot targets and leftover temp files that tacz_pack validate does not check.",
    parameters: {
      type: "object",
      properties: {
        pack_dir: { type: "string", description: "Absolute TACZ pack root." },
      },
      required: ["pack_dir"],
      additionalProperties: false,
    },
    output: TOOL_OUTPUT,
    async execute(args) {
      return verifyPack(args.pack_dir);
    },
  });

  register({
    name: "tacz_skill",
    description:
      "Inspect or improve one role skill. Actions: list, read, lessons, learn (append a lesson to LESSONS.md with optional source; apply=true also appends to SKILL.md and is legacy), distill (rewrite through the configured teacher model), history, rollback.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "read", "lessons", "learn", "distill", "history", "rollback"] },
        role: { type: "string", enum: Object.keys(ROLES) },
        text: { type: "string", description: "Lesson text for action=learn." },
        source: { type: "string", description: "Evidence for action=learn: TACZ_SOURCE/vendor/TACZ/jar extract, or repo@ref#sha; never a machine-specific absolute path." },
        apply: { type: "boolean", default: false, description: "Apply a lesson to SKILL.md (legacy; default false) or a distilled rewrite (default true for distill)." },
        provider: { type: "string", description: "Teacher model provider for distill." },
        model: { type: "string", description: "Teacher model id for distill." },
      },
      required: ["action"],
      additionalProperties: false,
    },
    output: TOOL_OUTPUT,
    async execute(args, exec) {
      const action = args.action;
      if (action === "list") return { skills: listSkills() };
      const role = args.role;
      if (!role) throw new Error(`tacz_skill ${action} needs a role.`);
      if (action === "read") {
        const skill = readSkill(role);
        return { role, name: skill.data.name, description: skill.data.description, content: skill.body, file: skill.file };
      }
      if (action === "lessons") {
        const lessons = readLessons(role);
        return { role, file: lessons.file, content: lessons.text };
      }
      if (action === "learn") {
        const result = learnLesson(role, args.text, args.apply === true, { source: args.source });
        invalidateSkills();
        return result;
      }
      if (action === "history") return { role, versions: skillHistory(role) };
      if (action === "rollback") {
        const result = rollbackSkill(role);
        invalidateSkills();
        return result;
      }
      const llm = ctx.get("llm");
      const result = await distillSkill(role, llm, {
        provider: args.provider ?? config.learning?.distillProvider,
        model: args.model ?? config.learning?.distillModel,
        apply: args.apply,
        signal: exec?.signal,
      });
      validateSkill(result.proposed, role);
      if (!result.apply) return { role, applied: false, proposed: result.proposed };
      const written = writeSkill(role, result.proposed, "distill");
      invalidateSkills();
      return { role, applied: true, ...written };
    },
  });

  register({
    name: "tacz_install_mcp",
    description:
      "Install the Blockbench MCP bridge row into the active DSH profile patch (idempotent, backs up the patch). The plugin does this automatically on load; use this tool to re-run it, to point at a non-default Blockbench endpoint, or to replace an existing row. After it is applied, mcp__blockbench__* tools become visible in a new session or after HMR.",
    parameters: {
      type: "object",
      properties: {
        profile_dir: { type: "string", description: "Optional explicit DSH profile directory." },
        url: {
          type: "string",
          description: "Blockbench endpoint. Accepts a full URL or `host:port/path` shorthand. Defaults to http://127.0.0.1:3000/bb-mcp, which matches the Blockbench plugin's stock mcp_host/mcp_port/mcp_endpoint settings.",
        },
        force: {
          type: "boolean",
          default: false,
          description: "Replace the url of an existing mcp-blockbench row instead of leaving it alone.",
        },
      },
      additionalProperties: false,
    },
    output: TOOL_OUTPUT,
    async execute(args) {
      return installMcpRow({
        profileDir: args.profile_dir ?? config.profileDir,
        url: args.url ?? config.mcpUrl,
        force: args.force === true,
      });
    },
  });

  register({
    name: "tacz_install_preset",
    description:
      "Check the TACZ Gun Studio mode registration. The mode is registered by this same bundle via ctx.agentPresets.register(); this tool reports whether it is currently in the preset roster.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    output: TOOL_OUTPUT,
    async execute() {
      const agentPresets = ctx.get("agentPresets");
      if (!agentPresets) throw new Error("The DSH agentPresets service is unavailable.");
      const presets = await agentPresets.list();
      const found = presets.find(preset => preset.id === "tacz-gunpack");
      return {
        mode: "tacz-gunpack",
        name: found?.name ?? "TACZ 枪包工坊",
        registered: found !== undefined,
        broken: found?.broken ?? null,
        presentation: TACZ_PRESET.plugins.find(plugin => plugin.id === "tool-presentation")?.config?.mode ?? "native",
        bundle: "dsh-tacz-gunpack",
        note: found ? "Open a new session and select the mode." : "Enable the dsh-tacz-gunpack bundle or restart DSH once.",
      };
    },
  });

  register({
    name: "tacz_item",
    description:
      "Create or verify TACZ ammo and attachment DATA on the DSH side (JSON only, no geometry or PNG). action=ammo writes data/<ns>/index/ammo/<id>.json plus assets/<ns>/display/ammo/<id>_display.json and lang keys; action=attachment writes index/data/display/lang; action=recipe writes a tacz:gun_smith_table_crafting recipe; action=tag writes the allow_attachments tag array for one gun; action=verify cross-checks every ammo/attachment/recipe/tag reference against files on disk. Returns `missing`, the geometry/texture files the Blockbench side still has to produce.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["ammo", "attachment", "recipe", "tag", "verify"] },
        project_root: { type: "string", description: "Studio workspace; every write must stay inside it. Defaults to the session working directory." },
        pack_dir: { type: "string", description: "Absolute pack root containing gunpack.meta.json." },
        id: { type: "string", description: "Ammo/attachment/recipe id (lower-case snake_case)." },
        gun_id: { type: "string", description: "Gun id for action=tag." },
        type: { type: "string", description: "Attachment type: scope, muzzle, stock, grip, laser, extended_mag, ammo_mod." },
        display_name: { type: "string", description: "Display name written into lang/zh_cn.json and lang/en_us.json." },
        stack_size: { type: "number", description: "Ammo stack size; default 64." },
        sort: { type: "number", description: "Sort order; default 10." },
        tracer_color: { type: "string", description: "Ammo tracer color, e.g. #ffcc00." },
        model: { type: "string", description: "Model reference; defaults to <ns>:ammo|attachment/<id>_geo." },
        texture: { type: "string", description: "UV texture reference; defaults to <ns>:ammo|attachment/uv/<id>." },
        slot: { type: "string", description: "Slot icon reference; defaults to <ns>:ammo|attachment/slot/<id>." },
        shell_model: { type: "string", description: "Ammo shell model reference; adds the display.shell block." },
        shell_texture: { type: "string", description: "Ammo shell texture reference." },
        data: { type: "object", additionalProperties: true, description: "Attachment data block merged over {weight: 0}." },
        sounds: { type: "object", additionalProperties: true, description: "Attachment install/uninstall sound keys; defaults to tacz:attachments/attachment_general_b and _uninstall." },
        display: { type: "object", additionalProperties: true, description: "Extra attachment display fields, passed through verbatim: zoom, scope, sight, views, views_fov, fov, adapter, lod, laser, show_mount, show_muzzle, muzzle_flash_offset, text_show." },
        kind: { type: "string", enum: ["gun", "ammo", "attachment"], description: "Recipe kind for action=recipe." },
        materials: { type: "array", items: { type: "object", additionalProperties: true }, description: "Recipe materials, e.g. [{item:{tag:'forge:ingots/iron'},count:25}]." },
        result: { type: "object", additionalProperties: true, description: "Recipe result; defaults to {type: kind, id}." },
        tags: { type: "array", items: { type: "string" }, description: "allow_attachments tag entries, e.g. '#tacz:scope'." },
        overwrite: { type: "boolean", default: false, description: "Replace existing index/data/display/recipe/tag files." },
      },
      required: ["action"],
      additionalProperties: false,
    },
    output: TOOL_OUTPUT,
    async execute(args, exec) {
      const workingDirectory = ctx.get("workingDirectory");
      let root = args.project_root || config.defaultProjectRoot || process.cwd();
      try {
        if (!args.project_root && workingDirectory && exec?.agent?.session) root = workingDirectory.get(exec.agent.session);
      } catch {
        // Keep the configured/process fallback.
      }
      const action = args.action;
      if (action === "verify") {
        if (!args.pack_dir) throw new Error("tacz_item verify needs pack_dir.");
        return { action, project_root: root, ...verifyItems(args.pack_dir) };
      }
      if (!args.pack_dir) throw new Error(`tacz_item ${action} needs pack_dir.`);
      if (!args.id) throw new Error(`tacz_item ${action} needs id.`);
      const base = { projectRoot: root, packDir: args.pack_dir, overwrite: args.overwrite === true };
      if (action === "ammo") {
        return { action, ...createAmmoItem({
          ...base,
          ammoId: args.id,
          displayName: args.display_name ?? args.id,
          stackSize: args.stack_size,
          sort: args.sort,
          tracerColor: args.tracer_color,
          model: args.model,
          texture: args.texture,
          slot: args.slot,
          shellModel: args.shell_model,
          shellTexture: args.shell_texture,
        }) };
      }
      if (action === "attachment") {
        if (!args.type) throw new Error("tacz_item attachment needs type.");
        return { action, ...createAttachmentItem({
          ...base,
          attachmentId: args.id,
          type: args.type,
          displayName: args.display_name ?? args.id,
          data: args.data,
          model: args.model,
          texture: args.texture,
          slot: args.slot,
          sounds: args.sounds,
          display: args.display,
        }) };
      }
      if (action === "recipe") {
        if (!args.kind) throw new Error("tacz_item recipe needs kind (gun, ammo or attachment).");
        if (!args.materials) throw new Error("tacz_item recipe needs materials.");
        return { action, ...createItemRecipe({
          ...base,
          kind: args.kind,
          id: args.id,
          materials: args.materials,
          result: args.result,
        }) };
      }
      if (!args.gun_id) throw new Error("tacz_item tag needs gun_id.");
      if (!args.tags) throw new Error("tacz_item tag needs tags.");
      return { action, ...createAttachmentTag({ ...base, gunId: args.gun_id, tags: args.tags }) };
    },
  });

  const commands = ctx.get("commands");
  if (commands && typeof commands.register === "function") {
    ctx.effect(() => commands.register({
      name: "tacz",
      description: "TACZ gun studio: /tacz status | roles | install-mcp | install-preset [force] | learn <role> <text> | rollback <role>",
      input: { hint: "[status|roles|install-mcp|install-preset|learn|rollback]" },
      handler: async ({ agent, rawInput }) => {
        const [command, ...rest] = String(rawInput ?? "").trim().split(/\s+/);
        try {
          if (!command || command === "status") {
            const status = await buildStatus(ctx, config);
            return { kind: "success", text: `Blockbench MCP: ${status.mcp_row_installed ? "installed" : "not installed"}; tools: ${status.blockbench_tool_count} (${status.tacz_tool_count} TACZ); skills: ${status.skills.length}; presets: ${status.presets.map(preset => preset.id).join(", ") || "none"}.` };
          }
          if (command === "roles") {
            return { kind: "success", text: roleRoster().map(role => `${role.role}（${role.label}）— ${role.summary}`).join("\n") };
          }
          if (command === "install-mcp") {
            const result = installMcpRow({ profileDir: config.profileDir, url: config.mcpUrl });
            return { kind: "success", text: result.already ? `Blockbench MCP row already present in ${result.patch} (${result.url}).` : `Added Blockbench MCP row to ${result.patch} (${result.url}). Reload/new session to see mcp__blockbench__* tools.` };
          }
          if (command === "install-preset") {
            const agentPresets = ctx.get("agentPresets");
            const presets = agentPresets ? await agentPresets.list() : [];
            const found = presets.find(preset => preset.id === "tacz-gunpack");
            return found
              ? { kind: "success", text: `TACZ mode is registered (${found.name}). Start a new session and select it.` }
              : { kind: "error", text: "TACZ mode is not registered. Enable the dsh-tacz-gunpack bundle or restart DSH once." };
          }
          if (command === "learn") {
            const role = rest[0];
            const text = rest.slice(1).join(" ");
            if (!role || !text) return { kind: "error", text: "Usage: /tacz learn <role> <lesson>" };
            const result = learnLesson(role, text, false);
            invalidateSkills();
            return { kind: "success", text: `Lesson applied to ${role}.` };
          }
          if (command === "rollback") {
            const role = rest[0];
            if (!role) return { kind: "error", text: "Usage: /tacz rollback <role>" };
            const result = rollbackSkill(role);
            invalidateSkills();
            return { kind: "success", text: `Rolled back ${role} from ${result.restored_from}.` };
          }
          return { kind: "error", text: `Unknown /tacz command "${command}".` };
        } catch (error) {
          return { kind: "error", text: error instanceof Error ? error.message : String(error) };
        }
      },
    }));
  }

  logger.info?.("[dsh-tacz-gunpack] loaded: tacz_status/tacz_delegate/tacz_reference/tacz_skill/tacz_install_mcp/tacz_install_preset + /tacz");
  if (config.installMode !== false) installTaczMode(ctx);
}

export default {
  name: "dsh-tacz-gunpack",
  inject: ["tools"],
  apply,
};
