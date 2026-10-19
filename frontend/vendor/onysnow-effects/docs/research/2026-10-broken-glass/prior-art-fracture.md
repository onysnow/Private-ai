# Prior art: impact-fracture patterns and pieces for glass panes

Annealed float glass and laminated glass. Survey for OnySnow Studios, 2026-10-02.

This builds on the earlier, shallower pass in the project doc
`claude/research-glass-fracture.md`. It re-evaluates what that pass found and
goes wider and deeper, but it doesn't repeat that pass's appearance and
rendering notes.

**Marks used throughout:**

| Mark | Meaning |
|---|---|
| **(read)** | I read it at the link. |
| **(viewed)** | I looked at the figure, image or output myself. The images are in §9. |
| **(measured here)** | I ran it in this session's Linux container (2 CPU threads, 7 GB RAM). |
| **(computed)** | Arithmetic from cited or measured numbers. |
| **(estimate)** | My judgement. Tune it against reference photos. |
| **(not verified)** | I couldn't confirm it. |

---

## 0. Bottom line

1. **The best existing system for this is offline peridynamics (PD).**
   - PD is what the glass-impact research community uses to reproduce real
     break patterns in glass plates, including the sequence (§1, §5.1).
   - There are good open solvers.
   - **Recommendation: use [Peridynamics.jl](https://github.com/kaipartmann/Peridynamics.jl) (MIT).** Simulate a hammer striking a
     framed 4–6 mm pane offline, and pre-generate a library of physically
     simulated breaks.
   - Each break holds:
     - the crack networks on both faces
     - the lean through the thickness
     - crack arrival times
     - shards, with their tilt and slip
     - the crushed zone
     - fragments and debris
   - The browser only plays this data back through the renderer we already
     have (WebGL1 and Canvas2D).
2. **Runner-up: [PeriLab.jl](https://github.com/PeriHub/PeriLab.jl) (BSD-3).** It is the same physics in another
   maintained solver, with more built-in models. [LAMMPS PERI](https://docs.lammps.org/Howto_peri.html) (GPL-2, offline only)
   is the cross-check.
3. **The production and procedural tools are all Voronoi or ring generators.**
   That covers Houdini, Unreal Chaos, Blender, three-pinata, and the Godot and
   Unity kits.
   - Voronoi mosaics average **3 cells per vertex and 6 corners per cell**.
   - Mosaics of the T-junction kind real cracks make tend to **4 and 4**
     ([Domokos et al.](https://ar5iv.labs.arxiv.org/html/1912.04628), read).
   - That is a structural, measurable reason these tools read as CG. They are
     design references only.
4. **I checked the path in this container rather than only reading about it.**
   - Both LAMMPS PERI and Peridynamics.jl install and run here.
   - A 25-line Peridynamics.jl script took **7.6 minutes** (measured here) for
     a hammer striking a framed pane. It produced:
     - a crushed centre
     - radial cracks
     - later, a circumferential arc on the struck face
     - frame-line cracks (an artifact of my crude clamp)
   - Production resolution needs a bigger machine: about 0.4–1.6 h per break on
     32 threads, or 6–25 h here, where the larger panes also exceed the 7 GB of
     memory (§6.5, computed and estimated).

---

## 1. What has to be matched: the checklist I judged every candidate against

- **Order of events.** Radial cracks come first, and they start on the back
  face, the one not struck. Circumferential (concentric) cracks come later, on
  the struck face.
  - "The first radial cracks that appear are on the bottom face of the glass
    plate" ([Wang, Yen, Yu, Wright & Bobaru 2024](https://par.nsf.gov/servlets/purl/10597886),
    read; [publisher](https://link.springer.com/article/10.1007/s10704-024-00813-3)).
  - Laminated, drop-weight tests (viewed, Fig. 4 of
    [Chen, Xu, Liu, Yao & Li, PLOS ONE 2014](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0098196), CC BY):
    - the backing ply's radials are complete at 200 µs
    - the impacted ply's radials are complete at 800 µs
    - a circular crack appears at 1,200 µs

    "circular cracks always initiate long after the completed propagation of
    radial cracks" (read).
- **Radial counts vary enormously in reality.**
  - Laminated glass (200 × 150 mm, 2 mm + 0.76 mm PVB + 2 mm), clamped, hit by
    a 2 kg hemispherical drop weight, 100 repeats per speed: **15–65 radials at
    2.42 m/s and 18–112 at 3.7 m/s** on the backing ply (PLOS 2014, read).
  - So a generator that gives the "same" break every time is wrong by
    construction.
  - Monolithic plates: radial count N ∝ V^½ and N ∝ G_c^(−⅓)
    ([APS Physics on Vandenberghe et al. 2013](https://physics.aps.org/articles/v6/48), read).
  - A 1 mm plate gave 3 → 11 radials from 15 → 120 m/s
    ([Nature Physics news](https://www.nature.com/articles/nphys2654), read).
- **More radials means fewer rings.** On the laminated specimen (viewed, PLOS
  Fig. 5):
  - total radial length L_r rises roughly linearly, from about 1.2 m at N_r = 20
    to about 3.5 m at N_r = 60
  - total circular-crack length L_c falls, from about 600 mm to about 60 mm
- **Concentric cracks are straight segments that end at radials.** They are
  "usually in straight segments that terminate in an existing radial crack",
  and form "if a pane is firmly held on all sides"
  ([SWGMAT, Glass Fractures](https://www.nist.gov/document/glassfracturespdf), read).
- **T-junctions, not Y-junctions.**
  - In mosaics made by successive cell splitting, the cells tend to v̄ = 4
    corners on average.
  - Voronoi mosaics are [n̄, v̄] = [3, 6] (Domokos, Jerolmack, Kun & Török,
    [arXiv 1912.04628](https://arxiv.org/abs/1912.04628),
    [PNAS](https://www.pnas.org/doi/10.1073/pnas.2001037117), read).
- **Where cracks fork depends on stress.**
  - The rule is σ√r = A, with values for soda-lime glass
    ([NASA TM-1998-206536](https://ntrs.nasa.gov/api/citations/19980137602/downloads/19980137602.pdf), read):
    - A_mirror = 1.81 ± 0.28 MPa·m^½ (ring-on-ring)
    - A_branch = 3.54 ± 0.64 MPa·m^½ (4-point)
  - So the branching radius is r_b = (A_b/σ)². That is about 5 mm at 50 MPa and
    1.25 mm at 100 MPa (computed).
- **Through the thickness.**
  - There is a crushed (comminuted) zone under the striker and a Hertzian cone
    from the struck face. The cone ends in "thin glass chips on the back face".
  - The radials on the two faces differ at first and then merge (read, Wang
    et al. 2024).
  - This is what produces the crack's lean and where it reaches the pane's edge
    faces.
- **Laminated glass: the plies crack in register.** "the radial cracks are
  completely overlapped" between the two plies, and circular cracks appear on
  the impacted ply (PLOS 2014, read and viewed).
- **Debris.**
  - Fragment masses follow a power law with exponent ≈ 2 for an impacted disc in
    a 2D cell model ([Behera, Kun, McNamara & Herrmann 2004](https://arxiv.org/abs/cond-mat/0404057), read).
  - Plus a backward spray toward the striker (Nelson & Revell, earlier pass).

---

## 2. Ranked table

**Realism** is how close the output is to a real impact-broken window, on my
judgement, from what I looked at: 5 is like a photo, 1 is wrong.

| # | System | Family | Realism (what I looked at) | Use to us | Licence for a commercial site |
|---|---|---|---|---|---|
| **1** | [Peridynamics.jl](https://github.com/kaipartmann/Peridynamics.jl) | PD solver, Julia | **4** for topology and order of events. **2–3** for geometry at coarse resolution until it is smoothed (measured here and viewed, §4). The method is validated for glass in the literature (viewed: Wang/Bobaru 2024). | Offline break library | **MIT** ([LICENSE](https://raw.githubusercontent.com/kaipartmann/Peridynamics.jl/main/LICENSE)). Only its output is shipped. |
| **2** | [PeriLab.jl](https://github.com/PeriHub/PeriLab.jl) | PD solver, Julia | Not run. The physics is the same as #1. | Offline library, alternative solver | **BSD-3** |
| 3 | [LAMMPS PERI](https://docs.lammps.org/Howto_peri.html) | PD in a molecular dynamics code | **3** (measured here and viewed). It works, but a regular lattice gives kaleidoscopic symmetry. Random strength helps, and jitter made it unstable (§4.1). | Offline cross-check | **GPL-2**, offline only. Its output isn't covered (§7). |
| 4 | [Peridigm](https://github.com/peridigm/peridigm) | PD solver, C++/Trilinos | Not run | Offline alternative | **BSD-3** ([LICENSE.md](https://github.com/peridigm/peridigm/blob/master/LICENSE.md)) |
| 5 | [GranOO](https://www.granoo.org/) | Discrete elements for silica glass | Not viewed. Its glass-impact demos are YouTube videos. | Offline, only if PD's debris isn't enough | **GPL-3**, offline only |
| 6 | NVIDIA Blast ([repo](https://github.com/NVIDIA-Omniverse/PhysX)) | Fracture toolkit plus stress solver | n/a. Not a pattern generator. It cuts a bitmap pattern through a mesh. | Optional: 3D chunks with noisy or leaning faces, and the support graph | **BSD-3** |
| 7 | [RACCOON](https://github.com/hugary1995/raccoon) | Phase-field FEM (MOOSE) | Not viewed. It gives clean cracks with branching, but costs far too much for whole panes. | Local crack-face studies | **LGPL-2.1**, offline |
| 8 | Houdini RBD Material Fracture "Glass" ([docs](https://www.sidefx.com/docs/houdini/destruction/glass.html)) | Procedural Voronoi | **3** (viewed docs images). Good at first glance, but dartboard-regular, with convex Voronoi cells. | Design reference (chipping, glue strengths) | Paid. Docs only. |
| 9 | Müller, Chentanez & Kim 2013 ([PDF](https://matthias-research.github.io/pages/publications/fractureSG2013.pdf)) | Precomputed pattern aligned to the impact | **2** (procedural spider web) | Exactly our runtime step, with PD data replacing the spider web | Paper |
| 10 | Unreal Chaos Radial ([docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/fracturing-geometry-collections-user-guide)) | Voronoi radial | **2** | Reference | Engine EULA, not open |
| 11 | [FractureRB](https://github.com/david-hahn/FractureRB) (Hahn & Wojtan) | Boundary elements | **1–2** for windows (viewed Fig. 9). A generic shatter; "branching is not handled". | None | GPL-2, offline |
| 12 | O'Brien & Hodgins 1999 ([arXiv](https://arxiv.org/abs/2303.02934)) | FEM | **2** (viewed Fig. 1). A crushed zone plus radials on a thick, low-resolution slab. | Background | Paper, no code |
| 13 | [ziran2019](https://github.com/penn-graphics-research/ziran2019) (CD-MPM) | Material point method | No glass evidence found | None | MIT |
| 14 | FEM/DEM "Y" family ([Chen thesis](https://etheses.bham.ac.uk/id/eprint/4263/1/Chen-X13PhD.pdf)) | Combined finite and discrete elements | **3** (viewed figures). Good engineering agreement, but in 3D one millisecond of simulation took about a week. | None | "Y" is called open-source by the thesis; licence not verified. The GPU version isn't open. |
| 15 | three-pinata, ConvexObjectBreaker, Blender Cell Fracture and Fracture Modifier | Voronoi or plane cuts | **1–2** for patterns | Slabs for falling pieces only (ideas) | MIT / MIT / GPL-3.0+ / GPL |
| 16 | GlassSystem, Godot kits, ImpactPuzzle, camera-failure | Procedural rings, Voronoi, stress graph | **1–2**. No better than our current generator. | None | none / MIT / MIT / not found |
| — | **Ruled out** | Breaking Good (non-commercial), ARCSim (non-profit use only), DeepFracture (trained per shape, no panes), CryEngine (gated source), EMU (not public), OpenFDEM (solver source not found), Y-HFDEM GPU (not open) | | | |

The physics laws in §5.4 are generators in their own right. They calibrate the
PD runs and re-tune the procedural fallback.

---

## 3. #1 and runner-up

### #1: Peridynamics.jl, run offline to build a break library

**Why:**

1. **It has the right physics, and the physics has been checked against real glass.**
   PD (bond-based and state-based) is what the glass-impact literature uses to
   reproduce soda-lime crack systems:
   - [Wang et al. 2024](https://par.nsf.gov/servlets/purl/10597886) reproduce ring
     cracks, the Hertz cone, radials, edge-initiated cracks and cracks parallel to
     the sides, and compare them with the plate after the test (viewed: Fig. 1
     photos; Figs. 5 and 17 damage maps).
   - [Rivera et al. 2019](https://www.frontiersin.org/journals/materials/articles/10.3389/fmats.2019.00239/full)
     get radial cracks, tangential cracks, branching and comminution (viewed:
     Figs. 3B and 10).
   - [Naumenko, Pander & Würkner 2022](https://www.sciencedirect.com/science/article/abs/pii/S0167844222000192)
     get a ring damage zone and then radials in float glass under ring loading.
   - For laminated glass under a drop weight, the hammer-like case,
     [Wu, Wang, Huang & Xu 2020](https://www.sciencedirect.com/science/article/abs/pii/S0263822319331083)
     use ordinary state-based PD: elastic-brittle glass, viscoelastic PVB and
     penalty adhesion. Their results "compared well with experimental
     observations" (abstract read).
2. **One 3D run gives everything the effect needs:**
   - the crack networks on both faces, which give each crack's lean through the
     thickness and where it reaches the edge faces
   - when the damage arrived at each point, which drives the crack-growth
     animation
   - the final displacement field. That gives each shard a physical tilt and slip,
     replacing our hand-made dish tilt.
   - the crushed zone, and small fragments with their velocities, which give the
     backward spray and the falling pieces
   - the interaction with the frame
3. **Variety comes built in.** Each seed gives a different but physically
   consistent break, from:
   - a random point cloud
   - Weibull-random strength (real glass strength is governed by flaws)
   - slightly different impact positions

   That answers "repetitive, like a tiling".
4. **Licence and maintenance.**
   - MIT. Julia itself is MIT ([repo](https://github.com/JuliaLang/julia)).
   - Active: v0.4.0 is on [Zenodo](https://zenodo.org/records/15304961), dated
     2025-04-29, and v0.5.4 is what installed here. The repo has 91 stars and 18
     forks (read).
   - The API has what this job needs
     ([API reference](https://kaipartmann.github.io/Peridynamics.jl/stable/api_reference/), read):
     - arbitrary point clouds
     - material parameters per point set
     - `contact!` between bodies (the hammer)
     - `velocity_bc!` and `displacement_bc!`
     - `no_failure!` sets (the frame)
     - VTK export and `read_vtk`
     - multithreading and MPI
5. **It works here.** See §4.

**Weaknesses, honestly:**

- **Resolution.** A PD crack is a damage band about one horizon wide, and it
  wanders at grid scale. The crack geometry has to be extracted and smoothed;
  §4.2 shows the extraction step.
- **Calibration.** PD strength depends on the horizon: "crack nucleation is linked
  to the horizon size (horizon-dependent strength)" (Wang et al. 2024, read). The
  PD crack speeds in that paper were 1,900–2,800 m/s for radials (read). So the
  material parameters have to be calibrated (§6.2, §6.6).
- **Unknowns.** Modelling the laminated interface inside one body is unverified
  (§6.2). The frame boundary condition needs care: my hard clamp caused cracks
  along the frame line. Compute cost is in §6.5.

### Runner-up: PeriLab.jl

- **What it is.** BSD-3, v2.2.2 released 2026-07-21 ([repo](https://github.com/PeriHub/PeriLab.jl), read).
- **What it has** ([docs](https://perihub.github.io/PeriLab.jl/stable/),
  [SoftwareX paper](https://elib.dlr.de/203582/1/1-s2.0-S2352711024000712-main.pdf), read):
  - bond-based, ordinary state-based and non-ordinary state-based PD
  - damage by critical stretch or by an energy criterion
  - contact models and MPI
  - YAML input and Exodus output
  - surface correction and bond filtering
  - **coupling to finite elements.** A cheap FE far field with PD near the
    impact could cut cost.
- **Pick it over #1** if Peridynamics.jl falls short on the PVB or interface
  model, or on cost.
- **Not tested here.** Its paper reports that 100 processes made a 2-million-DOF
  example 30× faster (read).

**Third, as a cross-check: LAMMPS PERI** (§4.1). It is the only open code with
a published glass-plate impact study (Rivera 2019), but it is GPL and
lattice-based.

---

## 4. What I ran here (measured here)

All of it was installed in the scratchpad. The project was not touched.
`nproc` = 2, RAM 7 GB.

### 4.1 LAMMPS PERI

- **It installs.** The PyPI wheel `lammps` 2025.7.22.4.0 plus the PyPI `mpich`
  runtime loads with 67 packages, including **PERI** and **OPENMP**.
  [`peri/pmb/omp` and `peri/lps/omp`](https://docs.lammps.org/pair_peri.html)
  exist.
- **The documented example reproduces.** I rebuilt it from the
  [Howto](https://docs.lammps.org/Howto_peri.html) (`pa/lmp/in.disk`):
  - a brittle disk 74 mm across and 2.5 mm thick, on a simple cubic lattice at
    0.5 mm spacing, with a 1.5 mm horizon and the PMB model
  - a rigid sphere at 100 m/s

  It created **103,110 nodes, the same number the Howto gives.** 600 steps
  (60 µs) took **141–148 s** on 2 OpenMP threads.
- **The regular lattice shows** (viewed, `img/lmp-both.png`). There are radials
  with branching, but the pattern has strong 4- and 8-fold **kaleidoscopic
  symmetry**. Rivera et al.'s Fig. 10 shows the same artifact.
- **Random strength helps.** With four random strength classes (critical stretch
  ±15%) and an off-centre impact, most of the symmetry goes
  (`img/lmp3-both.png`). Crack directions still favour the lattice axes.
- **Jitter failed.** Moving the nodes randomly by 0.08 mm made every bond break.
  I didn't investigate why.
- **Licence:** GPLv2 ([LAMMPS](https://docs.lammps.org/Intro_opensource.html)).

### 4.2 Peridynamics.jl (v0.5.4 on Julia 1.11.7, `pa/pdjl/`)

**Disk test** (`disk.jl`):

- **Setup:** soda-lime-like glass (E 72 GPa, ρ 2,500 kg/m³; G_c 8 J/m² is an
  estimate), 0.5 mm spacing with the points jittered by ±15%, a steel ball at
  100 m/s, off centre.
- **Size and time:** 86,000 points, 7.26 M bonds, 1,054 steps (60 µs), **136 s**
  including compilation.
- **Output** (viewed, `img/pdjl-both.png`): a crushed spot and **4–5 smooth,
  gently curving radial cracks, with no lattice artifact**. It reads like a real
  star crack.

**Hammer on a framed pane** (`pane.jl`):

- **Setup:**
  - pane: 100 × 100 × 4 mm at 0.8 mm spacing
  - frame: the outer 5 mm held in z and not allowed to fail
  - hammer: a 0.5 kg, 16 mm steel sphere at 6 m/s, off centre
- **Size and time:** 78,125 points, 6.58 M bonds, 4,364 steps (390 µs), **454 s**.
  Peak memory 925 MB.
- **How it evolved** (viewed, `img/pane-sheet.png`; struck face on top, back face
  below):
  - about 180 µs: an X of radials
  - 275 µs: radials across about 70% of the pane
  - 390 µs: a larger crushed centre, radials reaching the frame, and **a
    circumferential arc forming on the struck face**
- **Artifact:** cracks along the clamped frame line. They come from my hard
  clamp; a real glazing bead gives.
- **Throughput:** 6.3 × 10⁷ bond-steps per second on 2 threads (computed).

**Extracting the crack lines** (`skeleton.py`, `img/pane-skeleton.png`):

1. Take each face's maximum damage and rasterize it at 0.2 mm.
2. Threshold it.
3. Skeletonize it with scikit-image.

The struck and back faces differ: the arc, and one extra crack, appear only on
the struck face. That difference is the through-thickness information.

### 4.3 What this does and doesn't show

- **It shows:**
  - The toolchain installs here.
  - A short script reproduces the right order of events and the right topology
    for a hammer striking a framed pane: back-face radials, a crushed centre, and
    a later arc on the struck face.
  - Pulling the data out is straightforward.
- **It doesn't show** photoreal geometry at production resolution, laminated
  behaviour, or calibrated counts. Steps 2–3 of §6 cover those.

---

## 5. The candidates in detail

### 5.1 Physically based simulation

**Peridynamics.jl.**

- **What it does:** bond-based, ordinary state-based, non-ordinary state-based and
  continuum-kinematics-inspired PD. Explicit dynamics (Velocity Verlet). Failure
  by critical stretch or G_c. Contact between bodies.
  The [Kalthoff-Winkler tutorial](https://kaipartmann.github.io/Peridynamics.jl/stable/generated/tutorial_kalthoff-winkler_dynfrac/)
  uses 180,000 points at 1 mm (read).
- **Output:** see §4.
- **Cost:** see §6.5.
- **Browser:** no. Offline: yes.
- **Laminated:** materials per point set. The handling of bonds that join two
  different materials is unverified.
- **Debris:** a per-point damage field, and fragments once the points are
  clustered.

**PeriLab.jl.** See §3.

**Peridigm.**

- BSD-3, Sandia 2011–2020 (read).
- C++ on Trilinos. "No releases published".
- Its README's brittle example uses the linear peridynamic solid model with a
  critical-stretch failure law (read).
- A heavy build. A fallback only.

**[PeriFast/Dynamics](https://github.com/PeriFast/Code).** MIT. A MATLAB code
using FFT-based fast convolution
([paper](https://link.springer.com/article/10.1007/s42102-023-00097-6)). It needs
MATLAB, which is paid; Octave support isn't stated. Impractical for us.

**[PeriPy](https://github.com/alan-turing-institute/PeriPy).**

- MIT. OpenCL on the GPU: "between 1.4 and 10.0 times faster than a similar
  existing OpenCL implementation"
  ([arXiv 2105.04150](https://ar5iv.labs.arxiv.org/html/2105.04150), read).
- **Archived 2025-04-30.** Unmaintained.

**LAMMPS PERI.** §4.1. Rivera et al. 2019 used LAMMPS for their glass plate:
2.5 mm thick, 37 mm radius, 0.5 mm lattice, 2 mm horizon (read).

- **Their output** (viewed, Figs. 3B and 10):
  - a crushed zone
  - a radial star
  - a ring near 0.8 R
  - branching
  - lattice symmetry, and wide damage bands
- **Their finding:** damage ∝ G_c^(−0.526) (read).

**EMU** (Sandia), used by Bobaru's group.

- They used "a slightly modified version of EMU" (read). These are the best
  published glass results.
- Their grid was 452 × 452 × 16 nodes for a 3.3 mm glass plate and 452 × 452 × 14
  for the backing, at 0.225 mm spacing, with δ = 0.9045 mm (read). That is about
  **6.1 M nodes for a 101.6 mm plate** (computed).
- That is the resolution needed to match photos in detail. EMU isn't public.

**FractureRB / FractureBEM** (Hahn & Wojtan, boundary elements).

- **Repo:** GPL-2.0 (GitHub API, read). Created 2016-04-11, last pushed
  2025-03-24. HyENA and VCG are bundled. It needs OpenVDB with a TreeIterator fix.
- **2015 paper** ([PDF](https://pub.ista.ac.at/group_wojtan/projects/2015_Hahn_HRBFwBE/download/FractureBEM.pdf)):
  quasi-static, no glass examples (read).
- **2016 paper** ([PDF](https://pub.ista.ac.at/group_wojtan/projects/2016_Hahn_FastFracture/download/2016_Hahn_FastFracture_small.pdf)):
  - It has a "thin (but volumetric) window" (Fig. 9c–d, viewed): a ball punches
    through, giving 455 fragments in 1,256.85 s (Table 1, read).
  - It reads as a generic shatter, not a web of radial and concentric cracks.
  - "branching is not handled at the moment" (read).
- **Verdict:** the wrong tool for panes.
- The replicability.graphics page for the 2016 paper serves injected gambling
  content. I didn't use it.

**Phase-field.**

- [RACCOON](https://github.com/hugary1995/raccoon): LGPL-2.1, built on MOOSE,
  dynamic phase-field fracture with branching (read).
- [Molnár 2024](https://proceedings.challengingglass.com/index.php/cgc/article/download/491/476/2078) (CC BY 4.0):
  - AT1 phase-field in commercial Abaqus, through custom UMAT/UEL subroutines.
  - It reproduces dynamic branching and the measured crack speeds.
  - Its mesh is 0.125 mm with a 0.5 mm length scale.
  - No impact patterns, and no code shared (read).
- [Schmidt, Zemanová & Zeman](https://arxiv.org/html/2309.13606v2) (FEniCS,
  [code](https://gitlab.com/js_workdir/article_support/stoch_pf_beams)) and
  [Schmidt et al. 2020](https://ar5iv.labs.arxiv.org/html/2010.00375): laminated
  beams and plates in quasi-static bending, not impact (read).
- **Verdict:** cleaner crack lines than PD. But the mesh has to resolve a length
  scale much smaller than the thickness over the whole pane, which is unaffordable
  for whole panes (estimate). Useful for local crack-face studies only.

**Material point method (MPM).**

- ziran2019 (MIT) implements CD-MPM. It runs on Ubuntu 18.04 with OpenVDB and TBB.
- Its accessible [technical document](https://mingg13.github.io/papers/2019_Fracture_tech_doc.pdf)
  has only mode I and II tests (read). The main paper is unreadable here
  (dl.acm.org 403).
- No glass or plate evidence found. Thin plates need very fine grids (estimate).

**Combined finite-discrete element (FDEM) and discrete element (DEM).**

- **Chen thesis**
  ([Birmingham 2013](https://etheses.bham.ac.uk/id/eprint/4263/1/Chen-X13PhD.pdf),
  read and viewed):
  - It uses Munjiza's "open-source FEM/DEM program Y". The licence is not verified.
  - In 3D, "each 1ms modelling may take one week of computation".
  - It shows Timmel et al.'s 2007 laminated-plate finite-element patterns
    (Fig. 7.11, viewed): a spider web of radial and tangential cracks that looks
    right.
- **GPU FDEM:** Y-HFDEM 2D/3D is "284 times faster"
  ([Chen, Ou, Fukuda, Chan & Liu 2023](https://www.sciencedirect.com/science/article/abs/pii/S0013794422006476), read).
  Not open.
- **[OpenFDEM](https://openfdem.com/):** the solver source isn't in its
  [GitHub org](https://github.com/OpenFDEM-geomechanics). The documentation repo is
  GPL-3.0 and the examples Apache-2.0 (read).
- **[GranOO](https://www.granoo.org/):** GPL v3, discrete elements for silica
  glass. It has "Glass impact" and "Bullet impact on brittle disk" demos, as
  YouTube videos I couldn't view.
- **[Behera et al. 2004](https://arxiv.org/abs/cond-mat/0404057):** a 2D cell
  model; fragment-mass exponent ≈ 2 (read).
- **Graphics bonded DEM:** [Lu et al. 2025](https://arxiv.org/html/2308.10459v2)
  drop a ceramic plate; no code mentioned (read). Their TVCG 2021 paper is
  unreadable here.

**Thin-sheet and graphics FEM.**

- **[ARCSim](http://graphics.berkeley.edu/resources/ARCSim/) v0.3.1** implements
  Pfaff et al. 2014, tearing and cracking of thin sheets. It is "for non-profit
  use" (read), so it is **ruled out**.
- **[Busaryev, Dey & Wang 2013](https://wanghmin.github.io/publication/busaryev-2013-afs/Busaryev-2013-AFS.pdf):**
  paper and foil only, no code (read).
- **[Koschier et al. 2014](https://animation.rwth-aachen.de/media/papers/2014-SCA-AdaptiveBrittleFracture.pdf)**
  and **[Chen et al. 2014](http://zhilichen.com/research/fracture_refinement/2014-PAF.pdf):**
  no glass, no code (read).
- **[Smith, Witkin & Baraff 2000](https://graphicsinterface.org/wp-content/uploads/gi2000-5.pdf):**
  wine glasses and a glass table, giving "long, narrow glass-like fragments". No
  pane pattern (read).
- **[O'Brien & Hodgins 1999](https://arxiv.org/abs/2303.02934)**, Fig. 1
  (viewed): a crushed zone and radials on a thick slab.
  - Their glass used λ = μ = 1.04 × 10⁸ N/m². They state they used Lamé constants
    "significantly less than those of real materials" (read).
  - That makes it about 270× softer than real glass (computed: E ≈ 2.6 × 10⁸ Pa).
  - 75–667 minutes per simulated second. No code.
- **[Mandal, Chaudhuri & Chaudhuri 2021](https://history.siggraph.org/learning/scalable-visual-simulation-of-ductile-and-brittle-fracture-by-mandal-chaudhuri-and-chaudhuri/)**
  (SIGGRAPH poster): graph-based FEM. No glass mentioned (read).

**NVIDIA Blast.**

- **Licence:** BSD-3 for the whole PhysX repo, which includes `blast/`
  ([LICENSE](https://github.com/NVIDIA-Omniverse/PhysX/blob/main/LICENSE.md),
  [README](https://github.com/NVIDIA-Omniverse/PhysX), read).
- **Authoring** ([docs](https://docs.nvidia.com/gameworks/content/gameworkslibrary/blast/1.1/authoring_docs/BlastUe4_FractureSettings.html),
  [changelog](https://nvidia-omniverse.github.io/PhysX/blast/docs/CHANGELOG.html),
  read):
  - Voronoi Radial (Angular Steps, Radial Steps, Angle Offset)
  - cutout fracture "used a Bitmap texture for fracture cutout", which the docs
    describe as ideal for glass windows
  - "Noisy cutout fracture" and a "Conic cutout option"
- **Stress solver:** also packaged as a Rust crate in the
  [Glavin001 fork](https://github.com/Glavin001/PhysX).
- **Use:** optional. It turns a PD crack image into chunk meshes with noisy,
  leaning faces, and gives a support graph for deciding what detaches. It **does
  not generate patterns**.

**Learning-based.**

- [DeepFracture](https://github.com/nikoloside/TEBP-DeepFracture) (MIT): trained
  "tailored to one target shape", on boundary-element simulations (bunny, pot)
  ([project](https://nikoloside.graphics/deepfracture/), read). Not for panes.
- Breaking Good: non-commercial licence (earlier pass).

**Engineering models of laminated glass.**

- [Wang, Chen, Xu, Zang & Yoshimura 2020](https://www.sciencedirect.com/science/article/abs/pii/S0045794920300419):
  extrinsic cohesive shells, "implemented into an open source code, DYNA3D"
  (abstract read). The modified code isn't public as far as I could find.
- Wu et al. 2020: ordinary state-based PD (above).
- [Kojima et al. 2019](https://www.jstage.jst.go.jp/article/mej/6/6/6_19-00316/_article/-char/en):
  float glass, 4.43 m/s drop weight. An elastic model with tensile failure gave
  "characteristics of the bending fracture mode" (abstract read). The PDF is
  robots-blocked.

### 5.2 Production and procedural tools

**Houdini RBD Material Fracture "Glass"**
([glass guide](https://www.sidefx.com/docs/houdini/destruction/glass.html),
[node](https://www.sidefx.com/docs/houdini/nodes/sop/rbdmaterialfracture.html),
read; docs images viewed).

- **How it works:**
  - Flat panes: "only performs sequential voronoi fractures for the radial cracks
    and the concentric cracks".
  - Curved glass: boolean fracturing of high-resolution geometry, with edge noise.
- **Parameters:**
  - Radial Crack Number and Number Variance
  - Minimum Width (the spacing of concentric cracks) and Impact Spread
  - Discontinuity Freq and Size
  - Chipping: Corner Ratio, Corner Depth, Directional Noise
  - Edge Noise, with Fade From Origin and Fade From Border
  - separate Radial and Concentric glue strengths
- **Output** (viewed): the curved-glass render is convincing at a glance, but the
  flat pane is a regular dartboard.
- **Ideas worth borrowing:** chipping for debris, separate glue strengths for
  radial and concentric bonds, and noise that fades toward the origin and the
  border.

**Unreal Chaos Radial** (read): Center, Normal, Radius, Angular Steps, Radial
Steps, Angle Offset, and Variability (random spacing of the Voronoi sites). It is
Voronoi.

**Blender.**

- Cell Fracture is GPL-3.0-or-later ([extension page](https://extensions.blender.org/add-ons/cell-fracture/), read).
- The Fracture Modifier uses voro++ Voronoi and has no glass presets
  ([docs](https://github.com/JT-a/blender-fracture-docs/wiki/Fracture_Documentation), read).
- Both are GPL and Voronoi.

**CryEngine.**

- In its breakable glass, "The Shader handles all the fracturing". There are
  `Glass_breakable_safetyglass_*` surface types
  ([tutorial](https://docs.cryengine.com/display/CEMANUAL/Tutorial+-+Breakable+Glass), read).
- The source is "distributed via a private repository"
  ([ReadMe](https://github.com/CRYTEK/CRYENGINE_ReadMe), read).
- **Study the docs only.** Unofficial mirrors exist; don't use them.

**Rainbow Six Siege.** "a fully-procedural destruction system... based on the
material"
([PCGamesN](https://www.pcgamesn.com/plaster-blaster-rainbow-six-siege-s-fully-procedural-destruction-system-explained),
[Ubisoft interview](https://news.ubisoft.com/en-us/article/4GHX2yepSaKkflLjLAlpwO/the-art-of-destruction-in-rainbow-six-siege-an-interview-with-julien-lheureux),
read). There are no glass details in either.

**Teardown and Frostbite.** I found no public technical write-up on their glass
before my search budget ran out. See §8.

**Community kits:**

| Kit | Licence | How it works | Read |
|---|---|---|---|
| [Stand43, Godot breakable glass](https://github.com/Stand43/godot_breakable_glass_custom) | MIT | Rings plus radials, with jitter | read |
| [Lord0Sanz, Godot glass break effect](https://github.com/Lord0Sanz/Godot-Glass-Break-Effect) | MIT | Shader | read |
| [ImpactPuzzle](https://github.com/proceduraljigsaw/ImpactPuzzle) | MIT | "jagged, skewed, concentric point rings" plus tabs, for laser-cut jigsaws | read |
| [camera-failure](https://github.com/manavprabhakar/camera-failure) ([paper](https://arxiv.org/html/2405.15033)) | No licence file found | A Delaunay graph with stress propagation. Its own simplifying assumption: "multiple paths of stress propagation do not occur", so it can't branch. | read |

None of them beats our current generator.

**The earlier pass's finds, re-evaluated:**

| Item | Verdict |
|---|---|
| [three-pinata](https://github.com/dgreenheck/three-pinata) | Voronoi plane cuts from seeds. Fine for falling slabs, not for patterns. |
| [ConvexObjectBreaker](https://threejs.org/docs/pages/ConvexObjectBreaker.html) | Convex input only. |
| [GlassSystem](https://github.com/Tiitan/GlassSystem) | Only as good as the 2D pattern you give it. No licence, so read only. |
| [Smash Hit](https://blog.voxagon.se/2014/05/13/cracking-destruction.html) | Random planes. Runtime ideas only. |
| Müller 2013 | Its "align a precomputed pattern to the impact" is exactly our runtime step. |
| [Iben & O'Brien](https://escholarship.org/uc/item/7j62s1nd) | A heuristic surface stress field. Better suited to glaze and mud. |
| [Desbenoit et al.](https://www.researchgate.net/publication/226590041_Modeling_cracks_and_fractures) | 2D atlases. Supports the library design. |
| Sellán, "Breaking Good" | Non-commercial. |
| Godot shaders and the Kondrashova CodePen | Visual benchmarks only. |

### 5.3 Data-driven and example-based

**Glondu, Muguercia, Marchal, Bosch, Rushmeier, Dumont & Drettakis, "Example-Based Fractured Appearance" (EGSR 2012).**

- The [project page](http://ggg.udg.edu/publicacions/UsersWebs/lien_fract_proj/index.html)
  (read) says it matches "the statistics of fracture patterns in a photograph",
  using a "physically-based fracture model" and Bayesian optimisation.
- The [paper](http://diglib.eg.org/EG/CGF/volume31/issue4/v31i4pp1547-1556.pdf) is
  unreadable here (robots). No code is listed.
- **Borrow the method:** fit the simulator's parameters to statistics measured from
  reference photos. The parameters to fit:
  - strength scale and Weibull modulus
  - G_c
  - hammer mass and speed
  - stiffness of the frame support

**Mould 2005** ([PDF](https://people.scs.carleton.ca/~mould/papers/crack.pdf), read):
pavement, mud and stone. "Not all images are amenable". Not for glass.

**Reference photos we may use:**

- **PLOS ONE 2014 figures** (CC BY): laminated glass, with quantities (viewed:
  Figs. 1, 4, 5).
- **Wikimedia Commons** categories (earlier pass).
- **Wang et al. 2024 photos:** study only. That is the accepted manuscript on NSF
  PAR; the publisher holds copyright.
- **Our own `src/effects/optics/crack-photo.ts`** already turns a photo into
  shards. It doubles as the tool for measuring the calibration statistics.

**No open-source, example-based glass crack synthesiser was found.**

### 5.4 Physics laws usable directly as generators

| Law | Value | Source | Use |
|---|---|---|---|
| Radial count | N ∝ V^½, N ∝ G_c^(−⅓). 1 mm plate: 3 → 11 radials from 15 → 120 m/s | [APS Physics](https://physics.aps.org/articles/v6/48), [Nature Physics](https://www.nature.com/articles/nphys2654) (full paper paywalled; prefactor and thickness exponent unknown) | Count vs. strike speed |
| Spread of counts, laminated | 15–65 radials at 2.42 m/s, 18–112 at 3.7 m/s | PLOS 2014 | Sample counts from this, don't use a fixed value |
| Radials vs. rings | L_c drops as N_r rises (about 600 → 60 mm for N_r 20 → 60) | PLOS Fig. 5 (viewed) | Budget for rings |
| Branching distance | r_b = (A_b/σ)², A_b = 3.54 MPa·m^½. Mirror A_m = 1.81 | [NASA TM-1998-206536](https://ntrs.nasa.gov/api/citations/19980137602/downloads/19980137602.pdf) | Fork spacing from the local stress |
| Fork angle | 30–45° uniaxial, larger biaxial | Quinn 2019, via `docs/broken-glass-cracks.md` (not re-read) | Fork angles |
| Mosaic topology | T-junction mosaics: v̄ → 4. Voronoi: [3, 6] | [Domokos et al.](https://ar5iv.labs.arxiv.org/html/1912.04628) | Check for realism |
| Fragment masses | Power law, exponent ≈ 2 | [Behera et al.](https://arxiv.org/abs/cond-mat/0404057) | Sizes of debris and grit |
| Order and timing | Back-face radials first, then struck-face radials, then circular cracks (200 / 800 / 1,200 µs, laminated) | PLOS Fig. 4; Wang 2024 | Animation order |
| Damage vs. toughness | Damage ∝ G_c^(−0.526) (PD result) | Rivera 2019 | Strike energy → damage |
| Concentric shape | Straight segments that end on radials, in held panes | SWGMAT | Ring shape |
| Hertz cone angle | Dynamic angles cited for ceramics: 28° at 40 m/s, 48° at 90 m/s. Glass ceramics: 35° at 60 m/s, 55° at 350 m/s. No soda-lime value for a hammer was found. | Wang 2024 (read) | Context only |

---

## 6. How to integrate it with our engine

### 6.1 Where it plugs in

- The existing types fit. `fracture.ts` already defines
  `Fracture { kind, impact, shards[], cracks[], crush }`, and each `Shard` has
  `poly`, `tiltX`, `tiltY`, `slip`, `reach`, `crushed` and `missing`.
  `crack-photo.ts` already builds the same structure from a photo.
- Add **`src/effects/optics/fracture-library.ts`** with
  `fractureFromLibrary(impact, lib): Fracture`. It returns the same type, with
  these optional additions:
  - per crack vertex: `t[]` (arrival time) and `lean[]`
  - per crack: `face` (`struck` / `back` / `both`) and `ply` (for laminated)
  - per break: a `debris[]` list
- The renderers stay as they are: the shard map, crack-face, crack-side,
  crack-light and crack-shadow modules. The procedural `fracture()` stays as the
  fallback.

### 6.2 Offline simulation (`tools/fracture-sim/`, a Julia project pinned to Peridynamics v0.5.x)

1. **Pane classes.** CSS 18 px corresponds to 4–6 mm, so about 3–4.5 px/mm
   (computed). An 800 px panel is then about 180–270 mm.
   - Simulate each pane class we actually use, at its physical size.
2. **Glass.** Soda-lime: E 72 GPa, ν 0.22 (Wang 2024). ρ about 2,500 kg/m³
   (earlier pass, [soda-lime glass](https://en.wikipedia.org/wiki/Soda%E2%80%93lime_glass);
   Wang 2024 doesn't state it).
   - Use ordinary state-based PD, since bond-based PD fixes ν at 1/4 (read, Wang
     2024).
   - Calibrate G_c and strength.
   - Strength: Weibull-random, as random point sets each with their own critical
     stretch.
   - Points: jittered or Poisson-disk, never a bare lattice (§4.1).
3. **Frame.** Model it as a compliant bead (a soft layer, or a spring support),
   not a hard clamp. My clamp made spurious frame-line cracks.
4. **Hammer.** A separate body with a mass-equivalent density and a rounded face.
   - Speeds of about 2–8 m/s (estimate).
   - Strike positions: centre, off-centre, near an edge, near a corner.
5. **Laminated.**
   - **A.** One body with point sets glass / PVB / glass. The PVB is soft and
     rate-dependent (Wu et al. modelled it as viscoelastic) and takes
     `no_failure!`.
     - Verify how Peridynamics.jl handles a bond joining points with different
       parameters.
   - **B.** If A doesn't work, use PeriLab.jl's models.
   - **C.** A surrogate backed by PLOS:
     - simulate a monolithic plate
     - use its radial network in both plies, with a small offset
     - put circular cracks only in the impacted ply, sized by the radial-vs-ring
       trade-off in §5.4
6. **Export.** Write VTK every 50–100 steps, for the arrival times.

### 6.3 Post-processing (Python)

Tools: numpy, scipy, [scikit-image](https://raw.githubusercontent.com/scikit-image/scikit-image/main/LICENSE.txt)
(BSD-3/BSD-2/MIT), [skan](https://github.com/jni/skan) (BSD-3) and
[meshio](https://github.com/nschloe/meshio) (MIT, reads VTU).

1. **Crack lines.** For each face, rasterise the maximum damage at 0.1–0.25 mm,
   threshold it, and skeletonise it (as in `pa/pdjl/skeleton.py`).
2. **Graph.** Build it with skan. Simplify it, and smooth it with a spline that
   limits curvature.
3. **Kinds.** Class each crack as radial, branch, ring or crush, from its angle to
   the impact direction and its topology.
4. **Arrival time.** The first export in which a point's damage passes the
   threshold.
5. **Lean.** The offset between the struck-face and back-face lines, over the
   thickness. Also record where cracks meet the edge faces.
6. **Fracture-face zones.** Mirror, mist and hackle, from distance and arrival
   speed.
7. **Shards.** The faces of the planar graph. Each one's tilt and slip is a rigid
   fit to the final displacements of its points.
8. **Crushed spot.** The polygon of the fully damaged region.
9. **Debris:**
   - grit and powder: amount from the fully damaged volume, sizes from the
     exponent-2 law
   - slivers and chunks: the small connected fragments
   - velocities: from PD (the backward spray, and which way pieces fall)
10. **Output.** Write JSON in millimetres, then gzip it.

### 6.4 At runtime

1. **Pick a pattern** by glass kind, energy bucket, impact position class
   (relative to the frame) and aspect class.
2. **Place it.** Map its impact point onto the click, mirror it where the frame is
   symmetric, scale mm to px, and clip to the pane.
3. **Animate by arrival time,** slowed about 1,000×.
4. **Load the library lazily.** It can be stored in Supabase and swapped from the
   admin portal, as Ony prefers. Size: about 20–60 KB gzipped per pattern
   (estimate).
5. **Fall back** to the recalibrated procedural generator for pane shapes the
   library doesn't cover.

### 6.5 Compute budget

**Measured:** 6.3 × 10⁷ bond-steps per second on 2 threads. Peak memory 925 MB for
about 7 M bonds, roughly 90 bytes per bond including Julia's own footprint
(computed).

Production estimates use about 90 bonds per point and the measured time step,
scaled by spacing. The 32-thread figures assume linear scaling (estimate).

| Pane | Spacing | Points | Bonds | Steps for 1 ms | 2 threads (here) | 32 threads | Memory |
|---|---|---|---|---|---|---|---|
| 200 × 150 × 4 mm | 0.5 mm | 0.96 M | 86 M | 17,400 | about 6.6 h | about 0.4 h | about 8 GB, over this container's limit |
| 200 × 150 × 4 mm | 0.4 mm | 1.9 M | 169 M | 21,800 | about 16 h | about 1 h | about 15 GB |
| 300 × 200 × 5 mm, 1.5 ms | 0.5 mm | 2.4 M | 216 M | 26,200 | about 25 h | about 1.6 h | about 19 GB |

- **This container:** tuning runs at 0.8–1 mm spacing (minutes).
- **Production:** a 32–64 GB, 16–64-core Linux machine or cloud VM for one to two
  days builds a library of 30–50 breaks (estimate).

### 6.6 Checking against reality

- **Side by side** with the PLOS and Commons photos.
- **Statistics:**
  - the distribution of radial counts
  - the ratio of ring length to radial length
  - the share of T-junctions
  - mean shard corners near 4
  - the fragment-size distribution
  - fork distances against (A_b/σ)²
- **Unit tests** (vitest): the data schema, the placement transforms, that the
  shards tile the pane by area, and that arrival time never decreases along a
  crack.

### 6.7 Risks and open questions

- How much smoothing the wandering PD crack lines need.
- Calibrating strength separately from G_c.
- The laminated interface (§6.2.5).
- Artifacts from the frame boundary condition.
- Whether the library covers enough pane sizes and strike positions.
- Compute cost.
- PD crack speeds run high. The animation uses relative timing, so this matters
  less.

---

## 7. Licences

**Running GPL code offline is fine; only its output reaches the site.**

- GPLv2 §0: "the output from the Program is covered only if its contents
  constitute a work based on the Program" (read, the
  [GPLv2 text in FractureRB](https://raw.githubusercontent.com/david-hahn/FractureRB/master/LICENSE)).
- GPLv3 §2: "The output from running a covered work is covered by this License
  only if the output, given its content, constitutes a covered work" (read, the
  [GPLv3 text in OpenFDEM.github.io](https://raw.githubusercontent.com/OpenFDEM-geomechanics/OpenFDEM.github.io/main/LICENSE)).
- So data generated offline with LAMMPS (GPLv2), GranOO (GPLv3) or RACCOON
  (LGPL-2.1) may ship, but the code may not. gnu.org's FAQ was robots-blocked.
  **Confirm with counsel if it matters.**

| Use | Items |
|---|---|
| Can ship in the site's code | MIT and BSD-3: Peridynamics.jl, PeriLab.jl, Peridigm, NVIDIA Blast, ziran2019, PeriPy, PeriFast, three-pinata, the Godot kits, ImpactPuzzle |
| Offline only | LAMMPS (GPL-2), FractureRB (GPL-2), GranOO (GPL-3), RACCOON (LGPL-2.1), Blender (GPL) |
| Study the docs only | Houdini, Unreal, CryEngine |
| Unusable | Breaking Good (non-commercial), ARCSim (non-profit use), GlassSystem (no licence), camera-failure (licence not found) |

---

## 8. Pages I couldn't read, and gaps

**Blocked or failed:**

| Site | Result | What it held |
|---|---|---|
| diglib.eg.org | robots | Glondu 2012 paper |
| hal.science | Anubis access denied | Star-crack formation via low-velocity impact; author copy of the Vandenberghe PRL |
| degruyterbrill.com | 405 | Bobaru 2012, layered glass |
| dl.acm.org | 403 | "Simulating Brittle Fracture with Material Points"; CD-MPM main paper |
| onlinelibrary.wiley.com | 403 | Mandal 2023 |
| docs.nvidia.com | robots | Blast CutoutConfiguration API page |
| gnu.org | robots | GPL FAQ |
| J-STAGE | robots | Kojima 2019 PDF |
| joshuahwolper.com | robots fetch failed | CD-MPM page |
| GitHub tree pages | robots | LAMMPS `examples/peri` |
| api.github.com | 403, rate limit | PhysX and camera-failure licence lookups |
| granoo.org | gallery 404 | Demo videos are on YouTube, not viewable |

**Pages not used:** the replicability.graphics page for Hahn 2016 shows injected
gambling content.

**Gaps:**

- **WebSearch budget.** It ran out partway through (200 calls in this session).
  Not done because of that:
  - a wider sweep of 2023–2026 SIGGRAPH, Eurographics and SCA glass papers
  - Teardown's and Frostbite's glass
  - the authors of "Simulating Brittle Fracture with Material Points"
- **Not viewed:** outputs from PeriLab, Peridigm, GranOO, RACCOON and CD-MPM.

---

## 9. Files from this session (scratchpad `research/pa/`)

- **Scripts:**
  - `pdjl/disk.jl`, `pdjl/pane.jl`, `pdjl/skeleton.py` (Peridynamics.jl tests and
    the line extraction)
  - `lmp/in.disk`, `lmp/in.disk3` (LAMMPS)
- **Images I looked at** (`img/`):

  | Image | What it shows |
  |---|---|
  | `pdjl-both.png` | Peridynamics.jl disk star |
  | `pane-sheet.png` | Hammer on a framed pane, over time |
  | `pane-skeleton.png` | Extracted crack lines |
  | `lmp-both.png` | LAMMPS lattice kaleidoscope |
  | `lmp3-both.png` | LAMMPS with random strength |
  | `riv6-000-s.jpg`, `riv10-000-s.jpg` | Rivera 2019 |
  | `wang4-s.jpg` | Bobaru photos |
  | `wang10-s.jpg` | Bobaru PD damage maps |
  | `wang19-s.jpg` | Bobaru zoom vs. photo |
  | `plos-g001.png`, `plos-g004.png`, `plos-g005.png` | Real laminated breaks and statistics |
  | `hou-curved-s.png`, `hou-montage.jpg` | Houdini docs |
  | `chenhi-p203-203.png` | Timmel et al.'s laminated patterns |
  | `hahn-p9-09.png` | FractureRB window |
  | `obrien1-s.jpg` | O'Brien & Hodgins slab |

- **Tools installed in the scratchpad:**
  - `lmpvenv/` (PyPI lammps and mpich)
  - `julia-1.11.7/`, with `jdepot/` holding Peridynamics 0.5.4
