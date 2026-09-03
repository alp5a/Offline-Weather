"""Generates the app icon: an analog gauge motif matching the app's
instrument-panel design language. Run once at build time; output PNGs
are committed to the repo so no build step is needed at runtime."""
import math
from PIL import Image, ImageDraw

INK = (27, 32, 40, 255)       # panel background
BRASS = (201, 138, 62, 255)   # dial ring / ticks
BRASS_DIM = (201, 138, 62, 140)
IVORY = (238, 240, 240, 255)  # needle / numerals
TEAL = (90, 143, 150, 255)    # accent dot

def make_icon(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = size * (0.14 if maskable else 0.06)
    d.rounded_rectangle([pad, pad, size - pad, size - pad],
                         radius=size * 0.22, fill=INK)

    cx, cy = size / 2, size / 2
    r = size * 0.32

    # outer brass ring
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=BRASS, width=max(2, int(size * 0.018)))

    # tick marks
    for i in range(24):
        ang = math.radians(i * 15 - 90)
        r1 = r * 0.86
        r2 = r if i % 6 == 0 else r * 0.94
        x1, y1 = cx + r1 * math.cos(ang), cy + r1 * math.sin(ang)
        x2, y2 = cx + r2 * math.cos(ang), cy + r2 * math.sin(ang)
        color = BRASS if i % 6 == 0 else BRASS_DIM
        d.line([x1, y1, x2, y2], fill=color, width=max(1, int(size * 0.01)))

    # needle pointing to ~10:30 (a temperature reading)
    needle_ang = math.radians(-120)
    nx, ny = cx + r * 0.72 * math.cos(needle_ang), cy + r * 0.72 * math.sin(needle_ang)
    d.line([cx, cy, nx, ny], fill=IVORY, width=max(2, int(size * 0.028)))
    hub = size * 0.035
    d.ellipse([cx - hub, cy - hub, cx + hub, cy + hub], fill=IVORY)

    # small teal accent (precipitation dot) lower right of dial
    dot_r = size * 0.045
    dx, dy = cx + r * 0.62, cy + r * 0.62
    d.ellipse([dx - dot_r, dy - dot_r, dx + dot_r, dy + dot_r], fill=TEAL)

    return img

for size, name in [(192, "icon-192.png"), (512, "icon-512.png")]:
    make_icon(size).save(f"/home/claude/offline-weather-pwa/icons/{name}")

make_icon(512, maskable=True).save("/home/claude/offline-weather-pwa/icons/icon-maskable-512.png")

print("done")
