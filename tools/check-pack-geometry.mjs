/**
 * Geometry and texture self-check for a TACZ gun pack, in plain Node.
 *
 * DP-12 was built by scripting the checks instead of eyeballing screenshots:
 * every pass ended with a script that re-read the exported files and printed
 * numbers. That is the habit worth copying, but the original scripts were
 * Python with Pillow — an extra runtime the user may not have. This does the
 * same work with node:fs and node:zlib only, so `tacz_gun` users need nothing
 * beyond the Node that DSH already requires.
 *
 * Checks:
 *   - co-planar same-normal face pairs (they flicker when the camera moves)
 *   - disconnected sub-components (parts floating off the body)
 *   - UV rectangle uniqueness and bounds
 *   - texture distinct colours and atlas coverage
 *   - cube count against the official range
 *
 * Usage: node tools/check-pack-geometry.mjs <pack_dir> <gun_id>
 * Exit code 1 when a hard check fails, so a skill step can gate on it.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const [packDir, gunId] = process.argv.slice(2);
if (!packDir || !gunId) {
  console.error("usage: node tools/check-pack-geometry.mjs <pack_dir> <gun_id>");
  process.exit(2);
}

const meta = JSON.parse(fs.readFileSync(path.join(packDir, "gunpack.meta.json"), "utf8"));
const ns = meta.namespace;
const geoPath = path.join(packDir, "assets", ns, "geo_models", "gun", `${gunId}_geo.json`);
const uvPath = path.join(packDir, "assets", ns, "textures", "gun", "uv", `${gunId}.png`);

const problems = [];
const warnings = [];
const report = (ok, label, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(26)} ${detail}`);
  if (!ok) problems.push(`${label}: ${detail}`);
};
/**
 * Advisory checks. A hand-authored pack that passed review can still show
 * co-planar pairs and floating sub-parts — KSG does, with 8 minor findings and
 * ok=true — so these inform, they do not block.
 */
const advise = (ok, label, detail) => {
  console.log(`  ${ok ? "PASS" : "WARN"}  ${label.padEnd(26)} ${detail}`);
  if (!ok) warnings.push(`${label}: ${detail}`);
};

// ---------------------------------------------------------------- geometry
const geo = JSON.parse(fs.readFileSync(geoPath, "utf8"))["minecraft:geometry"][0];
const atlasWidth = geo.description?.texture_width ?? 128;
const atlasHeight = geo.description?.texture_height ?? 128;
const cubes = [];
for (const bone of geo.bones ?? []) {
  for (const cube of bone.cubes ?? []) cubes.push({ bone: bone.name, ...cube });
}

console.log(`geometry: ${path.relative(packDir, geoPath)}`);
report(true, "cubes", `${cubes.length} (official high-poly: 273-761)`);
report(cubes.length >= 120, "cube_count", `${cubes.length} cubes; below 120 is LOD-grade`);
console.log(`  note  atlas is ${atlasWidth}x${atlasHeight}`);

// lefthand_pos and righthand_pos are not empty anchors: TACZ places the player's
// arms from the geometry inside them. Official m1911 and deagle each put a
// 3x12x4 hand cube there. An empty pair makes the gun float in front of the
// camera with no hands and the wrong angle — how nagant_m1895 shipped, with an
// X extent of 2.25 against the official pistols' 13-14.
const handBones = ["lefthand_pos", "righthand_pos"];
const emptyHands = handBones.filter(name => {
  const bone = (geo.bones ?? []).find(b => b.name === name);
  return !bone || (bone.cubes ?? []).length === 0;
});
report(emptyHands.length === 0, "hand_anchors", emptyHands.length === 0 ? "both hand anchors carry a hand cube" : `${emptyHands.join(" and ")} hold no geometry, so the arms cannot be positioned and the gun will float`);

/** Axis-aligned box from origin+size. */
function box(cube) {
  const [ox, oy, oz] = cube.origin;
  const [sx, sy, sz] = cube.size;
  return { x0: Math.min(ox, ox + sx), x1: Math.max(ox, ox + sx), y0: Math.min(oy, oy + sy), y1: Math.max(oy, oy + sy), z0: Math.min(oz, oz + sz), z1: Math.max(oz, oz + sz) };
}

// Co-planar same-facing faces flicker. Compare every pair on each axis plane.
const boxes = cubes.map(box);
let coplanar = 0;
for (let i = 0; i < boxes.length; i++) {
  for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i];
    const b = boxes[j];
    const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    const overlapZ = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    // Same X plane, overlapping in Y and Z.
    if (overlapY > 0.01 && overlapZ > 0.01 && (Math.abs(a.x0 - b.x0) < 1e-4 || Math.abs(a.x1 - b.x1) < 1e-4)) coplanar++;
    if (overlapX > 0.01 && overlapZ > 0.01 && (Math.abs(a.y0 - b.y0) < 1e-4 || Math.abs(a.y1 - b.y1) < 1e-4)) coplanar++;
    if (overlapX > 0.01 && overlapY > 0.01 && (Math.abs(a.z0 - b.z0) < 1e-4 || Math.abs(a.z1 - b.z1) < 1e-4)) coplanar++;
  }
}
advise(coplanar === 0, "coplanar_faces", coplanar === 0 ? "no co-planar same-facing pairs" : `${coplanar} pairs share a plane and may flicker`);

// Disconnected sub-components are only a defect *within one bone*: a magazine
// or a bolt is legitimately separate from the receiver, but a part that floats
// off its own bone reads as a modelling mistake. Compare per bone, not globally.
let floating = 0;
const byBone = new Map();
for (const cube of cubes) {
  if (!byBone.has(cube.bone)) byBone.set(cube.bone, []);
  byBone.get(cube.bone).push(box(cube));
}
function touches(a, b) {
  const gap = (p0, p1, q0, q1) => Math.max(0, Math.max(p0, q0) - Math.min(p1, q1));
  return gap(a.x0, a.x1, b.x0, b.x1) < 1e-4 && gap(a.y0, a.y1, b.y0, b.y1) < 1e-4 && gap(a.z0, a.z1, b.z0, b.z1) < 1e-4;
}
for (const [bone, list] of byBone) {
  if (list.length < 2) continue;
  const parent = list.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (touches(list[i], list[j])) parent[find(i)] = find(j);
    }
  }
  const parts = new Set(list.map((_, i) => find(i))).size;
  if (parts > 1) floating++;
}
advise(floating === 0, "connected", floating === 0 ? "every bone's cubes form one piece" : `${floating} bone(s) contain floating parts`);

// A near-miss gap reads as a seam the player can see through. Only parts on
// DIFFERENT bones count: neighbouring cubes on one bone are meant to abut, so
// a 0.05-unit step there is a detail, not a break. nagant_m1895 has a real one —
// the barrel stops at Z -5.30 and the underlug starts at -5.10.
const SEAM_MIN = 0.05;
const SEAM_MAX = 0.5;
let seams = 0;
const seamSamples = [];
for (let i = 0; i < boxes.length; i++) {
  for (let j = i + 1; j < boxes.length; j++) {
    if (cubes[i].bone === cubes[j].bone) continue;
    const a = boxes[i];
    const b = boxes[j];
    // Overlap on two axes and a small gap on the third.
    const gaps = [
      { g: Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), oy: Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0), oz: Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) },
      { g: Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)), oy: Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz: Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) },
      { g: Math.max(0, Math.max(a.z0, b.z0) - Math.min(a.z1, b.z1)), oy: Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz: Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) },
    ];
    for (const { g, oy, oz } of gaps) {
      // Both other axes must overlap substantially, otherwise it is a diagonal
      // offset rather than a seam.
      if (g >= SEAM_MIN && g <= SEAM_MAX && oy > 0.3 && oz > 0.3) {
        seams++;
        if (seamSamples.length < 3) seamSamples.push(`${cubes[i].bone}↔${cubes[j].bone} ${g.toFixed(2)}u`);
        break;
      }
    }
  }
}
advise(seams === 0, "seam_gaps", seams === 0 ? "no near-miss gaps between parts" : `${seams} part pair(s) stop 0.05–0.5u apart and will read as detached (${seamSamples.join("; ")})`);

// A part built by slicing one slab into many offset layers produces a staircase.
// Real parts are one continuous shape or a few rotated blocks. nagant_m1895 has
// 14 grip_core layers: each is 1.607u deep but shifted only 0.109u on Z, so 93%
// of every layer is buried and the exposed surface reads as steps.
//
// The tell is a slice whose shift along the stacking axis is small compared with
// its own extent on that axis. Comparing the shift to the slice's *height* is
// wrong: grip_core shifts 0.109 against a 0.336 height, a ratio of 0.32, which
// slips past any threshold tight enough to be useful.
const prefixes = new Map();
for (const cube of cubes) {
  const match = /^([a-z0-9_]+)_(\d{2,})$/.exec(cube.name ?? "");
  if (!match) continue;
  if (!prefixes.has(match[1])) prefixes.set(match[1], []);
  prefixes.get(match[1]).push(cube);
}
const staircases = [];
for (const [prefix, list] of prefixes) {
  if (list.length < 8) continue;
  const sorted = list.slice().sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  // The stacking axis is the one where consecutive layers are flush: each layer
  // starts where the previous ends. The other axes are where the staircase
  // actually shows, because each layer is shifted sideways by a fraction of
  // its own length.
  const axes = [0, 1, 2].map(idx => {
    const values = sorted.map(c => c.origin?.[idx] ?? 0);
    const range = Math.max(...values) - Math.min(...values);
    // Is this axis a clean stack? Layers may run in either direction, so compare
    // the near and far faces of each pair rather than assuming ascending order.
    const flush = sorted.every((c, i) => {
      if (i === 0) return true;
      const a = sorted[i - 1];
      const aLo = Math.min(a.origin?.[idx] ?? 0, (a.origin?.[idx] ?? 0) + (a.size?.[idx] ?? 0));
      const aHi = Math.max(a.origin?.[idx] ?? 0, (a.origin?.[idx] ?? 0) + (a.size?.[idx] ?? 0));
      const bLo = Math.min(c.origin?.[idx] ?? 0, (c.origin?.[idx] ?? 0) + (c.size?.[idx] ?? 0));
      const bHi = Math.max(c.origin?.[idx] ?? 0, (c.origin?.[idx] ?? 0) + (c.size?.[idx] ?? 0));
      // Abutting means one ends exactly where the other begins.
      return Math.abs(aHi - bLo) < 0.05 || Math.abs(bHi - aLo) < 0.05;
    });
    return { idx, range, flush };
  });
  const stackAxis = axes.find(a => a.flush && a.range > 0);
  if (!stackAxis) continue;

  // On the remaining axes, how far does each layer step sideways compared with
  // its own length there?
  let worstRatio = 1;
  let worstAxis = null;
  for (const other of axes) {
    if (other.idx === stackAxis.idx) continue;
    const shifts = [];
    const extents = [];
    for (let i = 1; i < sorted.length; i++) {
      shifts.push(Math.abs((sorted[i].origin?.[other.idx] ?? 0) - (sorted[i - 1].origin?.[other.idx] ?? 0)));
      extents.push(Math.abs(sorted[i].size?.[other.idx] ?? 0));
    }
    const avgShift = shifts.reduce((s, v) => s + v, 0) / shifts.length;
    const avgExtent = extents.reduce((s, v) => s + v, 0) / extents.length;
    if (avgShift > 0.01 && avgExtent > 0) {
      const ratio = avgShift / avgExtent;
      if (ratio < worstRatio) {
        worstRatio = ratio;
        worstAxis = { axis: ["x", "y", "z"][other.idx], avgShift, avgExtent };
      }
    }
  }
  if (worstAxis && worstRatio < 0.5) {
    staircases.push(`${prefix} (${sorted.length} layers stepped ${worstAxis.avgShift.toFixed(3)}u on ${worstAxis.axis} against a ${worstAxis.avgExtent.toFixed(2)}u slice, ${Math.round(worstRatio * 100)}% exposed)`);
  }
}
advise(staircases.length === 0, "staircase", staircases.length === 0 ? "no sliced-layer parts" : `${staircases.length} part(s) built by slicing one slab into offset layers: ${staircases.join("; ")}`);

// ---------------------------------------------------------------- texture
const png = decodePng(uvPath);
console.log("");
console.log(`texture: ${path.relative(packDir, uvPath)}`);
report(png.distinct >= 64, "distinct_colours", `${png.distinct} (minimum 64; official packs use 400+)`);
report(png.coverage >= 20, "atlas_coverage", `${png.coverage}% of the atlas carries pixels (minimum 20%)`);

// UV rectangles: unique, inside bounds, not degenerate.
const rects = [];
let maxU = 0;
let maxV = 0;
let outOfBounds = 0;
for (const cube of cubes) {
  const uv = cube.uv;
  if (Array.isArray(uv) && uv.length === 2) {
    rects.push(`${uv[0]},${uv[1]}`);
    maxV = Math.max(maxV, uv[1]);
    maxU = Math.max(maxU, uv[0]);
  } else if (uv && typeof uv === "object") {
    for (const face of Object.values(uv)) {
      if (!face || !face.uv) continue;
      const [u, v] = face.uv;
      const [w, h] = face.uv_size ?? [0, 0];
      if (u < 0 || v < 0 || u + w > atlasWidth || v + h > atlasHeight) outOfBounds++;
      maxU = Math.max(maxU, u + w);
      maxV = Math.max(maxV, v + h);
      rects.push(`${u},${v},${w},${h}`);
    }
  }
}
const unique = new Set(rects).size;
report(unique === rects.length, "uv_unique", `${unique} of ${rects.length} rectangles are unique`);
report(outOfBounds === 0, "uv_bounds", outOfBounds === 0 ? `all inside ${atlasWidth}x${atlasHeight}` : `${outOfBounds} outside the ${atlasWidth}x${atlasHeight} atlas`);

// Auto UV packs upward from v=0, so the bottom rows of the atlas often stay
// empty. KSG left 23% of its height unused and DP-12 left 26%; both shipped
// anyway, so this is advisory rather than a hard failure.
const usedHeight = maxV / atlasHeight * 100;
const usedWidth = maxU / atlasWidth * 100;
advise(usedHeight >= 85, "uv_fill", `UVs reach ${Math.round(usedHeight)}% of the atlas height and ${Math.round(usedWidth)}% of its width (${Math.round(100 - usedHeight)}% of the height unused)`);

// ---------------------------------------------------------------- animation
// A reload that pops rounds into existence without moving them in from outside
// reads as magic. nagant_m1895's reload_empty drives round_1 with scale 0 → 1
// between t=6.02 and t=6.07 and no position path from the loading gate, so the
// rounds appear rather than get loaded.
const animPath = path.join(packDir, "assets", ns, "animations", `${gunId}.animation.json`);
if (fs.existsSync(animPath)) {
  const anim = JSON.parse(fs.readFileSync(animPath, "utf8"));
  const clips = anim.animations ?? {};
  console.log("");
  console.log(`animation: ${path.relative(packDir, animPath)}`);

  /** Reads a channel's keyframe map into [time, value] pairs. */
  const keyframes = (channel) => {
    if (!channel) return [];
    if (Array.isArray(channel)) return [[0, channel]];
    return Object.entries(channel)
      .map(([t, v]) => [Number(t), Array.isArray(v) ? v : v.post ?? v.pre ?? [0, 0, 0]])
      .sort((a, b) => a[0] - b[0]);
  };

  const popIns = [];
  const reloadClips = Object.entries(clips).filter(([name]) => /reload/i.test(name));
  // The gun's body bounds, so "outside" can be judged.
  const bodyMinZ = Math.min(...boxes.map(b => b.z0));
  const bodyMaxZ = Math.max(...boxes.map(b => b.z1));
  const bodyMaxY = Math.max(...boxes.map(b => b.y1));
  for (const [clipName, clip] of Object.entries(clips)) {
    for (const [bone, channels] of Object.entries(clip.bones ?? {})) {
      // Only parts that are plausibly ammunition.
      if (!/round|bullet|shell|cartridge|ammo/i.test(bone)) continue;
      const scale = keyframes(channels.scale);
      if (scale.length < 2) continue;
      // The moment a part becomes visible.
      const appear = scale.find(([, v]) => v.every(n => n >= 0.99));
      if (!appear) continue;
      const wasHidden = scale.some(([t, v]) => t < appear[0] && v.every(n => n === 0));
      if (!wasHidden) continue;

      const position = keyframes(channels.position);
      const atAppear = position.filter(([t]) => t <= appear[0]).pop()?.[1] ?? [0, 0, 0];

      // Where does ammunition have to come from? For a gate-loaded revolver the
      // gate sits on the side of the frame, so a loaded round arrives from
      // outside the body along X. nagant_m1895's loading gate spans X ≈ -1.16
      // while its rounds appear at X offset -0.31 — straight above the cylinder,
      // nowhere near the gate. They scale into existence in place.
      const gateCubes = cubes.filter(c => /gate|loading/i.test(c.name ?? ""));
      const gateX = gateCubes.length
        ? gateCubes.reduce((s, c) => s + (c.origin?.[0] ?? 0), 0) / gateCubes.length
        : null;

      if (gateX !== null) {
        // The round must start on the gate side and move toward the centre.
        const startsAtGate = Math.abs(atAppear[0]) > Math.abs(gateX) * 0.5;
        const movesInward = position.some(([, v]) => Math.abs(v[0]) < Math.abs(atAppear[0]) - 0.2);
        if (!startsAtGate || !movesInward) {
          popIns.push(`${clipName}/${bone} appears at x=${atAppear[0].toFixed(2)} while the gate is at x=${gateX.toFixed(2)}`);
        }
      }
    }
  }
  advise(popIns.length === 0, "ammo_load_path", popIns.length === 0 ? "reload clips move ammunition into place" : `${popIns.length} part(s) become visible already inside the gun and never travel in, so the rounds appear instead of load (${popIns.slice(0, 3).join("; ")})`);

  // Every reload clip should involve at least one ammunition part — but only
  // when the model actually has ammunition parts to animate. A shotgun loads
  // shells the player holds, not rounds modelled inside the gun, and KSG ships
  // with no round bones at all, so a missing one here is not a defect.
  const hasAmmoBones = cubes.some(c => /round|bullet|shell|cartridge|ammo/i.test(c.name ?? ""));
  if (hasAmmoBones) {
    const emptyReloads = reloadClips.filter(([, clip]) => !Object.keys(clip.bones ?? {}).some(b => /round|bullet|shell|cartridge|ammo/i.test(b)));
    advise(emptyReloads.length === 0, "reload_has_ammo", emptyReloads.length === 0 ? "every reload clip animates ammunition" : `${emptyReloads.length} reload clip(s) never touch an ammunition part: ${emptyReloads.map(([n]) => n).join(", ")}`);
  }
}

// ---------------------------------------------------------------- verdict
console.log("");
if (problems.length === 0) {
  console.log("RESULT: geometry and texture pass");
} else {
  console.log(`RESULT: ${problems.length} problem(s)`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exitCode = 1;
}

/** Decodes a PNG with node:zlib only; returns colour count and coverage. */
function decodePng(file) {
  const buffer = fs.readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (bitDepth !== 8 || !channels) return { distinct: 0, coverage: 0 };
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  const colors = new Set();
  let covered = 0;
  let pos = 0;
  for (let row = 0; row < height; row++) {
    const filter = raw[pos++];
    raw.copy(current, 0, pos, pos + stride);
    pos += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? current[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;
      let v = current[i];
      if (filter === 1) v += left;
      else if (filter === 2) v += up;
      else if (filter === 3) v += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        v += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      current[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const base = x * channels;
      const alpha = channels === 4 ? current[base + 3] : channels === 2 ? current[base + 1] : 255;
      if (alpha === 0) continue;
      covered++;
      if (colorType === 2 || colorType === 6) colors.add((current[base] << 16) | (current[base + 1] << 8) | current[base + 2]);
      else colors.add(current[base]);
    }
    current.copy(previous);
  }
  return { distinct: colors.size, coverage: Math.round((covered / (width * height)) * 100) };
}
