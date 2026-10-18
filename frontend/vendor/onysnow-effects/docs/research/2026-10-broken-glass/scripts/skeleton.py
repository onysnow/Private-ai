# Post-process a Peridynamics.jl run: per-face damage raster -> crack centrelines (pipeline proof).
# Input: pane_<step>.csv written by dump2.jl (ref x, y, z, uz, damage). Output: ../img/pane-skeleton.png
import numpy as np
from scipy.interpolate import griddata
from scipy.ndimage import gaussian_filter
from skimage.morphology import skeletonize, remove_small_objects
from PIL import Image
d = np.loadtxt('pane_4250.csv', delimiter=',')
x, y, z, uz, dm = d.T
out = []
for name, mask in (('struck', z >= np.median(z)), ('back', z < np.median(z))):
    key = np.round(x / 0.0008).astype(int) * 100000 + np.round(y / 0.0008).astype(int)
    o = np.argsort(key[mask]); k = key[mask][o]; dd = dm[mask][o]; xx = x[mask][o]; yy = y[mask][o]
    _, idx = np.unique(k, return_index=True)
    mx = np.maximum.reduceat(dd, idx)            # max damage through this half of the thickness
    g = np.arange(-0.05, 0.05, 0.0002)
    GX, GY = np.meshgrid(g, g)
    D = gaussian_filter(griddata((xx[idx], yy[idx]), mx, (GX, GY), method='linear', fill_value=0), 1.0)
    B = remove_small_objects(D > 0.3, 200)
    S = skeletonize(B)                           # crack centrelines; the big blob is the crushed zone
    rgb = np.full(S.shape + (3,), 30, np.uint8); rgb[B] = (90, 90, 140); rgb[S] = (255, 230, 80)
    out.append(Image.fromarray(rgb[::-1]))
W, H = out[0].size
sheet = Image.new('RGB', (W * 2 + 10, H), (255, 255, 255)); sheet.paste(out[0], (0, 0)); sheet.paste(out[1], (W + 10, 0))
sheet.resize((1000, 500)).save('../img/pane-skeleton.png')
