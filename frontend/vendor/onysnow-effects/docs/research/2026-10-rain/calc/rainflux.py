import numpy as np
from math import pi
# Marshall-Palmer airborne number density N(D) = N0 exp(-L D), N0 = 8000 m^-3 mm^-1, L = 4.1 R^-0.21 mm^-1
print("rain rate R (mm/h) | Lambda (1/mm) | airborne drops (m^-3) | number-mean D (mm) | median-volume D0=3.67/L (mm) | flux on exposed vertical glass at U m/s (drops/cm^2/s) | WDR 0.222*U*R^0.88 (mm/h)")
for R in (0.5, 2.5, 7.6, 25, 50):
    L = 4.1 * R**-0.21
    Ntot = 8000 / L
    for U in (2, 5, 10):
        flux = Ntot * U / 1e4       # per cm^2 per s, free-stream assumption
        wdr = 0.222 * U * R**0.88
        print(f"{R:5} | {L:5.2f} | {Ntot:7.0f} | {1/L:4.2f} | {3.67/L:4.2f} | U={U:2}: {flux:5.2f} | {wdr:6.1f}")
print()
# spreading: volume -> contact diameter of a spherical cap at theta
def contact_d(V_ul, th_deg):
    t = np.tan(np.radians(th_deg)/2)
    a = np.cbrt(6*V_ul/(pi*t*(3+t*t)))
    return 2*a
print("falling D (mm) | V (uL) | contact diam on glass at 30/50/70 deg (mm)")
for D in (0.2, 0.5, 1.0, 2.0, 3.0):
    V = pi/6*D**3
    print(f"{D} | {V:.3f} | " + " / ".join(f"{contact_d(V,th):.2f}" for th in (30,50,70)))
print()
# splash criterion K = Oh * Re^1.25 (Mundo et al. 1995), splash above ~57.7; normal impact speed ~ wind speed U for a vertical pane
rho, mu, sig = 1000.0, 1.0e-3, 0.072
print("D (mm) | U normal (m/s) | We | Re | K=Oh*Re^1.25 | splash (K>57.7)?")
for D in (0.2, 0.5, 1.0, 2.0, 3.0):
    for U in (2, 5, 10):
        d = D/1000
        Re = rho*U*d/mu; We = rho*U*U*d/sig; Oh = mu/np.sqrt(rho*sig*d)
        K = Oh*Re**1.25
        print(f"{D} | {U} | {We:7.1f} | {Re:7.0f} | {K:7.1f} | {'yes' if K>57.7 else 'no'}")
