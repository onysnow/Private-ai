# Flame and torch light (R7)

Research only, 2026-10-01. No code changed. Feeds task 82: a torch (a burning
stick, also usable as the cursor) whose flame lights the page (photos, glass
panes, type) with real flicker and moving soft shadows. It builds on the road
flare we already have (`src/effects/light/flame.ts`, `lights.ts:248-336`) and on
the light list, where each light has position, height, radius, colour and gain.

Every claim has a source link. **(computed)** marks a number worked out here
from a cited formula. **(estimate)** marks a judgement no source states.

Pages that could not be read (rate-limited, HTTP 429, or blocked): the
Okamoto/Chen 2020 Nature paper
([s41598-020-78229-x](https://www.nature.com/articles/s41598-020-78229-x)),
Springer's "Effect of turbulence on flame radiative emission"
([s00348-007-0415-y](https://link.springer.com/article/10.1007/s00348-007-0415-y)),
two ResearchGate rendering papers, and Wikimedia Commons (cache-only, so the
footage licences in §5 are not verified).

---

## 0. Short answer

- **Flicker is not random.** A buoyant flame *puffs* at
  **f ≈ 1.5/√D Hz** (D = burning surface in metres)
  ([Xia & Zhang, arXiv 1803.10400](https://arxiv.org/pdf/1803.10400), citing
  Cetegen & Ahmed 1993 and Hamins et al. 1992). That gives about **6.7 Hz for a
  5 cm torch head, 9.5 Hz for the 2.5 cm road flare, and 2.4 Hz for a 40 cm
  campfire (computed)**. On top of that there is slow wander from draughts.
  Almost no energy lies above 10–20 Hz
  ([Kim, Sivathanu & Gore, NIST](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=916901)).
  Each puff is a slow swell followed by a fast collapse
  ([cpldcpu 2025](https://cpldcpu.com/2025/08/13/candle-flame-oscillations-as-a-clock/)).
  We already have `puffingHz()` in `flame.ts`, so the torch reuses it.
- **Colour.** A candle is **1850 K**
  ([Wikipedia](https://en.wikipedia.org/wiki/Color_temperature)), and firelight
  generally runs 1000–3000 K
  ([Medina-Alcaide et al. 2021, PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0250497)).
  Use **1900 K** through the engine's existing `blackbodyRgb()`.
- **Brightness.** A real juniper torch measured **14 cd**. A fireplace measured
  3 cd and a grease lamp 0.6 cd (PLOS above). A candle is about 1 cd
  ([Wikipedia: Candela](https://en.wikipedia.org/wiki/Candela)). A 60 W bulb
  (800 lm, [Wikipedia: Lumen](https://en.wikipedia.org/wiki/Lumen_(unit)))
  is about 64 cd if it shines evenly in all directions **(computed: 800/4π)**.
  So a torch is roughly **a fifth of a 60 W bulb**, or 14 candles.
  Waving the torch fans the flame, and its light rose **5 → 28 lux**.
- **Rendering the flame:** **build** a procedural noise flame in our WebGL1
  engine, as the tools survey already decided. Drive its height from the
  *same* flicker signal as the light, so the flame and the light on the page
  move together. **A/B test it** against Unity Labs' **CC0** flipbook
  `SmallFlame01`, which is 64 frames and about 700 kB as WebP **(computed)**.
  For sparks, smoke and embers, **port** the CC0 Godot torch shader.

---

## 1. Tools first

| Candidate | What it is | Licence | WebGL1 fit | Decision |
|---|---|---|---|---|
| Our `flame.ts` (`puffingHz`, `sputterAt`, `flareFlickerAt`) | Flicker for the road flare, from Cetegen & Ahmed | ours | is the engine | **Extend**: make the diameter, amplitudes and wander parameters |
| Our `blackbody.ts` (`blackbodyRgb`) | Planck → linear sRGB | ours | – | **Adopt** for the flame and light colour |
| [stegu/webgl-noise](https://github.com/stegu/webgl-noise) | Simplex noise, GLSL ES 1.00 | MIT | yes | **Adopt** (already chosen in [tools-survey §11](tools-survey.md)) |
| [Godot "Procedural Torch & Candle Shader (Fire + Smoke + Sparks)"](https://godotshaders.com/shader/procedural-torch-candle-shader-fire-smoke-sparks/) | Particles computed in the shader. Defaults: 128 fire particles, 18 sparks, 20 smoke puffs, `windForce`, `fireShift` | **CC0** ("can be used freely") | Godot's language is GLSL-like, so the port is mechanical **(estimate)** | **Port** the spark and smoke layers, and the wind parameter |
| [Unity Labs VFX flipbooks](https://unity.com/blog/engine-platform/free-vfx-image-sequences-flipbooks) (Iché, 2016): `SmallFlame01`, `Flame02/03`, `CandleSmoke01` | Fluid-sim flame renders | **CC0** ("we release some of these sequences under CC0") | Plain textures | **A/B candidate** (see below) |
| [Kenney Particle Pack](https://opengameart.org/content/particle-pack-80-sprites) | 80 particle sprites, with fire, smoke and spark samples | **CC0** | Plain textures | Optional: spark and smoke sprites |
| [JangaFX free EmberGen VDBs](https://jangafx.com/software/embergen/download/free-vdb-animations) | Volumetric fire sims | **CC0** | No, they are 3D volumes. We could render them offline to a flipbook in Blender | Only if the flipbook route wins and needs a better source |
| [Ten Minute Physics 21-fire](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/21-fire.html) | CPU Eulerian grid of about 100k cells; temperature field, buoyancy 3.0, random swirls; canvas 2D colour map | MIT | Renderer-free, so we could upload its grid as a texture | **Hold**. Too heavy for a cursor at 100k cells. A 32×64 grid might work **(estimate)**. Port only if the noise flame looks fake up close |
| [PavelDoGreat WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) | GPU dye advection, curl, bloom | MIT | yes ([tools-survey §5, §10](tools-survey.md)) | **Not for the flame.** Possible later for smoke trails. Its bloom is already planned |
| [mattatz/THREE.Fire](https://github.com/mattatz/THREE.Fire), [@wolffo/three-fire](https://github.com/typeWolffo/THREE.Fire) | Ray-marched volume fire | MIT | three-bound. three.js has refused WebGL1 since r163 ([tools-survey §12](tools-survey.md)) | Read the GLSL for ideas. Overkill for a cursor torch |
| [threejsdemos "Flickering Torch"](https://threejsdemos.com/demos/lighting/torch) | `base + k·(sin(t·speed)·0.5 + 0.5·noise + 0.25·n2)`; base 1.8, k 0.6, 6 Hz; the flame sphere scales with the light | **None stated** | – | Ideas only. Note that it couples flame size to light, which we copy |
| Shadertoy flame shaders | Many noise flames | CC BY-NC-SA by default | – | Read for ideas only, never copy ([research-plan rule 2](research-plan.md)) |
| [Candle-flicker LED, reverse-engineered](https://cpldcpu.com/2013/12/08/hacking-a-candleflicker-led/) | About 13–14 brightness updates a second over 12 levels; half the samples sit at maximum, and the dimmest 4 levels are used only 0.36% of the time | (description only) | – | Ideas: keep the flame **near full most of the time** and make dips brief |

**The flipbook, checked.** We downloaded `SmallFlame01-flipbooks.zip` (6.6 MB,
link live 2026-10-01). It holds:

- a 16×4 atlas, **2048×1024 RGBA, so 64 frames of 128×256** (`.tga` and `.exr`);
- a separate **temperature** EXR, which could be coloured through
  `blackbodyRgb`.

Re-encoded here, the atlas is 1.76 MB as PNG and **700 kB as WebP q85
(computed)**. At half resolution it would be about 200 kB **(estimate)**.
It shows a small campfire-like flame that leans with no direction.

**Against it:**

- It loops visibly.
- It can't tilt with the cursor's motion, short of a shear.
- Its brightness isn't tied to our flicker signal, unless we pick frames by
  flicker phase.

So the flipbook is a reference and an A/B option, not the default.

---

## 2. Flicker: what is measured

### 2.1 The puffing frequency

- **The correlation.** f = 1.5·D^−½ (Trefethen & Panton 1990; Cetegen &
  Ahmed 1993). Hamins et al. 1992 give the same law as St ∝ Fr^−½. Byram &
  Nelson give the underlying scaling, f ∝ (g/D)^½. The law spans candle-sized
  jet flames to pool fires
  ([Xia & Zhang, arXiv 1803.10400](https://arxiv.org/pdf/1803.10400)).
- **Pool fires.** f ∝ D^−0.5, and the response is **monoperiodic**: one
  frequency through the whole flame. Temperature swings reach **25% of the
  mean** ([Mandin & Most, IAFSS](https://publications.iafss.org/publications/fss/6/1137/view/fss_6-1137.pdf)).
- **Candles.** A single 6 mm candle in still air "does not exhibit visible
  oscillation and remains stable". Bundles of three or more oscillate at
  **10–12 Hz**, and get slower as more candles are added (f ∝ D^−0.49)
  ([Chen et al. 2019, Sci. Rep.](https://www.nature.com/articles/s41598-018-36754-w)).
  A bundle measured with a sensor gave a sharp peak at **9.9 Hz**. Its
  waveform is sawtooth-like: "the flame slowly grows larger until it
  collapses" ([cpldcpu 2025](https://cpldcpu.com/2025/08/13/candle-flame-oscillations-as-a-clock/)).
- **Our cases (computed from f = 1.5/√D):**

| Flame | D | Puffing |
|---|---|---|
| Single candle | – | steady (no puffing) |
| Road flare (`FLARE_END`) | 2.5 cm | 9.5 Hz |
| Torch head **(estimate: a 4–6 cm bundle; the PLOS torches were 1.2 cm juniper sticks bound together)** | 5 cm | **6.7 Hz** (6.1–7.5 Hz) |
| Campfire | 40 cm | 2.4 Hz |

### 2.2 Spectrum and amplitude

- **Where the energy is.** Open test fires (wood crib, heptane and others)
  put "most of the energy of the fluctuations … below 10–20 Hz". Above
  20 Hz it drops "five to six orders of magnitude". Smouldering fires sit
  below 2–3 Hz. Soot (visible light) fluctuates faster and more strongly than
  gas-band radiation, with a lognormal distribution
  ([Kim, Sivathanu & Gore](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=916901)).
  So 40 samples a second is enough for a 20 Hz band **(computed, Nyquist)**.
  The flare's 30 Hz update (`lights.ts:297`) is fine for a 6.7 Hz torch.
- **No measured light-flicker amplitude for torches or candles was found.**
  These are the bounds we do have:
  - **Still candle:** close to steady (Chen 2019).
  - **Pool fire:** ΔT up to 25% (Mandin & Most).
  - **Torch:** a juniper torch held still burned unstably. Waved in
    semicircles, its illuminance rose **from 5 to 28 lux at 20 cm**
    (×5.6) and **from 1.5 to 4.3 lux at 40 cm**. Waving could also rekindle
    a torch that had gone out
    ([Medina-Alcaide et al. 2021](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0250497)).

### 2.3 Wind and movement

- **Co-flow.** Air moving along a flame lowers the flicker *amplitude* and
  slightly *raises* the frequency. Strong enough co-flow suppresses flicker
  altogether ([Flow Turb. Combust. 2016](https://link.springer.com/article/10.1007/s10494-016-9730-9),
  abstract).
- **Swirl.** Weak swirl raises the frequency non-linearly. Strong swirl stops
  the pinch-off ([Symmetry 2024](https://www.mdpi.com/2073-8994/16/3/292)).
- **Crosswind.** Flame tilt correlates with the Froude number, R² = 0.91 over
  0.5–16 m fires and winds up to 7 m/s
  ([Fire 2024](https://www.mdpi.com/2571-6255/7/11/398)).
- **Applied to a cursor torch:**
  - a moving torch feels a headwind equal to its own speed, so the flame
    trails behind;
  - the regular puffing gives way to faster, ragged turbulence;
  - the flame burns brighter as it is fanned (PLOS);
  - when the torch stops, the flame swings back upright and puffing resumes
    **(estimate, from the three sources above)**.

### 2.4 How to synthesize it (published models)

- **No rendering paper with a measured flicker spectrum was readable.**
  Bridault-Louchez et al. (flame model with photometric lighting) and
  "Approximating the Fire Flicker Effect Using Local Dynamic Radiance Maps"
  were both on ResearchGate, which returned 429.
- **Common practice:**
  - game and hobby code uses sums of sines plus noise
    ([threejsdemos](https://threejsdemos.com/demos/lighting/torch)), or Perlin
    noise ([flameeyes](https://flameeyes.blog/2020/05/25/fake-candles-and-flame-algorithms/),
    who says "there's not really 'one' true flame algorithm");
  - the candle LED uses shaped random levels at about 14 Hz (cpldcpu 2013).
- **Our model, built from the measurements above (§6.2):**
  - a narrow-band puff at 1.5/√D with a slow-rise, fast-fall shape;
  - 1/f-like wander below about 3 Hz;
  - nothing above 20 Hz;
  - rare gutters (the flare's `sputterAt`);
  - flame length ∝ brightness^0.4. Heskestad gives L ∝ Q^(2/5); if light
    output ∝ heat release Q, then L ∝ B^0.4 **(computed; the proportionality
    is an estimate)**.

---

## 3. Colour

- **Measured and quoted.**
  - Match flame: 1700 K. Candle: **1850 K**. Standard incandescent: 2400 K
    ([Wikipedia: Color temperature](https://en.wikipedia.org/wiki/Color_temperature)).
  - "Low colour temperature emitted by the light from fires (≈1000–3000 K)"
    ([PLOS 2021](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0250497)).
  - No measured CCT for a wood or kerosene torch was found. **1900 K ± 200**
    is our estimate, sitting between the candle and the general fire range.
- **Why a flame has zones.**
  - The yellow is "incandescence of very fine soot particles".
  - The blue at the base is "emission of excited molecular radicals" (below
    565 nm), where there is little soot.
  - The cooler outer parts go red → orange → yellow → white as the
    temperature rises.
  - A candle is about 1100 °C, with hot spots of 1300–1400 °C.
  - (All from [Wikipedia: Flame](https://en.wikipedia.org/wiki/Flame).)
  - The soot glow is a continuous, blackbody-like spectrum
    ([Wikipedia: Luminous flame](https://en.wikipedia.org/wiki/Luminous_flame)).
  - Smoke: juniper and oak gave **white smoke**; pine resin and birch bark
    gave **dense black smoke** (PLOS).
- **Linear sRGB with D65 white (computed** by Planck × the CIE 1931 fit
  (Wyman–Sloan–Shirley) → XYZ → sRGB, checked against
  [Charity's blackbody table](http://www.vendian.org/mncharity/dir3/blackbody/UnstableURLs/bbr_color.txt):
  1900 K = `#ff8300`, linear G 0.227**):

| K | linear R, G, B | relative luminance |
|---|---|---|
| 1500 | 1, 0.145, 0 | 0.05 |
| 1700 | 1, 0.194, 0 | 0.31 |
| **1850** | **1, 0.231, 0** | 1 |
| 1900 | 1, 0.243, 0 | 1.42 |
| 2000 | 1, 0.266, 0.008 | 2.73 |

- **How a camera records it.**
  - Canon's auto white balance spans **3000–7000 K**. The Tungsten preset is
    3200 K, and the manual Kelvin setting goes down to 2500 K
    ([Canon EOS R6 manual](https://cam.start.canon/en/C004/manual/html/UG-03_Shooting-1_0110.html)).
    Most AWB systems cover roughly 3500–8000 K
    ([Digital Camera World](https://www.digitalcameraworld.com/tutorials/photography-cheat-sheet-color-temperature-and-the-kelvin-scale)).
  - So a camera never fully neutralises firelight. At a 3000 K white balance,
    1850 K light records as **linear (1, 0.48, 0)**, an amber `#ffb700`
    **(computed)**, against (1, 0.23, 0) for an eye adapted to daylight.
  - The flame itself is far brighter than what it lights, so it clips. Red
    saturates first, then green, so the core reads **pale yellow to white**
    with orange only at the edges. The flare doc says the same of its
    flame's clipping (`flame.ts:5-8`) **(estimate)**.

---

## 4. The light it casts

- **Intensity.** From the PLOS measurements:

| Source | Intensity | Illuminance at 40 cm | Reach | Burn time |
|---|---|---|---|---|
| Torch 5 (best) | **14.04 cd** | 21.9 lux | "radius of action" 2.47 m | 61 min |
| Fireplace | 3.07 cd | 19.2 lux | 3.30 m | (flame 40–45 cm tall) |
| Grease lamp | 0.59 cd | 3.7 lux | – | – |

  The grease lamp's "semicircular halo" sends less light downwards.
  Against a 60 W bulb at about 64 cd, the torch is about 0.22× **(computed)**.

- **The flame as a light source.**
  - Heskestad: L = 0.235·Q^(2/5) − 1.02·D (L in m, Q in kW)
    ([Hagen, one-point lesson](https://www.hagensforlag.no/Flameheight.pdf)).
  - A 5 cm head at 1–5 kW gives **L ≈ 0.18–0.40 m (computed; the heat
    release is an estimate)**. That is consistent with the 40–45 cm fireplace.
  - So the source is a tall ellipse about **1 : 3–5 (width : height)**.
  - Its light centroid sits about **0.3–0.4·L above the burning head**
    **(estimate: the brightest soot zone is mid-flame,
    [Wikipedia: Flame](https://en.wikipedia.org/wiki/Flame))**.
- **Shadows.** We use R6's exact model ([shadows.md](shadows.md)):
  - offset = (C − L)·h/(H − h);
  - penumbra ∝ R·h/(H − h).
  - **Sway:** a light centroid wandering by δ moves each shadow by
    −δ·h/(H − h) **(computed)**. Shadows of tall casters (puppets, h → H)
    swing most; type lying on the photograph barely moves.
  - **Size:** a flame is larger than the flare's 10 px, so its shadows are
    softer.
  - **Shape:** the flame is taller than it is wide, so the penumbra is wider
    along the flame's axis. Scale R6's Vogel taps by (r_x, r_y) instead of
    one radius **(estimate)**.
  - **How far the centroid moves:**
    - in still air, vertically ±5–10% of L with each puff, and sideways
      ±2–5% of L **(estimate)**;
    - while the torch moves, it trails behind (§2.3).

---

## 5. Reference photographs and footage

**Best match: torches lighting painted walls.** Medina-Alcaide et al. 2021,
[PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0250497)
(CC BY 4.0). Its figures show torches, a grease lamp and a fireplace lighting
cave walls with art on them.

**Unsplash (free licence; for side-by-side checks, not shipped):**

- [person holding torch during night time](https://unsplash.com/photos/person-holding-torch-during-night-time-qlAzCYrHWck)
- [torch with fire](https://unsplash.com/photos/torch-with-fire-fjmPfKvayzA)
- [shallow focus, lit torch](https://unsplash.com/photos/shallow-focus-photography-lit-torch-4obtpdEvmb4)
- [tiki torch near sea at night](https://unsplash.com/photos/lighted-tiki-torch-near-sea-at-night-ublrT4qJBhI)
- [flame near trees](https://unsplash.com/photos/flame-near-trees-Aki8Utz94AM)
- [fire in the dark](https://unsplash.com/photos/fire-in-the-dark-during-night-time-37CyRIqqXgs)
- [candles on a wall](https://unsplash.com/photos/a-couple-of-candles-that-are-on-a-wall-HF7D5gKJVx0)
- [tea candle casting a warm glow](https://unsplash.com/photos/y-JCmviz8Is)

**Premium (Unsplash+, view only):**

- [lit torch mounted on a building](https://unsplash.com/photos/a-lit-torch-mounted-on-a-building-q0Z5pIahu1M)
- [lantern lighting a stone wall at night](https://unsplash.com/photos/a-vintage-lantern-illuminates-a-stone-wall-at-night-jyWbSkpl-kQ)
- [woman holding a stick with a fire in it](https://unsplash.com/search/torch) (ID `ynNbCM44CRE`)

**Footage, licences unverified** (Commons blocked fetching):

- [File:ABOedit2015-Video-Fire.webm](https://commons.wikimedia.org/wiki/File:ABOedit2015-Video-Fire.webm)
- [File:White candle video.webm](https://commons.wikimedia.org/wiki/File:White_candle_video.webm)

Use these to measure flicker by eye. Check each licence before any use.

---

## 6. Decisions

### 6.1 Approach

1. **The light: extend, don't rebuild.** Generalise `flame.ts` into
   `flameFlickerAt(s, params)`; the flare becomes one preset. Add a
   `torchLight` to the light list beside `flareLight`. It has the same shape:
   position, height, radius, colour, gain.
2. **The flame: build** a procedural sprite. It is a teardrop shaped with
   2-octave stegu noise scrolled upward, coloured by temperature through
   `blackbodyRgb`, with the core clipping to white. A thin blue base appears
   only on the candle and kerosene presets.
   - Its **length follows the flicker**: L ∝ B^0.4.
   - It **trails the cursor's velocity**.
3. **A/B test** against the CC0 `SmallFlame01` flipbook at half resolution.
   Keep whichever looks real at 1:1 next to the reference photos.
   Ten Minute Physics (MIT) stays held back as the fallback.
4. **Sparks, smoke and embers:**
   - **port** the CC0 Godot torch shader's spark and smoke layers;
   - falling embers are a few CPU particles that drop under gravity and
     fade, like the charcoal that fell from the PLOS torches (pieces under
     3 cm).
   - Sparks are tiny emitters but do **not** enter the light list. They are
     too small and short-lived to light anything **(estimate)**.

### 6.2 The numbers (torch preset)

| Parameter | Value | Basis |
|---|---|---|
| Burning head D | 5 cm | estimate (PLOS stick bundles) |
| Puff frequency | 1.5/√D = **6.7 Hz**, ±10% random drift | Cetegen & Ahmed (computed) |
| Puff shape | Rise for 80% of the cycle, collapse in 20% | cpldcpu 2025 (sawtooth); split is an estimate |
| Puff amplitude | ±10% of light | estimate (Mandin & Most ΔT ≤ 25%) |
| Wander | 1/f noise octaves at 0.3, 0.7, 1.5 and 3 Hz, amplitudes 0.08 / 0.05 / 0.03 / 0.02 | estimate (Kim et al.: energy below 10–20 Hz) |
| High cut | nothing above 20 Hz; update ≥ 40 Hz (display rate is fine) | Kim et al. (computed) |
| Gutters | `sputterAt` with chance 0.1 per 0.4 s and depth 0.3 (gentler than the flare) | estimate |
| Distribution | Bright most of the time, brief dips (clamp 0.55–1.1) | cpldcpu 2013 (LED levels) |
| Fanning | Speed raises brightness up to **+40%** (0.3 s attack, 2 s decay); puff amplitude ×0.5 and frequency ×1.15 at speed | PLOS (5 → 28 lux); co-flow paper; numbers are estimates |
| Tilt | tan θ = min(3, k·v/√(g·L)), k = 1, with v converted at 3.6 px/mm (R6's scale) | Froude correlation (Fire 2024); the form and k are estimates |
| Colour | `blackbodyRgb(1900)` = linear (1, 0.24, 0) | Wikipedia 1850 K; PLOS 1000–3000 K |
| As photographed | ÷ white balance at 3000 K → (1, 0.48, 0) | Canon AWB floor (computed) |
| Gain | Flare-like (`coreGain` × ~1). Dim the room (Room brightness ≈ 0.1) while the torch is held: a torch is about 0.22× a 60 W bulb, so it only reads as a light in the dark | PLOS 14 cd vs 64 cd (computed); room fill from R6 |
| Light radius | Ellipse r_x : r_y = 1 : 3, with r_y = 0.35 × the sprite flame's length (about 12 × 36 px for a 100 px flame) | Heskestad shape (computed); scale is an estimate |
| Light position | 0.35·L above the head; jitter ±7% L vertically, ±3% sideways, following the puff | estimate |
| Height | The existing "Light height" (`shadowHeight`) | engine |

**Other presets:**

| Preset | Puffing | Colour | Light radius | Other |
|---|---|---|---|---|
| Candle | none, wander ±3% only | 1850 K | small | blue base; nearly steady (Chen 2019) |
| Campfire | 2.4 Hz | 1800 K | large | wander ±20% |
| Flare | unchanged (9.5 Hz) | – | – | – |

### 6.3 Lab controls

- **Preset:** candle / torch / campfire / flare.
- **Head size D (cm)**, which shows the derived puff Hz.
- **Flicker:** puff amount, wander amount, gutter rate.
- **Flame temperature (K):** 1500–2400.
- **White balance (K):** 1900–6500, default 3000.
- **Flame size (px):** light radius and aspect follow it, with an override.
- **Drag (tilt):** k.
- **Fan boost.**
- **Dim room while lit.**
- **Smoke:** amount, white or black (wood or resin).
- **Sparks and embers:** rate.
- **Renderer:** procedural or flipbook (the A/B test).
- **Freeze time:** for screenshots. The model is deterministic in `s`, as
  `flame.ts` is today.

### 6.4 Tests

- **Spectrum.** Take the FFT of `flameFlickerAt` over 60 s at 120 Hz. Check:
  - a peak at 1.5/√D within ±10%;
  - less than 1% of the power above 20 Hz;
  - the mean stays inside the clamp.
- **Flame tracks light.** The flame length correlates with light gain:
  r > 0.9.
- **Shadow sway.** A caster at h = 0.5H: a centroid move of δ moves the
  shadow by −δ to ±1 px (R6's test harness).

### 6.5 Still unknown

- **No measured light-flicker amplitude or spectrum for torches.** Every
  amplitude above is an estimate. Filming a real torch against a wall at
  240 fps and taking the mean pixel value would settle it.
- **The heat release and flame length of a hand torch.**
- **The licences** of the Commons footage.
- **Whether the noise sprite or the CC0 flipbook looks more real** at cursor
  size. That is the A/B test above.

## Status (2026-10-01)

Torch first cut behind `?try=fire` (cb3fc93): `flameFlickerAt(s, params)` with TORCH / CANDLE / CAMPFIRE presets (tested per 6.4: peak within 10% of 6.7 Hz, under 1% of the power above 20 Hz, inside the clamp); `fireLight` at 1900 K white-balanced to 3000 K; the procedural flame (noise teardrop, L ~ B^0.4, Froude tilt, fan boost to +40%), embers, the room dimmed to 0.12 while it burns. Still to do: smoke, sparks, the presets in the lab, the A/B test against the CC0 flipbook.
