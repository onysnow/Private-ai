# Black light: research and design (redo, 2026-10-01)

Ony, 2026-10-01: "The blacklight effect is terrible. Did you even look up
references to what blacklights do and what things look like under black
light ... and what colors/materials react the strongest". The first pass
(25b) researched *which materials* fluoresce but never what a black-lit
scene looks like, and it left the page itself lit by the room, so under the
black light almost nothing changed. This is the research and the design.

## What a black-lit scene looks like

- **The room is dark.** A black light is used with the room lights off.
  Fluorescence is a few per cent of a lit room's light, so under room light
  it barely shows; in the dark it is the whole picture.
- **The lamp's own visible light.** A filtered 365 nm (BLB) tube or torch
  gives "a dim violet glow" and passes almost no visible light
  ([Wikipedia, Blacklight](https://en.wikipedia.org/wiki/Blacklight)); a
  395 nm LED gives a "strong purple glow" that washes faint fluorescence
  out ([Wuben](https://www.wubenlight.com/blogs/news/365nm-vs-395nm-uv-flashlight)).
  So: 365 nm, near-black with a faint violet cast; 395 nm, everything
  washed purple. Both are offered.
- **What does not fluoresce is dark,** seen only by the violet leak it
  reflects: dark violet, colour gone. Black, grey and dark colours "do not
  glow" ([First Earth](https://www.first-earth.com/blogs/news/what-is-uv-reactive-clothing-guide)).
- **Whites glow blue-white.** Paper, white fabric and detergent residue
  carry optical brighteners, which absorb UV and re-emit blue
  ([Science Notes](https://sciencenotes.org/list-of-things-that-glow-under-black-light/);
  [Aardenburg](https://www.aardenburg-imaging.com/optical-brighteners-obas/)).
- **Photo prints glow in their whites, in proportion.** On OBA papers "the
  paper white areas glow most prominently", and because inkjet inks are not
  opaque the glow carries into highlights and midtones, fading as print
  density rises; dark areas stay dark (Aardenburg). So a print under UV is
  its own luminance, rendered as blue glow.
- **Day-glo pigments blaze in their own colour.** Fluorescence adds emitted
  light to reflected, so they look "brighter (more saturated) than [they]
  could possibly be by reflection alone"
  ([Wikipedia, Fluorescence](https://en.wikipedia.org/wiki/Fluorescence)),
  up to about 3x a conventional colour
  ([erickimphotography](https://erickimphotography.com/brightest-color/)).
  Strongest, in order: neon yellow / UV green, then hot pink and orange,
  then electric blue and purple (First Earth). The site's orange buttons
  are a day-glo orange: among the brightest things on the page.
- **Glass:** ordinary glass barely fluoresces; it passes ~72% of UV-A.
  Dust and lint on it glow (brighteners); skin oil barely does
  (claude/tools-research.md).
- **Instant:** fluorescence stops within nanoseconds of the UV stopping
  (Wikipedia, Fluorescence): no afterglow (that is phosphorescence).

## Design

Held, the black light turns the room off and lights the page with UV
(components/site/BlackLightScene):

1. **Room off.** A dark overlay over the page, opened round the black light
   by its UV's falloff ("Black light reach"): beyond it, near black.
   "Room under the black light" sets how dark.
2. **Leak.** Inside the pool, the lamp's own visible light: faint violet
   (365 nm) or a strong purple wash (395 nm), "Black light type".
3. **Photographs as OBA prints.** Every photograph is drawn as its own
   luminance in brightener blue (an SVG colour matrix: luminance, a curve
   so ink-dense areas fall dark, times blue-white), plus the violet leak it
   reflects. "UV: photo paper".
4. **White type as white ink with brighteners:** blue-white with a glow.
   "UV: white type".
5. **The orange buttons** blaze orange, with a wide glow ("UV: orange
   buttons", the existing knob).
6. **Dust on the glass** glows blue-white as before (glass shader).

## Superseded by the research (2026-10-01)

The neon-colour mapping above was wrong for a print. The full research is in
docs/research/uv-blacklight.md (48 sources). A photograph under UV is a
print on brightened paper: the paper glows, the inks block it (magenta and
black most, then yellow, cyan least), so whites glow pale blue, skies keep a
pale-blue glow, saturated reds and magentas go dark; plus the lamp's violet
it reflects in proportion to its blue; the glow clips to a pale core and
blooms in its halo blue. Neon inks are now an artistic option, off by default.
