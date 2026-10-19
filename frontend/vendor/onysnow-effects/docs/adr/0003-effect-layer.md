# ADR-0003: The effect layer

**Status:** Proposed
**Date:** 2026-09-22
**Deciders:** Ony

## Context

The site has accumulated a substantial real-time effect layer: a cursor light
with a lens flare, glass panels that answer that light, a shutter gesture with
synthesised audio, parallax scenes, bokeh fields and a scramble-text reveal.
Most of it was built feature by feature in response to how it looked, which is
the right way to build something whose whole purpose is how it looks — but it
means nobody has yet asked whether the parts fit together sensibly.

They mostly do. The gesture, the charge and the audio share one source of
truth; the glass shares one pointer listener and one layout pass; every
gradient-based fake has been replaced by something that computes the effect
rather than imitating it. Three things are genuinely wrong, and one of them
costs real money on real hardware.

The constraint that shapes all of this: the effects exist to make a
photography site feel like a camera. They are not load-bearing. Anything that
degrades should degrade to nothing, silently, and the page underneath must
remain a perfectly good website.

## Decision

Merge the two full-viewport WebGL passes into one, gate the whole effect layer
on the same capability check the gesture already uses, and let the render loop
sleep when there is nothing to draw.

## Options Considered

### Option A: Merge the two passes into a single shader and canvas

`CursorLight` and `GlassLight` each own a WebGL context and each rasterise a
full-viewport triangle every frame. They take the same inputs — light position,
charge, the site's two colours — and write into the same output space, both
compositing with `plus-lighter`.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — one shader grows, one component disappears |
| Cost | Halves fragment work and drops a GL context |
| Scalability | Scales with pixels, which is the dimension that hurts |
| Familiarity | Same techniques already in use |

**Pros:** `plus-lighter` is addition, and addition commutes, so the current
z-ordering between the two canvases carries no information — the result is
identical whichever order they composite in. That means there is no visual
reason for them to be separate passes. Merging halves the fill cost, removes
one of the browser's limited WebGL contexts, removes one composited layer, and
removes the duplicated boilerplate (context creation, shader compilation,
resize handling, uniform plumbing) that currently exists twice.

**Cons:** One larger shader is harder to read than two focused ones, and the
glass pass needs geometry uniforms the light pass does not. Losing the ability
to disable one independently.

### Option B: Leave them separate and reduce resolution instead

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — change one constant |
| Cost | Reduces fill, keeps two contexts and two layers |
| Scalability | Same shape of problem, smaller constant |
| Familiarity | Trivial |

**Pros:** A one-line change. Bloom is low-frequency and tolerates a lower
buffer well.

**Cons:** Does not address the duplication, the second context, or the second
composited layer. The sharp features — the diffraction spikes, the aperture
rim, the arris filament — are exactly what a lower buffer damages, so the
resolution cap cannot fall much further before the effects visibly soften.

## Trade-off Analysis

The fill numbers decide it. Each pass rasterises the whole viewport at up to
1.5× device pixels:

| Display | One pass | Two passes | At 60fps |
|---------|----------|------------|----------|
| 1440×900 | 2.9M | 5.8M | 0.35 G/s |
| 2560×1440 | 8.3M | 16.6M | 1.0 G/s |
| 3840×2160 | 18.7M | 37.3M | 2.2 G/s |

Those are not trivial shaders. The glass pass runs a fixed eight-iteration loop
with several `exp()` calls and a texture fetch per iteration, for every
fragment, including the large majority of fragments nowhere near any glass. On
a 4K display that is over two billion fragment invocations per second for an
effect nobody asked for, and the failure mode is not a dropped effect — it is a
janky page.

Option B treats the symptom. Option A removes the duplication that causes it,
and the argument that they must stay separate turns out to be false: additive
compositing is order-independent, so the two canvases were never encoding a
layering decision in the first place.

Worth being explicit about what is NOT wrong, so it does not get "fixed" later:
the two-pass structure is not a performance mistake in the way separate CSS
layers would be, because both are already single draw calls. The cost is fill,
not draw calls, and the fix is to stop paying for the same pixels twice.

## Consequences

- One shader file owns everything the light does, which matches how the effect
  is actually reasoned about — the glass response IS the cursor light, seen
  landing on something.
- Halved fill cost, one fewer WebGL context, one fewer composited layer.
- The shader becomes long enough to need section markers, and a future effect
  that genuinely needs to composite non-additively would have to be separated
  out again.
- We will need to revisit the resolution cap once the passes are merged: with
  half the cost, 1.5× may no longer be the right ceiling.

## Defects found in the same review

Three of these are independent of the decision above and should be fixed
regardless.

**The effect layer runs on devices that can never use it.** `CursorLight` and
`GlassLight` gate on `prefers-reduced-motion` only. `CustomCursor`, which owns
the gesture, additionally requires `(pointer: fine)` — so on any touch device
the charge is permanently zero while two WebGL contexts are still created and
two animation loops still run forever. That is pure battery cost on exactly the
hardware least able to afford it.

**The render loop never sleeps.** Both loops re-arm unconditionally and then
early-return when unlit. The page wakes 60 times a second to decide it has
nothing to do, which also prevents the browser from idling the compositor. The
loop should stop when the charge reaches zero and restart on the first non-zero
charge report.

**Context loss is unhandled.** Neither canvas listens for `webglcontextlost`.
A GPU reset, a driver update or a background tab under memory pressure leaves a
permanently dead canvas with no recovery and no fallback.

Two further observations that are judgement calls rather than defects:

The surface atlas is 2048×2048 RGB with mipmaps deliberately disabled — around
12MB of texture memory, and minification aliasing at small panel sizes. Mipmaps
cannot be enabled while the four surfaces share one texture, because a minified
level blends neighbouring cells together. If the aliasing becomes visible, the
fix is four separate textures or a WebGL2 texture array, not mipmaps.

`glassGeometry` performs a `getBoundingClientRect` per panel per frame while
lit, cached for 8ms. That is a forced layout every frame during a charge. It is
currently fine at five panels and would not be at fifty; if panel count grows,
cache the rects and invalidate on scroll and resize rather than re-reading.

## Action Items

1. [x] Gate `CursorLight` and `GlassLight` on `(pointer: fine)` as well as
       reduced motion
2. [x] Let both render loops sleep at zero charge and wake on the first
       non-zero report — `lib/gl-loop.ts`, woken by `pointermove`, which is a
       complete signal because the charge can only rise from pointer motion
3. [x] Handle `webglcontextlost` / `webglcontextrestored` on both canvases —
       restoration re-runs the whole effect rather than keeping a second
       recovery path in step with the setup path
4. [ ] Merge the two passes into one shader and one canvas
5. [ ] Re-tune the resolution cap once merged
6. [ ] Revisit the atlas if minification aliasing becomes visible in use

### Note on item 4

The fill argument that decided this has since changed. `GlassLight` no longer
rasterises the viewport: it draws once per pane, scissored to that pane's box,
because refraction needs each pane's own photograph as a texture and a shader
cannot pick a sampler by loop index. So the duplicated full-viewport cost the
table above was measuring no longer exists — only `CursorLight` is still a
full-screen pass, and it has to be, because a flare's ghosts march across the
whole frame.

Merging is therefore no longer a performance fix. It would still remove a GL
context, a composited layer and a pile of duplicated setup, which is worth
something, but it is now a tidiness argument rather than a cost one and should
be re-justified before anyone spends the time.
