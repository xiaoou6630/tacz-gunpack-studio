/**
 * Captures console output and exceptions from Blockbench over CDP.
 *
 * A plugin whose onload throws leaves no visible trace: Blockbench shows an
 * empty title and version 0.0.1. The error only exists on the console, so this
 * attaches before a reload and prints whatever comes through.
 *
 * Usage: node tools/bb-console.mjs [seconds]
 */
const seconds = Number(process.argv[2] ?? 12);

const listRes = await fetch("http://127.0.0.1:9222/json");
const pages = await listRes.json();
const page = pages.find(p => p.type === "page");
if (!page) {
  console.error("no debuggable page");
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

ws.addEventListener("message", event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    const text = (msg.params.args ?? [])
      .map(a => a.value ?? a.description ?? a.unserializableValue ?? "")
      .join(" ");
    console.log(`[${msg.params.type}] ${text}`);
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    console.log(`[EXCEPTION] ${d.text} ${d.exception?.description ?? ""}`);
  }
  if (msg.method === "Log.entryAdded") {
    const e = msg.params.entry;
    console.log(`[log:${e.level}] ${e.text}`);
  }
});

const send = (method, params = {}) =>
  new Promise(resolve => {
    const callId = ++id;
    pending.set(callId, resolve);
    ws.send(JSON.stringify({ id: callId, method, params }));
  });

await new Promise(resolve => ws.addEventListener("open", resolve));
await send("Runtime.enable");
await send("Log.enable");

console.log(`listening for ${seconds}s — reload the plugin now (Ctrl+Shift+P or restart Blockbench)`);
await new Promise(resolve => setTimeout(resolve, seconds * 1000));

ws.close();
console.log("done");
