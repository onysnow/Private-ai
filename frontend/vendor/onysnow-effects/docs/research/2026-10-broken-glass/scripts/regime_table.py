import numpy as np
N=1.52; TC=np.degrees(np.arcsin(1/N)); t=18.0; g=6.0
def fres(ci,n1,n2):
    si=np.sqrt(max(0,1-ci*ci)); st=n1/n2*si
    if st>=1: return 1.0
    ct=np.sqrt(1-st*st); rs=(n1*ci-n2*ct)/(n1*ci+n2*ct); rp=(n2*ci-n1*ct)/(n2*ci+n1*ct); return .5*(rs*rs+rp*rp)
print("| view (air) | lean β | band width (px) | incidence on face α | what the band shows | detail |")
print("|---|---|---|---|---|---|")
for tv in (0,10,30,45):
    ti=np.degrees(np.arcsin(np.sin(np.radians(tv))/N))
    for b in (0,5,10,15,20,25,30,40,50,60):
        w=t*abs(np.tan(np.radians(b))-np.tan(np.radians(ti)))
        a=90-abs(ti-b)
        R1=fres(np.cos(np.radians(a)),N,1.0)
        thp=2*b-ti  # reflected in-glass angle from +z (signed)
        if w<0.05:
            print(f"| {tv}° | {b}° | ~0 | – | nothing (ray parallel to face) | |"); continue
        if R1>=1:
            if abs(thp)<TC:
                phi=np.degrees(np.arcsin(N*np.sin(np.radians(thp))))
                # mid-band ray: hits at mid depth
                zh=t/2
                xh=zh*np.tan(np.radians(b))
                xe=xh-zh*np.tan(np.radians(ti))
                xph=xh+(t-zh)*np.tan(np.radians(thp))+g*np.tan(np.radians(phi))
                xun=xe+t*np.tan(np.radians(ti))+g*np.tan(np.radians(tv))
                kind="TIR mirror -> photo" + (" (mirror fold)" if b==0 else " (displaced)")
                det=f"exits back at {phi:+.0f}°, photo sample moved {xph-xun:+.1f} px (g = 6 px)"
            else:
                kind="TIR -> trapped (guided light)"
                det=f"reflected at {abs(thp):.0f}° in glass (> {TC:.1f}°)"
        else:
            Rt=2*R1/(1+R1)
            kind="partial: mostly seen THROUGH"
            det=f"reflects {Rt*100:.0f}% (both faces), reflected part " + ("trapped" if abs(thp)>TC else "to photo")
        print(f"| {tv}° | {b}° | {w:.1f} | {a:.0f}° | {kind} | {det} |")
