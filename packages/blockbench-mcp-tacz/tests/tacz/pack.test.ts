import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPack, listGuns, packagePack, validatePack, writeGunDocuments } from "@/lib/tacz/pack";
import { writeBytesAtomic, writeTextAtomic } from "@/lib/tacz/paths";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tacz-core-test-"));
const packDir = path.join(root, "demo_pack");

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

describe("TACZ pack core", () => {
  test("creates the standard pack skeleton", () => {
    const result = createPack({ packDir, namespace: "demo", name: "Demo", author: "Test", version: "1.0.0" });
    expect(result.namespace).toBe("demo");
    expect(fs.existsSync(path.join(packDir, "gunpack.meta.json"))).toBe(true);
    expect(fs.existsSync(path.join(packDir, "assets/demo/geo_models/gun"))).toBe(true);
    expect(fs.existsSync(path.join(packDir, "data/demo/index/guns"))).toBe(true);
  });

  test("writes documents and validates a complete gun", () => {
    const ns = "demo";
    const gunId = "test_rifle";
    writeTextAtomic(path.join(packDir, "assets", ns, "geo_models", "gun", `${gunId}_geo.json`), JSON.stringify({
      format_version: "1.12.0",
      "minecraft:geometry": [{ description: { identifier: `geometry.${gunId}`, texture_width: 128, texture_height: 128 }, bones: [] }],
    }), "test");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZq3GQAAAABJRU5ErkJggg==", "base64");
    writeBytesAtomic(path.join(packDir, "assets", ns, "textures", "gun", "uv", `${gunId}.png`), png, "test");
    writeBytesAtomic(path.join(packDir, "assets", ns, "textures", "gun", "slot", `${gunId}.png`), png, "test");
    const docs = writeGunDocuments({ packDir, namespace: ns, gunId, type: "rifle", displayName: "Test Rifle", profile: { rpm: 600 }, overwrite: true });
    expect(docs.missing).toEqual([]);
    const validation = validatePack(packDir);
    expect(validation.ok).toBe(true);
    expect(validation.guns).toBe(1);
    expect(validation.errors).toEqual([]);
  });

  test("lists guns and packages a zip", () => {
    const guns = listGuns(packDir);
    expect(guns.map(gun => gun.id)).toContain("test_rifle");
    const zip = packagePack(packDir);
    expect(zip.path).toBe(path.join(packDir, "demo_pack.zip"));
    expect(zip.files).toBeGreaterThanOrEqual(10);
    expect(fs.existsSync(zip.path)).toBe(true);
    expect(fs.readFileSync(zip.path).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  test("rejects the reserved namespace", () => {
    expect(() => createPack({ packDir: path.join(root, "bad"), namespace: "tacz" })).toThrow(/reserved/);
  });
});
