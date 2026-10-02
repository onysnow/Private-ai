# Investigation visuals (pass 2: the foundation, proven with bars)

This is the code behind the design doc "Investigation Visuals & Presentation
System" (pass 1: research) and the decisions in ADR-0005 (lines 1, 2, 5, 6).
Pass 2 lays the foundation under every later visual and proves it end to end
with one chart family, bars: a horizontal ranked `bar` and a vertical
`column`.

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
2. **The kitchen** (`backend/app/visuals/data_service.py`). Nine read-only
   queries, each scoped to one investigation: `payments_by_party`,
   `payments_over_time`, `events_over_time`, `links_by_type`,
   `claims_by_status`, `entities_by_schema`, `evidence_by_stance`,
   `documents_by_status`, `leads_by_status`. Every row is
   `{label, value, record_refs, record_count}`: the value is a sum or a count
   of real records, `record_refs` are the `{record_type, record_id}` pairs the
   citation layer already understands, and `record_count` says how many
   records sit behind the value. Rows come back in a canonical order, so the
   same records give the same rows whatever order the database returns them
   in. Currencies are never added together: a payments query returns one
   currency and lists the others under `omitted`. Records a query could not
   use (a payment with no amount, an event dated only to the year when
   months were asked for) are listed under `omitted` with the reason, never
   guessed at. `describe_catalog()` is the menu the AI sees: each query, its
   parameters, and whether this investigation has data for it.
3. **The checker** (`backend/app/visuals/checker.py`). `check_visual(spec,
   data, theme)` returns a report with `ok`, `errors` and `warnings`; every
   item carries the design rule's number and a plain-words message. An error
   keeps the chart out of a draft; a warning travels with it so the reviewer
   sees it. The rule map is below.
4. **The drawing** (`backend/app/visuals/echarts.py`). `build_chart()` turns
   spec + data + theme into an ECharts option in the house style (BBC
   cookbook, Datawrapper, Urban Institute): the title states the finding, the
   subtitle gives the unit, only horizontal gridlines, a dark zero line,
   values written on the bars with the record count and a `†` on a value
   that rests on one record, no 3D, a zero baseline, at most eight colours,
   a source line, text at least 12 px, colours and fonts from the deck theme
   (`app/services/presentation_style.py`). It also writes the alt text, a
   longer description and the data table. Animation is off: the option is
   drawn on a server. The in-app preview and the exports read the same rows,
   so they cannot disagree.
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
- **Deck** (`app/services/decks.py`): a native, editable PowerPoint bar chart
  drawn from the cooked rows. Each category label carries the record count
  and the `†` mark; the source line sits under the chart; every row's records
  are numbered in the slide footer and on the Sources slides. No image is
  needed for bars, so the render service is not involved.
- **Brief** (`app/services/writeups.py`): the PNG from the export bridge with
  the alt text as its caption, then the data table with a citation marker on
  every row. When the render service is unreachable the brief says so and
  shows the values as the bar table it always had.
- **Preview** (`POST /api/investigations/{id}/visuals/preview`): the data,
  the ECharts option, the check report, the alt text, the description and the
  data table for one order slip, with no AI involved. `GET
  /api/investigations/{id}/visuals/catalog` is the menu. Both routes are
  scoped to the investigation like the rest of the API, and both have
  declared response models (`app/schemas/responses.py`).
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
| 0 | The numbers drawn match the data (the design's first check, after VisEval) | option + data | error |
| 1 | Bars and areas start at zero | option | error |
| 2 | No log scale on bars or areas, or on data with zero or negative values | spec + data | error |
| 3 | Never show a negative value as a size | spec + data | error for area/angle kinds, warning for bars |
| 4 | Stack only bars and areas | spec | error (the "never total the same field twice" half waits for a second series, pass 3) |
| 5 | Donut: four slices at most | spec + data | error (slices add up by construction) |
| 6 | No second value axis | option | error |
| 7 | No 3D, no upside-down axis, evenly spaced ticks | option + data | error; warning past 36 periods |
| 8 | Never join unrelated categories with a line | spec + data | error |
| 9 | Length and position first; never an order drawn in random colours | spec + option | error for random colours; warning for a ranking as donut/treemap |
| 10 | Eight colours at most; fold the rest into "Other" | spec + data + option | error; warning past 20 bars |
| 11 | Text contrast 4.5:1; neighbouring colours 3:1 or labelled directly | theme + option | error |
| 12 | Never rely on colour alone | spec + option | error (highlighted bars must also be bold) |
| 13 | A title that states the finding; alt text, description and data table | spec + drawing | error |
| 14 | Chart text at least 12 px | option | error |
| 15 | A source line; every value links to a record | data + option | error |
| 16 | Show how many records sit behind each group; flag groups more than 10× apart | data + option | error for missing counts; warning for the spread |
| 17 | Shaded maps: rates not counts, 3–7 steps, fair-area projection | — | not checkable here (maps pass) |
| 18 | Networks over ~20 nodes offer a grid view; crossings counted | — | not checkable here (networks pass) |
| 19 | Never add up different currencies | spec + data | error for a wrong unit; warning for currencies left out |
| 20 | A value resting on one record is visibly flagged | data + option | warning for the value; error if the mark is missing |

The metamorphic tests from McNutt et al. (CHI 2020) live in
`backend/tests/test_visuals_echarts.py`: shuffling the rows gives an
identical option, nudging a value changes it.

## Running the render service

In the Docker stack it is the `render` service in both compose files and the
backend reaches it at `http://render:8070` (`RENDER_SERVICE_URL`). Outside
Docker:

```
cd render && npm ci && npm start     # listens on 0.0.0.0:8070
```

The backend's default `RENDER_SERVICE_URL` is `http://127.0.0.1:8070`. `GET
/health` says whether it is up; `npm test` runs its own tests, and
`backend/tests/test_visuals_render.py` starts it on a free port for one live
check (skipped when Node or `render/node_modules` is missing). See
`render/README.md`.

## Tests

```
cd backend
TZ=UTC PYTHONPATH=. python -m pytest tests/test_visuals_*.py -q --no-cov
```

| File | What it proves |
|------|----------------|
| `test_visuals_spec.py` | Valid orders parse; unknown queries, bad parameters, numbers and unknown themes are refused with plain messages |
| `test_visuals_data_service.py` | Every query on the demo investigation; currencies never mixed; incomplete records listed; canonical order |
| `test_visuals_checker.py` | A failing and a passing case for every rule above |
| `test_visuals_echarts.py` | The house style, the words beside the chart, the metamorphic tests |
| `test_visuals_render.py` | The bridge behind a mocked transport, vl-convert, one live run of the Node service |
| `test_visuals_exports.py` | A chart in a deck (native chart) and in a brief (image, or table and a note) |
| `test_visuals_routes.py` | The catalogue and preview routes, their response models, investigation scope |
| `test_visuals_draft.py` | A draft whose model orders a chart: kept, re-asked, or removed with reasons |

## What pass 3 adds

- Drawing for the kinds the spec, the kitchen and the checker already accept:
  `line`, `area`, `stacked_bar_100`, `donut`, `treemap`, `histogram`,
  `scatter`, `timeline`, `sankey`. Each needs a branch in
  `build_chart()`, a deck renderer (native where python-pptx has the type,
  an image otherwise) and nothing else: the order slip, the data service and
  the checker do not change.
- Queries with a second series (parts of a whole over time, a scatter's two
  numbers per entity), and with them the second half of rule 4.
- Reading the values back out of the rendered SVG (the image-level half of
  check 0).
- A style layer for charts in the editor (presets and options), the way the
  three older visuals have one.
- The frontend: drawing the stored option with the app's ECharts, showing the
  check report beside the chart, and the gallery comparison the design doc
  asks for at the end of every pass.
