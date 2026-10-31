import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const { allowedWrite, createWriteGuard, roleContractText, leadContractText } = await import("../lib/role-contract.mjs");
const cwd = path.join(os.tmpdir(), "tacz-role");

test("researcher may only write refs/specs", () => {
  assert.equal(allowedWrite("researcher", "refs/ksg/brief.json", cwd), true);
  assert.equal(allowedWrite("researcher", "specs/ksg.md", cwd), true);
  assert.equal(allowedWrite("researcher", "ksg_pack/assets/a.json", cwd), false);
  assert.equal(allowedWrite("researcher", "../outside.json", cwd), false);
});

test("modeler and data-smith cannot cross pack boundaries", () => {
  assert.equal(allowedWrite("modeler", "models/ksg.bbmodel", cwd), true);
  assert.equal(allowedWrite("modeler", "ksg_pack/data/a.json", cwd), false);
  assert.equal(allowedWrite("data-smith", "data/ns/index/guns/a.json", cwd), true);
  assert.equal(allowedWrite("data-smith", "assets/ns/display/guns/a_display.json", cwd), true);
  assert.equal(allowedWrite("data-smith", "assets/ns/geo_models/gun/a_geo.json", cwd), false);
  assert.equal(allowedWrite("data-smith", "assets/ns/scripts/a.lua", cwd), true);
});

test("reviewer may write only its review artifact", () => {
  assert.equal(allowedWrite("reviewer", "reviews/ksg.json", cwd), true);
  assert.equal(allowedWrite("reviewer", "refs/a.json", cwd), false);
  assert.equal(allowedWrite("reviewer", "data/a.json", cwd), false);
  assert.equal(allowedWrite("reviewer", "assets/ns/geo_models/a.json", cwd), false);
});

test("write guard accepts pack-prefixed paths from the project root", () => {
  const root = path.join(os.tmpdir(), "tacz-role-pack");
  fs.mkdirSync(path.join(root, "ksg_pack"), { recursive: true });
  fs.writeFileSync(path.join(root, "ksg_pack", "gunpack.meta.json"), "{}");
  assert.equal(allowedWrite("data-smith", "ksg_pack/data/ns/a.json", root), true);
  assert.equal(allowedWrite("data-smith", "ksg_pack/assets/ns/display/a.json", root), true);
  assert.equal(allowedWrite("data-smith", "ksg_pack/assets/ns/geo_models/a.json", root), false);
  assert.equal(allowedWrite("modeler", "ksg_pack/models/a.bbmodel", root), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("write guard returns an actionable reason", () => {
  const guard = createWriteGuard("researcher", cwd);
  assert.equal(guard({ name: "write", arguments: { file_path: path.join(cwd, "refs/a.json") } }), undefined);
  const reason = guard({ name: "write", arguments: { file_path: path.join(cwd, "ksg_pack/a.json") } });
  assert.match(reason, /may not write/);
  assert.match(reason, /return blocked/);
});

test("engineer may write plugin sources but not packs", () => {
  assert.equal(allowedWrite("engineer", "blockbench-mcp-tacz/lib/tacz/items.ts", cwd), true);
  assert.equal(allowedWrite("engineer", "dsh-tacz-gunpack/lib/items.mjs", cwd), true);
  assert.equal(allowedWrite("engineer", "ksg_pack/data/a.json", cwd), false);
  assert.equal(allowedWrite("engineer", "reviews/a.json", cwd), false);
  assert.equal(allowedWrite("engineer", "../outside/x.ts", cwd), false);
});

test("contracts name the role and boundaries", () => {
  assert.match(roleContractText("researcher"), /only job is reference search/);
  assert.match(roleContractText("modeler"), /Do not perform another role/);
  assert.match(leadContractText(), /Delegate role work/);
  assert.equal(roleContractText("unknown"), undefined);
});
