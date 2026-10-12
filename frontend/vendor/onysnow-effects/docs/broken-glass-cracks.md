# Broken glass: cracks from real references (item 10, revision)

Ony, 2026-09-30: "use real cracks as reference — it's not realistic enough."

## What real impact cracks do (sources)

- **Concentric cracks are not rings.** They are "usually in straight segments that
  terminate in an existing radial crack" (SWGMAT, *Glass Fractures*). Each one spans
  only the gap between two neighbouring radials, and neighbouring segments don't line up,
  so the "ring" is staggered. They form when the pane is held round its edge.
- **Later cracks stop at earlier ones.** "The cracks caused by a subsequent impact
  terminate at previously formed cracks" (SWGMAT). The same holds within one break: a
  crack that runs into another stops there, at a T-junction.
- **More energy, more radials.** "The numbers of radial cracks have been found to be
  proportional to the kinetic energy of the projectile" (Bradt, *The Fractography and
  Crack Patterns of Broken Glass*, J. Fail. Anal. Prev. 2011). A hammer blow gives a
  dense star.
- **Radials fork as they run.** A crack branches once it is past its mirror and mist
  zone. Under uniaxial stress the branch angle is 30–45°; under biaxial tension (a
  pane bent by an impact) it is larger (Quinn, *On crack branching angles in glasses
  and ceramics*, J. Eur. Ceram. Soc. 2019). Higher stress means shorter runs between
  forks ("crow's feet"; Bradt 2011).
- **The radials are a fan.** Radials growing side by side repel each other, which
  suppresses further branching into a fan (Quinn et al., *On radial, circumferential,
  and spiral cracks in fractured glass plates*).
- **The impact is crushed.** There is a white, pulverised spot with a cone under it,
  and at a hard hit the smallest pieces fall out and leave a hole (SWGMAT;
  reference photos).
- **What a crack looks like** (reference photos): a thin line that is mostly bright,
  silver to glass-green, because the new fracture face reflects the room. Its width
  and brightness change along its length, because the face leans in and out of
  square with the pane (twist hackle). It is whiter and rougher near the impact, and
  it turns to meet the frame nearly square.

## What was wrong

- The rings were smooth, continuous closed curves (one to three of them).
- There were too few radials (5–14), all running to the frame, with no forks.
- The cracks were drawn as uniform dark grey lines, and every shared edge was drawn
  twice.
- The impact was a starburst sparkle rather than a crushed spot, and nothing fell out.

## The model now (effects/optics/fracture)

1. **Crushed spot.** An irregular disc whose radius grows with energy. The primary
   radials start on its rim.
2. **Radials.** There are 8 + 30E of them. They grow together, step by step, as
   correlated random walks: nearly straight, with small kinks.
   - A crack that meets another crack stops there, making a T-junction. Nothing
     crosses.
   - A crack that nears the frame turns to meet it square.
   - Past the mirror radius, each crack forks at a mean spacing that shortens with
     energy. The fork angle is 30–60° in total, the biaxial case.
3. **Concentric chords.** They sit at radii whose spacing grows outwards.
   - Each chord joins one radial to its neighbour. Its radius is jittered per chord,
     so the chords are staggered, and each bows slightly outward, between straight
     and a circular arc.
   - Chords are denser near the impact.
   - Laminated glass gets many rings and almost every chord.
4. **Planar graph.** The shards are the faces of the crack graph. Dangling crack tips
   are drawn but don't separate pieces. At a hard hit, small central shards go missing.
5. **Tempered glass** is unchanged: 1 cm dice.

## Drawing (components/site/BrokenGlass)

Each crack is drawn once, as a ribbon: the fracture face seen through the glass.

- The face's lean varies along the crack, so the ribbon's width, and which side it
  falls on, varies too.
- The ribbon is lit by the room at all times, tinted the glass's edge green, and
  whiter where the face is mist and hackle.
- When the lamp is on, the same face flashes by total internal reflection, now using
  the leaning normal, so the flash comes in patches.
- A dark hairline runs along the ribbon's air gap.
- Holes show the photograph sharp, not frosted, and are rimmed by their full faces.
