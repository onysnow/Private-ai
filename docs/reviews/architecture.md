# Architecture review: onysnow/Private-ai, PR #117 (`claude/laughing-tesla-dstx1t` vs `origin/main`)

Read-only review, 31 Oct 2026. Nothing in the repo was edited, committed or run (no servers, no tests).
Read: `CLAUDE.md`, `docs/project-notes/START_HERE.md`, the decisions of all 28 ADR files in `docs/adr/`, the 58 headings
of `docs/project-notes/DECISIONS_LOG.md` and entries 47–57 in full. The code was read with `grep`/`sed`/`wc`.

**What the PR is, measured** (`git diff --numstat origin/main...HEAD`, GitHub REST `pulls/117`): 241 commits
(24 of them `Merge agent/...` merges plus the merge of #116), **623 files, +127,164 / −38,966**. That is smaller
than the brief's "~1,043 files, +190k/−76k": GitHub's API gives the same 623/127k/39k. About 66k of the added lines
are generated or lock files: `frontend/openapi.json` (+46,283/−32,091), `frontend/lib/generated` (+19,498),
`backend/native/Cargo.lock` (+4,726). Hand-written code is about +50k. Merge base `3d637a8` (#115).
`mergeable: true`, `mergeable_state: blocked`. Every check run on HEAD `f20472b` passed, but CodeQL reports
"3 new alerts including 3 medium severity" (section 4).

---

## 0. Why there are so many bugs (summary of the evidence below)

The bug classes listed in the brief are the same few systems written again on each screen, then fixed one screen at
a time:

1. **No shared layout primitives.** Label placement exists 8 times (§1.1). The "page never scrolls / fill" rules are
   per-screen CSS with magic `calc(100vh - Npx)` offsets (§1.2). Esc is handled in 27 files, and 4 use the shared
   rule (§1.4). There are 16+ empty-state class families (§1.5) and about 8 money formatters (§1.6). Most of
   DECISIONS_LOG 47–57 are sweeps that fix the *same* classes once per screen. A fix in one place does not reach the
   others.
2. **Text widths are guessed, and the guess differs per screen and per theme.** Each screen uses a fixed number of
   pixels per character: 7.2 (Wire), 6.7/6.6/5.8 (Money), 6.4 (Red Flags), 6.2 (Lanes), 0.5–0.58 em (slides).
   Five themes ship five different UI fonts (`styles/themes.css:24,66,108,150,192`: IBM Plex, Manrope, Public Sans,
   Inter, Inclusive Sans). So a label that fits on one theme overlaps or clips on another. Only `components/entity-graph.tsx:108`
   uses `measureText`.
3. **Layout cannot fail a test.** jsdom has no layout, and the code knows it: `wire-engine.ts` has 7
   `try { getComputedTextLength() } catch { /* not laid out (tests) */ }` fallbacks. The frontend has no browser
   (Playwright) test. Overlap, clipping and scrolling are found by people looking at screenshots at 1440×900.
4. **Screens stay mounted while hidden.** `case-workbench.tsx` and `section-screen.tsx` keep every stage and section
   mounted once opened, hidden with `[hidden]`. Window key handlers fire on hidden screens: `lib/on-screen.ts:1-5`
   records the Ctrl+Enter AI run and the L-on-Money bugs. Measurement taken while hidden returns 0. Every screen has
   to defend itself (19 `active={…}` props).
5. **The page tests render a different app.** They render `view="all"`, which mounts legacy panels that no
   production screen shows (`RedFlagsPanel`, `SourceCapturePanel`, `YearSlider`, `StageRail`, `StandingTiles`). They
   run against one 467-line route fixture, and any unmocked request answers 404. A panel that adds a request breaks
   unrelated page tests (§2.2).
6. **Parallel agent branches merged into one long branch.** Branches cut from the same Alembic head had their
   `down_revision` rewritten inside merge commits (§3.5). Two ADRs are both numbered 0015. One 81k-line
   `openapi.json`, one 6,895-line `responses.py` and `case-workbench.tsx` are conflict points every branch touches.

---

## 1. Duplicated systems that should be one module

Ordered by payoff. Sizes are estimates for new code plus the change at each caller.

### 1.1 Label placement and collision: CONFIRMED (8 implementations, 6 text-width models)

| Where | What | Width model |
|---|---|---|
| `features/the-wire/wire-engine.ts:153` `separate()` (pushes footprints apart), `:766` `overlap()`, `:1102` local `placeLabels()`, `:927,980,991,1014,1032,1129,1187` per-feature clear-spot searches, `:122` `clipWords`, `:487` `wrapWords` | Cards, name chips, sector names and link sentences, each with its own candidate list and obstacle sets | `L.length * 7.2`, then `getComputedTextLength()` (`:503,877,1080,1253,1299,1321,2048`) |
| `features/money/money-layout.ts:349` `placeLabels()` (column lanes, 3 detail levels, leader lines), `:466` `middleMarks()`, `:308` `wrapName()` | Party labels | `NAME_CH=6.7`, `SUM_CH=6.6` (`:300-301`) |
| `features/money/money-view.tsx:466` `stripValues()` | Bar values: 4 candidate spots, PAD 3 | `CH=5.8`; `:456` peek label `* 5.8` |
| `features/act/red-flags-board.tsx:555-575` `hits()` + `placeLabels()` | 6 candidate spots, avoids the reporting line | `text.length * 6.4` (`:644`) |
| `features/timeline/lanes-model.ts:142` `layoutLabels()` (row intervals), `:156` a second `wrapName()`; `lanes.tsx:48` `shortTitle`, `:416` brackets | Lane labels | `* 6.2` (`lanes.tsx:416`) |
| `features/knowledge/map-layout.ts`, `catalogue-map.tsx:103` | Circle packing plus hover-card placement | fixed anchors |
| `components/places-map.tsx`, `lib/basemap-style.ts:158-200` | MapLibre symbol collision, plus a hidden copy of every dot (DECISIONS 55) | MapLibre (fine) |
| `components/entity-graph.tsx:108`, `lib/network-layout.ts` (graphology Noverlap), `components/charts/case-timeline.tsx` (ECharts `labelLayout`) | Library-backed | `measureText` (correct) |

Every one uses its own `Box` type and intersection test. Each one decides alone what happens to a label with no room
(drop it, shorten it, or show it on hover) and how it is revealed. Clipping is just as scattered: `clipWords`
(Wire), two `wrapName`s, `shortTitle` (Lanes), `clip` (`by-hand/add-by-hand.tsx:84`), `shortInnocent`
(`red-flags-board.tsx:111`), 80 `text-overflow: ellipsis` CSS rules, and 40 native `title=` tooltips beside 918
`<Reveal>` uses.

**Target: `frontend/lib/layout/labels.ts` + `components/ui/fit-label.tsx`**
```ts
type Box = {x0:number; x1:number; y0:number; y1:number};
measureText(text: string, font: FontToken /* 'name' | 'sum' | 'mono' */): number   // canvas measureText on the theme's
                                    // resolved --font-ui, cached per (font,text); deterministic char-width table in jsdom
wrap(text, width, {maxLines, font}) -> {lines: string[]; cut: boolean}             // replaces both wrapName, clipWords, shortTitle, clip
place<T>(items: T[], {candidates: (t)=>Candidate[], obstacles: Box[], bounds: Box, pad, priority}) -> Map<id, Candidate | 'hidden'>
separate(footprints, {gap, rounds, fixed}) -> positions                            // Wire's separate(), generalised
<FitLabel text width font lines>  // draws the text, and when cut wraps it in <Reveal detail={full}>
```
Screens that move to it: Wire, Money (×3 functions), Red Flags, Timeline lanes, Add by hand, Knowledge map hover.
Places, entity-graph and ECharts keep their libraries but use `measureText` for the widest-name margin. Re-run
placement on `document.fonts.ready` and when the theme changes (`html[data-theme]` observer).
**Size:** module about 400 lines plus about 300 lines of tests. Migration changes about 1.5–2.5k lines over 6
screens and removes about 600. The Wire is the hardest (its passes interleave with D3 drawing). Do it last, behind
the same tests. **Payoff:** the overlapping-labels and clipped-names class, on every theme.

### 1.2 "Fill the space" / "page never scrolls": CONFIRMED (per-screen CSS, magic offsets)

- The frame sets heights in several places: `.cv-home-wrap`, `.cv-stage` and `.cv-screen` each use `calc(100vh - 52px)`
  (`styles/case.css:8,9,514`), `.kc` the same (`styles/learn.css:5`), and `.st-shell` the same
  (`styles/settings.css:6`). Each has a second rule for the pinned frame, `calc(100vh - 92px)`
  (`styles/themes.css:371`, `settings.css:7`).
- Sections: `.ss-sec { height:100%; overflow-y:auto }` and `.ss-sec.fill { overflow:hidden }` (`case.css:532-533`).
  Each screen then adds its own child rules: `styles/bring-in.css:6,119,158` and `styles/following.css:228-256`.
  The `fill` flag is set per section in `case-workbench.tsx` (about 30 `fill: true` entries).
- Screens set their own heights with magic offsets: `lanes.css:228,275,326` `clamp(560px, calc(100vh - 230px), 780px)`,
  `:387` `-380px`, `:434` `-430px`; `before-run.css:107,371,466,494` `100dvh - 170/300/330px`; `media.css:31,123`
  `-250px`; `safety.css:265` `-420px`; `story.css:20,199,239`. 125 `min-height: 0` rules. Some use `vh` and some
  `dvh`.
- "Fill" for content ("make the text bigger") has no mechanism at all. It is done by hand per card (DECISIONS 56/57:
  "cards filled", "each pane fills its room"), and "as many cards as fit" by hand in Timeline (DECISIONS 55).
- 11 files create their own `ResizeObserver` (`timeline/lanes.tsx`, `timeline/board.tsx`, `wire-engine.ts`,
  `glossary-screen.tsx`, `custody/chain-of-custody.tsx`, `story-screen.tsx`, `theme-compare.tsx`,
  `chart-visual.tsx`, `network-view.tsx`, `entity-graph.tsx`, `case-timeline.tsx`). There is no shared hook.

**Target: `components/layout/screen.tsx` + `styles/screen.css` + `lib/use-element-size.ts`**
- The frame sets one `--frame-h` custom property (52 or 92 px). Every screen height becomes `calc(100dvh - var(--frame-h))`,
  and no screen writes its own offset again.
- `<Screen cols="220px 1fr 350px">` with `<Region fit="fill|scroll|auto">`: a CSS grid with `minmax(0,1fr)` rows and
  `min-height:0` in one place. A region scrolls itself or fits; the page never does.
- `useElementSize(ref)`: one ResizeObserver hook that ignores hidden elements (0×0) and re-measures on show (§2.3).
- `useFitCount(ref, itemSize, gap)`: "as many whole cards as fit, then 'and N more'".
- `<FillText min max>` / `.fill-text`: container-query units (`container-type: size`; `font-size: clamp(min, 40cqh, max)`)
  so a sparse row grows its text and icon. This puts the "fill the space" rule in the code instead of reviewers'
  eyes.
**Size:** about 250 lines of TS/CSS. Moving about 20 screens' CSS is about 1k lines changed, mostly deletions.
**Payoff:** the empty-space and page-scrolls classes.

### 1.3 Status marks vs words: PARTLY CONFIRMED

A shared grammar exists: `components/status.tsx` (`StatusChip`, `LevelChip`, `AiNotice`), driven by
`html[data-status]` from Settings › Appearance (`lib/theme.ts:45-72,145`). But:
- The setting's CSS only targets `.st` and `.lv` (`styles/themes.css:271-277`). Other status marks never respond to
  it. These include `ReviewMark` (`review-queue-panel.tsx:42`, `.rq-state`), Is it real? (`.ir-status[data-status=…]`,
  `styles/is-it-real.css:33-36,88-90,158-160`), `HealthMark` (`following/marks.tsx:52`), `StateMark`
  (`dossier/dossier-parts.tsx:63`), `runGlyph` (`connectors-panel.tsx:44`) and `Mark` (`ai/watch-the-run.tsx:149`).
  `connectors-panel.tsx:258` hand-builds `.st` markup instead of using the component. So the accessibility setting
  ("add the shape or the word") works on some statuses and not others.
- There are three wrappers that repeat the same "is this a known level" guard: `FlagMark` (`red-flags-board.tsx:43`),
  `FlagLevelChip` (`knowledge/indicator-list.tsx:33`) and `ClaimStatusChip` (`claims-panel.tsx:77`).
- Kind marks are duplicated. `PartyMark` is in both `components/network/marks.tsx:32` and `the-drop/kind-marks.tsx:17`.
  `KindMark` is in both `case-home/decision-card.tsx:53` and `following/marks.tsx:46`.

**Target:** extend `components/status.tsx` into `components/marks/status.tsx`:
`defineScale({id, values: {key: {tone, mark, word, meaning?}}})` returns `<ScaleMark scale value focusable showWord/>`,
which always renders `.st` classes so `html[data-status]` applies everywhere. Define the scales once: claim, flag
level, review, realness, source health, run outcome, key state. Merge the two `PartyMark`s and two `KindMark`s into
`components/marks/kind.tsx`. **Size:** about 200 lines, plus about 12 call sites. Small, and closes an accessibility
gap.

### 1.4 Drawers, panels, layers and Esc: CONFIRMED

- `lib/on-screen.ts` (`escapeTaken`, `layerAbove`, DECISIONS 40) is the shared rule, but only 4 of the 27 files that
  handle `'Escape'` use it: `inspector-slot.tsx`, `chain-of-custody.tsx`, `wire-engine.ts` and `appearance-panel.tsx`.
  The other 23 roll their own, including `money-view`, `places-timeline` (4), `is-it-real` (2), `story-*` (3),
  `reading-room/*` (4), `red-flags-board`, `red-flags-panel` (2), `deck-editor`, `safety-screen`, `glossary-*` (2),
  `learn-screen` (2), `inbox`, `documents-panel` (2), `reveal.tsx`, `app-frame` (3) and `leads-kanban-board`.
  `case-home.tsx:578` checks `document.querySelector('[role="dialog"]')` its own way.
- Layers are hand-rolled, each with its own classes: `wb-slot` (the inspector, the only one with `data-layer`),
  `wb-drawer`, `tw-drawer` (Wire, `link-panel.tsx:32,42`, `the-wire.tsx:229`), `wr-drawer` (`watch-the-run.tsx:829`,
  `role=dialog`), `rf-drawer`, `sy-sheet` (`story-panes.tsx:238`), `ib` (`inbox.tsx:126`), and full-screen rooms
  (`reading-room.tsx:720`, `photo-room.tsx:183`, `redact-room.tsx:207`, `listen-room.tsx:510`, `is-it-real.tsx:102`,
  `deck-editor.tsx:342`, `lock-screen.tsx:47`, `app-frame.tsx:332`). Beside these sit 6 Radix `<Dialog>`s. Only 5
  files use `inert` or focus trapping (`lock-gate`, `theme-compare`, `deck-editor`, `interrupt-notice`, `app-frame`).
  The `aria-modal` rooms otherwise leave focus in the hidden page.

**Target: `components/layer/layer.tsx` + `lib/layers.ts`**
```tsx
<Layer kind="drawer|sheet|room|dialog" open onClose label side="right|bottom" modal>   // registers in a layer stack
useEscape(handler, {scope: ref})  // fires only for the topmost layer, or the on-screen screen when none is open
```
The stack owns Esc order, `data-layer`, focus trapping and return (Radix FocusScope), `inert` on the page under a
modal, scroll lock, and the phone bottom-sheet form already built for the inspector (DECISIONS 35). The inspector,
the custody drawer, the Wire link panel, the run drawer, the story sheet, the inbox and the 5 rooms move to it.
Screen-level Esc moves to `useEscape`. **Size:** about 300 lines plus about 27 call sites (about 800 lines changed).

### 1.5 Empty states: CONFIRMED

There is no shared component. There are 16 class families (`ch-empty dc-empty dk-empty fl-empty fl-empty-main
ir-empty-in kc-empty lr-empty mn-empty pls-empty rd-empty rq-empty-mark tp-empty wl-empty …`), 3 bespoke components
(`EmptyQueue` `review-queue-panel.tsx:317`, `EmptyFollowing` `follow-form.tsx:103`, `EmptyName` `watchlist.tsx:309`)
and about 98 inline "No … yet / Nothing …" strings. The rules they should share are written in DECISIONS: 20 (offer
the case's claims), 27 ("AI off is a state, not an error"), 57 ("each pane shows something of its own"), and the
Decide unreachable state (`case-workbench.tsx:213-220`).
**Target: `components/ui/empty-state.tsx`.** `<EmptyState mark title action? detail? fill/>`, with the detail inside a
Reveal and the size from `<FillText>`. Add `<QueryState query empty={…} off={…} error={…}>` so the loading, error,
off and empty states are decided in one place. **Size:** about 150 lines plus about 40 call sites.

### 1.6 Number and date formatting: CONFIRMED for money, PARTLY for dates

- Money has about 8 implementations. `amountText` is in both `money-layout.ts:46` and `case-home/mini-network.tsx:48`.
  `shortAmount` is in both `money-layout.ts:290` and `dossier-panel.tsx:97`. Others: `money()` (`case-home.tsx:67`),
  `money` (`red-flags-board.tsx:91`), `money` (`timeline/lanes.tsx:49`, which special-cases only EUR), `fmtAmt`
  (`wire-engine.ts:93`), `money` (`charts/financial-flow-sankey.tsx:153`) and `formatValue` (`slide-canvas.tsx:117`).
  43 direct `toLocaleString`/`Intl` calls.
- Dates: DECISIONS 34 made `lib/dates.ts` and `lib/timestamps.ts` the house style, but `MONTHS` is still redefined
  in `wire-engine.ts:83`, `chain-of-custody.tsx:47`, `photo-room.tsx:55`, `slide-canvas.tsx:107` and
  `lanes-model.ts:231` (lower case). `fmtDate`, `monthYear` and `fmtYM` are local to `wire-engine.ts:102-112`. `ago()`
  is written twice (`lock/people-pane.tsx:38`, `safety/safety-screen.tsx:42`). Local `when()` exists in
  `corpus-panel.tsx:42` and `following.tsx:47`. There are three `plural` helpers.
- `compactDay(iso, now = new Date())` (`lib/timestamps.ts:41`) and the local-time `timeWords` read the clock and the
  timezone at render. That is safe only because data arrives after hydration. Under `output: 'export'`, anything
  pre-rendered with them would mismatch.

**Target: `lib/format/{money,dates,count}.ts`.** One `amount(n, currency, {short?: threshold})`, one `plural(n, one,
many)`, `ago(iso, now)`, and `dateWords`/`timeWords` re-exported. Add an ESLint `no-restricted-syntax` rule against
`toLocaleString`, `Intl.*` and month arrays outside `lib/format`. **Size:** about 150 lines plus about 30 call sites.

### 1.7 Also duplicated: URL state

`readParam`/`writeParam` exist in `glossary-screen.tsx:49-55` and again in `learn-screen.tsx:33-38`. Elsewhere:
`rememberInvestigation` (`case-workbench.tsx:101-106`), the hash in `section-screen.tsx:26-43`, `?dossier=` in
`inspector-slot.tsx:107`, and `?run=` in `watch-the-run.tsx:656`. There are 18 `history.replaceState` calls.
**Target: `lib/url-state.ts`.** `useUrlParam(key)` built on `useSyncExternalStore` with a server snapshot of `''`,
which removes this hydration risk by construction, plus `setUrlParams({...})`. About 80 lines.

---

## 2. Frontend structure

### 2.1 `components/case/case-workbench.tsx`: 402 lines, 28 KB (lines up to 257 chars)

It does at least 10 jobs:
1. Maps the address to a view (`viewOfPath`).
2. Chooses the investigation and syncs `?inv=` (store and URL both hold it).
3. Holds the API access state and its badge label.
4. Routes cross-stage requests: it subscribes to the store's serial-numbered request slots and `router.push`es
   (`:147-163`).
5. Scrolls to the hash.
6. Runs three data queries it passes down as props (sources, evidence, graph → `relationships`).
7. Traces citations.
8. Builds the error and unreachable states.
9. Declares the **section tables twice**: `view==='all'` (`:241-280`) and the real screens (`:281-321`).
10. Lays out the legacy `AllStages` page, plus `StageHeader`, the toaster and the room overlays.

Every new screen or section edits this file, which makes it a guaranteed merge-conflict point.

**Target:**
- `lib/stages.ts` becomes a section registry, `features/*/section.ts` exporting `{stage, anchor, label, fit,
  Component}`. Each feature registers its own section, so a screen PR adds a file instead of editing a shared one.
- `lib/navigation.ts` gets `useRecordNavigation()`, the request routing.
- Panels fetch their own data through `lib/queries` hooks instead of `relationships` props.
- Drop `view="all"` (§2.2).

The file shrinks to under 120 lines. About 600 lines changed.

### 2.2 The all-stages page and the page tests: CONFIRMED as a bug source

`view="all"` (`components/case/workbench-all.tsx`) mounts a different tree from production. It includes
`RedFlagsPanel` (352 lines), `SourceCapturePanel`, `YearSlider`, `AiReasoningPanel` in a different spot, and
`StageRail`/`StandingTiles` (`components/layout/workbench-page.tsx`). The first five are imported **only** by the
all-view branch of `case-workbench.tsx`. Production instead shows `RedFlagsBoard`, `SourcesBrowser`,
`SafetyScreen`, `AccessScreen` and others. 14 test files render it (`test-page-*.test.tsx`,
`test-inspector-slot.test.tsx`). They depend on `test-support/page-routes.ts` (467 lines) listing every request any
mounted panel makes. In `test-support/mock-api.ts:78-92` an unmocked route returns 404, so a panel that adds a
request fails page tests that are not about it. This matches the brief's "page tests failing on new requests", and
commit `7b6e3de` "Tests and requests after the sweep merges".

**Fix:**
- Delete the all view and the legacy-only panels (or move them to `/style-guide`).
- Add a `renderSection('see', 'money-flows')` helper that mounts one production section through the registry.
- Make the mock answer an unlisted GET with a typed empty value derived from `openapi.json` (lists `[]`, objects from
  the schema's required fields), and fail only on unlisted *writes*.

**Size:** about 400 lines of harness, plus rewiring the 14 tests.

### 2.3 Keep-mounted, hidden screens

Stages and sections stay mounted once opened (`case-workbench.tsx:139-142`, `section-screen.tsx:36-53`). That keeps
their state, but costs:
- Live queries for every visited screen. The default `staleTime` is 30 s (`lib/query-client.tsx:19`), so
  invalidations refetch hidden screens too.
- Measurement while `[hidden]` returns 0 (the `|| w` fallbacks in `wire-engine.ts`).
- Window key handlers on hidden screens (the reason `lib/on-screen.ts` exists).
- 19 `active={…}` props threaded by hand.

**Target:** `SectionScreen` provides `<ScreenActiveContext>`. `useScreenActive()` replaces the props. Queries take
`enabled: active || hasData`, or `subscribed: false` with TanStack v5 `useQuery({subscribed})`. `useElementSize`
re-measures on show.

### 2.4 Query keys and invalidation

- The generated `*Options(opts)` key on the whole options object. The same list ends up under different keys:
  `listEntitiesOptions({path})` in `search-panel.tsx:208`, `documents-panel.tsx:179` and `connectors-panel.tsx:101`,
  and `listEntitiesOptions({path, query:{limit: 500}})` in `corpus/entity-sets.tsx:44` and `listen-room.tsx:106`.
  Two cache entries and two fetches. They also return **different data**: the backend default is no limit
  (`routes_entities.py:86`), so on a case with more than 500 parties the entity-sets screen and listen-room see a
  shorter list than the rest.
- 138 hand-written `invalidateQueries` calls across features (8 in `documents-panel.tsx` after one upload). A new
  query that a mutation should refresh is missed unless someone remembers to add it.
- **Target: `lib/queries/` per-resource hooks.** `useEntities(inv)` has one canonical parameter set, and a
  `useEntityOptions(inv, {limit})` selector derives from it. Do the same for `useRelationships(inv)` and
  `useEvidence(inv)`. Add `lib/queries/invalidate.ts`: `afterChange(kind, inv)` maps a change kind to operation ids,
  using the existing `isQueryOf` predicate (`lib/investigation-queries.ts`). An ESLint rule bans
  `*Options(` imports from `lib/generated` outside `lib/queries`. About 400 lines plus about 230 `useQuery` sites,
  migrated gradually.

### 2.5 Server state in zustand

- `lib/workbench-store.ts` (174 lines) holds `investigationId` (also in `?inv=`; two sources of truth synced by
  `rememberInvestigation`) and `investigationName`. The name is server state, copied from the query by an effect
  (`case-workbench.tsx:197-198`).
- About 10 request slots with serial counters (`claim`, `chain`, `aiRun`, `askCase`, `dossier`, `relationship`,
  `document`, `realness`, `flag`, `check`) act as an event bus.
- Components copy server rows into local state: `review-queue-panel.tsx:63-64` (`selected: ConnectorFindingOut`,
  stale after a refetch), `timeline/board.tsx:118` (`layout` seeded from the query).
- **Fix:** keep ids, not rows, and derive the rest from the query. Make the URL the source of `inv`. Replace the
  serial slots with `useRecordNavigation().open({kind, id})`.

### 2.6 Big files (bytes; line counts understate them)

`wire-engine.ts` 129 KB / 2,065 lines; `watch-the-run.tsx` 78 KB; `reading-room.tsx` 65 KB; `documents-panel.tsx`
57 KB; `red-flags-board.tsx` 56 KB (holds its own chart and label placer); `captures.tsx` 56 KB; `the-drop.tsx`
54 KB. Each would split naturally once §1 modules exist (layout out, view in).

---

## 3. Backend structure

### 3.1 Service modules

`app/services` has 146 modules and 39,530 lines (69 changed in this PR). The largest by bytes are `decks.py` 98 KB,
`following.py` 60 KB, `documents.py` 53 KB, `exports.py` 52 KB, `table_proposals.py` 52 KB and `case_home.py`
48 KB. Elsewhere: `app/schemas/responses.py` is **208 KB / 6,895 lines** in one file, `app/visuals/echarts.py`
95 KB, `app/ai/reasoning.py` 90 KB.

Coupling:
- **333 function-local `from app.services…` imports.** Imports deferred to dodge cycles mean the module graph has
  cycles.
- **39 imports of private (`_name`) functions across modules.** Examples:
  - `custody_chain.py:41-43` reaches into `claim_done._document_of/_file_matches/_norm` and
    `provenance._record_extraction_lineage`.
  - `media_sound.py:24` imports five privates from `media_derived`.
  - `mailbox.py:157` imports `following._log, _schedule`.
  - `capture_witness.py:77,257` imports `following._proxy_for` and `web_capture._sha256`.
  - `openaleph_corpus._first_property` is imported by 5 modules.
- Fan-in: `relationships` 33, `documents` 27, `outbound` 24, `openaleph_corpus` 24.

**Fix:**
- Promote the shared privates to public modules (`app/services/common/{text,hashing,openaleph_props}.py`).
- Split `responses.py` per area (`schemas/responses/{relationships,documents,media,following,...}.py`, re-exported).
  This removes the biggest conflict point after `openapi.json`.
- Add `import-linter` contracts so `services` never imports `api`, and media and intake do not import each
  other's privates.

### 3.2 Relationship serialization: the brief is PARTLY REFUTED

There is **one** serializer, `serialize_relationships()` (`services/relationships.py:356-376`), batched through
`_load()`. The problems are around it:
- Callers loop per edge: `provenance.py:232,253,276,286,301,361,364,390,408` and `search_view.py:288`, which
  serializes a whole row to read one count.
- Three separate caches of the same rows: the ContextVar `relationship_rows_shared()` (`relationships.py:273-289`,
  used only by the chart catalogue, `visuals/data_service.py:859-864`), a closure cache in
  `timeline._advisories()` (`timeline.py:63-77`), and a ContextVar in `visuals/data_service.py:43`. Plus the
  `copied()` deep copy, a workaround for callers that mutate the rows.
- `search.py:542` builds its own partial dict.

**Fix:** make `serialize_relationships` the only entry point. Add a request-scoped read cache
(`app/db/read_cache.py`, a dependency that opens it per request) so every caller benefits. Return frozen
dataclasses or Pydantic models so nothing needs `copied()`. Change the per-edge loops to batch calls. About 200
lines changed.

### 3.3 Outbound requests, logging and guards: MANY LAYERS, not one

`services/outbound.py` (112 lines) is a *helper* called at each call site (`record_outbound`,
`record_platform_request`, `record_model_call`), not a transport. HTTP clients are created in 13 modules:
- **Guarded and logged:**
  - `following.py`: `check_address`, then a `_Guard` proxy imported privately from `web_capture`.
  - `capture_witness.py` and `web_capture.py`: the same pattern.
- **Logged, not guarded:**
  - `voices.py:236`: `httpx.stream(follow_redirects=True)`.
  - `photo_tools.py:56`: `httpx.get(follow_redirects=True)`.
  - `basemap_install.py:186`: `httpx.Client(follow_redirects=True)`.
- **Not logged in `outbound_requests`:** `connectors/aleph.py`, `firecrawl.py` and `opensanctions.py` (logged one
  level up in `services/connectors.py`), and `visuals/render_client.py`. `ai/llm_client.py` is logged through
  `record_model_call`.
- **Four `User-Agent` strings:** `following.py:49` `/1.0`, `openaleph.py:43` `/0.88`, `openaleph_http.py:28`
  `/0.93`, and `demo_1mdb.py:85`.
- **Two copies of the Direct-vs-Tor choice:** `_proxy_for` (`following.py:125`) and inline at `following.py:1133-1137`.

Fixed-host downloads (model weights, basemap) are low SSRF risk. The risk is that the ADR-0015 promise ("every
request that leaves the computer is logged") is kept by hand at each call site.

**Target: `app/net/client.py`**
```py
outbound_client(db, investigation_id|None, *, service, reason, actor, route: 'direct'|'tor'|'fixed_host',
                budget_bytes, protected: bool) -> httpx.Client
```
It wraps the transport. It checks the address on every hop, uses the guard proxy or Tor, enforces the byte budget,
refuses for source-protected items, and writes `outbound_requests` sent/failed/blocked through an httpx event hook,
with one User-Agent. Every module above, connectors included, gets its client from here. A test (or `import-linter`)
bans importing `httpx` or `urllib.request` outside `app/net`. About 250 lines plus 13 call sites.

### 3.4 Job system

`app/jobs` (2,070 lines) is sound: Procrastinate on PostgreSQL or inline on SQLite (`runner.py:1-13`), with records,
recovery and schedule. It is bypassed in several places:
- `saved_questions.py:149` starts a `threading.Thread` that calls `execute_job` directly, whatever the runner.
- `basemap_install.py:220` uses a daemon thread.
- `routes_demo.py:103` uses `asyncio.create_task`.
- `main.py:233` warms the catalogue in a thread.
- Handlers run child jobs synchronously inside the parent: `handlers.py:73,626,649`, `execute_job(factory, child.id,
  HANDLERS)`. Under Procrastinate the parent's worker slot is then held for the child's whole run, and child retries
  and recovery bypass the queue.

DECISIONS 24 ("a background job on SQLite gets its own connection") is a symptom of this.

**Fix:** everything long-running is a job kind (`basemap_install`, `demo_load`, `saved_question`,
`catalogue_warm`). Children are enqueued with `parent_job_id` and the parent finishes or waits through the queue's
status. About 300 lines.

### 3.5 Migrations hygiene

There are 76 revisions and one head (`b2e5c8a1d730`). The one historical branch point, `b84e2fa90c17`, was resolved
by `d1e2f3a4b5c6_merge_heads.py`. The PR adds 17 migrations. **Evidence of merge-time breakage:** the merge commits
`5e840a3`, `d5abbd4` and `12a2b55` *rewrite `down_revision`* of migrations brought in by the merged branch
(`git diff <merge>^2 <merge> -- backend/alembic/versions`). Three agent branches each started at `e6c1b4d8a352` and
were re-chained by hand into `a7d3f9c2e614 → a7f3c9e2d641 → a8d2f6c4e913` (START_HERE records the chain). The
revision ids are invented hex rather than generated, which is how `a7d3f9c2e614` and `a7f3c9e2d641` came to look
alike. The only automated check is `alembic upgrade head` in the PostgreSQL CI (`backend-postgres-ci.yml:110`),
which runs after the push.

**Fix:**
- A fast unit test `tests/test_migrations_graph.py`: `ScriptDirectory.get_heads()` must return one head, every
  `down_revision` must exist, and each new migration's parent must be the head of `origin/main`.
- A downgrade/upgrade round trip on SQLite.
- `alembic revision` (generated ids) only.
- A rule: a PR that adds a migration rebases onto main's head before merge, never re-parented inside a merge commit.

Also, ADR numbers collide: `0015-outbound-log.md` and `0015-stored-evidence-anchors.md`.

### 3.6 Generated client drift

The guards exist: `tools/export_openapi.py --check` (`backend-lint-ci.yml:63`), and `npm run generate:api` followed
by `git diff --exit-code lib/generated` (`frontend-ci.yml:35-39`). The failure is in merging: the 81k-line
`openapi.json` and the 19k-line generated client conflict on every branch that touches a route. They should be
regenerated after a merge, never merged by hand.

**Fix:** mark them in `.gitattributes` with `linguist-generated=true -diff merge=ours`, and add a post-merge step
(`tools/regen.sh`: export_openapi, then generate:api). Splitting `responses.py` (§3.1) reduces the conflicts too.

---

## 4. Process: splitting the 241-commit PR

### 4.1 What blocks merging today

1. **CodeQL: 3 new medium alerts**, "Information exposure through an exception", at
   `backend/app/api/routes_table_mappings.py:86,95,106` (`raise HTTPException(400, str(exc))` on `TableError`).
   **Fix:** give `TableError` a `code` and a fixed user message, and return those instead of `str(exc)`. The CodeQL
   summary also warns: "Alerts not introduced by this pull request might have been detected because the code changes
   were too large." That is a reason to split in its own right.
2. **`mergeable_state: blocked`.** All checks are green, so this is branch protection (a required review is the
   likely cause; not checked further: the GraphQL API is closed to this session and the code-scanning REST endpoint
   returned 403).
3. **The PyMuPDF AGPL-3.0 question is still open.** `docs/research/source-intake/DECISIONS.md` row 10 says PyMuPDF
   "is imported in-process by `pdf_ocr.py`, `page_image.py`, `image_reader.py` and `legibility.py`. That is linking
   … needs Ony's attention: a commercial PyMuPDF licence, a permissive replacement (pypdfium2 …), or moving it behind
   a separate process". `PyMuPDF==1.28.2` is already on main, so this PR does not *introduce* it. But it deepens the
   dependence: three of those files change here, and the margin-line-number reading (DECISIONS 22) uses PyMuPDF word
   coordinates. It blocks any release or distribution, not the merge itself. The native module's PDF stack
   (pdfcraft, hayro, lopdf; MIT/Apache per `backend/native/NOTICE.md`) could replace it.
4. **Licence and supply notes to settle with the merge:**
   - HEVC patents for HEIC (`NOTICE.md`).
   - The native crate builds from git dependencies on Ony's forks at pinned commits (`Cargo.toml`), so the build
     depends on those repos staying reachable.
   - CI now downloads whisper and voice models (`backend-postgres-ci.yml:87,91`).

### 4.2 Proposed sequence onto `main`

The rules for each PR:
- It stands alone on main, and CI is green: backend-lint (ruff, mypy, openapi `--check`), backend-postgres
  (`alembic upgrade head` plus the gate), frontend (generated-client check, lint, typecheck, vitest, build), docker
  build and CodeQL.
- Every migration in it chains from main's head at the time it merges.
- Its `openapi.json` and `lib/generated` are regenerated, not merged.

| # | PR | Contents | Must land together | Extra checks |
|---|---|---|---|---|
| 0 | **Guards first** (small) | migration-graph test (§3.5), `.gitattributes` for generated files plus regen script (§3.6), fix ADR 0015 numbering, CodeQL fix for `routes_table_mappings` (if that route exists on main; otherwise in 3a) | none | the new test fails on a forked chain |
| 1 | **Models + migrations** | 16 model files, 17 migrations as one linear chain on main's head, `schemas` table types only | each migration with its model; the whole chain (later ones depend on earlier) | upgrade then downgrade on SQLite and PostgreSQL; nothing serves them yet, so the API is unchanged |
| 2 | **Native module** | `backend/native` (Rust crate, `Cargo.lock`, `NOTICE.md`), `services/native.py`, `services/derived_files.py`, Dockerfile, CI install step, ADR-0021 | crate + Dockerfile + CI step + Python wrapper | docker-build; `pip install ./native` in CI; licence notes |
| 3a | **Core record changes** | payment kinds (+ADR 33/42), claim evidence superseded, document kind/language (py3langid, ADR-0027), table proposals, `source_labels`, the relationships serializer, timeline lanes/periods/built timelines, places + `basemap_install`, `case_home` | route + `openapi.json` + `lib/generated` + any frontend consumer of a *changed* shape (additions need none) | touched backend test files; frontend typecheck against the new client |
| 3b | **Source intake** | following, mailbox, capture_follow/witness/quotes, platform checks, authenticity, evidence pack, pack signing/check, print_pdf, manual entry; ADR-0022–0025 | same as 3a; `test_following.py` etc. | Playwright install in CI (already present) |
| 3c | **Media** | photos, photo_tools, pdf_redact, media_derived, media_sound, voices (sherpa-onnx), publisher_transcript, transcription; ADR-0020/0026 | needs 2 | model fetch steps |
| 3d | **Decks, story, AI** | deck_editor, deck_pdf, decks, writeups, stories | needs 3a | |
| 3e | **Demo data** | demo_decided/deck/story/following/captures, `demo/*` files | needs 3a–3d (it exercises them) | demo load test |
| 4 | **Shared UI primitives** (existing ones, unchanged) | `components/ui/reveal.tsx`, `components/status.tsx`, `components/network/marks.tsx`, `lib/dates.ts`, `lib/timestamps.ts`, `lib/on-screen.ts`, `lib/theme.ts` status setting, `features/inspector/inspector-slot.tsx`, `/style-guide`, the section registry from §2.1 | registry + `case-workbench.tsx` rewrite | vitest; the style guide renders |
| 5a | Frame, Case home, Decide, Settings, Appearance | | each screen with its CSS file, its tests, its registry entry and its `page-routes` additions | screenshots at 1440×900 and 390 of the 1MDB demo attached to the PR |
| 5b | Bring in (The Drop, Following, Library, Sources & evidence, Connectors, Corpus, Search) | needs 3b | | |
| 5c | Check (Claims, To check, Connector findings, Is it real?, Chain of Custody, Check a pack) | needs 3a/3b | | |
| 5d | See (The Wire, Money, the 6 Timeline views, Places, Add by hand) | needs 3a; the largest | | |
| 5e | Act (Red Flags, Story, Leads, Charts, Decks, AI runs/drafts) | needs 3d | | |
| 5f | Keep (Safety, Backup, Delete, Access) | | | |
| 5g | Reading rooms (photo, redact, listen) | needs 3c | | |
| 5h | Glossary, Learn, design docs and mockups (64 files) | docs can also go first as a docs-only PR | | |
| 6+ | **Consolidation**, one module per PR, migrating *every* caller in that PR: labels (§1.1), screen/fill (§1.2), status scales (§1.3), layers/Esc (§1.4), empty states (§1.5), format (§1.6), url-state (§1.7), query hooks (§2.4), outbound client (§3.3), jobs (§3.4) | | the module plus all its callers; delete the old code in the same PR | the browser geometry gate below |

**How to cut them.** The 24 agent merges make cherry-picking by commit impractical. Cut each PR by *path* from the
branch tip instead: `git checkout claude/laughing-tesla-dstx1t -- <paths>` onto a branch from main, then fix up what
is missing.

**Cheaper alternative.** If the owner prefers it: fix blockers 1–2, squash-merge #117 as it is (CI is green), and
apply the "guards first" and consolidation PRs on main afterwards. The split mainly buys reviewability and a CodeQL
run that covers the whole change.

### 4.3 A check that every screen PR should pass (new)

Add a Playwright geometry gate, `frontend/e2e/layout.spec.ts`. `tools/export_site_mockup.py` already drives a
browser at 1440. For each section in the registry, it loads the 1MDB demo at 1440×900 and 390×844, on each of the
five themes, and asserts:
- `document.scrollingElement.scrollHeight <= innerHeight` (the page never scrolls);
- no two `[data-label]` boxes intersect;
- no `[data-label]` has `scrollWidth > clientWidth` unless it carries a Reveal;
- no element matching the sub-text selectors (`.hint, .explain, [data-subtext]`) is visible at rest;
- no hydration warning in the console.

This turns the manual sweeps of DECISIONS 47–57 into a failing test, and needs `data-label` on the output of §1.1.
About 300 lines.

---

## Prioritised fix list (biggest payoff first)

1. **Browser geometry gate (§4.3) + `lib/layout/labels.ts` with real text measurement (§1.1).** Covers the
   overlap/clipped-name class on every theme. About 1k lines plus migration.
2. **`<Screen>/<Region>`, `--frame-h`, `useElementSize`, `<FillText>` (§1.2).** Covers the empty-space and page-scrolls
   classes. About 250 lines plus CSS deletions.
3. **Drop `view="all"` and rebuild the page-test harness (§2.2).** Tests test production, and new requests stop
   breaking unrelated tests. About 400 lines.
4. **Merge hygiene (§3.5, §3.6, PR 0).** Migration-graph test, regenerate-not-merge for generated files, ADR
   numbering, split `responses.py`. Stops the merge-time breakages.
5. **Section registry + navigation hook; shrink `case-workbench.tsx` (§2.1); `useScreenActive` (§2.3).**
6. **Query hooks + invalidation map (§2.4); ids, not rows, in the store (§2.5).** Fixes the double entity list and
   stale panels.
7. **`<Layer>` + `useEscape` (§1.4).** Esc and focus right everywhere.
8. **Status scales (§1.3).** The accessibility setting applies to every status.
9. **`<EmptyState>/<QueryState>` (§1.5); `lib/format` + lint rule (§1.6); `lib/url-state` (§1.7).**
10. **Backend: `app/net/client.py` (§3.3); jobs for every background task (§3.4); request-scoped read cache for
    relationships (§3.2); public shared helpers + import-linter (§3.1).**

Not checked:
- The open CodeQL alerts on `main`: the code-scanning API returned 403.
- PR comments: the GraphQL API is closed.
- Runtime behaviour: nothing was run, so the mismatched entity lists (§2.4) were read from code, not observed.
- Exact per-site line counts for the migration estimates, which are approximate.
