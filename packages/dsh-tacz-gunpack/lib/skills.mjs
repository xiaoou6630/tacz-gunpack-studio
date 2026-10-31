/**
 * Mutable skill store. Seeds six role skills from the package, exposes them to
 * DSH's skill registry, and versions every rewrite so the learner can roll back.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";
import { ROLES } from "./roles.mjs";
import {
  ensureDir,
  parseFrontmatter,
  pluginRoot,
  readText,
  seedSkillDir,
  skillsRoot,
  writeTextAtomic,
} from "./paths.mjs";

const SKILL_FILE = "SKILL.md";
const LESSONS_FILE = "LESSONS.md";
const MAX_SKILL_BYTES = 32 * 1024;

/**
 * Ensures every role directory exists and keeps shipped skills in sync.
 *
 * A role skill that matches the packaged seed is left untouched; one that
 * differs is refreshed from the seed after the outgoing file is archived under
 * `versions/`, so a local edit or a distilled rewrite is never lost silently.
 */
export function seedSkills() {
  const root = skillsRoot();
  const result = seedSkillDir(path.join(pluginRoot(), "skills"), root);
  for (const role of [...Object.keys(ROLES), "director"]) {
    if (!fs.existsSync(path.join(root, role, SKILL_FILE))) {
      throw new Error(`Missing seeded skill for role "${role}" at ${path.join(root, role, SKILL_FILE)}.`);
    }
  }
  return { root, ...result };
}

/** Reads one role skill. */
export function readSkill(role) {
  if (!/^[a-z0-9-]+$/.test(role)) throw new Error(`Invalid role directory "${role}".`);
  const file = path.join(skillsRoot(), role, SKILL_FILE);
  const text = readText(file);
  if (text === undefined) throw new Error(`Skill "${role}" is missing at ${file}. Reinstall or run seed.`);
  const parsed = parseFrontmatter(text);
  return { role, file, text, ...parsed };
}

/** Lists all skills with parsed frontmatter. */
export function listSkills() {
  const root = skillsRoot();
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(role => fs.existsSync(path.join(root, role, SKILL_FILE)))
    .sort()
    .map(role => {
      const parsed = readSkill(role);
      return {
        role,
        name: typeof parsed.data.name === "string" ? parsed.data.name : role,
        description: typeof parsed.data.description === "string" ? parsed.data.description : "",
        whenToUse: typeof parsed.data.whenToUse === "string" ? parsed.data.whenToUse : "",
        file: parsed.file,
        bytes: Buffer.byteLength(parsed.text, "utf8"),
      };
    });
}

/** Rejects a skill that would break discovery or balloon the prompt. */
export function validateSkill(text, role) {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_SKILL_BYTES) throw new Error(`Skill "${role}" is ${bytes} bytes; the limit is ${MAX_SKILL_BYTES}.`);
  const parsed = parseFrontmatter(text);
  if (typeof parsed.data.name !== "string" || !parsed.data.name) throw new Error(`Skill "${role}" needs a frontmatter name.`);
  if (typeof parsed.data.description !== "string" || !parsed.data.description) throw new Error(`Skill "${role}" needs a frontmatter description.`);
  if (!parsed.body.trim()) throw new Error(`Skill "${role}" has an empty body.`);
  if (/\bsk-[A-Za-z0-9_-]{20,}\b/.test(text) || /api[_-]?key\s*[:=]\s*\S{12,}/i.test(text)) {
    throw new Error(`Skill "${role}" appears to contain a credential; remove it before writing.`);
  }
  return parsed;
}

/** Writes a new skill body and keeps the previous version. */
export function writeSkill(role, text, reason = "rewrite") {
  validateSkill(text, role);
  const dir = path.join(skillsRoot(), role);
  ensureDir(dir);
  const target = path.join(dir, SKILL_FILE);
  const current = readText(target);
  if (current !== undefined) {
    const versionDir = path.join(dir, "versions");
    ensureDir(versionDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(path.join(versionDir, `${stamp}.md`), current, "utf8");
  }
  writeTextAtomic(target, text.endsWith("\n") ? text : `${text}\n`);
  fs.appendFileSync(
    path.join(dir, "CHANGELOG.jsonl"),
    `${JSON.stringify({ at: new Date().toISOString(), role, reason, bytes: Buffer.byteLength(text, "utf8") })}\n`,
    "utf8",
  );
  return { role, file: target, bytes: Buffer.byteLength(text, "utf8") };
}

/** Lists saved versions, newest first. */
export function skillHistory(role) {
  const dir = path.join(skillsRoot(), role, "versions");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith(".md"))
    .sort()
    .reverse()
    .map(name => ({ version: name, path: path.join(dir, name), bytes: fs.statSync(path.join(dir, name)).size }));
}

/** Restores the newest saved version. */
export function rollbackSkill(role) {
  const versions = skillHistory(role);
  if (versions.length === 0) throw new Error(`Skill "${role}" has no saved versions.`);
  const latest = versions[0];
  const text = fs.readFileSync(latest.path, "utf8");
  validateSkill(text, role);
  const target = path.join(skillsRoot(), role, SKILL_FILE);
  const current = readText(target);
  if (current !== undefined) {
    const dir = path.join(skillsRoot(), role, "versions");
    ensureDir(dir);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(path.join(dir, `${stamp}.md`), current, "utf8");
  }
  writeTextAtomic(target, text);
  return { role, restored_from: latest.version };
}

/** Appends a lesson; with apply, also appends it to the role skill body. */
export function learnLesson(role, lesson, apply = true, options = {}) {
  if (!ROLES[role]) throw new Error(`Unknown role "${role}".`);
  const text = String(lesson ?? "").trim();
  if (!text) throw new Error("Lesson text is empty.");
  const source = String(options?.source ?? "").trim();
  const dir = path.join(skillsRoot(), role);
  ensureDir(dir);
  const stamp = new Date().toISOString();
  const sourceBlock = source ? `\nSource: ${source}\n` : "";
  fs.appendFileSync(path.join(dir, LESSONS_FILE), `\n## ${stamp}\n${sourceBlock}\n${text}\n`, "utf8");
  let applied = false;
  if (apply) {
    const current = readSkill(role);
    const section = `\n\n## Learned lesson — ${stamp}\n\n${text}\n`;
    writeSkill(role, `${current.text.trimEnd()}${section}`, "lesson");
    applied = true;
  } else {
    fs.appendFileSync(
      path.join(dir, "CHANGELOG.jsonl"),
      `${JSON.stringify({ at: stamp, role, reason: "lesson-only", bytes: Buffer.byteLength(text, "utf8"), source: source || undefined })}\n`,
      "utf8",
    );
  }
  return { role, applied, lessons_file: path.join(dir, LESSONS_FILE), source: source || undefined };
}

/** Reads a role's LESSONS.md (empty string when absent). */
export function readLessons(role) {
  if (!ROLES[role]) throw new Error(`Unknown role "${role}".`);
  const file = path.join(skillsRoot(), role, LESSONS_FILE);
  return { role, file, text: readText(file) ?? "" };
}

/** Builds the distillation prompt from the current skill and lessons. */
function distillationPrompt(role, skillText, lessons) {
  return `You are maintaining one role skill of a DeepSeek Harness TACZ Gun Studio agent.

Role: ${role}
Current SKILL.md:
\`\`\`markdown
${skillText}
\`\`\`

Recent lessons (LESSONS.md excerpt):
\`\`\`markdown
${lessons.slice(-12000)}
\`\`\`

Produce a complete new SKILL.md:
- Start with YAML frontmatter containing name, description, and whenToUse.
- Preserve the role boundary, tool limits, and the handoff JSON contract.
- Merge the new lessons into executable rules; no filler.
- Never include an API key, a password, or an absolute user path.
- Stay under 24KB.
- Output only the SKILL.md body, with no code fences.`;
}

/** Distills a skill through a configured DSH model route. */
export async function distillSkill(role, llm, options) {
  if (!llm || typeof llm.stream !== "function") throw new Error("The DSH llm service is unavailable.");
  const provider = options?.provider;
  const model = options?.model;
  if (!provider || !model) throw new Error("Distillation needs a provider and model (configure learning.distillProvider/distillModel or pass them).");
  const current = readSkill(role);
  const lessons = readText(path.join(skillsRoot(), role, LESSONS_FILE)) ?? "";
  const prompt = distillationPrompt(role, current.text, lessons);
  let text = "";
  let failure = null;
  for await (const chunk of llm.stream({
    provider,
    model,
    system: "You maintain concise, executable agent skill files. Output only the new SKILL.md.",
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    temperature: 0.3,
    maxTokens: 4096,
    signal: options?.signal,
  })) {
    if (chunk.type === "text-delta") text += chunk.text;
    if (chunk.type === "finish" && (chunk.reason?.kind === "error" || chunk.reason?.kind === "aborted")) {
      failure = chunk.reason;
    }
  }
  if (failure) throw new Error(`Distillation failed: ${JSON.stringify(failure)}`);
  const cleaned = text.trim().replace(/^```(?:markdown)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!cleaned) throw new Error("Distillation returned no text.");
  return { proposed: cleaned, apply: options?.apply === true };
}
