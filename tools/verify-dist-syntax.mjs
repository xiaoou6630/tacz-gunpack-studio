/**
 * Validates that the patched bundle actually parses the way Blockbench will
 * parse it.
 *
 * `node --check` accepts some input that fails when the bundle is evaluated
 * inside Blockbench, because a plugin file is executed as a script in the
 * renderer, not as a CommonJS module. `new Function(source)` mirrors that
 * evaluation closely enough to catch the difference.
 *
 * Usage: node tools/verify-dist-syntax.mjs <path-to-mcp.js>
 */
import fs from "node:fs";

const target = process.argv[2];
if (!target) {
  console.error("usage: node tools/verify-dist-syntax.mjs <path-to-mcp.js>");
  process.exit(2);
}

const source = fs.readFileSync(target, "utf8");
console.log(`file  : ${target}`);
console.log(`bytes : ${fs.statSync(target).size}`);
console.log(`banner: ${JSON.stringify(source.slice(0, 26))}`);

let ok = true;
try {
  // eslint-disable-next-line no-new-func
  new Function(source);
  console.log("parse : OK (new Function accepted the bundle)");
} catch (error) {
  ok = false;
  console.log(`parse : FAILED — ${error.name}: ${error.message}`);
  const at = /<anonymous>:(\d+):(\d+)/.exec(error.stack ?? "");
  if (at) console.log(`        at line ${at[1]}, column ${at[2]} of the wrapper`);
}

const markers = [
  ["A settings", "function grw("],
  ["B importer", "function bbImportAnimations("],
  ["B animation text", "animationText:anText"],
  ["B snapping", "snapping:120"],
  ["B exact time", "kf.time=time"],
  ["C client info", "pollClient"],
  ["D min_version", 'min_version:"5.2.0"'],
];
for (const [label, needle] of markers) {
  console.log(`  ${source.includes(needle) ? "ok  " : "MISS"} ${label}`);
}

if (!ok) process.exit(1);
