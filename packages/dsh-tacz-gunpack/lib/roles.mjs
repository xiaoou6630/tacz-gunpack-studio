/**
 * Six-role roster for the TACZ studio: the main director plus five subagents.
 * Each role owns one skill and a tool allow-list.
 *
 * @module
 */

/** Subagent roles. The director is the session's main agent, not spawned here. */
export const ROLES = {
  modeler: {
    label: "Modeler",
    skill: "tacz-modeler",
    summary: "Turn a design brief into TACZ template bones, cubes, a UV atlas, textures, and animation-ready pivots using the Blockbench MCP tools.",
    patterns: [
      "mcp__blockbench__tacz_*",
      "mcp__blockbench__place_cube",
      "mcp__blockbench__modify_cube",
      "mcp__blockbench__list_outline",
      "mcp__blockbench__create_group",
      "mcp__blockbench__capture_screenshot",
      "mcp__blockbench__create_offscreen_view",
      "mcp__blockbench__set_camera_angle",
      "mcp__blockbench__list_textures",
      "mcp__blockbench__paint_*",
      "mcp__blockbench__texture_*",
      "mcp__blockbench__animation_*",
      "mcp__blockbench__create_animation",
      "mcp__blockbench__manage_keyframes",
      "mcp__blockbench__batch_keyframe_operations",
      "read",
      "write",
      "edit",
      "glob",
      "grep",
      "skill",
    ],
  },
  reviewer: {
    label: "Reviewer",
    skill: "tacz-reviewer",
    summary: "Read-only check of proportions, structure, UV, textures, icons, data, and animation/state-machine/sound references; report blocker/major/minor findings.",
    patterns: [
      "mcp__blockbench__tacz_model_validate",
      "mcp__blockbench__tacz_pack",
      "mcp__blockbench__capture_screenshot",
      "mcp__blockbench__list_outline",
      "mcp__blockbench__get_project_info",
      "read",
      "read_image",
      "glob",
      "grep",
      "skill",
    ],
  },
  "data-smith": {
    label: "Data Smith",
    skill: "tacz-data-smith",
    summary: "Fill the TACZ profile, write index/data/display/lang, wire animation/state-machine/sound references, and run full-pack validation.",
    patterns: [
      "mcp__blockbench__tacz_gun",
      "mcp__blockbench__tacz_pack",
      "mcp__blockbench__tacz_model_validate",
      "read",
      "write",
      "edit",
      "glob",
      "grep",
      "skill",
    ],
  },
  researcher: {
    label: "Researcher",
    skill: "tacz-researcher",
    summary: "Research weapon reference images and specifications, write the refs manifest and design brief, and never put reference images inside the pack.",
    patterns: [
      "tacz_reference",
      "web_search",
      "web_fetch",
      "read",
      "write",
      "edit",
      "glob",
      "skill",
    ],
  },
  learner: {
    label: "Learner",
    skill: "tacz-learner",
    summary: "Distil lessons from review failures, rewrite role skills, and keep versioned, rollback-safe history.",
    patterns: [
      "tacz_skill",
      "read",
      "write",
      "edit",
      "glob",
      "grep",
      "skill",
    ],
  },
};

/** JSON Schema every subagent returns through tacz_delegate. */
export const ROLE_RESULT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ok", "needs_changes", "blocked", "failed"] },
    summary: { type: "string" },
    artifacts: { type: "array", items: { type: "string" } },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["blocker", "major", "minor"] },
          code: { type: "string" },
          message: { type: "string" },
          artifact: { type: "string" },
        },
        required: ["severity", "message"],
        additionalProperties: false,
      },
    },
    next: { type: "array", items: { type: "string" } },
  },
  required: ["status", "summary", "artifacts", "findings", "next"],
  additionalProperties: false,
};

/** Builds the child persona from the role skill body and the handoff contract. */
export function buildRolePersona(role, skillBody) {
  const spec = ROLES[role];
  if (!spec) throw new Error(`Unknown role "${role}".`);
  return `You are the "${spec.label}" sub-agent (${role}) of the TACZ Gun Studio. ${spec.summary}

Follow the role skill below before doing anything the main agent asks:

--- role skill ${spec.skill} ---
${skillBody}
--- end of role skill ---

Output contract:
- Return exactly one JSON object, no markdown code fences.
- Fields: status (ok|needs_changes|blocked|failed), summary, artifacts (array of relative paths), findings (severity/code/message/artifact), next (array of strings).
- Never claim a file was written unless it really exists on disk; every artifacts path must resolve.
- On a blocker, set status=blocked or needs_changes and put an actionable fix in findings.
- Do not modify another role's output; the reviewer is read-only.
- If the task is missing a required input, return blocked and list exactly what is missing instead of guessing.`;
}

/** Expands role patterns against the live tool catalog. */
export function expandToolAllowList(toolSchemas, patterns) {
  const names = new Set(toolSchemas.map(tool => tool.name));
  const allow = new Set();
  for (const pattern of patterns) {
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      for (const name of names) if (name.startsWith(prefix)) allow.add(name);
    } else if (names.has(pattern)) {
      allow.add(pattern);
    }
  }
  return [...allow].sort();
}

/** Returns a compact roster for the status tool. */
export function roleRoster() {
  return Object.entries(ROLES).map(([role, spec]) => ({
    role,
    label: spec.label,
    skill: spec.skill,
    summary: spec.summary,
  }));
}
