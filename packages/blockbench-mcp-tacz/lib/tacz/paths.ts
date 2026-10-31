/**
 * TACZ file helpers. All paths are absolute local paths; the Blockbench host's
 * permission-checked `fs` module is requested once per operation so the user
 * sees which tool is touching the disk.
 *
 * @module
 */
import { isAbsoluteLocalPath } from "@/lib/local-files";

/** Minimal `path` surface used here; Blockbench exposes the Node module through `requireNativeModule`. */
export interface IPathModule {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  extname(path: string): string;
}

/** Minimal `fs` surface used here. */
export interface ITaczFs {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): unknown;
  readFileSync(path: string, encoding: "utf8"): string;
  readFileSync(path: string): Uint8Array;
  writeFileSync(path: string, data: string | Uint8Array): void;
  renameSync(oldPath: string, newPath: string): void;
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  readdirSync(path: string, options: { withFileTypes: true }): Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  statSync(path: string): { isDirectory(): boolean; isFile(): boolean; size: number };
}

/** Loads Node's `path` module through Blockbench's native-module permission boundary. */
export function pathModule(): IPathModule {
  // @ts-ignore - requireNativeModule is a Blockbench global.
  return requireNativeModule("path") as IPathModule;
}

/**
 * Requests the host `fs` module with a user-facing reason.
 *
 * @param label - Tool label shown in Blockbench's permission prompt.
 * @throws When the user denies file access.
 */
export function fsModule(label: string): ITaczFs {
  // @ts-ignore - requireNativeModule is a Blockbench global.
  const fs = requireNativeModule("fs", {
    message: `MCP ${label} requested file access for a TACZ gun pack.`,
    detail: "The TACZ tools read and write the selected pack directory, including models, textures, and JSON metadata.",
    optional: false,
  }) as ITaczFs | undefined;
  if (!fs) throw new Error("File system access was denied. Approve the Blockbench file permission and retry.");
  return fs;
}

/** Rejects relative, UNC, and device paths before any file operation. */
export function assertLocalPath(path: string, label: string): string {
  if (!isAbsoluteLocalPath(path)) {
    throw new Error(`${label}: "${path}" is not an absolute path to a local file or directory. Relative, network (UNC) and device paths are refused.`);
  }
  return path;
}

/** Resolves a pack directory to an absolute path and verifies it is a directory when it exists. */
export function resolvePackDir(packDir: string, label: string): string {
  const path = pathModule();
  const resolved = path.resolve(assertLocalPath(packDir, label));
  const fs = fsModule(label);
  if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
    throw new Error(`${label}: pack_dir "${resolved}" exists but is not a directory.`);
  }
  return resolved;
}

/** Creates a directory recursively. */
export function ensureDir(dir: string, label: string): void {
  fsModule(label).mkdirSync(dir, { recursive: true });
}

/** Reads UTF-8 text. */
export function readText(path: string, label: string): string {
  return fsModule(label).readFileSync(path, "utf8");
}

/** Whether a path exists. */
export function exists(path: string, label: string): boolean {
  return fsModule(label).existsSync(path);
}

/** Reads bytes; returns undefined when the file is missing. */
export function readBytes(path: string, label: string): Uint8Array | undefined {
  const fs = fsModule(label);
  if (!fs.existsSync(path)) return undefined;
  return fs.readFileSync(path);
}

/**
 * Writes text through the host filesystem. A direct write is used instead of a
 * temp-file rename because Blockbench's scoped `fs` wrapper does not reliably
 * rename over an existing file; the previous file would be removed and the
 * replacement silently lost.
 */
export function writeTextAtomic(path: string, data: string, label: string, overwrite = true): void {
  const fs = fsModule(label);
  const pathApi = pathModule();
  fs.mkdirSync(pathApi.dirname(path), { recursive: true });
  if (!overwrite && fs.existsSync(path)) {
    throw new Error(`${label}: "${path}" already exists. Pass overwrite: true to replace it.`);
  }
  fs.writeFileSync(path, data);
}

/** Writes bytes through the host filesystem; see {@link writeTextAtomic}. */
export function writeBytesAtomic(path: string, data: Uint8Array, label: string, overwrite = true): void {
  const fs = fsModule(label);
  const pathApi = pathModule();
  fs.mkdirSync(pathApi.dirname(path), { recursive: true });
  if (!overwrite && fs.existsSync(path)) {
    throw new Error(`${label}: "${path}" already exists. Pass overwrite: true to replace it.`);
  }
  fs.writeFileSync(path, data);
}

/**
 * Parses JSON that may contain the `//` and `/* *\/` comments TACZ's default
 * pack uses. Strings are left untouched.
 */
export function parseJsonc(text: string): unknown {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 1;
      output += " ";
      continue;
    }
    output += char;
  }
  return JSON.parse(output) as unknown;
}

/** Reads and parses a JSON/JSONC file. */
export function readJson(path: string, label: string): unknown {
  return parseJsonc(readText(path, label));
}

/** Writes a JSON object with stable two-space formatting and a trailing newline. */
export function writeJson(path: string, value: unknown, label: string, overwrite = true): void {
  writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`, label, overwrite);
}

/** Recursively lists files under `dir`, excluding directories named in `excluded`. */
export function listFiles(dir: string, excluded: readonly string[], label: string): string[] {
  const fs = fsModule(label);
  const pathApi = pathModule();
  const output: string[] = [];
  const walk = (current: string): void => {
    if (!fs.existsSync(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (excluded.includes(entry.name)) continue;
      const full = pathApi.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) output.push(full);
    }
  };
  walk(dir);
  return output.sort();
}

/** Converts an absolute path under `root` to a POSIX-style pack-relative path. */
export function relativePath(root: string, file: string): string {
  const pathApi = pathModule();
  const resolvedRoot = pathApi.resolve(root);
  const resolvedFile = pathApi.resolve(file);
  const prefix = resolvedRoot.endsWith("\\") || resolvedRoot.endsWith("/") ? resolvedRoot : `${resolvedRoot}${resolvedRoot.includes("\\") ? "\\" : "/"}`;
  return resolvedFile.startsWith(prefix) ? resolvedFile.slice(prefix.length).replace(/\\/g, "/") : resolvedFile;
}
