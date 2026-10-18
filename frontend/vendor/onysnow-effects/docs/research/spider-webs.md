# Spider webs (task 75)

Research only (R10), 2026-10-01. No code changed. Every claim has a link.
Anything not quoted from a source is marked **(computed)**, with how it was
worked out, or **(estimate)**.

What task 75 asks for: spider webs on the photography site, in the corners
of photos, across photos, and for Halloween. They should glisten and shine in
light (the cursor lamp and every other light in `effects/light/lights.ts`).
They should sway like they are in wind when the cursor passes near. They can
be clicked, torn off and dragged around.

The physics engine is already settled ([tools-survey §1–2](tools-survey.md)):
**adopt Rapier 2D soft bodies**, **port verlet-js's web layout**, and **fall
back to porting Ten Minute Physics' XPBD cloth**. This doc covers what is
still open: the optics, the geometry, the mechanics, the numbers and how it
is rendered.

---

## 1. Tools first: what already exists

| Candidate | Licence | What it is | Covers | Lacks / decision |
|---|---|---|---|---|
| **verlet-js `spiderweb()`** (Sub Protocol) | MIT ([LICENSE](https://github.com/subprotocol/verlet-js/blob/HEAD/LICENSE), per [tools-survey §2](tools-survey.md)) | 2D canvas Verlet, 2014 ([examples/spiderweb.html](https://github.com/subprotocol/verlet-js/blob/master/examples/spiderweb.html)) | One continuous spiral of particles. Each particle `i` links to `i+1` (spiral) and to `i+segments` (radial). Small sinusoidal jitter on angle and radius. Every 4th outer particle is pinned. `stiffness = 0.6`. All rest lengths are multiplied by `tensor = 0.3`, so the web is pre-tensioned and taut. Called with `segments = 20, depth = 7` (140 particles) | No hub, no frame threads, no free zone. The radials are segmented chords of the spiral, not straight lines. No tearing. **Port** the idea (spiral index + radial offset, the pre-tension trick) and replace the layout with the biology in §3 |
| **Tearable Cloth** (dissimulate, CodePen) | MIT: public Pens are "automatically MIT licensed" ([CodePen licensing](https://blog.codepen.io/documentation/licensing/)) | Canvas Verlet cloth ([pen nYQrNP](https://codepen.io/dissimulate/pen/nYQrNP), [KrAwx](https://codepen.io/dissimulate/pen/KrAwx)) | 31 × 51 points at 7 px spacing. `physics_accuracy = 3` iterations a frame, `gravity = 1200`, damping `0.99`. **Drag**: points within `mouse_influence = 20` px move by `1.8 ×` the mouse delta. **Tear**: a constraint is removed when `dist > tear_distance = 60`. **Cut**: right-click within 5 px | A grid, not a web. **Port** the interaction pattern (grab radius, tear-by-length). It is also a performance reference: about 1,600 points in plain JS canvas (§4.6) |
| **Rapier 2D soft bodies** | Apache-2.0 | WASM, 0.21.0 ([tools-survey §1](tools-survey.md)) | A web can be built from raw particles plus edges: `new SoftBodyDesc([x0,y0,…]).setEdges([…])` ([creation guide](https://rapier.rs/docs/user_guides/javascript/soft_body_creation_and_insertion)). Also `setPinnedParticles`, `setSoftness(naturalFrequency, dampingRatio)`, `setParticleMass/Radius`. Per-edge `setEdgeTearResistance` "multiplies the tear thresholds" ([SoftBodyDesc](https://rapier.rs/javascript2d/classes/SoftBodyDesc.html)). At runtime: `particlePositions()`, `setParticlePosition`, `setParticlePinned`, `addParticleForce`, `applyImpulseAtPoint(impulse, point, falloffRadius)`, `edges()`, `topologyVersion()` ([SoftBody](https://rapier.rs/javascript2d/classes/SoftBody.html)). Tearing: `tearStrain` (a fraction of rest length), `tearForce`, `tearSmoothing`, `maxTearsPerStep` ("the most loaded going first"), `minPiece`, and `World.cutSoftBody(body, blade)`. Disconnected pieces become their own soft bodies ([tearing guide](https://rapier.rs/docs/user_guides/javascript/soft_body_tearing)) | **Adopt** (already decided). Open questions for the spike: is there per-edge **stiffness**, or only per-edge tear resistance? Can rest lengths be set (for pre-tension)? Speed |
| **Ten Minute Physics 14 "cloth"** | MIT header ([14-cloth.html](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/14-cloth.html)) | XPBD | Distance and bending constraints with compliance | **Fallback port.** XPBD compliance gives per-edge stiffness that does not depend on iteration count ([XPBD paper](https://matthias-research.github.io/pages/publications/XPBD.pdf)) |
| macr "Spider Web" (CodePen) | MIT (CodePen default) | Canvas drawing ([pen](https://codepen.io/macr/pen/gbNdpv)) | 18 radials and 18 rings drawn with `arcTo`, so the segments sag into curves; drawn progressively. No physics | Ideas only (a cartoon "Halloween sag") |
| eiskalteschatten/spider-web-js | **GPL-3.0** ([repo](https://github.com/eiskalteschatten/spider-web-js)) | Canvas drawing | Variable branch count, light/dark | **Excluded** (copyleft) |
| Krink & Vollrath 1997, "virtual spider" | paper ([J Theor Biol](https://www.sciencedirect.com/science/article/abs/pii/S0022519396903069)) | Rule-based web building, with parameters as "artificial genes" | Reproduces "spiral distances, eccentricities and vertical hub location" of real *Araneus* webs | Theory. Too much for a decoration: we generate geometry from measured statistics instead (§3). Gotts & Vollrath 1991 did the same with AI rules ([cited in ap Rhisiart & Vollrath 1994](https://core.ac.uk/download/pdf/85215251.pdf)) |
| Bournemouth / SIGGRAPH 2024, "O, What an Iridescent Web We Weave" | ACM paper, no code ([preprint](https://eprints.bournemouth.ac.uk/40198/1/SIGGRAPH24_preprint.pdf)) | Offline VFX in Houdini | Stiffer radials, more flexible spiral ("Vellum hair"). Thin-film "soap bubble" substrate (Glassner) with noise-varied thickness. A colour-ramp coat: "7% cyan, 3% green, 15% orange, 50% magenta … then reversing". Spheres for dew and glue | Ideas only. The colour ramp is a useful artistic default (§5) |
| Kajiya–Kay / Scheuermann strand specular | formula ([Scheuermann, ATI 2004](https://web.engr.oregonstate.edu/~mjb/cs557/Projects/Papers/HairRendering.pdf)) | GLSL snippet | `sinTH = sqrt(1 − dot(T,H)²)`, `dirAtten · pow(sinTH, exp)`. Two highlights with different exponents and colours; tangent shift `T + shift·N` | **Reimplement** the formula (§5). It is a standard model with no code to licence |
| Marschner et al. 2003 hair scattering | paper ([PDF](https://graphics.stanford.edu/papers/hair/hair-sg03final.pdf)) | Theory | "the reflection of a parallel beam from the surface of a cylinder will be in a cone centered on the hair axis" | Physics basis for §2.1 |
| Blender/Unity/Substance web generators | paid or engine-locked ([Superhive](https://superhivemarket.com/products/webixel--spider-web-generator), [Unity thread](https://discussions.unity.com/t/spiderweb-generator/657880), [ArtStation](https://matt-taylor.artstation.com/projects/LoyVv)) | – | – | Out (paid, or not for the web) |
| Thin lines in WebGL | technique ([Matt DesLauriers, "Drawing lines is hard"](https://mattdesl.svbtle.com/drawing-lines-is-hard)) | – | "Users running ANGLE … will get a maximum of 1.0" for `gl.lineWidth`. Use quads expanded in the vertex shader instead | **Build** the segment quads ourselves (§5.1) |

**Verdict.** Nothing ready-made does glinting, physical, tearable webs on
the web. The pieces exist with permissive licences: Rapier (sim), verlet-js
and Tearable Cloth (layout and interaction ideas, MIT), Ten Minute Physics
(fallback solver, MIT) and the strand-specular formula. We **build** only the
glint shader and the biology-based generator.

---

## 2. Silk optics

### 2.1 Why threads glint only in arcs and circles around the light

- **A smooth cylinder reflects into a cone.** Light reflected from a fibre
  lies "in a cone centered on the hair axis"
  ([Marschner 2003](https://graphics.stanford.edu/papers/hair/hair-sg03final.pdf)).
  The cone's half-angle equals the angle between the incoming light and the
  axis. So the eye sees a thread lit only where the thread's tangent **T**
  satisfies `T · (L̂ + V̂) = 0`, with both unit vectors pointing away from the
  thread **(computed: the cone condition θ_out = −θ_in, written with
  directions)**. Kajiya–Kay puts "a constant-intensity highlight centered on
  that cone" (same source). The same longitudinal cone also holds for light
  transmitted *through* the fibre (Marschner's TT and TRT lobes share it,
  shifted by only a few degrees: "αR … −10° to −5°"). So **one condition
  covers lamps in front of the web and lamps behind it** **(computed from
  Marschner's lobe table)**.
- **Scratches do the same.** For light circles in scratched metal, "the
  positions of the glints are from points on the scratch … perpendicular or
  tangential to radial lines extending back to the light source." Only
  scratches within about 15° of that make the visible streaks
  ([Atmospheric Optics, kitchen light circles](https://atoptics.co.uk/blog/opod-kitchen-optics-light-circles/)).
- **The spider-web halo.** On an orb web "the bright threads perpendicular
  to the sun form an (interrupted) circle between the spiderweb centre and
  the sun". The circle grows as the sun moves away from the web's centre and
  turns into "a dim and open circle segment"
  ([Atmospheric Optics, "Spiderweb halos", C. Gerber](https://atoptics.wordpress.com/2012/01/19/spiderweb-halos/)).
  On horizontal sheet webs the rings are "not circular, but oval – the
  imagined lines resemble contour lines on a map"
  ([Zawischa, Accidental Observations](https://farbeinf.de/static_html/strange2.html)).
- **The geometry, worked out** **(computed)**. For a viewer straight in
  front (V̂ = ẑ) and a light whose foot point on the web plane is F, a thread
  glints at the foot of the perpendicular from F onto the thread's line.
  - All **radials** pass through the hub C. The foot of the perpendicular
    from F onto any line through C sees CF at a right angle, so (by Thales)
    the radial glints lie on **the circle with diameter C–F**. That is
    exactly the "circle between the centre and the sun" above.
  - The **spiral** is roughly circles around C. A circle's tangent is
    perpendicular to F only where the circle meets **the line through C and
    F**, so the spiral glints make a short bright streak along that line.
  - Our camera eye is at a finite distance (`camera.distance()` =
    `viewDistance × viewportWidth`, `effects/camera/camera.ts`). That bends
    these into the ovals Zawischa describes. Evaluating the full 3D condition
    per pixel (§5) gets this for free.
- **The glint's width.** With a light of radius *r* at distance *d*, the
  cone is smeared by the light's angular size *r/d*. Silk "is not smooth on a
  microscopic scale" ([Zawischa, spiderweb optics](https://www.itp.uni-hannover.de/fileadmin/itp/emeritus/zawischa/static_html/spiderweb.html)),
  which adds roughness. Our `Light.radius` doc comment already names "glint
  length" as one of its uses (`effects/light/lights.ts`).

### 2.2 Thread sizes

| Thread | Size | Source |
|---|---|---|
| Dragline / major ampullate (frame, radials) | "widths from one to a few micrometres"; often "double cylinders lying side by side"; modelled at ≈2 µm; refractive index ≈1.55, low absorption in the visible | [Little et al., R Soc Open Sci 2020 (PMC7211891)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7211891/) |
| Natural silk, general | 2.5–4 µm | [Wikipedia, Spider silk](https://en.wikipedia.org/wiki/Spider_silk) |
| Cross-spider capture thread | "1–4 μm" thread; sticky drops ≈25 μm, "12 to 13 drops per millimeter" | [Zawischa](https://www.itp.uni-hannover.de/fileadmin/itp/emeritus/zawischa/static_html/spiderweb.html) |
| Dragline used in airflow tests | 0.5, 1.6 and 3 µm | [Zhou & Miles, PNAS 2017](https://www.pnas.org/doi/10.1073/pnas.1710559114) |

**On screen** **(computed)**: a 30 cm web shown 1,000 px wide is 300 µm per
pixel, so a 3 µm thread covers about 1% of a pixel. Unlit, a thread is close
to invisible. It shows up only where it glints, because the reflection of a
lamp is far brighter than the background. This is why it is drawn as a 1 px
line with low base opacity plus additive glint (§5).

### 2.3 Colours: iridescence and fringes

- **Cause.** The colours come from interference between light scattered by
  the regularly spaced glue droplets and by the thread between them: "the
  interference of two or more rays … gives rise to the colours"
  ([Zawischa](https://www.itp.uni-hannover.de/fileadmin/itp/emeritus/zawischa/static_html/spiderweb.html)).
  There are also "first-order diffraction patterns, which show spectra from
  blue to red in some places". The "blue or green sheen of the threads
  without bright reflections" is part of that pattern
  ([Zawischa, strange2](https://farbeinf.de/static_html/strange2.html)).
  EPOD gives the same cause: "interference of light interacting with arrays
  of tiny, sticky droplets", most visible out of focus
  ([EPOD 2015](https://epod.usra.edu/blog/2015/10/diffraction-and-refraction-in-a-spider-web.html)).
- **Where the colours appear.** Colours are strongest looking towards a
  backlight (forward direction). Backward reflection is weak, because uneven
  droplet sizes break up the coherence: the path difference is "small in
  forward … and large in backward direction"
  ([Zawischa](https://www.itp.uni-hannover.de/fileadmin/itp/emeritus/zawischa/static_html/spiderweb.html)).
- **Angles** **(computed)**:
  - Droplet period 1/12.5 mm = 80 µm gives a grating angle λ/d of 0.0056 rad
    (450 nm) to 0.0081 rad (650 nm). So the spectra sit within half a degree
    of the glint, as **colour fringes along the thread on either side of the
    white core**.
  - A ≈2 µm fibre diffracts over λ/d ≈ 0.27 rad (≈16°). This matches the
    measured "angular spread of the central backscattered peak of
    approximately 18°" at 633 nm
    ([Little et al. 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7211891/)).
  - Rendering consequence: a **sharp white glint**, a **thin coloured fringe
    around it**, and a **broad faint glow** (≈18°) around that.

### 2.4 Dew drops as lenses

- "each drop acts as a spherical lens, inverting the image": in the photo,
  the sun is "actually off the picture at left, not at right"
  ([EPOD 2013, B. Schultz](https://epod.usra.edu/blog/2013/10/spider-web-dew-drop-size.html)).
- The bigger drops sit at junctions: "beads of water have a tendency to
  gather at roughened spots on the web, at thread intersections … this is
  where the larger dew drops are found"
  ([EPOD 2021, T. Molinaro](https://epod.usra.edu/blog/2021/06/dew-drops-on-spider-web.html)).
  Larger drops gather at bumpy knots too ([EPOD 2013](https://epod.usra.edu/blog/2013/10/spider-web-dew-drop-size.html),
  citing Zheng et al. 2010, [PubMed](https://pubmed.ncbi.nlm.nih.gov/20130646/)).
- A drop on a backlit web splits sunlight into colours by refraction
  ([EPOD 2015](https://epod.usra.edu/blog/2015/10/diffraction-and-refraction-in-a-spider-web.html)).
- **Rendering:** reuse the drop lens from
  [water-drops.md §6](water-drops.md): the refraction lookup with the inverted
  image, the Fresnel rim, and highlights from the light registry. Each drop
  is a tiny version of the drops on the pane. Drop diameter on a web is
  **not sourced**. Use 0.3–2 mm real, which is 2–8 px on screen
  **(estimate, from the reference photos)**.

### 2.5 Dark versus lit backgrounds, front versus back light

- "a plain, dark background … will highlight the translucent web". Shooting
  "into the sun" turns "the strands of the web into glowing threads of
  light". From one side a web "can look quite dull and lifeless … while the
  other side looks gorgeous"
  ([Digital Photography School](https://digital-photography-school.com/how-to-photograph-a-spiders-web/)).
- In one sequence, minutes after the threads were scintillating, a light
  change left the web threads "nearly invisible"
  ([Todd Henson](https://toddhensonphotography.com/blog/a-scintillating-spider-web)).
- **Consequence** **(estimate, from the above and §2.2)**:
  - Against a bright photograph the base line should almost vanish, and only
    glints read.
  - Against the dark site chrome a faint grey base line is right.
  - Lights *behind* the web (our `Light.below`, a photo's own bright spot)
    should glint more strongly and with more colour than lamps in front.

### 2.6 Reference photographs (to check against side by side)

| Photo | Shows |
|---|---|
| [Atmospheric Optics, spiderweb halos (C. Gerber)](https://atoptics.wordpress.com/2012/01/19/spiderweb-halos/) | The glint circle between hub and sun |
| [Atmospheric Optics, kitchen light circles](https://atoptics.co.uk/blog/opod-kitchen-optics-light-circles/) | The same geometry on scratches |
| [Zawischa, spider web optics](https://www.itp.uni-hannover.de/fileadmin/itp/emeritus/zawischa/static_html/spiderweb.html) and [accidental observations](https://farbeinf.de/static_html/strange2.html) | Colour sequences along threads; oval glint rings on sheet webs |
| [EPOD 2015 (C. Terzian)](https://epod.usra.edu/blog/2015/10/diffraction-and-refraction-in-a-spider-web.html) | Defocused iridescent hub; a dew drop splitting colours |
| [EPOD 2013 (B. Schultz)](https://epod.usra.edu/blog/2013/10/spider-web-dew-drop-size.html) | Dew drops like half-lit moons, with inverted images |
| [EPOD 2021 (T. Molinaro)](https://epod.usra.edu/blog/2021/06/dew-drops-on-spider-web.html) | Larger drops at intersections, monochrome |
| [Todd Henson, "A scintillating spider web"](https://toddhensonphotography.com/blog/a-scintillating-spider-web) | The same web, glinting and then invisible, minutes apart |
| [Roeselien Raimond, iridescent webs](https://www.roeselienraimond.com/iridescent-spider-webs/) | Strongly coloured backlit webs |

All are links for comparison only. None is copied into the site.

**Still to do:** photograph a real web (or cotton thread) by a desk lamp in
front of one of Ony's framed prints, moving the lamp. That checks the circle
and the brightness against our own lighting.

---

## 3. Web structure and how to generate it

### 3.1 Orb webs (*Araneus diadematus*, the garden cross spider)

Construction order ([Wikipedia, Spider web](https://en.wikipedia.org/wiki/Spider_web)):

1. A bridge thread, then a Y-shaped frame.
2. Radials, added until the gap between neighbours "is small enough to
   cross".
3. The spider "fortifies the center of the web with about five circular
   threads" (the hub).
4. A widely spaced non-sticky auxiliary spiral, laid from the inside out.
5. That spiral is replaced "from the outside and moving inward" by a closer
   adhesive capture spiral.

The web is about "20 times the size of the spider".

Measured, from 194 laboratory webs: [ap Rhisiart & Vollrath, Behav Ecol 5:280 (1994)](https://core.ac.uk/download/pdf/85215251.pdf), Table 1, mean ± SE.

| Quadrant | Radii | Radial length (mm) | Capture-spiral threads crossed |
|---|---|---|---|
| North (up) | 6.8 ± 0.1 | 83.8 ± 1.4 | 26.1 ± 0.6 |
| West | 7.7 ± 0.1 | 84.9 ± 1.6 | 27.0 ± 0.7 |
| East | 7.9 ± 0.11 | 84.8 ± 1.6 | 27.0 ± 0.6 |
| South (down) | 10.7 ± 0.16 | 107.7 ± 2.1 | 31.5 ± 0.8 |

- **Total radii ≈ 33** (6.8 + 7.7 + 7.9 + 10.7) **(computed)**.
  [Vollrath et al.](https://european-arachnology.org/esa/wp-content/uploads/2015/08/107-116_Vollrath.pdf)
  give 32.1 ± 0.5, with the widest angles between radii in the north.
- **The hub sits above centre**: 83.8 / (83.8 + 107.7) = 0.44 of the
  height from the top **(computed)**.
- **Mesh (spiral spacing).**
  - In the north it widens outwards: "mesh height = 0.106 × width + 1.43"
    (mm, where *width* is the spacing between radii).
  - In the south it stays nearly constant: "mesh height = 0.011 × width +
    2.86". The spider makes this even mesh by adding U-turns ("reverses") to
    the spiral in the south (same paper).
  - So the spacing is ≈3 mm on a web about 190 mm tall. That is ≈30 turns
    from the hub to the edge **(computed)**.
- **Glue drops are larger in the south** (Edmonds & Vollrath 1992, cited in
  the same paper).
- Segments between radials are **straight chords**, because the threads are
  under tension. The pre-stress in radials is up to 100 MPa, and 29–46 MPa
  averaged over a web
  ([Mortimer et al., J R Soc Interface 2016](https://royalsocietypublishing.org/rsif/article/13/122/20160341/89528/Tuning-the-instrument-sonic-properties-in-the)).

### 3.2 Cobwebs and tangle webs for corners

- "Cobweb" means two things:
  - a "seemingly abandoned (i.e., dusty) web";
  - the "tangled three-dimensional web" of the Theridiidae
    ([Wikipedia, Cobweb](https://en.wikipedia.org/wiki/Cobweb)).
- The Theridiidae are "the most common arthropod group found in human
  dwellings". Their gumfoot webs have "frame lines that anchor them to
  surroundings" and sticky trap lines ([Wikipedia, Theridiidae](https://en.wikipedia.org/wiki/Theridiidae)).
- Their webs "remain in place for extended periods and are expanded and
  repaired" (same source). That is why old corner webs build up dust and
  layers.
- Sheet webs lie in a "horizontal plane" with "loose, irregular tangles of
  silk above them" ([Wikipedia, Spider web](https://en.wikipedia.org/wiki/Spider_web)).

### 3.3 Generators (to build, porting verlet-js's indexing idea)

**Orb generator** **(estimate: an algorithm assembled from §3.1)**:

1. **Frame.** Take 3–6 anchor points from the host's box: a photo's corners
   and edges, or two neighbouring photos for a web spanning a gap. Join them
   into a frame polygon.
2. **Hub.** Place it at 0.44 of the frame height from the top, with ±5%
   jitter.
3. **Radials.**
   - Count *N*: 33 in nature; the default on screen is 24 (§6).
   - Share them out by the north/west/east/south ratio 6.8 : 7.7 : 7.9 :
     10.7, so they are denser below the hub.
   - Jitter each angle by ±20% of the local spacing.
   - Each radial runs from the hub to where it meets the frame.
4. **Hub threads.** About 5 small rings, out to ≈8% of the mean radial
   length **(estimate)**.
5. **Free zone.** A gap with no spiral, out to ≈15% **(estimate)**.
6. **Capture spiral.**
   - Start at the outer edge and wind inwards.
   - In the upper half, the step on each radial is `h = a·w + b`, where *w*
     is the local spacing between radials. Use the north law (`a = 0.106`,
     `b = 1.43`, scaled from mm to px by web size).
   - In the lower half, use a near-constant step (the south law). Add 1–3
     U-turns there.
   - Join consecutive crossings with straight chords.
7. **Imperfections** (nature has them; the lab can turn them off):
   - drop a random 0–5% of spiral chords;
   - one missing sector (some species leave a "free sector";
     **(estimate)**);
   - a slight sag of the outer chords.

The **nodes** are the spiral × radial crossings, plus the hub and the frame
anchors. With 24 radials × 18 turns that is ≈430 nodes and ≈900 edges
**(computed)**, inside the 300–1,000 particle budget. Each node records the
**thread type** of every edge (frame, radial, hub, spiral). The type sets
stiffness, tear strength, glint weight and glue drops.

**Corner cobweb generator** **(estimate)**:

1. Anchor 6–14 "fan" threads on the two edges that meet at a frame corner.
   Each has a rest length 2–8% longer than its span, so it sags.
2. Add irregular cross-threads between neighbouring fan threads at random
   distances, some of them double.
3. Add 2–4 long trailing strands with one end free (torn).
4. "Dust": lower glint sharpness, a grey-white base colour, and a few
   clumped nodes.

These are the Halloween corner pieces.

**Tangle (gumfoot) variant:** random 3D-looking crossings drawn with depth
fading. Low priority **(estimate)**.

---

## 4. Mechanics

### 4.1 Silk material

| Silk | Initial stiffness | Strength | Breaking strain | Source |
|---|---|---|---|---|
| *Araneus* major ampullate (frame, radials) | 10 GPa | 1.1 GPa | 0.27 | [Gosline et al., J Exp Biol 1999, Table 1](http://biomimetic.pbworks.com/f/The+mechanical+design+of+spiderGosline.pdf) |
| *Araneus* viscid (capture spiral) | 0.003 GPa ("comparable with … a lightly crosslinked rubber") | 0.5 GPa | 2.7 | same |

Both silks have a hysteresis of 65%, so they absorb most of the energy put
into them and **bounce very little**. Density is ≈1.3 g/cm³
([Wikipedia](https://en.wikipedia.org/wiki/Spider_silk)).

- **Stiffness ratio:** radials are ≈3,000× stiffer than the spiral, and the
  spiral stretches 10× further before it breaks **(computed)**.
- **Pre-strain:** at 40 MPa average pre-stress, a radial is stretched
  40 MPa / 10 GPa = 0.4% beyond its slack length **(computed)**. In the sim,
  set rest length = 0.996 × layout length for radials and frame.
- **The spiral stays taut by itself.** Its core thread spools up inside the
  glue droplets (a "windlass"), so it keeps tight however it is compressed
  ([Elettro et al., arXiv:1501.00962](https://arxiv.org/html/1501.00962)).
  In the sim, spiral edges **never go slack**: when compressed they shorten
  their rest length, down to a floor **(estimate)**.

### 4.2 How webs sway and vibrate in air

- **Thin silk moves with the air.** Spider silk "captures fluctuating airflow
  with maximum physical efficiency (V_silk/V_air ∼ 1) from 1 Hz to 50 kHz".
  "When a fiber is sufficiently thin, it can move with the medium flow
  perfectly", with fluid forces dominating over the fibre's own mechanics
  ([Zhou & Miles, PNAS 2017](https://www.pnas.org/doi/10.1073/pnas.1710559114)).
  Only the fixed ends and the web's tension hold it back.
  - **Model consequence:** do **not** use a force proportional to area.
    Instead **relax each particle's velocity towards the local air
    velocity**: `v += k_air · (v_air(p) − v)` each substep, with k_air near 1
    for silk. The tension and pins then resist **(estimate, from the PNAS
    result)**.
  - The cursor's wind: `v_air(p) = v_cursor · falloff(|p − cursor| / R)`,
    plus a slow ambient breeze (low-frequency noise).
  - In Rapier, `applyImpulseAtPoint(impulse, point, falloffRadius)` is this
    call almost exactly ([SoftBody](https://rapier.rs/javascript2d/classes/SoftBody.html)).
- **Wind and web shape.** Wind loads favour "smaller and less dense webs";
  air drag also dissipates prey impact energy
  ([Zaera et al., J R Soc Interface 2014](https://www.researchgate.net/publication/263477157_Uncovering_changes_in_spider_orb-web_topology_owing_to_aerodynamic_effects)).
- **Vibration.** Transverse waves travel at `c = √(T/μ)` and die away with
  distance. Measured damping is 0.64–1.68 dB/cm. The capture spiral damps
  transverse waves, and longitudinal waves travel "with the least
  attenuation" ([Mortimer et al. 2016](https://royalsocietypublishing.org/rsif/article/13/122/20160341/89528/Tuning-the-instrument-sonic-properties-in-the)).
  - **For us:** a poke ripples outward and dies within a few centimetres of
    web, mostly along the radials. Damping ratio ≈0.3–0.6 per edge
    **(estimate)**.
- **Charged objects pull webs.** Charged insects and water drops falling
  near cross-spider webs "induce rapid thread deformation" of 1–2 mm at
  0.7–1.9 m/s, within about two body lengths
  ([Ortega-Jimenez & Dudley, Sci Rep 2013](https://www.nature.com/articles/srep02108)).
  An optional touch: threads twitch towards the cursor just before it
  touches them.

### 4.3 How webs tear

- **Damage stays local.** "the geometrical arrangement of the threads and the
  nonlinear stress response combine to limit damage to the area near the
  impact site". Silk is "linear at low strain, suddenly softening as strain
  increases then stiffening prior to failure"
  ([Cranford et al., Nature 2012](https://www.nature.com/articles/nature10739)).
- **The loaded thread breaks, and only that one:** "when either type
  fails … it is the only filament to fail". "When a radial filament … is
  snagged, the web deforms more than when a relatively compliant spiral
  filament is caught". The web "returns to stability", even under simulated
  hurricane-force winds
  ([ScienceDaily on Cranford 2012](https://www.sciencedaily.com/releases/2012/02/120201140004.htm)).
- **For us:**
  - **Tear by strain per thread type.** Radial and frame edges break at about
    0.27 strain. Spiral edges break at about 2.7, so the spiral stretches a
    long way first.
  - **"Most loaded first," a few edges per step.** Rapier's `maxTearsPerStep`
    does exactly this ([tearing guide](https://rapier.rs/docs/user_guides/javascript/soft_body_tearing)).
  - **Tear smoothing,** so one jolt doesn't shred the web.
  - Result: a drag at one point tears the threads next to the grab, and the
    rest of the web holds.

### 4.4 How a torn piece hangs and clings

**(estimate, from §4.1–4.3)**

- **Recoil.** Radials store elastic strain, so a broken radial snaps back
  towards its anchors. The spiral keeps taut by the windlass (§4.1), so a
  torn spiral shortens rather than drooping. On a tear, multiply the rest
  length of the torn chain by 0.9–0.97.
- **Hanging.** A piece left on one anchor hangs as a bundle of catenaries
  under gravity. Most of its motion is air-driven (§4.2), so it drifts and
  sways slowly. A piece torn off completely falls slowly, like fluff
  (strong air relaxation, k_air ≈ 0.2–0.5 per substep).
- **Clinging.** Capture silk is sticky
  ([Zawischa](https://www.itp.uni-hannover.de/fileadmin/itp/emeritus/zawischa/static_html/spiderweb.html)
  on sticky drops; [Theridiidae](https://en.wikipedia.org/wiki/Theridiidae)
  on viscid support threads). A free particle that touches a photo frame or
  the page edge **sticks**: pin it, with a break force so a hard pull pulls
  it free. Threads that touch each other **clump**: merge particles closer
  than 2 px.

### 4.5 Interaction

**(estimate, ported from Tearable Cloth's pattern)**

- **Grab.** Pointer down within 12–20 px of a particle (Tearable Cloth uses
  20). Pin the particle and drive it to the cursor (`setParticlePinned`,
  `setParticlePosition`). Pulling stretches the threads next to it until they
  tear (§4.3).
- **Tear off.** Once the grabbed piece is disconnected (Rapier
  `topologyVersion()` changes and the piece becomes its own soft body), it
  follows the cursor. On release it drifts down and clings (§4.4).
- **Cut.** A fast flick (cursor speed above a threshold) cuts with
  `World.cutSoftBody(body, [p_prev, p_now])`
  ([World](https://rapier.rs/javascript2d/classes/World.html)).
- **Brush.** The cursor passing near without a click only blows air (§4.2).

### 4.6 Real-time cost

- **Verlet in JS:** Tearable Cloth steps 31 × 51 ≈ 1,580 points (≈3,100
  constraints) at 3 iterations a frame in plain canvas JS, and runs smoothly
  in a browser ([pen](https://codepen.io/dissimulate/pen/nYQrNP)). A
  1,000-node web with ≈2,000 edges at 8–10 XPBD substeps is
  ≈20,000 constraint solves a frame. That is about 0.3–1 ms in JS
  **(estimate, from the Tearable Cloth scale; measure)**.
- **Rapier soft bodies:** no published numbers. The API is a week old.
  [tools-survey §1](tools-survey.md) already plans a half-day spike on "one
  web (≈300 particles)" on a mid-range Android. Measure 300, 600 and 1,000
  there.
- **Budget** (proposed, matching [water-drops §6.4](water-drops.md)):
  - sim ≤ 1 ms desktop and ≤ 2 ms mobile for all visible webs while they
    move;
  - draw ≤ 0.3 ms;
  - **sleep when still** (Rapier `setCanSleep`; for the fallback, stop
    stepping when the maximum velocity is below ε) so a resting web costs
    ≈0.

---

## 5. Rendering (WebGL1, our engine)

### 5.1 Geometry

- One **quad per edge**: 4 vertices, expanded in the vertex shader to
  1–1.5 px plus a 1 px anti-alias feather ([DesLauriers](https://mattdesl.svbtle.com/drawing-lines-is-hard)).
- Rebuild a dynamic vertex buffer from `particlePositions()` and `edges()`
  each frame the sim is awake. For 2,000 edges × 4 verts × ~6 floats that is
  48k floats a frame **(computed)**. Re-read `edges()` only when
  `topologyVersion()` changes.
- Per vertex: position, the segment's unit tangent **T**, its thread type,
  and the coordinate across the line (for coverage).
- Glue droplets and dew drops are instanced point quads at their nodes, or
  along spiral edges at a fixed spacing, drawn in a second pass with the drop
  lens shader.

### 5.2 The glint: every light in the list

Per fragment at page point **p** (CSS px, z = 0), loop
`for (int i = 0; i < MAX_LIGHTS; i++)` over the packed light uniforms
(`effects/light/light-uniforms.ts`: `uLightPos` = x, y, height;
`uLightColour`, `uLightPower`, `uLightRadius`, `span`, `aim`, `below`):

```
Lp   = nearestOnLight(p, light.xy, span)       // line lights (existing helper)
Lvec = vec3(Lp - p, below ? -height : height)  // a below light shines from behind
L    = normalize(Lvec);  V = normalize(eye - vec3(p, 0.0))
g    = dot(T, L + V)                           // 0 exactly on the glint cone (§2.1)
w    = sqrt( (radius / length(Lvec))^2 + rough^2 )
core = exp(-(g / w)^2)                         // sharp white glint
halo = haloGain * exp(-(g / 0.31)^2)           // the ≈18° diffraction lobe (§2.3)
fringe = iridGain * ramp(abs(g) / (w * fringeW)) * (1 - core)   // colour band beside the core
fwd  = mix(1.0, backBoost, step(0.0, -dot(L, V)))  // forward-scatter boost when backlit (§2.3, 2.5)
glint += lightColour * power * falloff(Lvec) * fwd * (core * typeGain + halo + fringe)
```

- `ramp` defaults to the SIGGRAPH 2024 artist ramp: cyan 7%, green 3%,
  orange 15%, magenta 50%, then mirrored
  ([preprint](https://eprints.bournemouth.ac.uk/40198/1/SIGGRAPH24_preprint.pdf)).
  An alternative is a spectral ramp keyed to the computed λ/d.
- `typeGain`: spiral threads glint more, because they carry droplets. Dusty
  cobwebs get a lower gain and a wider `rough`.
- `falloff` is the existing `irradianceFalloff`, which keeps the glint
  consistent with the glass and floor passes.
- This is Kajiya–Kay's `sin(T,H)^p` written as a Gaussian in `T·(L+V)`, so
  the light's angular size sets the width directly
  ([Scheuermann](https://web.engr.oregonstate.edu/~mjb/cs557/Projects/Papers/HairRendering.pdf)).

**Output:**

- `rgb = base · coverage + glint · coverage`, where coverage is the line's
  anti-aliased width fraction.
- `base` is a grey of opacity 0.03–0.15 (lab).
- Blend the glint additively into the **plus-lighter** layer, the same
  channel the caustics use ([water-drops §6.3](water-drops.md)).
- Draw the base line normally.
- With bloom on, strong glints spread into the twinkle in the reference
  photos ([tools-survey bloom row](tools-survey.md)).

### 5.3 Fallback (no WebGL)

An SVG or canvas 2D path of the edges, at a fixed low opacity. Glint is
approximated on the CPU per segment for the cursor lamp only:
`exp(−(g/w)²)` at the segment's foot point, drawn as a short bright dash
**(estimate)**.

---

## 6. Decisions

### 6.1 Adopt / port / build

| Part | Decision | Rests on |
|---|---|---|
| Physics | **Adopt Rapier 2D** soft body built from **raw particles + `setEdges`**: not `polyline`, whose edges are "held by shape matching" and would pull torn pieces back to their old shape ([creation guide](https://rapier.rs/docs/user_guides/javascript/soft_body_creation_and_insertion)). Pins: `setPinnedParticles`. Tearing: `tearStrain` plus `setEdgeTearResistance` per thread type, `maxTearsPerStep`, `tearSmoothing` | §1, §4, [tools-survey §2](tools-survey.md) |
| Fallback physics | **Port** Ten Minute Physics XPBD (MIT), adding per-edge compliance, tension-only edges, tear by strain and air relaxation. About 300 lines **(estimate, per tools-survey)** | §1, §4.6 |
| Orb generator | **Build**, using verlet-js's indexing and pre-tension idea (MIT) with the ap Rhisiart & Vollrath numbers | §3.1, §3.3 |
| Corner cobweb generator | **Build** | §3.2, §3.3 |
| Interaction | **Port** the Tearable Cloth pattern (MIT): grab radius, tear by strain, flick to cut | §1, §4.5 |
| Glint shader | **Build** from the Kajiya–Kay / Marschner cone condition, looping over every light in the registry | §2.1, §5.2 |
| Dew drops | **Reuse** the water-drops lens shader | §2.4 |

### 6.2 Numbers

| Quantity | Value | Basis |
|---|---|---|
| Radii | nature 33 (32.1 ± 0.5); default **24**; lab 8–40 | ap Rhisiart & Vollrath 1994; Vollrath et al. |
| Radii split N : W : E : S | 6.8 : 7.7 : 7.9 : 10.7 | ap Rhisiart & Vollrath 1994 |
| Hub position | 0.44 of height from the top | **(computed)** from radial lengths 83.8 / 107.7 mm |
| Hub rings | ≈5 | Wikipedia |
| Spiral turns | nature ≈26–32 per quadrant; default **18**; lab 6–35 | ap Rhisiart & Vollrath 1994 |
| Spiral step | upper: `0.106·w + 1.43`; lower: `0.011·w + 2.86` (mm, scaled) | ap Rhisiart & Vollrath 1994 |
| Particles per web | 300–600 default, cap 1,000 | §3.3 **(computed)**, §4.6 |
| Stiffness ratio radial : spiral | nature ≈3,000; default **100** (so the spiral still looks taut on screen) | Gosline 1999; default **(estimate)** |
| Tear strain | radial/frame 0.27; spiral 2.7 (lab ×0.5–2) | Gosline 1999 |
| Radial pre-strain | 0.4% (rest = 0.996 × length) | **(computed)** from Mortimer 2016 and Gosline 1999 |
| Restitution | ≈0 (65% hysteresis) | Gosline 1999 |
| Air relaxation k_air | attached web 0.6–0.9 per substep; free piece 0.2–0.5 | Zhou & Miles 2017 → **(estimate)** |
| Cursor wind radius | 80–160 px | **(estimate)** |
| Grab radius | 16 px (Tearable Cloth: 20) | §4.5 |
| Glint roughness | 0.08 rad (lab 0–0.3) | **(estimate)**; scratches need ≈15° = 0.26 rad (atoptics) |
| Halo lobe width | 0.31 in g (≈18°) | Little et al. 2020 |
| Glue drop spacing | 12–13 per mm real; on screen one bead every 4–8 px of spiral, if shown | Zawischa; **(estimate)** for screen |
| Dew drop size | 2–8 px, at junctions | **(estimate)**; junctions per EPOD |
| Base line opacity | 0.03 on photos, 0.12 on dark chrome | **(estimate)**, §2.5 |

### 6.3 Lab controls (`?lab=webs`)

- **Generator:** type (orb, corner cobweb, tangle), seed, radii, spiral
  turns, hub offset, irregularity, missing chords %, free sector, sag %, dew
  amount, dew size, dust (Halloween look), spiral beads on/off.
- **Sim:** substeps, radial stiffness, stiffness ratio, damping, tear strain
  (radial and spiral), max tears per step, tear smoothing, recoil %, cling
  on/off, clump distance, gravity scale.
- **Wind:** cursor wind radius and strength, ambient breeze strength and
  period, electrostatic twitch on/off.
- **Interaction:** grab radius, flick-to-cut speed, release drift (k_air for
  free pieces).
- **Optics:** base opacity, glint gain, roughness, halo gain, iridescence
  gain and ramp (artist or spectral), backlit boost, per-type glint gain.
- **Debug overlays:** edges coloured by strain; particles; the **predicted
  glint circle** (the Thales circle on hub ↔ lamp foot point) drawn over the
  web, as a direct check of §2.1.
- **Season:** Halloween on/off (corner cobwebs on frames in October).

### 6.4 Still unknown

- Rapier soft bodies:
  - per-edge **stiffness**, or only per-edge tear resistance?
  - how to set pre-tension (create at shrunk positions, then move the
    pins?);
  - whether edges are truly tension-only;
  - the real ms per web.

  All of these go in the planned spike ([tools-survey §1](tools-survey.md)).
- Dew drop sizes on webs: no source was reachable (BioOne and PMC blocked).
  Measure from the reference photos.
- Colour accuracy: no measured spectra of backlit webs. The ramp is artistic.
  Compare against the Zawischa and EPOD photos.
- Our own reference: a desk lamp moved around a real web (or a cotton
  thread) in front of a framed print, to set glint gain and base opacity.

## 7. Status (2026-10-01)

- **The Rapier spike failed on pins.** In @dimforge/rapier2d-compat 0.21.0 a
  soft body built from raw particles + `setEdges` with
  `setPinnedParticles` (and, separately, `attachParticle` to a fixed body,
  and the root body set fixed) fell freely under gravity with its pins:
  433 particles, 864 edges, 1.35 ms a step in Node (computed here). So the
  web uses the 6.1 fallback: XPBD after Ten Minute Physics' cloth (MIT),
  in `src/effects/webs/net.ts`, with tension-only threads, per-type
  compliance and tear strain, and air relaxation, as 6.1 lists.
- Built behind `?try=webs`: the orb generator (`orb.ts`, the 3.1 numbers),
  sway in the room's air and the pointer's wake, grab-and-pull tearing,
  flick-to-cut, and each light's glint by the cone condition (2.1).
  Tests: tension only, pins, tear strains 0.27 / 2.7, cut, hub height,
  node count, radials denser below, settles without tearing.
- Still to do: dew drops (the drop lens), corner cobwebs, iridescence,
  the lab controls of 6.3.
