/**
 * Verifies the project has no Python dependency.
 *
 * Everything the skill tells a modeler to run must work with what DSH already
 * requires (Node.js). A check script that needs `pip install Pillow` silently
 * fails on a user's machine, which is worse than no check at all.
 *
 * Usage: node tools/verify-no-python.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
// Upstream ships Python examples for building MCP servers; those are not ours.
const SKIP = /node_modules|\.git|\.agents|\.github|\.claude|packages[\\/]blockbench-mcp-tacz[\\/]docs/;
const NEEDLE = /\bpython\b|\bpip install\b|Pillow/i;

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (SKIP.test(full)) continue;
    if (entry.isDirectory()) collect(full, out);
    else if (/\.(md|mjs|js|ts|py)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const hits = [];
for (const file of collect(ROOT)) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!NEEDLE.test(line)) return;
    // This file and the checker's own header talk about Python on purpose.
    if (path.basename(file) === "verify-no-python.mjs") return;
    // A comment explaining why we avoid Python is not a dependency on it.
    const trimmed = line.trim();
    const isComment =
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*");
    if (isComment) return;
    hits.push(`${path.relative(ROOT, file)}:${i + 1}  ${trimmed.slice(0, 80)}`);
  });
}

if (hits.length === 0) {
  console.log("no Python dependency in project sources");
} else {
  console.log(`${hits.length} Python reference(s):`);
  for (const h of hits) console.log(`  ${h}`);
  process.exitCode = 1;
}
