# ADR-0005: Decisions taken to finish the redesign

**Status:** Proposed (decided provisionally on 2026-10-02 so the build could continue overnight; Ony accepts or changes each line)
**Date:** 2026-10-02
**Deciders:** Claude, under Ony's instruction to keep working without stopping for permission
**Review:** The three design documents that left these questions open: "Investigation Visuals & Presentation System — Design (pass 1)", "Visual Editor & Chart Styles — Design", and "Document Ingestion & Review System Design" (Claude Docs, 2026-09-30 and 2026-10-01).

## Context

Three design documents each ended with a short list of choices for Ony. On
2026-10-02 he asked for the whole redesign to be finished overnight, with every
decision "backed up with sources, references, logic and reason". This record
holds each choice, the reason, and where the reason comes from. Any line can be
reversed; the code built on it says which ADR line it rests on.

## Decisions

### Visuals and presentations

1. **Aleph's role is confirmed as the research found it.** OpenAleph finds names
   and suggests matches; the Workbench's own data service and AI pick and build
   every visual. Reason: OpenAleph's documentation says entity extraction "does
   not automatically create relationships" and that cross-referencing is
   "suggestive, not definitive"; it has no chart or reasoning features. This
   matches ADR-0004 (OpenAleph owns the corpus, the Workbench owns decisions).
2. **Chart images are made by a small separate Node render service** (`render/`,
   a container in both compose files). ECharts draws the chart as SVG on the
   server with no browser (`echarts.init(null, null, {renderer: 'svg', ssr:
   true})` and `renderToSVGString()`, documented at
   <https://echarts.apache.org/handbook/en/how-to/cross-platform/server/>).
   `vl-convert-python` (BSD-3) turns the SVG into PNG for PowerPoint and Word,
   which both reject SVG. When the service is unreachable, exports keep today's
   behaviour (native PowerPoint charts and tables) and say the image was not
   available. Reason: the Python image stays unchanged; the same service will
   print PDFs with headless Chromium for the editor; and the design doc's own
   pick was this option. Turned down: Node inside the backend image (two
   runtimes in one container, harder to upgrade separately) and rendering in the
   browser (an export then needs an open browser tab).
3. **Sigma.js replaces vis-network everywhere** when the network pass is built;
   until then vis-network stays as it is. Reason: one network library, one
   style; vis-network is two major versions behind (research doc). Built in
   visuals pass 4 (2026-10-03): `components/entity-graph.tsx` on Sigma.js 3 and
   graphology, laid out with ForceAtlas2; vis-network and vis-data removed.
4. **Maps use a self-hosted Protomaps base map.** Reason: the fixed constraint
   that nothing leaves the machine without a click; a hosted tile server sees
   every place a reporter looks at. Not done in the overnight build.
5. **"How sure are we" uses all three published scales, each for what it was
   made for:** ICD 203 likelihood words for statements in briefs and decks
   (<https://www.dni.gov/files/documents/ICD/ICD-203.pdf>, p. 5); the IPCC
   AR5 evidence-by-agreement grid for the confidence grade on each claim
   (Mastrandrea et al. 2010, Figure 1); and the Bellingcat grading scale
   (confirmed / likely / weak / unsupported / unknown) for incidents and
   timeline events. Reason: each scale was designed for exactly one of those
   three objects; mixing them would blur what "likely" means.
   The claim grade was built in visuals pass 6 (2026-10-03): a review sets
   a claim's evidence (limited / medium / robust) and agreement (low /
   medium / high), both the reporter's judgement, since the guidance note
   gives no counts to derive them from ("for a given evidence and agreement
   statement, different confidence levels could be assigned"); the claim
   review shows the stances and how many sources the evidence comes from to
   judge by. The claims on the grid are the design's claim-strength grid
   (chart kind `heatmap`, query `claims_by_strength`).
   The event grade was built in the same pass: a reporter's timeline event
   takes one of Bellingcat's words (confirmed, likely, weak,
   unsubstantiated, unknown), set when recorded or later; the protocol's
   airstrike-only level ("cause of explosion as other") is left out, and
   its own word "unsubstantiated" is kept where this line first said
   "unsupported". The verification status stays: it is about the event's
   date, the grade about the event. The timeline chart writes the grade
   beside the status ("verified, graded likely").
6. **Statistical charts come before money flows and networks** (pass 3 then
   pass 4, as the research doc planned). Reason: statistical charts reuse
   ECharts, which is already in the app, and python-pptx's native charts, so
   they are editable in PowerPoint; money flows and networks wait on new
   libraries (Sigma.js) and on the payment queries that pass 2 builds anyway.

### Visual editor and chart styles

7. **React Flow is the editor base** (amended 2026-10-08; Ony: "What's best? Do that."). It was "Konva with react-konva", never built. Reason for the change: React Flow (`@xyflow/react`, MIT) is already in the app and used by the network and ownership views, so no new package; nodes are React components, so the icons, cards and hover cards reuse the app's own; handles, connecting by drag, selection, snap, zoom, pan and groups are built in; nodes are DOM elements, so keyboard and screen readers reach them, which a canvas library would need a second layer for. Konva stays the fallback if canvases grow past about 1,000 items (chart-builder-system-design.md §8.1). tldraw still needs a paid licence.
8. **The four starter themes stay** (Dark Academia, Newsprint, Ledger, High
   contrast). They are built (commit 5d146ac).
9. **Anyone who can write to an investigation can change its theme.** Reason:
   the app's authorization has two tiers (scoped and global admin) and no
   per-investigation owner; adding one is a new feature, not a style setting.
10. **The main download for a deck is the editable PowerPoint;** PDF sits beside
    it. Reason: the style layer exists so reporters can keep editing; a PDF
    cannot be edited.
11. **Rewriting a cited sentence flags it, and does not block export.** The
    citation is marked "text edited since citing" until a reviewer confirms it,
    and the export shows the warning. Reason: the review layer, not a lock, is
    what makes a statement count; blocking would stop ordinary copy-editing.

### Document ingestion and review

12. **The batch background job is built now,** on the Procrastinate jobs that
    ADR-0004 added: one job per document, grouped by a batch id, with the batch
    id in the review URL instead of every document id. Reason: the queue exists
    now, so the cost is small, and the document-id list in the URL has a length
    ceiling.
13. **Entity resolution starts conservative.** Only an exact match after name
    normalisation links to the existing entity without a question; a close match
    asks the "possible duplicate" question; anything else creates a new entity.
    Similarity is RapidFuzz's token-sort ratio (MIT,
    <https://rapidfuzz.github.io/RapidFuzz/>) on names normalised with
    `normality` (already a dependency through FollowTheMoney), restricted to the
    same schema. Reason: the design doc's research says a wrong auto-merge is
    worse here than a missed one, and the Neo4j three-tier model it borrows
    puts the human question in the middle band.
14. **The split-pane review screen shipped first** (2026-09-30), so the order
    question is settled by what happened.

### Foundation fixes

15. **Page tests move from call-order fetch mocks to route-keyed mocks** as each
    panel moves. A test that lists the server's replies in the exact order the
    page requests them tests an implementation detail: Testing Library's
    guiding principle is that tests should resemble how the software is used
    (<https://testing-library.com/docs/guiding-principles/>), and Mock Service
    Worker, the usual tool for this, matches requests by method and path
    (<https://mswjs.io/docs/philosophy>). The suite already stubs `fetch`
    directly, so a small router over that stub (`tests/helpers/mock-api.ts`)
    keeps the suite's shape with the fewest moving parts; MSW would add a
    second interception layer for the same result.
16. **Response models are written one route file at a time,** with a test per
    model that the route's real reply has no field the model drops (FastAPI
    silently removes fields a response model doesn't list). Schemathesis then
    checks every reply against the published schema.

### Visuals, decided while building (2026-10-03)

17. **No chord diagram for now; two-way payments stay on the sankey.** The
    design doc planned a "who-pays-whom circle" on ECharts 6's chord series.
    Drawn through the render service (ECharts 6.1.0, five flows between four
    parties), it failed the design's own rules: it wrote no label on any
    ribbon (an `edgeLabel` or a link's `label` drew nothing), so a ribbon's
    amount and direction cannot be written on it; its direction shows only
    by its colour, the payer's (`lineStyle.color: 'source'`, the default;
    rule 12 refuses colour alone); every party takes its own colour, so rule
    10 caps it at eight; and a ribbon has one width at both ends
    (`chordLayout.js` gives both ends the same span), so it cannot show the
    "net winner" the FT Visual Vocabulary gives as the point of a chord
    ("can illustrate 2-way flows (and net winner) in a matrix"). The sankey
    already draws money that runs both ways (payers left, recipients right,
    every band's amount written and in its tooltip; pass 4), and the
    connection grid lists who is linked to whom. Revisit when ECharts' chord
    writes ribbon labels, or if a reader needs the circle anyway.

18. **How the maps pass carries out line 4** (researched and tried on
    2026-10-03; versions as of that day).
    - *The base map* is a world extract of the Protomaps daily build to zoom
      6: 45 MB, cut in 17 s by the official `protomaps/go-pmtiles:v1.31.2`
      image (`pmtiles extract https://build.protomaps.com/<date>.pmtiles
      world.pmtiles --maxzoom=6`; the docs: "extracting a full sub-pyramid
      from 0 to maxzoom is always an efficient operation"). Zoom 7 would be
      189 MB and zoom 8 557 MB (measured from the 20261003 build's
      directory), so zoom 6 (country and city level) is the default and a
      larger extract a setting. It is fetched once, at setup, by a compose
      profile `maps`: a public world map, so nothing about an investigation
      leaves the machine. Tiles are ODbL: every map carries "© OpenStreetMap".
    - *Serving*: the backend reads the file with the `pmtiles` Python package
      (3.8.1, BSD-3) and serves tiles and the style's fonts under `/api/basemap`,
      behind the same sign-in as everything else; the browser never asks
      another host (the default glyph URL on protomaps.github.io is replaced
      by our own copy of `basemaps-assets`, fonts under the SIL Open Font
      License).
    - *In the app*: MapLibre GL JS (6.11.2, BSD-3) with the style from
      `@protomaps/basemaps` (5.7.2, BSD-3; the `grayscale` flavor, so the
      data, not the base map, carries the colour).
    - *In decks and briefs*: the render service draws the same style with
      `@maplibre/maplibre-gl-native` (6.4.1, BSD-2), its `request` hook
      answering every tile and glyph from the local files and refusing
      anything else. Tried here: a 960 x 540 map at 2x in 0.8 s, on Ubuntu
      24.04 with Mesa's software renderer under `xvfb-run` (the module needs
      `libopengl0`, `libegl1` and an X display). The render image gains
      those packages.
    - *Coordinates come from the records*: FollowTheMoney's `latitude` and
      `longitude` on Address and RealEstate, and an entity's `addressEntity`
      that has them. Nothing is geocoded automatically. A self-hosted
      geocoder is out of proportion (Photon's planet index is 62.6 GB, its
      README recommends 64 GB of RAM; Nominatim's planet needs 128 GB and
      1 TB); the public Nominatim service allows one request a second with
      attribution and forbids bulk use, and would see the address, so it is
      offered later, if at all, only as an explicit per-address click.
    - *Rule 17* (shaded maps): rates, not counts; Datawrapper keys show the
      lowest and highest values plus two to four colours between (4 to 6
      classes); ECharts' `geo.projection` takes a d3-geo projection such as
      `geoEqualEarth`. Shaded country maps wait until a query yields rates.

## Consequences

Easier: the build can continue without waiting on answers; each line is a
single sentence to accept or reverse.

Harder: a reversed line may undo built work (lines 2, 7, 13 and 15 carry code).

Revisit when Ony reads this: tick or strike each line.
