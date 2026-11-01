/**
 * Adds the missing hand cubes to a TACZ gun's lefthand_pos / righthand_pos.
 *
 * TACZ positions the player's arms from the geometry inside those two anchors.
 * They are not decorative empty groups: official m1911 puts a 3x12x4 cube in
 * each, and deagle does the same. A gun whose anchors are empty floats in front
 * of the camera with no hands and the wrong angle — nagant_m1895's model is
 * 2.25 units wide on X while the official pistols measure 13-14, and that gap is
 * almost entirely the hand cubes.
 *
 * The cube is sized to match the official Steve arm (3 wide, 12 long, 4 deep)
 * and placed so it hangs below the anchor pivot, which is how the official packs
 * orient it. The UV is left at the cube's own box so the atlas pass can assign it
 * normally.
 *
 * Usage: node tools/add-hand-cubes.mjs <geo.json> [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";

const [geoFile, ...flags] = process.argv.slice(2);
if (!geoFile) {
  console.error("usage: node tools/add-hand-cubes.mjs <geo.json> [--dry-run]");
  process.exit(2);
}
const dryRun = flags.includes("--dry-run");

const doc = JSON.parse(fs.readFileSync(geoFile, "utf8"));
const geometry = doc["minecraft:geometry"]?.[0];
if (!geometry) {
  console.error("no minecraft:geometry found");
  process.exit(1);
}
const bones = geometry.bones ?? [];

// Steve's arm as the official packs model it.
const HAND_SIZE = [3, 12, 4];

/** Finds the bone that owns the anchor, so the hand hangs from it. */
function anchorFor(name) {
  return bones.find(b => b.name === name);
}

const added = [];
for (const name of ["lefthand_pos", "righthand_pos"]) {
  const bone = anchorFor(name);
  if (!bone) {
    console.log(`skip ${name}: bone not present`);
    continue;
  }
  if ((bone.cubes ?? []).length > 0) {
    console.log(`skip ${name}: already has ${bone.cubes.length} cube(s)`);
    continue;
  }
  // Use the PARENT bone's pivot: the anchor's own pivot is usually [0,8,0] for
  // both hands, so placing from it puts the two arms on top of each other.
  // lefthand sits at [6,19,0] and righthand at [-6,19,0] in nagant_m1895.
  const parent = bones.find(b => b.name === bone.parent);
  const pivot = parent?.pivot ?? bone.pivot ?? [0, 0, 0];
  const origin = [
    pivot[0] - HAND_SIZE[0] / 2,
    pivot[1] - HAND_SIZE[1],
    pivot[2] - HAND_SIZE[2] / 2,
  ];
  bone.cubes = [{ origin, size: HAND_SIZE, uv: [0, 0] }];
  added.push(`${name}: cube ${HAND_SIZE.join("x")} at ${origin.map(n => n.toFixed(2)).join(",")} (from ${parent?.name ?? "own"} pivot)`);
}

if (added.length === 0) {
  console.log("nothing to add");
  process.exit(0);
}

if (!dryRun) {
  // Keep the file's own formatting conventions: the pack ships 2-space JSON.
  fs.writeFileSync(geoFile, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

console.log(`${dryRun ? "would add" : "added"} ${added.length} hand cube(s):`);
for (const line of added) console.log(`  ${line}`);
console.log(`file: ${path.relative(process.cwd(), geoFile)}`);
