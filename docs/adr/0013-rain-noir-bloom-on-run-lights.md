# ADR-0013: Rain Noir's bloom on the AI run's lights is its own small WebGL layer

**Status:** Accepted (2026-10-18)
**Deciders:** Ony ("if it needs built according to our design research then build it"), Claude

## Context

Research AI §4 "Theme" (mockup AI_1): "In Rain Noir the lights read as out-of-focus highlights on a wet board; an
optional WebGL bloom only there (SYN_AI B5.3, [ADR])". Watch the run draws its travelling lights in SVG
(`features/ai/watch-the-run.tsx`). Rain Noir's other effects come from the vendored OnySnow Studios system
(ADR-0009), whose WebGL compositor (`vendor/onysnow-effects/effects/engine`) is built around glass panes: it renders a
pane's own layers, and its bloom is the lit edge of a pane.

## Decision

- **A canvas of its own, not the compositor.** `features/effects/run-bloom.tsx` lays one canvas over the map and draws
  each light in flight as additive, Gaussian-edged point sprites with a short tail (one draw call a frame, two
  shaders, about 100 lines, no new package). It follows the same quadratic path and the same timing as the SVG light,
  read through the SVG's own transform, so zoom and the drawer opening keep it aligned. The colours are the theme's
  status tokens, read at mount.
- **The andon rule:** verified steps and findings glow dimmer with three tail sprites; problems (in between,
  stopped) glow at full strength with six.
- **When it draws:** only in Rain Noir, with Effects Full, motion Normal, the computer not asking for reduced motion,
  WebGL available, and its switch on ("Bloom on the AI run's lights" in Settings › Appearance, a named effect like the
  others; on by default in Rain Noir, off with one switch). Under Calm there are no travelling lights at all, so no
  bloom. The loop is `requestAnimationFrame`, which sleeps while the tab is hidden.
- The SVG lights stay underneath and carry the meaning; the bloom adds nothing a reader needs (no information only in
  the glow), so screen readers, the log (L) and Calm lose nothing.

## Consequences

- When Ony's separate component library replaces `vendor/onysnow-effects` (ADR-0009), this layer can move onto its
  compositor if that gains a point-light pass; nothing else depends on it.
- A WebGL context is created per mounted map. The browser reclaims it with the canvas; the layer never forces a
  context loss (a forced loss broke React's double mount in development).
