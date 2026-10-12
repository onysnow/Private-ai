"""
Build the glass smudge and scratch maps from the texture pack photographs.

    python3 art-source/glass-textures/build_maps.py <folder of Full Res Textures>

Writes public/glass-smudge.jpg (1024 square) and public/glass-scratch.jpg
(2048 square): greyscale, the mark's amount in the brightness, black where
the glass is clean.

What each step is for:

1. Square crop from the middle of the photograph.
2. Flatten the lighting. The photographs were lit by a lamp, so each has a
   bright patch or vignette that is the studio, not the glass. Subtracting a
   heavy blur (a high-pass) keeps the marks and throws the lamp away --
   tiled, that lamp patch would repeat across the page as a visible blotch.
3. Levels, by histogram matching to the channel of the old packed map the
   layer replaces (scratches to its specks channel, smudge to its smears
   channel). The shader's clarity threshold and the "Specks" and "Grime,
   raked" settings were calibrated on those distributions; matching them
   keeps the same density of marks -- a wiped pane, clear across most of its
   face -- with the new photographs' shapes. Without it the scratch map let
   seven times as many pixels through and the pane read as rain.
4. Make it tile with no seam: crossfade with a copy shifted by half the size,
   weighted to the original in the middle and the shifted copy at the edges
   (whose middle is continuous across the wrap). The blend is
   variance-preserving (Heitz & Neyret 2018) rather than a plain average, so
   the marks in the crossfade zone keep their contrast instead of turning
   into faint doubled ghosts.

Repetition across the page is broken in the shader, not here: hex-tiling
(Mikkelsen 2022) samples every hexagonal cell with its own random offset and
rotation and blends the three nearest cells, so no two neighbouring patches
of glass carry the same marks and there is no grid to spot.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parents[2]

# (source photograph, output file, output size, high-pass sigma in source px,
#  channel of the old packed map to match: 0 specks, 1 smears)
MAPS = [
    ("Glass Texture_09.jpg", "glass-smudge.jpg", 1024, 220.0, 1),
    ("Glass Texture_14.jpg", "glass-scratch.jpg", 2048, 24.0, 0),
]
REFERENCE = ROOT / "art-source" / "glass-textures" / "reference-packed-map.jpg"


def match_histogram(values: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """Remap values so their distribution is the reference's (rank-preserving)."""
    order = np.argsort(values, axis=None, kind="stable")
    ranks = np.empty(values.size)
    ranks[order] = np.arange(values.size) / max(values.size - 1, 1)
    ref_sorted = np.sort(reference, axis=None)
    matched = np.interp(ranks, np.linspace(0, 1, ref_sorted.size), ref_sorted)
    return matched.reshape(values.shape)


def square(img: np.ndarray) -> np.ndarray:
    h, w = img.shape
    s = min(h, w)
    y, x = (h - s) // 2, (w - s) // 2
    return img[y : y + s, x : x + s]


def seamless(a: np.ndarray) -> np.ndarray:
    n = a.shape[0]
    b = np.roll(np.roll(a, n // 2, axis=0), n // 2, axis=1)
    t = np.sin(np.pi * (np.arange(n) + 0.5) / n) ** 2
    m = np.outer(t, t)
    mean = a.mean()
    blended = m * (a - mean) + (1 - m) * (b - mean)
    return mean + blended / np.sqrt(m * m + (1 - m) * (1 - m))


def build(src: Path, out: Path, size: int, sigma: float, channel: int) -> None:
    img = np.asarray(Image.open(src).convert("L"), dtype=np.float64) / 255.0
    img = square(img)
    marks = np.clip(img - gaussian_filter(img, sigma), 0.0, None)
    small = Image.fromarray(marks.astype(np.float32), mode="F").resize((size, size), Image.LANCZOS)
    marks = np.asarray(small, dtype=np.float64)
    marks = np.clip(seamless(marks), 0.0, None)
    ref = np.asarray(Image.open(REFERENCE).convert("RGB"), dtype=np.float64)[..., channel] / 255.0
    marks = np.clip(match_histogram(marks, ref), 0.0, 1.0)
    Image.fromarray((marks * 255 + 0.5).astype(np.uint8), mode="L").save(out, quality=90)
    print(f"{out.name}: {size}px, mean {marks.mean():.3f}")


if __name__ == "__main__":
    folder = Path(sys.argv[1])
    for name, out, size, sigma, channel in MAPS:
        build(folder / name, ROOT / "public" / out, size, sigma, channel)
