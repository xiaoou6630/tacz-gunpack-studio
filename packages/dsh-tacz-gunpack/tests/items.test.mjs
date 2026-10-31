import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const {
  createAmmoItem,
  createAttachmentItem,
  createItemRecipe,
  createAttachmentTag,
  verifyItems,
} = await import("../lib/items.mjs");

const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tacz-items-"));
const pack = path.join(projectRoot, "demo_pack");
test.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

const ns = "demo";

/** Writes a pack file, creating parents. */
function writePack(rel, text = "{}") {
  const file = path.join(pack, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

/** Reads a pack JSON file. */
function readPack(rel) {
  return JSON.parse(fs.readFileSync(path.join(pack, rel), "utf8"));
}

/** True when a pack-relative file exists. */
function hasPack(rel) {
  return fs.existsSync(path.join(pack, rel));
}

/** Creates the asset files an ammo display references. */
function seedAmmoAssets(id) {
  writePack(`assets/${ns}/geo_models/ammo/${id}.json`, "{}");
  writePack(`assets/${ns}/textures/ammo/uv/${id}.png`, "png");
  writePack(`assets/${ns}/textures/ammo/slot/${id}.png`, "png");
}

/** Creates the asset files an attachment display references. */
function seedAttachmentAssets(id) {
  writePack(`assets/${ns}/geo_models/attachment/${id}_geo.json`, "{}");
  writePack(`assets/${ns}/textures/attachment/uv/${id}.png`, "png");
  writePack(`assets/${ns}/textures/attachment/slot/${id}.png`, "png");
}

writePack("gunpack.meta.json", JSON.stringify({ namespace: ns }));
writePack(`assets/${ns}/lang/zh_cn.json`, JSON.stringify({ "pack.demo.name": "演示包" }));
writePack(`assets/${ns}/lang/en_us.json`, JSON.stringify({ "pack.demo.name": "Demo pack" }));
seedAmmoAssets("12g");

test("createAmmoItem writes index, display and lang entries", () => {
  const result = createAmmoItem({
    projectRoot,
    packDir: pack,
    ammoId: "12g",
    displayName: "12 号口径霰弹",
    stackSize: 36,
    sort: 24,
    tracerColor: "#FF3030",
    shellModel: "shell/12g_shell",
    shellTexture: "shell/12g_shell",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.files, [
    `assets/${ns}/display/ammo/12g_display.json`,
    `assets/${ns}/lang/en_us.json`,
    `assets/${ns}/lang/zh_cn.json`,
    `data/${ns}/index/ammo/12g.json`,
  ]);
  // The shell pair has no assets yet, so it is reported as missing.
  assert.deepEqual(result.missing, [
    `assets/${ns}/geo_models/shell/12g_shell.json`,
    `assets/${ns}/textures/shell/12g_shell.png`,
  ]);

  const index = readPack(`data/${ns}/index/ammo/12g.json`);
  // tracer_color belongs to the display file per the wiki, not the index.
  assert.deepEqual(index, {
    name: `${ns}.ammo.12g.name`,
    display: `${ns}:12g_display`,
    stack_size: 36,
    sort: 24,
  });

  const display = readPack(`assets/${ns}/display/ammo/12g_display.json`);
  assert.equal(display.model, `${ns}:ammo/12g`);
  assert.equal(display.texture, `${ns}:ammo/uv/12g`);
  assert.equal(display.slot, `${ns}:ammo/slot/12g`);
  assert.equal(display.tracer_color, "#FF3030");
  assert.deepEqual(display.shell, {
    model: `${ns}:shell/12g_shell`,
    texture: `${ns}:shell/12g_shell`,
  });

  const zh = readPack(`assets/${ns}/lang/zh_cn.json`);
  assert.equal(zh["pack.demo.name"], "演示包", "existing lang keys must survive");
  assert.equal(zh[`${ns}.ammo.12g.name`], "12 号口径霰弹");
  const en = readPack(`assets/${ns}/lang/en_us.json`);
  assert.equal(en["pack.demo.name"], "Demo pack");
  assert.equal(en[`${ns}.ammo.12g.name`], "12 号口径霰弹");
});

test("createAmmoItem honours explicit references and defaults", () => {
  seedAmmoAssets("9mm");
  const result = createAmmoItem({ projectRoot, packDir: pack, ammoId: "9mm", displayName: "9mm 手枪弹" });
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.files, [
    `assets/${ns}/display/ammo/9mm_display.json`,
    `assets/${ns}/lang/en_us.json`,
    `assets/${ns}/lang/zh_cn.json`,
    `data/${ns}/index/ammo/9mm.json`,
  ]);
  const index = readPack(`data/${ns}/index/ammo/9mm.json`);
  assert.equal(index.stack_size, 64);
  assert.equal(index.sort, 10);
  assert.equal("tracer_color" in index, false);
  assert.equal("tracer_color" in readPack(`assets/${ns}/display/ammo/9mm_display.json`), false);
  assert.equal("shell" in readPack(`assets/${ns}/display/ammo/9mm_display.json`), false);
});

test("createAmmoItem refuses to overwrite without overwrite: true", () => {
  assert.throws(
    () => createAmmoItem({ projectRoot, packDir: pack, ammoId: "9mm", displayName: "再次" }),
    /refusing to overwrite/,
  );
  const result = createAmmoItem({ projectRoot, packDir: pack, ammoId: "9mm", displayName: "9mm 重写", overwrite: true });
  assert.equal(result.ok, true);
  assert.equal(readPack(`assets/${ns}/lang/zh_cn.json`)[`${ns}.ammo.9mm.name`], "9mm 重写");
});

test("createAttachmentItem writes index, data, display and lang", () => {
  seedAttachmentAssets("scope_acog");
  const result = createAttachmentItem({
    projectRoot,
    packDir: pack,
    attachmentId: "scope_acog",
    type: "scope",
    displayName: "TA31 瞄具",
    data: { weight: 1.2, ads_addend: 0.015 },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.files, [
    `assets/${ns}/display/attachments/scope_acog_display.json`,
    `assets/${ns}/lang/en_us.json`,
    `assets/${ns}/lang/zh_cn.json`,
    `data/${ns}/data/attachments/scope_acog_data.json`,
    `data/${ns}/index/attachments/scope_acog.json`,
  ]);
  assert.deepEqual(result.missing, []);

  const index = readPack(`data/${ns}/index/attachments/scope_acog.json`);
  assert.deepEqual(index, {
    name: `${ns}.attachment.scope_acog.name`,
    display: `${ns}:scope_acog_display`,
    data: `${ns}:scope_acog_data`,
    type: "scope",
    sort: 10,
  });
  const data = readPack(`data/${ns}/data/attachments/scope_acog_data.json`);
  assert.deepEqual(data, { weight: 1.2, ads_addend: 0.015 });
  const display = readPack(`assets/${ns}/display/attachments/scope_acog_display.json`);
  assert.equal(display.slot, `${ns}:attachment/slot/scope_acog`);
  assert.equal(display.model, `${ns}:attachment/scope_acog_geo`);
  assert.equal(display.texture, `${ns}:attachment/uv/scope_acog`);
  assert.deepEqual(display.sounds, {
    install: "tacz:attachments/attachment_general_b",
    uninstall: "tacz:attachments/attachment_general_uninstall",
  });
});

test("createAttachmentItem defaults data and accepts custom sounds", () => {
  const result = createAttachmentItem({
    projectRoot,
    packDir: pack,
    attachmentId: "muzzle_brake",
    type: "muzzle",
    displayName: "制退器",
    sounds: { install: "attachments/scope_general_b", uninstall: "attachments/scope_general_b" },
  });
  assert.deepEqual(result.missing, [
    `assets/${ns}/geo_models/attachment/muzzle_brake_geo.json`,
    `assets/${ns}/textures/attachment/slot/muzzle_brake.png`,
    `assets/${ns}/textures/attachment/uv/muzzle_brake.png`,
  ]);
  assert.deepEqual(readPack(`data/${ns}/data/attachments/muzzle_brake_data.json`), { weight: 0 });
  const display = readPack(`assets/${ns}/display/attachments/muzzle_brake_display.json`);
  assert.deepEqual(display.sounds, {
    install: `${ns}:attachments/scope_general_b`,
    uninstall: `${ns}:attachments/scope_general_b`,
  });
});

test("createItemRecipe writes a gun smith table recipe for each kind", () => {
  const ammoRecipe = createItemRecipe({
    projectRoot,
    packDir: pack,
    kind: "ammo",
    id: "12g",
    materials: [
      { item: { tag: "forge:ingots/copper" }, count: 15 },
      { item: { tag: "forge:gunpowder" }, count: 6 },
    ],
    result: { type: "ammo", id: "12g", count: 18, group: "shotgun_shells" },
  });
  assert.equal(ammoRecipe.ok, true);
  assert.equal(ammoRecipe.file, `data/${ns}/recipes/ammo/12g.json`);
  const recipe = readPack(ammoRecipe.file);
  assert.equal(recipe.type, "tacz:gun_smith_table_crafting");
  assert.deepEqual(recipe.materials, [
    { item: { tag: "forge:ingots/copper" }, count: 15 },
    { item: { tag: "forge:gunpowder" }, count: 6 },
  ]);
  assert.deepEqual(recipe.result, {
    type: "ammo",
    id: `${ns}:12g`,
    count: 18,
    group: "shotgun_shells",
  });

  const attachmentRecipe = createItemRecipe({
    projectRoot,
    packDir: pack,
    kind: "attachment",
    id: "scope_acog",
    materials: [{ item: { item: "minecraft:glass" }, count: 2 }],
    result: { id: `${ns}:scope_acog` },
  });
  assert.equal(attachmentRecipe.file, `data/${ns}/recipes/attachment/scope_acog.json`);
  assert.deepEqual(readPack(attachmentRecipe.file).result, { type: "attachment", id: `${ns}:scope_acog` });
});

test("createItemRecipe validates kind, materials and ids", () => {
  assert.throws(() => createItemRecipe({ projectRoot, packDir: pack, kind: "block", id: "x", materials: [{ item: { tag: "a:b" }, count: 1 }], result: { id: "x" } }), /kind must be one of/);
  assert.throws(() => createItemRecipe({ projectRoot, packDir: pack, kind: "ammo", id: "x", materials: [], result: { id: "x" } }), /materials must be a non-empty array/);
  assert.throws(() => createItemRecipe({ projectRoot, packDir: pack, kind: "ammo", id: "x", materials: [{ item: {}, count: 1 }], result: { id: "x" } }), /needs a "tag" or "item"/);
  assert.throws(() => createItemRecipe({ projectRoot, packDir: pack, kind: "ammo", id: "x", materials: [{ item: { tag: "a:b" }, count: 0 }], result: { id: "x" } }), /count must be a positive integer/);
});

test("createAttachmentTag writes the allow_attachments array", () => {
  const result = createAttachmentTag({
    projectRoot,
    packDir: pack,
    gunId: "m870",
    tags: ["#tacz:shotgun_extended_mag", "tacz:ammo_mod", "#tacz:muzzle_shotgun"],
  });
  assert.equal(result.ok, true);
  assert.equal(result.file, `data/${ns}/tacz_tags/attachments/allow_attachments/m870.json`);
  assert.deepEqual(readPack(result.file), [
    "#tacz:shotgun_extended_mag",
    "#tacz:ammo_mod",
    "#tacz:muzzle_shotgun",
  ]);
});

test("writers reject path traversal and invalid ids", () => {
  assert.throws(() => createAmmoItem({ projectRoot, packDir: pack, ammoId: "../escape", displayName: "x" }), /ammoId must match/);
  assert.throws(() => createAmmoItem({ projectRoot, packDir: pack, ammoId: "Bad Id", displayName: "x" }), /ammoId must match/);
  assert.throws(() => createAttachmentItem({ projectRoot, packDir: pack, attachmentId: "../../x", type: "scope", displayName: "x" }), /attachmentId must match/);
  assert.throws(() => createItemRecipe({ projectRoot, packDir: pack, kind: "gun", id: "/abs/path", materials: [{ item: { tag: "a:b" }, count: 1 }], result: { id: "x" } }), /id must match/);
  assert.throws(() => createAttachmentTag({ projectRoot, packDir: pack, gunId: "a/b", tags: ["#tacz:x"] }), /gunId must match/);
  assert.throws(() => createAttachmentTag({ projectRoot, packDir: pack, gunId: "ok", tags: ["not a tag"] }), /must look like "#namespace:path"/);
  assert.throws(() => createAmmoItem({ projectRoot, packDir: path.join(projectRoot, "missing"), ammoId: "ok", displayName: "x" }), /pack_dir not found/);
});

test("verifyItems passes on a consistent item pack", () => {
  seedAmmoAssets("9mm");
  writePack(`assets/${ns}/geo_models/shell/12g_shell.json`, "{}");
  writePack(`assets/${ns}/textures/shell/12g_shell.png`, "png");
  seedAttachmentAssets("muzzle_brake");
  writePack(`data/${ns}/index/guns/m870.json`, JSON.stringify({ name: `${ns}.gun.m870.name`, display: `${ns}:m870_display`, data: `${ns}:m870_data`, type: "shotgun" }));
  writePack(`data/${ns}/data/guns/m870_data.json`, JSON.stringify({ ammo: `${ns}:12g`, allow_attachment_types: ["muzzle", "extended_mag"] }));

  const report = verifyItems(pack);
  assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
  assert.equal(report.ammo, 2);
  assert.equal(report.attachments, 2);
  assert.equal(report.errors.length, 0);
});

test("verifyItems errors on a missing ammo display file", () => {
  fs.rmSync(path.join(pack, `assets/${ns}/display/ammo/9mm_display.json`));
  const report = verifyItems(pack);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some(error => error.code === "missing_json" && error.path === `assets/${ns}/display/ammo/9mm_display.json`));
});

test("verifyItems passes again once the display file is restored", () => {
  writePack(`assets/${ns}/display/ammo/9mm_display.json`, JSON.stringify({
    model: `${ns}:ammo/9mm`,
    texture: `${ns}:ammo/uv/9mm`,
    slot: `${ns}:ammo/slot/9mm`,
  }));
  const report = verifyItems(pack);
  assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
  assert.equal(report.errors.length, 0);
});

test("verifyItems errors on a missing display texture and a dangling recipe result", () => {
  fs.rmSync(path.join(pack, `assets/${ns}/textures/attachment/uv/scope_acog.png`));
  writePack(`data/${ns}/recipes/ammo/ghost.json`, JSON.stringify({
    type: "tacz:gun_smith_table_crafting",
    materials: [{ item: { tag: "forge:gunpowder" }, count: 1 }],
    result: { type: "ammo", id: `${ns}:ghost` },
  }));
  const report = verifyItems(pack);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some(error => error.code === "attachment_display_texture" && error.message.includes("textures/attachment/uv/scope_acog.png")));
  assert.ok(report.errors.some(error => error.code === "recipe_result_missing" && error.path === `data/${ns}/recipes/ammo/ghost.json`));
  fs.rmSync(path.join(pack, `data/${ns}/recipes/ammo/ghost.json`));
  writePack(`assets/${ns}/textures/attachment/uv/scope_acog.png`, "png");
});

test("verifyItems errors when a tag file is not an array of strings", () => {
  writePack(`data/${ns}/tacz_tags/attachments/allow_attachments/bad.json`, JSON.stringify({ tags: ["#tacz:x"] }));
  writePack(`data/${ns}/tacz_tags/attachments/allow_attachments/bad2.json`, JSON.stringify(["#tacz:x", 3]));
  const report = verifyItems(pack);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some(error => error.code === "tag_not_array" && error.path === `data/${ns}/tacz_tags/attachments/allow_attachments/bad.json`));
  assert.ok(report.errors.some(error => error.code === "tag_not_strings" && error.path === `data/${ns}/tacz_tags/attachments/allow_attachments/bad2.json`));
  fs.rmSync(path.join(pack, `data/${ns}/tacz_tags/attachments/allow_attachments/bad.json`));
  fs.rmSync(path.join(pack, `data/${ns}/tacz_tags/attachments/allow_attachments/bad2.json`));
});

test("verifyItems warns instead of erroring for advisories", () => {
  writePack(`data/${ns}/tacz_tags/attachments/allow_attachments/m870.json`, JSON.stringify(["#other:foreign_tag"]));
  writePack(`data/${ns}/data/guns/m870_data.json`, JSON.stringify({ ammo: `${ns}:12g` }));
  writePack(`data/${ns}/recipes/attachment/foreign.json`, JSON.stringify({
    type: "tacz:gun_smith_table_crafting",
    materials: [{ item: { tag: "forge:gunpowder" }, count: 1 }],
    result: { type: "attachment", id: "other:thing" },
  }));
  const report = verifyItems(pack);
  assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
  assert.ok(report.warnings.some(warning => warning.code === "allow_attachment_types_missing"));
  assert.ok(report.warnings.some(warning => warning.code === "tag_foreign_namespace"));
  assert.ok(report.warnings.some(warning => warning.code === "foreign_recipe_result"));
});

test("verifyItems counts items and never throws on a missing pack", () => {
  const missing = verifyItems(path.join(projectRoot, "nope"));
  assert.equal(missing.ok, false);
  assert.equal(missing.errors[0].code, "pack_missing");
  assert.equal(missing.ammo, 0);
  assert.equal(missing.attachments, 0);
});

