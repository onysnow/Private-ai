import math, random, numpy as np, mitsuba as mi
mi.set_variant('scalar_rgb')
W,H=48.0,24.0
random.seed(3); drops=[]
for _ in range(400):
    a=min(2.2,0.12*math.exp(1.0*random.gauss(0,1))+0.1)
    x=random.uniform(-W/2,W/2); y=random.uniform(-H/2,H/2)
    if all((x-dx)**2+(y-dy)**2>(a+da+0.05)**2 for dx,dy,da in drops): drops.append((x,y,a))
def load(f):
    b=np.array(mi.Bitmap(f)); return b[...,:3].mean(-1)
for name in ['print-on','print-off','world-on']:
    L=load(name+'.exr'); hgt,wid=L.shape
    print(name, 'image mean', L.mean().round(4))
    big=sorted(drops,key=lambda d:-d[2])[:6]
    for dx,dy,a in big:
        cx=(dx+W/2)/W*wid; cy=(H/2-dy)/H*hgt; rp=a/W*wid
        prof=[]
        for t in np.linspace(0,1.3,14):
            vals=[]
            for k in range(48):
                th=2*math.pi*k/48; x=int(cx+t*rp*math.cos(th)); y=int(cy+t*rp*math.sin(th))
                if 0<=x<wid and 0<=y<hgt: vals.append(L[y,x])
            prof.append(np.mean(vals) if vals else float('nan'))
        dist=math.hypot(dx+8,dy-3)
        print(f'  a={a:.2f}mm r={rp:.1f}px lampdist={dist:.0f}mm', ' '.join(f'{v:.3f}' for v in prof))
