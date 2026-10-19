# Rain on glass and condensation: research, round 3

Research only, 2026-10-02. No site code was changed. This report is meant
to replace guesswork with sources. It re-evaluates the earlier pass
(`claude/research-water-drops.md`, which drew on raindrop-fx and Codrops)
against a wider field: games, papers, shaders and the physics literature.

How to read the marks:

- Every claim has a link.
- **(computed)**: worked out here from a cited formula or with the
  ray-tracing scripts in `scratchpad/research/calc/` (method given).
- **(estimate)**: judgement. Needs measuring.
- **(unverified)**: from a secondary or press source, or a page I could not
  read in full.
- **(earlier pass)**: from `research-water-drops.md`; not re-read today.

Ony's request, in his words: "It doesn't look photorealistic, it doesn't
refract, reflect, magnify, deform-the-image-behind-the-glass correctly, the
color looks like ink not water, it doesn't react to light realistically. I
want the system where it can get heavier, and then drip and leave a clear
wet trail on the glass pane but also clears the other rain drops as it flows
downwards. But also needs a condensation option as well for steamed up
windows that interact with the rain. … The system needs to utilize the
shadow and light systems already built. Also the light passing thru the rain
drops would have a similar effect and cast shadows at the bends and light
would have brighter focus lines where the light is refracted and
concentrated …"

---

## 0. The short version

### 0.1 Why the current drops look like ink

I compared the site's own recent screenshots (`scratchpad/m-lamp11-on.png`,
`m-lamp11b-on.png`, `m-d2-fog.png`, crops in `research/eval/site_rain_crop_*.png`)
with real photographs (§3) and read `src/effects/water/water.glsl.ts` and
`src/components/site/WaterDrops.tsx`. The drops render as **dark,
teal-saturated beads with a bright white outline**: opaque-looking, all the
same colour, on a bright grey frosted pane. Real drops on clear glass are
luminous lenses. Each holds a sharp upside-down image of what is behind it,
with thin dark edges and small glints
([Garg & Nayar](https://cave.cs.columbia.edu/Statics/publications/pdfs/Garg_IJCV07.pdf):
a drop "transmits 94% of the incident radiance"; "a drop tends to be much
brighter than its background").

The causes, most important first (details in §2.6):

1. **Frosted glass plus a lamp in front makes wet spots dark, and that is
   real physics.** A lit frosted pane glows because the etch scatters the
   lamp back at you. A wet spot is clear, so you see through it to the
   picture behind, which is lit far less. The earlier pass's own Mitsuba
   reference measured the inside of a drop at "0.1–0.5 of the frost beside
   it" (earlier pass, §9.5c). By the same reasoning, water on any frosted
   glass lit from the front should look like darker spots; I have not found
   a photograph to confirm it. Ony's references are rain on **clear**
   windows, where this effect does not exist.
2. **Every drop is filled with the average colour of half the
   photograph.**
   - The lens is traced to a scene `SCENE_DISTANCE = 900` px behind the
     glass (`src/components/site/WaterDrops.tsx` L52). That minifies the
     image inside a drop by 25–140× **(computed, §2.5)**.
   - The photograph texture is mipmapped `LINEAR_MIPMAP_LINEAR` (L309–L313)
     and sampled with implicit LOD. Inside a drop the GPU therefore picks a
     very coarse mip level: the mean colour of a huge region. A night city
     photo averages to dark teal, so every drop becomes a dark-teal blob.
   - Off-photo rays are clamped to the photo's edge pixels (`clamp(…, 0, 1)`
     at water.glsl.ts L255, L277), which repeats edge colours.
3. **The picture inside a drop is low dynamic range.** In a real photo a
   street lamp is hundreds of times brighter than its surroundings, so it
   stays a bright point even when a drop shrinks it 40×. Every drop
   sparkles; see reference photos u04, u10, p08 and p12. The site's photo
   texture tops out at 1.0, so averaging erases the lights and leaves murk.
4. **Dye tint.** The view through water gets the pane's `saturate()` and
   35% of its dark fill (`seenThroughWater`, water.glsl.ts L275–L290). Real
   water at millimetre thickness is colourless (absorption < 10⁻³ cm⁻¹ in
   most of the visible:
   [Wikipedia, Optical properties of water](https://en.wikipedia.org/wiki/Optical_properties_of_water_and_ice)).
5. **The bright uniform outline reads as glass beads, not water.** It comes
   from `TRAPPED_GAIN` 2 × lit frost on the rim (L239, L498, L545). In real
   photos the rim is mostly a thin dark line. It is bright only on the side
   that faces a light or images something bright (photos u07, p11, u12, p10).
6. **Tiny droplets are drawn as dark dots.** Hundreds of them read as ink
   spatter. In photos, sub-millimetre droplets show as glints, or as near
   invisible specks over a uniform background (p12, u15, u07).
7. **No light passes through the drops.** Nothing is focused onto the
   picture, and nothing focused is seen back through the drop. So a drop
   next to the lamp never glows, the way the drops in p01 glow.

### 0.2 Ranked prior art, and what to build on

Full table in §1.6.

- **#1, what to build on: the ToyShop architecture**
  ([Tatarchuk & Isidoro 2006](https://advances.realtimerendering.com/s2006/Chapter3-Artist-Directable_Real-Time_Rain_Rendering_in_City_Environments.pdf)),
  modernised as a two-tier hybrid.
  - **What it is.** A GPU lattice of water mass, velocity and "wetness"
    (affinity). It drives refraction, and it also projects each drop's
    **shadow with a caustic highlight** onto the scene behind.
  - **What we add.** Our existing physical particle drops for the crisp
    beads, which is Chen, Chen & Wong's
    ([2013](https://www.sciencedirect.com/science/article/abs/pii/S0097849313001295))
    particle-plus-height-map hybrid.
  - **Why it wins.**
    - It is the only published real-time design that ties rain on glass to
      the scene's light and shadow, which Ony asked for explicitly.
    - Its wetness field gives trails that later drops follow.
    - The same lattice can carry condensation and its interplay with rain.
    - It is cheap on the GPU and free to implement.
- **Runner-up: the particles plus erasable-textures family**
  ([raindrop-fx](https://github.com/SardineFish/raindrop-fx), MIT, which is
  what the site already ported; and
  [Codrops RainEffect](https://github.com/codrops/RainEffect), custom
  licence). Upgrade it with Chen 2013's merging and residual droplets.
  - Simpler and already half built.
  - Its trails, fog and film are static textures with no dynamics, and
    light coupling would have to be bolted on.
- **Physics references, for checking only:**
  - thin-film models of sliding and condensing drops on inclined
    heterogeneous glass
    ([Engelnkemper et al. 2016](https://www.uni-muenster.de/Physik.TP/~thiele/Paper/EWGT2016prf.pdf),
    [Engelnkemper & Thiele 2019](https://arxiv.org/abs/1901.10235));
  - [Zhang et al. 2012](https://swang81.github.io/mypaper/papers/tvcg.pdf)
    for contact-angle physics;
  - the existing Mitsuba setup for optics.
- **The best-known procedural shader: Heartfelt (BigWings).** I could not
  view it here (Shadertoy returned 403). Its licence is CC BY-NC-SA 3.0,
  so ideas only. The "MIT" Unity port
  ([ya7gisa0/Unity-Raindrops](https://github.com/ya7gisa0/Unity-Raindrops))
  is a derivative of it and cannot change that licence.

### 0.3 Ten numbers that matter

| What | Number | Source |
|---|---|---|
| Contact angle, water on real (automotive) glass | side and rear glass 30–75° (mean ≈ 50°); windscreens 10–55° | [Hodgson et al. 2021](https://link.springer.com/article/10.1007/s00348-021-03219-2), citing Landwehr 2016 |
| Drop volume at which water starts to slide down vertical glass | ≈ 17 ± 1 µL on a car side window; 7–19 µL by contact angle | [Emergent Scientist 2019](https://emergent-scientist.edp-open.org/articles/emsci/full_html/2019/01/emsci180004/emsci180004.html); Quéré (earlier pass) |
| Retention (Furmidge) factor k | 0.88 ± 0.2 | [Li et al. 2023](https://www.nature.com/articles/s41467-023-40289-8) |
| Speed a sliding drop leaves a film behind (dewetting limit) | ≈ 2 cm/s at θr 20°, 8 cm/s at 30°, 18 cm/s at 40° **(computed)** | from Ca_c ~ θ³/9ln in [Snoeijer & Andreotti 2013](https://pof-snoeijer.tnw.utwente.nl/Papers/2013/SnoeijerARFM13.pdf) |
| Lens focal length of a drop on glass | f = R/(n−1) ≈ 3R: about 2–13 mm for window drops **(computed)** | thin lens (earlier pass) |
| Critical angle water→air / glass→air | 48.6° / 41.1° **(computed)**; drops steeper than ≈ 48.8° make fog back-scatter | [Zhu et al. 2017](https://www.seas.ucla.edu/~pilon/Publications/JQSRT2017-Droplets.pdf) |
| What a drop transmits / its field of view | 94% / ≈ 165° (falling drop); drops on glass shrink the scene 20–30× | [Garg & Nayar 2007](https://cave.cs.columbia.edu/Statics/publications/pdfs/Garg_IJCV07.pdf); [You et al. 2016](https://users.cecs.anu.edu.au/~u1018276/Downloads/ShaodiYou-PAMI.pdf) |
| Fogged glass | > 80% of transmitted light scattered | [Pollet & Pieters 2002](https://opg.optica.org/ao/abstract.cfm?uri=ao-41-24-5122) |
| Condensation surface coverage | ≈ 55% for hemispherical droplets; ≈ 1 − 0.005θ in general; growth ⟨R⟩ ∝ t once drops coalesce | [Beysens 2006](https://www.sciencedirect.com/science/article/pii/S1631070506002325) |
| Rain shadow of a 3 mm drop at the site's gap (17.5 mm) | lit by the site's bulb-sized lamp, a soft spot only ≈ 20% darker; crisp dark spot or bright-cored ring only with a point-like light or a closer picture **(computed)** | §2.7 |

---

## Part 1. Prior art, found and ranked

### 1.1 How I judged

- **Realism.** Judged from what I could actually see:
  - raindrop-fx's demo image;
  - three Codrops screenshots;
  - figures from Kaneda 1993/99, ToyShop 2006, Stuppacher & Supan 2007,
    Zhang et al. 2012 and von Bernuth et al. 2018;
  - two frames of Toadstorm's GIF;
  - Primozic's final screenshot;
  - the site's own renders.

  They are saved in `scratchpad/research/eval/`.
- **What I could not view.** Videos (Driveclub, Gran Turismo, Forza, the
  Zhang 2012 YouTube) and Shadertoy (it returned 403). Those are rated
  **not viewed**.
- **Physics basis.** Is drop behaviour derived from forces or contact
  angles, or scripted?
- **Cost and browser feasibility.** On our shared WebGL1 context.
- **Licence.** Only free and open licences can be adopted as code.

### 1.2 Games and console work (proprietary; techniques mostly undocumented)

**Driveclub** (Evolution Studios, 2014; weather in a 2014–15 update).

- **What is published.** No talk or paper found. Press descriptions only:
  - per-drop simulation: "each individual droplet becoming its own asset …
    the raindrops will act independently according to the wind and way
    that the car is moving"
    ([TheGamer](https://www.thegamer.com/driveclub-ps4-details-raindrops/));
  - drops on the screen "move left or right or remain stationary due to the
    pressure created between the wind and the windshield", and the
    windshield "dries up in proportion to the number of times the wiper
    wipes"
    ([GamingBolt](https://gamingbolt.com/driveclub-uses-real-world-weather-physics-weather-effects-compared-with-forza-horizon-2)).
- **Developer statements.** The PlayStation Blog post mentions only wipers
  and headlights on snowflakes
  ([PS Blog](https://blog.playstation.com/2014/07/08/first-look-driveclubs-dynamic-weather-in-action/)).
- **A guess at the method.** A Unity forum thread guesses "a 2D grid of
  fluid flow … pseudo forces up the windscreen depending on wind"
  ([Unity Discussions](https://discussions.unity.com/t/water-drops-like-the-driveclubs/593221)).
  This is **unverified**.
- **Realism.** Not viewed. Its reputation is high in the press
  ([Destructoid](https://www.destructoid.com/driveclub-has-the-best-dynamic-weather-engine-ive-ever-seen/)).
- **Licence.** Proprietary.
- **Lesson.** Per-drop forces from airflow and wipers are what people
  notice. On a static window, wind is the analogue (§2.1, §2.8).

**Gran Turismo Sport / 7** (Polyphony).

- No technical publication found.
- Players report two rain models: the better one has "physics-based"
  droplets that go "up when fast and sideways when sliding", with more
  droplets and accumulation
  ([GTPlanet thread](https://www.gtplanet.net/forum/threads/windshield-droplets-and-gt7-pic-heavy.404244/)).
  **Unverified**, not viewed.

**Forza Motorsport 6 and later** (Turn 10).

- The only official text found mentions "furiously swishing windshield
  wipers"
  ([Xbox Wire](https://news.xbox.com/en-us/2015/09/17/games-forza-motorsport-6-when-it-rains-it-pours/)).
- No technique is documented. Not viewed.

**Remember Me** (Dontnod, Sébastien Lagarde, 2012–13; earlier pass).

- Glass droplets are an animated texture sampled twice, plus a distortion
  and a low-res cubemap; the full raindrop effect cost 1.69 ms on PS3
  ([Water drop 2a](https://seblagarde.wordpress.com/2012/12/27/water-drop-2a-dynamic-rain-and-its-effects/)).
- His follow-up post points to the ToyShop demo for "droplet glass effects"
  ([Water drop 2b](https://seblagarde.wordpress.com/2013/01/03/water-drop-2b-dynamic-rain-and-its-effects/)).
- Texture-driven, with no physics.

**Automotive engineering**, the real-world analogue of game windscreens.

- CFD of rain on cars couples three parts:
  - Lagrangian airborne droplets;
  - a thin-film model of surface water ("film thickness small relative to
    surface curvature");
  - splash correlations.
- Rivulets on side glass are pushed back by airflow, and an A-pillar vortex
  can hold them above the driver's vision zone
  ([Gaylard, Kirwan & Lockerby 2017](https://journals.sagepub.com/doi/pdf/10.1177/0954407017695141)).
- This is the physically right model for a car. It costs far too much for
  the web, but confirms the split we want: particles in the air, film on
  the surface.

### 1.3 Papers and research systems

**Kaneda et al. 1993 / 1996 / 1999** (Hiroshima).

- **Papers.**
  - "Animation of Water Droplets on a Glass Plate", CA'93
    ([page](https://home.hiroshima-u.ac.jp/kin/publications/CA93/wdroplet.html),
    [PDF](https://home.hiroshima-u.ac.jp/kin/publications/CA93/wdroplet.pdf));
  - "Animation of Water Droplet Flow on Curved Surfaces", Pacific
    Graphics '96 ([page](https://home.hiroshima-u.ac.jp/kin/publications/PG96/droplet.html));
  - "Animation of Water Droplets Moving Down a Surface", JVCA 10(1) 1999
    ([page](https://home.hiroshima-u.ac.jp/kin/publications/JVCA/index.html)).
- **Technique.** The plate is a lattice, and each cell has a water
  "affinity".
  - "A water droplet begins to run down an inclined glass plate if the mass
    exceeds a static critical weight"; it stops below a dynamic critical
    weight.
  - Residual water is left according to the destination cell's affinity.
  - Merges conserve momentum.
  - "The route of the stream as it meanders down the plate is determined
    by impurities on the surface or in the droplet itself."
  - Rendering ray-traces against a cuboid environment. That took "four
    minutes" a frame at 512×384 in 1993.
- **Realism.** Low by today's standard; the 1999 windshield thumbnails are
  150 px.
- **Physics.** A heuristic, but every rule maps onto real physics:
  hysteresis threshold, dynamic stop, wetting residue, heterogeneity.
- **Licence.** Paper; the method is free to implement.

**Tatarchuk & Isidoro 2006, ToyShop** (ATI).

- **Paper.** "Artist-Directable Real-Time Rain Rendering in City
  Environments" (EG Workshop on Natural Phenomena 2006:
  [EG diglib](https://diglib.eg.org/items/b4d11d22-3e3d-4ac5-b33c-6b091143add1);
  SIGGRAPH 2006 course notes chapter,
  [PDF](https://advances.realtimerendering.com/s2006/Chapter3-Artist-Directable_Real-Time_Rain_Rendering_in_City_Environments.pdf)).
- **Technique.** "We adopted the offline raindrop simulation system
  [Kaneda99] to the GPU."
  - **The lattice.** "each cell stores the mass of water in that location,
    water x and y velocity, and the amount of droplet traversal", packed in
    16-bit RGBA, with separate mass and affinity.
  - **Forces.** Gravity against static or dynamic friction. The friction
    coefficients come from "a special glass friction coefficients texture
    map".
  - **Where a droplet goes.** "droplets can flow into the three cells below
    its current cell. New cell … randomly chosen, biased by the droplet
    directional velocity components, friction based affinity of current
    cell and the 'wetness' of the target cell"; "Droplets have a greater
    affinity for wet regions".
  - **Rendering.** Normals come from the mass. Refraction is offset by the
    mass.
  - **Light coupling.** "The droplet mass is also used to render dynamic
    shadows of the simulation onto the objects in the toy store (using the
    mass texture as a projective shadow) … If the droplet mass is large
    enough, we render a pseudo-caustic highlight in the middle of the
    shadow for that droplet."
- **Realism (Figure 33, viewed).** Thin, stringy, meandering rivulets with
  good refraction, and droplet shadows on the toys behind. Dated, because
  the drops are not round beads. But it is the only system found that does
  shadows and caustics from window drops.
- **Physics.** The same heuristics as Kaneda's.
- **Cost.** Runs in the 2006 demo on a GPU. No separate figure is given.
- **Browser.** Yes: render-target ping-pong in WebGL1.
- **Licence.** Paper; free to implement.

**Yang & Zhu 2004**, "Real-time simulation: water droplets on glass
windows" (Computing in Science & Engineering).

- I could not read it: IEEE rendered empty, Semantic Scholar returned 403
  and ResearchGate 429.
- It is cited by Rousseau et al.'s "GPU Rainfall"
  ([PDF](https://classes.cs.uchicago.edu/archive/2022/fall/23700-1/papers/gpu-rain.pdf)).
- **Unverified.**

**Stuppacher & Supan 2007**, "Rendering of Water Drops in Real-Time"
(CESCG; [PDF](https://old.cescg.org/CESCG-2007/papers/Hagenberg-Stuppacher-Ines/cescg_StuppacherInes.pdf)).

- **Technique.**
  - A 2D height map of water amount.
  - Drops are assembled "out of many small droplets"; water moves "if this
    amount is greater than a threshold L".
  - A remainderMap leaves water behind; a noise map adds variation.
  - The height map is blurred, then turned into normals; reflection and
    refraction are mixed by Fresnel.
- **Cost.** 160 fps at 512², 65 fps at 1024² on a GeForce 7800.
- **Realism.** Low (viewed: soft blobs).
- **Lesson.** A height-map-only field makes blobby drops, so the beads need
  particles.

**El Hajjar, Jolivet, Ghazanfarpour & Pueyo**, "A model for real-time
on-surface flows" (The Visual Computer, 2009, online 2008;
[Springer](https://link.springer.com/article/10.1007/s00371-007-0207-7)).

- "a simulation operating on a 2D grid which is implementable on GPU",
  with external forces, viscosity and obstacles, plus "absorption and ink
  transport", rendered by GPU image-based raycasting with refraction and
  reflection.
- Paywalled; figures not viewed.

**Chen, Chen & Wong 2013**, "A heuristic approach to the simulation of
water drops and flows on glass panes" (Computers & Graphics 37(8), 963–973;
[abstract](https://www.sciencedirect.com/science/article/abs/pii/S0097849313001295)).

- **Technique.** It combines "particle systems with height maps" and
  addresses "drop merging, flow meandering, and residual droplet
  formation".
  - An **ID map** detects and merges irregular drops.
  - Smoothing and erosion operators give continuous shape changes.
  - It shows residual droplets after flows pass.
  - The claim is "real-time performance with high visual quality".
- **Not read in full.** The figures and full text are behind ScienceDirect
  and ACM (403); ResearchGate returned 429. **Realism not viewed.**
- **Why it matters.** It is the most complete published recipe for exactly
  Ony's list of behaviours.

**Zhang, Wang, Wang, Tong & Zhou 2012**, "A Deformable Surface Model for
Real-Time Water Drop Animation" (IEEE TVCG;
[PDF](https://swang81.github.io/mypaper/papers/tvcg.pdf)).

- **Technique.**
  - Each drop is a triangle surface mesh.
  - Surface tension comes from mean-curvature flow.
  - Contact-angle hysteresis has separate **advancing and receding angles**:
    between them the contact line is pinned.
  - Merging and splitting are done by mesh booleans.
- **Cost.** 10–50 FPS at 10K–50K triangles, up to 180 drops, simulated on
  an 8-core Xeon CPU.
- **Realism (Fig. 10, "Hundreds of droplets flowing on a window panel",
  advancing 90°, receding 30°, viewed).** Correct pear shapes. The shading
  is plain.
- **Browser.** No; it costs too much.
- **Use.** As the reference for shapes under hysteresis.

**Wang, Mucha & Turk 2005**, "Water Drops on Surfaces" (SIGGRAPH; earlier
pass). An offline level-set method with a virtual surface for the contact
angle. The authority on **advancing and receding angles driving the look**.

**Wang, Miller & Turk 2007**, "Solving General Shallow Wave Equations on
Surfaces" (SCA;
[page](https://faculty.cc.gatech.edu/~turk/paper_pages/2007_shallow_waves/index.html)).

- Simulates "water drops, rivulets, capillary events" on surfaces under
  shallow-wave assumptions.
- Uses implicit gravity and surface tension, and is "capable of …
  real-time water drop control".
- No performance figures on the page.
- **Browser.** Plausible at a low resolution **(estimate)**.

**Thin-film (lubrication) models**, the physics gold standard for drops on
an incline.

- **The model.**
  [Engelnkemper, Wilczek, Gurevich & Thiele 2016](https://www.uni-muenster.de/Physik.TP/~thiele/Paper/EWGT2016prf.pdf)
  solve ∂h/∂t = −∇·{Q(h)∇[h + Π(h)] + χ(h)}, with a wetting potential for
  the contact angle.
- **What it reproduces.** The sequence round cap, then corner, then
  **pearling** (the drop "emits smaller satellite droplets"), then
  elongated tails.
- **Scaling found.** Sliding speed U/α ∝ V^0.569, and the pearling onset
  α_SN1 ∝ V^−0.713.
- **Cost.** Implicit FEM on 128×64 elements, not real time.
- **The follow-up is the closest physics to Ony's request.**
  [Engelnkemper & Thiele 2019 (EPL 127, 54002)](https://arxiv.org/abs/1901.10235)
  simulate "drops of a volatile liquid that continuously condense onto a
  chemically heterogeneous inclined substrate":
  - "Pinned drops grow on the hydrophilic spots, depin and slide along the
    substrate while merging with other pinned drops … and possibly undergo
    a pearling instability";
  - the system settles to "a stationary state where condensation and
    outflow balance".
- **Licence.** Papers.
- **Browser.** No, but use it to check behaviour **(estimate: a
  fourth-order PDE needs implicit steps)**.

**Plourde, Nori & Bretz 1993**, "Water droplet avalanches" (PRL 71, 2749;
[arXiv abstract](https://arxiv.org/abs/cond-mat/9402080)).

- Rain on a window pane as a model system of "deposition, growth,
  coalescence, and avalanching".
- At low flow rates the avalanche sizes and lifetimes follow **power
  laws**; at higher rates the distributions become exponential
  ([group page](https://public.websites.umich.edu/~nori/droplet.html)).
- This is a statistical test our sim can be held to.

**Computer-vision raindrop models**, static drops but the optics are
validated against photos.

- **Spherical caps, ray traced.**
  [von Bernuth, Volk & Bringmann 2018](https://www.embedded.uni-tuebingen.de/assets/publications/vonBernuth-Volk-Bringmann_Raindrops.pdf)
  model drops as spherical caps with h = tan(θ/2)·d.
  - They cite θ ≈ 87° for drops of about 2 mm radius.
  - They ray-trace Snell's law into a reconstructed 3D scene, then blur
    with a disc kernel for defocus.
  - Viewed Fig. 5: convincing for out-of-focus windscreen drops; static.
- **Drops as fish-eye images.**
  [You et al. 2016 (TPAMI)](https://users.cecs.anu.edu.au/~u1018276/Downloads/ShaodiYou-PAMI.pdf):
  - "each raindrop is a contracted image of the environment, as if it is
    taken from a fish-eye-lens camera";
  - "scale ratios … around 20 to 30";
  - drops are bounded at about 5 mm diameter.
- **Ellipses plus barrel distortion.**
  [Hamzeh et al. 2021 (IEEE Access)](https://www.researchgate.net/publication/353782597_Dynamic_Adherent_Raindrop_Simulator_for_Automotive_Vision_Systems)
  approximate drops as ellipses with barrel distortion and blur, and found
  them close to a ray-tracing baseline for detection.
- **A review.**
  [Hamzeh & Rawashdeh 2021 (J. Imaging)](https://www.mdpi.com/2313-433X/7/3/52)
  collects:
  - Roser's Bézier drop profiles: "three orders of magnitude improvement
    over spherical approximations";
  - Halimeh & Roser: drops "act as a convex lens that distorts the
    background";
  - Cord & Aubert: drops have "opposite intensity levels (darker on a
    bright background and vice versa)";
  - Stuppacher & Supan: "small drops stay idle or get swept away by moving
    drops".

**Other droplet simulations.**

- The 2024 survey by Keshtkar & Aburumman
  ([arXiv 2411.15880](https://arxiv.org/html/2411.15880v1)) catalogues
  particle methods (SPH, PBD) and grid methods (VOF and others) for drops,
  including Fournier et al. 1998 and Wang et al. 2005.
- It does **not** cover condensation or rendering.
- SPH and PBD droplet methods are offline or desktop-GPU and add nothing
  for our case.
- Jones & Southern 2017 ("Physically-based droplet interaction",
  [author PDF](https://eprints.bournemouth.ac.uk/29608/1/scaDropletsAuthorVersion.pdf))
  is about droplets colliding in the air, not on surfaces. Not relevant.

### 1.4 Web, shader and engine projects (code)

**raindrop-fx (SardineFish)**
([repo](https://github.com/SardineFish/raindrop-fx)). **MIT**, WebGL2.

- **What it is.** Particle drops; a droplet texture that is never cleared;
  a mist target; an erase blit; and a compose pass. Details in earlier
  pass §7.
- **Cost (README).** "about 6ms … with 2000 raindrops"; 2–3 ms at 600 drops
  at 1080p.
- **Realism (viewed, `assets/img/demo.png`).** A convincing moody window at
  mid-distance:
  - drops are clear, and cleared tracks cut through the mist;
  - close up, the drops are small flat lenses with a dark edge on one side;
  - there are almost no highlights, and the mist is a uniform blur.
- **Physics.** Fake (random resistance). The site's `sim.ts` already
  replaced it with Furmidge, the friction law and a pinning field.
- **Verdict.** The best **open code** of its family. The site already owns
  a better version.

**Codrops "Rain & Water Effect Experiments" (Lucas Bebber, 2015)**
([repo](https://github.com/codrops/RainEffect),
[article](https://tympanus.net/codrops/2015/11/04/rain-water-effect-experiments/)).

- **Technique.** Canvas2D water map; WebGL1 compose.
- **Realism (viewed).** The drop-detail screenshot is good:
  - every drop shows the background upside down;
  - trails of small drops sit under the runners;
  - sharp drops over a soft background.

  The hero image's big drops look like gel blobs.
- **Licence.**
  - The README says: "Integrate or build upon it for free in your personal
    or commercial projects. Don't republish, redistribute or sell 'as-is'."
  - The repo root has no LICENSE file (README, gulpfile, package.json,
    demo/, src/ only).
  - Codrops' general licensing page now says demos are MIT "if not
    specifically mentioned otherwise"
    ([licensing](https://tympanus.net/codrops/licensing/)).
  - This repo does mention otherwise, so treat it as the custom licence:
    fine on the site, not in a redistributed component library.

**Heartfelt (BigWings / Martijn Steinrucken, 2017).**

- **Licence.** "Creative Commons Attribution-NonCommercial-ShareAlike 3.0
  Unported" in its header
  ([mirror](https://github.com/sanxincao/shadertoy/blob/master/heartfelt.glsl)).
  Shadertoy itself returned 403, so the page is unread.
- **Technique.** Procedural: grid cells, sawtooth slide, trail droplets, and
  a "focus" mix that is sharp where wet and blurred where fogged. It has no
  state and no interaction.
- **Realism.** Not viewed here.
- **Use.** Ideas only.
- **Licence trap.** [ya7gisa0/Unity-Raindrops](https://github.com/ya7gisa0/Unity-Raindrops)
  is labelled **MIT** but describes itself as a port of Heartfelt under
  CC BY-NC-SA 3.0. A derivative cannot relicense, so **do not use it**.

**Toadstorm "RainyGlassShader" (Unity)**
([repo](https://github.com/toadstorm/rainyglassshader),
[blog](https://www.toadstorm.com/blog/?p=742)).

- **LGPL-2.1.** Two textures, flow-map trickles and grab-pass refraction.
- **Realism (two GIF frames viewed).** Plausible small droplets on a sphere;
  no runners visible.
- **Use.** Technique only; LGPL is awkward for web bundles **(estimate)**.

**Godot "Raindrops glass" (miskatonicstudio).**

- **CC0**: "The shader code and all code snippets in this post are under
  CC0 license"
  ([godotshaders](https://godotshaders.com/shader/raindrops-glass/)).
- A normal-map distortion, `SCREEN_UV + d * distortion_size`; drops come
  from Blender metaballs or a particle viewport.
- Simple. Usable, but nothing new.

**Primozic, rainy window pane in three.js**
([notes](https://cprimozic.net/notes/posts/building-realistic-rainy-window-pane-in-threejs/)).

- Static normal and roughness maps with `MeshPhysicalMaterial`
  transmission.
- Textures: "public domain".
- Viewed: a smeared, wet, blurry pane. Not a drop system.

**Blinc "Wet Glass" demo** (project-blinc;
[demo doc](https://github.com/project-blinc/blinc/blob/79bb8b14ce0bb02f0571a4584e14da537c24161d/docs/book/src/web/example-gallery/wet_glass_demo.md)).

- **Apache-2.0** ([repo](https://github.com/project-blinc/blinc)).
- "Procedural wet-window effect with real light refraction through water
  drops … procedural Worley-noise drops, streaks, and condensation fog"
  (WebGPU). This description comes from a search-result excerpt; I did not
  open the demo page itself.
- Not viewed. Procedural, so no interaction.

**Not usable as code:**

- **rainyday.js:** GPL v2 fork (earlier pass).
- **chasergit/26_rain_drops_windows** (three.js;
  [thread](https://discourse.threejs.org/t/rain-drops-windows/47316)):
  no licence shown, so all rights reserved. Its author says trails "Cant
  do".
- **YHK RaindropsOnGlass (UE):** the repo is an example for a **paid**
  marketplace pack
  ([repo](https://github.com/YHK-UEPlugins-Public/017_RaindropsOnGlass_Public)).
- **Epic "Project Hillside" (UE5):** described as procedurally generating
  "rain trickles and water drops in a render target for use inside the
  glass material" (seen in a search-result excerpt). The Epic docs page
  rendered empty, so it is **unread**. It is under Epic's content terms,
  not open source.
- **EdoFrank/RainDropEffect (Unity):** 404.

### 1.5 Condensation: is there a system to build on?

I found **no dedicated real-time breath-figure renderer** before the web
search budget ran out (§4). What exists:

- **Texture fogs.**
  - raindrop-fx's mist target fogs "over about 10 s" and is erased by drops
    (earlier pass).
  - Heartfelt's sharp-where-wet, blurred-where-fogged mix.
  - The site already has its own fog map with "same side / other side".
- **Physics of how the fog grows.** Beysens's breath-figure laws, Le Fevre
  & Rose's drop-size distribution, and the sweeping found in dropwise
  condensation (§2.4).
- **Physics of how fog looks.** The UCLA Pilon group's radiative-transfer
  papers on windows with condensed droplets; Pollet & Pieters (§2.4).
- **The one simulation that couples condensation with sliding and
  sweeping:** Engelnkemper & Thiele 2019 (§1.3).

So condensation is best built **from the physics**, as fields in the #1
architecture (§1.8, step 3), not taken from a library.

### 1.6 Ranked table

Ranked by fitness **as the foundation for OnySnow**:

- realism of the result it can reach;
- physics basis;
- coverage of Ony's list (beads, heavier → run, trail, sweeping,
  condensation, light and shadow coupling);
- cost on WebGL1;
- licence.

"Output" is what I saw.

| # | System | Kind | Technique | Output realism (as seen) | Physics | Cost / browser | Licence | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | **ToyShop** (Tatarchuk & Isidoro 2006) | design | GPU lattice: mass, velocity, wetness; affinity flow; refraction; **projected drop shadows + caustic highlight** | C+ (stringy rivulets, good refraction, real shadows) | heuristic, maps onto real physics | cheap; WebGL1 ping-pong | paper (free to implement) | **Build on its architecture**, with particle beads |
| 2 | **Chen, Chen & Wong 2013** | design | particles + height map; ID-map merging; erosion; residual droplets | not viewed (claims high quality) | heuristic | real-time (claimed) | paper (paywalled) | Adopt merging and residual ideas |
| 3 | **raindrop-fx** | code | particles + droplet and mist textures + erase | B− | fake (ours replaced it) | 2–3 ms / 600 drops; WebGL2 (port done) | **MIT** | Keep as our particle tier (already ported) |
| 4 | **Codrops RainEffect** | code | Canvas2D water map, WebGL1 compose | B (detail shot) | fake | light | custom ("don't redistribute as-is") | Ideas and look reference |
| 5 | **Heartfelt** | shader | procedural cells, sawtooth, focus mix | not viewed (Shadertoy 403) | none | cheap | **CC BY-NC-SA 3.0** | Ideas only |
| 6 | **Thin-film models** (Engelnkemper et al. 2016, 2019) | physics | lubrication PDE, wetting potential, condensation | figures not viewed; physically exact | **first principles** | offline (implicit FEM) | papers | Check shapes, pearling, sweeping |
| 7 | **Zhang et al. 2012** | sim | surface meshes, advancing/receding angles | B (correct pear shapes, plain shading) | physical | 8-core CPU, 180 drops; no browser | paper | Shape reference |
| 8 | **Wang, Miller & Turk 2007** (GSWE) | sim | shallow-wave height field on surfaces | not viewed | physical (shallow-water) | near real-time (claimed) | paper | Possible future GPU film tier |
| 9 | **Kaneda 1993–99** | design | lattice affinity, critical masses | D (1990s) | heuristic | (offline render) | papers | Origin of #1 |
| 10 | **El Hajjar et al. 2008** | design | GPU 2D grid flow, raycast render | not viewed | empirical | GPU | paper | Minor |
| 11 | **Stuppacher & Supan 2007** | design | GPU height map, thresholds, remainder map | D | heuristic | cheap | paper | Shows height-map-only limits |
| 12 | **Driveclub** | game | per-drop, wind, speed, wipers (press) | not viewed | likely force-based (unverified) | console | proprietary | Benchmark by reputation only |
| 13 | **GT Sport / GT7** | game | "physics-based" droplets (forum) | not viewed | unknown | console | proprietary | — |
| 14 | **Forza Motorsport** | game | undocumented | not viewed | unknown | console | proprietary | — |
| 15 | **Remember Me** (Lagarde) | game | animated droplet texture ×2 + cubemap | not viewed | none | 1.69 ms PS3 | blog | — |
| 16 | **von Bernuth 2018 / You 2016 / Hamzeh 2021** | CV optics | caps or ellipses, ray traced or distorted | B− (static, defocused) | geometric optics | offline / cheap | papers | Optics validation |
| 17 | **Toadstorm** | Unity shader | textures + flow maps | C | none | VR-cheap | **LGPL-2.1** | Technique only |
| 18 | **Godot raindrops** | shader | normal-map offset | not rated | none | cheap | **CC0** | Nothing new |
| 19 | **Primozic** | three.js | static maps + transmission | C− | none | cheap | textures **public domain** | — |
| 20 | **Blinc wet glass** | WebGPU demo | Worley-noise drops, streaks, fog | not viewed | none | cheap | **Apache-2.0** | Look-only |
| 21 | rainyday.js / chasergit / Unity-Raindrops / YHK / Hillside | various | — | — | — | — | GPL / none / NC-SA conflict / paid / Epic | Do not use |
| — | **OnySnow round 2 (current)** | ours | particles (Furmidge) + maps + per-pixel ray-traced lens | C− (the "ink" look, §0.1) | good sim; optics inconsistent | — | ours | Upgrade path §1.8 |

### 1.7 Recommendation

**#1: the ToyShop architecture, modernised as a two-tier hybrid.**

- **What it is.**
  - **Particles for beads.** Our raindrop-fx-derived `sim.ts` (MIT
    lineage): Furmidge sliding, the friction law, pinning, merging.
  - **GPU fields for everything continuous.** Film and wetness,
    condensation density and droplet size, micro-droplets.
  - **One water height field.** Both tiers feed it, and it drives **both**
    the view through the glass (the water layer) **and** the light through
    the glass (the floor-light pass and casters). Every lamp lights it and
    every lamp gets its shadows and caustics.
- **Why it beats the alternatives:**
  1. **Light and shadow coupling.** ToyShop is the only real-time design
     that projects drop shadows with caustic highlights onto the scene
     behind, which is Ony's explicit ask. Our floor-light pass already does
     the same thing for the bevel and for waviness (`causticAt`, a Jacobian
     area ratio: `src/lib/floor-light-shader.ts` L183–L195).
  2. **Trails that matter.** A wetness field that lowers pinning ("greater
     affinity for wet regions") makes later drops follow old tracks, as on
     real windows (photos u06, u20, p06). It also stores the "clear wet
     trail" as a state that dries and dewets, not as a sprite.
  3. **Condensation interplay comes for free.** Fog is just another field.
     Runners sweep it, it re-nucleates in their "bare belt"
     ([Hu et al. 2021](https://www.mdpi.com/2076-3417/11/4/1553)), and fog
     droplets grow into drops that run. That is the coupling Engelnkemper
     & Thiele simulate.
  4. **Cost.** Render-target updates at ½ resolution per pane, plus one
     quad per drop per light **(estimate: under 1 ms on desktop)**.
  5. **Licence.** Papers for the design; MIT for our particle code.
- **Runner-up: particles plus erasable textures** (what we have, in the
  raindrop-fx and Codrops lineage), upgraded with Chen 2013's ID-map
  merging and residual droplets.
  - Cheaper and simpler.
  - But the fog, film and trails stay static masks, and every bit of light
    coupling has to be hand-added.
  - Pick it only if the field tier proves too slow on target devices.
- **Not a base, but the yardsticks:**
  - thin-film simulation (Engelnkemper & Thiele), for shapes, pearling and
    the balance between condensation and outflow;
  - Zhang 2012, for hysteresis shapes;
  - Mitsuba, for optics;
  - the photos in §3.

### 1.8 How to build it into our engine (proposed order; each step behind `?try=`)

**Step 0: two decisions for Ony** (no code). Both are causes, not knobs,
and both change what is physically correct.

**(a) What glass the rain sits on.**

- On **clear** glass, drops are bright lenses (his references).
- On **lit frosted** glass, wet spots are dark: real physics, and the "ink"
  look.
- Recommended: rain clears its own track and spots. On a frosted pane under
  a front lamp, expect darker wet areas. Offer a "clear glass" preset for
  rain scenes.

**(b) How far behind the glass the picture is.** Use **one** distance for
everything.

- **Print at the pane's gap** (70 px ≈ 17.5 mm at 4 px/mm):
  - each drop shows an inverted, 1–10× minified patch of the nearby
    picture, and large flat drops magnify **(computed, §2.5)**;
  - drops cast shadows and caustics on it (§2.7).
- **World far away** (900 px):
  - every drop is a tiny fisheye of half the photo;
  - physically, no visible shadows (§2.7).

Today the drops use 900 px while the glass, frost and floor light use the
gap. That mismatch is part of "doesn't magnify or deform correctly".

**Step 1: optics fixes in the water layer** (fixes the ink; §2.6).

- **One scene distance** shared with the floor light.
- **Explicit LOD for the lens lookup.**
  - `EXT_shader_texture_lod` → `texture2DLodEXT`, from the true footprint
    `|1 − D/f|` per pixel, so drops hold a sharp image.
  - Fallback: `texture2D(…, bias)`.
- **HDR highlights through the lens.** For each bright spot of the photo
  (the existing photo emitters, `effects/light/photo-emitters`), find where
  the drop's lens maps it and add a glint there at its true brightness,
  with the camera bloom. Every drop then sparkles with the scene's lights.
- **Colour parity.** Water shows the picture as clear glass would: no extra
  `saturate`, no fill tint, ~4–6% Fresnel loss. No Beer–Lambert term for
  water.
- **Rims from physics only.**
  - TIR fraction (§2.5) plus Fresnel, lit by what each reflected ray really
    sees: the room, the lamps, or the lit frost.
  - No uniform outline.
- **Droplets.** Sub-pixel droplets as energy-conserving glints and faint
  edges, not dark discs.
- **Tests (vitest twins and e2e pixels):**
  - a drop over a uniformly lit photo, with no lamp, has mean luminance
    within 5% of its surroundings;
  - chroma inside ≈ chroma outside;
  - inversion over a top-bright/bottom-dark test photo;
  - footprint scale = |1 − D/f| ± 5% for the drop sizes in §2.5;
  - with a 100× bright photo spot, every drop within the lens field of view
    shows a glint.

**Step 2: light through water** (rain shadows and focus lines; §2.7).

- **Caustic sprites.** Precompute per-drop irradiance profiles E(ρ/a;
  D/a, θc) offline with an axisymmetric ray tracer (the method of
  `calc/drop_caustic.py`) into a small LUT texture.
  - Draw one quad per drop per light in the floor-light pass.
  - Position: where the lamp's ray through the drop meets the picture
    (the same projection the casters use: `effects/optics/casters.ts`).
  - Blur by the light's projected disc (the existing penumbra rule).
  - It conserves energy and includes the dark TIR ring, the focused core
    and the outer halo.
  - Add (light) and multiply (shadow) into the existing canvases.
- **Rivulets and film.** Add the film height's Hessian to `causticAt`'s
  waviness Hessian (gentle slopes, where the gather approximation holds).
  Long rivulets give **focus lines**, which are cylindrical lenses (§2.7).
- **Render the floor light into a texture.** The water layer can then read
  the lit picture where each drop's lens lands: a drop over its own focused
  light **glows**, the cat's-eye effect
  ([Wikipedia: Retroreflector](https://en.wikipedia.org/wiki/Retroreflector)).
- **Tests:**
  - the integral of a sprite equals the drop footprint × transmission, so
    light is conserved;
  - centre brightness against the ray tracer at D/f = 0.5, 1, 2 and 4;
  - the penumbra grows with light size;
  - the shadow moves with the lamp.

**Step 3: fields** (GPU lattice, ½ resolution per pane, RGBA8 or
half-float where it can be rendered).

- **Film (wetness).**
  - Deposited by a runner when its speed U > U_c(θr) **(computed, §2.3)**;
    below that, it leaves a train of residual micro-droplets (Kaneda,
    Chen 2013).
  - Dries at a rate set by humidity: tens of seconds to minutes
    **(computed, §2.3)**.
  - On drying it **dewets into micro-droplets**, written into the droplet
    map.
  - Lowers pinning and biases direction for later drops (ToyShop affinity).
- **Fog (condensation).** Store coverage ε, mean droplet radius r̄ and age
  per texel.
  - Growth follows Beysens: R ∝ t^1/3 while drops are isolated, then
    ⟨R⟩ ∝ t; ε → 1 − 0.005θ.
  - Optics from §2.4: an unscattered sharp fraction, a blur radius from the
    measured cutoff angles × the gap, and back-scatter that rises above
    θ ≈ 48.8°.
- **Promotion.** Where r̄ passes about 0.2–0.5 mm **(estimate)**, spawn
  particle drops. They merge, slide at the Furmidge threshold, and clear a
  bare belt that fogs again finely.
- **Wipes and fingers.** Erase the fog and write a residue mask, which
  changes how it re-fogs: fewer, larger, clearer drops (§2.4).
- **Tests:**
  - ε converges to its limit;
  - departure size ≈ capillary length (§2.4);
  - a swept track re-fogs, starting finer;
  - fog on the other face veils, and does not wipe.

**Step 4: shape and dynamics refinements.**

- **Drop outlines and profiles from ElSherbini & Jacobi (§2.2).**
  - Contact angle varies around the drop as a cubic in azimuth.
  - The outline is an ellipse whose aspect grows with the Bond number.
  - Each profile is two circles.
  - This replaces cap × pear × harmonics.
- **Merging of irregular shapes:** Chen's ID map.
- **Pearling and residuals:** tied to the capillary number.
- **Wind:** a lateral push.
- **Statistics:** the avalanche-size distribution under steady light rain
  should be roughly power-law (Plourde).

**Step 5: validate.** Side by side with §3 by category; with Mitsuba for
optics; with a thin-film run for shapes and pearling (offline). Then Ony
approves.

---

## Part 2. Physics and optics, with numbers and sources

### 2.1 Rain arriving at a vertical window

**Rain classes** ([Wikipedia: Rain](https://en.wikipedia.org/wiki/Rain)):

- Drops 0.1–9 mm across; they break up at large sizes.
- Drizzle is drops under 0.5 mm.
- Light rain < 2.5 mm/h; moderate 2.5–7.6; heavy > 7.6; violent > 50 mm/h.
- Impact speed: 0.5 mm drizzle at 2 m/s; 5 mm drops at about 9 m/s.

**Size distribution.** Marshall–Palmer, N(D) = N₀ e^(−ΛD), with
N₀ = 8000 m⁻³ mm⁻¹ and Λ = 4.1 R^−0.21 mm⁻¹
([Wikipedia: Raindrop size distribution](https://en.wikipedia.org/wiki/Raindrop_size_distribution)).

**Rain only reaches a vertical window with wind.**

- The building-science formula for wind-driven rain on a façade is
  R_wdr = α·U·R_h^0.88·cos θ, with α = 0.222 s/m on average and
  0.02–0.26 s/m depending on the position on the façade.
- "Typically, the top corners are most wetted, followed by the top and side
  edges."
- Source: [Blocken & Carmeliet 2004](https://urbanphysics.net/2004_JWEIA_WDRreview_preprint.pdf).
- So **sheltered windows** (the middle and bottom of a façade, under eaves)
  get far less rain, and **wind direction** decides which panes are wet.

**Drops hitting fully exposed glass (computed).** Uses the airborne
Marshall–Palmer number density × wind speed U. MP overstates the very
small drops, so treat these as upper bounds.

| Rain rate | Number-mean D | Median-volume D₀ | Drops /cm²/s at U = 2 / 5 / 10 m/s | Water on the glass (WDR formula, mm/h) at U = 5 m/s |
|---|---|---|---|---|
| 0.5 mm/h (drizzle) | 0.21 mm | 0.77 mm | 0.34 / 0.84 / 1.7 | 0.6 |
| 2.5 mm/h (light) | 0.30 mm | 1.09 mm | 0.47 / 1.2 / 2.4 | 2.5 |
| 7.6 mm/h (heavy) | 0.37 mm | 1.37 mm | 0.60 / 1.5 / 3.0 | 6.6 |
| 25 mm/h | 0.48 mm | 1.76 mm | 0.77 / 1.9 / 3.8 | 18.9 |
| 50 mm/h (violent) | 0.55 mm | 2.04 mm | 0.89 / 2.2 / 4.4 | 34.7 |

**Most drops are small; most water is in a few large ones (computed).** A
landing drop spreads into a cap. Contact diameter on glass by contact
angle (falling diameter → spot):

| Falling D | Volume | Spot at 30° / 50° / 70° |
|---|---|---|
| 0.2 mm | 0.004 µL | 0.43 / 0.35 / 0.30 mm |
| 0.5 mm | 0.065 µL | 1.07 / 0.87 / 0.74 mm |
| 1 mm | 0.52 µL | 2.1 / 1.75 / 1.5 mm |
| 2 mm | 4.2 µL | 4.3 / 3.5 / 3.0 mm |
| 3 mm | 14 µL | 6.4 / 5.2 / 4.5 mm (close to sliding at once, §2.2) |

The site's rain types (`rain-types.ts`) use estimates such as 0.04–0.3
drops/cm²/s with a 0.12–0.9 µL median. That is the right order for
sheltered glass. For an exposed, windward pane in heavy rain, the table
says rates up to about 10× higher **(computed)**.

**Splashes.**

- The classic criterion is K = Oh·Re^1.25 > 57.7 (Mundo et al. 1995, as
  cited by [Zhang et al. 2021](https://link.springer.com/article/10.1186/s42774-021-00091-w)).
  The same paper: secondary-droplet sizes follow a gamma distribution and
  the mean size scales with Re^−1/2.
- On a vertical pane the normal impact speed is about the wind speed
  **(computed)**:

| Drop | U = 2 m/s | 5 m/s | 10 m/s |
|---|---|---|---|
| 0.2 mm | deposits | deposits | splashes |
| 0.5 mm | deposits | splashes | splashes |
| 1 mm | deposits | splashes | splashes |
| 2–3 mm | splashes | splashes | splashes |

- At low impact angles and normal Weber numbers, drops can **rebound** off
  smooth glass and wetted surfaces
  ([Šikalo, Tropea & Ganić 2005](https://www.sciencedirect.com/science/article/abs/pii/S0021979705000573)).
- So wind-driven rain on dry glass makes a main drop plus a ring of fine
  satellites. Drizzle just sticks. Reference: p19 (splash on a ledge).
- Mundo's threshold is an approximate rule; it depends on surface finish
  and wettability (same review).

### 2.2 Drops sitting on the glass

**Contact angles, measured on real automotive glass**
([Hodgson et al. 2021](https://link.springer.com/article/10.1007/s00348-021-03219-2),
citing Landwehr 2016):

- side and rear glass "30<θₛ<75° with a calculated average of
  approximately 50°";
- windscreen "10<θₛ<55°".

Other ranges:

- Clean glass < 20° (earlier pass).
- Quéré's experiments 52–110° (earlier pass).
- Water-repellent coatings: "High contact angles of over 100 degrees"
  ([Wikipedia: Water-repellent glass](https://en.wikipedia.org/wiki/Water-repellent_glass)).
- Lotus-type self-cleaning surfaces need θ > 160°.
- Hydrophilic TiO₂ glass makes water "form a thin layer rather than
  droplets"
  ([Wikipedia: Self-cleaning glass](https://en.wikipedia.org/wiki/Self-cleaning_glass)).
- **Roughness amplifies whatever the surface already does** (Wenzel:
  cos θ* = r cos θ;
  [Wikipedia: Wetting](https://en.wikipedia.org/wiki/Wetting)). So an
  etched (frosted) face, which is rough and hydrophilic, wets more and
  beads less than polished glass of the same chemistry. Expect flatter,
  spreading drops and films on the frosted face **(computed from Wenzel;
  the roughness ratio of the site's etch is unknown)**.

**Pinning and hysteresis.**

- A drop is pinned while its local contact angle sits between the receding
  and advancing angles
  ([Wikipedia: Wetting](https://en.wikipedia.org/wiki/Wetting)).
- Retention force: f_max = k·w·γ(cos θr − cos θa)
  ([de la Madrid et al. 2015](https://ar5iv.arxiv.org/html/1505.04104);
  k accounts for the contact line not being a circle).
- k = 0.88 ± 0.2 averaged over many systems
  ([Li et al. 2023](https://www.nature.com/articles/s41467-023-40289-8)).
- Hysteresis on glass is about 19 ± 5° (Quéré, earlier pass).
- **Hanging (pendant) drops** are held about 1.27× harder than sessile
  ones on the same surface (de la Madrid et al.). Condensation on the
  **inside** of a sloped glass roof, or the underside of a sill, behaves
  differently from rain on top.

**The sliding threshold on vertical glass.**

- "for a drop of volume greater than about 17±1 µl" drops slide on a car
  side window
  ([Emergent Scientist 2019](https://emergent-scientist.edp-open.org/articles/emsci/full_html/2019/01/emsci180004/emsci180004.html)).
- 7–19 µL by contact angle (Quéré, earlier pass).
- Computed with Furmidge: about 8–9 µL at 60/40° (earlier pass §2.3).
- Adherent drops are bounded at about 5 mm diameter
  ([You et al. 2016](https://users.cecs.anu.edu.au/~u1018276/Downloads/ShaodiYou-PAMI.pdf)).
- The angle a drop starts to slide at scales as sin α_s ∼ ℓc² Ω^−2/3
  (Emergent Scientist).
- **Wind** depins drops at a critical Weber number of about 7.9 on the
  surface tested ("Wind- and Gravity-Forced Drop Depinning",
  [arXiv 2009.04059](https://ar5iv.labs.arxiv.org/html/2009.04059)).
  On a car at 50 km/h, drops "under 3 mm diameter will not detach"
  (Emergent Scientist).

**Shapes of pinned drops on vertical glass** (ElSherbini & Jacobi 2004,
[Part I](https://www.sciencedirect.com/science/article/abs/pii/S0021979703011688),
[Part II](https://www.sciencedirect.com/science/article/abs/pii/S002197970301169X)).
This is the measured recipe for a height field:

- "the contact-angle variation along the circumference of a drop [is] best
  fit by a third-degree polynomial in the azimuthal angle";
- "θ max is approximately equal to the advancing contact angle";
- "As the Bond number … increases … θ min decreases almost linearly from
  the advancing to the receding angle";
- "The drop contour can be described by an ellipse, with the aspect ratio
  increasing with Bo";
- the profile at each azimuth is "two circles sharing a common tangent at
  the maximum height";
- "Simplifying the drop shape to a spherical cap can lead to a 75% error in
  drop-volume prediction."

This replaces the site's estimated pear taper, sag and harmonics with
measured relations, and keeps an exact slope for the TIR rim.

**Sliding speed.**

- **Friction law.** F = F₀ + βwηU with β = 20–200 "specific for a
  liquid/surface combination"; water drops reached "≈ 0.7 m/s" before
  pearling broke them up (Li et al. 2023).
- **Scaling.** Kim, Lee & Kang derived a scaling law for the steady sliding
  speed, valid "when the sliding velocity is low and the drop distortion …
  is small"
  ([JCIS 2002](https://www.sciencedirect.com/science/article/abs/pii/S0021979701981561)).
- **Thin-film model.** U/α ∝ V^0.569 (Engelnkemper et al. 2016).
- **Shape with speed.** Round, then a corner at the rear, then a cusp, then
  pearling (Le Grand et al. 2005, earlier pass; Engelnkemper et al. 2016).

### 2.3 Growth, running, sweeping, trails and drying

**Growth to running.**

- On a window, drops grow by rain landing on them, by merging with
  neighbours, and (with condensation) by vapour.
- Once one passes the threshold it runs, merges with every drop in its
  path, gets heavier, speeds up, and sweeps a track.
- Plourde, Nori & Bretz used rain on a pane to study exactly this
  "deposition, growth, coalescence, and avalanching". Low input rates gave
  **power-law** avalanche statistics; high rates gave exponential ones
  ([arXiv](https://arxiv.org/abs/cond-mat/9402080)).
- Stuppacher & Supan's observation: "a certain mass is required for the
  water drop to move and … small drops stay idle or get swept away by
  moving drops" (via
  [Hamzeh & Rawashdeh](https://www.mdpi.com/2313-433X/7/3/52)).

**What a running drop leaves.** Three regimes, all real:

1. **A clean, clear track.** The runner absorbs every drop it touches. The
   track is bare glass, or glass with a film too thin to see. Reference
   photos: u08, u20 and p06 (dark smooth channels).
2. **A thin film behind it, the "clear wet trail".** A receding contact
   line can only move so fast. Above a critical capillary number it
   deposits a film (Landau–Levich).
   - "Ca_c is typically of the order of 0.01, or even less for small
     contact angles", with Ca_c ~ θ³/[9 ln(…)] and the logarithm about
     13–18
     ([Snoeijer & Andreotti 2013](https://pof-snoeijer.tnw.utwente.nl/Papers/2013/SnoeijerARFM13.pdf)).
   - **(Computed, ln = 15):**

     | Receding angle θr | Film left above |
     |---|---|
     | 10° | 0.3 cm/s |
     | 20° | 2.3 cm/s |
     | 30° | 7.7 cm/s |
     | 40° | 18 cm/s |

   - So on dirty window glass (θr ≈ 20–40°), fast runners leave a film and
     slow ones do not. The film later **dewets**: it breaks into a line of
     tiny droplets, or it evaporates.
3. **Residual droplets and pearls.**
   - Kaneda: "residual water", "meandering".
   - Chen 2013: "residual droplet formation after flows pass".
   - At high speed, pearling: the cusp emits satellite drops
     (Podgorski 2001 via earlier pass; Engelnkemper 2016).
   - On real panes the dotted trail is mostly pinning at dirt (photos u06
     and u16).

**Meandering.**

- One mechanism: "fluid inertia and anisotropy of the friction between
  rivulet and substrate". The tests used flow rates of 50–1000 mm³/s,
  rivulets about 1 mm wide, and meander wavelengths of "several
  centimeters"
  ([Daerr, Eggers, Limat & Valade, PRL](https://people.maths.bris.ac.uk/~majge/del08.pdf);
  the year was not shown in the copy I read).
- For window drops the dominant cause is surface heterogeneity (Kaneda:
  "impurities on the surface"), plus following old wet tracks (ToyShop).

**Trails attract later drops.** "Droplets have a greater affinity for wet
regions of the surface" (ToyShop). Seen in u20 and p09: several runners
share a channel.

**Drying (computed: diffusion-limited, still air, 20 °C).** Uses textbook
constants: vapour diffusivity 2.5×10⁻⁵ m²/s, saturation density
17.3 g/m³. These are **order-of-magnitude estimates**.

| Humidity | 10 µm film dries in | 0.5 µL drop lasts | 5 µL drop lasts |
|---|---|---|---|
| 50% | ≈ 15–45 s | ≈ 15 min | ≈ 70 min |
| 80% | ≈ 35–115 s | ≈ 40 min | ≈ 3 h |
| 95% (during rain) | ≈ 2–8 min | ≈ 2.5 h | ≈ 11 h |

- Wet trails vanish about **100× faster** than the drops beside them.
- During rain, drops essentially do not evaporate.
- The site's `FILM_DRY` (20 s) fits a dry, breezy room. During rain it
  should be minutes.

**Water spots after drying.** A pinned drop evaporating "is replenished by
liquid from the interior, creating an outward flow that carries suspended
particles toward the perimeter" (coffee-ring effect, Deegan et al. 1997,
[Wikipedia](https://en.wikipedia.org/wiki/Coffee_ring_effect)). Dried
rain leaves faint rings and smudges; u12 shows such residue between drops.

### 2.4 Condensation: steamed windows

**Breath figures**
([Beysens 2006, "Dew nucleation and growth"](https://www.sciencedirect.com/science/article/pii/S1631070506002325)):

- **Growth.** An isolated droplet grows as V ∼ t, i.e. R ∼ t^1/3. Once
  drops coalesce, the mean radius grows as ⟨R⟩ ∼ t.
- **Coverage.** It stabilises at ε∞ ≈ 55% for hemispherical drops, and in
  general ε∞ ≈ 1 − 0.005θ (θ in degrees).
- **Size spread.** Polydispersity "remains … small and constant (≈18%)"
  during self-similar growth.
- **New generations.** "New tiny droplets can nucleate on the space left
  free after coalescence. These droplets form a new 'family'."
- **Rate of merging.** The number of coalescences grows only as ln t.
- **Universality.** The scaling holds on very different substrates and
  rates
  ([Stricker et al. 2022](https://arxiv.org/abs/2110.00691)).

**Dropwise condensation on vertical surfaces**, the same physics at
engineering scale:

- nucleation sites "10⁷ to 10⁸ sites/mm²", and a ratio of largest to
  smallest drop of about 10⁶ for steam
  ([Thermopedia](https://www.thermopedia.com/content/708/));
- departure (sliding) radius ≈ capillary length, √(σ/ρg) ≈ 2.4 mm
  ([Singh, Kondaraju & Bahga 2018](https://web.iitd.ac.in/~bahga/pdfs/2018_Singh_Mathematical%20Model%20for_Dropwise%20Condensation.pdf));
- surface renewal "by the sweeping action of the falling drops"
  (Thermopedia); "the route of droplets departure will form a bare belt.
  The above process repeats on a bare surface"
  ([Hu et al. 2021](https://www.mdpi.com/2076-3417/11/4/1553));
- large-drop distribution (Le Fevre & Rose):
  N(r) = (1/(3πr² r_max))·(r/r_max)^(−2/3), so drops larger than r cover
  1 − (r/r_max)^1/3 of the area. The PDF's text extraction lost the minus
  sign; I checked the sign by integrating, which gives this known
  coverage **(computed)**.

That is the shower-door behaviour (photos u15, u23, u25, u09, u11):

1. fine fog;
2. a few droplets grow into beads;
3. a bead reaches about 2–3 mm, runs, and clears a bare streak;
4. the streak fogs again with a finer, younger generation, so it stays
   visibly clearer for a while.

**Why fog looks white or grey and blurs.**

- Condensation drops "scattered … more than 80% of the transmitted visible
  radiation"
  ([Pollet & Pieters 2002](https://opg.optica.org/ao/abstract.cfm?uri=ao-41-24-5122)).
- The contact angle decides how much light is lost. Ray tracing and
  measurement:
  - "the normal-hemispherical transmittance … was nearly independent of
    contact angles θc when θc < θcr" (θcr = 48.8° for water). Above it,
    total internal reflection at the droplets sends light back
    ([Zhu et al. 2017](https://www.seas.ucla.edu/~pilon/Publications/JQSRT2017-Droplets.pdf)).
  - Measured: transmittance "decreased from 89% to 71% as θc increased
    from 25.8° to 76.2°", and "from 81% to 71% as the surface area
    coverage increased from 19% to 45%"
    ([Simsek et al. 2021](https://www.seas.ucla.edu/~pilon/Publications/JQSRT2021-droplet-experiments-visible.pdf)).
- **The blur is not total.**
  - "photons that did not interact with the droplets were transmitted in
    the same direction as the incident direction". There is a sharp
    unscattered fraction, the light through the gaps between droplets.
  - The scattered light has **cutoff angles**: at θc = 45° and normal
    incidence, 17.2° for droplets on the outside and 25.1° for droplets on
    the back side
    ([Huang et al. 2020](https://www.seas.ucla.edu/~pilon/Publications/JQSRT2020-bidirectional%20transmittance%20droplets.pdf)).
- **(Computed) for the site.** At a 17.5 mm gap those cutoffs blur the
  picture over a radius of about 5–8 mm (20–30 px at 4 px/mm). Add a sharp
  residue of (1 − coverage), and a back-scattered white veil that grows
  with coverage, and much more for θc > 48.8°.
- Popular explanation: "the water droplets are of course behaving like
  lenses … this is why it distorts" and a surfactant makes "a thin film
  which is continuous … [which] doesn't scatter light"
  ([Naked Scientists](https://www.thenakedscientists.com/articles/questions/why-does-soap-stop-mirrors-fogging)).
- **Lights behind fog** become glowing halos (photos p13, p15, u11,
  u25), the forward-scattered light.

**Fingers and wipes.**

- A wipe removes the droplets. The patch is clear and wet, and fogs again
  from fine droplets.
- Skin grease is hydrophobic. On greasy areas "you'll just get a few big
  ones" that are "much easier to see through", so writing reappears when
  the glass fogs again
  ([Naked Scientists](https://www.thenakedscientists.com/articles/questions/why-cant-i-get-car-window-fog-twice);
  popular science, **unverified** by a primary source).
- Photo u28: a handprint fogs lighter than its surroundings.
- Photos u26, p13 and p14: drawn lines show clear against the glowing fog,
  with beads collecting along the strokes.

**Rain outside, fog inside.** These are physics reasoning, not measured
here.

- **The two faces are independent.** Rain runners on the outside cannot
  clear fog on the inside. Fog on the viewer's side veils the rain (seen
  through the blur kernel above), and wiping it reveals the drops
  (photos p16, u19).
- **Rain and fog on the same face** do interact. Examples are a windscreen
  exterior in drizzle, or a shower door with spray. Landing drops absorb
  fog droplets, and runners sweep bare belts.
- **The front and back sides scatter differently** (Huang 2020's 17.2° vs
  25.1°).
- The site's `uFogSide` switch already models both cases. What is missing
  is the dynamics: fog growing into runners, and bare belts fogging again.

### 2.5 Optics of a drop on glass

**Constants (computed from n_water ≈ 1.333 and n_glass ≈ 1.52).**

- Normal-incidence reflectance:
  - air–water 2.0%;
  - air–glass 4.3%;
  - water–glass 0.43%.
- Critical angles:
  - water→air 48.6°;
  - glass→air 41.1°;
  - glass→water 61.3°.
- Dispersion: n = 1.339 at about 400 nm, 1.332 at 589 nm, 1.331 at about
  700 nm.
- Absorption below 10⁻³ cm⁻¹ through most of the visible, so a drop is
  colourless
  ([Wikipedia](https://en.wikipedia.org/wiki/Optical_properties_of_water_and_ice)).

**A drop is a plano-convex lens.**

- f = R/(n−1) ≈ 3R. The thin-lens mapping (earlier pass): a pixel at
  offset p from the drop's centre sees the picture plane at
  c + (p−c)(1 − D/f).
- **Correction to the earlier pass (§3.1 there).** It said "minified when
  1 < d/f < 2, and magnified when d/f > 2". **That is backwards.** The drop
  shows a patch |1 − D/f| times its own size:
  - D < f: upright, magnified (a magnifying glass);
  - f < D < 2f: inverted and **magnified**;
  - D = 2f: inverted, the same size;
  - D > 2f: inverted and **minified**.

  The shader ray-traces, so the code is unaffected. The doc text is wrong.

**What each drop shows, computed for the site's 4 px/mm.** a = contact
radius.

| Drop | f | Picture at the gap (70 px = 17.5 mm) | "World" at 900 px |
|---|---|---|---|
| a 0.5 mm, θ 50° | 2.0 mm | inverted, 7.9× minified (shows 8 mm) | inverted, 114× |
| a 1.0 mm, θ 50° | 3.9 mm | inverted, 3.5× minified | inverted, 56× |
| a 1.5 mm, θ 30° | 9.0 mm | inverted, shows a patch 0.94× its own width, i.e. **magnified about 1.06×** | inverted, 24× |
| a 1.5 mm, θ 50° | 5.9 mm | inverted, 2× minified | inverted, 37× |
| a 2.2 mm, θ 30° | 13 mm | inverted, **3× magnified** | inverted, 16× |
| a 2.2 mm, θ 70° | 7.0 mm | inverted, 1.5× minified | inverted, 31× |

- **Real drops on car windows** shrink the world 20–30× ("as if … taken
  from a fish-eye-lens camera",
  [You et al.](https://users.cecs.anu.edu.au/~u1018276/Downloads/ShaodiYou-PAMI.pdf)).
- **A falling drop's field of view** is "approximately 165°"
  ([Garg & Nayar](https://cave.cs.columbia.edu/Statics/publications/pdfs/Garg_IJCV07.pdf)).
- **The photographer's own words** on drops on a pane: "the drops create
  images that are upside-down" (APOD 2017-01-27, earlier pass).
- **So for a print behind glass**, drops show a recognisably deformed,
  upside-down **local** patch: "magnify and deform the image behind the
  glass". For the world outside a window, they show a tiny fisheye of the
  whole scene.

**The dark outline.** Two mechanisms, depending on which side you view
from.

- **From the glass side** (rain on the far face, the site's case; and rain
  outside a window viewed from inside):
  - rays inside the drop meet the curved water–air surface;
  - where the surface tilt exceeds 48.6°, they are **totally internally
    reflected** back into the room;
  - that ring shows the room's reflection: dark at night and in a dim room,
    bright where a lamp lines up.
- **TIR ring width (computed):**

  | Contact angle | Ring |
  |---|---|
  | ≤ 48.6° | none |
  | 50° | outer 2% of the radius (4% of the area) |
  | 60° | 13% of the radius (25% of the area) |
  | 70° | 20% (36%) |
  | 90° | 25% (44%) |

  So beaded drops on dirty glass have thick rings, and clean-glass drops
  hardly any.
- **From the air side** (rain on the near face):
  - nothing is trapped; the steepest rays leave the glass up to about 62°
    off axis (at θc = 90°) **(computed)**;
  - the rim images whatever is far off to the side, usually something
    darker, so the outline is dark by refraction.
- **Photos.** Over a uniform bright background, drops show almost nothing
  but these thin edges (u07, p11). Over a bright-top, dark-bottom scene,
  the whole upper part of each drop is dark because it images the ground
  upside down, not just the rim (u24). Cord & Aubert: drops are "darker on
  a bright background and vice versa"
  ([via Hamzeh & Rawashdeh](https://www.mdpi.com/2313-433X/7/3/52)).

**Specular highlights.**

- A drop's cap is a convex mirror of radius R, so a light of angular size β
  appears as an image about β·R/2 across, with the light's own shape
  **(computed)**:
  - a 1 m window at 3 m in a 2 mm-radius drop: about 0.33 mm (1.3 px);
  - the site's lamp (23 mm at 75 mm): 0.3 mm (1.2 px);
  - the sun or a distant street lamp: about 0.01–0.02 mm, **far below a
    pixel**.
- So distant lights must be drawn as **energy-conserving sub-pixel
  sparkles** with bloom: HDR, not a capped colour.
- Each light gives:
  - a glint from the outer surface;
  - for drops seen through the glass, a second glint on the far side where
    the TIR mirror lines up (earlier pass §9.5b);
  - for a light **behind** the glass, its upside-down image inside the drop
    by transmission. At night that is every street light in every drop
    (photos u04, u10, p08, p12).
- Garg & Nayar: "Specular and internal reflection are only prominent at
  the periphery of the drop."

**Bright versus dark backgrounds, night, bokeh.**

- A drop's brightness comes from where its lens points, not where it sits.
  Over dark ground a drop images bright sky upside down and looks bright;
  over sky it is grey with a dark rim (u03, u02, u05, p10, p18).
- **At night** the background lights are out of focus (bokeh discs) while
  the drops are sharp; each drop carries tiny inverted images of the lights
  (p07, p09, u10, u17, u20, u22).
- Out-of-focus **drops** blend with the background. The blur kernel grows
  with the distance between the focus plane and the drop, and "if a
  raindrop is significantly blurred … the raindrop cannot totally occlude
  the environment" (You et al.).

**Lit from the viewer's side** (the site's cursor lamp; a room lamp at
night).

- You see the glints.
- Each drop's **shadow** is offset away from the lamp. In p01 it is a dark
  crescent on the far side of each drop.
- If the picture is near the drop's focal distance, you see the light the
  drop **focused** onto it, back through the same drop, so the drop
  **glows**. This is the cat's-eye principle: "the focal surface of the
  refractive element coincides with the reflective surface"
  ([Wikipedia: Retroreflector](https://en.wikipedia.org/wiki/Retroreflector)).
  In p01 every drop is brighter than the paper round it.

### 2.6 Why real drops look clear and bright, and what makes a render look like ink

**Real (physics).**

- A drop "transmits 94% of the incident radiance towards the camera"; it
  collects light "from a large solid angle (165°) of the environment
  (including the sky)"; and the peak brightness of drops is about the same
  "even though the background intensities are very different"
  ([Garg & Nayar](https://cave.cs.columbia.edu/Statics/publications/pdfs/Garg_IJCV07.pdf)).
- Water at drop thickness is colourless (§2.5).
- Edges are crisp at screen scale: capillary length 2.7 mm, contact lines
  sharp. The dark parts are images of dark scene and thin TIR rings.
  Highlights are tiny and HDR.

**"Ink" in general.** The usual causes:

1. Treating water as an absorbing, coloured medium: Beer–Lambert, tint,
   saturation.
2. Filling the drop with one averaged colour instead of an image:
   mip/area averaging, or a far-field mapping at low resolution.
3. LDR backgrounds, so minified lights die.
4. Darkening the drop relative to its surroundings: veils, multiply
   shadows, or frost glowing around it.
5. Missing highlights, or the wrong kind (outlines instead of glints).
6. Soft feathered edges like ink bleeding into paper.
7. Mixing in gamma space instead of linear light.
8. Small droplets drawn as solid dots.

**The site specifically** (from code and screenshots; see §0.1):

| Cause | Where | Fix |
|---|---|---|
| Lit frosted pane: wet spots darker than the glowing frost (true for frosted glass) | design; earlier pass §9.5c (inside a drop 0.1–0.5 of the frost) | Step 0a: clear glass for rain, or accept dark wet spots |
| Far-scene mapping, 25–140× minification | `SCENE_DISTANCE = 900` (WaterDrops.tsx L52); water.glsl.ts L471 | Step 0b / step 1: one physical distance |
| Implicit mip LOD averages the image in a drop | `LINEAR_MIPMAP_LINEAR` (WaterDrops.tsx L309–L313); `texture2D` at water.glsl.ts L277 | Explicit LOD from the real footprint |
| Off-photo rays clamp to the edge pixels | `clamp(coverUv(…),0,1)` L255, L277 | Fall back to the room or scene average, not edge streaks |
| LDR photo, so no sparkles | photo texture | Glints from the photo emitters through the lens |
| Pane `saturate()` and 35% of the dark fill applied to water | `seenThroughWater` L279, L289 | Show the photo as clear glass would |
| Lamp's light on the picture under a drop held at 0.3 | `POOL_GAIN` L233 | Replace with the caustic computation (step 2), so it can exceed 1 near focus |
| Uniform bright rim | `TRAPPED_GAIN` L239, L498, L545 | Physical TIR and Fresnel only, lit by actual sources |
| Droplets as dark dots | droplet map shading | Glints and faint edges |

### 2.7 Light through drops onto a surface behind: "rain shadows" and focus lines

**Mechanism.**

- Each drop is a lens. Light through its centre is mildly converged.
- Light through its steep rim is bent far outward, or (for θc > 48.6°, rain
  on the far face) totally reflected back.
- On a surface a distance D behind:
  - for **D ≲ 2f**, a **bright focused core inside a dark ring**;
  - for **D ≫ 2f**, the drop's light is spread thin over a wide disc, so
    the footprint becomes a **dark spot** with a faint halo.
- ToyShop rendered exactly this as a projected shadow plus a "pseudo-caustic
  highlight in the middle of the shadow" for heavy drops (§1.3).
- The real effect is strongest when the receiver is near the paraxial
  focus. Lock's study of a hanging drop's caustic shows it because "the
  distance between the lower edge of a siding board and … the next … is
  nearly equal to the paraxial focal distance"
  ([Lock 2020](https://opg.optica.org/ao/abstract.cfm?uri=ao-59-21-F32)).
- Classic catastrophe optics: drops on a glass slide under a laser go
  through "Fold caustic … Diffraction stars (elliptic umbilic foci) …
  cusp" as they evaporate
  ([Stony Brook poster](https://www.stonybrook.edu/laser/_samantha/summer2013.html/CausticPosterFinalScibelli.pdf)).
- Caustic networks form "when light shines through waves on a body of
  water"
  ([Wikipedia: Caustic](https://en.wikipedia.org/wiki/Caustic_(optics))).
  A window running with water gives moving networks of lines; Atmospheric
  Optics shows the same from the rounded "projections" of textured glass
  ([atoptics](https://atoptics.co.uk/blog/light-patterns-caustics/)).

**Ray-traced numbers (computed: `calc/drop_caustic.py`).**

Setup:

- Axisymmetric trace, collimated light, Fresnel at every interface.
- Drop of contact radius 1.5 mm on 4.5 mm glass, rain on the far face (the
  site's case). Irradiance is relative to the plain pane.
- "Point source" means a perfectly collimated beam. Peak values near focus
  are capped in reality by the source size (next table).

| θc (f) | D = 3 mm | 6 mm | 10 mm | **17 mm (site gap)** | 30 mm | 60 mm |
|---|---|---|---|---|---|---|
| 30° (9.0 mm) | centre 2.0× | centre 7×, ring 96× | **focus** | centre **1.44×**, footprint mean 0.73, min 0.43 | dark 0.19 | 0.03 |
| 60° (5.2 mm) | **focus** (TIR rim 0) | near focus | centre 1.8×, mean 0.44 | dark spot 0.17–0.23 | 0.05 | 0.01 |
| 90° (4.5 mm) | **focus** | near focus | centre 1.3×, mean 0.34 | dark spot 0.13–0.17 | 0.03 | 0.01 |

Rain on the **near** face (light meets the curved surface first) behaves
the same way, with the focus shifted by the glass: about 1–6 mm.

**Light size decides whether you see any of it (computed, same script).**
The disc blur is the light's angular radius × D.

| Case at D = 17 mm | Sun (0.27°) | Point-like lamp 1 mm @ 75 mm | **Site bulb, 11.5 mm @ 75 mm (8.7°)** |
|---|---|---|---|
| θ 30° | centre 1.43×, ring 0.47 | 1.39× / 0.54 | **≈ 1.00 (invisible)** |
| θ 60° | dark 0.23 / 0.14 | 0.23 / 0.15 | **centre 0.78 (soft 22% smudge)** |
| At D = 6 mm, θ 30° / 60° | 7× / 229× | 7× / 78× | **2.5× / 1.8× (visible bright cores)** |
| At D = 300 mm, θ 60° | dark core 0.00 | 0.86 | 1.00 |

What this means for Ony:

- **Rain shadows are a near-field effect.** With a small or distant light
  they are crisp. With the site's bulb-sized lamp, at today's gap,
  single-drop shadows are faint smudges. That is the physics, and the
  existing light-size presets (Point / Bulb / Diffuser) will produce it
  automatically.
- **Bright focus spots need D ≲ 2f:** about 1 cm for beads, more for flat
  drops.
- **Sunlight** keeps drop umbras out to about drop-size / 0.0093 ≈ 0.3 m
  for 3 mm drops **(computed)**. Rivulets and big drops survive further.
- **Rivulets are cylindrical lenses** (computed by analogy). Across a
  rivulet: dark edges with a **bright focus line** down its middle near
  D ≈ R_cyl/(n−1). As it meanders, the line wiggles and moves. That is
  Ony's "brighter focus lines".
- **Chromatic fringes are small.** Δn ≈ 0.008 across the visible (§2.5)
  moves the focus by Δf/f = Δn/(n−1) ≈ 2.4% **(computed)**. Expect faint
  colour edges only on sharp caustics in sun-like light.
- **Sources.** Ideal photographs of real rain shadows were not found under
  free licences (§3, gap). p01–p03 show the same optics on surfaces
  directly behind drops and liquids.

**How to compute it in our engine.** Step 2 in §1.8.

- **Per-drop LUT sprites for beads.** The gather-at-Q Hessian approximation
  in `causticAt` fails for beads, whose deflection (about (n−1)·D·slope ≈
  6 mm) exceeds their size **(computed)**.
- **Hessian gather for gentle film waves**, which the code already does
  for waviness.
- **A floor-light texture** read back by the water layer, so drops glow
  over their own focus.

### 2.8 What else real rain on a window does (gaps in the brief)

- **Which side the water is on.** Rain is usually outside, condensation
  inside. Each layer refracts differently; front versus back droplets have
  different scatter cutoffs (Huang 2020). Moving the head gives a small
  parallax across the glass thickness (4.5 mm), and much more with double
  glazing **(computed: geometry)**.
- **Reflections in the glass.**
  - At night a window mirrors the lit room at about 4% per face.
  - A wet outer face reflects differently: air–water 2.0% plus
    water–glass 0.4%, instead of 4.3% **(computed)**.
  - Drops on it break the room's reflection into speckle, and their glints
    can repeat as faint ghosts offset by about 2·t·tan θ through the glass
    **(computed; geometry)**.
- **A uniform wet film does not bend light** (parallel faces). It only
  changes reflection, and **makes etched glass transparent**: water fills
  the roughness (Phys. Educ. 50 638, 2015, earlier pass; the IOP page was
  blocked today).
- **A flowing film is not uniform.** It ripples into moving caustic lines
  (§2.7); heavy rain sheets down hydrophilic glass (Wikipedia: Self-cleaning
  glass).
- **Coatings change everything.**
  - Hydrophobic (> 100°): round beads that slide early and fast.
  - Hydrophilic, self-cleaning: sheets with almost no beads.
  - Dirty glass: irregular pinned beads.
- **Dirt and pollen** are the pinning sites, and set where trails go and
  where drops nucleate. Dried drops leave rings (§2.3).
- **Wind.** It pushes runners sideways or upward. Below a size threshold
  drops do not move (§2.2). The windward top corners get the most rain
  (§2.1).
- **Edges and sills.**
  - Water collects at the bottom edge. Pendant drops hang from overhangs
    and fall, which is "drip" in Ony's sense (photos u01, rNBaaxyeWWM in
    §3.2).
  - Hanging drops are held about 1.27× harder (§2.2).
- **Splash on impact** with wind-driven rain: satellites around the main
  drop (§2.1).
- **Lightning and changing light.** ToyShop made drops read "more
  transparent" during flashes (§1.3).
- **Camera focus.** Real photos focus either on the drops (background
  bokeh) or on the scene (drops blurred, partly transparent; You et al.).
  The site renders both sharp, and its existing bokeh layer could follow
  focus.

---

## Part 3. Reference photographs

**96 references in total.** 50 are downloaded to
`scratchpad/research/rain-refs/`, each opened and described, with credits
and licences in `rain-refs/index.md`. A further 46 are listed below with
links only.

Category codes, as in index.md: **D** day; **N** night, bokeh, lights;
**C** close-up and lens images; **R** running drops, trails, rivulets;
**F** condensation with wiped or drawn tracks; **S** shadows and caustics;
**X** other.

### 3.1 Downloaded (50; see index.md for author, licence and a line each)

| Category | Files |
|---|---|
| D: drops on a window by day | u02, u03, u05, u07, u13, u16, u18, u24, p04, p10, p11, p18 |
| N: night, lights, bokeh | u04, u10, u17, u20, u21, u22, p07, p08, p09, p12, p14, p15, p17 |
| C: close-ups and lens images | u12, u24, u30, p01, p10 |
| R: running drops, trails, rivulets | u06, u08, u11, u16, u20, u21, u22, u23, u25, p06, p09 |
| F: condensation, wiped, drawn, cleared tracks | u09, u11, u14, u15, u19, u23, u25, u26, u27, u28, p05, p13, p14, p15, p16 |
| S: shadows, caustics, light through water | p01, p02, p03, p04, p05, p20, u29 (penumbra reference, not rain) |
| X: splash, patterned glass, dripping edge | p19, u14, u01 |

The ten most useful for side-by-side checks:

- **u12:** sharp inverted images in bright drops, thin bluish rims, residue.
- **u24:** dark upper halves, the scene upside down.
- **p10:** contrast flips with what lies behind.
- **u07:** over a uniform background, only thin edges show.
- **u21:** rivulet bending a light into bright and dark edges.
- **u15:** backlit condensation with cleared tracks.
- **p13:** finger writing in fog with a light halo.
- **u28:** handprint fogging differently.
- **p01:** drops lit from the side glow inside, with crescent shadows.
- **p08:** every drop carries points of light at night.

### 3.2 Linked, not downloaded

The Unsplash names come from Unsplash's JSON. Pexels names are as listed
on Pexels search pages and were not checked one by one. For the Commons
files, the licence was **not re-verified** today because Commons was not
fetchable; the earlier pass downloaded and described them (earlier pass
§7.4).

| # | Link | Author | Licence | What it shows (source title unless I viewed it) |
|---|---|---|---|---|
| L1 | https://unsplash.com/photos/DunSKupQL7g | Mohammad Alizade | Unsplash | "a close up of a window with rain drops" |
| L2 | https://unsplash.com/photos/EL8XuuixMaA | Niklas König | Unsplash | raindrops on glass, blurred brown background (companion to u12) |
| L3 | https://unsplash.com/photos/E46je-W7Hgw | Ruth Gledhill | Unsplash | "Clouds reflected in a raindrop on a shady leaf" |
| L4 | https://unsplash.com/photos/Olwl0abaqXQ | Samuel Schneider | Unsplash | "Drops On My Window": a building through a rain-covered window |
| L5 | https://unsplash.com/photos/Uo-K0MWkX8g | Sixteen Miles Out | Unsplash | "A close up of a rain covered window" |
| L6 | https://unsplash.com/photos/AOBz1kcFbvA | Sixteen Miles Out | Unsplash | black-and-white raindrops on a window |
| L7 | https://unsplash.com/photos/GmF9hUpFfLw | Jan Kopřiva | Unsplash | black-and-white rain drops |
| L8 | https://unsplash.com/photos/TdPQp3fjzOw | Jose Fontano | Unsplash | "raindrops / looking out the window" |
| L9 | https://unsplash.com/photos/_OKtuQ2epDM | Erik Brolin | Unsplash | "Storm moment captured through glass" |
| L10 | https://unsplash.com/photos/nwWUBsW6ud4 | Kristina Tripkovic | Unsplash | hand on glass (grayscale) |
| L11 | https://unsplash.com/photos/1uCU4yipEok | Etienne Boulanger | Unsplash | silhouette of a hand touching a window |
| L12 | https://unsplash.com/photos/ARBu3R0WHew | Etienne Boulanger | Unsplash | "Foggy morning viewing buildings through window" |
| L13 | https://unsplash.com/photos/rNBaaxyeWWM | A A | Unsplash | "rain dropping from roof": drips from an edge |
| L14 | https://unsplash.com/photos/wRCKn7_Av_c | mario jr nicorelli | Unsplash | a drop on a dandelion with an inverted scene |
| L15 | https://unsplash.com/photos/_yCU3GxEFhs | Katerina | Unsplash | "water glass dew / Tears from the sun" |
| L16 | https://www.pexels.com/photo/water-droplets-on-glass-window-8858719/ | Ian Panelo | Pexels | raindrops on window glass |
| L17 | https://www.pexels.com/photo/photograph-of-a-wet-glass-surface-14381724/ | Connor Scott McManus | Pexels | dark window with droplets |
| L18 | https://www.pexels.com/photo/background-of-raindrops-on-glass-window-6832327/ | Didsss | Pexels | raindrops on a glass window |
| L19 | https://www.pexels.com/photo/person-near-glass-panel-with-water-droplets-13586603/ | Photos Jaro | Pexels | silhouette behind a rain-soaked panel with light reflection |
| L20 | https://www.pexels.com/photo/beautfiul-purple-sunset-sky-through-a-window-covered-in-raindrops-8005719/ | Fotios Photos | Pexels | sunset through a raindrop-covered window |
| L21 | https://www.pexels.com/photo/raindrops-on-car-window-with-blurred-lights-34250449/ | Ian Panelo | Pexels | car-window drops, city lights at night |
| L22 | https://www.pexels.com/photo/raindrops-on-a-glass-window-10163433/ | Funiki | Pexels | view through raindrop-covered glass and blinds |
| L23 | https://www.pexels.com/photo/raindrops-on-a-glass-15082719/ | Hikmet A | Pexels | raindrops and streaks, green background |
| L24 | https://www.pexels.com/photo/abstract-raindrops-on-a-window-in-black-and-white-36620583/ | Peter Dyllong | Pexels | B&W raindrops with streaks |
| L25 | https://www.pexels.com/photo/water-droplets-on-car-window-12041365/ | Sezgin Kaya | Pexels | car-window drops, night lights |
| L26 | https://www.pexels.com/photo/grayscale-photo-of-water-droplets-on-glass-window-14216414/ | Phillip Dillow | Pexels | monochrome drops with bokeh |
| L27 | https://www.pexels.com/photo/photograph-of-sun-rays-through-a-window-12376904/ | Gleb | Pexels | sunset through a rain-speckled window |
| L28 | https://www.pexels.com/photo/hand-drawing-heart-on-foggy-window-at-sunset-33207483/ | Johndetochka | Pexels | heart drawn on a foggy window at sunset |
| L29 | https://www.pexels.com/photo/hand-touching-wet-window-15312102/ | Allan Carvalho | Pexels | hand on foggy glass with droplets |
| L30 | https://www.pexels.com/photo/hand-of-unrecognizable-person-behind-wet-window-4306577/ | Rabiahanim | Pexels | hand behind a window covered with drops |
| L31 | https://www.pexels.com/photo/person-s-hand-on-a-moist-glass-5563180/ | Yaroslav Shuraev | Pexels | hand on moist glass |
| L32 | https://commons.wikimedia.org/wiki/File:GGB_reflection_in_raindrops.jpg | (Commons) | free licence; exact licence not re-verified | the Golden Gate tower upside down and shrunk in every drop (earlier pass, viewed) |
| L33 | https://commons.wikimedia.org/wiki/File:Raindrops_on_car_window.jpg | (Commons) | as above | inverted sign colours, two long rivulets (earlier pass) |
| L34 | https://commons.wikimedia.org/wiki/File:Raindrops_on_a_window.jpg | (Commons) | as above | droplet mist with clean vertical runner tracks (earlier pass) |
| L35 | https://commons.wikimedia.org/wiki/File:Rain_drops_on_window_01_ies.jpg | (Commons) | as above | drops bright over dark ground, near invisible over sky (earlier pass) |
| L36 | https://commons.wikimedia.org/wiki/File:Rain.drops.jpg | (Commons) | as above | mixed sizes, dark rim on one side, bright core (earlier pass) |
| L37 | https://commons.wikimedia.org/wiki/File:Rain_drops_on_window_bar.jpg | (Commons) | as above | drops on a window bar (in the earlier pass's folder; not described there) |
| L38 | https://commons.wikimedia.org/wiki/File:Raindrops_on_the_window.jpg | (Commons) | as above | raindrops on a window (title) |
| L39 | https://commons.wikimedia.org/wiki/File:Raindrops_on_the_window_(19122141269).jpg | (Commons) | as above | raindrops on a window (title) |
| L40 | https://commons.wikimedia.org/wiki/File:Radevormwald_-_Raindrops_on_a_window_08_(1)_ies.webm | (Commons) | as above | **video** of drops on a window (title; useful for motion) |
| L41 | https://commons.wikimedia.org/wiki/File:Radevormwald_-_Raindrops_on_a_window_11_(1)_ies.webm | (Commons) | as above | **video** of drops on a window (title) |
| L42 | https://science.nasa.gov/image-article/apod-2017-january-27-venus-through-water-drops/ | John Bell | © photographer; comparison only | sunset and Venus upside down in every drop (earlier pass) |
| L43 | https://epod.usra.edu/blog/2011/12/water-drops-and-inverted-images.html | EPOD | as on page | drops on a surface with inverted images (earlier pass) |
| L44 | https://pixabay.com/photos/glass-rainy-window-hand-shadow-97504/ | tatlin | Pixabay Content License | per title: rainy window, hand, shadow (not viewed) |
| L45 | https://pixabay.com/photos/wet-glass-rain-drops-thunderstorm-350235/ | ArtTower | Pixabay Content License | per title: wet glass in a thunderstorm (not viewed) |
| L46 | https://pixabay.com/photos/rain-wet-water-drip-window-nature-4806609/ | RahulPandit | Pixabay Content License | per title: dripping window (not viewed) |

The Pixabay licence summary is free use with no attribution; no
"standalone" redistribution
([pixabay.com/service/license-summary](https://pixabay.com/service/license-summary/)).

**Count:** 50 downloaded + 46 linked = **96 references**. Those I viewed
myself: 50 downloaded today, plus 5 Commons files viewed in the earlier
pass.

**Gap.** No free photograph of the classic sunlight-through-a-rainy-window
wall pattern was found. Flickr's search is blocked to the fetcher, and
Commons was not fetchable. Suggested: photograph it on site with the
sun or a small lamp through a sprayed window onto white card at 2, 10 and
50 cm. That would also test §2.7's numbers.

---

## 4. What could not be read, and limits of this round

**Unreadable pages:**

- **Rate-limited or blocked:**
  - arXiv HTML 2609.37870 ("Learning From Synthetic Photorealistic
    Raindrop…"): refused by the fetch proxy, 429;
  - ResearchGate (Chen 2013 figures; "Real-time water drops and flows on
    glass panes"): 429;
  - Semantic Scholar: 403;
  - Shadertoy (Heartfelt page and terms): 403;
  - GitHub API: 403;
  - APS (Beysens & Knobler 1986 PRL; Stricker 2022 PRR): 403;
  - Royal Society (Nye's drop caustics): 403;
  - ACM PDFs: 403;
  - AMS journals: 403.
- **Not fetchable, robots, or captcha:**
  - Wikimedia Commons (cache-only);
  - NASA ADS (robots);
  - IOP (Phys. Educ. frosted glass; robots);
  - Flickr search (robots);
  - PMC (captcha);
  - HAL (access denied).
- **Rendered empty:** IEEE Xplore (Yang & Zhu 2004; Zhang 2012 abstract);
  Epic's Project Hillside docs.
- **Not found:** EdoFrank/RainDropEffect (404).

Per the rules, I did not work around any of these.

**Search budget.** The session's WebSearch budget (200 calls) ran out
partway through. Later discovery used direct fetches of known pages and
the image sites' own search endpoints. Some prior art may therefore be
missing, notably:

- any dedicated real-time breath-figure renderer;
- talks on recent racing-game windscreens;
- free Unreal or Unity rain-glass samples beyond those listed.

**Not viewed:** Driveclub, GT and Forza footage; the Heartfelt output;
Chen 2013 figures. Their realism ratings say so.

---

## 5. Sources (main ones, grouped)

**Prior art**

- [Tatarchuk & Isidoro 2006 (course notes)](https://advances.realtimerendering.com/s2006/Chapter3-Artist-Directable_Real-Time_Rain_Rendering_in_City_Environments.pdf) · [EG diglib](https://diglib.eg.org/items/b4d11d22-3e3d-4ac5-b33c-6b091143add1)
- Kaneda: [CA'93](https://home.hiroshima-u.ac.jp/kin/publications/CA93/wdroplet.html) ([PDF](https://home.hiroshima-u.ac.jp/kin/publications/CA93/wdroplet.pdf)), [PG'96](https://home.hiroshima-u.ac.jp/kin/publications/PG96/droplet.html), [JVCA'99](https://home.hiroshima-u.ac.jp/kin/publications/JVCA/index.html), [list](https://home.hiroshima-u.ac.jp/kin/publications/)
- [Chen, Chen & Wong 2013](https://www.sciencedirect.com/science/article/abs/pii/S0097849313001295)
- [Zhang et al. 2012](https://swang81.github.io/mypaper/papers/tvcg.pdf)
- [Wang, Miller & Turk 2007](https://faculty.cc.gatech.edu/~turk/paper_pages/2007_shallow_waves/index.html)
- [El Hajjar et al. 2009](https://link.springer.com/article/10.1007/s00371-007-0207-7)
- [Stuppacher & Supan 2007](https://old.cescg.org/CESCG-2007/papers/Hagenberg-Stuppacher-Ines/cescg_StuppacherInes.pdf)
- [Engelnkemper et al. 2016](https://www.uni-muenster.de/Physik.TP/~thiele/Paper/EWGT2016prf.pdf) · [Engelnkemper & Thiele 2019](https://arxiv.org/abs/1901.10235) ([EPL](https://epljournal.edpsciences.org/articles/epl/abs/2019/17/epl19830/epl19830.html))
- [Plourde, Nori & Bretz 1993](https://arxiv.org/abs/cond-mat/9402080)
- [Keshtkar & Aburumman survey](https://arxiv.org/html/2411.15880v1)
- [Rousseau et al., GPU Rainfall](https://classes.cs.uchicago.edu/archive/2022/fall/23700-1/papers/gpu-rain.pdf)
- [von Bernuth et al. 2018](https://www.embedded.uni-tuebingen.de/assets/publications/vonBernuth-Volk-Bringmann_Raindrops.pdf) · [You et al. 2016](https://users.cecs.anu.edu.au/~u1018276/Downloads/ShaodiYou-PAMI.pdf) · [Hamzeh & Rawashdeh 2021](https://www.mdpi.com/2313-433X/7/3/52) · [Hamzeh et al. 2021](https://www.researchgate.net/publication/353782597_Dynamic_Adherent_Raindrop_Simulator_for_Automotive_Vision_Systems)
- [Gaylard et al. 2017](https://journals.sagepub.com/doi/pdf/10.1177/0954407017695141)
- Code: [raindrop-fx](https://github.com/SardineFish/raindrop-fx) · [Codrops RainEffect](https://github.com/codrops/RainEffect) ([licensing](https://tympanus.net/codrops/licensing/), [article](https://tympanus.net/codrops/2015/11/04/rain-water-effect-experiments/)) · [Heartfelt mirror](https://github.com/sanxincao/shadertoy/blob/master/heartfelt.glsl) · [Unity-Raindrops](https://github.com/ya7gisa0/Unity-Raindrops) · [Toadstorm](https://github.com/toadstorm/rainyglassshader) · [Godot raindrops](https://godotshaders.com/shader/raindrops-glass/) · [Primozic](https://cprimozic.net/notes/posts/building-realistic-rainy-window-pane-in-threejs/) · [Blinc](https://github.com/project-blinc/blinc) · [chasergit thread](https://discourse.threejs.org/t/rain-drops-windows/47316) · [YHK](https://github.com/YHK-UEPlugins-Public/017_RaindropsOnGlass_Public)
- Games: [TheGamer](https://www.thegamer.com/driveclub-ps4-details-raindrops/) · [GamingBolt](https://gamingbolt.com/driveclub-uses-real-world-weather-physics-weather-effects-compared-with-forza-horizon-2) · [PS Blog](https://blog.playstation.com/2014/07/08/first-look-driveclubs-dynamic-weather-in-action/) · [Unity thread](https://discussions.unity.com/t/water-drops-like-the-driveclubs/593221) · [GTPlanet](https://www.gtplanet.net/forum/threads/windshield-droplets-and-gt7-pic-heavy.404244/) · [Xbox Wire](https://news.xbox.com/en-us/2015/09/17/games-forza-motorsport-6-when-it-rains-it-pours/) · [Lagarde 2a](https://seblagarde.wordpress.com/2012/12/27/water-drop-2a-dynamic-rain-and-its-effects/) · [Lagarde 2b](https://seblagarde.wordpress.com/2013/01/03/water-drop-2b-dynamic-rain-and-its-effects/)

**Physics**

- Wetting and contact angles:
  - [Hodgson et al. 2021](https://link.springer.com/article/10.1007/s00348-021-03219-2)
  - [Li et al. 2023](https://www.nature.com/articles/s41467-023-40289-8)
  - [de la Madrid et al. 2015](https://ar5iv.arxiv.org/html/1505.04104)
  - [Wind- and gravity-forced depinning](https://ar5iv.labs.arxiv.org/html/2009.04059)
  - [Emergent Scientist 2019](https://emergent-scientist.edp-open.org/articles/emsci/full_html/2019/01/emsci180004/emsci180004.html)
  - [ElSherbini & Jacobi I](https://www.sciencedirect.com/science/article/abs/pii/S0021979703011688) / [II](https://www.sciencedirect.com/science/article/abs/pii/S002197970301169X)
  - [Kim, Lee & Kang 2002](https://www.sciencedirect.com/science/article/abs/pii/S0021979701981561)
- Moving contact lines and rivulets:
  - [Snoeijer & Andreotti 2013](https://pof-snoeijer.tnw.utwente.nl/Papers/2013/SnoeijerARFM13.pdf)
  - [Daerr et al.](https://people.maths.bris.ac.uk/~majge/del08.pdf)
- Condensation:
  - [Beysens 2006](https://www.sciencedirect.com/science/article/pii/S1631070506002325)
  - [Stricker et al. 2022](https://arxiv.org/abs/2110.00691)
  - [Thermopedia](https://www.thermopedia.com/content/708/)
  - [Hu et al. 2021](https://www.mdpi.com/2076-3417/11/4/1553)
  - [Singh et al. 2018](https://web.iitd.ac.in/~bahga/pdfs/2018_Singh_Mathematical%20Model%20for_Dropwise%20Condensation.pdf)
- Rain and wind:
  - [Wikipedia: Rain](https://en.wikipedia.org/wiki/Rain)
  - [Raindrop size distribution](https://en.wikipedia.org/wiki/Raindrop_size_distribution)
  - [Blocken & Carmeliet 2004](https://urbanphysics.net/2004_JWEIA_WDRreview_preprint.pdf)
- Impacts and splashing:
  - [Zhang et al. 2021 (splashing)](https://link.springer.com/article/10.1186/s42774-021-00091-w)
  - [Šikalo et al. 2005](https://www.sciencedirect.com/science/article/abs/pii/S0021979705000573)
- Surfaces and drying:
  - [Wetting (Wenzel)](https://en.wikipedia.org/wiki/Wetting)
  - [Coffee ring](https://en.wikipedia.org/wiki/Coffee_ring_effect)
  - [Self-cleaning glass](https://en.wikipedia.org/wiki/Self-cleaning_glass)
  - [Water-repellent glass](https://en.wikipedia.org/wiki/Water-repellent_glass)
  - [Thin-film equation](https://en.wikipedia.org/wiki/Thin-film_equation)

**Optics**

- Raindrop appearance:
  - [Garg & Nayar 2007](https://cave.cs.columbia.edu/Statics/publications/pdfs/Garg_IJCV07.pdf)
  - [Optical properties of water](https://en.wikipedia.org/wiki/Optical_properties_of_water_and_ice)
  - [Retroreflector](https://en.wikipedia.org/wiki/Retroreflector)
- Caustics:
  - [Lock 2020](https://opg.optica.org/ao/abstract.cfm?uri=ao-59-21-F32)
  - [Stony Brook caustics poster](https://www.stonybrook.edu/laser/_samantha/summer2013.html/CausticPosterFinalScibelli.pdf)
  - [Caustic (optics)](https://en.wikipedia.org/wiki/Caustic_(optics))
  - [Atmospheric Optics: caustics](https://atoptics.co.uk/blog/light-patterns-caustics/)
- Light through condensation:
  - [Pollet & Pieters 2002](https://opg.optica.org/ao/abstract.cfm?uri=ao-41-24-5122)
  - [Zhu et al. 2017](https://www.seas.ucla.edu/~pilon/Publications/JQSRT2017-Droplets.pdf)
  - [Huang et al. 2020](https://www.seas.ucla.edu/~pilon/Publications/JQSRT2020-bidirectional%20transmittance%20droplets.pdf)
  - [Simsek et al. 2021](https://www.seas.ucla.edu/~pilon/Publications/JQSRT2021-droplet-experiments-visible.pdf)
- Popular explanations of fogging:
  - [Naked Scientists: soap and fog](https://www.thenakedscientists.com/articles/questions/why-does-soap-stop-mirrors-fogging)
  - [Naked Scientists: car window](https://www.thenakedscientists.com/articles/questions/why-cant-i-get-car-window-fog-twice)

**Image licences**

- [Unsplash License](https://unsplash.com/license) · [Pexels License](https://www.pexels.com/license/) · [Pixabay Content License](https://pixabay.com/service/license-summary/)

**Local material, in `scratchpad/research/`**

- `calc/drop_caustic.py`, `calc/blurred.py`, `calc/rainflux.py`: the
  computed tables.
- `eval/`: screenshots of the prior art and of the site, used for the
  realism ratings.
- `rain-refs/`: the 50 references and `index.md`.
