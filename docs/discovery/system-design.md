# Discovery: system design

Status: **proposed** (5 Oct 2026). This document is the engineering design
behind `README.md`, which is the product plan. The research it rests on is
in `sources.md`, `patterns.md` and `tools.md`.

It covers the brief Ony sent on 5 Oct:

- better search
- tags and notes on anything, usable in charts
- the palette used everywhere
- "what to dig into next" from patterns seen in other cases
- one-click and automatic outside lookups: crawlers, site-specific record
  searches, money, political activity
- overlaying charts to find new patterns

---

## 1. Requirements

### Functional

| # | Requirement | Comes from |
|---|---|---|
| F1 | Search returns one result per record, with names (no raw IDs). Results are grouped by kind of record, with facets (kind, party kind, how sure, source, date, tag) and counts. Hovering a result shows a preview. | Ony: "this search is terrible hard to look at" |
| F2 | Tag any record (party, link, evidence, claim, event, document, lead, finding) with reporter-named, coloured tags. | Ony: "a way to tag entities" |
| F3 | Notes on any record or chart mark. A note can become a lead. | Ony: "add notes to them" |
| F4 | Collections (named, ordered sets of records). A collection works as a chart filter, a chart-builder data source, and a list sent to OpenAleph. | Ony: "add to custom charts, graphs" |
| F5 | The pattern engine flags documented red-flag patterns. Each flag is a lead with its rule, why it matters, its source, innocent explanations, and what would confirm or clear it. Flags are ranked. | Ony: "help you identify which things to prioritize ... based on known patterns" |
| F6 | "One fact away": a pattern that could fire names the missing fact and the lookup that would supply it. | Same |
| F7 | A source router picks outside sources from the party's kind and country and the kind of investigation. Lookups run automatically, with a per-investigation toggle (off / ask each time / automatic). | Ony: "at the click of a button send web crawlers ... It's a toggle but it starts with automatically" |
| F8 | A crawler fetches named pages and searches named sites. Every fetch is kept as evidence (WARC record, screenshot, hash, time). | Same |
| F9 | Outside results arrive as findings for review. Accepting one adds it to the record and re-runs the patterns, so one discovery can lead to the next. | Ony: "propagation of more discoveries" |
| F10 | Overlays: one year slider for the whole investigation; layers on the network (money, flags, tags, lookups); pointing at a party highlights it on every chart; "how are these two connected?" | Ony: "overlay information from different charts" |
| F11 | Free sources first. Paid sources are optional per-source keys. | Ony: "Free first" |
| F12 | On any chart, point at a party → "Research in connection with…" → click a second party. A research run looks for every way the two could be connected, inside the case and outside it, and shows its steps live. "Research this party" does the same for one party. | Ony, 5 Oct: "click on 'research in connection with' and then … click on another entity and it will start researching" |
| F13 | Research pages: every run, everywhere it searched, what it found, and every decision, rule, reasoning step and conclusion, traceable to its inputs. Contradictions, mistakes the checks caught, and corrections each have their own view. | Ony, 5 Oct: "trace every single decision, logic, reasoning, conclusion … see when it also finds contradictions, makes mistakes, misspeaks" |

### Non-functional

| Concern | Target and reason |
|---|---|
| **Truthfulness** | A flag is never shown as a finding. Every flag carries its source. Unreviewed evidence lowers a flag's weight. This follows the workbench's existing rule: external data stays evidence until a reporter decides. |
| **Provenance** | Every outside request is logged: source, query, time, who or what triggered it, and the response hash. Every crawled page can be replayed. |
| **OPSEC transparency** | A lookup leaves a record of the search on the other site. The toggle and the request log let a reporter see exactly what left the machine. Tags, notes and collections never leave. |
| **Licences** | Each finding carries its source's licence (for example CC BY-NC for OpenSanctions). Exports warn when non-commercial data is included. |
| **Politeness and limits** | Each source is throttled to its published limit. robots.txt is obeyed. Some sources are never automatic (click only or link only, per `sources.md`). |
| **Latency** | Search returns in under 300 ms for a case of 10,000 records. Pattern recompute takes under 2 s for 2,000 parties and 10,000 links. Lookups run in the background and never block the page. |
| **Local-first** | Everything runs on the reporter's machine (Docker compose), as now. A fresh install needs no outside service except the sources a lookup calls. |
| **Licence of our code** | Libraries linked into the app are MIT, BSD or Apache. AGPL and GPL tools (Browsertrix, pywb) run only as separate containers. |
| **Accessibility** | WCAG 2.2 AA: 4.5:1 text, 3:1 marks, keyboard paths for every action. |

### Constraints (from the codebase, checked)

- **Backend:** FastAPI + SQLAlchemy + Alembic. SQLite in developer mode,
  PostgreSQL in the product.
- **Jobs:** `app/jobs/` runs Procrastinate on PostgreSQL, and inline on
  SQLite and in tests.
- **Connectors:** `app/connectors/` defines a `Connector` ABC with `search`
  and `enrich`. The registry (`registry.py`) holds aleph, opensanctions and
  firecrawl. Findings are `ConnectorRun` and `ConnectorFinding` rows with a
  `review_status`, plus `ResolutionDecision`, `StatementAssessment` and
  `StatementPromotion`.
- **Enrichment sessions** already model multi-provider runs with
  per-provider status.
- **OpenAleph owns the document corpus** (ADR-0004; ADR-0006 proposed).
  Cross-references (`services/cross_references.py`) and watchlists
  (`services/watchlists.py`) already read from it.
- **Search** is `services/search.py`: SQL prefilter plus Python scoring
  across 13 record types.
- **Charts** go through `app/visuals` (catalogue → spec → checks). The chart
  builder sends only an order slip; the server draws the chart.
- **Authorization** is two-tier (ADR-0002). Every new table is
  investigation-scoped and goes through the same scope check.
- **Repo rules:** an ADR before any new package; exact version pins; the
  full `tools/check_all.py` gate before each commit.

---

## 2. High-level design

```
 Browser (Next.js)                                   Backend (FastAPI)
 ───────────────────                                 ─────────────────────────────────────────────
  ⌘K Search ─────────── GET /api/search ───────────▶ Search service (dedupe, names, facets)
  Tag / Note / Collect ─ /api/investigations/{id}/ ─▶ Annotations service ──▶ tags, notes, collections
                         tags|notes|collections
  Red Flags ──────── GET …/patterns ────────────▶ Pattern engine (networkx) ◀── rules/*.py
                                                         ▲            │
  Lookups panel ──────── …/lookups (plan, run, log) ─▶ Source router │ flags table
                                                         │            │
                                                         ▼            │
                                                   Job queue (Procrastinate / inline)
                                                   ├─ lookup.run  ──▶ Source adapters ──▶ outside APIs
                                                   │                   (rate limiter, cache,      │
                                                   │                    licence tag, request log) │
                                                   ├─ crawl.fetch ──▶ Fetcher (Scrapy/Playwright)─┘
                                                   │                   WARC + screenshot + hash
                                                   │                   └─▶ Document ingestion ──▶ OpenAleph
                                                   │                                              (text, names)
                                                   └─ patterns.recompute
                                                          ▲
  Findings inbox ─────── accept / set aside ─────────▶ Findings service ─┐
                                                                         ▼
                                                   Domain events (outbox table) ──▶ triggers:
                                                     entity/link/statement changed,  · patterns.recompute
                                                     finding accepted, party added   · lookup.plan (auto mode)
  Charts + overlays ──── /api/visuals/… (+ collection source, as-of date) ──▶ Visuals (existing)
```

### The discovery loop (F9)

```
party added or changed ─▶ outbox event ─▶ (auto mode) lookup.plan ─▶ lookup.run × sources
        ▲                                                                   │
        │                                                                   ▼
 reporter accepts ◀── findings inbox ◀── finding rows (licence, request, snapshot)
        │
        └─▶ statements / relationships ─▶ outbox event ─▶ patterns.recompute ─▶ new flags
                                                              │
                                                              └─▶ "one fact away" ─▶ suggested lookups
```

The loop stops at the reporter. Nothing outside becomes a record without an
accept. That stops automatic lookups from feeding automatic patterns
without anyone checking.

---

## 3. Deep dive

### 3.1 Data model (new tables; all carry `investigation_id` with an index)

```
tags            id, investigation_id, name (unique per investigation), colour (one of 8 palette swatches), created_at
record_tags     id, investigation_id, tag_id → tags, record_type, record_id, created_at
                unique (tag_id, record_type, record_id)
notes           id, investigation_id, record_type, record_id (nullable: a note on the investigation),
                chart_ref (nullable JSON: chart kind + mark id), text, created_at, updated_at,
                lead_id (nullable → leads, set when "turn into a lead")
collections     id, investigation_id, name, description, created_at, updated_at
collection_items id, collection_id → collections, record_type, record_id, position, added_at
                unique (collection_id, record_type, record_id)

pattern_flags   id, investigation_id, rule_id (e.g. "circular_ownership"), rule_version,
                fingerprint (hash of rule_id + sorted party/link ids: one flag per occurrence),
                parties JSON, links JSON, facts JSON (the values the rule saw),
                weight, weight_parts JSON, status (open | dismissed | made_lead | cleared),
                dismissed_reason, lead_id, first_seen_at, last_seen_at, gone_at (no longer fires)
pattern_gaps    id, investigation_id, rule_id, fingerprint, parties JSON, missing (e.g. "incorporation_date"),
                suggested_sources JSON, first_seen_at, gone_at

lookup_settings investigation_id (PK), mode (off | ask | auto) default 'auto',
                allowed_sites JSON (sites the crawler may search)
                (the investigation's type is investigations.type_areas, catalogue areas; built 10 Oct 2026,
                GET/PUT /api/investigations/{id}/type; see indicators.md)
lookup_requests id, investigation_id, job_id → background_jobs, source, party_id, query, url,
                trigger (auto | click | pattern_gap), status, http_status, response_sha256,
                cached (bool), licence, started_at, finished_at, error
                ── the request log: one row per thing that left the machine
lookup_cache    source, query_hash, response JSON or blob path, fetched_at, expires_at, licence
                (PK source + query_hash; shared across investigations only when the source's
                licence allows it; the query text itself is not shared)
source_limits   source (PK), tokens, refilled_at  ── token bucket per source, works across processes
crawl_snapshots id, investigation_id, request_id → lookup_requests, url, final_url, fetched_at,
                warc_path, screenshot_path, text_path, sha256, robots_allowed, document_id → documents

domain_events   id, investigation_id, kind, subject_type, subject_id, payload JSON, created_at,
                processed_at  ── transactional outbox, written in the same transaction as the change
```

Existing tables carry the rest:

- `ConnectorRun` and `ConnectorFinding` gain `request_id` (→ `lookup_requests`),
  `licence` and `fact JSON` (the typed fact a finding carries, such as
  `{incorporation_date: "2023-10-02"}`).
- Accepting a finding goes through the existing `ResolutionDecision` and
  `StatementPromotion` path, so accepted facts become `Statement` rows with
  provenance.

**Why polymorphic `record_type` + `record_id`, not one join table per type.**
Tags and notes must attach to eight kinds of record. Eight join tables would
mean eight migrations, eight serialisers and a union in every query. The cost
is no database foreign key. To cover it:

- the service validates that the target exists
- deleting a record also deletes its tags, notes and items, through a hook
  in each record's delete path; deleting an investigation removes them
  through the existing deletion service (`services/lifecycle.py`)
- backup and restore include the new tables

### 3.2 API (REST, matching the existing routes)

```
GET  /api/search?q&investigation_id&kind&party_kind&sure&tag&from&to&sort&limit
     → {query, total, facets: {kind:{party:n,…}, party_kind:{…}, sure:{…}, tag:{…}},
        results: [{key, record_type, record_id, kind, title, parties:[{id,name,schema}],
                   sure, date, amount, currency, snippet, matched_fields, tags, note_count, flag_count}]}
     (Same route as today. The response gains facets. Results are deduplicated by
      underlying record. FtM IDs in snippets are replaced by captions.)
GET  /api/search/peek/{record_type}/{record_id}   → neighbours, evidence by stance, latest event, flags

GET/POST/PATCH/DELETE /api/investigations/{id}/tags
POST/DELETE           /api/investigations/{id}/record-tags        {tag_id, record_type, record_id}
GET/POST/PATCH/DELETE /api/investigations/{id}/notes              ?record_type&record_id
POST                  /api/notes/{note_id}/lead                   → lead
GET/POST/PATCH/DELETE /api/investigations/{id}/collections
POST/DELETE           /api/collections/{cid}/items                {record_type, record_id, position}
POST                  /api/collections/{cid}/openaleph-list       → uses the existing entity-set export

GET  /api/investigations/{id}/patterns           → {flags:[…ranked], gaps:[…], checked_rules:[…], computed_at}
POST /api/investigations/{id}/patterns/recompute → 202 job
POST /api/pattern-flags/{fid}/dismiss {reason} | /lead | /clear
GET  /api/pattern-rules                          → catalogue: id, name, rule text, sources, innocent, confirm

GET  /api/investigations/{id}/lookup-settings  | PATCH {mode, allowed_sites}
GET  /api/investigations/{id}/lookups/plan?party_id → router output: [{source, why, policy, licence, status}]
POST /api/investigations/{id}/lookups {party_id, sources?: [...]} → 202 {job_ids}
GET  /api/investigations/{id}/lookup-requests  → the request log (what left the machine)
POST /api/investigations/{id}/crawl {url | site + query} → 202 job (only sites in allowed_sites for site search)
GET  /api/crawl-snapshots/{sid}/replay | /screenshot | /warc

GET  /api/visuals/…  (existing) gains:
     source = {"collection": cid} as a query source in the catalogue
     as_of = date, applied to every relationship/event query (records valid on that date)
GET  /api/investigations/{id}/paths?from&to&max_len=4 → every simple path up to max_len,
     each with its weakest link's certainty
```

All routes go through the existing scope dependency (ADR-0002). The schemas
are added to the generated client (`lib/generated`), as the repo requires.

### 3.3 Pattern engine

- **Rules are plain Python modules** in `app/patterns/rules/`, each
  declaring:
  - `id` and `version`
  - `needs` (fields; a missing one creates a gap instead of a flag)
  - `sources` (citations from `patterns.md`)
  - `innocent`, `confirm`
  - `weak` / `jurisdiction_only` markers
  - `run(graph, facts) -> Iterable[Occurrence]`

  A new rule is one file plus a test.
- **The graph** is built once per recompute from `RelationshipEdge`, `Entity`
  and accepted `Statement` rows into a `networkx.MultiDiGraph`. Nodes carry
  schema, country and dates. Edges carry schema, percentage, amount, date and
  support state.
- **The first rules** use today's data:
  - circular ownership (`nx.simple_cycles` on the ownership subgraph)
  - chain top not a person
  - chain through a secrecy jurisdiction
  - chain length of 5 or more
  - stakes just under the disclosure threshold
  - payments with no stated purpose or no invoice
  - round amounts
  - structuring (sliding window over payments from one payer)
  - shared address, phone or email with no other path
  - dormant then active

  The rules needing looked-up data come next: company age, mass officer,
  mass address, PEP family, procurement.
- **Weighting** (from `patterns.md`; Fazekas & Kocsis 2015, OCP 2024):
  - weight 1 per flag
  - +0.25 per other open flag sharing a party
  - −0.3 if it rests on unreviewed evidence
  - −0.5 if country-only or weak

  The components are stored (`weight_parts`), so the UI shows why a flag
  ranks where it does. There is no single opaque score.
- **Stable identity.** A flag's `fingerprint` keeps it the same flag across
  recomputes. A dismissed flag stays dismissed while it keeps firing on the
  same parties. A flag that stops firing gets `gone_at` and is shown as
  "no longer fires: (why)".
- **Recompute triggers:**
  - outbox events (entity, relationship or statement changed; finding
    accepted), debounced per investigation (one job in flight, plus one
    queued)
  - manual recompute
  - after restore

### 3.4 Source router and adapters

- **The router** is a pure function: `plan(party, investigation_settings,
  credentials) -> [PlannedLookup]`. It is driven by a declarative table
  (`app/lookups/routes.py`) that mirrors the router rules in `sources.md`. It
  is pure, so it is unit-tested exhaustively (every kind × country × type).
- **Adapters** extend the existing `Connector` ABC (`search`, `enrich`) with
  metadata:
  - `licence`
  - `policy` (auto, click, link, key)
  - `limit` (requests per window)
  - `fact_extractors` (map a response to typed facts such as
    `incorporation_date`, `officer_appointments`, `pep_positions`)

  The adapters register in `CONNECTOR_SPECS`, so settings, credentials and
  the connectors panel pick them up with no new branching. Planned:
  Companies House (ch-api), GLEIF (pygleif), SEC EDGAR (edgartools), OpenFEC
  (a thin client of our own), lda.gov, Congress.gov, USAspending, TED,
  Contracts Finder and Find a Tender, Wikidata, ICIJ Offshore Leaks
  (reconciliation API and local dump), yente (self-hosted OpenSanctions),
  CourtListener, Wayback CDX.
- **Firecrawl** stays as an optional key-based adapter. The free path is the
  self-run fetcher (below).

### 3.5 Queue and event design

- **Job kinds** on the existing `BackgroundJob` / Procrastinate queue:
  `lookup.plan`, `lookup.run`, `crawl.fetch`, `patterns.recompute`.
- **Idempotency key per job:**
  - lookup: `(investigation, source, party, normalised query)`
  - crawl: `(investigation, url)`

  A second request while one is queued or running joins it.
- **Outbox.** A request writes `domain_events` in the same transaction as
  the change. A dispatcher reads the outbox after commit:
  - on PostgreSQL, a Procrastinate periodic task every 2 s
  - inline mode runs it at the end of the request

  It turns events into jobs. Why an outbox: no lost triggers if the process
  dies between commit and enqueue, and one place to see what set off what.
- **Auto mode** turns "party added or changed" into `lookup.plan`, which
  enqueues one `lookup.run` per planned source whose policy is `auto`.
  - **Ask mode** stores the plan and shows "ready" with a Run button.
  - **Off mode** plans nothing.
- **Priority.** Click-triggered lookups are queued before automatic ones
  (Procrastinate priority), so a reporter never waits behind a background
  sweep.

### 3.6 Fetcher (crawler)

- **Stack:**
  - Scrapy with `ROBOTSTXT_OBEY` and AutoThrottle
  - scrapy-playwright only for pages that need JavaScript (a per-site flag
    in the route table)
  - warcio writes the WARC record
  - Playwright takes a full-page screenshot
  - trafilatura extracts the text
- **Each fetch:**
  1. Write the WARC record, screenshot and text to `DOCUMENT_STORAGE_DIR`,
     with a SHA-256 hash.
  2. Create a `Document` row through the existing ingestion path.
  3. Send the document to OpenAleph (ADR-0004/0006), where ftm-analyze
     finds names. They come back as extraction candidates the reporter
     reviews (existing flow).
- **Site search** ("search Companies House for X", "search this council's
  minutes for X") uses per-site templates: a URL pattern plus result
  selectors. Only sites in the investigation's `allowed_sites` or in the
  shipped template list are searched.
- **Optional extras.** Browsertrix and pywb as separate compose services
  for full-fidelity WACZ capture and replay.

### 3.7 Caching

- **`lookup_cache`** is keyed by source and normalised query. Its TTL is per
  source: registry data 7 days, sanctions lists 1 day, news 1 hour.
- **Cache hits** are still written to `lookup_requests` (`cached = true`), so
  the log shows what was answered from cache and nothing went out.
- **Bulk sources** loaded locally (OpenSanctions via yente, ICIJ dumps, FAA
  registry) are refreshed by a scheduled job. Screening every party against
  them costs nothing and sends nothing out.
- **Search facets** are computed per request; at case scale no cache is
  needed. Peek responses are cached in the browser by TanStack Query, which
  the app already uses.

### 3.8 Errors and retries

| Failure | Handling |
|---|---|
| 429 / `Retry-After` | Wait as told; the token bucket is drained for that source. Retry up to 5 times with exponential backoff and jitter. |
| 5xx, timeout | Retry 3 times with backoff. Then fail the run with a plain-language message. |
| 4xx (bad key, not found) | No retry. Shown on the source's row ("key refused", "no record"). |
| A source failing repeatedly | Circuit breaker: after 5 failures in 10 minutes, pause that source for 15 minutes. Its row says so. Other sources carry on (partial success, as enrichment sessions already do). |
| robots.txt disallows | Not fetched. The request is logged as `robots_allowed = false` with the reason. |
| Crawl target resolves to a private address | Refused before connecting (SSRF guard: private, loopback and link-local ranges; http/https only; 25 MB cap; 30 s timeout; no credentials sent). |
| Pattern recompute fails | The last good flags stay, marked "as of <time>". The job error is shown in the jobs list. |

### 3.9 Research runs (F12)

The full design (lifecycles, mistakes catalogue, how corrections propagate,
data model with `step_refs`, sequence, errors, scale) is in
`research-design.md`. This section is the summary.

A run is a job (`research.run`) over one party or a pair. It is a fixed
pipeline, so every run of the same kind does the same steps in the same
order:

1. **Plan.** The router (3.4) picks sources for each party, then pair
   sources for two parties:
   - documents naming both, in the case's OpenAleph collection (local)
   - officer, owner and address overlaps (Companies House officers and PSC,
     OpenCorporates when keyed)
   - filings naming both (EDGAR full text)
   - contributions where one is the donor and the other the employer or
     recipient (OpenFEC, Electoral Commission)
   - lobbying where one is the client and the other the registrant
     (lda.gov)
   - contracts and grants (USAspending, TED, Find a Tender)
   - court cases naming both (CourtListener, click only)
   - leak entities shared by both (ICIJ, local)
2. **Inside the case.** Every simple path of up to 4 links, with each
   path's weakest link; shared neighbours; dates that overlap on the
   timeline. These are computed by the pattern engine's graph (3.3).
3. **Searches** run through the adapters (3.4–3.8), obeying the
   investigation's lookup mode. A click-started run counts as a click for
   "ask" mode, so its automatic sources run; click-only sources still wait
   for their own click.
4. **Match decisions.** Each outside record that might be one of our
   parties is scored by a versioned rule (rigour normalisation plus
   field agreement). Records are linked automatically only above a
   threshold set per investigation (default 0.90). Anything lower waits for
   the reporter.
5. **Facts and contradictions.** A fact that disagrees with one already in
   the case (same subject, same property, different value) creates a
   contradiction. Both values are kept with their sources.
6. **Conclusion.** Written by a template from the steps it rests on, not by
   AI. It names those steps.
7. **AI draft (only when AI is switched on).** A short summary through the
   existing reasoning path (`app/ai/reasoning.py`), with the quote, number
   and writing checks (`quote_check.py`, `value_check.py`,
   `writing_check.py`). What the checks remove is kept as a caught mistake.

On a chart, the pair gets a dashed plum line while the run is going. When
it finishes, the line carries a badge ("possible link · 2 for you").
Accepting a match or a fact goes through the findings path (F9), so the
patterns re-run.

### 3.10 The research trail (F13)

Every run writes an append-only trail. Nothing in it is edited after it is
written: a reversal or correction is a new step that points at the step it
corrects.

```
research_runs   id, investigation_id, subjects JSON (party ids), kind (pair | party | gap | auto_screen),
                trigger (chart_hover | pattern_gap | auto | manual), started_by, mode_at_start,
                status, started_at, finished_at, conclusion_step_id
research_steps  id, run_id, seq, kind (plan | inside | search | match | fact | contradiction | skipped |
                conclusion | ai_draft | check | decision | correction),
                actor (rule | source | model | reporter), actor_detail (rule id+version, source name,
                model name, user id), title, reasoning (the rule's template text, filled in),
                inputs JSON, outputs JSON, refs JSON (lookup_request_ids, finding_ids, evidence_ids,
                statement_ids, step ids it rests on), corrects_step_id, status (ok | failed | retracted),
                created_at, prev_hash, hash  (sha256 of prev_hash + canonical JSON of the step)
contradictions  id, investigation_id, subject_type, subject_id, property, value_a, ref_a, value_b, ref_b,
                found_by_step_id, status (open | explained | resolved), resolution_note, resolved_by, resolved_at
```

**The hash chain** makes the trail tamper-evident: a changed step breaks
every hash after it. The research page can re-verify a run's chain.

**Contradictions are not only from runs.** A claim whose evidence holds
both "supports" and "contradicts" links appears in the same list, linked to
the claim. The demo's $2.4M claim (Riverside Gazette paragraphs 6 and 9) is
one.

**Caught mistakes.** These are the existing checks' removals:

- a quote not found in its record
- a number or date its quotes do not state
- a citation to a record the model was not given (`validate_citations`)
- a writing-check report

These are already recorded on `AIAnalysisCandidate`. A run's `check` steps
point at them, so the Mistakes view reads one place.

**Pages** (the Research section in the main navigation):

- **A research run:** a timeline of steps. Each step shows:
  - who did it (rules, source, AI, you)
  - why (the rule's own wording)
  - what went in and came out (the exact query sent, the result count, the
    response hash, the licence)
  - its hash

  Filters by kind of step. "Light the steps this rests on" for any
  conclusion.
- **Everywhere it searched:** the request log (3.1 `lookup_requests`) across
  all runs, with a column saying whether the request left the machine.
- **Contradictions:** side by side, with "make it a lead".
- **Mistakes and corrections.**
- **Waiting for your decision:** the match decisions under threshold, from
  every run.
- **Automatic screening:** the background runs from F7 appear in the same
  list as "auto" runs, so automatic work is as traceable as asked-for work.

**API**

```
POST /api/investigations/{id}/research {subjects:[a] | [a,b]}   → 202 {run_id, job_id}
GET  /api/investigations/{id}/research-runs                       → list with counts
GET  /api/research-runs/{rid}?after_seq=n                         → steps (polled every 1 s while running;
                                                                    the existing job-status polling pattern)
GET  /api/research-runs/{rid}/verify                              → {ok, broken_at_seq}
POST /api/research-steps/{sid}/decide {decision, note}            → appends a decision (and a correction when needed)
GET  /api/investigations/{id}/contradictions | PATCH /api/contradictions/{cid}
GET  /api/investigations/{id}/mistakes                            → check steps + corrections
```

**Trade-offs**

- **Fixed pipeline, not an AI agent choosing its next search.** Every step
  can be explained by a versioned rule, and two runs can be compared. AI
  appears only as a checked draft. An agent mode can come later as another
  run kind, writing to the same trail, so it would be just as traceable.
- **Polling, not server-sent events.** The app already polls job status. At
  one step per second, polling costs nothing and works behind every proxy.
  SSE can replace it later without changing the trail.

---

## 4. Scale and reliability

- **Load.** One newsroom, one machine. A large case is around 10⁴ entities,
  10⁵ statements and 10⁴ documents.
  - **Patterns.** networkx handles 10⁴-node graphs in well under a second for
    cycles, paths and degree counts. `simple_cycles` is bounded by limiting
    the search to the ownership subgraph and a maximum cycle length of 10.
  - **Lookups.** These are bound by outside limits, not by our capacity. The
    slowest is SAM.gov at 10 a day, so it is click-only.
  - **Automatic sweep size.** For a new 200-party import with around 6
    automatic sources per party, about 1,200 requests are queued. They drain
    at each source's own rate. The panel shows progress per source.
- **Scaling.** Vertical. Procrastinate workers can be raised from one to N
  in the API process, or run as a separate worker container, with no code
  change.
- **Failover.** The outbox and job rows are durable. Interrupted jobs are
  marked and re-run on start (`mark_interrupted` already exists).
- **Monitoring.** The operator console gets:
  - queue depth per job kind
  - lookup error rate per source
  - circuit breakers open
  - the age of the oldest unprocessed outbox event

  The request log is visible to the reporter in the Lookups panel.

---

## 5. Trade-offs

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Where patterns run | Server, networkx, stored flags | Browser only (graphology) | Flags need stable identity, dismissals, history and leads. The browser still computes live overlays and paths for interaction. |
| Rules | Hand-written, each sourced | A learned risk model | No labelled data. Published methods use equal weights for that reason (Fazekas & Kocsis 2015). Rules can be explained and cited. |
| Lookup default | Automatic (Ony's choice) | Ask each time | Speed of discovery. The risk (searches visible to the other side) is shown in the toggle and the request log, and some sources are never automatic. |
| Crawler | Scrapy + Playwright + warcio, in the app | Firecrawl self-hosted (AGPL); Crawl4AI | Licence (BSD/Apache), robots and throttle built in, and WARC output for evidence integrity. Firecrawl stays as an optional key-based adapter. |
| Matching | OpenAleph xref first, yente for screening | Our own matcher | Library first; OpenAleph is already integrated. yente is MIT and self-hosted. |
| Annotations storage | Polymorphic `record_type` / `record_id` | A join table per record type | Eight record types. Integrity is kept by the service and by deletion cascades. |
| Event trigger | Transactional outbox | Enqueue directly from the request | No lost triggers. Debouncing in one place. An audit of cause and effect. |
| Search engine | Keep SQL + scoring, add dedupe and facets | Elasticsearch / OpenAleph search for everything | At case scale SQL is fast enough. Document full text already goes through OpenAleph's search (ADR-0004). Revisit if search exceeds 300 ms. |
| Caching across investigations | Only where the licence allows, keyed by query hash | Never share | Saves outside requests without exposing which investigation asked. |

---

## 6. To confirm with Ony

These are not assumed in the build. Each changes behaviour, so each needs a
decision.

1. **Types of investigation.** The router can use procurement, influence and
   litigation, as listed in `sources.md`. Should a reporter set the type per
   investigation, or should the app infer it from the records (contracts
   present means procurement)?
2. **Where automatic lookups start.** Should every party trigger them, or
   only parties added or confirmed by a reporter? Extracted names from
   documents can be numerous and wrong, so they could cost lookups and
   reveal more searches.
3. **Sharing cache entries between investigations.** Should it be allowed
   even where the licence permits? It is safe by design (no query text
   shared), but it is a policy choice.
4. **Mass-officer threshold.** The plan uses more than 100 appointments, the
   number Global Witness used. It could instead be the top decile of the
   case, or set per investigation.
5. **Linking automatically.** Should research runs link an outside record
   to a party without asking when the match is "confident" (0.90 or
   above)? Or should every link wait for a person, whatever the score?
6. **AI in research runs.** The plan keeps AI to a checked summary at the
   end, and only when AI is switched on. Should AI also be allowed to
   suggest the next search? Every suggestion would go into the trail.

---

## 7. What to revisit as it grows

- **Multi-user newsrooms:** per-user notes (private vs shared), tag
  vocabularies shared across investigations.
- **Search beyond 10⁵ records:** PostgreSQL full-text (`tsvector`, GIN)
  replaces the SQL prefilter; SQLite FTS5 in developer mode.
- **Graphs beyond 10⁵ edges:** move cycle and path work to igraph (GPL;
  isolated as a service) or to graph queries in PostgreSQL.
- **Learned ranking:** once enough flags have reporter outcomes (made a lead,
  cleared, dismissed with a reason), weights can be fitted per newsroom, and
  shown with the outcomes they came from.
- **Procurement data at scale:** Cardinal (OCDS indicators) as a sidecar for
  investigations whose type is procurement.
- **EU beneficial-ownership access:** if journalist access arrives (rules due
  July 2026), add the registers as adapters.
