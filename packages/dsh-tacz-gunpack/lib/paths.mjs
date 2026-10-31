/**
 * Filesystem helpers for the DSH plugin. Skills and references live under the
 * DSH home; project writes stay under the caller's project root.
 *
 * @module
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Package root (the directory containing package.json). */
export function pluginRoot() {
  return fileURLToPath(new URL("../", import.meta.url));
}

/** DSH home, honoring an explicit DSH_HOME. */
export function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
}

/** Root for the plugin's mutable skills and lesson history. */
export function skillsRoot() {
  return path.join(dshHome(), "tacz-gunpack", "skills");
}

/** Root for downloaded reference boards. */
export function refsRoot(workspaceRoot) {
  return path.join(workspaceRoot, "refs");
}

/** Creates a directory recursively. */
export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Reads UTF-8 text, or returns undefined when the file is missing. */
export function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

/** Writes text atomically through a sibling temporary file. */
export function writeTextAtomic(file, text) {
  ensureDir(path.dirname(file));
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, text, "utf8");
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  fs.renameSync(temp, file);
}

/** Writes bytes atomically. */
export function writeBytesAtomic(file, bytes) {
  ensureDir(path.dirname(file));
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, bytes);
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  fs.renameSync(temp, file);
}

/** Lists immediate directories. */
export function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}

/** Copies a directory tree without Node's fs.cpSync (which crashes on some Windows paths). */
export function copyDir(source, target) {
  ensureDir(target);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

/**
 * Copies a skill seed directory, keeping the target in sync with the package.
 *
 * A role whose SKILL.md is byte-identical to the seed is left alone. A role that
 * differs is refreshed from the seed, and the previous file is first archived
 * under `<role>/versions/` so a user's local edits (or a learner distillation)
 * can still be recovered. Missing roles are copied whole.
 *
 * @returns {{copied: string[], updated: string[], kept: string[]}} role names by action.
 */
export function seedSkillDir(seedDir, targetRoot) {
  ensureDir(targetRoot);
  const copied = [];
  const updated = [];
  const kept = [];
  for (const role of listDirs(seedDir)) {
    const seedFile = path.join(seedDir, role, "SKILL.md");
    const target = path.join(targetRoot, role);
    const targetFile = path.join(target, "SKILL.md");
    if (!fs.existsSync(targetFile)) {
      copyDir(path.join(seedDir, role), target);
      copied.push(role);
      continue;
    }
    const seedText = fs.readFileSync(seedFile, "utf8");
    const targetText = fs.readFileSync(targetFile, "utf8");
    if (seedText === targetText) {
      kept.push(role);
      continue;
    }
    // Archive the outgoing version before overwriting it.
    const versions = path.join(target, "versions");
    ensureDir(versions);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(path.join(versions, `${stamp}.md`), targetText, "utf8");
    fs.writeFileSync(targetFile, seedText, "utf8");
    updated.push(role);
  }
  return { copied, updated, kept };
}

/** Minimal YAML frontmatter parser for skill files (name/description/whenToUse). */
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  const data = {};
  let currentKey = null;
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const keyMatch = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (keyMatch) {
      currentKey = keyMatch[1];
      let value = keyMatch[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      data[currentKey] = value;
      continue;
    }
    if (currentKey && /^\s+/.test(rawLine)) {
      data[currentKey] = `${data[currentKey] ?? ""} ${line.trim()}`.trim();
    }
  }
  return { data, body: match[2].trim() };
}

/** Converts a query into a safe directory name. */
export function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "refs";
}

/** Ensures an absolute child path stays inside the root. */
export function insideRoot(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}
