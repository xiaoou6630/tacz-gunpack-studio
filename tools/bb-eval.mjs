/**
 * Reads Blockbench's plugin state over the DevTools protocol.
 *
 * Blockbench silently disables a plugin whose onload throws, so a bundle that
 * fails to parse looks like "the plugin is gone" with no visible error. This
 * asks the running page directly.
 *
 * Usage: node tools/bb-eval.mjs "<javascript expression>"
 */
const expression = process.argv[2];
if (!expression) {
  console.error('usage: node tools/bb-eval.mjs "<expression>"');
  process.exit(2);
}

const listRes = await fetch("http://127.0.0.1:9222/json");
const pages = await listRes.json();
const page = pages.find(p => p.type === "page");
if (!page) {
  console.error("no debuggable page found");
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
const result = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("evaluate timed out")), 20000);
  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
  });
  ws.addEventListener("message", event => {
    const msg = JSON.parse(event.data);
    if (msg.id !== 1) return;
    clearTimeout(timer);
    ws.close();
    resolve(msg.result);
  });
  ws.addEventListener("error", err => {
    clearTimeout(timer);
    reject(err);
  });
});

if (result?.exceptionDetails) {
  console.error("EXCEPTION:", result.exceptionDetails.text);
  console.error(result.exceptionDetails.exception?.description ?? "");
  process.exit(1);
}
console.log(JSON.stringify(result?.result?.value ?? result, null, 2));
