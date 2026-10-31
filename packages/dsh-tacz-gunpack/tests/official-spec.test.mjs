import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { normalizeSpecPath, locateOfficialSources, resolveOfficialFile } = await import("../lib/official-spec.mjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tacz-spec-"));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("normalizes official pack paths and rejects traversal", () => {
  assert.equal(
    normalizeSpecPath("src/main/resources/assets/tacz/custom/tacz_default_gun/assets/tacz/scripts/default_state_machine.lua"),
    "scripts/default_state_machine.lua",
  );
  assert.equal(normalizeSpecPath("assets/tacz/animations/ak47.animation.json"), "animations/ak47.animation.json");
  assert.throws(() => normalizeSpecPath("scripts/../../secret"), /Invalid/);
  assert.throws(() => normalizeSpecPath("/etc/passwd"), /Invalid/);
});

test("local vendor source wins without network", async () => {
  const repo = path.join(root, "vendor", "TACZ");
  const script = path.join(repo, "src/main/resources/assets/tacz/custom/tacz_default_gun/assets/tacz/scripts/default_state_machine.lua");
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, "-- official state machine\n", "utf8");

  const located = locateOfficialSources({ cwd: root, env: {}, ref: "1.20.1" });
  assert.ok(located.sources.some(source => source.kind === "vendor/TACZ" && source.files.stateMachine));

  const resolved = await resolveOfficialFile("scripts/default_state_machine.lua", {
    cwd: root,
    env: {},
    ref: "1.20.1",
    fetchImpl: () => { throw new Error("network must not be used"); },
  });
  assert.equal(resolved.source, "local");
  assert.equal(resolved.path, script);
});

test("explicit source and cache are used before GitHub", async () => {
  const source = path.join(root, "extracted");
  const file = path.join(source, "scripts", "default_state_machine.lua");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "-- explicit\n", "utf8");
  const fromSource = await resolveOfficialFile("scripts/default_state_machine.lua", {
    source,
    fetchImpl: () => { throw new Error("network must not be used"); },
  });
  assert.equal(fromSource.source, "local");

  const cacheDir = path.join(root, "cache");
  const cached = path.join(cacheDir, "scripts", "default_state_machine.lua");
  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.writeFileSync(cached, "-- cache\n", "utf8");
  const fromCache = await resolveOfficialFile("scripts/default_state_machine.lua", {
    cwd: path.join(root, "empty"),
    env: {},
    cacheDir,
    fetchImpl: () => { throw new Error("network must not be used"); },
  });
  assert.equal(fromCache.source, "cache");
  assert.equal(fromCache.path, cached);
});
