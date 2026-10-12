import sys, math, random
import numpy as np
import mitsuba as mi
mi.set_variant('llvm_ad_rgb')
case = sys.argv[1]          # print | world
lamp_on = sys.argv[2] == 'on'
spp = int(sys.argv[3]) if len(sys.argv) > 3 else 128
out = sys.argv[4] if len(sys.argv) > 4 else f'ref-{case}-{sys.argv[2]}.exr'
T = 4.5          # glass thickness, mm
W, H = 48.0, 24.0  # pane region, mm
random.seed(3)
# drops: (x, y, a) contact radius mm; contact angle 50 deg
drops = []
for _ in range(400):
    a = min(2.2, 0.12 * math.exp(1.0 * random.gauss(0, 1)) + 0.1)
    x = random.uniform(-W/2, W/2); y = random.uniform(-H/2, H/2)
    if all((x-dx)**2 + (y-dy)**2 > (a+da+0.05)**2 for dx, dy, da in drops):
        drops.append((x, y, a))
theta = math.radians(50)
def write_obj(path, V, F, N=None):
    with open(path, 'w') as f:
        for v in V: f.write('v %f %f %f\n' % tuple(v))
        if N is not None:
            for n in N: f.write('vn %f %f %f\n' % tuple(n))
        for t in F:
            if N is not None: f.write('f %d//%d %d//%d %d//%d\n' % (t[0]+1,t[0]+1,t[1]+1,t[1]+1,t[2]+1,t[2]+1))
            else: f.write('f %d %d %d\n' % (t[0]+1, t[1]+1, t[2]+1))
# back face (frosted) with holes: fine grid, drop triangles inside any drop disc
n = 480; m = 240
V = []; F = []
for j in range(m+1):
    for i in range(n+1):
        V.append((-W/2*1.6 + W*1.6*i/n, -H/2*1.6 + H*1.6*j/m, -T))
def inside(x, y):
    for dx, dy, da in drops:
        if (x-dx)**2 + (y-dy)**2 < da*da: return True
    return False
for j in range(m):
    for i in range(n):
        a = j*(n+1)+i; b = a+1; c = a+n+1; d = c+1
        for tri in ((a, c, b), (b, c, d)):   # normals -z (outward, toward the back)
            cx = sum(V[k][0] for k in tri)/3; cy = sum(V[k][1] for k in tri)/3
            if not inside(cx, cy): F.append(tri)
write_obj('back.obj', V, F)
# drop caps (water-air, normal outward = away from water) and contact discs (glass-water, normal toward water: -z)
CV = []; CF = []; CN = []; DV = []; DF = []
for dx, dy, a in drops:
    h = a * math.tan(theta/2); R = (a*a + h*h) / (2*h)
    rings = 10; segs = 36
    base = len(CV)
    # cap apex at z = -T - h; centre of sphere at z = -T - h + R
    cz = -T - h + R
    for r in range(rings+1):
        phi = (r/rings) * math.asin(a/R)  # angle from the apex
        for s in range(segs):
            th = 2*math.pi*s/segs
            px = dx + R*math.sin(phi)*math.cos(th); py = dy + R*math.sin(phi)*math.sin(th); pz = cz - R*math.cos(phi)
            CV.append((px, py, pz)); CN.append(((px-dx)/R, (py-dy)/R, (pz-cz)/R))
    for r in range(rings):
        for s in range(segs):
            p = base + r*segs + s; q = base + r*segs + (s+1)%segs; p2 = p + segs; q2 = q + segs
            CF += [(p, q, p2), (q, q2, p2)]
    db = len(DV); DV.append((dx, dy, -T))
    for s in range(segs):
        th = 2*math.pi*s/segs; DV.append((dx + a*math.cos(th), dy + a*math.sin(th), -T))
    for s in range(segs):
        DF.append((db, db+1+(s+1)%segs, db+1+s))
write_obj('caps.obj', CV, CF, CN)
write_obj('discs.obj', DV, DF)
photo_z = -T - (15.0 if case == 'print' else 3000.0)
photo_scale = 30.0 if case == 'print' else 3000.0 * 0.6
scene = {
    'type': 'scene',
    'integrator': {'type': 'path', 'max_depth': 24, 'hide_emitters': True},
    'sensor': {'type': 'perspective', 'fov': 2*math.degrees(math.atan((W/2)/400.0)), 'fov_axis': 'x',
               'to_world': mi.ScalarTransform4f().look_at(origin=[0, 0, 400], target=[0, 0, 0], up=[0, 1, 0]),
               'film': {'type': 'hdrfilm', 'width': 960, 'height': 480, 'rfilter': {'type': 'gaussian'}},
               'sampler': {'type': 'independent', 'sample_count': spp, 'seed': int(__import__('os').environ.get('SEED','0'))}},
    'front': {'type': 'rectangle', 'to_world': mi.ScalarTransform4f().scale([W*0.8, H*0.8, 1]),
              'bsdf': {'type': 'dielectric', 'int_ior': 1.52, 'ext_ior': 1.0}},
    'back': {'type': 'obj', 'filename': 'back.obj', 'face_normals': True,
             'bsdf': {'type': 'roughdielectric', 'distribution': 'beckmann', 'alpha': 0.25, 'int_ior': 1.52, 'ext_ior': 1.0}},
    'discs': {'type': 'obj', 'filename': 'discs.obj', 'face_normals': True,
              'bsdf': {'type': 'dielectric', 'int_ior': 1.52, 'ext_ior': 1.333}},
    'caps': {'type': 'obj', 'filename': 'caps.obj',
             'bsdf': {'type': 'dielectric', 'int_ior': 1.333, 'ext_ior': 1.0}},
    'photo': {'type': 'rectangle',
              'to_world': mi.ScalarTransform4f().translate([0, 0, photo_z]).scale([photo_scale, photo_scale*0.5, 1]),
              'bsdf': {'type': 'diffuse', 'reflectance': {'type': 'bitmap', 'filename': 'photo.png'}},
              'emitter': {'type': 'area', 'radiance': {'type': 'bitmap', 'filename': 'photo.png', 'raw': False}}},
    'room': {'type': 'constant', 'radiance': {'type': 'rgb', 'value': [0.02, 0.018, 0.016]}},
}
if lamp_on:
    scene['lamp'] = {'type': 'sphere', 'center': [-8, 3, 75], 'radius': 11.5,
                     'emitter': {'type': 'area', 'radiance': {'type': 'rgb', 'value': [20.4, 18.4, 15.6]}}}
sc = mi.load_dict(scene)
img = mi.render(sc)
mi.util.write_bitmap(out, img)
b = np.array(img); b = np.clip(b, 0, None)
srgb = np.where(b <= 0.0031308, 12.92*b, 1.055*np.power(b, 1/2.4) - 0.055)
from PIL import Image
Image.fromarray((np.clip(srgb, 0, 1)*255).astype(np.uint8)).save(out.replace('.exr', '.png'))
print('drops', len(drops), 'done', out)
