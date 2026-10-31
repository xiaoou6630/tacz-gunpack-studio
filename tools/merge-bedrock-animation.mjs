/**
 * Merge a Bedrock `*.animation.json` into a `.bbmodel` so Blockbench's
 * Animate tab shows the clips.
 *
 * Why this exists: TACZ ships animations as standalone
 * `assets/<ns>/animations/<id>.animation.json`. Blockbench cannot import
 * that file directly — its animation importer expects a bbmodel-shaped
 * `animations[]` array, and importing a bare Bedrock file yields
 * "The model has no animations." So we convert and merge.
 *
 * Conversion rules were derived by diffing the official DP-12 project
 * (`ai枪包/DP-12.bbmodel`) against its source
 * `dp12.animation.json`, not guessed:
 *
 *   name          "static_idle"        -> "animation.static_idle"
 *   loop          true                 -> "loop"
 *                 false                -> "once"
 *   length        animation_length     -> length
 *   bone keys     "AKM"                -> animators[<group uuid>]
 *   rotation      [x, y, z]            -> data_points x = -x, y, z unchanged
 *                 (both keyframed and constant channels)
 *   position      keyframed [x,y,z]    -> x, y, z unchanged
 *                 constant  [x,y,z]    -> all three negated
 *   scale         [x, y, z]            -> x, y, z unchanged
 *
 * Usage: node tools/merge-bedrock-animation.mjs <model.bbmodel> <clip.animation.json>
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Deterministic UUID so re-running the merge does not churn the file. */
function uuidFor(seed) {
  const h = crypto.createHash("sha256").update(seed).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    h.slice(12, 16),
    h.slice(16, 20),
    h.slice(20, 32),
  ].join("-");
}

/** Walks the outliner and collects every group with its absolute depth. */
function collectGroups(model) {
  const byUuid = new Map();
  for (const group of model.groups ?? []) byUuid.set(group.uuid, group);
  const byName = new Map();
  for (const group of model.groups ?? []) {
    if (!byName.has(group.name)) byName.set(group.name, group);
  }
  return { byUuid, byName };
}

/**
 * Bedrock rotation -> bbmodel rotation.
 *
 * Source of truth is Blockbench's own `compileBedrockKeyframe` (the export
 * direction) in js/animations/keyframe.js:
 *
 *   if (this.channel == 'rotation') {
 *     array[0] = invertMolang(array[0]);
 *     array[1] = invertMolang(array[1]);
 *   }
 *
 * The same negate-two-axes transform is its own inverse, so applying it
 * imports a Bedrock file exactly as Blockbench would export it back.
 */
function rotationPoint(value) {
  return { x: String(-value[0]), y: String(-value[1]), z: String(value[2]) };
}

/**
 * Bedrock position -> bbmodel position.
 *
 * Same source: only array[0] is inverted for position.
 *
 *   if (this.channel == 'position') {
 *     array[0] = invertMolang(array[0]);
 *   }
 */
function positionPoint(value) {
  return { x: String(-value[0]), y: String(value[1]), z: String(value[2]) };
}

/** Bedrock scale -> bbmodel scale: unchanged (Blockbench does not flip scale). */
function scalePoint(value) {
  return { x: String(value[0]), y: String(value[1]), z: String(value[2]) };
}

/** True when a channel is a constant triple rather than a time map. */
function isConstantChannel(channel) {
  return Array.isArray(channel) && channel.length === 3 && channel.every(v => typeof v === "number");
}

/** True when a channel is a time -> triple map. */
function isKeyframedChannel(channel) {
  return channel !== null && typeof channel === "object" && !Array.isArray(channel);
}

/** Builds one bbmodel animator from a Bedrock bone entry. */
function buildAnimator(boneName, bone, clipName, groupUuid) {
  const keyframes = [];
  const push = (channel, time, point) => {
    keyframes.push({
      channel,
      data_points: [point],
      uuid: uuidFor(`${clipName}|${boneName}|${channel}|${time}`),
      time: Number(time),
      color: -1,
      interpolation: "linear",
    });
  };

  const rotation = bone.rotation;
  if (isConstantChannel(rotation)) {
    push("rotation", 0, rotationPoint(rotation));
  } else if (isKeyframedChannel(rotation)) {
    for (const [time, value] of Object.entries(rotation)) {
      if (!Array.isArray(value)) continue;
      push("rotation", time, rotationPoint(value));
    }
  }

  const position = bone.position;
  if (isConstantChannel(position)) {
    push("position", 0, positionPoint(position));
  } else if (isKeyframedChannel(position)) {
    for (const [time, value] of Object.entries(position)) {
      if (!Array.isArray(value)) continue;
      push("position", time, positionPoint(value));
    }
  }

  const scale = bone.scale;
  if (isConstantChannel(scale)) {
    push("scale", 0, scalePoint(scale));
  } else if (isKeyframedChannel(scale)) {
    for (const [time, value] of Object.entries(scale)) {
      if (!Array.isArray(value)) continue;
      push("scale", time, scalePoint(value));
    }
  }

  // Blockbench groups keyframes by channel first, then by time: a bone with
  // rotation@0/0.9/1.8 and position@0/0.9/1.8 is stored as
  // rotation@0, rotation@0.9, rotation@1.8, position@0, position@0.9, position@1.8
  // — not interleaved by time. Verified against ai枪包/DP-12.bbmodel, which
  // loads its animations in Blockbench's Animate tab.
  const CHANNEL_ORDER = { rotation: 0, position: 1, scale: 2 };
  keyframes.sort((a, b) => CHANNEL_ORDER[a.channel] - CHANNEL_ORDER[b.channel] || a.time - b.time);

  const animator = {
    name: boneName,
    type: "bone",
    rotation_global: false,
    quaternion_interpolation: false,
  };
  if (keyframes.length > 0) animator.keyframes = keyframes;
  return { groupUuid, animator };
}

/** Converts one Bedrock clip into a bbmodel animation object. */
function convertClip(clipName, clip, model, groups) {
  const animators = {};
  const missing = [];
  const bones = clip.bones ?? {};

  for (const [boneName, bone] of Object.entries(bones)) {
    const group = groups.byName.get(boneName);
    if (!group) {
      missing.push(boneName);
      continue;
    }
    const { animator } = buildAnimator(boneName, bone, clipName, group.uuid);
    animators[group.uuid] = animator;
  }

  // Every remaining group still gets an empty animator, matching how
  // Blockbench writes its own bbmodels (DP-12 has empty animators for
  // camera, root, bone2, positioning, ...).
  for (const group of model.groups ?? []) {
    if (!animators[group.uuid]) {
      animators[group.uuid] = {
        name: group.name,
        type: "bone",
        rotation_global: false,
        quaternion_interpolation: false,
      };
    }
  }

  const animation = {
    uuid: uuidFor(`clip|${clipName}`),
    name: `animation.${clipName}`,
    loop: clip.loop === true ? "loop" : "once",
    override: false,
    length: Number(clip.animation_length ?? 0),
    snapping: 10,
    selected: false,
    saved: false,
    path: "",
    scope: 0,
    anim_time_update: "",
    blend_weight: "",
    start_delay: "",
    loop_delay: "",
    animators,
  };
  return { animation, missing };
}

/** Reads JSON or throws with a useful message. */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Merges and writes back. */
function main() {
  const [modelPath, clipPath] = process.argv.slice(2);
  if (!modelPath || !clipPath) {
    console.error("usage: node tools/merge-bedrock-animation.mjs <model.bbmodel> <clip.animation.json>");
    process.exit(2);
  }

  const model = readJson(modelPath);
  const source = readJson(clipPath);
  if (!source.animations || typeof source.animations !== "object") {
    throw new Error(`${clipPath} has no "animations" object; not a Bedrock animation file.`);
  }

  const groups = collectGroups(model);
  model.animations = Array.isArray(model.animations) ? model.animations : [];

  const merged = [];
  const allMissing = [];
  for (const [clipName, clip] of Object.entries(source.animations)) {
    const { animation, missing } = convertClip(clipName, clip, model, groups);
    if (missing.length > 0) allMissing.push(`${clipName}: ${missing.join(", ")}`);
    const existing = model.animations.findIndex(a => a.name === animation.name);
    if (existing >= 0) model.animations[existing] = animation;
    else model.animations.push(animation);
    merged.push(animation.name);
  }

  fs.writeFileSync(modelPath, `${JSON.stringify(model, null, "\t")}\n`, "utf8");

  console.log(`merged ${merged.length} clips into ${path.basename(modelPath)}`);
  for (const name of merged) console.log(`  ${name}`);
  if (allMissing.length > 0) {
    console.log("");
    console.log("WARNING: these animated bones have no matching group, so they were skipped:");
    for (const line of allMissing) console.log(`  ${line}`);
    process.exitCode = 1;
  }
}

main();
