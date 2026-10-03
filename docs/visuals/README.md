# Investigation visuals (passes 2–4: the foundation, the statistical charts, money flows)

This is the code behind the design doc "Investigation Visuals & Presentation
System" (pass 1: research) and the decisions in ADR-0005 (lines 1, 2, 5, 6).
Pass 2 laid the foundation under every later visual and proved it end to end
with bars: a horizontal ranked `bar` and a vertical `column`. Pass 3 draws
the statistical kinds on the same foundation: `line`, `area`,
`stacked_bar_100` (the 100% bar the design uses instead of small pies),
`donut`, `treemap`, `histogram` and `scatter`. Pass 4 draws money flows as a
`sankey` (below, "Pass 4: the flow diagram"); `timeline` is still to come.

The promise, in one line: **the AI never types a number.** It writes a short
order; the Workbench cooks every value from the investigation's own records,
checks the chart, draws it, and a person reviews it.

## The pipeline in plain words

```
order slip  →  kitchen  →  checker  →  drawing  →  review
(spec.py)      (data_service.py)  (checker.py)  (echarts.py + render/)   (review queue, deck, brief)
```

1. **The order slip** (`backend/app/visuals/spec.py`). A `VisualSpec` names a
   chart kind, a title that states the finding, and one query from a fixed
   catalogue with that query's parameters. Optional: a subtitle, a sort
   order, a limit (keep the top N, fold the rest into "Other"), labels to
   highlight, and a theme. The spec refuses anything else (`extra="forbid"`),
   so a model that tries to add `values` or `items` is turned away. Unknown
   query names and bad parameters get a plain message naming the catalogue.
   `QUESTIONS` is the chart chooser, after the FT Visual Vocabulary: ranking,
   change over time, part of a whole, distribution, correlation and flow,
   each with the kinds that answer it and the query shapes that hold that
   relationship (`category`, `time`, `distribution`, `pairs`). An order may
   name its `question`; an unknown one is a malformed order, and a kind or
   query that does not answer it is refused when the chart is drawn
   (`ChartDoesNotFit`), which sends the model back with the kinds that do.
2. **The kitchen** (`backend/app/visuals/data_service.py`). Eleven read-only
   queries, each scoped to one investigation: `payments_by_party`,
   `payments_over_time`, `events_over_time`, `links_by_type`,
   `claims_by_status`, `entities_by_schema`, `evidence_by_stance`,
   `documents_by_status`, `leads_by_status`, and for pass 3
   `payment_amounts` (one row per payment, for a histogram) and
   `payments_count_and_total_by_party` (two numbers per party, `x` the number
   of payments and `value` their total, for a scatter plot). Every row is
   `{label, value, record_refs, record_count}`: the value is a sum or a count
   of real records, `record_refs` are the `{record_type, record_id}` pairs the
   citation layer already understands, and `record_count` says how many
   records sit behind the value. Rows come back in a canonical order, so the
   same records give the same rows whatever order the database returns them
   in. Currencies are never added together: a payments query returns one
   currency and lists the others under `omitted`. Records a query could not
   use (a payment with no amount, an event dated only to the year when
   months were asked for) are listed under `omitted` with the reason, never
   guessed at. `describe_catalog()` is the menu the AI and the chart builder
   see: each query, its parameters, whether this investigation has data for
   it, the kinds that can draw it and the questions it answers.
   The numbers a chart needs beyond a query's own sums and counts live
   beside the kitchen in `backend/app/visuals/stats.py`: the shares of a
   whole; histogram bins (the number of bins by Doane's rule, NumPy's
   estimator, because payment amounts are skewed; Sturges as the style
   alternative; round edges by Vega's bin transform); and the outliers a
   crowded scatter plot names (Tukey's fences). The module's docstring
   gives the sources and why Freedman–Diaconis is not offered.
3. **The checker** (`backend/app/visuals/checker.py`). `check_visual(spec,
   data, theme)` returns a report with `ok`, `errors` and `warnings`; every
   item carries the design rule's number and a plain-words message. An error
   keeps the chart out of a draft; a warning travels with it so the reviewer
   sees it. The report also says, rule by rule, what was judged for this
   kind of chart: `checked_rules` (judged against this chart, reading what
   its kind draws), `not_applicable` (rules about another kind of chart,
   with the reason: a zero baseline for a donut, slices for a bar chart) and
   `not_checked` (rules for a later pass, or the option-level rules of a
   kind not drawn yet). The rule map is below.
4. **The drawing** (`backend/app/visuals/echarts.py`). `build_chart()` turns
   spec + data + theme into an ECharts option in the house style (BBC
   cookbook, Datawrapper, Urban Institute): the title states the finding, the
   subtitle gives the unit, only horizontal gridlines where a chart has
   axes, a dark zero line, values written on the marks with the record
   count and a `†` on a value that rests on one record, no 3D, a zero
   baseline for bars and areas, at most eight colours (seven Okabe–Ito
   colours and a grey "Other" for the kinds that colour each part), a source
   line, text at least 12 px, colours and fonts from the deck theme
   (`app/services/presentation_style.py`). Per kind: a line or an area
   writes its last value at the end and draws a point that rests on one
   record hollow; a 100% bar and a donut write each part's name and share
   (the donut has its total in the centre and never a pulled-out slice); a
   treemap writes inside each part in black or white, whichever reads; a
   histogram's bars touch; a scatter plot names every point when there are
   few and the outliers when there are many. A kind that cannot draw a
   query's rows (a histogram of periods, a scatter plot of one number) is
   refused in plain words (`ChartDoesNotFit`). It also writes the alt text, a
   longer description and the data table. Animation is off: the option is
   drawn on a server. The in-app preview and the exports read the same rows,
   so they cannot disagree.
   Where the words land is worked out before ECharts draws them
   (`backend/app/visuals/layout.py`), with ECharts' own numbers: the text
   widths zrender uses without a canvas and a port of ECharts' squarified
   treemap layout, both checked against the installed ECharts. The drawing
   leaves room beside the plot for the end label of a line, the values past
   the longest bars and the names beside a scatter plot's points, and slides
   a 100% bar's labels apart and into the picture. The checker uses the same
   numbers to judge what a reader will see (see rules 12, 14 and 16 below).
   Fonts are written as a CSS font list ending in a generic family
   (`presentation_style.font_stack`): the export's PNG is drawn where the
   theme's face may not be installed, and with only `Calibri` named, every
   word of a Dark Academia chart was dropped from the PNG.
5. **The export bridge** (`render/` and
   `backend/app/visuals/render_client.py`). A small Node 22 service draws the
   option as SVG with ECharts' server-side renderer (ADR-0005, line 2);
   `vl-convert-python` turns the SVG into the PNG that PowerPoint and Word
   accept. When the service cannot be reached, `RenderUnavailable` is raised
   and the exports keep today's behaviour.
6. **Review.** In a presentation draft, the chart check
   (`backend/app/ai/chart_check.py`, next to the quote check) runs steps 2–4
   on every chart the model ordered. A chart that passes is stored in the
   draft with its data, its check report and its words, so the deck, the
   write-up and the preview never run the model again. A chart that fails
   goes back to the model with the errors, at most twice; the last answer is
   kept with its failing charts removed and the rule numbers and messages
   recorded in the candidate's trace (`chart_check.removed`,
   `chart_retries`). A person still accepts the draft before it becomes a
   deck or a brief.

## How a chart reaches a deck and a brief

- The draft visual is `{"type": "chart", "spec": {...}}` (the fourth visual
  type beside `figures`, `timeline` and `bar`; see
  `app/ai/presentation_modules/PRESENTATION_DRAFT.md` and
  `OUTPUT_SCHEMAS["presentation_draft"]` in `app/ai/reasoning.py`). After the
  chart check it is `{"type": "chart", "spec", "data", "report", "text"}`.
  The model is told to choose by the question the data answers, then a
  query listed under that question, then one of the question's kinds, and
  to write a title that states the finding in words. Its packet's
  `visual_catalog` (`chart_check.visual_catalog_for_prompt`) lists the
  questions with their kinds and queries, and every query with the kinds
  that can draw it. The kinds and questions in the output schema are read
  from the drawing's own lists, so the schema cannot fall behind it.
- **Both exports check again first.** A stored chart is rebuilt from its
  stored order slip and data and checked again (`decks.checked_chart`), so
  a chart stored before a rule tightened, or edited by hand, is replaced by
  a note naming the failed rules instead of being drawn. The check's report
  travels no further than this: the export draws only what passed.
- **Deck** (`app/services/decks.py`): a native, editable PowerPoint chart
  for every kind python-pptx can draw, styled from the deck theme: bar and
  column as before; line (`LINE_MARKERS`) and area (`AREA`), with a hollow
  marker on a point that rests on one record and the last value written at
  the end; the 100% bar (`BAR_STACKED_100`, one series per part); the donut
  (`DOUGHNUT`, the total in the centre); the histogram (`COLUMN_CLUSTERED`
  with no gap between bins); the scatter plot (`XY_SCATTER`, each point
  named, both axes titled). A period's or a column's record count goes on a
  line of its own under its name, so the labels stay level, and a value
  written on a line's point is the value alone. PowerPoint writes a data
  label in the middle of its mark and LibreOffice wraps a long one into a
  narrow column, so the small parts of a 100% bar and the thin slices of a
  donut had labels running over each other: their labels are now laid out
  the way the app draws them (`decks.whole_bar_layout`: above and below the
  bar in turn, moved apart with `layout.place_on_line` but always over or
  under their own part, two lines a side when one is not enough;
  `decks.donut_layout`: in a column on each side of the ring, at their
  slice's height), each moved there from its default place with the manual
  layout PowerPoint itself saves for a dragged label, unwrapped, with a
  leader line back to its mark; the font steps down from 11 to 9 pt before
  the parts are shown as ranked bars with a line saying why. The treemap,
  which PowerPoint charts cannot draw, is the PNG from the render service,
  filling the chart's space with its title and source line in it. It is
  drawn at the slide's own scale (`decks.picture_size`: a design size where
  its 12 px text reads at 10.5 pt; drawn at 960 x 540 and shrunk into half a
  slide, it read at 5.5 pt) and checked again at that size; a treemap whose
  small parts cannot name themselves there, or one the render service
  cannot draw, is shown as ranked native bars under a line saying why. The
  deck keeps that slide-scale drawing (or the bars and the line) with the
  chart when it is saved, and the app's slide preview draws it, so the
  preview is what the export will be (`decks.slide_picture`). Every chart has
  its title and unit above it, the source line under it, its alt text on
  the shape (what a screen reader announces), its description in the
  speaker notes, and its records numbered in the slide footer and on the
  Sources slides.
- **Brief** (`app/services/writeups.py`): for every kind, the PNG from the
  export bridge with the alt text as its caption, then the data table (with
  the share for the parts of a whole and both numbers for a scatter plot)
  with a citation marker on every row, then the source line. When the
  render service is unreachable the brief says so and shows the values as a
  table instead.
- **The chart builder** (`frontend/features/charts/chart-builder-panel.tsx`,
  "Charts from the records" on the workbench page): a reporter makes a
  checked chart with no AI involved. It writes the same order slip the AI
  writes and chooses the same way: first the question the chart answers
  (the catalogue's questions; flow is shown but not drawn yet), then the
  data that answers it (only the queries listed under that question, with
  their parameters; a query with no records is listed but cannot be
  picked), then one of the question's kinds that can draw that data, best
  first, and a title that states the finding. The preview route cooks,
  draws and checks it: the panel shows the chart (ECharts loaded on
  demand), its source line, description and data table, every record
  behind a value as a link to the provenance trace, and the check report,
  with every failed rule and every warning by its number and name and the
  checker's own words. A kind that cannot draw the data comes back as the
  route's 422 reason. The catalogue runs every query once, so it is asked
  for only when the builder is opened. Nothing is stored.
- **Styling a chart** (`app/visuals/style.py`; the catalogue in
  `app/services/presentation_style.py`: `CHART_FAMILIES`, `CHART_PRESETS`,
  `CHART_OPTIONS`, after "Presets and options per chart type" in the Visual
  Editor design). A chart's style is a preset of its family plus option
  overrides, kept on the stored chart as `"style": {"preset", "options"}`. A
  preset may move the chart to another kind of its family (a ranking as bars
  or columns; parts of a whole as a 100% bar, a donut or a treemap), and is
  offered only when that kind answers the order's question and can draw its
  data. Options sort the parts, fold the smallest into "Other", pick some out
  (the others turn grey), and change how the marks are drawn (thickness,
  markers, a centre total, the binning rule, which points are named); an
  option can belong to some kinds or query shapes only. Style never changes
  the data: the rows stay as the data service cooked them, and the styled
  order slip is drawn and checked again, all twenty rules. What the design
  refuses has no control at all, so it cannot be picked: an axis above zero,
  3D, a second value axis, a pulled-out slice, gaps between a histogram's
  bins. A smoothed curve and a log scale are allowed with a warning beside
  their control, and a donut with more than four slices is warned about
  beside "Fold into Other after" (the check then refuses it, rule 5). `POST
  /api/investigations/{id}/visuals/restyle` takes a stored chart, a style and
  the deck's look, and answers with the chart drawn and checked again, the
  style as it will be kept, the presets the chart can take, every option's
  value and the warnings; nothing is stored. In the app, the presentation
  preview's style panel shows these controls for a chart slide, asks for the
  restyle on every change, draws the reply on the slide and shows its check
  report; "Promote to deck" sends the styles. A deck checks its charts again
  itself whenever its slides or its look change (`decks.recheck_charts`, on
  create and update), so the stored drawing, words and report are the ones
  the export draws, and a chart a style has broken is exported as the note
  naming its failed rules.
- **Preview** (`POST /api/investigations/{id}/visuals/preview`): the data,
  the ECharts option, the check report, the alt text, the description and the
  data table for one order slip, with no AI involved. `GET
  /api/investigations/{id}/visuals/catalog` is the menu. Both routes are
  scoped to the investigation like the rest of the API, and both have
  declared response models (`app/schemas/responses.py`).
- **In the app** (`frontend/components/presentation/chart-visual.tsx`): the
  presentation preview draws the stored option itself for every kind, at
  its design size scaled to fit, without the app's dark chart theme. The
  ECharts parts the kinds need are registered in
  `frontend/lib/echarts-setup.ts`, tree-shaken: the pie series (a donut),
  treemap and scatter series, and two features the backend's options rely
  on that ECharts 6 moved out of its core, `LegacyGridContainLabel` (the
  axis-label layout the render service uses, so preview and export lay out
  alike) and `LabelLayout` (a scatter plot's overlapping names). ECharts is
  loaded on demand (`next/dynamic`), so it stays out of the page's first
  load. The data table shows a part's share and a scatter plot's second
  number. `frontend/tests/test-echarts-kinds.test.ts` draws every kind's
  option with the app's own registered parts, because ECharts skips a
  series whose chart type was never registered without a word.
- The citation layer sees the chart's records because they are ordinary
  `{record_type, record_id}` pairs inside the stored data: the candidate's
  `citation_details`, the deck's source numbering and the write-up's
  `cited_record_refs` all include them. A chart of events over time cites
  reporter-authored timeline events as `timeline_event`, which
  `describe_record_refs` now describes by title and date.

## The rule map

Numbers are the design doc's and never change. "Judged from" says what the
checker needs; rules that need the drawn option are reported as not checked
for a kind pass 2 cannot draw yet.

| # | Rule | Judged from | Error or warning |
|---|------|-------------|------------------|
| 0 | The numbers drawn match the data (the design's first check, after VisEval) | option + data | error; for a histogram every record is counted into the drawn bins again, for a 100% bar or donut each written share is read back, a donut's centre total is compared with the parts; a warning for a smoothed line (it follows no record between points) |
| 1 | Bars and areas start at zero | option | error; a 100% bar must also run to the whole; not applicable to line, donut, treemap, scatter |
| 2 | No log scale on bars or areas, or on data with zero or negative values | spec + data | error (a scatter plot's x counts too) |
| 3 | Never show a negative value as a size | spec + data | error for area/angle kinds, warning for bars; not applicable to line and scatter (positions) |
| 4 | Stack only bars and areas; never total the same field twice | spec + data | error; a donut, treemap or 100% bar whose parts share records is refused (they would total those records twice) |
| 5 | Donut: four slices at most, adding to 100% (±0.5) | spec + data + option | error; the shares written on a donut or 100% bar must add up to 100 within half a point; not applicable to other kinds |
| 6 | No second value axis | option | error (a scatter plot's axis across and axis up are one each) |
| 7 | No 3D, no upside-down axis, evenly spaced ticks | option + data | error; also no pulled-out slice and no rose, and a histogram's bins touch and share one width; warning past 36 periods |
| 8 | Never join unrelated categories with a line | spec + data | error; not applicable to kinds without a line |
| 9 | Length and position first; never an order drawn in random colours | spec + option | error for random colours, and for a part-of-whole chart over periods (an order in category colours); warning for a ranking as donut/treemap |
| 10 | Eight colours at most; fold the rest into "Other" | spec + data + option | error; warning past 20 bars |
| 11 | Text contrast 4.5:1; neighbouring colours 3:1 or labelled directly | theme + option | error; a line or a point needs 3:1 against the page, text inside a part 4.5:1 against its fill |
| 12 | Never rely on colour alone | spec + option + layout | error (highlighted bars bold; highlighted points and parts labelled in bold; every part of a donut, treemap or 100% bar carries its name, and the name must be seen: a treemap part too small to show it, or 100% bar labels that collide or leave the picture, fail) |
| 13 | A title that states the finding; alt text, description and data table | spec + drawing | error |
| 14 | Chart text at least 12 px | option + layout | error; warning when the values written over columns, bins or every point of a line are wider than the room each mark has |
| 15 | A source line; every value links to a record | data + option | error |
| 16 | Show how many records sit behind each group; flag groups more than 10× apart | data + option + layout | error for missing counts (on the mark, or in each point's tooltip for line, area and scatter, and for a treemap part too small to show its count); warning for the spread |
| 17 | Shaded maps: rates not counts, 3–7 steps, fair-area projection | — | not checkable here (maps pass) |
| 18 | Networks over ~20 nodes offer a grid view; crossings counted | — | not checkable here (networks pass) |
| 19 | Never add up different currencies | spec + data | error for a wrong unit; warning for currencies left out; not applicable to counts |
| 20 | A value resting on one record is visibly flagged | data + option | warning for the value; error if the mark is missing (`†` on bars, parts and bins; a hollow marker on lines and points) |

The metamorphic tests from McNutt et al. (CHI 2020) live in
`backend/tests/test_visuals_echarts.py` (bars) and
`backend/tests/test_visuals_kinds.py` (every statistical kind): shuffling the
rows gives an identical option, nudging a value changes it. A histogram is
the one kind where a small nudge rightly changes nothing (it counts records
per bin), so its nudge carries a payment across a bin edge, and a separate
test shows a nudge inside a bin leaves the picture as it was.

## Running the render service

In the Docker stack it is the `render` service in both compose files and the
backend reaches it at `http://render:8070` (`RENDER_SERVICE_URL`). Outside
Docker:

```
cd render && npm ci && npm start     # listens on 0.0.0.0:8070
```

The backend's default `RENDER_SERVICE_URL` is `http://127.0.0.1:8070`. `GET
/health` says whether it is up; `npm test` runs its own tests, and
`backend/tests/test_visuals_render.py` starts it on a free port and draws a
chart of every kind through it, checking that each PNG carries its words
(skipped when Node or `render/node_modules` is missing). The service imports
the whole `echarts` package, whose `index.js` registers every chart,
component and feature, so it draws every kind with no change. The app
registers only what it needs (`frontend/lib/echarts-setup.ts`). See
`render/README.md`.

The PNG's text is drawn by vl-convert with the fonts installed where the
backend runs. vl-convert carries Liberation Sans inside it, so the generic
`sans-serif` at the end of every chart's font list always finds a face;
installing the themes' own fonts on the backend host (Carlito for Calibri,
for example) makes the PNG match the deck more closely.

## Tests

```
cd backend
TZ=UTC PYTHONPATH=. python -m pytest tests/test_visuals_*.py -q --no-cov
```

| File | What it proves |
|------|----------------|
| `test_visuals_spec.py` | Valid orders parse; unknown queries, bad parameters, numbers and unknown themes are refused with plain messages; the questions and the kinds each query fits |
| `test_visuals_data_service.py` | Every query on the demo investigation; currencies never mixed; incomplete records listed; canonical order; payment amounts and the two numbers per party |
| `test_visuals_stats.py` | Shares; bin counts against NumPy's estimators (when NumPy is importable); round edges against Vega's own output; every value in exactly one bin; Tukey's fences |
| `test_visuals_checker.py` | A failing and a passing case for every rule above, for bars and for each rule a statistical kind adds |
| `test_visuals_echarts.py` | The house style of bars, the words beside the chart, the metamorphic tests |
| `test_visuals_kinds.py` | Every statistical kind in the house style and passing its check, its draw options, the kinds refused for a query they cannot draw, labels kept in the picture and the checks on what fits, the metamorphic tests for every kind, and that the app's copy of each kind (`frontend/test-support/chart-kinds.json`) is what the backend draws |
| `test_visuals_layout.py` | Text widths and treemap rectangles equal to ECharts' own (and, with Node, to the installed ECharts), labels moved apart on a line, words wrapped at spaces |
| `test_visuals_render.py` | The bridge behind a mocked transport, vl-convert drawing text in a font list, a live run of the Node service for every kind with its words in each PNG |
| `test_visuals_exports.py` | Every kind in a deck (the native chart type, alt text, source line, notes; the treemap as the picture drawn at the slide's scale, or as bars when it cannot name its parts there or the service is down; a stored chart that now fails a rule is not drawn), the native labels of a 100% bar and a donut (never on each other, over or under their own part, clear of the ring, moved, unwrapped, with leader lines), and every kind in a brief (image, caption and data table, or a table and a note) |
| `test_visuals_routes.py` | The catalogue, preview and restyle routes, their response models, investigation scope |
| `test_visuals_style.py` | The presets a chart can take, the options of each kind, a style that never changes the data and is checked again, the warnings, what is refused by having no control |
| `test_visuals_draft.py` | A draft whose model orders a chart: kept, re-asked, or removed with reasons |

## Pass 4: the flow diagram

Who paid whom, drawn as a sankey (the design doc's "Money-flow diagram",
question `flow`). The query `payment_flows` totals the Payment records of
each payer and recipient pair in one currency (rows of the new `flows`
shape: `source`, `target`, the amount, the payments behind it); the same
rows rank as bars.

- **Layout.** A party's column is the longest chain of payments leading to
  it, and a party that pays no one sits in the last column (ECharts'
  `justify`); the columns are set on each node (`depth`) rather than left
  to ECharts, so the checker and the labels know where every band runs.
  ECharts refuses flows that come back round ("Sankey is a DAG", checked on
  6.1.0): when A pays B and B pays A, payers are drawn on the left and
  recipients on the right, and the subtitle and alt text say so, rather
  than dropping the payment that closes the circle.
- **Words.** Every flow's amount and payments are in its tooltip and the
  data table (rule 16, as for points); they are written on the band when
  it goes one column (a longer band passes behind a party's bar) and is
  thick enough for a line of text, the thickness taken from ECharts' own
  formula (`sankeyLayout.js` `initializeNodeDepth`), and only up to twelve
  flows. Every party is named beside its bar (rule 12).
- **Colour.** Parties in one colour (3:1 against the page, rule 11), bands
  in grey; a highlight may name a party (every flow in or out of it) or one
  flow, colours those bands and writes their amounts in bold.
- **Checks.** Rule 0 reads the bands back against the rows; 10 warns past
  twenty parties; a sankey takes no `sort` or `limit` (it has no ranking,
  and "Other" has no payer or recipient), and flows are drawn only as a
  sankey or as bars.
- **Exports.** PowerPoint has no sankey, so a deck holds the render
  service's picture, or the flows ranked as bars with the reason when the
  service is down; a brief holds the picture, or the bar table.
- Tests: `tests/test_visuals_flows.py`, and the `sankey` fixture in
  `frontend/test-support/chart-kinds.json`.

## Pass 4: the network and the connection grid

The relationship network is drawn with Sigma.js 3 (WebGL) over a
graphology graph (ADR-0005, line 3; vis-network is gone).

- **Layout** (`frontend/lib/network-layout.ts`): ForceAtlas2 (Jacomy et al.
  2014), started from a circle in id order and run synchronously, so the
  same records give the same picture; its own `inferSettings` (Barnes-Hut
  for large graphs). Laid out again only when the parties or links change;
  the reporter's pan and zoom survive a change of data.
- **Status** (the caller's; the graph infers none): fill and border, and a
  second ring inside the border for a tentative status (inferred,
  hypothesized, contested), since WebGL draws no dashed border and colour
  must not be the only cue (rule 12); a tentative link is thinner. Colours
  are hex: Sigma's parser reads no hsl.
- **Words**: every party named; link names beside the hovered party's links
  only past eight links (they covered each other); the hovered party's
  name and schema under the drawing.
- **Rule 18**: the drawing counts the pairs of links that cross, as
  straight lines between their parties, and says so under it. Past twenty
  parties the panel offers the connection grid
  (`frontend/components/connection-grid.tsx`): a row and a column per
  party, most-linked first, a cell per pair holding its links; matrices read
  better than node-link drawings for most tasks past about twenty nodes
  (Ghoniem, Fekete and Castagliola, InfoVis 2004). It is an HTML table
  rather than an ECharts heatmap, so every name and count is text a screen
  reader reads; each count keeps 4.5:1 against its shade.
- Tests: `frontend/tests/test-network-layout.test.ts`,
  `test-entity-graph.test.tsx` (Sigma faked: jsdom has no WebGL),
  `test-graph-views.test.tsx`. Checked by eye in Chromium (SwiftShader
  WebGL).

## Pass 4: the ownership and control chain

Who owns and controls a company, and what it owns (the design doc's
"Ownership and control chain"), on every dossier: a structure chart and,
beside it, the owners as a table.

- **The chain** (`backend/app/services/ownership_chain.py`,
  `GET /api/entities/{id}/ownership-chain`): from the entity, the
  investigation's Ownership links are followed up to its owners and down to
  its holdings, at most six steps each way (breadth first, so each party sits
  at its nearest distance), and the Directorship links into every company on
  the chain add its directors beside it. A reconciled duplicate of a link is
  not followed, so no stake counts twice. Each link carries what the records
  state: its percentage (FollowTheMoney's `percentage`), role and dates. A
  stake whose end date has passed is marked ended, not dropped, and a link
  that comes back round (A owns B, B owns A, or longer) is marked circular.
- **Shares through several companies** are the percentages multiplied along
  each path and added over the paths, as HMRC computes an indirect ownership
  interest ([MTT17040](https://www.gov.uk/hmrc-internal-manuals/multinational-top-up-tax-and-domestic-top-up-tax/mtt17040))
  and the FCC computes equity held through intervening companies
  (47 CFR 1.5002). A share is worked out only when every link on every path
  states a percentage, none has ended and none runs in a circle; otherwise
  the table says it is not known and why. It is equity arithmetic, not a
  finding of control or beneficial ownership, and the panel says so.
- **The drawing** (`frontend/components/ownership-diagram.tsx`): React Flow
  (`@xyflow/react` 12, MIT) at places from dagre (`@dagrejs/dagre` 3, MIT),
  the layered layout React Flow's own examples use
  (<https://reactflow.dev/examples/layout/dagre>). Owners above what they
  own and directors above their company, as structure charts are drawn;
  dagre orders each rank to cut crossings. React Flow draws the parties as
  HTML, so names wrap and stay text, and brings pan, zoom and keyboard focus;
  nothing can be dragged or connected. Each link says its share or role in
  words; an ended stake is dashed and a directorship dotted, so neither rests
  on colour alone (rule 12). Clicking a party opens its dossier. React Flow
  is loaded only when a dossier with links is open.
- Tests: `backend/tests/test_ownership_chain.py`,
  `frontend/tests/test-ownership-chain.test.tsx` (React Flow stubbed: jsdom
  does not lay out the page).

## What pass 3 built, and what is left

Built: the drawing of the seven statistical kinds, the two queries they
needed (`payment_amounts`, `payments_count_and_total_by_party`), the
question-first chooser, a checker that judges every rule for each kind
and says which rules do not apply, every kind in both exports (native
PowerPoint charts, the treemap as a picture; a PNG in the brief), every
kind in the app's preview, the AI's order slip chosen by question, chart
presets and options checked again on every change, and the chart builder a
reporter uses without the AI. The app's side is tested in
`frontend/tests/test-chart-builder.test.tsx`,
`frontend/tests/test-chart-style.test.tsx`,
`frontend/tests/test-chart-visual.test.tsx` and
`frontend/tests/test-echarts-kinds.test.ts`.

Left for later passes:

- `timeline` (pass 4), the staged flow and the who-pays-whom circle (chord).
- Parts of a whole over time (a stacked area), which needs a query with a
  second series.
- Reading the values back out of the rendered SVG (the image-level half of
  check 0).
- The presets the editor design lists that need data this pass does not
  have: small multiples and several donuts (more than one series), two-level
  and drill-down treemaps (a hierarchy), bubbles (a third number), a
  connected scatter plot, box and strip plots.
