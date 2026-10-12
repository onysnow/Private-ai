# Broken glass, rebuilt from research: system design

For Ony to approve before any code. Written 2026-10-02 after a full research pass
(`docs/research/2026-10-broken-glass/`, every claim linked there).

Glass kinds: **plain window glass** (annealed float) and **laminated** (two glass
plies with a plastic PVB layer between, like a windscreen). **No tempered glass.**

---

## 0. What was wrong, and what changes

**What was wrong.** We hand-rolled a crack generator instead of building on
anyone's work, and it showed:

- The tempered pane was an even honeycomb of polygons. Plain glass never
  breaks like that (the research's "what not to draw" set shows the
  honeycomb is tempered dicing), and you never asked for tempered glass.
- Our pieces were Voronoi-like. Voronoi cells average 6 corners with 3 cracks
  meeting at each point. Real cracks stop against each other in
  T-junctions, which gives pieces averaging 4 corners
  ([Domokos et al.](https://arxiv.org/abs/1912.04628)). That alone makes a
  pattern read as computer-made. It is also why the Houdini, Unreal, Blender,
  three-pinata and Godot tools all look like dartboards.
- The cracks were drawn as lines on the glass. A real crack is a face running
  through the whole thickness. From the front you see that face through the
  glass as a band that folds, shifts or glows. None of that was there.
- Most of the ways broken glass treats light were missing.

**What the research found.**

1. **The best existing system for real crack patterns is physics simulation,
   the way glass researchers do it.** Peridynamics is the method the
   glass-impact literature uses to reproduce real breaks, checked against
   photographs of the actual broken plates (Bobaru's group, 2024; Rivera
   2019; laminated glass, Wu 2020). There is a good free solver:
   **[Peridynamics.jl](https://github.com/kaipartmann/Peridynamics.jl), MIT
   licence** (checked). The runner-up is
   [PeriLab.jl](https://github.com/PeriHub/PeriLab.jl), BSD-3 (checked).
   - It has been **run here, not just read about**. A hammer on a framed 4 mm
     pane gave a crushed centre, radial cracks first, then a ring crack on the
     struck face, in the right order. Each run breaks differently, as real
     glass does.
   - Real breaks really are this varied: 60 identical panes broken under
     controlled conditions gave **no two patterns alike**
     ([NIJ 241445](https://www.ojp.gov/pdffiles1/nij/grants/241445.pdf),
     checked). Laminated glass gave **15 to 112** radial cracks across repeats
     of the same blow ([PLOS ONE 2014](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0098196),
     checked).
2. **No game or open-source shader models how cracks treat light.** They use
   textures and normal maps. So the light has to be ours, built from the optics
   (Fresnel, total internal reflection, thin films), and checked against a
   path-traced ground truth (Mitsuba 3, BSD-3, already installed here).

**The design in one line.** Simulate real breaks offline with Peridynamics.jl
into a library; at a click, place one of them on the pane; render every crack
as a real face inside the glass with the light physics worked out per pixel;
and add the debris, the edges and the light under the glass from the same data.

---

## 1. Requirements

### 1.1 What it must do (your words, then what that means)

| # | You asked for | What it means here |
|---|---|---|
| F1 | "photo realistic drawn from all the references... and more of your research" | Patterns from physics simulation, checked against 203 reference photographs and measured statistics (radial counts, ring bands, piece shapes, T-junctions). Every break different. |
| F2 | "cracks need to go thru the glass pane" | Each crack is a face through the full thickness, with its lean, curl and stepped hackle, seen through the glass from any angle. |
| F3 | "extend all of that to the edges/sides" | Cracks cross the pane's side faces at their lean; each piece's side face carries its own glow and reflection, stepping at each crack; shell-shaped chips along the arris. |
| F4 | "jagged edges that react, refract, reflect, shine" | Crack faces, hole rims and broken edges get the same light physics as the pane's sides: total internal reflection, Fresnel, trapped light glowing out, green on long paths, glints, colour fringes. |
| F5 | "each broken face needs to reflect slightly differently like a broken mirror" | Each piece reflects the room and the lamps at its own tilt; the reflection turns by twice the tilt, so it breaks and jumps between pieces. |
| F6 | "the image behind... would appear fractured as well" | At each crack the picture folds, shifts or is replaced by glowing internal light, depending on the face's lean and where you look from. Holes show the picture sharp. |
| F7 | "needle like shards, sand sized pieces, small rock sized... edges/sides and thru the glass pane not just on it" | Four debris classes, each from its real cause: daggers and needles between radials; chunks where rings cut radials and at the crater; grit and powder from the crushed zone and chipping; spall flakes from the exit-side crater. In the pane, along crack lips, at the edges, through the thickness, and fallen below. |
| F8 | Pieces knocked out, lying on the floor | Loose pieces fall; fallen pieces and grit lie on the photograph and are lit and cast shadows. |
| F9 | Plain **and** laminated | Laminated: light hits break the outer ply only (bullseye, half-moon, star, combination); hard hits break both plies into a held spider web with a white crushed centre; nothing falls but grit at the centre. |
| F10 | "There could be more things I'm missing" | The research's extra list: the lamp's glow cut off at each crack; glints sliding along cracks as you move; steps where pieces sit at different depths; open slots showing the photo sharp; tight crack segments that vanish; rainbow colours in trapped air pockets; wet cracks turning see-through. |

### 1.2 How well it must do it

- **Photoreal.** Checked side by side with the reference photos, by category,
  and against Mitsuba 3 renders of the same scene. Measured, not judged by eye
  alone.
- **Runs in the site.** The single shared WebGL1 context; 60 frames a second on
  a desktop; lighter quality tiers for phones.
- **Licences.** Only MIT, BSD or Apache code goes into the site. GPL tools may run
  offline only (their output is not covered). Nothing paid.
- **Small.** Each stored break about 20 to 60 KB compressed, loaded only when a
  pane is struck.
- **Process.** Behind `?try=broken` until you approve; each step shown to you
  before the next.

---

## 2. How the parts fit

```
 OFFLINE (Linux container; Julia + Python)              IN THE BROWSER
 ┌───────────────────────────────────┐                  ┌──────────────────────────────────────────┐
 │ 1 SIMULATE   Peridynamics.jl (MIT)│                  │ 4 PLACE    pick a break by glass kind,   │
 │   hammer strikes a framed pane:   │                  │   strike energy and where it was struck; │
 │   plain 4–6 mm; laminated         │                  │   map it onto the click; play it in      │
 │   glass / PVB / glass             │                  │   order of arrival (radials, then rings,  │
 │   random strength per run         │                  │   then pieces loosen and fall)           │
 ├───────────────────────────────────┤   break library  ├──────────────────────────────────────────┤
 │ 2 EXTRACT    Python               │ ───────────────▶ │ 5 BAKE     per pane, once per break:     │
 │   crack lines on both faces →     │   JSON in mm,    │   crack field, piece field,              │
 │   lean, curl, arrival time, kind; │   gzipped        │   crack table, piece table,              │
 │   pieces → tilt, slip; crushed    │                  │   film lookup, trapped-light map          │
 │   zone; cone; debris              │                  ├──────────────────────────────────────────┤
 ├───────────────────────────────────┤                  │ 6 RENDER   the passes we already have,   │
 │ 3 CHECK      statistics against   │                  │   extended:                               │
 │   NIJ, PLOS and the photos;       │                  │   • pane view: crack faces, broken       │
 │   Mitsuba 3 ground truth          │                  │     mirror, holes, crushed zone, cone     │
 └───────────────────────────────────┘                  │   • floor light: crack shadows and        │
                                                        │     bright bands, debris shadows          │
                                                        │   • side faces: crack lines, glow steps   │
                                                        │   • debris: grit, needles, chunks         │
                                                        │   • falling and fallen pieces             │
                                                        └──────────────────────────────────────────┘
```

**Why offline.** A physics break takes minutes to an hour to compute; the click
has to answer at once. The library holds dozens of real simulated breaks; each
click picks one and places it. Real glass is also never the same twice, and
neither is the library: different breaks, positions, turns and mirrorings.

---

## 3. The parts in detail

### 3.1 Simulate (offline, `tools/fracture-sim/`)

- **Solver.** Peridynamics.jl, ordinary state-based model (it handles glass's
  Poisson ratio properly; bond-based fixes it at 0.25).
- **Glass.** Soda-lime: E 72 GPa, ν 0.22, density about 2,500 kg/m³; fracture
  energy and strength calibrated (§3.3). Strength random from point to point
  (Weibull), as real glass's strength is set by random flaws. Points jittered,
  never a regular grid (a grid gives kaleidoscope patterns; seen in the LAMMPS
  test).
- **Frame.** A springy glazing bead, not a rigid clamp (the rigid clamp in the
  test made false cracks along the frame line).
- **Hammer.** A separate body with a rounded face, about 2 to 8 m/s; struck at
  the centre, off centre, near an edge and near a corner.
- **Laminated.** Glass / PVB / glass as three point sets; the PVB soft and
  unbreakable. If the solver's handling of the glass–PVB join proves wrong,
  the fallback follows the measured behaviour: the same radials in both plies
  (they overlap, PLOS 2014), circular cracks mainly in the struck ply.
  Light stone hits (bullseye, half-moon, star) are simulated as outer-ply-only
  breaks with a small fast impactor.
- **Library, first version.** Plain glass: 3 strike energies × 4 positions × 2
  random seeds = 24 breaks. Laminated: 3 energies × 2 positions × 2 seeds = 12,
  plus 6 light stone hits. At the pane sizes the site uses.

### 3.2 Extract (offline, Python: numpy, scikit-image, skan; all BSD/MIT)

From each run, for each glass face (struck and back):

- **Crack lines**: the damage, thinned to centre-lines and smoothed to the
  smoothness real cracks have at millimetre scale.
- **Kind**: radial, branch, ring, crushed rim, frame-line.
- **Arrival time** along each crack, for the animation.
- **Lean through the thickness**, from where the same crack sits on the two
  faces. **Where each crack reaches the side faces.**
- **Fracture-face texture zones**: smooth "mirror", hazy "mist", rough
  "hackle", from the stress (Orr's law, σ√r = A). Rough faces only near the
  strike and just before forks.
- **Pieces**, with each one's real tilt and sideways slip from the simulated
  displacements (replacing the hand-made dish).
- **Crushed zone, cone and exit-side crater** (crater base 4–7 plate
  thicknesses wide in 4–6 mm glass, around a much smaller hole).
- **Debris** (§3.7).

Detail below the simulation's resolution (about a millimetre) is added by
rule from the fractography, not invented: gentle waviness; twist-hackle steps
near the face that was compressed; shell-shaped chips along crack lips; tight,
invisible stretches near crack tips.

### 3.3 Check (offline)

Each break must pass before it goes in the library:

- **Statistics against measured breaks** (NIJ's 60 panes, PLOS's laminated
  plates): radial counts and their spread; ring bands 6–15 plate thicknesses
  out, only for harder blows; piece areas and how elongated they are (25–29% of
  pieces over 8:1 in dense breaks); T-junction share; average piece corners
  near 4, not 6.
- **Side by side** with the reference photographs in the same category.
- **Light**: Mitsuba 3 renders of a cracked slab at the site's camera and
  lamp, compared with the site.

**Built (B0–B1, 2026-10-02/03, `tools/fracture-sim`, `public/breaks`):** 14
plain breaks at 1 mm points -- ten 100 mm panes (hammer at 6.5–16 m/s, a stone,
and two pressed) and four full-size 203 mm panes, all framed, each measured as
the NIJ panes were (crossings, pieces, junctions, corners, the fragment-size
law). What the pressed panes taught: the simulated glass fails at about a fifth
of real glass's strain (the horizon sets the critical stretch), so a pane
pressed to failure stores a 27th of the real energy and webs sparsely. A
point-load pre-bend puts the missing energy in and gives a dense centre web
with radials to the corners (plain-203-pressed-c); bent further the pane dices
into diagonal ladders, like tempered glass. A press driven at a fixed speed
(`impactor=ram`) grows the web generation by generation on a 100 mm pane
(plain-100-pressed-k) but at full size the long hinged pieces follow the ram
without cracking again. The NIJ pressed density (178 pieces) at full size is
still to find; a shallow bowl under the point-load bend is the next try.

### 3.4 Place and animate (browser, `effects/optics/fracture-library.ts`)

- Returns the same `Fracture` type the current code uses, plus per-crack lean,
  arrival time, ply and texture zone, and a debris list. So the existing shard
  map and side-face code keep working while the new renderer replaces the old
  drawing.
- Picks a break by glass kind, strike energy (how long the hammer was held),
  and position class; maps it onto the click point; mirrors or turns it where
  the frame allows; scales millimetres to pixels (about 4 px per mm).
- **Animation**: cracks arrive in their simulated order, slowed about a
  thousand times (real cracks run at about 1.5 km/s): back-face radials, then
  struck-face radials, then rings, then pieces loosen and fall.
- The current procedural generator stays only as a fallback for pane shapes
  the library doesn't cover, re-tuned to the measured statistics. The tempered
  option is removed.

### 3.5 Render: the pane (the main new work)

Per pixel, in the pane's fragment shader. The view ray enters the glass and is
intersected exactly with the nearby crack faces (each a surface through the
thickness with its lean). What the pixel shows then follows from the optics:

| The crack face... | You see | Why |
|---|---|---|
| nearly square to the glass (most radials) | the photo strip beside the crack, **mirrored** (a fold), in a band that widens as you look from the side | total internal reflection; any face within 7.7° of square is a perfect mirror for every ray entering the front |
| leaning 5–20° | the photo **shifted** 3–35 px | reflection sends the ray out the back at an angle |
| leaning about 20–49° | **light inside the glass**, glowing like the pane's edge | the reflected ray is trapped in the glass |
| leaning more (the cone) | the photo, dimmed and milky | partial reflection, rough face |

- Band width is `t·|tan β − tan θ|` (thickness, lean, view angle): zero
  straight on, up to about 20 px at an angle. So cracks appear, widen and
  change as you move, as real ones do.
- **Broken mirror**: each piece's own tilt sets its reflection of the room and
  the lamps.
- **Holes**: the photo sharp and unfrosted; the rims are fracture faces seen
  from the air at grazing angles, so they are bright mirrors (40–90%) and glow
  with trapped light.
- **Crushed zone**: white, opaque, sparkling (light bouncing among countless
  tiny pieces).
- **Cone and crater**: milky walls; the crater bends the photo like a ring
  lens.
- **Tight crack segments** fade out; trapped air pockets show rainbow colours
  at certain angles (one small lookup table covers both, from the thin-film
  formula).
- **Laminated**: two crack layers, one per ply, at their own depths, so every
  crack shows doubled with 1.5–6 px of parallax; the PVB itself is invisible
  (same refractive index).

Data per pane: a crack field (the nearest crack segments per pixel), a piece
field, a table of crack segments (ends, lean, curl, gap, roughness, ply), a
table of pieces (tilt, depth, loose or missing), the thin-film lookup, and the
trapped-light map. Estimated cost: about 2 extra texture reads per pixel away
from cracks; 7–9 inside crack bands (5–20% of a broken pane). To be measured.

**Built (B2, 2026-10-02, `?try=breaklib`):** `effects/optics/crack-field`
(the field and the segment table, RGBA8, tested) and `effects/optics/crack-view`
(the pass, on the shared context, drawn under the 2D strokes). The fold, the
room out of the front face, and the trapped glow (room mean and lamps, rolled
off, rippled by Wallner lines and hackle) are in; the Fresnel share and the
exact band width too, and each crack's depth: a simulated break's cracks
start on the back face and not all reach the front (Ony, 2026-10-02: "lots
of the cracks don't go all the way thru" -- some really don't), so a
one-face crack is met only in its part of the thickness (crack-field
PART_DEPTH), drawn narrower by the ribbons, and makes no step. Not yet:
holes' rims, the broken mirror per piece in this pass (the shard map still
does it), the thin-film colours, the laminated second ply, and the steps
between pieces (drawn in 2D for now: crack-step).

### 3.6 Render: light

- **Under the glass (floor light)**: each crack throws a fully dark band on the
  far side from the lamp and a band twice as bright beside it, each as wide as
  the light's travel across the thickness, `t·tan θ`. Zero right under the lamp,
  wider further away, so the shadows move with the cursor. (This was built and
  parked when you stopped work; the research derived the same formula.)
- **Light trapped in the glass**: each piece becomes its own light guide. An
  open crack passes only about 42% of the light running inside the glass, so
  the lamp's glow stops sharply at the cracks, piece by piece, and the
  glowing bands, rims and side faces are bright near the lamp and dark far
  from it.
- **Glints**: a square crack face plus the back face send the lamp's light back
  like the highlight on a scratch, so cracks catch the lamp only near the point
  under it, and the glint slides along the crack as you move. Stepped hackle
  breaks it into segments.
- **Colour fringes** at chips and at the edge of total reflection; **green**
  only on long paths inside the glass.

### 3.7 Debris: needles, chunks, grit and flakes

| Class | Size on screen | Where it comes from | Where it is |
|---|---|---|---|
| Daggers and needles | long, 5–15:1 | between radials, in fans, along narrow forks | in the pane, loose ones falling |
| Chunks | 1–10 mm (4–40 px) | where rings cut radials; around the crushed zone; crater spall | in the pane near the strike; fallen |
| Grit | 0.15–0.85 mm (0.5–3 px) | crushed zone; chipping as pieces rub | on crack lips; a spray mostly straight down under the pane (86% directly below; 4–5× fewer every 45 cm out) |
| Powder | below a pixel | the crushed zone | the white disc at the strike; stuck to the PVB in laminated glass |
| Flakes | thin, shell-shaped | exit-side crater; edge chips | around the hole on the back face; along the arris |

Each kind is lit by its own optics: grit sparkles as single points that switch
on and off as you move; needles glow at their broken ends; chunks flash like
small gems; flakes show rainbow colours. All of them cast shadows on the
photograph. Fallen pieces lie at slight tilts, each flashing the room
separately.

### 3.8 Edges and side faces

The side-face work already built (`effects/optics/crack-side`) stays: cracks
cross the side faces at their lean. Added: each piece's side face carries its
own trapped glow and reflection, so both step at every crack; shell-shaped
chips along the arris near the strike; the jagged rims of holes rendered as
fracture faces.

---

## 4. Scale and cost

**Offline compute** (measured here: 6.3 × 10⁷ bond-steps a second on 2
threads):

| Where | Resolution | Time per break | First library (about 40 breaks) |
|---|---|---|---|
| This cloud container (2 threads, 7 GB) | 0.8–1 mm | about 10–45 min | about a day |
| Your PC natively (Ryzen 5 3600XT, 12 threads; needs 16 GB+ memory) | 0.5 mm | about 1–4 h (estimate) | 2–6 days |

Your Cowork VM gets only 2 cores and 3 GB, so it is no faster than the
container. Running natively on Windows would mean installing Julia (free,
MIT), so only if you want the finer version later. No paid cloud machines
without asking you.

**Browser**: data 20–60 KB per break, loaded on the first strike; textures
baked once per break; per-pixel cost above. Quality tiers: full (everything);
medium (no thin-film colours or glint detail); low (crack bands and holes
only).

---

## 5. Trade-offs

| Choice | Picked | Instead of | Why | Cost of the choice |
|---|---|---|---|---|
| Where patterns come from | offline physics library | generating at click time | only physics gives real topology, order and variety; it can't run at click time | a fixed (but large, varied) set; compute time |
| Physics method | peridynamics | phase-field, FEM, discrete elements | validated for glass impact; free solver; one run gives cracks, lean, tilt and debris | wandering crack lines need smoothing; parameters need calibrating |
| Procedural tools (Houdini-style Voronoi) | not used | — | wrong junction structure; they read as computer-made | — |
| Crack rendering | exact per-pixel intersection | drawn strokes, textures, normal maps | the fold, shift and glow only come from real geometry | more shader work; must stay inside WebGL1 limits |
| Ground truth | Mitsuba 3 + photographs | judgement by eye | measurable | setup time |

---

## 6. Build order

Each step behind `?try=broken`, checked against photos and Mitsuba, shown to
you before the next.

| Step | What | What you'll see |
|---|---|---|
| B0 | Simulation and extraction tools; one plain break | its crack pattern beside real photographs, with the statistics |
| B1 | First plain library; placing and animating | real-looking patterns on the pane, every strike different (with the current simple drawing) |
| B2 | The pane view pass: crack faces, broken mirror, holes | cracks that fold, shift and glow as you move; the picture fractured |
| B3 | Light: shadows under cracks, trapped light, glints | the glow stopping at cracks; shadows moving with the lamp |
| B4 | Crushed zone, cone and crater, debris, edge chips, side faces | the strike in 3D; grit, needles, chunks |
| B5 | Laminated: simulation, plies, stone-hit types | spider webs held together; bullseyes and stars |
| B6 | Falling and fallen pieces | pieces dropping out, lying lit on the photograph |
| B7 | Calibration and quality tiers | measured match; phones |

---

## 7. Decisions for you

1. **Approve this approach**: real breaks simulated offline with
   Peridynamics.jl, and light worked out from the optics per pixel.
2. **Compute**: start in the cloud container at about 1 mm resolution (free;
   the first library in about a day). Finer later on your PC if you want it.
3. **Remove the tempered pane** from the Lab samples (you never asked for it).

## 8. What to revisit as it grows

- A finer library (0.5 mm) if 1 mm patterns look too smooth close up.
- Curved glass (windscreens) if you want car glass, not just flat panes.
- Several strikes on one pane (later cracks stop at earlier ones, which the
  forensic rule already describes).
- Running the simulation at click time on a server, if ever needed.

---

## 9. Fit with the engine as built (checked 2026-10-02)

Ony asked whether the design fits the existing architecture and reuses what
is built. It does; this is the module-by-module account.

| Existing piece | What it does today | In the new system |
|---|---|---|
| `effects/optics/fracture.ts` (`Fracture`, `Shard`, `Crack`, `Impact`) | the break's data shape | **kept as the interface**. The library returns the same `Fracture`, with new optional fields per crack (lean, arrival time, ply, texture zone) and per piece (depth, loose). The generator stays as the fallback only. |
| `effects/optics/crack-net.ts` | the planar graph of cracks and the faces it cuts | **reused** to turn library crack lines into pieces. |
| `effects/optics/shard-map.ts` + the per-piece mirror in the glass shader (`shardlight`) | each piece reflects the room at its own tilt | **reused**; tilts now come from the simulation instead of the hand-made dish (`shard-tilt.ts` becomes the fallback). |
| `effects/optics/crack-side.ts` + `drawSide` in `BrokenGlass.tsx` | cracks crossing the side faces at their lean | **reused** as is; fed the simulated lean. |
| `effects/optics/crack-light.ts`, `crack-face.ts` | the crack-as-mirror flash and the face lean table | **reused** inside the new per-pixel pass (same critical-angle maths); `KIND_LEAN` becomes the fallback when a library crack carries its own lean. |
| branch `wip/crack-shadow-step5` (`crack-shadow.ts`, casters `face`/`mask`) | dark and bright bands under each crack in the floor light | **merged back**: it is exactly §3.6's floor pass. |
| `effects/optics/casters.ts`, `shape-casters.ts`, `shadow.glsl.ts` | shadows of things on the glass in the floor light | **reused** for fallen pieces and grit (each a caster with a mask). |
| `effects/light/lights.ts` (the light list), `FloorLight.tsx`, `GlassLight.tsx` | lamps, the photographs' lights, the floor pass, the glass light layer | **reused unchanged**: every lamp already lights the glass; the trapped-light map is one more input to `GlassLight`. |
| `effects/optics/edge-side.ts`, `edge-profile.ts` | the pane's side faces and arris | **reused** for hole rims and chips (a fracture face is a side face with a rough profile). |
| `effects/optics/environment.ts`, `reflection.ts`, `coating.ts`, `dispersion.ts` | the room, Fresnel, thin films, colour fringes | **reused**: the thin-film LUT comes from `coating.ts`'s maths; fringes from `dispersion.ts`. |
| `effects/engine/compositor.ts` (`PANE_LAYERS`) | layer order per pane | **unchanged**: the crack view draws in `pane:broken`, the crack shadows in `pane:under`, trapped light in `pane:surface`. |
| `effects/engine/quality.ts` | full / lite / minimal | **used** for the tiers in §10. |
| `lib/crack-photos.ts`, `crack-photo.ts` | Ony's photographed breaks as patterns | **kept** as a second pattern source alongside the library (same `Fracture` out). |

New modules (all under `effects/optics/` unless said):

- `fracture-library.ts`: load, pick, place, mirror and scale a stored break → `Fracture`. Pure; tested with a fixture break.
- `crack-field.ts`: bake the crack field, piece field and segment table textures from a `Fracture`. Pure data in, typed arrays out; the GL upload is a thin adapter.
- `crack-view.glsl.ts`: the per-pixel crack-face pass (§3.5) as a GLSL chunk, like the existing `*.glsl.ts` files.
- `debris.ts` + `debris.glsl.ts`: the four debris classes as particles with their own lighting, and the fallen pieces.
- `tools/fracture-sim/`: the offline simulate / extract / check tools (B0, built).

## 10. Quality tiers (web speed)

The engine's three tiers (`quality.ts`), and what each drops. Costs are the
estimates of §3.5 and §4; the build measures each and writes the numbers here.

| Tier | Pane view | Light | Debris | Animation |
|---|---|---|---|---|
| full | exact per-pixel crack faces, thin-film colours, glints, laminated parallax | crack shadow bands, trapped light per piece, debris shadows | all four classes, fallen pieces lit and shadowed | cracks in arrival order, pieces falling |
| lite | crack faces without thin-film colour or glint detail (2 texture reads fewer) | crack shadow bands only | chunks and needles; grit as a baked texture | same |
| minimal | crack bands and holes from the baked field, no per-pixel intersection | none | baked texture | the break appears in three steps |

Budget: a broken pane at full must stay inside the engine's existing frame
budget on a desktop (the compositor already measures passes with
`perf.ts`); the pass steps down a tier on its own when `perf.ts` reports slow
frames, as the water layer does today.

## 11. Knobs (visual preferences, as causes)

The site's rule (tuning.ts, "RESULTS are locked"): a control is a cause,
never a cooked result. These are the causes the broken glass exposes:

| Knob | Cause | Already exists? |
|---|---|---|
| Glass kind: plain / laminated | which library | new (per pane, `data-glass`) |
| Glass thickness | band widths, side faces, debris size | yes (`glassThickness`) |
| Glass height (gap) | where crack shadows fall | yes (`floorGap`) |
| Strike energy | how long the hammer is held (exists); picks the library's energy class, how much falls out | yes (the Hammer) |
| Playback speed | how slow the cracks run (×1000 is the default; a preference, since no screen can show 1.5 km/s) | new |
| Debris amount | strike energy and glass kind set it; the knob scales only the grit count for speed | new, in the tier table |
| Room and lamps | the broken mirror and glints | yes (`room`, the lights) |
| Piece displacement | how unevenly the pieces sit: proud or sunk by up to a third of the thickness (Ony, 2026-10-02: "different shards protruding or sinking more than the others. Nothing crazy, but it does happen"); each step shows as a shadow line from the lamp over the high side and a lit riser seen from the low side (`effects/optics/crack-step`, `shard-tilt pieceLift`) | built (`pieceDisplacement`, Glass group) |

Not knobs: crack brightness, band width, glow strength, fringe colour. Each
is set by the physics from the causes above.

## 12. Components for the library (later)

Each of these is self-contained, pure where it can be, with its own tests,
and no dependency on the site's React tree, so it can move to the component
library later without surgery:

- **FractureLibrary** (data + placement): `pick(kind, energy, position)` → `Fracture`.
- **CrackField baker**: `Fracture` → typed arrays for the textures.
- **CrackView** GLSL chunk + its uniform layout (a function of the baked fields and the pane causes).
- **CrackShadowBands** (from the parked branch): `crackBands(...)` → quads for any floor-light caster.
- **CrackSide**: already a pure module.
- **Debris**: particle set + GLSL; independent of the pane.
- **BrokenGlass** React wrapper: thin; wires the above to a pane element.
- **fracture-sim** tools: standalone.

## 13. Double-check: does this reach AAA photoreal?

What the best work does, and where this design stands:

| What film and AAA games do | Here |
|---|---|
| Crack patterns from simulation or from scanned real breaks, never from Voronoi | simulated with a validated method, checked against 60 real panes' statistics and 203 photographs |
| Cracks as geometry inside the glass, lit by ray tracing | per-pixel ray intersection with each crack face inside the slab, with exact Fresnel and total internal reflection; checked against Mitsuba path tracing |
| Each fragment reflects at its own orientation | per-piece mirror (built); tilts from the simulation |
| Debris with its own materials | four classes, each with its own optics, shadows on the photograph |
| Light transport through the broken slab | trapped light per piece with crack leakage (0.425 per crossing), crack shadow bands in the floor light |
| Laminated glass as two cracked plies | two crack layers with parallax, PVB invisible |

Known gaps, and what closes them: (1) crack face roughness (mist, hackle)
is a rule from fractography, not simulated: the Mitsuba comparison decides
whether a rougher face model is needed; (2) sub-millimetre detail is drawn
by rule; a 0.5 mm library later if it shows; (3) light bouncing *between*
pieces (second-order) is not modelled; it matters only in the crushed zone,
which is drawn as a white sparkling disc from measurements.
