# Rain and condensation on glass, rebuilt from research: system design

For Ony to approve before any code. Written 2026-10-02 after a third research
pass (`docs/research/2026-10-rain/`, every claim linked there).

---

## 0. What is wrong, and what changes

**Why our drops look like ink.** Compared side by side with real photographs:
real drops are bright, clear lenses. Each holds a sharp upside-down picture
of what is behind it, with a thin dark edge and tiny sparkles. A drop
transmits about 94% of the light
([Garg & Nayar](https://cave.cs.columbia.edu/Statics/publications/pdfs/Garg_IJCV07.pdf)).
Ours are dark, teal, opaque-looking beads with a white outline, among
hundreds of dark dots. The causes, most important first:

1. **Frosted glass lit from the front.** A lit frosted pane glows; a wet spot
   is clear, so it shows the dimmer picture behind. Wet spots on lit frosted
   glass are darker than the frost around them: that part is real physics.
   Your reference photos are all rain on **clear** glass.
2. **Every drop is filled with the average colour of half the photo.** The
   drop lens images a scene 900 px behind the glass, so the picture inside a
   drop is shrunk 25–140×, and the texture lookup averages it into one muddy
   colour.
3. **No bright points.** In a real photo a street lamp is hundreds of times
   brighter than its surroundings, so it survives as a sparkle in every drop.
   Our photo tops out at white, so shrinking it leaves murk.
4. **Dye.** The view through the water gets the pane's colour boost and part
   of its dark tint. Real water at drop thickness is colourless.
5. **The uniform bright rim** reads as glass beads. Real rims are mostly thin
   dark lines, bright only on the side facing a light.
6. **Tiny droplets drawn as dark dots** read as ink spatter. Real ones are
   sparkles or near-invisible.
7. **No light goes through the drops.** Nothing is focused onto the picture,
   so drops never glow near the lamp.

**What the research found.** The best foundation is the architecture of ATI's
ToyShop rain (Tatarchuk & Isidoro 2006), built on the classic Kaneda water
simulation. It keeps a grid of water and "wetness" on the GPU, and it is the
only published real-time design that throws each drop's **shadow with a
focused bright spot** onto the scene behind ("If the droplet mass is large
enough, we render a pseudo-caustic highlight in the middle of the shadow",
checked). We keep our own physical drop particles for the round beads (they
already follow the measured sliding physics), add the grids for everything
continuous, and drive both the view and the light from one water height
field.

---

## 1. Requirements

### 1.1 What it must do

| # | You asked for | What it means here |
|---|---|---|
| R1 | "photorealistic" | Checked side by side with 96 reference photos by category, and against Mitsuba 3 renders. |
| R2 | "refract, reflect, magnify, deform-the-image-behind-the-glass correctly" | Each drop is a real lens at the real distance to the picture: upside down, shrunk 2–8× for beads, magnified for big flat drops; rims and reflections from the optics only. |
| R3 | "the color looks like ink not water" | Water is colourless: the picture through a drop is the picture, sharp, with its bright points. |
| R4 | "react to light realistically" | Glints from every lamp; the TIR edge lit only where it faces a light; drops glow over their own focused light. |
| R5 | "get heavier, and then drip and leave a clear wet trail... also clears the other rain drops" | Drops grow by rain and merging until they reach the measured sliding size (about 17 µL, measured on car side-window glass), then run, sweep up every drop in their path, and leave a clean track, a thin film or a line of tiny beads, depending on speed. Later drops follow old tracks. |
| R6 | "a condensation option... for steamed up windows that interact with the rain" | Fog grows by the measured breath-figure laws, beads grow out of it and run, runners clear bare belts that fog again finer; fingers and wipes clear it. Fog and rain on the same face interact; on opposite faces fog veils the rain. |
| R7 | "utilize the shadow and light systems already built" | One water height field feeds the existing floor-light and caster passes. Every lamp lights the water and gets its shadows. |
| R8 | "light passing thru the rain drops... shadows at the bends... brighter focus lines... the unique effect water has" | Each drop throws a dark ring with a focused bright core when the picture is near its focus, a soft dark spot when it's far; rivulets act as cylinder lenses and throw bright focus lines that wiggle as they run; a running film throws moving caustic networks. |
| R9 | "if I missed anything" | Wind pushing runners; splashes and satellite drops; water collecting and dripping from the bottom edge; dirt pinning drops and marking trails; dried water spots; the wet glass reflecting the room differently; drizzle vs downpour regimes with real rates. |

### 1.2 How well

- Same as the glass: photoreal and measured; inside the single WebGL1 context;
  60 frames a second on a desktop (fields at half resolution); only free code.

---

## 2. How the parts fit

```
            PARTICLES (beads)                      GPU FIELDS (½ resolution per pane)
   ┌──────────────────────────────┐     ┌──────────────────────────────────────────────┐
   │ sim.ts (already ours):       │     │ film / wetness: deposited by fast runners,   │
   │ landing, growth, merging,    │◀───▶│   dries in seconds–minutes, dewets into beads,│
   │ Furmidge sliding, pinning,   │     │   attracts later drops                        │
   │ wind; shapes from measured   │     │ fog: coverage, droplet size, age (Beysens);   │
   │ drop outlines                │     │   swept by runners, re-fogs finer             │
   └──────────────┬───────────────┘     │ micro-droplets: trails, residue               │
                  │                      └───────────────────┬──────────────────────────┘
                  ▼                                          ▼
          ┌────────────────────────────────────────────────────────────┐
          │                 ONE WATER HEIGHT FIELD                     │
          └───────────────┬───────────────────────────────┬────────────┘
                          ▼                               ▼
          ┌───────────────────────────────┐   ┌─────────────────────────────────────┐
          │ VIEW (water layer)            │   │ LIGHT (floor-light pass + casters)  │
          │ lens at the true distance,    │   │ per-drop shadow + focused core      │
          │ sharp lookup, bright points,  │   │ (precomputed profiles); rivulet     │
          │ physical rims, glints, fog    │   │ focus lines; film caustic networks  │
          │ blur with a sharp share       │   │ read back so drops glow             │
          └───────────────────────────────┘   └─────────────────────────────────────┘
```

---

## 3. The parts in detail

### 3.1 The view through the water (fixes the ink first)

- **One distance to the picture**, shared with the glass and the floor light
  (decision D2). At the pane's gap each bead shows a small upside-down patch of
  the picture right behind it; big flat drops magnify.
- **A sharp lookup**: the texture level picked from the drop's true
  footprint, so the picture in a drop stays sharp instead of averaging to mud.
- **Bright points through the lens**: the photo's bright spots (the existing
  photo emitters) are carried through each drop's lens at their real
  brightness, so every drop sparkles with the scene's lights.
- **No dye**: the picture through water exactly as through clear glass, less
  about 5% reflection.
- **Rims from the optics only**: total internal reflection where the surface
  is steeper than 48.6° (only drops with contact angles over 48.6° have it:
  none at 45°, the outer 13% of the radius at 60°), lit by whatever the
  reflected ray meets, so dark in a dim room and bright where a lamp lines up.
- **Tiny droplets** as sparkles and faint edges, never dark discs.

### 3.2 Light through the water

- **Per-drop profiles**, ray-traced once offline: for each drop shape and
  distance, the dark TIR ring, the focused core and the halo, conserving
  energy. Drawn as one small sprite per drop per lamp in the floor-light pass,
  at the position the lamp's ray through the drop reaches the picture, blurred
  by the lamp's size (so a bulb gives soft smudges and the Point preset gives
  crisp rings, as in reality).
- **Rivulets and film**: their curvature adds to the existing caustic
  calculation, giving bright focus lines and moving networks.
- **Drops glow**: the water layer reads the lit picture where each lens lands,
  so a drop over its own focused light glows, like a cat's eye.

### 3.3 The fields: trails, film and condensation

- **Film**: a runner faster than the speed its edge can recede (about 2–18
  cm/s depending on the glass) leaves a film; slower ones leave a clean track
  or a line of tiny beads. Films dry in seconds to minutes (minutes during
  rain), then break into tiny droplets. Wet tracks lower the pinning, so later
  drops follow them.
- **Fog**: coverage rises to its measured limit (about 55%), droplets grow
  slowly while separate, then faster once they merge; beads that pass about
  2–3 mm run and clear a bare belt that fogs again with a finer generation.
  The look follows measurements: over 80% of the light scattered, a sharp share
  through the gaps between droplets, a blur radius set by the gap, more
  whiteness for beaded droplets. Lights behind fog become glowing halos.
- **Wipes and fingers** clear the fog and leave a residue that fogs back
  differently (fewer, larger, clearer drops).

### 3.4 Shapes and dynamics

- **Drop outlines and profiles from measurements**
  ([ElSherbini & Jacobi 2004](https://www.sciencedirect.com/science/article/abs/pii/S0021979703011688)):
  contact angle varying around the drop, elliptical outline stretching with
  size, each profile two circles.
- **Rain regimes with real numbers**: drop sizes and arrival rates from
  drizzle to downpour, more on the windward top of the pane.
- **Splashes** with satellite droplets when wind-driven drops hit hard.
- **Wind** pushing runners sideways; **dripping** from the bottom edge.
- **Statistics check**: in steady light rain the sizes of runner "avalanches"
  should follow a power law (Plourde, Nori & Bretz 1993).

### 3.5 Ony's notes from the references (2026-10-02), as work items

Ony, on the W1/W2 renders against six reference photographs: "still lacking
the kind of variety of shapes you'd see on a window"; "a lot of almost
perfect ovals"; streams "never in a straight line", that "zig zag" where
"surface tension pulls them one way or another"; "lines in the negative
space"; "raindrops in sort of a dotted line ... when a stream runs down the
glass and leaves that dotted trail behind it"; "weird shapes that aren't
even circles at all"; "little streams have really long tails that can
separate randomly"; "some spaces have a lot less raindrops while other areas
are more concentrated. It depends on how heavy the rain is"; drops "blend
into the background" too much; more light on the drops from the lamp?; and
light from the drops "cast on the glass pane or even back out into other
rain drops". Each becomes a physical behaviour, not noise:

| Item | Physics | Where |
|---|---|---|
| No ovals; hanging shapes | a sessile drop on a vertical pane: round cap below ~1 mm; above that gravity sags it -- rounder, wider bottom at the advancing angle, narrower top at the receding angle (the two-circle profile above); big ones irregular from merging | W4, the bead outlines |
| Merged blobs | two drops that touch coalesce into one with a waist that relaxes over ~100 ms; three or more leave a lobed outline until they relax | W4, the particle merge |
| Meandering streams | a runner steers toward the drops it touches (each capture pulls its path sideways), so it zig-zags; it never runs straight | W3/W4, the runner's step |
| Dotted trails | a runner's tail thins and breaks into beads (Rayleigh-Plateau pinch-off); the beads stay as a line of small drops the width of the trail | W3, the trail field + spawned beads |
| Long tails that part | the same pinch-off further up: a tail detaches from its runner and is left as a short stationary rivulet | W3 |
| Lines in the negative space | the clear lanes a runner wipes, which later drops avoid filling for a while (the film there is thinner) -- the trail field as it stands, kept longer | W3 |
| Patchy density | a slow spatial density field (sheltered strips, the windward top) times rain strength; clusters and bare patches | W4, arrival |
| Drops that stand out | a sharper picture inside the drop than the pane's frost shows (lens LOD below the frost's), a crisp rim at the contact line (TIR past 48 degrees), and a specular highlight of the lamp or sky | W1 fix, the compose pass |
| Lamp on the drops | the lamp's glint on the near side and its bright focus inside; brighter the closer it is | W2 fix |
| Light onto the pane and other drops | a drop's lens lands on the pane's own surface (film, fog, grime) and on neighbouring drops, not only on the print: the lens map sampled at the pane plane by the surface layers, and by the drops themselves | W2/W3 |
| Copy on the glass (toggle) | type at standoff 0: one shadow (the lamp's, through the glass onto the print); the water layer over the letters, magnifying them -- the letters rasterised into what the drops look through | new, the compositor |
| Speed | measured on Ony's machine with `?perf=1`, not estimated here | W5 |

---

## 4. Cost

- Fields at half resolution per pane, ping-ponged on the GPU: under 1 ms on a
  desktop (estimate, to measure).
- One sprite per drop per lamp in the floor pass (hundreds of drops).
- Quality tiers: phones skip the fog dynamics and the light sprites first.

## 5. Trade-offs

| Choice | Picked | Instead of | Why | Cost |
|---|---|---|---|---|
| Foundation | particles + GPU fields (ToyShop + ours) | particles + static textures (what we have) | only design that couples rain to light and shadow; trails and fog become living state | more passes |
| Bead shapes | particles with measured outlines | height field only | height fields alone make blobby drops | two systems to keep in step |
| Caustics | precomputed per-drop profiles | the existing curvature formula | the formula fails for beads, whose bending exceeds their size | one lookup texture |
| Fog | physics fields | a blur texture | interaction with runners and wipes | a field update per frame |

## 6. Build order

| Step | What | What you'll see |
|---|---|---|
| W1 | View fixes (§3.1) | clear, bright drops with sharp upside-down pictures and sparkles: the ink gone |
| W2 | Light through water (§3.2) | drop shadows with bright cores, rivulet focus lines, drops glowing near the lamp |
| W3 | Fields (§3.3) | clean trails that later drops follow; steamed glass that runners clear and that fogs back |
| W4 | Shapes and dynamics (§3.4) | measured drop shapes, wind, splashes, dripping |
| W5 | Calibration | side by side with the references and Mitsuba |

## 7. Decisions for you

1. **Clear or frosted glass for rain.** On clear glass, drops are the bright
   lenses in your references. On frosted glass lit from the front, wet spots
   are physically darker than the glowing frost. Recommendation: rain panes
   use clear glass (a preset), and frosted panes keep the physically dark wet
   spots.
2. **How far behind the glass the picture is.** One distance for everything.
   Recommended: a print right behind the glass (the pane's gap), so drops show
   the picture just behind them, magnified or shrunk, and throw visible
   shadows and focus spots. The alternative is a world far outside, where
   every drop holds a tiny fisheye of the whole scene but throws almost no
   shadow.

## 8. What to revisit

- A full thin-film water simulation on the GPU if the fields look too simple.
- Double glazing (two panes, rain outside, fog between).
- Coatings: water-repellent (round fast beads) and self-cleaning (sheets).

---

## 9. Fit with the engine as built (checked 2026-10-02)

| Existing piece | What it does today | In the new system |
|---|---|---|
| `effects/water/sim.ts` (`DropSim`), `liquids.ts`, `rain-types.ts`, `rain.ts`, `spray.ts` | drops landing, growing, merging, Furmidge sliding, pinning, evaporation; blood and slime; rain regimes | **kept as the bead system**. The fields (§3.3) read its drops; its sliding threshold already is the measured one. |
| `WaterDrops.tsx`: the drops map, droplet map, wet map, wipe pass, fade pass | per-pane GPU maps of water height and wetness | **kept and extended**: the wet map becomes the film field, a fog map exists already; the velocity field is the one new map. |
| `effects/water/water.glsl.ts` (compose pass) + `lens.ts` (its JS twin, tested) | the view through each drop | **kept**; W1 corrects it (one picture distance, sharp lookup, lights through the lens, no dye) rather than replacing it. |
| `effects/light/lights.ts`, `PhotoLights.tsx`, `photo-emitters.ts` | lamps and the photographs' own lights | **reused**: the water reads both; W1 carries the photographs' lights through each lens. |
| `FloorLight.tsx`, `casters.ts`, `shape-casters.ts` | light and shadows on the photograph under the glass | **reused** for W2: each drop's shadow and focused core is a caster with a precomputed profile; rivulets add to the existing caustic term. |
| `GlassLight.tsx` | the frost's glow and the pane's reflection | **reused**: a wet spot subtracts the frost's scatter where the film map says the etch is filled. |
| `effects/materials/pane-causes.ts` | frost, gap, thickness per pane | **used**: the water takes the pane's gap and frost from here (W1), so rain works on clear and frosted glass by the same physics. |
| `effects/engine/compositor.ts` | `pane:water` last | **unchanged**. |
| `effects/engine/quality.ts`, `perf.ts` | tiers and pass timing | **used** for §10. |
| `effects/light/camera-match.ts` | the photographs' highlight shoulder and grain | **reused** for glints and sparkles. |

New: `effects/water/fields.ts` + `fields.glsl.ts` (film, velocity, fog ping-pong
updates), `drop-caustic.ts` (the offline-traced shadow profiles as a LUT) and
its sprite pass, `fog.ts` (Beysens growth laws, pure, tested).

## 10. Quality tiers (web speed)

| Tier | View | Light through water | Fields | Beads |
|---|---|---|---|---|
| full | 4 samples a pixel, sharp lookup, lights through lenses, exact Fresnel rims | per-drop shadow sprites per lamp, rivulet focus lines, read-back glow | film, velocity, fog at half resolution | the full count |
| lite | 1 sample a pixel, same optics | shadows for the largest drops only | film and fog; no velocity field | two thirds |
| minimal | 1 sample, no room reflection in drops | none | film only, no fog dynamics (a static fog texture) | half, no droplet map |

The water pass already steps down on slow frames (`perf.ts`); the fields are
updated every other frame on lite.

## 11. Knobs (visual preferences, as causes)

| Knob | Cause | Exists? |
|---|---|---|
| Rain type and strength | drop sizes and arrival rate | yes |
| Frost | clear or frosted glass; the water clears the etch where it lies | yes (`glassBlur` → pane causes) |
| Rain lands on | near or far face | yes (`rainFace`) |
| Glass height | the picture's distance behind the drops (lens scale, shadow spread) | yes (`floorGap`) |
| Glass thickness | the slab the sight crosses | yes |
| Condensation amount and side | fog | yes |
| Wind | pushes runners, splashes | new |
| Glass cleanliness | contact angles (clean 20–40°, dirty 50–70°), so bead shape and when they run | new (a cause; replaces any "drop roundness" result) |
| Drying time | film and fog clearing (room humidity) | new |
| Playback speed | real time by default; slow motion as a preference | new |
| Bead count cap | speed only | tier table |

Not knobs: drop brightness, rim strength, sparkle size, fog whiteness. All
follow from the causes above and the optics.

## 12. Components for the library (later)

- **DropSim** (exists): pure particle physics, tested.
- **WaterFields**: GPU film / velocity / fog updates as a self-contained pass with its own GLSL; input the drops map, output three maps.
- **WaterView** GLSL chunk + uniform layout; `lens.ts` is its tested JS twin.
- **DropCaustic**: the offline tracer (`calc/drop_caustic.py`), the LUT, and the sprite pass for any floor-light caster.
- **Fog**: pure growth laws.
- **WaterDrops** React wrapper: thin wiring to a pane.

## 13. Double-check: does this reach AAA photoreal?

| What the best work does | Here |
|---|---|
| Drops as true lenses of the scene behind, upside down and sharp (offline renders; the best car games) | exact per-pixel refraction through cap-shaped drops at the real distance, sharp lookup, with the scene's lights at their brightness |
| Fresnel and total internal reflection rims from the physics | exact Fresnel both ways; TIR only where the slope passes 48.6°, as measured drops show |
| Trails, film and merging as living state (ToyShop, Driveclub) | particle beads plus film, velocity and fog fields |
| Light through water onto what is behind (caustics) | per-drop shadow + focused core profiles from a ray tracer, rivulet focus lines, film caustic networks, read back so drops glow |
| Condensation that reacts | Beysens growth laws, sweeping, re-fogging, wipes |
| Calibrated, not eyeballed | Mitsuba 3 renders of the same setup (done for the rim; repeated at each step) and the 96 photographs by category |

Known gaps: (1) wind-blown spray as a volumetric effect is out of scope (drops
and splashes only); (2) water sheets over the whole pane (a downpour) are the
film field at full coverage, not a free-surface fluid solve: §8 lists the
upgrade if it is wanted.
