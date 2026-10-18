# Shadows good enough for a shadow puppet show (R6)

Research only, 2026-10-01. No code changed. Every claim has a source link.
Numbers marked **(computed)** are worked out here from a cited formula and
our own defaults. **(estimate)** marks a judgement that no source states.
Code is quoted as `file:line` against the tree on this date.

The ask (Ony, 2026-10-01): shadows real enough to stage a live shadow puppet
show from animated elements' shadows. "Light and shadow are the big systems
here that everything interacts with." What he has reported:

- shadows that did not follow the light (one cause found and fixed: the
  `.sr-only` copy of each heading in the caster mask, `casters.ts:199-208`);
- shadows too fuzzy and too light with the lamp close;
- shadows should grow, stretch, darken and distort with the caster's distance,
  the angle, the light's distance and the light's brightness;
- shadows must go through the glass and be filtered twice by stacked panes.

---

## 0. Short answer

- **Keep the model's geometry.** Our casters are flat shapes parallel to the
  photograph, lit by a disc lamp. For that case the soft shadow is exactly the
  caster's mask, projected from the lamp and convolved with the lamp's disc
  ([Soler & Sillion 1998](https://dumas.ccsd.cnrs.fr/INRIA/inria-00510082v1)). PCSS
  makes the same parallel-planes assumption
  ([Fernando 2005](https://developer.download.nvidia.com/shaderlibrary/docs/shadow_PCSS.pdf)).
  `castPoint` and `casterCover` already do this, and their formulas check out
  (§5.1).
- **Fix five things that make the shadows look wrong:**
  1. The darkness model. Lit areas fade toward the lamp's colour instead of
     brightening the photograph, and opaque type passes 40% of the light
     (`castShadowStrength` 0.6).
  2. The lamp's brightness and its height do not change the light on the
     floor.
  3. Every caster on a channel shares one fixed height.
  4. The sampling: 13 taps with equal weights, no prefilter, no per-pixel
     rotation.
  5. Shadows have no colour.
- **Puppets need a small lamp.** At the default "Light size" of 46 px the lamp
  spans 17° (computed). Every real shadow-theatre source asks for "as small a
  filament as possible" ([Reed](https://www.csmonitor.com/1998/1027/102798.home.home.1.html)).
  The fuzzy, pale type shadows Ony sees through the glass are what physics
  predicts for a lamp that size (§5.3). They are not a bug in the convolution.

---

## 1. Tools first

| Candidate | What it is | Licence | Fits our case? | Decision |
|---|---|---|---|---|
| PCSS, [Fernando 2005 (NVIDIA)](https://developer.download.nvidia.com/shaderlibrary/docs/shadow_PCSS.pdf) | Blocker search, then penumbra = (d_r − d_b)·w_light/d_b, then PCF | Paper | Yes. It is our geometry. We already know each caster's height, so we skip its blocker search. | **Port the idea** (penumbra rule, variable filter) |
| [three.js `webgl_shadowmap_pcss`](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_shadowmap_pcss.html) | WebGL1 PCSS, 17 Poisson samples in 11 rings | [MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE) | Sampling pattern only. It needs a 3D scene and a shadow map. | Port the sampling ideas |
| [drei `SoftShadows`](https://github.com/pmndrs/drei/blob/master/src/core/softShadows.tsx) | PCSS with a **Vogel disc** (golden angle 2.399963) and per-pixel noise, default 10 samples | [MIT](https://github.com/pmndrs/drei/blob/master/LICENSE) | Its sampling is exactly what our 13 taps lack | **Port** the Vogel disc and the rotation |
| [Babylon.js contact-hardening shadows](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows) | PCSS in an engine (doc not read in detail) | [Apache-2.0](https://github.com/BabylonJS/Babylon.js/blob/master/license.md) | Needs Babylon's scene graph | Reference only |
| Soler & Sillion, [convolution soft shadows (1998)](https://dumas.ccsd.cnrs.fr/INRIA/inria-00510082v1) | Exact soft shadow of a planar occluder parallel to the light and receiver, as a convolution | Paper | Exactly our case | **Basis of the model (keep)** |
| Summed-area tables / SAVSM, [GPU Gems 3 ch. 8](https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-8-summed-area-variance-shadow-maps) | Constant-time box filter of any size | Book (free) | Needs fp32 textures. A 512² table eats 18 of 23 mantissa bits. Heavy in WebGL1 (estimate). | Not now. Mipmaps instead (§6). |
| Quilez, [SDF soft shadows](https://iquilezles.org/articles/rmshadows/) `k·h/t` | Penumbra from how close a ray passes to a distance field | Licence not stated on the page | Needs a 3D SDF of the scene. Our occluders are layered 2D masks. | Read for ideas |
| Radiance cascades, [Sannikov paper](https://github.com/Raikiri/RadianceCascadesPaper) (MIT repo); [jason.today/rc](https://jason.today/rc) (code MIT, WebGL) | Noise-free 2D global illumination: light moving *within* the plane | MIT | **No.** It is flatland transport, with lights and occluders in the same plane. Our lamp is *above* the plane and the casters are stacked layers. | Do not adopt. Note for a future "light in the plane" effect. |
| [Red Blob 2D visibility](https://www.redblobgames.com/articles/visibility/) | Visibility polygon from a point in a 2D map | Apache-2.0 | Lights in the plane, not above it | No |
| [illuminated.js](https://github.com/gre/illuminated.js) | 2D canvas lights and shadows | **LGPL-3.0** ([LICENSE](https://github.com/gre/illuminated.js/blob/master/LICENSE)), archived 2020 | In-plane, and not permissive | Read-only, no |
| [pixi-lights](https://github.com/pixijs/lights) | Deferred normal-map lighting for PixiJS | MIT | Shadows are not implemented ("on the roadmap") | No |
| [Bend Studio screen-space shadows](https://www.bendstudio.com/blog/inside-bend-screen-space-shadows/) | Ray march in the depth buffer toward the light | Licence not stated on the page | Needs a depth buffer. We have none. | No |
| Shadow maps (general) | Depth from the light, compared per pixel | — | Our mask *is* a light-space occluder map for flat layers; a depth map would add nothing | No |

**Verdict: build on the model we have, porting the sampling from drei (MIT)
and the penumbra rule from PCSS/Soler–Sillion.** No library does planar
layered casters over a photograph lit from above. Every 2D library found puts
the light in the plane.

---

## 2. What a real shadow puppet show looks like

### 2.1 The light

- Wayang kulit (Java/Bali): "A coconut oil lamp (bléncong; Balinese: damar)
  – which in modern times is usually replaced with electric light – casts
  shadows onto the screen" ([Wikipedia](https://en.wikipedia.org/wiki/Wayang_kulit)).
  The screen is "a stretched linen canvas (kelir)" (same). The dalang works
  behind a cotton screen "illuminated by oil lamp or modern halogen lamp"
  ([Shadow play](https://en.wikipedia.org/wiki/Shadow_play)).
- The kind of light changes how the figures read. With the flame the head to
  body proportion is 1 : 6.5; with electric light it is 1 : 5. Dalangs also
  use strobe effects ([Puppetry International Research, 2023](https://pirjournal.commons.gc.cuny.edu/2023/10/03/revitalizing-wayang-puppetry-through-creative-lighting/)).
- Karagöz (Turkey): "lit from behind by an electric bulb (in the past by a
  candle or flame)". The screen is thin white cloth, about 1–1.10 m by
  60–80 cm ([WEPA](https://wepa.unima.org/en/karagoz/)).
- Larry Reed (ShadowLight, the modern reference): "Use a clear (unfrosted)
  light bulb with as small a filament as possible. … The principle behind it
  all is a single-point light source." "The shadows are very sharp and clear
  because the flame is so bright and so small." "If you move the puppets too
  fast, the shadows will be blurry" ([CSMonitor 1998](https://www.csmonitor.com/1998/1027/102798.home.home.1.html)).
- Shadowgraphy (hand shadows): "The best shadows come from light proceeding
  from the smallest possible point", for example a candle or a flashlight
  with its lens and reflector removed ([Wikipedia](https://en.wikipedia.org/wiki/Shadowgraphy_(performing_art))).
- Home and education guides: a single-LED light or a phone flashlight gives
  sharp shadows, with all other lights in the room off
  ([BYU 4th Wall](https://4thwalldramaturgy.byu.edu/shadow-puppetry-tips-and-tricks)).

### 2.2 Distances, size and sharpness

- "The farther the hands are from the light, the smaller the shadows will be
  … the closer the hands are to the blank surface, the sharper the shadows
  will be." Trewey's set-up: light about 4 ft from the hands, hands about 6 ft
  from the wall ([Shadowgraphy](https://en.wikipedia.org/wiki/Shadowgraphy_(performing_art))).
  That gives h/H = 0.6 and a magnification of H/(H−h) = 2.5 **(computed)**.
- ShadowLight: a 2 ft puppet throws a 10–15 ft shadow on a 15 × 30 ft screen
  ([CSMonitor](https://www.csmonitor.com/1998/1027/102798.home.home.1.html)).
  That is a magnification of 5–7.5, so h/H ≈ 0.80–0.87 **(computed)**. Reed's
  technique "allowed shadows to vary in size and focus" by moving the puppets
  between the point-source light and the screen
  ([Wikipedia](https://en.wikipedia.org/wiki/Larry_Reed_(puppeteer))). The
  company uses "multiple electric light sources to create cinematic effects"
  ([ShadowLight](https://www.shadowlight.org/about)).
- Traditional puppets are "held close to the screen and lit from behind"
  ([Shadow play](https://en.wikipedia.org/wiki/Shadow_play)). Pressed to the
  screen, a puppet throws a sharp shadow at 1:1 size. Pulled toward the lamp,
  the shadow grows and softens
  ([Science Buddies](https://www.sciencebuddies.org/stem-activities/shadow-puppets)).

### 2.3 Coloured and translucent puppets

- Karagöz figures are hide "translucent from the washing, scraping, and
  polishing", painted "with vegetable dyes in lively, translucent colours".
  They cast "coloured silhouettes" ([WEPA](https://wepa.unima.org/en/karagoz/)).
- Chinese *píyǐngxì* gives figures "some color on the screen; they are not
  100% black and white" ([Shadow play](https://en.wikipedia.org/wiki/Shadow_play)).
  It is on the [UNESCO list](https://ich.unesco.org/en/video/6486).
- Indian *tholu bommalata* uses "translucent, lusciously multicolored leather
  figures" ([Shadow play](https://en.wikipedia.org/wiki/Shadow_play)).
- Wayang kulit figures are buffalo hide punched with *tatah* tools
  ([Wikipedia](https://en.wikipedia.org/wiki/Wayang_kulit)). They cast mostly
  dark shadows with lace-like holes of light.

### 2.4 Reference photographs

- Wayang kulit, shadow side and puppeteer side:
  [Pertunjukan Wayang Kulit](https://commons.wikimedia.org/wiki/File:Pertunjukan_Wayang_Kulit.jpg),
  [WayangKulit Scene Zoom](https://commons.wikimedia.org/wiki/File:WayangKulit_Scene_Zoom.JPG),
  [Shadow puppets (Jakarta)](https://commons.wikimedia.org/wiki/File:Shadow_puppets.jpg),
  [Yogyakarta Kraton show (Flickr)](https://www.flickr.com/photos/asienman/50557133761).
- Chinese, coloured figures on a back-lit screen:
  [Chinese shadow puppetry](https://commons.wikimedia.org/wiki/File:Chinese_shadow_puppetry.jpg).
- Karagöz:
  [Karagoz theatre 06315](https://commons.wikimedia.org/wiki/File:Karagoz_theatre_06315.JPG),
  [Karagöz Hacivat](https://commons.wikimedia.org/wiki/File:Karag%C3%B6z_Hacivat.JPG),
  [figures](https://commons.wikimedia.org/wiki/File:Karagoz_figures.jpg).
- The whole category: [Commons: Shadow play (91 files)](https://commons.wikimedia.org/wiki/Category:Shadow_play).
- Coloured shadows from several lights: [Exploratorium exhibit](https://www.exploratorium.edu/exhibits/colored-shadows).

**What to check against them:**

- Edges are near black and crisp for puppets on the screen.
- A puppet pulled back shows a soft, larger, greyer edge.
- Translucent figures throw coloured light through the dye.
- Perforations show as points of light.
- The room is dark, so there is almost no fill light.

---

## 3. The physics

Notation:

- lamp of radius R at L, height H above the receiver (the photograph);
- caster point C at height h (0 < h < H);
- floor point P;
- θ is the angle of the light from vertical at P.

### 3.1 Where the shadow lands and how big it is

By similar triangles, a point lamp throws C to S = L + (C − L)·H/(H − h).

- The shadow is magnified by M = H/(H − h).
- It is pushed away from the lamp by (C − L)·h/(H − h).

This is the rule our `effects/optics/shadow.ts` header states. It is the PCSS
"parallel planes" geometry ([Fernando 2005](https://developer.download.nvidia.com/shaderlibrary/docs/shadow_PCSS.pdf)),
and it gives Shadowgraphy's rule that a caster nearer the light throws a
bigger shadow ([Wikipedia](https://en.wikipedia.org/wiki/Shadowgraphy_(performing_art))).

### 3.2 Umbra and penumbra from a disc lamp

- PCSS: w_penumbra = (d_receiver − d_blocker)·w_light/d_blocker
  ([Fernando 2005](https://developer.download.nvidia.com/shaderlibrary/docs/shadow_PCSS.pdf)).
  With w_light = 2R, d_blocker = H − h and d_receiver = H:
  **full penumbra width = 2R·h/(H − h)**. The blur kernel on the floor is a
  disc of radius p = R·h/(H − h).
- For a straight edge, the 10–90% width is **1.37 p** **(computed**: the
  fraction of a uniform disc beyond a chord, solved numerically).
- The **umbra** is where the whole lamp is hidden. It vanishes when the light
  source is as large as the occluder or larger; then only the penumbra or
  antumbra is left ([Umbra, penumbra and antumbra](https://en.wikipedia.org/wiki/Umbra,_penumbra_and_antumbra)).
  For a strip of width w at height h, an umbra exists iff **w·H > 2R·h**
  **(computed** from 3.1 and 3.2).
- **Contact hardening.** p → 0 as h → 0. A puppet pressed to the screen is
  sharp; the same puppet pulled toward the lamp is soft (§2.2).
- **At a slant.** Seen from P, a spherical lamp is a disc perpendicular to
  the line of sight. That disc's cone meets the caster's plane as an ellipse,
  stretched by 1/cosθ along the direction to the lamp (the geometry in
  `effects/optics/shadow.ts`). Shadows thrown far to the side are longer and
  softer along their length.
- **Exact model for flat casters.** The soft shadow of a planar occluder
  parallel to a planar receiver, under a planar light, is the occluder's
  image (scaled by M) convolved with the light's image (scaled by
  h/(H − h)) ([Soler & Sillion 1998](https://dumas.ccsd.cnrs.fr/INRIA/inria-00510082v1)).

### 3.3 How much light arrives

- Inverse square: irradiance from a point source is inversely proportional to
  the distance squared. The error is under 1% when the source is less than a
  fifth of the distance ([Wikipedia](https://en.wikipedia.org/wiki/Inverse-square_law)).
- Lambert: irradiance ∝ cosθ ([Lambert's cosine law](https://en.wikipedia.org/wiki/Lambert%27s_cosine_law);
  [CCS illuminance guide](https://www.ccs-grp.com/guide/theory-light-color/08_illuminance-properties.html)).
- Together, on a plane: **E = I·cos³θ / H²**. This is the cos³ law
  `transmission.ts:44-51` cites, but that code drops the 1/H².

### 3.4 How dark a shadow is

- A shadow is the light that did not arrive. What is left in it is every other
  light: **out = ρ·(A + Σᵢ Eᵢ·Vᵢ)**, where:
  - ρ is the photograph's reflectance;
  - A is the fill (room or ambient);
  - Vᵢ ∈ [0, 1] is the share of lamp i that is visible.
- Photographers measure this as the lighting ratio (key + fill) : fill
  ([ASC via Wikipedia](https://en.wikipedia.org/wiki/Lighting_ratio)). Stronger
  fill means lighter shadows. A shadow show is played in a dark room (A ≈ 0),
  so shadows are near black ([BYU](https://4thwalldramaturgy.byu.edu/shadow-puppetry-tips-and-tricks):
  "turn off all other lights").
- **Several lights add.** Each shadow is lit by the other lights. With red,
  green and blue lamps you get seven shadow colours
  ([Exploratorium](https://www.exploratorium.edu/snacks/colored-shadows)).
- **Translucent and coloured casters** pass a share T(λ) of the light, as a
  gel does: it absorbs some wavelengths and transmits the rest
  ([Gel (lighting)](https://en.wikipedia.org/wiki/Gel_(lighting))). For a
  dyed hide of thickness d, T = exp(−α(λ)·d)
  ([Beer–Lambert](https://en.wikipedia.org/wiki/Beer%E2%80%93Lambert_law)).
  The shadow's light is E·T(λ). That is the Karagöz "coloured silhouette"
  ([WEPA](https://wepa.unima.org/en/karagoz/)).

### 3.5 Through the glass

- Each pane the ray crosses multiplies the light by its own transmission
  (Fresnel at two faces plus absorption: `effects/optics/stack`). Two panes
  give T₁·T₂.
- **Frost.** A frosted face scatters each ray into a lobe
  ([Walter et al. 2007](https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.html)).
  - Below the pane, the lobe blurs a shadow already cast by about α·gap.
  - For a caster *below* a frosted pane, the frost makes the lamp look bigger.
  - Independent blurs add in quadrature when both are roughly Gaussian
    (variances add) **(estimate**, the rule `floor-light-shader.ts:295-299`
    already uses).

---

## 4. Real-time techniques against our setup

Our setup:

- one viewport-sized 2D canvas mask of the casters (`paintCasters`);
- a WebGL1 full-screen pass (`effects/engine/gl.ts:53`, `getContext("webgl")`);
- per pixel, per light: project to each caster height and average the mask
  over the lamp's disc.

| Technique | Cost per pixel | Fit |
|---|---|---|
| **Ours: projected mask × disc** (Soler–Sillion case) | taps × layers × lights | Exact for flat layers. Keep it. |
| PCSS with a blocker search | 2 × taps | We already know each layer's height. No search needed. |
| Prefiltered mask (mipmaps) + a few rotated taps | ~8–12 taps on a level matched to the disc | Removes banding at fixed cost. **WebGL1 builds mipmaps only for power-of-two textures** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL)), so the mask must be drawn at a power-of-two size. GLSL ES 1.00 `texture2D(s, uv, bias)` picks the level in a fragment shader ([GLSL ES 1.00 spec §8.7](https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf)). |
| Summed-area table | 4 taps | Precision trouble in WebGL1 ([GPU Gems 3 ch. 8](https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-8-summed-area-variance-shadow-maps)) |
| Vogel disc + per-pixel rotation (interleaved gradient noise) | same taps | Turns banding into fine noise ([Jimenez 2014](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/); [drei](https://github.com/pmndrs/drei/blob/master/src/core/softShadows.tsx)) |
| SDF cone-trace ([Quilez](https://iquilezles.org/articles/rmshadows/)) | march steps | Needs a 3D distance field. No. |
| Radiance cascades ([jason.today](https://jason.today/rc)) | several passes | In-plane 2D GI, the wrong geometry. No. |
| Screen-space ray march ([Bend](https://www.bendstudio.com/blog/inside-bend-screen-space-shadows/)) | march steps | No depth buffer. No. |

---

## 5. Audit of our model

Defaults (`lib/tuning.ts:922-985`):

- Light height H = 300, Light size R = 46.
- Content depth 22, so near casters stand at h = 0.45·22 = **9.9 px**.
- Glass height 70 and thickness 18, so type on a pane stands at
  **97.9 px** and a card's print at **110 px**.

The tuning hint says 18 px is about 5 mm, so 1 mm ≈ 3.6 px **(computed)**. On
that scale:

- the lamp is a 26 mm globe 83 mm above the photograph;
- its angular diameter is 2·atan(46/300) = **17.4°** **(computed)**.

### 5.1 Geometry: right

- `casters.glsl.ts:8` `vec2 c = P + (L - P) * (h / H);`. This is the point
  where P's ray to the lamp crosses the caster's plane. Correct (§3.1).
- `casters.glsl.ts:14` `float across = R * h / H;`. The lamp's cone from P
  has radius R·h/H at height h. A shift δ on the caster plane moves the
  shadow by δ·H/(H − h) on the floor, so this equals a floor kernel of
  R·h/(H − h), the PCSS penumbra (§3.2). **Correct.**
- `casters.glsl.ts:13,16` stretch by 1/max(cosθ, 0.2) along the lamp
  direction. Right for a spherical lamp (§3.2). The 0.2 clamp caps the
  stretch at 5×.
- `castPoint` and `lampDiscAt` (`casters.ts:89-114`) are the CPU twins and are
  tested (`casters.test.ts:10-26`).

### 5.2 Defect: darkness, and why shadows look light

The hypothesis was that only the lamp's added light is removed and the
photograph never darkens below its unlit look. **That is not what the code
does.** The floor canvas is composited as straight alpha over the photograph:

- `floor-light-shader.ts:523` `float shade = 1.0 - exp(-f.a * 1.15);`
- `floor-light-shader.ts:524` `float a = clamp(max(add.r, …) + shade, 0.0, 1.0);`
- `floor-light-shader.ts:545` `gl_FragColor = vec4(a > 0.0 ? light / a : vec3(0.0), a);`

So out = photo·(1 − a) + lamp·add. Shade does darken the photograph. The real
causes of pale shadows are below.

1. **Opaque casters pass 40% of the lamp.**
   - `floor-light-shader.ts:436`: `light *= (1.0 - near * uCasterStrength) * …`
   - `uCasterStrength` = `castShadowStrength`, value 0.6 (`tuning.ts:922-930`).
   - Its own hint says "1 is solid ink blocking all of it, as type does".
2. **Lit areas fade toward the lamp's colour; they do not multiply.**
   Physically a black print under a lamp stays black (out = ρ·E). Here it
   turns grey. Under the lamp (pool 1, gain 0.9) **(computed** from the lines
   above):

   | photo value | lit | shadow (strength 0.6) | shadow (strength 1) |
   |---|---|---|---|
   | 0.1 | 0.68 | 0.36 | 0.03 |
   | 0.5 | 0.82 | 0.42 | 0.16 |
   | 0.9 | 0.96 | 0.49 | 0.29 |

   - At the default the lit-to-shadow ratio is about 2 : 1 (one stop).
   - On dark prints the "shadow" (0.36) is *brighter* than the unlit print
     (0.1).
   - A shadow show wants a far higher ratio (§3.4).
3. **The film roll-off caps shade.** Even with every bit of light blocked
   under the lamp, shade = 1 − e^(−1.15) = 0.68. Away from the lamp the pool
   is cos³θ, so shade is less (line 523).
4. **Brightness is ignored.** `FloorLight.tsx:361` uploads `power`, but the
   floor shader never reads `uLightPower`. `floorAt` receives only `lit`, the
   charge (`floor-light-shader.ts:505-512`). Ony's "brightness of that light"
   has no effect on the floor or its shadows.
5. **Height does not dim.** `transmission.glsl.ts:22-25`
   `irradianceFalloff = c*c*c` is normalised to 1 under the lamp at every
   height. The 1/H² of §3.3 is missing, so bringing the lamp closer does not
   make the pool or the shadow contrast stronger.

### 5.3 Defect (partly physics): too fuzzy and pale through the glass, invisible near

**Computed** from §3.2 at the defaults (p = floor kernel radius; "offset" is
the shadow's push per pixel of lateral distance from the lamp):

| caster | h | p = R·h/(H−h) | offset / lateral distance | magnification |
|---|---|---|---|---|
| near (hero copy) | 9.9 | 1.6 px | 0.034 | 1.03 |
| on pane, on its face (H' = 230) | 9.9 | 2.1 px | 0.045 | 1.05 |
| on pane, on the photograph | 97.9 | **22 px** | 0.48 | 1.48 |
| print, on the photograph | 110 | **27 px** | 0.58 | 1.58 |

- **Through the glass** the lamp disc on the caster plane has radius 15 px.
  The most of the lamp a stroke can hide **(computed)**:

  | stroke width | share hidden at R = 46 | share hidden at R = 6 |
  |---|---|---|
  | 2 px | 8% | 62% |
  | 4 px | 17% | 100% |
  | 8 px | 34% | 100% |
  | 16 px | 65% | 100% |

  Times strength 0.6, a 4 px stroke's shadow removes **10%** of the light.
  That is the pale smudge Ony sees. It is right for a 17° lamp. A puppet lamp
  is a point.
- **Near casters.** At 100 px from the lamp the hero copy's shadow is pushed
  only **3.4 px** **(computed)**, so it hides under the letters. This is a
  second reason the shadows "don't follow the light": at h = 9.9 there is
  almost nothing to see. For any visible throw the heights must be larger,
  and per caster (§5.5).

### 5.4 Defect: sampling (banding, ghost copies)

`casters.glsl.ts:18-27`:

- 13 taps: centre, 4 at 0.45, 8 at 0.9;
- every tap weighted 1/13;
- no prefilter and no per-pixel rotation.

Problems:

- **Equal weights are wrong for a uniform disc.** The area each tap stands for
  is centre 0.051, inner ring 0.101 each, outer ring 0.068 each, against
  0.077 for all **(computed)**. The centre and the outer ring are
  over-weighted.
- **Steps of 1/13 = 7.7%.** As an edge sweeps across, coverage moves in
  7.7% steps, smoothed only by the 1 px LINEAR filter
  (`FloorLight.tsx:402-403`).
- **Gaps bigger than strokes.** Taps on the outer ring are 0.69·b apart, on
  the inner ring 0.64·a **(computed)**. For type on a pane, a = 15 px and
  b ≤ 5a = 75 px at a slant, so taps are 10–52 px apart while strokes are
  2–8 px. The penumbra then breaks into up to 13 offset copies of each glyph
  instead of a blur. That is the classic undersampling PCSS avoids by using
  more samples (36 search plus 64 filter in
  [Fernando 2005](https://developer.download.nvidia.com/shaderlibrary/docs/shadow_PCSS.pdf)),
  or by prefiltering.

### 5.5 Defect: one height per channel, from global settings

- The mask has three channels, so there are three heights
  (`casters.ts:299-301`: `rgb(v 0 0)` near, `rgb(0 v 0)` on glass,
  `rgb(0 0 v)` print).
- The heights come from global tuning (`FloorLight.tsx:407-416`:
  `t("floorGap") + t("glassThickness") + …`).
- But each pane's real height is per pane and per stack
  (`FloorLight.tsx:270-271` `heightOf` = `stack.zBottom` or `causes.gap`,
  `gaps[n]` at `:324`).
- Type on a stack's upper pane, or on a lab pane with its own gap, casts from
  the wrong height.
- No caster can have its own height or animate in depth, and nothing gets
  contact hardening within one caster. **A puppet show needs exactly that:
  each puppet at its own, changing h (§2.2).**

### 5.6 Smaller findings

- **Face height vs caster height.**
  - The shader takes the receiving face at `gap` (`floor-light-shader.ts:300`
    `faceHeight = max(faceHeight, gap …)`) and the caster 9.9 px above it
    (`FloorLight.tsx:408`, used at shader `:429`).
  - The "below" shadow puts the same letter at gap + thickness + 9.9
    (`FloorLight.tsx:413-416`).
  - So one letter's two shadows assume heights 18 px apart (the glass
    thickness). Which face is frosted decides which is right. **Unknown;
    check.**
- **Frost blur units.**
  - `floor-light-shader.ts:421,432` pass `underFrost * 0.5` as extra blur on
    the caster plane.
  - `underFrost` is a floor-plane spread. Floor to caster plane is
    ×(H − h)/H, which is 0.67 for type on a pane **(computed)**, not 0.5.
  - It also includes the frost of every pane crossed. Panes above the caster
    widen the lamp; panes below blur the cast shadow. That is the same
    order of effect, so it is an acceptable approximation **(estimate)**.
- **Seen through the frost.**
  - Under a pane, the floor light is copied into a layer *above* the glass's
    own render (`FloorLight.tsx:166-176`).
  - So the shadow is not blurred by the view path through the frost, while
    the photograph under it is (CSS backdrop filter).
  - The shadow may read sharper than the picture it lies on. This is not
    verified on screen.
- **No colour.**
  - `casterOpacity` gives day-glo orange plastic a grey 0.55 (`casters.ts:127-133`).
  - It should pass orange light.
  - Translucent puppets cannot be coloured at all with a scalar mask.
- **Several lights: right in kind.** Each light runs its own `casterCover`
  with its own position and radius (`floor-light-shader.ts:503-515`), and the
  light sums add (§3.4). The shade is colourless alpha, so a shadow of the
  lamp under the flash is not lit in exact proportion. The multiplicative
  model in §6 makes it exact.
- **Two panes filter twice: right.**
  - `floor-light-shader.ts:403-408` multiplies the light by each crossed
    pane's transmission.
  - Casters then multiply on top (`:436-437`).
  - What is wrong is only the caster heights on the upper pane (§5.5).
- **Guard.** `casters.glsl.ts:7` returns 0 when the lamp is at or below a
  caster, which is correct. "Light height" can go to 60 (`tuning.ts:940-947`),
  which is below the on-glass casters (98), so their shadows grow without
  bound and then vanish as the lamp passes them. That is physically right,
  but the lab should say so.

---

## 6. Decisions

### Keep

- The projected-mask × disc model (Soler–Sillion exact case), `castPoint`,
  `lampDiscAt`, and the per-light loop.
- The per-pane transmission product.
- The `.sr-only` / clip filter (`casters.ts:170-208`).

### Change

1. **Light the photograph multiplicatively.**
   - Formula: out = photo × (A + Σᵢ Eᵢ·Vᵢ·Tᵢ(rgb)·colourᵢ), where A is the
     room fill.
   - CSS cannot multiply by more than 1 in one layer, so split the gain g
     across two canvases:
     - a `mix-blend-mode: multiply` layer carrying min(g, 1);
     - a `color-dodge` layer carrying s = 1 − 1/max(g, 1).
   - Per [W3C Compositing 1](https://www.w3.org/TR/compositing-1/),
     multiply gives Cb·Cs and color-dodge gives min(1, Cb/(1 − Cs)), so the
     pair is an exact gain of g on the backdrop
     ([MDN mix-blend-mode](https://developer.mozilla.org/en-US/docs/Web/CSS/mix-blend-mode)).
   - Cost: one more blit **(estimate)**.
   - **Unknown:** how the liquid-glass raster capture and the pane layers
     treat blend modes. Test there first.
   - Until this lands, the quick fix is `castShadowStrength` default **1**.
2. **Use brightness and distance.**
   - E = P·(H₀/H)²·cos³θ, with H₀ = 300 so today's default is unchanged.
   - P is the light's `power` (already uploaded).
   - Done in `floorAt`, which then needs `uLightPower[i]`.
3. **Caster layers, each with its own height and colour.**
   - Replace "channel = height" with up to **8 layers** **(estimate**, sized
     to `MAX_FLOOR_PANES`).
   - Each layer stores RGB transmission (white = clear) and has its own
     height uniform.
   - Draw them as tiles of one power-of-two atlas, so WebGL1 can mipmap it.
   - Each caster's height:
     - type and buttons on a pane: that pane's top, from `glassGeometry`
       (zBottom + thickness), plus the standoff;
     - hero copy: its standoff;
     - puppets: whatever they animate to.
   - Group by height into layers. Puppets get a layer each.
   - Colour comes from the material: day-glo orange passes orange, dyed hide
     passes its dye.
4. **Sampling.**
   - Prefilter with mipmaps.
   - Take **12 Vogel-disc taps** rotated per pixel by interleaved gradient
     noise ([drei](https://github.com/pmndrs/drei/blob/master/src/core/softShadows.tsx),
     MIT; [Jimenez](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/)).
   - Weight taps by area (Vogel taps are equal-area by construction).
   - Read the mip level log₂(a·√(π/N)), the tap spacing for N taps over a
     disc of radius a **(computed)**.
   - Cost: 12 taps × layers in use × lights; only layers with something
     painted are sampled.
5. **Frost factor.** Use (H − h)/H in place of 0.5.
6. **Settle the face.** Decide which face is frosted, and use the same
   absolute caster height for both of one letter's shadows (§5.6).

### Build for task 83 (the puppet stage)

- **A small lamp preset.** "Point" R = **4 px**, about 1 mm at 3.6 px/mm
  **(estimate**, a filament or LED die per
  [Reed](https://www.csmonitor.com/1998/1027/102798.home.home.1.html) and
  [BYU](https://4thwalldramaturgy.byu.edu/shadow-puppetry-tips-and-tricks)).
  With R = 4, a 4 px stroke on a pane gets a full umbra (§5.3).
- **Puppet depth range.** h from 0 (on the screen: sharp, 1:1) to **0.85·H**
  (magnification 6.7, like ShadowLight's 5–7.5) **(computed)**.
- **Screen mode.** Puppets cast but are not drawn, as the audience sees a
  back-lit screen. Room fill A ≈ **0.05–0.1** (a dark room) **(estimate)**.
- **Several lights.** Each light makes its own shadow, so two lamps give two
  shadows. Coloured lamps give coloured shadows
  ([Exploratorium](https://www.exploratorium.edu/snacks/colored-shadows)).
- **Flicker** for an oil-lamp or candle look comes from R7 (flame).

### Tests (unit for the CPU twins, e2e pixel reads like `e2e/optics.spec.ts:426`)

1. **Centroid.** A square caster at C, height h ∈ {10, 100, 200}, H = 300.
   The shadow's centroid minus C = (C − L)·h/(H − h), to ±1 px.
2. **Size.** Shadow width at 50% = w·H/(H − h), to ±1 px.
3. **Penumbra.** A half-plane edge has a 10–90% width of 1.37·R·h/(H − h)
   across, ±10%. Along the lamp direction at θ it is ×1/cosθ.
4. **Contact hardening.** At h = 1 px the 10–90% width is ≤ 1 px.
5. **Umbra rule.** For a strip of width w, the centre visibility is 0 iff
   w·H ≥ 2R·h. It is > 0 otherwise.
6. **Darkness.** An opaque caster with fill A: lit / shadow = (A + E)/A,
   ±2%. With A = 0 the shadow is black.
7. **Distance and brightness.** H × 2 gives the pool centre × ¼. Power × 2
   gives E × 2, and the shadow contrast follows test 6.
8. **Colour.** A caster with T = (1, 0.2, 0.1) gives shadow light = E·T per
   channel.
9. **Two lights.** The shadow of light 1 is lit by light 2:
   out = ρ·(A + E₂).
10. **No banding.** Move an edge in 0.25 px steps: coverage is monotonic and
    no step exceeds 2%.
11. **Stacks.** Under an overlap the light is × T₁·T₂, and a caster on the
    upper pane uses that pane's height (centroid test 1 holds for it).
12. **Regression.** No caster pixels come from `.sr-only` or clipped text
    (keep the existing fix covered).

### Lab controls

- **Light size**, with presets: Point 4 / Bulb 46 / Diffuser 120.
- **Light height** (exists), with a note when it drops below a caster.
- **Lamp power**, which must reach the floor.
- **Room fill** (A), new: 1 = today's page, low for a show.
- **Caster opacity**: rename "Cast shadow strength" and default it to 1.
- Per puppet: **height** and **transmission colour**.
- **Shadow quality**: taps 8 / 12 / 24.
- A **debug view** of the mask layers and the penumbra radius.

### Still unknown

- Which pane face is frosted (§5.6).
- How the blend-mode pair composites through the liquid-glass raster capture.
- Real GPU cost of 12 taps × layers × lights at 1.5× DPR. The floor pass is
  desktop-only (`FloorLight.tsx:59`); measure with `e2e/perf.spec.ts`.
- Calibrated transmission colours for real dyed hide (no measured spectra
  found).
- The R7 flame data, for the candle and oil-lamp preset.

## 7. Status (2026-10-01)

- Change 1 (room fill): done as a "Room fill" knob (04295d5). The part of
  photo x (A + E) under 1 is darkening in the floor layer, so the
  blend-mode pair was not needed; over 1 the lamps add as before. E is the
  light's brightest channel after the film curve **(estimate)**.
- Change 2 (power and distance): done (63c60e8).
- Change 3 (caster layers): done with 6 layers in two RGB masks (0b09293),
  not the 8-tile atlas; mip prefilter still to do.
- Change 4 (12 Vogel taps, rotated): done (63c60e8); mipmaps still to do.
- Change 5 (frost factor): done (63c60e8).
- Change 6 (the face): settled: the frosted face is the pane's lower face,
  at its gap, where the floor pass already had it; each caster stands at
  gap + thickness + standoff, and both of a letter's shadows use that one
  height.
- Point / Bulb / Diffuser light-size presets: done (f9fcf86).
- The puppet stage (a first cut of task 83 on Lab samples) is removed at
  Ony's word (2026-10-01: he wanted shadows good enough for a show, not a
  show). What it added stays, renamed: shape casters (effects/optics/
  shape-casters: things in the room with their own outline and height,
  used by the balloons) and the room-fill override (effects/light/
  room-fill, used by the torch).
- Still to build: shadow quality (mip prefilter) and a debug view of the
  mask layers.
