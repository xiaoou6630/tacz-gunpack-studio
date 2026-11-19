/**
 * Generates a Minecraft skin PNG from a small palette description.
 *
 * Why generate the file instead of driving Blockbench: injecting a tool into
 * the shipped bundle kept failing on minified zod internals (`_.string is not
 * a function`), and each failure disabled the whole plugin. Writing a 64x64 PNG
 * needs none of that — the file is the deliverable, and Blockbench can open it
 * as a skin project afterwards.
 *
 * The atlas layout is the standard 64x64 one. Every rectangle below is the full
 * unwrap of that body part (width 2*(w+d), height d+h), so filling a rectangle
 * colours all six faces of that part.
 *
 * Usage:
 *   node tools/make-skin.mjs <character> [--out <file.png>]
 *
 * Characters are declared in SKINS below. Add one by describing its palette and
 * a few pixel bands; everything else is derived.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// ---------------------------------------------------------------- atlas layout
const SIZE = 64;
const PARTS = {
  head: { u: 0, v: 0, w: 8, h: 8, d: 8 },
  body: { u: 16, v: 16, w: 8, h: 12, d: 4 },
  rightArm: { u: 40, v: 16, w: 4, h: 12, d: 4 },
  rightLeg: { u: 0, v: 16, w: 4, h: 12, d: 4 },
  leftArm: { u: 32, v: 48, w: 4, h: 12, d: 4 },
  leftLeg: { u: 16, v: 48, w: 4, h: 12, d: 4 },
};
const OVERLAY = {
  hat: { u: 32, v: 0, w: 8, h: 8, d: 8 },
  jacket: { u: 16, v: 32, w: 8, h: 12, d: 4 },
  rightSleeve: { u: 40, v: 32, w: 4, h: 12, d: 4 },
  rightPants: { u: 0, v: 32, w: 4, h: 12, d: 4 },
  leftSleeve: { u: 48, v: 48, w: 4, h: 12, d: 4 },
  leftPants: { u: 0, v: 48, w: 4, h: 12, d: 4 },
};

/**
 * Face rectangles inside a part's unwrap.
 *
 * A part unwraps to a cross: the top row is [top][bottom] and the bottom row is
 * [right][front][left][back], each sized by the part's dimensions. These offsets
 * are what let a skin paint "the face" without touching the rest.
 */
function faces(part) {
  const { u, v, w, h, d } = part;
  return {
    top: { x: u + d, y: v, w, h: d },
    bottom: { x: u + d + w, y: v, w, h: d },
    right: { x: u, y: v + d, w: d, h },
    front: { x: u + d, y: v + d, w, h },
    left: { x: u + d + w, y: v + d, w: d, h },
    back: { x: u + d + w + d, y: v + d, w, h },
  };
}

// ---------------------------------------------------------------- characters
/**
 * Each character is a palette plus a small set of rules:
 *   - `hair`: colour bands drawn over the head's back/sides and the top of the body
 *   - `face`: the 8x8 front of the head
 *   - `torso`, `arms`, `legs`: base colours
 *   - `overlay`: extra pixels on the outer layer (hat frill, hair fringe, tail)
 *
 * Colours are sampled from the downloaded reference art. Values are deliberately
 * few: a 64x64 skin has roughly 8x8 pixels per face, so more than three tones of
 * one hue reads as noise.
 */
const SKINS = {
  deepseek: {
    display: "DeepSeek 鲸鱼娘",
    palette: {
      hairDark: "#1b2a5e",
      hairMid: "#2c4a9e",
      hairLight: "#4d6bfe",
      skin: "#f7d9c4",
      skinShade: "#e8bfa6",
      eye: "#2f6fd0",
      white: "#f2f4f8",
      navy: "#1d2a4a",
      accent: "#4d6bfe",
      ribbon: "#3f7fd8",
    },
    // Hair covers the head's back and sides, plus a fringe over the forehead.
    hairSides: true,
    maidHead: true,
    ribbon: true,
    tail: true,
  },
  claude: {
    display: "Claude 娘",
    palette: {
      hairDark: "#b4501f",
      hairMid: "#d97757",
      hairLight: "#e89a72",
      skin: "#f9ddc9",
      skinShade: "#ecc4a8",
      eye: "#8a4b2a",
      white: "#f5f1e8",
      black: "#242018",
      navy: "#242018",
      accent: "#d97757",
      cream: "#efe6d2",
    },
    hairSides: true,
    maidHead: false,
    ribbon: false,
    tail: false,
  },
  grok: {
    display: "Grok 娘",
    palette: {
      hairDark: "#a8842c",
      hairMid: "#d4b24a",
      hairLight: "#efd97a",
      skin: "#f7dcc8",
      skinShade: "#e6bfa4",
      eye: "#4a6fa5",
      white: "#f0f0f2",
      black: "#141414",
      navy: "#141414",
      accent: "#d4b24a",
      ribbon: "#141414",
      cream: "#efd97a",
    },
    hairSides: true,
    maidHead: false,
    ribbon: false,
    tail: false,
  },
};

// ---------------------------------------------------------------- raster
/** A tiny RGBA canvas with rectangle and pixel helpers. */
class Canvas {
  constructor() {
    this.data = new Uint8Array(SIZE * SIZE * 4);
  }
  set(x, y, hex) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const [r, g, b, a] = parseHex(hex);
    const i = (y * SIZE + x) * 4;
    // Simple source-over so later paints can layer.
    if (a === 255) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
      return;
    }
    const src = a / 255;
    const dst = this.data[i + 3] / 255;
    const out = src + dst * (1 - src);
    if (out === 0) return;
    this.data[i] = Math.round((r * src + this.data[i] * dst * (1 - src)) / out);
    this.data[i + 1] = Math.round((g * src + this.data[i + 1] * dst * (1 - src)) / out);
    this.data[i + 2] = Math.round((b * src + this.data[i + 2] * dst * (1 - src)) / out);
    this.data[i + 3] = Math.round(out * 255);
  }
  rect(x, y, w, h, hex) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, hex);
  }
  fill(face, hex) {
    this.rect(face.x, face.y, face.w, face.h, hex);
  }
}

/** Parses `#rgb`, `#rrggbb` or `#rrggbbaa` into [r,g,b,a]. */
function parseHex(hex) {
  const h = hex.replace(/^#/, "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 255];
  }
  if (h.length === 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    parseInt(h.slice(6, 8), 16),
  ];
}

/** Paints one character onto a fresh canvas. */
function paint(character) {
  const c = new Canvas();
  const p = character.palette;
  const head = faces(PARTS.head);
  const body = faces(PARTS.body);
  const rArm = faces(PARTS.rightArm);
  const lArm = faces(PARTS.leftArm);
  const rLeg = faces(PARTS.rightLeg);
  const lLeg = faces(PARTS.leftLeg);

  // --- head base: skin everywhere, then hair over back/sides -------------
  for (const face of Object.values(head)) c.fill(face, p.skin);
  c.fill(head.top, p.hairMid);
  if (character.hairSides) {
    c.fill(head.back, p.hairMid);
    c.fill(head.left, p.hairMid);
    c.fill(head.right, p.hairMid);
  }

  // Fringe: two rows of hair across the top of the face.
  c.rect(head.front.x, head.front.y, head.front.w, 2, p.hairMid);
  c.rect(head.front.x, head.front.y, 3, 1, p.hairDark);
  c.rect(head.front.x + 5, head.front.y, 3, 1, p.hairDark);

  // Eyes: two 2x1 blocks with a highlight, the most a 8x8 face allows.
  c.rect(head.front.x + 1, head.front.y + 3, 2, 1, p.eye);
  c.rect(head.front.x + 5, head.front.y + 3, 2, 1, p.eye);
  c.set(head.front.x + 1, head.front.y + 3, p.white);
  c.set(head.front.x + 5, head.front.y + 3, p.white);

  // Mouth and cheek shading.
  c.rect(head.front.x + 3, head.front.y + 5, 2, 1, p.skinShade);

  // --- body --------------------------------------------------------------
  for (const face of Object.values(body)) c.fill(face, p.navy ?? p.black ?? p.hairDark);
  // White apron panel on the front.
  c.rect(body.front.x + 2, body.front.y + 2, 4, 8, p.white);
  c.rect(body.front.x + 3, body.front.y + 3, 2, 1, p.accent);

  // Arms: navy sleeves with skin hands.
  for (const arm of [rArm, lArm]) {
    for (const face of Object.values(arm)) c.fill(face, p.navy);
    c.rect(arm.front.x, arm.front.y + 9, arm.front.w, 3, p.skin);
  }

  // Legs: dark trousers with a lighter cuff.
  for (const leg of [rLeg, lLeg]) {
    for (const face of Object.values(leg)) c.fill(face, p.black ?? p.navy ?? p.hairDark);
    c.rect(leg.front.x, leg.front.y + 10, leg.front.w, 2, p.skinShade);
  }

  // --- overlay: only the parts this character needs ----------------------
  const hat = faces(OVERLAY.hat);
  if (character.maidHead) {
    // White frill band around the top of the head.
    c.rect(hat.front.x, hat.front.y, hat.front.w, 2, p.white);
    c.rect(hat.front.x, hat.front.y, hat.front.w, 1, p.cream ?? p.white);
    c.rect(hat.back.x, hat.back.y, hat.back.w, 2, p.white);
    c.rect(hat.left.x, hat.left.y, hat.left.w, 2, p.white);
    c.rect(hat.right.x, hat.right.y, hat.right.w, 2, p.white);
  }
  if (character.ribbon) {
    c.rect(hat.front.x + 6, hat.front.y + 2, 2, 1, p.ribbon);
  }
  if (character.tail) {
    // A flat tail silhouette on the jacket's back, the only place a skin can
    // suggest one: no geometry is available.
    const jacket = faces(OVERLAY.jacket);
    c.rect(jacket.back.x + 2, jacket.back.y + 6, 4, 4, p.hairDark);
    c.rect(jacket.back.x + 3, jacket.back.y + 10, 2, 2, p.hairMid);
  }

  return c;
}

// ---------------------------------------------------------------- PNG writer
/** Encodes the canvas as an RGBA PNG. */
function encodePng(canvas) {
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  let offset = 0;
  for (let y = 0; y < SIZE; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      raw[offset++] = canvas.data[i];
      raw[offset++] = canvas.data[i + 1];
      raw[offset++] = canvas.data[i + 2];
      raw[offset++] = canvas.data[i + 3];
    }
  }

  const chunks = [];
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    chunks.push(Buffer.concat([length, body, crc]));
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  chunk("IHDR", ihdr);
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 }));
  chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);
}

// ---------------------------------------------------------------- main
const [name, ...flags] = process.argv.slice(2);
if (!name || !SKINS[name]) {
  console.error(`usage: node tools/make-skin.mjs <${Object.keys(SKINS).join("|")}> [--out <file>]`);
  process.exit(2);
}
const outIndex = flags.indexOf("--out");
const out = outIndex >= 0 && flags[outIndex + 1]
  ? flags[outIndex + 1]
  : path.join("E:", "daima", "TCZ AI钱包", "refs", "ai-moe", name, `${name}_skin.png`);

const canvas = paint(SKINS[name]);
const png = encodePng(canvas);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);

// Count opaque pixels so a blank skin is caught here, not in game.
let opaque = 0;
for (let i = 3; i < canvas.data.length; i += 4) if (canvas.data[i] > 0) opaque++;

console.log(`${SKINS[name].display} -> ${out}`);
console.log(`  ${SIZE}x${SIZE}, ${opaque} opaque pixels (${Math.round((opaque / (SIZE * SIZE)) * 100)}% coverage)`);
console.log(`  ${png.length} bytes`);
