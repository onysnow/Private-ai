# Jello / slime cube (R12)

Research only, 2026-10-01. No project code changed. Every claim has a source
link. **(computed)** marks a number worked out here from cited inputs, with the
working shown. **(measured)** marks a number from a throwaway benchmark run in
this session's scratchpad (not in the repo; method in §1.3). **(estimate)**
marks a judgement no source states.

Feeds task 80: a jello / slime cube on the photography site (Halloween), with
things suspended inside it (eyeballs, bones, bugs). It wobbles and jiggles when
pushed or dragged, and every light in the scene lights it: the cursor lamp,
the flash, the flare and the black light.

Builds on [tools-survey.md §3](tools-survey.md) (soft bodies: adopt Rapier 2D,
fallback port Ten Minute Physics), [uv-blacklight.md](uv-blacklight.md) (UV
tokens, quinine), [balloons.md](balloons.md) (the per-light shader pattern) and
[shadows.md](shadows.md).

---

## 0. Short answer

- **Physics: Rapier 2D, as R0 decided, with a better-chosen setup.**
  - Use a `grid` body with `NeoHookean` cells on the `Fem` solver.
  - Its wobble frequency follows √E, so it is predictable: f ≈ 1.05·√(E/100) Hz
    for a 12×12 unit cube **(measured)**. It costs **≈0.85 ms/step** in this
    container **(measured; not a phone)**.
  - The `Volume` cell model with uniform softness collapsed in one of four
    settings **(measured)**. Don't use it.
  - The cheapest tier is a 48-particle `polygon` with shape matching, at
    0.11 ms/step **(measured)**.
  - **Suspended objects must not be colliders inside the jelly.** In the test,
    a ball collider dropped through the grid to the floor **(measured)**.
    Either `attachParticle` them, which held **(measured)**, or better, embed
    them by barycentric skinning (render-only, §3.4).
  - **Turn sleeping off while the cube is on screen.** The body froze in
    mid-wobble when it fell asleep **(measured)**.
- **Real jello numbers.**
  - Cherry Jell-O: G′ ≈ 168 Pa, G″ ≈ 6 Pa at 10 rad/s, critical strain 16%
    ([Ata et al. 2026, *Gels* 12:295](https://www.mdpi.com/2310-2861/12/4/295)).
  - So the shear-wave speed is 0.40 m/s, and a 6 cm cube rocks at about
    **1.7 Hz** (quarter-wave, T = 4H/Vs) with material damping ζ ≈ 0.018
    **(computed, §2.1)**.
  - Slime (PVA–borax) is elastic over short times but flows over ~10 s
    ([Angelova et al. 2016](https://www.nature.com/articles/s40494-015-0053-2)).
    Map this to Rapier plasticity (`plasticCreep`).
- **Optics.**
  - Refractive index: gelatin gels go from n = 1.340 (4%) to 1.370 (18%)
    ([arXiv 2009.02274](https://arxiv.org/pdf/2009.02274)). Jell-O is about
    13.5% sugar, so **n ≈ 1.355** **(computed, §2.2)**.
  - That gives F0 = 0.023 and a critical angle of 47.5° **(computed)**.
  - Things inside look **26% closer** through a flat face
    ([OpenStax](https://openstax.org/books/university-physics-volume-3/pages/2-3-images-formed-by-refraction)).
    Through a rounded bulge they look up to **1.36× bigger** **(computed)**.
  - The colour is Beer–Lambert absorption by the dyes:
    - Red 40 absorbs at 504 nm;
    - Yellow 5 at 425 nm ([Tartrazine](https://en.wikipedia.org/wiki/Tartrazine));
    - Blue 1 at 628 nm ([Brilliant Blue FCF](https://en.wikipedia.org/wiki/Brilliant_Blue_FCF)).
  - Clear gelatin scatters only weakly: a laser path is just visible in it
    ([NESOSA](https://nesosa.org/education/optical-demonstrations/117-gelatin-optics)).
- **Black light.**
  - Tonic-water jello glows blue (quinine:
    [Splendid Table](https://www.splendidtable.org/story/2013/10/28/fluorescent-jello)).
  - At the legal maximum of 83 ppm quinine
    ([21 CFR 172.575](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-172/subpart-F/section-172.575)),
    UV is absorbed within about **3–4 mm** **(computed, §2.6)**. So the glow
    is a **skin on the lit faces**, not a uniformly lit block.
  - Lime jello takes the blue out of that glow and turns it greener
    **(computed from the dye spectra)**. TELUS says lime "gives off a nice
    ghoulish glow"
    ([TELUS](https://telusworldofscienceedmonton.ca/learn/ghoulish-glowing-jello/)).
- **Rendering: build a "warped glass solid" on our engine.** The engine
  already ray-traces glass solids, cube included. That tracer does Snell,
  Fresnel, TIR, three wavelengths and Beer–Lambert
  (`src/effects/optics/solids.glsl.ts`, `src/components/site/GlassSolid.tsx`),
  and it already throws caustics (`optics/solid-cast.ts`). The jello pass adds
  four things:
  - a 2D deformation (from the soft body);
  - dye absorption (the KHR_materials_volume parameters);
  - the suspended objects, as analytic spheres and sprite planes skinned to
    the sim;
  - a quinine/phosphor emission term.
  - A cheaper 2.5D screen-space tier is in §3.3.

---

## 1. Soft bodies for the web (tools first)

### 1.1 Methods

| Method | What it is | Fit for a jello cube | Source |
|---|---|---|---|
| **Shape matching** (Müller et al. 2005) | Each step, fit the best rotation (or linear map) from the rest shape to the current particles and pull particles toward the fitted "goal" by α ∈ [0,1]. It is **unconditionally stable**. β blends rigid rotation R with linear A (βA + (1−β)R), so the body can stretch and shear. Clusters give local detail. Measured at 100 objects × 100 points × 8 clusters, **50 fps on a Pentium 4** | Cheap and robust. Rapier's docs say it "is cheap" but the deformations "feel very local" | [paper PDF](https://matthias-research.github.io/pages/publications/MeshlessDeformations_SIG05.pdf); [Rapier soft bodies](https://rapier.rs/docs/user_guides/javascript/soft_bodies) |
| **PBD / XPBD** (Müller 2007; Macklin, Müller, Chentanez 2016) | Constraints such as edge length and volume are projected directly on positions. XPBD's *compliance* makes stiffness independent of iteration count and time step | Ten Minute Physics 10 does a tet-mesh soft body this way: "simple and unbreakable" | [PBD](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf), [XPBD](https://matthias-research.github.io/pages/publications/XPBD.pdf), [TMP index](https://matthias-research.github.io/pages/tenMinutePhysics/index.html) |
| **Pressure soft body** (Matyka) | A closed ring of mass-springs with an ideal-gas pressure force on the edges | A balloon or blob. A cube needs shape springs too | [Matyka](http://panoramx.ift.uni.wroc.pl/~maq/soft2d/howtosoftbody.html) |
| **Pressure + shape-matching springs** (Walaber's JelloPhysics, the JellyCar engine) | Spring bodies pulled toward a matched rest shape (`shapeSpringK` 200, `shapeSpringDamp` 10, `edgeSpringK` 50 are the JelloSwift defaults), plus optional pressure | The classic 2D jelly look. A good reference for "feel" | [JelloSwift5 `SpringComponent.swift` lines 33–42](https://github.com/andymule/JelloSwift5) |
| **FEM** (corotational / Neo-Hookean) | Triangle cells with a real material law (Young's modulus, Poisson's ratio) | Physically tunable from the measured G′ (§2.1) | [Rapier typings `SoftBodyCellModel`](https://github.com/dimforge/rapier/blob/HEAD/bindings/typescript/CHANGELOG.md) |

### 1.2 Libraries and demos

| Candidate | Licence (checked) | Tech / updated | Covers | Lacks | Decision |
|---|---|---|---|---|---|
| **Rapier 2D** `@dimforge/rapier2d` 0.21.0 | Apache-2.0 (npm `license`; [LICENSE](https://github.com/dimforge/rapier/blob/HEAD/LICENSE)) | WASM, 2026-09-25 | See the API list below this table | API one week old. Small-scale tunnelling and sleeping need care (§1.3) | **Adopt** (as R0) |
| **Ten Minute Physics 10 "soft bodies"** | MIT header in [10-softBodies.html](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/10-softBodies.html) (repo commit 2026-06-20) | CPU JS, 1,215 lines with three.js drawing | XPBD tets; `edgeCompliance` 100, `volCompliance` 0, `numSubsteps` 10 (lines 127–151) | 3D tets; three.js | **Fallback port**, reduced to 2D triangles |
| **TMP 12 "skinning"** | MIT ([12-softBodySkinning.html](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/12-softBodySkinning.html)) | CPU | A fine visual mesh embedded in a coarse sim mesh: "100x speedup" ([index](https://matthias-research.github.io/pages/tenMinutePhysics/index.html)) | – | **Port the idea**: the suspended objects are skinned the same way (§3.4) |
| **JelloPhysics** (Walaber 2007) via **JelloSwift5** | MIT (both: `JelloPhysics-License.md` "Copyright (c) 2007 Walaber"; `LICENSE` 2017 Luiz Fernando Silva) | Swift; last commit 2021-12-28 | Pressure and spring bodies with shape matching ([repo](https://github.com/andymule/JelloSwift5)) | Not JS; old | Read for feel and defaults only |
| **jellyPhysics** (Haxe port) | MIT ([LICENSE](https://github.com/michaelapfelbeck/jellyPhysics), 2016) | Haxe; 2017-10-15 | Same engine | Haxe | – |
| matter.js soft-body example | MIT ([tools-survey §1](tools-survey.md)) | JS | A constraint lattice | `Composites.softBody` is deprecated; plain springs | – |
| lisyarus, "2D soft-body physics" | no code licence stated | blog | 2D shape matching by best-fit angle ([post](https://lisyarus.github.io/blog/posts/soft-body-physics.html)) | – | Ideas only |
| holtsetio/softbodies | MIT | WebGPU | GPU FEM tets ([repo](https://github.com/holtsetio/softbodies)) | WebGPU | Ideas only |
| 45deg "Jelly" demo | no repo or licence found (the demo page shows none; `git clone` asked for credentials, so the repo is private or missing) | ? | Interactive 3D jelly ([demo](https://45deg.github.io/jelly/)) | – | Look only |

What the Rapier soft-body API gives us (typings `dynamics/soft_body.d.ts`,
`pipeline/world.d.ts` in the 0.21.0 npm tarball; read here):

- **Shapes:** `SoftBodyDesc.grid(center, halfExtents, nx, ny)`,
  `polygon(points)`, `disk(...)`, `volumetric(...)`.
- **Cell models:** `SoftBodyCellModel` `Volume` / `Corotational` /
  `NeoHookean`. The `NeoHookean` model "resists inversion and large
  compressions".
- **`SoftBodySolver.Fem`.** Rapier's docs say that with it "stiffness no
  longer depends on iterations".
- **`SoftBodyMaterial`:** `youngModulus`, `poissonRatio`, `elasticDampingRatio`,
  `shapeMatchingSoftness` {`naturalFrequency` Hz, `dampingRatio`}, and
  `plasticYield` / `plasticCreep` / `plasticMax` (slime flow).
- **Shape and volume switches:** `setShapeMatching`, `setVolumePreservation`,
  `setVolumeFactor`.
- **Coupling to rigid bodies:** `attachParticle(i, rigidBody)` (two-way),
  `World.createDeformableCollider`, `addSoftBodyCluster`.
- **Pushing it:** `applyImpulseAtPoint(impulse, point, falloffRadius, wake)`
  and `applyRadialImpulse`, which are what a cursor push needs.
- **Sleeping:** `setCanSleep(false)`.
- **Docs:** [rapier.rs soft bodies](https://rapier.rs/docs/user_guides/javascript/soft_bodies).

### 1.3 Performance and behaviour, measured here

Method: `@dimforge/rapier2d-compat` 0.21.0 from npm, Node 22.22, in this
session's 2-vCPU cloud container. That is a desktop-class CPU, **not a
phone**. Each run is 600 steps at the default dt = 1/60 with a kinematic ball
sweeping into the jelly, and reports mean ms per `world.step()`. The scripts
live in the scratchpad only.

| Body | Particles | Mean ms/step (measured) |
|---|---|---|
| grid 8×8, any cell model | 64 | 0.16–0.44 |
| grid 12×12 | 144 | 0.32–0.36 |
| grid 16×16 | 256 | 0.45–0.55 |
| grid 20×20 | 400 | 0.74–0.80 |
| grid 12×12, **NeoHookean + Fem**, unit cube | 144 | **0.84–0.90** |
| polygon, shape matching | 48 | **0.11** |

So "a few hundred particles" costs well under 1 ms on desktop. A mid-range
phone is commonly 3–5× slower **(estimate)**, which is still under the 2–3 ms
budget R0 used for raindrops. The R0 spike must confirm this on a phone.

Behaviour, also from the same runs:

1. **Wobble tuning.** The test kicks a resting unit cube (12×12 grid, mass 1)
   sideways and counts the top's zero crossings. The frequency rises as √E:

   | E | f |
   |---|---|
   | 100 | 1.05 Hz |
   | 300 | 1.88 Hz |
   | 1000 | 3.47 Hz |

   The shape-matching polygon gave 0.49 / 1.30 / 2.78 Hz at softness
   3 / 6 / 12 Hz.
   - The decay at E = 300 with `elasticDampingRatio` 0.02 works out at about
     ζ ≈ 0.035 **(computed** from amplitudes 0.042 → 0.008 over ≈ 7.5 cycles).
   - `Volume` cells with uniform `setSoftness` misbehaved: at 6 Hz the body
     fell through the floor, and at 2 Hz it collapsed **(measured)**.
2. **Scale.** At true size (a 6 cm cube, 0.23 kg) with soft settings,
   particles tunnelled through a 1 cm floor. So simulate in **cube units**
   (cube = 1) and set the frequency directly in real seconds. Pixels are a
   render scale.
3. **Sleeping.** With the default, a body fell asleep after 2 s while still
   0.46 mm out of rest. It froze visibly **(measured)**. Use
   `setCanSleep(false)` while the cube is on screen, or call `wakeUp()` each
   frame.
4. **Suspended objects.**
   - A dynamic ball collider placed inside the grid fell through it to the
     floor (y = −0.058) **(measured)**.
   - The same ball with `attachParticle(nearest, ball)` stayed inside and rode
     the wobble **(measured)**.
   - The decision is to embed them as render-only skinned objects (§3.4). They
     then add no physics cost, and a fast drag can never tear one out.

### 1.4 2D vs faked 3D

| Option | What it looks like | Cost | Verdict |
|---|---|---|---|
| Pure 2D (a flat outline with glass shading) | A jelly "sticker"; no top face or depth | Least | Too flat for a photography site **(estimate)** |
| **2.5D: 2D sim of the front cross-section, extruded to depth D, ray-traced with the viewer's eye above the page** | A real-looking cube. The top face and sides show, and objects sit at depth with parallax. It wobbles in the page plane, which is the plane the cursor pushes in | 2D sim cost; the tracer GlassSolid already runs | **Choose** |
| Full 3D (Rapier3d `cuboid` tets, or TMP 10) | Out-of-plane jiggle | +1.17 MB gz WASM for rapier3d ([tools-survey §1](tools-survey.md)); 3D tets | Not needed. Fake a small top-face tilt from the shear instead (§3.2) |

---

## 2. Optics and mechanics of gelatin and slime

### 2.1 Stiffness, wobble and flow

- **Cherry Jell-O** (a commercial gel at 20 °C):
  - G′ ≈ 168 Pa, G″ ≈ 6 Pa at 10 rad/s;
  - critical strain γ_cri = 16%;
  - tan δ < 1 up to ≈ 160% strain ("solid-like");
  - strain-stiffening above the critical strain.

  Source: [Ata, Yazar, Helmick, Whitley, Tavman & Kokini, *Gels* 12(4):295, 2026, CC BY](https://www.mdpi.com/2310-2861/12/4/295).
- Gelatin gels in general are "of the order of kPa"
  ([arXiv 1010.5971](https://arxiv.org/pdf/1010.5971)). Firmer home recipes
  add gelatin ([Gelatin dessert](https://en.wikipedia.org/wiki/Gelatin_dessert)).
- Hydrogels are nearly incompressible: ν = 0.50 ± 0.01
  ([Micromachines 11:318](https://pmc.ncbi.nlm.nih.gov/articles/PMC7142615/)).
- **Density.** At 13.5 °Bx the sugar-solution specific gravity is 1.055
  **(computed** by interpolating the
  [USDA sucrose table](https://jblfoods.com/wp-content/uploads/2021/04/sucrose.pdf):
  12 °Bx 1.0484, 14 °Bx 1.0568).
- **Shear-wave speed.** c = √(G′/ρ) = √(168/1055) = **0.40 m/s**
  **(computed)**.
- **Fundamental wobble.** A layer fixed at its base and free on top has the
  site period T = 4H/Vs
  ([review](https://www.mdpi.com/2673-7094/3/4/71): "four times the travel
  time of the shear wave"). So f₁ = c/(4H) **(computed)**:

  | Height | f₁ |
  |---|---|
  | 4 cm | 2.5 Hz |
  | 6 cm | **1.7 Hz** |
  | 10 cm | 1.0 Hz |

  A cube rocks a little differently from an infinite layer, so treat these as
  ±30% **(estimate)**.
- **Damping.** The loss factor is tan δ = 6/168 = 0.036, so ζ ≈ tan δ / 2 =
  **0.018** **(computed)**: about 9 visible cycles to fall to 1/e. Plate
  friction and air add a little more. A lab default of ζ 0.03–0.05 is a safe
  look **(estimate)**. Slow-motion references: gelatin cubes dropped at
  6,200 fps
  ([TKSST](https://thekidshouldseethis.com/post/8487406086),
  [YouTube](https://www.youtube.com/watch?v=FH7aSxn-nEQ)).
- **Rapier mapping.** Use NeoHookean + Fem with ν 0.45–0.49. The measured law
  is f ≈ 1.05·√(E/100), so 1.7 Hz needs **E ≈ 260** in cube units
  **(computed** from the §1.3 runs). Treat E as a lab dial calibrated by test
  5 (§4), not as a physical number.
- **Slime** (PVA–borax):
  - It is a dynamic network. It is elastic over short times and viscous over
    long ones, with an "apparent relaxation time … in the order of 10 s" in
    water ([Angelova et al., *Heritage Science* 2016](https://www.nature.com/articles/s40494-015-0053-2)).
  - So a slime cube bounces when poked but slumps and spreads over seconds.
  - In Rapier: set `plasticYield` small and `plasticCreep` ≈ 1/τ ≈ 0.1 s⁻¹
    **(estimate** mapping from τ), with `plasticMax` as the limit on how much
    it may spread.
  - A homemade recipe is 1 tsp borax, 50 ml school glue and 200 ml water
    ([Commons: Slime 02471](https://commons.wikimedia.org/wiki/File:Slime_02471_Nevit.jpg)).
    So it is mostly water.

### 2.2 Refractive index, Fresnel, TIR

- **Gelatin gel** at 589 nm (Abbe refractometer):

  | Gelatin | n |
  |---|---|
  | 4% | 1.3403 |
  | 8% | 1.3477 |
  | 10% | 1.3523 |
  | 14% | 1.361 |
  | 18% | 1.370 |

  n is linear in concentration ([arXiv 2009.02274](https://arxiv.org/pdf/2009.02274)).
- **Sugar.** Sucrose solutions: 12 °Bx n = 1.3509, 14 °Bx 1.3541, 15 °Bx 1.3556
  ([USDA sucrose table](https://jblfoods.com/wp-content/uploads/2021/04/sucrose.pdf)).
- **Jell-O as made.**
  - A 3 oz box with 1 cup boiling water and 1 cup cold water makes four
    ½-cup servings
    ([Kraft Heinz](https://www.kraftheinz.com/jell-o/products/00043000200063-lime-gelatin-mix)).
  - Each serving is 22 g of mix with 19 g sugar
    ([nutritionandingredients](https://nutritionandingredients.com/jell-o/)).
  - So 76 g sugar in ≈ 561 g of gel = **13.5% sucrose**, and gelatin plus
    acids ≤ 2% **(computed)**.
  - n = 1.3533 (sugar, interpolated), plus ≤ 0.0036 for the gelatin (slope
    0.0018 per %, from 4% → 1.3403 vs water 1.3330) gives **n ≈ 1.355**
    **(computed)**.
- **Slime:** about 1.34–1.37, because it is mostly water **(estimate**; no
  measurement found).
- **Fresnel** at normal incidence: F0 = ((n−1)/(n+1))² = (0.355/2.355)² =
  **0.023** **(computed)**, against 0.04 for glass. The highlights are fainter
  than on the glass panes but just as sharp.
- **Critical angle** inside: asin(1/1.355) = **47.5°** **(computed)**. Looking
  into a cube face at a slant, the side faces mirror the inside (TIR), as in
  glass cubes. Gelatin is clear enough to show TIR and light-pipes cut from a
  sheet ([NESOSA](https://nesosa.org/education/optical-demonstrations/117-gelatin-optics)).
- **Dispersion** is negligible at the screen scale **(estimate**: water-like,
  Abbe number ≈ 55). Use one index.

### 2.3 Clarity and scattering

- Clear gelatin "scatters light so a laser beam is visible as it passes
  through" ([NESOSA](https://nesosa.org/education/optical-demonstrations/117-gelatin-optics)).
  That is weak scattering: a faint glow along a beam, not haze.
- Tissue-optics labs use gelatin as the clear *matrix* and add Intralipid when
  they want scattering
  ([Lai et al., JBO 19:035002](https://www.spiedigitallibrary.org/journals/journal-of-biomedical-optics/volume-19/issue-03/035002/Dependence-of-optical-scattering-from-Intralipid-in-gelatin-gel-based/10.1117/1.JBO.19.3.035002.full)).
  The full text was not readable here, so there is no number for gelatin's
  own scattering coefficient.
- **Model:**
  - absorption-dominated Beer–Lambert;
  - plus a small forward-scatter glow when a light is behind the cube (the
    Filament subsurface term, as in balloons, at low strength);
  - plus a slight blur of what is seen through a long path
    **(estimate)**.
- **Slime:** milky slimes made from white glue scatter strongly and are nearly
  opaque. Clear-glue slime is like clear jello ([Commons: Slime (toy)](https://commons.wikimedia.org/wiki/Category:Slime_(toy))).

### 2.4 Colour from dye absorption

- **The dyes:**

  | Dye | λmax | Absorbs |
  |---|---|---|
  | Allura Red (Red 40) | 504 nm ([lab handout](https://www.uclmail.net/users/dn.cash/Spectroscopy1.pdf)) | blue-green; transmits red |
  | Tartrazine (Yellow 5) | 425 nm ([Wikipedia](https://en.wikipedia.org/wiki/Tartrazine)) | blue |
  | Brilliant Blue FCF (Blue 1) | 628 nm ([Wikipedia](https://en.wikipedia.org/wiki/Brilliant_Blue_FCF)) | red |

- Lime Jell-O lists **Yellow 5 and Blue 1**
  ([nutritionandingredients](https://nutritionandingredients.com/jell-o/)).
  So it absorbs both blue and red, and green passes.
- **The parameterisation** is the glTF one, which our lab can expose directly
  ([KHR_materials_volume](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_volume/README.md)):
  - attenuation colour c: what white light becomes after distance d;
  - σ = −ln(c)/d;
  - T(x) = c^(x/d).

  Khronos advises putting all the colour in the attenuation and leaving the
  base white
  ([glTF tutorial](https://github.khronos.org/glTF-Tutorials/AddingMaterialExtensions/AddingMaterialExtensions_003_TransmissionAndVolume.html)).
- **Path length matters.** A spoonful of strawberry Jell-O is pale pink, and
  a full cup is deep red
  ([Commons: Jell-O lifted by a spoon](https://commons.wikimedia.org/wiki/File:2019-10-10_22_15_43_Gelatin_from_a_single_opened_cup_of_Jell-O_strawberry_gelatin_snack_being_lifted_by_a_spoon_in_the_Franklin_Farm_section_of_Oak_Hill,_Fairfax_County,_Virginia.jpg)).
  So the thickness term carries the look.
- **Starting values** at d = 2 cm. All are **(estimate)**, to tune against the
  photos in §2.7:

  | Flavour | c (linear RGB) | Dyes |
  |---|---|---|
  | Strawberry / cherry | (0.80, 0.10, 0.16) | Red 40 |
  | Lime | (0.25, 0.80, 0.18) | Yellow 5 + Blue 1 |
  | Orange | (0.92, 0.45, 0.08) | Yellow 6 + Red 40 **(estimate**; not checked) |
  | Grape | (0.45, 0.08, 0.40) | Red 40 + Blue 1 **(estimate)** |
  | "Clear" tonic | (0.97, 0.97, 0.94) | none (quinine is colourless in daylight) |
  | Slime green | (0.35, 0.85, 0.20), plus scattering | – |

- **Testable consequence.** Under the **red road flare**, lime jello goes
  nearly black, because Blue 1 absorbs red. Strawberry glows. Under a green
  laser, the reverse **(computed from the dye bands)**.

### 2.5 How suspended objects look

- **Flat face, viewed head-on.** Apparent depth = real depth × (1/n) ("a fish
  appears at 3/4 of the real depth" in water)
  ([OpenStax UP3 §2.3](https://openstax.org/books/university-physics-volume-3/pages/2-3-images-formed-by-refraction)).
  In jello an eyeball 3 cm behind the face looks **2.2 cm** deep: 26% closer
  **(computed**, 1/1.355 = 0.738). Its size is not changed, but it shifts
  sideways less when you move, so the parallax is reduced.
- **Curved face.** Use n₁/d_o + n₂/d_i = (n₂ − n₁)/R
  ([OpenStax](https://openstax.org/books/university-physics-volume-3/pages/2-3-images-formed-by-refraction)).
  For an object at the centre of curvature of a dome, the rays leave along
  the normals. Lateral magnification is then m = n_in/n_out = **1.36**
  (the fish-bowl case) **(computed)**. A wobbling face swells and flattens,
  so the objects inside **breathe in size**, and near the bulged edges they
  smear. That is the signature look of things in jelly.
- **Seen at a slant through the side,** an object vanishes into TIR beyond
  47.5° and the face mirrors the inside (§2.2).
- **Depth tint.** Each object is tinted by T(path from it to the eye) = c^(x/d).
  Deep objects are darker and more saturated **(computed** from Beer). This
  is the strongest depth cue in clear coloured jello **(estimate)**.
- **What sits inside in photos:** fruit and marshmallows "suspended"
  ([Gelatin dessert](https://en.wikipedia.org/wiki/Gelatin_dessert)), and
  cubes of other jello in a clear matrix
  ([Commons: Cathedral Window Gelatin](https://commons.wikimedia.org/wiki/Category:Cathedral_Window_Gelatin)).

### 2.6 Surface: specular and wet sheen

- The surface is very smooth and wet. Highlights are sharp, small and faint
  (F0 0.023). Roughness 0.03–0.08 **(estimate**, from the reference photos).
  Fresnel rises to 1 at grazing angles, so the rim brightens on the side
  facing a light.
- The edges and corners of a de-moulded cube are rounded, with a radius of
  ≈ 5–10% of the side **(estimate)**. They catch the lamp as a bright line,
  like our pane bevels.
- Slime: the same specular, but the surface is lumpy (normal noise) and it
  forms drips and strings when pulled. Leave that to a later step.

### 2.7 Under UV: fluorescence and glow

| Variant | What glows | Colour | Source / working |
|---|---|---|---|
| **Tonic-water jello** | quinine: absorbs 350 nm, emits ≈ 450 nm, QY 0.546 | blue / blue-white (R1 token `teeth`) | [uv-blacklight.md](uv-blacklight.md) (LibreTexts, OMLC); [Splendid Table](https://www.splendidtable.org/story/2013/10/28/fluorescent-jello) |
| Lime tonic jello | quinine emission filtered by Yellow 5 (425 nm) and Blue 1 | greener than plain tonic; "ghoulish" | [TELUS](https://telusworldofscienceedmonton.ca/learn/ghoulish-glowing-jello/); filter effect **(computed)** |
| **Highlighter slime** | pyranine / fluorescein (QY 0.95) | green-yellow (`dayglo-yellowgreen`) | [Experiment Exchange](https://experimentexchange.com/chemistry-matter/glowing-slime/); [uv-blacklight.md](uv-blacklight.md) |
| **Glow-in-the-dark slime** | strontium aluminate powder: charges under UV and glows on after the light goes off | green (520 nm) | the engine's `materials/phosphor.ts` (Botterman et al. 2015) |
| Plain gelatin | none found | – | no source found; assume none |

**How deep the UV goes (tonic):**

1. The legal maximum is 83 ppm quinine
   ([21 CFR 172.575](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-172/subpart-F/section-172.575)).
2. That is 83 mg/L ÷ 324.4 g/mol = 2.56 × 10⁻⁴ M.
3. ε = 5,700 M⁻¹cm⁻¹ at 347.5 nm
   ([OMLC PhotochemCAD](https://omlc.org/spectra/PhotochemCAD/html/081.html)),
   so A = 1.46 per cm.
4. 1/e depth = 1/(1.46 × ln 10) = **3.0 mm**, and 90% is absorbed within
   **6.8 mm** **(computed)**.
5. The Splendid Table recipe is ≈ 70% tonic, which gives about **4 mm**
   (1/e) **(computed)**.

So a black-lit tonic cube glows as a bright skin on the faces toward the lamp,
with a darker core. Things inside are seen as **dark silhouettes against the
glowing skin**, which suits Halloween. Quinine absorbs less at the lamp's
365 nm than at its 347.5 nm peak, and far less at 395 nm, so a 395 nm LED
lamp makes a weaker, deeper glow **(estimate**; no spectrum fetched here).

### 2.8 Reference photographs

These are for side-by-side checks only, not for use on the site. Each has its
own licence on Commons.

- [Tonic (with quinine) under the black light](https://commons.wikimedia.org/wiki/File:Tonic_(with_quinine)_under_the_Black_Light_(7261032728).jpg): the blue quinine glow.
- [Strawberry Jell-O lifted by a spoon](https://commons.wikimedia.org/wiki/File:2019-10-10_22_15_43_Gelatin_from_a_single_opened_cup_of_Jell-O_strawberry_gelatin_snack_being_lifted_by_a_spoon_in_the_Franklin_Farm_section_of_Oak_Hill,_Fairfax_County,_Virginia.jpg): thin vs thick colour, wet highlights.
- [Category: Cathedral Window Gelatin](https://commons.wikimedia.org/wiki/Category:Cathedral_Window_Gelatin): objects suspended in clear gelatin.
- [Category: Gelatin desserts](https://commons.wikimedia.org/wiki/Category:Gelatin_desserts) and [Category: Jell-O](https://commons.wikimedia.org/wiki/Category:Jell-O): shapes, edges, colours.
- [Raspberry gelatin salad](https://commons.wikimedia.org/wiki/File:Raspberry_Gelatin_Pineapple_Sour_Cream_Salad.jpg): layered and opaque.
- Slime: [Green slime in hand](https://commons.wikimedia.org/wiki/File:Green_Slime_in_hand.JPG), [Pouring slime](https://commons.wikimedia.org/wiki/File:Pouring_Slime.JPG), [Slime 02471](https://commons.wikimedia.org/wiki/File:Slime_02471_Nevit.jpg), [Category: Slime (toy)](https://commons.wikimedia.org/wiki/Category:Slime_(toy)).
- Glow jello recipe pages with UV photos: [Splendid Table](https://www.splendidtable.org/story/2013/10/28/fluorescent-jello), [TELUS](https://telusworldofscienceedmonton.ca/learn/ghoulish-glowing-jello/), [Homemade Hooplah](https://homemadehooplah.com/glow-in-the-dark-jello-shots/), [Instructables](https://www.instructables.com/Glow-in-the-Dark-Jello/), [KiwiCo](https://www.kiwico.com/diy/stem/crazy-chemistry/fluorescent-jello).
- Motion: [slow-motion gelatin cubes](https://thekidshouldseethis.com/post/8487406086), [YouTube](https://www.youtube.com/watch?v=FH7aSxn-nEQ).

The best references would be Ony's own photographs: a tonic-and-lime cube with
candy eyeballs, shot under the studio's lamp, flash and black light. Those
would also give us licence-clean sprite art (§3.4).

---

## 3. Rendering on our WebGL1 engine

### 3.1 Techniques on record

| Technique | What it does | Source | Use here |
|---|---|---|---|
| Image-space refraction (Wyman 2005) | Front and back surfaces from depth and normal buffers; refract twice and look up what's behind | [ACM](https://dl.acm.org/doi/10.1145/1073204.1073310) | The idea behind the 2.5D tier |
| Screen-space refraction with an FBO (Heckel) | Render the scene without the object, then sample it at `uv + refract(eye, N, 1/n).xy`, once per channel for dispersion | [blog](https://blog.maximeheckel.com/posts/refraction-dispersion-and-other-shader-light-effects/) (no code licence stated: ideas only) | Our backdrop sampler is the "FBO": `uBackdrop` / `uPhoto` already exist (`src/lib/glass-light-shader.ts`, `GlassSolid.tsx`) |
| Thickness by additive splats (Green, GDC/SIGGRAPH 2010) | Draw particles additively into a thickness buffer, then apply Beer | [Geeks3D summary](https://www.geeks3d.com/20100809/siggraph-2010-screen-space-fluid-rendering-for-games/) | A cheap thickness for blobby slime |
| Baked thickness + Beer (KHR_materials_volume) | Thickness from a map, multiplied by `thicknessFactor`; T = c^(x/d). The spec admits this is lossy (the real path varies with angle) | [spec](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_volume/README.md) | Thickness and absorption parameters |
| **Our SDF solid tracer** | Sphere-traces a cube or sphere SDF: Snell, exact Fresnel, TIR, 4 bounces, Beer per segment, three wavelengths | `src/effects/optics/solids.glsl.ts` (96 march steps, `throughSolid` loop of 4), `solids.ts` TS twin, `GlassSolid.tsx` | **The base of the jello pass** |
| Our solid caustic and shadow | Photon-splats rays through the solid onto the page | `src/effects/optics/solid-cast.ts` | Tinted jello shadow and caustic for free |
| Filament subsurface term | Wrap-lit transmission for lights behind | [Filament shader](https://github.com/google/filament/blob/main/shaders/src/surface_shading_model_subsurface.fs) (Apache-2.0) | The weak forward glow (as balloons) |

### 3.2 Tier A (full): the warped glass solid

1. **Shape.** A rounded box SDF in rest space, of half-size s and corner
   radius r ≈ 0.08·s **(estimate)**. Its depth D equals its width.
2. **Deformation (xy only).** Each frame, draw the sim's triangle mesh into
   a small **warp texture** over the cube's bounding box (about 128² is
   enough, **estimate**).
   - Each pixel stores the **rest-space (u, v)** of the jello at that point,
     16 bits per axis packed into RGBA8, since we have no float targets yet
     ([tools-survey §0](tools-survey.md)).
   - Coverage goes in a spare bit.
   - The tracer evaluates the SDF at (warp(p.xy), p.z).
   - Stretch shrinks the true distance, so scale each march step by 1/λmax.
     That is about 0.75 at the 16% critical strain plus margin **(estimate)**.
3. **Top-face tilt (fake 3D jiggle).** Tilt the rest-space z of the top face
   by k·(horizontal shear at the top), with k ≈ 0.3 **(estimate)**. A
   sideways rock then also shows on the top face.
4. **Per pixel.** Trace eye → surface:
   - Fresnel reflection of the room (`environment.glsl`), F0 0.023;
   - refract;
   - march inside, testing the suspended objects (§3.4);
   - attenuate each segment by c^(x/d);
   - exit with Fresnel and TIR;
   - sample the backdrop photo where the ray lands.

   The current solid tracer does all of this already except the warp and the
   objects.
5. **Lights** (loop over `LIGHTS_GLSL`, `src/effects/light/light-uniforms.ts`):
   - GGX specular per light, roughness 0.05;
   - the Filament transmission term for a light behind (strength 0.2,
     **estimate**);
   - flash and flare are just entries in the light list.
6. **UV emission.**
   - **Tonic:** for light i, the emission is `uLightUv[i]` × irradiance ×
     QY-strength (R1: blue/tonic 0.5) × (1 − e^(−s/δ)), where s is the
     distance marched from the lit face and δ ≈ 4 mm in cube units
     (§2.7, **computed**).
   - The emitted blue is then attenuated by the dye's T on its way to the eye.
   - **Highlighter slime:** the same, with the `dayglo-yellowgreen` token and
     δ large, so it glows uniformly **(estimate**: the dye is dilute).
   - **Glow slime:** charge `phosphor.ts`, which then emits with no light.
7. **Shadow and caustic.** Register the jello with `solid-cast` like a glass
   solid, with its absorption, so it throws a coloured shadow and a focused
   caustic on the photographs. They wobble with it.

Cost: the same order as the existing GlassSolid pass, plus about 1 texture
fetch per march step for the warp **(estimate)**. The spike measures it at
300×300 CSS px.

### 3.3 Tier B (lite): 2.5D screen-space

For the `lite` quality tier (`src/effects/engine/quality.ts`). One pass, with
no march:

1. **Mesh.** Draw the deformed sim mesh directly. Give each vertex a
   rest-space **distance to the outline**, computed once at build time and
   carried along as the mesh deforms.
2. **Normal and thickness.** Feed that distance through the engine's bevel
   profile (`optics/edge-profile.ts` `surfaceHeight`, "circle" or "squircle").
   - The result is a height h and a normal N.
   - Thickness x = D·h/cos θ_t, where θ_t comes from Snell at N
     **(computed** geometry).

   This is the "baked thickness" idea from KHR_materials_volume, done per
   vertex.
3. **Background.** Sample the backdrop at p + k·D·refract(V, N, 1/n).xy
   (Heckel / Wyman). Multiply by c^(x/d).
4. **Suspended objects** come from their own pre-drawn layer:
   - each sampled with an offset scaled by its depth fraction z/D;
   - magnified about its anchor by 1 + (n − 1)·curvature, clamped to
     [1, 1.36] (§2.5);
   - tinted by c^(z_front/d).
5. **Lighting and UV:** the same as Tier A, without TIR.
6. **Slime:** a Green-style additive particle-splat thickness can replace
   step 2 when the outline is blobby.

### 3.4 Suspended objects

- **Placement.** Each object has an anchor in rest space (u, v, z). Every
  frame the CPU finds its triangle's barycentric weights (fixed at build) and
  computes:
  - the deformed position;
  - the local deformation gradient F, from which come rotation (polar
    decomposition) and stretch.

  This is TMP 12's embedding idea (MIT). It costs a few µs for under 10
  objects **(estimate)**.
- **Object data goes in a texture, not uniforms.** ≤ 8 objects × 2 `vec4`
  would not fit beside the lights. WebGL1 guarantees only 16 fragment `vec4`
  uniforms, and MAX_LIGHTS = 4 already uses 4 × 4 = 16 vec4-equivalents
  (`light-uniforms.ts` header). So put the objects in a tiny RGBA texture
  (8×2 texels), as tools-survey §8 did for gem planes **(computed)**.
- **Eyeballs.** Analytic spheres:
  - ray–sphere intersection inside the jello;
  - iris and pupil from the sphere's local coordinates;
  - a wet specular of their own;
  - they rotate with F, so they "look around" as the jello rocks.
- **Bones, bugs and worms.** Sprite planes at depth z in the object's frame:
  ray–plane intersection, then an alpha-tested sprite texture.
  - Sprites should be **Ony's own photographs** of props (licence-clean).
  - CC0 cut-outs are the alternative.
- **In Tier A,** objects are hit along the refracted ray, so refraction
  displacement, magnification and depth tint come out right with no extra
  rules. In Tier B they use the approximations in §3.3.
- **Physics.** Objects are render-only. If one ever needs mass (a heavy
  bone sagging), `attachParticle` it to the nearest particle (§1.3).

---

## 4. Decisions

### Adopt / port / build

| Part | Decision | Rests on |
|---|---|---|
| Soft body | **Adopt** Rapier 2D: `grid` 12×12, `NeoHookean` + `Fem`, `setCanSleep(false)` while visible. Mobile tier: 48-particle `polygon` with shape matching | §1.3 runs; [Rapier docs](https://rapier.rs/docs/user_guides/javascript/soft_bodies); typings 0.21.0 |
| Fallback | **Port** TMP 10 XPBD (MIT) to 2D triangles, plus Müller shape matching | [10-softBodies.html](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/10-softBodies.html); [Müller 2005](https://matthias-research.github.io/pages/publications/MeshlessDeformations_SIG05.pdf) |
| Slime flow | **Adopt** Rapier plasticity (`plasticYield`, `plasticCreep`, `plasticMax`) | [Angelova 2016](https://www.nature.com/articles/s40494-015-0053-2) τ ≈ 10 s |
| Suspended objects | **Build** render-only barycentric skinning (TMP 12 idea); `attachParticle` only if they need mass | §1.3 (colliders fall through); [TMP index](https://matthias-research.github.io/pages/tenMinutePhysics/index.html) |
| Render, full tier | **Build** on `solids.glsl` + `GlassSolid`: warp texture, KHR-volume absorption, objects, UV term; reuse `solid-cast` | §3.2 |
| Render, lite tier | **Build** 2.5D: bevel profile + backdrop refraction + Beer (Wyman/Heckel ideas) | §3.3 |
| Translucency glow | **Port** the Filament subsurface term (Apache-2.0), as balloons | [Filament](https://github.com/google/filament/blob/main/shaders/src/surface_shading_model_subsurface.fs) |
| UV | **Reuse** R1 tokens (`teeth` for tonic, `dayglo-yellowgreen`) and `phosphor.ts` | [uv-blacklight.md](uv-blacklight.md) |

### Numbers to use

| Quantity | Value | Basis |
|---|---|---|
| n (Jell-O) | **1.355** (gelatin-only gels 1.340–1.370; slime 1.34–1.37) | computed §2.2 / [arXiv](https://arxiv.org/pdf/2009.02274) / estimate |
| F0; critical angle | 0.023; 47.5° | computed |
| Apparent depth (flat face) | × 0.738 | [OpenStax](https://openstax.org/books/university-physics-volume-3/pages/2-3-images-formed-by-refraction), computed |
| Max magnification (dome, object at centre) | 1.36 | computed |
| G′, G″, critical strain | 168 Pa, 6 Pa, 16% | [Ata 2026](https://www.mdpi.com/2310-2861/12/4/295) |
| Wobble f₁ | 1.7 Hz for a 6 cm cube (2.5 Hz at 4 cm, 1.0 at 10 cm); ±30% | computed |
| Damping ζ | material 0.018; look default 0.03–0.05 | computed / estimate |
| Rapier E (cube units, 12×12) | f ≈ 1.05·√(E/100) Hz, so **E ≈ 260 for 1.7 Hz**; ν 0.45–0.49 | measured / [ν](https://pmc.ncbi.nlm.nih.gov/articles/PMC7142615/) |
| Tear / squish limit | warn at 16% strain (non-linear); jello fractures beyond it (a later "smash" option) | [Ata 2026](https://www.mdpi.com/2310-2861/12/4/295) |
| Slime | `plasticCreep` ≈ 0.1 s⁻¹ | estimate from τ ≈ 10 s |
| Attenuation colours | §2.4 table at d = 2 cm | estimate |
| Tonic UV depth | 1/e 3–4 mm; QY 0.546; emission ≈ 450 nm | computed / [OMLC](https://omlc.org/spectra/PhotochemCAD/html/081.html) |
| Roughness; corner radius | 0.03–0.08; 5–10% of side | estimate |
| Sim cost | ≈ 0.85 ms/step desktop (144 particles, FEM); 0.11 ms shape matching | measured |

### Lab controls

- **Material:** jello / slime / glow slime; flavour (strawberry, lime, orange,
  grape, tonic-clear) as attenuation colour + distance; n (1.33–1.40);
  roughness; scatter strength.
- **Physics:**
  - wobble Hz (drives E);
  - damping ζ;
  - ν;
  - slime creep and max spread;
  - cube size (cm, for f₁ and for UV depth);
  - push strength and falloff radius (`applyImpulseAtPoint`);
  - drag stiffness;
  - Rapier substeps;
  - tier (FEM grid / shape matching).
- **Look:** corner radius; top-face tilt gain k; warp-texture size; march
  step scale; Tier A / Tier B.
- **Objects:** count, kinds (eyeball / bone / bug / worm), depth spread, eye
  iris colour.
- **UV:** quinine strength; UV depth δ; phosphor charge rate; 365 / 395 nm
  lamp.
- **Debug views:** warp texture, thickness, per-light terms, object anchors,
  strain map (red above 16%).

### Tests

1. **Fresnel.** A head-on ray reflects 0.023 ± 0.001; inside, a ray at 48° to
   the normal is totally reflected (TS twin `solids.ts` `traceSolid`).
2. **Apparent depth.** A rest cube viewed head-on puts an object at depth z at
   z/1.355 ± 2% (trace from two eye offsets; triangulate).
3. **Magnification.** A jello sphere with an object at its centre images it at
   1.355 ± 2% of its size.
4. **Beer.** Doubling the path squares T per channel. Lime under pure red light
   transmits < 15% at x = d **(estimate** threshold from c).
5. **Wobble frequency.** Kick the rest cube sideways. The top's zero-crossing
   frequency is within ±10% of the lab Hz, and ζ (log decrement) within ±30%.
6. **Incompressible.** Area stays within ±3% through a 1 s drag.
7. **No freeze.** After a kick, amplitude decays smoothly to < 0.5 px with no
   step where it stops while above that (the sleep bug of §1.3).
8. **Objects stay in.** After 30 s of random drags and pushes, every object
   anchor is inside the outline and its barycentric weights are all ≥ 0.
9. **Every light.**
   - The lamp and the flash each add a specular highlight.
   - The flare darkens lime and lights strawberry.
   - The black light makes tonic glow with its brightest pixels within δ of
     the faces toward the lamp.
   - Glow slime keeps glowing after the black light turns off.
10. **Performance** (the R0 spike):
    - sim step ≤ 1 ms desktop and ≤ 3 ms on a mid-range Android;
    - jello pass ≤ 2 ms at 300×300 CSS px (Tier A desktop) and Tier B on
      `lite` **(estimate** targets).

### Still unknown

- **Phone cost** of the FEM sim and of the warped march (the spike).
- Whether Rapier's soft `grid` stays stable when a fast cursor drag pins and
  yanks a cluster at about 1 m/s in cube units **(not tested)**.
- **Gelatin's own scattering coefficient.** The Lai et al. full text was not
  readable, and no number was found. Tune by eye against the photos.
- **Dye concentrations, hence the attenuation colours.** They are estimates.
  Photograph a 1 cm and a 4 cm slice under the studio light to fit c and d.
- **Quinine's absorption at 365 and 395 nm** relative to its 347.5 nm peak.
  This sets how deep the glow goes under each lamp.
- **The slime's refractive index** (no measurement found) and the PVA content
  of school glue.
- **How a real jello cube's TIR side faces look** in a photo. Check against
  Ony's own shots.

---

## Sources

Soft bodies and physics:
[Rapier soft bodies guide](https://rapier.rs/docs/user_guides/javascript/soft_bodies) ·
[Rapier TS CHANGELOG](https://github.com/dimforge/rapier/blob/HEAD/bindings/typescript/CHANGELOG.md) ·
[Rapier LICENSE](https://github.com/dimforge/rapier/blob/HEAD/LICENSE) ·
[Müller et al. 2005, shape matching](https://matthias-research.github.io/pages/publications/MeshlessDeformations_SIG05.pdf) ·
[Müller et al. 2007, PBD](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf) ·
[Macklin et al. 2016, XPBD](https://matthias-research.github.io/pages/publications/XPBD.pdf) ·
[Ten Minute Physics index](https://matthias-research.github.io/pages/tenMinutePhysics/index.html) ·
[TMP 10 soft bodies](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/10-softBodies.html) ·
[TMP 12 skinning](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/12-softBodySkinning.html) ·
[Matyka pressure soft body](http://panoramx.ift.uni.wroc.pl/~maq/soft2d/howtosoftbody.html) ·
[JelloSwift5 (JelloPhysics port)](https://github.com/andymule/JelloSwift5) ·
[jellyPhysics (Haxe)](https://github.com/michaelapfelbeck/jellyPhysics) ·
[lisyarus 2D soft bodies](https://lisyarus.github.io/blog/posts/soft-body-physics.html) ·
[holtsetio/softbodies](https://github.com/holtsetio/softbodies) ·
[45deg Jelly demo](https://45deg.github.io/jelly/)

Mechanics:
[Ata et al. 2026, Cherry Jell-O rheology (Gels 12:295)](https://www.mdpi.com/2310-2861/12/4/295) ·
[Ultrasonic study of gelatin gelation (arXiv 1010.5971)](https://arxiv.org/pdf/1010.5971) ·
[Poisson's ratio of hydrogels (Micromachines 11:318)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7142615/) ·
[Site period review, T = 4H/Vs](https://www.mdpi.com/2673-7094/3/4/71) ·
[PVA–borate gels (Heritage Science 2016)](https://www.nature.com/articles/s40494-015-0053-2) ·
[Gelatin dessert (Wikipedia)](https://en.wikipedia.org/wiki/Gelatin_dessert)

Optics:
[Gelatin refractive index vs concentration (arXiv 2009.02274)](https://arxiv.org/pdf/2009.02274) ·
[USDA sucrose conversion table](https://jblfoods.com/wp-content/uploads/2021/04/sucrose.pdf) ·
[Jell-O lime (Kraft Heinz)](https://www.kraftheinz.com/jell-o/products/00043000200063-lime-gelatin-mix) ·
[Jell-O nutrition and ingredients](https://nutritionandingredients.com/jell-o/) ·
[NESOSA gelatin optics](https://nesosa.org/education/optical-demonstrations/117-gelatin-optics) ·
[OpenStax UP3 §2.3 Images formed by refraction](https://openstax.org/books/university-physics-volume-3/pages/2-3-images-formed-by-refraction) ·
[Lai et al., Intralipid in gelatin phantoms (JBO)](https://www.spiedigitallibrary.org/journals/journal-of-biomedical-optics/volume-19/issue-03/035002/Dependence-of-optical-scattering-from-Intralipid-in-gelatin-gel-based/10.1117/1.JBO.19.3.035002.full) ·
[Allura Red 504 nm (lab handout)](https://www.uclmail.net/users/dn.cash/Spectroscopy1.pdf) ·
[Tartrazine](https://en.wikipedia.org/wiki/Tartrazine) ·
[Brilliant Blue FCF](https://en.wikipedia.org/wiki/Brilliant_Blue_FCF) ·
[KHR_materials_volume](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_volume/README.md) ·
[glTF transmission and volume tutorial](https://github.khronos.org/glTF-Tutorials/AddingMaterialExtensions/AddingMaterialExtensions_003_TransmissionAndVolume.html)

UV:
[Splendid Table, fluorescent jello](https://www.splendidtable.org/story/2013/10/28/fluorescent-jello) ·
[TELUS World of Science, ghoulish glowing jello](https://telusworldofscienceedmonton.ca/learn/ghoulish-glowing-jello/) ·
[21 CFR 172.575 quinine](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-172/subpart-F/section-172.575) ·
[OMLC quinine sulfate](https://omlc.org/spectra/PhotochemCAD/html/081.html) ·
[Experiment Exchange, glowing slime](https://experimentexchange.com/chemistry-matter/glowing-slime/) ·
[uv-blacklight.md](uv-blacklight.md)

Rendering:
[Wyman 2005, image-space refraction](https://dl.acm.org/doi/10.1145/1073204.1073310) ·
[Heckel, refraction and dispersion](https://blog.maximeheckel.com/posts/refraction-dispersion-and-other-shader-light-effects/) ·
[Green 2010, screen-space fluid rendering](https://www.geeks3d.com/20100809/siggraph-2010-screen-space-fluid-rendering-for-games/) ·
[Filament subsurface shader](https://github.com/google/filament/blob/main/shaders/src/surface_shading_model_subsurface.fs)

Reference photos: §2.8.

### Pages I could not read

- PMC article pages (reCAPTCHA) and the Lai et al. full text (robots, empty
  Europe PMC response).
- HyperPhysics (TLS hostname mismatch). OpenStax was used instead.
- The Wikimedia Commons API rate-limited (HTTP 429). Some files were found
  through search instead.
- The WebSearch budget ran out partway through; the last few look-ups went
  through Firecrawl search instead.
