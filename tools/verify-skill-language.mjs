/**
 * Verifies that everything the model reads is written in English.
 *
 * The role skills and their lesson logs are injected into the model's system
 * prompt. Mixing languages there wastes tokens, and worse, a Chinese lesson
 * costs more tokens per character than the English it replaces while making
 * retrieval less predictable.
 *
 * What this deliberately does NOT flag: user-facing strings such as the preset
 * name and description in preset.yml, or the fallback in index.mjs. Those are
 * read by a person in the plugin list, not by the model, and they should stay in
 * the user's language.
 *
 * Usage: node tools/verify-skill-language.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKILLS = path.join(ROOT, "packages", "dsh-tacz-gunpack", "skills");
const CJK = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g;

if (!fs.existsSync(SKILLS)) {
  console.error(`skills directory not found: ${SKILLS}`);
  process.exit(2);
}

const problems = [];
let checked = 0;

for (const role of fs.readdirSync(SKILLS, { withFileTypes: true })) {
  if (!role.isDirectory()) continue;
  const dir = path.join(SKILLS, role.name);
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const full = path.join(dir, file);
    const text = fs.readFileSync(full, "utf8");
    checked++;
    const matches = text.match(CJK);
    if (!matches) continue;
    // Report the offending lines so the fix is obvious.
    text.split(/\r?\n/).forEach((line, i) => {
      if (CJK.test(line)) {
        CJK.lastIndex = 0;
        problems.push(`${path.relative(ROOT, full)}:${i + 1}  ${line.trim().slice(0, 60)}`);
      }
    });
  }
}

console.log(`checked ${checked} skill file(s) under packages/dsh-tacz-gunpack/skills`);
if (problems.length === 0) {
  console.log("all model-facing skill text is English");
} else {
  console.log(`${problems.length} line(s) contain non-English text:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = 1;
}
