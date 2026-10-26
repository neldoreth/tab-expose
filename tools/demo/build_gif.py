import sys, glob, os
from PIL import Image, ImageDraw
S = sys.argv[1]; F = f"{S}/frames"; OUT = f"{S}/seq"
W = 960; K = W / 1440

def cursor(img, x, y, pressed=False):
    s = 1.6 * (0.9 if pressed else 1)
    pts = [(0,0),(0,17),(4,13),(7,20),(10,19),(7,12),(12,12)]
    d = ImageDraw.Draw(img)
    p = [(x + px*s, y + py*s) for px, py in pts]
    d.polygon([(a+1.5, b+2) for a, b in p], fill=(0,0,0,70))
    d.polygon(p, fill="black", outline="white", width=2)
    if pressed:
        d.ellipse((x-14, y-14, x+14, y+14), outline=(255,255,255,200), width=2)

frames = []  # (image path, duration ms, cursor pos, pressed)
def add(path, ms, pos=None, pressed=False): frames.append((path, ms, pos, pressed))

rest = (1060, 760); target = (725, 190)
add(f"{S}/sites/5.png", 1100, rest)
intro = sorted(glob.glob(f"{F}/intro-*.png"))
for p in intro: add(p, 30, rest)
add(f"{F}/grid.png", 450, rest)
steps = 16
for i in range(1, steps + 1):
    t = i / steps; e = t * t * (3 - 2 * t)
    pos = (rest[0] + (target[0] - rest[0]) * e, rest[1] + (target[1] - rest[1]) * e)
    add(f"{F}/grid.png" if i < steps * 0.75 else f"{F}/grid-hover.png", 30, pos)
add(f"{F}/grid-hover.png", 650, target)
add(f"{F}/grid-hover.png", 140, target, True)
for p in sorted(glob.glob(f"{F}/outro-*.png")): add(p, 30, target)
add(f"{S}/sites/2.png", 1700, target)

lines = []
for i, (path, ms, pos, pressed) in enumerate(frames):
    im = Image.open(path).convert("RGB").resize((W, round(900 * K)), Image.LANCZOS).convert("RGBA")
    if pos: cursor(im, pos[0] * K, pos[1] * K, pressed)
    out = f"{OUT}/{i:04d}.png"; im.convert("RGB").save(out)
    lines += [f"file '{out}'", f"duration {ms/1000:.3f}"]
lines.append(f"file '{OUT}/{len(frames)-1:04d}.png'")
open(f"{OUT}/list.txt", "w").write("\n".join(lines) + "\n")
print(len(frames), "frames", sum(f[1] for f in frames), "ms")
