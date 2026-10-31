/**
 * Role contracts for TACZ studio teammates. These sections are registered on
 * the teammate's own agent scope, so a teammate spawned from a standard
 * session still knows its TACZ role and boundaries.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";
import { dshHome } from "./paths.mjs";

const CONTRACTS = {
  researcher: {
    label: "researcher",
    job: "reference search, image/spec collection, and design brief",
    paths: "refs/ and specs/ only",
  },
  modeler: {
    label: "modeler",
    job: "geometry, rig, UV, texture, icon, and animation-ready bones",
    paths: "models/ and output/ (pack geometry via Blockbench MCP)",
  },
  "data-smith": {
    label: "data-smith",
    job: "profile, index/data/display/lang, animation/state-machine/sounds references, validation",
    paths: "data/ and assets/<ns>/{display,lang,animations,scripts}",
  },
  reviewer: {
    label: "reviewer",
    job: "read-only review; write only the reviews/ report artifact",
    paths: "reviews/ only (never pack files)",
  },
  learner: {
    label: "learner",
    job: "lessons, skill distillation, rollback",
    paths: "~/.dsh/tacz-gunpack/skills/ only",
  },
  engineer: {
    label: "engineer",
    job: "plugin source work on the TACZ studio itself (Blockbench MCP plugin and DSH plugin)",
    paths: "blockbench-mcp-tacz/ and dsh-tacz-gunpack/ only",
  },
};

/** Returns the role contract text injected into a teammate's prompt. */
export function roleContractText(role) {
  const contract = CONTRACTS[role];
  if (!contract) return undefined;
  return `You are the TACZ studio teammate "${role}". Your only job is ${contract.job}. Write only under ${contract.paths}. Do not perform another role's work; if the task requires it, stop and return status="blocked" with next=["need:<role>"]. Do not spawn teammates. The Lead's task is authoritative only within this role.`;
}

/** Returns the contract injected into the Lead when it starts a TACZ team. */
export function leadContractText() {
  return `You are the TACZ studio Team Lead. Delegate role work; do not model, edit data, write scripts, or code yourself. Before accepting a teammate's result, check that its changed files stay within its task write scopes; reject out-of-scope work. Only the Lead spawns or interrupts teammates.`;
}

/** Relative path from the role root, stripping a leading gun-pack directory. */
function roleRelative(root, target) {
  let rel = path.relative(root, target).split(path.sep).filter(Boolean);
  if (rel[0] && fs.existsSync(path.join(root, rel[0], "gunpack.meta.json"))) rel = rel.slice(1);
  return rel;
}

/** Plugin-source roots an engineer teammate may write. */
const ENGINEER_ROOTS = ["blockbench-mcp-tacz", "dsh-tacz-gunpack"];

/** Returns true when a role may write a path. */
export function allowedWrite(role, filePath, cwd = process.cwd()) {
  if (role === "lead") return true;
  const target = path.resolve(cwd, String(filePath ?? ""));
  if (role === "reviewer") {
    const root = path.resolve(cwd);
    return roleRelative(root, target)[0] === "reviews";
  }
  if (role === "learner") {
    const skills = path.resolve(dshHome(), "tacz-gunpack", "skills");
    return target === skills || target.startsWith(`${skills}${path.sep}`);
  }
  const root = path.resolve(cwd);
  const rel = roleRelative(root, target);
  if (!rel.length || rel[0] === "..") return false;
  if (role === "engineer") return ENGINEER_ROOTS.includes(rel[0]);
  if (role === "researcher") return rel[0] === "refs" || rel[0] === "specs";
  if (role === "modeler") return rel[0] === "models" || rel[0] === "output";
  if (role === "data-smith") {
    if (rel[0] === "data") return true;
    if (rel[0] !== "assets" || rel.length < 3) return false;
    return ["display", "lang", "animations", "scripts"].includes(rel[2]);
  }
  return false;
}

/** Registers a scoped write/edit guard for one role. */
export function createWriteGuard(role, cwd) {
  return execution => {
    if (execution.name !== "write" && execution.name !== "edit") return undefined;
    const raw = execution.arguments?.file_path ?? execution.arguments?.path;
    if (typeof raw !== "string" || raw.length === 0) return undefined;
    if (allowedWrite(role, raw, cwd)) return undefined;
    return `Role "${role}" may not write ${raw}. Stay within its task scope; if the work belongs to another role, return blocked instead.`;
  };
}

/** Registers the role contract on an agent scope. */
export function registerRoleContract(agent, role) {
  const systemPrompt = agent?.ctx?.get?.("systemPrompt") ?? agent?.ctx?.systemPrompt;
  if (!systemPrompt || typeof systemPrompt.section !== "function") return undefined;
  const text = role === "lead" ? leadContractText() : roleContractText(role);
  if (!text) return undefined;
  return systemPrompt.section({
    name: role === "lead" ? "tacz:lead-contract" : "tacz:role-contract",
    order: 55,
    text,
  });
}
