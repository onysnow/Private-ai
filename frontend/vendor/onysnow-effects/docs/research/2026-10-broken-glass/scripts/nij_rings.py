import numpy as np, glob, os
from PIL import Image
from scipy import ndimage as ndi
files = sorted(glob.glob('nijimg/p-*.png'))
MM = 203.2/400.0
def analyze(f):
    a = np.asarray(Image.open(f).convert('L')).astype(float)/255.0
    h,w = a.shape
    ink = (a < 0.6).astype(float)
    ink[:6,:]=0; ink[-6:,:]=0; ink[:,:6]=0; ink[:,-6:]=0
    g = ndi.gaussian_filter(1-a, 1.0)
    gx = ndi.sobel(g, 1); gy = ndi.sobel(g, 0)
    Jxx = ndi.gaussian_filter(gx*gx, 2.5); Jyy = ndi.gaussian_filter(gy*gy, 2.5); Jxy = ndi.gaussian_filter(gx*gy, 2.5)
    # dominant gradient orientation; line direction is perpendicular
    theta_g = 0.5*np.arctan2(2*Jxy, Jxx-Jyy)
    theta_l = theta_g + np.pi/2
    coh = np.sqrt((Jxx-Jyy)**2 + 4*Jxy**2)/(Jxx+Jyy+1e-9)
    ys, xs = np.nonzero((ink>0) & (coh>0.5))
    # accumulator of line intersections (Hough-like): vote along each pixel's line
    acc = np.zeros((h,w))
    rng = np.random.default_rng(0)
    idx = rng.choice(len(xs), size=min(4000, len(xs)), replace=False)
    ts = np.arange(-300, 301, 1.0)
    for i in idx:
        x0,y0,t = xs[i], ys[i], theta_l[ys[i],xs[i]]
        px = np.round(x0 + ts*np.cos(t)).astype(int); py = np.round(y0 + ts*np.sin(t)).astype(int)
        m = (px>=0)&(px<w)&(py>=0)&(py<h)
        np.add.at(acc, (py[m], px[m]), 1)
    acc = ndi.gaussian_filter(acc, 4)
    cy, cx = np.unravel_index(np.argmax(acc), acc.shape)
    # tangential ink fraction per radius bin
    yy, xx = np.nonzero(ink>0)
    r = np.hypot(xx-cx, yy-cy)
    phi = np.arctan2(yy-cy, xx-cx)
    tl = theta_l[yy,xx]
    radialness = np.abs(np.cos(tl - phi))  # 1 = radial line, 0 = tangential
    bins = np.arange(0, 200, 10)
    tang = []; tot = []
    for b0 in bins:
        m = (r>=b0)&(r<b0+10)
        # normalize by circumference available inside the panel: count only pixels; compute fraction tangential
        tot.append(m.sum()); tang.append(np.sum(m & (radialness<0.5)))
    return (cx,cy), bins, np.array(tang), np.array(tot)
for i,f in enumerate(files):
    page = 70+i//10
    if page < 73: continue
    c, bins, tang, tot = analyze(f)
    frac = tang/np.maximum(tot,1)
    edge = min(c[0], c[1], 399-c[0], 399-c[1])
    s = ' '.join(f"{int(b*MM)}:{fr:.2f}" for b,fr in zip(bins,frac) if b < edge)
    print(os.path.basename(f), page, 'centre', c, 'edge_px', edge, '|', s)
