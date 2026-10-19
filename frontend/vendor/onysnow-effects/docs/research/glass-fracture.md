# Research: a thorough broken-glass system

Web research, 2026-10-01, for item 10 (broken glass). It builds on
`docs/broken-glass-cracks.md` (the crack generator: radials, staggered
concentric chords, forks, T-junctions, crushed spot, tempered dice) and
`docs/broken-glass-light.md` (per-shard tilt from the dent, cracks as TIR
faces, side faces, light under the pane, holes, pieces on the floor). This
file doesn't repeat their physics. It adds prior art, licences, appearance
references, shader techniques, physics libraries, and a recommended build
order.

Every claim links to its source. Where a page couldn't be read, it says so.

---

## 1. Prior art

### 1a. Web libraries and demos

| What | Technique | Licence | Use to us |
|---|---|---|---|
| **three-pinata** (Dan Greenheck), [repo](https://github.com/dgreenheck/three-pinata), [demo](https://three-pinata-demo.vercel.app/) | Real-time Voronoi fracture of three.js meshes in **3D and 2.5D modes**. Impact-concentrated seeds (`impactPoint`, `impactRadius`), **custom seed points**, refracture, plane slicing, a **separate material for interior fracture faces** with auto UVs, and a Rapier integration example ([README](https://raw.githubusercontent.com/dgreenheck/three-pinata/main/README.md)). Needs three >= 0.158. | MIT | The 2.5D mode plus custom seeds is the closest match to a pane. We can feed it **our own crack-graph faces**, or borrow its extrude-and-cap code, to turn 2D shards into slabs with side and fracture faces for the falling and floor pieces. |
| **three.js `ConvexObjectBreaker`** ([docs](https://threejs.org/docs/pages/ConvexObjectBreaker.html), [example](https://threejs.org/examples/physics_ammo_break.html)) | `subdivideByImpact(object, point, normal, radialIters, randomIters)` makes recursive radial and random plane cuts of a **convex** mesh. `cutByPlane` is also available. | MIT ([three.js LICENSE](https://github.com/mrdoob/three.js/blob/dev/LICENSE)) | A reference for cutting a convex shard again, for example when a piece hits the floor and breaks. Only works on convex input. |
| **Ksenia Kondrashova, "Broken Glass Effect"** ([CodePen](https://codepen.io/ksenia-k/pen/abegNPO)) | A pure fragment-shader effect. Angular sectors around the click, noise, and three layered edge systems. A per-sector UV disturbance gives each sector its own refraction offset. | MIT (public Pens are MIT by default: [CodePen licensing](https://blog.codepen.io/documentation/licensing/)) | Shows that "each sector distorts the photo differently" reads well in one shader pass. Our map-based approach is more physical, but this is a good visual benchmark. |
| **Codrops, "Exploding 3D Objects with Three.js"** (Yuri Artiukh) ([article](https://tympanus.net/codrops/2019/03/26/exploding-3d-objects-with-three-js/)) | Pre-fractured Voronoi models (glTF + Draco). All fragments animate **in the vertex shader** from per-fragment attributes (direction, rotation, progress). | Codrops demo, check the repo licence | Good pattern for many falling shards: one draw call, per-vertex shard id, and the GPU does the tumble. |
| **Babylon.js, "Mesh shattering with baked physics"** ([article](https://babylonjs.medium.com/mesh-shattering-with-baked-physics-5b3f8f381743)) | Voronoi fracture offline, then rigid-body simulation **baked to a vertex-animation texture**: quaternions as RGBA8, positions as ratios in the bounding box (2 MB down to 40 KB). It plays back in one draw call. | Article | The cheapest fully deterministic "pieces fall and settle". |
| **nayrrod/voronoi-fracture** ([repo](https://github.com/nayrrod/voronoi-fracture)) | 2D Voronoi cells extruded into 3D, in one merged BufferGeometry with custom GLSL. | MIT | A minimal extrude-cells-to-slabs reference. |
| **shatter.js** ([repo](https://github.com/Biratus/shatter.js)) | Splits an **image** into Voronoi pieces and gives each piece's image and offset. | MIT | 2D/CSS fallback: shards as clipped image pieces. |
| **d3-delaunay** ([repo](https://github.com/d3/d3-delaunay)) | Fast 2D Voronoi built on Delaunator. Cell polygons are clipped to bounds. | ISC | Only needed if we ever want Voronoi tempered dice instead of a grid. Our radial crack graph is already more faithful. |
| **4rknova, "Voronoi Fragmentation of a Mesh"** ([post](https://www.4rknova.com/blog/2026/07/27/voronoi-fracture)) | Sutherland-Hodgman clipping by bisector half-spaces, cap generation, and **tagging new faces as "fracture"** so they get their own material. Works on convex solids only. | No licence stated | A clear explanation of the cap-face and tagging step we need for shard side faces. |
| **Godot "Impact Glass Shader"** ([godotshaders](https://godotshaders.com/shader/impact-glass-shader/)) | Radially placed Voronoi seeds, with ring radius `r = R*pow(t,1.2)`. Per-shard refraction direction `shard_dir` and a strength that falls with distance. | MIT (code) | A shader-only "per-shard refraction offset" reference. |
| **Godot-Glass-Break-Effect** ([repo](https://github.com/Lord0Sanz/Godot-Glass-Break-Effect)) | Voronoi crack edges, refraction boosted near cracks, blur oriented per shard. Going from 75 to 30 seeds is about 4x faster on mobile. | MIT | A useful note on mobile cost. |
| **Shadertoy** ("cracked", [ls2XR1](https://www.shadertoy.com/view/ls2XR1)), Inigo Quilez's Voronoi edge distance ([article](https://iquilezles.org/articles/voronoilines/), [shader](https://www.shadertoy.com/view/ldl3W8)) | Exact distance to a Voronoi cell border needs a **second pass** over the neighbours. Naive F2-F1 is not a true distance, which is why naive crack lines vary in width. | Shadertoy pages returned 403 to my fetcher, so the terms ([shadertoy.com/terms](https://www.shadertoy.com/terms)) are unverified. Shadertoy code commonly carries CC BY-NC-SA 3.0 (example dispute: [vispy #1672](https://github.com/vispy/vispy/issues/1672)), so **don't copy Shadertoy code; reimplement from the articles.** | Only relevant if we move cracks into a procedural shader. We draw them from the graph instead. |

### 1b. Game engines

- **Unreal Chaos.** Geometry Collections are fractured offline by
  Uniform/Cluster/**Radial** (Voronoi sites radiating from a centre, "ideal
  for glass")/Planar/Slice/Brick/Mesh/Custom tools, with noise on the cut
  surfaces ([Fracturing Geometry Collections](https://dev.epicgames.com/documentation/en-us/unreal-engine/fracturing-geometry-collections-user-guide)).
  Pieces separate at runtime when strain fields break the connection graph
  ([Destruction Quick Start](https://dev.epicgames.com/documentation/unreal-engine/destruction-quick-start?lang=en-US),
  [Chaos Fields](https://dev.epicgames.com/documentation/en-us/unreal-engine/chaos-fields-user-guide-in-unreal-engine)).
  **Borrow:** the clustered connection graph. A piece falls only once its
  links to the frame and to its neighbours are broken.
- **Unity "WindowFracture / GlassSystem"** ([repo](https://github.com/Tiitan/GlassSystem)).
  It "projects and clips a 2D fracture pattern on the panel surface,
  converted into shard polygons, then extruded into runtime shard meshes".
  **Shards connected to the frame stay anchored, and disconnected islands
  fall.** UVs carry over from the panel. Patterns are deterministic
  (`patternIndex`, `rotation`) and shards can break again. This is
  architecturally the closest match to ours (2D pattern, then extrude, then
  anchor by frame connectivity). Licence: see the repo (it bundles MathNet
  third-party binaries).
- **Smash Hit** (Mediocre / Dennis Gustafsson) ([Voxagon blog, "Cracking destruction"](https://blog.voxagon.se/2014/05/13/cracking-destruction.html),
  [GDC talk](https://www.gdcvault.com/play/1022200/Physics-for-Game-Programmers-Destruction)).
  Real-time glass on mobile:
  - It carves a small volume around the impact and splits it with
    randomised planes.
  - It keeps **vertex normals through splits** so the glass keeps its soft
    gradients.
  - It checks connectivity after a break to find islands that fall.
  - It breaks pieces inside the solver step, so they keep their momentum.

### 1c. Papers

- **O'Brien & Hodgins 1999, "Graphical Modeling and Animation of Brittle
  Fracture"** ([project page](http://graphics.berkeley.edu/papers/Obrien-GMA-1999-08/),
  [PDF](https://www.ri.cmu.edu/pub_files/pub4/o_brien_james_f_1999_1/o_brien_james_f_1999_1.pdf),
  [ACM](https://dl.acm.org/doi/10.1145/311535.311550)). An FEM stress
  tensor decides where cracks start and which way they run, with remeshing
  as they go. It won the SIGGRAPH Impact award. Too heavy to run live. It is
  the physical basis for "crack runs perpendicular to max principal
  stress", which our random walks imitate.
- **Müller, Chentanez & Kim 2013, "Real Time Dynamic Fracture with
  Volumetric Approximate Convex Decompositions"** ([PDF](https://matthias-research.github.io/pages/publications/fractureSG2013.pdf),
  [ACM](https://dl.acm.org/doi/10.1145/2461912.2461934)).
  - A **pre-computed fracture pattern is aligned to the impact point** and
    intersected with convex pieces.
  - For glass windows they use a **procedural spider-web pattern**, or
    Voronoi cells denser at the centre.
  - Fracture is local: only cells inside an impact sphere are cut, and the
    rest stays one piece.
  - It runs in under 10 ms for small and medium objects.
  - **Borrow:** "pattern centred on the hit, applied locally". This is
    exactly our generator applied to the pane.
- **Iben & O'Brien, "Generating Surface Crack Patterns"** (SCA 2006 best
  paper; Graphical Models 71(6) 2009) ([eScholarship](https://escholarship.org/uc/item/7j62s1nd),
  [PDF](http://graphics.berkeley.edu/papers/Iben-GSC-2009-11/Iben-GSC-2009-11.pdf)).
  A heuristic stress field on a triangle mesh is evolved over time to grow
  cracks, with parameters for mud, glaze and glass. The time evolution gives
  **animated crack growth**, a good model for a "crack spreading" animation.
- **Desbenoit, Galin & Akkouche 2005, "Modeling cracks and fractures"**
  ([ResearchGate](https://www.researchgate.net/publication/226590041_Modeling_cracks_and_fractures),
  [HAL](https://hal.science/hal-01303573v1), which blocked my fetcher). It
  maps 2D crack-pattern atlases onto surfaces and carves them into the
  volume. It supports our approach of authoring the crack graph in 2D and
  then giving it depth.
- **Sellán et al. 2022, "Breaking Good: Fracture Modes for Realtime
  Destruction"** ([arXiv](https://arxiv.org/html/2111.05249v5),
  [code](https://github.com/sgsellan/fracture-modes)). Fracture modes are
  precomputed and the impact is projected onto them at runtime. The licence
  is **academic/non-commercial only**, and it depends on tetgen and mosek.
  **Not usable for us.** Listed so nobody wastes time on it.
- **Wyman 2005, "An Approximate Image-Space Approach for Interactive
  Refraction"** ([ACM](https://dl.acm.org/doi/10.1145/1073204.1073310)),
  also "Interactive refractions with total internal reflection"
  ([ACM](https://dl.acm.org/doi/10.1145/1268517.1268548)). These are the
  standard screen-space refraction methods: refract at the front face, then
  approximate the exit using back-face depth and normals. Relevant for the
  floor pieces, which are thick wedges where TIR matters.

---

## 2. How real broken glass looks under light

**The fracture face has zones.**
- Near the origin the face is a smooth **mirror**. Next comes **mist**
  (hazy), then **hackle** (rough, stepped ridges). The zones grow
  concentrically from the origin as crack speed rises ([Bradt 2011, J. Fail.
  Anal. Prev.](https://link.springer.com/article/10.1007/s11668-011-9432-5);
  [ASTM C1256](https://elitesafetyglass.com/wp-content/uploads/2021/04/ASTM-C1256-Standard-Practice-for-Interpreting-Glass-Fracture-Surface-Features.pdf)).
- **Wallner lines** (rib marks) are curved ripples, concave towards where
  the crack came from.
- **Twist hackle** looks like "a staircase as seen from above" or a river
  with tributaries (ASTM C1256).
- The whole face is **conchoidal**, with curved shell-like lines
  ([CAMEO](https://cameo.mfa.org/wiki/Conchoidal_fracture),
  [Britannica](https://www.britannica.com/science/conchoidal-fracture)).
- **For rendering:**
  - Near the impact the faces are rough. They scatter, so they look whiter
    and less mirror-like.
  - Far from the impact a crack face is a near-perfect mirror that flashes
    only at the right angle.
  - Twist hackle makes the face's normal step along its length, so the flash
    breaks into **segments** rather than one continuous line.

**Why a crack is silver, dark or invisible.**
- A crack is an air gap. Light inside the glass that meets it beyond the
  critical angle (about 41.8 deg for n ≈ 1.5) is **totally reflected**, so
  the crack shines silver. Otherwise the light passes and the crack is
  nearly invisible ([TIR](https://en.wikipedia.org/wiki/Total_internal_reflection),
  [CK-12](https://www.ck12.org/flexi/physical-science/refraction/why-does-a-crack-in-glass-appear-to-be-silvery/),
  [ScienceABC](https://www.scienceabc.com/eyeopeners/if-glass-is-transparent-then-why-are-its-cracks-opaque)).
- It looks **dark** when the mirror reflects a dark part of the room.
- Where the two faces are **within a few wavelengths** of each other (at
  crack tips, and in tight cracks held in a frame), the evanescent wave
  crosses the gap. TIR is **frustrated**, light passes, and the crack goes
  **invisible** ([TIR, frustrated TIR section](https://en.wikipedia.org/wiki/Total_internal_reflection)).
- Gaps about a wavelength wide show thin-film interference colours, like
  [Newton's rings](https://en.wikipedia.org/wiki/Newton%27s_rings) (the
  faint rainbow at a tight crack).
- **Rendering consequence:** fade each crack's mirror strength towards its
  tip, and toward segments flagged "tight". Add an optional faint
  iridescence where it is tight.

**Why a crack looks green.**
- Float glass has about 0.1% iron oxide, which absorbs red. Looking along a
  long path through the glass (an edge, or a steep fracture face seen
  through the thickness) shows a **dark green edge**. Low-iron glass shows
  pale blue ([KJM, low-iron glass](https://www.kjmgroup.co.uk/blog/low-iron-glass-optiwhite-explained)).
- Light that TIR bounces along a shard also travels a long path, so the
  edges glow **green**.

**The double image along a crack.**
- The two pieces either side of a crack tilt differently. Each reflects the
  room rotated by 2x its own tilt ([law of reflection](https://en.wikipedia.org/wiki/Specular_reflection)).
- So a straight reflected edge (a window frame) **jumps** at the crack.
- Seen through the pane, the line of sight crosses a leaning fracture face,
  a wedge of glass, so the photo behind is **offset** across the crack band
  ([Snell's law](https://en.wikipedia.org/wiki/Snell%27s_law);
  [Fresnel equations](https://en.wikipedia.org/wiki/Fresnel_equations)).
- The result is the "doubled" look of real cracked panes: reflection
  discontinuities at every crack, plus a thin band of displaced photo.

**Annealed, tempered and laminated.**
- **Annealed:** long dagger shards with mirror-smooth faces. Their
  reflections differ strongly piece to piece (`broken-glass-light.md`
  covers the dish tilt).
- **Tempered:** breaks into "small granular chunks of similar size and
  shape" ([Safety glass](https://en.wikipedia.org/wiki/Safety_glass),
  [Tempered glass](https://en.wikipedia.org/wiki/Tempered_glass)), because
  the surface is in compression and the core in tension.
  - EN 12150 requires at least **40 particles in a 50x50 mm square**
    (30 for 15 mm glass). The count rises with surface stress, at least
    about 90 MPa for glass 10 mm or thinner ([glassonweb](https://www.glassonweb.com/article/thermally-toughened-safety-glass-correlation-between-flexural-strength-fragmentation-and)).
  - That is about 7-8 mm cubes, each with its own tiny tilt. The pane reads
    as **glittering sugar**: thousands of small mirrors, each lit or not.
- **Laminated:** a spider web of radial and concentric cracks, with pieces
  "bonded even when broken" by a PVB/EVA/TPU interlayer ([Laminated glass](https://en.wikipedia.org/wiki/Laminated_glass)).
  - There are two plies (for example 2.5 + 0.38 + 2.5 mm), so **two crack
    networks**, slightly offset, give a doubled crack look.
  - Nothing falls out. The pane sags as a cone (already modelled).
- **The impact on thick glass:** a **Hertzian cone** is ejected from the
  far side ([Britannica](https://www.britannica.com/science/Hertzian-cone-fracture)).
  The exit hole is larger than the entry hole
  ([SWGMAT, Glass Fractures](https://www.asteetrace.org/static/images/pdf/02%20Glass%20Fractures.pdf)).
  SWGMAT also states the **4R rule**: "Ridges on Radial cracks are at Right
  angles to the Rear". This corrects the "3R" in `broken-glass-light.md`.

**The edges of shards glow.**
- A shard is a light guide. Light entering the broad faces is trapped by TIR
  and comes out at the cut or broken edges. Edge-lit acrylic and glass signs
  work this way ([FGD glass, edge-lit](https://www.fgdglass.com/blog/led-edgelit-signs-a-designers-guide-to-architectural-glass-illumination/),
  [ACRYLITE light-guiding sheet](https://www.acrylite.co/products/brands/acrylite-led/light-guiding-edge-lit-sheet)).
- On a lit floor, a shard's perimeter is brighter and greener than its
  middle.

**Photo references (CC-licensed, for side-by-side checks):**
- [Commons: Broken glass](https://commons.wikimedia.org/wiki/Category:Broken_glass)
- [Commons: Broken safety glass](https://commons.wikimedia.org/wiki/Category:Broken_safety_glass)
  (tempered dice and laminated webs)
- [Broken_glass_001.JPG](https://commons.wikimedia.org/wiki/File:Broken_glass_001.JPG)
- [Broken Glass (18434524128)](https://commons.wikimedia.org/wiki/File:Broken_Glass_(18434524128).jpg)

What to look for in these photos:
- cracks mostly clear, with bright segments only where the light lines up
- reflections that jump at each crack
- green, bright fracture faces at the shard edges
- whitened crush near the impact

---

## 3. Rendering it in a fragment shader

**The data: a shard map plus a shard table** (this extends the existing
`shard-map.ts`).
- **Shard map texture** at pane resolution, with four channels:
  - R,G: 16-bit shard id
  - B: signed distance to the nearest crack, in px
  - A: the id of the nearest crack segment, or its packed lean and
    roughness
- The map comes from our crack graph (planar faces), **not** from a shader
  Voronoi. Ours obeys T-junctions and staggered chords. A shader Voronoi
  can't (see the IQ note in 1a on why naive Voronoi edges are wrong).
- **Shard table texture**, one texel row per shard:
  - tilt normal (dish plus knock)
  - a piston offset out of the plane
  - flags: missing, falling, tight, crushed
  - roughness
- Animating a shard (tilting or removing it) then rewrites one texel, not
  the whole map. The same "per-fragment attributes, GPU does the rest" idea
  appears in the [Codrops exploding objects](https://tympanus.net/codrops/2019/03/26/exploding-3d-objects-with-three-js/)
  and [Babylon baked shatter](https://babylonjs.medium.com/mesh-shattering-with-baked-physics-5b3f8f381743)
  articles.

**Per-shard reflection.**
- `N = shardNormal[id]`, `R = reflect(V, N)`, then sample the room
  environment along R.
- Weight by Schlick Fresnel, `F0 = ((n-1)/(n+1))^2 ≈ 0.04` ([Schlick's approximation](https://en.wikipedia.org/wiki/Schlick%27s_approximation)).
- A tilt of t moves the reflection by 2t, so 1-4 deg tilts are needed for
  visible contrast (as computed in `broken-glass-light.md`).
- Add a per-shard **piston offset** to the reflection parallax so the
  room's edges also *shift* between pieces, not just rotate.

**Per-shard refraction.**
- A tilted parallel slab shifts the photo by only `t*theta*(1-1/n)`, which
  is sub-pixel (see the existing doc).
- So the big refraction effect belongs in the **crack band** (wedge or
  prism deviation, [Snell](https://en.wikipedia.org/wiki/Snell%27s_law)),
  plus a small per-shard offset for flavour. The Godot shaders above use a
  per-shard `shard_dir` offset.
- Inside the band, offset the photo lookup across the crack by about
  `t*tan(lean)/n`, and mirror the sample on the far side of the gap.

**Cracks as thin TIR mirrors.**
1. Inside the band (|B| < half-width), build the fracture-face normal from
   the crack's in-plane direction and its lean.
2. Refract the view ray into the glass (n = 1.52).
3. Test it against the face. Beyond the critical angle the face is a
   perfect mirror (full TIR). Below it, use Fresnel.
4. Reflect, then sample the environment, the lamp, or the photo along the
   reflected in-glass ray.
5. Tint the result by Beer-Lambert green with path length = band width / cos.
6. Multiply by a tightness fade, which goes to 0 at crack tips (frustrated
   TIR).
7. Roughness (mist and hackle) blurs the sample and lifts it toward white,
   only near the crush.
8. A one-pixel dark seam marks the air gap.

The result is a crack that is mostly clear, flashes silver or green where
the geometry lines up, and is never a white line. Wyman's refraction work
([2005](https://dl.acm.org/doi/10.1145/1073204.1073310),
[TIR 2007](https://dl.acm.org/doi/10.1145/1268517.1268548)) is the
reference for doing this with depth and normals in screen space.

**Light leaking and shadows through cracks** (the floor light under the
pane).
- Render a **light-space copy of the shard map**: the pane seen from the
  lamp.
- For each receiver pixel, refract the lamp ray through the shard's normal,
  and through the crack face where it crosses one.
- Get intensity from the **area ratio of the beam before and after**, using
  `dFdx`/`dFdy` (oldArea/newArea: above 1 is bright, below 1 is dark). This
  is Evan Wallace's WebGL water caustics method ([article](https://medium.com/@evanwallace/rendering-realtime-caustics-in-webgl-2a99a29a0b2c),
  [demo](https://madebyevan.com/webgl-water/)), adapted to R3F by Maxime
  Heckel ([blog](https://blog.maximeheckel.com/posts/caustics-in-webgl/)).
- Each crack then throws a **dark line with a bright seam** beside it, offset
  by the slab thickness along the light, and each tilted shard shifts its
  own patch of light.
- A cheaper equivalent: draw the crack graph into the light map as two
  offset strokes (dark, then bright), and blur by distance to the receiver.

**Side faces.**
- Where a crack meets the pane boundary, draw it on the edge face as a line
  at its lean.
- Sample the same green edge shader as the intact edge, but break it there,
  since each piece's edge glow ends at its fracture face.

**Pieces on the floor.**
- Draw each as an extruded prism (top face plus side faces) using the same
  per-shard reflection shader.
- Its own refraction is near zero across the middle and strong at the
  wedge-shaped rim.
- Edge glow is stronger at the perimeter (the light-guide effect).
- Its shadow is the caustic above with a dark rim and bright inner line.
- Use the screen-space refraction from Wyman for thick pieces, or just the
  rim approximation.

**Tempered.**
- Don't draw thousands of crack bands. Use the shard map with about
  7 mm cells and per-cell random tilt.
- Each cell is a tiny mirror, so the pane glitters as the camera or lamp
  moves.
- Draw cracks as hairline seams only, with TIR flashes from the rim of each
  cell.

---

## 4. Physics for falling shards

| Library | Dim | Licence | Notes |
|---|---|---|---|
| **Rapier** (`@dimforge/rapier2d`/`3d`, `-compat` builds) ([repo](https://github.com/dimforge/rapier), [JS guide](https://rapier.rs/docs/user_guides/javascript/getting_started_js/), [npm](https://www.npmjs.com/package/@dimforge/rapier3d-compat)) | 2D and 3D | Apache-2.0 | WASM, fast. The three-pinata examples use it. Convex-hull colliders. Its weight is a WASM chunk of a few MB: one project dropped it partly for its 2.15 MB chunk ([pachinball #412](https://github.com/ford442/pachinball/issues/412)), so lazy-load it only when something falls. |
| **cannon-es** ([repo](https://github.com/pmndrs/cannon-es), [LICENSE](https://github.com/pmndrs/cannon-es/blob/master/LICENSE)) | 3D | MIT | Pure JS, light, `ConvexPolyhedron`. Maintained fork of cannon.js. |
| **matter.js** ([repo](https://github.com/liabru/matter-js), [Bodies docs](https://brm.io/matter-js/docs/classes/Bodies.html)) | 2D | MIT | `Bodies.fromVertices` takes concave shards only if [poly-decomp](https://www.npmjs.com/package/poly-decomp) is registered. Otherwise it uses the convex hull. |
| **planck.js** ([repo](https://github.com/piqnt/planck.js)) | 2D | MIT | A JS/TS rewrite of Box2D, very stable stacking. Box2D polygons are convex with a small vertex cap, so decompose shards first. |
| **ammo.js** (Bullet), used by the [three.js convex-break example](https://threejs.org/examples/physics_ammo_break.html) | 3D | zlib (Bullet) | Heavy and old API. Not recommended. |
| **No engine: baked or analytic** | n/a | n/a | [Babylon baked VAT](https://babylonjs.medium.com/mesh-shattering-with-baked-physics-5b3f8f381743) or a hand-written ballistic tumble with a single floor contact. |

**When to break off a piece.**
- Copy the Unity GlassSystem and Chaos rule: a shard falls when it is **no
  longer connected to the frame** through intact links in the shard
  adjacency graph ([GlassSystem](https://github.com/Tiitan/GlassSystem),
  [Chaos Fields](https://dev.epicgames.com/documentation/en-us/unreal-engine/chaos-fields-user-guide-in-unreal-engine)).
- A hammer click cuts that shard's links.
- Small central shards at a hard hit fall immediately.
- Laminated shards never fall.

---

## 5. Recommended architecture for onysnow-vision

Keep the **crack generator we have**. It is more faithful than Voronoi:
- staggered chords
- T-junctions
- forks per Quinn and Bradt
- a pattern centred on the hit, exactly as Müller et al. recommend for
  windows

Borrow the **rendering data layout** from the shader demos, the **extrude
and anchor logic** from Unity GlassSystem and three-pinata, and the
**caustic method** from Wallace.

1. **Shard graph plus adjacency** (in `fracture.ts`). Faces already exist.
   Add:
   - an adjacency list (shared crack segments)
   - a frame-anchored flag
   - per-segment lean, roughness (from distance to the crush) and tightness
     (fades to 0 at dangling tips)

   Fix the 3R/4R wording in the docs.
2. **Shard map v2** (in `shard-map.ts`). RGBA as in section 3: id, signed
   crack distance, segment id. Add a **shard table** texture for tilt,
   piston, flags and roughness. Upload once per break, then patch texels
   when a shard changes.
3. **Glass shader pass** (`?try=broken`):
   - per-shard Fresnel reflection of the room, with tilt and piston
   - crack band as a TIR mirror, tinted green, with frustrated fade and
     hackle roughness
   - refraction offset only inside the band
   - one-pixel air seam
   - tempered uses the same path with small cells and no band
4. **Side faces.** Intersect the crack segments with the pane boundary and
   draw them on the edge faces at their lean.
5. **Light under the pane.** Make a light-space shard map. Compute the
   Wallace area-ratio caustic per shard and across crack bands, giving dark
   and bright pairs. Start with the cheap two-stroke version, and upgrade
   if it reads flat.
6. **Removal.** When a shard is clicked or disconnected, set its flag to
   missing. The hole shows the sharp photo, rimmed by exposed fracture
   faces drawn with the step-3 shader.
7. **Falling and floor pieces.**
   - Extrude the shard polygon to thickness t (earcut caps plus side
     quads). For three.js, three-pinata's 2.5D mode or nayrrod's extruder
     can do it, MIT.
   - Tag side faces as "fracture" for the green edge material.
   - **Phase A:** an analytic tumble (gravity, spin, one bounce, settle
     flat at a slight random tilt). No dependency, deterministic, fine for
     a few pieces.
   - **Phase B,** only if pieces must pile up: lazy-load Rapier
     (Apache-2.0) and use convex-hull colliders (pieces are mostly convex;
     if not, decompose them).
   - Draw resting pieces with the floor-piece shader from section 3: rim
     refraction, edge glow, caustic shadow.
8. **Mobile budget.** Cap the number of crack segments in the band pass,
   since seed and segment count dominate cost, as the Godot repo notes.
   Fall back to a static bake (shards as clipped images, as in
   [shatter.js](https://github.com/Biratus/shatter.js)) under
   `prefers-reduced-motion` or on weak GPUs.

**Licence guardrails.**
- Fine to borrow from: three-pinata (MIT), three.js (MIT), CodePen pens
  (MIT), godotshaders snippets (MIT), d3-delaunay (ISC), matter, cannon-es
  and planck (MIT), Rapier (Apache-2.0, keep its NOTICE).
- Don't copy code from: Shadertoy (default licence unverified, commonly
  NC-SA), Breaking Good (non-commercial).
- Codrops demos: check each repo's licence first.

---

### Pages I could not read

- shadertoy.com: 403, so its licence is unverified.
- HAL: bot wall.
- iquilezles.org: robots.txt blocked the fetch.
- graphics.berkeley.edu PDF: robots.txt.
- Springer "Star crack formation via low-velocity impact" ([link](https://link.springer.com/article/10.1007/s40870-022-00351-w)):
  the proxy rate-limited the request. Worth reading for radial count
  against impact speed.

---

## R5 build plan (follow-up)

Research, 2026-10-01, for task 84 (broken glass, full). It answers the R5
questions in [research-plan.md](research-plan.md): what three-pinata can do
for our existing fracture generator, how the shards should fall, and the
star-crack paper. It ends with the build plan. Code links are pinned to the
commit that was read. **(computed)** means worked out here, and the method is
given. **(estimate)** means a judgement, to tune against the reference photos.

Repos read:
- three-pinata `lib` 2.0.1, commit [`26c746f`](https://github.com/dgreenheck/three-pinata/tree/26c746f993658f903fa0c715abdf87c1fedc2379)
  (2026-05-12), MIT ([lib/LICENSE](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/lib/LICENSE)).
- Unity GlassSystem (WindowFracture), commit [`f1cabde`](https://github.com/Tiitan/GlassSystem/tree/f1cabde482eee5338b4c7a0d860798b50b3c73c4)
  (2026-08-17). The clone has **no LICENSE file**. The only licence text is
  for the bundled Math.NET (MIT, `Third-Party Notices.txt`). With no licence,
  it is **read-for-ideas only**: copy nothing.

### R5.1 three-pinata against our fracture generator

**What our generator hands over.** `fracture()` returns `shards[].poly`, a
pane-pixel polygon per piece, plus tilt, slip, `reach`, and the `crushed` and
`missing` flags ([fracture.ts L34-48](../../src/effects/optics/fracture.ts#L34-L48)).
The pieces are the faces of the crack graph
([fracture.ts L401](../../src/effects/optics/fracture.ts#L401), `net.faces()`).
Measured over 20 seeds at energy 0.15, 0.5 and 1, on an 800x500 pane **(computed,
script bundling `fracture.ts` with esbuild)**:

| energy | shards per break | with at least one reflex corner | vertices, mean / max | area / convex-hull area, median (p5) | hull vertices, median (p95) |
|---|---|---|---|---|---|
| 0.15 | 64 | 99% | 43 / 226 | 0.956 (0.865) | 11 (20) |
| 0.5 | 130 | 99% | 39 / 211 | 0.955 (0.843) | 10 (19) |
| 1 | 198 | 98% | 35 / 214 | 0.946 (0.783) | 10 (19) |

So nearly every piece is technically concave, because of the 0.35 px kink at
every 5 px step ([fracture.ts L294](../../src/effects/optics/fracture.ts#L294)).
In shape, though, most are close to convex: half fill at least 95% of their
hull.

**Can three-pinata run without three.js?** Partly, and it wouldn't help.
- **Every library file imports `three`.** That is 14 files in `lib/src`.
  Most import only the math types: `Vector2`, `Vector3`, `Box3`. Examples are
  [Fragment.ts L1](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/lib/src/entities/Fragment.ts#L1)
  and [ConstrainedTriangulator.ts L1](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/lib/src/triangulators/ConstrainedTriangulator.ts#L1).
  `BufferGeometry` appears only at the entry and exit points:
  [GeometryConversion.ts L75-139](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/lib/src/utils/GeometryConversion.ts#L75-L139),
  [VoronoiFracture.ts L22-49](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/lib/src/fracture/VoronoiFracture.ts#L22-L49)
  and `DestructibleMesh.ts`. With a small vector shim, the core could run as
  pure geometry. Nothing renders.
- **But its fracture can't take our pieces.** The "2.5D" mode isn't a 2D
  pattern that gets extruded. It slices the 3D mesh with the
  **perpendicular-bisector plane between each pair of Voronoi seeds**, with
  the seeds placed on a plane
  ([VoronoiFracture.ts L121-233](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/lib/src/fracture/VoronoiFracture.ts#L121-L233),
  [VoronoiCell.ts L58-101](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/lib/src/fracture/VoronoiCell.ts#L58-L101)).
- The only pattern inputs are `seedPoints`, `impactPoint`/`impactRadius` and
  `fragmentCount`
  ([VoronoiFractureOptions.ts L97-108](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/lib/src/entities/VoronoiFractureOptions.ts#L97-L108)).
  Every cut is straight, between two seeds, so it **can't reproduce polyline
  cracks, T-junctions or staggered chords.** The §1a line "we can feed it our
  own crack-graph faces" is therefore **wrong**. You can feed it seeds, not
  faces.
- The glass demo also drops the whole pane (every fragment dynamic) with no
  frame anchoring
  ([GlassShatterScene.ts L171-178](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/demo/src/scenes/GlassShatterScene.ts#L171-L178)).

**What to port** (the ideas plus small pieces; MIT, keep the notice if code is
copied):

| From three-pinata | What it does | Our use |
|---|---|---|
| Two index lists per piece: `triangles[0]` is the original surface, `triangles[1]` is the cut faces ([Fragment.ts L7-10, L64](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/lib/src/entities/Fragment.ts#L7-L64)), emitted as two geometry groups, material 0 and material 1 ([GeometryConversion.ts L115-120](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/lib/src/utils/GeometryConversion.ts#L115-L120)) | "Separate material for fracture faces" | One vertex attribute `faceKind`: 0 = front, 1 = back, 2 = fracture face, 3 = factory edge (where the shard's outline runs along the pane boundary). One draw call. The shader branches on it. |
| Cut-face UVs = the planar triangulation coordinates × `textureScale` + `textureOffset` ([SliceFragment.ts L170-196](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/lib/src/fracture/SliceFragment.ts#L170-L196)) | Texture on cut faces | The side quads get u = arc length along the outline, v = depth through the thickness. This drives the hackle/mist texture along the fracture face (§2). |
| `UnionFind` ([UnionFind.ts L1-40](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/lib/src/utils/UnionFind.ts#L1-L40)) | Island detection ([FractureFragment.ts L95-125](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/lib/src/fracture/FractureFragment.ts#L95-L125)) | The frame-connectivity test: which shards are still held. GlassSystem does the same with a BFS from the anchored shards ([GlassPanel.cs L187-192](https://github.com/Tiitan/GlassSystem/blob/f1cabde482eee5338b4c7a0d860798b50b3c73c4/Runtime/Scripts/GlassPanel.cs#L187-L192), idea only). It is 40 lines, trivial to write ourselves. |
| A Rapier collider from the vertices: a convex hull, falling back to a ball when the hull fails ([PhysicsWorld.ts L117-160](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/demo/src/physics/PhysicsWorld.ts#L117-L160)). Restitution 0.2 and friction 0.2 by default ([L78-79](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/demo/src/physics/PhysicsWorld.ts#L78-L79)) | Physics | Only if step 8 below is ever needed. The convex hull is an acceptable collider, since the median shard fills 95% of its hull (table above). |

**Don't port** the slicer and Voronoi code
(`SliceFragment.ts`, `VoronoiFracture.ts`) or its 789-line
`ConstrainedTriangulator`.
- For the caps we need to triangulate one simple polygon, which may be
  concave.
- **earcut** does exactly that. It is ISC
  ([LICENSE](https://github.com/mapbox/earcut/blob/main/LICENSE)), v3.2.4 on
  npm, 9.7 kB minified **(computed: `wc -c` of the unpkg build)**.
- GlassSystem's cap is a triangle fan from vertex 0
  ([BaseGlass.cs L172-180](https://github.com/Tiitan/GlassSystem/blob/f1cabde482eee5338b4c7a0d860798b50b3c73c4/Runtime/Scripts/BaseGlass.cs#L166-L180)).
  A fan is only correct for convex outlines, and 98-99% of ours have a reflex
  corner, so a fan is out.

**The slab we build (`slab.ts`, pure, no three.js):**
1. **Simplify the outline.** Use Douglas-Peucker at about 0.5 px **(estimate)**.
   That cuts about 40 vertices to about 10-20, since the hull needs a median of
   10 **(computed above)**.
2. **Caps.** earcut the outline for the front cap at z = 0. Copy it, reversed,
   for the back cap at z = -t.
3. **Side quads.** Add one quad per outline edge.
   - Tag it `faceKind = 3` if the edge lies on the pane boundary, otherwise 2.
   - For a fracture face, the normal is the in-plane outward edge normal,
     **tilted by that crack's lean** (the lean already in
     `docs/broken-glass-light.md`). Keep it as a vertex normal, not a
     recomputed face normal, as Smash Hit keeps normals through splits
     ([Voxagon](https://blog.voxagon.se/2014/05/13/cracking-destruction.html)).
4. **Output.** Typed arrays: positions, normals, uv, faceKind, indices.

Triangles per shard come to `2(V-2) + 2V`, about 56 at V = 15
**(computed)**. A full energy-1 break, if every piece were a slab, is about
11k triangles **(computed: 198 x 56)**. In practice only the loose pieces
become slabs.

### R5.2 Falling shards: Rapier 2D, hand-coded, or rapier3d

**The geometry of the scene.** The pane is vertical, in the screen plane. The
eye is `CAMERA_DISTANCE` = 1.2 viewport widths in front
([environment.ts L65](../../src/effects/optics/environment.ts#L65)).
- A shard falls off the pane, then down, and lands on a horizontal floor that
  runs toward or away from the viewer.
- The interesting motion is **in depth** (z): the piece tumbles out of the
  pane's plane and lands lying flat, seen foreshortened.

**Why Rapier 2D is the wrong plane for this.** A 2D world simulated in the
screen plane (x, y) has no z.
- Its "floor" would be a line at the bottom of the pane. Pieces would stack on
  it edge-to-edge like tiles in a wall, and couldn't lie flat in front of or
  behind each other.
- Simulating in the side plane (y, z) instead loses x, and there is one world
  per piece.
- The tools survey already flagged this as an open question: "a 2D rigid body
  with a faked out-of-plane tumble" ([tools-survey.md §1 and Still unknown 3](tools-survey.md)).
  The answer is **no** for the fall itself. The tumble *is* the out-of-plane
  motion, and the floor contact depends on it.

**What the real motion is.**
- **Direction.** The hammer comes from the viewer's side. The knocked-out
  piece goes **away** from the viewer, in the direction of the blow, which is
  what the current animation does
  ([BrokenGlass.tsx L642-663](../../src/components/site/BrokenGlass.tsx#L642-L663)).
- Small fragments also fly **back toward the striker**: "When a glass window
  is broken by a blow, small fragments fly off in a direction opposite to that
  of the force" (Nelson & Revell, "Backward Fragmentation from Breaking
  Glass", [Semantic Scholar](https://www.semanticscholar.org/paper/Backward-Fragmentation-from-Breaking-Glass-Nelson-Revell/b6cedbd498ba95c0254ec8b44e78c3b3c0cfcf28);
  also [SWGMAT §7.2.2](https://www.asteetrace.org/static/images/pdf/02%20Glass%20Fractures.pdf)).
- Pieces that let go later, because their links to the frame are gone,
  barely move at first. GlassSystem gives them 0.5 m/s downward and a random
  spin of up to 1 rad/s per axis
  ([BaseGlass.cs L123-131](https://github.com/Tiitan/GlassSystem/blob/f1cabde482eee5338b4c7a0d860798b50b3c73c4/Runtime/Scripts/BaseGlass.cs#L123-L131)).
- **Tumble, not flutter.** Falling plates are classed by the dimensionless
  moment of inertia `I* = π ρ t / (64 ρ_f d)`. A large I* gives continuous
  end-over-end **tumbling**
  ([Field, Klaus, Moore & Nori 1997, Nature 388:252, PDF](https://dml.riken.jp/images/pub/nori/pdf/Nature_388_252_Falling_Disks.pdf);
  [Andersen, Pesavento & Wang 2005, JFM](https://dragonfly.tam.cornell.edu/publications/2005_JFM_Andersen_Pesavento_Wang_a.pdf)).
  For a glass shard in air (ρ ≈ 2500 kg/m³,
  [soda-lime glass](https://en.wikipedia.org/wiki/Soda%E2%80%93lime_glass);
  ρ_f = 1.2 kg/m³; t = 4 mm; d = 5 cm), I* ≈ 8 **(computed)**. That is deep in
  the tumbling regime, so the spin it got from the blow is kept, not damped
  into a leaf-like flutter.
- **Air barely matters over a short fall.** A flat-falling plate's terminal
  speed is `sqrt(2 ρ t g / (ρ_f C_d))`. With C_d ≈ 1.17 for a flat plate
  ([Drag coefficient](https://en.wikipedia.org/wiki/Drag_coefficient)), that is
  about 10 m/s. After a 1 m drop (4.4 m/s), drag is at most about 19% of the
  weight, and less when edge-on **(computed)**. So the fall is ballistic
  (gravity plus constant spin) to within what the eye can judge.
- **Landing.** Glass on a hard floor hardly bounces. Every engine reference
  uses low restitution: three-pinata 0.2
  ([GlassShatterScene.ts L176-177](https://github.com/dgreenheck/three-pinata/blob/26c746f993658f903fa0c715abdf87c1fedc2379/demo/src/scenes/GlassShatterScene.ts#L171-L178)).
  I found no measured value for a glass shard on a floor, so use **e ≈ 0.15-0.25
  (estimate)**. Big pieces often break again on landing; the
  [three.js ConvexObjectBreaker](https://threejs.org/docs/pages/ConvexObjectBreaker.html)
  in §1a is the reference for that, and it is out of scope for the first build.
- **Contacts between shards are rare and unimportant visually.** GlassSystem
  gives each falling piece its own convex collider and rigid body
  ([BaseGlass.cs L100-117](https://github.com/Tiitan/GlassSystem/blob/f1cabde482eee5338b4c7a0d860798b50b3c73c4/Runtime/Scripts/BaseGlass.cs#L100-L117)).
  Smash Hit runs a full solver because pieces have to hit the player's
  obstacles: it caps impulses and breaks pieces inside the solver step
  ([Voxagon](https://blog.voxagon.se/2014/05/13/cracking-destruction.html)).
  A few to a few dozen pieces dropping out of a pane mostly fall clear of
  each other **(estimate)**. Pieces lying on the floor that overlap read
  fine when drawn in landing order.

**Decision for task 84: hand-coded 3D fall (port nothing, ~200 lines,
estimate).** Rapier 2D stays the engine for the other tasks
([tools-survey.md](tools-survey.md)).
- **Model.** Per piece: position, orientation quaternion, linear and angular
  velocity. Gravity. A floor plane at y = floor.
- **Floor contact.** On contact, find the lowest slab vertex below the floor.
  Apply an impulse there with restitution e and Coulomb friction, then
  sleep below a speed threshold.
- **Resting pose.** Lying on a face, at a small random tilt from the crush or
  the floor's grit (0-2°, **estimate**).
- **Determinism.** Everything is seeded, like `fracture()` itself. It has no
  dependency and can be tested headless.
- **rapier3d** (1.17 MB gz more, per [tools-survey.md](tools-survey.md)) only
  if pieces must pile on each other. Its 0.21.0 typings have `convexHull`,
  `convexMesh` and `convexDecomposition` (VHACD) colliders (`geometry/collider.d.ts`
  on [unpkg](https://unpkg.com/@dimforge/rapier3d@0.21.0/geometry/collider.d.ts)).
  The same file in rapier2d 0.21.0 also has `convexDecomposition`.

**Perspective.**
- **Projecting a point.** A point at depth z (positive away from the viewer,
  behind the pane plane) and height y projects with scale `D / (D + z)`,
  where D = `CAMERA_DISTANCE` × viewport width. That is the same similar-triangles
  model as `viewpoint.ts`
  ([viewpoint.ts L13-27](../../src/effects/optics/viewpoint.ts#L13-L27)).
- **Pieces going away** shrink and rise toward the horizon as they land.
  Backward spray grows and drops off the bottom of the screen. Both follow
  from the same projection.
- **A flat piece lying on the floor** is seen at a grazing angle. Its depth
  extent is foreshortened by about `(eye height) / distance`, and its
  **edges** (the green, light-guiding fracture faces) take up a large share
  of what you see. That is why the slab's side faces matter more on the floor
  than in the pane.

### R5.3 The star-crack paper and the hammer

**Source.** N. Vandenberghe, R. Vermorel, E. Villermaux, "Star-Shaped Crack
Pattern of Broken Windows", *Phys. Rev. Lett.* 110, 174302 (2013)
([APS](https://link.aps.org/doi/10.1103/PhysRevLett.110.174302),
[PubMed 23679734](https://pubmed.ncbi.nlm.nih.gov/23679734/)).
- The full text is paywalled. ResearchGate, academia.edu and ADS blocked or
  returned nothing, and the paper index had no full text. The numbers below
  are from the abstract and two contemporary reports.
- **What they did.** Controlled transverse impacts over a range of speeds,
  plate thicknesses and materials gave "a global scaling law for the number
  of radial cracks". The model is Griffith energy balance: bending elastic
  energy against fracture energy (abstract, via
  [science.gov](https://www.science.gov/topicpages/c/catastrophic+brittle+fracture)).
- **Set-up.** Glass and PMMA plates from about 0.5 mm to several mm thick (0.15-3 mm
  per Science News). The projectile was a 4 mm steel cylinder at 10-120 m/s,
  filmed at 30,000 fps
  ([APS Physics Focus, "Windshield Cracks Hold Secrets of Impact"](https://physics.aps.org/articles/v6/48);
  [Science News](https://www.sciencenews.org/article/counting-cracks-glass-gives-speed-projectile)).
- **The law.** The number of radial cracks **n ∝ V^½** (square root of impact
  speed) and **n ∝ G_c^(-1/3)** (inverse cube root of fracture energy). The
  energy-minimisation model predicts both (Physics Focus).
  - "the number of cracks doubled for every fourfold increase in the
    pellet's speed". 1 mm PMMA: about 4 cracks at 70 km/h, 8 at 280 km/h
    (Science News).
  - Also 1 mm PMMA: 4 cracks at 22.2 m/s, 8 at 56.7 m/s, "with some scatter"
    (Physics Focus).
  - The complete prefactor and thickness exponent are in the paywalled
    paper. **Unknown here.**
- **Regime.** A small, fast, hard projectile on thin plates. A glazier's
  hammer is heavy, blunt and slow (a few m/s, **estimate**) on a 3-6 mm pane,
  so only the **exponent** should be borrowed, not the absolute count.

**What it means for our hammer.**
- **Current code.** Strike strength is `energy = min(1, 0.15 + press_ms / 900)`
  ([Hammer.tsx L34](../../src/components/site/Hammer.tsx#L34)). The radial
  count is **linear**: `8 + round(30·E)`, so 12 at the lightest tap and 38 at
  a full swing, about 3.2x
  ([fracture.ts L234](../../src/effects/optics/fracture.ts#L234)).
  [Bradt 2011](https://link.springer.com/article/10.1007/s11668-011-9432-5)'s
  "proportional to energy" is what the code comment cites
  ([fracture.ts L203](../../src/effects/optics/fracture.ts#L203)).
- **Physics.** Read `energy` as the swing's **speed** fraction v, since the
  press length is a stand-in for how fast the hammer moves. Then n ∝ √v.
  If it is read as kinetic energy (∝ v²), n ∝ E^¼, which is flatter still.
- **Proposal.** `radials = round(N1 · sqrt(energy))` with **N1 ≈ 30
  (estimate)**. That gives **12 at the 0.15 tap (unchanged), 21 at 0.5, 30 at
  a full swing** **(computed)**. Calibrate N1 against the reference photos in §2.
  - Laminated keeps its own higher count. Its interlayer changes the
    mechanics, and the paper tested monolithic plates.
- **The design consequence.** Radials grow slowly with strength: twice as
  many needs four times the speed. A harder swing should therefore show
  mainly in **more forks, more and wider rings, a bigger crush and more pieces
  knocked out** ([fracture.ts L263-265, L339-340, L553-557](../../src/effects/optics/fracture.ts#L263)),
  not in the radial count. Those parameters stay as they are, since they
  aren't covered by this paper.

### R5.4 Step-by-step build plan for task 84

Each step can be seen in the lab (`?try=broken`) and is useful on its own.
All tests are vitest, in the style of `fracture.test.ts`.

| # | Step | Files | Tests | What you see |
|---|---|---|---|---|
| 1 | **Radial count ∝ √strength** (R5.3) | `fracture.ts` L234 | Radial-crack count at energy 1 over energy 0.25 is about 2 (±1 crack over 20 seeds); 0.15 still gives about 12; laminated unchanged; existing "whole pane" area test still passes | Tap vs full swing: the difference shows in forks, rings and holes, not in a hedgehog of radials |
| 2 | **Adjacency and anchoring.** Each shard gets `neighbours[]` (shared crack segments, from `CrackNet`) and `anchored` (its outline touches the pane boundary). `loose(fracture, removed)` = shards not reachable from an anchored shard (union-find, R5.1) | `fracture.ts`, `crack-net.ts` | Every shard touching the frame is anchored; adjacency is symmetric; removing the ring of shards round a centre isolates the centre; laminated never returns loose shards; tempered: none loose until a shard is removed | A lab overlay tints held pieces and loose pieces. Knocking a piece out also drops any island it was holding up (the GlassSystem rule) |
| 3 | **`slab.ts`**: simplify, then earcut caps, then side quads with `faceKind` and lean-tilted normals (R5.1). Add `earcut` (ISC) | new `src/effects/optics/slab.ts` | Volume = area × t (±1%); closed (every edge used twice); outward normals; boundary edges tagged 3, crack edges tagged 2; triangle count ≤ 2(V−2)+2V; a concave L-shaped test polygon caps correctly (a fan would fail it) | A lab "slabs" wireframe toggle over the break |
| 4 | **`fall.ts`**: seeded 3D ballistic + tumble + floor impulse (e ≈ 0.2, friction) + sleep (R5.2). Initial state: the knocked piece moves away from the viewer with spin; released islands at about 0.5 m/s down with small spin; optional tiny backward spray | new `src/effects/optics/fall.ts` | Same seed gives the same path; no vertex ever below the floor; first contact time ≈ √(2h/g) (±5%); at rest by a fixed time; resting normal within 3° of up; momentum unchanged when not in contact | (Logic only; seen in step 5) |
| 5 | **Projected tumble in the existing 2D canvas.** Replace the fade-out fall ([BrokenGlass.tsx L642-700](../../src/components/site/BrokenGlass.tsx#L642-L700)) with `fall.ts` poses projected by `D/(D+z)`. Draw the top face as now (photo or frost) and the side band in green. Pieces **stay on the floor** | `BrokenGlass.tsx`, `viewpoint.ts` (a `project(p, z)` helper) | `project`: z = 0 is the identity, z > 0 shrinks toward the eye point by D/(D+z); floor points converge to the horizon | Pieces tumble out, land, lie foreshortened on the floor, and stay |
| 6 | **WebGL slabs.** One draw call for every loose piece. Per-vertex shard id plus a pose texture, one row per shard (Codrops/Babylon pattern, §3). Front face: per-shard reflection (`shard-map.ts`). `faceKind` 2/3: the green side-face material (`edge-side.ts`) | glass shader pass, `shard-map.ts` | Buffer sizes match `slab.ts`; pose texture round-trips (encode, then decode within 1e-3); shader compiles under WebGL1 (existing GLSL test pattern) | Pieces in flight and on the floor flash the room as they turn; edges glow green |
| 7 | **Floor pieces' light**: rim refraction, edge glow, two-stroke caustic shadow (§3 "Pieces on the floor") | floor-light and caster code | Shadow offset = thickness along the light (as in the existing caster tests) | Pale shadows with a dark rim and a bright inner line |
| 8 | **Glass dust and small spray**: particle pool (tools-survey §4 decision) | particle module | Count capped; deterministic | Glitter at the impact and on landing |
| 9 | **Reduced motion and weak GPUs**: under `prefers-reduced-motion`, pieces appear already at rest (the last pose of `fall.ts`), with no animation | `BrokenGlass.tsx` | With reduced motion on, the first frame equals the rest pose | Same result, without movement |
| (10) | **Only if piles look wrong**: lazy `rapier3d` with `convexHull` of the simplified slab, behind a lab flag | – | Step-4 tests run against it too | Pieces that stack |

### R5 Decisions

- **three-pinata:** reference only. Its fracture is plane-cut Voronoi from
  seeds and can't take our crack-graph faces. Port the *ideas*: a separate
  fracture-face tag, cut-face UVs, union-find islands.
  - Extrude ourselves in `slab.ts`.
  - Use **earcut (ISC) — adopt** for concave caps.
- **Falling:** a **hand-coded, seeded 3D tumble with one floor plane**. Not
  Rapier 2D, which simulates in the wrong plane for a floor in depth.
  `rapier3d` only behind step 10.
- **Numbers.**
  - Restitution 0.15-0.25 (estimate).
  - Released pieces start at 0.5 m/s with spin up to 1 rad/s (from GlassSystem).
  - Resting tilt 0-2° (estimate).
  - Outline simplification 0.5 px (estimate).
  - Radials = round(30·√energy) (exponent sourced, N1 estimated).
- **Lab controls to expose:** N1 (radial scale), restitution, floor depth
  and height, spin scale, backward-spray on/off, slab thickness.
- **Still unknown:**
  - The paper's full formula: its prefactor and thickness exponent (paywall).
  - A measured restitution for glass on a floor.
  - Whether pieces should re-break on landing.
  - Mobile cost of step 6 at about 50 loose pieces (to measure).
- **Pages I could not read:**
  - PRL full text: APS paywall.
  - ADS: robots.
  - ResearchGate and academia.edu: no text.
  - The Springer "Star crack formation" paper: paywalled. It is about PVB
    laminated windshields, so it doesn't change the above.
