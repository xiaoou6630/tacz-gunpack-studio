/**
 * Reference research: text search through DSH's web service, image discovery
 * through Bing Images, and downloads into the workspace's `refs/` directory.
 *
 * @module
 */
import fs from "node:fs";
import path from "node:path";
import { ensureDir, insideRoot, refsRoot, slugify, writeTextAtomic } from "./paths.mjs";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 30_000;

/** Extracts image URLs from Bing Images HTML. */
function extractImageUrls(html) {
  const urls = new Set();
  const patterns = [
    /murl(?:&quot;|\\?")\s*:\s*(?:&quot;|\\?")(https?:\/\/[^"'&\\]+)/g,
    /"murl":"(https?:\/\/[^"]+)"/g,
    /imgurl=(https?:\/\/[^&"']+)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[1].replace(/&amp;/g, "&").replace(/\\u002f/gi, "/");
      if (/^https?:\/\//.test(url)) urls.add(url);
    }
  }
  return [...urls];
}

/** Guesses an extension from a content type or URL. */
function extensionFor(contentType, url) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  const match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url);
  return match ? match[1].toLowerCase() : "jpg";
}

/** Downloads one image with a timeout and size limit. */
async function downloadImage(url, target) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TACZ-Agent/0.1" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) throw new Error(`not an image (${type || "unknown"})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`image is ${bytes.byteLength} bytes, over the 10 MB limit`);
    fs.writeFileSync(target, bytes);
    return { bytes: bytes.byteLength, content_type: type };
  } finally {
    clearTimeout(timeout);
  }
}

/** Creates the `tacz_reference` executor. */
export function createReference(ctx, config = {}) {
  return async function reference(args) {
    const action = args?.action ?? "search";
    const query = String(args?.query ?? "").trim();
    if (!query) throw new Error("tacz_reference needs a non-empty query.");
    if (action === "search") {
      const web = ctx.get("web");
      if (!web || typeof web.search !== "function") throw new Error("The DSH web service is unavailable.");
      const result = await web.search({ query });
      return { action, query, results: result };
    }
    if (action !== "images") throw new Error(`Unknown tacz_reference action "${action}".`);
    const root = path.resolve(String(args?.root ?? ""));
    if (!args?.root) throw new Error("tacz_reference images needs a project root.");
    const outDir = path.join(refsRoot(root), slugify(query));
    if (!insideRoot(root, outDir)) throw new Error("Reference output escapes the project root.");
    ensureDir(outDir);
    const count = Math.min(Math.max(Number(args?.count ?? 4), 1), 8);
    const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&count=${count * 2}`;
    const response = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TACZ-Agent/0.1" },
    });
    if (!response.ok) throw new Error(`Bing Images returned HTTP ${response.status}.`);
    const html = await response.text();
    const urls = extractImageUrls(html).slice(0, count * 2);
    const files = [];
    const failed = [];
    for (const [index, url] of urls.entries()) {
      if (files.length >= count) break;
      try {
        const probe = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
        const type = probe.headers.get("content-type") ?? "";
        const extension = extensionFor(type, url);
        const target = path.join(outDir, `img-${String(files.length + 1).padStart(2, "0")}.${extension}`);
        const saved = await downloadImage(url, target);
        files.push({ file: path.relative(root, target).replace(/\\/g, "/"), url, ...saved });
      } catch (error) {
        failed.push({ url, reason: error instanceof Error ? error.message : String(error) });
      }
      if (index > 20) break;
    }
    const manifest = {
      query,
      generated_at: new Date().toISOString(),
      source: searchUrl,
      license_note: "Reference only. Do not copy copyrighted images into a distributed gun pack.",
      files,
      failed,
    };
    const manifestPath = path.join(outDir, "manifest.json");
    writeTextAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return { action, query, dir: path.relative(root, outDir).replace(/\\/g, "/"), files, failed, manifest: manifestPath };
  };
}
