# Broken glass: how it treats light, and how to render it

Research report for OnySnow Studios, 2026-10-02. Scope: plain annealed window glass and laminated glass (two plies + PVB), not tempered. The target is the site's pane: about 18 CSS px thick (a 4–6 mm pane, so **1 px ≈ 0.22–0.33 mm; 0.28 mm/px is used below**), polished front face, frosted (etched) back face, a small gap in front of a photograph, lamps carried by the cursor in front, room reflections from an HDR environment, one shared WebGL1 context.

This builds on the project docs `broken-glass-cracks.md`, `broken-glass-light.md` and `research-glass-fracture.md`. It does not repeat their prior-art lists for fracture *geometry* and falling pieces (three-pinata, GlassSystem, Smash Hit, Müller et al., Rapier...). It is about **light**.

**How to read the tags**

- A link after a claim is its source.
- **(computed)** means I worked it out with the scripts listed in Appendix A (Fresnel/Snell ray tracing of a slab with a crack, Airy thin-film optics, colour integration). The method is given where the number appears.
- **(estimate)** is a judgement to calibrate against reference photos.
- **(inference)** is a physical consequence I derived from sourced facts but did not find stated in a source.
- **(unverified)** means I could not confirm it this session.

Two process notes:

- The session's web-search budget ran out part-way through. A few things I wanted to look up could not be searched; they are listed in Appendix B.
- Every page that refused to load is also listed there. I did not work around any of them.

---

## Summary

### The phenomena, ranked by how much they show on this site

★★★ = strongest, most visible. ★★ = clearly visible. ★ = visible detail. · = subtle.

| # | Phenomenon | Strength | Where to read |
|---|---|---|---|
| 1 | **The crack band.** Seen from the front, a crack face shows up as a band. It is *not* a line drawn on the glass: it is the fracture face seen through the glass, at the viewer's side of the crack. Its width is `t·abs(tanβ − tanθᵢ)`, which ranges from 0 to about 20 px. Inside the band, total internal reflection (TIR) does one of three things depending on the face's lean β and the view angle. (a) It **folds** the photo: you see a mirror image of the strip of photo beside the crack. (b) It **displaces** the photo by 3 to 50 px. (c) It **traps** the view inside the glass, so the band shows the light travelling inside the pane, glowing like the pane's edge. This is what makes the image "fractured", and what makes cracks appear and vanish as you move. | ★★★ | 1.1, 1.7 |
| 2 | **Broken mirror.** Each piece reflects the room and the lamp at its own tilt τ, and the reflection turns by 2τ. At 0.6 m from the screen, a 0.5° tilt moves a distant reflected edge by about 40 px. The lamp's highlight breaks and jumps between pieces. Whether you see this depends on the environment image having sharp detail. | ★★★ | 1.6 |
| 3 | **Crack shadow and caustic on the photo.** A face near perpendicular is a perfect mirror for every ray of light that comes in through the front face. So under each crack the photo gets a **fully dark band, and beside it a band at 2× brightness**. Each is `t·tanθᵢ` wide (θᵢ is the lamp's angle inside the glass). They sit `2g·tanθ` apart and move with the lamp. | ★★★ | 1.9 |
| 4 | **Light trapped per piece.** Light trapped inside the glass (scattered in by the frosted face, or bounced in by leaning crack faces) crosses an open perpendicular crack only about 42% of the time; the rest reflects back. So each piece becomes its own light guide. The glow around the lamp is cut off sharply at cracks (fractographers call this "vicinal illumination"). Leaning crack bands, hole rims and the pane's side faces glow green with this trapped light, brightest near the lamp. | ★★ | 1.5 |
| 5 | **Holes and their rims.** Where a piece is gone you see the photo sharp: no frosting, no reflection. The rim walls are fracture faces seen from the air side at grazing angles, so they reflect 40–90% (bright mirror slivers) and let the trapped light out (glow). | ★★ | 1.12 |
| 6 | **Crushed zone and Hertzian cone.** The crushed glass at the strike is white, opaque and sparkly (light scatters many times among small transparent pieces). The cone walls sit only 22–28° from the surface (a lean of 62–68° in this report's terms) and are milky and rough; they reflect only about 9% and trap what they reflect. | ★★ | 1.8 |
| 7 | **The lamp glinting in cracks.** A perpendicular crack face plus the back face form a corner. It sends light back the way it came *across* the crack and mirrors it *along* the crack, like the highlight on a scratch or a hair. So cracks light up only within a few tens of px of the point under the lamp, and the glint slides along the crack as you move. Twist hackle breaks it into segments. | ★★ | 1.1 |
| 8 | **The fracture surface's texture.** Mist and hackle near the strike and just before each fork make the faces milky, but *only when they are seen fairly face-on*: at grazing TIR the same roughness stays nearly mirror-like. Wallner (rib) lines are faint ripples that shift as the light moves. Twist hackle is stepped facets near one surface. | ★ | 1.2 |
| 9 | **Tight crack segments.** Where the faces are within about 0.05 µm of each other, light tunnels across the gap, so tips and pinched segments are invisible. Up to about 0.3 µm they are partly see-through. Filling a crack with resin of matching index makes it vanish; that is how windscreen repair works. | ★ | 1.1, 1.3 |
| 10 | **Debris.** Grit (90% of fragments thrown back are 0.15–0.85 mm, so 0.5–3 px) sparkles and casts tiny shadows with bright centres. Needle slivers glow at their ends. Chunks behave like small gems. Small chips line the crack edges. | ★ | 1.11 |
| 11 | **Laminated glass.** Two crack networks, one per ply, about 2.9 mm apart in depth, so the lines double with 0.4–1.7 mm (1.5–6 px) of parallax at 15–45° views. The PVB is index-matched (0.011% reflection), so light passes between the plies freely. | ★ | 1.10 |
| 12 | **Rainbow colours.** Only where an air film 0.1–1.5 µm thick is seen *below* the critical angle: air pockets trapped in closed cracks, flakes split off parallel to the surface, shallow faces. Visible "only at certain angles". | · | 1.3 |
| 13 | **Dispersion.** Colour fringes on glints from chips (0.3–0.7°) and a 0.27° coloured fringe at the critical angle. Small next to the lamp's own size. | · | 1.4 |
| 14 | **The green tint.** Only along long paths: trapped light and edges. Absorption is about 0.05–0.07 cm⁻¹ (photopic), so nothing shows through the thickness. | · | 1.5 |
| 15 | **Tilt seen *through* a piece.** Negligible: a 4° tilt shifts the photo by 0.43 px. | · | 1.6 |

### Recommended rendering approach

This is a per-pixel, analytic method that fits a WebGL1 fragment shader per pane. Section 2.4 has the details.

1. **Crack-field textures from the existing crack graph.** For each pixel, store the two nearest crack segments. A segment table holds each segment's endpoints, lean profile, gap (tight or open), roughness and hackle settings. A shard-id texture and a shard table hold each piece's tilt, piston offset and flags.
2. **View pass.** Refract the view ray into the glass. Intersect it analytically with the nearby crack faces: a ray–plane test, which is the "interior mapping" idea. Then apply Fresnel or TIR, frustrated TIR or thin film from a lookup table, and roughness. Follow the reflected ray one step: to the photo (fold or displace), to the room or lamps, or into trapped light. Add each piece's own mirror reflection at its tilt.
3. **Floor-light pass.** Per photo pixel, compute each nearby crack's dark band and bright band in closed form (equations in 2.4). This replaces drawing the cracks as strokes.
4. **Trapped-light map.** A low-resolution map that is aware of the cracks, feeding glowing bands, side faces and hole rims.
5. **Crushed zone, debris and laminated plies.** These reuse the same pieces.

Cost (estimate): about 2 extra texture reads per pixel outside crack bands. Inside bands (5–20% of a broken pane) it is about 7–9 reads and about 250 ALU operations. Ground truth comes from Mitsuba 3 (BSD-3) or pbrt-v4 (Apache-2.0) renders and from reference photos.

---

## Part 1. The optics of broken glass

### 1.0 The geometry that decides everything

- **A crack is a new pair of glass–air surfaces running through the whole thickness**, separated by an air gap from sub-micron to millimetres.
  - The proof that the *air gap* is what makes a crack visible: windscreen repair works because the resin's "index of refraction... is substantially the same as that of the glass". In the patent's words, "If two materials have the same index of refraction there will be no bending of the light rays at a boundary between the materials and an observer will not sense the discontinuity" ([EP 1 033 233 A2](https://data.epo.org/publication-server/rest/v1.2/patents/EP1033233NWA2/document.html)).
- **Every ray that enters through the front face travels inside the glass within θc of the pane normal.** For n = 1.52, θc = 41.1°; for 1.518 it is 41.2° (computed; [TIR](https://en.wikipedia.org/wiki/Total_internal_reflection)). That one fact drives most of what follows.
- Conventions used below:
  - Pane normal z, pointing into the pane. Front face z = 0, back face z = t.
  - The photo is at z = t + g.
  - A crack face contains the crack's in-plane line. It **leans** by β from the pane normal (β = 0 means square to the surface).
  - θv is the view (or lamp) angle in air, measured in the plane across the crack. θᵢ = asin(sin θv / n) is the same angle inside the glass.
  - For directions that are not across the crack, use the component across the crack: `tanθᵢ,eff = (d·n̂_inplane)/d_z`. The component along the crack carries through unchanged (computed geometry).

**Closed forms** (computed; verified against a brute-force ray trace, Appendix A):

```
band width on screen (front face):   w  = t · | tan β − tan θi |
incidence on the face:               α  = 90° − | θi − β |          → TIR if α > θc  ⇔  |θi − β| < 48.9°
reflected direction inside glass:    θ' = 2β − θi   (angle from +z, signed)
   |θ'| < θc              → reflected ray leaves through the BACK face (toward the photo)
   θc < |θ'| < 180° − θc  → TRAPPED (TIR at the faces; with the frosted back face, partly scattered out)
   leaving the FRONT face after one TIR is impossible (proof below)
faces within 7.7° of square (β < 90° − 2θc) are TIR mirrors for EVERY ray entering through the front
```

**No single TIR reflection off a crack face can send a front-entering ray back out of the front face.** In a Monte Carlo test, 0 of 150,836 random TIR reflections did (computed, K4). The geometric reason: the incoming ray lies within 41.1° of +z, a ray leaving the front lies within 41.1° of −z, and a mirror that turns one into the other meets it at less than θc.

So from the front, the **room is never seen in a crack by TIR**. You see it only by partial (Fresnel) reflection, or by two-bounce paths (1.1d). This confirms the finding in `broken-glass-light.md`. That doc then concludes "the cracks are clear glass until a light lines up". That is incomplete: the TIR light goes to the photo or into the glass, and that is what you see (1.1b, 1.1c).

### 1.1 Crack faces as mirrors

**a. Partial reflection (Fresnel) and TIR, in numbers** (computed, unpolarised, n = 1.52):

| Glass → air, angle of incidence | 0° | 20° | 30° | 35° | 38° | 40° | 41° | ≥ 41.1° |
|---|---|---|---|---|---|---|---|---|
| R (one face) | 4.26% | 4.45% | 5.96% | 9.59% | 16.7% | 32.1% | 65.8% | 100% (TIR) |

- An open crack has *two* faces.
- When the gap is too wide for interference (more than about 1–2 µm), the two faces reflect `2R/(1+R)`: 8.2% at normal incidence and 48.6% at 40° (computed). That is twice a single surface.
- R jumps from about 32% to 100% across roughly the last degree before θc. Faces near that angle therefore "switch on" abruptly as the view or the lamp moves.

**b. The crack band and what it shows: the regime map** (computed; t = 18 px, g = 6 px; positive β leans the same way the view ray is travelling):

| View (air) | Lean β | Band width | Incidence α | What the band shows |
|---|---|---|---|---|
| 0° | 0° | 0 px | – | nothing: the crack is invisible except for its effects at the surface (1.6) |
| 0° | 5° | 1.6 px | 85° | TIR mirror to the photo, displaced +3 px |
| 0° | 10° | 3.2 px | 80° | TIR to the photo, leaves at +31°, displaced +7 px |
| 0° | 15° | 4.8 px | 75° | TIR to the photo, leaves at +49°, displaced +12 px |
| 0° | 20° | 6.6 px | 70° | TIR to the photo, leaves at +78° (grazing), displaced +35 px, smeared and dim |
| 0° | 25–40° | 8–15 px | 65–50° | **TIR, then trapped**: shows the light travelling inside the glass |
| 0° | 50–60° | 21–31 px | 40–30° | **partial**: 49–11% reflected (and trapped); the photo shows *through*, dimmed |
| 10° | 0° | 2.1 px | 83° | TIR: **mirror fold** of the photo |
| 10° | 25–50° | 6–19 px | 72–47° | trapped |
| 30° | 0° | 6.3 px | 71° | **mirror fold**; the photo jumps 19.5 px at the crack line |
| 30° | 20° | 0.3 px | 89° | almost nothing: the face is nearly parallel to the view ray |
| 30° | 30° | 4.1 px | 79° | to the photo at +83° (grazing): smeared by about 50 px |
| 30° | 40–60° | 9–25 px | 69–49° | trapped |
| 45° | 0° | 9.5 px | 62° | mirror fold, photo sample moved −21 px |
| 45° | 40–60° | 6–22 px | 78–58° | trapped |

The full table is in Appendix A.

What this means on the screen:

- A **near-perpendicular crack** (the usual radial) is a **mirror that folds the photo**. In the band you see the strip of photo on your own side of the crack, mirrored (1.7 has the numbers). If the photo there is uniform, the crack is nearly invisible. Image features break and double at the crack line. The band grows as you move to the side, and swaps to the other side of the crack when you cross over.
- A **moderately leaning face** (about 5–20° at near-normal view) **shifts the photo sideways by 3–35 px**. You see a displaced, increasingly stretched sliver of the picture.
- A face leaning **about 20–49°** (more or less, depending on the view) **traps your line of sight**. The band shows what is travelling inside the glass: green-tinted trapped light (bright near the lamp, dark far from it), plus whatever the frosted back face scatters in. **This is optically the pane's side face**, which is exactly Ony's requirement that "cracks... be given all the light effecting properties the edges/sides [have]".
- A **shallow face** (lean above about 49°, such as the Hertzian cone wall) is mostly see-through. It reflects 9–49%, and the reflected part is trapped.
- **Why cracks look silver, white, dark or invisible.** Look at what the band carries:
  - The mirrored photo: invisible when it matches its surroundings.
  - Trapped light: silver or green-white when the pane is lit, dark when it is not.
  - A lamp glint (d): bright.
  - A rough face seen fairly face-on (1.2): milky.
  - A tight gap (e): invisible.
  - A secondary source agrees: a crack "flash[es] bright and silvery" because the glass–air boundary acts as a mirror ([ScienceABC, secondary source](https://www.scienceabc.com/eyeopeners/if-glass-is-transparent-then-why-are-its-cracks-opaque)).

**c. Light inside the glass meeting a crack.** NIST's fractography guide uses this as an inspection method:

> "Light is scattered sideways in the translucent material. If the light encounters a crack, much of the light is reflected. Only some is transmitted across the crack. This creates a sharp delineation between light and dark areas that highlights the crack."
> — Quinn, *NIST Recommended Practice Guide: Fractography of Ceramics and Glasses*, 3rd ed., p. 3-23 ([DOI 10.6028/NIST.SP.960-16e3](https://doi.org/10.6028/NIST.SP.960-16e3))

The site's frosted back face scatters light sideways in exactly this way (1.5).

**d. Glints that move with the viewer: the corner path.**

- One TIR off a perpendicular face, plus one reflection off the back face, swaps the direction's x and z components (x being across the crack). Two mirrors at 90° form a corner reflector:
  - **across** the crack it sends light back the way it came;
  - **along** the crack it acts as an ordinary mirror (inference, from the law of reflection).
- In air, the light leaves in direction (−Lx, Ly, −Lz) for light that arrived travelling along (Lx, Ly, Lz).
- So a lamp glints in a crack only where:
  - across the crack, the lamp and the eye lie in nearly the same direction, and
  - along the crack, they are mirror images of each other.
- That is the same geometry as the highlight on a fine scratch or a fibre (inference).
- **Numbers for the cursor lamp** (computed, K5): lamp 150 px above the pane, eye at 0.6 m. The best angular mismatch for a crack passing at distance d from the point under the lamp is 0° at d = 0, 3.6° at 10 px, 8.8° at 25 px and 17° at 50 px. So a crack glints only within about lamp radius plus roughness lobe of the lamp's foot. The lobe comes from the frosted back face (rough), the lamp's size and twist hackle.
- Strength: TIR (100%) × the back-face reflection (about 4% specular if polished, or the frost's internal reflection lobe). That is about as strong as the pane's own front highlight.
- When the viewer moves, the condition along the crack moves the glint **along** the crack.

**e. Frustrated TIR (FTIR): why tips and tight segments vanish.** The evanescent wave tunnels across thin gaps, and the transmission "is highly sensitive to the gap width (the function being approximately exponential until the gap is almost closed)" ([TIR, FTIR section](https://en.wikipedia.org/wiki/Total_internal_reflection)). How much a crack gap reflects beyond θc (computed with the Airy/characteristic-matrix formula, 550 nm):

| Angle inside the glass | 50 nm | 100 nm | 200 nm | 300 nm | 500 nm |
|---|---|---|---|---|---|
| 45° | 8% | 26% | 62% | 83% | 97% |
| 60° | 29% | 66% | 94% | 99% | 100% |
| 80° | 81% | 96% | 99.7% | 100% | 100% |

- Segments narrower than about 0.05 µm are nearly invisible, both as mirrors and as shadow-casters. Between about 0.05 and 0.3 µm they are partly see-through, depending on the angle.
- Gaps of about 0.5 µm and more act as full TIR, except within a few degrees of θc (97% at 45°).
- NIST confirms this happens in real breaks: "The interfacial separations may be less than the wavelengths of light and the cracks are not visible even under a microscope" (Quinn p. 4-31, [DOI](https://doi.org/10.6028/NIST.SP.960-16e3)).
- FTIR is slightly colour-selective. At 60° and 100 nm, it reflects 77% at 450 nm, 66% at 550 nm and 56% at 650 nm (computed). So a tight crack reflects a little bluish and transmits a little amber.

### 1.2 The fracture surface's texture: mirror, mist, hackle and its markings

**What the zones are** (Quinn 2020, [DOI](https://doi.org/10.6028/NIST.SP.960-16e3)):

- **Mirror** (p. 5-4): it was named because, under early microscopes, "the mirror region was so smooth that it reflected light like a mirror". The crack accelerates to its terminal speed inside the mirror. For soda-lime glass that speed is ≈ 1500 m/s (p. 5-4; Table 5.1, p. 5-7).
- **Mist** (p. 5-15): "The mist has a slight frosty appearance such as when water condenses on a reflecting mirror."
  - The mirror–mist boundary "probably corresponds to surface roughness features that are of the order of 0.1 µm to 0.2 µm" (p. 7-17).
  - Elsewhere the threshold of detection is given as "as small as a few tens of nanometers to as much as 0.25 µm" (p. D-1).
- **Hackle** (pp. 5-14, 5-18): "A line on the surface running in the local direction of cracking, separating parallel, but noncoplanar portions of the crack surface". In the hackle zone, features are "larger than 10 µm".
- Bradt: hackle is "a rough surface of angled ridges and valleys that appear to have been 'hacked' into the glass fracture surface with an axe" ([Bradt 2011](https://link.springer.com/article/10.1007/s11668-011-9432-5)).

**How far out the zones reach: Orr's equation**, σ√R = A (Quinn eq. 5.4, p. 5-19).

- For soda-lime glass the tabulated mirror constants are mostly **A ≈ 1.8–2.1 MPa√m (mirror–mist)** and **2.0–2.4 MPa√m (mist–hackle)** (Appendix C, p. C-3).
- So the mist radius is about (A/σ)² (computed):

| Local stress at the origin | Mist radius |
|---|---|
| 100 MPa | 0.36–0.48 mm |
| 50 MPa | 1.4–1.9 mm |
| 30 MPa | 4–5.4 mm |
| 20 MPa | 9–12 mm |

- At 0.28 mm/px these are **1–40 px**.
- Low-energy breaks may show none: "Weak parts with low stored energy... break into two pieces with relatively featureless fracture surfaces" (p. 5-3). A part can be so weak that "the mirror size is larger than the part cross-section" (p. 5-19).
- Cracks branch after mist and hackle (p. 5-18, Fréchette's definition).
- (inference) So on screen: **rough, whitish faces only within millimetres of the strike and just before each fork; mirror-smooth faces elsewhere.**

**Roughness makes a face milky only when it is seen fairly face-on** (computed with the scalar-scattering specular factor exp[−(4π n σ cosα / λ)²]):

- This is the standard Davies/Bennett–Porteus result. I could not open a page with that formula this session (Appendix B). The [Rayleigh roughness criterion](https://en.wikipedia.org/wiki/Rayleigh_roughness_criterion) is the qualitative basis.

| Roughness σ | Specular kept at α = 0° | 45° | 60° | 75° | 85° |
|---|---|---|---|---|---|
| 10 nm (mirror) | 0.89 | 0.94 | 0.97 | 0.99 | 1.00 |
| 50 nm (onset of mist) | 0.05 | 0.22 | 0.47 | 0.82 | 0.98 |
| 100 nm (mist) | 0.00 | 0.00 | 0.05 | 0.45 | 0.91 |
| 200 nm (coarse mist) | 0.00 | 0.00 | 0.00 | 0.04 | 0.69 |

What it means:

- From the front, near-perpendicular faces are hit at 70–89° (1.1b). So even misty faces stay largely mirror-like for the in-band TIR.
- The milkiness shows where faces are seen fairly face-on:
  - hole rims and the pane's broken edge seen obliquely;
  - the cone walls (incidence about 25°);
  - shards on the floor;
  - the crushed zone.
- Hackle (> 10 µm, at 0.28 mm/px) is below a pixel. Treat it as microfacet slope spread (glitter), not as a smooth haze.

**Markings that move with the light** (Quinn, [DOI](https://doi.org/10.6028/NIST.SP.960-16e3)):

- **Wallner lines (rib marks).**
  - "very shallow hillocks... They look like a thin shadow band and they tend to shift slightly as illumination is adjusted. This is in marked contrast to crack arrest lines that are sharp and do not appear to move as light is adjusted" (p. 5-53).
  - SWGMAT: they are "almost always concave in the direction from which the crack was propagating" ([SWGMAT Glass Fractures](https://www.asteetrace.org/static/images/pdf/02%20Glass%20Fractures.pdf)).
  - Size: the confocal height profiles in Quinn's Fig. 3.54 (p. 3-65) have scale bars of 1 µm high by 50 µm long (mirror) and 5 µm by 40 µm (mist). Read from the scale bars, that suggests **slopes of a few degrees** (estimate).
  - Hammered glass shows tertiary Wallner lines "concentric about the impact sites" (Fig. 5.47, p. 5-61).
- **Twist hackle.**
  - "Hackle that separates portions of the crack surface, each of which has rotated from the original crack plane in response to a lateral rotation or twist in the axis of principal tension" (p. 5-44).
  - A stress rotation of 3.3° starts it; Beauchamp saw it at 1° (p. 5-49).
  - In plates in bending, cracks "run quickly on the tension side, but do not quite break through... The crack later snaps through to the opposite surface leaving twist hackle" (p. 5-44).
  - (inference) So on a radial crack, a strip near one surface is stepped facets: mirror faces rotated by several degrees or more. They break the band's reflection and the lamp glint into **segments that switch on and off**.
- **Step hackle and curved faces.** In a mirror broken in bending and twisting, "The fracture surface is usually tilted or curved and not perpendicular to the plate outer surfaces" (p. 5-51).
- **Compression curl.** In bend fractures the crack turns as it enters the compressed side (p. 4-17, beams). (inference) Expect a curved lip near the surface that was in compression.
- **Scarps** are seen only by tilting "to create a mirror-like reflection" (p. 5-70). Minor.
- **The whole face is conchoidal (curved)** (p. 5-3).
  - (inference) A curved mirror carries a moving highlight. A flat-plane model will look too uniform.
  - Facets and steps "are the rule" on broken surfaces ([Kolvin et al., Nature Materials 2017, via phys.org](https://phys.org/news/2017-10-technique-reveals-intricate-beauty-glass.html)).

**Lean of the faces**, for the regime map:

- Radials: the 4R rule says "Ridges on Radial cracks are at Right angle to the Rear" ([SWGMAT](https://www.asteetrace.org/static/images/pdf/02%20Glass%20Fractures.pdf)).
- Concentric cracks are a second bending fracture, with "maximum tension... on the impacted side" (Quinn p. 4-33).
- (inference) Both are near-perpendicular, with curl and twist hackle near the compressed surface.
- The "concentric cracks lean about 30°" in `broken-glass-light.md` is **unverified**. Measure it on reference photos.
- The cone is in 1.8.

### 1.3 Thin-film interference: the rainbow colours

**When it happens.**

- Coloured fringes need an air film thinner than about the coherence length of white light (around 1 µm, as `light-physics-reference.md` already notes). They also need the light to meet the film **below the critical angle**: above it, the film just shows FTIR (1.1e) and no fringes.
- NIST on window impacts: "When a crack is created but closes quickly, as in the case of a window impact, pockets of air may be trapped between the crack faces. These pockets may be visible if light is reflected off the glass-air interface. Sometimes the light is refracted creating elusive but colorful reflections that are visible only at certain angles" (Quinn p. 4-31, [DOI](https://doi.org/10.6028/NIST.SP.960-16e3)).
- Mineralogy: "many fractures in minerals, filled or unfilled, can display iridescence because of thin-film effects" ([Lin & Heaney, GIA 2017](https://www.gia.edu/gems-gemology/spring-2017-iridescence-natural-quartz)). Fracture "crack rainbows" in quartz are a recognised type ([Mindat, Iris Quartz](https://www.mindat.org/article.php/1335/Iris+Quartz)).

**Where it shows on this site** (inference, from the angle condition):

1. Flakes and spalls split off **parallel to the surface** near the strike and along chipped crack edges. Seen at near-normal incidence, these show classic Newton colours.
   - At impact sites "the outer surface has chipping and lateral cracks" (Quinn p. 6-74).
   - Lateral cracks "parallel to the surface... cause material to spall off" (p. 6-31; said there of scratch damage).
2. Shallow faces: cone walls and conchoidal chips.
3. Air pockets in closed segments, seen through a shallow region.
4. Laminated glass, where the PVB holds pieces tightly together, and delamination (unverified; I could not search for it).

From the front, near-perpendicular cracks show **no colours** (always beyond θc), only FTIR.

**Colour against film thickness** (computed):

- Method: glass | air(d) | glass, s and p averaged, Airy summation, integrated over a 6500 K blackbody with the CIE 1931 fit of [Wyman, Sloan & Shirley 2013 (JCGT)](https://jcgt.org/published/0002/02/01/paper.pdf), converted to linear sRGB. Normal incidence. Luminance Y is relative to a perfect white reflector.

| Gap (nm) | 0 | 50 | 100 | 150 | 200 | 250 | 300 | 350 | 400 | 450 | 500 | 600 | 700 | 1000 | 3000 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Y (%) | 0 | 5.1 | 13.2 | 15.2 | 9.7 | 2.3 | 2.1 | 8.8 | 13.9 | 12.5 | 6.6 | 5.5 | 12.1 | 10.0 | 8.2 |
| Hue | black (invisible) | blue-grey | grey-white | white | orange-yellow | red-magenta | deep blue | blue | green-yellow | yellow-orange | magenta-red | blue | yellow-green | pink | white (incoherent) |

- Brightest at a quarter wave: 15.7% at 138 nm (550 nm light). That is about four times a single surface, because two equal reflections add in phase (computed).
- The sequence is Newton's in reflection: a dark centre, then grey, white, yellow, red, blue, green... ([Newton's rings](https://en.wikipedia.org/wiki/Newton%27s_rings)). That sequence is also a check on the computation.
- **The colour shifts fast with angle.** For a 300 nm gap, the in-glass angles 0°, 20°, 30°, 35° and 40°+ give deep blue, magenta, orange, white, and then nearly total, whitish reflection (computed, K1).
- The engine's existing plan to use the thin-film model of [Belcour & Barla 2017](https://belcour.github.io/blog/research/publication/2017/05/01/brdf-thin-film.html) fits. A simpler lookup table is in 2.4.

### 1.4 Dispersion: prism colours

Index of float glass:

- [Rubin 1985 via refractiveindex.info](https://refractiveindex.info/?shelf=3d&book=glass&page=soda-lime-clear): n = 1.5130 − 0.003169λ² + 0.003962λ⁻² (λ in µm). That gives nF = 1.5290, nd = 1.5234, nC = 1.5208, Abbe number 64 (computed).
- [Wikipedia's glass table](https://en.wikipedia.org/wiki/List_of_physical_properties_of_glass) gives container soda-lime nD = 1.518 and nF − nC = 0.00867, so Abbe ≈ 60 (computed).
- **Use nF − nC ≈ 0.008–0.009.**

Effects (computed):

- **The critical angle is coloured.** θc is 40.85° (F, blue), 41.03° (d) and 41.11° (C, red). Across the last 0.27° before TIR, blue is already totally reflected while red still leaks through. The edges of TIR regions therefore carry a thin bluish-reflected, reddish-transmitted fringe.
- **Chips and broken corners act as prisms.** The red-to-blue spread at minimum deviation is 0.26° for a 30° wedge and 0.72° for a 60° wedge.

When it shows:

- Only on **small or sharp sources**. A cursor lamp of radius 10 px at 150 px height is about 7.6° across (computed), so dispersion gives coloured *rims* on glints, not separate rainbows.
- On a sharp room highlight (a window frame in the HDR), chips give clear colour fringes.
- The engine's three-channel IOR split already covers this.

### 1.5 Light trapped in the glass, escaping at cracks and edges, and the green tint

**How light gets trapped.**

- Polished faces trap rays steeper than θc. The site's **frosted back face** scatters part of the lamp light into those trapped angles. That is why frosted and edge-lit glass glow.
- Engraved or scratched marks scatter the trapped light out: "When this light encounters engraved digits, it is scattered, rendering a brightly illuminated digit" ([Lightguide display](https://en.wikipedia.org/wiki/Lightguide_display)).
- Fibre-optic fault locators rely on the same thing: the red light "shows at the end of the fiber and at breaks, cracks, and sharp bends" ([Fluke Networks, VFL](https://www.flukenetworks.com/knowledge-base/optifiber-pro/vfl-visual-fault-locator)).

**Which cracks let it out** (computed):

- A **perpendicular** crack face does **not** let trapped light out. It either reflects it or passes it across the gap, and in both cases the ray's angle to z is unchanged, so it stays trapped.
- For trapped light with directions spread evenly (weighted by flux), an open vertical crack **passes 42.5% and reflects 57.5%** (computed, F).
- **Leaning, curved and hackled faces** change the angle to z by up to 2β, so they **let light out** (or trap incoming lamp light; see the "trapped" rows in 1.1b).
- Rough (mist/hackle) faces and edge chips scatter light out in all directions.

**What follows on screen** (inference):

- **Each piece is its own light guide.** The glow around the lamp in the frosted pane is brighter in the lamp's own piece and drops at each crack it crosses (×0.425 per open crack). That is Quinn's "sharp delineation between light and dark" (1.1c).
- Leaning crack bands (the "trapped" regime), hole rims and the pane's side faces show this trapped light, so they **glow near the lamp and go dark far from it**.
- Each piece's side face glows with its own level, so the glow along the pane's edge **steps at every crack** that reaches the edge.

**The green tint.**

- Iron: Fe²⁺ has a band at 1050 nm whose tail removes red; Fe³⁺ has bands at 385, 420 and 435 nm ([Shelby, Lehigh lecture](https://www.lehigh.edu/imi/teched/GlassProcess/Lectures/Lecture04_Shelby_ColoredGlass.pdf)).
- Clear float glass has "a slightly green inherent color that deepens as thickness increases". Its light transmittance is 90% at 3–4 mm, 87% at 10 mm and 83% at 19 mm ([Vitro Clear TDS](https://www.vitroglazings.com/media/rnff0xlj/tds_clear.pdf)).
- That gives a **photopic absorption of ≈ 0.05–0.07 cm⁻¹** (computed from rounded datasheet values, ±50%).
  - Through a 5 mm pane: about 2–3% absorbed, evenly across the pane, so no visible tint.
  - Along a 10 cm trapped path: 61% transmitted. Along 30 cm: 22%. Clearly green and dimming.
- Low-iron glass removes "the green cast" at edges ([Pilkington Optiwhite](https://www.flairwindows.com/assets/pilkington-optiwhite.pdf)).
- I found no per-wavelength absorption values I could read (Appendix B). Keep the engine's calibrated float-glass green.

### 1.6 Pieces tilting: the broken mirror

**Physics.**

- A piece tilted by τ turns its reflections by 2τ ([law of reflection](https://en.wikipedia.org/wiki/Specular_reflection)).
- Seen *through*, it is still a slab with parallel faces, so the photo shifts by only `t·τ·(1 − 1/n)` (computed): 0.054 px at 0.5° and 0.43 px at 4°. **Tilt does not fracture the image behind**; the crack bands do (1.7).

**How visible a tilt is in reflection** (computed):

- At 0.6 m from a 96-dpi screen, 1° of view ≈ 40 CSS px. So a 0.5° tilt (a 1° turn of the reflection) moves a distant reflected edge by about **40 px**. That is enormous, *if the environment has an edge there*.
- An equirectangular HDR 1024 px wide resolves 0.35° per texel. A 256-wide one resolves 1.4°, which hides tilts under about 0.7°.
- (inference) The "0.4° barely shows" result in `broken-glass-light.md` is mostly a sign of a soft or low-resolution environment, not of small tilts.
- **The lamp highlight on a piece moves by about 2τ·h** (h = lamp height, much smaller than the viewing distance): 3.5 px per degree at h = 100 px, 7 px per degree at 200 px. Near the lamp, the highlight therefore **breaks at crack lines and jumps** between pieces.

**How much real pieces tilt** (estimate). I found no measurement (Appendix B). Reasoning from causes:

- A piece pushed out of plane by δ at one edge, over its size s, tilts by about δ/s. For example, 0.5 mm over 20 mm is 1.4°.
- Pieces at the strike are pushed in by the impactor. The strike bends the pane into a dish, as `broken-glass-light.md` models.
- Pieces still clamped by the frame and their neighbours (gaps of µm) barely tilt: probably under 0.1°.
- Laminated glass keeps a permanent cone shape, since the "spider web" pattern is held by the interlayer ([Laminated glass](https://en.wikipedia.org/wiki/Laminated_glass)).
- So: **tilt falls from about 1–4° near the strike to about 0 at the frame**. Calibrate with a photo of a straight reflected edge across a real break.

**Piston steps** (estimate):

- A piece displaced along the normal by δz exposes a strip of fracture face, seen from the *air side*, `δz·tanθv` wide.
- That strip is a grazing external mirror (39% at 80°, 61% at 85°; computed) that also leaks trapped light.
- (inference) Together with the reflection jump, this is probably why real cracks stay visible as fine lines even when seen straight on.

### 1.7 The image behind stepping and breaking

Ranked by size (computed; t = 18 px, g = 6 px):

1. **The mirror fold at a perpendicular crack, view 30°.**
   - The band is 6.3 px wide on your side of the crack and shows the photo strip next to the crack mirrored about it.
   - Photo content jumps by **19.5 px** at the crack line: 2(t·tanθᵢ + g·tanθv).
   - It jumps 6.9 px (2g·tanθv) at the band's outer edge.
   - A 6.3 px strip of photo just beyond the crack is **hidden**, and the 6.3 px strip on your side is **seen twice** (once directly, once mirrored).
   - At 45° view: a 9.5 px band and about a 31 px jump. Straight on: 0, so the image runs through cleanly.
2. **Displacement by leaning faces.** Leans of 5–20° move the photo seen in the band by 3–35 px. Near grazing exit the picture is stretched and dimmed (R ≈ 32% at 40° inside the glass).
3. **Trapped bands** replace the picture with internal light: 6–20 px of "edge" where you would expect photo.
4. **Shallow faces** (cone) dim the picture by 9–49% and soften it with roughness.
5. **Holes** show the photo sharp and unfrosted, and brighter (no Fresnel loss, no frost scattering).
6. **Wide-open gaps** between loose pieces (an air slot of 0.3 mm or more) show the photo straight through the slot as a sharp line. Rays crossing the slot obliquely are offset by several px (computed example: a 0.3 mm slot at 40° inside the glass gives an offset of about 4 px).
7. **Pistoned pieces** change g locally: shift `δz·tanθv` (sub-pixel to about 1 px) and a different frost blur.
8. **Piece tilt:** under 0.5 px (1.6). Negligible.

### 1.8 Crushed zone and Hertzian cone

- **The crushed zone is white.**
  - In a powder of transparent material, "an impinging ray is partially reflected (a few percent) by the first particle, enters in it, is again reflected by the interface with the second particle..." until the light "is returned in all directions" ([Diffuse reflection](https://en.wikipedia.org/wiki/Diffuse_reflection)).
  - Sharp impacts are "pulverized or crushed, unlike blunt impact sites" (Quinn p. 6-37, [DOI](https://doi.org/10.6028/NIST.SP.960-16e3)).
  - Render it as a white scattering medium with sparkle: the larger facets are separate mirrors.
- **Cone geometry.**
  - Ring cracks "pop in normal to the surface but then turn and propagate into the depth with an included angle of 125° to 135° for quasi static loading". That means walls **22.5–27.5° from the surface**.
  - "The included cone angle decreases markedly with increasing impact velocity": 60–80° at 250 m/s (Quinn p. 6-40).
  - A hammer is in the quasi-static regime (estimate).
  - "the opening on the exit side will be larger than the opening on the entry side" ([SWGMAT](https://www.asteetrace.org/static/images/pdf/02%20Glass%20Fractures.pdf)).
- **The cone wall's optics** (computed):
  - A front view meets the wall at about 25° incidence, so the gap reflects 9% (both faces) and transmits 91%.
  - The reflected part is trapped (K6). So the cone ring dims the photo slightly, feeds trapped light (it glows) and, being near the origin and therefore rough, looks **milky** (1.2 table, α ≈ 25°).
- **A crater left by an ejected cone plug is a conical prism (an axicon)** (computed; inference about how it looks).
  - Its walls are clear fracture faces, not frosted.
  - Light passing straight through the pane leaves a 25° wall at 40°, bent by 15°.
  - So the photo seen through the crater ring is displaced radially and sharper than the frosted pane, and the floor light under it forms a ring-shaped caustic.

### 1.9 Shadows and caustics on the photo

For a perpendicular open crack and a directional lamp at in-glass angle θᵢ (computed, D, polished back face):

```
crack-relative coordinate x on the photo (lamp on the −x side), s = g·tan θair:
  dark band   (direct light missing):  x ∈ [ +s,  +s + t·tanθi ]     intensity 0 × E
  bright band (mirrored light added):  x ∈ [ −s − t·tanθi, −s ]      intensity 2 × E
  between them: ordinary light, a gap of 2s
  no light is lost: the band is folded, not absorbed
```

- Lamp at 45° (θᵢ = 27.7°): each band is 9.5 px wide, and they are 12 px apart with g = 6 px. Lamp at 20°: 4.2 px wide, 4.4 px apart (computed; checked against a ray-binning trace).
- **With a point lamp** (inference), θᵢ grows with distance from the lamp's foot. So the crack shadows are **zero width under the lamp and widen further out**, which is a strong cue that moves with the cursor.
- **Leaning faces** move and stretch the bright band. Light reflected beyond θc is trapped instead of reaching the photo (3% at a 20° lamp and 30° lean) and feeds the glow.
- **Tight (FTIR) segments** make only a weak pair; invisible segments make none. So shadows come in segments, like the cracks.
- The frosted back face blurs both bands by the frost lobe over the gap, which the engine already models.
- **Debris lying on the photo** (inference):
  - Grains of 0.15–0.85 mm (0.5–3 px) make tiny shadows with a bright focus spot, acting as ball lenses.
  - Slivers make a line shadow with a bright core.
  - Chunks behave like the floor pieces in `broken-glass-light.md`: a pale shadow, dark rim, bright inner line.

### 1.10 Laminated glass

- **Construction:** for example "2.5 mm glass, 0.38 mm interlayer, and 2.5 mm glass". The break is a "spider web" held by the interlayer ([Laminated glass](https://en.wikipedia.org/wiki/Laminated_glass)).
- **The PVB is index-matched.**
  - Saflex PVB has a refractive index of **1.488** at 23 °C and haze under 1% ([Saflex Structural TDS](https://saflex-vanceva.eastman.com/content/dam/saflex/pdf-documents/arch/saflex/technical-data-sheet/product_technical_sheet_-_saflex_structural_031720.pdf)).
  - Glass/PVB reflection is 0.011% (computed), so there is **no visible interface**. Trapped light crosses between the plies freely.
  - A crack in one ply interrupts only that ply's depth range (inference).
- **Two crack networks.** The cracks in each ply span that ply's depth: z 0–2.5 mm and 2.88–5.38 mm. The doubled lines are offset by **0.43 mm at 15°, 0.87 mm at 30° and 1.31 mm at 45°** for 2.5 mm between ply depths; about 1.5–5 px (computed).
  - Whether the two plies' patterns match is unverified. Expect similar radials with different chords (estimate).
- **Tight cracks** (inference): the interlayer holds the pieces pressed together, so more segments are in the FTIR or thin-film range (1.1e, 1.3) than in a loose annealed break.
- **UV:** PVB can "block nearly all ultraviolet radiation" ([Laminated glass](https://en.wikipedia.org/wiki/Laminated_glass)). Relevant to the site's black-light work: nothing behind a laminate fluoresces under the UV lamp.
- **Delamination, crushed glass stuck to the PVB at the strike, PVB stress whitening:** I could not source how these look (Appendix B).
  - (inference) A delaminated patch is an air film parallel to the surface: silvery by TIR at oblique views, Newton-coloured when the gap is under about 1 µm.
  - The crushed zone stays stuck to the PVB and stays white (1.8).

### 1.11 Small debris: slivers, grit, chunks

- **How big, and where.**
  - Backward fragmentation: "86 percent of recovered fragments were located on the grid at a point directly below the frame".
  - "about 90 percent of the fragments on each grid located on the first row ranged in size between 0.15-0.85 millimeters".
  - "the total quantity of fragments decreased by a factor of 4-5 for every 45 centimeter increment" ([Luce, Buckle & McInnis 1991, NCJRS abstract](https://ojp.gov/ncjrs/virtual-library/abstracts/study-backward-fragmentation-window-glass-and-transfer-glass)).
  - Size against distance thrown is studied in [Locke & Unikowski 1991](https://www.sciencedirect.com/science/article/abs/pii/037907389190190T) (abstract only).
  - **On screen: 0.5–3 px grains, mostly directly under the pane.**
- **Needle slivers.** Twist hackle can break through late, "generating faint tinkling sounds and creating very sharp needle like fragments that fall free from the fracture surface" (Quinn p. 5-44, [DOI](https://doi.org/10.6028/NIST.SP.960-16e3)). Expect them along crack lips, and fallen below.
- **Chips along crack edges.** "It is quite common, especially with glasses, to have one fracture half rub against the edge of the matching fracture half, causing chips" (p. 4-49). Edge chips "are curved shell-shaped fragments" (p. 6-38).
- **How each looks** (inference from 1.1–1.5):
  - **Grit:** each grain is a few mirror facets plus internal TIR. It **sparkles** as single bright points that switch on and off as the lamp and viewer move. Seen as a heap, it is white (1.8).
  - **Slivers:** each is a light guide. Light enters along its length and **leaves at the broken ends**, so the ends glow. The long faces give a hair-like line highlight.
  - **Chunks:** a small slab or prism. Internal TIR flashes (like a crude gem), a green edge glow, rim refraction.
  - **Chips in the pane surface:** small concave conchoidal pits. Each is a tiny curved mirror (a point glint) and a lens (a small caustic or dark spot on the photo).
  - **Grit wedged in a crack** holds it open, so the crack is visible (TIR), and the grain scatters a point of light.

### 1.12 The broken edges and side faces

- **A fracture face seen from air at a grazing angle** (hole rims, the broken outline of a piece) is a strong mirror: external reflection is 17% at 70°, 39% at 80°, 61% at 85° and 82% at 88° (computed). It also lets trapped light out, so it glows green with the piece's trapped light.
- **Conchoidal edge chips:** shell-shaped scallops along the edge (Quinn p. 6-38). Each scallop is a small curved mirror and prism, giving glints and colour fringes (1.4).
- **Rib marks and hackle are visible on edges**, which is how examiners read the direction of breaking with the 4R rule ([SWGMAT](https://www.asteetrace.org/static/images/pdf/02%20Glass%20Fractures.pdf)). Within 1–2 px these become faint stripes across the edge face that shift with the light (1.2).
- **The pane's own side faces** (inference):
  - Where a crack reaches the boundary, the side face is split by a line at the crack's lean.
  - The two pieces' side faces carry different trapped light, so the glow steps.
  - They may also differ in tilt and piston, so the reflection steps too.

### 1.13 Things the list was missing

1. **The lamp's glow halo is cut off at cracks** (1.1c, 1.5). It is probably the strongest "the glass is broken" cue for a lamp near a frosted pane.
2. **Piston steps:** exposed slivers of fracture face act as grazing mirrors and leak glow (1.6).
3. **Open slots** between loose pieces show the photo sharp and straight through (1.7).
4. **Wet or dirty cracks.**
   - Index matching makes cracks disappear (the patent above).
   - (computed) Water in a crack raises θc to 61.3°. Most front-view rays at near-perpendicular faces (incidence 70–89°) are still totally reflected, but the "partial" range widens. A wet crack is less silvery and more see-through.
   - (inference) Dirt makes dark lines.
5. **Coloured fringe at the critical angle** (1.4).
6. **The crater acts as an axicon** (1.8).
7. **Curved and conchoidal faces and twist-hackle steps** break glints into moving segments (1.2).
8. **Ghost double reflection per piece.** The back face's reflection is offset by 2t·tanθᵢ; on this pane it is diffuse because the back face is frosted. Tilt moves both copies together (inference).
9. **Polarisation:** partial reflections are polarised, TIR is not attenuated. Invisible without polarisers; skip. **Birefringence:** annealed glass has no strong stress pattern, so skip (the engine's catalogue already says "No").
10. **Diffraction at cracks:** sub-pixel; skip (as the catalogue says for edges).

---

## Part 2. Prior art for rendering it

### 2.1 Techniques, ranked for this engine (WebGL1, one fragment shader per pane, photo behind, lamps in front)

| Rank | Technique | What it does well | What it misses | Cost | Licence and links |
|---|---|---|---|---|---|
| **1** | **Analytic ray–plane intersection per pixel with crack faces inside the slab** (the "interior mapping" idea: planes come from a texture, and the intersection is solved in the shader) | Exact band width and position, parallax, lean, TIR, fold, displacement and trapping; cheap; resolution-independent; the face is a real 3D surface through the thickness | Junctions need 2 candidate segments; curved profiles need a quadratic per segment; one bounce plus one follow-on step in practice | ~1 fetch outside bands, ~7–9 inside (estimate) | Idea: van Dongen 2008, "Interior Mapping" (CGI 2008). "Calculating the intersection between an infinite plane and a ray is only a few steps and eats little performance" ([author's blog](http://joostdevblog.blogspot.com/2018/09/interior-mapping-real-rooms-without.html)). Our own code; nothing to license. |
| **2** | **Crack-face ribbons as geometry** (quad strips through the thickness, drawn as seen through the front face) | Exact perspective, real anti-aliasing, works for hole rims and floor pieces; artists build windscreen cracks this way: extrude the traced cracks "inward to give them some thickness. 3mm... one of the two laminated glass panels", jitter vertices, scale the tips to zero ([BeamNG tutorial](https://www.beamng.com/threads/tutorial-how-to-make-your-own-3d-windshield-cracks.14846/)) | Needs the refracted projection of points inside the slab per vertex; an extra pass with compositing against the pane shader; more plumbing in a per-pane fragment architecture | Proportional to band area | Our own code. Best fit for the **floor pieces and hole rims** (already planned as `slab.ts`). |
| **3** | **Depth layers** (store the shard id and distance at K depths; ray-march the layers) | Handles junctions, curl and any topology automatically | Memory (K layers, no 3D textures in WebGL1); linear search plus refinement; aliasing | 4–8 fetches per pixel near cracks | Multi-layer relief mapping stores "up to four depth values" per RGBA texel, linear then binary search, "approximately 780KB" per 256² structure ([Policarpo & Oliveira, I3D 2006](https://www.inf.ufrgs.br/~oliveira/pubs_files/Policarpo_Oliveira_RTM_multilayer_I3D2006.pdf)). Idea only. |
| 4 | **Per-shard "broken mirror" shading** (shard id → tilt normal → reflect → environment and lamps) | The 2τ reflection jumps and broken highlights (1.6); trivial cost | Needs a sharp environment; says nothing about cracks | +2 fetches | Already designed in `research-glass-fracture.md` §3. Godot per-shard references: [Impact Glass Shader](https://godotshaders.com/shader/impact-glass-shader/) (MIT), [Godot-Glass-Break-Effect](https://github.com/Lord0Sanz/Godot-Glass-Break-Effect) (MIT; "O(n² × pixels)", "point reduction yields 4x improvement"). |
| 5 | **Screen-space refraction offset** (normal map → UV offset of the background) | Cheap, robust; the site already does this for frost and waviness | No TIR, no fold, no trapping: just a wobble. That is the "fake" look | 1–2 fetches | [GPU Gems 2 ch. 19, Sousa (Crytek)](https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-19-generic-refraction-simulation): normal-map XY "scaled by some small value"; mask to stop foreground leaking. Wyman 2005 image-space two-face refraction (ACM link in `research-glass-fracture.md`; not re-read this session). |
| 6 | **Iterated bump-offset or parallax "depth cracks"** (Unreal ice) | Cheap sense of depth | Fakes depth only; no optics; an artist trick, not physics | 24 iterations in the example | [80.lv, cracked ice in Unreal Material Editor](https://80.lv/articles/how-to-build-cracked-ice-in-material-editor): bump offset "iterates several times"; 24 iterations against artefacts. Not recommended. |
| 7 | **Procedural Voronoi crack shaders** | Quick visuals | Wrong crack topology (`research-glass-fracture.md` §1a); no optics | O(seeds) per pixel | Godot "Cracked Glass" is a **Shadertoy port, CC BY-NC-SA 3.0** ([godotshaders](https://godotshaders.com/shader/cracked-glass/)): do not copy. Shadertoy pages returned 403 (Appendix B). |
| – | **Glints** (debris, the crushed zone, hackle) | Correct sparkle statistics | Overkill for a few hundred grains | – | [Chermain et al. 2020 code](https://github.com/ASTex-ICube/real_time_glint): **MIT**, but OpenGL 4.x with array textures, so not WebGL1 as-is. [Deliot & Belcour, HPG 2023](https://arxiv.org/abs/2306.05051): "1.5X to 5X faster than the state-of-the-art"; no code found. Use explicit per-particle facets instead (2.4 step 7). |
| – | **Thin film** | Correct iridescence | – | 1 lookup-table fetch | [Belcour & Barla 2017](https://belcour.github.io/blog/research/publication/2017/05/01/brdf-thin-film.html): supplemental code exists, **licence not stated**, so write our own from the equations. Our case is the simple symmetric glass/air/glass film, which needs only a small lookup table (2.4). |
| – | **Caustics** | Area-ratio intensity | Works for smooth refractive surfaces | – | [Wallace](https://medium.com/@evanwallace/rendering-realtime-caustics-in-webgl-2a99a29a0b2c): "An increase in the area of the triangle means the light has been spread out and must be dimmed"; derivatives via dFdx/dFdy. The site already uses it. For cracks, the closed-form bands (2.4) are exact and cheaper. |

### 2.2 How games render breakable glass (from public material)

- **Source engine (Half-Life 2 and later).**
  - `func_breakable_surf` uses an intact material with `$crackmaterial` and a broken-state `ShatteredGlass` shader with a `BreakableSurface` proxy ([Valve Developer Community](https://developer.valvesoftware.com/wiki/Making_a_custom_breakable_surface)).
  - Glass "will break off in chunks and pieces rather than the entire thing at a time", leaving pieces "stuck to the frame" ([TWHL](https://twhl.info/wiki/page/Tutorial:_New_Glass)).
  - It is a 2D texture with alpha. **No crack optics.**
- **Rainbow Six Siege (GDC 2016).**
  - "Use arbitrary cutting polygons to cut a planar surface". A cutter class lists "Glass, Texture"; a "Procedural Glass Prototype" dates to early 2013 ([L'Heureux slides](https://media.gdcvault.com/gdc2016/Presentations/LHeureux_Julien_Art_Of_Destruction.pdf)).
  - Destruction geometry only; **no glass shading details**.
- **The Last of Us Part II.** The glass is **pre-broken and hidden until impact**: "because the glass doesn't actually fracture in real time, we had to get creative" (Neilan Naicker, via [GameSpot](https://www.gamespot.com/articles/the-complex-system-behind-one-of-the-last-of-us-2s/1100-6480713/)).
- **Control (Remedy).** The GDC destruction summary covers concrete, metal and plants; **glass is not mentioned** ([Game Developer](https://www.gamedeveloper.com/production/using-procedural-destruction-to-unleash-chaos-in-i-control-i-)).
- **Max Payne 3.** The technology article covers Euphoria; **no glass details** ([TechRadar](https://www.techradar.com/news/gaming/the-technology-of-max-payne-3-1082751)).
- **Frostbite / Battlefield and CryEngine.** I found **no public talk or document on how they shade glass cracks** before the search budget ran out. That is "not found", not "does not exist".
- **BeamNG (modding).** Windscreen cracks are real 3D strips one ply deep with random offsets and tips scaled to zero ([tutorial](https://www.beamng.com/threads/tutorial-how-to-make-your-own-3d-windshield-cracks.14846/)). This is the closest to physical crack faces I found in games.
- **Smash Hit, Unreal Chaos, Unity GlassSystem:** about geometry and physics; see `research-glass-fracture.md`.

**Conclusion** (inference from the above): the public game material treats broken glass as **geometry plus textures (alpha, normal maps, screen-space refraction)**. None of it models crack faces as TIR mirrors folding the scene behind, trapped light, or crack shadow bands. That gap is exactly what Ony is seeing. The physics in Part 1 has to be implemented by us.

### 2.3 Offline renderers for ground truth

| Renderer | Licence | Relevant features | Notes for a cracked-glass reference |
|---|---|---|---|
| **Mitsuba 3** | BSD-3-Clause ([LICENSE](https://raw.githubusercontent.com/mitsuba-renderer/mitsuba3/master/LICENSE)) | Spectral and polarised variants. `dielectric` (polarised Fresnel supported), `roughdielectric` (GGX, for the frosted face), and `thindielectric`, which "correctly accounts for multiple internal reflections". The `int_ior`/`ext_ior` parameters are a float or a named material: **no dispersion** documented ([BSDF docs](https://mitsuba.readthedocs.io/en/stable/src/generated/plugins_bsdfs.html)) | **Model an open crack as a `thindielectric` surface inside the slab with int_ior = 1.0 (air) and ext_ior = 1.52.** That is exactly an air film thicker than about 1 µm: Fresnel plus TIR, straight-through transmission. (Unverified: that the plugin accepts int < ext. Test one case against the formulas in 1.1.) |
| **pbrt-v4** | Apache-2.0 ([repo](https://github.com/mmp/pbrt-v4)) | Always spectral; GPU via CUDA/OptiX. Dispersion: "Spectrally varying IORs... are handled by randomly sampling a single wavelength" ([PBR book 4ed](https://www.pbr-book.org/4ed/Reflection_Models/Dielectric_BSDF)) | Use it for **dispersion and critical-angle fringes**, chips, debris "fire". |
| **Blender Cycles** | (not checked this session) | Dispersion in the Principled BSDF merged into **Blender 5.3 alpha**: "RGB-based implementation rather than a true spectral one" ([80.lv, 24 Aug 2026](https://80.lv/articles/principled-bsdf-in-blender-s-cycles-now-supports-dispersion)) | Handy for modelling; not a spectral reference. |

- **Existing cracked-glass reference scenes:** none found.
  - The only rendering study I found is a UC Berkeley student project on ice cracks. It used Blender fracture geometry and a custom microfacet "MicrofacetGlass" BSDF ([Ghafari & Park](https://aminghafari.github.io/projects/realistic-rendering-ice.pdf)). It is a course project with no published validation. Use it for ideas only.
  - So **build our own reference**:
    - a slab of t = 5 mm, polished front, `roughdielectric` back with α calibrated to the site's frost;
    - crack faces exported from `fracture.ts` as ribbons with lean and twist;
    - a diffuse photo plane at the site's gap;
    - a small spherical emitter as the lamp, and the site's HDR.
  - Render the **same cameras** as the site. Compare band widths and contents, crack shadow pairs, glow, and glints.

### 2.4 Recommended approach for the engine

The guiding rule stays Ony's: **causes in, effects out.**

- The causes per break come from `fracture.ts`: crack lines, lean, gap, roughness, tilt, piston.
- The causes in the scene: lamp, view, photo, gap g, thickness t, frost.
- Everything in Part 1 then *follows* from them. No knob for "crack brightness" or "refraction strength".
- The only constants are physical (n, θc, Fresnel) or calibrated once: the frost's trapped-light coupling and the roughness scale.

#### The formulas, in one place

```
refraction:        GLSL refract(); in-glass angle θi = asin(sin θ / n)
Fresnel:           Rs = ((n1cosθ1 − n2cosθ2)/(n1cosθ1 + n2cosθ2))², Rp likewise; R = (Rs+Rp)/2; R = 1 if n1 sinθ1 > n2
air gap of width d (thin film AND frustrated TIR, one formula; T4 lookup table):
                   cosθa = sqrt(1 − n² sin²θg)            (imaginary beyond θc)
                   δ = 2π d cosθa / λ ;  r12 = Fresnel amplitude glass→air (s or p)
                   r = r12 (1 − e^{2iδ}) / (1 − r12² e^{2iδ}) ;  Rgap = (|r_s|² + |r_p|²)/2
                   (averaged over the spectrum and a wide gap this tends to 2R/(1+R))
crack band:        w = t |tanβ − tanθi| ;  α = 90° − |θi − β| ;  θ' = 2β − θi   (1.0)
roughness:         kS = exp(−(4π n σ cosα / λ)²)  specular kept; the rest goes to a blurred lobe
tilted piece:      N = tilt(τ)·Z ; R = reflect(v, N) → reflection turns 2τ; lamp highlight shifts ≈ 2τ·h
corner glint:      out = (−Lx, Ly, −Lz) in the crack frame (x across, y along) × R_back(frost lobe)
trapped light:     crossing an open perpendicular crack: × (1 − Rgap(α)); mean 0.425
absorption:        T = exp(−α_abs·L), α_abs ≈ 0.05–0.07 cm⁻¹ photopic, L = path length in glass
rim from the air:  external Fresnel at the grazing angle (17% at 70°, 39% at 80°, 61% at 85°)
floor light:       the affine maps of the floor-light pass below
```

#### Data (built on the CPU once per break, then patched)

| Texture (RGBA8 unless noted) | Layout | Contents |
|---|---|---|
| **T0 crack field** (pane resolution, or half) | R,G = 16-bit id of the nearest crack segment within reach (about 40 px); B,A = second nearest | Lets each pixel find the 1–2 faces its ray can meet. Distances are computed exactly from the segment endpoints, so none are stored. |
| **T1 shard field** | R,G = 16-bit shard id at the front face; B = crushed-zone density; A = chip/debris mask | Per-piece shading; crushed zone. |
| **T2 segment table** (about 4 texels per segment) | endpoints (4×16-bit); **lean** β₀, β₁ at the ends (signed, 8-bit); curl (signed curvature near the compressed face) and twist-hackle side/width/spread; mist σ at each end (log 8-bit); **gap** w at each end (log scale, 0 = closed); type (radial, concentric, branch, cone, ply 1/2); parent crack id plus arc-length offset (continuous rib-mark phase) | Everything needed to place and shade a face. Lean, σ and gap vary along the segment by linear interpolation in u. |
| **T3 shard table** (about 2 texels per piece) | tilt normal (2×8-bit angles); piston δz (8-bit); flags: missing, loose, ply | Broken-mirror shading, holes, steps. |
| **T4 film/FTIR lookup table** (256×64) | x = log gap (10 nm–3 µm), y = cos of the in-glass incidence (sub- and super-critical); RGB = reflectance of glass/air(gap)/glass | Precomputed at load in JS with the Airy formula of 1.1e and 1.3. Gives FTIR fading, Newton colours and the thick-gap limit 2R/(1+R) in one fetch. |
| **T5 trapped-light map** (¼ resolution; half-float if available, else RGBA8) | RGB trapped radiance, updated each frame | Feeds trapped bands, side faces, hole rims and the frost glow. |
| Debris buffer (vertex buffer) | position, size, type (grit, sliver, chunk), facet seed | Drawn as sprites or small slabs. |

Memory is small (estimate): 2000 segments × 4 texels fit in a 128×64 table.

How the textures are built:

- The ids in T0 come from a CPU pass: for each segment, loop over its bounding box expanded by the reach and keep the nearest two. Alternatively, extend the existing `shard-map.ts`.
- WebGL1 has no integer textures, so decode ids with float math: `id = floor(r*255+.5)*256 + floor(g*255+.5)`.

#### View pass (in the pane's fragment shader)

```
// per fragment: p = pane-space position (px); v = view direction in air (into the pane)
dIn  = refract(v, -Z, 1/n)                       // in-glass direction
foot = t * dIn.xy / dIn.z                        // in-plane travel from the front face to the back face
reach= length(foot)
s1,s2= T0(p).ids  (also T0(p + 0.5*foot) if reach > a few px)
for each candidate segment s:                     // ≤ 2–3 iterations, constant bound
   line Q(u), in-plane normal m, lean β(u), curl c(u)
   face: points X with  dot(X.xy − Q, m) = z·tanβ + c·z²       // ruled surface; c = 0 ⇒ plane
   solve the ray X = (p,0) + λ·dIn  → λ (quadratic if c≠0), keep 0<z<t and 0≤u≤len, nearest
if hit:
   nF   = normalize(m·cosβ', −sinβ')  (β' = local slope incl. curl), perturbed by
          rib marks  (ripples in (u,z): amplitude ~ few °; crest lines bowed toward the origin)
          twist hackle (facet rotation ±φ in a strip near one face; segment pattern along u)
   cosA = |dot(dIn,nF)|;  Rg = T4(gap(u), cosA)   // ≈1 when open and beyond θc; <1 when tight; Newton colour below θc
   r    = reflect(dIn,nF)
   kS   = exp(−(4π n σ(u) cosA/λ)²)              // specular fraction kept (1.2)
   Lr   = kS·trace1(r) + (1−kS)·diffuseFace(hit)  // diffuseFace: blurred trace + trapped light
   Lt   = trace1(dIn)                             // ray continues across the gap (offset ≈ 0)
   L    = Rg·Lr + (1−Rg)·Lt
else:
   L = ordinary pane shading
// piece mirror: N = shardTilt(T1(p)), front reflection with Fresnel(v·N) of room + lamps
// holes: if the shard is missing, no frost, no front reflection; rims hit by the same intersection
//        but from air: external Fresnel (grazing 40–90%) + trapped light out (glow)

trace1(r):                                        // one follow-on step, no recursion
   if r.z >  cos θc : leave through the back → photo at hit.xy + r.xy/r.z·(t−z) + refract(r).xy/… ·g
                      (frost blur by gap as today)
   if r.z < −cos θc : leave through the front → room HDR + lamps along refract(r)   (partial R only)
   else             : trapped → T5(hit.xy) · Beer–Lambert tint (+ frost in-scatter of the photo)
```

**Lamp glints.**

- Evaluate each lamp (as a sphere light) for the two follow-on directions above, and for the **corner path**: TIR at the crack, then the back face's reflection lobe (the frost's GGX at the back face), then out of the front.
- Because the face normals carry rib-mark and hackle variation, glints appear where 1.1d says, in segments, sliding along cracks.

**Thin film** comes for free through T4. Only segments whose gap is 0.05–1.5 µm and whose incidence is below θc show colour.

**Laminated glass:** each segment carries a ply (a z range). The PVB is ignored (index-matched).

#### Floor-light pass (light reaching the photo; per photo pixel P near cracks)

For each candidate segment near P's footprint on the pane, work in the crack's 2D cross-section (across the crack, z).

1. Set up the light.
   - Get the lamp's in-glass direction d at the crack.
   - Take the across-crack component: tanθᵢ = (d·m)/d_z.
   - Leave the along-crack component unchanged.
2. Rays hit the face when they enter the front face at x_e ∈ the "hit interval" (width `t·|tanβ − tanθᵢ|`).
3. Map those x_e through two affine maps. Both are closed form from Snell's law and the reflection law:
   - **Direct (missing):** `x = x_e + t·tanθᵢ + g·tanθair`. The image of the hit interval is the **dark band**. Intensity is multiplied by `(1 − Rg)`.
   - **Reflected:** hit depth `z_h = x_e/(tanβ − tanθᵢ)`, then `θ' = 2β − θᵢ`, then out of the back face at `x_b = z_h·tanβ + (t − z_h)·tanθ'`, then onto the photo at `x = x_b + g·tan(asin(n·sinθ'))`. This is affine in x_e with slope A. The image is the **bright band**, intensity `Rg·E/|A|` × (exit Fresnel ratio). Zero if `|θ'| > θc`: that light is trapped and goes to T5.
4. `E(P) = E_intact(P)·[1 − Rg·χ_dark] + E_intact·Rg·χ_bright/|A|`, then the frost blur as today.

This reproduces the computed pattern: 0× and 2× bands, `t·tanθᵢ` wide, `2g·tanθ` apart, for β = 0.

#### Trapped-light map T5

Version 1 is a 2D "shadow ray" per ¼-resolution texel:

- Start from the engine's existing trapped (piped) light for an intact pane at that point.
- Count the **open** crack crossings on the straight line to each lamp's foot by sampling T1's shard id at about 8 points.
- Multiply by 0.425 per open crossing (1.5).
- On the lamp's side, add the reflected share: (estimate) multiply by 1 + 0.575 × (fraction of the halo stopped by the crack); calibrate.
- Add light injected by leaning faces near the lamp (the trapped share of the lamp light they meet, from the same cross-section maths as the floor pass).

Version 2, if needed: a few iterations of crack-aware diffusion (weight 1 within a piece, Rg-dependent across cracks).

Both versions are our own design; I found no prior art for this specific map.

#### Crushed zone, cone and debris

- **Crushed zone** (T1.B):
  - Mix towards a white multiple-scattering medium lit by the lamps and the room, weighted by density.
  - Add a hash-based **sparkle**: per tiny cell (1–2 px), a random facet normal, a specular test against the lamps and the environment, and Fresnel.
  - Cone walls are segments of type "cone" (β ≈ 62–68°, high σ). The crater (plug missing) is a hole whose rims are those walls, an axicon (1.8).
- **Debris:**
  - A few hundred particles in a vertex buffer, placed per Luce et al.: mostly directly below, 0.5–3 px, a few slivers along the crack lips. The fall/settle code already planned (`research-glass-fracture.md` R5) places chunks.
  - Grit: point sprites with 3–4 random facet normals each. A glint where a facet's half-vector matches a lamp or bright environment direction; a shadow dot plus focus dot in the floor pass.
  - Slivers: thin quads with end glow from the T5 sample at their position.
  - Chunks: the `slab.ts` extrusions with the same face shader as the rims.

#### Cost per pixel (estimate, to measure)

| Region | Extra texture reads | Extra ALU | Share of a broken pane |
|---|---|---|---|
| Outside bands | 2 (T0 or T1 + shard table) | ~20 | 80–95% |
| Inside crack bands | 7–9 (T0, 2–4 segment texels, T4, 1–2 photo/HDR/T5) | ~200–300 with 1–2 lamps | 5–20% |
| Floor pass near cracks | ~6 | ~150 | similar |
| T5 trapped-light map | about 0.5–2.5 per screen pixel (¼ resolution) | – | whole pane |
| Crushed zone, sparkle | 1–2 + hash | ~50 | under 2% |

**Risks.**

- **highp in fragment shaders is optional in WebGL1/GLES2.** Pane coordinates need sub-pixel precision over about 2000 px. Fall back to tile-local coordinates where highp is missing. (Unverified for current target devices.)
- The texture-unit budget: the WebGL1 minimum is 8. Pack T0 and T1 if needed. (Not re-checked this session.)
- Loops need constant bounds.

#### Build order

Each step can be seen alone in `?try=broken` and is checked against a ground-truth render or a photo.

1. **Segment table and T0/T1** from `fracture.ts`: lean, gap, σ, hackle from causes:
   - gap from distance to the tip and frame clamping;
   - σ from Orr's equation near the strike and before forks;
   - lean by type.

   Tests: the closed forms in 1.0 against a CPU ray trace (port `crack_optics.py` cases into vitest).
2. **View-pass intersection and the regime map:** fold, displace, trapped, partial. Show the band contents with the lamp off first. This is the step that removes the "drawn line" look.
3. **Per-shard mirror** with a sharp HDR. Check jumps of 2τ.
4. **Floor-light bands** (closed form). Check 0×/2× and the widths against D in Appendix A.
5. **T5 trapped light**, then trapped bands, side-face steps and the halo cut-off.
6. **Glints:** the corner path, rib marks and twist hackle. **T4 lookup table**: FTIR and Newton colours.
7. **Holes and rims, crushed zone and cone, debris.**
8. **Laminated:** ply ranges and doubled lines.
9. **Calibrate:**
   - **Ground truth:** Mitsuba 3 (`thindielectric`, int 1.0 / ext 1.52 for the crack faces) or pbrt-v4 (dispersion), at the site's camera.
   - **Reference photos:** a 4 mm float-glass picture-frame pane broken with a centre punch, over a printed photo with a gap, a lamp at known angles and several view angles. Measure band widths, shadow pairs and glint positions. Also photograph a frosted piece and a laminated sample. Wear eye protection and gloves.

---

## Appendix A. Computations

- Scripts, all in `/tmp/claude-0/-home-claude/a1697dc9-9172-5746-8c03-1ea7036d8a46/scratchpad/research/src/`:
  - `crack_optics.py` and `crack_optics2.py` (their outputs are `crack_optics_out.txt` and `crack_optics2_out.txt`);
  - `regime_table.py`.
- The NIST guide (3rd ed., 681 pages) was read from a local text extraction of the official PDF (`nist.txt` in the same folder). Page numbers are the printed page labels.
- What they do:
  - 2D/3D ray tracing of a slab (n = 1.52, t = 18 px, g = 6 px) with a planar crack face: Snell, Fresnel (unpolarised), TIR.
  - Ray binning for the light under a crack.
  - Airy/characteristic-matrix reflectance of a glass/air/glass film, with complex cosines for FTIR.
  - Colour integration with the [Wyman–Sloan–Shirley CIE fit](https://jcgt.org/published/0002/02/01/paper.pdf) (coefficients checked against the paper's Table 1) and a 6500 K blackbody (an approximation of D65).
  - Monte Carlo check of "no single TIR reflection exits the front face".
  - Flux-weighted crossing fraction for trapped light.
- Every number marked (computed) above comes from these.

**Full band regime table** (t = 18 px, g = 6 px; positive β leans the same way the view ray travels; output of `regime_table.py`):

| View | β | Band (px) | α | Shows | Detail |
|---|---|---|---|---|---|
| 0° | 5° | 1.6 | 85° | TIR → photo, displaced | leaves +15°, sample moved +3.2 px |
| 0° | 10° | 3.2 | 80° | TIR → photo, displaced | leaves +31°, +6.9 px |
| 0° | 15° | 4.8 | 75° | TIR → photo, displaced | leaves +49°, +12.2 px |
| 0° | 20° | 6.6 | 70° | TIR → photo, displaced | leaves +78°, +35.1 px |
| 0° | 25° | 8.4 | 65° | TIR → trapped | reflected at 50° in glass |
| 0° | 30° | 10.4 | 60° | TIR → trapped | 60° |
| 0° | 40° | 15.1 | 50° | TIR → trapped | 80° |
| 0° | 50° | 21.5 | 40° | partial, mostly through | reflects 49% (trapped) |
| 0° | 60° | 31.2 | 30° | partial, mostly through | reflects 11% (trapped) |
| 10° | 0° | 2.1 | 83° | TIR → photo, mirror fold | leaves −10°, −4.2 px |
| 10° | 20° | 4.5 | 77° | TIR → photo, displaced | leaves +57°, +13.1 px |
| 10° | 25–50° | 6.3–19.4 | 72–47° | TIR → trapped | 43–93° |
| 10° | 60° | 29.1 | 37° | partial | reflects 22% |
| 30° | 0° | 6.3 | 71° | TIR → photo, mirror fold | leaves −30°, −13.2 px |
| 30° | 10° | 3.1 | 81° | TIR → photo, displaced | leaves +1°, −6.3 px |
| 30° | 20° | 0.3 | 89° | almost nothing | – |
| 30° | 30° | 4.1 | 79° | TIR → photo, displaced | leaves +83°, +52 px |
| 30° | 40–60° | 8.8–24.9 | 69–49° | TIR → trapped | 61–101° |
| 45° | 0° | 9.5 | 62° | TIR → photo, mirror fold | leaves −45°, −21.5 px |
| 45° | 20° | 2.9 | 82° | TIR → photo, displaced | leaves +19°, −6.7 px |
| 45° | 40–60° | 5.6–21.7 | 78–58° | TIR → trapped | 52–92° |

**Light under a crack** (directional lamp, polished back face, g = 6 px). Positions are 0.5 px bins relative to the crack line. "Dark" lists the bins under 0.5× the intact light and "bright" the bins over 1.5×, so where the two bands partly overlap, only the extremes are listed:

| Lamp | β | Trapped | Dark band (×0) | Bright band | Peak |
|---|---|---|---|---|---|
| 20° | 0° | 0% | [2.2, 6.2] px | [−6.2, −2.2] px | 2.00× |
| 20° | 10° | 0% | [5.8, 6.2] | [3.8, 4.2] | 2.02× |
| 20° | 20° | 0% | [6.8, 8.2] | [12.8, 14.8] | 1.91× |
| 20° | 30° | 3.1% | [6.8, 12.2] | none above 1.5× (spread out) | 1.00× |
| 45° | 0° | 0% | [6.2, 15.2] | [−15.2, −6.2] | 2.00× |
| 45° | 20° | 0% | [12.8, 15.2] | [6.2, 8.2] | 2.12× |

## Appendix B. Sources I could not read, and searches I could not make

**Could not read** (reported as unreadable; no workaround tried):

- shadertoy.com: 403.
- dl.acm.org (the "Frozen on ice" SIGGRAPH 2014 talk): 403. Wyman 2005 was not re-read this session; it is cited through `research-glass-fracture.md`.
- refractiveindex.info database YAML (per-wavelength k for clear float): robots.txt.
- pjbglassgroup.co.uk Pilkington datasheet: SSL certificate mismatch.
- Wikipedia "Total integrated scatter": cache-only, not fetchable.
- developer.blender.org 5.3 release notes: too many redirects.
- everlam.com PVB fact sheet: 404.
- github.com/evanw/webgl-water README: no content returned. Its licence is **not verified**.
- The Pilkington handbook did not contain a by-thickness transmittance table.

**Not found before the search budget ran out:**

- a measurement of how far real pieces tilt in a broken annealed pane;
- photos or papers on how laminated delamination and PVB "stress whitening" look;
- primary sources on scratch-highlight rendering (for the geometry of the corner-path glint; derived here instead);
- glass-crack shading talks from Frostbite, CryEngine or Max Payne 3;
- per-wavelength absorption data for float glass.

**Other open items:**

- The lean of concentric cracks (the "about 30°" in `broken-glass-light.md` is unverified).
- How deep and how strongly twist-hackle facets are rotated.
- Whether Mitsuba's `thindielectric` accepts int_ior < ext_ior.
- Trapped-light coupling constants.

All of these are calibration targets for the reference-photo step.
