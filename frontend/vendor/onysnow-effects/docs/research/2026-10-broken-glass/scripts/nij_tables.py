import numpy as np, glob, os, json, collections
from PIL import Image
from scipy import ndimage as ndi
files = sorted(glob.glob('nijimg/p-*.png'))
groups = {70:'Drop weight, blunt tip',71:'Drop weight, round tip',72:'Drop weight, sharp tip',73:'Static press in frame, blunt tip',74:'Static press in frame, round tip',75:'Static press in frame, sharp tip'}
MM = 203.2/400.0
radii_mm = [10,20,30,40,50,70]
res = collections.defaultdict(lambda: collections.defaultdict(list))
centres_edge = collections.defaultdict(int)
for i,f in enumerate(files):
    page = 70+i//10; g = groups[page]
    a = np.asarray(Image.open(f).convert('L')).astype(float)
    h,w = a.shape
    dark = (a < 140)
    dark[:6,:]=False; dark[-6:,:]=False; dark[:,:6]=False; dark[:,-6:]=False
    d = ndi.gaussian_filter(dark.astype(float), 12)
    cy, cx = np.unravel_index(np.argmax(d), d.shape)
    edge = min(cx, cy, w-1-cx, h-1-cy)
    if edge < 60: centres_edge[g]+=1
    for rmm in radii_mm:
        r = rmm/MM
        if r > edge-8: continue
        th = np.linspace(0,2*np.pi,3600,endpoint=False)
        xs = np.round(cx + r*np.cos(th)).astype(int); ys = np.round(cy + r*np.sin(th)).astype(int)
        s = dark[ys,xs]
        res[g][rmm].append(int(np.sum(s & ~np.roll(s,1))))
print('| Test series (10 panes each, 203 mm square, ~3.2 mm thick) | impacts within 30 mm of an edge | crossings at r=10 mm | 20 mm | 30 mm | 50 mm | 70 mm |')
print('|---|---|---|---|---|---|---|')
for g in groups.values():
    cells = []
    for rmm in [10,20,30,50,70]:
        v = res[g][rmm]
        if len(v)==0: cells.append('n/a'); continue
        cells.append(f"{int(np.median(v))} ({min(v)}-{max(v)}; n={len(v)})")
    print(f"| {g} | {centres_edge[g]} | " + ' | '.join(cells) + ' |')
