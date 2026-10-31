import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { initBuild, statusBuild, advanceBuild, resumeBuild, ackBuild } = await import("../lib/build-state.mjs");
const { verifyPack } = await import("../lib/verify-pack.mjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tacz-build-"));
const pack = path.join(root, "ksg_pack");
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

function write(rel, text = "x") {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}
function writePack(rel, text = "{}") {
  const file = path.join(pack, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

writePack("gunpack.meta.json", JSON.stringify({ namespace: "keltec" }));

test("init creates an INIT build", () => {
  const result = initBuild({ project_root: root, pack_dir: pack, gun_id: "ksg", type: "shotgun" });
  assert.equal(result.existing, false);
  assert.equal(result.state.stage, "INIT");
});

test("wrong owner and missing artifacts block the controller", () => {
  assert.throws(() => advanceBuild({ project_root: root, gun_id: "ksg", stage: "INIT", owner: "researcher" }), /owned by "lead"/);
  const advance = advanceBuild({ project_root: root, gun_id: "ksg", stage: "INIT", owner: "lead" });
  assert.equal(advance.stage, "RESEARCH");
  const blocked = advanceBuild({ project_root: root, gun_id: "ksg", stage: "RESEARCH", owner: "researcher" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.state.status, "blocked");
});

test("resume requires the missing research artifact", () => {
  const blocked = resumeBuild({ project_root: root, gun_id: "ksg" });
  assert.equal(blocked.ok, false);
  write("refs/ksg/design-brief.json", JSON.stringify({ gun_id: "ksg", parts: [{ name: "receiver" }] }));
  write("refs/ksg/manifest.json", JSON.stringify({ images: [] }));
  const resumed = resumeBuild({ project_root: root, gun_id: "ksg" });
  assert.equal(resumed.ok, true);
  const advanced = advanceBuild({ project_root: root, gun_id: "ksg", stage: "RESEARCH", owner: "researcher" });
  assert.equal(advanced.stage, "BLUEPRINT");
});

test("blueprint gate needs parts and bones", () => {
  let advance = advanceBuild({ project_root: root, gun_id: "ksg", stage: "BLUEPRINT", owner: "modeler" });
  assert.equal(advance.ok, false);
  write("models/ksg-blueprint.json", JSON.stringify({ parts: [{ name: "receiver" }], bones: [{ name: "root" }] }));
  advance = advanceBuild({ project_root: root, gun_id: "ksg", stage: "BLUEPRINT", owner: "modeler" });
  assert.equal(advance.stage, "GEOMETRY");
});

test("geometry, data, review and package gates advance to READY", () => {
  write("models/ksg.bbmodel", "{}");
  writePack("assets/keltec/geo_models/gun/ksg_geo.json", "{}");
  writePack("assets/keltec/textures/gun/uv/ksg.png", "png");
  writePack("assets/keltec/textures/gun/slot/ksg.png", "png");
  writePack("assets/keltec/display/guns/ksg_display.json", JSON.stringify({
    model: "keltec:gun/ksg_geo",
    texture: "keltec:gun/uv/ksg",
    slot: "keltec:gun/slot/ksg",
  }));
  let advance = advanceBuild({ project_root: root, gun_id: "ksg", stage: "GEOMETRY", owner: "modeler" });
  assert.equal(advance.stage, "DATA", advance.gate?.errors?.join("\n"));

  writePack("data/keltec/index/guns/ksg.json", JSON.stringify({ display: "keltec:ksg_display", data: "keltec:ksg_data" }));
  writePack("data/keltec/data/guns/ksg_data.json", "{}");
  advance = advanceBuild({ project_root: root, gun_id: "ksg", stage: "DATA", owner: "data-smith" });
  assert.equal(advance.stage, "REVIEW", advance.gate?.errors?.join("\n"));

  const fingerprint = verifyPack(pack).fingerprint;
  write("reviews/ksg.json", JSON.stringify({ ok: true, blockers: [], pack_hash: fingerprint }));
  advance = advanceBuild({ project_root: root, gun_id: "ksg", stage: "REVIEW", owner: "reviewer" });
  assert.equal(advance.stage, "PACKAGE", advance.gate?.errors?.join("\n"));

  write("output/ksg.zip", "zip");
  advance = advanceBuild({ project_root: root, gun_id: "ksg", stage: "PACKAGE", owner: "lead" });
  assert.equal(advance.stage, "READY");
  assert.equal(advance.state.status, "ready");
});

test("human gate needs explicit confirmation", () => {
  const status = statusBuild(root, "ksg");
  assert.equal(status.gate.ok, true);
  assert.throws(() => ackBuild({ project_root: root, gun_id: "ksg", confirmed: false }), /confirmed=true/);
  const done = ackBuild({ project_root: root, gun_id: "ksg", confirmed: true, note: "in-game ok" });
  assert.equal(done.ok, true);
  assert.equal(done.state.status, "done");
});
