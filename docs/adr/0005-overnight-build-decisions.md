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
6. **Statistical charts come before money flows and networks** (pass 3 then
   pass 4, as the research doc planned). Reason: statistical charts reuse
   ECharts, which is already in the app, and python-pptx's native charts, so
   they are editable in PowerPoint; money flows and networks wait on new
   libraries (Sigma.js) and on the payment queries that pass 2 builds anyway.

### Visual editor and chart styles

7. **Konva with react-konva is the editor base.** Reason: MIT, free, built for
   React 19, never contacts an outside server; its own Canvas Editor guide
   (<https://konvajs.org/docs/sandbox/Canvas_Editor.html>) builds selection,
   moving, resizing, undo and PNG export. tldraw needs a paid licence with an
   unpublished price. Not built in the overnight build; slices 2–6 of the
   editor design wait on this line being accepted.
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

## Consequences

Easier: the build can continue without waiting on answers; each line is a
single sentence to accept or reverse.

Harder: a reversed line may undo built work (lines 2, 7, 13 and 15 carry code).

Revisit when Ony reads this: tick or strike each line.
