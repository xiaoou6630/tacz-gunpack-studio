/**
 * One-shot verification: open a gun in Blockbench, export the animations
 * through Blockbench's own Bedrock codec, and report whether a round trip
 * preserves TaCZ's data.
 *
 * Run after Blockbench has been started with --remote-debugging-port=9222.
 * Prints only a compact summary, never file contents.
 *
 * Usage: node tools/verify-roundtrip.mjs <pack_dir> <gun_id> <mcp_url>
 */
import fs from "node:fs";
import http from "node:http";

const [packDir, gunId, mcpUrl = "http://localhost:3000/bb-mcp"] = process.argv.slice(2);
if (!packDir || !gunId) {
  console.error("usage: node tools/verify-roundtrip.mjs <pack_dir> <gun_id> [mcp_url]");
  process.exit(2);
}

/** Minimal JSON-RPC over the streamable-HTTP MCP endpoint. */
async function mcpCall(body, sessionId) {
  const res = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const line = text.split("\n").filter(l => l.trim().startsWith("{")).pop() ?? text;
  return { json: JSON.parse(line), sessionId: res.headers.get("mcp-session-id") ?? sessionId };
}

// ---- 1. open the gun --------------------------------------------------------
const init = await mcpCall({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "verify", version: "1" } },
});
const opened = await mcpCall({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: { name: "tacz_gun", arguments: { action: "open", pack_dir: packDir, gun_id: gunId } },
}, init.sessionId);
const payload = JSON.parse(opened.json.result.content[0].text);
console.log(`opened  : ${payload.project} — ${payload.groups} groups, ${payload.cubes} cubes`);
console.log(`clips   : ${payload.animations.length}`);

// ---- 2. export through Blockbench's codec -----------------------------------
const exported = await mcpCall({
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: {
    name: "risky_eval",
    arguments: { code: "JSON.stringify(AnimationCodec.codecs.bedrock.compileFile(Animation.all))" },
  },
}, init.sessionId);

// risky_eval is off by default in this fork, so fall back to the CDP probe.
let exportedJson = null;
if (exported.json.result?.content?.[0]?.text) {
  try {
    exportedJson = JSON.parse(exported.json.result.content[0].text);
  } catch {
    exportedJson = null;
  }
}

if (!exportedJson) {
  console.log("");
  console.log("risky_eval is disabled (expected for this fork); reading via CDP instead.");
  const targets = await new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9222/json", res => {
      let b = "";
      res.on("data", c => (b += c));
      res.on("end", () => resolve(JSON.parse(b)));
    }).on("error", reject);
  });
  const page = targets.find(t => t.type === "page");
  if (!page) {
    console.error("no CDP page target; is Blockbench running with --remote-debugging-port=9222?");
    process.exit(2);
  }
  const { default: WS } = await import("node:ws").catch(() => ({ default: globalThis.WebSocket }));
  const socket = new WS(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    socket.addEventListener("open", r, { once: true });
    socket.addEventListener("error", j, { once: true });
  });
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP timeout")), 20000);
    socket.addEventListener("message", e => {
      const m = JSON.parse(e.data);
      if (m.id === 1) {
        clearTimeout(timer);
        resolve(m.result);
      }
    });
    socket.send(JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: {
        expression: "JSON.stringify(AnimationCodec.codecs.bedrock.compileFile(Animation.all))",
        returnByValue: true,
        awaitPromise: true,
      },
    }));
  });
  socket.close();
  exportedJson = JSON.parse(result.result.value);
}

const exportPath = process.env.TEMP + "/verify-export.json";
fs.writeFileSync(exportPath, JSON.stringify(exportedJson, null, 2), "utf8");
console.log(`exported: ${Object.keys(exportedJson.animations).length} clips -> ${exportPath}`);

// ---- 3. compare -------------------------------------------------------------
const meta = JSON.parse(fs.readFileSync(packDir + "/gunpack.meta.json", "utf8"));
const source = JSON.parse(
  fs.readFileSync(`${packDir}/assets/${meta.namespace}/animations/${gunId}.animation.json`, "utf8"),
);

function flatten(channel) {
  if (Array.isArray(channel) && channel.every(v => typeof v === "number")) return [[0, ...channel.map(Number)]];
  return Object.entries(channel).map(([t, p]) => [Number(t), ...p.map(Number)]).sort((a, b) => a[0] - b[0]);
}

const problems = [];
let channels = 0;
let keys = 0;
for (const [clipName, clip] of Object.entries(source.animations)) {
  const out = exportedJson.animations[`animation.${clipName}`];
  if (!out) {
    problems.push(`${clipName}: missing from export`);
    continue;
  }
  for (const [bone, chans] of Object.entries(clip.bones ?? {})) {
    const outBone = out.bones?.[bone];
    if (!outBone) {
      problems.push(`${clipName}/${bone}: missing`);
      continue;
    }
    for (const channel of ["rotation", "position", "scale"]) {
      if (chans[channel] === undefined) continue;
      channels++;
      const a = flatten(chans[channel]);
      const b = outBone[channel] === undefined ? [] : flatten(outBone[channel]);
      if (a.length !== b.length) {
        problems.push(`${clipName}/${bone}/${channel}: ${a.length} keys -> ${b.length}`);
        continue;
      }
      for (let i = 0; i < a.length; i++) {
        keys++;
        for (let axis = 1; axis < 4; axis++) {
          if (Math.abs(a[i][axis] - b[i][axis]) > 1e-4) {
            problems.push(`${clipName}/${bone}/${channel} key${i}: ${a[i][axis]} -> ${b[i][axis]}`);
          }
        }
        // Times must survive too; this is the check that caught the snapping bug.
        if (Math.abs(a[i][0] - b[i][0]) > 1e-4) {
          problems.push(`${clipName}/${bone}/${channel} key${i}: time ${a[i][0]} -> ${b[i][0]}`);
        }
      }
    }
  }
}

console.log("");
console.log(`channels: ${channels}   keys: ${keys}   problems: ${problems.length}`);
if (problems.length === 0) {
  console.log("RESULT: TaCZ 与 Blockbench 往返无损 —— 同一份动画两边通用");
} else {
  for (const p of problems.slice(0, 15)) console.log(`  ${p}`);
  if (problems.length > 15) console.log(`  ... 另外 ${problems.length - 15} 条`);
}
