# Rain and condensation research, October 2026 (round 3)

Done at Ony's instruction (2026-10-02): the rain "doesn't look photorealistic, it
doesn't refract, reflect, magnify, deform-the-image-behind-the-glass correctly, the
color looks like ink not water"; drops that get heavier, drip and leave a clear wet
trail that clears other drops; condensation that interacts with the rain; built on
the existing light and shadow systems; light through drops with shadows and focus
lines; "research needs done again".

The design built on it is `docs/rain-system.md`.

| File | What it is |
|---|---|
| `rain-research.md` | Prior art ranked (pick: the ToyShop architecture, GPU water and wetness fields plus our particle beads; runner-up: what we have, upgraded), why our drops look like ink, the physics and optics with numbers, and 96 reference photographs. |
| `reference-copies-credits.md` | Credits for the 50 small copies made for comparison. The copies are not in the repo. |
| `calc/` | The ray tracer for a drop's shadow and focused core (`drop_caustic.py`), the blur by light size, and the rain-arrival rates. |

Paths that say `scratchpad/...` refer to the research workspace.

## Checked against the sources (2026-10-02)

- ToyShop (Tatarchuk & Isidoro 2006): "The droplet mass is also used to render
  dynamic shadows of the simulation onto the objects in the toy store"; "If the
  droplet mass is large enough, we render a pseudo-caustic highlight in the middle
  of the shadow for that droplet"; "Droplets have a greater affinity for wet
  regions of the surface."
- `rain-research.md` corrects the earlier pass: a drop lens magnifies when the
  picture is between one and two focal lengths behind it and shrinks it beyond
  two (the earlier doc had it backwards; the shader traced rays, so only the text
  was wrong).
