# Research plan

Ony, 2026-10-01: "create a list of all the research that needs to be done and
what needs to come of that research and for what tasks ... You need to have
sources for every claim and decision ... prioritize research and searching for
tools/plugins/etc to cover any gaps in capabilities ... and only if there isn't
anything or it's not help do we start from scratch."

## Rules for every research item

1. **Tools first.** Before any physics or rendering research, search for
   existing libraries, plugins, shaders, demos and papers with code that
   already do the job. Record each candidate: link, licence, size, WebGL1/2 or
   WebGPU, last update, what it covers, what it lacks. Decide **adopt**,
   **port** (take the logic, not the package), or **build**. Build only when
   nothing usable exists, and say why.
2. **Licences.** Free and permissive only (MIT, BSD, Apache-2.0, ISC, CC0,
   Unlicense). Nothing paid. GPL and non-commercial (CC BY-NC, Shadertoy
   default) are read-for-ideas only, never copied.
3. **Sources for everything.** Every factual claim has a link. Every decision
   names the sources it rests on. Anything not from a source is marked
   **(estimate)** or **(computed)** with how it was worked out.
4. **Answer the questions asked.** Each item lists the questions it must
   answer and what it must produce. Research that doesn't feed a listed task
   is out of scope.
5. **Reference images.** Each visual item collects real photographs (links)
   to check the result against side by side.
6. **Output:** a doc in `docs/research/` (and the project), ending in a
   "Decisions" section: what we adopt/port/build, the numbers to use, the
   lab controls to expose, and what is still unknown.

## Build status (2026-10-01)

First cuts built from the research, all behind `?try=`: shadows parts 1-2 and the puppet stage (R6), water drops steps 1-4 (R2), the spray bottle (R3), balloons (R9), the spider web (R10), the torch (R7), fireworks (R8). Not started: broken glass (R5, parked), slime cube (R12), gems (R11), water surfaces (R4). Each research doc ends with its own status.

## Priority order

| # | Research | Feeds tasks | Status |
|---|---|---|---|
| R0 | Capability gaps and tools survey (all tasks) | all | done: tools-survey.md |
| R6 | Shadows good enough for a shadow puppet show | 83, 52, every light | done: shadows.md |
| R2 | Water drops: follow-up (raindrop-fx port, perf) | 77, 76 | first pass + port plan done (water-drops.md §7) |
| R1 | Black light: calibration against real photos | 73 | first pass + calibration done (uv-blacklight.md R1) |
| R5 | Broken glass: follow-up (three-pinata fit, physics) | 84 | first pass + build plan done (glass-fracture.md R5) |
| R7 | Flame and torch light | 82 | done: flame.md |
| R9 | Balloons | 74 | done: balloons.md |
| R10 | Spider webs | 75 | done: spider-webs.md |
| R3 | Other liquids and the spray bottle | 76 | done: liquids-spray.md |
| R12 | Jello / slime cube | 80 | done: slime.md |
| R11 | Fire opal, quartz, crystals | 79 | done: gems.md |
| R8 | Fireworks | 81 | done: fireworks.md |
| R4 | Water surfaces | 78 | done: water-surfaces.md |

## The items

### R0. Capability gaps and tools survey (first)

- **Why:** stop building from zero what someone has already built.
- **Questions:**
  - What capabilities do the tasks need that the engine lacks? (rigid-body
    physics, soft bodies, ropes/cloth, particles, fluid sim on a surface,
    post-processing bloom, area-light shadows, GPU text/glyph masks,
    procedural noise, HDR pipeline.)
  - For each: which existing libraries, shader collections, demos and
    papers-with-code cover it? Licence, size, WebGL version, maintenance,
    performance numbers, fit with our WebGL1 shared context and CSS layers.
  - Can one physics engine serve shards, balloons, webs, slime and
    fireworks (Rapier, cannon-es, matter.js, oimo, a small verlet/PBD of our
    own)? Which?
- **Output:** `docs/research/tools-survey.md`: a capability-by-capability
  table with candidates and an adopt/port/build decision each, sourced.
- **Done when:** every task 74–84 has its tool decision.

### R6. Shadows good enough for a shadow puppet show

- **Feeds:** 83 (shadow puppets), 52 (sheen and shadows from every light),
  every caster on the site.
- **Questions:**
  - What does a real shadow puppet show look like? (Light source type and
    size, screen material, how the penumbra grows with the puppet's
    distance from the screen, coloured/translucent puppets, multiple
    lights.) Reference photos.
  - Physically: penumbra and umbra from an area light (sizes, formulas),
    contact hardening, light falling off with distance, shadows through
    translucent and coloured objects, shadows from several lights adding.
  - Existing real-time techniques and code for the web: PCSS, SDF
    shadows, 2D shadow casting libraries, radiance cascades (2D global
    illumination), screen-space shadows; which fit our mask-based floor
    light, and at what cost.
  - What is wrong or missing in our current model (the caster mask, the
    13-tap disc sampling, per-light loop)? Check it against the formulas.
- **Output:** `docs/research/shadows.md` with a decision: keep, extend or
  replace the caster model; the numbers; the tests to prove it.

### R2. Water drops: follow-up

- **Already done:** `docs/research/water-drops.md` (physics, optics, prior
  art).
- **Still to answer:** read raindrop-fx's source (MIT): can its simulation
  be ported to our WebGL1 engine, and which parts? Real numbers for mobile
  cost. Reference photos of drops on a window in front of a lit scene.
- **Output:** a port plan appended to the doc.

### R1. Black light: calibration

- **Already done:** `docs/research/uv-blacklight.md` (48 sources).
- **Still to answer:** the ink-blocking weights are estimates; find photos
  of printed photographs (inkjet, RC, magazine) under a black light and
  measure what glows. Find measured relative brightness of brighteners vs
  day-glo vs uranium glass. Confirm how phone cameras record 365 vs 395 nm.
- **Output:** calibrated values with sources replacing the estimates.

### R5. Broken glass: follow-up

- **Already done:** `docs/research/glass-fracture.md`.
- **Still to answer:** three-pinata's API against our existing fracture
  generator; Rapier vs hand-rolled falling; the star-crack paper (radial
  count vs impact speed).
- **Output:** a build plan appended to the doc.

### R7. Flame and torch light

- **Feeds:** 82 (torch cursor), and the road flare already built.
- **Questions:** measured flame flicker (frequencies, amplitude, how wind
  changes it), colour temperature of wood/torch flames, how a flame lights
  a room (soft, moving shadows), existing web fire shaders and flame sprite
  libraries (licences), photo-derived flame footage we may use.
- **Output:** `docs/research/flame.md`.

### R9. Balloons

- **Feeds:** 74.
- **Questions:** latex optics (translucency, how stretching thins and
  lightens it, specular sheen, the bright rim), helium/air balloon motion,
  the string, how a balloon pops (tear speed, shreds) with reference video
  stills, which latex colours fluoresce under UV, existing web balloon
  demos and physics libraries.
- **Output:** `docs/research/balloons.md`.

### R10. Spider webs

- **Feeds:** 75.
- **Questions:** silk optics (thin fibres glint in arcs around the light,
  dew droplets as tiny lenses), web structure (radials, spiral, anchors) to
  generate it, how webs move in air and tear, existing web/verlet/cloth
  libraries and web-generation code.
- **Output:** `docs/research/spider-webs.md`.

### R3. Other liquids and the spray bottle

- **Feeds:** 76.
- **Questions:** trigger sprayer droplet sizes and spray pattern,
  slime/blood/other liquids' viscosity, colour and optics, how they bead or
  smear on glass, existing liquid-on-glass demos.
- **Output:** `docs/research/liquids-spray.md` (done 2026-10-01).

### R12. Jello / slime cube

- **Feeds:** 80.
- **Questions:** soft-body methods for the web (shape matching, position
  based dynamics) and libraries; optics of gelatin/slime (translucent,
  scattering, refraction of objects suspended inside); reference photos.
- **Output:** `docs/research/slime.md`.

### R11. Fire opal, quartz, crystals

- **Feeds:** 79.
- **Questions:** the optics of each (opal play of colour from silica
  sphere diffraction; quartz clarity and birefringence; dispersion,
  internal reflection), real-time gem rendering techniques and code for
  the web (e.g. refraction/dispersion materials, ray-traced gem shaders),
  reference photos.
- **Output:** `docs/research/gems.md`.

### R8. Fireworks

- **Feeds:** 81.
- **Questions:** how shells and stars behave (burst, drag, gravity,
  burn time), colours from chemistry (strontium, barium, copper, sodium),
  trails, crackle, smoke, how a camera records them (long exposure),
  photo-derived approaches, existing libraries (licences).
- **Output:** `docs/research/fireworks.md`.

### R4. Water surfaces

- **Feeds:** 78.
- **Questions:** heightfield ripples, waves, caustics and refraction for the
  web; existing demos and code (licences); how it would share our glass
  optics.
- **Output:** `docs/research/water-surfaces.md`.
