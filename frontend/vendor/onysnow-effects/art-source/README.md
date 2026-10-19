# Reflection sources

The rooms the glass reflects, in `public/rooms/`. Each is a photographed
equirectangular HDRI, cropped and graded by the pipeline below.

The 4K `.hdr` originals are NOT in this repository — they are ~25MB each and
would dwarf everything else in it. They are Poly Haven assets and can be
re-fetched by slug at `https://polyhaven.com/a/<slug>`.

| Room | Poly Haven slug | Exposure target |
|------|-----------------|-----------------|
| `metro` | `metro_noord` | 0.07 |
| `aquarium` | `ushaka_sea_world_aquarium` | 0.07 |
| `studio` | `ferndale_studio_12` | 0.048 |
| `lobby` | `newman_lobby` | 0.07 |
| `fireplace` | `fireplace` | 0.07 |
| `station` | `env-station-night.exr`, in this folder | 0.07 |

All Poly Haven assets are CC0 — public domain, no attribution required, free to
redistribute. That matters beyond this site: the effect layer cannot ship as a
sellable component while it carries assets whose licence cannot be passed on,
which is exactly the problem `public/glass-surface.jpg` still has.

## The pipeline

1. **Crop** rows 0.215–0.755 of the equirect. The horizon — eye level for
   someone standing in the room — is at exactly 0.5, so this band is centred
   just above it. A pane reflects a little more of what is above you than
   below, but not the two-thirds of ceiling an uncentred crop takes.
2. **Resample to 1280 wide in LINEAR light.** Averaging gamma-encoded pixels
   averages the wrong quantity and bleeds energy off every bright edge.
3. **Bake the halation.** Threshold at 2.0, Gaussian blur at σ = 5, 15 and 45,
   weighted 0.5 / 0.32 / 0.18, added back at 0.55 — all before tonemapping.
   This is the step an LDR source cannot do: a JPEG's lamps are clipped to 1.0,
   so blurring them spreads nothing. These lamps are 50–400,000× white, so the
   falloff around them is the lens's rather than a drawn gradient.
4. **Auto-expose** by bisection until the graded median luminance hits the
   target above, then Reinhard `c/(1+c)` — the same curve the shaders use, so
   the reflection and the cursor light roll off together. One target across
   the set means no room arrives brighter than another.
5. **Desaturate to 0.62**, gamma encode, JPEG at q88.

Rooms are chosen by measurement, not by eye: auto-expose every candidate to the
same median, then keep the ones that still carry 0.5–3% of pixels above 0.5.
Below that there is nothing to recognise; above it the room fogs the panes.
`penguin_museum` was cut on this test — its daylight windows read as a room in
daytime — as were `comfy_cafe`, `warm_restaurant_night` and `moon_lab`, which
kept 0.02–0.17% and went essentially black.

## The HDR rooms the glass reflects (`public/rooms-hdr/`)

Since 2026-09-26 the glass shader reflects the room from these, not from the
graded JPEGs above (those still feed the photographs' paper sheen). Built by
`art-source/rooms/build_hdr_rooms.py` from the same Poly Haven originals at 2k
(CC0) plus `env-station-night.exr`: same crop, resampled in linear light to
2048 x 512, exposed to a median of 0.18 (photographic middle grey -- a room lit
like the screen), and log-encoded so the lamps keep their real brightness
through an 8-bit JPEG. See the script's header and `src/effects/optics/
environment.ts`.
