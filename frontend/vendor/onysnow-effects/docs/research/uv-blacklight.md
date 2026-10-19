# UV / black light: what a black-lit scene looks like in a photo, and how to render it

Research for the black-light cursor (2026-10-01). It covers web sources only;
no code was changed. Every factual claim links its source. Where a number is
a design estimate rather than a measured value, it is labelled **(estimate)**.

The owner's reference photos are camera and phone photos, not what the eye
sees. So the target is **"a camera's picture of a black-lit scene"**: the
lamp's violet leak as the camera records it, fluorescence that clips to light
pastel cores with saturated halos, and coloured light spilling from strong
emitters.

---

## 1. Black-light sources: spectra and visible leak

### 1.1 Filtered fluorescent tubes (BLB) and 365 nm LEDs

- **BLB tubes** ("blacklight blue") use a phosphor that emits UV-A between
  roughly **350 and 375 nm**. Wood's glass, a deep violet-blue glass, filters
  the tube
  ([Klipstein, UV lamps](http://donklipstein.com/uvbulb.html)). The filter
  still passes "some of the **404.7** and dimmer **407.8 nm** violet mercury
  lines, and just enough of the blue **435.8 nm** mercury line to have a
  basically blue color when lit". It is also transparent to some deep red and
  infrared ([Klipstein](http://donklipstein.com/uvbulb.html)).
- Wikipedia gives the BLB peak as 350–371 nm (commonly 365 nm). It says the
  violet filter "blocks most visible light", leaving "a dim violet glow". An
  unfiltered **BL** tube (the bug-zapper kind) has the same phosphor and looks
  noticeably bluer and brighter
  ([Wikipedia, Blacklight](https://en.wikipedia.org/wiki/Blacklight)).
- LED black lights peak at about **367.5 nm with a width of about 15 nm**
  ([Wikipedia, Blacklight](https://en.wikipedia.org/wiki/Blacklight)). With a
  365 nm LED, "virtually all of the light energy is within the invisible UV-A
  range ... tailing off before reaching 400 nm". It looks "dull,
  bluish-white" to the eye
  ([Waveform Lighting](https://www.waveformlighting.com/tech/what-is-the-difference-between-365-nm-and-395-nm-uv-led-lights)).
- The fluorescent-mineral community notes that the lamp coating "emits a fair
  amount of visible light", so the tube needs a filter, after which "only a
  dim purplish glow usually remains"
  ([Fluorescent Mineral Society](https://uvminerals.org/science/uv-lights/)).

### 1.2 395–400 nm LEDs (the cheap party/torch kind)

- A 395 nm LED "emits quite a bit of energy at 400 nm, and even 410 nm". Waveform Lighting puts "a significant portion of the light energy" in the
  visible violet, which gives "a pronounced violet-colored light"
  ([Waveform Lighting](https://www.waveformlighting.com/tech/what-is-the-difference-between-365-nm-and-395-nm-uv-led-lights)).
- A side-by-side user test found that the 395 nm torch puts out "a lot of visible purple light" but much
  less fluorescence than a 365 nm Nichia LED on the same surface
  ([CandlePowerForums](https://www.candlepowerforums.com/threads/uv-comparing-395-nm-to-365-nm.442357/)).
- Glass collectors say the 395 nm violet "can mute the fluorescence or distort the color". Faint
  emitters such as manganese glass can disappear under 395 nm and show only
  under 365 nm
  ([Dusty Trove](https://dustytrove.com/blogs/news/uv-lights-for-glass-collecting-why-some-vintage-glass-glows-under-365-but-not-395-blacklight)).
  A cheap 395 nm torch "spill[s] a lot of visible violet. That violet bounces
  off any shiny glass". A ZWB2 filter removes the "violet wash"
  ([Antique Identifier](https://www.antiqueidentifier.org/vaseline-uranium-glass-uv-light-identification/);
  [Uraniumware](https://uraniumware.com/365nm-vs-395nm-uv-light/)).
- 365 nm excites most materials more strongly: "Many objects will fluoresce
  strongest at 365 nm"
  ([Waveform Lighting](https://www.waveformlighting.com/tech/what-is-the-difference-between-365-nm-and-395-nm-uv-led-lights)).
  For uranium glass, "365nm typically glows brighter"
  ([Uraniumware](https://uraniumware.com/365nm-vs-395nm-uv-light/)).

**Summary.** BLB tubes and 365 nm LEDs give a weak violet/blue leak, made of
the 405/408/436 nm Hg lines for tubes and the LED tail for LEDs. 395 nm LEDs
give a strong violet wash that competes with the fluorescence. Party rooms use
BLB tubes or 395 nm LED bars, so the leak is always present.

### 1.3 Why photos of black-lit rooms look saturated blue/purple

1. **Every surface reflects the lamp's visible leak.** It is the only visible
   light in the room apart from the fluorescence. Narrow-band violet/blue
   light can only produce violet/blue reflections, so all non-fluorescent
   colour information is lost (§1.1 sources; also
   [Photo Extremist](https://photoextremist.com/ultraviolet-induced-visible-fluorescence-photography-tutorial):
   "Most affordable blacklights emit both UV-A and visible violet light. This
   violet leakage can overpower genuine fluorescent effects").
2. **Camera sensors see violet and some near-UV.** Image sensors "are
   sensitive to a wider range of wavelengths" than film, including violet and
   near-UV
   ([Wikipedia, Purple fringing](https://en.wikipedia.org/wiki/Purple_fringing)).
   UV-fluorescence photographers fit a UV/IR-cut or Wratten 2E barrier filter
   that "absorbs wavelengths below 425 nm", because without one the sensor
   records the reflected UV/violet
   ([Photo Extremist](https://photoextremist.com/ultraviolet-induced-visible-fluorescence-photography-tutorial);
   [Conservation Wiki, UV imaging](https://conservation-wiki.com/wiki/Ultraviolet_radiation_imaging)).
   Phones and party snapshots have no such filter.
3. **The camera renders violet as blue plus some red, i.e. purple.** The blue
   filter catches most violet light. Some red-filter response at short
   wavelengths makes it read purple rather than pure blue
   ([Physics Forums](https://www.physicsforums.com/threads/how-can-digital-cameras-possibly-capture-violet-light.499677/)).
   Screens cannot show spectral violet. They approximate it as "blue light at
   high intensity with red light at less intensity", e.g. **#8000FF**. This
   follows human vision, where the short-wave cones "contribute some red" to
   the red–green channel
   ([Wikipedia, Violet](https://en.wikipedia.org/wiki/Violet_(color))).
4. **White balance cannot fix it.** Auto white balance has no neutral
   reference in a single-hue scene. Blacklight portrait shooters report
   inconsistent colour until they lock a fixed white balance
   ([PAM Photography](https://pamphotography.blog/2021/11/04/blacklight-uva-portrait-photography-tips-for-beginners/)).
   In UV-fluorescence practice, ~5000 K (daylight) gives the "standard" blue
   cast, and a warm ~10,000 K setting reduces it
   ([Photo Extremist](https://photoextremist.com/ultraviolet-induced-visible-fluorescence-photography-tutorial)).
   Party photos are shot on auto or daylight balance, so the blue/violet cast
   stays.

---

## 2. Non-fluorescent surfaces (skin, dark fabric, walls) in a photo

- **They are lit only by the leak.** Their colour is their reflectance in the
  ~400–440 nm band times the leak colour, so they render as **deep
  blue/violet** whatever their daylight colour. Their brightness is far below
  the fluorescent objects. Conventional colours under blue-violet light go
  "almost completely black", while fluorescent ones keep emitting
  ([TRB, Daylight Fluorescent Color](https://onlinepubs.trb.org/Onlinepubs/trcircular/229/229-003.pdf)).
- Non-fluorescent materials look dark: stainless steel "show[s] no
  reflections under UV", and dirt and leaves emit little
  ([Photo Extremist](https://photoextremist.com/ultraviolet-induced-visible-fluorescence-photography-tutorial)).
  Titanium white, the white in most modern paints, "absorbs UV strongly,
  appearing dark"
  ([Conservation Wiki](https://conservation-wiki.com/wiki/Ultraviolet_radiation_imaging)).
- **Skin looks bluish.** Under a Wood's lamp, "normal, healthy human skin
  under UV light looks bluish", with "a small amount of visible violet
  spectrum light" from the lamp
  ([Cleveland Clinic](https://my.clevelandclinic.org/health/diagnostics/23292-woods-lamp-examination)).
  Skin's own fluorescence is weak, from collagen, NADH, elastin, tryptophan
  and porphyrins
  ([HORIBA](https://www.horiba.com/int/scientific/applications/biotechnology-biomedical/pages/endogenous-skin-fluorescence-in-vivo-on-human-skin/)).
  Melanin absorbs UV and "dissipate[s] over 99.9% of absorbed UV radiation",
  i.e. as heat, not light
  ([Wikipedia, Melanin](https://en.wikipedia.org/wiki/Melanin)). In a photo,
  skin is therefore mostly reflected violet leak, giving **deep blue**. Dry
  skin reads purple, oily skin yellow, and lint or thick skin white
  ([Cleveland Clinic](https://my.clevelandclinic.org/health/diagnostics/23292-woods-lamp-examination)).
- **Black flocking and black paper stay black.** Blacklight posters use black
  flocking so the black parts stay subdued while the fluorescent inks glow
  ([Wikipedia, Blacklight poster](https://en.wikipedia.org/wiki/Blacklight_poster)).

---

## 3. Material by material

| Material | Excitation / emission | Colour in a photo | Relative strength (estimate) | Source |
|---|---|---|---|---|
| Optical brighteners (OBA): paper, cotton, detergent | absorb **340–370 nm**, emit **420–470 nm** | blue-white, bright; often clips to light blue | high (0.6–0.8) | [Wikipedia, Optical brightener](https://en.wikipedia.org/wiki/Optical_brightener) |
| Modern paper | OBA | "bright bluish white"; old paper white/yellow/grey | high | [NPS Conserve O Gram 1/10](https://www.nps.gov/subjects/museums/upload/01-10_508.pdf) |
| Laundry detergent residue, white clothes | OBA | blue | high | [Science Notes](https://sciencenotes.org/list-of-things-that-glow-under-black-light/) |
| Teeth (dentin > enamel) | emission peak **~440 nm** | blue-white; crowns and fillings look dark or odd | medium (0.3–0.5) | [Biology Insights](https://biologyinsights.com/why-do-teeth-glow-under-a-blacklight/) |
| Skin | weak autofluorescence; melanin absorbs | deep blue (leak) | very low (≤0.05) | §2 |
| Day-glo yellow / green pigment | emission **~507–518 nm** | yellow-green, the brightest | highest (1.0) | [Heritage Science 2022](https://www.nature.com/articles/s40494-022-00812-4) |
| Day-glo orange / red / pink (rhodamines) | emission **~580–600 nm** | orange, red-orange, hot pink | very high (0.8–0.9) | [Heritage Science 2022](https://www.nature.com/articles/s40494-022-00812-4) |
| Day-glo blue | phthalo blue pigment + coumarin brightener, emission **~440 nm** | blue; weaker than yellow, orange, pink | medium (0.4–0.6) | [Heritage Science 2022](https://www.nature.com/articles/s40494-022-00812-4) |
| Day-glo vs ordinary colour | converts absorbed UV and blue into its own colour | "certain fluorescent colors are **four times** brighter than their conventional color counterparts" | n/a | [TRB circular](https://onlinepubs.trb.org/Onlinepubs/trcircular/229/229-003.pdf) |
| Highlighters | yellow: pyranine/fluorescein; pink: rhodamine; blue: triphenylmethane; orange: coumarin + xanthene | yellow highlighters glow green-yellow; pink glows hot pink | high | [Compound Interest](https://www.compoundchem.com/2015/01/22/highlighters/) |
| Tonic water (quinine) | absorb **350 nm**, emit **450 nm** | blue / blue-white | medium | [LibreTexts](https://chem.libretexts.org/Courses/British_Columbia_Institute_of_Technology/Chem_2305:_Biochemistry_Instrumental_Analysis/01:_Spectroscopy/1.02:_Photoluminescent_Spectroscopy); [Science World](https://www.scienceworld.ca/resource/black-light-basics/) |
| Vaseline (petroleum jelly) | — | "bright blue" | medium-low | [Science World](https://www.scienceworld.ca/resource/black-light-basics/); [Science Notes](https://sciencenotes.org/list-of-things-that-glow-under-black-light/) |
| Uranium glass | excitation peak **~330 nm**, emission peak **~534 nm** | intense neon green | very high (0.8–1.0 at 365 nm) | [Hitachi app note](https://www.hitachi-hightech.com/file/cn/pdf/products/science/appli/ana/fl/fl110006_e.pdf); [CHSOS](https://chsopensource.org/products/ultraviolet-lamp/fabrizio-versus-the-fluorescent-world/glass/) |
| Manganese glass | — | pale green, weak; often invisible under 395 nm | low | [CHSOS](https://chsopensource.org/products/ultraviolet-lamp/fabrizio-versus-the-fluorescent-world/glass/); [Dusty Trove](https://dustytrove.com/blogs/news/uv-lights-for-glass-collecting-why-some-vintage-glass-glows-under-365-but-not-395-blacklight) |
| Cadmium glass | — | strong orange | high | [CHSOS](https://chsopensource.org/products/ultraviolet-lamp/fabrizio-versus-the-fluorescent-world/glass/) |
| Pure optical glass (BK7) | — | "no UV fluorescence at all" | 0 | [CHSOS](https://chsopensource.org/products/ultraviolet-lamp/fabrizio-versus-the-fluorescent-world/glass/) |
| Window (float) glass | the tin side glows only under **shortwave** UV | essentially nothing under 365/395 nm; it reflects the leak | ~0 | [J. Racenstein](https://www.jracenstein.com/learn/expert-advice/how-to-find-the-tin-side-of-float-glass-and-why-it-matters/a162) |
| Lead glass | "icy blue" under short-wave, "little" under long-wave | ~0 | ~0 | [NPS](https://www.nps.gov/subjects/museums/upload/01-10_508.pdf) |
| Zinc white paint | — | "bright lemony yellow" / yellow-green | medium | [NPS](https://www.nps.gov/subjects/museums/upload/01-10_508.pdf); [Conservation Wiki](https://conservation-wiki.com/wiki/Ultraviolet_radiation_imaging) |
| Titanium white paint | absorbs UV | dark | 0 | [Conservation Wiki](https://conservation-wiki.com/wiki/Ultraviolet_radiation_imaging) |
| Natural resin varnish | — | yellow-green haze | low-medium | [NPS](https://www.nps.gov/subjects/museums/upload/01-10_508.pdf) |
| Plastics/adhesives | PVA: bluish milky; epoxy: yellowish white; cellulose acetate: milky white; acrylic B72: none | varies | low | [NPS](https://www.nps.gov/subjects/museums/upload/01-10_508.pdf) |
| Blood | does not fluoresce | dark | 0 | [Science Notes](https://sciencenotes.org/list-of-things-that-glow-under-black-light/) |

### 3.1 Uranium glass and fluorescent acrylic: why edges and thick parts glow brighter

- **Thick parts glow brighter.** "Bases, stems, handles, and pressed pattern
  ridges glow brightest because the light passes through more uranium there"
  ([Antique Identifier](https://www.antiqueidentifier.org/vaseline-uranium-glass-uv-light-identification/)).
  Emission scales with the absorbing path length.
- **Light piping.** Light emitted inside a transparent fluorescent sheet is
  trapped by total internal reflection. It travels to the edges and to any
  cut or etched surface, so the object has "edges that appear to glow
  intensely from within"
  ([DayGlo, light piping](https://dayglo.com/dayglo/blog/what-is-light-piping/)).
  Fluorescent acrylic discs therefore have a bright rim and a dimmer face.
  Uranium glass, also a transparent fluorescent solid, behaves the same way
  at rims and cut facets **(inference from the same mechanism)**.
- **Light spill.** The rim and face emit real visible light that lights
  nearby surfaces: the green on the hand in the uranium-glass photos, and the
  coloured pools under the acrylic discs. Inter-reflection between fluorescent
  objects is studied as "mutual illumination"
  ([Tominaga 2022, Color Res. & Appl.](https://onlinelibrary.wiley.com/doi/full/10.1002/col.22747)).

### 3.2 Photo prints (RC, inkjet) under UV

- Many glossy, RC and "bright" inkjet papers carry OBAs; "rag" and natural
  papers do not. Photo Review lists OBA papers (Epson Hot/Cold Press Bright,
  PermaJet glossy/pearl) and OBA-free ones (Hahnemühle Photo Rag, Canson Rag,
  Ilford Galerie Cotton)
  ([Photo Review](https://www.photoreview.com.au/tips/outputting/optical-brighteners-in-inkjet-paper/)).
  Aardenburg lists OBA-bearing baryta and fibre papers (Epson Exhibition
  Fiber "relatively high", Hahnemühle Fine Art Baryta, Ilford Gold Fiber
  Silk)
  ([Aardenburg](https://www.aardenburg-imaging.com/optical-brighteners-obas/)).
- Under a black light, OBA paper "glows with a bright blue and purple tint";
  OBA-free paper "remains dark"
  ([Dominey Photography](https://blog.dominey.photography/2025/05/21/what-are-optical-brightening-agents/)).
- **Ink density sets the glow.** "Inkjet colorants are not opaque enough to
  hide the substrate reflectance and OBA blue light emission until print
  densities get quite high". So the glow reaches into highlights and midtones
  ([Aardenburg](https://www.aardenburg-imaging.com/optical-brighteners-obas/)).
- **Inks block it unequally.** "Black and magenta block the greatest amount,
  yellow a lesser amount, and cyan ink least of all". "Lighter/pastel tones
  allow more of the brightening ... than the shadows"
  ([The Print Guide](http://the-print-guide.blogspot.com/2009/03/issues-of-optical-brightening-agents-in.html)).
  This is the key fact for rendering a photo from RGB (§6).
- Glazing matters: UV-filtering acrylic "essentially eliminate[s]" the
  effect, while plain glass transmits ~86% of the UV
  ([Aardenburg](https://www.aardenburg-imaging.com/optical-brighteners-obas/)).

### 3.3 Fluorescent paint and pigment chemistry

- Daylight-fluorescent paints (Kremer set) emit ~440 nm for white and blue
  (white uses a brightener; blue is phthalo + Coumarin 1), ~507–518 nm for
  green and lemon yellow, and ~580–600 nm for orange and red. The red/pink
  dyes are rhodamines (Rhodamine 6G, Rhodamine B, sulforhodamine). The green
  pigment showed "notably lower initial fluorescence" than the others in that
  study
  ([Heritage Science 2022](https://www.nature.com/articles/s40494-022-00812-4)).
- Fluorescent colours add emitted light to reflected light, so they are
  brighter than any reflective colour. RGB screens cannot reproduce them
  ([LabelValue](https://www.labelvalue.com/blog/why-fluorescent-colors-dont-work-on-computer-screens)).
  The TRB circular gives up to 4x a conventional colour
  ([TRB](https://onlinepubs.trb.org/Onlinepubs/trcircular/229/229-003.pdf)).
- Strong UV paint can photograph as **white**. One blacklight portrait
  photographer found "most paint colors initially photographed as white" and
  recovered the hues by "reducing the highlights"
  ([PAM Photography](https://pamphotography.blog/2021/11/04/blacklight-uva-portrait-photography-tips-for-beginners/)).
  This is direct evidence of the saturation clipping in §4.

---

## 4. Optical effects to reproduce

1. **Halo / bloom.** Lenses spread light through their point-spread function:
   even a perfect lens convolves the image with an Airy disc, whose tails
   show next to dark areas. Sensors also bloom when charge "spill[s] over into
   adjacent pixels". Renderers approximate this by convolving the linear HDR
   image with an Airy or Gaussian kernel before tone mapping
   ([Wikipedia, Bloom](https://en.wikipedia.org/wiki/Bloom_(shader_effect))).
   In a dark black-lit room, every bright emitter sits next to near-black, so
   the halos are very visible.
2. **Clipped pastel cores and saturated halos.** Strong emitters overexpose,
   so the core goes toward white or a pastel ("photographed as white",
   [PAM](https://pamphotography.blog/2021/11/04/blacklight-uva-portrait-photography-tips-for-beginners/)).
   The halo, which has lower intensity, keeps the emission hue. This is why
   neon paint reads as "vivid with halos" and the OBA paper plane as "very
   light blue": the core is clipped and the halo is blue.
3. **Coloured spill onto nearby surfaces.** Fluorescent objects are visible
   light sources. Surfaces next to them (a hand, a table) pick up their
   emission colour, reduced by distance. See light piping
   ([DayGlo](https://dayglo.com/dayglo/blog/what-is-light-piping/)) and mutual
   illumination
   ([Tominaga 2022](https://onlinelibrary.wiley.com/doi/full/10.1002/col.22747)).
4. **Out-of-gamut saturation.** Fluorescent colours sit outside what RGB can
   show
   ([LabelValue](https://www.labelvalue.com/blog/why-fluorescent-colors-dont-work-on-computer-screens)).
   Camera images push them to maximum chroma, then clip.
5. **Everything else sinks into violet.** The leak-lit background is dark,
   low-saturation in luminance but strongly violet in hue (§1.3, §2).

---

## 5. Prior art in rendering

- **"UV reveal" via light layers (Unity URP).** Cyanilux finds the UV lights
  by colour distance or by URP rendering layers
  (`IsMatchingLightLayer(light.layerMask, ultravioletLayerMask)`). It loops
  over additional lights (`GetAdditionalLight`), sums
  `distanceAttenuation * shadowAttenuation` and multiplies the decal's alpha
  or emission by it. A stencil variant reveals only through a lens mesh
  ([Cyanilux](https://www.cyanilux.com/tutorials/ultraviolet-lights-invisible-ink/)).
  This is the "invisible ink" model: binary material, emissive when lit.
- **UE4 blacklight system.** A blueprint light sends its cone to receiving
  materials, which compute point-in-cone, normal-facing (N·L), smoothstep edge
  falloff and distance decay. The resulting mask multiplies the emissive
  texture. Its stated limitation is no shadows and one light per object
  ([Eric Norfleet](https://ericnorfleet.wordpress.com/2022/03/07/uv-blacklight-system-ue4/)).
- **Blender "fluo" node group.** A point light acts as the black light. The
  fluorescent emission is computed from the distance to that lamp plus
  scale/intensity parameters, on top of a base BSDF. The lamp's own colour can
  be black (invisible) while still driving the effect
  ([alcove-design/blender-shader-fluo](https://github.com/alcove-design/blender-shader-fluo)).
- **Light channels and "light spectrums".** Polycount threads suggest a
  dedicated lighting channel feeding decals, and cite Doom 3's
  light-spectrum system. They list games with UV or hidden-ink reveals:
  Condemned 2, Alan Wake, Psychonauts (Black Velvetopia), Penumbra
  ([Polycount](https://polycount.com/discussion/76887/black-light-shader)).
  Phasmophobia's UV torch reveals fingerprints and footprints in the same
  "reveal" style
  ([Phasmophobia wiki](https://phasmophobia.fandom.com/wiki/UV_Light); the
  page blocked fetching, so its rendering details are unverified).
- **Physically based fluorescence in RGB.** A 2025 ACM paper models
  reradiation as a Gaussian in (absorption λ, emission λ) with five artist
  parameters: absorption mean and width, emission mean and width, and
  intensity. They render it in RGB renderers via an "XYZU" basis, where U
  carries UV-to-visible transfer: output = reflectance + fluorescence ×
  absorbed light
  ([A Fluorescent Material Model for Non-Spectral Editing & Rendering](https://dx.doi.org/10.1145/3721238.3730721);
  [summary](https://www.themoonlight.io/en/review/a-fluorescent-material-model-for-non-spectral-editing-rendering)).
  Earlier spectral work uses Kasha's rule (emission spectrum independent of
  excitation λ) to describe a material with absorption, emission, quantum
  yield and concentration
  ([Workshop on Material Appearance Modeling 2018](https://jo.dreggn.org/home/2018_fluorescence.pdf)).
  Wilkie et al. give a diffuse fluorescent reflectance model
  ([ACM](https://dl.acm.org/doi/10.1145/1174429.1174484)).
- **What prior art misses.** The game techniques are reveal masks. They do
  not model the leak-lit violet scene, camera clipping, halos or spill. All
  of these are what make the owner's reference photos look right. The
  physically based papers give the right per-material structure:
  `out = reflect(leak) + Q · absorbedUV · emissionColour`.

---

## 6. Rendering a photograph under a black light from RGB alone

We do not know the print's pigments. We do know it is a print, so the physics
is §3.2: **OBA paper glow, attenuated by ink, plus the violet leak it
reflects**. Inks are absorbers, not fluorophores. A saturated red in the photo
is dense magenta + yellow ink, which blocks the paper's glow, so it goes
**dark**. It must not glow red.

### 6.1 Per-pixel model (linear light)

1. Linearize sRGB → `r, g, b` (0–1).
2. Estimate ink coverage, assuming a CMYK-like print. Use gamma-encoded
   values, since ink coverage follows perceptual density more closely than
   linear light **(estimate)**:
   `C = 1 − R′`, `M = 1 − G′`, `Y = 1 − B′`, `K = min(C, M, Y)`,
   then `C −= K; M −= K; Y −= K`.
3. OBA transmission through the ink, weighted by the blocking order in
   [The Print Guide](http://the-print-guide.blogspot.com/2009/03/issues-of-optical-brightening-agents-in.html)
   (black ≈ magenta > yellow > cyan):
   `T = exp(−(0.5·C + 2.0·M + 1.0·Y + 2.5·K))` **(weights are estimates;
   tune by eye)**.
   At paper white T = 1. At pure cyan, T ≈ 0.6, so skies keep a pale-blue
   glow. At pure magenta or red, T ≈ 0.13 or less. Shadows → ~0.
4. Fluorescence: `F = S_oba · T · OBA_EMIT`. `S_oba` is the paper's
   brightener strength: 1.0 for OBA paper, 0 for an OBA-free "rag" option.
5. Reflected leak: the print reflects the leak in proportion to its
   blue-band reflectance, roughly the linear blue channel. Yellow ink absorbs
   violet, which this captures:
   `L = LEAK · (0.15 + 0.85·b)`. The 0.15 is the floor, from gloss surface
   reflection **(estimate)**.
6. Camera: `E = exposure · (F + L)`, then tone-map with **highlight
   desaturation**. Above a knee (~0.8), blend toward white in proportion to
   the overshoot, so bright blue OBA glow becomes pale blue and white, as in
   the references.
7. Bloom: put `F` (not `L`) through a bright-pass and wide multi-radius
   Gaussians (for example 4, 16 and 48 px at 1080p), and add them **after**
   tone mapping at the pre-clip, saturated hue. Spill onto the surrounding
   page is the widest bloom radius multiplied by the page's albedo.

### 6.2 Saturated colours

- **Faithful default:** saturated colours do not glow. Reds, magentas and
  deep oranges go near-black violet. Yellows go dim, because yellow ink
  blocks less but also absorbs the leak. Cyans and sky blues keep a
  noticeable light-blue glow. Neutral highlights glow strongest. This matches
  the halftone behaviour described by The Print Guide.
- **Optional "neon ink" mode (artistic, not physical):** for pixels with very
  high chroma and value in the day-glo hue families, add an emission term in
  that family's colour (table below). Scale it by `smoothstep(0.6, 0.9,
  chroma) · value`. This mimics a print made with fluorescent inks or a
  blacklight poster
  ([Wikipedia, Blacklight poster](https://en.wikipedia.org/wiki/Blacklight_poster)).
  Keep it off by default: a normal photo print never does this.

---

## Rendering recommendations

### A. Colour tokens (sRGB, as a camera would record them)

Spectral colours such as 435 or 530 nm are outside sRGB. These are camera
style renderings: the hue from the emission peak (sourced), and the pastel
cores from the clipping in §4. The hex values themselves are design choices
**(estimate)**.

| Token | Use | Core (clipped) | Body | Halo / spill |
|---|---|---|---|---|
| `leak365` | ambient lamp light, BLB / 365 nm | — | `#1A0F4A` (dim) | — |
| `leak395` | ambient lamp light, 395 nm LED | — | `#4B22D9` | `#6A3BFF` |
| `bgDark` | unlit or far from lamp | — | `#07040F` | — |
| `skinLeak` | skin, dark fabric, walls under leak | — | `#1E1F78` (365) / `#3A2AA8` (395) | — |
| `obaGlow` | OBA paper, white cotton, photo whites (420–470 nm) | `#D9ECFF` | `#8FB8FF` | `#4C63FF` |
| `teeth` | teeth, nails, tonic water (~440–450 nm) | `#E3F0FF` | `#A9C8FF` | `#5A6CFF` |
| `vaseline` | petroleum jelly | — | `#6F8CFF` | `#4A55E8` |
| `uranium` | uranium glass (~530 nm) | `#D8FF8A` | `#5CFF2E` | `#2BE01A` |
| `dayglo-yellowgreen` | neon yellow / green paint (~510–520 nm) | `#F4FFB0` | `#C8FF2A` | `#7DFF1E` |
| `dayglo-orange` | neon orange (~580–590 nm) | `#FFE2B0` | `#FF8A1F` | `#FF5A0A` |
| `dayglo-pink` | neon pink / rhodamine (~575–600 nm) | `#FFD0EC` | `#FF3FB4` | `#FF1F7A` |
| `dayglo-red` | neon red-orange | `#FFC8B8` | `#FF3A2A` | `#E0101A` |
| `dayglo-blue` | neon blue (coumarin ~440 nm) | `#C8DCFF` | `#4D7BFF` | `#3346FF` |
| `cadmium` | cadmium glass | `#FFD9A0` | `#FF7A14` | `#FF4A00` |
| `black` | carbon ink, flocking, titanium white, blood | — | `#05030C` | — |

### B. Relative emission strength (multiply into `exposure`)

These are estimates that preserve the sourced ordering (§3):
day-glo yellow-green **1.0** (one study measured a pure green pigment
weaker, so pure green could be ~0.7) ≥ day-glo orange/pink **0.9** ≥ uranium glass
**0.85** (365 nm) > OBA paper **0.7** > day-glo blue **0.5** ≈ tonic water
**0.5** > teeth **0.4** > vaseline **0.3** > skin **0.03** > titanium white,
carbon, glass **0**.

For a 395 nm lamp, multiply all emission by **~0.5** and the leak by **~3**.
This follows the sources: 395 nm excites less and leaks far more. Faint
emitters (skin, manganese glass, varnish) should then vanish into the wash.

### C. Rules

1. **Kill the room first.** Under the lamp, nothing keeps its daylight
   colour. Every non-fluorescent pixel becomes `leak × blue-band
   reflectance`: deep blue/violet, low luminance.
2. **Compute in linear HDR and add, never mix.** `out = leak·reflectance +
   Σ strength·emission`. Fluorescence adds light on top of the reflection.
3. **Clip like a camera.** Tone-map so that strong emitters exceed 1.0 and
   desaturate toward the pastel "core" colour. Do not hue-preserve the core.
4. **Bloom only the emission buffer.** Use a wide multi-radius Gaussian, at
   the saturated "halo" hue, about 30–60% of core energy **(estimate)**. The
   leak-lit background gets no bloom.
5. **Spill.** For strong emitters (uranium glass, acrylic, day-glo), add a
   large-radius blur of the emission buffer onto neighbouring surfaces,
   multiplied by the receiver's albedo. It pools under objects and tints
   hands.
6. **Edges glow.** For transparent fluorescent solids (acrylic, uranium
   glass), weight emission by thickness or path length and add an edge/rim
   term (light piping). For flat sheets, the face is dimmer than the rim.
7. **Photographs = OBA print model (§6.1).** Glow follows paper white
   attenuated by ink, with ink blocking in the order K ≈ M > Y > C. Saturated
   reds and magentas go dark, cyans keep a pale-blue glow, whites go pastel
   blue-white with halos. Offer an "OBA-free paper" switch where the photo
   is only reflected leak.
8. **Glass is clear, not glowing.** Window and optical glass do not
   fluoresce under long-wave UV. They reflect the leak as violet specular
   highlights. Only dust and lint on them glow blue-white (OBA).
9. **Instant response.** Fluorescence stops when the UV stops; there is no
   afterglow (phosphorescence is a different effect,
   [Wikipedia, Blacklight paint](https://en.wikipedia.org/wiki/Blacklight_paint)).
   Fade the effect with the lamp cone, not over time.
10. **Lamp choice shows.** A 365 nm lamp gives a near-black room with faint
    violet and maximal glow. A 395 nm lamp gives a purple-washed room with
    weaker glow and faint emitters lost. Most party photos look like a
    mixture of the two: saturated violet wash and vivid emitters.

---

## Sources

1. [Wikipedia: Blacklight](https://en.wikipedia.org/wiki/Blacklight)
2. [Don Klipstein: Ultraviolet and UV lamps](http://donklipstein.com/uvbulb.html)
3. [Waveform Lighting: 365 vs 395 nm UV LEDs](https://www.waveformlighting.com/tech/what-is-the-difference-between-365-nm-and-395-nm-uv-led-lights)
4. [Uraniumware: 365 vs 395 nm](https://uraniumware.com/365nm-vs-395nm-uv-light/)
5. [CandlePowerForums: comparing 395 and 365 nm](https://www.candlepowerforums.com/threads/uv-comparing-395-nm-to-365-nm.442357/)
6. [Fluorescent Mineral Society: UV lights](https://uvminerals.org/science/uv-lights/)
7. [Dusty Trove: 365 vs 395 for glass](https://dustytrove.com/blogs/news/uv-lights-for-glass-collecting-why-some-vintage-glass-glows-under-365-but-not-395-blacklight)
8. [Antique Identifier: vaseline glass UV test](https://www.antiqueidentifier.org/vaseline-uranium-glass-uv-light-identification/)
9. [Wikipedia: Purple fringing](https://en.wikipedia.org/wiki/Purple_fringing)
10. [Physics Forums: how cameras capture violet](https://www.physicsforums.com/threads/how-can-digital-cameras-possibly-capture-violet-light.499677/)
11. [Wikipedia: Violet (color)](https://en.wikipedia.org/wiki/Violet_(color))
12. [Photo Extremist: UV-induced visible fluorescence photography](https://photoextremist.com/ultraviolet-induced-visible-fluorescence-photography-tutorial)
13. [Conservation Wiki: Ultraviolet radiation imaging](https://conservation-wiki.com/wiki/Ultraviolet_radiation_imaging)
14. [PAM Photography: Blacklight/UVA portrait tips](https://pamphotography.blog/2021/11/04/blacklight-uva-portrait-photography-tips-for-beginners/)
15. [Cleveland Clinic: Wood's lamp examination](https://my.clevelandclinic.org/health/diagnostics/23292-woods-lamp-examination)
16. [HORIBA: endogenous skin fluorescence](https://www.horiba.com/int/scientific/applications/biotechnology-biomedical/pages/endogenous-skin-fluorescence-in-vivo-on-human-skin/)
17. [Wikipedia: Melanin](https://en.wikipedia.org/wiki/Melanin)
18. [Wikipedia: Optical brightener](https://en.wikipedia.org/wiki/Optical_brightener)
19. [Biology Insights: why teeth glow](https://biologyinsights.com/why-do-teeth-glow-under-a-blacklight/)
20. [Science Notes: things that glow under black light](https://sciencenotes.org/list-of-things-that-glow-under-black-light/)
21. [Science World: black light basics](https://www.scienceworld.ca/resource/black-light-basics/)
22. [Chemistry LibreTexts: photoluminescent spectroscopy (quinine)](https://chem.libretexts.org/Courses/British_Columbia_Institute_of_Technology/Chem_2305:_Biochemistry_Instrumental_Analysis/01:_Spectroscopy/1.02:_Photoluminescent_Spectroscopy)
23. [Compound Interest: chemistry of highlighter colours](https://www.compoundchem.com/2015/01/22/highlighters/)
24. [Heritage Science 2022: light ageing of daylight fluorescent paints](https://www.nature.com/articles/s40494-022-00812-4)
25. [TRB: Daylight fluorescent color, the color that shouts](https://onlinepubs.trb.org/Onlinepubs/trcircular/229/229-003.pdf)
26. [LabelValue: why fluorescent colours don't work on screens](https://www.labelvalue.com/blog/why-fluorescent-colors-dont-work-on-computer-screens)
27. [DayGlo: the science of light piping](https://dayglo.com/dayglo/blog/what-is-light-piping/)
28. [Hitachi High-Tech: uranium glass excitation/emission](https://www.hitachi-hightech.com/file/cn/pdf/products/science/appli/ana/fl/fl110006_e.pdf)
29. [CHSOS: glass under ultraviolet light](https://chsopensource.org/products/ultraviolet-lamp/fabrizio-versus-the-fluorescent-world/glass/)
30. [Wikipedia: Uranium glass](https://en.wikipedia.org/wiki/Uranium_glass)
31. [J. Racenstein: finding the tin side of float glass](https://www.jracenstein.com/learn/expert-advice/how-to-find-the-tin-side-of-float-glass-and-why-it-matters/a162)
32. [NPS Conserve O Gram 1/10: UV-induced visible fluorescence](https://www.nps.gov/subjects/museums/upload/01-10_508.pdf)
33. [Aardenburg Imaging: optical brighteners](https://www.aardenburg-imaging.com/optical-brighteners-obas/)
34. [Photo Review: optical brighteners in inkjet paper](https://www.photoreview.com.au/tips/outputting/optical-brighteners-in-inkjet-paper/)
35. [Dominey Photography: why is this paper glowing?](https://blog.dominey.photography/2025/05/21/what-are-optical-brightening-agents/)
36. [The Print Guide: OBAs in paper and ink](http://the-print-guide.blogspot.com/2009/03/issues-of-optical-brightening-agents-in.html)
37. [Wikipedia: Blacklight poster](https://en.wikipedia.org/wiki/Blacklight_poster)
38. [Wikipedia: Blacklight paint](https://en.wikipedia.org/wiki/Blacklight_paint)
39. [Wikipedia: Bloom (shader effect)](https://en.wikipedia.org/wiki/Bloom_(shader_effect))
40. [Tominaga 2022: appearance synthesis of fluorescent objects with mutual illumination](https://onlinelibrary.wiley.com/doi/full/10.1002/col.22747)
41. [Cyanilux: ultraviolet lights and invisible ink](https://www.cyanilux.com/tutorials/ultraviolet-lights-invisible-ink/)
42. [Eric Norfleet: UV blacklight system (UE4)](https://ericnorfleet.wordpress.com/2022/03/07/uv-blacklight-system-ue4/)
43. [alcove-design: blender-shader-fluo](https://github.com/alcove-design/blender-shader-fluo)
44. [Polycount: black light shader](https://polycount.com/discussion/76887/black-light-shader)
45. [Phasmophobia wiki: UV Light](https://phasmophobia.fandom.com/wiki/UV_Light)
46. [A Fluorescent Material Model for Non-Spectral Editing & Rendering (2025)](https://dx.doi.org/10.1145/3721238.3730721) / [summary](https://www.themoonlight.io/en/review/a-fluorescent-material-model-for-non-spectral-editing-rendering)
47. [Simple diffuse fluorescent BBRRDF model (MAM 2018)](https://jo.dreggn.org/home/2018_fluorescence.pdf)
48. [Wilkie et al.: a reflectance model for diffuse fluorescent surfaces](https://dl.acm.org/doi/10.1145/1174429.1174484)

---

## R1 calibration (follow-up)

Follow-up of 2026-10-01 for research item R1. Web research and offline
arithmetic only; no code changed. Labels used below: **(measured)** = a
number printed in the source; **(computed)** = worked out here from sourced
data, with the method stated; **(estimate)** = a design value with no source.
Data used for computation: FOGRA39L characterization data (ICC/Fogra, free),
CIE 1931 colour-matching functions (CVRL), and the RIT camera spectral
sensitivity database (CC BY-NC-SA 4.0: used only to derive the summary
numbers below; the data itself must not be copied into the project, per the
plan's licence rule). Source numbers continue from the list above (49+); [2],
[3], [33], [35] etc. refer to that list.

### C1. Printed photos under black light: what glows and what goes dark

**Reference photographs and videos (to check against side by side)**

| Reference | What it shows | Link |
|---|---|---|
| Aardenburg Fig. 1–2 | The same inkjet print on Epson Exhibition Fiber (OBA) and Crane Museo Silver Rag (no OBA), first under 4700 K Solux lamps, then under a Philips F36T8 BL tube at 0.40 W/m² UVA. The caption says the tube "causes heavy excitation of fluorescence in the blue visible region on the Epson paper"; the OBA-free print goes dark. The text says inkjet colorants "are not opaque enough to hide the substrate reflectance and OBA blue light emission until print densities get quite high". | [33] |
| Dominey | Two blank photo papers under UV: the OBA paper "glows with a bright blue and purple tint", the other "remains dark". | [35]; video: [YouTube, "Why is this photo paper glowing?"](https://www.youtube.com/watch?v=uhVHhQtdop8) |
| The Print Guide (2010) | Two blacklight posters: full ink coverage "glows in an expected way"; a poster with large unprinted areas on low-OBA paper gives "dull glow", because "the paper which contains low/no levels of fluorescing agents goes dark". | [55] |
| PrinterKnowledge test | Many photo papers side by side under a UV torch: "Bright" papers respond most, "Natural" least; Epson Ultra Premium Glossy strong, the Luster version weak; HP Premium Plus Glossy low. | [56] |
| VanOrman & Nienhaus 2020, Fig. 3 | A phone-camera photo of household items under a UV lamp (egg, honey, olive oil, turmeric, detergent, highlighter in water, tonic water). Useful as a "phone camera of a black-lit scene" reference. | [58] |

I found no photograph of a printed *photograph* (picture content, not
blank paper) under a black light with a written description of each tone.
Aardenburg Fig. 2 is the closest; it should be viewed directly when tuning.

**Measured: how much each ink lets the paper glow (inkjet).** Hersch (2008)
printed CMY halftones (Canon IP4000 inkjet, Canon MP-101 matte OBA paper)
and measured them with and without UV in the illuminant [49] **(measured)**:

- The paper is "moderately fluorescent, with a reflectance peak of **1.22 at
  440 nm**". Its reflectance at 380 nm with UV included is only **0.140**, so
  it absorbs most incoming near-UV.
- Colour difference between UV-included and UV-excluded light (ΔE94):
  paper white **11.28**, solid cyan **0.95**, solid magenta **0.92**, solid
  yellow **0.12** ("nearly no fluorescent emission").
- Fitted equivalent UV transmittance of each solid ink (one pass, excitation
  range): **cyan 0.238, magenta 0.186, yellow 0.0764**. Red, green, blue and
  chromatic black were "fitted as zero": they "completely absorb the
  excitation wavelength components".
- Model structure: the UV is attenuated once on the way in, by
  `(1 − a + a·t_u)`, and the blue emission is attenuated again on the way out
  by `(1 − a + a·t(λ))`, plus internal reflections. Fluorescence therefore
  matters most "on white and on highlight colors created by halftone dots of
  small and midsize ink surface coverages".
- Caveat: these UV transmittances were fitted for the UV part of a
  spectrophotometer's illuminant (Gretag-Macbeth i7, Fig. 6 in [49]), not for
  a 365 nm lamp. Ink absorption at 365 nm may differ.

**Computed: the emission path.** The blue light emitted by the paper must
pass back out through the ink. FOGRA39L (offset on coated paper) gives CIE Z
for each patch [50]. Z is weighted by z̄(λ), which peaks at 445 nm, the same
band as OBA emission (420–470 nm, [18]). The ratio Z(patch)/Z(paper) is the
ink's double-pass blue-band transmittance; its square root is the single-pass
value **(computed)**:

| Solid ink (FOGRA39) | Z / Z_paper (double pass) | single pass `t_e` |
|---|---|---|
| Cyan 100 % | 0.709 | 0.84 |
| Magenta 100 % | 0.201 | 0.45 |
| Yellow 100 % | 0.094 | 0.31 |
| Black 100 % | 0.023 | 0.15 |
| Red (M+Y) / Green (C+Y) / Blue (C+M) | 0.031 / 0.090 / 0.210 | — |

**Result: yellow blocks the glow most, then magenta, then cyan.** Combining
both paths for a solid ink, `T = t_u · t_e` **(computed)**:
cyan **0.20**, magenta **0.083**, yellow **0.023**, black **≈0**, and red
0.002, green 0.005, blue 0.017. This contradicts the ordering in the first
pass (black ≈ magenta > yellow > cyan, from The Print Guide [36]); the
measured data of [49] put yellow first.

**Conflicting report for offset yellow.** Gerlach's data, reported by John
the Math Guy, found that "cyan, magenta, and black all do a pretty good job
of blocking the UV. But for yellow ink ... there is a large difference in b*
between the M1 and M2 measurements ... the ink ... [is] transparent in the
UV", adding "I suspect that not all yellow inks do that" [51]. Even if offset
yellow passes all the UV (`t_u = 1`), its emission path still blocks 69 %,
so a solid offset yellow would keep `T ≈ 0.31` **(computed)**. Note that a
yellow patch has a small Z, so a small absolute gain in blue moves its b*
a lot; the large b* difference may overstate the glow **(inference, not
sourced)**.

**Other print types.**

- **Chromogenic (RC colour) prints.** Kodak papers have used UV absorbers
  since 1950, and "When examined under UV lamps, prints with UV absorbers
  appear darker than when viewed under visible light". OBAs were added via
  processing (1959–1974), in the base (from 1974) and in the polyethylene
  layers of RC prints (from 1988). Prints with OBAs "fluoresce under UV,
  appearing brighter and with a blue cast". The balance depends on "the
  relative amounts of OBAs and UV absorbers" [53]. So an RC colour print
  glows blue-white in its borders and highlights but more weakly than
  inkjet paper with high OBA content; how much weaker is not measured.
- **Silver gelatin (black-and-white) prints.** No OBAs in 652 samples from
  1896–1949. OBAs first appear in 1950–54, are in 70 % of samples by
  1960–64 and 81 % after 1980. They give a "distinct cool, blue-white
  fluorescence ... peaking at approximately 450 nm" [54]. Silver image
  density blocks the glow, like black ink **(inference)**.
- **Magazines and posters (offset on coated paper).** FOGRA39 is exactly
  this print condition [50], so the table above applies. Whether the paper
  glows depends on its OBA content: low-OBA stock "goes dark" [55].
- **Measurement standards.** ISO 13655 M1 requires the measuring light to
  match D50 including UV, so OBA papers measure as they look under D50
  viewing light; M2 excludes UV [52]. The difference between the two is the
  "OBA index". For example, b* of +2 under M2 and −3 under M1 gives an index
  of 5 [51]. A paper-only measurement under 365 nm lamps was not found.

### C2. Relative fluorescence strengths: what is measured

No source measures OBA paper, day-glo, uranium glass, tonic water and teeth
under the same lamp and camera. The sourced numbers are listed below.

| Emitter | Measured quantity | Value | Source |
|---|---|---|---|
| Quinine (tonic water's fluorophore) | quantum yield | **0.546** (0.5 M H₂SO₄); **0.60** (0.1 M HClO₄, 347.5 nm) | [60]; [59] |
| Fluorescein (yellow highlighter / green dyes family) | quantum yield | **0.95** (0.1 M NaOH) | [59] |
| Rhodamine 6G (day-glo pink/orange family) | quantum yield | **0.94–0.95** (ethanol) | [59] |
| Uranyl in silicate glass | quantum yield | **0.7** at < 1 % uranyl, "decreases when the concentration increases" | [61] |
| Stilbene (DSD-triazine) brightener, the OBA family | quantum yield | **0.382** for one polymeric DSD brightener in water (lower for its monomer); emission 443–446 nm | [62] |
| OBA paper (moderate) | peak total radiance factor | **1.22 at 440 nm** (UV-including D65-type light) | [49] |
| Day-glo paint | peak radiance factor (daylight) | yellow dye alone **177 %**; "some dye combinations exceed **300 %**" | [63] |
| Day-glo vs conventional | brightness | up to **4×** | [25] |
| Day-glo pigments under black light | response | "Most of our materials respond to black light ... it is usually not a quality control specification" | [64] |
| Teeth | relative | dentin fluorescence "significantly greater" than enamel; dentin peak **440 ± 10 nm** | [65] |

Quantum yields alone do not rank brightness under a black light. Brightness
also depends on how much of the lamp's UV each material absorbs (dye
concentration, thickness, absorption at 365 vs 395 nm), and none of those
was found for real objects. The QYs do show that every listed emitter turns
absorbed UV into light at a similar efficiency, within 0.4–0.95.

**Computed: luminance per absorbed UV photon.** QY × (365/λ_em) for photon
energy, × photopic luminance of the emission band (CIE ȳ, Gaussian bands at
the sourced peaks; the widths are **estimates**). Relative to rhodamine
(1.00): fluorescein-type yellow-green **0.81**, uranyl glass **0.85**,
quinine **0.094**, DSD brightener **0.036** **(computed)**. Blue emitters
(OBA, quinine, teeth, coumarin blue) put **10–30×** less luminance on
screen per absorbed photon than green/orange ones. This holds even with
equal or larger UV absorption.

**Rendering consequence.** Treat the strengths in Recommendation B as
*radiometric* (photon) strengths and let the colour token carry luminance.
A blue token already has about 7 % of white's luminance in sRGB. If the
strength factor also folds in luminance, blue emitters are dimmed twice
**(computed reasoning)**.

### C3. How phone cameras record 365 nm and 395 nm scenes

- **Phones see nothing below ~390 nm.** Monochromator calibration of an
  iPhone SE and a Galaxy S8 (and a DJI drone camera) scanned 390–700 nm
  "because no significant response was found outside it on any of the test
  cameras" [66]. So a 365 nm LED's main peak (FWHM about 10 nm [72]) is
  invisible to the phone. The phone records only fluorescence and any
  visible leak. A Gaussian 365 nm peak with 10–15 nm FWHM has essentially
  zero energy above 390 nm **(computed)**. The dim violet that photos of 365
  nm torches show must come from other emission, outside the main peak,
  which is not characterised. Kennard's visible-light photos of a
  non-fluorescent PTFE target under 365 nm torches show "some visible violet
  light leakage" [71].
- **A 395 nm LED straddles the cut-on.** The bins are 390–400 nm [73] or
  395–400 nm with 10 nm FWHM [72], so roughly half the output lies where
  the camera starts to respond. Across 28 cameras (400–720 nm, 10 nm steps;
  response assumed to ramp to 0 at 390 nm per [66]), the blue channel's
  signal per watt relative to 450 nm light is:
  395 nm LED **0.016** (median; range 0.002–0.23),
  400 nm LED **0.040**, Hg 404.7 nm **0.071**, Hg 435.8 nm **0.82**,
  OBA-like emission (445 nm) **0.76**. The one phone in that set (Nokia
  N900) is at the top of each range: 0.23 for the 395 nm LED and 0.50 at
  404.7 nm **(computed from [67])**. Per watt, a camera therefore records a
  395 nm LED about **3× (N900) to 50× (median)** more weakly than it records the paper's blue glow. The
  violet wash still dominates 395 nm photos because the LED emits far more
  power than the fluorescence returns ([3]; [5]).
- **The raw sensor puts violet almost only in blue.** The median relative
  red/green/blue response at 400 nm is 0.00/0.00/0.02 of each channel's
  peak, and at 410 nm 0.01/0.01/0.11 [67] **(computed)**. Raw data has no
  "red lobe". The purple seen in photos is added by the camera's colour
  correction matrix, which maps the sensor's blue onto sRGB, where spectral
  violet lies outside the gamut beyond the blue primary. This corrects
  §1.3 item 3, which attributed the red component to the red filter's
  short-wavelength response ([10]).
- **White balance cannot remove the cast.** "Global AWB algorithms can not
  work well if the captured image is dominated by only one or two colors"
  [69]. Commercial AWB also restricts its estimate to "plausible scene
  illuminant white point values" [70]. A violet lamp lies far outside that
  set, so AWB stops partway and the cast stays (with [14]).

### C4. Colour of the visible leak, in sRGB

**Measured spectra.** LED Museum published uncorrected spectrometer plots
of a Blak-Ray ML-49 BLB tube and a "blacklight" CFL [74] (images
[lwblb.gif](http://www.ledmuseum.net/sixth/lwblb.gif),
[uvcfl.gif](http://www.ledmuseum.net/sixth/uvcfl.gif)). Pixel measurement of
those plots **(computed)** gives:

- UV band peak at ~365 nm;
- the Hg 404.7 nm line at **≈7 %** (tube) and **≈13 %** (CFL) of the UV peak
  height;
- the 435.8 nm line at about **1/7** of the 404.7 line;
- no 546 nm line;
- a cluster of lines at 700–850 nm, which phone IR-cut filters block
  ([2]; [66]).

The spectrometer's response is not corrected, so the ratios are
approximate. Klipstein's description matches: "some of the 404.7 and dimmer
407.8 nm violet mercury lines, and just enough of the blue 435.8 nm mercury
line to have a basically blue color" [2].

**Computed sRGB hue** at full saturation, normalised to the brightest
channel. "Colorimetric" applies the CIE 1931 functions [68] and the sRGB
matrix ([Wikipedia, sRGB](https://en.wikipedia.org/wiki/SRGB)), with negative
channels clipped. "Camera" uses a 3×3 colour matrix fitted for each of the
28 cameras to reproduce sRGB over 600 random smooth spectra, then takes the
median. The fitted matrix only stands in for a real phone's processing.

| Source spectrum | Colorimetric | Camera median (range) | Current token | Verdict |
|---|---|---|---|---|
| BLB tube leak (404.7+407.8 : 435.8 = 7 : 1) | `#6900FF` (hue 265°) | `#4500FF` (hue 256°; `#0000FF`–`#8600FF`) | `leak365` `#1A0F4A` (hue 251°) | **Confirmed** for BLB tubes. The camera hue matches; the brightness is a design choice. |
| Filtered 365 nm LED | none (no output ≥ 390 nm) | none | `leak365` | Use a **darker** leak than a BLB (estimate; the stray emission is not characterised). |
| 395 nm LED (FWHM 12 nm) | `#7100FF` (hue 267°) | `#8B00FF` (hue 273°; `#0000FF`–`#B800FF`) | `leak395` `#4B22D9` / `#6A3BFF` (hue ≈ 254°) | **Too blue by ~15°.** Suggested `#6A00D9` body / `#9440FF` halo (hue ≈ 266–269°, estimate on the computed hue). |
| 400 nm LED | `#7100FF` | `#8200FF` | — | Same as 395 nm. |

**Emission colours checked the same way (computed).** Peaks are sourced;
the band widths are estimates.

| Emitter (peak) | Colorimetric | Camera median | Current body | Verdict |
|---|---|---|---|---|
| OBA (445 nm) | `#2E00FF` (251°) | `#0000FF` (240°) | `obaGlow` `#8FB8FF` (≈218°) | **Too cyan by ~25°.** Dominey sees "bright blue and purple tint" [35]. Suggested core `#E0E0FF`, body `#8C8CFF`, halo `#4C40FF` (estimate). |
| Quinine (450 nm, broad) | `#0036FF` (227°) | `#002BFF` (230°) | `teeth` `#A9C8FF` (≈216°) | Close for tonic water; teeth (440 nm) follow OBA. |
| Uranyl (534 nm) | `#00FF00` (120°) | `#00FF00` | `uranium` `#5CFF2E` (≈107°) | **Confirmed** (a slight yellow shift is acceptable for clipping). |
| Day-glo yellow/green (507–518 nm) | `#00FF60` (143°) | `#00FF80` | `#C8FF2A` (≈75°) | **Too yellow.** Suggested body near hue 100–110°, e.g. `#7CFF3A` (estimate; clipped cores may still run yellow-white). |
| Day-glo orange (580–590 nm) | `#FFA300` (38°) | `#FFA200` | `#FF8A1F` (≈32°) | **Confirmed.** |
| Day-glo red/pink (≈600 nm) | `#FF6700` (24°) | `#FF6400` | pink `#FF3FB4` | Emission alone is red-orange. Hot pink requires adding the reflected violet leak, which the additive model does (**inference**). Keep. |

### C5. Rendering recommendations: estimate → calibrated value

| Item (section) | First-pass value | Calibrated value | Status | Sources |
|---|---|---|---|---|
| Ink → OBA transmission (§6.1 step 3) | `T = exp(−(0.5C + 2.0M + 1.0Y + 2.5K))` | `T = Π_i (1 − a_i + a_i·t_u,i)·(1 − a_i + a_i·t_e,i)` with `t_u` = C 0.238, M 0.186, Y 0.076, K 0 and `t_e` = C 0.84, M 0.45, Y 0.31, K 0.15. Solids: C 0.20, M 0.083, Y 0.023, K ≈0; red 0.002, blue 0.017. At 50 % coverage: C 0.57, M 0.43, Y 0.35, K 0.29. If the exp form is kept, the equivalent weights are **C 1.6, M 2.5, Y 3.7, K ≥ 5**. | **Replaced** (`t_u` measured, inkjet; `t_e` computed, offset) | [49], [50] |
| Same, offset-print variant | — | `t_u,Y = 1`: solid yellow T ≈ 0.31 | Uncertain (one anecdotal dataset) | [51] |
| Visual claims in §6.1 step 3 | cyan T ≈ 0.6, so skies keep a pale-blue glow; yellows dim | cyan 0.20, so skies keep a **weak** glow; **yellows go darker than magenta**; red, green and blue overprints are ≈ 0 | **Corrected** | [49], [50] |
| Ink coverage from RGB (§6.1 step 2) | `C = 1 − R′` … with gamma-encoded values | unchanged | **Estimate is best available.** No source maps photo RGB to printed ink; FOGRA39 could calibrate it later. | — |
| Paper brightener strength `S_oba` (§6.1 step 4) | 1.0 OBA / 0 rag | inkjet "bright" papers 1.0; "natural"/rag 0–0.1; **RC colour print 0.3–0.6** (UV absorbers darken it); silver gelatin after 1955 ≈ OBA, before 1950 0 | Ordering **sourced**, values **estimate** | [56], [53], [54], [55] |
| Leak reflection `0.15 + 0.85·b` (§6.1 step 5) | estimate | Keep. Blue-band ink reflectances support using `b`: C 0.71, M 0.20, Y 0.094, K 0.023 of paper. The 0.15 gloss floor is still an estimate. | Partly supported | [50] |
| Highlight knee ~0.8, bloom radii 4/16/48 px, halo 30–60 % (§6.1, C.4) | estimate | unchanged | **Estimate is best available**; no measurement found | — |
| Colour tokens (A) | all estimate | `leak365` (BLB), `uranium`, `dayglo-orange` confirmed; `leak395`, `obaGlow`, `dayglo-yellowgreen` hue changes as in C4 | Hues **computed**, hex values still design choices | [2], [66]–[68], [74] |
| Relative strengths (B) | yellow-green 1.0, orange/pink 0.9, uranium 0.85, OBA 0.7, blue/tonic 0.5, teeth 0.4, vaseline 0.3, skin 0.03 | Ordering consistent with the QYs (day-glo 0.95 > uranyl 0.7 > quinine 0.55 > DSD 0.38). Keep the numbers, but treat them as photon strengths and do **not** also scale blue emitters down for luminance (C2). Optional QY-only set: day-glo 1.0, uranium 0.74, tonic 0.58, OBA 0.40. | **Estimate is best available**; no same-lamp comparison exists | [59]–[62] |
| 395 nm lamp: emission ×0.5, leak ×3 (B) | estimate | Unchanged. Per watt, cameras record the 395 nm leak at only 2–23 % of blue-light sensitivity, so ×3 assumes a high-power LED. 365 nm main-peak leak is **0** in camera. | **Estimate**, partly supported | [66], [67], [3] |
| Camera renders violet as blue + some red (§1.3.3) | stated from [10] | Raw red ≈ 0 at 400–410 nm; red comes from colour processing. Outcome ranges from pure blue to `#B800FF`, median `#8B00FF`. | **Corrected** | [67] |

### C6. Decisions and what is still unknown

- **Adopt** the two-path product model for printed photos (C5 row 1), with
  inkjet values by default and a lab toggle for "offset yellow passes UV".
- **Adopt** the hue corrections for `leak395`, `obaGlow` and
  `dayglo-yellowgreen`. Keep the other tokens.
- **Lab controls to expose:** paper type (OBA inkjet / rag / RC colour /
  offset), the four `t_u` values, a lamp switch (BLB / 365 LED / 395 LED)
  that selects the leak token and leak gain, and the strengths in B.
- **Still unknown:**
  - a same-lamp, same-camera measurement of the brightness of OBA paper,
    day-glo, uranium glass, tonic water and teeth;
  - ink transmittance at exactly 365 and 395 nm;
  - the visible stray emission of filtered 365 nm LEDs;
  - a real phone's colour matrix for violet;
  - photos of actual picture prints (not blank paper) under a black light,
    with the tones described.

### Sources (follow-up)

49. [Hersch 2008, "Spectral prediction model for color prints on paper with fluorescent additives", Applied Optics 47(36)](https://infoscience.epfl.ch/server/api/core/bitstreams/c809f855-4c64-406a-bbf0-614470afdb97/content) ([PubMed](https://pubmed.ncbi.nlm.nih.gov/19104523/))
50. [FOGRA39L characterization data (ICC/Fogra)](https://www.color.org/chardata/FOGRA39L.txt) ([index page](https://www.color.org/chardata/fogra39.xalter))
51. [John the Math Guy: What measurement condition is your spectro wearing?](http://johnthemathguy.blogspot.com/2014/10/what-measurement-condition-is-your.html)
52. [X-Rite: The M factor (M0–M3 measurement conditions)](https://www.xrite.com/page/learn-more-about-m-standards)
53. [Weaver 2009, A Study of Kodak Color Prints 1942–2008 (AIC Topics in Photographic Preservation 13)](https://resources.culturalheritage.org/pmgtopics/2009-volume-thirteen/13_13_Weaver.html)
54. [Messier et al. 2005, Optical brightening agents in photographic paper (JAIC 44(1))](https://cool.culturalheritage.org/jaic/articles/jaic44-01-001.html)
55. [The Print Guide 2010: OBAs and black light posters](http://the-print-guide.blogspot.com/2010/02/putting-glow-in-your-presswork-obas-and.html)
56. [PrinterKnowledge: UV light test for OBAs on a variety of papers](https://www.printerknowledge.com/threads/uv-light-test-for-obaa-on-a-variety-papers.16764/)
57. [Brighter is Better? Investigating spectral color prediction of ink on fluorescent paper (IS&T CIC 11)](https://library.imaging.org/admin/apis/public/api/ist/website/downloadArticle/cic/11/1/art00050): high ink density limits illumination reaching the substrate, so lighter colours show larger UV-in/UV-out differences
58. [VanOrman & Nienhaus 2020, Kitchen Spectroscopy (Matter)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7227594/)
59. [Wikipedia: Quantum yield (standards table)](https://en.wikipedia.org/wiki/Quantum_yield)
60. [OMLC PhotochemCAD: quinine sulfate](https://omlc.org/spectra/PhotochemCAD/html/081.html)
61. [Folcher, Keller & Paris 1984, Luminescent solar concentrators using uranyl-doped silicate glasses (OSTI)](https://www.osti.gov/etdeweb/biblio/6030201)
62. [Zhang et al. 2016, polymeric DSD-triazine fluorescent brightener (J. Wood Science)](https://jwoodscience.springeropen.com/articles/10.1007/s10086-016-1580-5)
63. [Light Touch: Fluorescence and the color of Day-Glo paints (FSU/OSA)](https://osa.magnet.fsu.edu/teachersparents/articles/pdfs/fluorescence%20and%20the%20color%20of%20day%20glo%20paints.pdf)
64. [DayGlo FAQ](https://www.dayglo.com/resources/faq/)
65. [Fluorescence in direct dental resin composites and natural teeth (Dentistry Journal 14(9))](https://www.mdpi.com/2304-6767/14/9/535)
66. [Burggraaff et al. 2019, Standardized spectral and radiometric calibration of consumer cameras (Optics Express 27(14))](https://home.strw.leidenuniv.nl/~burggraaff/papers/oe-27-14-19075.pdf)
67. [Jiang, Liu, Gu & Süsstrunk 2013, Camera spectral sensitivity database (RIT; CC BY-NC-SA 4.0)](http://www.gujinwei.org/research/camspec/db.html)
68. [CVRL: CIE 1931 2° colour-matching functions](http://www.cvrl.org/database/data/cmfs/ciexyz31_1.csv)
69. [Huo et al. 2006, Robust automatic white balance algorithm using gray color points](https://acorn.stanford.edu/psych221/projects/2010/JasonSu/Papers/Robust%20Automatic%20White%20Balance%20Algorithm%20using%20Gray%20Color%20Points%20in%20Images.pdf)
70. [US9007484B2: Alleviating dominant color failure in automatic white balance](https://patents.google.com/patent/US9007484)
71. [David Kennard: 5 ultraviolet flashlights compared](https://www.davidkennardphotography.com/blog/1145-5-ultraviolet-flashlights-compared.xhtml)
72. [Luminus SST-10-UV datasheet](https://download.luminus.com/datasheets/Luminus_SST-10-UV_Datasheet.pdf)
73. [Vishay VLMU35A10-395/405 datasheet](https://www.vishay.com/docs/80411/vlmu35a10-xx5-130.pdf)
74. [LED Museum: fluorescent and blacklight spectra](http://www.ledmuseum.net/spectra7.htm)
