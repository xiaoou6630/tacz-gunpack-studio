/**
 * Loads a skin PNG into the currently open Blockbench skin project.
 *
 * Why this exists: `create_project` with `format:"skin"` opens an empty 16x16
 * canvas with no texture object at all, so the project looks blank and the
 * plugin's texture tools have nothing to target. A skin is just a 64x64 PNG, so
 * the fix is to attach that PNG as the project texture rather than to paint it
 * pixel by pixel over MCP.
 *
 * Runs through the DevTools protocol because the MCP surface has no "set the
 * project texture from a file" tool.
 *
 * Usage: node tools/bb-load-skin.mjs <skin.png>
 */
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("usage: node tools/bb-load-skin.mjs <skin.png>");
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

function evaluate(expression) {
  return new Promise(resolve => {
    const callId = ++id;
    pending.set(callId, resolve);
    ws.send(JSON.stringify({
      id: callId,
      method: "Runtime.evaluate",
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
  });
}

// Read the PNG and hand it to the page as a data URL, so no file-system access
// from inside Blockbench is needed.
const dataUrl = `data:image/png;base64,${fs.readFileSync(abs).toString("base64")}`;

const script = `(async () => {
  if (typeof Project === "undefined" || !Project) return "no project open";
  if (Format?.id !== "skin") return "project format is " + (Format?.id ?? "unknown") + ", expected skin";

  const img = new Image();
  img.src = ${JSON.stringify(dataUrl)};
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error("image failed to decode")); });

  // Remove any texture that exists but has an empty canvas; reusing it left the
  // project showing a blank atlas even though source held the PNG.
  for (const existing of [...Texture.all]) {
    try { existing.remove(true); } catch {}
  }

  const tex = new Texture({ name: "skin", width: 64, height: 64, internal: true });
  tex.add(false);
  tex.width = 64;
  tex.height = 64;
  tex.canvas.width = 64;
  tex.canvas.height = 64;

  // Draw into the canvas FIRST, then derive the source from it, so the two
  // cannot disagree.
  const { ctx } = tex.getActiveCanvas();
  ctx.clearRect(0, 0, 64, 64);
  ctx.drawImage(img, 0, 0);

  tex.updateSource(tex.canvas.toDataURL("image/png", 1));
  tex.updateLayerChanges(true);
  tex.select();
  Project.texture_width = 64;
  Project.texture_height = 64;

  // The canvas is what the viewport samples; verify it actually holds pixels.
  const check = tex.getActiveCanvas().ctx.getImageData(0, 0, 64, 64).data;
  let opaque = 0;
  for (let i = 3; i < check.length; i += 4) if (check[i] > 0) opaque++;

  Canvas.updateAll();
  if (typeof UVEditor !== "undefined" && UVEditor.loadTexture) UVEditor.loadTexture(tex);

  return JSON.stringify({
    project: Project.name,
    texture: tex.name,
    size: [tex.width, tex.height],
    canvasOpaque: opaque,
    coverage: Math.round((opaque / (64 * 64)) * 100) + "%",
  });
})()`;

const res = await evaluate(script);
ws.close();

if (res.result?.exceptionDetails) {
  console.error("FAILED:", res.result.exceptionDetails.text);
  console.error(res.result.exceptionDetails.exception?.description ?? "");
  process.exit(1);
}
console.log(res.result?.result?.value ?? JSON.stringify(res, null, 2));
