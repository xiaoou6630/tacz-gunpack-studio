"""
Renders a 64x64 Minecraft skin atlas as a flat "unwrapped" preview.

The point is to check the atlas layout, not to look pretty: if the rectangles
land in the wrong places, the preview shows a scrambled skin long before it ever
reaches the game.

Usage: python tools/preview-skin.py <skin.png> [out.png]
"""
import sys
from PIL import Image

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else src.replace(".png", "_preview.png")

skin = Image.open(src).convert("RGBA")

# The same rectangles the generator paints. Each part is a cross unwrap:
# top row = [top][bottom], bottom row = [right][front][left][back].
PARTS = {
    "head":  dict(u=0,  v=0,  w=8,  h=8,  d=8),
    "body":  dict(u=16, v=16, w=8,  h=12, d=4),
    "r_arm": dict(u=40, v=16, w=4,  h=12, d=4),
    "r_leg": dict(u=0,  v=16, w=4,  h=12, d=4),
    "l_arm": dict(u=32, v=48, w=4,  h=12, d=4),
    "l_leg": dict(u=16, v=48, w=4,  h=12, d=4),
}

SCALE = 8
pad = 8
# Lay the parts out in a row so each unwrap is visible side by side.
total_w = sum(2 * (p["w"] + p["d"]) * SCALE + pad for p in PARTS.values()) + pad
total_h = max((p["d"] + p["h"]) * SCALE for p in PARTS.values()) + pad * 2 + 20
canvas = Image.new("RGBA", (total_w, total_h), (30, 30, 34, 255))

x_cursor = pad
for name, p in PARTS.items():
    unwrap_w = 2 * (p["w"] + p["d"])
    unwrap_h = p["d"] + p["h"]
    crop = skin.crop((p["u"], p["v"], p["u"] + unwrap_w, p["v"] + unwrap_h))
    big = crop.resize((unwrap_w * SCALE, unwrap_h * SCALE), Image.NEAREST)
    canvas.alpha_composite(big, (x_cursor, pad + 20))
    x_cursor += unwrap_w * SCALE + pad

canvas.save(out)
print(f"preview -> {out}")
print(f"  {total_w}x{total_h}")

# Report per-part opacity so a part left blank is obvious.
for name, p in PARTS.items():
    unwrap_w = 2 * (p["w"] + p["d"])
    unwrap_h = p["d"] + p["h"]
    crop = skin.crop((p["u"], p["v"], p["u"] + unwrap_w, p["v"] + unwrap_h))
    px = list(crop.getdata())
    opaque = sum(1 for q in px if q[3] > 0)
    print(f"  {name:8} {opaque:4}/{len(px):4} opaque")
