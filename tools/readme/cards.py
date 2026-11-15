"""The README's banner, its three feature tiles and a card for each sound sample.

    python tools/readme/cards.py      after shots.ts and samples.ts; writes docs/media/

Set in the page's own typefaces (public/fonts, read with fontTools + brotli) and palette
(docs/look.md). A card shows the sample's real waveform, decoded from its MP3 with ffmpeg.
"""
import io
import os
import subprocess

import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC = "shots/readme"
OUT = "docs/media"
VOID = (3, 4, 9)
LIFT = (10, 13, 26)
EDGE = (32, 38, 62)
DUST = (201, 214, 255)
WARM = (255, 213, 138)
INK = (232, 236, 255)
INK2 = (138, 147, 184)
INK3 = (74, 81, 112)


def font_bytes(name):
    f = TTFont(f"public/fonts/{name}.woff2")
    f.flavor = None
    out = io.BytesIO()
    f.save(out)
    return out.getvalue()


SERIF = font_bytes("ysabeau")
MONO = font_bytes("dm-mono-300")


def serif(size, weight=300):
    f = ImageFont.truetype(io.BytesIO(SERIF), size)
    f.set_variation_by_axes([weight])
    return f


def mono(size):
    return ImageFont.truetype(io.BytesIO(MONO), size)


def tracked(draw, xy, text, font, fill, tracking):
    """Text with letter-spacing, as the page sets the name."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking


def save_jpg(im, name):
    im.convert("RGB").save(f"{OUT}/{name}", quality=88, optimize=True, progressive=True)
    print(f"{OUT}/{name}", f"{os.path.getsize(f'{OUT}/{name}') // 1024} KB")


def save_png(im, name):
    im.save(f"{OUT}/{name}", optimize=True)
    print(f"{OUT}/{name}", f"{os.path.getsize(f'{OUT}/{name}') // 1024} KB")


# ── the banner: the singing head on the right, the name set on the left ──
W, H = 2000, 880
banner = Image.new("RGB", (W, H), VOID)
hero = Image.open(f"{SRC}/hero.png").convert("RGB")
scale = H * 1.08 / hero.height
hero = hero.resize((round(hero.width * scale), round(hero.height * scale)), Image.LANCZOS)
left = 1330 - round(hero.width * 0.49)
fade = Image.new("L", hero.size, 255)
ramp = np.clip((np.arange(hero.width) - 0) / 520, 0, 1) ** 1.6
fade = Image.fromarray((np.tile(ramp, (hero.height, 1)) * 255).astype(np.uint8))
banner.paste(hero, (left, (H - hero.height) // 2), fade)
d = ImageDraw.Draw(banner)
x0 = 130
tracked(d, (x0, 230), "Orpheon", serif(150, 300), INK, 30)
d.line([(x0 + 6, 440), (x0 + 120, 440)], fill=WARM, width=3)
for i, line in enumerate(["A human voice built from the physics", "of the body that makes it,", "and shown as that body made of light."]):
    d.text((x0 + 4, 480 + i * 58), line, font=serif(46, 400), fill=INK2)
d.text((x0 + 6, 690), "no recordings  ·  no neural networks  ·  runs in your browser", font=mono(25), fill=WARM)
save_jpg(banner.resize((1800, round(H * 1800 / W)), Image.LANCZOS), "banner.jpg")


# ── three tiles: what it does, each a picture with its words on it ──
def tile(src, title, line, name, crop_at=(0.5, 0.5), zoom=1.0):
    TW, TH = 900, 640
    im = Image.open(f"{SRC}/{src}.png").convert("RGB")
    s = max(TW / im.width, TH / im.height) * zoom
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    cx, cy = round(im.width * crop_at[0]), round(im.height * crop_at[1])
    im = im.crop((cx - TW // 2, cy - TH // 2, cx + TW // 2, cy + TH // 2))
    shade = Image.new("RGBA", (TW, TH))
    a = np.clip((np.arange(TH) - TH * 0.42) / (TH * 0.5), 0, 1) ** 1.2 * 240
    shade.putalpha(Image.fromarray(np.tile(a[:, None], (1, TW)).astype(np.uint8)))
    shade = Image.composite(Image.new("RGBA", (TW, TH), VOID + (255,)), Image.new("RGBA", (TW, TH)), shade.getchannel("A"))
    im = Image.alpha_composite(im.convert("RGBA"), shade)
    d = ImageDraw.Draw(im)
    d.text((44, TH - 178), title, font=serif(78, 500), fill=INK)
    d.text((48, TH - 80), line, font=mono(33), fill=INK2)
    save_jpg(im, name)


tile("cut", "It speaks", "five languages, from text or IPA", "tile-speak.jpg", (0.52, 0.47), 1.25)
tile("choir", "It sings", "a staged choir of up to six voices", "tile-sing.jpg", (0.5, 0.47), 1.15)
tile("apart", "You see inside", "every part, alone or together", "tile-body.jpg", (0.5, 0.46), 1.05)


# ── a card for each sample: a play mark, its name, and its waveform ──
def envelope(path, bars):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float64) / 32768
    seconds = len(x) / 8000
    x = x[: len(x) // bars * bars].reshape(bars, -1)
    rms = np.sqrt((x ** 2).mean(axis=1))
    return rms / max(rms.max(), 1e-9), seconds


def card(sample, title, detail, name):
    CW, CH, R = 1000, 210, 26
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((1, 1, CW - 2, CH - 2), R, fill=LIFT + (255,), outline=EDGE + (255,), width=2)
    cx, cy, r = 92, CH // 2, 46
    glow = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((cx - r - 8, cy - r - 8, cx + r + 8, cy + r + 8), fill=WARM + (70,))
    im = Image.alpha_composite(im, glow.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(im)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=WARM + (255,), width=4)
    d.polygon([(cx - 13, cy - 21), (cx - 13, cy + 21), (cx + 23, cy)], fill=WARM + (255,))
    level, seconds = envelope(f"public/samples/{sample}.mp3", 118)
    d.text((176, 22), title, font=serif(54, 500), fill=INK)
    d.text((178, 92), f"{detail}  ·  {seconds:.0f} s", font=mono(28), fill=INK2)
    base, top, x = 178, 70, 178
    for i, v in enumerate(level):
        h = max(2, v * top * 0.42)
        colour = DUST if i % 2 == 0 else (150, 164, 214)
        d.rounded_rectangle((x, 168 - h, x + 4, 168 + h * 0.35), 2, fill=colour + (230,))
        x += 6.7
    save_png(im, name)


CARDS = [
    ("speak-tenor", "Speaking: a man", "adult tenor body · English"),
    ("speak-soprano", "Speaking: a woman", "adult soprano body · English"),
    ("speak-child", "Speaking: a child", "child body · English"),
    ("sing-vowels", "Sung vowels", "soprano · a e i o u · G4 to D5"),
    ("sing-twinkle-solo", "Twinkle, twinkle", "one voice, nothing else"),
    ("sing-joy-choir", "Ode to Joy", "choir of four with a band"),
    ("sing-jacques-round", "Are you sleeping?", "a round for four voices"),
    ("sing-old100-hymn", "Old Hundredth", "a hymn in four parts"),
]
for sample, title, detail in CARDS:
    card(sample, title, detail, f"card-{sample}.png")
