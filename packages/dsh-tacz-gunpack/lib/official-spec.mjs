/**
 * Official TACZ baseline resolution.
 *
 * Priority: a local source (TACZ_SOURCE, a workspace vendor checkout, the
 * current pack, or a previous cache) first; only then the official GitHub
 * repository. Local absolute paths are never part of a lesson or skill.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";
import { dshHome, ensureDir, writeTextAtomic } from "./paths.mjs";

const DEFAULT_REPO = "MCModderAnchor/TACZ";
const DEFAULT_REF = "1.20.1";
const REPO_PACK_PREFIX = "src/main/resources/assets/tacz/custom/tacz_default_gun/assets/tacz";
const LOCAL_BASES = [
  "",
  REPO_PACK_PREFIX,
  "assets/tacz",
  "custom/tacz_default_gun/assets/tacz",
];

/** Normalizes a path under the official default pack. */
export function normalizeSpecPath(input) {
  let rel = String(input ?? "").replace(/\\/g, "/").trim();
  rel = rel.replace(/^\.\/+/, "");
  for (const prefix of [`${REPO_PACK_PREFIX}/`, "assets/tacz/"]) {
    if (rel.startsWith(prefix)) rel = rel.slice(prefix.length);
  }
  if (!/^[A-Za-z0-9_./-]+$/.test(rel) || rel.includes("..") || rel.startsWith("/")) {
    throw new Error(`Invalid TACZ baseline path "${input}". Use a path like "scripts/default_state_machine.lua".`);
  }
  return rel;
}

/** Finds one file under a local source directory. */
function findInSource(sourceDir, rel) {
  for (const base of LOCAL_BASES) {
    const file = path.join(sourceDir, base, rel);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return undefined;
}

/** Lists local sources that may contain the official default pack. */
export function locateOfficialSources(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const candidates = [];
  if (env.TACZ_SOURCE) candidates.push({ kind: "TACZ_SOURCE", dir: path.resolve(env.TACZ_SOURCE) });
  candidates.push({ kind: "vendor/TACZ", dir: path.join(cwd, "vendor", "TACZ") });
  candidates.push({ kind: "workspace", dir: cwd });
  if (env.TACZ_JAR) candidates.push({ kind: "TACZ_JAR", dir: path.resolve(env.TACZ_JAR) });

  const sources = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.dir)) continue;
    if (candidate.kind === "TACZ_JAR") {
      sources.push({ ...candidate, jar: true, files: {} });
      continue;
    }
    const files = {
      stateMachine: Boolean(findInSource(candidate.dir, "scripts/default_state_machine.lua")),
      referenceDisplay: Boolean(findInSource(candidate.dir, "display/guns/ak47_display.json")),
      referenceAnimation: Boolean(findInSource(candidate.dir, "animations/ak47.animation.json")),
    };
    if (Object.values(files).some(Boolean)) sources.push({ ...candidate, files });
  }

  const cacheDir = options.cacheDir ?? path.join(dshHome(), "tacz-gunpack", "spec-cache", options.ref ?? DEFAULT_REF);
  return {
    repo: options.repo ?? DEFAULT_REPO,
    ref: options.ref ?? DEFAULT_REF,
    sources,
    cache: { dir: cacheDir, exists: fs.existsSync(cacheDir) },
  };
}

/** Reads a cached baseline file, if present. */
function readCache(cacheDir, rel) {
  const file = path.join(cacheDir, rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return undefined;
  return file;
}

/** Fetches one text file from GitHub's contents API and caches it. */
async function fetchFromGitHub(rel, options = {}) {
  const repo = options.repo ?? DEFAULT_REPO;
  const ref = options.ref ?? DEFAULT_REF;
  const cacheDir = options.cacheDir ?? path.join(dshHome(), "tacz-gunpack", "spec-cache", ref);
  const url = `https://api.github.com/repos/${repo}/contents/${REPO_PACK_PREFIX}/${rel}?ref=${encodeURIComponent(ref)}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "dsh-tacz-gunpack",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const fetcher = options.fetchImpl ?? fetch;
  const response = await fetcher(url, { headers });
  if (!response.ok) {
    if (response.status === 403) throw new Error(`GitHub API refused the request (403, rate limit?). Set GITHUB_TOKEN or use a local TACZ_SOURCE. ${url}`);
    throw new Error(`GitHub API returned HTTP ${response.status} for ${url}`);
  }
  const payload = await response.json();
  if (payload.type !== "file" || payload.encoding !== "base64" || typeof payload.content !== "string") {
    throw new Error(`GitHub did not return a file for ${rel}. Check the path or use a local TACZ_SOURCE.`);
  }
  const text = Buffer.from(payload.content, "base64").toString("utf8");
  const target = path.join(cacheDir, rel);
  ensureDir(path.dirname(target));
  writeTextAtomic(target, text);
  writeTextAtomic(path.join(cacheDir, "_source.json"), `${JSON.stringify({
    repo,
    ref,
    path: rel,
    sha: payload.sha,
    url: payload.html_url,
    fetched_at: new Date().toISOString(),
  }, null, 2)}\n`);
  return { path: target, bytes: Buffer.byteLength(text, "utf8"), source: "github", repo, ref, sha: payload.sha, url: payload.html_url, cached: false };
}

/**
 * Resolves one baseline file: local source, then cache, then GitHub.
 *
 * @param {string} input path under the official default pack.
 * @param {object} options resolution options (`cwd`, `env`, `source`, `repo`, `ref`, `cacheDir`, `fetchImpl`).
 */
export async function resolveOfficialFile(input, options = {}) {
  const rel = normalizeSpecPath(input);
  const located = locateOfficialSources(options);
  const sourceDirs = options.source
    ? [{ kind: "explicit", dir: path.resolve(options.source) }]
    : located.sources.filter(source => !source.jar);
  for (const source of sourceDirs) {
    const file = findInSource(source.dir, rel);
    if (file) return { path: file, bytes: fs.statSync(file).size, source: "local", sourceKind: source.kind };
  }
  const cached = readCache(located.cache.dir, rel);
  if (cached) return { path: cached, bytes: fs.statSync(cached).size, source: "cache", sourceKind: "spec-cache" };
  return fetchFromGitHub(rel, { ...options, repo: located.repo, ref: located.ref, cacheDir: located.cache.dir });
}
