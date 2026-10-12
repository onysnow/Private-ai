"""Extra checks: oblique thin-film colours, FTIR colour, two-bounce 'corner' glint geometry,
partial transmission through shallow faces, and TIR+exit impossibility check."""
import numpy as np
exec(open('crack_optics.py').read().split('# ---------------------------------------------------------------------------\nsection("A.')[0])
N = 1.52; TC = np.degrees(np.arcsin(1/N))

def section(t):
    print("\n" + "=" * 78 + "\n" + t + "\n" + "=" * 78)

# re-declare gap_R and colour helpers (copied from crack_optics.py)
def gap_R(d_nm, lam_nm, theta_glass_deg, n=N):
    th1 = np.radians(theta_glass_deg); c1 = np.cos(th1)
    s2 = n * np.sin(th1); c2 = np.sqrt(complex(1 - s2**2))
    if c2.imag < 0: c2 = -c2
    delta = 2 * np.pi / lam_nm * d_nm * c2
    out = []
    for pol in ("s", "p"):
        r12 = (n*c1 - c2)/(n*c1 + c2) if pol == "s" else (c1 - n*c2)/(c1 + n*c2)
        e = np.exp(2j*delta); r = (r12 - r12*e)/(1 - r12*r12*e)
        out.append(abs(r)**2)
    return 0.5*(out[0]+out[1])

def g_(x, mu, s1, s2):
    s = np.where(x < mu, s1, s2); return np.exp(-0.5*((x-mu)/s)**2)
def cmf(l):
    x = 1.056*g_(l,599.8,37.9,31.0)+0.362*g_(l,442.0,16.0,26.7)-0.065*g_(l,501.1,20.4,26.2)
    y = 0.821*g_(l,568.8,46.9,40.5)+0.286*g_(l,530.9,16.3,31.1)
    z = 1.217*g_(l,437.0,11.8,36.0)+0.681*g_(l,459.0,26.0,13.8)
    return x, y, z
def planck(l_nm, T=6504.0):
    l = l_nm*1e-9; h=6.626e-34; c=2.998e8; k=1.381e-23
    return 1/(l**5*(np.exp(h*c/(l*k*T))-1))
lams = np.arange(380, 781, 5.0); X, Y, Z = cmf(lams); S = planck(lams); S /= S.max()
M = np.array([[3.2406,-1.5372,-0.4986],[-0.9689,1.8758,0.0415],[0.0557,-0.2040,1.0570]])
Yw = np.sum(S*Y)
def film(dn, th):
    R = np.array([gap_R(dn, l, th) for l in lams])
    xyz = np.array([np.sum(S*R*X), np.sum(S*R*Y), np.sum(S*R*Z)])/Yw
    rgb = M @ xyz
    return rgb, xyz[1]

section("K1. Film colour at oblique incidence inside the glass (gap 300 nm, 'deep blue' at normal)")
for th in (0, 10, 20, 30, 35, 40, 41, 45, 60):
    rgb, y = film(300, th)
    r = np.clip(rgb, 0, None); r = r / max(r.max(), 1e-9)
    print(f"  in-glass incidence {th:2d} deg: Y={y*100:6.2f}%  rgb(norm)=({r[0]:.2f},{r[1]:.2f},{r[2]:.2f})")

section("K2. FTIR is slightly colour-selective (gap reflectance at 450/550/650 nm, in-glass 60 deg)")
for dn in (50, 100, 150, 200, 300):
    print(f"  gap {dn:3d} nm: R450={gap_R(dn,450,60)*100:5.1f}%  R550={gap_R(dn,550,60)*100:5.1f}%  R650={gap_R(dn,650,60)*100:5.1f}%")

section("K3. Shallow face (lean > 49 deg) seen from the front: how much of the view goes THROUGH the gap")
for beta in (50, 55, 60, 65, 70, 80):
    a = 90 - beta   # normal view: incidence on face
    c = np.cos(np.radians(a))
    # single-face Fresnel glass->air
    sin_t = N*np.sin(np.radians(a))
    if sin_t >= 1:
        print(f"  lean {beta}: TIR"); continue
    ct = np.sqrt(1-sin_t**2)
    rs = (N*c-ct)/(N*c+ct); rp = (c-N*ct)/(c+N*ct); R1 = 0.5*(rs*rs+rp*rp)
    Rtot = 2*R1/(1+R1)
    print(f"  lean {beta}: incidence {a:4.1f} deg, one face R={R1*100:5.2f}%, both faces (incoherent) R={Rtot*100:5.2f}%, through={100-Rtot*100:5.1f}%")

section("K4. Exhaustive check: can a ray entering the front face be TIR'd by ONE crack face and leave the front face?")
rng = np.random.default_rng(3)
found = 0; tested = 0
for _ in range(200000):
    # random in-glass direction within theta_c of +z
    ct = np.cos(np.radians(TC)); cz = rng.uniform(ct, 1.0); ph = rng.uniform(0, 2*np.pi)
    sz = np.sqrt(1-cz*cz); d = np.array([sz*np.cos(ph), sz*np.sin(ph), cz])
    # random face normal (any orientation)
    nrm = rng.normal(size=3); nrm /= np.linalg.norm(nrm)
    ca = abs(d @ nrm)
    if np.degrees(np.arccos(ca)) <= TC: continue   # not TIR
    tested += 1
    dr = d - 2*(d@nrm)*nrm
    if dr[2] < 0 and np.degrees(np.arccos(-dr[2])) < TC:
        found += 1
print(f"  TIR reflections tested: {tested}; of these, exiting the front face: {found}")

section("K5. Two-bounce corner path (vertical crack face + back-face reflection): where does the lamp glint?")
# lamp at height h in front of the pane at (0,0,-h); eye at (0,0,-D). Crack: vertical plane x = xc, along y.
# Two-bounce output direction in air for travel direction L=(Lx,Ly,Lz): (-Lx, Ly, -Lz).
h, D = 150.0, 2270.0
def glint_error(xc, y):
    P = np.array([xc, y, 0.0]); lamp = np.array([0, 0, -h]); eye = np.array([0, 0, -D])
    L = (P - lamp); L /= np.linalg.norm(L)
    out = np.array([-L[0], L[1], -L[2]])
    e = (eye - P); e /= np.linalg.norm(e)
    return np.degrees(np.arccos(np.clip(out @ e, -1, 1)))
for xc in (0, 10, 25, 50, 100):
    errs = [(y, glint_error(xc, y)) for y in np.linspace(-200, 200, 401)]
    ymin, emin = min(errs, key=lambda t: t[1])
    print(f"  crack {xc:3d} px from the lamp foot: best angular mismatch {emin:5.2f} deg at y={ymin:+.0f} px")
print("  (a glint is seen where the mismatch is smaller than the combined lobe: lamp angular radius + frost/hackle spread)")

section("K6. Same for a single partial reflection off a SHALLOW face (cone wall, 25 deg to the surface)")
# face normal tilted 65 deg from in-plane, i.e. 25 deg from the pane normal; one Fresnel bounce, ray must exit front.
def shallow_glint(xc, y, beta=65.0, az=0.0):
    b = np.radians(beta)
    nrm = np.array([np.cos(b)*np.cos(az), np.cos(b)*np.sin(az), -np.sin(b)])
    P = np.array([xc, y, 9.0])   # mid-thickness
    lamp = np.array([0, 0, -h]); eye = np.array([0, 0, -D])
    # refract lamp->P approx: use in-air direction then refract at front
    L = P - lamp; L /= np.linalg.norm(L)
    zn = np.array([0, 0, 1.0])
    din = refract(L, zn, 1.0, N)
    din /= np.linalg.norm(din)
    dr = din - 2*(din@nrm)*nrm
    if dr[2] >= 0: return 180.0
    th = np.degrees(np.arccos(-dr[2]))
    if th >= TC: return 180.0
    # exit
    st = N*np.sqrt(1-dr[2]**2); ct = np.sqrt(1-st**2)
    t_ = np.array([dr[0], dr[1], 0.0]); t_ = t_/max(np.linalg.norm(t_),1e-12)
    out = np.array([t_[0]*st, t_[1]*st, -ct])
    e = eye - P; e /= np.linalg.norm(e)
    return np.degrees(np.arccos(np.clip(out @ e, -1, 1)))
for xc in (-80, -40, -20, 0, 20, 40, 80):
    print(f"  shallow cone-wall facet at x={xc:+4d} px (normal facing +x): mismatch {shallow_glint(xc, 0):6.2f} deg")
