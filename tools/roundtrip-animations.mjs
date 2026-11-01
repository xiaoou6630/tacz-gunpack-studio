/**
 * Answers one question with evidence: can the same animation data be used by
 * both Blockbench and TaCZ without loss?
 *
 * Round trip under test:
 *   TaCZ ksg.animation.json  ->  (merge-bedrock-animation)  ->  bbmodel
 *   bbmodel  ->  Blockbench's own bedrock codec compileFile  ->  Bedrock JSON
 *   Bedrock JSON  ->  compare against the original TaCZ file
 *
 * Differences that matter:
 *   - clip names: Blockbench writes "animation.<name>", TaCZ wants "<name>"
 *   - axis signs: the importer negates rotation x/y and position x; the
 *     exporter negates the same axes, so a round trip must cancel out
 *   - time keys: Blockbench writes "0.0" style floats, TaCZ writes the same
 *
 * Usage: node tools/roundtrip-animations.mjs <pack_dir> <gun_id>
 */
import fs from "node:fs";
import path from "node:path";

const [packDir, gunId] = process.argv.slice(2);
if (!packDir || !gunId) {
  console.error("usage: node tools/roundtrip-animations.mjs <pack_dir> <gun_id>");
  process.exit(2);
}

const meta = JSON.parse(fs.readFileSync(path.join(packDir, "gunpack.meta.json"), "utf8"));
const ns = meta.namespace;
const originalPath = path.join(packDir, "assets", ns, "animations", `${gunId}.animation.json`);
const original = JSON.parse(fs.readFileSync(originalPath, "utf8"));

console.log("TaCZ 源文件:", path.relative(packDir, originalPath));
console.log("片段数:", Object.keys(original.animations).length);
console.log("");

// The exported JSON is produced by the running Blockbench; this script only
// compares it, so it reads the file the caller wrote.
const exportedPath = process.argv[4];
if (!exportedPath) {
  console.error("usage: node tools/roundtrip-animations.mjs <pack_dir> <gun_id> <exported.json>");
  process.exit(2);
}
const exported = JSON.parse(fs.readFileSync(exportedPath, "utf8"));

/** Normalizes a channel to a sorted [time, x, y, z] list. */
function flattenChannel(channel) {
  if (Array.isArray(channel) && channel.every(v => typeof v === "number")) {
    return [[0, ...channel.map(Number)]];
  }
  return Object.entries(channel)
    .map(([time, point]) => [Number(time), ...point.map(Number)])
    .sort((a, b) => a[0] - b[0]);
}

let comparedChannels = 0;
const issues = [];

for (const [clipName, clip] of Object.entries(original.animations)) {
  // Blockbench prefixes every clip with "animation."; TaCZ does not.
  const bbName = `animation.${clipName}`;
  const out = exported.animations[bbName];
  if (!out) {
    issues.push(`${clipName}: Blockbench export is missing this clip`);
    continue;
  }

  const srcLoop = clip.loop === true;
  const outLoop = out.loop === true;
  if (srcLoop !== outLoop) {
    issues.push(`${clipName}: loop ${srcLoop} -> ${outLoop}`);
  }
  if (clip.animation_length !== out.animation_length) {
    issues.push(`${clipName}: length ${clip.animation_length} -> ${out.animation_length}`);
  }

  for (const [boneName, channels] of Object.entries(clip.bones ?? {})) {
    const outBone = out.bones?.[boneName];
    if (!outBone) {
      issues.push(`${clipName}/${boneName}: missing in export`);
      continue;
    }
    for (const channel of ["rotation", "position", "scale"]) {
      if (channels[channel] === undefined) continue;
      comparedChannels++;
      const a = flattenChannel(channels[channel]);
      const b = outBone[channel] === undefined ? [] : flattenChannel(outBone[channel]);
      if (a.length !== b.length) {
        issues.push(`${clipName}/${boneName}/${channel}: ${a.length} keys -> ${b.length} keys`);
        continue;
      }
      for (let i = 0; i < a.length; i++) {
        for (let axis = 0; axis < 4; axis++) {
          const delta = Math.abs(a[i][axis] - b[i][axis]);
          if (delta > 1e-4) {
            issues.push(
              `${clipName}/${boneName}/${channel} key${i} axis${axis}: ${a[i][axis]} -> ${b[i][axis]}`,
            );
          }
        }
      }
    }
  }
}

console.log("通道比对:", comparedChannels);
console.log("问题数:", issues.length);
console.log("");
if (issues.length === 0) {
  console.log("RESULT: 完全往返无损 — 同一份动画两边通用");
} else {
  for (const line of issues.slice(0, 25)) console.log(`  ${line}`);
  if (issues.length > 25) console.log(`  ... 另外 ${issues.length - 25} 条`);
}
