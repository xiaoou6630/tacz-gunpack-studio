/**
 * Reports any remaining box-drawing ASCII art in markdown code blocks.
 *
 * Box art relies on monospace column alignment, which breaks in GitHub's
 * proportional rendering and in any font with different glyph widths. Diagrams
 * should be Mermaid; this flags leftovers.
 *
 * Usage: node tools/find-ascii-art.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP = /node_modules|\.git|\.agents|\.github|\.claude/;

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.test(full)) collect(full, out);
    } else if (entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

// Only the corners and cross joints belong to a framed diagram. `├ └ │` alone
// is the ordinary tree-listing style, which stays readable in proportional
// fonts because it does not rely on column alignment.
const BOX = ["┌", "┐", "┘", "┬", "┴", "┼"];
const ARROWS = ["▼", "▲"];
const BLOCK = /```([a-z]*)\r?\n([\s\S]*?)```/g;

let found = 0;
for (const file of collect(ROOT)) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(BLOCK)) {
    const lang = match[1];
    if (lang === "mermaid") continue;
    const body = match[2];
    const boxes = BOX.filter(c => body.includes(c)).length;
    const arrows = ARROWS.filter(c => body.includes(c)).length;
    if (boxes >= 1 || arrows >= 1) {
      console.log(`${path.relative(ROOT, file)}  box=${boxes} arrow=${arrows}`);
      found++;
    }
  }
}

console.log(found === 0 ? "no box-drawing art left" : `${found} block(s) still use box drawing`);
