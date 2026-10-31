/**
 * Idempotently adds the Blockbench MCP server row to the active DSH profile.
 * The row uses the official @deepseek-ai/dsh-mcp-client bridge and the
 * Blockbench plugin's streamable-HTTP endpoint.
 *
 * The endpoint is configurable: the Blockbench plugin exposes `mcp_host`,
 * `mcp_port` and `mcp_endpoint` in Settings > General, so a user who moved the
 * server off 3000/bb-mcp can pass their own URL here (or set the
 * `mcpUrl` plugin config) instead of editing the patch by hand.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";
import { dshHome, ensureDir, readText, writeTextAtomic } from "./paths.mjs";

const ROW_ID = "mcp-blockbench";

/** The Blockbench plugin's stock endpoint (Settings > General defaults). */
export const DEFAULT_MCP_URL = "http://127.0.0.1:3000/bb-mcp";

/** Kept for compatibility with earlier imports. */
const MCP_URL = DEFAULT_MCP_URL;

/** Finds the profile directory that owns the running session. */
export function findProfileDir(explicit) {
  if (explicit) return path.resolve(explicit);
  const home = dshHome();
  const candidates = [process.env.DSH_PROFILE, "desktop", "web"].filter(Boolean).map(name => path.join(home, "profiles", name));
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
  }
  return path.join(home, "profiles", "desktop");
}

/**
 * Normalizes a Blockbench endpoint into a full URL.
 *
 * Accepts a full URL, or a `host:port/path` shorthand such as
 * `127.0.0.1:3001/custom`. Returns the stock URL when the input is empty.
 */
export function resolveMcpUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return DEFAULT_MCP_URL;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `http://${raw}`;
}

/** The YAML row for the official MCP bridge. */
export function mcpRowYaml(url = DEFAULT_MCP_URL) {
  return `- insert:\n    - id: ${ROW_ID}\n      name: "@deepseek-ai/dsh-mcp-client"\n      config:\n        serverName: blockbench\n        transport: streamable-http\n        url: ${url}\n`;
}

/**
 * Adds the row unless it already exists.
 *
 * An existing row is left untouched: rewriting someone's working patch is worse
 * than leaving a stale URL, and the tool reports the current URL so a mismatch
 * is visible. Pass `force: true` to replace it.
 *
 * @returns Status, the patch path, and the URL now in effect.
 */
export function installMcpRow(options = {}) {
  const profileDir = findProfileDir(options.profileDir);
  const url = resolveMcpUrl(options.url);
  ensureDir(profileDir);
  const patchPath = path.join(profileDir, "cordis.patch.yml");
  const current = readText(patchPath) ?? "# DSH profile patch layer\n";
  const present = new RegExp(`^\\s*-\\s*id:\\s*${ROW_ID}\\s*$`, "m").test(current) || current.includes(ROW_ID);

  if (present && options.force !== true) {
    const existing = /url:\s*([^\\s]+)/.exec(current.split(ROW_ID)[1] ?? "");
    return {
      already: true,
      profile_dir: profileDir,
      patch: patchPath,
      url: existing ? existing[1] : url,
      requested_url: url,
      note: "The mcp-blockbench row already exists. If your Blockbench port or endpoint changed, edit its url in the patch (or re-run with force).",
    };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${patchPath}.bak-tacz-${stamp}`;
  fs.writeFileSync(backup, current, "utf8");
  const body = present
    ? current.replace(new RegExp(`(- id: ${ROW_ID}[\\s\\S]*?url:\\s*)([^\\s]+)`, "m"), `$1${url}`)
    : `${current.trimEnd()}\n\n# TACZ gunpack: Blockbench MCP server (streamable HTTP)\n${mcpRowYaml(url)}`;
  writeTextAtomic(patchPath, body);
  return { already: false, profile_dir: profileDir, patch: patchPath, backup, url };
}

export { MCP_URL, ROW_ID };
