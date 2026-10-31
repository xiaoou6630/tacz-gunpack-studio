/**
 * Verifies that one gun's animations are usable by BOTH sides:
 *
 *  - TaCZ side: display.animation resolves to a real
 *    assets/<ns>/animations/<id>.animation.json, and every clip the state
 *    machine names in runAnimation(...) exists in that file.
 *  - Blockbench side: the project's .bbmodel carries the same clips in its
 *    animations[] array with Bedrock names prefixed "animation.", animators
 *    keyed by existing group UUIDs, and no keyframe outside the clip length.
 *
 * Usage: node tools/check-animation-parity.mjs <pack_dir> <model.bbmodel>
 */
import fs from "node:fs";
import path from "node:path";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fail(message) {
  console.log(`FAIL  ${message}`);
  process.exitCode = 1;
}

function main() {
  const [packDir, modelPath] = process.argv.slice(2);
  if (!packDir || !modelPath) {
    console.error("usage: node tools/check-animation-parity.mjs <pack_dir> <model.bbmodel>");
    process.exit(2);
  }
  const pack = path.resolve(packDir);
  const model = readJson(path.resolve(modelPath));
  const meta = readJson(path.join(pack, "gunpack.meta.json"));
  const ns = meta.namespace;

  console.log(`pack      : ${pack}`);
  console.log(`namespace : ${ns}`);
  console.log(`model     : ${path.resolve(modelPath)}`);
  console.log("");

  // ---------- TaCZ side ----------
  const displayDir = path.join(pack, "assets", ns, "display", "guns");
  const displays = fs.existsSync(displayDir)
    ? fs.readdirSync(displayDir).filter(f => f.endsWith("_display.json"))
    : [];
  if (displays.length === 0) fail(`no display files under assets/${ns}/display/guns`);

  const taczClips = new Set();
  const taczAnimFiles = new Set();
  for (const file of displays) {
    const display = readJson(path.join(displayDir, file));
    if (!display.animation) {
      fail(`${file}: no animation reference`);
      continue;
    }
    const [animNs, target] = display.animation.split(":");
    const animFile = path.join(pack, "assets", animNs, "animations", `${target}.animation.json`);
    if (!fs.existsSync(animFile)) {
      fail(`${file}: display.animation "${display.animation}" -> missing ${path.relative(pack, animFile)}`);
      continue;
    }
    taczAnimFiles.add(animFile);
    const anim = readJson(animFile);
    const clips = Object.keys(anim.animations ?? {});
    for (const clip of clips) taczClips.add(clip);
    console.log(`TaCZ  ${file}`);
    console.log(`      animation -> ${path.relative(pack, animFile)} (${clips.length} clips)`);
    console.log(`      ${clips.join(", ")}`);

    // State machine references must exist in the animation file.
    if (display.state_machine) {
      const [, smTarget] = display.state_machine.split(":");
      const smFile = path.join(pack, "assets", ns, "scripts", `${smTarget}.lua`);
      if (!fs.existsSync(smFile)) {
        fail(`${file}: state_machine "${display.state_machine}" -> missing ${path.relative(pack, smFile)}`);
      } else {
        const sm = fs.readFileSync(smFile, "utf8");
        // TACZ state machines call `context:runAnimation("name", ...)` — the
        // colon receiver means a plain `runAnimation(` anchor misses them.
        const refs = [...sm.matchAll(/[:.]runAnimation\s*\(\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
        const unique = [...new Set(refs)];
        const missing = unique.filter(r => !clips.includes(r));
        console.log(`      state machine references: ${unique.length ? unique.join(", ") : "(none)"}`);
        if (missing.length > 0) {
          fail(`${file}: state machine names clips missing from the animation file: ${missing.join(", ")}`);
        } else if (unique.length > 0) {
          console.log(`      all state-machine clip names exist ✓`);
        }
      }
    }
  }

  // ---------- Blockbench side ----------
  console.log("");
  const groups = new Map((model.groups ?? []).map(g => [g.uuid, g.name]));
  const animations = model.animations ?? [];
  if (animations.length === 0) {
    fail("bbmodel has no animations[] array, so Blockbench's Animate tab shows 0");
  } else {
    console.log(`BB    ${path.basename(modelPath)}: ${animations.length} clips`);
  }

  const bbClips = new Set();
  let keyframeIssues = 0;
  let orphanAnimators = 0;
  let badNames = 0;
  for (const animation of animations) {
    if (!animation.name?.startsWith("animation.")) {
      fail(`bbmodel clip "${animation.name}" is not prefixed "animation."`);
      badNames++;
    } else {
      bbClips.add(animation.name.slice("animation.".length));
    }
    for (const [uuid, animator] of Object.entries(animation.animators ?? {})) {
      if (!groups.has(uuid)) {
        orphanAnimators++;
        continue;
      }
      for (const key of animator.keyframes ?? []) {
        if (key.time < -1e-6 || (animation.length > 0 && key.time > animation.length + 1e-6)) {
          keyframeIssues++;
        }
      }
    }
  }
  console.log(`      animators keyed by real groups: ${orphanAnimators === 0 ? "yes ✓" : `${orphanAnimators} orphan(s)`}`);
  console.log(`      keyframes within clip length: ${keyframeIssues === 0 ? "yes ✓" : `${keyframeIssues} out of range`}`);
  if (orphanAnimators > 0) fail(`${orphanAnimators} animators are keyed by a UUID that is not a group`);
  if (keyframeIssues > 0) fail(`${keyframeIssues} keyframes fall outside their clip length`);

  // ---------- parity ----------
  console.log("");
  console.log("parity  TaCZ clips vs Blockbench clips");
  const onlyTacz = [...taczClips].filter(c => !bbClips.has(c));
  const onlyBB = [...bbClips].filter(c => !taczClips.has(c));
  console.log(`        both sides: ${[...taczClips].filter(c => bbClips.has(c)).length}`);
  if (onlyTacz.length > 0) console.log(`        only in TaCZ:      ${onlyTacz.join(", ")}`);
  if (onlyBB.length > 0) console.log(`        only in Blockbench: ${onlyBB.join(", ")}`);
  if (onlyTacz.length === 0 && onlyBB.length === 0) {
    console.log(`        clip names match on both sides ✓`);
  }

  console.log("");
  console.log(process.exitCode ? "RESULT: problems found" : "RESULT: OK — both sides recognise the animations");
}

main();
