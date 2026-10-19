# Balloons (R9)

Research only, 2026-10-01. No code changed. Every claim has a source link.
Numbers marked **(computed)** are worked out here from cited inputs, with the
working shown. **(estimate)** marks a judgement that no source states.

Feeds task 74: interactive balloons on the photography site. They float, bob,
can be pushed and dragged, and pop when clicked (a realistic pop). Every light
in the scene lights them: the cursor lamp, the flash, the flare and the black
light. Colours and sizes are randomised, and they have strings.

---

## 0. Short answer

- **Physics: adopt Rapier 2D, as already decided in R0.** Each balloon is a
  rigid ball collider, and its string is a chain of rope joints. Buoyancy,
  quadratic drag and added mass are applied as forces each step: Rapier has
  no air model, and linear damping is the wrong shape.
  - The soft-body `disk` with `volumeFactor > 1` is literally "a pressurized
    blob" ([Rapier soft bodies](https://rapier.rs/docs/user_guides/javascript/soft_bodies)).
    Use it as an **upgrade** after the R0 soft-body spike, for squash when
    balloons bump. It is not the baseline.
- **Rendering: build a balloon pass on our own engine. Nothing on the web fits.**
  Every balloon library found is SVG/CSS keyframes with no lighting (§1).
  The shading is:
  - a thin dielectric film (n = 1.519, so F0 = 0.042);
  - Beer–Lambert colour through a thickness that follows the stretch (t = t₀/λ²);
  - the page behind the balloon used as its backlight;
  - Filament's subsurface term (Apache-2.0) for lights behind it;
  - a UV emission term that reuses the R1 day-glo tokens.

  All of it loops over the existing `LIGHTS_GLSL` list
  (`src/effects/light/light-uniforms.ts:18-30`).
- **A real pop is over in one frame.**
  - Cracks run at up to 570 m/s
    ([Moulinet & Adda-Bedia 2015](https://www.phys.ens.psl.eu/~foldingslidingstretchinglab/papers/moulinetPRL2015.pdf)).
  - The skin snaps back at about 100 m/s
    ([Ross 2019](https://iiav.org/ijav/content/volumes/24_2019_1848881553860721/vol_4/1433_fullpaper_877141577705877.pdf)).
  - So an 11" balloon is gone in about 1–5 ms, against 16.7 ms per frame
    **(computed, §4.2)**.
  - The "realistic pop": draw one frame of torn, retracting skin, then
    flutter the shreds.
  - Keep a slow-motion lab control so the tear can be watched.
  - The crack count follows inflation stress. A normal balloon tears in 1–3
    cracks. An over-inflated one shreds into Y-branching "fingers".
- **Sound:** two CC0 Freesound recordings (§4.5). Alternatively a procedural
  Web Audio burst: noise band-passed at ~3 kHz, as Google's xrblocks sample
  does (Apache-2.0). That matches the measured 3.1–3.4 kHz peak.

---

## 1. Tools first

| Candidate | Licence (checked) | What it is | Covers | Lacks | Decision |
|---|---|---|---|---|---|
| **Rapier 2D** `@dimforge/rapier2d` 0.21.0 | Apache-2.0 (npm metadata; [LICENSE](https://github.com/dimforge/rapier/blob/HEAD/LICENSE)) | Our physics engine ([tools-survey §1](tools-survey.md)) | `JointData.rope(length, a1, a2)` and `JointData.spring(rest, stiffness, damping, a1, a2)` (typings `dynamics/impulse_joint.d.ts:203-204`, 0.21.0). The rope joint "keep[s] two bodies from getting too far apart, but allow[s] them to get closer" and is "inelastic" ([rope_joint.rs](https://github.com/dimforge/rapier/blob/master/src/dynamics/joint/rope_joint.rs)). `SoftBodyDesc.disk(center, radius, n)`: "a ring of `numParticles` particles holding its area (a pressurized blob)"; `volumeFactor` "> 1 inflates the body"; `SoftBodyDesc.rope`; `attachParticle(i, body)`; `World.cutSoftBody`, `tearSoftBody`; per-body `gravityScale`, `addForce`, `setAdditionalMass` (typings `soft_body.d.ts:450, 571, 881-905`; `rigid_body.d.ts:223, 440, 482`). Rapier's docs list balloons as a use of closed, oriented soft bodies ([soft-body contacts doc](https://github.com/dimforge/rapier/blob/846c463e47ef654d6a6ce6fa0e455f3a1e98c2ec/website/docs/user_guides/templates/soft_body_contacts.mdx)) | No aerodynamics (buoyancy, quadratic drag, added mass). We add these as forces (§3) | **Adopt** |
| **xrblocks "Balloon Pop"** (Google) | Apache-2.0 ([LICENSE](https://github.com/google/xrblocks/blob/main/LICENSE)) | WebXR sample on three + Rapier ([BalloonPop.js](https://github.com/google/xrblocks/blob/main/samples/advanced/balloonpop/BalloonPop.js)) | Balloon = Rapier ball with `setGravityScale(-0.05·s)`, damping 0.5, restitution 0.85, density 0.1. Pop = 30 additive quads. Sound ([audio.js](https://github.com/google/xrblocks/blob/main/samples/advanced/balloonpop/audio.js)): 0.15 s white noise → band-pass 3 kHz, Q 1.2 → 2 ms attack, exponential decay to 0.001 by 120 ms | Not realistic. Negative gravity gives no terminal velocity. Confetti pop. A three.js `MeshStandardMaterial` with opacity 0.85 | **Port the sound recipe** only (matches §4.5) |
| **balloons-js** (Artur Bień) | MIT (npm 0.0.3; LICENSE in the tarball) | Celebration overlay ([repo](https://github.com/arturbien/balloons-js)) | SVG balloon with Figma-style inner-shadow and highlight filters. Flight by WAAPI `translate3d/rotate3d` keyframes, 5–6.5 s, linear (`dist/index.esm.js:55-73, 224-248`) | No physics, no pop, no light response | Read only (art reference for highlight placement) |
| react-floating-balloons | MIT (npm 3.0.2) | React CSS balloons with a pop sound ([repo](https://github.com/sanishkr/react-floating-balloons)) | – | CSS only | – |
| CodePen pops ([CucuIonel](https://codepen.io/CucuIonel/pen/DqprGm), [pmontu](https://codepen.io/pmontu/pen/pJZPVq), [efebalun](https://codepen.io/efebalun/pen/aOGomN)) | CodePen default (MIT for public pens is not guaranteed; treat as unlicensed) | Click-to-pop games | – | Sprites and keyframes | Ideas only |
| **Matyka pressure soft body** | Paper ([HTML](http://panoramx.ift.uni.wroc.pl/~maq/soft2d/howtosoftbody.html), [PDF](http://panoramx.ift.uni.wroc.pl/~maq/soft2d/howtosoftbody.pdf)); Processing port BSD ([smacke/pressure-softbody](https://github.com/smacke/pressure-softbody)) | 2D balloon as a spring ring plus an ideal-gas pressure force on each edge (Gauss theorem for the area), Heun integration | The classic 2D balloon model | Rapier's `disk` + `volumeFactor` already does this | **Fallback port** if the Rapier soft-body spike fails |
| **Ten Minute Physics** XPBD | MIT headers ([tools-survey §2–3](tools-survey.md)) | Rope and soft-body solvers | – | – | Fallback, as in R0 |
| **verlet-js** | MIT, 2014 ([repo](https://github.com/subprotocol/verlet-js)) | Verlet ropes | – | Abandoned; stiffness depends on iterations | – |
| **Filament subsurface shading model** | Apache-2.0 ([LICENSE](https://github.com/google/filament/blob/main/LICENSE)) | `surface_shading_model_subsurface.fs` ([source](https://github.com/google/filament/blob/main/shaders/src/surface_shading_model_subsurface.fs)) | Forward-scatter lobe `exp2(VoL·p − p)` plus wrapped back-scatter, scaled by (1 − thickness). GLSL, fits WebGL1 | Not physically based ("does not represent a correct interpretation of transmission events", file header) | **Port** the scatter term (§2.5) |
| Barré-Brisebois & Bouchard, GDC 2011 | Talk ([GDC Vault](https://gdcvault.com/play/1014537/Approximating-Translucency-for-a-Fast), [author's page](https://colinbarrebrisebois.com/2011/03/07/gdc-2011-approximating-translucency-for-a-fast-cheap-and-convincing-subsurface-scattering-look/)) | Frostbite translucency: I = saturate(V·−⟨L + N·δ⟩)^p · s, with a thickness map ([Zucconi](https://www.alanzucconi.com/2017/08/30/fast-subsurface-scattering-1/)) | Distortion δ bends the backlight round the silhouette | – | Formula (no code to licence) |
| GPU Gems 1 ch. 16 (Green) | Book text ([NVIDIA](https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-16-real-time-approximations-subsurface-scattering)) | Wrap lighting `max(0,(N·L + w)/(1 + w))`; depth absorption `exp(−s·σt)` | – | – | Formula |
| Sounds | CC0: [Breviceps 458398](https://freesound.org/people/Breviceps/sounds/458398/) (0.353 s, 44.1 kHz), [Laumark 415125](https://freesound.org/people/Laumark/sounds/415125/) (0.461 s, 48 kHz, "leftover party balloons" cut with scissors). [Pixabay "Balloon Pop"](https://pixabay.com/sound-effects/film-special-effects-balloon-pop-36589/) is under the Pixabay licence, which is not on our list: skip | – | – | – | **Adopt** both CC0 files |

**Conclusion.** Physics and sound exist. A lit, translucent, stretch-aware,
UV-reactive balloon renderer does not, so it is **built** on the engine's
light list. Its formulas are ported from Filament (Apache-2.0) and GPU Gems.

---

## 2. Latex optics

### 2.1 Thickness: stretching thins the wall

- Latex is close to incompressible, so for an equal biaxial stretch λ the wall
  thins as **t = t₀/λ²** **(computed**, from volume conservation). Measured
  inflations follow this:
  - A large balloon went from radius 0.101 to 0.32 m (λ = 3.2) and from
    thickness 0.5 to 0.05 mm, a ratio of 0.10 against 1/λ² = 0.098
    ([Cambridge, ICSV19](https://www3.eng.cam.ac.uk/~hemh1/theses/papers/ICSV19_balloon_modes.pdf); ratio **computed**).
  - Rubber latex reaches a "limiting strain λ = 7.0 ± 0.5"
    ([Moulinet & Adda-Bedia](https://www.phys.ens.psl.eu/~foldingslidingstretchinglab/papers/moulinetPRL2015.pdf)).
- **The wall is not uniform.** A dipped party balloon measured 0.184 mm
  near the pole, falling to 0.143, 0.132 and 0.115 mm in 10 mm steps towards
  the equator. "Material concentration occurred at the pole region", and
  the equator thinned most, to about 0.38 of its start at peak inflation
  ([Garcia-Herrera et al., LAJSS](https://www.scielo.br/j/lajss/a/3mx4LPcdntsyFpFcvPgzxTM/?lang=en)).
- **The neck stays near its unstretched thickness.** It is the narrowest part
  and barely inflates. The Cambridge balloon's neck was stiff enough to
  measure on its own (49 N/m).
- So an 11" balloon starts at about 0.2 mm (0.18 mm above). At λ ≈ 3–4 its
  equator is about 12–22 µm **(computed)**. The pole is about 1.6× thicker
  than the equator (0.184/0.115) **(computed)**. The neck is roughly 10× thicker
  than the equator **(estimate**, λ² for λ ≈ 3).

### 2.2 Colour: lighter where stretched, darker at the neck and pole

- Colour is dye absorption, so transmitted colour follows Beer–Lambert:
  T(rgb) = exp(−σ(rgb)·t). Thinner means paler and more transparent. Thicker
  means darker and more saturated (Beer–Lambert as used for translucency in
  [GPU Gems ch. 16](https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-16-real-time-approximations-subsurface-scattering)).
- Trade sources confirm both directions:
  - Under-inflating "will change and often darken the tone of the balloon",
    and "the true colour of the balloon only shows when the balloon is fully
    inflated" ([balloons.online](https://balloons.online/know-how/colour-of-balloons-look-nothing-like-the-picture-online-/)).
  - A stretched region is "lighter in color", a compressed one darker
    ([BalloonHQ science FAQ](https://balloonhq.com/faq/science/)).
- **In photographs** (Commons, below) the thick pole shows as a **dark,
  saturated spot** ringed by concentric bands. Two examples:
  [green, CC BY-SA](https://commons.wikimedia.org/wiki/File:Ghostly_green_balloon_(3634760561).jpg)
  and [purple, CC BY-SA](https://commons.wikimedia.org/wiki/File:Back_lit_purple_balloon_(3635573018)_(2).jpg).
  Retracting torn edges, where the latex bunches up, read darker too
  ([orange](https://commons.wikimedia.org/wiki/File:Close_up_of_popped_orange_balloon_(3634760161).jpg)).
- **Model.** Pick the balloon's catalogue colour C at full inflation and set
  σ = −ln(C)/t_ref per channel, where t_ref is the equator thickness at full
  size **(computed**, by inverting Beer–Lambert). Under-inflation, the neck and the pole then
  darken by themselves, and over-inflation pales. This matches the trade
  sources above.

### 2.3 Specular sheen and highlight

- Natural rubber's refractive index is **1.5191** at 589 nm (1.5153 at 656 nm
  to 1.5363 at 436 nm) ([Wood & Tilton, NBS 1949](https://nvlpubs.nist.gov/nistpubs/jres/43/jresv43n1p57_A1b.pdf)).
  That gives **F0 = 0.042** **(computed**, ((n−1)/(n+1))²). The surface is a
  clean dielectric, so the highlights are uncoloured. Grazing Fresnel brightens
  the outline.
- The surface is smooth, so the highlight is a sharp, small image of each
  light: a window or softbox appears as its own shape (see the dart photos
  below, where each light shows as a crisp glint). Oxidation gives an aged
  balloon a "foggy" whitening ([BalloonHQ](https://balloonhq.com/faq/science/)),
  which is a rougher, matte look.
- **Finishes** ([Balloonacy](https://balloonacyonline.com/types-of-balloons/)):
  - Standard/fashion: "opaque and smooth looking". The pigment scatters.
  - Crystal/jewel: "much more transparent", with "deeper, richer colors".
    Pure absorption.
  - Pearl and metallic: "a bit of a shine", and opaque. The mica in them adds
    a broad, tinted second lobe **(estimate**, from the pearl-paint analogy).
  - Chrome: "almost mirror-like shine": a coloured metal.
- **Foil** balloons are "thin, unstretchable, less permeable metallised
  films such as Mylar (BoPET)" ([Wikipedia: Balloon](https://en.wikipedia.org/wiki/Balloon)).
  They render as an opaque mirror. They cannot stretch, so they do not thin
  or pale. They show wrinkles along the heat seam **(estimate**, from the
  material being inextensible).

### 2.4 Backlight and the bright rim

- **Backlit, a latex balloon glows through.** Light crosses the wall twice
  (back wall, then front wall), so it is tinted T². This is the warm, saturated glow in
  [Back_lit_purple_balloon](https://commons.wikimedia.org/wiki/File:Back_lit_purple_balloon_(3635573018)_(2).jpg)
  and the [orange close-up](https://commons.wikimedia.org/wiki/File:Close_up_of_popped_orange_balloon_(3634760161).jpg)
  (T² **computed** from two crossings).
- **The rim.** At the silhouette the line of sight grazes the film. The path
  length rises as 1/cos θ, so the transmitted light at the rim is darker and more saturated
  **(computed**, Beer–Lambert along the slant path). Two terms fight that:
  - Fresnel reflection, which rises towards 1 at grazing incidence (§2.3). It
    gives a bright reflected rim when a light or a bright wall is beside or
    behind the balloon.
  - Forward scattering through the film when the light sits behind the
    balloon: the bright halo that the Frostbite distortion term bends around
    the silhouette ([Zucconi](https://www.alanzucconi.com/2017/08/30/fast-subsurface-scattering-1/)).
- **Our scene's main backlight is the page itself.** The photographs, lit by
  the cursor lamp, sit behind every balloon. So the transmitted term is just
  a sample of the already-lit page behind the balloon × T², with the sample
  offset slightly for refraction **(estimate**: the film is thin and
  parallel-sided, so the offset is small). Our pipeline already renders that
  page, so this is cheap.

### 2.5 Subsurface-scattering approximations (real time)

| Technique | Formula | Use here |
|---|---|---|
| Wrap diffuse ([GPU Gems 16](https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-16-real-time-approximations-subsurface-scattering)) | max(0, (N·L + w)/(1 + w)) | Opaque fashion latex: lets the lamp wrap round the terminator |
| Frostbite translucency ([GDC 2011](https://gdcvault.com/play/1014537/Approximating-Translucency-for-a-Fast), via [Zucconi](https://www.alanzucconi.com/2017/08/30/fast-subsurface-scattering-1/)) | saturate(V·−normalize(L + N·δ))^p · s · (1 − thickness) | A light behind the balloon |
| Filament subsurface ([source](https://github.com/google/filament/blob/main/shaders/src/surface_shading_model_subsurface.fs), Apache-2.0) | forward = exp2(VoL·p − p) (a spherical-Gaussian `pow`); back = saturate(NoL·th + 1 − th)·0.5; subsurface = mix(back, 1, forward)·(1 − th) | **Port**: the same idea with a cheaper `pow` |
| Lit-sphere "inverted Fresnel" (WoW) | pow(saturate(N·V), k) for an inner glow ([Simon Schreibt](https://simonschreibt.de/gat/world-of-warcraft-balloon/)) | Art fallback only. It ignores where the lights are |

### 2.6 Reference photographs

All on Wikimedia Commons. Licences per file page.

| Photo | Shows |
|---|---|
| [Yellow balloon (3634757803)](https://commons.wikimedia.org/wiki/File:Yellow_balloon_(3634757803).jpg), Stephen Edmonds, CC BY-SA 2.0, sound-triggered | Dart pop: the skin peels back from the hole as one sheet while the air still holds a ball shape. Lit translucent latex, sharp highlight |
| [Back lit purple balloon](https://commons.wikimedia.org/wiki/File:Back_lit_purple_balloon_(3635573018)_(2).jpg) | Backlit glow through the film; dark thick pole; talc/dust cloud released |
| [Ghostly green balloon](https://commons.wikimedia.org/wiki/File:Ghostly_green_balloon_(3634760561).jpg) | Double exposure of a tear; pole rings; lighter inner face |
| [Purple balloon (3634762837)](https://commons.wikimedia.org/wiki/File:Purple_balloon_(3634762837).jpg) | Single slit opening into a crescent; rim highlight |
| [White balloon, with a pinch of flour](https://commons.wikimedia.org/wiki/File:White_balloon,_with_a_pinch_of_flour_(3635571198).jpg) | The air "ghost": the flour shows the gas still balloon-shaped after the skin has gone |
| [Close up of popped orange balloon](https://commons.wikimedia.org/wiki/File:Close_up_of_popped_orange_balloon_(3634760161).jpg) | Backlit saturated orange; darker rolled tear edge |
| [Balloon, looks like an octopus](https://commons.wikimedia.org/wiki/File:Balloon,_looks_like_an_octopus_or_squid_2014-01-08_12-59.jpg) | Many-finger remnant of a high-stress burst (a released balloon). Strips curl into ringlets |
| [Category: Popped balloons](https://commons.wikimedia.org/wiki/Category:Popped_balloons) | More stills and two webm pop videos (`Balloon_skewer.webm`, `Balloon_popping_by_toluene.webm`) |
| [Unsplash: balloons fill a window at night](https://unsplash.com/photos/balloons-fill-a-window-at-night-xqQfEw_ui_8), [lighted balloon on a window sill](https://unsplash.com/photos/a-lighted-balloon-in-the-dark-on-a-window-sill-VUyrUF92z0E) | Backlit groups (not viewed: the page blocked the scraper; titles only) |

---

## 3. Motion

### 3.1 Numbers for an 11" latex balloon

| Quantity | Value | Source / working |
|---|---|---|
| Volume | 11.42 L | [Omni](https://www.omnicalculator.com/everyday-life/helium-balloons) |
| Diameter, frontal area | 0.279 m, 0.0613 m² | **computed** from V |
| Latex mass | ≈ 3 g | [BalloonHQ release study](https://balloonhq.com/faq/deco_releases/release_study/) |
| Helium lift | 1.0715 g/L ("roughly 1 g per litre") | [Omni](https://www.omnicalculator.com/everyday-life/helium-balloons) |
| Air density, 20 °C | 1.2041 kg/m³ | [Wikipedia](https://en.wikipedia.org/wiki/Density_of_air) |
| Helium density | 0.1786 g/L at STP → 0.166 g/L at 20 °C | [Wikipedia](https://en.wikipedia.org/wiki/Helium); 20 °C **computed** |
| Free lift | 8.9 g **(computed**: 13.75 g air − 1.90 g He − 3 g latex); quoted as 0.35 oz ≈ 9.9 g ([Qualatex chart](https://www.balloonguy.com.au/wp-content/uploads/2013/06/heliumchart.pdf)) and 11 g ([BalloonHQ](https://balloonhq.com/faq/deco_releases/release_study/)) | use **9 g** |
| Added mass | ½ × displaced air = 6.9 g | sphere coefficient 0.5 ([Wikipedia: Added mass](https://en.wikipedia.org/wiki/Added_mass)) |
| Inertial mass | 11.8 g (latex + helium + added mass) | **computed** |
| Drag coefficient | Cd = 0.50 (measured, 20 cm party balloon) | [Cross, "Aerodynamics of a party balloon"](https://www.physics.usyd.edu.au/~cross/PUBLICATIONS/37.%20partyballoonB.pdf) |
| Helium: rise from rest | a₀ = 7.4 m/s², v_t = 2.2 m/s, τ = v_t/a₀ = 0.29 s | **computed** (F = 0.087 N) |
| Helium: released ascent, quoted | 3.36 ft/s ≈ 1.0 m/s | [BalloonHQ](https://balloonhq.com/faq/deco_releases/release_study/). Lower than the computed value. Keep v_t as a lab control |
| Air-filled: fall | apparent weight is latex plus the over-pressure air (0.2–0.5 g at 1.3–4 kPa) → a₀ ≈ 1.3–1.4 m/s², v_t ≈ 1.3 m/s | **computed**, pressures from [Cambridge](https://www3.eng.cam.ac.uk/~hemh1/theses/papers/ICSV19_balloon_modes.pdf) and [Ross](https://iiav.org/ijav/content/volumes/24_2019_1848881553860721/vol_4/1433_fullpaper_877141577705877.pdf) |
| Air-filled, measured | 20 cm balloon: Cd 0.50, v_t 1.95 m/s (with a 2.1 g nut), a₀ 3.8 m/s². Without the nut it "tended to rotate and to veer off to one side" (Magnus, C_L ≈ 0.1 at 4 rev/s) | [Cross](https://www.physics.usyd.edu.au/~cross/PUBLICATIONS/37.%20partyballoonB.pdf) |
| Float time | 11" latex 18–24 h; 11" pearl/metallic 16–18 h | [Qualatex chart](https://www.balloonguy.com.au/wp-content/uploads/2013/06/heliumchart.pdf) |
| Float time, foil | "several weeks" (latex leaks through pores "larger than the helium atoms") | [Wikipedia: Balloon](https://en.wikipedia.org/wiki/Balloon) |
| Sizes for randomisation | 9", 11", 12", 16", 18" latex; 36" foil | [Creative Balloons chart](https://creativeballoonsmanufacturing.com/pages/helium-balloon-weight-chart); lift scales with volume (∝ D³) |

### 3.2 Drag, drift and bobbing

- **Drag is quadratic,** F = ½ρ·Cd·A·v² ([Cross](https://www.physics.usyd.edu.au/~cross/PUBLICATIONS/37.%20partyballoonB.pdf)).
  Rapier's `linearDamping` is linear in v, so apply the quadratic force
  ourselves each step (`resetForces` then `addForce`; typings
  `rigid_body.d.ts:469, 482`).
- **Added mass** makes a balloon sluggish to start and stop. Model it with
  `setAdditionalMass(0.5·ρ·V)` and apply buoyancy as a force, not through
  gravity scale. Otherwise the added mass would also feel gravity
  **(computed** from the force balance).
- **Air currents** indoors are about 0.1 m/s, felt as a draught from
  0.1–0.15 m/s ([Designing Buildings](https://www.designingbuildings.co.uk/wiki/Indoor_air_velocity)).
  At 0.1 m/s the drag on an 11" balloon is 1.8×10⁻⁴ N, about 0.2% of its lift
  **(computed)**. So currents push balloons sideways (they wander along the
  ceiling) but barely move them vertically.
- A bob is the balloon answering a small push, heavily damped. Drive the
  drift with smooth noise at 0.05–0.15 m/s **(estimate**, inside the range
  above). The cursor's motion adds a wake: a velocity field near the pointer
  **(estimate)**.
- **Tethered sway** behaves as an inverted pendulum.
  - Undamped, g_eff = F/m = 7.4 m/s². That gives T = 2.3 s for a 1 m string
    and 2.8 s for 1.5 m **(computed)**.
  - A measured birthday balloon on a string under 2 m took about **7 s** per
    swing, and the author concluded "the normal pendulum equation does not
    apply" because of air drag and added mass
    ([Wigton Physics](http://wigtonphysics.blogspot.com/2016/11/birthday-balloon-pendulum.html)).
  - Test: our sim, with quadratic drag and added mass, should land near the
    measured 7 s, not the undamped 2.8 s.
- **A tethered balloon's lowest mode** measured 0.63 Hz, for a large 0.64 m
  balloon ([Cambridge](https://www3.eng.cam.ac.uk/~hemh1/theses/papers/ICSV19_balloon_modes.pdf)).
  That is the order of the "bob" frequency to expect.
- The **latex shell itself** vibrates far faster (55–185 Hz modes, same
  source), too fast to see. A squash only shows on impact.

### 3.3 The string

- **Curling ribbon** weighs about 0.5 g per 26 inches, so **0.76 g/m**
  ([Cockeyed](https://cockeyed.com/science/helium/helium.shtml); per metre
  **computed**). The ribbon is "just under half a centimetre" (3/16") wide
  ([ScienceBlogs](https://scienceblogs.com/principles/2011/08/17/the-physics-of-a-sad-balloon)).
- A balloon with 9 g of lift can hold up about 12 m of ribbon **(computed)**,
  so on our scale a fresh balloon carries its whole string. An old,
  leaking balloon sinks until the ribbon on the floor balances its lift. That
  is the "sad balloon" equilibrium
  ([ScienceBlogs](https://scienceblogs.com/principles/2011/08/17/the-physics-of-a-sad-balloon)).
  It is a nice "aged" state for the lab.
- **Simulation:**
  - A chain of 10–16 small bodies joined by `JointData.rope` (max distance,
    inelastic, goes slack) ([rope_joint.rs](https://github.com/dimforge/rapier/blob/master/src/dynamics/joint/rope_joint.rs)).
  - The top link is rope-jointed to the balloon's knot anchor.
  - Each link gets mass 0.76 g/m × segment length, normal gravity, and a
    small drag.
  - Or one `SoftBodyDesc.rope(start, end, n)` with
    `attachParticle(0, balloonBody)`, if the soft-body spike passes.
  - Render it as a ribbon strip with a slight helical curl and its own
    specular.
- **Grabbing the string** pins the end particle (`setParticleKinematicTarget`)
  or makes the end link kinematic.

### 3.4 Bumping into each other

- Collisions are ball–ball contacts. No measured restitution for inflated
  latex balloons was found. Use **e ≈ 0.5–0.7** and high friction
  **μ ≈ 0.8**, for latex rubbing on latex **(estimate**; xrblocks uses 0.85
  ([BalloonPop.js](https://github.com/google/xrblocks/blob/main/samples/advanced/balloonpop/BalloonPop.js))).
- The visible squash on contact is the reason to try the soft `disk`
  upgrade. With rigid balls, fake it in the shader: flatten along the
  contact normal by the contact impulse, over about 60 ms **(estimate)**.
- Friction plus rotation makes balloons roll against each other and against
  the ceiling. The knot side hangs down because the knot and string are the
  heavy end, so the balloon rights itself. Model this with the centre of mass
  offset towards the knot **(estimate)**.

---

## 4. Popping

### 4.1 How latex tears (Moulinet & Adda-Bedia, PRL 115, 184301, 2015)

Sources: [PDF](https://www.phys.ens.psl.eu/~foldingslidingstretchinglab/papers/moulinetPRL2015.pdf),
[ADS](https://ui.adsabs.harvard.edu/abs/2015PhRvL.115r4301M/abstract),
[APS Physics](https://physics.aps.org/articles/v8/105),
[Physics World](https://physicsworld.com/a/balloon-bursts-approach-the-speed-of-sound/).

- **Two regimes.**
  - At low stress the puncture opens as "a single slit", giving "2 or 3
    final cracks".
  - Above a critical stress (tension/thickness) of about **1.8 MPa**, the
    crack "would suddenly split into two cracks that move off at angles to
    create a 'Y' shape". This repeats until the balloon is "a number of
    finger-like pieces" ([Physics World](https://physicsworld.com/a/balloon-bursts-approach-the-speed-of-sound/)).
  - The pattern is a "treelike structure with junctions of Y shape", and the
    pieces are "elongated shreds" (PDF).
- **Crack speed** rises with stress up to a limit of **570 ± 15 m/s**. That
  is above the shear-wave speed and bounded by the longitudinal wave speed
  (PDF). They filmed at 30,000–60,000 fps, and branching shows within 67 µs.
- "The higher the stress, the more elastic energy is stored … the more
  numerous the fractures" ([APS Physics](https://physics.aps.org/articles/v8/105)).
- **Where a normal party balloon sits.**
  - Wall tension T = P·r/2. With P = 4 kPa ([Ross](https://iiav.org/ijav/content/volumes/24_2019_1848881553860721/vol_4/1433_fullpaper_877141577705877.pdf))
    and r = 0.14 m, T = 280 N/m.
  - Over an unstretched thickness of 0.15–0.25 mm, T/e = 1.1–1.9 MPa
    **(computed**; that the paper's ratio uses the unstretched thickness is
    an assumption).
  - So an ordinary balloon is close to the threshold: popped with a pin it
    mostly slits; inflated tight it shreds.
  - This matches the Commons dart photos (slits) and the octopus remnant
    (fingers).

### 4.2 Timing

| Event | Time | Source |
|---|---|---|
| Crack across half the circumference (0.44 m) at 570 m/s | **0.8 ms** | **computed** |
| Skin retraction at ≈ 100 m/s ("the latex does not move faster than the speed of sound") over the same distance | **≈ 4.4 ms** | speed from [Ross](https://iiav.org/ijav/content/volumes/24_2019_1848881553860721/vol_4/1433_fullpaper_877141577705877.pdf); time **computed** |
| Main sound burst | builds in < 10 ms | Ross |
| One frame at 60 Hz | 16.7 ms | – |

So, in real time:

- **frame 0** is the intact balloon (plus the dart or pin);
- **frame 1** is the torn skin mid-retraction, which reads as a smear, with
  the air ghost (flour photo) and a puff of talc/dust (purple and white photos);
- **frames 2+** are the shreds and knot flying, then fluttering down.

A **slow-motion** lab control (×1/100 to ×1/1000) shows the tear itself.

### 4.3 What the shreds look like

- **Low stress (default).** One or two large sheets stay joined at the knot
  and peel back like petals from the hole
  ([yellow](https://commons.wikimedia.org/wiki/File:Yellow_balloon_(3634757803).jpg),
  [purple](https://commons.wikimedia.org/wiki/File:Purple_balloon_(3634762837).jpg)).
  The tear edges curl and darken, and the inner face shows paler.
- **High stress.** The skin goes into many elongated fingers that coil into
  ringlets as they relax
  ([octopus remnant](https://commons.wikimedia.org/wiki/File:Balloon,_looks_like_an_octopus_or_squid_2014-01-08_12-59.jpg)).
- **After the pop.** The fragments are light, thin strips. They slow within
  tens of ms and flutter down, while the knot and string fall faster
  **(estimate**, from area-to-mass ratio). The ribbon falls as a rope.
- **Generating the tear.** Grow a Y-branching crack tree from the click
  point.
  - Branch count follows a stress parameter derived from the balloon's
    inflation (T/e against 1.8 MPa).
  - Branch angle about 30° each side of the parent **(estimate**, from the
    Y junctions; no angle stated).
  - The skin regions between cracks become strips. Each strip is a polyline
    particle (or a small Rapier `rope`/`polyline` soft body if the spike
    passes) with velocity away from the crack. A real cut is
    `World.cutSoftBody(body, blade)`, which "duplicates particles along the
    tear" ([Rapier docs](https://rapier.rs/docs/user_guides/javascript/soft_bodies)).
  - Our `optics/crack-net.ts` already grows crack networks for glass, so
    reuse its branching code **(estimate**, to check against the code).

### 4.4 Air-filled vs helium, and other pops

- A helium balloon's pop "sounds" weaker. R-134a balloons were ~12 dB louder
  than helium in the same round balloon, with loudness following stored gas
  energy ([Ross](https://iiav.org/ijav/content/volumes/24_2019_1848881553860721/vol_4/1433_fullpaper_877141577705877.pdf)).
- Foil balloons do not pop in the latex way. They split along a seam and
  deflate **(estimate**; no source found). Clicking one should puncture it:
  hiss and sag, not pop.

### 4.5 Sound

- **Mechanism.** The bang is the "vibration of the balloon surface at its
  natural frequency initiated by the rupture", like a drum. The spectral
  peak sits at **3.1–3.4 kHz** whatever the shape or gas
  ([Ross](https://iiav.org/ijav/content/volumes/24_2019_1848881553860721/vol_4/1433_fullpaper_877141577705877.pdf)).
- **Pulse.** An "N shaped waveform of a very rapid rise" with a 1–4 ms
  period. Peaks of 132–143 dB at 0.5 m
  ([Applied Acoustics 2025](https://www.sciencedirect.com/science/article/pii/S0003682X25000404)).
  A 9" balloon inflated to rupture at the microphone reached 168 dB
  ([Hearing Review](https://hearingreview.com/inside-hearing/research/know-loud-balloons-can)).
  Normalise our sample far below this.
- **Files.**
  - CC0 [Breviceps 458398](https://freesound.org/people/Breviceps/sounds/458398/).
  - CC0 [Laumark 415125](https://freesound.org/people/Laumark/sounds/415125/).
  - Or synthesise: 150 ms noise → band-pass 3 kHz, Q 1.2 → 2 ms attack,
    exponential decay to 120 ms ([xrblocks audio.js](https://github.com/google/xrblocks/blob/main/samples/advanced/balloonpop/audio.js),
    Apache-2.0). Vary the centre by ±10% per balloon **(estimate)**, and drop
    it by about 12 dB for helium (Ross).

---

## 5. Under a black light

- **Neon (UV-reactive) latex glows.** Ranges sold as UV-reactive come in
  five colours:
  - DirectGlow: "blue, green, yellow, orange, and magenta"
    ([DirectGlow](https://directglow.com/collections/blacklight-balloons));
  - Sempertex Neon: Blue, Green, Yellow, Orange, Magenta, "UV-reactive &
    glows under black light"
    ([Balloons2Go](https://www.balloons2go.net/products/sempertex-neon-latex-balloons));
  - Gemar and Sempertex neons are both stocked as black-light balloons
    ([Bargain Balloons](https://support.bargainballoons.com/support/solutions/articles/27000069257-what-is-a-black-light-or-glow-in-the-dark-latex-balloon-)).
- **Not every neon is equal.** A balloon entertainer who tested a neon range
  for a UV show: "3 of the colours glowed under uv and a 4th glowed if you
  double stuff them" ([Balloon Chat, 2011](https://www.balloonchat.co.uk/balloon-chit-chat/neon-balloons-and-black-light/)).
- **Glow follows thickness.** Doubling the wall doubles the dye in the light
  path, which supports our model of emission ∝ dye per area ∝ t. So a
  stretched neon balloon glows **dimmer at the equator and brightest at the
  neck and pole** **(computed**, from t = t₀/λ² and the anecdote).
- **Colours and order.** Use the R1 tokens
  ([uv-blacklight.md §A–B](uv-blacklight.md)) and their emission order:
  - yellow-green 1.0 ≥ orange/pink 0.9 > blue 0.5, with pure green possibly
    ~0.7;
  - the rhodamine reds and pinks, coumarin blue and ~510–520 nm greens are
    the same day-glo dye families
    ([Heritage Science 2022](https://www.nature.com/articles/s40494-022-00812-4)).
- **Plain latex.**
  - No measured fluorescence of natural rubber latex was found
    (**unknown**).
  - Shops say the glow is in the neon colouring: "Balloons will not glow
    without blacklight", and no claim is made for plain clear latex
    ([DirectGlow](https://directglow.com/collections/blacklight-balloons)).
  - One balloon artist says "ordinary white will also glow"
    ([Balloon Chat](https://www.balloonchat.co.uk/balloon-chit-chat/neon-balloons-and-black-light/)).
    That fits an optical brightener (R1's `obaGlow`). It conflicts with
    titanium white, which "absorbs UV strongly, appearing dark"
    ([Conservation Wiki](https://conservation-wiki.com/wiki/Ultraviolet_radiation_imaging),
    via [uv-blacklight.md §2](uv-blacklight.md)).
  - **Decision:** standard colours are lit only by the lamp's violet leak
    (`leak365`/`leak395`). White gets a "brightened white" flag, defaulting to
    a weak `obaGlow` at 0.3 **(estimate)**.
- **Foil** is metal: no fluorescence. It mirrors the lamp's violet leak and
  any glowing balloons near it **(estimate**, from metal being a mirror).
- **Photographed UV glow clips to pastel cores** ("most paint colors
  initially photographed as white",
  [PAM Photography](https://pamphotography.blog/2021/11/04/blacklight-uva-portrait-photography-tips-for-beginners/),
  via R1). Reuse R1's core, body and halo tokens per neon colour.

---

## 6. Decisions

### Adopt / port / build

| Part | Decision | Rests on |
|---|---|---|
| Rigid balloon bodies, string, collisions | **Adopt** Rapier 2D: a ball collider per balloon plus a chain of `JointData.rope` | R0; Rapier typings 0.21.0; [rope_joint.rs](https://github.com/dimforge/rapier/blob/master/src/dynamics/joint/rope_joint.rs) |
| Air model (buoyancy, quadratic drag, added mass, drift) | **Build** about 40 lines of forces each step (§3.2) **(estimate)** | [Cross](https://www.physics.usyd.edu.au/~cross/PUBLICATIONS/37.%20partyballoonB.pdf), [Added mass](https://en.wikipedia.org/wiki/Added_mass) |
| Squash on contact | Shader fake now; **upgrade** to Rapier `disk` + `volumeFactor` after the R0 spike; **fallback port** Matyka (BSD Processing port) | [Rapier soft bodies](https://rapier.rs/docs/user_guides/javascript/soft_bodies), [Matyka](http://panoramx.ift.uni.wroc.pl/~maq/soft2d/howtosoftbody.html) |
| Latex shader | **Build** on `LIGHTS_GLSL`; **port** the Filament scatter term (Apache-2.0) | §2 |
| Pop | **Build**: a crack tree (reuse `crack-net` branching) → strips in the §4 particle pool or as Rapier polylines | Moulinet & Adda-Bedia; tools-survey §4 |
| Sound | **Adopt** the CC0 Freesound files; **port** the xrblocks synth as a no-download fallback | §4.5 |

### The balloon shader (one quad per balloon, in viewport CSS px)

1. **Shape.** An analytic teardrop: a circle of radius R, stretched 1.1–1.2×
   along the axis, with a narrowing towards the knot. A small knot cap goes
   at the bottom **(estimate**, from photos).
   - The normal comes from a sphere-like height field: N = (p/R, √(1 − |p/R|²)).
   - Its depth z gives the 3D point used against `uLightPos[i]`.
2. **Thickness map.** t(u) = t_eq·f(u), where u runs from 0 at the pole to 1
   at the neck:
   - 1.6× at the pole spot (Garcia-Herrera ratio, computed);
   - 1× over most of the body;
   - rising to about 10× at the neck (estimate).
   - Multiply by 1/inflation² so an under-inflated balloon thickens (§2.1).
3. **Per light i** (loop to `uLightCount`):
   - **Specular:** GGX with F0 0.042, Schlick Fresnel, roughness 0.08–0.15
     (age raises it, "foggy" oxidation) **(estimate)**. Use `beamFactor` and
     `nearestOnLight` as the other passes do.
   - **Diffuse:**
     - fashion (opaque) latex: wrap-lit albedo C, with w ≈ 0.3 **(estimate)**;
     - crystal latex: no diffuse.
   - **Transmission from a light behind** the balloon's z: the Filament term
     with thickness = 1 − T_avg and subsurfacePower p ≈ 8–12 **(estimate)**,
     tinted T².
   - **UV:** emission = `uLightUv[i]` × irradiance × dye(colour) × t/t_eq,
     using R1's tokens and strengths.
4. **Backlight from the page.**
   - Sample the lit page texture behind the pixel, offset by a refraction
     shift along N of at most 2 px **(estimate)**, and multiply by
     T(rgb)^(2/cosθ) along the slant path.
   - Opaque latex blends it down by its scattering albedo.
5. **Rim.** No separate term: the Fresnel rise plus the slant-path darkening
   produce it (§2.4).
6. **Finishes.**
   - Pearl/metallic add a broad lobe (roughness 0.4) tinted by C.
   - Chrome: F0 = C, roughness 0.05.
   - Foil: F0 0.9 tinted, a seam-wrinkle normal noise near the outline,
     and no transmission.
7. **Shadow.** Each balloon draws into the R6 caster layers with RGB
   transmission T² (crystal) or near 0 (fashion and foil), at its height
   ([shadows.md §6](shadows.md)). So a red crystal balloon throws a red-tinted
   shadow on the photographs.

### Numbers to use

- **Sizes:** 9", 11", 12", 16" and 18" latex, weighted towards 11"; 18" and 36"
  foil (§3.1). Scale is about **500–700 px/m**, so an 11" balloon is 140–195 px
  **(estimate**; a lab control).
- **Helium 11":** lift 9 g, latex 3 g, helium 1.9 g, added mass 6.9 g,
  Cd 0.5, v_t ≈ 2.2 m/s (computed; 1.0 m/s quoted). Lift ∝ D³ and area ∝ D².
- **Air 11":** weight 3.3–3.5 g, v_t ≈ 1.3 m/s (computed); measured 1.95 m/s
  with a small nut (Cross).
- **String:** 0.76 g/m, 0.5 cm wide, 0.5–1.5 m long; 12 rope links.
- **Drift:** air speed noise 0.05–0.15 m/s.
- **Contact:** e 0.6, μ 0.8 (estimates).
- **Optics:** n 1.519, F0 0.042; t_eq 12–22 µm (only its ratio matters);
  pole ×1.6, neck ×10.
- **Pop:**
  - stress S = T/e from inflation;
  - S < 1.8 MPa: 1–3 cracks; above it, branch until the strips are about
    R/4 wide (estimate);
  - skin speed 100 m/s, crack 570 m/s;
  - whole pop under 5 ms, so 1 frame at 1×.
- **Sound:** peak 3.1–3.4 kHz; −12 dB for helium.
- **Colours:** catalogue colours as C at full inflation. Neon set: blue,
  green, yellow, orange, magenta (R1 tokens). Randomise hue within each
  family, not over the full HSL wheel. Real ranges are discrete
  ([Qualatex colour library](https://us.qualatex.com/en-us/inspiration/paint-your-party-qualatex/)).

### Lab controls

- **Fill:** helium / air; **inflation** 0.7–1.15 (drives thickness, colour,
  lift and pop stress); **age** (leak: lift falls, roughness rises, "sad
  balloon" sinking).
- **Finish:** fashion / crystal / pearl / metallic / chrome / foil / neon.
- **Size** and **count**; **string length**; **string on/off**.
- **Air:** drift speed, drag Cd, added-mass on/off (to show why it matters).
- **Optics:** roughness, wrap w, scatter power p, refraction shift,
  page-backlight on/off, thickness-map strength.
- **Pop:** stress override, branch angle, **time scale** (1, 1/10, 1/100,
  1/1000), sound on/off, sample / synth.
- **UV:** white brightener strength; neon emission scale.
- **Debug views:** the thickness map, T², per-light terms, and the crack tree.

### Tests

1. **Buoyancy.** An 11" helium balloon released at rest reaches 95% of v_t
   within 3τ ≈ 0.9 s, and v_t = √(2F/(ρ·Cd·A)) ± 3%.
2. **Air balloon.** Falls at v_t ≈ 1.3 m/s (computed case), not at g.
3. **Tethered sway.** With L = 1.5 m and a 20° release, the swing period is
   measured; the target is ~7 s (Wigton) and it must stay above the
   undamped 2.8 s. This is a tuning check, not a hard pass.
4. **String lift.** A balloon with lift F and ribbon λ rests with
   F/(λg) metres of ribbon off the floor, ±5%.
5. **Thickness.** inflation × 0.8 gives T_equator darker by exp(−σ·t·(1/0.64 − 1)) per channel.
6. **UV.** Under a pure UV light (uv 1, no visible light), a neon balloon's
   neck is brighter than its equator, and a standard red balloon is ≈ the
   leak colour.
7. **Pop timing.** At time scale 1, frame +1 after the click has no intact
   skin left.
8. **Pop regime.** Stress below the threshold gives ≤ 3 crack tips. At 1.5×
   the threshold, ≥ 8 strips.
9. **All lights.** Lamp, flash, flare and black light each change the
   balloon's pixels in the expected term (specular, transmission, UV).

### Still unknown

- **Rapier soft-body cost and stability** for a `disk` balloon (the R0
  spike).
- **Whether natural latex fluoresces at all** under 365/395 nm. No
  measurement was found. Check a real balloon under a black light.
- **Measured restitution and friction** for latex on latex.
- **The slit-vs-shred split for real party balloons** popped by a pin.
  Moulinet's threshold is for flat membranes, and mapping it to a whole
  balloon rests on the computed T/e above.
- **The released-balloon ascent rate:** 1.0 m/s quoted vs 2.2 m/s computed.
  Film a balloon to settle it.
- **Exact neck thickness ratio:** measure, or estimate from a deflated
  balloon.
- **Foil puncture behaviour** (hiss and sag): no source found.

---

## 7. Shape, measured (2026-10-01)

Ony: the balloons were "weirdly shaped" with "half bulges on the side". The
first cut drew a circle stretched 1.15x and pinched toward the knot by a
smoothstep that only started below the middle, so the outline had a
shoulder on each side where the pinch began, and its normals came from the
unpinched circle.

### 7.1 The profile

Measured from a product photograph of a standard 11-inch round latex
balloon, side on against white ([Michaels, "11" Standard Latex Balloon,
Apple Red"](https://www.michaels.com/product/11-standard-latex-balloon-M20041041);
used only to measure the silhouette, not shipped): the red pixels thresholded
row by row, half-width against height, both over the width W.

- Crown to neck: **1.30 W**. Widest **41.5%** of the way down from the
  crown.
- Below the widest point the outline is close to a straight cone to the
  neck; above it, a round crown.
- Knot: 0.097 W long below the neck, 0.08 W wide.
- A 5-inch balloon from the same maker is rounder (1.02 W tall), as small
  balloons are; the site's sizes are 9-16 inch, so the 11-inch profile is
  used for all of them **(estimate)**.

Fitted as rho(u) = A sqrt(u) (1 - u)^P (1 + B u + C u^2), u = 0 at the crown
and 1 at the neck: A 2.2014, P 0.8848, B 0.2846, C 0.0803; rms error 0.6%
of the half-width, 5% only in the last pixels at the neck
(`src/effects/balloons/shape.ts`, tested against the measured table).

### 7.2 What changed

- The balloon is drawn as a surface of revolution of that profile,
  x^2 + z^2 = rho(y)^2, with its own normal (x, -rho rho', z), turned with
  the balloon (the first cut never turned its normals, so a tilted
  balloon's light lay as if it were upright).
- Drawn at the device's pixels (capped 2x); the edge is antialiased over
  one device pixel measured square to the outline.
- The shadow it throws uses the same outline; the pop hit test too.
- Physics: the crown sits 1.08 radii above the widest point and the cone
  reaches 1.52 below, so the body is a ball at -0.08 r plus a massless ball
  of 0.55 r at 0.9 r; buoyancy acts at the volume's centroid, 0.079 r
  below the widest point (computed from the profile); the ribbon is tied at
  the bottom of the knot.
- Latex is satin: the room it reflects is blurred over about 0.25 rad
  before sampling, and the rim uses the Fresnel term with roughness
  (Lagarde), which removed the saturated outline round every balloon.
- The volume of this shape is 1.18 times the sphere of the same width
  (computed); the free lift was already set from the helium chart's real
  balloons, so it is unchanged.

## Sources

Physics and fracture:
[Moulinet & Adda-Bedia 2015 (PDF)](https://www.phys.ens.psl.eu/~foldingslidingstretchinglab/papers/moulinetPRL2015.pdf) ·
[ADS](https://ui.adsabs.harvard.edu/abs/2015PhRvL.115r4301M/abstract) ·
[APS Physics: Two modes of balloon bursting](https://physics.aps.org/articles/v8/105) ·
[Physics World](https://physicsworld.com/a/balloon-bursts-approach-the-speed-of-sound/) ·
[Ross, Why balloons make a loud noise (IJAV 2019)](https://iiav.org/ijav/content/volumes/24_2019_1848881553860721/vol_4/1433_fullpaper_877141577705877.pdf) ·
[Cross, Aerodynamics of a party balloon](https://www.physics.usyd.edu.au/~cross/PUBLICATIONS/37.%20partyballoonB.pdf) ·
[Cambridge, Modes of a tethered spherical balloon (ICSV19)](https://www3.eng.cam.ac.uk/~hemh1/theses/papers/ICSV19_balloon_modes.pdf) ·
[Garcia-Herrera et al., inflation of latex balloons (LAJSS)](https://www.scielo.br/j/lajss/a/3mx4LPcdntsyFpFcvPgzxTM/?lang=en) ·
[Wigton Physics, balloon pendulum](http://wigtonphysics.blogspot.com/2016/11/birthday-balloon-pendulum.html) ·
[Added mass](https://en.wikipedia.org/wiki/Added_mass) ·
[Density of air](https://en.wikipedia.org/wiki/Density_of_air) ·
[Helium](https://en.wikipedia.org/wiki/Helium) ·
[Indoor air velocity](https://www.designingbuildings.co.uk/wiki/Indoor_air_velocity)

Balloons (trade):
[Omni helium calculator](https://www.omnicalculator.com/everyday-life/helium-balloons) ·
[Qualatex helium chart](https://www.balloonguy.com.au/wp-content/uploads/2013/06/heliumchart.pdf) ·
[BalloonHQ release study](https://balloonhq.com/faq/deco_releases/release_study/) ·
[BalloonHQ science FAQ](https://balloonhq.com/faq/science/) ·
[balloons.online colour](https://balloons.online/know-how/colour-of-balloons-look-nothing-like-the-picture-online-/) ·
[Balloonacy finishes](https://balloonacyonline.com/types-of-balloons/) ·
[Creative Balloons weight chart](https://creativeballoonsmanufacturing.com/pages/helium-balloon-weight-chart) ·
[Wikipedia: Balloon](https://en.wikipedia.org/wiki/Balloon) ·
[Cockeyed: helium lift](https://cockeyed.com/science/helium/helium.shtml) ·
[ScienceBlogs: sad balloon](https://scienceblogs.com/principles/2011/08/17/the-physics-of-a-sad-balloon)

Optics and rendering:
[Wood & Tilton 1949, n of rubber](https://nvlpubs.nist.gov/nistpubs/jres/43/jresv43n1p57_A1b.pdf) ·
[GPU Gems ch. 16](https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-16-real-time-approximations-subsurface-scattering) ·
[GDC 2011 translucency](https://gdcvault.com/play/1014537/Approximating-Translucency-for-a-Fast) ·
[Zucconi fast SSS](https://www.alanzucconi.com/2017/08/30/fast-subsurface-scattering-1/) ·
[Filament subsurface model](https://github.com/google/filament/blob/main/shaders/src/surface_shading_model_subsurface.fs) ·
[Simon Schreibt, WoW balloon](https://simonschreibt.de/gat/world-of-warcraft-balloon/)

UV:
[DirectGlow](https://directglow.com/collections/blacklight-balloons) ·
[Balloons2Go Sempertex neon](https://www.balloons2go.net/products/sempertex-neon-latex-balloons) ·
[Bargain Balloons](https://support.bargainballoons.com/support/solutions/articles/27000069257-what-is-a-black-light-or-glow-in-the-dark-latex-balloon-) ·
[Balloon Chat thread](https://www.balloonchat.co.uk/balloon-chit-chat/neon-balloons-and-black-light/) ·
[uv-blacklight.md](uv-blacklight.md)

Sound:
[Freesound 458398 (CC0)](https://freesound.org/people/Breviceps/sounds/458398/) ·
[Freesound 415125 (CC0)](https://freesound.org/people/Laumark/sounds/415125/) ·
[Applied Acoustics 2025](https://www.sciencedirect.com/science/article/pii/S0003682X25000404) ·
[Hearing Review](https://hearingreview.com/inside-hearing/research/know-loud-balloons-can)

Code:
[Rapier](https://github.com/dimforge/rapier) ·
[Rapier soft bodies guide](https://rapier.rs/docs/user_guides/javascript/soft_bodies) ·
[xrblocks BalloonPop](https://github.com/google/xrblocks/tree/main/samples/advanced/balloonpop) ·
[balloons-js](https://github.com/arturbien/balloons-js) ·
[react-floating-balloons](https://github.com/sanishkr/react-floating-balloons) ·
[smacke/pressure-softbody](https://github.com/smacke/pressure-softbody) ·
[verlet-js](https://github.com/subprotocol/verlet-js)

Photos: see §2.6.

## Status (2026-10-01)

First cut behind `?try=balloons` (d480ec6): Rapier 2D adopted as decided (ball per balloon, 12 rope links at 0.76 g/m); the air model built and tested (9 g free lift, 2.2 m/s rise, an air balloon falls at about 1.3 m/s); buoyancy at the middle and weight at a centre of mass a quarter radius toward the knot, so balloons right themselves; the latex shader (thickness map, Blinn-Phong, wrapped diffuse, the room by Fresnel, crystal see-through, neon under UV); pop into shreds; each balloon a caster. Note: Rapier's `addForceAtPoint` adds a torque that `resetForces` does not clear -- `resetTorques` is needed too. Still to do: squash on contact, the crack-tree pop and its sound, grabbing the ribbon, the lab controls of 6.
