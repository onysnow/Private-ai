# Water drops on glass (and later: water surfaces, a spray bottle)

Research only, 2026-10-01. No code changed. Every claim carries its source;
numbers marked **(computed)** are worked out here from a formula in the cited
source, not quoted from it.

The ask: drops on the panes that refract and magnify the photograph behind,
with the inverted image inside a drop. They reflect lights and cast a caustic
and a shadow on what is behind. They are generated realistically, they grow,
and once heavy enough they run down, leave trails and merge with other drops.
Later come water surfaces and a spray tool for water, slime or blood. It has
to be cheap enough for the web.

---

## 1. Prior art

### 1.1 Codrops "Rain & Water Effect Experiments" (Lucas Bebber, 2015)

- Article: [tympanus.net/codrops/2015/11/04/rain-water-effect-experiments](https://tympanus.net/codrops/2015/11/04/rain-water-effect-experiments/).
  Repo: [github.com/codrops/RainEffect](https://github.com/codrops/RainEffect).
- **How the simulation works** ([src/raindrops.js](https://github.com/codrops/RainEffect/blob/master/src/raindrops.js)):
  - It is a CPU list of drops. Each drop has `x, y, r`, `spreadX/Y` (squash),
    `momentum`, `parent` and `killed` / `shrink` flags.
  - The chance that a drop "creeps down" is proportional to its radius.
    Momentum decays every frame and is capped.
  - A moving drop spawns smaller trail drops at intervals (`trailScaleRange`
    0.2–0.5) and shrinks by 3% at each one.
  - Drops merge inside `collisionRadius: 0.65`. The new radius keeps area,
    with 80% of the smaller drop kept: `r = √(r₁² + 0.8 r₂²)`. A merge also
    gives the drop a momentum boost.
  - Defaults: `maxDrops: 900, rainChance: 0.3, dropletsRate: 50`.
- **How it renders** ([article](https://tympanus.net/codrops/2015/11/04/rain-water-effect-experiments/), [water.frag](https://github.com/codrops/RainEffect/blob/master/src/shaders/water.frag)):
  - Drops are pre-rendered sprites drawn onto a 2D canvas. That canvas is
    uploaded as the "water map".
  - **Red and green** encode the refraction lookup offset. **Blue** is the
    depth/thickness that scales the refraction. **Alpha** is coverage.
  - The shader samples the in-focus foreground at `texCoord + (rg − 0.5)·2 ·
    (minRefraction + b·refractionDelta)` over a small blurred background.
  - The sprite's colour is in effect a lookup into the image, so a drop
    "turn[s] the image behind them upside down" ([article](https://tympanus.net/codrops/2015/11/04/rain-water-effect-experiments/)).
  - Small droplets go on a separate canvas and are not tracked one by one.
    Big drops erase them with `globalCompositeOperation = 'destination-out'`,
    which gives the cleared path behind a running drop.
  - Optional shine and shadow layers are blended on top.
- **Licence:** "Integrate or build upon it for free in your personal or
  commercial projects. Don't republish, redistribute or sell 'as-is'"
  ([README](https://github.com/codrops/RainEffect#license)). That is usable
  for the site but it is not MIT. Borrow the ideas rather than the files if
  the effect layer is ever to be sold as a component (same concern as
  open item 4 in `effect-layer`).

### 1.2 raindrop-fx (SardineFish): MIT, WebGL2, the closest fit

- Repo: [github.com/SardineFish/raindrop-fx](https://github.com/SardineFish/raindrop-fx).
  npm `raindrop-fx`. **MIT** ([LICENSE](https://github.com/SardineFish/raindrop-fx/blob/master/LICENSE)).
  It says it was inspired by the Codrops project.
- **Performance it claims** ([README](https://github.com/SardineFish/raindrop-fx)):
  - about 600 drops in 2–3 ms/frame at 1920×1080;
  - 2000 drops in about 6 ms on Windows Chrome 88, and about 6.5 ms on
    Android Chrome 87.
- **Simulation** (read from the npm 1.0.8 sources, `src/raindrop.ts` and `src/simulator.ts`):
  - **Mass and size.** A drop has `mass`. Size is `(spread+1)·√mass/density`.
  - **Evaporation.** Mass is lost every second (`evaporate`, 10–30).
  - **Gravity against pinning.** The force is `gravity·mass − resistance`.
    `resistance` is re-rolled at random every 0.1–0.4 s (`motionInterval`),
    and the upper bound shrinks with `slipRate`. This random resistance is a
    cheap stand-in for pinning, and it gives stick-slip motion.
  - **Wander.** `velocity.x = |velocity.y| · shifting`, where `shifting` is a
    random 0–0.1.
  - **Shape.** The drop stretches with speed (`velocitySpread`) and relaxes
    back (`shrinkRate`).
  - **Trails.** Every 20–30 px of travel, a moving drop with enough mass
    splits off a trail drop of 0.3–0.5× its size and loses that mass.
  - **Collisions.** A uniform grid is checked over the 3×3 neighbouring cells.
    Parent and child (and siblings) are excluded. A merge **keeps momentum**:
    `v = (m₁v₁ + m₂v₂)/(m₁+m₂)`.
- **Rendering** (`src/renderer.ts`, `src/shader/*.glsl`):
  - **Raindrop pass.** Every drop is one instanced quad, textured with a
    normal-like sprite (`raindrop.png`). It writes (normal.xy, size, alpha)
    into a render texture.
  - **Blend modes.** The "smoother" mode uses an exclusion blend, and
    "harder" uses premultiplied over.
  - **Droplet pass.** Tiny static droplets are drawn procedurally into a
    persistent texture. Each frame the raindrop texture is blitted into it
    with an "erase" material, so running drops wipe droplets and mist.
  - **Compose pass.** The background is blurred with mipmaps for the misty
    parts. `uv += −(n.xy − 0.5)·(base + scale·size)`. The normal is
    `normalize(vec3((n.xy−0.5)·2, 1))`, with Lambert and Blinn-Phong lighting.
    The edge mask is `smoothstep(0.96, 0.99, alpha)`; that threshold is what
    makes touching drops read as one blob.
- **Caveat for us.** It needs WebGL2 and `EXT_color_buffer_float`. Our
  contexts are WebGL1 (`src/effects/engine/gl.ts`, `getContext("webgl")`).
  It also owns its own canvas and renderer (zogra-renderer). So: port its
  simulation logic (MIT) into our engine rather than embedding the library.

### 1.3 "Heartfelt" (BigWings / Martijn Steinrucken, Shadertoy, 2017)

- [shadertoy.com/view/ltffzl](https://www.shadertoy.com/view/ltffzl). Source mirror: [heartfelt.glsl](https://github.com/sanxincao/shadertoy/blob/master/heartfelt.glsl).
- **Licence: CC BY-NC-SA 3.0** (header of the file). **Non-commercial, so we
  cannot ship this code** on a business site. Use the ideas only.
- **How it works** ([source](https://github.com/sanxincao/shadertoy/blob/master/heartfelt.glsl)):
  - It is purely procedural, with no simulation state.
  - The screen is split into grid cells, one drop per cell, with hash noise
    (`N13`, `N14`) for randomness.
  - A smoothstep-shaped **sawtooth** in time (`Saw`) makes each drop hang,
    then slide quickly, then reset. A sine wiggle makes it meander.
  - A trail of small droplets is drawn above the drop (`trail *= trailFront`).
  - Layers: `StaticDrops` (static drops that fade in and out) plus two
    `DropLayer2`s at different scales, combined into `Drops()` with a "rain
    amount".
  - Normals come from **finite differences** of the drop field
    (`n = vec2(cx − c.x, cy − c.x)`). The background is sampled at
    `UV + n`.
  - Blur is a mip-level lookup: `focus = mix(maxBlur − c.y, minBlur, S(.1,.2,c.x))`.
    Fogged glass is blurred, and the drops and their cleared trails are sharp.
- **Lesson for us.** The finite-difference normal and "sharp where wet,
  blurred where fogged" are both worth reproducing. The cell-and-sawtooth
  approach cannot do merging, growth or interaction, so it suits only the
  background "static droplet" layer.

### 1.4 Other web prior art

- **rainyday.js** draws drops on 2D canvas with gravity and trail functions
  ([demo page](https://mubaidr.github.io/rainyday.js/), [fork with licence](https://github.com/JavaScriptCodes/rainyday.js)).
  The fork's LICENSE is **GNU GPL v2**
  ([LICENSE](https://github.com/JavaScriptCodes/rainyday.js/blob/master/LICENSE)).
  Do not copy it. (The original `maroslaw/rainyday.js` repo now returns 404.)
- **"Rain drops on screen"** by eliemichel ([Shadertoy ldSBWW](https://www.shadertoy.com/view/ldSBWW)),
  explained by greentec ([blog](https://greentec.github.io/rain-drops-en/)).
  It generates drops on a grid and offsets the refraction by the normal, like
  Heartfelt. Shadertoy code is CC BY-NC-SA unless stated otherwise, so ideas
  only.
- **Casey Primozic: rainy window pane in three.js** ([notes](https://cprimozic.net/notes/posts/building-realistic-rainy-window-pane-in-threejs/)).
  It uses no simulation. Static roughness and normal maps feed a
  `MeshPhysicalMaterial` with `transmission: 1`, `ior: 1.6` and
  `thickness: 0.8`; the roughness blurs the backdrop. Textures are stated
  **public domain**. Static only, but it shows how far a good normal map
  alone goes.
- **Codrops "Infinite Liquid Glass Grid" (three.js + WebGPU + TSL, 2026)**
  ([article](https://tympanus.net/codrops/2026/09/08/building-an-infinite-liquid-glass-grid-with-three-js-webgpu-and-tsl/))
  is a current TSL refraction reference if we ever move to WebGPU.

### 1.5 Game-engine techniques (Unity / Unreal / consoles)

- **Toadstorm, "VR Conservatory Part 1: Rainy Glass Shader" (Unity)**
  ([blog](https://www.toadstorm.com/blog/?p=742)). It runs at VR rates from
  two static textures and no simulation:
  - **Drop texture.** RG is the normal, B is a per-drop random time offset
    (voronoi), and A is a height-like gradient.
  - **Alpha erosion.** `ceil(alpha − time)` makes each drop appear, which
    animates impacts.
  - **Refraction.** RG is remapped to −1..1, scaled by about 0.02 and added
    to the grab-pass screen UV.
  - **Rivulets.** A flow-map texture is read through **two time-staggered
    sawtooth phases cross-faded by weight**, so the distortion never visibly
    resets. B adds a horizontal Perlin zigzag and A varies the speed.
  - **Tilt mask.** `dot(normal, up)` masks rivulets off horizontal glass.
- **Sébastien Lagarde, "Water drop 2a: dynamic rain and its effects"**
  (Remember Me, PS3/360) ([blog](https://seblagarde.wordpress.com/2012/12/27/water-drop-2a-dynamic-rain-and-its-effects/)):
  - Glass droplets are an animated texture sampled twice with different
    translation and scale, a distortion, and a low-resolution cubemap for
    lighting.
  - Measured costs: raindrop effect 1.69 ms on PS3, camera lens droplets
    0.32 ms.
  - The same series covers Fresnel and roughness for wet surfaces
    ([Water drop 1](https://seblagarde.wordpress.com/2012/12/10/observe-rainy-world/)).
- Unity and Unreal community practice is the same family: animated normal
  maps plus flow maps ([Polycount thread](https://polycount.com/discussion/155940/animating-normal-maps-to-achieve-rain-drops-in-3ds-max-or-unity3d),
  [UE forum](https://forums.unrealengine.com/t/movement-of-rain-drops-on-the-glass/427942)).
  The good packaged versions are paid (Gumroad and itch), which is out of
  scope.

### 1.6 Papers

- **Kaneda, Kagawa, Yamashita, "Animation of Water Droplets on a Glass Plate"**
  (Computer Animation '93) ([project page](https://home.hiroshima-u.ac.jp/kin/publications/CA93/wdroplet.html),
  [Springer](https://link.springer.com/chapter/10.1007/978-4-431-66911-1_17)):
  - **The model.** The plate is a **discrete lattice**. A droplet moves only
    above a **static critical mass**, and stops below a **dynamic critical
    mass**. "Some amount of water remains behind the flow due to the nature
    of wetting", so a running drop loses mass. The streams **meander**.
  - **The rendering.** Fast rendering intersects rays with a projected
    cuboid instead of tracing them.
  - **Follow-up:** "Animation of water droplets moving down a surface"
    ([Wiley 1999](https://onlinelibrary.wiley.com/doi/abs/10.1002/(SICI)1099-1778(199901/03)10:1%3C15::AID-VIS192%3E3.0.CO;2-P)).
- **Wang, Mucha, Fedkiw et al., "Water Drops on Surfaces"** (SIGGRAPH 2005)
  ([project](https://wanghmin.github.io/publication/wang-2005-wds/), [ACM](https://dl.acm.org/doi/10.1145/1073204.1073284)).
  This is a full 3D level-set simulation. A **virtual surface** enforces the
  contact angle, and a **dynamic contact angle** depends on the material,
  wetting history and direction of motion. Far too heavy for us, but it is
  the authority that **advancing and receding angles differ** and drive the
  look.
- **Sato, Dobashi, Yamamoto, "A Method for Real-Time Rendering of Water
  Droplets Taking into Account Interactive Depth of Field Effects"** (2003)
  ([Springer](https://link.springer.com/chapter/10.1007/978-0-387-35660-0_15)).
  Drops are approximated as **hemispheres** and rendered with environment
  mapping on graphics hardware.
- **Takenaka, Mizukami, Tadamura, "A Fast Rendering Method for Water
  Droplets on Glass Surfaces"** (ITC-CSCC 2008) ([PDF](https://www.ieice.org/publications/proceedings/bin/pdf_link.php?fname=p13_A1-4.pdf&iconf=ITC-CSCC&year=2008&vol=39&number=A1-4&lang=E)):
  - Drops are hemispherical polygons sized by volume, moving as particles
    on a grid-divided glass surface.
  - Billboards are rendered to an FBO, with sphere-map reflections shared
    per region. It reached 25 fps.
  - **Merging is done by detecting contour contact and gradually moving the
    centres together.** That is a cheap, good-looking merge we should copy.
- "Real-time simulation: Water droplets on glass windows" (IEEE CiSE 2004)
  ([ResearchGate](https://www.researchgate.net/publication/3422696_Real-time_simulation_Water_droplets_on_glass_windows)).
  The page returned HTTP 429 and could not be read, so it is not summarised
  here.

---

## 2. Physics of a drop on vertical or inclined glass

### 2.1 Shape

- **Below the capillary length, surface tension wins and a drop is a
  spherical cap.** The capillary length is ℓc = √(γ/ρg), and the Bond number
  is Bo = R²/ℓc² ([Wikipedia: Capillary length](https://en.wikipedia.org/wiki/Capillary_length)).
- **For water ℓc ≈ 2.7 mm** ([Quéré, "Drops at rest on a tilted plane"](https://web.mit.edu/nnf/education/wettability/tilted%20plane.pdf)).
  Lautrup's text rounds it to 3 mm, with γ = 72 mN/m ([Lautrup, ch. 5](https://cns.gatech.edu/~predrag/GTcourses/PHYS-4421-04/lautrup/7.7/surface.pdf)).
- So window drops (1–5 mm) are spherical caps that gravity flattens a
  little. Above about ℓc they become puddles.
- **Contact angle on glass depends on cleanliness.** Clean soda-lime glass is
  **< 20°**. Hydrophobically contaminated glass is **> 40–90°**
  ([Infinita Lab](https://infinitalab.com/blog/hydrophobic-contamination-glass-testing/)).
  Perfectly clean glass is near 0°, which is why water films rather than
  beads on it ([Lautrup](https://cns.gatech.edu/~predrag/GTcourses/PHYS-4421-04/lautrup/7.7/surface.pdf)).
- Real windows that bead rain are the dirty case. Quéré's experiments span
  average angles of 52–110° ([Quéré](https://web.mit.edu/nnf/education/wettability/tilted%20plane.pdf)).
  **Use θ ≈ 50–70° for "a window"** and lower it for a "clean" preset.

### 2.2 Pinning and contact-angle hysteresis

- A drop sticks to a vertical pane because the **advancing angle θa** (front)
  is larger than the **receding angle θr** (back). That difference, the
  hysteresis, comes from chemical and topographic heterogeneity
  ([Biolin Scientific](https://www.biolinscientific.com/blog/what-is-contact-angle-hysteresis),
  [Eral et al. review](https://www.utwente.nl/en/tnw/pcf/publications/pcf_2005/pdf-author-versions/Dieter.pdf)).
- **Typical hysteresis on glass is about 19° ± 5°**
  ([Quéré](https://web.mit.edu/nnf/education/wettability/tilted%20plane.pdf)).
- **The retention force (Furmidge)** is `F = k · w · γ · (cos θr − cos θa)`,
  where w is the contact width and **k ≈ 0.88** (range 0.5–1.5)
  ([Li et al., "Kinetic drop friction", Nat. Commun. 2023](https://www.nature.com/articles/s41467-023-40289-8)).
  The same balance appears in [Quéré](https://web.mit.edu/nnf/education/wettability/tilted%20plane.pdf)
  as `πrγ(cos θr − cos θa) ≥ ρΩg sin α`.

### 2.3 When a drop starts to slide on vertical glass

- **Measured.** For water on vertical glass the critical volume is
  **~7–19 µL**, depending on contact angle
  ([Quéré](https://web.mit.edu/nnf/education/wettability/tilted%20plane.pdf)).
  On a car side window at 90°, drops below **about 17 ± 1 µL do not slide
  under gravity alone**
  ([Emergent Scientist 2019, "Motion of rain drops on a car side window"](https://emergent-scientist.edp-open.org/articles/emsci/full_html/2019/01/emsci180004/emsci180004.html)).
  "Drops of millimetre size … generally stick on windows"
  ([Quéré](https://web.mit.edu/nnf/education/wettability/tilted%20plane.pdf)).
- **(computed)** Set Furmidge (k = 1) equal to ρgV for a spherical cap:

  | θa / θr  | contact radius | volume | height   |
  |----------|----------------|--------|----------|
  | 60° / 40° | 2.2 mm        | 8.7 µL | 1.0 mm   |
  | 50° / 30° | 2.3 mm        | 7.7 µL | 0.85 mm  |
  | 90° / 70° | 1.8 mm        | 8.8 µL | 1.5 mm   |

  This agrees with the measured 7–19 µL. **Rule for the sim: a drop slides
  when its contact diameter reaches about 4–5 mm (about 10–20 µL).** Smaller
  drops only grow, by condensation, spray or merging.
- **On an incline the threshold scales with sin α.** The critical radius goes
  as `R_c ∝ ℓc · √(Δθ / sin α)` in the small-hysteresis limit (Quéré's
  formula), and `sin α_s ∝ ℓc² Ω^(−2/3)`
  ([Emergent Scientist](https://emergent-scientist.edp-open.org/articles/emsci/full_html/2019/01/emsci180004/emsci180004.html)).
  For our vertical panes, sin α = 1.

### 2.4 Sliding speed

- **Kinetic friction** is `F(U) = F₀ + β·w·η·U`, where F₀ is the Furmidge
  term and β is a dimensionless 20–200. Viscosity was tested from 10⁻³ to
  1 Pa·s ([Li et al. 2023](https://www.nature.com/articles/s41467-023-40289-8)).
  The terminal speed is therefore `U = (ρgV − F₀)/(β w η)`. Speed is
  **inversely proportional to viscosity**. That one line covers water, blood
  and slime.
- **(computed)** Water, w = 4.5 mm, β = 100, a drop 20% over its threshold:
  U ≈ 4 cm/s. A drop twice the threshold runs proportionally faster. Real
  window drops move in **stick-slip**: they stop at contamination and jump
  on (pinning heterogeneity, [Eral review](https://www.utwente.nl/en/tnw/pcf/publications/pcf_2005/pdf-author-versions/Dieter.pdf)).
- **Shape at speed** ([Le Grand, Daerr, Limat, JFM 2005](https://labo.msc.u-paris.fr/~daerr/reprints/Le-Grand-et-al_Shape-of-drops_JFM2005.pdf)):
  - The sequence is rounded, then a **corner** at the rear, then a **cusp**,
    then **pearling**.
  - The corner appears when the receding angle falls to about 21–26°. The
    cusp appears at an in-plane opening angle of about 47°.
  - The speed follows `Ca ≈ Bo_α − Bo_c`, so it is linear in the excess
    gravity.

### 2.5 Trails

There are two mechanisms, and they should be rendered separately.

1. **A wetting film and residue left behind.** Water remains behind the flow,
   so a running drop loses mass ([Kaneda 1993](https://home.hiroshima-u.ac.jp/kin/publications/CA93/wdroplet.html)).
   The trail is a thin wet streak that later beads into tiny droplets and
   evaporates.
2. **Pearling.** Past a critical capillary number Ca = ηU/γ, the cusped tail
   emits a line of small drops ([Podgorski et al. 2001, via Sci. Rep. 2017](https://www.nature.com/articles/s41598-017-14662-9)).
   For gravity-driven drops on glass, Ca_crit ≈ 0.007 (same source); that
   experiment used silicone oil, not water.
   **(computed)** For water, U ≈ Ca·γ/η ≈ 0.5 m/s, so pure pearling is rare
   for slow window drops. The visible trail of droplets on a real window is
   mostly mechanism 1 breaking up. Both Codrops and raindrop-fx simply spawn
   trail drops every N px of travel, and it reads correctly.

### 2.6 Merging and coalescence

- When two contact lines touch, a liquid bridge forms and grows very
  quickly; there are scaling laws for the bridge growth
  ([Ryu et al., Micromachines 2023 review](https://www.mdpi.com/2072-666X/14/11/2046)).
  On screen, it reads as near-instant: the centres pull together over a few
  frames ([Takenaka et al. 2008](https://www.ieice.org/publications/proceedings/bin/pdf_link.php?fname=p13_A1-4.pdf&iconf=ITC-CSCC&year=2008&vol=39&number=A1-4&lang=E)).
- **Volume is conserved, and so is momentum.** raindrop-fx merges mass and
  momentum (`src/raindrop.ts`). Codrops keeps area with a 0.8 factor
  ([raindrops.js](https://github.com/codrops/RainEffect/blob/master/src/raindrops.js)).
- **A merge is the main way a stuck drop becomes a sliding one.** A running
  drop sweeps up the drops in its path, grows and accelerates. That is the
  avalanche look of a real window.

---

## 3. Optics of a drop

### 3.1 A drop is a plano-convex lens

- Water n = 1.333. A drop on glass is a plano-convex lens with its flat face
  on the glass.
- **Focal length.** Lensmaker with R_b = ∞ gives `f = R/(n−1) ≈ 3R`
  ([AZoOptics](https://www.azooptics.com/Article.aspx?ArticleID=816),
  [Wikipedia: Thin lens](https://en.wikipedia.org/wiki/Thin_lens)).
  **(computed)** A cap with radius of curvature 2 mm has f ≈ 6 mm.
- For comparison, a free sphere (a ball lens) has EFL = nD/(4(n−1)) ≈ 1.0·D
  for water ([Wikipedia: Ball lens](https://en.wikipedia.org/wiki/Ball_lens)).
- **Why the image is inverted.** A drop "acts as a simple lens, like a camera
  lens, so the refracted image is upside-down"
  ([EPOD, "Water Drops and Inverted Images"](https://epod.usra.edu/blog/2011/12/water-drops-and-inverted-images.html)).
  Any object farther away than f ends up inverted. For a photograph sitting
  a gap d behind the pane, the drop inverts it whenever **d > f**, which is
  nearly always, since f is a few mm.
- **(computed)** Thin-lens / thin-prism derivation, the single formula to
  implement:
  - A ray through the drop at distance r from its axis is deviated by r/f.
    In general a thin film of slope ∇h deviates a ray by `(n−1)∇h`.
  - Over the gap d, the point actually seen on the photo moves by
    **`Δ = −(n−1)·d·∇h`**.
  - For a cap, ∇h = −r/R, so the sample point is `c + (p−c)·(1 − d/f)`.
  - The image is **inverted** when d > f, **minified** when 1 < d/f < 2,
    and **magnified** when d/f > 2.
  - This uses only causes: the pane's **gap** and the drop's own shape. That
    fits the optics-engine rule "you set CAUSES, physics sets EFFECTS".

### 3.2 Dark rim

- Near the contact line the surface slope approaches the contact angle.
  Refraction there is strong, so the rays come from far outside the drop, or
  from the dim interior of the pane. Fresnel reflectance also climbs.
- **Inside the drop, rays meeting the water-air surface beyond the critical
  angle (asin(1/1.333) ≈ 48.6°, computed) are totally internally reflected.**
  - Schlick's approximation `R = F0 + (1−F0)(1−cosθ)⁵`, with
    **F0 ≈ 0.02 for water**, does not handle TIR on its own.
  - The fix is to use cos θ_t when going from dense to less dense
    ([Lagarde, "Memo on Fresnel equations"](https://seblagarde.wordpress.com/2013/04/29/memo-on-fresnel-equations/)).
- The rim is darker because of the steep bending at the curved edges
  ([EPOD](https://epod.usra.edu/blog/2011/12/water-drops-and-inverted-images.html)).
- **Cheap version:** darken by a smoothstep on |∇h| as it approaches
  tan(θ_contact), and add Schlick reflection of the HDR room there.

### 3.3 Specular highlight and reflections

- Each light source gives a small sharp highlight on the convex cap. With the
  drop normal, Blinn-Phong is enough: raindrop-fx uses Lambert plus
  Blinn-Phong (`compose.glsl`).
- Reflect the room HDR with the reflected vector, weighted by Fresnel. Water
  reflection rises steeply at grazing angles
  ([Lagarde, "Water drop 1"](https://seblagarde.wordpress.com/2012/12/10/observe-rainy-world/)).
- The cursor lamp should put one bright highlight per drop, offset toward the
  lamp.

### 3.4 Caustic and shadow on what is behind

- A drop focuses the light that crosses it, so a drop's shadow has a **bright
  focused core** (the caustic) inside a **dark ring**. The rim bends light
  outward, out of the ring. This is the "Near-zone transmission caustic of a
  hanging water drop" ([PubMed 32749276](https://pubmed.ncbi.nlm.nih.gov/32749276/)).
  That page hit the fetcher's rate limit, so only its title is cited.
- **The cheap, physically right method is the area ratio** (Evan Wallace):
  - Project the surface along the refracted rays onto the receiver.
  - Brightness = original area ÷ projected area: "an increase in the area …
    must be dimmed … a decrease … focused and should be brighter".
  - It is computed with `dFdx`/`dFdy` in the fragment shader
    ([Wallace, "Rendering Realtime Caustics in WebGL"](https://medium.com/@evanwallace/rendering-realtime-caustics-in-webgl-2a99a29a0b2c)).
- **(computed)** For our map `x → x + Δ(x)`, with Δ = (n−1)·d_L·∇h along the
  lamp direction, the ratio is `1 / |det(I + (n−1)d_L·Hess(h))|`. To first
  order that is `≈ 1 / |1 + (n−1)d_L∇²h|`. One Laplacian sample of the drop
  height map per pixel gives both the caustic core (ratio > 1) and the dark
  ring (ratio < 1).
- **Softness** follows our existing shadow rule `penumbra = lightRadius · gap
  / distance` (`effect-layer` notes).
- GPU Gems ch. 2 shows that environment-map-style lookups along the normal
  are visually close to true Snell refraction for caustics, at "very low
  computational cost" ([GPU Gems, Rendering Water Caustics](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics)).

---

## 4. Other liquids: slime and blood

| Property | Water | Blood | Slime (PVA-borax) |
|---|---|---|---|
| Viscosity | 1 mPa·s | **3–4 mPa·s**, shear-thinning (thicker at low shear) ([Wikipedia: Hemorheology](https://en.wikipedia.org/wiki/Hemorheology)) | **~3000–3500 cP** fully gelled, i.e. ~3 Pa·s; *shear-thickening*/rheopectic ([Hurst et al., J. Chem. Educ.](https://pendidikankimia.walisongo.ac.id/wp-content/uploads/2018/10/34-4.pdf)) |
| Behaviour | Newtonian | Non-Newtonian, thins with flow ([Hemorheology](https://en.wikipedia.org/wiki/Hemorheology)) | Viscoelastic Maxwell fluid: "flows under low stress, but breaks under higher stresses" ([Wikipedia: Slime](https://en.wikipedia.org/wiki/Slime_(homemade_toy))) |
| Refractive index | 1.333 | plasma 1.351 at 500 nm, whole blood ~1.36 ([Frontiers in Photonics 2025 review](https://www.frontiersin.org/journals/photonics/articles/10.3389/fphot.2025.1636398/full)) | ~water (mostly water); clear, tinted or glitter versions ([Slime](https://en.wikipedia.org/wiki/Slime_(homemade_toy))) |
| Absorption | none to speak of | enormous in blue and green, small in red (below) | dye: choose σ_a per colour; often turbid |

**Blood colour from Beer–Lambert.** μa = 0.0054·ε(λ) cm⁻¹ for whole blood
with 150 g/L haemoglobin ([OMLC, Prahl](https://omlc.org/spectra/hemoglobin/)),
with ε for HbO₂ from the [OMLC table](https://omlc.org/spectra/hemoglobin/summary.html).

**(computed)** μa in mm⁻¹, then transmission through a 0.1 mm film and a
1 mm drop:

| λ | μa (mm⁻¹) | T at 0.1 mm | T at 1 mm |
|---|---|---|---|
| 450 nm | 34 | 3% | 0 |
| 540 nm | 29 | 6% | 0 |
| 600 nm | 1.7 | 84% | 18% |
| 630 nm | 0.33 | 97% | 72% |
| 650 nm | 0.20 | 98% | 82% |

So a **thin smear is already saturated red**, and a 1 mm drop is **dark
red-black in the middle** with a lighter red rim, where the path is short.
This is exactly `exp(−σ_rgb · thickness)` with the drop height map as
thickness. A starting point is σ ≈ (0.5, 29, 34) mm⁻¹ for RGB.

Blood is also strongly forward-scattering (g close to 1, μs′ ≈ 13 cm⁻¹)
([Frontiers 2025](https://www.frontiersin.org/journals/photonics/articles/10.3389/fphot.2025.1636398/full)).
Add a slight blur to the refracted lookup and keep the specular highlight
crisp.

**Motion follows from the friction law** `U = (ρgV − F₀)/(βwη)`
([Li et al. 2023](https://www.nature.com/articles/s41467-023-40289-8)):

- **Blood** runs about **3–4× slower** than water for the same excess weight.
  It leaves **thicker films**, and its trails are more continuous. Pearling
  (Ca = ηU/γ) still needs about the same Ca, so at lower speed it is still
  rare.
- **Slime** is about 3000× more viscous. It **sags and stretches** rather than
  sliding, and its streaks are continuous ribbons, never pearls.
  - It is shear-thickening ([Hurst](https://pendidikankimia.walisongo.ac.id/wp-content/uploads/2018/10/34-4.pdf)),
    so a spray impact makes it stiffen and splat in a blob; it does not
    splash.
  - Model it with a high η, a large F₀ (high hysteresis), a low evaporation
    rate, and a "stretch" spread that keeps it connected to its origin.
  - Optics: tinted absorption plus a scatter blur (turbid), with n ≈ 1.34.

---

## 5. Water surfaces for the web (later)

- **Evan Wallace, WebGL Water (2011), MIT** ([demo](https://madebyevan.com/webgl-water/),
  [repo](https://github.com/evanw/webgl-water), licence in the header of
  [water.js](https://github.com/evanw/webgl-water/blob/master/water.js)).
  - It is a heightfield wave equation on a **256×256 float texture**, storing
    (height, velocity, normal.x, normal.z).
  - Drops are added as cosine bumps. It renders analytic ray-traced
    refraction and reflection.
  - **Caustics come from the area-ratio trick** (§3.4).
  - Ports exist for three.js ([code4fukui/threejs-water](https://github.com/code4fukui/threejs-water)),
    PlayCanvas and WebGPU ([willeastcott](https://github.com/willeastcott/webgpu-water-playcanvas)),
    and WebGPU ([jeantimex](https://github.com/jeantimex/webgpu-water)).
- **Martin Renou, three.js caustics, BSD-3** ([repo](https://github.com/martinRenou/threejs-caustics),
  [write-up](https://medium.com/@martinRenou/real-time-rendering-of-water-caustics-59cda1d74aa)).
  It applies Wallace's method with environment mapping in three.js.
- **Hugo Elias ripples** ([explainer](https://www.ixm-ibrahim.com/explanations/simulating-water-ripples)).
  The update is `next = (flow + current − previous) · damping`, over
  ping-ponged buffers, with damping between 0 and 1. It is the cheapest interactive "touch the
  water" surface. Refract with the height gradient exactly as for drops.
- **Gerstner and sum-of-sines** ([GPU Gems ch. 1](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models)).
  It is analytic, so its normals cost nothing, and a steepness Q sharpens the
  crests. Good for a calm pond or tray with no interaction.
- **FFT ocean** (Tessendorf, [Simulating Ocean Water](https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2004.pdf)).
  WebGPU implementation, MIT: [Spiri0/Threejs-WebGPU-IFFT-Ocean](https://github.com/Spiri0/Threejs-WebGPU-IFFT-Ocean)
  (JONSWAP, cascades). Overkill for a photography site, unless there is a
  seascape hero.
- **What to choose.** For "a shallow water layer over a photograph", use
  Elias or Wallace, i.e. a heightfield with refraction and area-ratio
  caustics. It shares 90% of the drop code path below.

---

## 6. Recommended architecture for onysnow-vision

It slots in as the **"water" surface layer**, step 10 of the optics-engine
migration (`claude/optics-engine-design.md`). There, each layer is "read as
height (bend/caustics), roughness (spread), absorption (dim/colour)". The drop
system's only output is a dynamic height/absorption texture per pane. The
glass, shadow and caustic passes read it the same way they will read any
other layer.

### 6.1 Simulation: CPU, in the engine scheduler

- **Data.** A struct-of-arrays in `Float32Array`s (x, y, volume, vx, vy,
  spread, liquidId, pinTimer, parent). Panes have small areas, so a cap of
  about 400 "big" drops per page is plenty. raindrop-fx does 600 drops in
  2–3 ms including render on desktop ([README](https://github.com/SardineFish/raindrop-fx)).
- **Units.** Real millimetres. Convert CSS px to mm with one "pane scale"
  constant, so that the thresholds in §2 apply directly.
- **Each drop's state comes from volume V and the liquid's (θ, Δθ, γ, η, ρ).**
  - The spherical-cap contact radius a(V, θ) and cap height follow from the
    shape (§2.1).
  - It **slides when** `ρgV > k·2a·γ·(cos θr − cos θa)`, the Furmidge
    condition (§2.2).
  - Its speed is `U = (ρgV − F₀)/(β·2a·η)`, relaxed toward over about
    100 ms (§2.4).
- **Pinning field.** A coarse noise grid per pane (about 32×32) multiplies θr
  and θa. It gives stick-slip, meandering, and the reason two drops of the
  same size behave differently.
  - The meander is the lateral gradient of that field, as in raindrop-fx's
    random `shifting` but spatially coherent.
  - Kaneda's lattice and critical masses ([1993](https://home.hiroshima-u.ac.jp/kin/publications/CA93/wdroplet.html))
    are a good mental model.
- **Trails.** A moving drop deposits:
  - **(a)** wetness into a coarse "film" grid; this is our design choice,
    after Kaneda's "water remains behind". Later drops are pinned less where
    the film is wet, so they follow old tracks.
  - **(b)** a trail droplet every 20–30 px (raindrop-fx defaults), at
    0.3–0.5× its size, subtracting that volume. The film then evaporates.
- **Merge.** Use a uniform hash grid with neighbour cells, as raindrop-fx
  does. When contact circles overlap: volume sum, momentum-weighted velocity,
  and centres eased together over 3–6 frames (Takenaka et al.). Skip
  parent/child pairs, as raindrop-fx does.
- **Sources.**
  - Condensation: slow growth of everything.
  - Rain: random spawns with a log-normal size.
  - **The spray tool:** a cone of N droplets per frame from the cursor, sizes
    0.1–1.5 mm, the liquid chosen by the tool. On impact it adds volume to an
    existing drop or spawns a new one. Slime spawns fewer, larger blobs.
- **Idle.** Once no drop is moving and nothing is spawning, stop the sim
  task. Only evaporation ticks remain, and these can run at 4 Hz through the
  one scheduler.

### 6.2 Rendering the drop map (WebGL1-compatible)

- **Size.** One RGBA8 render target per pane region (or per section), at
  **½ the CSS resolution**. Height is smooth, so ½ is enough. Clear it and
  redraw it every frame the sim moves.
- **Channels:**
  - **R = height.** Each drop is a quad with a spherical-cap profile
    `h(r) = √(R²−r²) − (R−h₀)`, drawn with **additive blending**. Overlapping
    drops sum, so a smoothstep threshold in the compose pass makes merging
    drops neck together like metaballs. raindrop-fx uses
    `smoothstep(0.96, 0.99, a)` for the same effect.
  - **G = film/trail wetness**, a thin height.
  - **B = liquid id** for colour/absorption lookups, written by max blend.
  - **A = coverage.**
- **Draw path.** Use `ANGLE_instanced_arrays` where present; otherwise one
  dynamic vertex buffer of quads. 400 quads are trivial either way.
  - Scale height so 8 bits are enough (drops are under 1.5 mm tall, §2.3).
  - Use `OES_texture_half_float` plus a renderable half-float format when
    available.
- **Static droplets** (the tiny ones that never move) go to a separate,
  persistent droplet texture: an accumulate-and-erase pass. Moving drops wipe
  it, as in raindrop-fx's `erase.glsl` and Codrops' `destination-out`. We
  write our own procedural version rather than Heartfelt's, because of its
  licence.

### 6.3 Shading, inside our existing passes

- **Normal and lens.** `∇h` comes from central differences on R, as in
  Heartfelt. The photo lookup offset is **`Δ = −(n−1)·gap·∇h`** (§3.1). It
  needs no tuning knob, and it produces the inverted, minified image by
  itself. For steep slopes, use full `refract()` with the 3D normal.
- **Blur.** Fogged glass is blurred and drops are sharp, so take the mip/LOD
  from coverage (Heartfelt's focus mix). This matches our frost layer: wet
  areas clear the frost.
- **Fresnel and reflection.** Schlick with F0 = 0.02 and the TIR fix
  (Lagarde) reflects the HDR room through the reflected vector. Add
  Blinn-Phong highlights from the light registry (the cursor lamp). Darken
  the rim with a smoothstep on |∇h| (§3.2).
- **Liquid colour.** Multiply by `exp(−σ_rgb[liquid] · thickness)`, with
  thickness ≈ h/cos θ_view, plus a liquid-specific scatter blur (§4).
- **Caustic and shadow behind.** In the existing **plus-lighter caustic
  canvas** and the **multiply shadow canvas**, sample the drop map shifted by
  the lamp's lateral offset (our `gap·lateral/height` rule). Compute
  `ratio = 1/|1 + (n−1)·gap·∇²h|`:
  - where ratio > 1, add `(ratio−1)` to the caustics canvas;
  - where ratio < 1, multiply by `ratio` in the shadow canvas;
  - blur both by the penumbra.

  This is the area-ratio method of Wallace and Renou, reduced to one
  Laplacian sample (§3.4). It fits the "plus-lighter can only add" split
  already documented in `effect-layer`.
- **CSS/SVG fallback** (Safari/Firefox, no WebGL refraction): draw the drop
  map's highlights and rim only, so drops still read as drops without moving
  pixels.

### 6.4 Budgets (proposed, measure with `?perf=1`)

| Item | Desktop | Mobile |
|---|---|---|
| Sim (≤400 drops, hash grid) | ≤ 0.5 ms CPU | ≤ 1 ms |
| Drop-map draw at ½ res | ≤ 0.3 ms GPU | ≤ 0.6 ms |
| Extra in glass compose (5 taps + 1 env + LOD) | ≤ 0.4 ms | ≤ 0.8 ms |
| Caustic + shadow taps | ≤ 0.3 ms | ≤ 0.5 ms |
| **Total, while drops move** | **≤ 1.5 ms** | **≤ 3 ms** |
| Idle (nothing moving) | ~0 (the cached map is reused) | ~0 |

Reference points: raindrop-fx does 2000 drops in ~6 ms on mobile
([README](https://github.com/SardineFish/raindrop-fx)); Remember Me's full
raindrop effect cost 1.69 ms on PS3
([Lagarde](https://seblagarde.wordpress.com/2012/12/27/water-drop-2a-dynamic-rain-and-its-effects/)).

### 6.5 What to borrow from which source

| From | Take | Licence |
|---|---|---|
| raindrop-fx | sim structure (mass, trail split, momentum merge, hash grid); erase-droplets pass; smoothstep metaball edge | MIT: can port code |
| Codrops RainEffect | trail spawning and 3% shrink; big drops clearing small; separate un-tracked droplet layer | Codrops licence: ideas, or use with attribution; avoid "as-is" |
| Heartfelt | finite-difference normal; "sharp where wet, blurred where fogged"; static-drop fade cycle | CC BY-NC-SA: **ideas only** |
| Toadstorm | dual-phase flow-map trick, if we ever want texture-only rivulets | blog technique |
| Evan Wallace / Renou | area-ratio caustics; heightfield water for §5 | MIT / BSD-3 |
| Quéré, Furmidge, Li et al. | slide threshold, speed law, viscosity scaling | physics |
| OMLC | blood σ_a per channel | data |

### 6.6 Suggested order

1. Drop map with static drops, plus the refraction formula. Check the
   inverted image against a photo of a real drop on one of Ony's panes.
2. Sim: growth, the Furmidge slide, speed, merge, trails.
3. Highlights, rim and Fresnel reflection.
4. Caustic and shadow through the existing two canvases.
5. Spray tool and the liquids table (water, blood, slime).
6. Water surface (Elias/Wallace heightfield) reusing steps 1, 3 and 4.

---

## 7. R2 port plan (follow-up)

Research only, 2026-10-01. No site code changed. This answers what R2 left
open in [research-plan.md](research-plan.md): which parts of raindrop-fx can
go into our WebGL1 engine and how, what it costs on a mid-range Android phone,
reference photographs, and the build steps for tasks 77 and 76. Numbers marked
**(computed)** were worked out or measured here, with the method given.
Numbers marked **(estimate)** are judgement and still need measuring.

**What I read.**

- **raindrop-fx.** Cloned at `HEAD` [`bae4081`](https://github.com/SardineFish/raindrop-fx/tree/bae4081)
  (2023-01-10, the last commit). MIT, "Copyright (c) 2021 SardineFish"
  ([LICENSE](https://github.com/SardineFish/raindrop-fx/blob/bae4081/LICENSE)).
- **Its renderer, zogra-renderer.** Cloned at [`02b6b4a`](https://github.com/SardineFish/zogra-renderer/tree/02b6b4a)
  (2023-02-17). MIT, "Copyright (c) 2020 SardineFish"
  ([LICENSE](https://github.com/SardineFish/zogra-renderer/blob/02b6b4a/LICENSE)).
  raindrop-fx's [package.json](https://github.com/SardineFish/raindrop-fx/blob/bae4081/package.json)
  pulls `zogra-renderer ^1.3.5` from npm, but what I read is the repo's master
  branch. So the zogra lines below show how the renderer behaves; they may
  not match the published 1.3.x byte for byte.

Every link below goes to the line I read.

### 7.1 What raindrop-fx does, part by part

#### Simulation: CPU TypeScript, three files

| Part | What the code does | Where |
|---|---|---|
| Loop | Each `requestAnimationFrame` runs `simulator.update`, then `renderer.render`. **The step is fixed at `dt: 0.03` s whatever the frame time.** The real frame time is computed and then not used. So the sim runs at 1.8× real time at 60 Hz and 3.6× at 120 Hz **(computed)** | [index.ts L76–L91, L119–L124](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/index.ts#L76-L124) |
| Defaults | spawn every 0.1 s, sizes 60–100 px, at most 2000 drops, gravity 2400 px/s², `slipRate` 0, `motionInterval` 0.1–0.4 s, `trailDistance` 20–30 px, `trailDropSize` 0.3–0.5, `trailDropDensity` 0.2, `evaporate` 10/s, `initialSpread` 0.5, `shrinkRate` 0.01, `velocitySpread` 0.3, `xShifting` 0–0.1 | [index.ts L21–L65](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/index.ts#L21-L65) |
| Spawning | Every `spawnInterval`, one drop appears at a uniformly random point with a uniformly random size, while the count is ≤ `spawnLimit`. A new drop joins the collision grid only on the next frame | [spawner.ts L30–L44](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/spawner.ts#L30-L44), [simulator.ts L168–L174](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/simulator.ts#L168-L174) |
| Mass and size | `mass = (size·density)²`; size = `(spread+1)·√mass/density`. The units are px², so the behaviour changes with screen resolution. Trail drops have density 0.2, so they look 5× wider than their mass would make them | [raindrop.ts L38–L49](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/raindrop.ts#L38-L49) |
| Evaporation | `mass -= evaporate·dt` every step. **Nothing removes a drop at zero mass.** Below zero, √m is NaN, so the drop's size vanishes. The acceleration `g − R/m` also flips sign, so the drop shoots downward and is deleted once `y < −100`. It works by accident | [raindrop.ts L71–L79](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/raindrop.ts#L71-L79), [simulator.ts L199](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/simulator.ts#L199) |
| Sliding (stick-slip) | Every 0.1–0.4 s, `randomMotion` re-rolls a resistance `R = U(0,1)·g·4·lerp(spawnSize, 1−slipRate)²`. Each step, `a = (g·m − R)/m` and `vy −= a·dt`, clamped to `vy ≤ 0` (y points up) | [raindrop.ts L65–L79, L110–L115](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/raindrop.ts#L65-L115) |
| Wander | `vx = |vy|·shift`, with `shift = U(−1,1)·U(0, 0.1)` re-rolled together with R | [raindrop.ts L77, L114](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/raindrop.ts#L77-L114) |
| Shape | `spread.y` rises toward `velocitySpread·(2/π)·atan(0.005|vy|)` with speed. Both spreads decay as `shrinkRate^dt`, i.e. to 1% within 1 s. A new drop lands with `initialSpread` 0.5, the "splat" | [raindrop.ts L82–L85](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/raindrop.ts#L82-L85) |
| Trails | After 20–30 px of travel, a drop of mass ≥ 1000 splits off a trail drop. The trail drop is `size.x·U(0.3,0.5)` across, at density 0.2, placed ±5 px sideways and `size.y/4` above the drop. It gets spread `(0.1, |vy|·0.01·trailSpread)` and `parent = this`, and the parent loses its mass | [raindrop.ts L88–L108](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/raindrop.ts#L88-L108) |
| Collision grid | Uniform cells of `0.3·spawnSize.max` = 30 px. Each cell is an array with swap-remove, and a drop is re-binned whenever it changes cell. The check covers the 3×3 neighbouring cells. It skips self, parent and child, and siblings. Two drops merge when their distance is less than the sum of `mergeDistance = size.x·(1+spread.x)·0.16·colliderSize`. The heavier drop absorbs the lighter; mass adds, and the velocity is the momentum-weighted average | [simulator.ts L82–L103, L119, L205–L214, L218–L265](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/simulator.ts#L82-L265), [raindrop.ts L56–L59, L117–L124](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/raindrop.ts#L56-L124) |

**What that pinning model amounts to (computed).** With the defaults,
`R_max/g = 4·100² = 40 000 px²`. A drop therefore moves during a given
interval exactly when `U < m/40 000`:

- spawned drops (m = 3 600–10 000) move in 9–25% of intervals;
- a merge of two of the largest (m = 20 000) moves in 50%;
- trail drops (m ≈ 100–600) move in under 2%.

So the chance of moving is proportional to mass. There is no threshold, and
nothing depends on where the drop is. That is the part we replace with
physics (§7.2).

**Two grid flaws (computed).** I re-ran the logic, see "Measured here" in §7.3.

- **Missed merges.** The merge reach of one large drop gets to 61.6 px, but a
  cell is 30 px. So the 3×3 check misses pairs: on average 0.6 overlapping,
  unrelated pairs per frame stay unmerged, at about 1 150 drops (found by
  brute-force comparison).
- **Row wrap.** `gridAt` does not check `x < width`, so the right-hand
  neighbour of the last column wraps into the next row
  ([simulator.ts L134–L143](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/simulator.ts#L134-L143)).
  It is harmless, because the distance check still applies.

#### Rendering: zogra-renderer, WebGL2

The frame ([renderer.ts L365–L389](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L365-L389))
runs at full canvas resolution, in this order:

1. **Droplets.** `drawMeshProceduralInstance` draws `dropletsPerSeconds·dt`
   quads per frame (500·0.03 = 15) into a droplet texture that is never
   cleared. Position and size come from a hash of `gl_InstanceID`
   ([droplet-vert.glsl L32–L50](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/shader/droplet-vert.glsl#L32-L50),
   [renderer.ts L485–L493](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L485-L493)).
2. **Mist.** It adds `dt/mistTime` into an **R16F** target, so the glass fogs
   over about 10 s ([renderer.ts L291, L423–L429](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L423-L429)).
3. **Raindrops.** The target is cleared, then one instanced draw covers every
   drop. Each drop is a quad with a per-instance `mat4` plus `size`
   ([L23–L26, L445–L478](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L445-L478)).
   The fragment shader writes `(n.xy·a, size·a, a)` from `raindrop.png`
   ([raindrop-frag.glsl L16–L18](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/shader/raindrop-frag.glsl#L16-L18)).
   - RGB blends `(ONE_MINUS_DST_COLOR, ONE_MINUS_SRC_COLOR)`, which is
     `s + d − 2sd`, an exclusion ([L28–L36](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L28-L36)).
   - Alpha keeps zogra's default `(ONE, ONE_MINUS_SRC_ALPHA)`, a union that
     saturates toward 1 ([zogra shader.ts L182–L212](https://github.com/SardineFish/zogra-renderer/blob/02b6b4a/zogra-renderer/src/core/shader.ts#L182-L212)).
4. **Erase.** The raindrop texture is blitted into the droplet and mist
   textures with `(ZERO, ONE_MINUS_SRC_ALPHA)`, using alpha =
   `smoothstep(0.93, 1.0, a)`. Running drops wipe the droplets and the fog
   ([L109–L117, L479–L482](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L479-L482),
   [erase.glsl](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/shader/erase.glsl#L14-L19)).
5. **Background.** The blurred background is drawn, with the mist over it
   ([L431–L443](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L431-L443)).
6. **Compose** ([compose.glsl L23–L57](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/shader/compose.glsl#L23-L57)):
   - droplets and drops are combined by exclusion;
   - `mask = smoothstep(0.96, 0.99, a)`;
   - `uv += −(rg−0.5)·(b·0.6 + 0.4)`;
   - `normal = normalize((rg−0.5)·2, 1)`;
   - colour `+= (lambert − 0.8)·0.2`, which darkens the side away from the
     light;
   - specular is **off** by default (`[0,0,0]`, [index.ts L62](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/index.ts#L62));
   - output alpha is the mask, drawn over the background.

**The sprite** ([assets/img/raindrop.png](https://github.com/SardineFish/raindrop-fx/blob/bae4081/assets/img/raindrop.png)),
read pixel by pixel here **(computed)**:

- 256×256 px.
- R and G are linear ramps across x and y: 126 at the centre, about 0–223
  across. That is the normal of a cap whose slope grows with r, i.e.
  paraboloid-like.
- B is 0.
- A is a soft disc: 255 at the centre, falling to about half at roughly 0.3 of
  the width.

Only the core, where the summed alpha is ≥ 0.96, shows as a drop. The soft
skirt outside it is what makes neighbours neck together.

**The refraction offset is in screen UV and does not depend on drop size.**

- An edge texel (`rg − 0.5 ≈ ±0.4`) of a size-1 drop samples up to ±0.4 of the
  whole screen away.
- That is the far-field limit of our §3.1 formula. With
  `sample = c + (p−c)(1 − d/f)` and d ≫ f, a drop shows a small, inverted
  image of a large part of the scene.
- The reference photos show exactly that (§7.4, photos 1 and 6).

**Corrections to §1.2 above:**

- (a) The background blur is **not** a mip lookup. It is a 4-tap down/up-sample
  chain ([blur.ts L54–L100](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/blur.ts#L54-L100),
  [blur.glsl](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/shader/blur.glsl#L14-L25)),
  and compose reads one pre-blurred texture. `generateMipmap` is called
  ([renderer.ts L332](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L332)),
  but nothing samples the mips.
- (b) `EXT_color_buffer_float` is needed **only** for the R16F mist target
  ([L282, L291](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L282-L291)).
  The drop and droplet targets are RGBA8, zogra's default `RenderTexture`
  format ([zogra texture.ts L292](https://github.com/SardineFish/zogra-renderer/blob/02b6b4a/zogra-renderer/src/core/texture.ts#L292)).
- (c) The `raindropLightBump` option (`uBump`) is declared but never used in
  [compose.glsl L19](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/shader/compose.glsl#L19).
- (d) Blinn-Phong is in the shader, but the defaults switch it off.

### 7.2 What ports to our WebGL1 engine, and how

#### WebGL2-only features and their WebGL1 replacements

| raindrop-fx uses | Where | Our replacement | Support |
|---|---|---|---|
| a `webgl2` context | [zogra renderer.ts L69](https://github.com/SardineFish/zogra-renderer/blob/02b6b4a/zogra-renderer/src/core/renderer.ts#L69) | the shared `webgl` context ([gl.ts L53–L59](../../src/effects/engine/gl.ts)) | – |
| GLSL ES 3.00 (`in`/`out`, `texture()`) | line 1 of every shader | rewrite in GLSL ES 1.00 (mechanical) | – |
| instanced draw with a per-instance `mat4` (4 attribute slots) and `vertexAttribDivisor` | [renderer.ts L23–L26, L478](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L23-L26); [zogra renderer.ts L401](https://github.com/SardineFish/zogra-renderer/blob/02b6b4a/zogra-renderer/src/core/renderer.ts#L401), [array-buffer.ts L275–L299](https://github.com/SardineFish/zogra-renderer/blob/02b6b4a/zogra-renderer/src/core/array-buffer.ts#L275-L299) | **plain quads**: 4 vertices per drop in one dynamic buffer, `Uint16` indices (up to 16 383 drops), one draw call. `ANGLE_instanced_arrays` exists, but its divisors are context state that [`beginPass`](../../src/effects/engine/gl.ts) (L93–L116) does not reset, so a divisor leaked by one pass would break the next. 400 quads are 1 600 vertices **(computed)**, which is trivial without instancing | `ANGLE_instanced_arrays` 99.98%, Android 99.93% ([web3dsurvey](https://web3dsurvey.com/webgl/extensions/ANGLE_instanced_arrays)) |
| `gl_InstanceID` for procedural droplets | [droplet-vert.glsl L34](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/shader/droplet-vert.glsl#L34) | droplet quads made on the CPU and appended to a persistent texture, positioned by our own hash. **Don't copy** the "Gold Noise ©2015 dcerisano" Shadertoy snippet ([L15–L25](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/shader/droplet-vert.glsl#L15-L25)): it states no licence | – |
| `UNSIGNED_INT` indices | [zogra renderer.ts L401, L429](https://github.com/SardineFish/zogra-renderer/blob/02b6b4a/zogra-renderer/src/core/renderer.ts#L401-L429) | `Uint16` | core WebGL1 |
| R16F render target + `EXT_color_buffer_float` (the mist) | [renderer.ts L282, L291](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L282-L291) | **not ported.** The pane's frost is our CSS blur ([styles.css](../../src/styles.css) `.glass`), and "wiped clear" becomes an 8-bit channel of the drop map. Use half-float only if banding shows | `EXT_color_buffer_half_float` 99.29%, Android 93.01% (tools-survey §0) |
| mipmaps and mirror/repeat wrap on NPOT render textures | [renderer.ts L332, L337–L344](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L332-L344) | not needed. WebGL1 allows only clamp on NPOT textures; mirror in the shader if ever wanted | – |
| exclusion and erase blend functions | [renderer.ts L28–L36, L109–L117](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L109-L117) | core `blendFunc`. MAX for the liquid-id channel via `EXT_blend_minmax` | 99.99%, Android 100% ([web3dsurvey](https://web3dsurvey.com/webgl/extensions/EXT_blend_minmax)) |

#### Part by part

| Part | Decision | How |
|---|---|---|
| Drop list, spawning, trail split, momentum merge, parent/sibling exclusion, swap-remove grid | **Port** (MIT; keep the copyright notice in the file header) | `src/effects/water/sim.ts`: pure TypeScript with no DOM or GL, a struct-of-arrays in `Float32Array`s, so it can be unit-tested in vitest |
| Units and time | **Change** | mm and µL through one per-pane scale. Use real `dt` from the scheduler (`Step(now, dt)`, capped at `MAX_DT` 250 ms: [scheduler.ts L47, L64, L87](../../src/effects/engine/scheduler.ts)), sub-stepped at ≤ 1/60 s |
| Random resistance (pinning) | **Replace** | the Furmidge threshold (§2.2–§2.3) times a coarse noise pinning field (§6.1). Keep raindrop-fx's 0.1–0.4 s re-roll as a small per-drop jitter on F₀, so two equal drops still differ |
| Unbounded acceleration | **Replace** | the friction-law speed `U = (ρgV − F₀)/(βwη)`, eased toward over about 100 ms (§2.4) |
| Evaporation | **Port and fix** | remove the drop explicitly at `V ≤ V_min`; assert that every value is finite |
| Grid | **Port and fix** | rebuild it every step with a counting sort over cells at least 2× the largest merge reach, bounds-checked. That is O(n) and cannot miss a pair. The 30 px vs 61.6 px case is the bug |
| `raindrop.png` and the exclusion normal map | **Do not port** | an analytic spherical cap per fragment, `h(r) = √(R²−r²) − (R−h₀)`, blended **additively** as height (§6.2). Heights sum where drops overlap; normals come from central differences. It is exact and needs no texture unit |
| Droplet layer and erase | **Port the idea** | a persistent RGBA8 texture per pane. New droplets go in as CPU quads; the erase pass uses the same blend `(ZERO, ONE_MINUS_SRC_ALPHA)` |
| Compose | **Rewrite** | lens offset `Δ = −(n−1)·gap·∇h` using the pane's real gap (`uGap`, [glass-light-shader.ts L105](../../src/lib/glass-light-shader.ts)), plus Fresnel with the TIR fix, the dark rim and highlights from the light registry (§3) |
| Blur chain, mist, zogra-renderer | **Do not port** | the frost is CSS, the drop shows the photograph sharp, and zogra makes its own WebGL2 context |

#### Where it lives in our engine

Nothing in the shared context renders to a texture yet. The only
`createFramebuffer` in `src` belongs to the liquid-glass library's own
context ([GlassRenderer.ts L403](../../src/lib/liquidglass/GlassRenderer.ts)).

1. **A drop map in the shared context.**
   - Each wet pane gets an RGBA8 texture and framebuffer at ½ CSS px.
   - Because it lives in the same context as the glass pass, that pass samples
     it directly, with no readback and no upload. Compare the shard map, a 2D
     canvas uploaded with `texImage2D` ([GlassLight.tsx L836–L857](../../src/components/site/GlassLight.tsx)).
   - [`beginPass`](../../src/effects/engine/gl.ts) (L93–L116) must also
     `bindFramebuffer(null)`. Today it doesn't, because no pass binds one.
   - Channels: **R** height, **G** wet film / trail, **B** liquid id (MAX
     blend), **A** coverage. Wiped-clear droplets go in the droplet texture.
2. **Texture unit 9.**
   - The glass pass already uses units 0–7, and the shard map takes 8 where
     there are more than 8 ([GlassLight.tsx L216–L274, L222](../../src/components/site/GlassLight.tsx)).
   - `MAX_TEXTURE_IMAGE_UNITS` is ≥ 16 on 100% of reports overall and ≥ 13 on
     100% of Android. Only Firefox has reports of 8
     ([web3dsurvey](https://web3dsurvey.com/webgl/parameters/MAX_TEXTURE_IMAGE_UNITS)).
   - With 8 units: no drops.
3. **A water layer of its own, not the light layer.**
   - The glass light layer can only add light. It outputs
     `mix(straight, refracted, bevel) − straight`, with alpha set to its
     brightest channel ([glass-light-shader.ts L571, L1376–L1377](../../src/lib/glass-light-shader.ts)).
     So it cannot swap the frosted view for a darker, inverted image.
   - Drops need a normal-alpha per-pane canvas, above the CSS frost and below
     the light layer. A "water" pass draws it:
     - colour: the sharp photograph through the lens offset, using the same
       `uBackdrop` texture object (the context is shared) and the same
       `coverUv` mapping as the glass pass (L540–L562);
     - the dark rim and the Fresnel reflection of the room;
     - alpha: the drop coverage.
   - The highlights on drops go into the existing light pass, which already
     loops over every light. It reads the normal from the drop map, so every
     light, in its own colour, puts a highlight on every drop.
   - This is the same two-layer split as the edge glow (`uGlowOnly`,
     L1359–L1373).
4. **Scheduler.**
   - The sim is a task at `ORDER.scene` (20), so it runs before the passes (30).
   - The map draw and the water pass run with the passes.
   - The sim sleeps when nothing moves or spawns. Evaporation can tick at 4 Hz
     (§6.1).
5. **Caustic and shadow behind:** as in §6.3, unchanged.

### 7.3 Performance

**raindrop-fx's own numbers** ([README, "Performance"](https://github.com/SardineFish/raindrop-fx/blob/bae4081/README.md#performance)):

- Windows Chrome 88: "about 6ms to update each frame with 2000 raindrops".
- Android (Mi 10) Chrome 87: "about 6.5ms".
- Default settings at 1920×1080: "up to 600 raindrops … 2~3ms".

The README does not say how this was timed or whether GPU time is included.

**Measured here (computed).**

- Method: I restated `raindrop.ts`, `simulator.ts` and `spawner.ts` line for
  line in plain JS (a scratch file, not in the repo). I timed `update` alone in
  Node 22 on this session's 2.1 GHz Xeon (2 vCPU): 2000 warm-up steps, then
  the mean over 2000 steps.

| Settings | Mean drops | Sim, ms per step |
|---|---|---|
| defaults | 646 | 0.19 |
| a spawn every 0.02 s | 1 155 | 0.45 |
| a spawn every 0.005 s | 1 280 (merging caps it) | 0.50 |

- The simulation is under a tenth of their 2–3 ms at 600 drops. The rest is
  GPU work. Counting the passes per frame at canvas resolution
  ([renderer.ts L365–L389](https://github.com/SardineFish/raindrop-fx/blob/bae4081/src/renderer.ts#L365-L389))
  gives seven: droplets, mist, raindrops, two erase blits, background plus
  mist, and compose.
- Our design draws one pass over the wet panes (the water compose), plus the
  drop map at ½ resolution over the pane area only.

**Mid-range Android against their Mi 10:**

| SoC (phone) | Geekbench 6 single-core | 3DMark Wild Life Extreme | GPU |
|---|---|---|---|
| Snapdragon 865 (Mi 10) | 1169 ([nanoreview](https://nanoreview.net/en/soc/qualcomm-snapdragon-865)); 1176 ([cpu-monkey](https://www.cpu-monkey.com/en/benchmark-qualcomm_snapdragon_865-geekbench_6_single_core)) | 1110 | Adreno 650 |
| Exynos 1380 (Galaxy A35 / A54) | 1008 ([nanoreview](https://nanoreview.net/en/soc/samsung-exynos-1380)); A35: 1017 ([Notebookcheck](https://www.notebookcheck.net/Samsung-Galaxy-A35-5G-review-A-powerful-all-rounder-with-Galaxy-S-design-for-under-300.834052.0.html)) | 808 | Mali-G68 MP5 |
| Helio G99 (Galaxy A15 4G) | 727 ([nanoreview](https://nanoreview.net/en/soc/mediatek-helio-g99)) | 346 | Mali-G57 MP2 |

- **(computed)** The mid-range CPU is 0.62–0.87× the Mi 10, and the GPU
  0.31–0.73×.
- **(computed)** raindrop-fx's 2000 drops (6.5 ms on the Mi 10) would take
  about 7.5–10.5 ms on these phones if CPU-bound. That assumes linear scaling;
  it would be more if GPU-bound.

**What to expect from ours on a mid-range Android phone, while drops move:**

| Item | Cost | How it was worked out |
|---|---|---|
| Sim, ≤ 400 drops | 0.4–0.7 ms **(estimate)** | 0.12 ms here **(computed**, the 646-drop row scaled to 400) × 3–6 for a phone browser core (**estimate**: this Xeon's Geekbench score wasn't measured) |
| Drop map, 400 quads at ½ res | < 0.3 ms **(estimate)** | the fill is the sum of the quad areas, far less than one screen |
| Water compose over the wet panes, about 8 taps | 1–3 ms **(estimate)** | the GPU ratio above |
| **Total** | **2–4 ms (estimate)** | over the §6.4 mobile budget of 3 ms at the low end |

**But phones don't run the glass effects today.**

- A coarse pointer starts in the `minimal` tier ([quality.ts L51–L58](../../src/effects/engine/quality.ts)).
- The stylesheet strips the lit layers ([styles.css L862–L900](../../src/styles.css)).
- The lab says "a real phone skips the glass effects" ([lab.tsx L100–L104](../../src/routes/lab.tsx)).
- The effect layer runs only in Chromium ([e2e/perf.spec.ts L12–L15](../../e2e/perf.spec.ts)).

So drops on phones are **a decision for Ony**:

- (a) none, as now; or
- (b) a phone path: the water layer at ½ device resolution, ≤ 150 drops, no
  droplet layer and no caustics, at about 1–2 ms **(estimate)**.

Measure on a real device with `?perf=1` before choosing.

### 7.4 Reference photographs

These are for side-by-side checks only (rule 5); none of them ships. More are
in [Commons: Raindrops on windows](https://commons.wikimedia.org/wiki/Category:Raindrops_on_windows).
I opened and looked at photos 1–7 myself; for photo 8 I read only its page.

| # | Photo | What it shows | What we must reproduce |
|---|---|---|---|
| 1 | [GGB reflection in raindrops](https://commons.wikimedia.org/wiki/File:GGB_reflection_in_raindrops.jpg) (Wikimedia Commons) | Every drop holds the Golden Gate tower **inverted and shrunk**, the same way up in every drop. Each image is sharp, while the tower behind the glass is blurred. Each drop has a **thick dark crescent along its top edge** and a bright body. Elongated, merged drops show **one continuous stretched image** across the neck, not two | Inversion and shrinking from the far-field lens offset; sharp inside drops over a soft background; the dark rim on the side that images the darker part of the scene, plus the steep edge; merged drops as one lens (additive height) |
| 2 | [Raindrops on car window](https://commons.wikimedia.org/wiki/File:Raindrops_on_car_window.jpg) (Commons) | A coloured sign behind: each drop shows its colours with **top and bottom swapped**. The drops are dark along the top and bright below. **Two long rivulets** are continuous, narrow, meandering channels with refracting walls. Pear-shaped drops have short tails | Inverted colour bands; rivulets as continuous wet streaks (the G channel), narrower than the drops that made them, with meander from the pinning field |
| 3 | [Raindrops on a window](https://commons.wikimedia.org/wiki/File:Raindrops_on_a_window.jpg) (Commons) | A dense mist of tiny droplets with **clean vertical tracks** through it where drops ran and swept it away. Larger drops sit inside the tracks. There are hundreds of tiny droplets for every big drop, and every drop is outlined by a dark rim | The droplet-erase pass; the size distribution (very many tiny, few large); later drops following old tracks (lower pinning where wet, §6.1) |
| 4 | [Rain drops on window 01](https://commons.wikimedia.org/wiki/File:Rain_drops_on_window_01_ies.jpg) (Commons) | Over the dark ground, the drops look **bright**, because each one images the sky, inverted. Over the bright sky they are almost invisible except for their rims. Thin wavy trails run down the right-hand side | Contrast that flips with what lies behind: a drop's brightness comes from where its lens points, not from where it sits. This is the check for the gap-based offset |
| 5 | [Rain.drops](https://commons.wikimedia.org/wiki/File:Rain.drops.jpg) (Commons) | An overcast street with poles. A dense field of mixed sizes; each drop has a dark rim on one side and a bright core showing the sky. A few large drops have tails | The rim and core contrast at many sizes, including the smallest; a realistic spread of sizes at a given rain amount |
| 6 | [Lights behind window with raindrops](https://www.pexels.com/photo/lights-behind-window-with-raindrops-17510497/) (Pexels) | Night. Even over **black** areas, every small drop sparkles as a bright point, because each gathers a tiny image of the street lights. The out-of-focus light discs behind are untouched | The lens offset must sample far from the drop (the whole photograph, clamped), not just the neighbourhood; this is the photo-site case of bright points in a dark print. Highlights from our lamp come on top |
| 7 | [APOD 2017-01-27, "Venus Through Water Drops"](https://science.nasa.gov/image-article/apod-2017-january-27-venus-through-water-drops/) (John Bell; [old link](https://apod.nasa.gov/apod/ap170127.html)) | Drops on a pane, each holding the whole sunset horizon with trees and Venus. "Refracting light, the drops create images that are upside-down, so the scene has been rotated." The dark band of ground fills one side of each drop | Inversion confirmed by the photographer; each drop holds a wide field of view; the dark band is part of the "dark rim" look; a point light shows as a point in every drop |
| 8 | [EPOD 2011-12, "Water Drops and Inverted Images"](https://epod.usra.edu/blog/2011/12/water-drops-and-inverted-images.html) (macro, drops on a surface, not a window; page text only) | "A liquid drop acts as a simple lens … so the refracted image is upside-down": flowers and a house, inverted | The optics claim already cited in §3.1 |

**The test scene to match (from photos 1, 4 and 6).** Use one pane over a
photograph with a bright top and a dark bottom.

- Drops over the dark half must look bright.
- Drops over the bright half must look dim, with dark rims.
- Each drop must hold the inverted photograph.

### 7.5 Build plan

Each step goes behind `?try=drops` and follows the to-do workflow (research →
design → `?try` → verify measured → Ony approves).

#### Task 77: drops on glass

1. **Sim core** (`src/effects/water/sim.ts`, `liquids.ts`; pure TS).
   - Ported from raindrop-fx with the changes in §7.2 and a seeded RNG.
   - vitest:
     - **Slide threshold.** Water drops below the Furmidge volume (the §2.3
       table, e.g. 8.7 µL at 60°/40°) stay put for 10 s with the noise field
       off; at 1.2× they slide.
     - **Terminal speed** is within 5% of `U = (ρgV − F₀)/(βwη)`.
     - **Merging** conserves volume exactly and momentum to 1e-9.
     - **Trail split** conserves volume.
     - **Frame-rate independence.** The same seed at dt 8.3 ms and 33 ms gives
       slide distances within 5%. raindrop-fx fails this.
     - **Grid.** After each of 1 000 random steps, a brute-force check finds no
       unrelated overlapping pair. raindrop-fx averages 0.6 per frame.
     - **Evaporation** removes drops at `V_min`, and no NaN appears anywhere.
     - **Idle.** `step` returns false once nothing moves and no source is
       active.
     - **Viscosity.** Blood is 3–4× slower than water for the same excess
       weight (§4).
2. **Drop map pass** (FBO at ½ CSS px, plain quads, additive height, MAX
   liquid id).
   - `beginPass` also unbinds the framebuffer.
   - Tests:
     - a vitest twin of the cap profile;
     - e2e: still exactly two WebGL contexts with `?try=drops` (the
       `e2e/gl.spec.ts` pattern);
     - e2e: the framebuffer is unbound after the pass (the next pass draws to
       the canvas).
3. **Water layer: lens.**
   - Δ from the gap; sharp photograph; dark rim; Fresnel room reflection with
     the TIR fix (§3.1–§3.3); a normal-alpha per-pane canvas.
   - Tests:
     - **JS twin of the GLSL.** For a cap, the sample point lies across the
       centre (inverted) when gap > f and on the same side when gap < f, and
       the magnification is `1 − d/f`. The critical angle is 48.6°.
     - **e2e pixel test.** Put one fixed drop (`?drops=test`) over a
       top-bright/bottom-dark test photo: the drop's top half reads darker
       than its bottom half (inverted).
4. **Highlights from every light** (in the existing light pass, reading the
   drop map).
   - Test: with two lights, each drop has two highlights, displaced toward
     each light (JS twin).
5. **Droplets and wiped tracks** (a persistent droplet texture with the erase
   pass, and condensation as the source).
   - Test (e2e): pixels along a path a drop ran through have less droplet
     coverage than before (G/A read back).
6. **Caustic and shadow behind** (§6.3 area ratio).
   - Test (JS twin): integrating the ratio over a drop's footprint gives the
     footprint area to within 3%, so light is conserved.
7. **Rain source, tiers and lab controls.**
   - Causes only: rain amount, condensation, glass cleanliness (contact-angle
     preset), liquid, drop cap.
   - Sleep when idle; the cap shrinks in `lite`.
   - Tests: the `e2e/scheduler.spec.ts` pattern (no frames while still);
     `?perf=1` records `cpu:water-sim` and `gpu:water` (the `e2e/perf.spec.ts`
     pattern).
8. **Check against §7.4 side by side, measure with `?perf=1`, Ony approves.**

#### Task 76: spray bottle, the same sim (after 77 step 4)

1. **Tool.**
   - Add `"spray"` to `ToolId`/`TOOLS` ([held.ts L40–L75](../../src/effects/tools/held.ts)).
     The lamp stays in the other hand, as with the hammer.
   - Choose the liquid in the lab.
   - Press to spray.
2. **Particles.**
   - The CPU pool from the tools survey §4 decision, fired from the nozzle as a
     cone.
   - Droplet sizes, cone angle and flow per squeeze come from **R3**, now
     done: [liquids-spray.md §5.3](liquids-spray.md).
   - A droplet lands at its screen point after its flight time.
3. **Landing.** On a pane, call `sim.addVolume(pane, x, y, V, liquid)`:
   - inside an existing drop's contact radius, it merges;
   - otherwise it spawns a new drop with raindrop-fx's `initialSpread` splat;
   - below `V_min`, it goes into the droplet texture.

   Spray that misses every pane goes to the wet layer (item 26), which is
   outside this sim.
4. **Liquids.** θa/θr, γ, η, ρ and σ_rgb per liquid (§4).
   - Blood absorbs by `exp(−σ·h)` in the water layer.
   - Slime has a large F₀ and η, never sheds trail drops and stretches instead.
5. **Tests.**
   - Volume sprayed = volume on panes + volume off panes, exactly.
   - The cone distribution passes a seeded statistical check.
   - Slime spawns no trail drops; blood runs slower than water (vitest).
   - e2e: holding the spray on a pane for 2 s makes drops appear, and some of
     them slide.

### 7.6 Decisions

- **Port (MIT):** raindrop-fx's sim structure: the drop list, trail split,
  momentum merge, parent/sibling exclusion and grid; the droplet layer with
  its erase blend; the smoothstep metaball edge.
- **Fix while porting:** use real dt; remove drops at zero volume; make the
  grid unable to miss a pair.
- **Replace with physics:** random resistance and unbounded acceleration
  become the Furmidge threshold, the friction-law speed and a pinning field.
  The sprite normal map becomes an analytic cap height. The UV-constant
  refraction becomes `Δ = −(n−1)·gap·∇h`.
- **Do not port:** zogra-renderer, the WebGL2 features, the mist target, the
  blur chain, or the Gold Noise hash, which states no licence.
- **Engine additions needed:** the first framebuffer in the shared context (and
  `beginPass` unbinding it); texture unit 9; a per-pane normal-alpha water
  layer under the light layer.
- **Numbers:**
  - map at ½ CSS px, RGBA8 (8-bit height at 255 = 1.5 mm, i.e. 5.9 µm a step,
    **computed**);
  - ≤ 400 drops per page (≤ 150 on a phone path);
  - sim sub-step ≤ 1/60 s;
  - grid cell ≥ 2× the largest reach;
  - unit 9.
- **Lab controls (causes only):** rain amount, condensation, glass cleanliness,
  liquid, drop cap. There is no refraction knob; the gap sets it.
- **Still unknown:**
  - the real cost on a mid-range phone (estimates only);
  - whether phones get drops at all (Ony);
  - R3's spray numbers (now in [liquids-spray.md](liquids-spray.md));
  - whether 8-bit height bands on small droplets (half-float is the fallback);
  - the CSS-px-to-mm pane scale (how big a pane is in real life), which sets
    every threshold in §2.

## 8. Status (2026-10-01)

- Step 1, the sim core: done (51d8ce6, `src/effects/water/sim.ts`, 12 tests
  as 7.5 lists). Changes from the plan: a fixed 1/120 s step with an
  accumulator (frame-rate independence holds exactly, not just to 5%); a
  drop is held at its front edge and lays its film behind it (it was
  helped by its own film).
- Steps 2-4, drop map, water layer, highlights: done behind `?try=drops`
  (b3ca43b, 80c697e). The map is at full CSS px, not half: at 3.6 px/mm a
  typical rain drop is 7 px across and half resolution drew it as a
  3-texel block. Highlights are in the water layer, not the glass light
  pass.
- **A correction to 7.2 "the drop shows the photograph sharp".** The site's
  glass is etched on its back face (shadows.md 7; the satin preview etches
  the front "like the back"). A drop on the polished front does not wet
  the etch, so it images the frosted face a glass-thickness away: the
  photograph blurred wider than the drop, shifted (n-1) x thickness x
  slope, about 7 px. So on the site's glass a drop shows the frost beside
  it and only its reflections stand out (computed). It is a clear lens
  onto the sharp photograph only where the front is etched too or the
  glass is clear. Which the site wants is a question for Ony (todo 88).
- Still to do: step 5 (droplets and wiped tracks), 6 (caustic and shadow
  behind), 7 (tiers, idle, perf), 8 (side by side, Ony).

## 9. Rebuild for photorealism (2026-10-01)

Ony, after seeing the first cut: the rain "looks low res and pixelated",
"like shitty CGI". He is right. Looked at side by side with the Commons
photographs (§7.4: [Raindrops on a window](https://commons.wikimedia.org/wiki/File:Raindrops_on_a_window.jpg),
[GGB reflection in raindrops](https://commons.wikimedia.org/wiki/File:GGB_reflection_in_raindrops.jpg),
[Rain.drops](https://commons.wikimedia.org/wiki/File:Rain.drops.jpg)), the
first cut is wrong in six ways:

| What the photographs show | What the first cut drew | Why |
|---|---|---|
| Large drops 15-30 px across in a 1280 px frame; tiny droplets 1-4 px, thousands of them | drops 5-10 px, no droplets | `PX_PER_MM` 3.6 put a 4 mm drop at 14 px |
| Smooth, sharp edges at screen resolution | 1 CSS px layer, upscaled by the device pixel ratio | `LAYER_SCALE` 1 ignored `devicePixelRatio` |
| Drops never quite round: pinned outlines, pear shapes with a point at the top and the weight at the bottom, merged blobs | perfect circles | the map drew a spherical cap over a circle |
| Dense droplets with clean vertical tracks where runners swept them | nothing | step 5 not built |
| Each drop a clear lens holding the scene behind, sharp over a soft background | on the site's frosted panes, an almost invisible ring and a cyan dot | the drop was treated as sitting on polished glass over a back-etched face, so it showed only reflections |
| Spray mist as small round lenses | single-pixel hash speckle | a placeholder |

### 9.1 Decisions

- **Scale: 6 px per mm** (estimate from the photographs). A water drop on
  a vertical window starts to run at a contact diameter of 4.4 mm (§2.3), so
  the largest standing drops are about that size. In the three Commons
  frames above the largest standing drops measure 20-30 px across 1280 px,
  which is 5-7 px per mm at the frame's own width; on our 1338 px window the
  same framing is 6 px per mm.
- **Device resolution.** The drop map, the droplet map and the water layer
  are drawn at the device pixel ratio (capped at 2), so an edge is as sharp
  as the screen.
- **Height precision.** The drop map is half-float when the GPU can render
  to it (`OES_texture_half_float` + `EXT_color_buffer_half_float`, which
  also allows blending); RGBA8 otherwise. Small droplets go in their own
  map with a finer height scale (0.5 mm full scale, 2 um a step), so their
  slopes do not band.
- **Wet glass goes clear.** The panes are frosted. Frosted glass is clear
  where water lies on its etched face, because the water fills the
  roughness and its index (1.33) is close to the glass's (1.5), so the
  surface stops scattering ([Phys. Educ. 50 638 (2015), "How does frosted
  glass become transparent?"](https://iopscience.iop.org/article/10.1088/0031-9120/50/5/638)).
  The rain falls on the etched face, so every drop, droplet and wet track
  is a clear window onto the photograph, sharp against the frost around
  it. This is the look of every reference photograph (sharp drops over a
  soft background) and it is physical. It replaces the "reflections only"
  mode of §8, which stays available as the "Rain on: polished face" cause
  in the lab (todo 88d).
- **The lens is ray traced, not approximated.** Per pixel: the eye ray
  refracts into the water at the surface normal (Snell, from the height
  map's gradient), crosses the flat water-glass face, the glass's
  thickness, the flat glass-air face and the gap, and lands on the
  photograph. The tangential invariant n sin(theta) carries it from medium
  to medium; where it reaches 1 at the glass-air face the ray is totally
  reflected and the point shows the room's reflection instead (dark).
  The offset that results is h tan(theta_w) + T tan(theta_g) + G tan(theta_a)
  along the slope, which inverts and shrinks the photograph when the
  photograph is beyond the drop's focal length and magnifies it when it is
  inside, as the GGB tower (photo 1) and the EPOD drops (photo 8) show.
- **Matching the frost's colour.** The water layer is drawn with ordinary
  alpha over the frost (blend modes cannot see the pane's backdrop-filter
  from inside the pane: tested, a multiply child of a backdrop-filtered,
  isolated pane multiplies only the pane's own tint). So the drop's colour
  is computed the way the pane computes its frost, minus the blur: the
  photograph, saturated by the pane's own `saturate()` and veiled by the
  pane's own fill colour, both read from the pane's computed style. The
  lamp's light on the photograph (FloorLight, `pane:under`) is above the
  water layer and lights drops and frost alike.
- **Shape.**
  - Contact line: the circle of the cap's radius, perturbed by harmonics
    2-4 with per-drop random phase, amplitude growing with size (pinning
    on more defects) **(estimate: 3% for a droplet, 9% for a 4 mm drop)**.
  - Gravity on vertical glass: wider and taller at the bottom, narrower at
    the top (the advancing angle below, the receding above, §2.2): an egg
    profile whose apex sits below the centre **(estimate: apex 15% of the
    radius low, taper 25% at the top)**, as the pear drops of photos 2, 3, 5.
  - Running drops stretch along their run and leave a tail (raindrop-fx
    `velocitySpread`, already ported).
- **Droplets (step 5).** A persistent droplet map per pane. Rain landing
  splashes: besides the drops the sim tracks, each landing adds tiny
  droplets (0.1-0.6 mm, log-normal) around it, and condensation adds them
  everywhere at the "Condensation" rate. Each is drawn once into the map
  as a small cap; every frame, every drop wipes the droplets under it (it
  has swallowed them) and a running drop wipes its whole path (the clean
  tracks of photo 3). Spray mist lands as droplets too, replacing the
  speckle.
- **Wet tracks.** A runner leaves a film: wet glass, so clear. A
  persistent wet map per pane (half resolution: a film's edge is soft)
  takes each runner's path and fades as the film dries (`FILM_DRY`).

### 9.2 Light under the water (built with the rebuild)

The room's light reaching the photograph through the water is gathered
under a drop's crown and starved under its edge. To first order in the
slope (each bit of water bends light by about (n - 1) times its slope),
the irradiance on the photograph a distance D behind is
E = 1 / (1 + D (n - 1) laplacian(h)) **(computed)**: bright under the
crown, where the cap curves down, dark under the edge, where the slope
falls from the contact angle to nothing. The room's light arrives from a
wide cone, which blurs the pattern: the laplacian is taken over D tan 30
deg **(estimate)**, and E is held to 0.3-1.8 where the first-order form
breaks down (past the drop's focus). What a drop shows is the photograph
at the point its ray lands, lit by this: the edge of a drop images the
starved ring under its own edge, which is what gives drops their dark
rims over an evenly lit scene (photos 3 and 5).

### 9.3 Checked (2026-10-01)

Rendered at 1.5x device pixels on the home page (cards pane) and Lab
samples (night photograph, bright neon), compared side by side with
Commons "Rain.drops", "Raindrops on a window" and "GGB reflection in
raindrops":

- each drop holds the photograph inverted and shrunk, sharp against the
  frost; over bright lights they glow in the lights' colours (photo 6);
- drops are pear-shaped and irregular, larger ones more so;
- edges are dark, centres bright;
- highlights are small white glints, one per light;
- runners sweep clean vertical tracks through the droplets (photo 3).

Fixes found while checking: the pane's photograph was taken from the
last image in its section, which on Lab samples was a card standing on
the pane, so the pane refracted (and its drops imaged) a picture that
was not behind it (scene.ts backdropOf now skips images on the pane);
highlights clipped per channel turned into violet dots (now clipped to
white); the 400-drop cap held a pane at 9% coverage (now 1500).

### 9.5 Round 2 (2026-10-01, approved by Ony)

From Ony's notes on round 1 ("too big", "like we're super zoomed in",
"still way too pixelated", "very misshapen rain drops on windows ... they
just have to follow certain rules", "many types of rain", condensation
"separate from the rain but interacts with rain") and his reference
photographs (the Golden Gate tower and the sky inverted in each drop):

- **Scale**: 4 px a mm (was 6). The largest clinging drop (4.4 mm) is
  about 18 px; most are 4-10 px.
- **The scene a drop images is far away.** The photograph is the world
  outside the window, so each drop's ray is traced to a scene 900 px
  behind the glass **(estimate, matched to his photographs: about half
  the photograph inside each drop)**, not to a print a few px behind it.
  The light-under-the-drop term of 9.2 assumed the photograph was right
  behind the glass, so it no longer applies and is gone.
- **Shapes follow the rules**: a merged drop stays stretched along the
  line between the two it was made from (the sim's skew, relaxing over
  40 s, kept at most 1.8 x 0.75), with its volume kept; contact lines
  2% irregular for a droplet, 6% for the largest drop; bigger drops sag
  into a pear (Bond number).
- **Sub-pixel droplets** are drawn at 1.2 device px and faded by their
  true area: a sparkle with a glint, as a camera records them.
- **2x**: the maps and the water layer are drawn at 2 device px per CSS
  px wherever the machine runs the full quality tier, and downscaled.
- **Rivulets**: a runner's wet track stands 0.18 mm proud where fresh
  **(estimate)** and is its own lens, so the scene wavers through it.
- **Rain type** (effects/water/rain-types): drizzle (sub-0.5 mm drops:
  the meteorological definition), light, steady, downpour, wind-driven
  (runners slant), after the rain (nothing new lands). Rates, medians
  and droplet counts are estimates matched to the reference photographs.
- **Condensation** (steam): its own half-size map per pane, building up
  over 30 s **(estimate)**, uneven in patches, milky with the scene
  blurred through it and a halo round each lamp. Same side as the rain:
  every drop's footprint and runner's path wipes it and it builds back;
  the other side: it veils the drops.

### 9.5b The light on a drop, redone (2026-10-01; Ony: "Are you sure the refraction/shadow/specular highlights/reflections are correct for the drops?")

Checked under the lamp, it was not: glints too weak to see, the drops washed
out by the lamp's glow on the frost, the room they reflected the stock
panorama's colours. Now, for rain on the etched (far) face, each drop is seen
FROM INSIDE, through the glass:

- your sight crosses the flat faces unturned (n sin(theta) carries) and meets
  the drop's curved water-air surface from the water;
- most leaves into the world (the lens: the scene 900 px off, small and
  inverted); the rest is reflected back toward you by water-to-air Fresnel,
  and ALL of it past the critical angle (48.8 deg) near the rim, where the
  surface steepens -- the rim is a mirror of the room behind you: the dark
  ring at night, and where a lamp lines up in it, the bright arc on the far
  side (the second highlight);
- that reflection must still leave the front face; past glass's critical
  angle it is trapped and runs along the pane (dark);
- a lamp's image is drawn at the lamp core's radiance (LAMP_CORE, 400 x the
  white it lights, estimate; scaled by size so a bigger lamp is not brighter
  in total), so even a few per cent of it clips to white, as in a photograph;
- the room it mirrors is balanced to the scene's mean colour (the photo's
  smallest mip), its own hues mostly taken out;
- the water layer now lies OVER the light on the glass: a wet spot of the
  etched face is clear and no longer scatters the lamp into the frost's milky
  glow, so it stays a dark clear lens in a lit pane (before, the glow washed
  the drops out); over a drop, the front face's own room reflection is drawn
  by the water layer.

Second pass the same day (Ony: "I don't see the rain drops catching the
light from the flash charge whatsoever"): a sight line the drop reflects too
steeply to leave the front face was drawn black. It runs on inside the pane
and lands on the dry frost round the drop, which glows under a lamp; it now
shows that glow (Lambert from each lamp's height, FROST_GLOW), so a drop's
rim lights up near a lamp. And each glint gets the camera's bloom, a faint
lobe four times its width (BLOOM_*), so it reads as a small star, not a lone
pixel.

No visible pixels (Ony, 2026-10-01: "Make sure pixels aren't visible in the
drops"): each pixel where there is water is sampled four times inside
itself (rotated grid; full tier only) and averaged as light; the room's
reflection fades into the frost's glow by the front face's own Fresnel as
the sight nears being trapped, instead of stopping at a hard ring; the
glint's edge is softened; and near the rim, where the bent sight runs off
sideways, the scene it samples is held to a slope of 2 so it blurs rather
than speckles.

Not ink (Ony, 2026-10-01: "Why do the drops look like ink?"): the view
through a drop and through a wet track now shows the photograph as the frost
round it shows it lit -- with each lamp's pool of light on it (the floor
light, Lambert from the lamp's height, POOL_GAIN) -- and with only a third of
the pane's dark fill, since that fill stands in for the frost's haze, which
the water clears. Before, the drops showed the photograph unlit and doubly
darkened, so by a lamp each was a dark hole in a lit pane.

### 9.5c Checked against a path-traced reference (2026-10-02)

Ony: "Are you sure that's accurate lighting? It doesn't look right." The
corrections in 9.5b were estimates. So the exact setup was path-traced with
Mitsuba 3 (`water-reference/scene.py`, open source, physically based):
a 4.5 mm pane, frosted back face (rough dielectric, Beckmann 0.25), 327
drops on it (water n 1.333, contact angle 50 deg, contact radii 0.1-2.2 mm),
the lamp the site's size (11.5 mm radius) 75 mm in front, the photograph
either 15 mm behind (a print) or 3 m behind (the world), 768 samples a
pixel. Measured across six drops (`measure.py`, linear radiance):

- inside a drop: 0.1-0.5 of the frost beside it -- drops by a lamp ARE
  darker than the frost (the photograph through them is barely lit);
- a thin bright ring at 70-90% of the contact radius, 1.5-2.2 times the
  frost: sight reflected by the steep part of the drop, trapped in the
  glass, meeting the lit frost from inside;
- a small glint near the centre, 2-4 times the frost;
- lamp off: rings barely visible, the photograph through the drops.

What changed to match: the water-to-air reflectance is now the exact
Fresnel equations (Schlick is far off on the dense side, where the ring
lives); trapped sight shows the frost at TRAPPED_GAIN 2; the lamp's pool
through a drop cut from 1.5 to 0.3 (POOL_GAIN; 9.5b had it the wrong way).

Then the ring itself was missing, and the cause was not the lighting but the
slope: the compose step took each drop's slope by a finite difference over
the drops map's pixels, and across a drop a millimetre wide (8 map pixels at
2x) that averages the steep last tenth of the radius with the flat glass
outside -- the tilt it found topped out near 38 deg at the rim (31 at 1x)
where the true cap reaches its 50 deg contact angle. The band where
water-to-air reflection climbs to total is 41-49 deg, so no drop ever
reached it. The map now writes each drop's exact slope (tan of the tilt,
r / sqrt(R^2 - r^2), with the sag) into its b channel, the liquid moving to
g; the compose step keeps the slope's direction from the map and takes its
steepness from b. Drops by the lamp now have the bright rim; it is brightest
on their lower side, because a drop on an upright pane sags -- steeper below
(advancing, about 60 deg), shallower above (receding, about 40 deg, short of
the band) -- which is what a real window shows; the reference's drops are
symmetric caps.

Two things the reference says about the rest of the site, for Ony to
decide: (1) the frost round a lamp in the reference is a dim grey, while
the site's light layer makes it glow near white -- the light layer is about
ten times brighter than a lamp of this size would make it; (2) with the
photograph 3 m away the frost blurs it to an even brown, but the site's
frost shows the photograph recognisably, as the reference does with a print
15 mm behind -- so the site already behaves as a print behind glass, while
the drops (9.5) image a world 900 px away.

No shadow is drawn: with the rain on the far face and the lamp in front,
there is nothing behind a drop near enough to show one (the scene is metres
away); the drop shows instead as clear glass in the lit frost.

### 9.6 Still to do

- A lamp's own caustic (a sharp bright point under each drop, offset
  away from the lamp) on top of the room's.
- Perf with `?perf=1` on a real GPU; swiftshader here runs the whole
  page at under 1 fps, so it says nothing about cost.
