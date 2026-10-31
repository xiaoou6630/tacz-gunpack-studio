import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPack, packagePack, validatePack, writeGunDocuments } from "@/lib/tacz/pack";
import { writeBytesAtomic, writeTextAtomic } from "@/lib/tacz/paths";

// The tools run inside Blockbench, where requireNativeModule is provided by the host.
(globalThis as unknown as { requireNativeModule: (name: string) => unknown }).requireNativeModule = (name: string) => {
  if (name === "fs") return fs;
  if (name === "path") return path;
  return undefined;
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tacz-smoke-"));
const packDir = path.join(root, "demo_pack");
const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZq3GQAAAABJRU5ErkJggg==",
  "base64",
);
try {
  console.log("create", createPack({ packDir, namespace: "demo", name: "Demo Pack", author: "Smoke", version: "1.0.0" }));
  const ns = "demo";
  const gunId = "smoke_rifle";
  const geometry = path.join(packDir, "assets", ns, "geo_models", "gun", `${gunId}_geo.json`);
  writeTextAtomic(geometry, JSON.stringify({
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: { identifier: `geometry.${gunId}`, texture_width: 128, texture_height: 128 },
      bones: [{ name: "root", pivot: [0, 0, 0] }],
    }],
  }, null, 2), "smoke");
  writeBytesAtomic(path.join(packDir, "assets", ns, "textures", "gun", "uv", `${gunId}.png`), png1x1, "smoke");
  writeBytesAtomic(path.join(packDir, "assets", ns, "textures", "gun", "slot", `${gunId}.png`), png1x1, "smoke");
  console.log("docs", writeGunDocuments({ packDir, namespace: ns, gunId, type: "rifle", displayName: "Smoke Rifle", profile: { rpm: 600 }, overwrite: true }));
  const validation = validatePack(packDir);
  console.log("validation", JSON.stringify(validation, null, 2));
  console.log("package", packagePack(packDir));
  if (!validation.ok) process.exitCode = 1;
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
