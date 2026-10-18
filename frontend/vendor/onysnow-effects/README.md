# The OnySnow Studios effect system, as the workbench carries it

This folder is the whole effect system from Ony's site, `onysnow/onysnow-studios`. It was copied at commit
`489a1cf3710e6fef8abf9bd9c7456d200002f220` on 12 Oct 2026, because Ony asked for "the entire effect system for now".
Later he will build a separate library of these components and port that instead (ADR-0009). Until then,
this folder is that library. Change it here only to fit it to the workbench, and record each change below.

## What is here

| Folder | From the site | What it is |
|---|---|---|
| `effects/` | `src/effects/` (all of it) | The engine: `engine` (shared WebGL context, compositor, scheduler, quality tiers, previews), `light`, `optics`, `materials`, `scene`, `camera`, `water`, `webs`, `balloons`, `fireworks`, `secrets`, `tools`, `adapters`, `react` (`Pane`, `Stack`) |
| `components/site/` | `src/components/site/` (the effect components) | `WaterDrops`, `Glass`, `GlassLight`, `GlassSolid`, `GlassSection`, `FloorLight`, `CursorLight`, `PhotoLights`, `TransmittedLight`, `RasterGlass`, `BrokenGlass`, `BokehField`, `CameraIris`, `ShutterFlash`, `Neon`, `Vignette`, `Magnifier`, `Flashlight`, `FlareTorch`, `FlareOverlay`, `FireTorch`, `LaserBeam`, `GrazingLaser`, `BlackLightScene`, `GlowPaint`, `SprayBottle`, `Hammer`, `ToolTray`, `CustomCursor`, `PlasticBevel`, `Balloons`, `Fireworks`, `SpiderWebs`, `RedRoom`, `HangingPrint`, `FreeSurfaces`, `ParallaxScene`, `Reveal`, `ScrambleText`, `EyeDropper`, `GlassFilters`, `GlassToggle`, and `Img` (which `ParallaxScene` and the scene use) |
| `lib/` | the `src/lib/` files those import | The shaders (`glass-light-shader`, `floor-light-shader`, `cursor-light-shader`), `tuning`, `gl-loop`, `glass-*`, `bevel-*`, `shutter-*`, `rooms`, `site-assets`, `page-burn`, `app-ready`, `photo-url`, `utils`, and the vendored `liquidglass` library (MIT; see `lib/liquidglass/NOTICE.md`) |
| `effects.css` | `src/styles.css`, line 183 to the end | Every rule the effects use |
| `docs/` | `docs/` (the effect documents), `docs/adr/0003-effect-layer.md`, `docs/research/` | How the rain, light, glass and broken glass are designed, and the research behind them |
| `tools/`, `art-source/` | `tools/`, `art-source/` | The offline fracture simulator, the drop-lens table generator, and the source art for the rooms and glass textures |
| `../../public/` | `public/` (`breaks`, `cracks`, `flares`, `glass-shards`, `rooms`, `rooms-hdr`, `sfx`, `water`, `glass-*.jpg`) | The files the effects load, at the same addresses as on the site |

The site's own pages and business parts (the header, footer, gallery, forms, admin portal, Supabase, router) are not copied.
`FILES.txt` lists every source file that was copied.

## How it is wired

- The site's `@/...` imports are written as `@fx/...`. `tsconfig.json` and `vitest.config.ts` map `@fx` to this folder.
- Its 79 test files run with the frontend's tests (`npx vitest run vendor/onysnow-effects`).
- ESLint skips this folder, because it keeps the site's own style. TypeScript checks it.
- Libraries it needs that the frontend did not already have: `framer-motion` (`Reveal`, `ParallaxScene`),
  `@dimforge/rapier2d-compat` 0.21.0 (`Balloons`) and `html-to-image` (`page-burn`, for `ShutterFlash`).

## What was changed to fit the workbench

1. Every `@/` import became `@fx/`.
2. `import.meta.env.DEV`, which is Vite's, became `process.env.NODE_ENV !== "production"`, which is Next's.
3. `lib/admin-gate.ts`: the site keeps its `?try=` switches for its signed-in admin, through Supabase. The workbench has
   no sign-in to the site, so the switches open only on the dev server at localhost. The workbench turns effects on
   through its own Settings › Appearance, not through `?try=`.
4. `lib/photo-url.ts`: the site serves photographs from its Supabase bucket. Here the base address comes from
   `NEXT_PUBLIC_PHOTO_BASE`. That is unset, so nothing is fetched from outside the computer.
5. `components/site/FreeSurfaces.tsx`: TanStack Router's `useLocation` became Next's `usePathname`.
6. `components/site/Neon.tsx`: Tilt Neon is bundled (`@fontsource/tilt-neon`, ADR-0008), so the site's request to
   Google Fonts is removed.
7. `effects.css`: the site's colour tokens are read as `--fx-*`, because the workbench already uses `--background`,
   `--primary` and the rest for its own themes. The `--fx-*` tokens default to the site's values. Tailwind v4's
   `@utility image-vignette` is a plain class, and `@layer components` is the native cascade layer `fx-components`.
   The site's Tailwind theme and base layer, its lines 1–182, are left out, because they would restyle the whole app.
8. Two tests read files by path: `effects/optics/edge-side.test.ts` reads `effects.css`, and
   `effects/optics/fracture-library.test.ts` reads `public/breaks` one folder further up.
