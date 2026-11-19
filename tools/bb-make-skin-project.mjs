/**
 * Builds a proper Blockbench skin project for one skin PNG.
 *
 * What went wrong before: `create_project` over MCP accepts `format:"skin"` but
 * produces a 16x16 project with no texture and no body model, so the viewport
 * shows an empty grid. The skin format has `edit_mode: false` — there are no
 * cubes to edit — and its body model comes from `Formats.skin.new()`, which
 * opens the setup dialog and builds Head/Body/Arms/Legs plus their Layer
 * counterparts.
 *
 * This script:
 *   1. calls Formats.skin.new() to get the real body model
 *   2. forces the atlas to 64x64
 *   3. replaces the default steve.png with the supplied PNG
 *   4. switches to pose mode, which renders the actual texture instead of the
 *      paint-mode UV debug colours
 *
 * Usage: node tools/bb-make-skin-project.mjs <name> <skin.png>
 */
import fs from "node:fs";
import path from "node:path";

const [name, file] = process.argv.slice(2);
if (!name || !file) {
  console.error("usage: node tools/bb-make-skin-project.mjs <name> <skin.png>");
  process.exit(2);
}
const abs = path.resolve(file);
if (!fs.existsSync(abs)) {
  console.error(`not found: ${abs}`);
  process.exit(1);
}

const listRes = await fetch("http://127.0.0.1:9222/json");
const pages = await listRes.json();
const page = pages.find(p => p.type === "page");
if (!page) {
  console.error("no debuggable page — start Blockbench with --remote-debugging-port=9222");
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener("message", event => {
  const msg = JSON.parse(event.data);
  const resolve = pending.get(msg.id);
  if (resolve) {
    pending.delete(msg.id);
    resolve(msg);
  }
});
await new Promise(resolve => ws.addEventListener("open", resolve));

function evaluate(expression, timeoutMs = 20000) {
  return new Promise(resolve => {
    const callId = ++id;
    const timer = setTimeout(() => {
      pending.delete(callId);
      resolve({ timedOut: true });
    }, timeoutMs);
    pending.set(callId, msg => {
      clearTimeout(timer);
      resolve(msg);
    });
    ws.send(JSON.stringify({
      id: callId,
      method: "Runtime.evaluate",
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
  });
}

const dataUrl = `data:image/png;base64,${fs.readFileSync(abs).toString("base64")}`;

const script = `(async () => {
  if (typeof Formats === "undefined" || !Formats.skin) return "no skin format";
  if (typeof Formats.skin.new !== "function") return "Formats.skin.new missing";

  // Build the body model. This is the step create_project over MCP skips.
  Formats.skin.new();
  await new Promise(r => setTimeout(r, 600));

  if (!Project) return "Formats.skin.new produced no project";
  Project.name = ${JSON.stringify(name)};
  Project.texture_width = 64;
  Project.texture_height = 64;

  const img = new Image();
  img.src = ${JSON.stringify(dataUrl)};
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error("decode failed")); });

  // Drop the default steve.png so only our atlas remains.
  for (const existing of [...Texture.all]) {
    try { existing.remove(true); } catch {}
  }

  const tex = new Texture({ name: ${JSON.stringify(name)} + "_skin", width: 64, height: 64, internal: true });
  tex.add(false);
  tex.width = 64;
  tex.height = 64;
  tex.canvas.width = 64;
  tex.canvas.height = 64;
  const { ctx } = tex.getActiveCanvas();
  ctx.clearRect(0, 0, 64, 64);
  ctx.drawImage(img, 0, 0);
  tex.updateSource(tex.canvas.toDataURL("image/png", 1));
  tex.updateLayerChanges(true);
  tex.select();

  // Point every cube at the new texture; the default model still references the
  // removed one.
  let cubes = 0;
  if (typeof Cube !== "undefined") {
    for (const cube of Cube.all) { cube.applyTexture(tex, true); cubes++; }
  }

  const d = ctx.getImageData(0, 0, 64, 64).data;
  let opaque = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) opaque++;

  // Pose mode renders the real texture; paint mode shows UV debug colours.
  if (Modes?.options?.pose?.select) Modes.options.pose.select();
  Canvas.updateAll();

  return JSON.stringify({
    project: Project.name,
    cubes,
    texture: tex.name,
    size: [Project.texture_width, Project.texture_height],
    opaque,
    coverage: Math.round((opaque / 4096) * 100) + "%",
    mode: Modes?.selected?.id ?? "?",
  });
})()`;

const res = await evaluate(script, 30000);
ws.close();

if (res.timedOut) {
  console.error("timed out — Blockbench may still be building the project; retry in a moment");
  process.exit(1);
}
if (res.result?.exceptionDetails) {
  console.error("FAILED:", res.result.exceptionDetails.text);
  console.error(res.result.exceptionDetails.exception?.description ?? "");
  process.exit(1);
}
console.log(res.result?.result?.value ?? JSON.stringify(res, null, 2));
