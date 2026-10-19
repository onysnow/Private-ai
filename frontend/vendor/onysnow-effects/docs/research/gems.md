# Fire opal, quartz and other crystals (R11)

Research only, 2026-10-01. No code changed. Every claim has a source link.
Numbers marked **(computed)** are worked out here from cited inputs, with the
working shown or the script inputs named. **(estimate)** marks a judgement that
no source states.

Feeds task 79: fire opal, quartz and other crystals as materials on the
photography site, the way glass is now. Every light in the scene lights them:
the cursor lamp, the flash, the flare and the black light. The engine is our
own raw WebGL1 context. three.js can't be used
([tools-survey.md §0, §12](tools-survey.md)).

Starting point: [tools-survey.md §8](tools-survey.md) decided "build, port
the maths". This doc fills in the physics and the numbers, and corrects one
survey detail: where the facet planes are stored (§5.1).

---

## 0. Short answer

- **Faceted and crystal stones** (quartz point, fire opal, fluorite, calcite,
  diamond): add a **convex-polyhedron shape** to the existing glass-solid
  tracer. Today `GlassSolid` raymarches six SDF shapes at three wavelengths
  with 4 bounces (`src/components/site/GlassSolid.tsx`,
  `src/effects/optics/solids.glsl.ts`). The new shape is a list of planes,
  intersected analytically, which is exact and needs no BVH
  ([Haines, Graphics Gems II p. 247](https://www.realtimerendering.com/resources/GraphicsGems/category.html)).
  Guy & Soler did this per fragment on 2003 hardware at 12–30 fps
  ([SIGGRAPH 2004](https://inria.hal.science/inria-00510165/PDF/GraphicsGemsRevisited.letter.pdf)).
  piellardj/diamond-webgl does it in WebGL1 today (GPL, so ideas only).
- **Planes go in a uniform array**, not a texture. Every reported device has
  ≥ 256 fragment uniform vectors
  ([web3dsurvey](https://web3dsurvey.com/webgl/parameters/MAX_FRAGMENT_UNIFORM_VECTORS)),
  and GLSL ES 1.00 allows a loop index to index a uniform array
  ([spec, App. A §5](https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf)).
  `uniform vec4 uPlanes[96]` (enough for diamond-webgl's 89-facet diamond) fits beside the light arrays (§5.1).
- **Dispersion: keep the engine's own `indexAt(λ, n_d, V)`**. Fed each
  stone's n_d and Abbe number, it reproduces the gemmological B–G dispersion
  (diamond 0.0438 against 0.044; quartz 0.0134 against 0.013) **(computed,
  §5.2)**. three.js's 3-sample spread is the same idea and adds nothing. Diamond
  needs a 6-wavelength quality tier.
- **Opal play-of-colour is a volume Bragg mirror, not a surface grating.**
  - Each patch (domain) of ordered spheres reflects one narrow band around
    its own lattice-plane normal.
  - λ = 2·d₁₁₁·√(n_eff² − sin²θ), with d₁₁₁ = D·√(2/3).
  - Spheres 150–350 nm give violet to red
    ([webexhibits](https://www.webexhibits.org/causesofcolor/15F.html),
    [AAPT](https://advlabs.aapt.org/document/servefile.cfm?ID=14965&DocID=5025),
    [Sumo 2026](https://armandsumo.com/posts/opals/)).
  - Tilting the stone 60° shifts a red patch to green **(computed, §2.3)**.
  - Shader: cellular-noise patches, each with a random plane normal and
    sphere size. A mirror lobe about that normal for each light, and for the
    room. Hue from a λ→RGB LUT built with the CIE fit already in
    `thin-film.ts`.
  - Stam's grating shader is the wrong model for a volume crystal. Keep it
    only as a reference for the colour map.
- **Labradorite uses the same Bragg-mirror code** with one plane orientation
  per stone. Weidlich & Wilkie's lamella values give violet to red
  ([2009](https://www.cg.tuwien.ac.at/research/publications/2009/weidlich_2009_REL/weidlich_2009_REL-.pdf)).
- **Fire opal body:**
  - Transparent to semi-transparent and "gelatin"-like. The orange-red comes
    from iron-oxide inclusions
    ([Smithsonian](https://naturalhistory.si.edu/explore/collections/geogallery/10002768)).
  - RI 1.45 (+0.020, −0.080), so 1.37–1.47
    ([Gemology Project](http://gemologyproject.com/wiki/index.php?title=Opal)).
  - Iron above 1,000 ppm quenches opal's UV glow, and above 3,000 ppm kills
    it ([Gaillou et al. 2008](https://insu.hal.science/insu-00323885/file/PL02078.pdf)).
    So under the black light, fire opal stays dark or near-dark. Low-iron
    white or common opal glows green (uranyl).
- **Quartz:**
  - n_ω 1.544, n_ε 1.553, birefringence 0.009, dispersion 0.013
    ([Gemology Project](http://gemologyproject.com/wiki/index.php?title=Quartz),
    [Mindat](https://www.mindat.org/min-3337.html)).
  - The doubling is too small to see: 0.06 mm per 10 mm **(computed)**.
  - Inert under UV ([GemID: amethyst LW/SW inert](https://gemid-labs.com/gems/amethyst/)).
  - It transmits UV from 0.18 µm
    ([Crystran](https://www.crystran.com/optical-materials/crystal-quartz-sio2/)),
    so a quartz point passes the black light to whatever is behind it.
  - A point is a hexagonal prism (m) with three r and three z faces, at
    142° to the prism
    ([quartzpage](http://www.quartzpage.de/crs_intro.html)). That is 13
    planes.
- **Other stones worth offering:**
  - **fluorite**: the strongest UV glow, blue-violet from Eu²⁺ at about
    425 nm;
  - **calcite**: the visible double image, with up to 6.3° walk-off;
  - **diamond**: the most fire;
  - **labradorite**: the flash.

  Numbers are in §4.

---

## 1. Tools first

| Candidate | Licence (checked) | Tech | Covers | Lacks / fit | Decision |
|---|---|---|---|---|---|
| **piellardj/diamond-webgl** ([repo](https://github.com/piellardj/diamond-webgl)) | **GPL-3.0** (LICENSE at HEAD, cloned 2026-10-01; last commit 2024-01-15) | **WebGL1** (`getContext("webgl")` in `docs/script/main.min.js`). Rasterise, then ray trace inside the gem against every facet; bloom "sparkle" by a two-direction blur; one-pass FXAA (README) | Real-time faceted gems: Snell, Fresnel, TIR, Beer, many cuts, ASET images. Cost: "for a typical diamond, it is 89 intersections" per bounce, complexity "FRAGMENTS × REBOUNDS × FACETS". A cube-map shortcut was rejected as inaccurate (README "Other approaches") | Copyleft. Only minified builds are in the repo, and the source is no longer there | **Ideas only.** It shows the plan works on WebGL1 |
| Guy & Soler, "Graphics Gems Revisited" ([SIGGRAPH 2004 PDF](https://inria.hal.science/inria-00510165/PDF/GraphicsGemsRevisited.letter.pdf)) | paper | Cg on a GeForce FX 5900 | Convex polyhedral gem, per-fragment. Three trees, or one at the mean index "at the expense of frame rate". Fresnel from 1D tables; polarisation by coherency matrices; birefringence. "12 to 30 fps at depths 2 and 3" | – | **Reference** for the method and the bounce depth |
| Haines, "Fast Ray–Convex Polyhedron Intersection" ([Graphics Gems II p. 247, code p. 575](https://www.realtimerendering.com/resources/GraphicsGems/category.html); [RTR intersection table](https://www.realtimerendering.com/intersections.html)) | book (code licence not checked) | C | Ray against a set of half-spaces: the largest entering *t* and the smallest exiting *t* | – | **Reimplement** (about 15 lines) |
| three.js dispersion ([transmission_pars_fragment](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/transmission_pars_fragment.glsl.js) l. 180–181) | MIT (LICENSE fetched) | GLSL | `halfSpread = (ior−1)·0.025·dispersion`, with dispersion = 20/V ([KHR_materials_dispersion](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_dispersion/README.md)). So n ± (n_F−n_C)/2 | Our `indexAt` already does this per wavelength | **Not needed** (§5.2) |
| three.js iridescence ([iridescence_fragment](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/iridescence_fragment.glsl.js)) | MIT | GLSL ES 1.00-safe (`for m = 1..2`) | Belcour–Barla thin-film Airy term with spectral integration in Fourier space (`evalSensitivity`) | One film, not a 100-layer stack | **Port option** for a coated or "mystic" quartz. Our `thin-film.ts` already covers the physics |
| Stam, GPU Gems ch. 8 ([chapter](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-8-simulating-diffraction)) | free to read | Cg | A surface grating: λ = d·u/n, u = sin θ₁ − sin θ₂, summed over n < 8; a "blend3" rainbow map with C = 4 | Needs a tangent direction. Models a 1D grating (CD), not a 3D lattice | Ideas only (the colour map) |
| Yokota & Fujishiro, "Visual simulation of opal…" ([preprint](https://www.researchsquare.com/article/rs-4334809/latest.pdf)) | preprint | CUDA, offline: rendering "about 11–43 min" | Domains by weighted Voronoi plus bond percolation; Bragg–Snell per grain with tilt; sphere sizes 210–350 nm | Not real time | **Ideas**: patch shape and per-grain tilt |
| Armand Sumo, "Opals as Photonic Crystals" ([post, 2026](https://armandsumo.com/posts/opals/)) | no licence stated | three.js path tracer, accumulated | d_hkl formulas; per-grain diffraction lobe of width σ; controls for domain size, order, tilt and spread | Progressive path tracer; WebGL2/three | **Ideas** (the control set, §6) |
| Weidlich & Wilkie, "Rendering the Effect of Labradorescence" ([PDF](https://www.cg.tuwien.ac.at/research/publications/2009/weidlich_2009_REL/weidlich_2009_REL-.pdf)) | paper | – | Alternating lamellae 50–100 nm thick; colour zoning from thickness changes; parameter sets by position | States it "could also be implemented in a real-time environment" | **Reference numbers** (§4) |
| Maxime Heckel, dispersion post ([blog](https://blog.maximeheckel.com/posts/refraction-dispersion-and-other-shader-light-effects/)) | no code licence stated | R3F | LOOP samples smear the RGB split; a 6-channel (r, y, g, c, b, v) Fourier split after Sundararaman | Screen-space FBO refraction, not a trace | Ideas (the 6-band tier) |
| drei `MeshRefractionMaterial` / N8python diamonds | MIT | three + BVH, WebGL2 | Bounced refraction | Ruled out in [tools-survey §8](tools-survey.md) | – |
| refractiveindex.info database ([repo](https://github.com/polyanskiy/refractiveindex.info-database)) | **CC0** (LICENSE at HEAD) | YAML Sellmeier coefficients | Diamond (Peter 1923), quartz and calcite o/e (Ghosh 1999), fluorite (Malitson 1963), fused silica | – | **Adopt as data** (§5.2 numbers) |

**Decision: build**, reusing the engine's existing tracer, `indexAt`,
`fresnel`, `thin-film` CIE fit, the light list and the room environment. No
permissive WebGL1 gem renderer exists. The one WebGL1 renderer found is GPL,
and the permissive ones are three.js/WebGL2.

---

## 2. Fire opal

### 2.1 Body colour and transparency

- "Fire opals are transparent to semi-transparent, resembling gelatin, with a
  red, orange, or yellow body color … The body color is caused by inclusions
  of iron oxides." The Smithsonian specimen also shows "probably goethite
  rods" and "hematite crystal inclusions"
  ([Smithsonian](https://naturalhistory.si.edu/explore/collections/geogallery/10002768)).
- The colour comes from iron-bearing nano-inclusions, and "greater
  concentrations of iron induce darker colors (from yellow to 'chocolate
  brown')"
  ([Gaillou et al., Ore Geology Reviews 34, 2008](https://insu.hal.science/insu-00323885/file/PL02078.pdf),
  after Fritsch et al. 1999, 2002).
- Mexican fire opal is "the only opal mined in quantity that is clear enough
  for faceting" ([GIA](https://www.gia.edu/gia-news-research/fall-autumn-gems)).
  So the material must work both faceted and as a cabochon.
- Play-of-colour is optional: "with or without play-of-color"
  ([Smithsonian](https://naturalhistory.si.edu/explore/collections/geogallery/10002768)).

**Rendering:**

- Beer–Lambert absorption that is strong in the blue, weaker in the green and
  weak in the red, plus a light haze for the "gelatin" look.
- Starting values: **α ≈ [0.3, 1.6, 5.0] cm⁻¹ (R, G, B)**. Through 5 mm that
  transmits [0.86, 0.45, 0.08], which is orange **(estimate, tune against the
  §2.6 photos)**.
- Haze scattering: **0.3–1 cm⁻¹ (estimate)**, using the existing
  `scatter` field the opal glass already has (`materials/presets.ts`).

### 2.2 Refractive index

RI **1.45 (+0.020, −0.080)**, so 1.37–1.47; singly refractive (amorphous);
SG 2.15 ([Gemology Project](http://gemologyproject.com/wiki/index.php?title=Opal)).

| Derived from n = 1.45 (computed) | Value |
|---|---|
| R₀ = ((n−1)/(n+1))² | 3.4% |
| Critical angle asin(1/n) | 43.6° |
| Dispersion: no Sellmeier data for opal. Use fused silica's Abbe number, V = 67.8 (Malitson data, CC0) | B–G ≈ 0.011 **(estimate: opal is hydrated amorphous silica)** |

### 2.3 Play-of-colour: mechanism and numbers

- **Structure.** Precious opal is a packing of silica spheres. Their ordered
  arrangement "act[s] like a diffraction grating"
  ([Smithsonian](https://naturalhistory.si.edu/explore/collections/geogallery/10002768);
  Sanders, [Nature 204, 1151, 1964](https://ui.adsabs.harvard.edu/abs/1964Natur.204.1151S)).
- **Sphere size sets the hue.** "Smaller spheres (less than about 150 nm)
  bring out blues and violets … Larger spheres (no larger than about 350 nm)
  produce oranges and reds. The more uniform the size … the more intense"
  ([webexhibits](https://www.webexhibits.org/causesofcolor/15F.html)).
  Other sources give "approximately 150 to 300 nanometers"
  ([Sumo](https://armandsumo.com/posts/opals/)) and 210–350 nm for the
  rendered examples
  ([Yokota & Fujishiro](https://www.researchsquare.com/article/rs-4334809/latest.pdf)).
- **Lattice.** FCC with cube side a = √2·D. Plane spacing d_hkl = a/√(h²+k²+l²),
  so the close-packed planes have **d₁₁₁ = D·√(2/3) = 0.816·D**
  ([Sumo](https://armandsumo.com/posts/opals/)).
- **Bragg–Snell law.** m·λ = 2·d·√(n_eff² − sin²θ), with θ the external
  angle of incidence. The PDF's equation image did not extract, but the
  paper fits λ² against sin²θ and cites Armstrong & O'Dwyer 2015 for the
  form
  ([Hennessey et al., AAPT](https://advlabs.aapt.org/document/servefile.cfm?ID=14965&DocID=5025)).
  The peak "blue-shift[s]" with angle.
- **Effective index.** Lorentz–Lorenz (Aspnes):
  (n_eff²−1)/(n_eff²+2) = f·(n_s²−1)/(n_s²+2) + (1−f)·(n_m²−1)/(n_m²+2),
  with f = 0.74 for FCC. For polystyrene in air it predicts 1.41, and they
  measured 1.40
  ([AAPT](https://advlabs.aapt.org/document/servefile.cfm?ID=14965&DocID=5025)).

**Numbers (computed** with the formulas above. Spheres n_s = 1.45 from §2.2.
The voids: in air n_eff = 1.321, water-filled 1.419, silica cement 1.445.
What actually fills the voids in gem opal is "interstitial silica, water or
CO₂ gas-vapour air"
([U. Waterloo](https://uwaterloo.ca/earth-sciences-museum/resources/detailed-rocks-and-minerals-articles/precious-opal)),
so **n_eff = 1.42 is the working value (estimate)**.)

| D (nm) | d₁₁₁ (nm) | λ at 0° | λ at 20° | λ at 40° | λ at 60° |
|---|---|---|---|---|---|
| 150 | 122 | 347 (UV) | 337 | 310 | 275 |
| 200 | 163 | 463 blue | 450 | 413 | 367 |
| 220 | 180 | 510 green | 495 | 454 | 404 |
| 250 | 204 | 579 yellow | 562 | 516 | 459 |
| 280 | 229 | 649 red | 630 | 578 | 514 |
| 300 | 245 | 695 red | 674 | 620 | 550 |
| 350 | 286 | 811 (IR) | 787 | 723 | 642 |

So:

- A patch that is red face-on turns green to blue as the stone tilts. This
  is the "move the stone and the colour changes" in
  [webexhibits](https://www.webexhibits.org/causesofcolor/15F.html).
- Patches of large spheres (≥ 280 nm) can show red, and only they can. A
  fire opal's typical "green, yellow, orange and red play-of-color"
  ([Smithsonian](https://naturalhistory.si.edu/explore/collections/geogallery/10002768))
  means sphere sizes of about 220–300 nm.

**Patches.**

- "Pinfire or pinpoint: Small, closely set patches of color. Harlequin or
  mosaic: Broad, angular, closely set patches"
  ([GIA](https://www.gia.edu/opal-quality-factor)).
- Each patch is a domain, "each with its own orientation", and "variation in
  crystal-domain orientation produces different Bragg angles across the
  stone" ([Sumo](https://armandsumo.com/posts/opals/)).
- Within a patch the colour changes too, "because the viewing angle changes
  across the surface" ([Sumo](https://armandsumo.com/posts/opals/)).

**Why a volume mirror, not Stam's grating.**

- Stam's shader is for a surface grating with a tangent direction (a CD's
  tracks). Its condition λ = d·u/n sums several orders along one axis
  ([GPU Gems 8](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-8-simulating-diffraction)).
- A 3D lattice reflects specularly off each plane family (Bragg). Inside the
  stone, light comes back mirror-like about the domain's plane normal **g**,
  in a narrow wavelength band.
- So: for each light, refract the light and view directions into the stone
  and form the half-vector **h**. The lobe is exp(−(∠(h, g)/σ)²). The colour
  is λ = 2·d₁₁₁·n_eff·(g·h), the internal form of Bragg–Snell **(computed:
  Snell turns the external √(n²−sin²θ) into n·cos θ_int)**.
- σ: Sumo uses "a narrow diffraction lobe of width σ" but gives no value,
  so **σ ≈ 2–6° (estimate)**. The band's width is also unsourced for natural
  opal (Still unknown 1).
- Only the (111) family is needed at first. The (200) planes reflect at
  d = a/2 (in Sumo's example, 198 nm → 527 nm), which adds second colours. Add
  them later at a lower weight **(estimate)**.

### 2.4 Under the black light

- Opal luminescence: green when U ≥ 1 ppm and Fe < 1,000 ppm; blue when U < 1
  ppm and Fe < 1,000 ppm. "No luminescence, either blue or green, occurs when
  the Fe content exceeds 3,000 ppm … Fe, probably as Fe³⁺, quenches any
  emission" ([Gaillou et al. 2008](https://insu.hal.science/insu-00323885/file/PL02078.pdf)).
- Fire opal's colour *is* iron. So: **render fire opal UV-inert by default,
  with an optional faint greenish-brown.** A trade reference lists Mexican
  fire opal as "Inert to moderate; Greenish-brown in SW-UV and LW-UV"
  ([GemRockAuctions](https://www.gemrockauctions.com/learn/a-z-of-gemstones/mexican-fire-opal)),
  and other secondary pages say weak orange or yellow
  ([Geology In](https://www.geologyin.com/2020/01/what-is-fire-opal.html)).
  The colour is unresolved (Still unknown 2).
- White and common opal: "The typical bright green fluorescence is
  attributed to activation by uranyl ions"
  ([Fluorescent Mineral Society](https://uvminerals.org/minerals/common-fluorescent-minerals/)).
  This uses the same emission colour as the uranium-glass token in
  [uv-blacklight.md §3.1](uv-blacklight.md).

### 2.5 What a fire opal looks like (summary for the shader)

- An orange, slightly hazy body, deeper where the path is longer (Beer).
- A 3.4% surface reflection. Facet glints are weak, because dispersion is low
  and the index is low.
- Play-of-colour patches when present: each patch lights in one colour within
  a few degrees of its own mirror angle, and shifts toward blue as the angle
  grows.
- Dark under the black light.

### 2.6 Reference photographs

- Smithsonian fire opal cabochon, orange body with green to red play-of-colour:
  [GeoGallery 10002768](https://naturalhistory.si.edu/explore/collections/geogallery/10002768)
- A faceted Mexican fire opal with "brilliant flashes of color spanning the
  entire rainbow":
  [GIA G&G Spring 2025](https://www.gia.edu/gems-gemology/spring-2025-gemnews-phenomenal-gems)
- Harlequin pattern (black opal): [GIA opal quality factors](https://www.gia.edu/opal-quality-factor)
- [Wikimedia Commons: Fire opal](https://commons.wikimedia.org/wiki/Category:Fire_opal) (41 files),
  [Opal](https://commons.wikimedia.org/wiki/Category:Opal) (114 files)
- A render reference (not a photo): [Sumo's path-traced opal](https://armandsumo.com/posts/opals/)

---

## 3. Quartz

### 3.1 Optical numbers

| Quantity | Value | Source |
|---|---|---|
| RI | 1.544–1.553 (n_ω 1.544, n_ε 1.553); uniaxial + | [Gemology Project](http://gemologyproject.com/wiki/index.php?title=Quartz), [Mindat](https://www.mindat.org/min-3337.html), [GIA amethyst](https://www.gia.edu/amethyst) |
| Birefringence | 0.009 | same |
| Dispersion (B–G) | 0.013 | [Gemology Project](http://gemologyproject.com/wiki/index.php?title=Quartz) (B 686.7 nm, G 430.8 nm per [Gemology Project: Dispersion](http://gemologyproject.com/wiki/index.php?title=Dispersion)) |
| n_o, n_e at 0.6 µm | 1.54421, 1.55333 | [Crystran](https://www.crystran.com/optical-materials/crystal-quartz-sio2/) |
| Transmission | 0.18–3.5 µm | [Crystran](https://www.crystran.com/optical-materials/crystal-quartz-sio2/) |
| Abbe number V (o) | **69.7** | **(computed)** from Ghosh 1999 Sellmeier ([CC0 data](https://github.com/polyanskiy/refractiveindex.info-database)) |
| R₀ / critical angle | **4.6% / 40.4°** | **(computed)** |
| Maximum walk-off of the extraordinary ray | **0.34°**, so 0.06 mm sideways per 10 mm | **(computed)**: atan(\|n_o²−n_e²\| / (2·n_o·n_e)) with Ghosh n_d. Doubling is invisible at site scale, so render quartz as isotropic |

### 3.2 The varieties and their colour

- **Rock crystal**: colourless ([Mindat](https://www.mindat.org/min-3337.html)).
- **Smoky**: Al³⁺ replaces about one Si in 10,000. Irradiation makes an
  (AlO₄)⁴⁻ "hole" colour centre that absorbs, giving "the gray-to-brown-to-black
  color" ([webexhibits](https://www.webexhibits.org/causesofcolor/12.html);
  [Mindat](https://www.mindat.org/min-3337.html)).
- **Amethyst**: also a colour centre, from irradiated iron
  ([Mindat](https://www.mindat.org/min-3337.html),
  [webexhibits](https://www.webexhibits.org/causesofcolor/12.html)). Both are
  "stable to light, but are lost when heated to between 300 and 500 °C".
  Heated amethyst turns yellow to brown
  ([Mindat "burnt amethyst"](https://www.mindat.org/min-3337.html)).
- **Rose (massive)**: coloured by pink fibres 0.1–0.5 µm wide, related to
  dumortierite. "Massive quartz is slightly to highly turbid", while
  single-crystal pink quartz "is nearly devoid of internal scattering".
  Aligned fibres cause asterism
  ([Goreva, Ma & Rossman, Am. Mineral. 86, 466, 2001](https://www.its.caltech.edu/~chima/publications/2001_AM_rose_quartz.pdf)).
  **Render rose quartz as translucent (scattering), not clear.**
- **Dichroism**: varieties coloured by lattice defects "generally show
  dichroism" ([Mindat](https://www.mindat.org/min-3337.html)). It is weak
  (amethyst "Pleochroism: Weak",
  [GemID](https://gemid-labs.com/gems/amethyst/)). Skip it.

Absorption starting values, per cm (R, G, B). All **(estimate, tune against
§3.6)**:

- amethyst [0.6, 2.0, 0.4];
- smoky [1.0, 1.3, 1.8];
- citrine [0.1, 0.4, 2.0];
- rose [0.1, 0.5, 0.3] plus scattering of about 2 cm⁻¹;
- rock crystal [0.01, 0.01, 0.01].

### 3.3 Inclusions and phantoms

- Inclusions listed for quartz: "tiger stripe", ribbon-like reddish
  inclusions, ball- or drop-shaped opaque ones, two- and three-phase
  inclusions, negative crystals, angular zoning
  ([Gemology Project](http://gemologyproject.com/wiki/index.php?title=Quartz)).
  Rutile needles make rutilated quartz
  ([Commons category](https://commons.wikimedia.org/wiki/Category:Rutilated_quartz)).
- **Phantoms**: "If minerals precipitate several times during growth, one can
  see several stacked phantoms, much like Russian Matroska puppets. The
  phantom is often very faint and ghost-like". Examples are a milky or smoky
  phantom in clear quartz, or "thin zones of amethyst coloration that are
  parallel to the rhombohedral faces"
  ([quartzpage](http://www.quartzpage.de/gro_text.html)).

**Rendering:**

- A phantom is the crystal's own plane set, shrunk about the base. The ray
  already tests the outer planes, so also test the inner, shrunk set. Where
  the ray crosses an inner face, add a thin scattering or absorbing layer
  (milky, smoky or violet).
- Cost: one more convex test per segment **(computed: 13 more planes)**.
- Needles and veils: a 3D noise field sampled along the path (stegu noise,
  MIT, already adopted in the survey). Don't trace them as geometry
  **(estimate)**.

### 3.4 What a crystal point looks like

- **Faces.** Typical crystals show three face types: six prism faces **m**
  "with a typical horizontal striation", and three **r** and three **z**
  faces at the tip. "The r-m and the z-m angle is 142° in both cases"
  ([quartzpage](http://www.quartzpage.de/crs_intro.html)).
  - So each tip face's normal is 38° above horizontal and the face leans 38°
    off the c-axis **(computed: 180° − 142°)**.
  - The plane set is 6 + 6 + 1 base = **13 planes** (a broken or flat base).
  - Make r larger than z. "The r faces are usually larger than the z faces"
    ([quartzpage](http://www.quartzpage.de/crs_intro.html)).
- **Internal reflections.** The critical angle is 40.4° **(computed)**. Light
  entering through a tip face meets the prism walls at grazing angles and is
  totally reflected. That is the bright, "lit from inside" tip, and the
  mirrored copies of the tip faces seen through the prism walls. Four
  bounces (what `GlassSolid` uses now) shows the first copies; 6 is the
  quality tier **(estimate, compare with §3.6)**.
- **Striations.** The horizontal striations on m faces spread a lamp's
  highlight into a vertical streak. Use a striped normal perturbation across
  the c-axis on the m faces only **(estimate of the visual, sourced
  feature)**.

### 3.5 Under the black light

- Amethyst: "Fluorescence LW Inert, SW Inert"
  ([GemID](https://gemid-labs.com/gems/amethyst/)). Collectors' consensus is
  that quartz is "inherently not fluorescent". Glowing specimens owe it to
  impurities or fluorescent inclusions and phantoms
  ([Mindat forum](https://www.mindat.org/mesg-638223.html),
  [FMDB specimen](https://uvminerals.org/fmdb/specimen/344/)).
- Quartz transmits down to 0.18 µm
  ([Crystran](https://www.crystran.com/optical-materials/crystal-quartz-sio2/)).
- **Render quartz as inert, with `uvTransmit` near 0.9 for rock crystal (the
  estimate allows for surface losses).** A black light behind a quartz point
  still makes whatever is under it glow.

### 3.6 Reference photographs

- [Commons: Rock crystal](https://commons.wikimedia.org/wiki/Category:Rock_crystal),
  [Smoky quartz](https://commons.wikimedia.org/wiki/Category:Smoky_quartz),
  [Rose quartz](https://commons.wikimedia.org/wiki/Category:Rose_quartz),
  [Rutilated quartz](https://commons.wikimedia.org/wiki/Category:Rutilated_quartz)
- Phantom, Cerro do Cabral:
  [full size](http://www.quartzpage.de/px/q-phantom_br_cerra_do_cabral_Q465_1_org.jpg)
  ([page](http://www.quartzpage.de/gro_text.html))
- Face names and angles diagram: [quartzpage crystals intro](http://www.quartzpage.de/crs_intro.html)

---

## 4. Other crystals worth offering

Numbers are **computed** from the CC0 Sellmeier data
([refractiveindex.info database](https://github.com/polyanskiy/refractiveindex.info-database))
where it exists, and checked against the gem tables.

| Stone | n_d | V (Abbe) | B–G dispersion | R₀ / critical | What it adds | UV (365 nm) | Sources |
|---|---|---|---|---|---|---|---|
| **Fluorite** | 1.434 | 95.0 | 0.0078 (table: 0.007) | 3.2% / 44.2° | Isotropic; octahedra and cubes; purple and green zoning. The **strongest UV glow** | "Bluish-white, purple (LW)". Blue from Eu²⁺ replacing Ca, emission peak "near 425 nm" | [Gemology Project](http://gemologyproject.com/wiki/index.php?title=Fluorite); [FMDB](https://uvminerals.org/fmdb/specimen/184/); [Minerals/PMC 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8949251/); the word "fluorescence" is named after fluorite ([Gem-A](https://gem-a.com/gem-hub/focus-on-fluorescence/)); Malitson 1963 data |
| **Calcite** (Iceland spar) | o 1.6585, e 1.4862 | o 49.9, e 79.1 | o 0.023, e 0.011 | 6.1% / 37.1° (o) | Birefringence **0.172**: a visible **double image**. Maximum walk-off **6.27°**, so 1.1 mm sideways per 10 mm **(computed)** | Variable ("a rainbow of possibilities", LW/MW/SW) | [Gemology Project](http://gemologyproject.com/wiki/index.php?title=Calcite) (RI 1.486–1.658, uniaxial −); [Fluorescent Mineral Society](https://uvminerals.org/minerals/common-fluorescent-minerals/); Ghosh 1999 data |
| **Diamond** | 2.4175 | 55.3 | 0.0444 (table: 0.044) | 17.2% / 24.4° | **Fire** (dispersion) and brilliance (deep TIR) | About 30% of natural diamonds fluoresce, "most common is blue". It "fluoresces blue in longwave UV light and then phosphoresces yellow" | [Gemology Project](http://gemologyproject.com/wiki/index.php?title=Diamond); [Crystran](https://www.crystran.com/optical-materials/diamond-c-cubic-carbon/) (2.4175 @ 589 nm); [GIA](https://www.gia.edu/gia-news-research/gems-gemology-summary-gem-fluorescence); [Gem-A](https://gem-a.com/gem-hub/focus-on-fluorescence/); Peter 1923 data |
| **Labradorite** | 1.559–1.570 | – | – | about 4.9% / 39.7° (n = 1.565, computed) | **Labradorescence**: one-direction flash from Bøggild lamellae | not researched (not needed for the flash) | [Gemology Project](http://gemologyproject.com/wiki/index.php?title=Labradorite); [Jin, Xu & Lee, Minerals 11, 727, 2021](https://www.mdpi.com/2075-163X/11/7/727); [Weidlich & Wilkie 2009](https://www.cg.tuwien.ac.at/research/publications/2009/weidlich_2009_REL/weidlich_2009_REL-.pdf) |

**Labradorite numbers.**

- Bøggild intergrowth periods "~150 to ~300 nm". Red areas measure 300–350 nm
  (Ca-rich 200 nm + Na-rich 100 nm); blue areas about 160 nm (80 + 80 nm)
  ([Jin et al. 2021](https://www.mdpi.com/2075-163X/11/7/727)).
- Weidlich & Wilkie render with layer pairs from (70 + 60) nm to (152 + 60)
  nm. By first-order Bragg, 2·n·Λ with n = 1.565, that is **407 → 664 nm,
  violet → red (computed)**.
- The TEM red period (300–350 nm) gives about 940–1100 nm at first order, so
  the period-to-hue mapping isn't settled (Still unknown 3). **Use the render
  parameters, calibrated against photos.**

**Calcite double image.** Uniaxial: the ordinary ray has n_o. The
extraordinary ray has 1/n(θ)² = cos²θ/n_o² + sin²θ/n_e², where θ is the angle
between the ray and the optic axis.

- Trace two rays, one per index, and average them.
- This ignores the ray/wave walk-off difference, so it is an approximation.
  Guy & Soler handle birefringence with coherency matrices
  ([2004](https://inria.hal.science/inria-00510165/PDF/GraphicsGemsRevisited.letter.pdf)),
  which is more than a page needs **(estimate)**.
- Cost: twice the quartz path.

**Reference photographs:**

- [Commons: Fluorite](https://commons.wikimedia.org/wiki/Category:Fluorite);
  under UV: [Fluorescent minerals](https://commons.wikimedia.org/wiki/Category:Fluorescent_minerals),
  [FMDB Peña Blanca fluorite](https://uvminerals.org/fmdb/specimen/184/)
- [Commons: Iceland spar](https://commons.wikimedia.org/wiki/Category:Iceland_spar),
  [Birefringence](https://commons.wikimedia.org/wiki/Category:Birefringence)
- [Commons: Diamonds](https://commons.wikimedia.org/wiki/Category:Diamonds)
- [Commons: Labradorite](https://commons.wikimedia.org/wiki/Category:Labradorite)

---

## 5. Real-time techniques, and what ports to WebGL1

### 5.1 Faceted ray trace in the fragment shader

**Intersection.** The gem is the intersection of half-spaces
n_i·p ≤ d_i (Haines). From outside:

- t_in = max over the front-facing planes of (d_i − n_i·o)/(n_i·r), and
  t_out = min over the back-facing ones.
- It's a hit if t_in < t_out, and the entry normal is the arg-max plane.
- From inside, only t_out is needed: the arg-min plane is the exit face.

Each bounce is one loop over the planes. This is exact, so edges are sharp
with no bisection, unlike the SDF shapes.

**Storage.** `uniform vec4 uPlanes[MAX_PLANES]` (xyz normal, w distance) with
`MAX_PLANES = 96`. diamond-webgl's diamond has 89 facets (README); every other stone here needs ≤ 13:

- 100% of reports show ≥ 256 fragment uniform vectors, and 96% show ≥ 300
  ([web3dsurvey](https://web3dsurvey.com/webgl/parameters/MAX_FRAGMENT_UNIFORM_VECTORS)).
- The light list needs about 9 arrays × 4 lights = 36 vectors
  (`light-uniforms.ts`). So 96 + 36 = 132 vectors fit well inside the budget
  **(computed)**.
- GLSL ES 1.00 allows indexing a uniform array with a loop index in the
  fragment shader: "constant-index-expressions … can include loop indices"
  ([App. A §5](https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf)).
- **This revises [tools-survey §8](tools-survey.md).** The survey stored the
  planes in a texture because the *spec minimum* is 16. Keep the texture path
  only if a device reports fewer than 256.

**Loop shape.** `for (int b = 0; b < MAX_BOUNCES; b++)` and
`for (int i = 0; i < MAX_PLANES; i++) { if (i >= uPlaneCount) break; … }`.
Loops must have constant bounds and a single index
([App. A §4](https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf)).

**At each inner face:**

- Fresnel split (the existing `fresnel` in `optics/beam.ts`).
- TIR past asin(1/n): 40.4° quartz, 24.4° diamond, 43.6° opal **(computed)**.
- Beer absorption over the segment.

**Bounce budget:**

- Guy & Soler ran depths 2–3 at 12–30 fps on 2003 hardware.
- `GlassSolid` uses 4 now.
- Tiers: **4 (default), 6 (quality), 2 (mobile)** **(estimate)**.
- Rather than following both the reflected and the transmitted ray at every
  face, follow the reflected (inside) ray. Add each face's transmitted
  share's look-up to the colour, weighted by the energy left. This is the
  standard single-path trick, the same as `traceSolid` but accumulating
  every exit, not only the first **(estimate of the best trade-off)**.

**Cost (computed):**

- A 240×240 CSS px gem at DPR 2 is 230k fragments.
- 60 planes × 5 segments ≈ 69M plane tests per frame if the bounces are
  traced once at the mean index.
- Three per-wavelength traces would be about 207M.
- Guy & Soler's approximation is "one single facet tree corresponding to an
  average refractive index" while "the fragment shader still uses the correct
  indices" ([2004](https://inria.hal.science/inria-00510165/PDF/GraphicsGemsRevisited.letter.pdf)).
  **Default: trace the path at n_d and split into three wavelengths only at
  each exit refraction. Full three-path tracing is the quality tier for
  diamond.**

**WebGL1 gotcha.** "Accessing mip-mapped textures within the body of a
non-uniform conditional block gives an undefined value"
([App. A](https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf)).
Room and backdrop look-ups inside the bounce loop must use non-mipmapped
textures, or be sampled after the loop.

### 5.2 Dispersion

- The engine fits Cauchy from (n_d, V) in `optics/dispersion.ts`. With the
  Sellmeier-derived V it gives B–G **0.0438 diamond, 0.0134 quartz, 0.0226
  calcite-o, 0.0078 fluorite**. The Sellmeier values are 0.0444, 0.0133,
  0.0228, 0.0078 **(computed, script inputs in §1 last row)**. The two-term
  fit is good to better than 0.001.
- three.js and glTF: n ± (n_F − n_C)/2, with 20/V stored as `dispersion`
  ([KHR spec](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_dispersion/README.md)).
  The spec notes "dispersion alone is not enough to capture [gemstones'] look
  in a real-time rasterizer" because of internal reflections. It is the
  same as sampling `indexAt` near the F and C lines. **No port needed.**
- **Quality tier for diamond:** 3 wavelengths band the fire. Use 6 (Heckel's
  r, y, g, c, b, v split) or a per-frame jittered λ accumulated over frames,
  as Sumo's tracer does
  ([Heckel](https://blog.maximeheckel.com/posts/refraction-dispersion-and-other-shader-light-effects/),
  [Sumo](https://armandsumo.com/posts/opals/)). Map λ to RGB with the CIE fit
  already in `thin-film.ts` (`cie1931`, Wyman–Sloan–Shirley), not Bruton's
  piecewise map.

### 5.3 Opal (and labradorite) Bragg-mirror shader

Per fragment, on the stone's surface or along the refracted path:

1. **Domain.** Cellular (Worley) noise in object space (stegu, MIT). The cell
   id is hashed into a plane normal **g**, tilted from a preferred axis by up
   to *spread*, and a sphere size D drawn from N(mean, sd). Cell scale gives
   pinfire (small) to harlequin (large) ([GIA](https://www.gia.edu/opal-quality-factor)).
   Weighted Voronoi with percolation is the offline version
   ([Yokota & Fujishiro](https://www.researchsquare.com/article/rs-4334809/latest.pdf)).
2. **For each light** in `LIGHTS_GLSL`, and for the room as a light from the
   mirrored direction:
   - refract **l** and **v** in;
   - form **h**;
   - lobe w = exp(−(acos(g·h)/σ)²) · beamFactor · power.
3. **Hue.** λ = 2·0.816·D·n_eff·(g·h). Look up rgb = LUT(λ, width), a
   256 × 1 texture baked on the CPU from `cie1931` with a Gaussian band of
   the given width. Out-of-visible λ gives black, which is why small-sphere
   patches go dark at steep angles.
4. **Add** w·rgb·strength to the body colour. Fire opal: the orange body is
   seen *through* the patches. Black or white opal would be a dark or milky
   body (not asked for).

**Labradorite** is the same code with a single **g** per stone (± a few
degrees) and the period Λ = d_a + d_b in place of 0.816·D·… Colour zoning
comes from low-frequency noise on Λ (Weidlich's parameter table varies by
position).

All of this is plain GLSL ES 1.00: no derivatives, no integer textures, no
float targets **(computed from the operations listed)**. Its brightness needs
the §10 HDR + bloom stage of [tools-survey.md](tools-survey.md) to read as a
"flash".

### 5.4 Thin film / structural colour

- For a single film (coated "mystic" quartz, a surface oil film) the
  existing `thin-film.ts` Airy plus CIE code applies directly.
- The three.js Belcour–Barla chunk (MIT) is a compact GLSL alternative: one
  analytic spectral integral, no LUT.
- Opal and labradorite are many-layer Bragg stacks, so they use §5.3, not
  the thin-film formula.

### 5.5 Lit by every light

- **Glints.** Each ray leaving the gem goes out along **e**. For each light i
  (position, radius, colour, power, aim from `LIGHTS_GLSL`):
  - the direction to the light is **lᵢ**;
  - its angular radius is ρᵢ = atan(radiusᵢ / distanceᵢ);
  - glint += Lᵢ·smoothstep(cos ρᵢ·(1+k), cos ρᵢ, e·lᵢ).

  Light sizes then set sparkle size: the flash's small, hot source gives
  pin-points, the lamp gives soft blobs. Otherwise the exit samples the room
  (`ENVIRONMENT_GLSL`) and the page backdrop (`uPhoto`), as `GlassSolid` does.
- **Surface sheen.** A Fresnel reflection of every light off the first face,
  the same loop.
- **Black light.**
  - A light with `uLightUv > 0` contributes no visible glint, beyond its
    visible leak ([uv-blacklight.md](uv-blacklight.md)).
  - It adds emission ∝ uv·(1 − e^{−α_uv·path})·emitColour·strength along the
    paths inside. Thick parts glow more, as with uranium glass
    ([uv-blacklight.md §3.1](uv-blacklight.md)).
  - Per-stone emitColour and strength: fluorite blue-violet (425 nm), strong;
    diamond blue, optional (30% of stones); white opal green (uranyl);
    calcite orange-red; fire opal, quartz and labradorite none.
  - The calcite colour and **all relative strengths are estimates** against
    the R1 scale.
- **Shadow and caustic** onto the page: reuse `solid-cast` exactly as
  `GlassSolid` does. Gems are convex solids like the existing ones.

### 5.6 Normal-mapped 2D sprite vs 3D trace

| | 2D: photo + normal/facet maps | 3D: analytic trace in a quad (the existing `GlassSolid` pattern) |
|---|---|---|
| Responds to light position | Only surface reflection. Internal sparkle is baked to one lighting | Yes: every exit ray is tested against every light |
| Turns or tilts | No | Yes |
| Cost | One texture look-up | §5.1 numbers. Bounded by the gem's small screen area |
| Fit with "lit by every light" | Poor | Good |

**Decision: 3D for everything.**

- Cabochons (opal, labradorite, rose quartz) don't need the plane loop: an
  analytic ellipsoid cap and 1–2 segments are enough.
- The mobile tier is "2 bounces, mean index, 3 wavelengths at exit", not a
  sprite.
- The cube-map shortcut was rejected by diamond-webgl's author as
  inaccurate (README), and is not used here.

---

## 6. Decisions

### Approach per material

| Material | Geometry | Body | Special term | UV |
|---|---|---|---|---|
| Fire opal (faceted or cabochon) | planes (≤ 96) or ellipsoid cap | Beer [0.3, 1.6, 5.0] cm⁻¹ + haze 0.3–1 cm⁻¹ (estimate) | Bragg-mirror patches (§5.3), D 220–300 nm, n_eff 1.42, optional | inert (Fe quench) |
| Rock crystal / smoky / amethyst / citrine point | 13 planes (6 m, 3 r, 3 z, base); r larger than z | Beer per §3.2 (estimate); colour zoning parallel to r faces optional | phantom = inner, shrunk plane set; m-face striations; needles/veils as 3D noise | inert; passes UV (`uvTransmit` ≈ 0.9) |
| Rose quartz (massive) | ellipsoid cap or tumbled | translucent: scatter about 2 cm⁻¹ (estimate) | optional asterism (later) | inert |
| Fluorite | octahedron (8 planes) or cube | purple/green zoning (estimate) | – | strongest blue-violet emission, path-length weighted |
| Calcite | rhomb (6 planes) | clear | two rays (n_o, n_e(θ)): the double image | variable (estimate: orange-red) |
| Diamond | round brilliant (89 facets, as diamond-webgl's model) | clear | 6-λ or jittered-λ fire tier | optional blue |
| Labradorite | cabochon | dark grey body (estimate) | single-orientation Bragg flash, Λ 130–212 nm | none |

### Adopt / port / build

- **Build** the convex-plane shape in `solids.ts` and `solids.glsl.ts`, as a
  7th shape with a TS twin. Planes go in a uniform array.
- **Reuse** `indexAt`, `fresnel`, `cie1931`/`thin-film`, `LIGHTS_GLSL`,
  `ENVIRONMENT_GLSL`, `solid-cast`.
- **Port (maths only):**
  - Haines's ray–convex-polyhedron test;
  - the Bragg–Snell, Lorentz–Lorenz and d₁₁₁ formulas;
  - Weidlich's lamella parameters;
  - optionally three.js's `evalIridescence` (MIT).
- **Adopt as data:** refractiveindex.info Sellmeier coefficients (CC0) for
  diamond, quartz, calcite, fluorite.
- **Ideas only:** diamond-webgl (GPL), Stam (colour map), Sumo, Heckel,
  Yokota & Fujishiro.
- **Needs** the HDR + bloom stage ([tools-survey §10](tools-survey.md)) before
  glints and flashes read.

### Numbers to use

| Material | n_d | V | Other |
|---|---|---|---|
| Opal / fire opal | 1.45 (range 1.37–1.47) | 68 (estimate) | n_eff 1.42; D 150–350 nm (fire opal 220–300); d₁₁₁ = 0.816·D |
| Quartz | 1.5443 (o) / 1.5534 (e) | 69.7 | treat as isotropic |
| Fluorite | 1.4338 | 95.0 | – |
| Calcite | o 1.6585, e 1.4862 | o 49.9, e 79.1 | – |
| Diamond | 2.4175 | 55.3 | – |
| Labradorite | 1.565 | – | Λ 130–212 nm (render-calibrated) |

All the n_d and V values are computed from the CC0 Sellmeier data, except
opal's.

- Quartz r/z faces: 38° from the c-axis (142° to m).
- Bounces: 4 / 6 / 2 (default / quality / mobile). Opal lobe σ 2–6°
  (estimate).
- `MAX_PLANES` 96 (the loop breaks at `uPlaneCount`, so a 13-plane point pays for 13). The fragment uniform budget is at least 256 on every
  reported device.

### Lab controls

- **Stone:** material preset; cut or shape (point, octahedron, rhomb,
  brilliant, cabochon); size; rotation and tilt (drag to turn); auto-turn
  speed.
- **Optics:**
  - n_d and V overrides;
  - absorption RGB and depth;
  - haze;
  - bounces (2/4/6);
  - wavelengths (3 at exit / 3 full / 6 / jittered);
  - birefringence on/off (calcite);
  - double-image strength.
- **Opal:**
  - sphere diameter mean and spread (nm);
  - n_eff;
  - patch size (pinfire ↔ harlequin);
  - patch orientation spread (°);
  - lobe σ (°);
  - band width;
  - play-of-colour strength;
  - (200) planes on/off.
- **Labradorite:** flash axis, period mean and zoning, strength.
- **Quartz:** phantom count, depth and colour; striation strength; needle
  density.
- **UV:** emission colour and strength per stone; `uvTransmit`.
- **Glints:** sparkle threshold and streak (with bloom).

### Tests

1. `indexAt(n_d, V)` reproduces the gem-table B–G dispersion within 0.001:
   diamond 0.044, quartz 0.013, fluorite 0.007–0.008
   ([Gemology Project](http://gemologyproject.com/wiki/index.php?title=Dispersion)).
2. Convex trace TS twin: the 6-plane cube matches `traceSolid("cube")`'s
   exit point and direction within 1e-4 px.
3. TIR: inside quartz, a ray at 41° to the face normal is totally reflected
   and one at 40° is not. Diamond 24.4°.
4. Energy: with no absorption, the sum of all exits plus what is left ≤ 1,
   and ≥ 0.99 at 6 bounces for rock crystal.
5. Opal Bragg: D = 250 nm and n_eff = 1.419 give 579 nm at 0°, falling to
   459 nm at 60°, monotonically. Lorentz–Lorenz with polystyrene (1.59),
   air and f = 0.74 gives 1.41
   ([AAPT](https://advlabs.aapt.org/document/servefile.cfm?ID=14965&DocID=5025)).
6. Labradorite: Weidlich's (70 + 60) and (152 + 60) nm give about 407 and
   about 664 nm.
7. Calcite walk-off maximum is 6.27° ± 0.05°; quartz 0.34°.
8. UV: fire opal, quartz and labradorite emit 0; fluorite > 0; a black light
   behind a quartz point still reaches the page (`uvTransmit` > 0.8).
9. The shader compiles with 96 planes and 4 lights. Count the uniform
   vectors ≤ 256 in a test, as in `light-uniforms.ts`.
10. Side by side in the lab: each material against the §2.6, §3.6 and §4
    photos. A dragged opal must change patch colours. A turned point must show
    mirrored tip faces through the prism walls.

### Still unknown

1. **Opal's sphere/matrix index contrast.** It sets the reflection band's
   width and peak strength (σ and band width are estimates). Sanders 1968
   (Acta Cryst. A24), which has it, is paywalled.
2. **Fire opal's UV reaction colour**: inert vs weak greenish-brown or
   orange. Secondary sources disagree, and there are no measured Fe ppm for
   fire opal in the pages read.
3. **Labradorite's period → hue.** Jin et al.'s TEM periods (red at 300–350
   nm) don't match first-order Bragg. Weidlich's render values are used
   until checked against photos.
4. **Mobile cost** of an 89-plane (diamond) or 13-plane (quartz) × 4-bounce trace on a 230k-fragment gem.
   Measure it on the perf page.
5. **Relative UV strengths** of fluorite, diamond and calcite against the R1
   day-glo scale, and calcite's default emission colour.
6. Whether **3 exit wavelengths** are enough for diamond fire, or whether 6
   or jittered are needed. This is a visual A/B in the lab.

### Pages I could not read

- Sanders, Nature 1964 and Acta Cryst. 1968 (paywalled). The sphere-size
  facts come from secondary sources.
- diamond-webgl's shader source: only minified builds are in the repo, and
  the identifiers are mangled.
- github.com web pages: read via `git clone` and raw.githubusercontent.com
  instead, as in R0.

---

## Sources

- Smithsonian NMNH, Fire Opal: https://naturalhistory.si.edu/explore/collections/geogallery/10002768
- Gemology Project: [Opal](http://gemologyproject.com/wiki/index.php?title=Opal), [Quartz](http://gemologyproject.com/wiki/index.php?title=Quartz), [Fluorite](http://gemologyproject.com/wiki/index.php?title=Fluorite), [Calcite](http://gemologyproject.com/wiki/index.php?title=Calcite), [Diamond](http://gemologyproject.com/wiki/index.php?title=Diamond), [Labradorite](http://gemologyproject.com/wiki/index.php?title=Labradorite), [Dispersion](http://gemologyproject.com/wiki/index.php?title=Dispersion)
- Gaillou et al., "The geochemistry of gem opals as evidence of their origin", Ore Geology Reviews 34 (2008): https://insu.hal.science/insu-00323885/file/PL02078.pdf
- Sanders, "Colour of Precious Opal", Nature 204, 1151 (1964): https://ui.adsabs.harvard.edu/abs/1964Natur.204.1151S
- Webexhibits, Causes of Color, Opal: https://www.webexhibits.org/causesofcolor/15F.html; Amethyst / colour centres: https://www.webexhibits.org/causesofcolor/12.html
- Hennessey et al., "Polarization Studies of a 3D Photonic Crystal…", AAPT ALPhA: https://advlabs.aapt.org/document/servefile.cfm?ID=14965&DocID=5025
- Armand Sumo, "Opals as Photonic Crystals — Part I" (2026): https://armandsumo.com/posts/opals/
- Yokota & Fujishiro, "Visual simulation of opal using bond percolation…" (preprint): https://www.researchsquare.com/article/rs-4334809/latest.pdf
- GIA: [Opal quality factors](https://www.gia.edu/opal-quality-factor), [Fall for Autumn Gems](https://www.gia.edu/gia-news-research/fall-autumn-gems), [G&G Spring 2025 Phenomenal Gems](https://www.gia.edu/gems-gemology/spring-2025-gemnews-phenomenal-gems), [Amethyst](https://www.gia.edu/amethyst), [Gem fluorescence summary](https://www.gia.edu/gia-news-research/gems-gemology-summary-gem-fluorescence)
- GemRockAuctions, Mexican Fire Opal: https://www.gemrockauctions.com/learn/a-z-of-gemstones/mexican-fire-opal
- Geology In, What is Fire Opal: https://www.geologyin.com/2020/01/what-is-fire-opal.html
- U. Waterloo Earth Sciences Museum, Precious opal: https://uwaterloo.ca/earth-sciences-museum/resources/detailed-rocks-and-minerals-articles/precious-opal
- Fluorescent Mineral Society: [Common fluorescent minerals](https://uvminerals.org/minerals/common-fluorescent-minerals/), [FMDB 184 fluorite](https://uvminerals.org/fmdb/specimen/184/), [FMDB 344 quartz](https://uvminerals.org/fmdb/specimen/344/)
- Mindat: [Quartz](https://www.mindat.org/min-3337.html), [forum: fluorescent yellow quartz](https://www.mindat.org/mesg-638223.html)
- GemID / Loupewise, Amethyst: https://gemid-labs.com/gems/amethyst/
- Crystran: [Crystal quartz](https://www.crystran.com/optical-materials/crystal-quartz-sio2/), [Diamond](https://www.crystran.com/optical-materials/diamond-c-cubic-carbon/)
- Goreva, Ma & Rossman, "Fibrous nanoinclusions in massive rose quartz", Am. Mineral. 86, 466 (2001): https://www.its.caltech.edu/~chima/publications/2001_AM_rose_quartz.pdf
- The Quartz Page: [Crystals intro](http://www.quartzpage.de/crs_intro.html), [Growth forms / phantoms](http://www.quartzpage.de/gro_text.html)
- Mineralogical Characteristics and Luminescent Properties of Natural Fluorite (PMC8949251): https://pmc.ncbi.nlm.nih.gov/articles/PMC8949251/
- Gem-A, Focus on gemstone fluorescence: https://gem-a.com/gem-hub/focus-on-fluorescence/
- Jin, Xu & Lee, "Revisiting the Bøggild Intergrowth…", Minerals 11, 727 (2021): https://www.mdpi.com/2075-163X/11/7/727
- Weidlich & Wilkie, "Rendering the Effect of Labradorescence" (2009): https://www.cg.tuwien.ac.at/research/publications/2009/weidlich_2009_REL/weidlich_2009_REL-.pdf
- Guy & Soler, "Graphics Gems Revisited: Fast and Physically-Based Rendering of Gemstones", SIGGRAPH 2004: https://inria.hal.science/inria-00510165/PDF/GraphicsGemsRevisited.letter.pdf
- Haines, "Fast Ray–Convex Polyhedron Intersection", Graphics Gems II (1991): https://www.realtimerendering.com/resources/GraphicsGems/category.html ; https://www.realtimerendering.com/intersections.html
- Stam, "Simulating Diffraction", GPU Gems ch. 8: https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-8-simulating-diffraction
- piellardj/diamond-webgl (GPL-3.0): https://github.com/piellardj/diamond-webgl
- three.js (MIT): [transmission_pars_fragment](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/transmission_pars_fragment.glsl.js), [iridescence_fragment](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/iridescence_fragment.glsl.js)
- Khronos, KHR_materials_dispersion: https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_dispersion/README.md
- Maxime Heckel, "Refraction, dispersion, and other shader light effects": https://blog.maximeheckel.com/posts/refraction-dispersion-and-other-shader-light-effects/
- refractiveindex.info database (CC0): https://github.com/polyanskiy/refractiveindex.info-database. Peter 1923 (diamond); Ghosh, Opt. Commun. 163, 95 (1999) (quartz, calcite); Malitson 1963 (CaF₂), 1965 (fused silica)
- Khronos, GLSL ES 1.00 specification, Appendix A: https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf
- Web3D Survey, MAX_FRAGMENT_UNIFORM_VECTORS: https://web3dsurvey.com/webgl/parameters/MAX_FRAGMENT_UNIFORM_VECTORS
- Wikimedia Commons categories: [Fire opal](https://commons.wikimedia.org/wiki/Category:Fire_opal), [Opal](https://commons.wikimedia.org/wiki/Category:Opal), [Rock crystal](https://commons.wikimedia.org/wiki/Category:Rock_crystal), [Smoky quartz](https://commons.wikimedia.org/wiki/Category:Smoky_quartz), [Rose quartz](https://commons.wikimedia.org/wiki/Category:Rose_quartz), [Rutilated quartz](https://commons.wikimedia.org/wiki/Category:Rutilated_quartz), [Fluorite](https://commons.wikimedia.org/wiki/Category:Fluorite), [Fluorescent minerals](https://commons.wikimedia.org/wiki/Category:Fluorescent_minerals), [Iceland spar](https://commons.wikimedia.org/wiki/Category:Iceland_spar), [Birefringence](https://commons.wikimedia.org/wiki/Category:Birefringence), [Diamonds](https://commons.wikimedia.org/wiki/Category:Diamonds), [Labradorite](https://commons.wikimedia.org/wiki/Category:Labradorite)
