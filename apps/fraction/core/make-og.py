#!/usr/bin/env python3
"""Generate og-image.png (1200x630) for Fraction Buddy, matching the
Triangle Buddy card: grid, radial glow, DejaVu Serif Bold title with a brass
middle dot, mono subtitle + cyan tagline. Left art: a stacked mixed number and
the four operator chips, drawn from the shared C tokens."""
from PIL import Image, ImageDraw, ImageFont
import os
W, H = 1200, 630
C = dict(bg=(11,14,19), line=(42,51,68), ink=(240,236,226), dim=(170,180,197), brass=(224,180,106),
         brassDim=(90,74,40), cyan=(127,227,211), red=(232,131,140), panel=(17,21,28))
F = "/usr/share/fonts/truetype/dejavu/"
serif = lambda s: ImageFont.truetype(F + "DejaVuSerif-Bold.ttf", s)
mono = lambda s, b=False: ImageFont.truetype(F + ("DejaVuSansMono-Bold.ttf" if b else "DejaVuSansMono.ttf"), s)

img = Image.new("RGB", (W, H), C["bg"])
# radial glow from the upper-left, like the Triangle Buddy card
glow = Image.new("RGB", (W, H), C["bg"]); gp = glow.load()
for y in range(H):
    for x in range(W):
        d = min(1.0, (((x - 240) / 900) ** 2 + ((y + 60) / 620) ** 2) ** 0.5)
        t = (1 - d) ** 2
        gp[x, y] = tuple(int(C["bg"][i] + (c - C["bg"][i]) * t) for i, c in enumerate((22, 34, 46)))
img = glow
d = ImageDraw.Draw(img)
for x in range(0, W, 120): d.line([(x, 0), (x, H)], fill=(24, 29, 38), width=1)
for y in range(0, H, 90): d.line([(0, y), (W, y)], fill=(24, 29, 38), width=1)

# ---- left art: "2 3/4" as a stacked mixed number, then + − × ÷ chips ----
d.rounded_rectangle([96, 150, 456, 420], radius=22, fill=C["panel"], outline=C["line"], width=2)
d.text((212, 288), "2", font=serif(150), fill=C["brass"], anchor="mm")
cx = 330
d.text((cx, 238), "3", font=serif(84), fill=C["brass"], anchor="mm")
d.rounded_rectangle([cx - 44, 283, cx + 44, 289], radius=3, fill=C["brass"])
d.text((cx, 336), "4", font=serif(84), fill=C["brass"], anchor="mm")
chips = [("+", C["brass"]), ("\u2212", C["red"]), ("\u00d7", C["dim"]), ("\u00f7", C["dim"])]
x0 = 96
for i, (g, col) in enumerate(chips):
    x = x0 + i * 94
    on = i == 3
    d.rounded_rectangle([x, 446, x + 80, 506], radius=12, fill=C["brassDim"] if on else C["panel"],
                        outline=C["brass"] if on else C["line"], width=2)
    d.text((x + 40, 476), g, font=mono(36, True), fill=C["ink"] if on else col, anchor="mm")

# ---- right text block (same positions as the Triangle Buddy card) ----
tx, ty = 527, 238
f = serif(68)
d.text((tx, ty), "Fraction", font=f, fill=C["ink"], anchor="ls")
w1 = d.textlength("Fraction", font=f)
d.ellipse([tx + w1 + 6, ty - 31, tx + w1 + 19, ty - 18], fill=C["brass"])
d.text((tx + w1 + 25, ty), "Buddy", font=f, fill=C["ink"], anchor="ls")
d.text((tx, 326), "FREE EXACT FRACTION CALCULATOR", font=mono(22), fill=C["dim"], anchor="ls")
d.text((tx, 378), "Add \u00b7 subtract \u00b7 multiply \u00b7 divide", font=mono(21), fill=C["cyan"], anchor="ls")
d.text((tx, 410), "whole numbers & mixed fractions", font=mono(21), fill=C["cyan"], anchor="ls")
d.text((tx, 560), "fractions.trianglebuddy.com", font=mono(19), fill=(127, 138, 157), anchor="ls")

out = os.path.join(os.path.dirname(__file__), "..", "og-image.png")
img.save(out, optimize=True)
print("[og] wrote", os.path.normpath(out), img.size)
