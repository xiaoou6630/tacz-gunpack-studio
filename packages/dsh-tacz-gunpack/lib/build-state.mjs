/**
 * Deterministic build controller for one TACZ gun pack.
 *
 * The controller owns `build.json`, stage transitions, artifact gates and the
 * final human gate. Agents produce artifacts; the controller re-reads them and
 * does not trust an agent's prose summary.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ensureDir, insideRoot, writeTextAtomic } from "./paths.mjs";
import { verifyPack } from "./verify-pack.mjs";

export const BUILD_STAGES = ["INIT", "RESEARCH", "BLUEPRINT", "GEOMETRY", "DATA", "REVIEW", "PACKAGE", "READY", "DONE"];

export const STAGE_OWNERS = {
  INIT: "lead",
  RESEARCH: "researcher",
  BLUEPRINT: "modeler",
  GEOMETRY: "modeler",
  DATA: "data-smith",
  REVIEW: "reviewer",
  PACKAGE: "lead",
  READY: "human",
  DONE: "human",
};

const NEXT_STAGE = {
  INIT: "RESEARCH",
  RESEARCH: "BLUEPRINT",
  BLUEPRINT: "GEOMETRY",
  GEOMETRY: "DATA",
  DATA: "REVIEW",
  REVIEW: "PACKAGE",
  PACKAGE: "READY",
  READY: "DONE",
};

/** Absolute path of one build state file. */
export function buildPath(projectRoot, gunId) {
  return path.join(path.resolve(projectRoot), ".tacz", "builds", `${gunId}.json`);
}

/** Reads JSON or throws a contextual error. */
function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${label}: invalid JSON at ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Reads JSON when present, undefined when absent. */
function maybeJson(file, label) {
  if (!fs.existsSync(file)) return undefined;
  return readJson(file, label);
}

/** SHA-256 of one file. */
function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Reads a build state; missing state is an error. */
export function loadBuild(projectRoot, gunId) {
  const file = buildPath(projectRoot, gunId);
  if (!fs.existsSync(file)) throw new Error(`No build state at ${file}. Run tacz_build action="init" first.`);
  const state = readJson(file, "tacz_build");
  if (state?.schema_version !== 1 || state.gun_id !== gunId) throw new Error(`Build state at ${file} is not for gun "${gunId}".`);
  return state;
}

/** Writes a build state atomically. */
function saveBuild(state) {
  state.updated_at = new Date().toISOString();
  writeTextAtomic(buildPath(state.project_root, state.gun_id), `${JSON.stringify(state, null, 2)}\n`);
}

/** Compact status returned to the model. */
export function buildSummary(state) {
  return {
    gun_id: state.gun_id,
    namespace: state.namespace,
    pack_dir: state.pack_dir,
    stage: state.stage,
    status: state.status,
    next_stage: NEXT_STAGE[state.stage] ?? null,
    next_owner: NEXT_STAGE[state.stage] ? STAGE_OWNERS[NEXT_STAGE[state.stage]] : null,
    blocked_reason: state.blocked_reason ?? null,
    history: state.history?.length ?? 0,
    updated_at: state.updated_at,
  };
}

/**
 * Initializes a build for an existing pack skeleton.
 *
 * @returns {{existing: boolean, state: object, next_owner: string}} result.
 */
export function initBuild({ project_root, pack_dir, gun_id, type = "rifle", overwrite = false }) {
  const root = path.resolve(project_root ?? process.cwd());
  const pack = path.resolve(pack_dir ?? "");
  if (!fs.existsSync(pack) || !fs.statSync(pack).isDirectory()) throw new Error(`pack_dir not found: ${pack}`);
  const metaPath = path.join(pack, "gunpack.meta.json");
  if (!fs.existsSync(metaPath)) throw new Error(`gunpack.meta.json missing: ${metaPath}`);
  const meta = readJson(metaPath, "gunpack.meta.json");
  if (typeof meta.namespace !== "string" || !meta.namespace) throw new Error("gunpack.meta.json namespace is missing.");
  if (!/^[a-z0-9_]+$/.test(gun_id ?? "")) throw new Error("gun_id must match ^[a-z0-9_]+$.");
  if (!insideRoot(root, pack)) throw new Error(`pack_dir must stay inside project_root (${root}).`);

  const file = buildPath(root, gun_id);
  if (fs.existsSync(file) && !overwrite) {
    const existing = loadBuild(root, gun_id);
    return { existing: true, state: existing, next_owner: STAGE_OWNERS[existing.stage] };
  }

  const now = new Date().toISOString();
  const state = {
    schema_version: 1,
    gun_id,
    type,
    namespace: meta.namespace,
    project_root: root,
    pack_dir: pack,
    stage: "INIT",
    status: "active",
    created_at: now,
    updated_at: now,
    history: [],
    gates: {},
    review_rounds: 0,
    fix_rounds: 0,
  };
  ensureDir(path.dirname(file));
  saveBuild(state);
  return { existing: false, state, next_owner: STAGE_OWNERS.INIT };
}

/** Finds the researcher's design brief. */
function findBrief(state) {
  const root = state.project_root;
  const direct = path.join(root, "refs", state.gun_id, "design-brief.json");
  if (fs.existsSync(direct)) return direct;
  const refs = path.join(root, "refs");
  if (!fs.existsSync(refs)) return undefined;
  for (const entry of fs.readdirSync(refs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(refs, entry.name, "design-brief.json");
    if (!fs.existsSync(candidate)) continue;
    const brief = maybeJson(candidate, "design-brief.json");
    if (!brief?.gun_id || brief.gun_id === state.gun_id) return candidate;
  }
  return undefined;
}

/** Finds a modeler blueprint. */
function findBlueprint(state) {
  const root = state.project_root;
  return [
    path.join(root, "models", `${state.gun_id}-blueprint.json`),
    path.join(root, "models", `${state.gun_id}.blueprint.json`),
    path.join(root, "docs", `${state.gun_id}-blueprint.json`),
  ].find(file => fs.existsSync(file));
}

/** Finds a reviewer report. */
function findReview(state) {
  const root = state.project_root;
  const direct = [
    path.join(root, "reviews", `${state.gun_id}.json`),
    path.join(root, "reviews", `${state.gun_id}-review.json`),
  ].find(file => fs.existsSync(file));
  if (direct) return direct;
  const refs = path.join(root, "refs");
  if (!fs.existsSync(refs)) return undefined;
  for (const entry of fs.readdirSync(refs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of ["review.json", `review-${state.gun_id}.json`]) {
      const candidate = path.join(refs, entry.name, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

/** Returns true when a pack-relative file exists. */
function hasFile(pack, rel) {
  const file = path.join(pack, ...rel.split("/"));
  return fs.existsSync(file) && fs.statSync(file).isFile();
}

/**
 * Runs the gate for the state's current stage.
 *
 * @returns {{ok: boolean, stage: string, owner: string, checks: object[], errors: string[], fingerprint?: string, artifacts: object}} gate
 */
export function gateFor(state) {
  const root = state.project_root;
  const pack = state.pack_dir;
  const stage = state.stage;
  const checks = [];
  const errors = [];
  const artifacts = {};
  const add = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), detail });
    if (!ok) errors.push(detail);
  };

  if (stage === "INIT") {
    add("pack.meta", fs.existsSync(path.join(pack, "gunpack.meta.json")), "gunpack.meta.json exists");
    add("pack.namespace", typeof state.namespace === "string" && state.namespace.length > 0, "namespace recorded");
    return { ok: errors.length === 0, stage, owner: STAGE_OWNERS[stage], checks, errors, artifacts };
  }

  if (stage === "RESEARCH") {
    const briefPath = findBrief(state);
    add("brief.file", Boolean(briefPath), briefPath ? `brief: ${path.relative(root, briefPath)}` : "refs/<slug>/design-brief.json is missing");
    if (briefPath) {
      const brief = maybeJson(briefPath, "design-brief.json");
      add("brief.json", Boolean(brief), "design-brief.json parses");
      add("brief.parts", Array.isArray(brief?.parts) && brief.parts.length > 0, "design-brief.parts is a non-empty array");
      add("brief.gun_id", !brief?.gun_id || brief.gun_id === state.gun_id, `brief.gun_id matches ${state.gun_id}`);
      add("brief.manifest", fs.existsSync(path.join(path.dirname(briefPath), "manifest.json")), "manifest.json exists next to the brief");
      artifacts.brief = { path: path.relative(root, briefPath), sha256: hashFile(briefPath) };
    }
    return { ok: errors.length === 0, stage, owner: STAGE_OWNERS[stage], checks, errors, artifacts };
  }

  if (stage === "BLUEPRINT") {
    const blueprintPath = findBlueprint(state);
    add("blueprint.file", Boolean(blueprintPath), blueprintPath ? `blueprint: ${path.relative(root, blueprintPath)}` : "models/<gun>-blueprint.json is missing");
    if (blueprintPath) {
      const blueprint = maybeJson(blueprintPath, "blueprint");
      add("blueprint.json", Boolean(blueprint), "blueprint JSON parses");
      add("blueprint.parts", Array.isArray(blueprint?.parts) && blueprint.parts.length > 0, "blueprint.parts is a non-empty array");
      add("blueprint.bones", Array.isArray(blueprint?.bones) && blueprint.bones.length > 0, "blueprint.bones is a non-empty array");
      artifacts.blueprint = { path: path.relative(root, blueprintPath), sha256: hashFile(blueprintPath) };
    }
    return { ok: errors.length === 0, stage, owner: STAGE_OWNERS[stage], checks, errors, artifacts };
  }

  const ns = state.namespace;
  const gun = state.gun_id;
  if (stage === "GEOMETRY" || stage === "DATA" || stage === "REVIEW" || stage === "PACKAGE") {
    const verification = verifyPack(pack);
    add("pack.verify", verification.ok, verification.ok ? "tacz_verify: ok" : `tacz_verify: ${verification.errors.join("; ")}`);
    artifacts.pack = { fingerprint: verification.fingerprint };
    if (!verification.ok) return { ok: false, stage, owner: STAGE_OWNERS[stage], checks, errors, fingerprint: verification.fingerprint, artifacts };
    if (stage === "GEOMETRY") {
      add("model.archive", fs.existsSync(path.join(root, "models", `${gun}.bbmodel`)), `models/${gun}.bbmodel exists`);
      add("geometry.geo", hasFile(pack, `assets/${ns}/geo_models/gun/${gun}_geo.json`), `assets/${ns}/geo_models/gun/${gun}_geo.json exists`);
      add("geometry.uv", hasFile(pack, `assets/${ns}/textures/gun/uv/${gun}.png`), `assets/${ns}/textures/gun/uv/${gun}.png exists`);
      add("geometry.slot", hasFile(pack, `assets/${ns}/textures/gun/slot/${gun}.png`), `assets/${ns}/textures/gun/slot/${gun}.png exists`);
      add("geometry.display", hasFile(pack, `assets/${ns}/display/guns/${gun}_display.json`), `assets/${ns}/display/guns/${gun}_display.json exists`);
    }
    if (stage === "DATA") {
      add("data.index", hasFile(pack, `data/${ns}/index/guns/${gun}.json`), `data/${ns}/index/guns/${gun}.json exists`);
      add("data.data", hasFile(pack, `data/${ns}/data/guns/${gun}_data.json`), `data/${ns}/data/guns/${gun}_data.json exists`);
      add("data.display", hasFile(pack, `assets/${ns}/display/guns/${gun}_display.json`), `assets/${ns}/display/guns/${gun}_display.json exists`);
    }
    if (stage === "REVIEW") {
      const reviewPath = findReview(state);
      add("review.file", Boolean(reviewPath), reviewPath ? `review: ${path.relative(root, reviewPath)}` : "reviews/<gun>.json is missing");
      if (reviewPath) {
        const review = maybeJson(reviewPath, "review");
        add("review.json", Boolean(review), "review JSON parses");
        add("review.ok", review?.ok === true, "review.ok is true");
        add("review.blockers", Array.isArray(review?.blockers) && review.blockers.length === 0, "review.blockers is empty");
        add("review.hash", typeof review?.pack_hash === "string" && review.pack_hash === verification.fingerprint, "review.pack_hash matches the current pack");
        artifacts.review = { path: path.relative(root, reviewPath), sha256: hashFile(reviewPath) };
      }
    }
    if (stage === "PACKAGE") {
      const zip = path.join(root, "output", `${gun}.zip`);
      const size = fs.existsSync(zip) ? fs.statSync(zip).size : 0;
      add("package.zip", size > 0, `output/${gun}.zip exists and is non-empty`);
      artifacts.zip = { path: `output/${gun}.zip`, bytes: size };
    }
  }

  return { ok: errors.length === 0, stage, owner: STAGE_OWNERS[stage], checks, errors, fingerprint: artifacts.pack?.fingerprint ?? null, artifacts };
}

/** Returns the state plus its current gate. */
export function statusBuild(projectRoot, gunId) {
  const state = loadBuild(projectRoot, gunId);
  return { state: buildSummary(state), gate: gateFor(state), file: buildPath(state.project_root, gunId) };
}

/**
 * Advances one stage only when its gate passes and the caller owns it.
 *
 * @returns {{ok: boolean, stage: string, gate: object, state: object}} result.
 */
export function advanceBuild({ project_root, gun_id, stage, owner, artifacts = {} }) {
  const state = loadBuild(project_root, gun_id);
  if (state.status === "done" || state.stage === "DONE") throw new Error("Build is already done.");
  if (stage !== state.stage) throw new Error(`Current stage is ${state.stage}, not ${stage}.`);
  const expectedOwner = STAGE_OWNERS[state.stage];
  if (owner !== expectedOwner) throw new Error(`Stage ${stage} is owned by "${expectedOwner}", not "${owner}".`);
  const gate = gateFor(state);
  state.gates[state.stage] = gate;
  if (!gate.ok) {
    state.status = "blocked";
    state.blocked_reason = gate.errors.join("; ");
    saveBuild(state);
    return { ok: false, stage: state.stage, gate, state: buildSummary(state) };
  }
  state.history.push({ stage: state.stage, owner, at: new Date().toISOString(), artifacts: { ...gate.artifacts, ...artifacts } });
  state.blocked_reason = undefined;
  state.stage = NEXT_STAGE[state.stage];
  state.status = state.stage === "READY" ? "ready" : "active";
  saveBuild(state);
  return { ok: true, stage: state.stage, gate, state: buildSummary(state) };
}

/** Reopens a build to an earlier stage after a stale artifact or review. */
export function reopenBuild({ project_root, gun_id, stage, reason }) {
  const state = loadBuild(project_root, gun_id);
  if (!BUILD_STAGES.includes(stage) || stage === "READY" || stage === "DONE") throw new Error(`Cannot reopen to ${stage}.`);
  const current = BUILD_STAGES.indexOf(state.stage);
  const target = BUILD_STAGES.indexOf(stage);
  if (target >= current) throw new Error(`Cannot reopen forward: current ${state.stage}, target ${stage}.`);
  state.history.push({ stage: `REOPEN:${state.stage}->${stage}`, owner: "lead", at: new Date().toISOString(), note: reason ?? "reopened" });
  state.stage = stage;
  state.status = "active";
  state.blocked_reason = undefined;
  saveBuild(state);
  return { ok: true, stage: state.stage, gate: gateFor(state), state: buildSummary(state) };
}

/** Re-runs the current gate after a blocked failure. */
export function resumeBuild({ project_root, gun_id }) {
  const state = loadBuild(project_root, gun_id);
  if (state.status === "done" || state.stage === "DONE") return { ok: true, done: true, state: buildSummary(state) };
  const gate = gateFor(state);
  state.gates[state.stage] = gate;
  if (gate.ok) {
    state.status = state.stage === "READY" ? "ready" : "active";
    state.blocked_reason = undefined;
  } else {
    state.status = "blocked";
    state.blocked_reason = gate.errors.join("; ");
  }
  saveBuild(state);
  return { ok: gate.ok, stage: state.stage, gate, state: buildSummary(state) };
}

/** Records the human in-game acceptance after READY. */
export function ackBuild({ project_root, gun_id, confirmed, note }) {
  const state = loadBuild(project_root, gun_id);
  if (state.stage !== "READY" || state.status !== "ready") throw new Error("Build is not READY; finish PACKAGE and the human gate first.");
  if (confirmed !== true) throw new Error("tacz_build ack needs confirmed=true after the in-game test.");
  state.history.push({ stage: "HUMAN_GATE", owner: "human", at: new Date().toISOString(), note: note ?? "in-game test accepted" });
  state.stage = "DONE";
  state.status = "done";
  saveBuild(state);
  return { ok: true, state: buildSummary(state) };
}
