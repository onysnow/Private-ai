# Other liquids and the spray bottle (R3)

Research only, 2026-10-01. No code changed. Feeds task 76: a spray-bottle tool
that sprays water, slime, blood, and maybe paint, oil or honey onto the glass
panes and page elements. The drops bead or smear, run, merge, and refract and
cast light and shadow. It builds on the drop simulation planned in
[water-drops.md §6–§7](water-drops.md), on the particle pool decided in
[tools-survey.md §4](tools-survey.md), and on that doc's §4 table for slime and
blood. That table is extended here, not repeated.

Every claim has a source link. **(computed)** marks a number worked out here
from a cited formula, with the method given. **(estimate)** marks a judgement
no source states.

Pages that could not be read (rate limit, bot check, or paywall): Giles et al.
2005 full text (abstract only, via ASABE), the Tandfonline cleaning-spray paper
([10.1080/15459624.2019.1643466](https://www.tandfonline.com/doi/full/10.1080/15459624.2019.1643466)),
Clanet et al. 2004 full text (abstract via Crossref), Roy et al. 2025 full text
(abstract only), the PMC blood-drying review
([PMC8405133](https://pmc.ncbi.nlm.nih.gov/articles/PMC8405133/), reCAPTCHA),
and the NC State oil contact-angle thesis (bot check). The web-search budget
ran out partway, so later lookups went through PubMed, Crossref and Firecrawl.

---

## 0. Short answer

- **A trigger squeeze is about 1 mL in 75–200 ms.** Water drops have a volume
  median of **95 µm (fast squeeze) to 146 µm (slow squeeze)**
  ([P&G patent US8322630B2](https://patents.google.com/patent/US8322630B2/en);
  [Giles, Downey & Squire 2005](https://elibrary.asabe.org/abstract.asp?aid=17941&redir=&redirType=&t=2)).
  The start and end of each squeeze spit **larger** drops (Giles).
- **Most of the mist never reaches a pane 20–30 cm away.** Air drag stops
  drops under about 100–150 µm within 1–20 cm **(computed, §2.6)**. Those
  drift as fog. Only the coarse part of the spray lands as drops. Spraying
  close gives drops; spraying from far gives a fine haze.
- **On glass, spray drops stick; they do not bounce or splash.** Drops of
  150 µm land at about 1–6 m/s and simply spread and pin. Only the coarse
  tail (≥ 300 µm, close range) crosses the splash threshold
  ([Yang et al. 2021](https://arxiv.org/pdf/2104.03475)) **(computed, §2.7)**.
  Glass gives no rebound, because rebound needs a high receding angle
  ([Wikipedia: Drop impact](https://en.wikipedia.org/wiki/Drop_impact)).
- **Thick liquids cannot be atomised by a trigger sprayer.** "An adequate spin
  cannot be produced in the more viscous liquids", so cooking oil streams
  ([US6659369B1](https://patents.google.com/patent/US6659369)). So **slime,
  honey and oil come out as a stream, gobs and strings, not a mist**. That is
  a physical rule, not a style choice.
- **Each liquid is one row of numbers** in the drop sim: density, viscosity,
  surface tension, contact angles, refractive index, absorption, drying (§5.2).
  The friction law `U = (ρgV − F₀)/(βwη)` from water-drops §2.4 already makes
  blood run 4–5× slower than water, honey crawl at about 1 mm/s, and slime
  sag **(computed, §3)**.
- **Tools:** no library does liquid-on-glass spraying for the web. We **build**
  the sprayer on our particle pool, **port** raindrop-fx for the drops (already
  decided), **adopt** spectral.js (MIT) for paint colour, and **port** three.js's
  thin-film iridescence (MIT) for oil (§1).

---

## 1. Tools first

| Candidate | What it is | Licence | WebGL1 fit | Decision |
|---|---|---|---|---|
| **raindrop-fx** (SardineFish) | Drops on glass: spawn, slide, trail, merge | MIT ([water-drops §7](water-drops.md)) | No (WebGL2). The sim is plain TS | **Port** (already decided). The spray only adds a source: `addVolume` |
| **dli/paint "Fluid Paint"** ([repo](https://github.com/dli/paint), [demo](http://david.li/paint)) | A real-time viscous paint fluid on a canvas. Paint height becomes normals and is lit with Phong; colour mixes in RYB by trilinear interpolation (`shaders/painting.frag`) | **MIT**, "Copyright (c) 2017 David Li" ([LICENSE](https://github.com/dli/paint/blob/master/LICENSE)) | WebGL1 plus `OES_texture_float` and `OES_texture_half_float` (`paint.js` L223–224, `simulator.js` L20–26, read here) | **Ideas only.** It simulates a brush on canvas, not drops under gravity on glass. Borrow the "paint thickness → normal → lit" shading for paint films |
| **spectral.js** ([repo](https://github.com/rvanwijnen/spectral.js)) | Single-constant Kubelka–Munk pigment mixing, with a `spectral.glsl` for shaders ([README](https://github.com/rvanwijnen/spectral.js/blob/master/README.md)) | **MIT**, "Copyright (c) 2025 Ronald van Wijnen" ([LICENSE](https://github.com/rvanwijnen/spectral.js/blob/master/LICENSE)) | Plain GLSL functions | **Adopt** for paint colour: two paints that touch mix like pigment (blue + yellow → green), not like light. npm 3.0.0, 58 kB unpacked ([npm](https://registry.npmjs.org/spectral.js/latest)) |
| **Mixbox** ([repo](https://github.com/scrtwpns/mixbox)) | Pigment mixing with a LUT | **CC BY-NC 4.0** ([LICENSE](https://github.com/scrtwpns/mixbox/blob/master/LICENSE)) | – | **Excluded** (non-commercial) |
| **three.js `iridescence_fragment`** ([source](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/iridescence_fragment.glsl.js)) | Thin-film interference (`evalIridescence`) after Belcour & Barla 2017, with a Fourier fit of the XYZ sensitivity curves | **MIT** ([LICENSE](https://github.com/mrdoob/three.js/blob/dev/LICENSE)) | Plain GLSL functions; no WebGL2 features in the chunk (read here) | **Port** for the thin edges of oil films (§3.6) |
| **PavelDoGreat WebGL-Fluid-Simulation** | GPU dye advection; a Gaussian `splat` | MIT ([tools-survey §5](tools-survey.md)) | WebGL1 fallback | **Not used for drops.** Its splat is the same Gaussian stamp we need for mist deposition, which is three lines |
| **Ten Minute Physics 17/18** (grid fluid, FLIP) | CPU fluid on a grid | MIT ([tools-survey §5](tools-survey.md)) | Renderer-free | **Hold** (decision in §5.1). The open question from the tools survey was whether slime or blood needs it. They don't: on glass, contact-line pinning and viscosity set the motion, and the drop sim models both |
| **piellardj/paint-webgl** ([demo](https://piellardj.github.io/paint-webgl/)) | GPU painting along a vector field | No LICENSE file found at `master` or `main` (checked here) | – | **Ideas only** |
| Game "blood decal" pattern (e.g. [Ultrakill-style decals in Unity](https://medium.com/@aldebaran38/how-to-make-blood-decals-like-ultrakill-in-unity-f9c89e7a61eb); [Unreal blood splatter](https://dev.epicgames.com/community/learning/tutorials/L0K6/unreal-engine-procedural-blood-splatter-with-texture-graph)) | Particles fly; where they hit, a decal is stamped into a persistent texture | Tutorials | – | **The same idea** as raindrop-fx's droplet layer. It confirms the design: small spray drops become stamps in a persistent texture, not simulated drops |

**Decision:** **build** the sprayer (the nozzle model in §2) on the CPU particle
pool from tools-survey §4. Land drops in the ported raindrop-fx sim. **Adopt**
spectral.js for paint and **port** the three.js thin-film function for oil.
Nothing found does spraying onto glass with physical drop sizes. The licences
above were read from the raw LICENSE files at the default branch on
2026-10-01.

---

## 2. The trigger sprayer

### 2.1 How much comes out, and how fast

- **Per squeeze:**
  - **1.0 mL** for a full stroke and **0.28 mL** for a one-third stroke
    ([US8322630B2](https://patents.google.com/patent/US8322630B2/en), Procter &
    Gamble, filed 2010);
  - **0.9 mL** per burst, lasting **75–200 ms**
    ([Giles, Downey & Squire, Trans. ASAE 48(1) 2005](https://doi.org/10.13031/2013.17941));
  - "household heads dispense **0.9–1.6 ml** per stroke"
    ([Innovation Chem](https://www.innovationchem.co.uk/blogs/news/trigger-sprayers-more-than-a-nozzle));
    vendors list 0.22–1.5 mL ([SH Bottles](https://www.shbottles.com/news/the-ultimate-guide-of-trigger-spray.html))
    and 0.25–3.5 mL ([NABO](https://www.naboplastic.com/trigger-sprayer-guide/)).
- **Mass rate:** the Dutch consumer-exposure model's default for **all trigger
  sprays is 1.6 g/s**, from 12 measured products
  ([RIVM ConsExpo spray model, Table 6](https://www.rivm.nl/bibliotheek/rapporten/320104005.pdf)).
- **Squeeze rate:** the patent tests at **30 and 90 strokes per minute**
  (US8322630B2).
- **(computed)** 0.9 mL in 75–200 ms is **4.5–12 mL/s** during the burst, so
  the 1.6 g/s figure is an average over a spraying session, not the burst
  rate.

### 2.2 Drop sizes

| Source | Liquid | Dv10 | **Dv50** | Dv90 | Notes |
|---|---|---|---|---|---|
| US8322630B2 | distilled water, 90 strokes/min | – | **95 µm ±10%** | 195 µm | Laser diffraction at 140 mm from the nozzle |
| US8322630B2 | distilled water, 30 strokes/min | – | **146 µm** | 344 µm | The slow squeeze is coarser; the Dv50 difference is 50.9 µm |
| US8322630B2 | fabric refresher (23.1 mN/m, 1.14 mPa·s) | – | 119 / 142 µm | 228 / 295 µm | Fast / slow |
| Giles et al. 2005 | water + surfactant, conventional trigger | – | **100 µm** (typical) | – | "significantly larger droplet size spectra were produced during 15 to 50 ms initiation and conclusion periods of the pulse" |
| Giles et al. 2005 | water + polymer, foamer trigger | – | 600 µm | – | A long-chain polymer makes much larger drops |
| RIVM ConsExpo §2.4.2 | trigger sprays generally | – | 70 to "well over 100 µm" | – | "Trigger sprays tend to produce larger aerosols than spray cans" |
| [CloroxPro](https://www.cloroxpro.com/blog/when-it-comes-to-droplets-size-matters/) | – | – | trigger "> 100 microns"; misters and foggers "10–30 microns" | – | Vendor blog |

**(computed)** Fitting a log-normal by volume to the patent's Dv50 and Dv90
(σ = ln(Dv90/Dv50)/1.2816):

| Squeeze | σ_ln | Dv10 | Count median (Hatch–Choate, Dv50·e^(−3σ²)) | Volume in drops > 120 µm |
|---|---|---|---|---|
| fast (90/min) | 0.56 | 46 µm | 37 µm | 34% |
| slow (30/min) | 0.67 | 62 µm | 38 µm | 62% |

So **by count almost every drop is tiny**, while most of the **volume** is in
drops above 100 µm. A fast, hard squeeze is finer, and less of it reaches the
glass as drops.

### 2.3 Exit speed

- I found **no published exit speed for a trigger sprayer.**
- The nearest measured relative is the hand-pumped nasal spray, which also uses
  a manual piston and a swirl nozzle. Phase Doppler measurements of seven
  products found droplet speeds of **6.7 to 19.2 m/s**
  ([Liu, Doub & Guo 2011, AAPS PharmSciTech](https://pubmed.ncbi.nlm.nih.gov/21286880/)),
  measured 3 cm from the orifice
  ([Liu et al. 2010, Int J Pharm](https://pubmed.ncbi.nlm.nih.gov/20043981/)).
  Stroke length and actuation speed both changed the velocity (2011).
- A vendor quotes a "momentary pressure (~15 bar)" in a trigger
  ([Innovation Chem](https://www.innovationchem.co.uk/blogs/news/trigger-sprayers-more-than-a-nozzle)).
  It gives no method, so it is not used.
- **Use 10–20 m/s at the nozzle (estimate, from the nasal-spray range).**

### 2.4 Cone angle and pattern

- **Trigger nozzles are swirl nozzles.** The patent on viscous sprayers
  describes "the swirl chamber at the head of the spinner assembly"
  ([US6659369B1](https://patents.google.com/patent/US6659369)).
- **A swirl (pressure-swirl) nozzle makes a hollow cone.** "A film is
  discharged from the perimeter of the outlet orifice producing a
  characteristic hollow cone spray pattern"
  ([Wikipedia: Spray nozzle](https://en.wikipedia.org/wiki/Spray_nozzle)).
  It lands as a **ring**. Industrial hollow-cone nozzles span **35°–165°**
  ([Spraying Systems, technical reference](https://www.spray.com/-/media/dam/industrial/usa/sales-material/catalog/c12b_pharm_technical-reference.pdf)).
- **Thicker liquids narrow the cone.** "High viscosity liquids require a
  higher minimum pressure to begin formation of a spray pattern and provide
  narrower spray angles" (Spraying Systems). The tabulated angle "does not
  hold for long spray distances" (same source): the cone collapses as drag
  slows the drops.
- A trigger vendor lists a "Fan (≈ 70–80°)" pattern
  ([Innovation Chem](https://www.innovationchem.co.uk/blogs/news/trigger-sprayers-more-than-a-nozzle)).
- **(computed, rough)** In the Commons photo of a hand pump on black
  ([nasal spray action photo](https://commons.wikimedia.org/wiki/File:Action_photo_of_nasal_spray_on_a_black_background.jpg)),
  the plume is about 100 px wide, 270 px above the tip: a full angle near 20°
  close in. That pump is smaller than a trigger.
- **Use a hollow cone of 60° (range 40–80°) for water (estimate).** Narrow it
  with viscosity.

### 2.5 The nozzle settings

| Setting | What it does | Numbers |
|---|---|---|
| **Spray** | Swirl → thin conical sheet → drops (hollow cone) | §2.2 sizes; 60° cone **(estimate)** |
| **Mist** | A finer swirl nozzle | Misters 10–30 µm ([CloroxPro](https://www.cloroxpro.com/blog/when-it-comes-to-droplets-size-matters/)) |
| **Stream** | No swirl: a jet that breaks into drops (Plateau–Rayleigh) | The fastest-growing wavelength is **λ ≈ 9.02a** ([Wikipedia](https://en.wikipedia.org/wiki/Plateau%E2%80%93Rayleigh_instability)), so **each drop is about 1.89× the jet diameter (computed**: π a²λ = (4/3)πr³). For a 0.5 mm jet **(estimate)**, drops of about 0.95 mm |
| **Off** | Closed | – |

Settings named in vendor guides: "spray, stream, fine mist, or foam" plus an
off position ([NABO](https://www.naboplastic.com/trigger-sprayer-guide/)).

### 2.6 Flight to the glass (computed)

**Method.** A water drop is launched straight at a vertical pane. Air drag
uses the Schiller–Naumann correlation `Cd = 24/Re·(1 + 0.15 Re^0.687)` for
Re < 1000 and 0.44 above
([CHAM, interphase drag models](https://www.cham.co.uk/phoenics/d_polis/d_enc/interph.htm)),
plus gravity, integrated at 10 µs steps (a scratch script, not in the repo).
Air: 1.2 kg/m³, 1.81×10⁻⁵ Pa·s. Each drop flies alone in still air. A real
plume drags air along with it, so small drops get further than this
**(estimate)**.

| Drop | Launched at 10 m/s | Launched at 20 m/s |
|---|---|---|
| 20 µm | stops at 0.8 cm | stops at 1.4 cm |
| 50 µm | stops at 4 cm | stops at 6.5 cm |
| 100 µm | reaches 10 cm at 1.4 m/s; stops at 13 cm | reaches 10 cm at 6.6 m/s; stops at 20 cm |
| 150 µm | 20 cm: 1.1 m/s after 60 ms; stops at 25 cm | 20 cm: 5.6 m/s after 19 ms; 30 cm: 1.7 m/s |
| 300 µm | 20 cm: 5.8 m/s, 26 ms; 30 cm: 4.2 m/s | 20 cm: 13.4 m/s, 12 ms; 30 cm: 10.7 m/s |
| 600 µm | 20 cm: 8.3 m/s | 20 cm: 17.3 m/s |
| 1 mm (stream) | 20 cm: 9.1 m/s, 21 ms | 20 cm: 18.5 m/s, 10 ms |

The gravity drop over 20 cm is under 3 mm for drops of 300 µm and larger, and
about 1–10 mm for 150 µm. The Stokes relaxation time ρd²/18μ
([Wikipedia: Stokes' law](https://en.wikipedia.org/wiki/Stokes%27_law)) is
1.2 ms at 20 µm, 7.7 ms at 50 µm and 31 ms at 100 µm.

**What it means for the tool:**

- At the distance someone sprays a window from (20–30 cm), only drops of
  roughly **≥ 120–150 µm arrive as drops**. That is **about a third to
  two-thirds of the volume (computed**, the §2.2 log-normal fits).
- The rest **hangs in the air as mist** and settles slowly, over a wider
  area, as a haze of micro-droplets.
- A drop reaches the pane **10–60 ms** after leaving the nozzle. That is about
  1–4 frames at 60 Hz, so flight time is visible but brief.

### 2.7 Landing on vertical glass

Numbers: We = ρv²D/γ ([Wikipedia: Weber number](https://en.wikipedia.org/wiki/Weber_number)),
Re = ρvD/η, Oh = √We/Re.

**Splash threshold.** I compared three criteria:

- Mundo: K = Oh·Re^1.25 > 57.7.
- Palacios: We = 5.8 Re^½ + 4.01×10⁷ Re^−1.97.
- Yang et al.: **We > 5 Re^½ + 10⁴ Re^−¾**, which captures the non-monotonic
  effect of viscosity, for Oh 0.002–0.3
  ([Yang et al., arXiv 2104.03475](https://arxiv.org/pdf/2104.03475); all
  three are quoted there).

**Checking them against measurements on glass:**

- Water drops of millimetre size did **not** splash on glass up to **4.7 m/s**.
- Blood splashed at **3.47 m/s** on every surface tested.
- Wettability did not change the splash speed
  ([de Goede et al., Langmuir 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC6150737/);
  abstract via [Crossref](https://doi.org/10.1021/acs.langmuir.7b03355)).

**(computed)** Mundo's K is about 145 for a 1 mm water drop at 4.7 m/s, which
predicts a splash that de Goede did not see. Yang's threshold gives 360
against We = 307: no splash, which agrees. **So use Yang.**

**(computed) Spray drops hitting glass at 20 cm** (water: 1000 kg/m³, 1 mPa·s,
72 mN/m; blood: 1055, 4.8, 59 from de Goede):

| Drop, speed | Water: We / threshold | Blood: We / threshold |
|---|---|---|
| 150 µm, 5.6 m/s | 65 / 209 → **sticks** | 84 / 268 → **sticks** |
| 300 µm, 13.4 m/s | 748 / 337 → **splashes** | 963 / 210 → **splashes** |
| 600 µm, 17.3 m/s | 2494 / 519 → **splashes** | 3211 / 269 → **splashes** |
| 1 mm, 4.7 m/s | 307 / 360 → sticks (matches de Goede) | 395 / 216 → splashes (matches de Goede's 3.47 m/s) |

- For oil, paint and slime, Oh is 0.35–1.1 **(computed)**, beyond the fitted
  range. In that range "viscosity suppresses splashing" (Yang). **Treat
  viscous liquids as never splashing (estimate).**
- **Spread.** For water-like drops the largest splat is
  **D_max ≈ D₀·We^¼**, "also observed to hold on partially wettable surfaces,
  provided that liquids of low viscosity (such as water) are used"
  ([Clanet, Béguin, Richard & Quéré, JFM 517, 2004](https://doi.org/10.1017/S0022112004000904)).
  For viscous drops, **β ~ Re^⅕**
  ([Liu et al., JFM 2025](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/on-the-maximum-spreading-of-viscous-droplets-impacting-flat-solid-surfaces/782A032C35F61FB52A5E5EA454E167AE)).
  **(computed)** A 150 µm water drop at 5.6 m/s spreads to 2.8× its diameter
  (0.43 mm), then pulls back to its resting cap.
- **Rebound.** "For low values [of receding angle] a partial rebound occurs,
  while for high values a complete rebound occurs." Deposition is the
  "impact of small, low-velocity drops onto smooth wetting surfaces"
  ([Wikipedia: Drop impact](https://en.wikipedia.org/wiki/Drop_impact)).
  Window glass has θr ≈ 40° (water-drops §2.1), so **nothing bounces**.
- **The splash pattern.** Fingers form around the rim, and their number grows
  with speed and drop size. "At sufficiently high velocities, the tips of
  these fingers detached, producing satellite droplets"
  ([Mehdizadeh, Chandra & Mostaghimi, JFM 2004](https://doi.org/10.1017/S0022112004009310)).
  Smoother surfaces make fewer spines: glass made fewer than tile
  ([Neitzel & Smith, NIJ 2017](https://www.ojp.gov/pdffiles1/nij/grants/251439.pdf)).
- **Oblique hits make elongated stains.** Bloodstain analysis uses
  width/length = sin(impact angle), which "would under-predict the impact
  angle for … oblique angles less than about 40°" (Neitzel & Smith). At the
  edge of a 60° cone fired straight at the pane, the angle to the glass is
  60° and W/L ≈ 0.87 **(computed)**: only slightly oval, with the tail
  pointing along the flight.

### 2.8 One squeeze on a pane (computed)

- 0.9 mL × 60% arriving = 0.54 mL, over a 20 cm circle (a 60° cone at about
  17 cm), is a mean film of **17 µm**.
- That is about **300 000 drops of 150 µm**. At a 60° contact angle each sits
  as a cap **0.24 mm across** (spherical-cap volume), so the first squeeze
  covers about **44% of the circle**.
- A water drop starts to slide at about **10 µL** (water-drops §2.3). That is
  about **5 700 drops of 150 µm**. So the first squeeze only fogs and dots the
  glass, and **runs start after a few squeezes, once neighbours merge**. That
  matches what happens when you spray a window.
- One CSS px is 1/96 in, i.e. **0.265 mm**
  ([CSS Values 4, absolute lengths](https://www.w3.org/TR/css-values-4/#absolute-lengths)).
  At life size a 150 µm drop's footprint is about **1 CSS px**, and the drop
  map texel (½ CSS px) is 0.53 mm.

**Consequence for the sim:** 300 000 drops per squeeze cannot be simulated
(the cap is 400). Use **parcels** **(estimate**; a standard trick, not taken
from a cited source). Each particle in the pool carries one drop size and a
count:

- **Parcels whose drops are under one map texel** are stamped as
  volume/coverage into the persistent droplet texture (water-drops §7.2: the
  "droplet layer"), like the decal approach in §1.
- **Larger drops** go to `sim.addVolume` and become sim drops, or merge into
  one.
- When droplet-texture volume in a region passes a threshold, it **condenses**
  into a sim drop. raindrop-fx's droplet layer has no merging, so this is the
  addition the spray needs.

---

## 3. The liquids

### 3.1 Properties

| | Water | Blood | Slime (PVA–borax) | Paint (waterborne / acrylic) | Oil (olive) | Honey |
|---|---|---|---|---|---|---|
| Density (kg/m³) | 1000 | **1055** ([de Goede 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC6150737/)) | ~1000 **(estimate**, mostly water) | 1200–1400 **(estimate)** | **910–916** ([Codex](https://www.fao.org/4/y2774e/y2774e04.htm)) | **1380–1450** ([Wikipedia: Honey](https://en.wikipedia.org/wiki/Honey)) |
| Viscosity | 1.0 mPa·s ([Wikipedia: Viscosity](https://en.wikipedia.org/wiki/Viscosity)) | **3–6 mPa·s** (Viscosity); 4.8 (de Goede); shear-thinning (water-drops §4) | **~3 Pa·s**, viscoelastic (water-drops §4); relaxation time **~10 s** for water-only PVA–borate gels ([Riedo et al., Heritage Science 2015](https://www.nature.com/articles/s40494-015-0053-2)) | Shear-thinning. A good spray coating is a power law with **n ≈ 0.5 and ~50 P (5 Pa·s) at 1 s⁻¹** ([Wu 1978](https://doi.org/10.1002/app.1978.070221006)). Latex paints shear-thin more than solvent paints ([UL Prospector](https://www.ulprospector.com/knowledge/639/pc-flow-leveling-viscosity-control-water-born-coatings/)) | **56 mPa·s** at 26 °C (Viscosity) | **2–10 Pa·s** at 20 °C (Viscosity); ~70 P at 30 °C and ~600 P near 14 °C (Honey) |
| Surface tension (mN/m) | 72 | **55.9 ± 3.6** ([Hrnčíř & Rosina 1997](https://pubmed.ncbi.nlm.nih.gov/9728499/)); 59 (de Goede) | 50–70 **(estimate)** | **~65, down to ~30 with surfactant** (UL Prospector) | **32.0** ([Aydar et al. 2016](https://cpb-us-w2.wpmucdn.com/u.osu.edu/dist/4/14506/files/2019/07/Determination-and-modeling-of-contact-angle-of-Canola-oil-and-olive.pdf)) | 50–60 **(estimate)** |
| Contact angle on glass | Window 50–70° (water-drops §2.1) | Pinned; dries "in pinned mode" ([Roy et al., JFM 2025](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/insights-into-the-mechanics-of-pure-and-bacterialaden-sessile-whole-blood-droplet-evaporation/CCC3EC944FB08D174BE587BB7C622B4B)); θa < 90° on glass ([Wang et al. 2026](https://pubmed.ncbi.nlm.nih.gov/41784502/)); **~30–50° (estimate)** | 40–70°, high hysteresis **(estimate)** | Low; paint is made to wet ("good flow, leveling and substrate wetting", [SpecialChem](https://www.specialchem.com/coatings/guide/surface-tension)); **~10–30° (estimate)** | Low. Glass is a high-energy surface and "most molecular liquids achieve complete wetting" on such surfaces ([Wikipedia: Wetting](https://en.wikipedia.org/wiki/Wetting)); **~5–20° on a real window (estimate)** | **~20–40° (estimate)** |
| Refractive index | 1.333 | ~1.36 (water-drops §4) | ~1.34 **(estimate)** | – (opaque, §3.5) | **1.467–1.471** (nD 20 °C, [DGF](https://dgfett.de/wp-content/uploads/2025/03/physikalische_eigenschaften.pdf); Codex) | **1.474–1.504** (25% to 13% water, Honey) |
| Absorption | none | huge in blue/green (water-drops §4) | dye; clear or opaque (§3.4) | opaque pigment (§3.5) | pale yellow **(estimate)** | amber; Pfund scale "0 for 'water white' … more than 114 for 'dark amber'" (Honey) |
| Dries? | evaporates | **gels at the rim, then the whole drop; cracks; untreated stains dry "within 55 min"** on tiles at 20 °C ([Ramsthaler et al. 2017](https://pubmed.ncbi.nlm.nih.gov/28466125/)) | slowly loses water | touch-dry in **10–20 min** for one or two layers ([Wikipedia: Acrylic paint](https://en.wikipedia.org/wiki/Acrylic_paint)) | **never** (non-drying: iodine value 75–94 for olive oil, Codex; non-drying is < 115, [Wikipedia: Drying oil](https://en.wikipedia.org/wiki/Drying_oil)) | **never**: it is hygroscopic and pulls water from the air (Honey) |
| Through a trigger? | spray | spray (thin like water) | **stream/gobs** | spray if thinned (shear-thins in the nozzle, §3.5) | **stream** ("problems are encountered" with cooking oil, [US6659369B1](https://patents.google.com/patent/US6659369)) | **stream** |

**How the friction law moves each one (computed).** Use
`U = (ρgV − F₀)/(βwη)` (water-drops §2.4; β = 100; tested for η 10⁻³ to
1 Pa·s, so anything above that is an extrapolation):

- **blood** runs about **4.8× slower** than water for the same excess weight:
  ~0.8 cm/s where water does 4 cm/s;
- a **1 mL honey blob** (w = 15 mm) creeps at **0.9–4.6 mm/s** (η 10–2 Pa·s);
- a **1 mL slime blob** sags at about **2 mm/s** while it flows, before its
  elasticity is counted;
- **oil** is about 56× slower than water, but it wets glass, so it spreads
  into a film and rivulets instead of beading (§3.6).

### 3.2 Water

Covered by [water-drops.md](water-drops.md). Spray adds only the §2 source and
the mist haze.

### 3.3 Blood

- **Colour.** Use the Beer–Lambert table of water-drops §4: a thin smear is
  already saturated red, and a 1 mm drop is red-black in the middle, with
  σ_rgb ≈ (0.5, 29, 34) mm⁻¹.
- **New: blood casts a red shadow.** **(computed)** Light through a 1 mm drop
  keeps 18–82% of red (600–650 nm) and none of green or blue. So the caustic
  and shadow behind a blood drop are **deep red, not grey**. The area-ratio
  caustic (water-drops §3.4) times `exp(−σ·h)` gives that at no extra cost.
- **It splashes more easily than water** (3.47 m/s, §2.7), so a hard,
  close-range spray of blood throws satellites where water would not.
- **It pins and dries from the rim inward** ([Sobac & Brutin 2011](https://pubmed.ncbi.nlm.nih.gov/21867180/);
  Roy et al. 2025). The three stages are:
  1. a **gelled ring** at the contact line;
  2. a gel front moving inward;
  3. drying out, with **radial cracks** in the outer ring (the "corona").
  - Brutin et al. explain the final pattern by Marangoni flow and **red cells
    carried to the periphery**
    ([JFM 2011](https://doi.org/10.1017/S0022112010005070)). That gives the
    familiar dark ring.
- **Timing.**
  - Large untreated drops were dry (no longer wipeable) **within 55 min**;
    anticoagulants delayed this by 20–45 min (Ramsthaler 2017). Clotting
    competes with drying in large drops (same).
  - Small stains dry much faster. Roy et al. used 3.4 µL drops, but their
    abstract gives no time. **Use about 2–5 min for a 1 µL stain and
    30–60 min for 20 µL (estimate).**
- **Colour change while drying.**
  - **(computed)** As water leaves, the haemoglobin per unit area stays the
    same, so Beer–Lambert absorption σ·h stays about constant. **Drying alone
    does not darken it.**
  - The visible changes come from three things: the gloss going (a matte,
    cracked surface; the specular highlight and the lens disappear), the
    darker corona ring, and a slow chemical shift.
  - The chemistry: **oxy-haemoglobin turns into met-haemoglobin and then
    hemichrome**, brown, over days to weeks
    ([Bremmer et al. 2011](https://pubmed.ncbi.nlm.nih.gov/20729018/); stains
    dated to 200 days in [Edelman et al. 2012](https://pubmed.ncbi.nlm.nih.gov/22938693/)).
  - That timescale is invisible in a page visit. Show "fresh → dried" with
    gloss, the ring and cracks, and **shift the hue to brown only if Ony wants
    accelerated time (open question)**.
- **Runs** are continuous and thicker than water's (water-drops §4).

### 3.4 Slime

- **Two different slimes:**
  - **PVA–borax from clear PVA** is transparent: "all formulations prepared
    with 3% of PVA showed optical transparence"
    ([Riedo et al. 2015](https://www.nature.com/articles/s40494-015-0053-2)).
  - **School-glue slime** (borax plus "water based school glue") is opaque
    and coloured
    ([Commons: Slime 02471 Nevit](https://commons.wikimedia.org/wiki/File:Slime_02471_Nevit.jpg),
    looked at here: bright, opaque green, glossy). The toy is "viscous,
    squishy and oozy" ([Wikipedia: Slime (toy)](https://en.wikipedia.org/wiki/Slime_(toy))).
  - **Offer both:** "clear" (refractive, dye absorption, n ≈ 1.34) and
    "opaque" (diffuse colour with a glossy specular, no lens).
- **A Maxwell fluid with τ ≈ 10 s.**
  - Over less than τ it acts like rubber: it stretches, strings, springs back
    and snaps under fast stress ("breaks under higher stresses", water-drops
    §4).
  - Over more than τ it flows.
  - PVA–borax is "a canonical viscoelastic liquid with a single dominant
    relaxation time" ([Ramlawi et al., J. Rheol. 2024](https://doi.org/10.1122/8.0000843)).
- **Model.** A slime blob is a sim drop with a very high η and F₀ and no
  trail drops.
  - In addition, a **tether** from where it landed shows the stretching.
  - A spring with relaxation time τ pulls the blob back. Over seconds the
    tether's rest length grows (it creeps, in Maxwell fashion). It snaps when
    it stretches too fast **(estimate**, from the Maxwell behaviour above).
  - The [Pouring Slime photo](https://commons.wikimedia.org/wiki/File:Pouring_Slime.JPG)
    (looked at here) shows a thick column that piles up and spreads as a
    glossy puddle, with highlights on the folds.
- **From the bottle:** gobs and strings, never mist (§2.5, US6659369B1). A
  gob lands as a blob of 0.1–1 mL **(estimate)**.

### 3.5 Paint

- **It is opaque.** "Acrylic paint is opaque, whereas watercolor paint is
  translucent" ([Wikipedia: Acrylic paint](https://en.wikipedia.org/wiki/Acrylic_paint)).
  So it **does not act as a lens**. It hides what is behind it and casts a
  **solid shadow**. Shade it as a lit, coloured film: thickness gives the
  normal, as in dli/paint.
- **Colour mixing:** Kubelka–Munk through spectral.js (§1).
- **Shear-thinning explains how paint runs (computed from Wu 1978**, whose
  numbers are for high-solids spray coatings, so using them for house paint
  is an analogy). With η = K·γ̇^(n−1), K = 5 Pa·sⁿ, n = 0.5:
  - in the nozzle (γ̇ ≈ 10⁴ s⁻¹, **estimate**) η ≈ **0.05 Pa·s**. With a
    0.5 mm orifice **(estimate)**, Oh = η/√(ργL) ≈ 0.31 **(computed)**, above
    the §5.3 atomising limit of 0.2. So **undiluted paint streams** from a
    trigger. Paint thinned about 1:1 with water (η ≈ 20 mPa·s, **estimate**)
    gives Oh ≈ 0.12 and sprays;
  - on the wall (γ̇ 0.1–1 s⁻¹) η ≈ **5–16 Pa·s**, so it sags slowly into
    curtains and drips and then stops.
- **Drying.**
  - Touch-dry in 10–20 min, by evaporation (Acrylic paint).
  - The binder "appears milky or white when wet and clarifies as it dries,
    resulting in a darkening of colors"
    ([Golden, Just Paint](https://justpaint.org/color-shift-shrinkage/)).
  - The film shrinks as the polymer spheres coalesce (same source).
  - **Sim:** η rises as it dries, which freezes the drips. The colour darkens
    a step. The final film is a permanent stain.
- **From the bottle:** a spray only if "thinned" (a lab preset); otherwise a
  stream.

### 3.6 Oil

- **It wets glass, so it does not bead.**
  - Oil (32 mN/m) on a high-energy surface spreads (Wetting).
  - On a real, slightly dirty window: low angles and small drops that flatten
    into lenses, and runs that leave a **continuous film** **(estimate)**.
- **It never dries**: olive oil is non-drying (§3.1). A sprayed pane stays
  oily, and new oil joins the film.
- **It is a stronger lens than water.** **(computed)** f = R/(n−1) ≈ **2.1R**
  for n = 1.47, against 3R for water (water-drops §3.1).
  - The Commons photo of an oil drop on a glass plate held above a printed
    page ([2005-12-25 Magnifying drop](https://commons.wikimedia.org/wiki/File:2005-12-25_Magnifying_drop.jpg),
    looked at here) shows the text **magnified** under the drop.
  - It also shows a **bright focused spot** inside a **dark shadow ring** on
    the paper: the caustic of water-drops §3.4, here with a stronger lens.
  - **It is the side-by-side test for oil.**
- **Rainbow colours, only where the film is thin.** Colour comes from
  interference that depends on local thickness
  ([Wikipedia: Thin-film interference](https://en.wikipedia.org/wiki/Thin-film_interference)).
  - **(computed)** The fringe visibility V = 2√(R₁R₂)/(R₁+R₂) is **0.17 for
    oil on glass** (n 1.47 on 1.52), against **0.48 for oil on water**
    (1.47 on 1.333). The oil–glass interface reflects only 0.03%.
  - **So oil on a window shows faint rainbow fringes**, mostly at the
    feathered edges of a smear, and nothing like the vivid
    [diesel-on-wet-asphalt rainbow](https://commons.wikimedia.org/wiki/File:Dieselrainbow.jpg)
    (looked at here), which is oil on water.
  - **Port `evalIridescence`** with the film thickness taken from the
    trail/film channel, which is only non-zero where the oil film is under
    about 1 µm **(estimate)**.

### 3.7 Honey

- **It cannot be sprayed:** stream only (§2.5).
- **It is a strong amber lens:** n 1.47–1.50 gives f ≈ 2.0–2.1R **(computed)**,
  with absorption rising toward blue.
- **(estimate)** For amber honey, about σ ≈ (0.1, 0.5, 1.9) mm⁻¹ for RGB
  (T through 1 mm ≈ 0.90, 0.61, 0.15).
- **Runs:** a blob creeps at ~1–5 mm/s (§3.1), leaving a thick film behind.
  It never dries, and stays tacky.
- **Temperature matters a lot** (70 P at 30 °C, 600 P at 14 °C). A lab
  "room temperature" control would move it by roughly 10× **(computed** from
  those two values).
- [Fresh honeycomb dripping honey](https://commons.wikimedia.org/wiki/File:Fresh_honeycomb_dripping_honey_India.jpg)
  (looked at here) shows a single thin thread falling from a heavy, glossy
  amber mass.

### 3.8 Trails and smears for every liquid

- A moving drop leaves a film.
- The film comes from the balance of viscosity, gravity and surface tension
  that Landau and Levich solved for a plate pulled out of a liquid
  ([Wikipedia: Landau–Levich problem](https://en.wikipedia.org/wiki/Landau%E2%80%93Levich_problem)).
- The classical result is that the film thickens with the capillary number
  Ca = ηU/γ, roughly as Ca^⅔. That page does not state the exponent, so treat
  it as an **estimate**.
- **Rule for the sim:** the trail-film thickness written into the G channel
  scales as (η·U/γ)^⅔ relative to water. Thick liquids leave thick smears
  (honey, slime, paint), and oil leaves a long-lasting smear because it never
  evaporates.

---

## 4. Reference photographs

These are for side-by-side checks only (rule 5); none ships. "Looked at" means
I opened a 640 px thumbnail and checked it myself.

| # | Photo | Looked at | What it shows | What we must reproduce |
|---|---|---|---|---|
| 1 | [Magnifying drop (oil on glass over print)](https://commons.wikimedia.org/wiki/File:2005-12-25_Magnifying_drop.jpg) | yes | The text is magnified through an oil drop on a raised glass plate; there is a bright caustic spot and a dark ring on the paper | Oil's stronger lens (2.1R); the caustic core and ring from the gap |
| 2 | [Nasal spray in action, on black](https://commons.wikimedia.org/wiki/File:Action_photo_of_nasal_spray_on_a_black_background.jpg) | yes | A narrow cone of lit mist that widens and thins with distance; the fine drops read as glitter | The look of the plume in the lamp beam: drops scatter the lamp; the cone loses density with range (§2.6) |
| 3 | [Slime 02471 Nevit (glue + borax)](https://commons.wikimedia.org/wiki/File:Slime_02471_Nevit.jpg) | yes | Opaque green slime stretched into a long sagging sheet and strings, glossy | The "opaque slime" look; stretching and strings (the tether) |
| 4 | [Pouring Slime](https://commons.wikimedia.org/wiki/File:Pouring_Slime.JPG) | yes | A thick column folding onto itself into a puddle; highlights on the folds | A gob arriving and spreading slowly without splashing |
| 5 | [Blood Spatter Texture](https://commons.wikimedia.org/wiki/File:Blood_Spatter_Texture_-_FREE.jpg) (CC BY 2.0, a cast-off pattern) | yes | Small red stains of mixed size; many are elliptical with a tail in one direction; thin stains are bright red, not dark | Elongation at an angle (W/L = sin α) and tails along the flight; thin = saturated red (Beer–Lambert) |
| 6 | [Diesel rainbow on wet asphalt](https://commons.wikimedia.org/wiki/File:Dieselrainbow.jpg) | yes | Vivid interference bands in an oil film on water | The upper bound: oil on **glass** must be far fainter (V 0.17 vs 0.48, §3.6) |
| 7 | [Fresh honeycomb dripping honey](https://commons.wikimedia.org/wiki/File:Fresh_honeycomb_dripping_honey_India.jpg) | yes | A thin amber thread from a glossy mass | Honey streams; it never mists |
| 8 | [Category: Bloodstains](https://commons.wikimedia.org/wiki/Category:Bloodstains), [Category: Spray bottles](https://commons.wikimedia.org/wiki/Category:Spray_bottles), [Category: Slime (toy)](https://commons.wikimedia.org/wiki/Category:Slime_(toy)) | category pages only | More examples | Pick more when building. I avoided crime-scene photographs on purpose |

**Gap:** I found no free photograph of **blood, oil or paint drops on a
vertical window pane with a scene behind it**. Before tuning blood on glass,
take one ourselves (stage blood or diluted food colouring on a window, lit by
a lamp), or find a CC0 source. Water's set is in water-drops §7.4.

---

## 5. Decisions

### 5.1 Adopt, port, build

- **Build** the sprayer (§2 model) on the tools-survey §4 CPU particle pool,
  with **parcels**, not individual drops.
- **Port** raindrop-fx (already decided). Add three things for the spray:
  1. `sim.addVolume(pane, x, y, V, liquid, vImpact)`;
  2. **condensation from the droplet texture** into sim drops once the local
     volume passes a threshold;
  3. a per-drop **liquid** with its parameter row (§5.2).
- **Adopt** spectral.js (MIT) for paint colour mixing.
- **Port** three.js `evalIridescence` (MIT) for thin oil films.
- **Do not adopt** a grid fluid (TMP 17/18, PavelDoGreat) for slime or blood.
  The motion on glass is contact-line pinning plus viscosity, which the drop
  sim models. Revisit TMP only if honey or paint curtains fail the
  side-by-side check.
- **Engine addition:** liquid colour cannot mix through the drop map's B
  channel (an id under a MAX blend).
  - Add a **second RGBA8 map per pane**: RGB = absorption-weighted colour
    (σ·h, scaled) and A = opacity (paint, opaque slime).
  - It is blended additively like height. That puts it on texture unit 10,
    next to the drop map on 9 (water-drops §7.2).
  - Panes with only water skip it.

### 5.2 Per-liquid parameters for the drop sim

Viscosity factor = η / η_water, used in the friction law. Values in **bold**
are sourced (§3.1); the rest are **(estimate)**.

| Liquid | ρ | η factor | γ (mN/m) | θa / θr | n | σ_rgb (mm⁻¹) or look | Splash | Trail | Drying |
|---|---|---|---|---|---|---|---|---|---|
| water | **1000** | **1** | **72** | **60 / 40** (window) | **1.333** | 0 | Yang (§2.7) | drops + film | evaporates (water-drops) |
| blood | **1055** | **4.8** | **56–59** | 45 / 15 (pins hard) | **1.36** | **(0.5, 29, 34)** | Yang, which splashes earlier | continuous, thicker film | rim gels in about 1 min; dry at 2–5 min per µL; matte, corona and cracks when dry (§3.3) |
| slime, clear | 1000 | 3000 (and τ = **10 s**) | 60 | 60 / 20 | 1.34 | dye from the lab colour; slight scatter blur | never | none; a tether instead | very slow (hours) |
| slime, opaque | 1000 | 3000 (τ 10 s) | 60 | 60 / 20 | – | opaque diffuse colour + gloss | never | tether | very slow |
| paint (thinned) | 1300 | 20 in the nozzle; **5 000–16 000 on the pane**, rising as it dries | **30–65** | 25 / 5 | – | opaque, Kubelka–Munk (spectral.js) | never | curtains and drips | touch-dry **10–20 min**; colour darkens one step |
| oil | **913** | **56** | **32** | 15 / 5 | **1.47** | (0.02, 0.03, 0.3) pale yellow | never | long-lived film; iridescent edges | **never** |
| honey | **1420** | **2 000–10 000** | 55 | 35 / 10 | **1.49** | (0.1, 0.5, 1.9) amber | never | thick film | **never** (tacky) |

The β of the friction law stays 100 for every liquid. That is an
extrapolation above 1 Pa·s, the tested range in water-drops §2.4.

### 5.3 Spray model numbers

| Quantity | Value | Basis |
|---|---|---|
| Volume per full squeeze | **1.0 mL** (range 0.3–1.6 with squeeze depth) | US8322630B2; Innovation Chem |
| Burst length | **120 ms** (75–200 ms) | Giles 2005 (range); the value is an estimate within it |
| Drop size (water, spray) | log-normal by volume, **Dv50 95 µm, σ 0.56** (hard, fast squeeze) to **146 µm, σ 0.67** (slow) | US8322630B2, fitted here (§2.2) |
| Start and end of the burst | first and last **15–50 ms** coarser: **2× Dv50 (estimate**; Giles says only "significantly larger") | Giles 2005 |
| Mist setting | Dv50 **25 µm**, σ 0.5 | CloroxPro (10–30 µm); σ is an estimate |
| Stream setting | a 0.5 mm jet → **0.95 mm** drops, spread 3° | Plateau–Rayleigh (computed); jet size and spread are estimates |
| Exit speed | **15 m/s** (10–20) | the nasal-pump PDA range 6.7–19.2 m/s (estimate by analogy) |
| Cone | **hollow, 60° full angle** for water, narrowing with viscosity (60°·(η_w/η)^0.1, so blood ≈ 51° and thinned paint ≈ 44°; **estimate**) | Spray nozzle (hollow cone); Spraying Systems; Innovation Chem 70–80° |
| Flight | integrate the Schiller–Naumann drag per parcel; parcels that stop become mist | CHAM; §2.6 |
| Mist fallout | stopped parcels settle at their Stokes speed and are deposited as a soft Gaussian over the pane within ±5 cm of where they stopped **(estimate)** | Stokes' law |
| Viscous liquids | Oh = η/√(ργL) at a 0.5 mm orifice. Above **0.2** there is no swirl, so "spray" becomes **stream + gobs** **(threshold estimate)**. **(computed)** Water 0.005, blood 0.027 and thinned paint 0.12 spray; undiluted paint 0.31, oil 0.46, honey and slime ≫ 1 stream. That matches the patent's cooking-oil case | US6659369B1 |
| Splash | **We > 5√Re + 10⁴Re^−¾**, low-viscosity liquids only; 2–6 satellites at 0.1–0.2 of the size, thrown sideways **(estimate)** | Yang 2021; de Goede 2017; Mehdizadeh 2004 |
| Spread on landing | splat D_max = D·We^¼ (low viscosity), D·Re^⅕ (viscous); relax to the cap over ~50 ms **(estimate)** | Clanet 2004; Liu 2025 |
| Oblique stain | ellipse W/L = sin α, with a tail along the flight | NIJ 2017 |
| Parcels per squeeze | 200–400; cap of 400 sim drops per page (water-drops §7.6) | **(estimate)** |
| Sub-texel parcels | stamped into the droplet texture; condense into a drop at ≥ 0.5 µL in a 2 mm cell **(estimate)** | §2.8 |

### 5.4 Lab controls (causes only)

- **Liquid:** water, blood, slime (clear or opaque, plus colour), paint
  (colour, thinned or not), oil, honey.
- **Nozzle:** mist, spray, stream, off.
- **Squeeze:** soft/slow to hard/fast. This sets stroke volume and drop size
  (US8322630B2).
- **Distance to the glass:** sets how much arrives as drops and how much as
  haze, and the cone footprint. The only knob for "how wet".
- **Glass cleanliness:** already planned in water-drops; it sets θ.
- **Room temperature and humidity:** set the drying rate, and honey's
  viscosity (§3.7).
- **No knobs** for drop size, run speed, colour strength or refraction: the
  liquid and the causes set them.

### 5.5 Tests (adding to water-drops §7.5, task 76)

- **Size distribution.** A seeded spray's volume-weighted Dv50 and Dv90 fall
  within 5% of the §5.3 targets.
- **Flight.** A 100 µm parcel at 10 m/s stops before 15 cm. A 300 µm parcel
  reaches 20 cm at 5.8 ± 0.3 m/s (the §2.6 table, JS twin).
- **Splash.** It reproduces de Goede: a 1 mm water drop at 4.7 m/s does not
  splash, and 1 mm blood at 4.7 m/s does.
- **Volume conservation.** Sprayed = on panes + droplet texture + airborne
  mist + off-pane, exactly (extends the existing test).
- **Viscous nozzle.** Choosing slime, honey or oil with the "spray" setting
  emits no parcel below 0.5 mm.
- **Run speeds.** Blood is 4.8 ± 0.3× slower than water. A 1 mL honey blob
  (η 10 Pa·s) moves at 0.9 ± 0.1 mm/s (JS twin of the §3.1 numbers).
- **Coloured shadow.** Behind a 1 mm blood drop, the shadow's green and blue
  are below 1% of the unshadowed light while red is above 15% (pixel test).
- **Oil lens.** At the same height map, oil's sample offset is
  (0.47/0.333) = 1.41× water's.
- **Side by side** with §4 photos 1, 3, 5 and 7, then Ony approves.

### 5.6 Still unknown

- **The trigger's real exit speed and cone angle.** No measurement found;
  the values are an analogy and a vendor figure. A slow-motion phone video of
  a real trigger against a ruler, over black, would settle both.
- **Contact angles on glass** for blood, slime, paint, oil and honey are
  estimates. Blood's initial angle is in Brutin's and Roy's full texts, which
  could not be read.
- **Honey and slime surface tension** are estimates.
- **Drop tails and the corona on vertical glass:** the bloodstain studies
  used horizontal surfaces.
- **The pane's real-world scale** (CSS px to mm), still open from
  water-drops. Every threshold here assumes life size (1 CSS px = 0.265 mm).
- **Ony:** should blood brown over (accelerated) time? Should the spray reach
  page elements other than glass (item 26, the wet layer)? Do phones get the
  spray (water-drops §7.3)?
- **Reference photos** of blood, oil and paint on a vertical window: none
  found (§4).

## Status (2026-10-01)

Spray bottle first cut with `?try=drops` (b00d79d): 1 mL squeezes in a hollow cone (60 degrees for water, narrowing with viscosity), 30% landing from 10 cm as 2000 mist parcels that bead at 0.5 uL a 2 mm cell, slime streaming as gobs (Ohnesorge past 0.2, flow cut by Poiseuille), blood and slime absorbing by Beer-Lambert. Tested: volume conserved into drops plus mist, cone angles, the streaming threshold, the hollow cone. Still to do: flight and drag per parcel, splashes, oblique stains, drying.
