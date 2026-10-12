import numpy as np, glob, os, json
from PIL import Image
from scipy import ndimage as ndi
from skimage.morphology import binary_dilation, disk, skeletonize
files = sorted(glob.glob('nijimg/p-*.png'))
groups = {70:'A_impact_blunt',71:'A_impact_round',72:'A_impact_sharp',73:'B_static_blunt',74:'B_static_round',75:'B_static_sharp'}
MM_PER_PX = 203.2/400.0  # 8 in pane traced in ~400 px panels (approx)
out = {}
for i,f in enumerate(files):
    page = 70 + i//10
    a = np.asarray(Image.open(f).convert('L')).astype(float)
    h,w = a.shape
    ink = a < 150
    # crop 4 px border (panel frame lines), treat border as crack (pane edge)
    ink[:4,:]=True; ink[-4:,:]=True; ink[:,:4]=True; ink[:,-4:]=True
    ink = binary_dilation(ink, disk(1))   # close tiny gaps
    lab, n = ndi.label(~ink)
    sizes = ndi.sum(np.ones_like(lab), lab, index=np.arange(1,n+1))
    pieces = []
    for k,s in enumerate(sizes, start=1):
        if s < 6: continue  # noise
        ys, xs = np.nonzero(lab==k)
        # PCA for elongation
        if len(xs) >= 5:
            c = np.cov(np.vstack([xs,ys]))
            ev = np.sort(np.linalg.eigvalsh(c))[::-1]
            L = 4*np.sqrt(max(ev[0],1e-9)); W = 4*np.sqrt(max(ev[1],1e-9))
        else:
            L=W=1
        pieces.append({'area_mm2': float(s*MM_PER_PX**2), 'len_mm': float(L*MM_PER_PX), 'wid_mm': float(W*MM_PER_PX), 'aspect': float(L/max(W,1e-6))})
    out[os.path.basename(f)] = {'group': groups[page], 'n': len(pieces), 'pieces': pieces}
json.dump(out, open('nij_pieces.json','w'))
# summary
import collections
G = collections.defaultdict(list)
for k,v in out.items(): G[v['group']].append(v)
for g, lst in G.items():
    ns = [v['n'] for v in lst]
    areas = np.concatenate([[p['area_mm2'] for p in v['pieces']] for v in lst])
    asp = np.concatenate([[p['aspect'] for p in v['pieces'] if p['area_mm2']>20] for v in lst])
    print(f"{g}: pieces/pane median {np.median(ns):.0f} (min {min(ns)}, max {max(ns)}); area mm2 median {np.median(areas):.1f}, p10 {np.percentile(areas,10):.1f}, p90 {np.percentile(areas,90):.0f}, max {areas.max():.0f}; aspect(area>20mm2) median {np.median(asp):.2f} p90 {np.percentile(asp,90):.1f} frac>4: {np.mean(asp>4):.2f} frac>8: {np.mean(asp>8):.2f}")
