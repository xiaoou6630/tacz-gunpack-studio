/**
 * Lists the tacz_* tool names actually present in the built bundle, so docs
 * can be checked against reality instead of drifting.
 *
 * Usage: node tools/list-tacz-tools.mjs
 */
import fs from "node:fs";

const bundle = fs.readFileSync("packages/blockbench-mcp-tacz/dist/mcp.js", "utf8");
const names = new Set();
const pattern = /name:\s*["'](tacz_[a-z_]+)["']/g;
for (const match of bundle.matchAll(pattern)) names.add(match[1]);

const sorted = [...names].sort();
console.log(`Blockbench side: ${sorted.length} tools`);
for (const name of sorted) console.log(`  ${name}`);

// Compare against what TACZ.md documents.
const doc = fs.readFileSync("packages/blockbench-mcp-tacz/TACZ.md", "utf8");
const documented = new Set();
const docPattern = /^\|\s*`(tacz_[a-z_]+)`/gm;
for (const match of doc.matchAll(docPattern)) documented.add(match[1]);

const missingFromDoc = sorted.filter(n => !documented.has(n));
const extraInDoc = [...documented].filter(n => !names.has(n));

console.log("");
console.log(`TACZ.md documents: ${documented.size}`);
if (missingFromDoc.length) console.log(`  undocumented: ${missingFromDoc.join(", ")}`);
if (extraInDoc.length) console.log(`  documented but absent: ${extraInDoc.join(", ")}`);
if (!missingFromDoc.length && !extraInDoc.length) console.log("  docs match the bundle");
