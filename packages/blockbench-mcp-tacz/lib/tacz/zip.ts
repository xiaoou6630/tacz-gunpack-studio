/**
 * Tiny store-only ZIP writer for gun packs. TACZ reads a directory or a zip;
 * store-only keeps the implementation dependency-free and preserves the exact
 * file bytes the tools wrote (JSON, PNG).
 *
 * @module
 */
import { fsModule, listFiles, pathModule, relativePath, writeBytesAtomic } from "@/lib/tacz/paths";

/** CRC32 lookup table. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/**
 * Packages a pack directory as a store-only zip.
 *
 * @param packDir - Absolute pack root.
 * @param outPath - Absolute zip path.
 * @param excluded - Directory/file names skipped at every level.
 * @param label - Tool label used for permission and errors.
 * @returns File count and byte size.
 */
export function zipPack(packDir: string, outPath: string, excluded: readonly string[], label: string): { files: number; bytes: number; path: string } {
  const fs = fsModule(label);
  const pathApi = pathModule();
  const files = listFiles(packDir, excluded, label).filter(file => !file.toLowerCase().endsWith(".zip"));
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = relativePath(packDir, file);
    const nameBytes = new TextEncoder().encode(name);
    const data = fs.readFileSync(file);
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0),
      nameBytes, data,
    ]);
    localParts.push(local);
    const central = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]);
    centralParts.push(central);
    offset += local.length;
  }

  const centralOffset = offset;
  const central = concat(centralParts);
  const eocd = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(centralOffset), u16(0),
  ]);
  const zip = concat([...localParts, central, eocd]);
  const resolvedOut = pathApi.resolve(outPath);
  writeBytesAtomic(resolvedOut, zip, label, true);
  return { files: files.length, bytes: zip.length, path: resolvedOut };
}
