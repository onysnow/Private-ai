# Rain on glass: what 117 photographs show

Built 2026-10-04 from 117 photographs of rain on glass (Wikimedia Commons, Unsplash, Pexels; free licences, used for study only, none ship on the site). Each photo was analysed drop by drop, stream by stream and empty patch by empty patch; ids rNNN refer to the table at the end.


Source: the 117 per-photo analyses in `out/r001.json … r117.json`. Nothing here goes beyond what those files say.

**How to read the citations**
- `r011#3` means photo r011, crop 3. The crop number is the 1-based position in that file's `crops` list. To see it, open `out/r011_sheet.jpg` and find tile 3.
- A bare id such as `r047` means the claim comes from that file's text (shape_stats, notable, optics, surprises and so on), not from one particular crop.
- Counts such as "N of 117" are photo counts. They come from tallies over the JSON fields, with some keyword matching and some manual classification of the free text. Treat them as ±a few. Where a count only reflects how often a feature was *mentioned*, the text says "mentioned in".
- Sizes are given as % of image width, as the files give them. The per-photo image width was taken as the largest x seen in that file's boxes.

---

## 1. Set overview

| Property | Count | Ids / notes |
|---|---|---|
| All usable | 117/117 | `usable=true` in every file |
| House/building/shop/office window | 61 | e.g. r011, r041, r053, r117 |
| Car/vehicle side or rear glass (incl. bus/tram) | 27 | r001, r008, r017, r019, r035, r046, r060, r070, r101, r104, r115 … |
| Windshield/windscreen | 8 | r002, r004, r010, r020, r021, r025, r037, r059 |
| Aircraft window | 5 | r015, r016, r036, r038, r050 |
| Skylight/roof glass | 1 (+r104 car roof/rear glass) | r093 |
| Gondola (acrylic) | 1 | r022 |
| Unidentified pane | 12 | r005, r018, r023, r051, r066, r067, r069, r082, r083, r109, r110, r112 |
| Orientation vertical (stated or inferred) | ~86 | |
| Inclined (windscreens, oblique car glass) | 7 | r010, r020, r021, r025, r037, r059, r070 |
| Near-horizontal | 3 | r003, r093, r104. Horizontal is also suggested for r018, r077, r083 |
| Orientation unknown | ~21 | r002, r004, r005, r023, r033, r034, r047, r051, r054, r063, r066, r068, r069, r077, r082, r100, r109, r110, r112 … |
| Daylight (almost all overcast) | 85 | Direct sun only in r006 (faint disc). Side light giving hard speculars in r012 and r013 |
| Dusk / low light | 20 | r036, r048, r050, r055, r057, r061, r067, r068, r072, r078, r079, r084, r103, r105, r112, r113 … |
| Night (only bokeh lights behind glass) | 12 | r014, r049, r063, r074, r075, r080, r081, r085, r095, r098, r107, r108 |
| Photos with ≥1 stream/rivulet | 30 (117 streams in all) | r007, r014, r017, r021, r022, r032, r036–r039, r041, r049, r065, r067, r071, r073–r075, r079–r081, r088, r090, r098, r102, r103, r106, r107, r115, r117 |
| Photos with ≥1 trail entry | 67 (154 trails) | Dotted bead lines in 36, faint wet tracks in 28, thin clear lines in 27 |
| Static drops only (no streams, no trails) | 48 | e.g. r001, r003, r005, r018, r047, r066, r072, r083, r092 |
| Fog / condensation on the glass | 2 | r087, r088 |
| Micro-droplet mist layer between drops | 5 | r046#5, r075#7, r080#6, r107#2, r073#5 (band only) |
| Continuous water film / sheet regions | 5 | r021#12, r026#5, r041#3 (film-wide rivulet), r051#9 (drying lace), r117#6 (sheet with drip legs) |
| Drop count per frame | median ~1500 (30 … 20000) | ≤300 drops: 14 photos (r002, r005, r015, r028–r034, r060, r069, r078, r090). ≥3000: 29 photos |

---

## 2. Drop sizes and density

### 2.1 The speck carpet and its share
- **Specks dominate the count.** The first (tiny-speck) class in `size_distribution` has a median share of **55%** of all drops (range 25–95%). It is ≥50% in **87/117** photos, ≥60% in 48 and ≥70% in 20. Typical speck size is <0.3–0.5% of width (1–8 px). See r001#7, r011#10, r062, r116.
- Specks **fill the gaps between larger drops** at 1–3 speck diameters. This is stated in **44** photos, e.g. r001, r003#10, r062, r083, r092#9, r116. r062 says there is "effectively no clean glass".
- **Bimodality.** In some photos there is an explicit gap between a micro class and a medium class: r011 has "few drops in the 10–14 px range", 93% micro plus 2% medium. Bimodality is also stated for r003, r035, r077, r099 and r105. r099 has many specks plus 3% large drops at 5–16% of width.
- **Largest drop per photo** (upper bound of the largest size class) has a median of **~4% of width**. It is ≤1.5% in 10 photos (drizzle and mist: r009, r025, r061, r073, r075, r080, r087, r092), 1.5–2.6% in 22, 2.6–4% in 36, 4–7% in 29, 7–12% in 11 and >12% in 8. The >12% group is macro or near-horizontal glass: r002 (46% dumbbell), r003, r004, r005, r054 (to 20%), r069, r093 (25% puddle), r099.
- **Visible specks depend on the background.** They show over dark areas and vanish over bright sky in r012, r013, r020#6–#8, r058#7 and r072#8. r031 and r032 note that dust specks are also visible only over dark backgrounds.

### 2.2 Halos and fringes around big drops (two opposite observations)
- **Clear halo** (specks absent around a medium or large drop): r011#7 (3–6 px micro-free halo), r046#2/#3 (mist-free ring 10–20 px), r072 (clear zone ~1 diameter), r093 (10–25 px sparse margin around the giant drop), r099#7 (0.2–0.5 diameter halo containing only specks). That is **5 photos**.
- **Speck fringe / satellites hugging the rim:** r001 (ring of specks at 0.5–1 diameter), r002 (specks within 5 px of rims), r003 (every big drop fringed by a ring of micro-droplets, r003#5), r023 (specks within 2–5 px), r040 (satellites within 0.3 diameter), r066#8 (5–15 specks within 2–4 radii), r077#9, r091#1 (satellites 3–5 px from a large drop), r109 (specks to 3–5 px). That is **9 photos**.
- The files attribute the halo to absorption by coalescence (r003, r011, r046, r093, r099). The halo cases are a dense micro carpet or mist (r011, r046) or very large drops (r093, r099).

### 2.3 Gradients
- Most photos describe the density as **uniform or near-uniform**. Poisson-like is stated for r018. "No lanes, no gradient" is stated for r042, r045, r047, r050, r072, r083, r092, r096, r109 and others.
- **Vertical density gradient (count):** 5 photos. Count increases downward in r021 (≈10x, sparse sky to film), r026, r061 (3–5x, r061#8 vs r061#10) and r077 (r077#8). Count decreases downward in r106 (bottom 15% nearly empty, r106#4).
- **Horizontal density gradient:** r012 and r013 (2–3x left to right), r052, r055 and r101 (dense tiny drops near the frame edge, r101#9).
- **Size gradient:** 13 photos. Vertical: larger toward the bottom in r001, r085 (1.5x), r098 and r099. Larger toward the top in r003, r037, r038 and r114. Across the pane in r024, r052, r055, r082 and r101.

### 2.4 Columns, lanes, clusters
- **Vertical bead columns or lanes** organise the drop field in **~23 photos**: r011#1, r014#9, r031, r044#2, r049, r052#8, r053#6, r057, r067#5, r071, r075, r076#1, r079, r081#6, r084#6, r087#1, r102#4, r105#3, r106#7, r107, r108#6, r114#8. Non-vertical aligned rows appear in r019 (wind arcs, r019#2), r025 (wiper arcs, r025#1), r033 (diagonal) and r104 (slanted bands, r104#4).
- Between columns the density is **reduced but not zero**. r076 gives about half. r053 has 80–100 px near-empty bands (~5% of width).
- **Clustering / patchiness:** r066 (specks clouded around medium drops), r084#5/#7 (clumps with 30–80 px voids), r092 (5–10 drop clumps), r104 (bands 40–110 px wide), r012, r030, r034, r090, r100, r111.

### 2.5 Spacing and contact
- "Drops do not touch / no merging" is stated in **65** photos. Typical gaps are 1–4 diameters. Sparse light rain has 2–6 diameters: r010, r031, r044, r111.
- Touching or merged drops are reported in about 30 photos. They are mostly dense or wet regimes: r003 (packed polygons, r003#6), r026, r051, r071, r098 and r094. Near-touching pairs that **stay separate and round** appear in r018#3, r047#5, r084#3, r089#7 and r091#1.

---

## 3. Drop shapes: taxonomy

Overall, the median share of round or near-round drops in `shape_stats` is **45%**. Shapes are **≥80% round in only 14 photos**: r018, r025, r047, r049, r056, r061, r066, r067, r072, r073, r084, r087, r092, r093, r099. They are **≤20% round in 24 photos**: r002, r012, r013, r015, r017, r021, r026, r028, r030–r034, r048, r050, r051, r054, r059, r071, r103–r106, r112.

The mostly-round photos have small drops (max ≤2.5% of width: r049, r061, r072, r073, r084, r092), horizontal or unknown glass (r018, r047, r093) or "fresh beading" (r056). The mostly-irregular photos have large pinned drops (r002, r005, r015, r054), side-lit pinned drops (r012, r013), oblique views (r021, r029, r033, r059, r104), drying film (r051) or heavy wetting (r026, r071).

**Size rule.** Irregularity grows with size. Small drops are round and medium or large drops are irregular in r001, r005, r023, r040, r042, r077, r082, r089, r110 and r024 (small drops 85% round, medium drops 30% polygonal). The thresholds stated are: non-round above ~1% of width (r001, r089), irregular above ~2% (r023, r097), above ~3% (r040, r048, r077, r082) and above ~5% (r005).

| Shape | Mentioned in | Size where seen | Orientation / notes | Examples |
|---|---|---|---|---|
| Round / circular | all; ≥80% share in 14 | specks to ~4% (r018 up to 90 px) | — | r018#1, r047#10, r066#1, r084#4 |
| Egg / light-bulb (narrow top, heavy bottom) | ~23 | medium 1–5% | widest at 55–70% of height (r011); narrow end up | r011#5, r011#7, r020#1, r113#7 |
| Teardrop, **tip up** (narrow top, fat bottom; "gravity teardrop", bullet, acorn) | ~43 photos say this is the main teardrop form | small–medium, 1–4% | tip up, often tilted 15–45° on car glass | r032#3, r053#2, r072#2, r079#2, r108#1, r111#3, r114#4, r070#1 |
| Teardrop, **tip down** / inverted teardrop / shield / inverted triangle | ~16 notable; dominant in ~6 (r016, r031, r048, r055, r090, r112) | medium–large | point at the bottom, sometimes off-centre | r016#3, r031#1, r023#2, r039#3, r096#4, r112#1, r097#6 |
| D-shape / half-dome / flat-top (straight top, round bottom) | flat or straight top mentioned in ~48 | medium–large; up to 45% of large drops in r015 | flat edge at the **top** | r006#4, r007#5, r015#5, r040#6, r053#9, r103#1, r109#5 |
| Polygon (pentagon, hexagon, octagon, trapezoid, kite, diamond, rounded square) with straight facets | ~45 photos with explicit polygonal medium/large drops | ≥1–1.5% of width; up to 45% of medium drops (r012, r040); ~35% (r111); 20–25% (r010, r054, r057, r083) | corners 3–6, rounded with radius 15–25% of size (r003) | r003#4, r010#4/#6, r024#3, r041#6, r057#1, r084#1, r091#2, r111#1/#4 |
| Rounded polygons packed edge-to-edge (honeycomb) | 1 | 2–5% | only at >70% wet coverage | r003#6 |
| Tulip / cat-ear / horns / crown (flat or concave top with 2–3 points) | 15 | medium 1.5–8% | points on the **upper** edge | r017#4, r053#1, r064#7, r079#1, r097#1, r103#4, r111#2, r116#3 |
| Kidney / bean (one concave dent) | 24 | medium–large | dent mostly on the upper or side edge (r036: "dented upper edges") | r005#2, r007#2, r031#2, r036#6, r038#4, r077#1, r082#4 |
| Peanut / dumbbell / figure-8 / snowman / vase (two lobes and a neck) | ~25 | medium to giant (r002: 46% of width) | neck 30–50% of lobe size (r002, r064); larger lobe at the bottom (r085, r097); vertical or horizontal | r002#1, r037#2, r064#2, r085#3, r097#7, r109#7, r116#1, r117#1 |
| Comma / hook / question mark / cane / J | ~40 notable | small–medium | tail or hook usually upward over bright sky (rim-only glyph, r035#1). Stalled drops have tails toward the lower right (r013) | r001#2, r008#1, r013#2, r035#1, r113#1, r115#3, r031#4 |
| Crescent / claw / boomerang / banana (true shape, not optics) | ~15 | medium | two horns | r017#10, r039#5, r041#5, r097#3, r105#1, r111#5, r115#7 |
| Heart / V-bottom | 14 | small–medium | V point at the bottom | r012#5, r041#2, r045#5, r112#1 |
| Star / splat / branched / spikes / needle arms | ~20 | medium; merged | flat or drying regimes | r042#1, r051#1/#2, r064#3, r085#2, r040#7 (hair spike), r010#10 (serrated rim) |
| Lens / eye / lemon / almond / spindle (pointed ends) | very common, partly an oblique-view effect | all | lateral points on inclined glass | r002#7, r021#2, r037#3, r043#1, r052#5, r082#6, r113#5 |
| Wide flat lens / lip / moustache (aspect 1.5–5, wider than tall) | ~30 | medium–giant | horizontal ±30°; flat or wavy underside | r007#9, r033#1, r034#1, r054#3, r096#9, r097#4, r112#5 |
| Chevron / V / gull / bird | ~20 shapes, more as optics | small–medium | arms up | r026#1, r045#1, r029#1 |
| Pill / slug / capsule / rod / slab (parallel sides) | ~30 | small–medium, aspect 1.6–6 | vertical on vertical glass | r011#4 (aspect 3.2), r015#4, r057#7, r076#4 (aspect 6), r108#7, r114#1 |
| Slivers / dashes / hairlines | ~60 mentions | aspect 3–10 | diagonal or vertical. Parallel "combs" in r039#9 | r001#10, r031#3, r100#3, r114#2 |
| Pendant / bottle / goblet (body plus neck plus bulb) | ~15 | medium | bulb at the bottom = onset of sliding | r028#2, r048#4, r054#5, r096#1, r030#1 |
| Drop with thin tail or thread hanging below | ~12 | small–medium | tail 0.5–2x drop height, 1–5 px wide | r006#2, r065#1/#2, r113#2, r096#3, r013#1 (tail ends in a bead) |
| Satellite pinched off below a drop | 2 | — | — | r028#1, r031#6 |
| Lacy patch with dry holes / ring / network | 3 | 3–6% | — | r024#1, r051#1, r051#7 |
| Giant flat puddle (rectangular, V cusp, flattened segments) | 3 | 15–25% | horizontal glass | r003#1, r003#3, r093#1 |
| Small cusp at the downhill edge with a rim break | 1 | medium–large | — | r093#2 |

**Where corners and points sit.**
- **Upper edge** (flat, straight or concave top, corners, horns or tip up, with a smooth round bottom): stated in **~32 photos**. Examples: r001, r002, r010, r015, r017, r023 ("top outlines are where corners, notches and points occur"), r040, r041, r053, r079 ("Points, corners and dents belong on the UPPER edge"), r089, r096, r103, r111, r116.
- **Lower edge** (flat, straight or V bottom, point at the bottom): **~12 photos**: r003 (flat bottoms where packed), r012 (straight lower edge tilted ±15°), r013, r028, r030, r031, r033, r034, r039, r048, r093 (cusp), r112. Six of these (r028, r030, r031, r033, r034, r112) are low-contrast scenes where **only the lower outline is visible** and the top edge fades out.

**Elongation direction.**
- On vertical house windows elongation is vertical: r011 (always vertical), r057, r102, r105, r108 (aspect 1.3–4 at the bottom, r108#7) and r114.
- On car side glass, elongated drops share a tilt: r019 (wind, diagonal or horizontal), r035 (15–30°), r070 (tips up-right, r070#9), r101 (10–20°), r068 (20–45°) and r100 (comet tails all down-right).
- Horizontally elongated drops appear even on vertical panes in r042 (10%), r085 (horizontal worms, r085#5) and r105#7.

**Teardrop direction conflict.** Tip-up dominates (~43 photos). Tip-down or sagging occurs mainly where drops are about to slide or are sagging: r006 (top 15% of the pane), r054#5 (pinched lower tail), r090 ("as they begin to slide"), r113#2. It also occurs as static shields: r031, r040#3, r111#6 (shield point up in r111).

---

## 4. Streams / rivulets (117 streams in 30 photos)

**Width relative to the image.** Per-stream median width is **0.62% of width** (IQR 0.40–1.17%, range 0.16–3.4%).
- Hair-thin streams of 2–5 px: r022#10, r037#1, r065#9, r073#1, r103#2.
- The widest are film-like streams: r041#3 (~3.4%), r036#1 (35–40 px), r032#1 (wet track 35–40 px).

**Width relative to drops.** In **29/30** photos the median stream width is smaller than the largest static drop. The median ratio of largest drop to stream width is **~3.7**: r014 6–14 px streams vs 27 px heads, r022 3–5 px vs 30 px drops, r037 and r038 ≈15x.

**Width profile, top to bottom** (manual tally of all 117):

| Profile | Streams | Examples |
|---|---|---|
| Roughly constant, local bulges only | **81** (69%) | r014 (#7), r049#2, r065#9, r080 (all 5), r098, r117 (all 9) |
| Widening downward | 16 | r017 (2.5x, r017#1), r014 st3, r036 st5 (abrupt 10→35 px, r036#1), r102 st1 (3→15 px, r102#1), r107 st2 |
| Constant, then widening into the head (last 5–10%) | 6 | r022 st1/st4 (wedge, r022#6), r039 st1, r041 st5/st11, r049 st3 (r049#3) |
| Narrowing downward | 7 | r036 st1 (25→5 px, r036#3), r041 st1 (100→50 px), r088 (fog lanes, r088#4), r090 st3/st4 (runs widest at the top, r090#2) |
| Non-monotonic (thin–wide–thin, head–neck–foot) | 7 | r007#1, r032#1 (wide track, 20 px neck, fat head), r036 st2/st3, r067#2 (widens over the first 30%, then constant), r107 st3 |

**Path.**
- 90 streams are wavy, zigzag or kinked. 22 are described as straight: r080 (all five perfectly straight and vertical), r079, r088, r090, r102, r117 st3–5.
- Wander amplitudes are ±3–25 px, with direction changes every 10–25 px (r065: jogs 2–6 px) up to every 60–250 px (r014, r081). For example r014 has ±25 px every 60–150 px; r117 has ±3–5 px with period 80–150 px.
- **Sideways steps or kinks:** r017#3 (50 px ledge), r074#4 (5–8 px steps), r081#1 (sharp 45° kink with a 10 px knot), r117#4 (S-kink with a fat hanging body).
- **Lean:**
  - House windows: ≤5° (r067 1.5°, r074 3.5°, r117 2–2.7°, r102 5°).
  - Car or oblique glass: 8–20° (r049 10°, r090 8–15°, r107 8–20°, r115 12–15°, r088 10–15°).
  - Parallel tracks lean a shared 10–25° in r078#6.

**Edges.**
- 49 streams have toothy, scalloped, beaded, segmented or serrated edges: r017#1 (bumps 2–6 px every 10–20 px), r074#1 (serrated right edge), r036#2.
- 58 have smooth edges.
- The common look is an asymmetric pair: **one bright edge line and one dark edge line, with an interior close to the background**. This is described in r014, r022, r041, r049, r065, r071, r074#3, r081, r115 and r117 ("glass rod").

**Start.**
- **52** start mid-pane as a hairline or faint line with no visible source drop: r014#3/#10, r036, r079#6, r102#1, r117#11.
- 39 enter from the top edge.
- 23 start at a drop or merged cluster: r041#7/#10, r067#1 (cluster of 2–3 drops, 3 px neck), r074#2, r098, r106#2.
- In r014#3 a detached bead sits just above a blunt stream top.
- In r117 a new runner starts just below an older stream's head.

**End and head drop.**
- 50 run off the bottom edge, 24 fade out, 4 merge into another stream, and 13 end otherwise. The other endings are a splayed foot with two toes (r041#8), a drop cluster (r071#4), a bead chain or ladder (r049#6, r081#4/#5) and an elongated bulge (r049#3).
- **26 end in a head drop.** Head width / stream width has a **median of 2.0** (n=24, range 0.8–9):
  - 1.2–1.5x: r041#3, r117#2.
  - 2–3x: r022, r038#5, r049#4, r102#1, r115#2.
  - 3.5x: r014#1.
  - 5x: r075#2.
  - 8–10x: r079#6 (hairline into a triangular flat-bottom head).
- Head shapes: pear with a necked bead above it (r014#1), lumpy and taller than wide (r022#5), elongated with a pointed bottom (r039#2), bulging to one side and hooked (r032#1), flat-bottomed triangle (r079#6), capsule (r078#2).
- r041#3 has "no constriction". r115#2 has "a short dark constriction".

**Branching and merging.** 24 streams involve merges or splits:
- Y/V merges: r014#4, r038#5, r049#1, r098#5. Merged width is ~1.2–1.4x one branch (r049, r098).
- Split and rejoin around a loop or island: r014#2, r107#2.
- Parallel bundles near the frame: r022#8, 20–40 px apart.
- T-blob: r117#8.

**Beading and breakup.**
- Streams break into dotted lines: r049#6.
- Ladders of transverse bars: r081#4/#5.
- Dashed edge pairs at an early stage: r036#1.
- Periodic bulges every 12–30 px: r071#3, r074#1.
- Knots of 2–3x width: r117#7.
- Continuity: 99 streams are continuous and 15 are broken or faint.

**Margins / lanes beside streams.**
- Wide drop-free lanes of 2–5 stream widths in **4 photos**: r014 (15–40 px), r017#1 (60–120 px band), r049 (150 px strip), r067#3 (lane ≈2.5x stream width).
- Narrow margins of about 1 width or a few px in 7 photos: r022#10 (2–5 px), r074 (3–6 px), r075 (2–4 px mist-free), r081 (5–10 px), r098#5, r115#1 (5–15 px), r117 (5–10 px).
- **No lane** at all in r036#4 and r041 ("specks continue right up to the stream edge").

**Multiplicity.**
- Parallel streams 20–60 px apart: r065#9 (10–15 streams on a 650 px pane), r073#1 (1–2 px tracks every 5–8 px), r080#3.
- In r117, streams are every ~100–250 px across the width.

---

## 5. Trails (154 trail entries in 67 photos)

**Dotted bead lines (36 photos).**
- Beads are 2–8 px, sometimes 8–25 px (r044#2), with spacing 6–40 px. That is about 2–5 bead diameters; r087 gives a gap of 1–1.5 diameters.
- Lines are **straight and vertical on house windows**: r014#6, r044#2, r049#5, r076#1, r087#1, r102#4, r108#6, r114#8.
- They are curved or diagonal when wind, wipers or wiping act: r019#2 (25–55°), r025#1 (wiper arcs, 15–30 px pitch), r055#8 (arcs), r087#2/#6 (fan-shaped wiped lines).
- Beads are often stretched 1.2–2x along the line: r038#7, r080#2, r087#1, r102 TR3, r108 TR2.
- Bead size can vary smoothly along a line (r087#6) or decrease downward (r029#9).
- Lines are 8–15 px apart (r087), 10–40 px apart (r076) or 35–120 px apart (r102).
- Most have **no head drop and no stream** (r014, r044, r076, r087, r108, r114). One stream turns into a bead line at its lower end (r049#6).
- Some are visible only where they cross a bright background: r095#2.

**Lane bead columns.** In r011#1/#8 full-height clear lanes 25–55 px wide each hold a single file of beads that are much larger than the carpet (15–34 px), 0.4–0.6 of the lane width, spaced 35–250 px.

**Bead chains directly under a drop.** 1–3 beads in a straight vertical line at ~0.5–0.7 of the parent width: r033#5, r034#6, r029#9.

**Broad micro-bead bands.** Bands 60–130 px wide of micro-bead clouds rather than single lines: r105#3.

**Faint wet tracks (28 photos).**
- Pale or slightly darker bands 6–40 px wide with soft edges, often wider than the drop that made them (r078#3). Contrast is only a few grey levels.
- Often they are visible only over bright backgrounds: r032#2, r039#1, r098#3, r061#1 ("only visible against bright background").
- They end in a head drop at the downhill end: r033#3, r034#7, r069#6, r078#2, r117#9.
- They wiggle with S-bends and widen ~2x downward (r039#1). They lean 10–25° (r078) and can converge in a V onto one head (r078#1).
- In fog the tracks are dark cleared lanes (r088#4). In mist they are clean lines through the mist (r075#3).

**Thin clear lines (27 photos).**
- Hairlines of 1–4 px: r004#6, r037#8, r101#2.
- Short tails under a drop: r090#6 (lollipop), r057#8.
- Some lines are **not water** (scratch, hair): r081#9, r105#8, r109#8.

**Residue at stalled drops.**
- Lumpy wet smear above a stopped drop: r079#1.
- Jagged residue crown on a stalled runner: r102#2.
- Dried residue rings: r053#7, r069#7.

**Wiper and wiping.** r025#1/#4/#9 (curved bead arcs, wiper smear line), r087#2 (wiped region with slanted bead lines and smear).

---

## 6. Empty areas

There are 188 empty-area entries in 98 photos. By `likely_cause`:
- **Apparent emptiness (drops present but not visible)**: 62 areas in 49 photos. Causes are a dark background, low contrast over uniform bright sky, or defocus. Median area width is **~25% of image width**.
  - Over bright uniform sky: r020#8, r027#10, r043#8, r110#9 ("not empty… almost no contrast"), r031#8.
  - Over black: r080#8, r103#8, r071 (bottom), r064#10 (only smile arcs), r027 ("lower third looks dry although surely wet").
  - Defocus: r029#11, r035#7, r042#7, r052, r090#10.
- **Just sparse (chance gaps)**: 71 areas in 49 photos, median width ~18%. Examples: r005#10, r015, r028#11, r032#11, r091#9, r100#10, r111#9.
- **True swept lanes**: narrow, with a median width of **~5% of image width**. They are full-height and sharp-edged with beads inside in r011#1 (25–55 px, transition <5 px), r053#6 (80–100 px), r067#5 (20–25 px, with no stream visible) and r084#6 (40 px). There are lanes beside streams (§4) and smooth film lanes in r051#8 (~3% of width). Fog lanes are in r088.
- **Absorption halos**: r003, r011, r046, r093, r099 (§2.2).
- **Not glass / occluded**: r022 frame, r060#9 past the pillar, r102 plant, r101 door, r061#9 second dry pane.

---

## 7. Optics

**Inverted image rule.** The drop interior shows the background inverted and minified.
- "Invert" appears in the optics text of **88** photos. Inverted miniatures are visible in r002, r005#5, r007#6, r015#5, r044#1, r053#5, r063#2, r068#3, r077#5, r109#3 and r116#4.
- **Content from below the drop appears in its upper part.** r007 shows orange from the railing below at the top of drops. r081#2 has orange caps from lights below. r112#5 shows the dark frame below as dark drop tops.
- A horizon becomes a sharp straight split, **dark above and bright below**: r056#5, r068#3, r086#1, r094#4. Jagged tree lines appear in r077#5 and r097#1.
- The split height varies with the drop's position relative to the horizon: r094#10.
- A diagonal horizon appears rotated 180°: r019#1, r082#7.
- Several files describe a **point inversion** (both axes): r019, r044, r082, r086.
- Stated minification is ~3–10x: r016, r020, r113.
- Some sampling reaches **outside the frame**. r091 has a red object from below the frame. In r029 the rim colour comes from an out-of-frame scene.
- Exceptions:
  - Interiors are smooth and brightened, with no visible image, in r099, r100 and r105.
  - Flat drying film gives emboss shading instead of refraction in r051#9 and r071#11.
  - Drops on fogged glass act as clear holes in the fog in r087#4.

**Polarity follows the background.** Drops are **darker than bright regions and brighter than dark regions**. ~89 photos describe this.
- Clear examples: r009#2, r020#3/#5, r026#5, r061#7, r062#11, r086#1, r092#1/#2, r106#1/#5, r116#6/#7/#8 (three regimes in one photo).
- Drops sitting on **bright lamp or bokeh discs turn dark**, not bright, in 21 photos: r063#1, r072#3, r079#8, r095#3, r098#1, r108#5.
- Over a mid-tone lawn, drops are darker than the lawn: r116#8.
- The rest are mostly uniform backgrounds: r011, r028, r029, r033, r034, r066, r083, r089.

**Visibility.**
- Over uniform bright sky, a drop collapses to a thin dark arc, cap or crescent. Many tiny drops look like "C", "(" or "?" glyphs: r008#5, r035#1, r043#2, r052#10, r056#4, r076#7, r110#3.
- Over dark backgrounds, only a bright lower crescent, U, smile, V or gull-wing shows: r030#7, r041#4, r045#6, r054#8, r064#10, r070#4, r103#3, r006#7.
- r070 has a separate bright bar at the top in addition.

**Rim asymmetry.** The dark rim is almost never a uniform ring.
- It is heavier on the **upper side in ~59 photos** and on the **lower side in ~23** (r011#7, r012#1, r013#4, r023#1, r031, r033#1, r034#2, r067#7, r112#1). It is mainly lateral in ~7 (r047#1, r060, r082#9, r089, r114).
- Thickness on the heavy side is 10–40% of drop height. The light side is ~1 px or missing.
- Rim thickness ratios stated: top 15% vs bottom 5% of radius (r066#1), bottom 3–5x top (r011), 1:4 around the circumference (r093#4).
- The heavy side is **set by where the dark part of the scene lies**, not by a light direction:
  - r082: "its side is set by where the dark background lies".
  - r067: the rim flips to the bottom because the background is dark at the top.
  - r099 and r056: the heavy side changes across the frame (r099#6, r099#9).
- A single global lighting asymmetry was seen in r047, with a dark right rim and a bright caustic crescent *outside* the lower-left edge (r047#1).
- Doubled or triple rim lines on large drops: r023#1, r069#5, r091#1, r093#1.
- Chromatic rim fringes: r029#3 (navy/amber bottom rims), r043#2, r069#5.

**Highlights.**
- Under overcast light, **50 photos explicitly have no point speculars**. The "highlight" is a broad bright lower crescent or lower half (the refracted sky). It occupies 15–50% of the drop height and is mentioned in ~86 photos: r045#3, r053#2 (15–20% of radius), r116.
- Point speculars appear when point lights or side light exist. They are coloured by the light:
  - Upper-left: r001, r022, r066#9, r091.
  - Right side: r012#4, r013#4 (up to 30–40% of the face over black).
  - Bottom: r079 (orange sparks), r084#1 (25–35% of diameter), r101#3, r108#4.
  - Paired blobs under the top rim: r050#2.
- Specular shapes copy the light source: rectangular window reflections in r097#2/#8, 2–3 vertical stripes in r074#7, U/V side prongs in r075#5.
- A bright band along the long axis appears for reflection-dominated glass in r104#1.

**Colour pulled from elsewhere** (22 photos).
- Blue interiors over a yellow background: r057#9.
- Red drops on a white disc (adjacent red light): r098#1.
- Cyan highlights over amber: r075#6.
- No orange inside drops over an orange bokeh: r090#4, r095#3.
- Cyan tint everywhere: r102.
- Glass tint (green) inside drops: r060.
- Rainbow or spectral bands near a light source: r026#6/#7.

**Streams' look.** Streams read as transparent tubes, with one bright and one dark edge line and the background shifted inside: r014#5, r017, r049, r065, r117#10.
- Dark cracks with lit edges, or ladders: r081#2.
- Dark channels through a glowing micro-film: r107#2/#6.
- Contrast can flip between adjacent background bands: r080#1.

**Fog and mist.**
- On fog, drops and tracks are clear windows that are **darker** than the milky fog over a bright sky: r087#4, r088#4.
- Mist is visible as grain over bright areas and is erased by runners (r075#3). It is visible mainly over dark areas in r046#5.
- Out-of-focus point lights seen through a drop coat become crescents: r080#5.

**Halos outside drops.** Soft grey halos of 8–12 px over a dark background appear in r097#2/#10 and a lit speck halo around a lamp in r072#7. The thin bright halo in r008 is sharpening.

---

## 8. Camera effects

- **Depth of field.** 64/117 photos have only part of the glass in focus, in a band or strip: r001#7, r025, r035, r049, r060 (vertical strip), r070, r086, r100, r114. Defocused drops become:
  - soft rimless discs: r001#8, r035#6, r086#6, r109#9, r114#9/#10, r042#7;
  - hollow rings: r025#4, r108#9, r101#7;
  - half-moon or cat-eye crescents: r098#9, r107#4;
  - split V/W lobes: r063#6;
  - doubled outlines: r031#10;
  - wavy ripple texture: r035#7.
- **Oblique / grazing views** (~15 photos) foreshorten drops:
  - horizontal dashes with aspect 2.5–5: r004#5;
  - crescents with aspect 4–8: r029;
  - slivers with aspect 3–8: r059#8;
  - lens 2–3 plus dashes 6–10: r100;
  - vertical spindles with aspect 2–6 when the glass recedes sideways: r060#2.
  Perspective also creates apparent density and size gradients (r054, r060, r077).
- **Processing artefacts — do NOT copy:**
  - painterly ridges inside drops (r040);
  - HDR or clarity edge exaggeration (r036, r089, r096);
  - sharpening halos (r008, r051);
  - motion-blur dashes (r058);
  - posterisation and a text overlay (r006);
  - JPEG blocking (r080);
  - film grain or noise (r009, r027, r042);
  - colour grades (r001 teal, r113 teal-magenta, r094 sepia).
- **Non-water features — do NOT treat as rain:**
  - dirt or dust: r006#8, r030#3, r031#9, r067#9;
  - straight scratches or hairs: r037#8, r081#9, r105#8, r109#8;
  - tape and stickers: r026#10, r057#10;
  - wire mesh: r043;
  - frit dots: r046#6;
  - a background pole that looks like a rivulet: r048#8;
  - background striations: r096#2.

---

## 9. Contradictions and regime differences (and what the files say decides them)

1. **Streams widen vs constant vs narrow.**
   - Constant in 81/117 streams: thin streams in steady rain or at night, e.g. r014, r049, r065, r080, r117.
   - Widening in 22: wide, toothy streams on car glass (r017), late runners (r102) and the head approach (r022).
   - Narrowing in 7: film-like upper parts (r036#3, r041#3), fog-cleared lanes (r088) and short runs on car glass (r090).
   - The files tie widening to wider/faster runners and narrowing to a broad film feeding a thinner channel. Widening is not universal: r036 says "do not force widening".
2. **Lanes beside streams vs none.**
   - Wide lanes appear with a single rivulet in a sparse field (r067), wide streams (r017) or old runner lanes in a micro carpet (r011, r053).
   - There are no or tiny lanes in dense heavy rain with thin streams (r022, r036, r041, r117). r041 says "for slow-film streams".
3. **Clear halo vs speck fringe around big drops** (§2.2). A halo comes with micro carpets, mist or giant drops (coalescence). A fringe comes with ordinary static fields.
4. **Teardrop tip up vs down.**
   - Tip up is the static or left-behind form (r076: "residue of a drop that moved downward"; r079 "point always UP").
   - Tip down, a neck or a tail below marks sagging or onset of sliding (r006, r054#5, r090, r113#2).
5. **Corners on top vs bottom.** Corners are on top in ~32 photos. The bottom cases are mostly low-contrast scenes where only the lower outline is visible (r028–r034, r112) or pinned drops with dark lower lips under side light (r012, r013).
6. **Dark rim on top vs bottom.** The rim follows where the dark part of the scene is refracted (r067 vs r066; r082). With bright sky above dark ground the dark band is at the top. With a dark top and light bottom, or a dark frame below, it is at the bottom.
7. **Round vs irregular regimes.** Round comes with small drops, horizontal glass and fresh beading (r018, r056, r066, r084, r092). Irregular comes with large pinned drops, oblique views, drying film or heavy wetting (§3).
8. **Density gradient direction.** Count increases downward in r021, r026, r061 and r077, and decreases in r106. Larger drops sit at the bottom in r001, r085 and r098, and at the top in r003, r037, r038 and r114. Most photos (≥55) are uniform.
9. **Heads vs no heads.** Only 26/117 streams end in a visible head. Most run off-frame or fade. Head size also ranges from 1.2x with no neck (r041) to 9x (r079).
10. **Apparent vs real emptiness.** Large empty-looking areas (median ~25% of width) are usually visibility effects. Real swept lanes are narrow (~5% of width) and sharp-edged (§6).

---

## 10. GENERATOR RULES

Format: rule — *support: photos* — **importance**.

1. Make specks (<0.5% of image width) the majority of drops: target ~55% (allowed 45–95%), at ≥1500 drops per frame in typical rain. — *87/117 have ≥50% specks* — **must**
2. Fill gaps between medium drops with specks at 1–3 speck diameters. Do not leave clean glass in dense regimes. — *44* — **must**
3. Cap the largest static drop at ~4% of width by default (drizzle ≤1.5%, macro or horizontal glass up to 15–25%). — *116 (median of per-photo maxima)* — **should**
4. Keep static drops separate: gap 1–4 diameters (2–6 in sparse light rain). Let near-touching pairs stay round rather than merge automatically. — *65 "do not touch"; r018, r047, r084* — **must**
5. Make roundness depend on size. Drops <~1% of width are round. Above 1–3% of width make ≥50% non-round. Keep the overall round share ~45% (≥80% only for small-drop or horizontal-glass presets). — *≥10 explicit; median 45%* — **must**
6. Put irregularity (flat or concave top, 1–3 corners, horns, notches, tip) on the **upper** edge and keep the lower edge a smooth convex arc. — *~32 vs ~12 for the opposite* — **must**
7. Build polygonal outlines for medium and large drops: 3–6 rounded corners (corner radius 15–25% of size) plus 1–2 straight segments, for 20–45% of drops >1.5% of width. — *~45* — **should**
8. Make teardrops narrow-top / fat-bottom (tip up). Use tip-down, necked or tailed shapes for only ~5–15% of medium drops, as sliding onset. — *~43 tip up vs ~16 tip down* — **should**
9. Include ~5–15% two-lobed merged drops (dumbbell, peanut, figure-8) with a neck 30–50% of lobe size, larger lobe at the bottom. — *~25* — **should**
10. Include a small share (each 2–10%) of kidney (concave dent), tulip/horned, comma/hook, crescent and slug/pill (aspect 1.6–6) shapes. — *15–40 each* — **should**
11. On vertical glass, elongate ~25–35% of medium drops vertically (aspect 1.2–2, widest at 55–70% of height). On car glass apply a shared tilt of 15–45° to all elongated drops. — *r011, r057, r108; r019, r035, r068, r070, r101* — **should**
12. For oblique views, scale drop height by 0.25–0.5 (aspect 2–8) and draw dark only on the upper edge. — *~15 (r004, r029, r059, r060, r100)* — **should**
13. Render each drop interior as a vertically inverted (or point-inverted), 3–10x minified background sample taken several radii away. Content below the drop must appear in its top. — *88* — **must**
14. Drop polarity must follow the sampled background: darker than bright regions, brighter than dark regions, split dark-top/bright-bottom at horizons. — *~89* — **must**
15. Drops lying on a bright lamp or bokeh disc must render dark (silhouette plus tiny spec), not bright or tinted. — *21* — **must**
16. Over uniform bright background, drop contrast must be <~10%: show only a thin dark arc or cap (C, "(", "?" glyphs for tiny drops). — *~25 (r035, r043, r052, r056, r110 …)* — **must**
17. Over dark backgrounds, show only a bright lower crescent, U or smile (10–40% of height). Hide the body and the upper outline. — *~19 explicit plus many polarity cases* — **must**
18. Draw a one-sided dark rim, 10–40% of drop height on the heavy side and ≤1 px opposite. Place it on the side that refracts the dark part of the scene (top when the ground is dark below). Never use a uniform ring. — *59 top + 23 bottom + 7 lateral* — **must**
19. Add a broad bright lower crescent or band (15–50% of height) as the main "highlight". Under overcast light add no point speculars. — *86 crescent; 50 no-specular* — **must**
20. Add point speculars only when point lights exist: 1–3 per drop, 1–6 px, coloured by the light, positioned by light direction, copying the light's shape. — *~25 (r012, r050, r074, r079, r097, r108)* — **nice**
21. Allow drop interiors to carry colour from lights or regions elsewhere (not the pixel behind the drop). — *22* — **should**
22. Streams are optional: enable them in ~25% of scenes. When on, place 1–15 per frame, spaced 20–250 px, sometimes in parallel bundles. — *30/117* — **should**
23. Stream width ≈0.4–1.2% of image width (median 0.6%), ~3–4x narrower than the largest static drops. — *117 streams; 29/30 photos* — **must**
24. Keep stream width roughly constant down its length (±50%, local knots allowed). Widen only ~20% of streams (up to 2.5x). Taper some (wide top → thin). — *81 constant / 22 widen / 7 narrow / 7 mixed* — **must**
25. Stream paths: ±3–25 px wander, with direction changes every 10–150 px plus small 2–6 px jogs. Lean ≤5° on house windows and 8–20° on car or oblique glass. Add occasional sideways steps of 2–4 widths or sharp 45° kinks with a 2x knot. — *90 wavy/kinked; r017, r074, r081* — **must**
26. Start ~45% of streams mid-pane as a hairline with no source drop, ~35% off the top edge and ~20% from a drop or merged cluster (via a 3 px neck). — *52 / 39 / 23* — **should**
27. Ends: ~45% off-frame, ~20% fade, ~22% head drop. Head width ≈2x stream width (range 1.2–9x), taller than wide, optionally with a necked bead or a wedge in the last 5–10%. — *26 heads, median 2.0* — **should**
28. Render streams as transparent tubes with one bright edge line and one dark edge line and a slightly shifted background inside. ~40% of streams get toothy or beaded edges (bumps 2–6 px every 10–20 px). — *49 toothy; rod look in ≥10* — **must**
29. Allow Y/V merges (merged width 1.2–1.4x a branch) and occasional split-and-rejoin loops (15–30x width long). — *24 streams* — **nice**
30. Default lane beside a thin stream = ~1 stream width (2–15 px) cleared of medium drops, specks allowed. Use wide lanes (2–5 widths) only for wide or isolated runners. — *7 narrow + 2 none vs 4 wide* — **should**
31. Leave dotted bead trails: vertical columns of 2–8 px beads spaced 2–5 diameters, beads stretched 1.2–2x along the line, columns 10–120 px apart, often full height and with no head. Make density between columns about half. — *36* — **should**
32. On car glass bend trails along wind (20–60° from vertical). On wiped windshields lay bead arcs at 15–30 px pitch concentric with the wiper. — *r019, r025, r087* — **nice**
33. Add faint wet tracks: 6–40 px bands at 2–5% contrast, visible only over bright background, wiggling, ~2x wider at the bottom, ending in a capsule head drop. — *28* — **should**
34. Old runner lanes without a visible stream: full height, sharp edges (<5 px), 1.5–2.5x runner width (≈2–5% of width), holding a single file of beads 0.4–0.6 of the lane width. — *r011, r053, r067, r084* — **nice**
35. Around large drops choose by regime: in micro-carpet or mist presets carve a clear halo of 3–20 px (0.2–0.5 diameter). In ordinary fields scatter satellite specks within 0.3–1 diameter. — *5 halo vs 9 fringe* — **should**
36. Default density uniform with mild random clustering. Optionally add a vertical count gradient (3–10x) or a size gradient (~1.5x) across the pane. — *≥55 uniform; 5 count, 13 size gradients* — **nice**
37. Do not create large truly dry areas. Large empty-looking regions must come from visibility (contrast or defocus), not from removing drops. Real cleared lanes stay narrow (~5% of width). — *49 visibility vs swept lanes median ~5%* — **must**
38. Depth of field: support a focus band or strip. Defocused drops become rimless soft discs (brighter than a dark background, invisible over a bright one), rings, or half-moon crescents near point lights. — *64* — **should**
39. Optional mist layer of 1–4 px near-touching droplets that brightens or grains the background. Runners must erase it, leaving clean or dark channels. — *r046, r073, r075, r080, r107* — **nice**
40. Fogged-glass preset: a milky diffuse layer in which drops and tracks are clear windows (darker than fog over a bright scene) and bead trails have no head. — *r087, r088* — **nice**
41. Rare film sheets in wet zones: smooth regions with toothy tops and 2–4 drip legs ending in small heads, or lumpy film at the bottom of a pane. — *r021, r026, r041, r117* — **nice**
42. Horizontal-glass preset: no streams, ~85–95% circular drops, giant flat puddles up to 25% of width with flattened segments and a small downhill cusp. — *r018, r093, r003* — **nice**
43. Treat each framed pane as an independent water field. Trails stop at frame edges, and drops near a frame edge are smaller and denser. — *r073, r061, r101* — **nice**
44. Never reproduce processing artefacts (sharpening halos, HDR ridges, motion dashes, JPEG blocks, posterisation) or non-water marks (scratches, hairs, dirt, stickers) as rain features. — *~20* — **must**


## Sources

| id | title | source | licence |
|---|---|---|---|
| r001 | File:Focus on raindrops on a car window.jpg | https://commons.wikimedia.org/wiki/File:Focus_on_raindrops_on_a_car_window.jpg | CC BY 2.0 |
| r002 | File:GGB reflection in raindrops.jpg | https://commons.wikimedia.org/wiki/File:GGB_reflection_in_raindrops.jpg | CC BY-SA 3.0 |
| r003 | File:Mini puddles; Drops of water on the window pane after heavy rain. | https://commons.wikimedia.org/wiki/File:Mini_puddles;_Drops_of_water_on_the_window_pane_after_heavy_rain.jpg | CC BY-SA 4.0 |
| r004 | File:Raindrops (2636437499).jpg | https://commons.wikimedia.org/wiki/File:Raindrops_(2636437499).jpg | CC BY 2.0 |
| r005 | File:Raindrops (5400016139).jpg | https://commons.wikimedia.org/wiki/File:Raindrops_(5400016139).jpg | CC BY 2.0 |
| r006 | File:Raindrops (6864313938).jpg | https://commons.wikimedia.org/wiki/File:Raindrops_(6864313938).jpg | CC BY 2.0 |
| r007 | File:Raindrops DBOY.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_DBOY.jpg | CC BY-SA 4.0 |
| r008 | File:Raindrops in Car Window.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_in_Car_Window.jpg | Public domain |
| r009 | File:Raindrops in PEI (35070437752).jpg | https://commons.wikimedia.org/wiki/File:Raindrops_in_PEI_(35070437752).jpg | CC BY 2.0 |
| r010 | File:Raindrops on Bus Window.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_Bus_Window.jpg | CC BY-SA 4.0 |
| r011 | File:Raindrops on a window.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_a_window.jpg | CC BY-SA 4.0 |
| r012 | File:Raindrops on a window in Brastad 2.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_a_window_in_Brastad_2.jpg | CC0 |
| r013 | File:Raindrops on a window in Brastad 3.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_a_window_in_Brastad_3.jpg | CC0 |
| r014 | File:Raindrops on a window with vibrant bokeh lights creating an artis | https://commons.wikimedia.org/wiki/File:Raindrops_on_a_window_with_vibrant_bokeh_lights_creating_an_artistic,_abstract_effect.jpg | CC BY-SA 4.0 |
| r015 | File:Raindrops on airplane.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_airplane.jpg | CC BY-SA 3.0 |
| r016 | File:Raindrops on airplane 2.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_airplane_2.jpg | CC BY-SA 3.0 |
| r017 | File:Raindrops on car window.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_car_window.jpg | CC BY-SA 2.0 |
| r018 | File:Raindrops on gray.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_gray.jpg | CC0 |
| r019 | File:Raindrops on my car window.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_my_car_window.jpg | CC BY-SA 4.0 |
| r020 | File:Raindrops on my windshield.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_my_windshield.jpg | CC BY-SA 4.0 |
| r021 | File:Raindrops on taxi glass.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_taxi_glass.jpg | CC BY-SA 3.0 |
| r022 | File:Raindrops on the Window of a Gondola, With Sun Moon Lake in the B | https://commons.wikimedia.org/wiki/File:Raindrops_on_the_Window_of_a_Gondola,_With_Sun_Moon_Lake_in_the_Background.jpg | CC0 |
| r023 | File:Raindrops on the glass.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_the_glass.jpg | CC BY-SA 4.0 |
| r024 | File:Raindrops on the window (19122141269).jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_the_window_(19122141269).jpg | CC BY 2.0 |
| r025 | File:Raindrops on windshield in Kent, Washington.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_windshield_in_Kent,_Washington.jpg | CC0 |
| r026 | File:Water on the windows.jpg | https://commons.wikimedia.org/wiki/File:Water_on_the_windows.jpg | CC0 |
| r027 | File:Another macro shot of raindrops, Kyiv, Ukraine, 14 June 2026.jpg | https://commons.wikimedia.org/wiki/File:Another_macro_shot_of_raindrops,_Kyiv,_Ukraine,_14_June_2026.jpg | CC0 |
| r028 | File:Behind the window, Esbjerg, 10.jpg | https://commons.wikimedia.org/wiki/File:Behind_the_window,_Esbjerg,_10.jpg | CC BY-SA 2.0 |
| r029 | File:Behind the window, Esbjerg, 12.jpg | https://commons.wikimedia.org/wiki/File:Behind_the_window,_Esbjerg,_12.jpg | CC BY-SA 2.0 |
| r030 | File:Behind the window, Esbjerg, 17.jpg | https://commons.wikimedia.org/wiki/File:Behind_the_window,_Esbjerg,_17.jpg | CC BY-SA 2.0 |
| r031 | File:Behind the window, Esbjerg, 20.jpg | https://commons.wikimedia.org/wiki/File:Behind_the_window,_Esbjerg,_20.jpg | CC BY-SA 2.0 |
| r032 | File:Behind the window, Esbjerg, 23.jpg | https://commons.wikimedia.org/wiki/File:Behind_the_window,_Esbjerg,_23.jpg | CC BY-SA 2.0 |
| r033 | File:Behind the window, Esbjerg, 3.jpg | https://commons.wikimedia.org/wiki/File:Behind_the_window,_Esbjerg,_3.jpg | CC BY-SA 2.0 |
| r034 | File:Behind the window, Esbjerg, 4.jpg | https://commons.wikimedia.org/wiki/File:Behind_the_window,_Esbjerg,_4.jpg | CC BY-SA 2.0 |
| r035 | File:Close-up of the rain drops on a car window. Car in a blurry backg | https://commons.wikimedia.org/wiki/File:Close-up_of_the_rain_drops_on_a_car_window._Car_in_a_blurry_background.jpg | CC BY 2.0 |
| r036 | File:Delta Flight Raindrops - Plane Wing - Air Travel (27515766324).jp | https://commons.wikimedia.org/wiki/File:Delta_Flight_Raindrops_-_Plane_Wing_-_Air_Travel_(27515766324).jpg | CC BY-SA 2.0 |
| r037 | File:Only Raindrops (153741279).jpeg | https://commons.wikimedia.org/wiki/File:Only_Raindrops_(153741279).jpeg | CC BY-SA 3.0 |
| r038 | File:Rain drops on an aeroplane's window glass pane.jpg | https://commons.wikimedia.org/wiki/File:Rain_drops_on_an_aeroplane%27s_window_glass_pane.jpg | CC BY-SA 4.0 |
| r039 | File:Rain drops on window 01 ies.jpg | https://commons.wikimedia.org/wiki/File:Rain_drops_on_window_01_ies.jpg | CC BY-SA 3.0 |
| r040 | File:Rain on a window pane.jpg | https://commons.wikimedia.org/wiki/File:Rain_on_a_window_pane.jpg | CC BY-SA 4.0 |
| r041 | File:Rain on my window (6643943753).jpg | https://commons.wikimedia.org/wiki/File:Rain_on_my_window_(6643943753).jpg | CC BY-SA 2.0 |
| r042 | File:Rain on window (Unsplash).jpg | https://commons.wikimedia.org/wiki/File:Rain_on_window_(Unsplash).jpg | CC0 |
| r043 | File:Rain window (7988700965).jpg | https://commons.wikimedia.org/wiki/File:Rain_window_(7988700965).jpg | CC BY 2.0 |
| r044 | File:RaindropsOnWindow.jpg | https://commons.wikimedia.org/wiki/File:RaindropsOnWindow.jpg | CC0 |
| r045 | File:Raindrops in Germany (Regentropfen Marburg Februar 2016) weather  | https://commons.wikimedia.org/wiki/File:Raindrops_in_Germany_(Regentropfen_Marburg_Februar_2016)_weather_2016-02-08.JPG | CC BY-SA 4.0 |
| r046 | File:Raindrops on Saturday.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_Saturday.jpg | CC BY-SA 4.0 |
| r047 | File:Raindrops on gray, other angle.jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_gray,_other_angle.jpg | CC0 |
| r048 | File:Raindrops on the window (26850208867).jpg | https://commons.wikimedia.org/wiki/File:Raindrops_on_the_window_(26850208867).jpg | CC BY-SA 2.0 |
| r049 | File:Vibrant raindrops on glass with a blurred urban bokeh light backg | https://commons.wikimedia.org/wiki/File:Vibrant_raindrops_on_glass_with_a_blurred_urban_bokeh_light_background.jpg | CC BY-SA 4.0 |
| r050 | File:Window Droplets.jpg | https://commons.wikimedia.org/wiki/File:Window_Droplets.jpg | CC BY-SA 4.0 |
| r051 | File:After Summer Rain (79136293).jpeg | https://commons.wikimedia.org/wiki/File:After_Summer_Rain_(79136293).jpeg | CC BY 3.0 |
| r052 | File:Rain Droplets.jpg | https://commons.wikimedia.org/wiki/File:Rain_Droplets.jpg | CC BY-SA 4.0 |
| r053 | File:Rain Drops On The Window (68419527).jpeg | https://commons.wikimedia.org/wiki/File:Rain_Drops_On_The_Window_(68419527).jpeg | CC BY 3.0 |
| r054 | File:Rain drops on Glass.jpg | https://commons.wikimedia.org/wiki/File:Rain_drops_on_Glass.jpg | CC BY-SA 4.0 |
| r055 | File:Rain drops on a glass.jpg | https://commons.wikimedia.org/wiki/File:Rain_drops_on_a_glass.jpg | CC BY-SA 4.0 |
| r056 | File:Rain drops on glass, Bokakhat, Assam.jpg | https://commons.wikimedia.org/wiki/File:Rain_drops_on_glass,_Bokakhat,_Assam.jpg | CC BY-SA 4.0 |
| r057 | File:Rain is gone - Flickr - shioshvili.jpg | https://commons.wikimedia.org/wiki/File:Rain_is_gone_-_Flickr_-_shioshvili.jpg | CC BY-SA 2.0 |
| r058 | File:Rain on lens.jpg | https://commons.wikimedia.org/wiki/File:Rain_on_lens.jpg | CC BY-SA 4.0 |
| r059 | File:Wdrops 01.jpg | https://commons.wikimedia.org/wiki/File:Wdrops_01.jpg | CC BY-SA 4.0 |
| r060 | File:Wdrops 03.jpg | https://commons.wikimedia.org/wiki/File:Wdrops_03.jpg | CC BY-SA 4.0 |
| r061 | u02_unsplash_tT_SrSMhhgE.jpg | https://unsplash.com/photos/tT_SrSMhhgE | Unsplash |
| r062 | u03_unsplash_pGQbWXBC1dA.jpg | https://unsplash.com/photos/pGQbWXBC1dA | Unsplash |
| r063 | u04_unsplash_J7O6A1BHrUs.jpg | https://unsplash.com/photos/J7O6A1BHrUs | Unsplash |
| r064 | u05_unsplash_i2J9jnvaAbU.jpg | https://unsplash.com/photos/i2J9jnvaAbU | Unsplash |
| r065 | u06_unsplash_n6pu9ZDOaN4.jpg | https://unsplash.com/photos/n6pu9ZDOaN4 | Unsplash |
| r066 | u07_unsplash_192qmJI9c28.jpg | https://unsplash.com/photos/192qmJI9c28 | Unsplash |
| r067 | u08_unsplash_aJOslo_ZuWM.jpg | https://unsplash.com/photos/aJOslo_ZuWM | Unsplash |
| r068 | u10_unsplash__cqRjq4rp0M.jpg | https://unsplash.com/photos/_cqRjq4rp0M | Unsplash |
| r069 | u12_unsplash_fkmVOlrh-bc.jpg | https://unsplash.com/photos/fkmVOlrh-bc | Unsplash |
| r070 | u13_unsplash_5Y4Vr_EUXpM.jpg | https://unsplash.com/photos/5Y4Vr_EUXpM | Unsplash |
| r071 | u16_unsplash_MU93ZoQPNB8.jpg | https://unsplash.com/photos/MU93ZoQPNB8 | Unsplash |
| r072 | u17_unsplash_1YHXFeOYpN0.jpg | https://unsplash.com/photos/1YHXFeOYpN0 | Unsplash |
| r073 | u18_unsplash_yeN9XfiUafY.jpg | https://unsplash.com/photos/yeN9XfiUafY | Unsplash |
| r074 | u20_unsplash_1e60bqR1Ar0.jpg | https://unsplash.com/photos/1e60bqR1Ar0 | Unsplash |
| r075 | u21_unsplash_JgDUVGAXsso.jpg | https://unsplash.com/photos/JgDUVGAXsso | Unsplash |
| r076 | u22_unsplash_FZYMMSeXMTI.jpg | https://unsplash.com/photos/FZYMMSeXMTI | Unsplash |
| r077 | u24_unsplash_AgloICu5BwA.jpg | https://unsplash.com/photos/AgloICu5BwA | Unsplash |
| r078 | p06_pexels_16295420.jpg | https://www.pexels.com/photo/raindrops-running-down-the-window-dark-sky-16295420/ | Pexels |
| r079 | p07_pexels_13568432.jpg | https://www.pexels.com/photo/close-up-of-raindrops-on-window-13568432/ | Pexels |
| r080 | p08_pexels_12038590.jpg | https://www.pexels.com/photo/droplets-of-water-on-a-glass-window-12038590/ | Pexels |
| r081 | p09_pexels_3391254.jpg | https://www.pexels.com/photo/bokeh-3391254/ | Pexels |
| r082 | p10_pexels_1871289.jpg | https://www.pexels.com/photo/water-drops-on-glass-1871289/ | Pexels |
| r083 | p11_pexels_268883.jpg | https://www.pexels.com/photo/water-drops-vector-art-268883/ | Pexels |
| r084 | p12_pexels_459439.jpg | https://www.pexels.com/photo/water-droplets-on-window-459439/ | Pexels |
| r085 | p17_pexels_9587166.jpg | https://www.pexels.com/photo/rain-drops-on-glass-9587166/ | Pexels |
| r086 | p18_pexels_7619863.jpg | https://www.pexels.com/photo/pointing-on-a-glass-with-rain-drops-7619863/ | Pexels |
| r087 | mist-on-glass-window-3481163 | https://www.pexels.com/photo/mist-on-glass-window-3481163/ | Pexels License |
| r088 | abstract-background-of-glass-with-water-drops-5207993 | https://www.pexels.com/photo/abstract-background-of-glass-with-water-drops-5207993/ | Pexels License |
| r089 | closeup-photo-of-clear-frosted-glass-728471 | https://www.pexels.com/photo/closeup-photo-of-clear-frosted-glass-728471/ | Pexels License |
| r090 | close-up-of-raindrops-on-glass-window-39481069 | https://www.pexels.com/photo/close-up-of-raindrops-on-glass-window-39481069/ | Pexels License |
| r091 | a-close-up-of-rain-drops-on-a-window-27378397 | https://www.pexels.com/photo/a-close-up-of-rain-drops-on-a-window-27378397/ | Pexels License |
| r092 | raindrops-on-window-creating-moody-atmosphere-30427235 | https://www.pexels.com/photo/raindrops-on-window-creating-moody-atmosphere-30427235/ | Pexels License |
| r093 | 35075849 | https://www.pexels.com/photo/35075849/ | Pexels License |
| r094 | close-up-of-raindrops-on-a-window-pane-39364165 | https://www.pexels.com/photo/close-up-of-raindrops-on-a-window-pane-39364165/ | Pexels License |
| r095 | close-up-of-the-raindrops-on-the-window-and-the-street-in-the-backgrou | https://www.pexels.com/photo/close-up-of-the-raindrops-on-the-window-and-the-street-in-the-background-25025352/ | Pexels License |
| r096 | raindrops-on-window-creating-abstract-texture-32096488 | https://www.pexels.com/photo/raindrops-on-window-creating-abstract-texture-32096488/ | Pexels License |
| r097 | raindrops-on-window-during-overcast-day-34371195 | https://www.pexels.com/photo/raindrops-on-window-during-overcast-day-34371195/ | Pexels License |
| r098 | close-up-of-a-wet-window-and-blurry-lights-16339487 | https://www.pexels.com/photo/close-up-of-a-wet-window-and-blurry-lights-16339487/ | Pexels License |
| r099 | raindrops-on-window-with-cloudy-sky-view-35075853 | https://www.pexels.com/photo/raindrops-on-window-with-cloudy-sky-view-35075853/ | Pexels License |
| r100 | close-up-shot-of-water-droplets-on-the-glass-8629779 | https://www.pexels.com/photo/close-up-shot-of-water-droplets-on-the-glass-8629779/ | Pexels License |
| r101 | close-up-shot-of-raindrops-on-a-car-window-10737375 | https://www.pexels.com/photo/close-up-shot-of-raindrops-on-a-car-window-10737375/ | Pexels License |
| r102 | close-up-of-plant-branch-on-window-with-raindrops-14734187 | https://www.pexels.com/photo/close-up-of-plant-branch-on-window-with-raindrops-14734187/ | Pexels License |
| r103 | rain-drops-on-a-black-surface-8858712 | https://www.pexels.com/photo/rain-drops-on-a-black-surface-8858712/ | Pexels License |
| r104 | raindrops-on-car-window-with-city-reflection-36077296 | https://www.pexels.com/photo/raindrops-on-car-window-with-city-reflection-36077296/ | Pexels License |
| r105 | raindrops-on-window-20533217 | https://www.pexels.com/photo/raindrops-on-window-20533217/ | Pexels License |
| r106 | raindrops-on-window-glass-18949873 | https://www.pexels.com/photo/raindrops-on-window-glass-18949873/ | Pexels License |
| r107 | close-up-shot-of-droplets-of-water-on-a-glass-window-9488166 | https://www.pexels.com/photo/close-up-shot-of-droplets-of-water-on-a-glass-window-9488166/ | Pexels License |
| r108 | raindrops-on-glass-at-night-17224429 | https://www.pexels.com/photo/raindrops-on-glass-at-night-17224429/ | Pexels License |
| r109 | close-up-shot-of-water-droplets-on-glass-4305939 | https://www.pexels.com/photo/close-up-shot-of-water-droplets-on-glass-4305939/ | Pexels License |
| r110 | close-up-shot-of-water-droplets-on-glass-window-10251071 | https://www.pexels.com/photo/close-up-shot-of-water-droplets-on-glass-window-10251071/ | Pexels License |
| r111 | water-droplets-on-glass-window-5853652 | https://www.pexels.com/photo/water-droplets-on-glass-window-5853652/ | Pexels License |
| r112 | rain-drops-on-a-black-surface-8858709 | https://www.pexels.com/photo/rain-drops-on-a-black-surface-8858709/ | Pexels License |
| r113 | background-of-raindrops-on-glass-window-6832327 | https://www.pexels.com/photo/background-of-raindrops-on-glass-window-6832327/ | Pexels License |
| r114 | raindrops-on-window-glass-19856378 | https://www.pexels.com/photo/raindrops-on-window-glass-19856378/ | Pexels License |
| r115 | close-up-shot-of-a-water-droplets-on-glass-window-9282124 | https://www.pexels.com/photo/close-up-shot-of-a-water-droplets-on-glass-window-9282124/ | Pexels License |
| r116 | raindrops-on-window-glass-18305493 | https://www.pexels.com/photo/raindrops-on-window-glass-18305493/ | Pexels License |
| r117 | close-up-of-rain-on-a-window-8589272 | https://www.pexels.com/photo/close-up-of-rain-on-a-window-8589272/ | Pexels License |

## Streams measured (233 streams, traced by hand, 2026-10-04)

Every stream in the 117 photographs was traced by hand: a centre line with a point at every bend, and the width judged by eye at each point (outer edge to outer edge), checked against a 3x zoom of each stream. An automatic tracer was tried first and rejected: it cut streams into rungs and jumped to neighbouring drops.

- Streams appear in 40 of 117 photographs (233 streams; r022, r041, r065, r117 hold many).
- Width: median 0.52% of the frame's width (IQR 0.31-0.68%), median 5 px; much thinner than the drops beside them.
- Width down a stream (135 streams at least 15% of the frame tall): bottom against top median 1.0; 16% widen by more than 1.3x, 18% narrow below 0.77x. Along it the width varies by about 16% (coefficient of variation).
- Lean: median 3 degrees; 66% under 5 degrees (car and tilted glass lean 15-60).
- Wander: about 0.7 of its own width (median 3.7 px), with a full wiggle every ~45 widths; sharp kinks are the exception.
- Ends: most leave the frame or fade; only 16% end in a head drop wider than 1.8x the stream.
- Merges: Y-joins at small angles, joined stream barely wider than one arm.

Applied in the generator: a short taper only at a stream's start (8 mm), then constant width with a gentle 15% variation; one stream in six widens, one in six narrows; fine zig-zag weakened to a slow wander.
