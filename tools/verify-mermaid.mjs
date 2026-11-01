/**
 * Checks every Mermaid block in the project's markdown for the syntax mistakes
 * that make GitHub render an error box instead of a diagram.
 *
 * GitHub renders Mermaid server-side; a single bad line turns the whole block
 * into "Unable to render rich display". These checks catch the common cases
 * before pushing.
 *
 * Usage: node tools/verify-mermaid.mjs
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

const files = collect(ROOT);
let blocks = 0;
const problems = [];

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);

  for (const match of text.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)) {
    blocks++;
    const body = match[1];
    const lines = body.split(/\r?\n/);

    // Every diagram must open with a known declaration.
    const head = lines.find(l => l.trim().length > 0)?.trim() ?? "";
    const known = ["flowchart", "graph", "sequenceDiagram", "classDiagram", "stateDiagram",
      "erDiagram", "gantt", "pie", "journey", "gitGraph", "mindmap", "timeline"];
    if (!known.some(k => head.startsWith(k))) {
      problems.push(`${rel}: block opens with "${head}"`);
    }

    // subgraph / end must pair up.
    const subgraphs = lines.filter(l => /^\s*subgraph\s/.test(l)).length;
    const ends = lines.filter(l => /^\s*end\s*$/.test(l)).length;
    if (subgraphs !== ends) {
      problems.push(`${rel}: ${subgraphs} subgraph vs ${ends} end`);
    }

    // Node labels: [..], (..), {..}, {{..}}, [[..]] must balance per line.
    const pairs = [
      ["[", "]"],
      ["(", ")"],
      ["{", "}"],
    ];
    for (const line of lines) {
      if (!line.includes("-") && !line.includes("-->") && !line.includes("-->|")) {
        // Only lines that define or connect nodes matter, but balanced brackets
        // are cheap to check everywhere except comments and style lines.
      }
      if (/^\s*(style|classDef|linkStyle|%%)\b/.test(line)) continue;
      for (const [open, close] of pairs) {
        const o = (line.match(new RegExp(`\\${open}`, "g")) ?? []).length;
        const c = (line.match(new RegExp(`\\${close}`, "g")) ?? []).length;
        if (o !== c) {
          problems.push(`${rel}: unbalanced ${open}${close} in "${line.trim().slice(0, 60)}"`);
        }
      }
    }

    // Quoted labels must not contain a raw double quote.
    for (const line of lines) {
      const quotes = (line.match(/"/g) ?? []).length;
      if (quotes % 2 !== 0) {
        problems.push(`${rel}: odd number of quotes in "${line.trim().slice(0, 60)}"`);
      }
    }
  }
}

console.log(`mermaid blocks: ${blocks} in ${files.length} markdown files`);
if (problems.length === 0) {
  console.log("no syntax problems found");
} else {
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = 1;
}
