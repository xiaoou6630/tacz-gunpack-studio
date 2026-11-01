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

// ---------------------------------------------------------------- texture
const png = decodePng(uvPath);
console.log("");
console.log(`texture: ${path.relative(packDir, uvPath)}`);
report(png.distinct >= 64, "distinct_colours", `${png.distinct} (minimum 64; official packs use 400+)`);
report(png.coverage >= 20, "atlas_coverage", `${png.coverage}% of the atlas carries pixels (minimum 20%)`);

// UV rectangles: unique, inside bounds, not degenerate.
const rects = [];
let outOfBounds = 0;
for (const cube of cubes) {
  const uv = cube.uv;
  if (Array.isArray(uv) && uv.length === 2) {
    rects.push(`${uv[0]},${uv[1]}`);
  } else if (uv && typeof uv === "object") {
    for (const face of Object.values(uv)) {
      if (!face || !face.uv) continue;
      const [u, v] = face.uv;
      const [w, h] = face.uv_size ?? [0, 0];
      if (u < 0 || v < 0 || u + w > atlasWidth || v + h > atlasHeight) outOfBounds++;
      rects.push(`${u},${v},${w},${h}`);
    }
  }
}
const unique = new Set(rects).size;
report(unique === rects.length, "uv_unique", `${unique} of ${rects.length} rectangles are unique`);
report(outOfBounds === 0, "uv_bounds", outOfBounds === 0 ? `all inside ${atlasWidth}x${atlasHeight}` : `${outOfBounds} outside the ${atlasWidth}x${atlasHeight} atlas`);

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
