# R0. Capability gaps and tools survey

Research item R0 from [research-plan.md](research-plan.md). Written 2026-10-01.
Feeds tasks 74–84. It does not repeat the prior-art sections of
[water-drops.md](water-drops.md) (§1, §5), [glass-fracture.md](glass-fracture.md)
(§1, §4) or [uv-blacklight.md](uv-blacklight.md) (§5). Where those already
decided something, this doc links to them.

## How the facts were checked

- **Licence and last commit.** I shallow-cloned each repo on 2026-10-01 and
  read the licence file at `HEAD` and the date of the `HEAD` commit. The
  github.com web pages returned 403 through this session's proxy, but
  `git clone` worked. The links below go to the files I read.
- **Version and release date.** From the npm registry metadata
  (`registry.npmjs.org/<pkg>`, the `time` of the `latest` tag).
- **Size.** From bundlephobia where it answered (it rate-limited after 20
  calls). Otherwise the size is **(computed)** as `gzip -9` of the published file
  in the npm tarball. WASM files are measured the same way.
- **Licence policy** ([research-plan.md](research-plan.md) rule 2): MIT, BSD,
  Apache-2.0, ISC, CC0 and Unlicense are fine. **Zlib** is permissive (no
  copyleft, no fee) but is not on the list, so it is marked "needs Ony's OK".
  GPL, LGPL, non-commercial and "Prosperity" licences are read-for-ideas only.

---

## 0. What the engine is, and what that rules out

From the code, [`src/effects/engine/gl.ts`](../../src/effects/engine/gl.ts):

- There is **one offscreen WebGL1 context** (`getContext("webgl", {alpha: true,
  premultipliedAlpha: false, antialias: false, depth: false, stencil: false})`).
  Each pass draws into it and copies the result into its own 2D canvases
  (pane layers, floor, lens) within the same scheduler step.
- `beginPass` resets every GL switch before each pass. A library that caches
  GL state will go out of sync with this.
- There is **no depth buffer**, and no float or half-float render targets are
  in use yet (a grep finds no `OES_texture_*` or `EXT_color_buffer_*`).
- **SSR.** `sharedGl()` returns `null` when `typeof document === "undefined"`.
  Anything that touches the DOM, WebGL or WASM has to be imported dynamically
  on the client.

That gives three tests for any library: (a) it is pure CPU/WASM, **or** it can
draw through *our* WebGL1 context and survive state resets; (b) it can be
imported client-only; (c) its size is acceptable when lazy-loaded with the
effect that needs it.

**Can we rely on WebGL1 extensions for HDR and GPU simulation?** Real-world
support ([Web3D Survey](https://web3dsurvey.com/)):

| Extension | Overall | iOS | Android | Source |
|---|---|---|---|---|
| `OES_texture_float` | 99.28% | 99.99% | 93.39% | [web3dsurvey](https://web3dsurvey.com/webgl/extensions/OES_texture_float) |
| `EXT_color_buffer_half_float` (render to half float) | 99.29% | 100% | 93.01% | [web3dsurvey](https://web3dsurvey.com/webgl/extensions/EXT_color_buffer_half_float) |
| WebGL 2 itself | 97.3% | – | – | [web3dsurvey](https://web3dsurvey.com/webgl2) |

So half-float targets are usable on WebGL1, but about 7% of Android devices
need an 8-bit fallback. That number matters for bloom (§10), GPU particles
(§4) and water (§6).

### 0.1 Capability gaps, task by task

What each task needs that the engine doesn't have today. The engine side is
read from `src/effects`. The task side is from the research plan.

| Capability missing | Tasks |
|---|---|
| Rigid bodies (collide, fall, stack) | 74 balloons, 84 shards, 80 (suspended objects) |
| Ropes, cloth, nets with tearing | 74 (string), 75 webs, 84 (none) |
| Soft bodies (shape-preserving, volume-preserving) | 80 jello/slime, 74 (latex squash) |
| Particles (CPU or GPU) | 81 fireworks, 76 spray, 82 (sparks), 84 (glass dust) |
| Fluid on a surface (drops, trails, merging) | 77, 76 |
| Heightfield water and caustics | 78 |
| Flame shape and flicker | 82 |
| Gem optics: faceted ray tracing, dispersion, opal play-of-colour | 79 |
| Area-light / soft shadows from many casters | 83, and every light |
| HDR target + bloom + tone map in WebGL1 | 81, 82, 79, every light |
| Procedural noise in GLSL | 75 (sway), 77, 78, 81, 82 |
| GPU text/glyph masks | not needed by 74–84. It is on the R0 question list, but no task here uses it. Out of scope (rule 4). |

---

## 1. Rigid-body physics (shards, balloons)

| Candidate | Licence (verified) | Size | Tech | Latest release / last commit | Covers | Lacks | Fit |
|---|---|---|---|---|---|---|---|
| **Rapier 2D/3D** `@dimforge/rapier2d(-compat)`, `rapier3d(-compat)` | Apache-2.0 ([LICENSE](https://github.com/dimforge/rapier/blob/HEAD/LICENSE)) | 2D WASM 2.40 MB, **906 kB gz**; 3D WASM 3.08 MB, 1.17 MB gz **(computed)**. The `-compat` builds inline the WASM as base64: 2D 1.28 MB gz, 3D 1.65 MB gz ([bundlephobia 2D](https://bundlephobia.com/package/@dimforge/rapier2d-compat@0.21.0), [3D](https://bundlephobia.com/package/@dimforge/rapier3d-compat@0.21.0)) | Rust → WASM, CPU | 0.21.0, 2026-09-25 ([npm](https://www.npmjs.com/package/@dimforge/rapier2d)); repo commit 2026-09-27. The JS bindings moved into the main repo ([rapier.js README](https://github.com/dimforge/rapier.js/blob/HEAD/README.md): "merged into the main Rapier repository") | CCD, convex and polygon colliders; joints `fixed`, `spring`, `rope`, `revolute`, `prismatic` (`JointData` in the 0.21.0 typings); **new in 0.21.0: soft bodies (rope, cloth, polygon, disk, grid, volumetric), tearing and cutting, plasticity, and an FEM solver** ([TS CHANGELOG](https://github.com/dimforge/rapier/blob/HEAD/bindings/typescript/CHANGELOG.md), [Rapier 0.36 CHANGELOG](https://github.com/dimforge/rapier/blob/HEAD/CHANGELOG.md)) | Heavy download. The soft-body API is **one week old** | CPU only, so no GL conflict. Needs async `init()` for `-compat` ([docs](https://rapier.rs/docs/user_guides/javascript/getting_started_js/)), so it can be dynamically imported client-only (SSR-safe) |
| **cannon-es** | MIT ([LICENSE](https://github.com/pmndrs/cannon-es/blob/HEAD/LICENSE)) | 122 kB min, 34.5 kB gz ([bundlephobia](https://bundlephobia.com/package/cannon-es@0.20.0)) | JS, 3D | 0.20.0, 2022-08-12; last commit 2024-01-06 | A "maintained fork of cannon.js" ([readme](https://github.com/pmndrs/cannon-es/blob/HEAD/readme.md)); convex polyhedra, springs | No 2D, no soft bodies. Unmaintained in practice (no release for 3 years). A three.js forum benchmark says it "doesn't sleep well … beyond about 300 dynamic bodies it's no longer real-time" ([forum](https://discourse.threejs.org/t/javascript-physics-engine/91960)) | Fine (pure JS) |
| **matter.js** | MIT ([LICENSE](https://github.com/liabru/matter-js/blob/HEAD/LICENSE)) | 83 kB min, 25.9 kB gz ([bundlephobia](https://bundlephobia.com/package/matter-js@0.20.0)) | JS, 2D | 0.20.0, 2024-06-23; commit 2026-09-30 | Composites, constraints, a soft-body demo ([README](https://github.com/liabru/matter-js/blob/HEAD/README.md)) | `Composites.softBody` is deprecated and "moved to softBody and cloth examples" (`src/factory/Composites.js` in 0.20.0). Concave shards need poly-decomp ([glass-fracture §4](glass-fracture.md)). In one benchmark it ran 38 fps at 4,500 bodies where Rapier ran 120 ([dev.to](https://dev.to/jerzakm/this-little-known-javascript-physics-library-blew-my-mind-57oo)) | Fine |
| **planck.js** `planck` | MIT ([LICENSE.txt](https://github.com/piqnt/planck.js/blob/HEAD/LICENSE.txt)) | 211 kB min, 46.8 kB gz ([bundlephobia](https://bundlephobia.com/package/planck@1.5.0)) | JS, 2D (Box2D v2 port) | 1.5.0, 2026-04-07 | `RopeJoint`, `DistanceJoint`, `WeldJoint`, `WheelJoint`, `MotorJoint` (counted in `dist/planck.mjs`) | No soft bodies. Convex polygons only, with a small vertex cap ([glass-fracture §4](glass-fracture.md)) | Fine |
| **Oimo.js** `oimo` | MIT ([LICENSE](https://github.com/lo-th/Oimo.js/blob/HEAD/LICENSE)) | 38.5 kB gz **(computed)** | JS, 3D | 1.0.9, **2017-02-11**; commit 2021-07-08 | Basic 3D rigid bodies | Abandoned. The Babylon team lists it with Ammo and Cannon as "not maintained" ([Babylon forum](https://forum.babylonjs.com/t/integrating-a-modern-and-maintained-physics-engine-to-babylon-js/30059)) | – |
| **ammo.js** (Bullet) | Zlib ([LICENSE](https://github.com/kripken/ammo.js/blob/HEAD/LICENSE)), needs OK | `ammo.js` 1.56 MB, 317 kB gz **(computed)** | Emscripten, 3D | npm 0.0.10 is from **2016**; repo commit 2026-09-22 | Bullet soft bodies: rope, cloth and volume demos ([README](https://github.com/kripken/ammo.js/blob/HEAD/README.markdown)); three.js examples `physics_ammo_rope/cloth/volume` (MIT) | The npm build is stale. Clunky Emscripten API | Fine (CPU) |
| **Jolt** `jolt-physics` | MIT ([LICENSE](https://github.com/jrouwe/JoltPhysics.js/blob/HEAD/LICENSE)) | WASM 2.02 MB, 742 kB gz **(computed)** | C++ → WASM, 3D | 1.1.0, 2026-07-11; commit 2026-08-23 | Used in Horizon Forbidden West; soft bodies, Cosserat rods ([JoltPhysics README](https://github.com/jrouwe/JoltPhysics/blob/HEAD/README.md)); multithread builds ([JoltPhysics.js README](https://github.com/jrouwe/JoltPhysics.js/blob/HEAD/README.md)) | 3D only. The multithread builds need SharedArrayBuffer, which means cross-origin isolation headers **(estimate, from the WASM-threads requirement)** | Fine (CPU) |
| **Box2D v3** via `box2d3-wasm` | MIT (Box2D: [LICENSE](https://github.com/erincatto/box2d/blob/HEAD/LICENSE); wrapper: [box2d3-wasm/LICENSE](https://github.com/Birch-san/box2d3-wasm/blob/HEAD/box2d3-wasm/LICENSE)) | WASM 417–428 kB, **153–157 kB gz (computed)** | C → WASM, 2D | 5.2.0, 2026-02-16; Box2D commit 2026-09-24 | Soft Step solver, CCD, revolute/prismatic/distance/weld/wheel joints, SIMD ([README](https://github.com/erincatto/box2d/blob/HEAD/README.md)); "more than twice as fast as v2.4", "handles … longer chains of bodies" ([Box2D 3.0 release](https://box2d.org/posts/2024/08/releasing-box2d-3.0/)) | No soft bodies, no rope generator. Third-party wrapper | Fine (CPU). The smallest WASM here |
| `box2d-wasm` (v2.4) | Zlib ([LICENSE.zlib.txt](https://github.com/Birch-san/box2d-wasm/blob/HEAD/LICENSE.zlib.txt)) | – | WASM, 2D | 7.0.0, **2021**; commit 2024-12-29 | Box2D 2.4 | Replaced by v3 | – |
| Havok `@babylonjs/havok` | MIT per npm metadata only (no public source repo) | WASM 2.09 MB, 658 kB gz **(computed)** | WASM, 3D | 1.3.14, 2026-07-29 | Fast 3D | Babylon-shaped API, no soft bodies, no source | – |
| PhysX `physx-js-webidl` | MIT ([LICENSE](https://github.com/fabmax/physx-js-webidl/blob/HEAD/LICENSE)) | WASM 5.40 MB, 1.61 MB gz **(computed)** | WASM, 3D | 2.8.0, 2026-09-27 | Full PhysX | Far too heavy for a website | – |

**Performance claims on record.** Rapier's launch post claims it is "nearly as
fast as the CPU version of PhysX … and slightly faster than Box2D" (v2)
([Dimforge 2020](https://dimforge.com/blog/2020/08/25/announcing-the-rapier-physics-engine/)).
A third-party test measured Rapier at 60 fps with 7,500 active bodies, where
matter.js managed 4 fps ([dev.to](https://dev.to/jerzakm/this-little-known-javascript-physics-library-blew-my-mind-57oo)).
Our scenes need tens to a few hundred bodies **(estimate)**, so any of these
is fast enough for rigid bodies alone. What separates them is soft bodies and
ropes.

**One engine or a small custom solver?** Rapier 0.21.0 is now the only web
engine that covers every physics task in one API: rigid shards, joints, rope
strings, cloth/net webs with tearing, and volume-preserving and shape-matching
soft bodies ([TS CHANGELOG](https://github.com/dimforge/rapier/blob/HEAD/bindings/typescript/CHANGELOG.md);
the 0.21.0 typings expose `SoftBodyDesc.rope/disk/grid/polygon`, `tearStrain`,
`tearForce`, `World.tearSoftBody`, `World.cutSoftBody`). Box2D v3 is 6× smaller
but has no soft bodies. Ammo and Jolt are 3D only.

**Decision: adopt Rapier 2D (`@dimforge/rapier2d`), lazy-loaded, as the one
physics engine.** Two conditions:

1. **A spike first** (half a day, estimate). The soft-body API was released on
   2026-09-24. Measure step time for one web (≈300 particles) and one jello
   block on a mid-range Android before relying on it.
2. **The fallback is to port, not to pick another library.** If Rapier's
   soft bodies are too slow or too new, keep Rapier for rigid bodies and port
   Ten Minute Physics' XPBD cloth and soft-body code (MIT, §2–3) for webs and
   slime. That is about 300 lines **(estimate, from the size of
   [14-cloth.html](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/14-cloth.html))**.

Use the 2D build: the site is a page plane. Shards that need a 3D tumble can
be 2D bodies with a scripted out-of-plane rotation **(estimate)**. Load
`rapier3d` only if R5 shows that isn't convincing. Try the non-`-compat` build
first (906 kB gz, against 1.28 MB gz for base64). If Vite's WASM handling is a
problem, use `-compat` (unknown, to check in the spike).

---

## 2. Ropes, cloth, nets, webs

| Candidate | Licence | Tech / size | Updated | Covers | Lacks / fit |
|---|---|---|---|---|---|
| **Rapier soft bodies** (`SoftBodyDesc.rope`, `grid`, `polyline`; edges that "resist stretching only (a rope or a net that folds freely)"; `tearStrain`, `tearForce`) | Apache-2.0 | in the Rapier WASM (§1) | 2026-09-25 | Ropes, nets and tearing, coupled to rigid bodies and colliders ([typings: `dynamics/soft_body.d.ts`, `pipeline/world.d.ts`](https://github.com/dimforge/rapier/tree/HEAD/bindings/typescript/src.ts/dynamics)) | Brand new. Spike first (§1) |
| **Rapier rope/spring joints** | Apache-2.0 | – | – | A balloon string as a chain of `rope` joints between small bodies | Simpler and proven. Good enough for task 74's string even if soft bodies fail |
| **Ten Minute Physics 14 "cloth"** (Matthias Müller) | **MIT header in the file** ([14-cloth.html](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/14-cloth.html)); the repo has no root licence, so each file's own header is what counts | CPU XPBD; three.js used only to draw | repo commit 2026-06-20 | XPBD distance and bending constraints, substeps ([index](https://matthias-research.github.io/pages/tenMinutePhysics/index.html)) | No tearing. Port the solver (not three.js) |
| **Ten Minute Physics 15 "self-collision", 11 "hashing"** | MIT headers ([15](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/15-selfCollision.html), [11](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/11-hashing.html)) | CPU | 2026 | Spatial hash and self-collision | Webs rarely self-collide. Hashing is useful for dew drops |
| **verlet-js** (Sub Protocol) | MIT ([LICENSE](https://github.com/subprotocol/verlet-js/blob/HEAD/LICENSE)) | CPU, 2D canvas; **not on npm** (npm 404) | last commit **2014** | A ready **spider-web generator** (`spiderweb(origin, radius, segments, depth)`: radials plus spiral rings, pinned anchors, stiffness 0.6) and a spider ([examples/spiderweb.html](https://github.com/subprotocol/verlet-js/blob/HEAD/examples/spiderweb.html)) | Abandoned, plain Verlet (stiffness depends on iteration count). Port the generator only |
| **XPBD paper** (Macklin, Müller, Chentanez 2016) | paper | – | – | Compliance makes stiffness independent of iterations and timestep ([PDF](https://matthias-research.github.io/pages/publications/XPBD.pdf)); PBD basics ([Müller et al. 2007](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf)) | Theory for the fallback port |
| three.js `physics_ammo_rope` / `physics_ammo_cloth` | MIT (three) + Zlib (ammo) | three + ammo | 2026 ([examples dir](https://github.com/mrdoob/three.js/tree/dev/examples)) | Bullet ropes and cloth | Needs three and ammo: too heavy for one effect |
| WebGPU cloth (Carmen Cincotti, [blog](https://carmencincotti.com/2022-09-12/webgpu-cloth-simulation-is-in-github/)); CptNemo0/ClothSimulation; TimvanScherpenzeel/Thesis (MIT, WebGL mass-spring, 2017) | various | WebGPU / WebGL | – | GPU cloth | WebGPU doesn't fit our WebGL1 engine. We don't need GPU scale for one web |

**Decision (task 75 webs, 74 string): adopt Rapier.** Use soft-body `polyline`
or `rope` nets with `tearStrain` for silk, and rope joints for the balloon
string. **Port** verlet-js's web layout (MIT) to generate radials and spiral.
**Fallback: port** the Ten Minute Physics XPBD cloth (MIT). The silk glint and
the dew lenses are rendering (R10), not a tool question.

---

## 3. Soft bodies / jelly / slime

| Candidate | Licence | Tech | Updated | Covers | Lacks / fit |
|---|---|---|---|---|---|
| **Rapier soft bodies** | Apache-2.0 | WASM CPU | 2026-09-25 | 2D `disk`/`polygon`/`grid`/`volumetric` bodies; cell models `Volume` (area preservation), corotational, Neo-Hookean; **shape-matching softness**; FEM solver; deformable colliders, so suspended rigid bodies can sit *inside* a soft body (`createDeformableCollider`) (typings 0.21.0, [CHANGELOG](https://github.com/dimforge/rapier/blob/HEAD/bindings/typescript/CHANGELOG.md)) | New. Spike |
| **Ten Minute Physics 10 "soft bodies", 12 "skinning"** | MIT headers ([10](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/10-softBodies.html), [12](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/12-softBodySkinning.html)) | CPU XPBD on tetrahedra | 2026 | "Simple and unbreakable" soft bodies; a high-detail visual mesh embedded in a coarse sim mesh for a "100x speedup" ([index](https://matthias-research.github.io/pages/tenMinutePhysics/index.html)) | 3D tets. Port the 2D analogue (triangles) as the fallback |
| **Shape matching** (Müller et al. 2005, "Meshless deformations based on shape matching") | paper | – | – | A jelly that springs back to its rest shape ([PDF](https://matthias-research.github.io/pages/publications/MeshlessDeformations_SIG05.pdf)) | Theory |
| lisyarus, "Making a 2D soft-body physics engine" | **no code licence stated**: ideas only | C++ snippets | – | 2D shape matching by best-fit rotation angle ([blog](https://lisyarus.github.io/blog/posts/soft-body-physics.html)) | Reimplement from the maths if needed |
| holtsetio/softbodies | MIT ([LICENSE](https://github.com/holtsetio/softbodies/blob/HEAD/LICENSE)) | **WebGPU**, three.js TSL, FEM tets | 2025-06-12 | Hundreds of tet soft bodies on the GPU ([repo](https://github.com/holtsetio/softbodies), [demo](https://holtsetio.com/lab/softbodies/)) | WebGPU. Ideas only |
| zalo/TetSim | **no licence** (the README says "No idea what license this should be") | WebGL, three | 2023 | Tet soft body in the browser ([README](https://github.com/zalo/TetSim/blob/HEAD/README.md)) | Not usable |
| Jolt soft bodies | MIT | WASM 3D | 2026 | Soft balls, cloth ([README](https://github.com/jrouwe/JoltPhysics/blob/HEAD/README.md)) | 3D only, 742 kB gz extra |
| yuki-koyama/elasty | MIT ([LICENSE](https://github.com/yuki-koyama/elasty/blob/HEAD/LICENSE)) | C++ research library | 2022 | PBD/XPBD cloth with aerodynamic drag and lift ([repo](https://github.com/yuki-koyama/elasty)) | C++. The wind/drag model is a reference for web sway and balloon drag |

**Decision (task 80 jello/slime, 74 latex squash): adopt Rapier** soft bodies
(a 2D `polygon` with volume preservation plus shape-matching softness; the
suspended objects are rigid bodies or deformable colliders inside it). The
**render is ours**: the glass/refraction shader with a slime absorption tint
(R12). **Fallback: port** Ten Minute Physics 10 (MIT) reduced to 2D triangles.

---

## 4. Particles / fireworks

| Candidate | Licence | Size | Tech | Updated | Covers | Lacks / fit |
|---|---|---|---|---|---|---|
| **three.quarks** | MIT ([LICENSE](https://github.com/Alchemist0823/three.quarks/blob/HEAD/LICENSE)) | 43 kB gz min ESM **(computed)** + three | three.js (peer `three >= 0.182`) | 0.17.1, 2026-05-21 | Batched rendering, a visual editor, trails ([README](https://github.com/Alchemist0823/three.quarks/blob/HEAD/README.md)) | Needs three.js, which is WebGL2-only (§12). **No fit** |
| **fireworks-js** | MIT ([LICENSE](https://github.com/crashmax-dev/fireworks-js/blob/HEAD/LICENSE)) | **4.0 kB gz (computed)** | Canvas 2D; React wrapper | 2.10.8, 2024-07-13 | Rockets, traces, explosions, sound ([README](https://github.com/crashmax-dev/fireworks-js/blob/HEAD/README.md)) | A cartoon look: no HDR, no bloom, no camera exposure. Read its trace/explosion logic, then build |
| **tsParticles** (`@tsparticles/engine`, `/fireworks`, `/slim`) | MIT ([LICENSE](https://github.com/tsparticles/tsparticles/blob/HEAD/LICENSE)) | engine 23 kB gz; fireworks bundle 40 kB gz **(computed)**; slim 30.5 kB gz ([bundlephobia](https://bundlephobia.com/package/@tsparticles/slim@4.4.0)) | Canvas 2D | 4.4.0, 2026-08-31 | A fireworks preset, emitters, very active | Canvas 2D. Its own canvas, not our light pipeline |
| **particles.js** | MIT ([LICENSE.md](https://github.com/VincentGarreau/particles.js/blob/HEAD/LICENSE.md)) | – | Canvas 2D | 2.0.0, **2015**; commit 2017 | Background dots | Abandoned |
| **Proton** `proton-engine` | MIT ([LICENSE](https://github.com/drawcall/Proton/blob/HEAD/LICENSE)) | 17.0 kB gz **(computed)** | Canvas, DOM, WebGL, Pixel renderers ([README](https://github.com/drawcall/Proton/blob/HEAD/README.md)) | 7.1.5, 2025-03-24 | Emitters, behaviours | Its WebGL renderer makes its own context. The *simulation* could feed our renderer, but it is little more than gravity plus drag |
| **skeeto/webgl-particles** | **Unlicense** ([UNLICENSE](https://github.com/skeeto/webgl-particles/blob/HEAD/UNLICENSE)) | small | **WebGL1**, GPU state in float textures | 2017 | Particle positions and velocities simulated in a fragment shader | Old but public domain. A template for a WebGL1 GPU sim |
| **gpu-io** | MIT ([LICENSE.txt](https://github.com/amandaghassaei/gpu-io/blob/HEAD/LICENSE.txt)) | – | WebGL2 with WebGL1 fallback; converts GLSL3 to GLSL1 ([README](https://github.com/amandaghassaei/gpu-io/blob/HEAD/README.md)) | commit 2024-01-31 | A GPGPU layer with ping-pong float layers and polyfills | It owns the context. Ideas and polyfill tricks only |
| three.js `GPUComputationRenderer`, `webgl_gpgpu_*` | MIT | three | 2026 | Float-texture ping-pong ([source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/misc/GPUComputationRenderer.js)) | three-bound. Pattern reference |
| Nop Jiarathanakul, "WebGL GPU Particles" | blog | WebGL1 | 2014 | 1M particles at 60 fps with float textures ([post](https://www.iamnop.com/posts/2014-06-08-webgl-gpu-particles/)) | The repo has no licence (nopjia/webgl-particles). Ideas only |

**Decision (task 81 fireworks, 76 spray, 84 glass dust): build in our engine.**
None of the libraries renders into our HDR light pipeline, and the photoreal
part (exposure streaks, bloom, colour by chemistry, smoke lit by the burst) is
exactly what they lack. Build order:

1. A CPU particle pool in the scheduler. A big shell has 100–300 stars and a
   finale a few thousand **(estimate)**, well within CPU reach. Draw as
   additive streak quads in one draw call.
2. A GPU sim (float-texture ping-pong) only if the counts grow. **Port** the
   pattern from skeeto/webgl-particles (Unlicense) and gate it on the
   `OES_texture_float` stats in §0.

Read fireworks-js (MIT) for rocket and trace timing. R8 supplies the physics.

---

## 5. Fluid on a surface / drops (tasks 76, 77)

Already surveyed in [water-drops.md §1](water-drops.md). Confirmations and
additions:

| Candidate | Licence | Size | Tech | Updated | Notes |
|---|---|---|---|---|---|
| **raindrop-fx** (SardineFish) | **MIT confirmed** ([LICENSE](https://github.com/SardineFish/raindrop-fx/blob/HEAD/LICENSE)). Its renderer dependency `@sardinefish/zogra-renderer` is also MIT ([npm](https://www.npmjs.com/package/@sardinefish/zogra-renderer)) | `dist/index.js` 212 kB, **64 kB gz (computed)** | **WebGL2** ("Optimised raindrop effect on glass with WebGL2", [README](https://github.com/SardineFish/raindrop-fx/blob/HEAD/README.md)) | npm 1.0.8, 2021-03-21; last commit 2023-01-10 | Claims "6ms … with 2000 raindrops" on desktop Chrome, "6.5ms" on a Mi 10, and "2~3ms" for the default 600 drops at 1080p ([README](https://github.com/SardineFish/raindrop-fx/blob/HEAD/README.md)). Owns its own WebGL2 context, so it **cannot share ours** |
| Ten Minute Physics 17 "Eulerian fluid", 18 "FLIP" | MIT headers ([17](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/17-fluidSim.html), [18](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/18-flip.html)) | CPU, canvas 2D | 2026 | A 200-line grid fluid; FLIP water ([index](https://matthias-research.github.io/pages/tenMinutePhysics/index.html)) | A candidate for a viscous slime smear or a blood run (R3), if drop metaballs aren't enough |
| PavelDoGreat WebGL-Fluid-Simulation | MIT ([LICENSE](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/HEAD/LICENSE)) | – | WebGL2, **falls back to WebGL1 + `OES_texture_half_float`** (`script.js` lines 121–134) | commit 2024-11-12 | A GPU Gems 38 Navier–Stokes dye sim ([README](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/HEAD/README.md)) | A screen-space fluid. Not drops on glass, but see §7 and §10 |

**Decision (77, 76): port** raindrop-fx's simulation (MIT) into our WebGL1
engine. This keeps the plan in [water-drops.md §6](water-drops.md). The new
facts here: the library is WebGL2 and makes its own context, so adopting it
whole would break the one-context rule in `gl.ts`. Spray droplets come from
the §4 particle pool and land as drops in the same map.

---

## 6. Water surface / caustics (task 78)

Already listed in [water-drops.md §5](water-drops.md). Verified here:

| Candidate | Licence | Tech | Updated | Notes |
|---|---|---|---|---|
| **Evan Wallace, WebGL Water** | **MIT** (header of [water.js](https://github.com/evanw/webgl-water/blob/HEAD/water.js): "Released under the MIT license"; no LICENSE file at the root) | **WebGL1**; needs `OES_texture_float` (throws without it) and falls back to `HALF_FLOAT_OES` (water.js lines 20–28) | last commit 2016-01-07 | A 256×256 heightfield, ripples, caustics by area ratio ([demo](https://madebyevan.com/webgl-water/)) |
| Martin Renou, threejs-caustics | **BSD-3-Clause** ([LICENSE.txt](https://github.com/martinRenou/threejs-caustics/blob/HEAD/LICENSE.txt)) | three.js, GLSL files | 2020-08-27 | Caustics on an environment ([README](https://github.com/martinRenou/threejs-caustics/blob/HEAD/README.md)); the shaders are separate `.glsl` files and easy to read |
| three.js `webgl_gpgpu_water` | MIT | three | 2026 | Heightfield on the GPU ([examples dir](https://github.com/mrdoob/three.js/tree/dev/examples)) |
| drei-vanilla `Caustics` | MIT ([LICENSE](https://github.com/pmndrs/drei-vanilla/blob/HEAD/LICENSE)) | three | 2026-02-20 | Projected caustics for any mesh (`src/core/Caustics.ts`) | three-bound |
| Ten Minute Physics 20 "height-field water" | **no licence header** in [20-heightFieldWater.html](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/20-heightFieldWater.html) (unlike the other demos) | three | 2026 | Ideas only |

**Decision (78): port** Evan Wallace's heightfield and caustics (MIT, already
WebGL1, the same extension we'd gate on). Share our glass optics for the
surface refraction. Use Renou (BSD-3) as a second reference.

---

## 7. Fire / flame (task 82)

| Candidate | Licence | Tech | Updated | Covers | Fit |
|---|---|---|---|---|---|
| **Ten Minute Physics 21 "fire"** | MIT header ([21-fire.html](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/21-fire.html)) | **CPU** Eulerian grid with temperature and random swirls; draws to canvas 2D | 2026 | "How to write a fire simulator in a web page" ([index](https://matthias-research.github.io/pages/tenMinutePhysics/index.html)) | Renderer-free sim: we can upload its grid as a texture |
| **PavelDoGreat WebGL-Fluid-Simulation** | MIT | WebGL1/2 (§5) | 2024 | GPU dye advection, curl, bloom, sunrays (`script.js` config) | A GPU flame/smoke base on WebGL1 |
| **mattatz/THREE.Fire** | MIT ([LICENSE](https://github.com/mattatz/THREE.Fire/blob/HEAD/LICENSE)) | three.js, ray-marched volume in a box | 2020-11-17 | Procedural volumetric fire ([repo](https://github.com/mattatz/THREE.Fire)) | three-bound. The GLSL is portable |
| **@wolffo/three-fire** (typeWolffo/THREE.Fire) | MIT ([LICENSE](https://github.com/typeWolffo/THREE.Fire/blob/HEAD/LICENSE)) | three.js + TSL/WebGPU, React | 1.4.0, 2026-05-28; commit 2026-09-22 | A modern TypeScript version of the above ([README](https://github.com/typeWolffo/THREE.Fire)) | three-bound |
| yomotsu/VolumetricFire | MIT (`package.json`; no LICENSE file) | three.js | 2016 | A port of Alfred Fuller's volumetric fire ([repo](https://github.com/yomotsu/VolumetricFire)) | Old |
| neungkl/fire-simulation | MIT ([LICENSE](https://github.com/neungkl/fire-simulation/blob/HEAD/LICENSE)) | three.js | 2016 | Volumetric "flame ball" | Old |
| three.js `webgpu_volume_fire` | MIT | WebGPU/TSL | 2026 | – | WebGPU |

**Decision (82 torch): build** a 2D flame sprite in our engine. A noise-shaped
teardrop uses stegu noise (§11): two octaves scrolled upward, plus a blackbody
colour ramp. The light it casts is a flickering point light in the existing
per-light loop, with flicker numbers from R7. **Port** the Ten Minute Physics
fire sim (MIT) only if R7 shows the sprite looks fake up close.
Volumetric ray-marched fire (THREE.Fire) is overkill for a cursor torch
**(estimate)**.

---

## 8. Gems / dispersion / refraction (task 79)

| Candidate | Licence | Tech | Updated | Covers | Usable outside three.js? |
|---|---|---|---|---|---|
| **drei `MeshRefractionMaterial`** | MIT ([LICENSE](https://github.com/pmndrs/drei/blob/HEAD/LICENSE)) | three.js `ShaderMaterial` + **three-mesh-bvh** (MIT) | drei 10.7.9, 2026-09-25 | Bounced internal reflection through a BVH, chromatic `aberrationStrength`, fresnel ([source](https://github.com/pmndrs/drei/blob/HEAD/src/materials/MeshRefractionMaterial.tsx)) | **No, not on WebGL1**: it declares `precision highp isampler2D; usampler2D` (integer samplers are GLSL ES 3.00 only, source lines 55–56) and needs a BVH texture. A non-React use was asked about in [drei #1181](https://github.com/pmndrs/drei/issues/1181), but it still needs three |
| **N8python/diamonds** | MIT ([LICENSE](https://github.com/N8python/diamonds/blob/HEAD/LICENSE)) | three + three-mesh-bvh 0.5 | 2022 | The original diamond shader that drei's is based on (`main.js`: bounces 3, IOR 2.4) | Same limits |
| **three.js `MeshPhysicalMaterial.dispersion`** | MIT | three | r186 | Three refracted samples at `ior ± (ior−1)·0.025·dispersion` ([transmission_pars_fragment](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/transmission_pars_fragment.glsl.js), lines 178–190) | **The maths is trivially portable** (a few lines) |
| GPU Gems ch. 8, "Simulating Diffraction" (Jos Stam) | book text, free to read | – | 2004 | A diffraction-grating shader. The basis for opal play-of-colour ([chapter](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-8-simulating-diffraction)) | Ideas only (reimplement) |
| Cody Thayer, "Custom Opal Shader" | blog | – | – | Play-of-colour by view angle ([post](https://codytthayer.com/blog/expirmenting-with-custom-shaders-opalescent-diffraction)) | Ideas only |
| three-mesh-bvh | MIT ([LICENSE](https://github.com/gkjohnson/three-mesh-bvh/blob/HEAD/LICENSE)) | three | 0.9.15, 2026-09-09 | GPU BVH ray tracing | three-bound and WebGL2 |

**Decision (79): build** in our glass shader, porting the maths, not the
packages:

- **Facets.** A cut gem is convex, so ray-trace it analytically in the
  fragment shader against its planes. This needs no BVH and no integer
  textures, so it works on WebGL1. A gem has 30–60 planes, one `vec4` each.
  GLSL ES 1.00 guarantees only 16 fragment `vec4` uniforms
  (`gl_MaxFragmentUniformVectors`, §7.4 of the
  [spec](https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf)),
  so store the planes in a small RGBA texture instead **(computed: 60 > 16)**.
- **Dispersion.** Port three.js's 3-IOR spread (MIT), and use the engine's
  existing `optics/dispersion.ts`.
- **Opal.** A diffraction term after Stam, plus our `thin-film.ts`.
- **Quartz.** Clear glass with high Abbe number.

Details in R11.

---

## 9. Shadows / 2D lighting (task 83, and every light)

| Candidate | Licence | Tech | Updated | Covers | Fit |
|---|---|---|---|---|---|
| illuminated.js (gre) | **LGPL-3.0** ([LICENSE](https://github.com/gre/illuminated.js/blob/HEAD/LICENSE)); npm `illuminated` fork also LGPL-3.0 | Canvas 2D | 2014 | 2D lights, polygon occluders, penumbra | **Excluded** (copyleft). Ideas only |
| @pixi/lights | MIT ([LICENSE](https://github.com/pixijs/lights/blob/HEAD/LICENSE)) | Pixi v7 peer deps; "deferred lighting" with normal maps ([README](https://github.com/pixijs/lights)) | 4.1.0, 2023-07-12 | Normal-mapped 2D lights | Needs Pixi. No fit |
| dobrado76/pixi-lights-and-shadows | MIT ([LICENSE.md](https://github.com/dobrado76/pixi-lights-and-shadows/blob/HEAD/LICENSE.md)) | Pixi | 2025-10-04 | A 2.5D light and shadow system ([repo](https://github.com/dobrado76/pixi-lights-and-shadows)) | Needs Pixi. Ideas only |
| **Radiance cascades: Sannikov's paper** | MIT ([LICENSE.txt](https://github.com/Raikiri/RadianceCascadesPaper/blob/HEAD/LICENSE.txt)) | paper | 2025 | Noise-free 2D GI with soft shadows from area lights ([repo](https://github.com/Raikiri/RadianceCascadesPaper), [site](https://radiance-cascades.com/)) | Theory |
| **jason.today "Radiance Cascades" and "GI part 1"** | "All code contained in this page is under MIT license" ([rc](https://jason.today/rc)) | WebGL, two render targets, a JFA distance field ([part 1](https://jason.today/gi)) | 2024 | An interactive build-up: 4 or 16 base rays, about 5 cascades at 500 px | **Port candidate** for R6 |
| Hybrid46 RC2DGI | MIT ([LICENSE](https://github.com/Hybrid46/RadianceCascade2DGlobalIllumination/blob/HEAD/LICENSE)) | C#/raylib port of a Unity version | 2026-07-13 | Full pipeline write-up ([README](https://github.com/Hybrid46/RadianceCascade2DGlobalIllumination)) | Reference |
| Sohojoe/radiance-cascades-godot | Apache-2.0 ([LICENSE](https://github.com/Sohojoe/radiance-cascades-godot/blob/HEAD/LICENSE)) | Godot | 2024 | – | Reference |
| **SDF soft shadows** (Inigo Quilez) | article; **no code licence stated**, so reimplement from the formula | GLSL | – | `res = min(res, k·h/t)` penumbra while marching a distance field ([article](https://iquilezles.org/articles/rmshadows/)) | Fits a distance field built from our caster mask |
| **PCSS** (Fernando, NVIDIA 2005) | paper ([PDF](https://developer.download.nvidia.com/shaderlibrary/docs/shadow_PCSS.pdf)) + three.js `webgl_shadowmap_pcss` (MIT, [example](https://threejs.org/examples/webgl_shadowmap_pcss.html): 17 Poisson samples, blocker search) | shadow map | – | Contact-hardening penumbra | Our caster mask plays the role of a shadow map. The blocker-search step is the missing piece |
| LTC area lights (Heitz et al.) | BSD-style with a citation clause ([LICENSE](https://github.com/selfshadow/ltc_code/blob/HEAD/LICENSE)) | GLSL | 2019 | Polygonal area-light *shading* | Shading, not shadows. For R6 |

**Decision (83): build.** Extend the caster-mask model, and let R6 choose
between: (a) PCSS-style blocker search on the mask (cheapest, closest to what
exists); (b) a jump-flood distance field from the mask plus Quilez's cone
estimate; (c) radiance cascades **ported** from jason.today (MIT) when several
coloured lights need to interact. No library fits: each is tied to Pixi, Unity
or Godot, or is LGPL.

---

## 10. Post-processing (bloom, tone mapping) on a raw WebGL1 context

| Candidate | Licence | Size | Tech | Updated | Fit |
|---|---|---|---|---|---|
| pmndrs **postprocessing** | **Zlib** ([LICENSE.md](https://github.com/pmndrs/postprocessing/blob/HEAD/LICENSE.md)) | 327 kB min, 112.6 kB gz ([bundlephobia](https://bundlephobia.com/package/postprocessing@6.39.5)) | three.js `EffectComposer` replacement | 6.39.5, 2026-09-09 | three-bound, and three is WebGL2-only (§12). **No fit** |
| three.js **UnrealBloomPass** | MIT | – | three | 2026 | Technique: a bright pass, then a 5-level mip chain blurred "with different radii" and summed with weights (`nMips = 5`, [source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/UnrealBloomPass.js)). Port the idea |
| **PavelDoGreat bloom** | MIT | small | **raw WebGL1/2**, half-float with a fallback; context `{alpha: true, depth: false, stencil: false, antialias: false}`, the same as ours ([script.js](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/HEAD/script.js) lines 119–134); prefilter with threshold 0.6 and soft knee 0.7, 8 iterations at 256 px (config lines 76–81) | 2024 | **Closest drop-in pattern: port** |
| Jimenez, "Next-gen post processing in CoD: AW" (SIGGRAPH 2014) | slides | – | – | – | 13-tap downsample plus tent upsample, which avoids fireflies ([slides](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/)). Reference |
| Dual Kawase blur (Bjørge, ARM, SIGGRAPH 2015) | slides | – | – | – | A bandwidth-efficient blur for mobile ([PDF](https://community.arm.com/cfs-file/__key/communityserver-blogs-components-weblogfiles/00-00-00-20-66/siggraph2015_2D00_mmg_2D00_marius_2D00_slides.pdf)). Reference for the mobile tier |
| Jam3/glsl-fast-gaussian-blur | MIT ([LICENSE.md](https://github.com/Jam3/glsl-fast-gaussian-blur/blob/HEAD/LICENSE.md)) | tiny | GLSL1 | 2016 | 5/9/13-tap linear-sampled Gaussian. Copy |
| evanw/glfx.js | MIT ([LICENSE](https://github.com/evanw/glfx.js/blob/HEAD/LICENSE)) | – | raw WebGL1 image filters | 2022 | Owns its canvas. Reference shaders |
| mattdesl/glsl-fxaa | MIT ([LICENSE.md](https://github.com/mattdesl/glsl-fxaa/blob/HEAD/LICENSE.md)) | tiny | GLSL1 | 2015 | Only if edges alias. We render with `antialias: false` |
| **Tone mapping**: three.js tonemapping chunk | MIT | – | GLSL | 2026 | ACES fit (from `selfshadow/ltc_code`), AgX (via Filament/Blender), Reinhard, Cineon, with sources cited inline ([source](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js)) |
| Khronos PBR Neutral | Apache-2.0 ([LICENSE.md](https://github.com/KhronosGroup/ToneMapping/blob/HEAD/LICENSE.md)) | – | GLSL | 2024 | Keeps product/photo colours true ([press release](https://www.khronos.org/news/press/khronos-pbr-neutral-tone-mapper-released-for-true-to-life-color-rendering-of-3d-products)). Good for a photo site |
| Narkowicz ACES fit | blog | – | – | 2016 | Five-coefficient curve ([post](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/)) |

**Decision: port.** Build an engine "HDR + bloom" stage:

- A half-float target where `EXT_color_buffer_half_float` exists (99.3%; 93%
  on Android, §0). Otherwise RGBA8 with the existing Reinhard encode.
- Bloom: prefilter, then a downsample and upsample chain, ported from
  PavelDoGreat (MIT), with Jimenez's 13-tap/tent filters as the quality tier
  and Dual Kawase as the mobile tier.
- Tone map: the engine already has `toneMapGlass` / `toneMapFilm`
  (`optics/edge-profile.glsl.ts`). Add Khronos PBR Neutral (Apache-2.0) and
  AgX (from three.js, MIT) as options for the lab.

Fireworks (81), flame (82) and gems (79) all need this stage.

---

## 11. Noise / procedural GLSL

| Candidate | Licence | Updated | Notes |
|---|---|---|---|
| **stegu/webgl-noise** | **MIT** ([LICENSE](https://github.com/stegu/webgl-noise/blob/HEAD/LICENSE): Ashima Arts and Stefan Gustavson) | commit 2025-04-27 | Simplex and classic Perlin 2D/3D/4D, cellular. GLSL ES 1.00, texture-free. The maintained fork of ashima/webgl-noise |
| ashima/webgl-noise | MIT ([LICENSE](https://github.com/ashima/webgl-noise/blob/HEAD/LICENSE)) | 2024-11-15 | The original |
| hughsk/glsl-noise | MIT ([LICENSE](https://github.com/hughsk/glsl-noise/blob/HEAD/LICENSE)) | 2015 | The same code packaged for glslify. Old |
| **lygia** | **Prosperity Public License 3.0.0 + "Patron License"** ([LICENSE.md](https://github.com/patriciogonzalezvivo/lygia/blob/HEAD/LICENSE.md)): "use and share this software for noncommercial purposes for free and … try this software for commercial purposes for thirty days". The commercial licence is for sponsors and contributors only ([README](https://github.com/patriciogonzalezvivo/lygia/blob/HEAD/README.md)); npm metadata says the same ([npm](https://www.npmjs.com/package/lygia)) | commit 2026-09-14 | **Excluded.** The site is a business (OnySnow Studios), so the use is commercial. Free use needs sponsorship, which fails "nothing paid". Read for ideas only, never copy. (lygia.xyz/license reset the connection, so the Patron text itself was not read) |

**Decision: adopt** (vendor) stegu/webgl-noise as `.glsl.ts` strings, keeping
the MIT header. Implement any lygia-style helpers we want from the original
papers instead.

---

## 12. Should we adopt three.js, OGL, regl or twgl next to our engine?

| Library | Licence | Size | WebGL1? | Can it use **our** context? | Updated |
|---|---|---|---|---|---|
| **three.js** | MIT ([LICENSE](https://github.com/mrdoob/three.js/blob/HEAD/LICENSE)) | 736 kB min, **185 kB gz** ([bundlephobia](https://bundlephobia.com/package/three@0.186.1)) | **No**: "WebGL 1 is not supported since r163", and it throws if handed a `WebGLRenderingContext` ([WebGLRenderer.js](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js) lines 62, 103) | **No.** It would need a second (WebGL2) context: a second drawing buffer and texture set, and a second thing to lose on GPU reset, which is what `gl.ts` consolidated away | 0.186.1, 2026-09-24 |
| **OGL** | Unlicense (README "## Unlicense", [npm](https://www.npmjs.com/package/ogl); no LICENSE file in the repo) | Core 8 kB, total 29 kB gz ([README](https://github.com/oframe/ogl/blob/HEAD/README.md)); 34 kB gz ([bundlephobia](https://bundlephobia.com/package/ogl@1.0.11)) | Yes: tries WebGL2, falls back to WebGL1 (`Renderer.js` lines 43–45) | Only indirectly: `new Renderer({canvas})` calls `getContext` itself, and attaches state caches to `gl.renderer`. Pointing it at our canvas would return our context, but its caches would fight `beginPass` **(estimate)** | 1.0.11, 2025-01-27 |
| **regl** | MIT ([LICENSE](https://github.com/regl-project/regl/blob/HEAD/LICENSE)) | 117 kB min, 37.7 kB gz ([bundlephobia](https://bundlephobia.com/package/regl@2.1.1)) | Yes (a WebGL1 library) | **Yes**: "From a WebGL context", `regl({gl})`. But "you must call `regl._refresh()` if you have changed the WebGL state" ([API.md](https://github.com/regl-project/regl/blob/HEAD/API.md)) | 2.1.1, 2024-11-12 |
| **twgl.js** | MIT ([LICENSE.md](https://github.com/greggman/twgl.js/blob/HEAD/LICENSE.md)) | 78 kB min, **22.7 kB gz** ([bundlephobia](https://bundlephobia.com/package/twgl.js@7.0.0)), tree-shakeable | Yes, WebGL1 and 2 | **Yes**: plain helper functions that take any `gl` ([README](https://github.com/greggman/twgl.js/blob/HEAD/README.md)); no hidden state cache | 7.0.0, 2025-07-16; commit 2026-09-09 |
| PicoGL.js | MIT | 15 kB gz ([bundlephobia](https://bundlephobia.com/package/picogl@0.17.9)) | **No**, "a minimal WebGL 2 rendering library" ([README](https://github.com/tsherif/picogl.js/blob/HEAD/README.md)) | – | 2022 (stale) |
| luma.gl v9 | MIT ([LICENSE](https://github.com/visgl/luma.gl/blob/HEAD/LICENSE)) | – | **No**: "luma.gl v9 drops support for WebGL 1" ([docs/whats-new.md](https://github.com/visgl/luma.gl/blob/HEAD/docs/whats-new.md)) | – | 9.4.2, 2026-09-19 |

**Pros of three.js:** the ecosystem (quarks, drei, postprocessing,
three-pinata, mesh-bvh). **Cons:** it is WebGL2-only, so it can't share the
WebGL1 context. It adds 185 kB gz. It brings its own render loop, colour
management and tone mapping, which would differ from our optics. And every
ecosystem package we'd want it for (§4, §8, §10) turned out to be portable as
maths instead.

**Decision:**

- **Do not adopt three.js, OGL or regl into the engine.**
- **Adopt twgl.js as an optional helper** for the new passes. It is the only
  candidate that takes our context with no state cache, so it is compatible
  with `beginPass`. Import only the program, buffer, texture and framebuffer
  helpers (tree-shaken). Whether it is worth it over the engine's own helpers
  is a judgement call **(estimate: it saves boilerplate for render targets in
  §4, §6 and §10)**.
- Three.js stays allowed as a **reference** (MIT): port its shaders freely.
- **Revisit** if the engine moves to WebGL2. WebGL2 support is at 97.3%
  ([web3dsurvey](https://web3dsurvey.com/webgl2)), so that move is a
  separate, larger decision; it is not made here.

---

## Decisions

### By capability

| Capability | Choice | Package / source | Licence | Why (sources) |
|---|---|---|---|---|
| 1. Rigid bodies | **Adopt** | `@dimforge/rapier2d` 0.21.0, lazy-loaded (906 kB gz WASM, computed) | Apache-2.0 | One engine covers rigid bodies, joints (rope/spring), soft bodies and tearing ([TS CHANGELOG](https://github.com/dimforge/rapier/blob/HEAD/bindings/typescript/CHANGELOG.md)); fastest measured JS option ([Dimforge](https://dimforge.com/blog/2020/08/25/announcing-the-rapier-physics-engine/), [dev.to](https://dev.to/jerzakm/this-little-known-javascript-physics-library-blew-my-mind-57oo)); cannon-es is stale ([npm](https://www.npmjs.com/package/cannon-es)); Box2D v3 has no soft bodies ([README](https://github.com/erincatto/box2d/blob/HEAD/README.md)). **Spike the soft bodies first** |
| 2. Ropes / cloth / webs | **Adopt** Rapier soft bodies and rope joints; **port** the web layout | Rapier; [verlet-js spiderweb](https://github.com/subprotocol/verlet-js/blob/HEAD/examples/spiderweb.html) | Apache-2.0; MIT | Tearing built in (`tearStrain`, `World.tearSoftBody`). verlet-js already generates radials and spiral. Fallback: port [TMP 14-cloth](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/14-cloth.html) (MIT) |
| 3. Soft bodies / jelly | **Adopt** Rapier; **fallback port** TMP 10 | Rapier; [TMP 10-softBodies](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/10-softBodies.html) | Apache-2.0; MIT | Volume preservation, shape matching, deformable colliders for objects inside the jelly (0.21.0 typings). WebGPU demos don't fit ([holtsetio](https://github.com/holtsetio/softbodies)); TetSim has no licence ([README](https://github.com/zalo/TetSim/blob/HEAD/README.md)) |
| 4. Particles / fireworks | **Build** (CPU pool first, GPU later); **port** the GPU pattern | [skeeto/webgl-particles](https://github.com/skeeto/webgl-particles) for the GPU tier; [fireworks-js](https://github.com/crashmax-dev/fireworks-js) read for timing | Unlicense; MIT | Every library draws to its own canvas or needs three ([three.quarks](https://github.com/Alchemist0823/three.quarks/blob/HEAD/README.md), [tsParticles](https://github.com/tsparticles/tsparticles), [Proton](https://github.com/drawcall/Proton/blob/HEAD/README.md)); photoreal needs our HDR and bloom stage |
| 5. Drops on glass | **Port** | [raindrop-fx](https://github.com/SardineFish/raindrop-fx) simulation | MIT | WebGL2, and owns its own context, so it can't be adopted whole ([README](https://github.com/SardineFish/raindrop-fx/blob/HEAD/README.md)). Keeps the plan in [water-drops.md §6](water-drops.md) |
| 6. Water surface / caustics | **Port** | [evanw/webgl-water](https://github.com/evanw/webgl-water/blob/HEAD/water.js) | MIT | Already WebGL1 with float/half-float fallback (water.js lines 20–28). Renou (BSD-3) as a second reference |
| 7. Fire / flame | **Build** sprite + noise; **port** a sim only if needed | stegu noise; [TMP 21-fire](https://github.com/matthias-research/pages/blob/HEAD/tenMinutePhysics/21-fire.html) | MIT; MIT | Fire libraries are three-bound ([THREE.Fire](https://github.com/mattatz/THREE.Fire)). The TMP sim is CPU and renderer-free |
| 8. Gems / dispersion / opal | **Build**; **port** the maths | three.js dispersion ([chunk](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/transmission_pars_fragment.glsl.js)); Stam diffraction ([GPU Gems 8](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-8-simulating-diffraction)) | MIT; ideas | drei's material is three-bound, BVH-based and WebGL2-only (integer samplers, [source](https://github.com/pmndrs/drei/blob/HEAD/src/materials/MeshRefractionMaterial.tsx)). A convex gem can be ray-traced analytically on WebGL1 |
| 9. Shadows / 2D light | **Build** on the caster mask; **port** RC if R6 picks it | [jason.today/rc](https://jason.today/rc); [Sannikov](https://github.com/Raikiri/RadianceCascadesPaper); [PCSS](https://developer.download.nvidia.com/shaderlibrary/docs/shadow_PCSS.pdf); [Quilez](https://iquilezles.org/articles/rmshadows/) | MIT; MIT; paper; formula | No library fits: Pixi-bound ([pixi lights](https://github.com/pixijs/lights)), LGPL ([illuminated.js](https://github.com/gre/illuminated.js/blob/HEAD/LICENSE)), or engine-specific. R6 chooses the technique |
| 10. Bloom / tone map | **Port** | [PavelDoGreat bloom](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/HEAD/script.js); [Khronos PBR Neutral](https://github.com/KhronosGroup/ToneMapping); three.js AgX | MIT; Apache-2.0; MIT | Raw WebGL1 with half-float and the same context flags as ours. pmndrs/postprocessing needs three ([LICENSE](https://github.com/pmndrs/postprocessing/blob/HEAD/LICENSE.md): Zlib). Half-float rendering is at 99.3% ([web3dsurvey](https://web3dsurvey.com/webgl/extensions/EXT_color_buffer_half_float)) |
| 11. Noise | **Adopt** (vendor) | [stegu/webgl-noise](https://github.com/stegu/webgl-noise) | MIT | Maintained, GLSL ES 1.00. lygia is Prosperity (non-commercial, 30-day trial) ([LICENSE.md](https://github.com/patriciogonzalezvivo/lygia/blob/HEAD/LICENSE.md)): excluded |
| 12. GL helper | **Adopt** twgl.js (optional); **reject** three.js, OGL, regl, PicoGL, luma.gl | [twgl.js](https://github.com/greggman/twgl.js) | MIT | Only twgl takes our WebGL1 context with no state cache. three.js refuses WebGL1 since r163 ([WebGLRenderer.js](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js)); regl needs `_refresh()` after foreign state ([API.md](https://github.com/regl-project/regl/blob/HEAD/API.md)); PicoGL and luma.gl v9 are WebGL2+ |

### By task (the "done when" check)

| Task | Tools decided |
|---|---|
| 74 Balloons | Rapier 2D: a `disk` soft body with volume preservation for the latex, rope joints or a soft `rope` for the string, `cutSoftBody`/`tearSoftBody` for the pop; §4 particle pool for the shreds; our shaders for latex light and UV |
| 75 Spider webs | Rapier soft `polyline`/`rope` net with `tearStrain`; web layout ported from verlet-js (MIT); stegu noise for sway; dew drops as tiny lenses from the §5 drop shader |
| 76 Spray bottle | §4 particle pool for the spray; drops land in the raindrop-fx-derived drop map (port); R3 decides whether slime/blood need the TMP 17/18 grid sim (MIT) |
| 77 Water drops | Port raindrop-fx (MIT) into the WebGL1 engine ([water-drops.md §6](water-drops.md)) |
| 78 Water surfaces | Port evanw/webgl-water heightfield and caustics (MIT) |
| 79 Fire opal / quartz / crystal | Build: analytic convex ray trace + three.js dispersion maths (MIT) + Stam diffraction (ideas) + existing thin-film; needs the §10 HDR/bloom stage |
| 80 Jello / slime cube | Rapier soft body (volume + shape matching), suspended rigid bodies; our refraction shader. Fallback: port TMP 10 (MIT) |
| 81 Fireworks | Build: CPU particles → GPU tier ported from skeeto (Unlicense); §10 HDR/bloom; fireworks-js (MIT) read for timing |
| 82 Torch flame + flicker | Build: noise sprite (stegu, MIT) + flickering point light; TMP 21-fire (MIT) as a port fallback; §10 bloom |
| 83 Shadow puppets | Build on the caster mask; technique (PCSS search / SDF / radiance cascades port from jason.today, MIT) decided in R6 |
| 84 Broken glass, full | Rapier 2D rigid bodies for falling shards (the [glass-fracture.md §4](glass-fracture.md) candidates, now decided); three-pinata (MIT, [lib/LICENSE](https://github.com/dgreenheck/three-pinata/blob/HEAD/lib/LICENSE)) as a reference only, since it is three-bound; §4 particles for dust |

### Numbers to use

- Rapier 2D WASM: 2.40 MB raw, **906 kB gzip** (computed). Load it on the
  first interaction with a physics effect, never in the main bundle.
- Half-float render targets: available on **99.29%** of devices, 93.01% of
  Android ([web3dsurvey](https://web3dsurvey.com/webgl/extensions/EXT_color_buffer_half_float)).
  Keep an RGBA8 fallback.
- raindrop-fx budget reference: **2–3 ms for 600 drops** at 1080p, desktop
  ([README](https://github.com/SardineFish/raindrop-fx/blob/HEAD/README.md)).
- Bloom starting values (PavelDoGreat config): threshold 0.6, soft knee 0.7,
  8 iterations at 256 px.

### Lab controls this adds (to wire later)

- Physics: substeps; soft-body `tearStrain`; volume softness; gravity scale
  (helium lift).
- Bloom: threshold, knee, intensity, level count, quality tier
  (Jimenez / Dual Kawase).
- Tone map: Glass (current) / Film / PBR Neutral / AgX.
- Particles: CPU or GPU tier; max count.

### Still unknown

1. Rapier 0.21 soft-body **step cost on mobile**, and stability, for about 300
   web particles and one jello block. **This is the spike.**
2. Whether Vite 8 bundles the non-`-compat` Rapier WASM cleanly, or we need
   the larger `-compat` build.
3. Whether a 2D rigid body with a faked out-of-plane tumble reads as a real
   falling shard (R5 to judge), or whether `rapier3d` (1.17 MB gz more) is
   needed.
4. lygia's Patron licence text (lygia.xyz reset the connection). Irrelevant
   unless Ony wants to sponsor.
5. Zlib-licensed items (ammo.js, pmndrs/postprocessing, box2d-wasm) need Ony's
   OK if ever wanted. None is chosen above.

### Pages I could not read

- github.com web pages: 403 through the session proxy. Read via `git clone`
  and the npm tarballs instead.
- medium.com (Evan Wallace's and Renou's caustics write-ups): 403.
- shadertoy.com: 403 (as in [glass-fracture.md](glass-fracture.md)).
- bundlephobia: 429 after about 20 requests. The remaining sizes are computed.
- lygia.xyz/license: connection reset.
