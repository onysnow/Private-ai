from drop_caustic import *
import numpy as np
a=1.5
srcs = {"sun (0.27 deg)": np.radians(0.267), "point-ish lamp 1 mm @ 75 mm (0.76 deg)": np.arctan(1/75), "site bulb 11.5 mm @ 75 mm (8.7 deg)": np.arctan(11.5/75)}
for config in ("far",):
  for th in (30, 60):
    for D in (6, 17, 60, 300):
      line=f"theta={th} D={D:>3} mm |"
      for name, ang in srcs.items():
        span = max(3*a, D*np.tan(ang)*2.5 + 2*a)
        c,E = irradiance(a, th, D, config, src_half_angle=ang, span=span)
        line += f" {name.split(' (')[0]}: centre {E[0]:5.2f}, min {E.min():4.2f}, max {E.max():5.2f} |"
      print(line)
