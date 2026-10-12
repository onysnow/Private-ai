# ADR-0009: Rain Noir's effects come from the OnySnow Studios site

**Status:** Accepted (2026-10-12)
**Date:** 2026-10-12
**Deciders:** Ony ("the rain/light/glass/shadow effects are all already built in the OnySnow-studios GitHub, so use that code"), Claude

## Context

The redesign (chapter 03 and §04.11) gives Rain Noir an effects pack: bokeh lights on the board, a rain pane over the case-home hero, film grain, the iris when a whole-screen feature opens, shutter corners on save, a steady neon title on an opened Textbook flag, and frosted glass panels. It asks for a decision record before porting the effects engine. The site's code is in `onysnow/onysnow-studios` (public; Ony's own work, no licence file, so no third-party terms apply to copying it here).

What the site holds, read on 12 Oct 2026 (shallow clone of the default branch):

- `src/components/site/BokehField.tsx`, `CameraIris.tsx`: self-contained React and CSS/SVG.
- `ShutterFlash.tsx`, `Neon.tsx`: their look is CSS (`.shutter-frame`, `.neon__tube`, `.neon__gas` in `src/styles.css`); their code also feeds the site's light engine (`effects/light`), which the workbench does not need.
- `WaterDrops.tsx` (2,746 lines), `Glass.tsx`, `GlassLight.tsx` (1,199 lines): the rain on glass and the glass panes, built on `src/effects/` (about 21,000 lines: a shared WebGL compositor, scheduler, quality tiers, light model, water simulation). Their imports are all inside the site; no npm package is needed for them.

## Decision

1. **Now (done):** port the CSS/SVG effects as they are, in `frontend/features/effects/board-effects.tsx` and `frontend/styles/effects.css`: BokehField (replacing the workbench's own gradient imitation), the 8-blade CameraIris (played when the reading room opens), the shutter frame (brackets only, played when evidence is saved), and the neon tube and gas layers (steady, never flickering; off by default, as the research says). Tilt Neon is added as a bundled font (SIL OFL 1.1, per ADR-0008). Each has its own switch in Settings › Appearance; Effects Off removes all, Effects Light keeps the still ones, Calm motion and the computer's reduced-motion setting stop the moving ones.
2. **Next (to approve):** port the WebGL engine (`src/effects/engine`, `light`, `optics`, `water`, `camera`, `materials`) with WaterDrops for the case-home rain pane and Glass for frosted panels, as a separate module behind the same switches, loaded only in Rain Noir with Effects Full, sleeping when hidden and in calm zones (reading room, tables, Chain of Custody). The site's own photograph behind the glass becomes the reporter's choice (research §04.11 innovation 1).

## What was done (12 Oct, later)

Ony, 12 Oct: "Don't just import the rain and window or glass stuff, import the entire effect system for now; later I'm gonna build a separate library of components that I will port instead." So step 2 became bringing in the whole system rather than picking parts of it:

- `frontend/vendor/onysnow-effects` holds the site's `src/effects`, every effect component, the lib files they use, the effects' stylesheet, its docs, research, tools and source art. The files they load are in `frontend/public`. The README there lists each change made to fit the workbench: the import alias, Next's environment, the admin gate, no outside fetches, the bundled neon font, and `--fx-*` colour tokens. Its 79 test files run with the frontend's.
- New packages: `framer-motion`, `@dimforge/rapier2d-compat` 0.21.0, `html-to-image`.
- BokehField, CameraIris and Neon are now the system's own components. `board-effects.tsx` only places them.
- The rain pane is `features/effects/rain-pane.tsx`. The case title band is the system's `Pane`, standing over the reporter's own photograph, and `WaterDrops` rains on it. The engine rains only where a photograph is behind the glass. The photograph is chosen in Settings › Appearance and kept in this browser's IndexedDB, as decoration (innovation 1). The workbench sets the system's `typeOnGlass` to 0, so the water is drawn under the words.
- Still to do: the frosted panels as the system's `Glass` and `GlassLight`, and the still "after the rain" frame under Calm motion.

When Ony's separate component library exists, it replaces `frontend/vendor/onysnow-effects`. The workbench reaches the system only through `@fx/` imports in `features/effects/` and `lib/hero-photo.ts`.

## Consequences

The four ported effects need no new package beyond the font. The engine port is large; it is copied from code Ony already runs, so the work is in fitting it to the workbench's surfaces (panels instead of site bands) and keeping text unaffected, not in writing it.
