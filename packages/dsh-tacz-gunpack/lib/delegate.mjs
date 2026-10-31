/**
 * Subagent delegation for the five TACZ roles. The child gets a role persona
 * built from its SKILL.md, a tool allow-list, and a structured handoff schema.
 *
 * @module
 */
import { ROLES, ROLE_RESULT_SCHEMA, buildRolePersona, expandToolAllowList } from "./roles.mjs";
import { readSkill } from "./skills.mjs";

/** Serializes subagent output blocks into text. */
function outputText(output) {
  if (!Array.isArray(output)) return "";
  return output
    .map(block => {
      if (!block || typeof block !== "object") return "";
      if (block.type === "text") return block.text ?? "";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Creates the `tacz_delegate` executor.
 *
 * @param {object} ctx Cordis context.
 * @param {object} config Plugin config.
 */
export function createDelegate(ctx, config = {}) {
  return async function delegate(args, exec) {
    const role = args?.role;
    if (!ROLES[role]) throw new Error(`Unknown role "${role}". Use one of: ${Object.keys(ROLES).join(", ")}.`);
    const task = String(args?.task ?? "").trim();
    if (!task) throw new Error("tacz_delegate needs a non-empty task.");
    if (!exec?.agent) throw new Error("tacz_delegate requires an agent context.");
    const subagents = ctx.get("subagents");
    if (!subagents) throw new Error("The DSH subagents service is unavailable; enable the subagent rows in the preset.");
    const providers = subagents.list();
    const provider = config.subagentProvider && providers.includes(config.subagentProvider)
      ? config.subagentProvider
      : providers.includes("spawn")
        ? "spawn"
        : providers[0];
    if (!provider) throw new Error("No subagent provider is registered.");
    const skill = readSkill(role);
    const tools = ctx.get("tools");
    const schemas = tools && typeof tools.schemas === "function" ? tools.schemas() : [];
    const allow = expandToolAllowList(schemas, ROLES[role].patterns);
    const context = args?.context && typeof args.context === "object" ? `\n\nContext JSON:\n${JSON.stringify(args.context, null, 2)}` : "";
    const toolNote = allow.length > 0
      ? `\n\nTools available to this role (use only these; treat the rest as unavailable):\n${allow.map(name => `- ${name}`).join("\n")}`
      : "";
    // The current subagent contract has no per-start persona or tool filter:
    // the role persona and allow-list travel in the child prompt.
    const prompt = `${buildRolePersona(role, skill.body)}

--- task from the main agent ---
${task}

Project root: ${args?.root ?? "(not provided)"}${context}${toolNote}

Execute your role skill and return only the agreed JSON object.`;
    const agentOptions = args?.provider && args?.model ? { provider: String(args.provider), model: String(args.model) } : undefined;
    const activation = await subagents.startActivation({
      provider,
      label: `tacz-${role}`,
      request: {
        prompt: [{ type: "text", text: prompt }],
        parent: exec.agent,
        outputSchema: ROLE_RESULT_SCHEMA,
        agentOptions,
        maxDepth: 1,
      },
      signal: exec.signal,
      delivery: "caller",
    });
    try {
      const result = await activation.result;
      return {
        role,
        provider,
        child_session_id: activation.childId,
        stop_reason: result.stopReason,
        structured: result.structured ?? null,
        output: outputText(result.output),
        diagnostic: result.diagnostic ?? null,
        tools_allowed: allow.length,
      };
    } finally {
      await activation.dispose().catch(() => undefined);
    }
  };
}
