"""
Axisymmetric ray trace of collimated light through a sessile water drop
(spherical cap, contact radius a, contact angle th) on a glass pane, onto a
receiver a distance D behind the pane. Two configurations:
  far:  light crosses the glass first, the drop is on the far (receiver) face;
        rays exit through the curved water-air surface (TIR possible).
  near: the drop is on the near (light) face; rays enter the curved air-water
        surface first, then cross water->glass->air flat faces (thickness t).
Irradiance on the receiver is binned per unit area, normalised to the
incident irradiance (1.0 = same as no drop). Then blurred by the light's
angular radius (penumbra = D * tan(alpha_src)) with a uniform disc kernel.
Fresnel losses are included (unpolarised average) at each interface.
"""
import numpy as np

n_w, n_g = 1.333, 1.52

def fresnel_T(n1, n2, cos_i):
    sin_i = np.sqrt(np.clip(1 - cos_i**2, 0, 1))
    sin_t = n1 / n2 * sin_i
    tir = sin_t >= 1
    cos_t = np.sqrt(np.clip(1 - sin_t**2, 0, 1))
    rs = ((n1 * cos_i - n2 * cos_t) / (n1 * cos_i + n2 * cos_t + 1e-12))**2
    rp = ((n1 * cos_t - n2 * cos_i) / (n1 * cos_t + n2 * cos_i + 1e-12))**2
    T = 1 - 0.5 * (rs + rp)
    T[tir] = 0
    return T, tir

def trace(a, th_deg, D, config="far", t=4.5, N=400000, rmax_bins=None):
    th = np.radians(th_deg)
    R = a / np.sin(th)                 # radius of curvature
    r = (np.arange(N) + 0.5) / N * a   # ray radial positions within contact
    w = 2 * np.pi * r * (a / N)        # annulus area per ray (power weight)
    alpha = np.arcsin(np.clip(r / R, 0, 1))     # surface tilt at r
    h = np.sqrt(R**2 - r**2) - R * np.cos(th)  # cap height at r (0 at the contact line, R(1-cos th) at the apex)
    if config == "far":
        # inside water the ray is along the axis; at the curved surface
        # incidence angle = alpha (water -> air)
        T1, _ = fresnel_T(1.0, n_g, np.ones(N))          # air->glass, normal
        T2, _ = fresnel_T(n_g, n_w, np.ones(N))          # glass->water, normal
        cos_i = np.cos(alpha)
        T3, tir = fresnel_T(n_w, 1.0, cos_i)
        beta = np.arcsin(np.clip(n_w * np.sin(alpha), -1, 1))
        dev = beta - alpha                               # bend toward axis
        # exit point is at height h above the glass face; travel to receiver at D (from glass face)
        x = r - (D - h) * np.tan(dev)
        P = w * T1 * T2 * T3
        P[tir] = 0
    else:
        # light hits curved air->water surface first, at incidence alpha
        cos_i = np.cos(alpha)
        T1, _ = fresnel_T(1.0, n_w, cos_i)
        gam = np.arcsin(np.sin(alpha) / n_w)             # refracted angle to surface normal
        dirw = alpha - gam                               # ray angle to axis inside water (toward axis)
        # water->glass flat: n_w sin(dirw) = n_g sin(dg); glass->air: n_g sin(dg) = sin(da)
        s = n_w * np.sin(dirw)
        tir = s >= 1
        dg = np.arcsin(np.clip(s / n_g, -1, 1))
        da = np.arcsin(np.clip(s, -1, 1))
        T2, _ = fresnel_T(n_w, n_g, np.cos(dirw))
        T3, tir3 = fresnel_T(n_g, 1.0, np.cos(dg))
        # lateral travel: through remaining water height h, glass t, gap D
        x = r - h * np.tan(dirw) - t * np.tan(dg) - D * np.tan(da)
        P = w * T1 * T2 * T3
        P[tir | tir3] = 0
    return x, P

def irradiance(a, th, D, config, src_half_angle=0.0, nb=600, span=None):
    x, P = trace(a, th, D, config)
    span = span or max(3 * a, 1.2 * np.max(np.abs(x)))
    rho = np.abs(x)
    edges = np.linspace(0, span, nb + 1)
    hist, _ = np.histogram(rho, bins=edges, weights=P)
    area = np.pi * (edges[1:]**2 - edges[:-1]**2)
    E = hist / area
    # light passing outside the drop footprint (r > a) arrives unchanged,
    # attenuated only by the plain pane (Fresnel air-glass-air, normal)
    Tpane = (1 - ((n_g - 1) / (n_g + 1))**2)**2
    centers = 0.5 * (edges[1:] + edges[:-1])
    E = E + np.where(centers > a, Tpane, 0.0)  # geometric: outside-footprint direct light
    E = E / Tpane                               # relative to the plain pane
    if src_half_angle > 0:
        pen = D * np.tan(src_half_angle)
        if pen > 0:
            # 2D disc blur of a radial profile: brute force on a grid
            g = np.linspace(-span, span, 401)
            X, Y = np.meshgrid(g, g)
            Rg = np.sqrt(X**2 + Y**2)
            img = np.interp(Rg, centers, E, right=1.0)
            k = int(np.ceil(pen / (g[1] - g[0])))
            if k >= 1:
                ky, kx = np.mgrid[-k:k + 1, -k:k + 1]
                ker = (kx**2 + ky**2 <= k * k).astype(float)
                ker /= ker.sum()
                from numpy.fft import rfft2, irfft2
                pad = np.pad(img, k, mode="edge")
                Kp = np.zeros_like(pad); Kp[:2*k+1, :2*k+1] = ker
                Kp = np.roll(np.roll(Kp, -k, 0), -k, 1)
                conv = irfft2(rfft2(pad) * rfft2(Kp), s=pad.shape)[k:-k, k:-k]
                prof = conv[200, 200:]
                return g[200:], prof
    return centers, E

if __name__ == "__main__":
    import sys
    a = 1.5
    for config in ("far", "near"):
        for th in (30, 60, 90):
            R = a / np.sin(np.radians(th)); f = R / (n_w - 1)
            print(f"\n=== config={config} contact radius a={a} mm, theta={th} deg, R={R:.2f} mm, paraxial f~{f:.1f} mm")
            for D in (1, 3, 6, 10, 17, 30, 60):
                c, E = irradiance(a, th, D, config)
                inside = c < a
                print(f"D={D:>3} mm: centre E={E[0]:6.2f}  min inside footprint={E[inside].min():5.2f}  "
                      f"max anywhere={E.max():6.2f} at r={c[np.argmax(E)]:.2f} mm  "
                      f"mean inside footprint={np.average(E[inside], weights=c[inside]):.2f}")
