/**
 * Per-role tool policy for TACZ Agent Teams members.
 *
 * The Blockbench MCP bridge exposes ~80 tools globally; carrying all of them
 * into every teammate makes each request huge. This policy trims the global
 * Blockbench tool set per teammate role at `agent/created` time. It also injects
 * a role contract (even when the parent session is a standard coding agent) and
 * a write/edit path guard. Scoped Team tools are untouched.
 *
 * @module
 */
import { createWriteGuard, registerRoleContract } from "./role-contract.mjs";

const MCP_PREFIX = "mcp__blockbench__";

/** Teammate names that are plugin-source engineers rather than pack roles. */
export const ENGINEER_NAMES = new Set(["engineer", "items-core", "dsh-items", "plugin-dev"]);

/** Maps a teammate name to the role contract it should get. */
export function resolveContractRole(name) {
  if (typeof name !== "string" || !name) return undefined;
  if (ENGINEER_NAMES.has(name)) return "engineer";
  return name;
}

/** Blockbench tools a modeling teammate may use. */
export const MODELER_TOOLS = new Set([
  "activate_texture",
  "add_group",
  "add_locator",
  "animation_copy_paste",
  "animation_graph_editor",
  "animation_timeline",
  "apply_texture",
  "batch_keyframe_operations",
  "bone_rigging",
  "capture_screenshot",
  "color_picker_tool",
  "create_animation",
  "create_brush_preset",
  "create_offscreen_view",
  "create_texture",
  "delete_offscreen_view",
  "delete_texture",
  "duplicate_element",
  "export_model",
  "find_elements_by_criteria",
  "from_geo_json",
  "get_cube_uv",
  "get_project_info",
  "get_selection",
  "get_texture",
  "get_undo_stack",
  "inspect_block_bounds",
  "list_outline",
  "list_textures",
  "list_views",
  "load_brush_preset",
  "manage_keyframes",
  "modify_cube",
  "paint_settings",
  "paint_with_brush",
  "place_cube",
  "remove_element",
  "rename_element",
  "resize_offscreen_view",
  "risky_eval",
  "save_checkpoint",
  "select_all_of_type",
  "set_camera_angle",
  "set_ik_controller",
  "set_mode",
  "tacz_attachment",
  "tacz_gun",
  "tacz_guide",
  "tacz_icon_render",
  "tacz_model_validate",
  "tacz_pack",
  "tacz_template_list",
  "tacz_texture_init",
  "texture_layer_management",
  "texture_selection",
  "undo",
  "variable_placeholders",
]);

/** Read-only review tools. */
export const REVIEWER_TOOLS = new Set([
  "capture_screenshot",
  "create_offscreen_view",
  "delete_offscreen_view",
  "get_cube_uv",
  "get_project_info",
  "get_selection",
  "get_texture",
  "get_undo_stack",
  "list_outline",
  "list_textures",
  "set_camera_angle",
  "tacz_guide",
  "tacz_icon_render",
  "tacz_model_validate",
  "tacz_pack",
  "tacz_template_list",
]);

/** Data/export tools. */
export const DATA_SMITH_TOOLS = new Set([
  "get_project_info",
  "get_texture",
  "get_undo_stack",
  "list_textures",
  "tacz_ammo",
  "tacz_attachment",
  "tacz_guide",
  "tacz_gun",
  "tacz_model_validate",
  "tacz_pack",
  "tacz_template_list",
]);

/** Lead tools: enough to inspect and package, not to model. */
export const LEAD_TOOLS = new Set([
  "capture_screenshot",
  "create_offscreen_view",
  "delete_offscreen_view",
  "get_project_info",
  "get_undo_stack",
  "list_outline",
  "set_camera_angle",
  "tacz_guide",
  "tacz_icon_render",
  "tacz_model_validate",
  "tacz_pack",
  "tacz_template_list",
]);

/** Role name -> Blockbench allow-list; an empty set denies every Blockbench tool. */
export const ROLE_TOOLS = new Map([
  ["lead", LEAD_TOOLS],
  ["modeler", MODELER_TOOLS],
  ["reviewer", REVIEWER_TOOLS],
  ["data-smith", DATA_SMITH_TOOLS],
  ["researcher", new Set()],
  ["learner", new Set()],
]);

/** Legacy delegation tools that Team members must not use. */
export const LEGACY_TOOLS = ["tacz_delegate", "subagent", "subagent_fork"];

/** Controller tools reserved for the Lead. */
export const CONTROL_TOOLS = ["tacz_build"];

/**
 * Returns the Blockbench tool names a role must not see.
 *
 * @param {string} role teammate name (`modeler`, `reviewer`, ...).
 * @param {readonly {name: string}[]} schemas visible tool schemas.
 * @returns {string[]} global Blockbench names to deny.
 */
export function blockbenchDenyFor(role, schemas) {
  const allow = ROLE_TOOLS.get(role);
  if (!allow) return [];
  const deny = [];
  for (const tool of schemas) {
    if (!tool.name.startsWith(MCP_PREFIX)) continue;
    const raw = tool.name.slice(MCP_PREFIX.length);
    if (!allow.has(raw)) deny.push(tool.name);
  }
  return deny;
}

/**
 * Installs the per-role policy on agent creation. No-op when the Agent Teams
 * service is absent or the bundle config sets `teamToolPolicy: false`.
 *
 * @param {object} ctx plugin context.
 * @param {object} config plugin config.
 */
export function createTeamToolPolicy(ctx, config = {}) {
  if (config.teamToolPolicy === false) return;
  if (typeof ctx.on !== "function") return;
  const logger = ctx.logger ?? console;
  const disposers = new Map();
  const contracts = new Set();

  const add = (agent, dispose) => {
    if (typeof dispose !== "function") return;
    const list = disposers.get(agent.id) ?? [];
    list.push(dispose);
    disposers.set(agent.id, list);
  };

  const ensureContract = (agent, role) => {
    if (!agent?.id) return;
    const key = `${agent.id}:${role}`;
    if (contracts.has(key)) return;
    try {
      const dispose = registerRoleContract(agent, role);
      if (!dispose) return;
      contracts.add(key);
      add(agent, dispose);
    } catch (error) {
      logger.warn?.(`[dsh-tacz-gunpack] role contract skipped for ${agent.id}/${role}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const restrictAgent = agent => {
    try {
      const agentTeams = ctx.get("agentTeams");
      if (!agentTeams) return;
      const membership = agentTeams.tryMembership(agent);
      if (!membership) return;
      const isTeammate = membership.role === "teammate";
      const roleName = isTeammate ? membership.name : "lead";
      const preset = membership.root?.session?.header?.agentPreset;

      if (isTeammate) {
        ensureContract(agent, resolveContractRole(roleName) ?? roleName);
        if (membership.root) ensureContract(membership.root, "lead");
      } else if (preset === "tacz-gunpack") {
        ensureContract(agent, "lead");
      }

      // Standard-parent sessions still get role contracts and Blockbench
      // restrictions for teammates. A standard Lead is not restricted because
      // it may be an unrelated coding session.
      if (!isTeammate && preset !== "tacz-gunpack") return;

      const scopedTools = agent?.ctx?.tools ?? agent?.ctx?.get?.("tools");
      if (scopedTools && typeof scopedTools.guard === "function") {
        const cwd = agent.session?.header?.cwd ?? process.cwd();
        const guardRole = isTeammate ? resolveContractRole(roleName) ?? roleName : roleName;
        add(agent, scopedTools.guard(createWriteGuard(guardRole, cwd)));
      }

      const tools = ctx.get("tools");
      if (!tools || !scopedTools || typeof scopedTools.restrict !== "function") return;
      const schemas = tools.schemas();
      const globalNames = new Set(schemas.map(tool => tool.name));
      const deny = new Set();
      for (const name of blockbenchDenyFor(roleName, schemas)) {
        if (globalNames.has(name)) deny.add(name);
      }
      for (const name of LEGACY_TOOLS) {
        if (globalNames.has(name)) deny.add(name);
      }
      if (isTeammate) {
        for (const name of CONTROL_TOOLS) {
          if (globalNames.has(name)) deny.add(name);
        }
      }
      if (deny.size === 0) return;
      add(agent, scopedTools.restrict({ deny: [...deny] }));
      logger.info?.(`[dsh-tacz-gunpack] team policy: ${membership.name} (${membership.role}) -${deny.size} tools`);
    } catch (error) {
      logger.warn?.(`[dsh-tacz-gunpack] team policy skipped for ${agent?.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const release = agent => {
    const list = disposers.get(agent.id);
    if (!list) return;
    disposers.delete(agent.id);
    for (const dispose of list) {
      try {
        dispose();
      } catch {
        // The agent scope may already be gone; nothing left to release.
      }
    }
    for (const key of [...contracts]) {
      if (key.startsWith(`${agent.id}:`)) contracts.delete(key);
    }
  };

  const offCreated = ctx.on("agent/created", ({ agent }) => restrictAgent(agent));
  const offDisposed = ctx.on("agent/disposed", ({ agent }) => release(agent));
  ctx.effect(() => () => {
    offCreated?.();
    offDisposed?.();
    for (const list of disposers.values()) {
      for (const dispose of list) {
        try {
          dispose();
        } catch {
          // Best effort during plugin disposal.
        }
      }
    }
    disposers.clear();
    contracts.clear();
  });
}
