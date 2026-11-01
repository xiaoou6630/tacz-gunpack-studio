/**
 * Proves the new geometry-quality gate separates a good export from a broken
 * one, using the two real danuvia_43m builds as fixtures.
 *
 * The broken build never ran tacz_texture_init: every cube kept
 * `uv_offset = null`, so export collapsed all faces to `uv: [0,0]` and the
 * atlas was only 2% covered with 14 colours.
 *
 * Usage: node tools/verify-quality-gate.mjs <good_pack> <broken_pack>
 */
import path from "node:path";
import { gateFor, loadBuild } from "../packages/dsh-tacz-gunpack/lib/build-state.mjs";

const [goodPack, brokenPack] = process.argv.slice(2);
if (!goodPack || !brokenPack) {
  console.error("usage: node tools/verify-quality-gate.mjs <good_pack> <broken_pack>");
  process.exit(2);
}

/** Builds a minimal state object so gateFor can run without a build file. */
function stateFor(pack, projectRoot, gunId, namespace) {
  return {
    schema_version: 1,
    gun_id: gunId,
    namespace,
    project_root: projectRoot,
    pack_dir: pack,
    stage: "GEOMETRY",
    status: "active",
    history: [],
  };
}

function run(label, pack, projectRoot, gunId, namespace) {
  console.log(`\n=== ${label} ===`);
  console.log(`pack: ${pack}`);
  const gate = gateFor(stateFor(pack, projectRoot, gunId, namespace));
  for (const check of gate.checks) {
    if (!check.name.startsWith("quality.")) continue;
    console.log(`  ${check.ok ? "PASS" : "FAIL"}  ${check.name.padEnd(26)} ${check.detail}`);
  }
  const quality = gate.checks.filter(c => c.name.startsWith("quality."));
  const failed = quality.filter(c => !c.ok);
  console.log(`  verdict: ${failed.length === 0 ? "accepted" : `${failed.length} quality check(s) failed`}`);
  return { failed: failed.length, total: quality.length };
}

const good = run("GOOD BUILD (tacz_texture_init was run)", path.resolve(goodPack), path.resolve(path.dirname(goodPack), ".."), "danuvia_43m", "ww2_rare");
const broken = run("BROKEN BUILD (texture_init skipped)", path.resolve(brokenPack), path.resolve(path.dirname(brokenPack), ".."), "danuvia_43m", "ww2_rare");

console.log("\n=== result ===");
console.log(`good build  : ${good.failed === 0 ? "passes the gate" : "FAILS (unexpected)"}`);
console.log(`broken build: ${broken.failed > 0 ? "blocked by the gate" : "PASSES (gate is too loose)"}`);
const correct = good.failed === 0 && broken.failed > 0;
console.log(correct ? "the gate separates the two builds" : "the gate does NOT separate them");
if (!correct) process.exitCode = 1;
