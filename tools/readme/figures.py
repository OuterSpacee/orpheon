"""The README's figures, drawn from what tools/readme/data.ts and shots.ts made.

    bun tools/readme/data.ts && bun tools/readme/shots.ts     (the dev server running)
    python tools/readme/figures.py                              writes docs/media/

Every plot is in the page's own palette (docs/look.md): the void, cold dust, one warm colour.
"""
import json
import os
import subprocess
import wave

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

SRC = "shots/readme"
OUT = "docs/media"
os.makedirs(OUT, exist_ok=True)

VOID = "#030409"
LIFT = "#0a0d1a"
DUST = "#c9d6ff"
WARM = "#ffd58a"
INK = "#e8ecff"
INK2 = "#8a93b8"
INK3 = "#4a5170"
TINTS = {"i": "#9fd8ff", "a": WARM, "u": "#c4a8ff"}

plt.rcParams.update({
    "figure.facecolor": VOID, "axes.facecolor": VOID, "savefig.facecolor": VOID,
    "axes.edgecolor": INK3, "axes.labelcolor": INK2, "text.color": INK,
    "xtick.color": INK2, "ytick.color": INK2, "grid.color": "#1a1f33",
    "font.family": "DejaVu Sans", "font.size": 11, "axes.titlesize": 12, "axes.titlecolor": INK,
    "axes.spines.top": False, "axes.spines.right": False,
})


def jpg(name, src, width, crop=None):
    im = Image.open(f"{SRC}/{src}.png").convert("RGB")
    if crop:
        im = im.crop(crop)
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(f"{OUT}/{name}.jpg", quality=86, optimize=True, progressive=True)
    print(f"{OUT}/{name}.jpg", f"{os.path.getsize(f'{OUT}/{name}.jpg') // 1024} KB")


def panels(name, items, cols, width_in, cell_ratio=1.0, crop=None, title_size=11):
    rows = (len(items) + cols - 1) // cols
    fig, axes = plt.subplots(rows, cols, figsize=(width_in, width_in / cols * cell_ratio * rows + 0.35 * rows))
    for ax in np.atleast_1d(axes).ravel():
        ax.axis("off")
    for ax, (src, label) in zip(np.atleast_1d(axes).ravel(), items):
        im = Image.open(f"{SRC}/{src}.png").convert("RGB")
        if crop:
            im = im.crop(crop(im))
        ax.imshow(im)
        ax.set_title(label, color=INK2, fontsize=title_size, pad=6)
    fig.subplots_adjust(left=0.005, right=0.995, top=0.94 if rows == 1 else 0.96, bottom=0.005, wspace=0.02, hspace=0.12)
    fig.savefig(f"{OUT}/{name}.jpg", dpi=150, pil_kwargs={"quality": 86, "optimize": True, "progressive": True})
    plt.close(fig)
    print(f"{OUT}/{name}.jpg", f"{os.path.getsize(f'{OUT}/{name}.jpg') // 1024} KB")


data = json.load(open(f"{SRC}/data.json", encoding="utf-8"))

# ── pictures of the body ──
panels("anatomy", [("part-skin", "Skin"), ("part-bone", "Skull and jaw"), ("part-tongue", "Tongue"), ("part-palate", "Palate and soft palate"),
                   ("part-nose", "Nasal cavity"), ("part-air", "Air column"), ("part-larynx", "Larynx and vocal folds"), ("part-lungs", "Lungs and bronchi")], 4, 12)
panels("sections", [("cut", "Midsagittal section (cut open)"), ("front", "Frontal view"), ("apart", "Exploded")], 3, 12, cell_ratio=1.0,
       crop=lambda im: (int((im.width - im.height) / 2), 0, int((im.width + im.height) / 2), im.height) if im.width > im.height else (0, 0, im.width, im.height))
panels("density-colour", [("airy", "Density 12 %"), ("usual", "Density 67 % (default)"), ("dense", "Density 100 %"), ("colour", "Colour 100 %")], 4, 12)
panels("blink", [("lids-0", "open"), ("lids-0.35", "lid falling"), ("lids-0.7", "nearly shut"), ("lids-1", "shut")], 4, 12, cell_ratio=0.42,
       crop=lambda im: (int(im.width * 0.22), int(im.height * 0.17), int(im.width * 0.78), int(im.height * 0.39)))

# ── the page ──
desk = Image.open(f"{SRC}/page-sing.png").convert("RGB")
desk.resize((1440, 900), Image.LANCZOS).save(f"{OUT}/page.jpg", quality=86, optimize=True, progressive=True)
print(f"{OUT}/page.jpg")
phones = [Image.open(f"{SRC}/{n}.png").convert("RGB") for n in ("phone-sing", "phone-body", "phone-controls")]
w, h = 390, 844
gap = 28
strip = Image.new("RGB", (3 * w + 2 * gap + 2 * gap, h + 2 * gap), VOID)
for i, p in enumerate(phones):
    strip.paste(p.resize((w, h), Image.LANCZOS), (gap + i * (w + gap), gap))
strip.save(f"{OUT}/phone.jpg", quality=86, optimize=True, progressive=True)
print(f"{OUT}/phone.jpg")

# ── the animated figure ──
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "15", "-i", f"{SRC}/film/%03d.png",
                "-vf", "crop=iw*0.86:ih*0.86:iw*0.07:ih*0.04,scale=400:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=80:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
                f"{OUT}/singing.gif"], check=True)
print(f"{OUT}/singing.gif", f"{os.path.getsize(f'{OUT}/singing.gif') // 1024} KB")

# ── Figure: the tube and what it does to sound ──
fig, (left, right) = plt.subplots(1, 2, figsize=(12, 4.2))
for v in data["vowels"]:
    n = len(v["area"])
    x = (np.arange(n) + 0.5) * v["length"] / n
    left.step(x, v["area"], where="mid", color=TINTS[v["ph"]], lw=2, label=f"/{v['ph']}/")
    right.plot(v["hz"], v["gain"], color=TINTS[v["ph"]], lw=1.6, label=f"/{v['ph']}/  F1–F3 = " + " · ".join(f"{f:.0f}" for f in v["formants"][:3]) + " Hz")
    for f in v["formants"][:3]:
        right.axvline(f, color=TINTS[v["ph"]], lw=0.6, alpha=0.35)
left.set_xlabel("distance from the vocal folds (cm)")
left.set_ylabel("cross-sectional area (cm²)")
left.set_title("a  Area function A(x), tenor tract")
left.legend(frameon=False, labelcolor=INK2)
left.grid(True, lw=0.5)
right.set_xlabel("frequency (Hz)")
right.set_ylabel("volume-velocity transfer |U_lips / U_glottis| (dB)")
right.set_title("b  Transfer function and resonances (formants)")
right.legend(frameon=False, labelcolor=INK2, fontsize=9.5, loc="upper right")
right.set_xlim(60, 5000)
right.grid(True, lw=0.5)
fig.tight_layout()
fig.savefig(f"{OUT}/tube.png", dpi=150)
plt.close(fig)
print(f"{OUT}/tube.png")

# ── Figure: the vowel space, wanted and heard ──
fig, axes = plt.subplots(1, 3, figsize=(13, 4.6), sharey=False)
for ax, who in zip(axes, ["man", "woman", "child"]):
    rows = [r for r in data["fit"] if r["body"] == who]
    for r in rows:
        (w1, w2, _), (h1, h2, _) = r["want"], r["heard"]
        ax.plot([w2, h2], [w1, h1], color=INK3, lw=0.8)
        ax.scatter([w2], [w1], s=34, facecolors="none", edgecolors=INK2, lw=1)
        ax.scatter([h2], [h1], s=16, color=WARM)
        ax.annotate(r["ph"], (h2, h1), xytext=(5, 4), textcoords="offset points", color=INK, fontsize=11)
    errs = np.array([[abs(h - w) / w * 100 for w, h in zip(r["want"], r["heard"])] for r in rows])
    ax.set_title(f"{who}   mean |error|  F1 {errs[:, 0].mean():.1f} %   F2 {errs[:, 1].mean():.1f} %   F3 {errs[:, 2].mean():.1f} %", fontsize=10.5)
    ax.invert_xaxis()
    ax.invert_yaxis()
    ax.set_xlabel("F2 (Hz)")
    ax.grid(True, lw=0.5)
axes[0].set_ylabel("F1 (Hz)")
axes[0].scatter([], [], s=34, facecolors="none", edgecolors=INK2, label="published average")
axes[0].scatter([], [], s=16, color=WARM, label="Orpheon, measured from its output")
axes[0].legend(frameon=False, labelcolor=INK2, loc="lower left", fontsize=9.5)
fig.tight_layout()
fig.savefig(f"{OUT}/vowels.png", dpi=150)
plt.close(fig)
print(f"{OUT}/vowels.png")


# ── Figure: spectrograms ──
def read(path):
    with wave.open(path) as f:
        rate = f.getframerate()
        raw = f.readframes(f.getnframes())
        width = f.getsampwidth()
    x = np.frombuffer(raw, dtype=np.int16 if width == 2 else np.int32).astype(np.float64)
    return x / np.abs(x).max(), rate


def spectrogram(ax, path, title, top=5500):
    x, rate = read(path)
    n, hop = 1024, 128
    window = np.hanning(n)
    frames = np.array([x[i:i + n] * window for i in range(0, len(x) - n, hop)])
    s = 20 * np.log10(np.abs(np.fft.rfft(frames, axis=1)).T + 1e-9)
    s -= s.max()
    f = np.fft.rfftfreq(n, 1 / rate)
    keep = f <= top
    from matplotlib.colors import LinearSegmentedColormap
    cmap = LinearSegmentedColormap.from_list("heat", [VOID, "#1b2340", "#5f6fae", DUST, WARM, "#ffffff"])
    ax.imshow(s[keep], origin="lower", aspect="auto", cmap=cmap, vmin=-82, vmax=8,
              extent=[0, len(x) / rate, 0, f[keep][-1]])
    ax.set_title(title, loc="left")
    ax.set_xlabel("time (s)")
    ax.set_ylabel("frequency (Hz)")


fig, (a, b) = plt.subplots(1, 2, figsize=(13, 4.2), gridspec_kw={"width_ratios": [1.1, 1]})
spectrogram(a, f"{SRC}/speech.wav", "a  Spoken: “Orpheon sings with a body made of light.”")
spectrogram(b, f"{SRC}/vowels.wav", "b  Sung: /a/ → /i/ → /u/ → /ɑ/ on a rising line")
fig.tight_layout()
fig.savefig(f"{OUT}/spectrogram.jpg", dpi=150, pil_kwargs={"quality": 88, "optimize": True, "progressive": True})
plt.close(fig)
print(f"{OUT}/spectrogram.jpg")
