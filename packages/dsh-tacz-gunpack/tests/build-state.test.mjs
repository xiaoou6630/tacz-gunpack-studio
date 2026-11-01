import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

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

/**
 * Writes a minimal but *measurably good* geometry + atlas into the pack.
 *
 * The GEOMETRY gate now measures the exported files, not just their presence:
 * an atlas with too few colours, or geometry whose faces all collapse onto one
 * UV rectangle, fails. This fixture therefore has to carry real numbers —
 * 150 cubes each with its own UV rectangle, and a PNG with 150 distinct colours
 * covering the whole atlas.
 */
function writeRealGeometry() {
  const cubes = [];
  for (let i = 0; i < 150; i++) {
    // Lay the atlas out as a 12-column grid of 10px cells so every cube gets a
    // genuinely different box-UV origin, the way Auto UV would assign it.
    const col = i % 12;
    const row = Math.floor(i / 12);
    cubes.push({
      origin: [i * 0.01, 0, 0],
      size: [1, 1, 1],
      uv: [col * 10, row * 10],
    });
  }
  const geo = {
    format_version: "1.12.0",
    "minecraft:geometry": [
      {
        description: { identifier: "geometry.ksg", texture_width: 128, texture_height: 128 },
        bones: [{ name: "AKM", pivot: [0, 0, 0], cubes }],
      },
    ],
  };
  writePack("assets/keltec/geo_models/gun/ksg_geo.json", JSON.stringify(geo));

  // A 128x128 PNG where every pixel is opaque and carries one of 150 colours.
  const width = 128;
  const height = 128;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const shade = (x + y) % 150;
      raw[offset++] = shade * 1.7 % 256;
      raw[offset++] = shade * 1.3 % 256;
      raw[offset++] = shade * 0.9 % 256;
      raw[offset++] = 255;
    }
  }
  const chunks = [];
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) : 0);
    chunks.push(Buffer.concat([length, body, crc]));
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  chunk("IHDR", ihdr);
  chunk("IDAT", zlib.deflateSync(raw));
  chunk("IEND", Buffer.alloc(0));
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);
  const uvPath = path.join(pack, "assets/keltec/textures/gun/uv/ksg.png");
  fs.mkdirSync(path.dirname(uvPath), { recursive: true });
  fs.writeFileSync(uvPath, png);
}

test("geometry, data, review and package gates advance to READY", () => {
  write("models/ksg.bbmodel", "{}");
  writeRealGeometry();
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
