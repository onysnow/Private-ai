"""Crack lines and statistics from a simulated break, measured the same way as real ones.

Broken glass B0 (docs/broken-glass-system.md §3.2-3.3). One measuring routine is used
for both our simulated breaks and the 60 hand traced breaks of NIJ 241445, so the
numbers compare like with like:

  crossings  cracks crossed on circles 10-70 mm round the impact (radial count)
  pieces     count, areas, the largest piece's share, how elongated they are
  junctions  where three cracks meet: a T (one crack stops against another,
             as in real glass) or a Y (three at about 120 degrees, as in Voronoi
             cells); and the corners per piece (real cracks give about 4,
             Voronoi cells 6; Domokos et al. 2020)
  rings      the share of crack ink running round the impact, by distance

Usage:
  python3 analyze.py sim <name>            out/<name>/points.f32 -> tracings, stats.json
  python3 analyze.py nij <tracings dir>    stats for the NIJ tracings, by series
  python3 analyze.py sheet <name> <nij dir> <out.jpg>   comparison sheet

The NIJ tracings are third-party images: they are read for comparison only and never
copied into the repo or the site.
"""

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
from scipy.interpolate import griddata
from skimage.morphology import disk, remove_small_objects, skeletonize

HERE = Path(__file__).resolve().parent
PANE_MM = 203.2          # the NIJ panes, and our B0 pane
TRACE_PX = 400           # the NIJ tracings: about 400 px for 203 mm
MM_PER_PX = PANE_MM / TRACE_PX
RADII_MM = (10, 20, 30, 50, 70)

# ---------------------------------------------------------------- measuring a tracing


def binary_dilation(a, footprint):
    return ndi.binary_dilation(a, structure=footprint)


def neighbours(s):
    k = np.ones((3, 3), int)
    k[1, 1] = 0
    return ndi.convolve(s.astype(int), k, mode="constant") * s


def crossings(ink, centre, radii_mm=RADII_MM):
    """Dark runs met on circles round the impact; None where the circle leaves the pane."""
    h, w = ink.shape
    cx, cy = centre
    edge = min(cx, cy, w - 1 - cx, h - 1 - cy)
    out = {}
    th = np.linspace(0, 2 * np.pi, 3600, endpoint=False)
    for r_mm in radii_mm:
        r = r_mm / MM_PER_PX
        if r > edge - 4:
            out[r_mm] = None
            continue
        xs = np.round(cx + r * np.cos(th)).astype(int)
        ys = np.round(cy + r * np.sin(th)).astype(int)
        s = ink[ys, xs]
        out[r_mm] = int(np.sum(s & ~np.roll(s, 1)))
    return out


def pieces(ink):
    """Pieces between the cracks (the pane's edge closes them), as in the NIJ measurement."""
    closed = ink.copy()
    # The pane's edge closes the pieces. A tracing's lines stop a few pixels short
    # of the panel's edge, so the closing band is 8 px (4 mm) wide.
    closed[:8, :] = closed[-8:, :] = True
    closed[:, :8] = closed[:, -8:] = True
    closed = binary_dilation(closed, disk(1))
    lab, n = ndi.label(~closed)
    sizes = ndi.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
    keep = [k for k, s in enumerate(sizes, start=1) if s >= 6]
    areas, aspects = [], []
    for k in keep:
        ys, xs = np.nonzero(lab == k)
        areas.append(len(xs) * MM_PER_PX**2)
        if len(xs) >= 5:
            ev = np.sort(np.linalg.eigvalsh(np.cov(np.vstack([xs, ys]))))[::-1]
            aspects.append(math.sqrt(max(ev[0], 1e-9) / max(ev[1], 1e-9)))
        else:
            aspects.append(1.0)
    areas = np.array(areas)
    aspects = np.array(aspects)
    big = areas > 20
    total = ink.shape[0] * ink.shape[1] * MM_PER_PX**2
    return lab, {
        "count": int(len(areas)),
        "area_median_mm2": float(np.median(areas)) if len(areas) else None,
        "area_p10_mm2": float(np.percentile(areas, 10)) if len(areas) else None,
        "area_p90_mm2": float(np.percentile(areas, 90)) if len(areas) else None,
        "largest_share": float(areas.max() / total) if len(areas) else None,
        "aspect_median": float(np.median(aspects[big])) if big.any() else None,
        "aspect_over_4": float(np.mean(aspects[big] > 4)) if big.any() else None,
        "aspect_over_8": float(np.mean(aspects[big] > 8)) if big.any() else None,
    }


def junctions(ink, lab):
    """T and Y junctions, and the corners each piece has.

    The ink is thinned to lines with the pane's edge drawn in, so a crack reaching
    the edge makes a junction with it, as it does in the glass. At every junction
    the directions of its branches are measured 2.5 mm out; the angle between two
    neighbouring branches is a corner of the piece lying in it unless it is nearly
    straight (over 160 degrees). One of those, a T: a crack stopped against another.
    """
    h, w = ink.shape
    # The pane's edge, drawn 7 px in (tracings stop a few pixels short of the
    # panel's edge), with everything outside it cleared.
    m = 7
    sk = ink.copy()
    sk[:m, :] = sk[-m:, :] = False
    sk[:, :m] = sk[:, -m:] = False
    sk[m, m : w - m] = sk[h - 1 - m, m : w - m] = True
    sk[m : h - m, m] = sk[m : h - m, w - 1 - m] = True
    sk = skeletonize(binary_dilation(sk, disk(1)))
    nb = neighbours(sk)
    jmask = nb >= 3
    jl, nj = ndi.label(jmask, structure=np.ones((3, 3)))
    reach = int(round(2.5 / MM_PER_PX))
    steps8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    cluster_px = ndi.find_objects(jl)
    t_count = y_count = other = 0
    corners = {}
    for j in range(1, nj + 1):
        sl = cluster_px[j - 1]
        ys, xs = np.nonzero(jl[sl] == j)
        ys = ys + sl[0].start
        xs = xs + sl[1].start
        cy, cx = ys.mean(), xs.mean()
        own = set(zip(ys.tolist(), xs.tolist()))
        # The branches leaving this junction: skeleton pixels touching it.
        seeds = set()
        for y, x in own:
            for dy, dx in steps8:
                q = (y + dy, x + dx)
                if 0 <= q[0] < h and 0 <= q[1] < w and sk[q] and q not in own and not jmask[q]:
                    seeds.add(q)
        groups = []
        for q in seeds:
            for g in groups:
                if any(abs(q[0] - r[0]) <= 1 and abs(q[1] - r[1]) <= 1 for r in g):
                    g.add(q)
                    break
            else:
                groups.append({q})
        dirs = []
        for g in groups:
            # Walk out along the branch, at most `reach` pixels, stopping at a junction.
            seen = set(g) | own
            front = list(g)
            far = front[0]
            for _ in range(reach):
                nxt = []
                for y, x in front:
                    for dy, dx in steps8:
                        q = (y + dy, x + dx)
                        if 0 <= q[0] < h and 0 <= q[1] < w and sk[q] and q not in seen and not jmask[q]:
                            seen.add(q)
                            nxt.append(q)
                if not nxt:
                    break
                front = nxt
                far = front[0]
            dirs.append(math.atan2(far[0] - cy, far[1] - cx))
        if len(dirs) < 3:
            continue
        dirs.sort()
        gaps = [((dirs[(i + 1) % len(dirs)] - dirs[i]) % (2 * math.pi)) for i in range(len(dirs))]
        gaps_deg = [math.degrees(g) for g in gaps]
        if len(dirs) == 3:
            if max(gaps_deg) >= 150:
                t_count += 1
            else:
                y_count += 1
        else:
            other += 1
        for i, g in enumerate(gaps):
            if math.degrees(g) >= 160:
                continue  # straight through: not a corner of the piece there
            mid = dirs[i] + g / 2
            for rr in (3, 4, 5, 6, 8):
                px = int(round(cx + rr * math.cos(mid)))
                py = int(round(cy + rr * math.sin(mid)))
                if 0 <= px < w and 0 <= py < h and lab[py, px] > 0:
                    corners[lab[py, px]] = corners.get(lab[py, px], 0) + 1
                    break
    # The pane's own corners are corners of the pieces in them.
    for px, py in ((m + 4, m + 4), (w - m - 5, m + 4), (m + 4, h - m - 5), (w - m - 5, h - m - 5)):
        if lab[py, px] > 0:
            corners[lab[py, px]] = corners.get(lab[py, px], 0) + 1
    labels = [k for k in np.unique(lab) if k > 0 and (lab == k).sum() >= 6]
    per_piece = [corners.get(k, 0) for k in labels]
    three = t_count + y_count
    return {
        "junctions_3": three,
        "t_share": float(t_count / three) if three else None,
        "junctions_4plus": other,
        "corners_per_piece_mean": float(np.mean(per_piece)) if per_piece else None,
        "corners_per_piece_median": float(np.median(per_piece)) if per_piece else None,
    }


def rings(ink, centre):
    """Share of crack ink running round the impact, in 10 mm bands."""
    a = (~ink).astype(float)
    g = ndi.gaussian_filter(1 - a, 1.0)
    gx = ndi.sobel(g, 1)
    gy = ndi.sobel(g, 0)
    jxx = ndi.gaussian_filter(gx * gx, 2.5)
    jyy = ndi.gaussian_filter(gy * gy, 2.5)
    jxy = ndi.gaussian_filter(gx * gy, 2.5)
    line = 0.5 * np.arctan2(2 * jxy, jxx - jyy) + np.pi / 2
    ys, xs = np.nonzero(ink)
    cx, cy = centre
    r = np.hypot(xs - cx, ys - cy) * MM_PER_PX
    phi = np.arctan2(ys - cy, xs - cx)
    radialness = np.abs(np.cos(line[ys, xs] - phi))
    out = {}
    for b in range(0, 100, 10):
        m = (r >= b) & (r < b + 10)
        if m.sum() >= 20:
            out[f"{b}-{b + 10}"] = float(np.mean(radialness[m] < 0.5))
    return out


def size_law(lab, centre):
    """
    Kadono & Arakawa (high-speed photography of impacted glass plates; cited by
    Mick West, "Shattering Reality", 2007): fragment size grows as a power of
    the distance from the impact. Here: the exponent of a fit of each piece's
    area (mm^2) against its centroid's distance (mm), over pieces of at least
    6 px, and how well it holds (r^2). Real impact breaks give an exponent
    well above 0 (pieces grow outward); a Voronoi-style break gives ~0.
    """
    cx, cy = centre
    ks = np.unique(lab)
    ks = ks[ks > 0]
    dist, area = [], []
    for k in ks:
        ys, xs = np.nonzero(lab == k)
        if len(xs) < 6:
            continue
        d = math.hypot(xs.mean() - cx, ys.mean() - cy) * MM_PER_PX
        if d < 1:
            continue
        dist.append(d)
        area.append(len(xs) * MM_PER_PX**2)
    if len(dist) < 4:
        return {"exponent": None, "r2": None, "n": len(dist)}
    x = np.log(np.array(dist))
    y = np.log(np.array(area))
    a, b = np.polyfit(x, y, 1)
    pred = a * x + b
    ss = float(np.sum((y - y.mean()) ** 2)) or 1e-9
    r2 = 1 - float(np.sum((y - pred) ** 2)) / ss
    return {"exponent": float(a), "r2": float(r2), "n": len(dist)}


def measure(ink, centre):
    lab, p = pieces(ink)
    return {
        "crossings": crossings(ink, centre),
        "pieces": p,
        "junctions": junctions(ink, lab),
        "tangential_share": rings(ink, centre),
        "size_law": size_law(lab, centre),
    }


# ---------------------------------------------------------------- a simulated break


def settings(root):
    s = {}
    for line in (root / "settings.txt").read_text().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            try:
                s[k] = float(v)
            except ValueError:
                s[k] = v
    return s


def load(root):
    rows = int((root / "points.txt").read_text().split("rows=")[1].split()[0])
    a = np.fromfile(root / "points.f32", dtype="<f4").reshape(rows, 8)
    return a


def pane_mm(s):
    return float(s.get("lx", PANE_MM / 1000)) * 1000


def face_rasters(a, s, res_mm):
    """Damage on the struck face, the back face and through the thickness, res_mm a pixel."""
    x, y, z, dmg = a[:, 0], a[:, 1], a[:, 2], a[:, 3]
    t, dx = s["t"], s["dx"]
    layer = np.round((z + t / 2 - dx / 2) / dx).astype(int)
    nl = layer.max() + 1
    half = pane_mm(s) / 2 / 1000
    n = int(round(pane_mm(s) / res_mm))
    g = (np.arange(n) + 0.5) * res_mm / 1000 - half
    gx, gy = np.meshgrid(g, g)
    out = {}
    stack = []
    for k in range(nl):
        m = layer == k
        r = griddata((x[m], y[m]), dmg[m], (gx, gy), method="linear", fill_value=0.0)
        stack.append(r[::-1])  # image rows run down, y runs up
    out["back"] = stack[0]
    out["struck"] = stack[-1]
    out["through"] = np.max(stack, axis=0)
    return out


def prune_spurs(sk, max_len):
    """Remove end branches shorter than max_len px: the stubs a ragged damage band
    leaves on a thinned line, which real cracks do not have at this scale."""
    sk = sk.copy()
    steps8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    h, w = sk.shape
    for _ in range(3):
        nb = neighbours(sk)
        ends = list(zip(*np.nonzero((nb == 1) & sk)))
        removed = 0
        for y, x in ends:
            path = [(y, x)]
            seen = {(y, x)}
            cy, cx = y, x
            ok = False
            while len(path) <= max_len:
                nxt = [(cy + dy, cx + dx) for dy, dx in steps8
                       if 0 <= cy + dy < h and 0 <= cx + dx < w and sk[cy + dy, cx + dx] and (cy + dy, cx + dx) not in seen]
                if len(nxt) != 1:
                    ok = len(nxt) > 1  # reached a junction: a spur to cut
                    break
                cy, cx = nxt[0]
                seen.add((cy, cx))
                if nb[cy, cx] >= 3:
                    ok = True
                    break
                path.append((cy, cx))
            if ok and len(path) <= max_len:
                for py, px in path:
                    sk[py, px] = False
                removed += 1
        if removed == 0:
            break
        sk = skeletonize(sk)
    return sk


def crack_lines(d, res_mm, threshold=0.3, min_area_mm2=4.0, spur_mm=3.0):
    band = d > threshold
    band = remove_small_objects(band, int(min_area_mm2 / res_mm**2))
    return band, prune_spurs(skeletonize(band), int(spur_mm / res_mm))


def arrival_raster(a, s, res_mm):
    x, y, tc = a[:, 0], a[:, 1], a[:, 4]
    m = tc > 0
    half = pane_mm(s) / 2 / 1000
    n = int(round(pane_mm(s) / res_mm))
    if not m.any():
        return np.zeros((n, n))
    g = (np.arange(n) + 0.5) * res_mm / 1000 - half
    gx, gy = np.meshgrid(g, g)
    r = griddata((x[m], y[m]), tc[m], (gx, gy), method="nearest")
    return r[::-1]


def to_pixels(xm, ym, res_mm, size_mm=PANE_MM):
    n = int(round(size_mm / res_mm))
    px = (xm * 1000 + size_mm / 2) / res_mm
    py = n - (ym * 1000 + size_mm / 2) / res_mm
    return px, py


def run_sim(name):
    root = HERE / "out" / name
    s = settings(root)
    a = load(root)
    hi = 0.2
    rasters = face_rasters(a, s, hi)
    lines = {k: crack_lines(v, hi) for k, v in rasters.items()}
    sk = lines["through"][1]

    # A tracing at the NIJ tracings' scale: lines about 0.6 mm wide, dark on white.
    wide = binary_dilation(sk, disk(1))
    side = int(round(pane_mm(s) / MM_PER_PX))
    small = np.asarray(Image.fromarray((wide * 255).astype(np.uint8)).resize((side, side), Image.BOX))
    ink = small > 60
    hx, hy = to_pixels(s["hit_x"], s["hit_y"], MM_PER_PX, pane_mm(s))
    stats = measure(ink, (hx, hy))
    stats["settings"] = {k: s[k] for k in ("speed", "hammer_mass", "hammer_r", "Gc", "weibull_m", "dx", "t", "support", "seed") if k in s}
    (root / "stats.json").write_text(json.dumps(stats, indent=1))
    Image.fromarray(np.where(ink, 0, 255).astype(np.uint8)).save(root / "tracing.png")

    # Display: tracing at 0.2 mm, the two faces, arrival time.
    n = sk.shape[0]
    tr = np.full((n, n), 255, np.uint8)
    tr[binary_dilation(sk, disk(1))] = 0
    Image.fromarray(tr).save(root / "tracing-hi.png")
    faces = np.full((n, n, 3), 255, np.uint8)
    b = binary_dilation(lines["back"][1], disk(1))
    f = binary_dilation(lines["struck"][1], disk(1))
    faces[b] = (40, 90, 220)
    faces[f] = (220, 60, 40)
    faces[b & f] = (20, 20, 20)
    Image.fromarray(faces).save(root / "faces.png")
    arr = arrival_raster(a, s, hi)
    t_on = arr[sk]
    lo, hi_t = (np.percentile(t_on, 2), np.percentile(t_on, 98)) if t_on.size else (0, 1)
    u = np.clip((arr - lo) / max(hi_t - lo, 1e-9), 0, 1)
    col = np.full((n, n, 3), 255, np.uint8)
    wide_sk = binary_dilation(sk, disk(1))
    # early cracks yellow, late ones purple
    rgb = np.stack([255 * (1 - 0.6 * u), 220 * (1 - u) + 30 * u, 40 + 180 * u], -1).astype(np.uint8)
    col[wide_sk] = rgb[wide_sk]
    Image.fromarray(col).save(root / "arrival.png")

    # How it grew: the cracks there by a quarter, a half, three quarters and all of the run.
    times = [float(x) for x in (root / "points.txt").read_text().split("times=")[1].split(",")]
    end = times[-1]
    band_final = rasters["through"] > 0.3
    frames = []
    for share in (0.25, 0.5, 0.75, 1.0):
        by = (arr > 0) & (arr <= share * end + 1e-9) & band_final
        by = remove_small_objects(by, int(4.0 / hi**2))
        f = np.full((n, n), 255, np.uint8)
        f[binary_dilation(skeletonize(by), disk(1))] = 0
        frames.append((share * end, Image.fromarray(f).resize((n // 2, n // 2), Image.LANCZOS)))
    strip = Image.new("L", (len(frames) * (n // 2 + 8), n // 2 + 30), 255)
    d = ImageDraw.Draw(strip)
    for k, (tt, im) in enumerate(frames):
        strip.paste(im, (k * (n // 2 + 8), 30))
        d.text((k * (n // 2 + 8) + 4, 8), f"{tt * 1e6:.0f} us", fill=0)
    strip.save(root / "growth.png")
    print(json.dumps(stats, indent=1))


# ---------------------------------------------------------------- the NIJ tracings

NIJ_SERIES = {
    0: "Drop weight, blunt tip",
    1: "Drop weight, round tip",
    2: "Drop weight, sharp tip",
    3: "Pressed in a frame, blunt tip",
    4: "Pressed in a frame, round tip",
    5: "Pressed in a frame, sharp tip",
}


def nij_ink(path):
    # The traced panel is the square pane; some scans are a few rows short.
    im = Image.open(path).convert("L").resize((TRACE_PX, TRACE_PX), Image.BILINEAR)
    ink = np.asarray(im).astype(float) < 140
    ink[:6, :] = ink[-6:, :] = False
    ink[:, :6] = ink[:, -6:] = False
    ink[-40:, :60] = False  # the pane's label in the corner
    return ink


def nij_centre(ink):
    d = ndi.gaussian_filter(ink.astype(float), 12)
    cy, cx = np.unravel_index(np.argmax(d), d.shape)
    return cx, cy


def run_nij(folder):
    files = sorted(Path(folder).glob("p-*.png"))
    by = {}
    for i, f in enumerate(files):
        ink = nij_ink(f)
        by.setdefault(NIJ_SERIES[i // 10], []).append(measure(ink, nij_centre(ink)))
    out = {}
    for series, runs in by.items():
        def med(get):
            v = [get(r) for r in runs]
            v = [x for x in v if x is not None]
            return (float(np.median(v)), float(min(v)), float(max(v))) if v else None
        out[series] = {
            "crossings": {r: med(lambda m, r=r: m["crossings"][r]) for r in RADII_MM},
            "pieces": med(lambda m: m["pieces"]["count"]),
            "area_median_mm2": med(lambda m: m["pieces"]["area_median_mm2"]),
            "largest_share": med(lambda m: m["pieces"]["largest_share"]),
            "aspect_median": med(lambda m: m["pieces"]["aspect_median"]),
            "t_share": med(lambda m: m["junctions"]["t_share"]),
            "corners_per_piece": med(lambda m: m["junctions"]["corners_per_piece_mean"]),
            "size_exponent": med(lambda m: m["size_law"]["exponent"]),
        }
    (HERE / "nij-stats.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


# ---------------------------------------------------------------- the comparison sheet


def run_sheet(name, folder, dest):
    root = HERE / "out" / name
    stats = json.loads((root / "stats.json").read_text())
    nij = json.loads((HERE / "nij-stats.json").read_text())["Drop weight, round tip"]
    cell = 300
    sheet = Image.new("RGB", (cell * 4 + 50, cell * 2 + 260), "white")
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
        bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 17)
    except OSError:
        font = bold = ImageFont.load_default()
    ours = Image.open(root / "tracing-hi.png").convert("RGB").resize((cell * 2, cell * 2), Image.LANCZOS)
    sheet.paste(ours, (10, 40))
    d.text((10, 12), "Simulated here (Peridynamics.jl): 203 mm pane, 965 g round tip", font=bold, fill="black")
    files = sorted(Path(folder).glob("p-*.png"))[10:20]
    for k, f in enumerate(files[:4]):
        im = Image.open(f).convert("RGB").resize((cell - 10, cell - 10), Image.LANCZOS)
        sheet.paste(im, (cell * 2 + 30 + (k % 2) * cell, 40 + (k // 2) * cell))
    d.text((cell * 2 + 30, 12), "Real panes, same test (NIJ 241445, hand traced)", font=bold, fill="black")
    y = cell * 2 + 60
    c = stats["crossings"]
    def rng(v):
        return "n/a" if v is None else f"{v[0]:.0f} ({v[1]:.0f}-{v[2]:.0f})"
    rows = [
        ("", "simulated", "real (median, range of 10)"),
        ("cracks crossed at 20 mm", str(c.get("20", c.get(20))), rng(nij["crossings"]["20"])),
        ("cracks crossed at 50 mm", str(c.get("50", c.get(50))), rng(nij["crossings"]["50"])),
        ("pieces", str(stats["pieces"]["count"]), rng(nij["pieces"])),
        ("largest piece, share of pane", f"{stats['pieces']['largest_share']:.0%}" if stats["pieces"]["largest_share"] else "n/a",
         "n/a" if not nij["largest_share"] else f"{nij['largest_share'][0]:.0%}"),
        ("T-junction share", "n/a" if stats["junctions"]["t_share"] is None else f"{stats['junctions']['t_share']:.0%}",
         "n/a" if not nij["t_share"] else f"{nij['t_share'][0]:.0%}"),
        ("corners per piece", "n/a" if stats["junctions"]["corners_per_piece_mean"] is None else f"{stats['junctions']['corners_per_piece_mean']:.1f}",
         "n/a" if not nij["corners_per_piece"] else f"{nij['corners_per_piece'][0]:.1f}"),
    ]
    for i, (a, b, cc) in enumerate(rows):
        f = bold if i == 0 else font
        d.text((10, y + i * 26), a, font=f, fill="black")
        d.text((330, y + i * 26), b, font=f, fill="black")
        d.text((520, y + i * 26), cc, font=f, fill="black")
    sheet.save(dest, quality=90)
    print("sheet", dest)


def run_sheet2(name, folder, refs, dest, series="Drop weight, round tip"):
    """The B0 sheet: the simulated break beside real panes and reference photographs, with the numbers."""
    root = HERE / "out" / name
    stats = json.loads((root / "stats.json").read_text())
    nij_all = json.loads((HERE / "nij-stats.json").read_text())
    nij = nij_all[series]
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
        bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 17)
    except OSError:
        font = bold = ImageFont.load_default()
    big = 520
    small = 300
    W = max(big * 2 + 40, 10 + 5 * (small - 4) + 10)
    sheet = Image.new("RGB", (W, big + small + 330), "white")
    d = ImageDraw.Draw(sheet)
    d.text((10, 10), f"Simulated here (Peridynamics.jl, {name}): crack lines through the pane, and their order of arrival", font=bold, fill="black")
    sheet.paste(Image.open(root / "tracing-hi.png").convert("RGB").resize((big, big), Image.LANCZOS), (10, 36))
    sheet.paste(Image.open(root / "arrival.png").convert("RGB").resize((big, big), Image.LANCZOS), (big + 30, 36))
    d.text((big + 30, big + 42), "yellow: first cracks; purple: last", font=font, fill="black")
    y2 = big + 72
    d.text((10, y2), "Real: two of the NIJ panes (same series as the numbers) and reference photographs", font=bold, fill="black")
    files = sorted(Path(folder).glob("p-*.png"))
    idx = {"Drop weight, blunt tip": 0, "Drop weight, round tip": 1, "Drop weight, sharp tip": 2,
           "Pressed in a frame, blunt tip": 3, "Pressed in a frame, round tip": 4, "Pressed in a frame, sharp tip": 5}[series]
    pics = [Image.open(f).convert("RGB") for f in files[idx * 10 : idx * 10 + 2]]
    for r in refs:
        pics.append(Image.open(r).convert("RGB"))
    x = 10
    for im in pics[:5]:
        im = im.copy()
        im.thumbnail((small - 10, small - 10))
        sheet.paste(im, (x, y2 + 26))
        x += small - 4
        if x + small > W:
            break
    y = y2 + 26 + small + 10
    c = stats["crossings"]
    def rng(v):
        return "n/a" if v is None else f"{v[0]:.0f} ({v[1]:.0f}-{v[2]:.0f})"
    def pct(v):
        return "n/a" if v is None else f"{v:.0%}"
    rows = [
        ("", "simulated", f"real ({series}; median, range of 10)"),
        ("cracks crossed at 20 mm", str(c.get("20")), rng(nij["crossings"]["20"])),
        ("cracks crossed at 50 mm", str(c.get("50")), rng(nij["crossings"]["50"])),
        ("pieces", str(stats["pieces"]["count"]), rng(nij["pieces"])),
        ("largest piece, share of pane", pct(stats["pieces"]["largest_share"]), pct(nij["largest_share"][0]) if nij["largest_share"] else "n/a"),
        ("T-junction share (real cracks stop against each other)", pct(stats["junctions"]["t_share"]), pct(nij["t_share"][0]) if nij["t_share"] else "n/a"),
        ("corners per piece (Voronoi tools give 6)", "n/a" if stats["junctions"]["corners_per_piece_mean"] is None else f"{stats['junctions']['corners_per_piece_mean']:.1f}", f"{nij['corners_per_piece'][0]:.1f}" if nij["corners_per_piece"] else "n/a"),
        ("fragment size vs distance, exponent (Kadono & Arakawa)", "n/a" if stats.get("size_law", {}).get("exponent") is None else f"{stats['size_law']['exponent']:.1f} (r2 {stats['size_law']['r2']:.2f}, {stats['size_law']['n']} pieces)", f"{nij['size_exponent'][0]:.1f} ({nij['size_exponent'][1]:.1f}-{nij['size_exponent'][2]:.1f})" if nij.get("size_exponent") else "n/a"),
    ]
    for i, (a, b, cc) in enumerate(rows):
        f = bold if i == 0 else font
        d.text((10, y + i * 24), a, font=f, fill="black")
        d.text((440, y + i * 24), b, font=f, fill="black")
        d.text((600, y + i * 24), cc, font=f, fill="black")
    sheet.save(dest, quality=90)
    print("sheet", dest)


# ---------------------------------------------------------------- the library entry


def skeleton_polylines(sk):
    """The thinned crack lines as polylines between junctions and ends (pixel coordinates)."""
    h, w = sk.shape
    nb = neighbours(sk)
    steps8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    special = (sk & ((nb >= 3) | (nb == 1)))
    jl, nj = ndi.label(sk & (nb >= 3), structure=np.ones((3, 3)))
    node_of = {}
    centres = {}
    for j in range(1, nj + 1):
        ys, xs = np.nonzero(jl == j)
        centres[j] = (xs.mean(), ys.mean())
        for y, x in zip(ys, xs):
            node_of[(y, x)] = j
    visited = np.zeros_like(sk, bool)
    lines = []
    starts = list(zip(*np.nonzero(special)))
    for y0, x0 in starts:
        for dy, dx in steps8:
            y, x = y0 + dy, x0 + dx
            if not (0 <= y < h and 0 <= x < w) or not sk[y, x] or special[y, x] or visited[y, x]:
                continue
            path = [(x0, y0)] if (y0, x0) not in node_of else [centres[node_of[(y0, x0)]]]
            cy, cx = y, x
            prev = (y0, x0)
            end = None
            while True:
                visited[cy, cx] = True
                path.append((cx, cy))
                nxt = [(cy + a, cx + b) for a, b in steps8
                       if 0 <= cy + a < h and 0 <= cx + b < w and sk[cy + a, cx + b] and (cy + a, cx + b) != prev]
                nxt = [q for q in nxt if not visited[q] or special[q]]
                ends = [q for q in nxt if special[q]]
                if ends:
                    end = ends[0]
                    break
                nxt = [q for q in nxt if not visited[q]]
                if not nxt:
                    break
                prev = (cy, cx)
                cy, cx = nxt[0]
            if end is not None:
                path.append(centres[node_of[end]] if end in node_of else (end[1], end[0]))
            if len(path) >= 3:
                lines.append(path)
    return lines


def run_library(name, dest):
    """Write the break as a library entry: crack polylines in mm with arrival times, for the site."""
    root = HERE / "out" / name
    s = settings(root)
    a = load(root)
    res = 0.2
    rasters = face_rasters(a, s, res)
    band, sk = crack_lines(rasters["through"], res)
    _, sk_struck = crack_lines(rasters["struck"], res)
    _, sk_back = crack_lines(rasters["back"], res)
    arr = arrival_raster(a, s, res)
    size = pane_mm(s)
    n = sk.shape[0]
    lines = skeleton_polylines(sk)
    struck_wide = binary_dilation(sk_struck, disk(3))
    back_wide = binary_dilation(sk_back, disk(3))
    cracks = []
    for path in lines:
        pts = []
        ts = []
        on_struck = on_back = 0
        for x, y in path:
            xi, yi = int(round(x)), int(round(y))
            xi = min(max(xi, 0), n - 1)
            yi = min(max(yi, 0), n - 1)
            pts.append([round(x * res - size / 2, 2), round(size / 2 - y * res, 2)])
            ts.append(round(float(arr[yi, xi]) * 1e6, 1))
            on_struck += struck_wide[yi, xi]
            on_back += back_wide[yi, xi]
        # Thin the polyline: keep every 4th point plus the ends (0.8 mm steps).
        keep = list(range(0, len(pts), 4))
        if keep[-1] != len(pts) - 1:
            keep.append(len(pts) - 1)
        face = "both" if on_struck > 0.5 * len(path) and on_back > 0.5 * len(path) else ("struck" if on_struck >= on_back else "back")
        cracks.append({"pts": [pts[k] for k in keep], "t": [ts[k] for k in keep], "face": face})
    cracks.sort(key=lambda c: min(t for t in c["t"] if t > 0) if any(t > 0 for t in c["t"]) else 1e9)
    entry = {
        "format": "onysnow-break-1",
        "source": name,
        "pane_mm": [size, size],
        "thickness_mm": s["t"] * 1000,
        "impact_mm": [s["hit_x"] * 1000, s["hit_y"] * 1000],
        "impactor": {"speed": s.get("speed"), "mass_kg": s.get("hammer_mass"), "radius_mm": (s.get("hammer_r") or 0) * 1000},
        "support": s.get("support"),
        "edge_mm": round(((s.get("frame_w") or 0) + (s.get("gasket_w") or 0)) * 1000, 2) if s.get("support") == "frame" else 0.0,
        "crush_mm": float(np.hypot(*np.argwhere(rasters["through"] > 0.9).mean(0)[::-1] * 0)) if False else None,
        "cracks": cracks,
    }
    if s.get("impactor") == "ram":
        # A press: the glass under the ram's tip is the crushed zone, and there is no blow.
        entry["impactor"] = {"ram_speed": s.get("ram_speed"), "radius_mm": (s.get("ram_r") or 0) * 1000}
        entry["crush_mm"] = (s.get("ram_r") or 0) * 1000
    else:
        # The crushed zone: the radius round the impact where the damage band is solid.
        yy, xx = np.nonzero(rasters["through"] > 0.6)
        if len(xx):
            cx, cy = to_pixels(s["hit_x"], s["hit_y"], res, size)
            r = np.hypot(xx - cx, yy - cy) * res
            entry["crush_mm"] = float(np.percentile(r, 20)) if len(r) > 50 else 0.0
    Path(dest).write_text(json.dumps(entry, separators=(",", ":")))
    print("library entry", dest, len(cracks), "cracks,", sum(len(c["pts"]) for c in cracks), "points,", Path(dest).stat().st_size, "bytes")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "sim":
        run_sim(sys.argv[2])
    elif cmd == "nij":
        run_nij(sys.argv[2])
    elif cmd == "sheet":
        run_sheet(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "library":
        run_library(sys.argv[2], sys.argv[3])
    elif cmd == "sheet2":
        # sheet2 <name> <nij dir> <out.jpg> [ref images...]
        run_sheet2(sys.argv[2], sys.argv[3], sys.argv[6:], sys.argv[4]) if len(sys.argv) > 6 else run_sheet2(sys.argv[2], sys.argv[3], [], sys.argv[4])
    else:
        sys.exit(__doc__)
