# The flashlight (item 25i)

Ony's ask (2026-09-30): another cursor tool, a flashlight. Press and hold, and
it stays where it was pressed and points wherever the pointer goes, shining a
beam that way and lighting whatever responds to light.

## What a flashlight is, optically

A torch is not a bare lamp. Its reflector gathers the LED's light into a
**hotspot** a few degrees across. The light the reflector misses leaves as a
wide, dim **spill** that has a visible edge where the reflector's lip cuts it
off. Flashlight people call a hotspot under about 10° across "throwy", and a
true "flood" is 60–120° of spill ([Candle Power Forums, "Beam Angles"](https://candlepowerforums.com/threads/beam-angles.326596/)).
Beam profiles are modelled as super-Gaussians: flat on top, with steep sides
([Map of Flashlights, model description](https://sites.google.com/view/map-of-flashlights/description)).

The model (`src/effects/light/beam.ts`):

    I(θ) = I0 · [ exp(−ln2 · (θ / 8°)^4)  +  0.07 · cutoff(θ, 32°) ]

- The hotspot is half as bright 8° off the axis.
- The spill is 7% of the centre, out to the reflector's lip at 32°.
- There is nothing past the lip, and nothing behind the torch.

The torch's centre is 3× the lamp's strength: the same light, gathered into a
few degrees. Its colour is a cool white, the colour a white LED's blue pump
gives it. That blue is also why it charges glow paint, as a real LED torch
does (`effects/materials/phosphor`).

## How it joins the scene

- A light may now carry an **aim** (`Light.aim`, a unit vector with z up).
- Every pass that lights a point multiplies each light by `beamFactor` toward
  that point: the glass light (face, rims, the plastic buttons), the floor
  light under the glass, and the glow paint's charging.
- The GLSL twin sits in `LIGHTS_GLSL`, so every light-drawing shader has it. It
  is checked against the TypeScript in a real WebGL context (`e2e/optics`).
- A light with no aim shines all round, so every other light is unchanged.

## The tool

- It is `Flashlight` in the tray (`?try=tools`), `?try=flashlight` to start
  with it, and it is in the lab's tool picker.
- **Moving:** the torch is in your hand over the pointer, pointing straight
  down. It throws a hard round hotspot with a dim spill round it.
- **Press and hold:** it is set down where you pressed. It stays there and
  turns to point at the pointer, and its beam runs across the page that way.
  The beam gets longer, thinner and dimmer as it reaches further (inverse
  square, and the slant).
- **Let go:** it is back in your hand.
- **The drawing:** the torch seen from above. A dark anodised body with a
  knurled grip, the head toward where it points, and the lit rim of its lens.
  It is foreshortened as it tilts. Pointing down, only the round tail cap
  shows.

## Not yet

- The camera's flare from the torch's lens when it points at you.
- The beam's visible shaft in hazy air.
- These can follow once Ony has tried it.
