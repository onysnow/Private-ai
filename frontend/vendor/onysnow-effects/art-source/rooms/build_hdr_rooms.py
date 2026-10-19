"""
Build the HDR room reflections from the Poly Haven originals.

    python3 art-source/rooms/build_hdr_rooms.py <folder with the .hdr/.exr files>

Writes public/rooms-hdr/<room>.jpg: 2048 x 512, the band of the room around
eye level, in scene-linear light, LOG-ENCODED so a lamp keeps its real
brightness through an 8-bit JPEG.

WHY HDR

Glass reflects about 4% of the room face-on. In a dark room that is nothing,
except where the room is bright: its lamps, which are thousands of times
brighter than the walls. 4% of a lamp is still bright, which is why you see
a room's lamps in a window at night. The old rooms were graded, tonemapped
JPEGs -- every lamp clipped to plain white -- and 4% of white is almost
nothing, so the reflection could not be both physically right and visible.

THE STEPS

1. Read the equirectangular original (Radiance .hdr or OpenEXR).
2. Crop rows 0.215-0.755 of the height: the band around eye level (the
   horizon is at 0.5), as before. The shader maps pitch to this band.
3. Resample to 2048 x 512 in LINEAR light (box filter), a power of two so
   the browser can build and sample mip levels.
4. Expose so the median luminance is photographic middle grey, 0.18 of
   screen white: a room lit about as brightly as what is on the screen,
   which is the room someone is actually sitting in. (The graded set used
   0.07, chosen for a CSS layer screen-blended at a set opacity; at a real
   4% reflectance that left the room invisible.) One target for every room,
   so none arrives brighter than another. This is the environment cause.
5. Log-encode each channel: v = log2(1 + L) / log2(1 + LMAX), LMAX = 64.
   Anything brighter than 64 would reflect at 4% as 2.7x white, which the
   tonemap blows out anyway. Steps are ~1.6% in brightness, finer than the
   eye separates. The shader decodes with exp2(v * log2(1 + LMAX)) - 1.

Mip levels are NOT built here: the page decodes this level to linear light
and box-filters its own levels there, so a blurred lamp keeps its energy.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
LMAX = 64.0
WIDTH, HEIGHT = 2048, 512

ROOMS = {
    "metro": ("metro_noord_2k.hdr", 0.18),
    "aquarium": ("ushaka_sea_world_aquarium_2k.hdr", 0.18),
    "studio": ("ferndale_studio_12_2k.hdr", 0.18),
    "lobby": ("newman_lobby_2k.hdr", 0.18),
    "fireplace": ("fireplace_2k.hdr", 0.18),
    "station": ("env-station-night.exr", 0.18),
}


def read_hdr(path: Path) -> np.ndarray:
    """Radiance RGBE (new-style run-length encoded scanlines)."""
    data = path.read_bytes()
    pos = 0
    while True:
        end = data.index(b"\n", pos)
        line = data[pos:end]
        pos = end + 1
        if line.startswith(b"-Y") or line.startswith(b"+Y"):
            parts = line.split()
            h, w = int(parts[1]), int(parts[3])
            break
    out = np.zeros((h, w, 4), dtype=np.uint8)
    for y in range(h):
        if data[pos] != 2 or data[pos + 1] != 2:
            raise ValueError("only RLE scanlines are supported")
        pos += 4
        for c in range(4):
            x = 0
            while x < w:
                n = data[pos]
                pos += 1
                if n > 128:
                    n -= 128
                    out[y, x : x + n, c] = data[pos]
                    pos += 1
                else:
                    out[y, x : x + n, c] = np.frombuffer(data, np.uint8, n, pos)
                    pos += n
                x += n
    e = out[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return out[..., :3].astype(np.float64) * scale[..., None]


def read_exr(path: Path) -> np.ndarray:
    import OpenEXR

    with OpenEXR.File(str(path)) as f:
        channels = f.channels()
        for packed in ("RGB", "RGBA"):
            if packed in channels:
                return np.asarray(channels[packed].pixels, dtype=np.float64)[..., :3]
        return np.stack([np.asarray(channels[c].pixels, dtype=np.float64) for c in "RGB"], -1)


def box_resize(img: np.ndarray, w: int, h: int) -> np.ndarray:
    chans = []
    for c in range(3):
        ch = Image.fromarray(img[..., c].astype(np.float32), mode="F")
        chans.append(np.asarray(ch.resize((w, h), Image.BOX), dtype=np.float64))
    return np.stack(chans, -1)


def build(src: Path, out: Path, target: float) -> None:
    img = read_exr(src) if src.suffix == ".exr" else read_hdr(src)
    h = img.shape[0]
    img = img[int(h * 0.215) : int(h * 0.755)]
    img = np.clip(box_resize(np.nan_to_num(img), WIDTH, HEIGHT), 0.0, None)
    lum = img @ np.array([0.2126, 0.7152, 0.0722])
    img *= target / max(np.median(lum), 1e-9)
    v = np.log2(1.0 + np.clip(img, 0.0, LMAX)) / np.log2(1.0 + LMAX)
    Image.fromarray((v * 255 + 0.5).astype(np.uint8), mode="RGB").save(out, quality=92)
    bright = (lum * target / max(np.median(lum), 1e-9) > 1).mean()
    print(f"{out.name}: {bright * 100:.2f}% of the room brighter than white")


if __name__ == "__main__":
    folder = Path(sys.argv[1])
    dest = ROOT / "public" / "rooms-hdr"
    dest.mkdir(exist_ok=True)
    for name, (file, target) in ROOMS.items():
        src = folder / file
        if not src.exists():
            src = ROOT / "art-source" / file
        build(src, dest / f"{name}.jpg", target)
