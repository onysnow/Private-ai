"""The light a drop throws onto the print behind the glass (rain W2, docs/rain-system.md 3.2).

A sessile drop is a lens. Light from a lamp that would have landed on the
print under the drop's footprint is bent: for a bead far from its focus it is
spread thin over a wide halo, leaving a near-black shadow of the footprint; for
a flat drop whose focal length is near the gap it is gathered into a bright
core. This script ray-traces that with the research's tracer
(docs/research/2026-10-rain/calc/drop_caustic.py) and writes a lookup table
the floor light reads:

  rows   D/f, the gap over the drop's paraxial focal length, 0.25 .. 16 (log),
         ROWS rows, repeated for each penumbra tile;
  tiles  the lamp's penumbra on the print over the contact radius,
         0, 0.5, 1, 2 (a bigger, lower or further lamp blurs the pattern);
  cols   rho / a, the distance on the print from the pattern's centre over the
         contact radius, 0 .. RHO_MAX.
  value  E, the irradiance against the plain pane's: R = min(E, 1),
         G = (E - 1) / 8 where E > 1. So E = R + 8 G.

Writes public/water/drop-lens-lut.png (64 x 4*ROWS). Run from the repo root:
  python3 tools/water/drop_lens_lut.py
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "docs/research/2026-10-rain/calc"))
src = (ROOT / "docs/research/2026-10-rain/calc/drop_caustic.py").read_text()
ns = {}
exec(src[: src.find("\nfor ")] if "\nfor " in src else src, ns)  # the functions only
trace = ns["trace"]
N_W, N_G = ns["n_w"], ns["n_g"]

COLS, ROWS = 64, 48
RHO_MAX = 4.0
RATIOS = np.geomspace(0.25, 16.0, ROWS)      # D / f
PENUMBRAS = [0.0, 0.5, 1.0, 2.0]             # penumbra / a
THETA = 45.0                                 # contact angle: between a fresh bead (50-60) and a flattened one (30-40)
A = 1.0                                      # everything scales with a


def profile(ratio):
    """E(rho/a) for a drop of contact radius 1 at D = ratio * f."""
    th = np.radians(THETA)
    R = A / np.sin(th)
    f = R / (N_W - 1)
    D = ratio * f
    x, P = trace(A, THETA, D, "far", N=300000)
    span = RHO_MAX * A * 1.5
    nb = 600
    edges = np.linspace(0, span, nb + 1)
    hist, _ = np.histogram(np.abs(x), bins=edges, weights=P)
    area = np.pi * (edges[1:] ** 2 - edges[:-1] ** 2)
    E = hist / area
    Tp = (1 - ((N_G - 1) / (N_G + 1)) ** 2) ** 2
    c = 0.5 * (edges[1:] + edges[:-1])
    E = E + np.where(c > A, Tp, 0.0)
    E = E / Tp
    # Light bent beyond the span is spread so thin it is the plain pane: clip the tail to 1.
    return c, E


def blur(c, E, pen):
    """A uniform disc blur of radius pen over the radial profile (the lamp's penumbra)."""
    if pen <= 0:
        return E
    g = np.linspace(-c[-1], c[-1], 601)
    X, Y = np.meshgrid(g, g)
    img = np.interp(np.hypot(X, Y), c, E, right=1.0)
    k = max(int(round(pen / (g[1] - g[0]))), 1)
    ky, kx = np.mgrid[-k : k + 1, -k : k + 1]
    ker = (kx * kx + ky * ky <= k * k).astype(float)
    ker /= ker.sum()
    from numpy.fft import irfft2, rfft2

    pad = np.pad(img, k, mode="edge")
    Kp = np.zeros_like(pad)
    Kp[: 2 * k + 1, : 2 * k + 1] = ker
    Kp = np.roll(np.roll(Kp, -k, 0), -k, 1)
    conv = irfft2(rfft2(pad) * rfft2(Kp), s=pad.shape)[k:-k, k:-k]
    mid = len(g) // 2
    prof = conv[mid, mid:]
    return np.interp(c, g[mid:], prof, right=1.0)


def main():
    out = np.zeros((ROWS * len(PENUMBRAS), COLS, 4), np.uint8)
    rho = np.linspace(0, RHO_MAX, COLS) * A
    for ri, ratio in enumerate(RATIOS):
        c, E = profile(ratio)
        for pi, pen in enumerate(PENUMBRAS):
            Eb = blur(c, E, pen * A)
            v = np.interp(rho, c, Eb, right=1.0)
            r = np.clip(v, 0, 1)
            gch = np.clip((v - 1) / 8, 0, 1)
            row = pi * ROWS + ri
            out[row, :, 0] = np.round(r * 255)
            out[row, :, 1] = np.round(gch * 255)
            out[row, :, 2] = 0
            out[row, :, 3] = 255
        if ri % 8 == 0:
            inside = rho < A
            print(f"D/f {ratio:5.2f}: centre {E[0]:.2f}, footprint mean {np.average(np.interp(rho[inside], c, E)):.2f}, max {E.max():.2f}")
    dest = ROOT / "public/water/drop-lens-lut.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out, "RGBA").save(dest)
    print("wrote", dest, out.shape)


if __name__ == "__main__":
    main()
