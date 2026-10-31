/**
 * Reads Blockbench's live plugin state over the Chrome DevTools Protocol.
 *
 * Blockbench has no log file, so the only way to see why a plugin did not
 * load is to ask the running renderer. Start Blockbench with
 * `--remote-debugging-port=9222` first.
 *
 * Usage: node tools/bb-probe.mjs ["<javascript expression>"]
 */
import http from "node:http";

const PORT = 9222;

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}/json`, res => {
      let body = "";
      res.on("data", chunk => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

/** Minimal CDP client: one websocket, one Runtime.evaluate round trip. */
async function evaluate(wsUrl, expression) {
  const { default: WebSocket } = await import("node:ws").catch(() => ({ default: globalThis.WebSocket }));
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP timeout")), 15000);
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id === 1) {
        clearTimeout(timer);
        resolve(message.result);
      }
    });
    socket.send(JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, returnByValue: true, awaitPromise: true, timeout: 10000 },
    }));
  });
  socket.close();
  return result;
}

const EXPRESSION = process.argv[2] ?? `JSON.stringify({
  loaded: Plugins.all.map(p => ({ id: p.id, title: p.title, version: p.version })),
  registered: Object.keys(BarItems ?? {}).length,
})`;

const targets = await getTargets();
const page = targets.find(t => t.type === "page");
if (!page) {
  console.error("No page target; is Blockbench running with --remote-debugging-port=9222?");
  process.exit(2);
}

const result = await evaluate(page.webSocketDebuggerUrl, EXPRESSION);
if (result.exceptionDetails) {
  console.error("evaluate threw:", result.exceptionDetails.text);
  console.error(result.exceptionDetails.exception?.description ?? "");
  process.exit(1);
}
const value = result.result?.value;
console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
