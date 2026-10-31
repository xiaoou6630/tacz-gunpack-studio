import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { verifyPack } = await import("../lib/verify-pack.mjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "tacz-verify-"));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

function write(rel, text = "{}") {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

write("gunpack.meta.json", JSON.stringify({ namespace: "demo" }));
write("assets/demo/display/guns/x_display.json", JSON.stringify({
  model: "demo:gun/x_geo",
  texture: "demo:gun/uv/x",
  slot: "demo:gun/slot/x",
  animation: "demo:x",
}));
write("assets/demo/geo_models/gun/x_geo.json");
write("assets/demo/textures/gun/uv/x.png", "png");
write("assets/demo/textures/gun/slot/x.png", "png");
write("assets/demo/animations/x.animation.json", JSON.stringify({ format_version: "1.8.0", animations: {} }));
write("data/demo/index/guns/x.json", JSON.stringify({ display: "demo:x_display", data: "demo:x_data" }));
write("data/demo/data/guns/x_data.json", "{}");
write("assets/demo/textures/gun/slot/_write_test.txt", "probe");

test("valid pack passes and reports residue", () => {
  const report = verifyPack(root);
  assert.equal(report.ok, true, report.errors.join("\n"));
  assert.ok(report.warnings.some(warning => warning.includes("_write_test.txt")));
});

test("missing animation reference is an error", () => {
  fs.rmSync(path.join(root, "assets/demo/animations/x.animation.json"));
  const report = verifyPack(root);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some(error => error.includes("assets/demo/animations/x.animation.json")));
});

test("legacy .json animation is called out", () => {
  write("assets/demo/animations/x.json", "{}");
  const report = verifyPack(root);
  assert.ok(report.errors.some(error => error.includes("legacy .json")));
});
