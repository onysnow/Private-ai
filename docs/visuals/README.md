# Investigation visuals (passes 2 and 3: the foundation and the statistical charts)

This is the code behind the design doc "Investigation Visuals & Presentation
System" (pass 1: research) and the decisions in ADR-0005 (lines 1, 2, 5, 6).
Pass 2 laid the foundation under every later visual and proved it end to end
with bars: a horizontal ranked `bar` and a vertical `column`. Pass 3 draws
the statistical kinds on the same foundation: `line`, `area`,
`stacked_bar_100` (the 100% bar the design uses instead of small pies),
`donut`, `treemap`, `histogram` and `scatter`. `timeline` and `sankey` wait
for the money-flow and network pass.

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
  the end; the 100% bar (`BAR_STACKED_100`, one series per part, each named
  inside in black or white); the donut (`DOUGHNUT`, every slice named with
  its share, the total in the centre); the histogram (`COLUMN_CLUSTERED`
  with no gap between bins); the scatter plot (`XY_SCATTER`, each point
  named, both axes titled). The treemap, which PowerPoint charts cannot
  draw, is the PNG from the render service; when the service cannot be
  reached the slide says so and shows the same parts as native bars. Every
  chart has its title and unit above it, the source line under it, its alt
  text on the shape (what a screen reader announces), its description in the
  speaker notes, and its records numbered in the slide footer and on the
  Sources slides.
- **Brief** (`app/services/writeups.py`): for every kind, the PNG from the
  export bridge with the alt text as its caption, then the data table (with
  the share for the parts of a whole and both numbers for a scatter plot)
  with a citation marker on every row, then the source line. When the
  render service is unreachable the brief says so and shows the values as a
  table instead.
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
| `test_visuals_exports.py` | Every kind in a deck (the native chart type, alt text, source line, notes; the treemap as the picture, or as bars when the service is down; a stored chart that now fails a rule is not drawn) and in a brief (image, caption and data table, or a table and a note) |
| `test_visuals_routes.py` | The catalogue and preview routes, their response models, investigation scope |
| `test_visuals_draft.py` | A draft whose model orders a chart: kept, re-asked, or removed with reasons |

## What pass 3 built, and what is left

Built: the drawing of the seven statistical kinds, the two queries they
needed (`payment_amounts`, `payments_count_and_total_by_party`), the
question-first chooser, a checker that judges every rule for each kind
and says which rules do not apply, and every kind in both exports (native
PowerPoint charts, the treemap as a picture; a PNG in the brief).

Left for later passes:

- `timeline` and `sankey` (the money-flow and network pass).
- Parts of a whole over time (a stacked area), which needs a query with a
  second series.
- Reading the values back out of the rendered SVG (the image-level half of
  check 0).
- The presets the editor design lists that need data this pass does not
  have: small multiples and several donuts (more than one series), two-level
  and drill-down treemaps (a hierarchy), bubbles (a third number), a
  connected scatter plot, box and strip plots.
