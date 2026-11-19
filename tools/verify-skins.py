"""Validates the generated AI-moe skin PNGs.

A skin that is not 64x64, or has no opaque pixels in the head area, renders as
default Steve in game, so both are checked here rather than discovered later.

Usage: python tools/verify-skins.py
"""
import os
from collections import Counter
from PIL import Image

BASE = r"E:\daima\TCZ AI钱包\refs\ai-moe"
NAMES = ["claude", "deepseek", "grok"]

# Standard 64x64 layout: the head's front face sits at (8,8) and is 8x8.
HEAD_FRONT = (8, 8, 16, 16)

print(f"{'name':<10} {'size':<10} {'opaque':<8} {'colours':<8} {'head':<8} bytes")
ok_all = True
for name in NAMES:
    path = os.path.join(BASE, name, f"{name}_skin.png")
    if not os.path.exists(path):
        print(f"{name:<10} MISSING")
        ok_all = False
        continue
    img = Image.open(path).convert("RGBA")
    px = list(img.getdata())
    opaque = sum(1 for q in px if q[3] > 0)
    colours = len(Counter(q for q in px if q[3] > 0))
    head = img.crop(HEAD_FRONT)
    head_opaque = sum(1 for q in head.getdata() if q[3] > 0)
    size_ok = img.size == (64, 64)
    head_ok = head_opaque > 0
    if not (size_ok and head_ok):
        ok_all = False
    print(
        f"{name:<10} {str(img.size):<10} {opaque:<8} {colours:<8} "
        f"{head_opaque:<8} {os.path.getsize(path)}B"
        + ("" if size_ok else "  BAD SIZE")
        + ("" if head_ok else "  EMPTY FACE")
    )

print()
print("all skins valid" if ok_all else "SOME SKINS INVALID")
