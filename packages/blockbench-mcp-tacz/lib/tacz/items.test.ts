import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  TACZ_ATTACHMENT_TYPES,
  buildAmmoDocuments,
  buildAttachmentDocuments,
  listAmmo,
  listAttachments,
  validateItems,
  writeAmmoDocuments,
  writeAttachmentDocuments,
} from "@/lib/tacz/items";
import { createPack } from "@/lib/tacz/pack";
import { writeBytesAtomic, writeJson } from "@/lib/tacz/paths";
import { TACZ_ITEM_TEMPLATES, getItemTemplate } from "@/lib/tacz/templates";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tacz-items-test-"));
const packDir = path.join(root, "items_pack");
const ns = "demo";

/** 1x1 PNG used for every texture/slot asset. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZq3GQAAAABJRU5ErkJggg==",
  "base64",
);

/** Writes a minimal Bedrock geometry file. */
function writeGeometry(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    format_version: "1.12.0",
    "minecraft:geometry": [{ description: { identifier: "geometry.item", texture_width: 32, texture_height: 32 }, bones: [] }],
  }));
}

/** Writes a PNG asset. */
function writePng(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG);
}

beforeAll(() => {
  (globalThis as unknown as { requireNativeModule: (name: string) => unknown }).requireNativeModule = (name: string) => {
    if (name === "fs") return fs;
    if (name === "path") return path;
    return undefined;
  };
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("TACZ ammo and attachment documents", () => {
  test("builds the official ammo index and display shape", () => {
    const docs = buildAmmoDocuments({ namespace: ns, ammoId: "12g", displayName: "12 Gauge", stackSize: 64, sort: 10, tracerColor: "#ffcc00" });
    // The wiki keeps tracer_color in the display file, not the index.
    expect(docs.index).toEqual({
      name: "demo.ammo.12g.name",
      display: "demo:12g_display",
      stack_size: 64,
      sort: 10,
    });
    // Official ammo geometry drops the `_geo` suffix (geo_models/ammo/12g.json).
    expect(docs.display).toEqual({
      model: "demo:ammo/12g",
      texture: "demo:ammo/uv/12g",
      slot: "demo:ammo/slot/12g",
      tracer_color: "#ffcc00",
    });
    expect(docs.lang).toEqual({ "demo.ammo.12g.name": "12 Gauge" });
  });

  test("omits the shell block unless both shell references are given", () => {
    expect(buildAmmoDocuments({ namespace: ns, ammoId: "9mm" }).display.shell).toBeUndefined();
    expect(buildAmmoDocuments({ namespace: ns, ammoId: "12g", shellModel: "demo:ammo/shell/12g_geo" }).display.shell).toBeUndefined();
    const withShell = buildAmmoDocuments({
      namespace: ns,
      ammoId: "12g",
      shellModel: "demo:ammo/shell/12g_geo",
      shellTexture: "demo:ammo/shell/12g",
    });
    expect(withShell.display.shell).toEqual({ model: "demo:ammo/shell/12g_geo", texture: "demo:ammo/shell/12g" });
  });

  test("defaults ammo stack size, sort, and display name", () => {
    const docs = buildAmmoDocuments({ namespace: ns, ammoId: "762x39" });
    expect(docs.index.stack_size).toBe(64);
    expect(docs.index.sort).toBe(10);
    expect(docs.lang["demo.ammo.762x39.name"]).toBe("762x39");
  });

  test("builds the official attachment index, data, display, and lang shape", () => {
    const docs = buildAttachmentDocuments({ namespace: ns, attachmentId: "acog", type: "scope", displayName: "ACOG", zoom: [4, 6], scope: true, fov: 40 });
    expect(docs.index).toEqual({
      name: "demo.attachment.acog.name",
      display: "demo:acog_display",
      data: "demo:acog_data",
      type: "scope",
      sort: 10,
    });
    expect(docs.data).toEqual({ weight: 0 });
    expect(docs.display).toEqual({
      slot: "demo:attachment/slot/acog",
      model: "demo:attachment/acog_geo",
      texture: "demo:attachment/uv/acog",
      sounds: { install: "tacz:attachments/attachment_general_b", uninstall: "tacz:attachments/attachment_general_uninstall" },
      zoom: [4, 6],
      scope: true,
      fov: 40,
    });
    expect(docs.lang).toEqual({ "demo.attachment.acog.name": "ACOG" });
  });

  test("passes attachment data, sounds, and adapter through unchanged", () => {
    const data = { weight: 1.5, muzzle_flash: true };
    const docs = buildAttachmentDocuments({
      namespace: ns,
      attachmentId: "muzzle_brake",
      type: "muzzle",
      data,
      adapter: "demo:adapter/muzzle",
      sounds: { install: "demo:install", uninstall: "demo:uninstall" },
    });
    expect(docs.data).toEqual(data);
    expect(docs.display.adapter).toBe("demo:adapter/muzzle");
    expect(docs.display.sounds).toEqual({ install: "demo:install", uninstall: "demo:uninstall" });
  });

  test("exposes exactly the official attachment slot categories", () => {
    // wiki gun/data/15_attachment lists these six; `ammo_mod` is a tag, not a
    // slot, and the official bayonet uses type "muzzle".
    expect(TACZ_ATTACHMENT_TYPES).toEqual(["scope", "stock", "muzzle", "grip", "laser", "extended_mag"]);
    expect(TACZ_ATTACHMENT_TYPES).not.toContain("bayonet");
  });

  test("rejects invalid ids and blank attachment types", () => {
    expect(() => buildAmmoDocuments({ namespace: ns, ammoId: "12-Gauge" })).toThrow(/must match/);
    expect(() => buildAttachmentDocuments({ namespace: ns, attachmentId: "acog", type: " " })).toThrow(/type/);
  });
});

describe("TACZ item templates", () => {
  test("ships every required ammo and attachment template", () => {
    for (const kind of ["ammo_12g", "ammo_9mm", "ammo_762", "scope", "muzzle", "stock", "grip", "laser", "extended_mag"]) {
      expect(TACZ_ITEM_TEMPLATES[kind]).toBeDefined();
      expect(getItemTemplate(kind).kind).toBe(kind);
    }
  });

  test("every template is small and has a group for each cube", () => {
    for (const [kind, template] of Object.entries(TACZ_ITEM_TEMPLATES)) {
      expect(template.cubes.length).toBeLessThanOrEqual(30);
      expect(template.groups.length).toBeGreaterThan(0);
      expect(template.texture_size[0]).toBeGreaterThan(0);
      const names = new Set(template.groups.map(group => group.name));
      for (const cube of template.cubes) {
        expect(names.has(cube.group)).toBe(true);
        expect(cube.from.some((value, index) => value !== cube.to[index])).toBe(true);
      }
      expect(kind.length).toBeGreaterThan(0);
    }
  });

  test("the scope template keeps the official scope groups and parts", () => {
    const scope = getItemTemplate("scope");
    // wiki attachment/attachment: scope_body, ocular_ring, ocular, division, scope_view
    const names = new Set(scope.groups.map(group => group.name));
    for (const required of ["scope_body", "ocular_ring", "ocular", "division", "scope_view"]) {
      expect(names.has(required)).toBe(true);
    }
    expect(scope.cubes.map(cube => cube.name)).toEqual(expect.arrayContaining(["tube", "ring", "lens", "reticle"]));
  });

  test("the ammo template ships the three positioning groups", () => {
    // wiki ammo/display: fixed (item frame), thirdperson_hand, ground
    for (const kind of ["ammo_12g", "ammo_9mm", "ammo_762"]) {
      const names = new Set(getItemTemplate(kind).groups.map(group => group.name));
      for (const required of ["fixed", "thirdperson_hand", "ground"]) {
        expect(names.has(required)).toBe(true);
      }
    }
  });

  test("getItemTemplate lists valid kinds when the name is unknown", () => {
    expect(() => getItemTemplate("bipod")).toThrow(/Accepted: .*scope/);
  });
});

describe("TACZ item pack files", () => {
  test("writes the official ammo path layout", () => {
    createPack({ packDir, namespace: ns, name: "Items", author: "Test", version: "1.0.0" });
    const written = writeAmmoDocuments({ packDir, namespace: ns, ammoId: "12g", displayName: "12 Gauge", overwrite: true });
    expect(written.namespace).toBe(ns);
    expect(written.files).toEqual([
      `data/${ns}/index/ammo/12g.json`,
      `assets/${ns}/display/ammo/12g_display.json`,
      `assets/${ns}/lang/zh_cn.json`,
      `assets/${ns}/lang/en_us.json`,
    ]);
    expect(fs.existsSync(path.join(packDir, "data", ns, "index", "ammo", "12g.json"))).toBe(true);
    expect(fs.existsSync(path.join(packDir, "assets", ns, "display", "ammo", "12g_display.json"))).toBe(true);
    expect(written.missing).toEqual([
      `assets/${ns}/geo_models/ammo/12g.json`,
      `assets/${ns}/textures/ammo/uv/12g.png`,
      `assets/${ns}/textures/ammo/slot/12g.png`,
    ]);
  });

  test("writes the official attachment path layout", () => {
    const written = writeAttachmentDocuments({ packDir, namespace: ns, attachmentId: "acog", type: "scope", displayName: "ACOG", overwrite: true });
    expect(written.files).toEqual([
      `data/${ns}/index/attachments/acog.json`,
      `data/${ns}/data/attachments/acog_data.json`,
      `assets/${ns}/display/attachments/acog_display.json`,
      `assets/${ns}/lang/zh_cn.json`,
      `assets/${ns}/lang/en_us.json`,
    ]);
    expect(fs.existsSync(path.join(packDir, "data", ns, "data", "attachments", "acog_data.json"))).toBe(true);
    expect(written.missing).toContain(`assets/${ns}/geo_models/attachment/acog_geo.json`);
  });

  test("merges language keys instead of clobbering other entries", () => {
    const langPath = path.join(packDir, "assets", ns, "lang", "en_us.json");
    const before = JSON.parse(fs.readFileSync(langPath, "utf8")) as Record<string, string>;
    writeJson(langPath, { ...before, "demo.gun.ak47.name": "AK-47" }, "test");
    writeAmmoDocuments({ packDir, namespace: ns, ammoId: "9mm", displayName: "9mm", overwrite: true });
    const after = JSON.parse(fs.readFileSync(langPath, "utf8")) as Record<string, string>;
    expect(after["demo.gun.ak47.name"]).toBe("AK-47");
    expect(after["demo.ammo.9mm.name"]).toBe("9mm");
    expect(after["demo.attachment.acog.name"]).toBe("ACOG");
  });

  test("lists ammo and attachments from the index folders", () => {
    expect(listAmmo(packDir).map(entry => entry.id)).toEqual(["12g", "9mm"]);
    const ammo = listAmmo(packDir)[0];
    expect(ammo.index).toBe(`data/${ns}/index/ammo/12g.json`);
    expect(ammo.display).toBe("demo:12g_display");
    const attachments = listAttachments(packDir);
    expect(attachments.map(entry => entry.id)).toEqual(["acog"]);
    expect(attachments[0]).toEqual({
      id: "acog",
      type: "scope",
      index: `data/${ns}/index/attachments/acog.json`,
      display: "demo:acog_display",
      data: "demo:acog_data",
    });
  });

  test("lists nothing when the index folders are absent", () => {
    const empty = path.join(root, "empty_pack");
    createPack({ packDir: empty, namespace: "bare", name: "Bare", author: "Test", version: "1.0.0" });
    expect(listAmmo(empty)).toEqual([]);
    expect(listAttachments(empty)).toEqual([]);
  });
});

describe("TACZ item validation", () => {
  /** Creates a second pack whose items are complete. */
  function completePack(name: string): string {
    const dir = path.join(root, name);
    createPack({ packDir: dir, namespace: "full", name: "Full", author: "Test", version: "1.0.0" });
    writeAmmoDocuments({ packDir: dir, namespace: "full", ammoId: "12g", displayName: "12 Gauge", overwrite: true });
    writeAttachmentDocuments({ packDir: dir, namespace: "full", attachmentId: "acog", type: "scope", displayName: "ACOG", overwrite: true });
    writeGeometry(path.join(dir, "assets", "full", "geo_models", "ammo", "12g.json"));
    writePng(path.join(dir, "assets", "full", "textures", "ammo", "uv", "12g.png"));
    writePng(path.join(dir, "assets", "full", "textures", "ammo", "slot", "12g.png"));
    writeGeometry(path.join(dir, "assets", "full", "geo_models", "attachment", "acog_geo.json"));
    writePng(path.join(dir, "assets", "full", "textures", "attachment", "uv", "acog.png"));
    writePng(path.join(dir, "assets", "full", "textures", "attachment", "slot", "acog.png"));
    return dir;
  }

  test("accepts a pack whose items are complete", () => {
    const dir = completePack("full_pack");
    const result = validateItems(dir);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.ammo).toBe(1);
    expect(result.attachments).toBe(1);
  });

  test("reports missing model, texture, and slot files", () => {
    const result = validateItems(packDir);
    expect(result.ok).toBe(false);
    const missing = result.errors.filter(error => error.code === "ASSET_MISSING");
    // Two ammo entries plus one attachment, each missing a model, UV texture and slot icon.
    expect(missing.length).toBe(9);
    expect(missing.some(error => error.message.includes("12g.json"))).toBe(true);
    expect(missing.some(error => error.message.includes("acog_geo.json"))).toBe(true);
    expect(result.ammo).toBe(2);
    expect(result.attachments).toBe(1);
  });

  test("reports a missing display file", () => {
    const dir = completePack("no_display_pack");
    fs.rmSync(path.join(dir, "assets", "full", "display", "ammo", "12g_display.json"));
    const result = validateItems(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some(error => error.code === "DISPLAY_READ")).toBe(true);
  });

  test("reports a missing language key", () => {
    const dir = completePack("no_lang_pack");
    writeJson(path.join(dir, "assets", "full", "lang", "zh_cn.json"), {}, "test");
    writeJson(path.join(dir, "assets", "full", "lang", "en_us.json"), {}, "test");
    const result = validateItems(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some(error => error.code === "LANG_KEY")).toBe(true);
  });

  test("reports an attachment whose data file is not an object", () => {
    const dir = completePack("bad_data_pack");
    writeJson(path.join(dir, "data", "full", "data", "attachments", "acog_data.json"), [1, 2], "test");
    const result = validateItems(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some(error => error.code === "DATA_SHAPE")).toBe(true);
  });

  test("warns on an unofficial attachment type", () => {
    const dir = completePack("odd_type_pack");
    writeAttachmentDocuments({ packDir: dir, namespace: "full", attachmentId: "bipod", type: "bipod", displayName: "Bipod", overwrite: true });
    writeGeometry(path.join(dir, "assets", "full", "geo_models", "attachment", "bipod_geo.json"));
    writePng(path.join(dir, "assets", "full", "textures", "attachment", "uv", "bipod.png"));
    writePng(path.join(dir, "assets", "full", "textures", "attachment", "slot", "bipod.png"));
    const result = validateItems(dir);
    expect(result.ok).toBe(true);
    expect(result.warnings.some(warning => warning.code === "ATTACHMENT_TYPE_KNOWN")).toBe(true);
  });
});

