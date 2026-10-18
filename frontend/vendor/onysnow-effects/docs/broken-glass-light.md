# Broken glass: light, reflection and the pieces (item 10, step 3)

Ony, 2026-10-01: make the light and shadow of broken glass; each piece reflects
differently, with very contrasting differences; the cracks go all the way
through the thickness and down the sides at the right angle; cracks are glass,
hard to see until light hits them, not white; pieces can be taken out of the
pane, and lie on the floor below, where they refract differently too. "Those
look terrible" (the photographed cracks drawn as white lines).

## What the physics says

**Each piece is its own mirror, turned.** A face reflects 4% straight on
(Fresnel, n = 1.52), and a face turned by t sends the reflection 2t further
round (law of reflection). The room behind the viewer is bright in some
directions (a window, a lamp) and dark in others, so two neighbouring pieces
that differ by a few degrees can show a bright window in one and a dark wall in
the other: the strong contrast Ony describes. That needs tilts of degrees, not
the tenths of a degree the break has now (`fracture.ts`: up to 0.4 deg, which
moves the reflection by under a degree and barely shows).

**Why the pieces tilt by degrees.** The blow pushes the pane in: at the strike
it bends into a shallow dish before it breaks, and the pieces near the strike
are left pushed out of the plane. Laminated glass keeps the dish (the
interlayer holds the pieces, bent in a cone round the strike); annealed pieces
sit loosely in their frame, each at its own angle, most near the strike.
Model, from causes: a dent of depth `delta` at the strike over a radius `R`
(both from the blow's energy) gives every piece the slope of the dish where it
is (`delta / R`, pointing at the strike, about 1-4 deg), plus a random knock for
loose pieces, largest near the strike.

**Seen through, a piece barely moves the picture.** A tilted piece is still a
slab with parallel faces, and a ray through a parallel slab leaves as it came,
shifted by `t theta (1 - 1/n)` (Hecht, Optics 4.3): 0.04 px for an 18 px pane at
0.4 deg, about half a pixel at 4 deg. The distortion of the view is at the
cracks, not across the pieces: there the line of sight crosses a fracture
face.

**A crack is an air gap between two glass faces, through the whole
thickness.** Light inside the glass meeting the gap beyond the critical angle
(41.1 deg for n = 1.52) is totally reflected, so a crack face is a mirror from
inside: it shows whatever light reaches it at that angle, brilliantly when the
lamp lines up, and is nearly invisible otherwise -- clear glass, not a white
line ([ScienceABC](https://www.scienceabc.com/eyeopeners/if-glass-is-transparent-then-why-are-its-cracks-opaque),
[TIR](https://en.wikipedia.org/wiki/Total_internal_reflection)). Seen from the
front, the face shows as a band as wide as the thickness times the tangent of
its lean, at the apparent depth `t / n`.

**How the faces lean through the thickness.**
- Radial cracks start on the far side (the side away from the blow, in
  tension as the pane bends) and run through nearly square to the surface;
  their rib marks meet the far side at a right angle -- the forensic "3R rule",
  radial cracks make right angles on the reverse
  ([Forensic glass analysis](https://en.wikipedia.org/wiki/Forensic_glass_analysis),
  [Raut](https://www.santoshraut.com/forensic/glass.fractures.htm)).
- Concentric cracks start on the struck side and lean through the thickness.
- At the strike a cone comes out: the Hertzian cone, narrow on the struck side
  and wide on the far side, its walls leaning well off square (reported between
  about 20 and 40 degrees from the surface; faster blows make it steeper:
  [Hertzian cone](https://en.wikipedia.org/wiki/Hertzian_cone),
  [Lawn & Wilshaw on cone angles](https://www.researchgate.net/publication/230241995_The_Angle_of_Hertzian_Cone_Cracks)).
- Where a crack reaches the pane's edge it runs down the side face as a line at
  its own lean, so the side faces show the cracks too.

**The light and shadow on the photograph under it.** Each crack face turns the
light that meets it: under the crack, a little to the side away from the lamp
(across the gap), the photograph gets a dark line where the light was turned
away and a bright line beside it where it went -- the same dark-rim,
bright-seam pair a pane's edge throws (`floor-light-shader`, caustics as the
Jacobian of the ray map; [Caustic](https://en.wikipedia.org/wiki/Caustic_(optics))).
Each tilted piece shifts its own patch of light a little across the gap.

**A piece taken out.** Where it was there is no glass: the photograph sharp, no
frost, no reflection, and the hole's rim is the exposed fracture faces, lit
the way the crack faces are.

**A piece on the floor (lying on the photograph).** A slab lying nearly flat:
its top face reflects the room at its own small tilt; looking through it the
photograph is barely moved (parallel faces again) except at its broken edges,
which are wedges and lenses -- there the picture is pulled sideways, and seen
edge-on the glass is long and green (Beer-Lambert). Light trapped inside by
total internal reflection leaves at the broken edges, so they glow. Its shadow
on the photograph is pale (it is clear) with a dark rim and a bright line
inside the edge, from the edge's refraction, offset from the piece by its
thickness along the light.

## Build, behind ?try=broken (all of it previews until Ony approves)

1. **Tilts from the dent** (`fracture.ts`, `crack-photo.ts`): the dish and the
   knock, in degrees; tested (slopes point at the strike, largest near it,
   laminated keeps the dish).
2. **Each piece reflects the room at its own tilt**, per pixel in the glass
   shader (the shard map, `shard-map.ts`; built as `?try=shardlight` in
   b458bd9, now part of ?try=broken).
3. ✅ (2026-10-01, canvas; the shader version is 3b) **Cracks as faces, not
   white lines.** Done in the break's own layer: each crack's face leans by
   its kind (radial nearly square, concentric ~30 deg, the cone ~60 deg,
   twisted by hackle; `effects/optics/crack-face`, tested) and shows the
   room only as the face really sends your sight to it -- found while
   testing: from the front no face can both reflect totally and send you
   back out the front (inside, your sight is within 41 deg of straight in;
   out again it must be within 41 deg of straight out; a mirror turning it
   that far meets it short of the critical angle), so a face mirrors the
   room by a few per cent at most and the cracks are clear glass until a
   light lines up or pipes to them. Photographed breaks keep the photo's
   crack SHAPE only (shade where the gap turns light away, the lamps' light
   on it), not its white pixels. Earlier plan: the map carries each crack's band
   (its lean through the thickness, so its width) and the shader draws it as a
   TIR mirror -- dark-clear, flashing with the lamp and the room only where
   they line up -- tinted by the glass's own green. The white canvas strokes
   and the photographed crack layer go.
4. ✅ (2026-10-02) **Cracks down the side faces** at their lean. A crack
   that reaches the edge cuts the side face from the front arris to the
   back one, along the line where its fracture face and the side cross
   (`effects/optics/crack-side`, tested): straight across for a square
   radial crack, slanting along the edge by the thickness times the tangent
   of its lean for the concentric cracks and the cone's walls. It shows
   only on the side faces you can see (edge-side `sideWidth`), projected
   the same way, as the gap's dark line with the piped light leaving
   through it beside it. Photographed breaks: where the photo's cracks
   cross the border, taken as radial (the photo gives no lean).
5. **The light under it**: crack lines in the floor light (dark line, bright
   seam, offset across the gap), each piece's patch shifted by its tilt.
6. **Taking pieces out**: a list of missing pieces per break, the hammer's
   hard swing and a click with the hammer in the lab to knock one out; holes as
   above.
7. **Pieces on the floor**: a knocked-out piece falls and lies on the
   photograph below, drawn as above.
