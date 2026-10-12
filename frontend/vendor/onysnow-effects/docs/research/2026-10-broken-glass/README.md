# Broken glass research, October 2026

Done at Ony's instruction (2026-10-02): "Don't do anything else until you've done
thorough research and gathered lots and I mean LOTS of references", "go actually
find something someone else built so we aren't starting from 0... I want the best
one not the easiest to find", plain and laminated glass (not tempered), with the
tiny shards (needles, sand, small rocks) at the edges, sides and through the pane.

The design built on this research is `docs/broken-glass-system.md`.

| File | What it is |
|---|---|
| `prior-art-fracture.md` | Survey of existing fracture systems, ranked. Pick: offline peridynamics with Peridynamics.jl (MIT); runner-up PeriLab.jl (BSD-3). Includes a hammer-on-pane test run in the research container. |
| `fracture-physics.md` | How plain and laminated glass break under impact, with numbers: cone, crushed zone, radials, rings, branching, through-thickness faces, edges, debris sizes, laminated break types. Includes measurements of the 60 NIJ test panes. |
| `optics-rendering.md` | Every way broken glass treats light, with computed numbers, and the recommended per-pixel rendering. |
| `reference-photos.md` | 203 reference photographs and figures in 17 categories, with links, licences and what each shows. |
| `reference-copies-credits.md` | Credits for the 80 small copies made for side-by-side comparison. The copies themselves are not in the repo (third-party images; comparison only, never for the site). |
| `scripts/` | The peridynamics test (`pane.jl`, `disk.jl`, `skeleton.py`), the LAMMPS cross-check inputs, the optics ray-tracing scripts and their outputs, and the NIJ tracing measurements. |
| `images/` | Our own simulation outputs: the hammer test over time (`pane-sheet.jpg`), the extracted crack lines, the disk test, and the LAMMPS lattice artefact. |

Paths in the reports that say `scratchpad/...` refer to the research workspace;
the files that matter were copied here.

## Checked against the sources (2026-10-02)

Spot checks of the claims the design depends on, re-read at the source:

- Peridynamics.jl is MIT ("Copyright (c) 2022-present Kai Partmann"). PeriLab.jl is
  BSD-3-Clause.
- NIJ 241445: "No overall fracture patterns were duplicated"; 8" × 8" × 1/8"
  panes; "The fracture patterns produced using dynamic impact were much simpler
  than the fracture patterns produced using static pressure."
- PLOS ONE 2014 (CC BY): radial crack number on the backing ply 15–65 at
  2.42 m/s and 18–112 at 3.7 m/s; "Circular cracks always initiate long after the
  completed propagation of radial cracks".
- APS Physics on Vandenberghe et al. 2013: crack number proportional to the
  square root of impact speed and the inverse cube root of fracture energy;
  4 cracks at 22.2 m/s and 8 at 56.7 m/s in 1 mm Plexiglas.
- SWGMAT Glass Fractures: concentric cracks "are usually in straight segments
  that terminate in an existing radial crack"; "If a pane is firmly held on all
  sides, concentric cracks can form around the point of impact."
- Domokos et al.: natural 2D fragments have two attractors, "'Platonic'
  quadrangles and 'Voronoi' hexagons".
- The 7.7° rule (faces within 7.7° of square are total-reflection mirrors for
  every ray entering the front) follows from the critical angle: 90° − 2 × 41.1°.

**One correction.** `fracture-physics.md` §2.3 infers that the two plies' radial
cracks in laminated glass "do not line up". PLOS ONE 2014 measured the opposite:
the radial cracks on the impacted ply are "completely overlapped with the radial
cracks on the backing layer". The design follows PLOS.
