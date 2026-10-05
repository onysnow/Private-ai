# Chart builder: system design

Status: proposed, 5 October 2026. Nothing here is built. It extends `chart-builder-design.md` (the what and why, with the prototype `chart-builder-prototype.html`) into how it would be built: components, storage, API, the design file, failure handling, scale and trade-offs. Points marked **Q** wait on Ony.

## 1. Requirements

### 1.1 Functional (from Ony's message)

| # | The builder must | Source in the message |
|---|---|---|
| F1 | Give the reporter a free canvas: place, move, resize, group and connect anything | "completely control the flow and representation and design" |
| F2 | Take any record by drag and drop: party, claim, evidence, event, a tag or collection (all its records) | "populate it with whatever entities they want" |
| F3 | Show a dropped party as its kind's icon, with its name already filled in and a hover card built from the record | "show up as an icon with prefilled names/hover data and more" |
| F4 | Draw connections by dragging; bring a dropped party's existing links to parties already on the canvas | "drag and drop nodes, connections" |
| F5 | Give each party a research switch (off / ask first / automatic) feeding the discovery lookups | "start auto searching … with a toggle or set them to auto" |
| F6 | Let every visual property be set per item and per chart (shape, colour, size rule, shown facts, line pattern, width, words) | "fully customize how they can see, interact, visualize" |
| F7 | Offer a data-chart mode (fields dropped on shelves → bars, timelines, scatter) | "visualize that information" |
| F8 | Export a design file, and open one to build a chart from it | "export a design file … that the app can read and create from" |
| F9 | Share designs with other users | "share those chart schemas/designs with other users" |
| F10 | Undo/redo, zoom, pan, snap, fit, keyboard delete | needed for direct manipulation (Shneiderman 1983) |
| F11 | Export a picture for a story, and send the diagram to OpenAleph | ADR-0006 ("OpenAleph used in full"), existing deck/write-up flow |

### 1.2 Non-functional

| # | Target | Why |
|---|---|---|
| N1 | Dragging and panning stay smooth on a canvas of 500 items | well above the parties a hand-made chart holds; the research design's large case is ~1,000 parties |
| N2 | A record changed elsewhere shows on the canvas the next time it loads; the canvas never keeps a stale copy of a record | the records are the truth (chart-builder-design.md, "The line between design and truth") |
| N3 | A design file shared outside the case holds no names, ids or quotes | a template must not leak a case |
| N4 | A design file from an untrusted source cannot run code, break the page, or overflow storage | files cross between users |
| N5 | No work lost to a closed tab: autosave | ordinary editor expectation |
| N6 | Free: no paid service or licence | Ony: "Free first"; ADR-0005 rules out tldraw on licence |
| N7 | Keyboard and screen-reader reachable (WCAG 2.1.1, 4.1.2) | the rest of the app is held to WCAG |

### 1.3 Constraints (from the codebase)

- **Frontend:** Next.js with React. Zustand 5 is the store (`frontend/lib/workbench-store.ts`) and TanStack Query handles server state. Zod is present.
- **Canvas libraries already in the app:**
  - React Flow (`@xyflow/react` 12), used by `components/network/network-view.tsx` and `components/ownership-diagram.tsx`;
  - Sigma.js 3 (WebGL);
  - ECharts 6.
- **Backend:** FastAPI with SQLAlchemy and Alembic, and Pydantic schemas.
- **Visuals pipeline:**
  - `app/visuals` holds the spec, data service, ECharts builder, checker (rules 0–20) and style.
  - `VisualSpec` is `extra="forbid"`, so no values can be smuggled into an order.
  - Routes `/visuals/catalog`, `/visuals/preview` and `/visuals/restyle`.
- **OpenAleph diagrams:** `app/services/openaleph_entitysets.py` already writes them, in OpenAleph's layout format (vertices with `entityId`, `position` in grid units, `color`, `radius`; edges with `entityId`, `directed`; `groupings`). It keeps the positions a reporter set in OpenAleph.
- **ADRs:**
  - Any new package needs an ADR first.
  - ADR-0005 line 7 (Konva) is still Proposed.
  - ADR-0005 line 11 already sets the precedent "flag, don't block export" for edited citations.

### 1.4 Assumptions (to be confirmed, not built on)

| # | Assumption | If wrong |
|---|---|---|
| A1 | One reporter edits a design at a time; others may view | §8.3 changes to live co-editing (a new package) |
| A2 | A hand-made chart holds tens to a few hundred items | §8.1 moves Diagram mode to Sigma or Konva |
| A3 | "Other users" means users of the same Workbench install | §5.5: a public gallery needs moderation and hosting |
| A4 | Rules 0–4, 15, 19 still refuse; the rest become advice (**Q1**) | §6 changes which checks block saving |

## 2. High-level design

### 2.1 Components

```
 Browser                                                     Server (FastAPI)
┌───────────────────────────────────────────────┐           ┌──────────────────────────────────────────┐
│ Builder page  /investigations/{id}/builder    │           │ routes_chart_designs.py (thin)           │
│                                               │  REST     │   ├─ designs service                     │
│ ┌──────────┐ ┌──────────────────┐ ┌─────────┐ │ ───────▶  │   │    save / load / version check       │
│ │ Records  │ │ Canvas            │ │Inspector│ │           │   ├─ design_file service                 │
│ │ panel    │ │  Diagram: React   │ │ + check │ │           │   │    validate · migrate · strip ·      │
│ │ (search, │ │  Flow custom      │ │ results │ │           │   │    template ⇄ refs · role filling    │
│ │ tags,    │ │  nodes/edges      │ │         │ │           │   ├─ design_check service                │
│ │ marks)   │ │  Chart: shelves → │ │         │ │           │   │    free-canvas checks + app/visuals  │
│ └──────────┘ │  VisualSpec →     │ └─────────┘ │           │   │    checker (rules 0–20)              │
│              │  ECharts preview  │             │           │   ├─ app/visuals (existing)              │
│              └──────────────────┘             │           │   │    preview · restyle · render client │
│ builder store (Zustand slice + history)       │           │   ├─ openaleph_entitysets (existing)     │
│ records cache (TanStack Query)                │           │   │    diagram send / read               │
└───────────────────────────────────────────────┘           │   └─ lookups (discovery design)          │
                                                            │        lookup_settings · outbox · jobs   │
                                                            │ DB: chart_designs, chart_design_versions,│
                                                            │     chart_design_templates               │
                                                            └──────────────────────────────────────────┘
```

### 2.2 What lives where

- **The canvas holds references, never copies.**
  - A node stores `{ref_type, ref_id}` plus its own design (position, style).
  - Names, kinds, countries, links and hover facts come from the records the page already loads: entity list, relationships, claims, evidence, events. They come through TanStack Query, so they are refreshed like every other page.
  - This is what makes N2 hold.
- **Design state** (positions, styles, marks, rules, shelves) lives in a Zustand slice with a history stack. The server stores it as one JSON document per design, with numbered versions.
- **Numbers** in Chart mode are computed by the existing `app/visuals` data service from a `VisualSpec`. The canvas never holds a value that is not from a query.

### 2.3 Main flows

**Drop a party.** The records panel's `dataTransfer` carries `party:<entity id>`.
1. The store adds a node; if "bring links" is on, it also adds edges for every relationship between this party and parties already on the canvas.
2. History records one step.
3. Autosave is scheduled (§3.4).

**Draw a connection.** Drag from the node's handle to another node. React Flow's `onConnect` handles the drop.
- The edge is stored with `ref: null, drawn_by_hand: true` and is drawn plum with a "NOT A RECORD" badge.
- From it, *Make it a claim* opens the existing claim form, prefilled with both parties. An accepted claim can later back an FtM `UnknownLink`, the schema for a link whose nature is not yet known.
- *Research these two* starts a research run (research-design.md).

**Research switch.** Setting a party to *automatic* or *ask first* writes a per-entity override to the discovery design's lookup settings (system-design.md §3: `lookup_settings`). The builder never runs lookups itself.
- New findings arrive through the existing outbox and jobs. The canvas polls the party's finding count (TanStack `refetchInterval`, as the rest of the app does) and shows a badge on the party.
- **Q4:** should a dropped party start at automatic or off?

**Chart mode.**
1. Shelves map to a `VisualSpec`, with the query chosen from `/visuals/catalog` by what was dropped (Mackinlay et al. 2007).
2. `/visuals/preview` returns the ECharts option and the check report.
3. Style changes go through the existing presets/options (`/visuals/restyle`).
4. The spec, not the drawing, is what the design stores.

**Save a picture.** Diagram mode is captured in the browser (React Flow's documented image-export approach, using `html-to-image`, which would need an ADR) or drawn on the server. Chart mode goes through the existing render service. Either way the picture carries the key, a source line and the advice that was overridden (§6). This route is a trade-off; see §9, T3.

**Send to OpenAleph** (F11). The existing `diagram_layout` is extended to take positions from the design instead of the spring layout:
- party nodes → `vertices` (position converted to grid units, colour, radius from size);
- record links → `edges`;
- group frames → `groupings`.

Hand-drawn connections, notes and headings are not sent: OpenAleph's diagram format needs an entity behind every edge. The send report lists what was left out. Reading a diagram back works the same way in reverse; the existing `_kept_positions` already reads positions.

## 3. Deep dive

### 3.1 Data model

```
chart_designs
  id                uuid PK
  investigation_id  FK investigations, ON DELETE CASCADE, and added to investigation deletion in app/services/lifecycle.py
  title             text ≤ 200
  mode              'diagram' | 'chart'
  spec              JSON           the design file body (§4), with record refs
  spec_version      int            format version of spec
  revision          int            bumped on every save; used for the version check (§3.4)
  created_by        user id
  created_at, updated_at
  openaleph_entityset_id  text NULL   set after the first send to OpenAleph
  index (investigation_id, updated_at desc)

chart_design_versions               named snapshots the reporter chooses to keep
  id, design_id FK ON DELETE CASCADE, revision int, label text, spec JSON, created_by, created_at
  unique (design_id, revision)

chart_design_templates              design-only files, shared (F9, A3)
  id, title, description, mode, spec JSON (roles only: no refs, checked on write),
  spec_version, created_by, created_at, shared_with ('install' | 'private'), source_design_id NULL
  index (shared_with, created_at desc)
```

- Autosave is not a version. It overwrites `spec` and bumps `revision`. A row in `chart_design_versions` is written only when the reporter keeps a version, or before an import replaces the canvas. This keeps the version table small (§7).
- Templates have no `investigation_id`. On write, a template is checked to hold no `ref` fields, no quote text and no record ids (§5.3).

### 3.2 API

All routes are under `/api` with `authorize_request_resource`, as in `routes_visuals.py`.

| Method and path | Does | Errors |
|---|---|---|
| `GET /investigations/{id}/chart-designs` | list (id, title, mode, updated_at, item counts) | 404 case |
| `POST /investigations/{id}/chart-designs` | create, from empty, a template id, or an uploaded file | 413 too large, 422 invalid file |
| `GET /investigations/{id}/chart-designs/{did}` | the design with `revision` | 404 |
| `PUT /investigations/{id}/chart-designs/{did}` | autosave; body carries `revision` | 409 newer revision exists (returns it) |
| `DELETE /investigations/{id}/chart-designs/{did}` | delete | 404 |
| `POST …/{did}/versions` / `GET …/{did}/versions` / `POST …/{did}/versions/{rev}/restore` | named versions | 404 |
| `POST …/{did}/check` | errors and advice (§6) | — |
| `GET …/{did}/export?form=template\|refs` | the design file (§4) as a download | — |
| `POST /investigations/{id}/chart-designs/import/preview` | validate a file, fill roles, return what matched (no write) | 413, 422, 415 not a design file |
| `POST …/{did}/picture` | PNG/SVG through the render service | 422 if a refusing rule fails |
| `POST …/{did}/openaleph` | send as an OpenAleph diagram; returns the send report and UI link | 409 OpenAleph off (ADR-0006 status line), 502 OpenAleph error |
| `GET /chart-design-templates` / `POST` / `DELETE /{tid}` | the shared gallery (F9) | 422 if a template carries refs |

Responses use Pydantic models in `schemas/responses.py`, and the frontend client is generated as the existing endpoints' clients are.

### 3.3 Frontend store

- The `builderSlice` is added to Zustand: `nodes`, `edges`, `marks`, `rules`, `chart`, `selection`, `view`.
- **History** is a bounded stack of snapshots (100 steps, as in the prototype).
  - One user gesture is one step. A drag is committed on pointer-up, not on every move.
  - zundo, the Zustand undo middleware, would make this a few lines but is a new package. The plain stack is ~40 lines and needs no ADR. **Q6.**
- **React Flow is used controlled.** `nodes` and `edges` are derived from the slice plus the records cache: the slice holds ref and style, the cache gives name, kind and links.
- **Node components:** `PartyNode` (dot or card), `RecordCardNode` (claim, evidence, event), `MarkNode` (note, heading) and `GroupNode` (React Flow's sub-flow parent, so moving a group moves its children). All are memoised, as React Flow's performance guide recommends.
- **Edge components:**
  - `RecordLinkEdge` reuses the network view's tapered/dashed drawing and the "!" mark for disputed links.
  - `DrawnLinkEdge` is plum, with the badge.
- **Keyboard:** React Flow nodes are focusable and its built-in keyboard handling (arrow-key moving, delete) is turned on. Every node has an `aria-label` built from the record ("Company Meridian Holdings Ltd, 4 links").

### 3.4 Saving and concurrency

- **Autosave:** 1.5 s after the last committed step, `PUT` with the `revision` the client holds.
- **409** means someone saved a newer revision. The page shows "Changed by {user} at {time}" with *Load theirs* or *Keep mine as a copy*. It never merges silently (A1).
- **Offline or failed save:** the design stays in the store and in `sessionStorage` (wrapped in try/catch). A banner says "Not saved yet: retrying" and backs off at 2, 4, 8 … 60 s.

### 3.5 Caching

- **Records** reuse the TanStack Query keys the other pages use, so a party edited on the dossier is fresh on the builder after invalidation. Nothing extra is cached server-side.
- **Chart mode preview:** keyed by a hash of the `VisualSpec` plus the investigation's data revision, kept 60 s in TanStack. The server draws again on every request today; that stays.
- **Templates list:** standard query cache, invalidated on create and delete.

### 3.6 Jobs and events

The builder adds no job kind of its own.
- Research uses the lookup jobs and outbox from the discovery design.
- A picture is rendered by the existing render client, run inline as today.
- An OpenAleph send runs as the existing send does.

One outbox event is added: `chart_design.saved`. Nothing consumes it now; it is there so a later "notify me when a design I follow changes" needs no schema change. **Q7:** drop it until needed?

## 4. The design file

### 4.1 Format

The file is JSON, named `*.wbchart.json`, with media type `application/vnd.journalism-workbench.chart-design+json`. It follows Vega-Lite's split between a portable specification and data bound when it is opened (Satyanarayan et al. 2017).

```
{
  format:  "journalism-workbench/chart-design",      required, exact
  version: 1,                                        required, integer
  title, description?, mode: "diagram" | "chart",
  form:    "template" | "refs",
  rules:   { colourBy, sizeBy, bringLinks, snap, arrangedBy?, movedAfterArranging? },
  nodes:   [ { key, role | ref, kind, x, y, w?, h?, parent?, text?, style } ],
  connections: [ { key, from, to, record_kind | null, drawn_by_hand, ref?, style } ],
  chart:   { shelves: {x, y, color, size, facet}, spec?: VisualSpec without query params that name records },
  advice_overridden: [ rule ids ],
  app_version, exported_at
}
```

- `key` is a file-local id, so connections refer to nodes without record ids.
- **Template form:**
  - parties become `role: "party_1"` and so on, with their FtM schema as `kind`;
  - claims, evidence and events become `role: "claim_slot"` and similar, with no text (the prototype drops them; the build keeps empty slots);
  - marks keep their text, which the reporter wrote.
- **Refs form:** `ref: {type, id}` for every record.
- `style` takes only known keys, each with an enum or range: `shape ∈ {dot, card}`, `fill ∈ palette`, `show ⊆ {name, kind, country, dates}`, `auto ∈ {off, ask, auto}`, `dash ∈ {auto, solid, dashed}`, `width ∈ {thin, thick, money}`, `label: bool`.

### 4.2 Schema and migration

- The schema is defined once, as Pydantic models (`schemas/chart_design.py`, `extra="forbid"` like `VisualSpec`). It is exported as JSON Schema for the frontend, which validates with Zod (already present) before upload, for fast feedback.
- **Versions:** a file with `version` lower than current runs through migration functions `v1→v2→…` on the server. A higher version is refused ("made by a newer Workbench"). Every migration has a fixture test with a stored file of the old version.

### 4.3 Opening a template: role filling

The prototype's greedy fill is the starting point.
1. Try each party of the first role's kind as the start.
2. Fill the remaining roles with same-kind parties that match the most template connections to real links of the same `record_kind` and direction.
3. Break ties by number of links.

This is a small graph-matching problem; for templates of under ~30 roles it runs in milliseconds.

- Above 30 roles, it falls back to filling by kind and number of links only, and says so.
- The import preview shows each role and its candidate, with a dropdown to swap, before anything is written.
- Connections with no matching record keep their style and are marked "no matching record here". They are not turned into hand-drawn lines.

## 5. Safety of design files (N3, N4)

1. **Size:** ≤ 2 MB and ≤ 5,000 nodes plus connections; anything larger gets 413. 5,000 is ten times A2.
2. **Parsing:** `json.loads` only, then the Pydantic model with `extra="forbid"`. Unknown keys refuse the file, with the key named in the error.
3. **Template check on write:** no `ref` anywhere. Mark text is scanned for strings equal to any record id or entity name of the exporting investigation, and the reporter is warned before the template is saved. That scan runs at export time, where the case is known.
4. **Text:** titles and mark text are rendered as text nodes (React escapes them). No HTML or Markdown is rendered from a design file.
5. **Colours:** only palette tokens or `#rrggbb`, checked by regex. No CSS strings.
6. **Refs form across cases:** refs are resolved only within the investigation the file is opened in, under its authorization. A ref that does not exist there leaves an empty place with "a record from another case". Nothing reveals whether the id exists elsewhere.

## 6. Checks: errors and advice

The `design_check` service runs on `POST …/check`, on picture export and on OpenAleph send.

| Check | Mode | Result |
|---|---|---|
| Rules 0, 1, 2, 3, 4, 15, 19 (the chart would state something false) | Chart | **error**: picture export refused; the canvas still saves |
| Rules 5–14, 16, 18, 20 | Chart | advice; carried into the picture's alt text and data table as "advice overridden: rule n" |
| A hand-picked colour already meaning a kind of party or link | Diagram | advice |
| An unproven link drawn solid | Diagram | advice; the export keeps a "not shown by a source" note in the key |
| Connections drawn by hand | Diagram | advice; always badged; **Q5** whether a story picture may carry them |
| A record on the canvas deleted since | both | advice, with the record named |
| Text under 12 px at export size (rule 14) | Diagram | advice |
| Contrast under 4.5:1 for labels, 3:1 for lines (rule 11) | Diagram | advice |

Saving is never blocked: a design is a working document. Only the picture for publication is refused, and only on the truth rules. This follows ADR-0005 line 11 (flag, don't block, except where the result would be false). The split is **Q1**.

## 7. Scale and reliability

**Load estimate** (A1, A2):

| Quantity | Estimate | Basis |
|---|---|---|
| Items on a canvas | 20–300 typical, 5,000 cap | A2; the cap is §5 |
| Spec size | 106–196 B per node or connection (measured on the prototype's demo export) → 300 items ≈ 60 KB; the cap is 2 MB | prototype export of the demo |
| Autosaves | ≤ 1 per 1.5 s per open editor | §3.4 |
| Writes per day | an active reporter ~200 autosaves × 60 KB ≈ 12 MB row churn, overwritten in place | one row per design |
| Versions | only on "keep" and before imports: tens per design | §3.1 |

- **Scaling:** one Postgres row per design and one per kept version; no horizontal concern at newsroom scale.
- **Rendering performance:** React Flow renders DOM nodes. Its `onlyRenderVisibleElements` option skips nodes outside the view, and memoised custom nodes avoid re-rendering on drag. If A2 is wrong (thousands of items), Diagram mode switches to Sigma (already in the app, WebGL) in read-only view above a threshold. That is a revisit item (§10), not part of the first build.
- **Failure modes:**

| Failure | What the reporter sees | Recovery |
|---|---|---|
| Save fails (network, 5xx) | "Not saved yet: retrying" banner | backoff retries; `sessionStorage` copy; never drops the store |
| 409 on save | who changed it, when, and two choices | load theirs, or keep mine as a copy |
| Invalid design file | the first problem named (field, value, reason) | nothing written |
| Newer file version | "Made by a newer Workbench (version n)" | nothing written |
| Template role cannot be filled (no party of that kind) | role shown empty in the preview | reporter picks or leaves it empty |
| Render service down | "Picture could not be made: render service unreachable" | canvas unaffected; retry |
| OpenAleph off or erroring | the ADR-0006 status line; send report with the error | design unaffected; retry |
| Record deleted while on canvas | empty place, "removed: {name at last load}" | reporter removes it |

**Monitoring:** counters for save latency, 409 rate, import refusals by reason, picture refusals by rule, and OpenAleph send failures. These use the app's existing logging, since there is no metrics stack in the repo to add to.

## 8. Library choices

### 8.1 Canvas (Diagram mode)

| | React Flow 12 (in app) | Konva / react-konva (ADR-0005 l.7, Proposed) | Sigma 3 (in app) |
|---|---|---|---|
| Custom nodes as React components (icons, cards, hover) | yes | no (canvas shapes) | no (WebGL programs) |
| Handles and connect by drag | built in | build | no |
| Selection, multi-select, box-select, snap, zoom, pan, minimap | built in | Canvas Editor guide pieces | zoom and pan only |
| Groups that move their children | sub-flows | groups | no |
| Keyboard and screen reader | DOM, focusable nodes | needs a parallel DOM layer | needs a parallel DOM layer |
| Many items | DOM-bound; virtualised off-view | canvas, fast | WebGL, fastest |
| New package or ADR | none | new; ADR-0005 l.7 to accept | none |

Proposal: React Flow. It covers F1, F3, F4, F10 and N7 with no new package, and two existing views already use it. ADR-0005 line 7 would be amended to "Konva is not needed for the builder; revisit if A2 fails" (**Q2**).

### 8.2 Chart mode

ECharts through the existing `app/visuals` pipeline, unchanged except for the check split in §6.

### 8.3 Live co-editing (not proposed)

Live co-editing would need a CRDT such as Yjs, plus a WebSocket server: two new packages and a new service. A1 says it is not needed. It is listed under §10.

## 9. Trade-offs

| # | Decision | Gain | Cost |
|---|---|---|---|
| T1 | Store references, not copies of records | the canvas is never stale; a template leaks nothing | the page must load the records; a deleted record leaves a hole |
| T2 | One JSON document per design, not a table per node | simple autosave, simple export and import, versioning by copy | no SQL over canvas contents (none needed today) |
| T3 | Diagram picture made in the browser vs on the server | browser: exactly what the reporter sees, no new server work | browser: needs `html-to-image` (new package, ADR); server: needs a second drawing of the canvas |
| T4 | Truth rules refuse, the rest advise | reporters can make charts "better than the site's defaults" | a reporter can publish a hard-to-read chart; the export says so |
| T5 | Last-write with a version check, no live co-editing | no new service | two people in one design get a 409 and must choose |
| T6 | Template role filling is greedy with restarts | fast, explainable, shown before writing | may miss the best fill on large templates; the preview lets the reporter swap |
| T7 | Hand-drawn connections allowed but badged | free thinking on the canvas | must be kept out of findings everywhere, which needs tests on every export path |

## 10. What to revisit as it grows

- **Canvases past ~1,000 items:** move Diagram mode's renderer to Sigma or Konva, keeping the same design file.
- **More than one editor at once:** Yjs with a WebSocket service, and an ADR.
- **Templates shared beyond one install:** signing (so a file's maker is known), a gallery with moderation, and a public schema URL.
- **Template matching on large templates:** an exact matcher (subgraph isomorphism with node and edge kinds, networkx `DiGraphMatcher`, already a dependency) in place of the greedy fill.
- **Version table growth** if reporters keep many versions: a retention rule.
- **`chart_design.saved` events,** if followers or notifications are wanted.

## 11. Tests (for the build)

- **Backend:**
  - the schema refuses unknown keys, oversized files, bad colours and newer versions;
  - each migration has a fixture;
  - a template carries no refs, and the name scan warns;
  - role filling on the demo case: 4 of 4 links matched, as in the prototype;
  - 409 on a stale revision;
  - picture export refused on rules 0–4, 15, 19 and allowed with advice on the rest;
  - the OpenAleph send leaves out hand-drawn links and notes and lists them;
  - a design is deleted with its investigation.
- **Frontend:**
  - drop → node with name and icon from the record;
  - bring links;
  - drag-connect → hand-drawn edge with badge;
  - undo/redo of one gesture;
  - autosave and the 409 dialog;
  - import preview with swapping;
  - keyboard move and delete;
  - axe check on the page.
- **Everywhere a hand-drawn link could leak:** claim counts, the pattern engine, network views, exports. Each gets a test that it is not counted.

## 12. Sources

- Shneiderman, B. (1983). *Direct manipulation*. IEEE Computer 16(8).
- Stolte, C., Tang, D., Hanrahan, P. (2002). *Polaris*. IEEE TVCG 8(1). The shelves.
- Mackinlay, J., Hanrahan, P., Stolte, C. (2007). *Show Me*. IEEE TVCG 13(6). The chart chosen from the fields.
- Satyanarayan, A. et al. (2017). *Vega-Lite*. IEEE TVCG 23(1). A portable spec bound to data at open time.
- React Flow documentation: performance guide (memoised custom nodes, `onlyRenderVisibleElements`), sub-flows, image export example, accessibility.
- FollowTheMoney schema: `UnknownLink`, `Note`. OpenAleph diagram layout format as used in `app/services/openaleph_entitysets.py` (aleph-ui 5.3.1 Vertex and Edge ids).
- ADR-0005 lines 7 and 11; ADR-0006; docs/visuals/README.md "The rule map"; docs/discovery/system-design.md (lookup settings, outbox); docs/discovery/research-design.md (research runs).

## 13. Questions for Ony

1. Should rules 0–4, 15 and 19 refuse a picture, with the rest as advice? (§6)
2. Should the canvas use React Flow (in the app) instead of Konva, amending ADR-0005 line 7? (§8.1)
3. Who can a template be shared with: this install only, or files passed anywhere? (A3, §5)
4. Should a party dropped on the canvas start with research set to automatic or off? (§2.3)
5. Should hand-drawn connections be allowed in a picture for a story? (§6)
6. For undo: the plain history stack, or zundo (new package, ADR)? (§3.3)
7. Should the unused `chart_design.saved` event be kept or left out? (§3.6)
8. For the diagram picture: made in the browser (`html-to-image`, ADR) or drawn on the server? (T3)
9. Is one editor at a time enough, or is live co-editing needed? (A1)
