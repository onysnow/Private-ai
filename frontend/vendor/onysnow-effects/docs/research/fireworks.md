# Fireworks (R8)

Research only, 2026-10-01. No code changed. Feeds task 81: photoreal or
photo-derived generative fireworks on the photography site, where every burst
also lights the page through the light list (position, colour, intensity,
decay), and the camera records them the way a real camera would.

Every claim has a source link. **(computed)** marks a number worked out here
from cited formulas (the working is given). **(measured)** marks a number taken
here from a cited, licensed photo or video. **(observed)** marks something seen
in a linked reference photo. **(estimate)** marks a judgement no source states.

Pages that could not be read are listed at the end. The most important gaps
are a measured **star ejection speed** (one 2000 study measured it, but only
the abstract is open) and a **strobe frequency** (none of the open sources
gives one).

---

## 0. Short answer

- **Build it in our engine, as the tools survey already decided**
  ([tools-survey.md §4](tools-survey.md)). Make the fireworks from physics,
  and record them through a camera model (shutter time, clipping, bloom). Use
  real photos and one real video as **calibration targets**, not as sprites.
  None of the web libraries is physical: fireworks-js uses unitless per-frame
  constants and HSL colours, and tsParticles uses pure `#0000FF` blue (§1).
- **Sizes are known.** The Japan Pyrotechnics Association table gives burst
  height and width for each shell size. A 10-go (30 cm) shell bursts at
  **330 m** and spreads **280 m** wide. A 3-go shell bursts at 120 m and
  spreads 60 m
  ([San-en Fireworks, citing JPA 2009](https://san-en-fireworks.com/index/products/productse/)).
  The US rule of thumb is a burst about **90 ft wide per inch of shell**
  ([Fire Engineering](https://www.fireengineering.com/firefighting/fireworks-and-their-hazards/)).
- **Motion: a fast radial kick, quadratic drag, then a slow sag.** The drag
  model is Zohdi's: drag ∝ v², C_D = 0.5 in the stars' Reynolds range
  ([Zohdi 2016, Proc. R. Soc. A](https://pmc.ncbi.nlm.nih.gov/articles/PMC4786048/)).
  A 10-go burst needs stars leaving at about **150 m/s**. They are down to
  about 50 m/s after 1 s, and settle to a **≈25 m/s** fall **(computed)**. A
  burst stays nearly a sphere while its centre sinks
  ([Yamamoto 1996](https://www2.hamajima.co.jp/~tenjin/labo/hanabi.htm)).
- **Timing.** In one CC BY video, a single burst takes **≈0.5 s to reach
  peak brightness**, then fades to black over **≈1.5 s** **(measured)**.
  Willows "hang in the sky ten seconds or more"
  ([Sky King](https://skykingfireworks.com/safety-school/fireworks-glossary/)).
  Time fuses run **3–6 s** before the burst
  ([Skylighter](https://www.skylighter.com/blogs/fireworks-information/aerial-shell-making-charts)).
- **Colour comes from molecular bands, not hues.** The emitters are SrCl red
  (617–646 nm), BaCl green (511–533 nm), CuCl blue (403–456 nm), Na yellow
  (589 nm) and CaCl orange (591–608 nm)
  ([Wikipedia: Pyrotechnic colorant](https://en.wikipedia.org/wiki/Pyrotechnic_colorant)).
  Converting these bands with the CIE curves shows two things **(computed)**.
  Blue gives the eye **≈2%** of the brightness that sodium gives for the same
  watts. Barium green lies far **outside sRGB**. That is why blue is "notoriously
  difficult" and green stars clip on camera.
- **On camera, star cores clip to white and keep their colour only at the
  rim and tips** **(observed)**; see the clipping explanation in
  [Wikipedia: Clipping](https://en.wikipedia.org/wiki/Clipping_(photography)).
  Streaks come from two things: shutter time × speed, and **real spark
  tails**. The spark tails show even at 1/40 s **(observed)**. Smoke builds up
  and is lit by later bursts
  ([B&H](https://www.bhphotovideo.com/explora/photography/tips-and-solutions/how-to-photograph-fireworks)).
- **Lighting the page.** Each burst is an **emitter** in the existing light
  list (`makeEmitter`/`addEmitter`). It is a big, soft, high light: its
  radius is the burst radius, and its charge follows the measured envelope.
  The list holds **4 lights** and silently drops the rest
  (`light-uniforms.ts:17,125`), so bursts beyond the free slots must be
  **merged**. The page light must not flash more than **3 times a second**
  ([WCAG 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)).
  Sound arrives **D/343 s** later
  ([Wikipedia: Speed of sound](https://en.wikipedia.org/wiki/Speed_of_sound)).
- **WebGL1 plan.** Simulate stars on the CPU, with exact drag, in the
  scheduler. Make sparks **stateless on the GPU**: one instanced quad each,
  with its position worked out in closed form in the vertex shader. Instancing
  is on 99.98% of devices
  ([web3dsurvey](https://web3dsurvey.com/webgl/extensions/ANGLE_instanced_arrays)).
  **Correction to the tools survey:** skeeto/webgl-particles does *not* use
  float textures. It packs 16-bit fixed point into RGBA8 bytes and needs only
  vertex texture fetch (§5).

---

## 1. Tools first

Read from the packages themselves (npm tarballs, `git clone`), 2026-10-01.

| Candidate | Licence | Tech | What it actually does (from source) | Fit | Decision |
|---|---|---|---|---|---|
| **fireworks-js** 2.10.8 ([npm](https://www.npmjs.com/package/fireworks-js), [repo](https://github.com/crashmax-dev/fireworks-js)) | MIT | Canvas 2D | Explosion particles get a random angle and a speed of 1–10 px/frame (a filled disc, not a shell). Each frame `speed *= friction` (0.95); `y += sin·speed + gravity` (1.5 px/frame, a *constant* fall, not an acceleration); `alpha -= decay` (0.015–0.03/frame, so a life of 33–67 frames). Colour is `hsla(hue 0–360)`. Trails come from a `destination-out` fill at 0.5 opacity plus `lighter` blending (`dist/index.es.js`) | Frame-rate dependent, unitless, no HDR | **Read only.** Its one good idea is the constant fall, which is really a terminal-velocity model and matches §2.3. Nothing else carries over |
| **@tsparticles/preset-fireworks** 4.4.0 ([npm](https://www.npmjs.com/package/@tsparticles/preset-fireworks)) | MIT | Canvas 2D, engine + 9 plugins | Seven colours `#FF0000 #FF8000 #FFFF00 #00FF00 #00FFFF #0000FF #FF00FF` ±30 S/L. Life 1–2 s, speed 5–15, `decay` 0.075–0.1, gravity 5, trail of 5–10 (`esm/options.js`) | Pure display primaries: magenta and saturated blue are not firework colours (§3) | **No** |
| **skeeto/webgl-particles** ([repo](https://github.com/skeeto/webgl-particles), last commit 2017-05-04) | **Unlicense** ([UNLICENSE](https://github.com/skeeto/webgl-particles/blob/HEAD/UNLICENSE)) | **Raw WebGL1** | Position and velocity live in **RGBA8** textures. Each value is a 16-bit fixed-point number split over two bytes (`encode`/`decode`, `BASE = 255`, in `glsl/update.frag`). Gravity, wind and bounce off obstacles; the draw reads the state in the vertex shader. It refuses to run if `MAX_VERTEX_TEXTURE_IMAGE_UNITS == 0` (`js/particles.js`) | Works without any float extension. Vertex texture fetch is ≥16 units on 100% of reports, ≥8 in Firefox ([web3dsurvey](https://web3dsurvey.com/webgl/parameters/MAX_VERTEX_TEXTURE_IMAGE_UNITS)) | **Port the encode/decode trick** if a stateful GPU tier is ever needed. Probably not needed: see §5.4 |
| Proton, three.quarks, tsParticles engine | MIT | own canvas / three.js | Already surveyed ([tools-survey.md §4](tools-survey.md)) | No | No |
| Caleb Miller's "Fireworks!" CodePen (`codepen.io/MillerTime/pen/XgpNwb`) | Public pens are **MIT** ([CodePen licensing](https://blog.codepen.io/documentation/licensing/)) | Canvas 2D | Could not read: Cloudflare 403 | – | Unverified. Read it for shell-type recipes if it can be reached |
| FWsim / Finale 3D | commercial | desktop | Simulates shells "physically accurately" from launch velocity, size, delay and explosion size ([FWsim](https://www.fwsim.com/doc/how_fireworks_work.html)) | Paid | Ideas only (its parameter list matches §7) |
| Godot CC0 torch shader; Unity Labs **CC0** `CandleSmoke01`; Kenney Particle Pack (CC0) | **CC0** | GLSL-like / textures | Sparks, smoke puffs and smoke flipbooks ([flame.md §1](flame.md)) | Plain textures | **Use for burst smoke** (§2.7) |
| Stock footage: Pexels, Pixabay, Unsplash | **Custom licences, not CC0** | video / photos | Pexels: free, no attribution, but "Don't redistribute or sell" ([licence](https://www.pexels.com/license/)). Pixabay: no "Standalone" distribution ([summary](https://pixabay.com/service/license-summary/)). Unsplash: no "competing service" ([licence](https://unsplash.com/license)) | Outside our permissive list (research-plan rule 2) | Reference only. Shipping footage would need Ony's OK |

**Decision: build.** Nothing to adopt. Port only the fixed-point trick from
skeeto (Unlicense), and only if needed. The physics (§2), colour (§3), camera
(§4) and lighting (§6) are what make this one ours, and no library has any of
them.

---

## 2. Firework physics

### 2.1 Shells: sizes, heights, timing

| Japanese size | Mortar (m) | Burst height (m) | Burst width (m) |
|---|---|---|---|
| 3-go | 0.09 | 120 | 60 |
| 5-go | 0.15 | 190 | 150 |
| 7-go | 0.21 | 250 | 200 |
| 10-go (shakudama) | 0.30 | 330 | 280 |
| 20-go | 0.60 | 450 | 500 |

Source: [San-en Fireworks](https://san-en-fireworks.com/index/products/productse/),
citing the Japan Pyrotechnics Association (2009, pp. 18–19). Japanese
Wikipedia says a 20-go reaches about 500 m across, and a 40-go about 800 m
([ja: 打上花火](https://ja.wikipedia.org/wiki/%E6%89%93%E4%B8%8A%E8%8A%B1%E7%81%AB)).

US rules of thumb ([Fire Engineering](https://www.fireengineering.com/firefighting/fireworks-and-their-hazards/)):

- The lift charge gives "a muzzle velocity of approximately 250 miles per
  hour". That is **112 m/s (computed)**.
- The shell climbs "roughly 120 feet per inch of shell diameter".
- The burst spreads "90 feet in diameter per inch". A 6-inch shell bursts at
  about 700 ft and spreads about 500 ft.
- The time fuse burns "three to six seconds". Skylighter gives 3 s for a
  3-inch shell, 4 s for 5-inch, 5 s for 6-inch and 6 s for 8-inch
  ([charts](https://www.skylighter.com/blogs/fireworks-information/aerial-shell-making-charts)).

Shells are designed to burst at the top of the climb
([FWsim](https://www.fwsim.com/doc/how_fireworks_work.html)). In a
three-break shell, the middle break fires at the apex
([NOVA](https://www.pbs.org/wgbh/nova/fireworks/anat_nf.html)). Display shells
run from 50 mm to over 600 mm
([Wikipedia: Pyrotechnics](https://en.wikipedia.org/wiki/Pyrotechnics)).
Stars start as "half-inch cubes" of composition
([NOVA](https://www.pbs.org/wgbh/nova/fireworks/anat_nf.html)), which is
about a 7.9 mm-radius sphere of the same volume **(computed: (3/4π)^⅓ × 12.7 mm)**.

### 2.2 Shell types and their recipes

| Type | Definition (source) | Engine recipe **(estimate unless sourced)** |
|---|---|---|
| **Peony** | "Spherical break of colored stars that burn without a tail … relatively plentiful and small stars that travel a relatively short distance … before burning out" ([Wikipedia: Fireworks](https://en.wikipedia.org/wiki/Fireworks)). Stars "burn quickly and the fireworks ball expands in a straight radial direction" ([San-en](https://san-en-fireworks.com/index/products/productse/)) | Many small stars on an even sphere. No spark tail. Short burn (≈2 s, §2.4) |
| **Dahlia** | Like a peony but with "relatively few and large stars that travel a relatively long distance" ([Wikipedia](https://en.wikipedia.org/wiki/Fireworks)) | Fewer, bigger stars (lower K, so they fly further). Longer burn |
| **Chrysanthemum** | "Leave a visible trail of sparks" ([Wikipedia](https://en.wikipedia.org/wiki/Fireworks)). It "uses comet stars" ([San-en](https://san-en-fireworks.com/index/products/productse/)) | A peony plus charcoal spark tails |
| **Willow / Kamuro** | "Long-burning silver or gold stars that produce a soft, dome-shaped weeping willow-like effect". Kamuro is "dense … glittering … heavy glitter trail" ([Wikipedia](https://en.wikipedia.org/wiki/Fireworks)). Willows "have the maximum duration and distance of burning … gradually fall with the force of gravity" ([San-en](https://san-en-fireworks.com/index/products/productse/)). A true willow "hang[s] in the sky ten seconds or more" ([Sky King](https://skykingfireworks.com/safety-school/fireworks-glossary/)) | Charcoal (gold) stars with a **10–12 s** burn and long-lived sparks. The stars reach terminal fall, so the dome droops into vertical strands (§2.3) |
| **Palm** | "Relatively few large comet stars … with a thick rising tail" ([Wikipedia](https://en.wikipedia.org/wiki/Fireworks)). A "rising tail … followed by a brocade or willow effect" ([Sky King](https://skykingfireworks.com/safety-school/fireworks-glossary/)) | 6–12 large comets plus a rising tail during the climb |
| **Ring** (Saturn = ring plus peony) | "A circular break of stars that create a ring" ([Wikipedia](https://en.wikipedia.org/wiki/Fireworks)); "a peony with a ring around it" ([Sky King](https://skykingfireworks.com/safety-school/fireworks-glossary/)) | Directions on a great circle, with a random tilt, so it is seen as an ellipse |
| **Crossette** | Large stars "travel a short distance before breaking apart into smaller stars" ([Wikipedia](https://en.wikipedia.org/wiki/Fireworks)). They "split into four parts" ([FWsim](https://www.fwsim.com/doc/how_fireworks_work.html); [Wikipedia: Pyrotechnics](https://en.wikipedia.org/wiki/Pyrotechnics)) | A few comets. At t_split each spawns **4 children** in a cross, perpendicular to its velocity, with a small extra kick |
| **Strobe** | "Colored stars that flash on and off" ([American Pyro](https://www.americanpyro.com/display-fireworks-glossary)); "looks like shimmering water" ([Sky King](https://skykingfireworks.com/safety-school/fireworks-glossary/)). The mechanism is a dark smoulder phase that builds slag, then "a violent … reaction of the slag produces a brilliant flash" (Shimizu, in [Kosanke et al. 2004](#kosanke) §8) | Each star flashes at its **own random phase and rate**. Rate is unsourced, see §7 unknowns. Short flashes |
| **Crackle / dragon eggs** | A star that "first burns for a period … and then loudly deflagrates" ([Wikipedia: Dragon's egg](https://en.wikipedia.org/wiki/Dragon%27s_egg)). It is made with bismuth trioxide and magnalium ([Compound Interest](https://www.compoundchem.com/2015/11/04/fireworksounds/)); the "Crackle Effect … usually accompanied by an aerial gold lace" ([Sky King](https://skykingfireworks.com/safety-school/fireworks-glossary/)) | Gold glitter stars. After a random delay, each pops into a tiny white flash plus a short spray. The sounds are staggered by the delay |
| **Brocade / Horsetail** | Brocade is "a silver tail effect … brighter than the willow" made with glitter ([Sky King](https://skykingfireworks.com/safety-school/fireworks-glossary/)). Horsetail has a "smaller bursting charge … the stars burn for a long time … slowly expands and falls down" ([FWsim](https://www.fwsim.com/doc/how_fireworks_work.html)) | Brocade: willow with silver glitter. Horsetail: low v0 and a long burn |
| **Pistil / heart** | "A ball of stars in the center of another" ([Sky King](https://skykingfireworks.com/safety-school/fireworks-glossary/)). Japanese shells are named by their number of hearts ([San-en](https://san-en-fireworks.com/index/products/productse/)) | A second, smaller sphere (lower v0) in a second colour |
| **Salute** | "Intended to produce a loud report" ([Wikipedia](https://en.wikipedia.org/wiki/Fireworks)); "usually accompanied by a bright white flash" ([NOVA](https://www.pbs.org/wgbh/nova/fireworks/anat_nf.html)) | No stars. One white flash light (≈0.1 s, like `FLASH_DECAY`) plus a sound |
| Colour change | A "dark prime" layer gives "little or no light … between the color changes", and stars change "not … at precisely the same time" (Kosanke §6, [ref](#kosanke)). San-en's "magical peony" stars go dark for a few seconds and then relight ([San-en](https://san-en-fireworks.com/index/products/productse/)) | A colour schedule per star: colour A, then a dark gap, then colour B. Jitter the change time by ±10% per star |

### 2.3 How a star moves

**Model.** Zohdi treats each star as a sphere under gravity and drag
([Zohdi 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4786048/)):

- **m v̇ = −½ ρₐ C_D |v| v A + m g**
- C_D follows Chow's piecewise fit. **C_D = 0.5 for 400 < Re ≤ 3×10⁵**,
  which is the stars' range: Re ≈ 10⁵ at 100 m/s for a 16 mm star
  **(computed: v d / 1.5×10⁻⁵ m²/s)**.
- Zohdi's worked example uses air density 1.225 kg/m³, a 1000 kg/m³ star
  ("porous"), a 3 s time to detonation and a 100 m/s launch.

**Closed forms.**

- Radially, without gravity:
  **r(t) = r₀ + ln(1 + K v₀ t)/K**, with **K = 3 C_D ρₐ / (8 ρ R)**, so
  **v(t) = v₀ / (1 + K v₀ t)** (Zohdi eqs. 2.3, 2.10, 2.11). 1/K is a length
  in metres. Burst size grows with star size and density and shrinks with
  drag.
- Falling under quadratic drag from rest:
  **y = (v∞²/g) ln cosh(g t / v∞)**, with **v∞ = √(g/K)**
  ([Wikipedia: Free fall](https://en.wikipedia.org/wiki/Free_fall)).
- With linear drag, every star thrown at the same speed stays on **a sphere
  of radius (V/k)(1 − e^{−kt})**. Its centre falls toward the terminal speed
  g/k. So "the shape of the firework does not break up even with air
  resistance", and the dome of a willow ends in a **cylinder of radius V/k**
  ([Yamamoto 1996](https://www2.hamajima.co.jp/~tenjin/labo/hanabi.htm)).

**Numbers (computed).** C_D = 0.5, ρₐ = 1.225 kg/m³, star density 1000–1500
kg/m³ **(estimate: Zohdi's 1000 is "a neutral option" for porous stars)**:

| Star radius | Density | K (1/m) | 1/K (m) | Terminal fall v∞ (m/s) |
|---|---|---|---|---|
| 5 mm | 1500 | 0.031 | 33 | 18 |
| 8 mm | 1500 | 0.019 | 52 | 23 |
| 12 mm | 1500 | 0.013 | 78 | 28 |

The ejection speed needed to reach each JPA half-width by burn-out time t_b
(from r = ln(1 + K v₀ t_b)/K) **(computed)**:

| Shell | Half-width | 8 mm stars, t_b 1.5 / 2.5 / 3.5 s | 12 mm stars, t_b 1.5 / 2.5 / 3.5 s |
|---|---|---|---|
| 3-go | 30 m | 27 / 16 / 12 m/s | 24 / 15 / 10 m/s |
| 5-go | 75 m | 112 / 67 / 48 | 84 / 50 / 36 |
| 7-go | 100 m | 201 / 121 / 86 | 135 / 81 / 58 |
| 10-go | 140 m | 473 / 284 / 203 | **260 / 156 / 111** |
| 20-go | 250 m | (unphysical) | 1217 / 730 / 522 |

Bigger shells therefore need **bigger stars**, not only faster ones. A 20-go
needs stars well above 12 mm **(computed)**. Measured star ejection speeds
exist: Takishita et al. recorded "star ejection velocity" for 82 mm Japanese
shells ([OSTI abstract](https://www.osti.gov/etdeweb/biblio/20070595)). Only the
abstract is open, so we have no number from them. **Use v₀ ≈ 150 m/s with
12 mm stars for a 10-go (computed above), and check it against the video in
§4.**

**A full simulation (computed)** of that 10-go star (12 mm, v₀ = 150 m/s,
ODE with quadratic drag and gravity, 1 ms steps):

| t (s) | Horizontal star: x, y (m) | Speed (m/s) | Upward star: height | Downward star: depth |
|---|---|---|---|---|
| 0.25 | 31, −0.3 | 101 | 30 | −31 |
| 0.5 | 53, −1.0 | 77 | 52 | −53 |
| 1 | 84, −3.6 | 52 | 81 | −87 |
| 2 | 123, −13 | 33 | 114 | −132 |
| 3 | 148, −27 | 27 | 129 | −168 |
| 5 | 179, −67 | 26 | 128 (falling) | −228 |

What this means visually **(computed)**:

1. The burst reaches **a third of its final size in 0.25 s and 60% in 1 s**.
   It *pops* and then *hangs*.
2. It is an **egg slightly wider at the bottom**: at 2 s it reaches 114 m up
   and 132 m down.
3. After about 3 s, every star falls at about 25–28 m/s. That is the willow
   droop, and the constant fall in fireworks-js.

The closed-form radius matches the full simulation to within 1% at 2 s and
4 s. The ln-cosh sink overestimates the fall by 35–40% (18 vs 13 m at 2 s, 61 vs 45 m at 4 s), because the
horizontal drag also brakes the vertical speed. So **integrate stars
numerically** (§5.4), and keep the closed forms for sparks and tests.

### 2.4 Burn times

| Effect | Burn time | Source |
|---|---|---|
| Time fuse before burst | 3–6 s by shell size | [Fire Engineering](https://www.fireengineering.com/firefighting/fireworks-and-their-hazards/), [Skylighter](https://www.skylighter.com/blogs/fireworks-information/aerial-shell-making-charts) |
| One burst in a Nagaoka starmine, frame-mean brightness | **rise ≈0.5 s, fall to black ≈1.45 s** (first burst: 0.60 → 1.16 → 2.60 s); a mid-show burst rose ≈0.9 s and fell ≈1.2 s | **(measured)** from the CC BY 3.0 [Nagaoka 2015 video](https://en.wikipedia.org/wiki/File:Nagaoka_Festival_Fireworks_2015_Extra_Large_Wide_Starmine.webm), 25 fps, mean luma of 107×60 frames. Auto-exposure and compression blur this; the "rise" is mostly the burst growing |
| Willow | ≥10 s | [Sky King](https://skykingfireworks.com/safety-school/fireworks-glossary/) |
| Glitter tail | "several seconds" | [Sky King](https://skykingfireworks.com/safety-school/fireworks-glossary/), [Penguin Pyro](https://penguinpyro.com/pyro-glossary) |
| Falling leaves / dragon eggs | "a few seconds" | [Sky King](https://skykingfireworks.com/safety-school/fireworks-glossary/), [Keystone](https://keystonefireworks.com/news/types-of-fireworks-effects/) |
| Peony star | ≈1.5–2.5 s | **(estimate)** from the measured envelope and the "short distance" definition |
| Comet / chrysanthemum | ≈2.5–4 s | **(estimate)** |
| Rising tail | = the fuse time (3–6 s) | from the sources above |

### 2.5 Trails and sparks

Spark colour follows the metal. Low electronegativity burns hotter, so its
sparks look whiter. Kosanke et al. ([ref](#kosanke), p. 8-10) list spark
colours by element:

| Spark material | Colour |
|---|---|
| Carbon | orange |
| Iron | yellow |
| Aluminium | pale yellow to white |
| Titanium | pale yellow to white |
| Zirconium | white |
| Magnesium | white (but it vaporises, so it makes few sparks) |

Wikipedia adds detail
([Pyrotechnic star](https://en.wikipedia.org/wiki/Pyrotechnic_star)):

- Charcoal "makes dim gold sparks".
- Iron makes "gold sparks". Steel makes "branching yellow-orange sparks".
- Coarse titanium makes "branching blue-white sparks".
- Ferrotitanium makes "bright yellow-white sparks".

How long a spark lives:

- For metals, "it is primarily particle size that determines a metal spark's
  duration" (Kosanke p. 8-12).
- Charcoal sparks last long because molten black-powder residue
  (K₂CO₃, K₂S) protects the carbon from burning off too fast (pp. 8-14 to
  8-16).
- "Firefly" sparks change from dim gold to bright silver as aluminium flakes
  ignite (p. 8-18).
- Glitter is a spark with a **delayed flash reaction** (p. 8-38).

So in the engine **(estimate)**:

- A spark is a tiny particle shed by its parent star with a little
  sideways jitter. It has its own drag (very high K, so it stops almost at
  once and then sinks slowly) and a lifetime.
- Its colour is a **blackbody** through the engine's `blackbodyRgb()`:
  charcoal about 1800–2000 K (gold), titanium and aluminium about
  2800–3200 K (white). These temperatures are **estimates** to be fitted to
  the photos.
- A glitter spark is dark for a random delay, then gives one short white
  flash.

### 2.6 Smoke

- Smoke is "tiny [≪0.0001 in.] solid or liquid particles". Flash powder
  smoke is solid Al₂O₃ (Kosanke §9, [ref](#kosanke)).
- "Fireworks leave smoke in the sky … the earliest starbursts are going to
  be the 'cleanest' unless a nice breeze is keeping the smoke moving"
  ([B&H](https://www.bhphotovideo.com/explora/photography/tips-and-solutions/how-to-photograph-fireworks)).
- In the 1/40 s reference photo, dense white puffs sit inside the burst and
  are lit by it **(observed)**: [Kluft, Cameron Park 2009](https://en.wikipedia.org/wiki/File:Kluft-photo-fireworks-Cameron-Park-June-2009-Img_2951c2.jpg).
- In the 30 s photo, a grey haze drifts beside the bursts **(observed)**:
  [Ilotulitus 2014](https://en.wikipedia.org/wiki/File:Ilotulitus_2014_-_panoramio.jpg).

Engine **(estimate)**: each burst leaves a few CC0 smoke-sprite puffs
([flame.md §1](flame.md)) at its centre and along comet paths. They grow,
drift with the wind, and last tens of seconds. They are dark against the
sky until a burst's emitter lights them (§6).

---

## 3. Colour chemistry

### 3.1 The emitters

| Colour | Emitter | Bands (nm) | Notes | Source |
|---|---|---|---|---|
| Red | **SrCl** | 617–623, 627–635, 640–646 | Needs a chlorine donor. SrO is "less desirable", so compositions are made oxygen-deficient | [Wikipedia: Pyrotechnic colorant](https://en.wikipedia.org/wiki/Pyrotechnic_colorant) |
| Red | SrOH | 600–613 | Comes from the binder's hydrogen | same; Kosanke §6 |
| Orange | **CaCl** | 591–599, 603–608 | – | same |
| Yellow | **Na** D-line | 589 | "Very strong, overpowers other colours" | same |
| Green | **BaCl** | 511–515, 524–528, 530–533 | BaOH and BaO add yellow-green. **Ba⁺ emits blue at 455.4 nm**; potassium suppresses it | same |
| Blue | **CuCl** | intense 403–456, weaker 460–530 | CuCl breaks up when hot, giving green-yellow CuOH and orange-red bands. Blue is "notoriously difficult", and "a deep, rich blue is usually viewed as the mark of an experienced fireworks maker" | same |
| White / silver | Al, Mg, Ti incandescence | continuous | Solid particles "emit black-body radiation that causes 'washing out' of the colours" | same |
| Gold | charcoal, iron sparks | continuous (blackbody) | – | §2.5 |

### 3.2 How each looks to the eye and on screen (computed)

Each emitter is taken as flat across its bands (an **estimate**). It is then
integrated through the CIE 1931 multi-lobe fit
([Wyman, Sloan & Shirley 2013, JCGT](https://jcgt.org/published/0002/02/01/))
and converted to linear sRGB with the standard D65 matrix
([Wikipedia: sRGB](https://en.wikipedia.org/wiki/SRGB)). Y is per unit
radiant power, with 1.0 = 555 nm.

| Emitter | Y per watt (eye weight) | CIE xy | Linear sRGB, max = 1 | Reading |
|---|---|---|---|---|
| Na 589 | 0.78 | 0.567, 0.433 | 1.00, 0.23, **−0.05** | Saturated amber. Clips to orange-yellow |
| CaCl | 0.65 | 0.618, 0.382 | 1.00, 0.08, −0.03 | Red-orange |
| SrOH | 0.55 | 0.652, 0.348 | 1.00, 0.01, −0.02 | Red |
| SrCl | 0.26 | 0.708, 0.292 | 1.00, **−0.08**, −0.01 | Deep red, slightly outside sRGB |
| BaCl | 0.74 | 0.111, 0.804 | **−0.65**, 1.00, −0.05 | Far outside sRGB. Shows as clipped pure green |
| CuCl (403–456 only) | **0.015** | 0.166, 0.011 | 0.13, −0.12, 1.00 | Violet-blue, very dim to the eye |
| Ba⁺ 455.4 | 0.045 | 0.150, 0.021 | 0.04, −0.08, 1.00 | The blue contamination in green |

What follows from the table:

- **Brightness.** For equal radiant output, blue looks **≈50× dimmer than
  green** and red looks **≈3× dimmer than green** **(computed: 0.015 vs 0.74;
  0.26 vs 0.74)**. So a "photoreal" blue burst must be dim or near-white.
  Do not give it the same gain as the others.
- **Gamut.** The engine works in linear RGB. Store each chemistry as its
  **spectral XYZ** and map it to the working space with a gamut clip. Do not
  store hand-picked hexes. The light it *casts* on the page (§6) uses the
  same colour.
- **Absolute brightness.** No open source gives candela for a display star.
  For scale only: SOLAS marine flares must give **15,000 cd for 60 s**
  (hand-held) and **30,000 cd for 40 s** (aerial)
  ([Wikipedia: Flare](https://en.wikipedia.org/wiki/Flare_(pyrotechnic))).
  Their bright red/aluminium compositions were raised by +72%
  ([red tracer study](https://www.sciencedirect.com/science/article/pii/S221491471730034X))
  and +287% ([yellow](https://www.sciencedirect.com/science/article/pii/S2214914716301179))
  in research. Absolute star brightness stays an **unknown**. **Calibrate gain
  by eye** against the photos in §4.4.

### 3.3 How the colours look on camera

- Clipping "may occur in any of the image's color channels separately". The
  clipped area "will typically be completely white". When only one channel
  clips it shows "distorted color"
  ([Wikipedia: Clipping](https://en.wikipedia.org/wiki/Clipping_(photography))).
- In the photos, red and green stars have **white cores** and are coloured
  only at their tips and in their dimmer tails **(observed)**:
  [San Diego (PD)](https://en.wikipedia.org/wiki/File:San_Diego_Fireworks.jpg)
  and [Portland 10 s](https://en.wikipedia.org/wiki/File:Fireworks_PDX_1.jpg).
- In all five reference photos, 0.9–2.3% of the pixels have at least one
  channel clipped, and **0.2–0.5% have all three clipped** **(measured**,
  960 px versions**)**. So clipping is confined to the cores; the frame is
  not washed out.

---

## 4. How cameras record fireworks

### 4.1 Still photography (long exposure)

- The usual settings are ISO 100–200 and f/8 to f/11–16 on Bulb: "open the
  shutter when the shell bursts and then close it when the streaks have
  tapered off". "It is very easy to overexpose"
  ([B&H](https://www.bhphotovideo.com/explora/photography/tips-and-solutions/how-to-photograph-fireworks)).
- A black card over the lens can gather several bursts into one frame (same
  source).
- In a long exposure, "only bright objects leave visible trails"
  ([Wikipedia: Long-exposure photography](https://en.wikipedia.org/wiki/Long-exposure_photography)).

Streak length is the distance the star covers while the shutter is open.
With §2.3 speeds, a 10-go star crosses **84 m in its first 1 s** but only
**≈27 m/s × T** late in its life **(computed)**. So a 4 s exposure that
starts at the burst draws long, straight-ish rays that bend into droops at
their tips. That is the chrysanthemum-in-a-photo look.

### 4.2 Video

- At 24 fps a "180° shutter angle is considered normal"; 1/50 s is 173°
  ([Wikipedia: Rotary disc shutter](https://en.wikipedia.org/wiki/Rotary_disc_shutter)).
  A 150 m/s star moves 3 m in 1/50 s **(computed)**, which is a dot or a
  short dash at burst scale.
- **Yet at 1/40 s the Kluft photo still shows streaks** **(observed)**.
  These are real spark tails, not motion blur. Our trails therefore come from
  **two sources**: the spark particles (always there) and the shutter
  integration (camera-dependent).
- A CMOS rolling shutter can catch a flash in only some rows
  ([Wikipedia: Rolling shutter](https://en.wikipedia.org/wiki/Rolling_shutter)).
  This is an optional artefact for salutes and strobes.

### 4.3 Why CG fireworks look fake (estimate, with what each rests on)

1. **Display primaries** (magenta, `#0000FF`, cyan), as in the tsParticles
   preset (§1), instead of band colours with real luminance (§3.2).
2. **No clipping.** Cores should go white and colour should stay at the rims
   (§3.3). Bloom is an artefact of "real-world cameras" in which bright light
   "appears to bleed beyond its natural borders"
   ([Wikipedia: Bloom](https://en.wikipedia.org/wiki/Bloom_(shader_effect))).
   The engine's HDR + bloom stage ([tools-survey.md §10](tools-survey.md))
   does this.
3. **A uniform speed distribution**, as in fireworks-js's 1–10 px/frame,
   fills a disc. Real stars share one v₀, so they make a **shell** (§2.3).
4. **Constant drag or friction per frame**, which depends on the frame rate.
   Real drag is quadratic, so the pop is fast and the hang slow (§2.3).
5. **No sag.** The burst centre should sink at up to v∞ ≈ 25 m/s (§2.3).
6. **Everything ends at once.** Real stars die over a spread of times and
   change colour at different moments (Kosanke §6).
7. **No smoke**, or smoke that is never lit (§2.6), and no light on the
   surroundings: water reflections show in the 30 s and 10 s photos
   **(observed)**.
8. **Wrong timescale.** Space can be scaled to the page, but time must stay
   in real seconds (§7).

### 4.4 Reference photos and video

Links only. None of these is shipped.

| Reference | Licence | Shutter / settings (EXIF) | Use it to check |
|---|---|---|---|
| [Ilotulitus 2014](https://en.wikipedia.org/wiki/File:Ilotulitus_2014_-_panoramio.jpg) | CC BY 3.0 | **30 s**, f/7.1, ISO 100 | Full long exposure, smoke haze, water reflection |
| [Fireworks PDX 1](https://en.wikipedia.org/wiki/File:Fireworks_PDX_1.jpg) | CC BY-SA 3.0 / GFDL | 10 s, f/11, ISO 200 | Palms and comets, white cores with red tips, water light |
| [Tybee Island July 4](https://en.wikipedia.org/wiki/File:Tybee_island_georgia_july_4_fireworks.jpg) | CC BY 2.5 | 15 s, f/8 | Long exposure |
| [Feu d'artifice 288](https://en.wikipedia.org/wiki/File:Feu_d%27artifice_-_288.jpg) | CC BY-SA 4.0 | 3.8 s, f/11, ISO 100 | A medium exposure |
| [Düsseldorf 2007](https://en.wikipedia.org/wiki/File:Duesseldorf_Firework_2007.jpg) | CC BY-SA 3.0 | 2.7 s, f/13, ISO 200 | A medium exposure |
| [Kluft, San Jose 2007](https://en.wikipedia.org/wiki/File:Fireworks_in_San_Jose_California_2007_07_04_by_Ian_Kluft_img_9618.jpg) | CC BY-SA 2.5/3.0 / GFDL | 2 s, f/13, ISO 1600 | – |
| [Kluft, San Jose 2008](https://en.wikipedia.org/wiki/File:Kluft-photo-fireworks-San_Jose-July_4_2008-Img_1198.jpg) | CC BY-SA 3.0 / GFDL | 1 s, f/4.5, ISO 1600 | – |
| [Kluft, Cameron Park 2009](https://en.wikipedia.org/wiki/File:Kluft-photo-fireworks-Cameron-Park-June-2009-Img_2951c2.jpg) | CC BY-SA 3.0 / GFDL | **1/40 s**, f/4, ISO 200 | **The video look**: spark tails, lit smoke puffs |
| [Fireworks 2021-07-04 (4)](https://en.wikipedia.org/wiki/File:Fireworks_2021-07-04_(4)_jeh.jpg) | CC BY 4.0 | 1/30 s, f/3.3, ISO 1600 | The video look |
| [San Diego Fireworks](https://en.wikipedia.org/wiki/File:San_Diego_Fireworks.jpg), [White bright fireworks](https://en.wikipedia.org/wiki/File:White_bright_fireworks.jpg), [Grand finale](https://en.wikipedia.org/wiki/File:Grand_finale.jpg) | **Public domain** | – | Colour clipping, white stars |
| [Spider firework, Omiya](https://en.wikipedia.org/wiki/File:Spider-Firework-Omiya-Japan.jpg) | Public domain | – (240 px) | Willow / spider shape |
| [Nagaoka 2015 starmine (video)](https://en.wikipedia.org/wiki/File:Nagaoka_Festival_Fireworks_2015_Extra_Large_Wide_Starmine.webm) | CC BY 3.0 | 25 fps, 720p, 66 s | Brightness envelope (§2.4), flash-to-sound delay (§6.3) |
| [Fireworks in distance 5 (audio)](https://en.wikipedia.org/wiki/File:Fireworks_in_distance_5.ogg) | **Public domain** (pdsounds) | 50 s | The **one shippable sound**: distant bursts and crackle |
| [Coloured flames of metal salts](https://en.wikipedia.org/wiki/File:Coloured_flames_of_methanol_solutions_of_metal_salts_and_compounds.jpg) | CC BY-SA 4.0 | – | Na/Sr/Ba/Cu/Ca hues on a phone sensor |

**CC0 / public-domain sources for shipped sprites:** the PD images above;
Unity Labs CC0 flipbooks and the Kenney CC0 pack for smoke
([flame.md](flame.md)); and the PD pdsounds audio. Wikimedia Commons search
was rate-limited (429) during this research, so a wider CC0 search is still
to do (§7).

---

## 5. Photo-derived versus generative

### 5.1 Real footage or sprites

Pros: a real look for free. Cons:

- Footage cannot cast light into our list (no positions or colours).
- It is a fixed resolution and fixed timing.
- The licences are not permissive (Pexels, Pixabay and Unsplash, §1).
- A CC0 video of single shells on black was not found.

**Reject as the main approach.** Keep it as an **A/B test**, as flame.md did
for the flame flipbook.

### 5.2 Extracting trails from a photo

Threshold a long-exposure photo, skeletonise it into polylines, and replay
them as star paths **(estimate)**. It gives exact real shapes, but they are
frozen in one pose and one camera. It also cannot reproduce the timing
(when a star was where) from a still. **Reject.** Use photos as *targets*
instead (§7 tests).

### 5.3 Generative from physics plus a camera model

This is **the chosen approach**:

- Physics from §2: SI units with real seconds.
- Colour from §3: spectral XYZ to linear RGB.
- The **camera** from §4: shutter integration, clipping, bloom. The camera
  belongs in `effects/camera/camera.ts`, which "is how the picture is
  recorded, not what light exists".

### 5.4 What ports to raw WebGL1, and the tiering

**Stars (100–300 per shell, a few thousand in a finale, per the tools
survey):**

- Integrate on the CPU in the scheduler with the exact quadratic drag ODE
  (§2.3). Use fixed 1/240 s substeps **(estimate)**; the closed form is used
  only for tests.
- Keep a ring buffer of the last N positions per star (N ≈ 32, **estimate**)
  for the shutter ribbon. Upload it as one dynamic vertex buffer each frame.
- Draw each star as an **additive ribbon** covering [t − shutter, t] into the
  HDR target.

**Sparks (10⁴–10⁵):**

- When a spark is born, the CPU writes its birth position, birth velocity,
  birth time, type and seed into an instance ring buffer.
- The **vertex shader** works out its position in closed form with linear
  drag, p(t) = p₀ + (v₀/k)(1 − e^{−kt}) − (g/k)t + (g/k²)(1 − e^{−kt})
  ([Yamamoto 1996](https://www2.hamajima.co.jp/~tenjin/labo/hanabi.htm)).
  It also works out its age, blackbody colour and glitter flash from the
  seed. No per-frame CPU work is needed.
- This uses `ANGLE_instanced_arrays`, which is on **99.98%** of devices
  ([web3dsurvey](https://web3dsurvey.com/webgl/extensions/ANGLE_instanced_arrays)).
- It needs no float textures and no ping-pong. That is why the skeeto port
  is probably unnecessary. Keep it in reserve for collisions (sparks landing
  on the glass, task 84 dust).

**Smoke:** a few dozen CC0 sprite puffs per burst, drawn before the stars and
lit by the burst emitters (§6).

**Post:** the shared HDR + bloom + tone-map stage
([tools-survey.md §10](tools-survey.md)). Clipping comes from the tone map's
shoulder plus per-channel saturation.

**Rejected:** fireworks-js and tsParticles (Canvas 2D, their own canvas,
unphysical; §1) and three.js-based systems (WebGL2/three, tools survey §4).

---

## 6. How a burst lights its surroundings

### 6.1 Shape of the light over time

- **Burst flash.** A salute is "a bright white flash"
  ([NOVA](https://www.pbs.org/wgbh/nova/fireworks/anat_nf.html)). Reuse the
  existing flash pulse (`FLASH_DECAY = 0.12 s`, `lights.ts:179`) **(estimate:
  close to a flash-powder report)**.
- **Star light.** In the measured envelope, light grows to a peak in about
  0.5 s and then falls almost linearly to zero over about 1.5 s (§2.4).
  Willows keep a low glow for 10 s and more. Strobes add flicker. Crackle adds
  a burst of sharp pops at the end.
- **Light charge (estimate):**
  charge(t) = Σ over live stars of (intensity × eye weight from §3.2) ÷ the
  peak sum.
  This comes straight from the star simulation, so every shell type gets the
  right envelope with no extra code.

### 6.2 As an entry in our light list

Map each burst to `makeEmitter()` + `addEmitter()`
([lights.ts](../../src/effects/light/lights.ts)):

| Light field | Value **(estimate)** | Why |
|---|---|---|
| `x, y` | The burst centre in the viewport. It sinks with the burst (§2.3) | – |
| `radius` | The burst's current radius in CSS px | An area light the size of the burst gives soft, broad shadows ([shadows.md](shadows.md)) |
| `height` | Large: the sky. Several × the viewport width | A distant source lights the page almost evenly |
| `colour` | The power-weighted mean of the live stars' chemistry colours (§3.2), in true chemistry colour, **not** the clipped white the camera records | The camera clips. The scene light does not |
| `level` / `charge` | The §6.1 envelope × the lab "Burst light" gain | – |

**Slots.**

- `MAX_LIGHTS = 4` (`light-uniforms.ts:17`), and uploads past that are
  dropped (`Math.min(lights.length, MAX_LIGHTS)`, line 125).
- The lamp always takes one slot, and the flash, flare or torch may take
  others (`pointLights()`, `lights.ts:503`).
- So **at most 3 burst lights** **(computed: 4 − the lamp)**.
- When more bursts are alive, **merge** the extras into the nearest burst
  light. Sum their power and use power-weighted position, radius and colour,
  so the page brightness is conserved **(estimate)**.

**Smoke.** Smoke puffs are lit by the same emitters, with a forward-scatter
boost when the burst is behind them **(estimate)**. That gives the "smoke lit
from inside" look of the 1/40 s reference (§2.6).

**Safety.**

- WCAG: "Web pages do not contain anything that flashes more than three
  times in any one second period". A general flash is a change of
  ≥20 cd/m² where the darker state is below 160 cd/m²
  ([WCAG 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)).
- Strobe shells and crackle must therefore **not modulate the page light**
  faster than 3 Hz. Their flicker stays in the star sprites, which are small.
  Rate-limit large changes in page brightness.
- Under `prefers-reduced-motion`, a setting to "minimize the amount of
  non-essential motion"
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)),
  show a still long-exposure frame instead.

### 6.3 Sound delay

- Sound travels at **343 m/s at 20 °C**: 1 km takes 2.92 s
  ([Wikipedia: Speed of sound](https://en.wikipedia.org/wiki/Speed_of_sound)).
- So delay = viewer distance / 343. A 10-go burst (330 m up) seen from 500 m
  away is about **600 m** from the eye, which is **1.7 s (computed:
  √(330² + 500²) / 343)**.
- In the Nagaoka video, sound onsets correlate best with brightness onsets
  at a lag of **≈1.1 s** (r = 0.15–0.30), which is about 380 m away
  **(measured, weak)**.
- Audible media is blocked from autoplay until "the user has interacted with
  the site" ([MDN Autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)).
  So sound is **off by default** and enabled by a click. The PD pdsounds
  recording (§4.4) is the source.

---

## 7. Decisions

### Approach

- **Build** the fireworks in our engine.
  - Physics: CPU stars with quadratic drag, plus closed-form GPU sparks via
    `ANGLE_instanced_arrays` (§5.4).
  - Colour: spectral chemistry (§3.2). Light: emitters in the light list
    (§6.2). Camera: shutter ribbons, clipping and bloom (§4).
- **Port:** nothing now. If a stateful GPU tier is needed, take the RGBA8
  fixed-point state encoding from skeeto/webgl-particles (Unlicense).
- **Adopt** CC0 smoke sprites (Unity Labs `CandleSmoke01`, Kenney) and the
  PD pdsounds audio.
- Photos and video are **calibration targets only**.

### Numbers to use

| Quantity | Value | Source |
|---|---|---|
| Burst width by shell | 60 / 150 / 200 / 280 / 500 m (3/5/7/10/20-go) | JPA via [San-en](https://san-en-fireworks.com/index/products/productse/) |
| Burst height | 120 / 190 / 250 / 330 / 450 m | same |
| Fuse to burst | 3–6 s | [Skylighter](https://www.skylighter.com/blogs/fireworks-information/aerial-shell-making-charts) |
| Lift speed | ≈112 m/s | [Fire Engineering](https://www.fireengineering.com/firefighting/fireworks-and-their-hazards/) |
| Drag | F = ½ρₐC_D A v², C_D = 0.5, ρₐ = 1.225 | [Zohdi 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4786048/) |
| Star radius / density | 8–12 mm / 1000–1500 kg/m³ | **(estimate**, NOVA ½-inch cubes**)** |
| Star ejection v₀ (10-go) | ≈150 m/s; scale per shell from the §2.3 table | **(computed)** |
| Terminal fall | 18–28 m/s | **(computed)** |
| Burn times | peony ≈2 s, comet ≈3 s, willow 10–12 s, glitter "several" s | §2.4 |
| Light envelope | rise ≈0.5 s, fall ≈1.5 s for a peony | **(measured)** |
| Crossette split | 4 children | [FWsim](https://www.fwsim.com/doc/how_fireworks_work.html) |
| Colours | SrCl, SrOH, CaCl, Na, BaCl, CuCl band tables → XYZ | [Pyrotechnic colorant](https://en.wikipedia.org/wiki/Pyrotechnic_colorant), [JCGT](https://jcgt.org/published/0002/02/01/) |
| Eye weight per watt | Na 0.78, BaCl 0.74, CaCl 0.65, SrOH 0.55, SrCl 0.26, CuCl 0.015 | **(computed)** |
| Spark colour | charcoal ≈1900 K, Ti/Al ≈3000 K via `blackbodyRgb` | **(estimate)**; colour order from Kosanke |
| Sound | 343 m/s | [Wikipedia](https://en.wikipedia.org/wiki/Speed_of_sound) |
| Page-light flash limit | ≤3 per second | [WCAG 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) |
| Burst light slots | ≤3, merge the rest | `light-uniforms.ts:17,125` **(computed)** |

**Scaling to the page (estimate).** Choose **metres per CSS px** so that a
10-go burst spans about 45% of the viewport width. Keep **time real**: g is
9.81 m/s² ÷ (m/px). Space can be scaled, but the eye judges the timing.

### Lab controls

- **Shell:** type (peony, dahlia, chrysanthemum, willow/kamuro, palm, ring,
  Saturn, crossette, strobe, crackle, brocade, horsetail, pistil, salute) and
  size (3–20 go).
- **Stars:** count, radius, density, burn time, burn-time spread, colour 1
  and 2 (by chemistry), change time, dark-prime gap.
- **Sparks:** type (charcoal, iron, titanium, glitter, firefly), rate, life,
  temperature.
- **Specials:** crossette split time; strobe rate and duty; crackle delay
  range; rising tail on/off.
- **Sky:** metres per px, wind, smoke amount, smoke life, launch cadence and
  finale.
- **Camera:** shutter time (1/50 s video up to 30 s Bulb), black-card
  multi-burst, exposure, clip knee, and bloom (from the shared stage).
- **Light:** burst light gain, height, max burst lights (1–3), merge on/off,
  flash limiter on/off (on by default).
- **Sound:** on/off, viewer distance (sets the delay).

### Tests

**Unit tests**

- Closed-form radius r(t) = ln(1 + Kv₀t)/K matches the ODE to within 2%
  (gravity off).
- The burst half-width at burn-out is within ±15% of the JPA table for each
  shell size.
- Terminal speed is √(g/K).
- Crossette children conserve the parent's momentum.
- The chemistry colours keep their hue order. Na: r > g > b. BaCl: g is
  dominant. CuCl: b is dominant. Each has the eye weights above.
- The emitter merge conserves total power.
- The page-light flash counter never exceeds 3 transitions per second for
  strobe and crackle shells.
- Sound delay = distance/343.
- Reduced motion shows a still frame.
- The time step is frame-rate independent: the result at 30 fps matches
  the result at 144 fps.

**Visual tests, side by side in the lab**

| Lab shutter | Reference |
|---|---|
| 1/40 s | Kluft Cameron Park |
| 2.7 s | Düsseldorf |
| 10 s | Portland |
| 30 s | Ilotulitus |

Match the share of fully clipped pixels (0.2–0.5%, §3.3) and the coloured
rims.

**Envelope test.** Compute the frame-mean brightness of a lab peony with
the same method as §2.4: rise 0.5–0.9 s, fall 1.2–1.5 s.

**Performance.** Three 10-go shells at once (≈900 stars, ≈20k sparks) take
**under 2 ms CPU and under 3 ms GPU** on a mid-range phone (**estimate,
target**).

### Still unknown

1. **Measured star ejection speeds.** The Takishita et al. 2000 numbers are
   paywalled. §2.3 derives them from burst sizes instead.
2. **The strobe rate (Hz)** of real strobe stars. Corbel et al. 2013
   (Angewandte Chemie) and the J. Pyrotechnics strobe paper describe the
   mechanism but give no open number. Until measured from a licensed video,
   it is a lab control.
3. **Absolute star intensity (cd).** Calibrate by eye (§3.2).
4. **The real peony burn time** in a single-shell video. Our only
   measurement is a starmine. Find a CC0/PD single-shell clip when Commons
   stops rate-limiting.
5. Smoke density and lifetime: no numbers found.
6. Whether 3 burst lights are enough, or whether the light list needs a
   cheap "sky" term that sums all bursts.
7. The Caleb Miller CodePen (MIT) contents. It was blocked.

---

## Sources not linked inline

<a id="kosanke"></a>**Kosanke et al. 2004.** K. L. Kosanke, B. J. Kosanke,
C. Jennings-White, *Lecture Notes for Pyrotechnic Chemistry*, Journal of
Pyrotechnics, 2004, ISBN 1-889526-16-9
([catalogue entry](http://www.iri.upc.edu/people/thomas/Collection/details/43340.html)).
It was read from an online copy of the 2004 edition. Page numbers are the
book's (§6 colour chemistry; §8 sparks, glitter and strobe; §9 smoke).

## Pages I could not read

- royalsocietypublishing.org (Cloudflare). Read Zohdi via PMC instead.
- ResearchGate and Wiley (Corbel strobe papers, blue strobe study): 403/429.
  Only the Crossref abstract was read.
- PubMed (captcha).
- OSTI full text (abstract only).
- pyrodata.com PyroGuide (502).
- codepen.io (Cloudflare).
- Wikimedia Commons API and category pages (429 / cache-only). Licences
  were read from the en.wikipedia `File:` mirrors instead.
- Nikon and Canon fireworks guides (404 / empty).
- The web-search budget for this session ran out partway through, so
  candidate sources after that point were read only by direct URL.

## Status (2026-10-01)

First cut behind `?try=fireworks` (c2b65b9): peony shells at 10-go scale (click to launch, an automatic show), stars by the drag physics of 7 (tested: closed form within 2%, terminal fall 18-28 m/s, every JPA width within 15%), chemistry colours, charcoal sparks, burst light with the measured envelope, at most 3 page flashes a second and 3 burst lights. Still to do: the other shell types, smoke, sound, the camera's shutter and exposure controls.
