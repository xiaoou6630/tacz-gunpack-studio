"""
Diagnoses why a TACZ model looks flat / washed out.

Reads the pack's UV texture and reports what actually determines perceived
detail: distinct colours, coverage, alpha, and how much of the atlas is used.
Also reads the geometry to report cube count and UV rectangle reuse, because
overlapping UVs are the usual reason a model renders as a flat silhouette.

Usage: python tools/diagnose-texture.py <pack_dir> <gun_id>
"""
import json
import os
import sys
from collections import Counter

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

pack, gun = sys.argv[1], sys.argv[2]

meta = json.load(open(os.path.join(pack, "gunpack.meta.json"), encoding="utf-8"))
ns = meta["namespace"]

uv_path = os.path.join(pack, "assets", ns, "textures", "gun", "uv", f"{gun}.png")
geo_path = os.path.join(pack, "assets", ns, "geo_models", "gun", f"{gun}_geo.json")

print(f"pack : {pack}")
print(f"gun  : {gun}")
print("")

# ---------------------------------------------------------------- texture
img = Image.open(uv_path).convert("RGBA")
w, h = img.size
px = list(img.getdata())

opaque = [p for p in px if p[3] > 0]
colors = Counter(opaque)
distinct = len(colors)
coverage = len(opaque) / (w * h) * 100

print(f"texture : {uv_path}")
print(f"  size        : {w}x{h}  ({os.path.getsize(uv_path)} bytes)")
print(f"  opaque px   : {len(opaque)} / {w*h}  ({coverage:.1f}% coverage)")
print(f"  colours     : {distinct}")

if distinct:
    ranked = colors.most_common(5)
    print("  top colours : " + ", ".join(f"#{r:02x}{g:02x}{b:02x}({n})" for (r, g, b, a), n in ranked))

# Saturation tells you whether the palette reads as gun metal or as grey mush.
def sat(rgb):
    r, g, b = rgb[:3]
    mx, mn = max(r, g, b), min(r, g, b)
    return 0 if mx == 0 else (mx - mn) / mx

avg_sat = sum(sat(c) for c in colors) / distinct if distinct else 0
print(f"  avg saturation : {avg_sat:.3f}  (official gun steel is low-sat, 0.08-0.15)")
print("")

# ---------------------------------------------------------------- geometry
geo = json.load(open(geo_path, encoding="utf-8"))
g = geo["minecraft:geometry"][0]
bones = g.get("bones", [])
cubes = [c for b in bones for c in b.get("cubes", [])]

print(f"geometry: {geo_path}")
print(f"  bones       : {len(bones)}")
print(f"  cubes       : {len(cubes)}")

# Every face UV is [u1,v1,u2,v2]. Identical rectangles mean shared texture space,
# which is what makes a model read as one flat colour.
uvs = []
for c in cubes:
    uv = c.get("uv")
    if isinstance(uv, dict):
        for face in uv.values():
            if isinstance(face, dict) and "uv" in face:
                uvs.append(tuple(face["uv"]))
            elif isinstance(face, list):
                uvs.append(tuple(face))
    elif isinstance(uv, list):
        uvs.append(tuple(uv))

if uvs:
    uniq = len(set(uvs))
    print(f"  UV rects    : {len(uvs)} total, {uniq} unique "
          f"({'OK' if uniq == len(uvs) else 'OVERLAPPING'})")
else:
    print("  UV rects    : none found (box UV mode?)")

# Required groups, so a "flat" model can be told apart from a broken one.
names = {b.get("name") for b in bones}
required = ["root", "camera", "positioning", "views", "lefthand", "righthand"]
missing = [r for r in required if r not in names]
print(f"  required grps: {'all present' if not missing else 'MISSING ' + ', '.join(missing)}")
print("")

# ---------------------------------------------------------------- verdict
print("diagnosis")
if distinct < 64:
    print(f"  FLAT TEXTURE: only {distinct} colours. Official m870 uses 424.")
if coverage < 40:
    print(f"  LOW COVERAGE: {coverage:.0f}% of the atlas is empty.")
if uvs and len(set(uvs)) != len(uvs):
    print(f"  UV OVERLAP: {len(uvs) - len(set(uvs))} faces share a rectangle.")
if len(cubes) < 200:
    print(f"  LOW DETAIL: {len(cubes)} cubes. Official ak47 is 761, m870 is 273.")
if not (distinct < 64 or coverage < 40 or (uvs and len(set(uvs)) != len(uvs)) or len(cubes) < 200):
    print("  no obvious flatness cause found; check render settings (shading, lighting)")
