"""
Geometric/wave optics checks for a crack through a glass slab.
All numbers in the report marked (computed) come from this script.

Coordinates: slab z in [0,t]; front face z=0 faces the viewer (z<0); back face z=t.
Photo plane at z=t+g. Crack plane through (x=0,z=0) with lean beta from the slab normal:
plane x = z*tan(beta); unit normal nc = (cos b, 0, -sin b).
Viewer / lamp directions are given as the AIR direction of travel (into the pane).
"""
import numpy as np

N = 1.52          # float glass (engine uses 1.518; difference is negligible here)
TC = np.degrees(np.arcsin(1 / N))

def fresnel_unpol(cos_i, n1, n2):
    """Unpolarised Fresnel reflectance, handles TIR (returns 1)."""
    cos_i = abs(cos_i)
    sin_i = np.sqrt(max(0.0, 1 - cos_i**2))
    sin_t = n1 / n2 * sin_i
    if sin_t >= 1:
        return 1.0
    cos_t = np.sqrt(1 - sin_t**2)
    rs = (n1 * cos_i - n2 * cos_t) / (n1 * cos_i + n2 * cos_t)
    rp = (n2 * cos_i - n1 * cos_t) / (n2 * cos_i + n1 * cos_t)
    return 0.5 * (rs * rs + rp * rp)

def refract(d, nrm, n1, n2):
    """Refract unit dir d through interface with unit normal nrm (any orientation)."""
    if np.dot(d, nrm) > 0:
        nrm = -nrm
    eta = n1 / n2
    ci = -np.dot(d, nrm)
    k = 1 - eta**2 * (1 - ci**2)
    if k < 0:
        return None
    return eta * d + (eta * ci - np.sqrt(k)) * nrm

def reflect(d, nrm):
    return d - 2 * np.dot(d, nrm) * nrm

def section(title):
    print("\n" + "=" * 78 + "\n" + title + "\n" + "=" * 78)

# ---------------------------------------------------------------------------
section("A. Basic numbers")
print(f"critical angle glass->air, n={N}: {TC:.2f} deg")
for n in (1.518, 1.52, 1.523):
    print(f"  n={n}: theta_c={np.degrees(np.arcsin(1/n)):.2f} deg, R(normal)={((n-1)/(n+1))**2*100:.2f}%")
print("Internal (glass->air) unpolarised reflectance vs angle of incidence:")
for a in (0, 10, 20, 30, 35, 38, 40, 41, 41.1):
    print(f"  {a:5.1f} deg: R = {fresnel_unpol(np.cos(np.radians(a)), N, 1.0)*100:6.2f}%")
print("External (air->glass) unpolarised reflectance vs angle of incidence:")
for a in (0, 30, 45, 60, 70, 80, 85, 89):
    print(f"  {a:5.1f} deg: R = {fresnel_unpol(np.cos(np.radians(a)), 1.0, N)*100:6.2f}%")

# A view ray that enters through the front face travels inside within theta_c of +z.
# Angle of incidence on a crack plane with lean beta (normal tilted beta from in-plane):
print("\nMinimum angle of incidence on a crack face for ANY ray entering through the front face")
print("(ray within theta_c of +z; face normal tilted beta out of the pane plane):")
for b in (0, 10, 20, 30, 40, 48.9, 50, 60, 65, 70):
    # worst case: ray tilted toward the face normal by theta_c, in the plane of the normal
    # angle between ray and face normal >= (90 - beta) - theta_c  (geometry in the x-z plane)
    amin = max(0.0, (90 - b) - TC)
    print(f"  lean {b:5.1f} deg: min incidence {amin:5.1f} deg -> {'ALWAYS TIR' if amin > TC else 'partial possible'}")

# ---------------------------------------------------------------------------
section("B. What a view ray sees in the crack band (t = 18 px, polished back face assumed for the exit test)")
t = 18.0   # px, pane thickness on screen
g = 6.0    # px, gap to the photo (example)

def trace_view(theta_v_deg, beta_deg, xe):
    """Trace one view ray entering the front face at x=xe. Returns dict or None if it misses the crack."""
    tv = np.radians(theta_v_deg); b = np.radians(beta_deg)
    d_air = np.array([np.sin(tv), 0.0, np.cos(tv)])
    d = refract(d_air, np.array([0, 0, 1.0]), 1.0, N)
    nc = np.array([np.cos(b), 0.0, -np.sin(b)])
    # intersect ray p = (xe,0,0) + s d with plane nc.(p) = 0   (plane through origin)
    denom = np.dot(nc, d)
    if abs(denom) < 1e-12:
        return None
    s = -np.dot(nc, np.array([xe, 0, 0])) / denom
    if s <= 0:
        return None
    p = np.array([xe, 0, 0]) + s * d
    if not (0 < p[2] < t):
        return None
    cos_a = abs(np.dot(d, nc))
    alpha = np.degrees(np.arccos(cos_a))
    R1 = fresnel_unpol(cos_a, N, 1.0)
    tir = R1 >= 1.0
    dr = reflect(d, nc)
    out = {"alpha": alpha, "tir": tir, "R1": R1, "zhit": p[2]}
    # where does the reflected ray go?
    if dr[2] > 0:
        th = np.degrees(np.arccos(dr[2]))
        zleft = t - p[2]
        xb = p[0] + dr[0] / dr[2] * zleft
        if th < TC:
            dout = refract(dr, np.array([0, 0, 1.0]), N, 1.0)
            xph = xb + dout[0] / dout[2] * g
            # unbroken reference sample
            x_unb = xe + d[0] / d[2] * t + d_air[0] / d_air[2] * g
            out.update(kind="back->photo", exit_air_deg=np.degrees(np.arccos(dout[2])) * np.sign(dout[0]),
                       dx_photo=xph - x_unb, mirror_ref=-x_unb, xph=xph)
        else:
            out.update(kind="trapped(back TIR)", inglass_deg=th)
    else:
        th = np.degrees(np.arccos(-dr[2]))
        if th < TC:
            dout = refract(dr, np.array([0, 0, 1.0]), N, 1.0)
            out.update(kind="front->room", exit_air_deg=np.degrees(np.arccos(-dout[2])) * np.sign(dout[0]))
        else:
            out.update(kind="trapped(front TIR)", inglass_deg=th)
    return out

def band(theta_v, beta, n=4001):
    xs = np.linspace(-3 * t, 3 * t, n)
    hits = [(x, trace_view(theta_v, beta, x)) for x in xs]
    hits = [(x, h) for x, h in hits if h is not None]
    if not hits:
        return None
    x0, x1 = hits[0][0], hits[-1][0]
    return x0, x1, hits

print("Columns: view angle in air | lean beta | band [x0,x1] at the front face (px) | width |"
      " incidence on face | outcome")
for tv in (0, 10, 20, 30, 45):
    for b in (-30, -15, 0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 65):
        r = band(tv, b)
        if r is None:
            print(f"  view {tv:2d}  lean {b:4d}: no band (ray parallel/never meets face inside slab)")
            continue
        x0, x1, hits = r
        mid = hits[len(hits) // 2][1]
        kinds = {}
        for _, h in hits:
            kinds[h["kind"]] = kinds.get(h["kind"], 0) + 1
        frac = {k: v / len(hits) for k, v in kinds.items()}
        tirfrac = sum(1 for _, h in hits if h["tir"]) / len(hits)
        extra = ""
        if mid["kind"] == "back->photo":
            extra = f"exit {mid['exit_air_deg']:+6.1f} deg, photo sample moved {mid['dx_photo']:+6.1f} px"
        elif "trapped" in mid["kind"]:
            extra = f"in-glass angle {mid['inglass_deg']:.1f} deg"
        elif mid["kind"] == "front->room":
            extra = f"leaves front at {mid['exit_air_deg']:+.1f} deg"
        fr = ", ".join(f"{k} {v*100:.0f}%" for k, v in frac.items())
        print(f"  view {tv:2d}  lean {b:4d}: band [{x0:6.2f},{x1:6.2f}] w={x1-x0:5.2f}px  alpha_mid={mid['alpha']:5.1f}"
              f"  TIR {tirfrac*100:3.0f}%  | {fr} | mid: {extra}")

# ---------------------------------------------------------------------------
section("C. The fold: photo samples seen through a vertical crack (beta=0), view 30 deg")
tv = 30
for xe in np.linspace(-7, 0.5, 9):
    h = trace_view(tv, 0, xe)
    tvr = np.radians(tv); ti = np.arcsin(np.sin(tvr) / N)
    x_unb = xe + np.tan(ti) * t + np.tan(tvr) * g
    if h is None:
        print(f"  enter x={xe:6.2f}: misses crack, photo sample x={x_unb:6.2f}")
    else:
        print(f"  enter x={xe:6.2f}: TIR={h['tir']}, photo sample x={h['xph']:6.2f}  (unbroken would be {x_unb:6.2f}; mirror of it = {-x_unb:6.2f})")
print(f"  band width t*tan(theta_in) = {t*np.tan(np.arcsin(np.sin(np.radians(30))/N)):.2f} px; "
      f"hidden photo strip starts at x = g*tan(theta_v) = {g*np.tan(np.radians(30)):.2f} px")

# ---------------------------------------------------------------------------
section("D. Light reaching the photo under a crack (directional lamp, polished back face)")

def floor_profile(theta_l_deg, beta_deg, gap=g, nrays=200001, xr=(-40, 40), nb=160):
    tl = np.radians(theta_l_deg); b = np.radians(beta_deg)
    d_air = np.array([np.sin(tl), 0.0, np.cos(tl)])
    zn = np.array([0, 0, 1.0])
    d = refract(d_air, zn, 1.0, N)
    T_front = 1 - fresnel_unpol(np.cos(tl), 1.0, N)
    nc = np.array([np.cos(b), 0.0, -np.sin(b)])
    xs = np.linspace(xr[0] - 60, xr[1] + 60, nrays)
    bins = np.zeros(nb); edges = np.linspace(xr[0], xr[1], nb + 1)
    ref = np.zeros(nb)
    trapped = 0.0; total = 0.0
    for xe in xs:
        w = T_front
        total += w
        p = np.array([xe, 0, 0.0]); dd = d.copy()
        # reference (no crack)
        xb = xe + dd[0] / dd[2] * t
        dout = refract(dd, zn, N, 1.0)
        wref = w * (1 - fresnel_unpol(dd[2], N, 1.0))
        xph = xb + dout[0] / dout[2] * gap
        k = np.searchsorted(edges, xph) - 1
        if 0 <= k < nb: ref[k] += wref
        # with crack
        denom = np.dot(nc, dd)
        s = -np.dot(nc, p) / denom if abs(denom) > 1e-12 else -1
        paths = []
        if s > 0 and 0 < (p + s * dd)[2] < t:
            ph = p + s * dd
            ca = abs(np.dot(dd, nc))
            R1 = fresnel_unpol(ca, N, 1.0)
            Rtot = 1.0 if R1 >= 1 else 2 * R1 / (1 + R1)   # two faces, incoherent, parallel gap
            paths.append((ph, reflect(dd, nc), w * Rtot))
            if Rtot < 1:
                paths.append((ph, dd, w * (1 - Rtot)))
        else:
            paths.append((p, dd, w))
        for (q, dq, wq) in paths:
            if dq[2] <= 0:
                th = np.degrees(np.arccos(-dq[2]))
                trapped += wq if th >= TC else 0  # (light leaving the front is lost upward; count as not reaching photo)
                continue
            th = np.degrees(np.arccos(dq[2]))
            if th >= TC:
                trapped += wq
                continue
            xb = q[0] + dq[0] / dq[2] * (t - q[2])
            do = refract(dq, zn, N, 1.0)
            wq2 = wq * (1 - fresnel_unpol(dq[2], N, 1.0))
            xph = xb + do[0] / do[2] * gap
            k = np.searchsorted(edges, xph) - 1
            if 0 <= k < nb: bins[k] += wq2
    rel = np.where(ref > 0, bins / np.maximum(ref, 1e-12), 0)
    centers = 0.5 * (edges[1:] + edges[:-1])
    return centers, rel, trapped / total

for tl in (20, 45):
    for b in (0, 10, 20, 30):
        c, rel, trp = floor_profile(tl, b, nrays=40001)
        dark = c[rel < 0.5]; bright = c[rel > 1.5]
        print(f"  lamp {tl:2d} deg, lean {b:2d}: trapped/lost {trp*100:4.1f}%  "
              f"dark(<0.5x) {('[%.1f,%.1f]' % (dark.min(), dark.max())) if dark.size else '-':>14}  "
              f"bright(>1.5x) {('[%.1f,%.1f]' % (bright.min(), bright.max())) if bright.size else '-':>14}  "
              f"peak {rel.max():.2f}x  min {rel[(c>-30)&(c<30)].min():.2f}x")
tl = 45
ti = np.degrees(np.arcsin(np.sin(np.radians(tl)) / N))
print(f"  check (lean 0, lamp {tl}): band width t*tan(theta_in) = {t*np.tan(np.radians(ti)):.2f} px, "
      f"shift g*tan(theta_l) = {g*np.tan(np.radians(tl)):.2f} px")

# ---------------------------------------------------------------------------
section("E. Air gap between two glass faces: thin-film colour and frustrated TIR")

def gap_R(d_nm, lam_nm, theta_glass_deg, n=N):
    """Reflectance of glass|air(d)|glass, s and p averaged, coherent (Airy, complex for FTIR)."""
    th1 = np.radians(theta_glass_deg)
    c1 = np.cos(th1)
    s2 = n * np.sin(th1)                     # sin in air (may exceed 1)
    c2 = np.sqrt(complex(1 - s2**2))         # complex beyond critical
    if c2.imag < 0: c2 = -c2
    delta = 2 * np.pi / lam_nm * d_nm * c2   # phase thickness of air layer
    out = []
    for pol in ("s", "p"):
        if pol == "s":
            r12 = (n * c1 - c2) / (n * c1 + c2)
        else:
            r12 = (c1 - n * c2) / (c1 + n * c2)
        r23 = -r12
        e = np.exp(2j * delta)
        r = (r12 + r23 * e) / (1 + r12 * r23 * e)
        out.append(abs(r) ** 2)
    return 0.5 * (out[0] + out[1])

print("Reflectance of a crack's air film at normal incidence (lambda = 550 nm):")
for dn in (0, 10, 25, 50, 69, 100, 138, 200, 275, 412, 550, 1000):
    print(f"  gap {dn:5d} nm: R = {gap_R(dn, 550, 0)*100:6.2f}%")
print(f"  incoherent thick-gap limit 2R/(1+R) = {2*0.0426/(1.0426)*100:.2f}%")

print("\nFrustrated TIR: reflectance of the gap for light inside the glass beyond the critical angle (550 nm):")
for th in (45, 50, 60, 70, 80):
    row = []
    for dn in (10, 25, 50, 100, 200, 300, 500, 1000):
        row.append(f"{gap_R(dn, 550, th)*100:5.1f}")
    print(f"  {th} deg: " + "  ".join(f"d={d}:{v}%" for d, v in zip((10, 25, 50, 100, 200, 300, 500, 1000), row)))

# CIE 1931 2deg CMF, analytic multi-lobe fit (Wyman, Sloan, Shirley 2013, JCGT 2(2))
def g_(x, mu, s1, s2):
    s = np.where(x < mu, s1, s2)
    return np.exp(-0.5 * ((x - mu) / s) ** 2)
def cmf(l):
    x = 1.056 * g_(l, 599.8, 37.9, 31.0) + 0.362 * g_(l, 442.0, 16.0, 26.7) - 0.065 * g_(l, 501.1, 20.4, 26.2)
    y = 0.821 * g_(l, 568.8, 46.9, 40.5) + 0.286 * g_(l, 530.9, 16.3, 31.1)
    z = 1.217 * g_(l, 437.0, 11.8, 36.0) + 0.681 * g_(l, 459.0, 26.0, 13.8)
    return x, y, z
def planck(l_nm, T=6504.0):
    l = l_nm * 1e-9; h = 6.626e-34; c = 2.998e8; k = 1.381e-23
    return 1 / (l**5 * (np.exp(h * c / (l * k * T)) - 1))
lams = np.arange(380, 781, 5.0)
X, Y, Z = cmf(lams); S = planck(lams); S = S / S.max()
M = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
Yw = np.sum(S * Y)
def film_rgb(dn, th=0.0):
    R = np.array([gap_R(dn, l, th) for l in lams])
    xyz = np.array([np.sum(S * R * X), np.sum(S * R * Y), np.sum(S * R * Z)]) / Yw
    return M @ xyz, xyz[1]
print("\nColour of the reflection from a crack film (illuminant ~6500K blackbody, normal incidence).")
print("Linear sRGB normalised to the film's own max channel, plus luminance Y (white = 1.0):")
for dn in (0, 20, 50, 80, 100, 120, 150, 180, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1500, 3000):
    rgb, yv = film_rgb(dn)
    rgbn = np.clip(rgb, 0, None); rgbn = rgbn / max(rgbn.max(), 1e-9)
    print(f"  {dn:5d} nm: Y={yv*100:5.2f}%  rgb(norm)=({rgbn[0]:.2f},{rgbn[1]:.2f},{rgbn[2]:.2f})")

# ---------------------------------------------------------------------------
section("F. Guided light meeting a vertical crack (isotropic over guided directions)")
rng = np.random.default_rng(1)
v = rng.normal(size=(400000, 3)); v /= np.linalg.norm(v, axis=1)[:, None]
cz = np.cos(np.radians(TC))
guided = v[np.abs(v[:, 2]) < cz]
# flux weighting toward the crack: |dx| (projected area)
dx = np.abs(guided[:, 0])
w = dx / dx.sum()
Rt = np.array([fresnel_unpol(c, N, 1.0) for c in dx])
Rtot = np.where(Rt >= 1, 1.0, 2 * Rt / (1 + Rt))
print(f"  guided directions = |cos(angle to z)| < {cz:.3f}")
print(f"  flux-weighted fraction transmitted through an open vertical crack: {np.sum(w*(1-Rtot))*100:.1f}%")
print(f"  flux-weighted fraction reflected back (TIR or Fresnel): {np.sum(w*Rtot)*100:.1f}%")

# ---------------------------------------------------------------------------
section("G. Specular loss from fracture-surface roughness (Davies/Bennett, internal side, n=1.52)")
for sig in (1, 10, 50, 100, 200, 500):
    row = []
    for a in (0, 45, 60, 75, 85):
        q = 4 * np.pi * N * sig * np.cos(np.radians(a)) / 550
        row.append(np.exp(-q * q))
    print(f"  sigma {sig:4d} nm: specular kept at incidence 0/45/60/75/85 deg = " + " / ".join(f"{r:.2f}" for r in row))

# ---------------------------------------------------------------------------
section("H. Dispersion")
def n_rubin(lum):  # Rubin 1985 clear soda-lime, lambda in micrometres (refractiveindex.info formula)
    return 1.5130 - 0.003169 * lum**2 + 0.003962 / lum**2
nF, nd, nC = n_rubin(0.4861), n_rubin(0.5876), n_rubin(0.6563)
print(f"  Rubin 1985 formula: nF={nF:.4f} nd={nd:.4f} nC={nC:.4f} nF-nC={nF-nC:.4f} Abbe={((nd-1)/(nF-nC)):.1f}")
print(f"  Wikipedia container soda-lime: nD=1.518, nF-nC=0.00867, Abbe={(0.518/0.00867):.1f}")
for nm, nn in (("F 486", nF), ("d 588", nd), ("C 656", nC)):
    print(f"  critical angle {nm}: {np.degrees(np.arcsin(1/nn)):.3f} deg")
for A in (30, 60, 90):
    # minimum deviation of a prism of apex A (if it exists), and dispersion F-C
    def dev(n, A=A):
        a = np.radians(A)
        s = n * np.sin(a / 2)
        return np.degrees(2 * np.arcsin(s) - a) if s < 1 else np.nan
    print(f"  prism apex {A:2d} deg: min deviation {dev(nd):5.1f} deg, F-C spread {dev(nF)-dev(nC):.2f} deg")

# ---------------------------------------------------------------------------
section("I. Tilt of a piece: reflection and transmission")
for tau in (0.1, 0.25, 0.5, 1, 2, 4):
    tr = np.radians(tau)
    shift = t * tr * (1 - 1 / N)
    print(f"  tilt {tau:4.2f} deg: reflected ray turns {2*tau:4.2f} deg; transmitted image shift {shift:.3f} px (t=18px)")
# viewing distance example: viewer 0.6 m from a 96-dpi screen, room reflection 'at infinity'
px_per_deg = 0.6 * np.tan(np.radians(1)) / 0.000264583
print(f"  at 0.6 m from a 96-dpi screen 1 deg of view = {px_per_deg:.0f} CSS px; so a 0.5 deg tilt moves a distant reflection ~{px_per_deg:.0f} px")
for h in (50, 100, 200, 400):
    print(f"  lamp {h} px above the pane: a {1} deg tilt moves the lamp's highlight ~{2*np.radians(1)*h:.1f} px")

# ---------------------------------------------------------------------------
section("J. Laminated: doubled crack lines (two plies)")
for tv in (0, 15, 30, 45):
    ti = np.arcsin(np.sin(np.radians(tv)) / N)
    for sep_mm in (2.5, 3.3):   # centre-to-centre distance between crack lines in plies ~ ply + interlayer
        print(f"  view {tv:2d} deg, crack-line depth difference {sep_mm} mm: apparent offset {sep_mm*np.tan(ti):.2f} mm")
print("  glass/PVB reflectance (1.52 vs 1.488):", f"{((1.52-1.488)/(1.52+1.488))**2*100:.4f}%")
