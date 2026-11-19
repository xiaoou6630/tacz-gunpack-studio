/**
 * Generates a Minecraft skin PNG from a character description.
 *
 * Design notes, after the first attempt looked crude:
 *
 * 1. **Draw at 64x64, not at "8 pixels per face".** The old painter filled whole
 *    unwrap rectangles with one colour, which is why the result read as coloured
 *    boxes. Faces are addressed pixel by pixel here.
 *
 * 2. **The overlay layer carries the silhouette.** A skin has two layers: base
 *    and overlay. The overlay is a slightly inflated copy of the same body, so
 *    anything that should stick out — the fringe, the maid headpiece, the tail,
 *    the skirt — belongs there. The first attempt barely used it, so the model
 *    looked shrink-wrapped.
 *
 * 3. **Shade in bands, not gradients.** At this resolution a hue needs 3–4
 *    discrete tones to read as hair rather than a flat block. Every hair colour
 *    below is a band, sampled from the reference art.
 *
 * 4. **The face is the whole character.** Eight by eight pixels decide whether
 *    the skin is recognisable, so the eyes get four pixels each with a highlight,
 *    the mouth two, and the rest is hair.
 *
 * Usage:
 *   node tools/make-skin.mjs <character> [--out <file.png>]
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SIZE = 64;

// ------------------------------------------------------------------ layout
// Standard 64x64 skin atlas. Each part unwraps to a cross whose face rectangles
// are derived from the part's dimensions.
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
 * Face rectangles of one part's unwrap.
 *
 * Cross layout: the top row is [top][bottom] and the bottom row is
 * [right][front][left][back]. Getting this wrong shifts every feature by the
 * part's depth, which is why the first skin's eyes sat on the forehead.
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

// ------------------------------------------------------------------ raster
class Canvas {
  constructor() {
    this.data = new Uint8Array(SIZE * SIZE * 4);
  }

  /** Writes one pixel, honouring alpha for soft edges. */
  set(x, y, hex) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const [r, g, b, a] = parseHex(hex);
    const i = (y * SIZE + x) * 4;
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

  /** Horizontal band inside a face, measured from its top. */
  band(face, fromY, height, hex) {
    this.rect(face.x, face.y + fromY, face.w, height, hex);
  }

  /** Vertical band inside a face, measured from its left. */
  vband(face, fromX, width, hex) {
    this.rect(face.x + fromX, face.y, width, face.h, hex);
  }

  /** Draws a string of pixels: '.' skips, other chars map through `key`. */
  stencil(face, rows, key, offsetX = 0, offsetY = 0) {
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const colour = key[ch];
        if (colour) this.set(face.x + offsetX + x, face.y + offsetY + y, colour);
      });
    });
  }
}

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

// ------------------------------------------------------------------ palettes
/**
 * Colours sampled from the downloaded reference art.
 *
 * Hair is four bands rather than one flat tone: the reference goes from a near
 * black navy at the roots to a bright periwinkle at the tips, and a single tone
 * loses that entirely.
 */
const PALETTES = {
  deepseek: {
    display: "DeepSeek 鲸鱼娘",
    hair: { root: "#1a2550", dark: "#233a7a", mid: "#2f56ad", light: "#4d7fe0", tip: "#7fb0f5" },
    skin: "#f8dcc8",
    skinShade: "#e6bda4",
    blush: "#f0a0a0",
    eyeIris: "#2f6fd0",
    eyePupil: "#132a5e",
    eyeHighlight: "#ffffff",
    mouth: "#d4606a",
    white: "#f6f7fa",
    cream: "#e8eaf2",
    navy: "#1e2a4d",
    navyLight: "#2a3a66",
    gold: "#d8b45a",
    ribbon: "#3f7fd8",
    ribbonDark: "#2a5da8",
    gem: "#6fb8f0",
  },
};

// ------------------------------------------------------------------ painter
function paint(character) {
  const c = new Canvas();
  const p = character;
  const h = faces(PARTS.head);
  const b = faces(PARTS.body);
  const ra = faces(PARTS.rightArm);
  const la = faces(PARTS.leftArm);
  const rl = faces(PARTS.rightLeg);
  const ll = faces(PARTS.leftLeg);

  const oh = faces(OVERLAY.hat);
  const oj = faces(OVERLAY.jacket);
  const ors = faces(OVERLAY.rightSleeve);
  const ols = faces(OVERLAY.leftSleeve);
  const orp = faces(OVERLAY.rightPants);
  const olp = faces(OVERLAY.leftPants);

  // ---------------------------------------------------------------- head
  // Skin base, then hair over everything except the face.
  for (const f of Object.values(h)) c.fill(f, p.skin);
  c.fill(h.top, p.hair.dark);
  c.fill(h.back, p.hair.mid);
  c.fill(h.left, p.hair.mid);
  c.fill(h.right, p.hair.mid);
  c.fill(h.bottom, p.hair.root);

  // Hair bands down the back: roots at the top, tips at the bottom.
  c.band(h.back, 0, 3, p.hair.root);
  c.band(h.back, 3, 3, p.hair.dark);
  c.band(h.back, 6, 2, p.hair.light);
  c.band(h.left, 0, 3, p.hair.root);
  c.band(h.right, 0, 3, p.hair.root);

  // --- the face: 8x8 decides everything ---
  // Fringe: three rows of hair, with two longer locks framing the face.
  c.band(h.front, 0, 2, p.hair.dark);
  c.band(h.front, 2, 1, p.hair.mid);
  c.set(h.front.x, h.front.y + 3, p.hair.dark);
  c.set(h.front.x + 7, h.front.y + 3, p.hair.dark);
  c.set(h.front.x, h.front.y + 4, p.hair.dark);
  c.set(h.front.x + 7, h.front.y + 4, p.hair.dark);

  // Eyes: 2x2 each, iris + pupil + highlight. Rows 3-4, columns 1-2 and 5-6.
  const eyeKey = { i: p.eyeIris, p: p.eyePupil, w: p.eyeHighlight };
  const eyeRows = ["wi", "pi"];
  c.stencil(h.front, eyeRows, eyeKey, 1, 3);
  c.stencil(h.front, eyeRows, eyeKey, 5, 3);

  // Mouth: an open smile, two pixels wide.
  c.set(h.front.x + 3, h.front.y + 5, p.mouth);
  c.set(h.front.x + 4, h.front.y + 5, p.mouth);

  // Blush: one pixel under each eye.
  c.set(h.front.x + 1, h.front.y + 5, p.blush);
  c.set(h.front.x + 6, h.front.y + 5, p.blush);

  // ---------------------------------------------------------------- overlay: hair
  // The fringe sits outside the head so it casts a silhouette. This is what the
  // first version omitted, leaving the hair painted flat onto the skull.
  c.band(oh.front, 0, 2, p.hair.dark);
  c.band(oh.front, 2, 1, p.hair.mid);
  c.rect(oh.front.x, oh.front.y + 3, 1, 2, p.hair.dark);
  c.rect(oh.front.x + 7, oh.front.y + 3, 1, 2, p.hair.dark);
  // Long hair down the back and sides.
  c.band(oh.back, 0, 8, p.hair.mid);
  c.band(oh.back, 5, 3, p.hair.light);
  c.band(oh.left, 0, 8, p.hair.dark);
  c.band(oh.right, 0, 8, p.hair.dark);

  // Ahoge: the single strand that identifies the character. Two pixels on the
  // crown of the overlay so it reads as a spike above the head.
  c.set(oh.top.x + 3, oh.top.y + 1, p.hair.root);
  c.set(oh.top.x + 2, oh.top.y + 2, p.hair.root);
  c.set(oh.top.x + 1, oh.top.y + 3, p.hair.root);

  // Maid headpiece: white frill across the top of the overlay.
  c.band(oh.top, 5, 3, p.white);
  c.band(oh.front, 0, 1, p.white);
  // Frill scallops: alternating pixels so the edge is not a straight line.
  for (let x = 0; x < 8; x += 2) c.set(oh.front.x + x, oh.front.y, p.cream);
  c.band(oh.left, 0, 1, p.white);
  c.band(oh.right, 0, 1, p.white);

  // Ribbon on the right side of the headpiece.
  c.rect(oh.right.x, oh.right.y + 1, 2, 2, p.ribbon);
  c.set(oh.right.x, oh.right.y + 2, p.ribbonDark);

  // Whale ear-fins: dark wedges on both sides of the overlay, the clearest
  // non-human feature in the reference.
  c.rect(oh.left.x, oh.left.y + 4, 2, 3, p.hair.root);
  c.set(oh.left.x + 1, oh.left.y + 4, p.hair.tip);
  c.rect(oh.right.x + 6, oh.right.y + 4, 2, 3, p.hair.root);
  c.set(oh.right.x + 6, oh.right.y + 4, p.hair.tip);

  // ---------------------------------------------------------------- body
  for (const f of Object.values(b)) c.fill(f, p.navy);
  // Shoulders catch light.
  c.band(b.top, 0, 4, p.navyLight);
  // White apron down the front, with a gold edge and a gem at the collar.
  c.rect(b.front.x + 2, b.front.y + 3, 4, 8, p.white);
  c.vband(b.front, 2, 1, p.cream);
  c.rect(b.front.x + 3, b.front.y + 2, 2, 1, p.gold);
  c.set(b.front.x + 4, b.front.y + 2, p.gem);
  // Back of the dress.
  c.band(b.back, 6, 6, p.navyLight);

  // ---------------------------------------------------------------- arms
  for (const arm of [ra, la]) {
    for (const f of Object.values(arm)) c.fill(f, p.navy);
    // Gold cuff, then a skin hand.
    c.band(arm.front, 8, 1, p.gold);
    c.band(arm.front, 9, 3, p.skin);
    c.band(arm.back, 9, 3, p.skin);
  }

  // ---------------------------------------------------------------- legs
  for (const leg of [rl, ll]) {
    for (const f of Object.values(leg)) c.fill(f, p.navy);
    // Boots: darker lower half with a lighter cuff.
    c.band(leg.front, 8, 4, p.hair.root);
    c.band(leg.front, 8, 1, p.gold);
    c.band(leg.back, 8, 4, p.hair.root);
  }

  // ---------------------------------------------------------------- overlay: clothing
  // Skirt: the overlay jacket flares below the waist so the dress has volume.
  c.band(oj.front, 6, 6, p.navyLight);
  c.band(oj.front, 6, 1, p.gold);
  c.band(oj.back, 6, 6, p.navyLight);
  c.band(oj.left, 6, 6, p.navyLight);
  c.band(oj.right, 6, 6, p.navyLight);

  // Sleeve cuffs on the overlay.
  for (const sleeve of [ors, ols]) {
    c.band(sleeve.front, 8, 1, p.white);
    c.band(sleeve.back, 8, 1, p.white);
  }

  // Trouser cuffs.
  for (const pants of [orp, olp]) {
    c.band(pants.front, 10, 2, p.hair.root);
    c.band(pants.back, 10, 2, p.hair.root);
  }

  // ---------------------------------------------------------------- overlay: tail
  // A whale tail on the back of the skirt. Flat, because a skin cannot add
  // geometry, but the silhouette reads.
  c.rect(oj.back.x + 3, oj.back.y + 8, 2, 4, p.hair.dark);
  c.rect(oj.back.x + 2, oj.back.y + 11, 1, 1, p.hair.mid);
  c.rect(oj.back.x + 5, oj.back.y + 11, 1, 1, p.hair.mid);

  return c;
}

// ------------------------------------------------------------------ PNG
function encodePng(canvas) {
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  let offset = 0;
  for (let y = 0; y < SIZE; y++) {
    raw[offset++] = 0;
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  chunk("IHDR", ihdr);
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 }));
  chunk("IEND", Buffer.alloc(0));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);
}

// ------------------------------------------------------------------ main
const [name, ...flags] = process.argv.slice(2);
const palette = PALETTES[name];
if (!name || !palette) {
  console.error(`usage: node tools/make-skin.mjs <${Object.keys(PALETTES).join("|")}> [--out <file>]`);
  process.exit(2);
}
const outIndex = flags.indexOf("--out");
const out = outIndex >= 0 && flags[outIndex + 1]
  ? flags[outIndex + 1]
  : path.join("E:", "daima", "TCZ AI钱包", "refs", "ai-moe", name, `${name}_skin_v2.png`);

const canvas = paint(palette);
const png = encodePng(canvas);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);

// Report base and overlay coverage separately: a skin with an empty overlay
// layer is the exact failure this rewrite exists to fix.
let baseOpaque = 0;
let overlayOpaque = 0;
const overlayRects = [
  faces(OVERLAY.hat), faces(OVERLAY.jacket), faces(OVERLAY.rightSleeve),
  faces(OVERLAY.leftSleeve), faces(OVERLAY.rightPants), faces(OVERLAY.leftPants),
];
const inOverlay = (x, y) =>
  overlayRects.some(f => Object.values(f).some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h));
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (canvas.data[(y * SIZE + x) * 4 + 3] === 0) continue;
    if (inOverlay(x, y)) overlayOpaque++;
    else baseOpaque++;
  }
}

console.log(`${palette.display} -> ${out}`);
console.log(`  ${SIZE}x${SIZE}, ${png.length} bytes`);
console.log(`  base layer   : ${baseOpaque} opaque pixels`);
console.log(`  overlay layer: ${overlayOpaque} opaque pixels`);
if (overlayOpaque === 0) {
  console.error("  ERROR: overlay layer is empty — the model will look shrink-wrapped");
  process.exitCode = 1;
}
