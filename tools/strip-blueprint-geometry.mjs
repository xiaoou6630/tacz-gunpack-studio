/**
 * Converts a blueprint that has cube geometry baked into it back into a work
 * order.
 *
 * The BLUEPRINT gate only checks that `parts` and `bones` are non-empty
 * arrays. Nothing reads `parts[].cubes` — geometry must be built in Blockbench.
 * A modeler that wrote cube from/to arrays into the JSON believed it was
 * modelling; this strips them so the file cannot be mistaken for a model again,
 * while keeping every descriptive field that is genuinely useful (part names,
 * bone assignment, proportions, palette, notes).
 *
 * Usage: node tools/strip-blueprint-geometry.mjs <blueprint.json> [--dry-run]
 */
import fs from "node:fs";

const target = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!target) {
  console.error("usage: node tools/strip-blueprint-geometry.mjs <blueprint.json> [--dry-run]");
  process.exit(2);
}

const blueprint = JSON.parse(fs.readFileSync(target, "utf8"));
if (!Array.isArray(blueprint.parts)) {
  console.error(`${target}: no parts array`);
  process.exit(1);
}

let removedCubes = 0;
let affectedParts = 0;

for (const part of blueprint.parts) {
  const cubes = part.cubes;
  if (Array.isArray(cubes) && cubes.length > 0) {
    removedCubes += cubes.length;
    affectedParts++;
  }
  // Keep the key (the schema documents it) but empty, so nothing downstream
  // can read geometry out of this file.
  part.cubes = [];
}

// A top-level aabb is a measurement, not geometry, but drop any field that
// exists purely to describe cube placement.
delete blueprint.cube_count;
delete blueprint.cube_list;

const before = fs.statSync(target).size;
const serialized = `${JSON.stringify(blueprint, null, 2)}\n`;

console.log(`file        : ${target}`);
console.log(`parts       : ${blueprint.parts.length}`);
console.log(`bones       : ${(blueprint.bones ?? []).length}`);
console.log(`parts w/ cubes removed: ${affectedParts}`);
console.log(`cubes removed         : ${removedCubes}`);
console.log(`bytes       : ${before} -> ${Buffer.byteLength(serialized, "utf8")}`);

if (removedCubes === 0) {
  console.log("nothing to strip");
  process.exit(0);
}

if (dryRun) {
  console.log("dry run: not written");
} else {
  fs.writeFileSync(target, serialized, "utf8");
  console.log("written");
}
