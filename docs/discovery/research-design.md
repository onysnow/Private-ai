# Research runs and the research trail: system design

Status: **proposed** (5 Oct 2026). This is the full design behind
`system-design.md` sections 3.9–3.10. The prototype is
`research-prototype.html`.

## The brief (Ony, 5 Oct 2026)

> when your on a chart and there's a potential connection that either you or
> the system has discovered- you can hover over that entity- click on
> "research in connection with" and then it allows you to click on another
> entity and it will start researching.
>
> And there needs to be a whole page or set of pages and features dedicated
> to seeing the research that the app is doing, where it's searched, what
> it's found and be able to trace every single decision, logic, reasoning,
> conclusion, etc. and be able to see when it also finds contradictions,
> makes mistakes, mispeaks or whatever else.

---

## 1. Requirements

### Functional

| # | Requirement |
|---|---|
| R1 | **Start from any chart.** On every chart that shows parties (network, grid, ownership chain, money, timeline), pointing at a party offers "Research in connection with…" and "Research this party". |
| R2 | **Pick the second party.** After "Research in connection with…", the chart enters a picking state. Every other party is a choice, and pointing at one shows what is already known about the pair. Esc cancels. Clicking starts the run. |
| R3 | **Start from the system's suggestions.** "Dig here next" flags, "one fact away" gaps and possible links already on a chart offer the same button, with the parties filled in. |
| R4 | **Progress on the chart.** The pair is joined by a "researching" line. Its steps appear live in a side panel. When the run ends, the line shows the outcome (for example "possible link · 2 for you"). |
| R5 | **What a run does.** It searches inside the case and outside it, decides matches, records facts, finds contradictions and writes a conclusion. Every one of these is a step. |
| R6 | **What every step records.** Who made it (the app's rules, a source, an AI draft, or the reporter), why (the rule's wording), what went in and what came out, and what it rests on. |
| R7 | **Pages.** Runs; one run's timeline; everywhere the app searched; contradictions; mistakes and corrections; waiting for your decision. |
| R8 | **Tracing.** From any conclusion, light the steps it rests on. From any record, list every step that used it. |
| R9 | **Contradictions.** Two records that disagree are both kept, shown side by side, and can be made into a lead. The app never picks one. |
| R10 | **Mistakes.** Shown in the Mistakes view: a check removing an AI sentence (misspeaking), a match the reporter rejects, a rule that has since been fixed, and a reporter marking a step wrong. |
| R11 | **Corrections.** When a step that others rest on is reversed, the steps that depended on it are re-evaluated. Each change appears as a new correction step. Nothing is overwritten. |
| R12 | **Automatic work in the same trail.** Automatic screening (lookups run when a party is added) writes runs in the same trail as asked-for research. |

### Non-functional

| Concern | Target |
|---|---|
| **Traceability** | 100% of steps carry actor, reason, inputs, outputs and references. A step that cannot say why is a bug, caught by tests. |
| **Tamper evidence** | The trail is append-only and each step is hash-chained to the one before. A run's chain can be verified on demand. |
| **Determinism** | The same inputs, rule versions and source responses give the same steps. Rule IDs and versions are stored on every step. |
| **Live feel** | The first step appears within 1 s of the click. Steps then appear as they happen. |
| **No blocking** | A run never blocks the page or other runs. Click-started runs go ahead of automatic ones in the queue. |
| **Privacy** | Notes, tags and the trail itself never leave the machine. Outside requests follow the investigation's lookup mode and are each logged. |
| **Accessibility** | The picking state works by keyboard: Tab through parties, Enter to pick, Esc to cancel. Live steps are announced in a polite live region. |

### Constraints (checked in the code)

- **Jobs:** `app/jobs` runs Procrastinate on PostgreSQL, and inline on SQLite
  and in tests. `BackgroundJob` already has `attempts`, `status`, retry and
  cancel routes (`routes_jobs.py`), and interrupted jobs are marked on start
  (`mark_interrupted`).
- **AI:** `app/ai/reasoning.py` already stores the prompt and response
  (`AIAnalysisCandidate.trace`) and auto-rejects output for named reasons
  (schema, citation, truncated, not JSON, quotes). The quote, number and
  writing checks are in `quote_check.py`, `value_check.py` and
  `writing_check.py`.
- **Findings:** connector findings and decisions already exist
  (`ConnectorFinding`, `ResolutionDecision`, `StatementPromotion`).
- **Polling:** the frontend already polls live status with TanStack Query's
  `refetchInterval` (`features/documents/corpus-status.tsx`).
- **Scope:** every table is investigation-scoped and goes through the
  ADR-0002 scope check.

### Assumptions

Each is listed for Ony to confirm or change; none is built in silently.

- **A1.** A run is started by one reporter. Several runs may touch the same
  parties at once.
- **A2.** Research runs follow the investigation's lookup mode (off / ask /
  automatic). A click on "Research…" counts as the click for "ask" mode.
- **A3.** AI takes part only as a checked summary at the end, and only when
  AI is switched on (question 6 in `system-design.md`).
- **A4.** Match threshold: link automatically at 0.90 or above, otherwise
  ask (question 5).

---

## 2. High-level design

```
 Chart (any)                       Research pages                     Side panel
  hover → card → "Research in        runs · run timeline · searched ·   live steps of the
  connection with…" → pick           contradictions · mistakes ·        current run
        │                            waiting for you                       ▲
        │ POST /research                     │ GET (polled)                │ GET ?after_seq (polled 1 s)
        ▼                                    ▼                             │
 ┌────────────────────────────────── FastAPI ─────────────────────────────┴───────────────┐
 │ Research API ──▶ RunService.start ──▶ research_runs (queued) + BackgroundJob(research.run)│
 │                                                                                         │
 │ Job worker ──▶ RunPipeline (fixed stages) ──▶ StepWriter (append-only, hash chain)      │
 │                 │  plan ─ inside ─ searches ─ matches ─ facts ─ contradictions ─          │
 │                 │  conclusion ─ (AI draft + checks)                                      │
 │                 ├─▶ Router + adapters (lookups; rate limits, cache, request log)         │
 │                 ├─▶ Graph (pattern engine's networkx view of the case)                    │
 │                 ├─▶ Matcher (rigour + field agreement, versioned rule)                    │
 │                 ├─▶ ContradictionDetector (same subject + property, different value)      │
 │                 └─▶ AI reasoning (existing) + quote / number / writing checks             │
 │                                                                                         │
 │ DecisionService (reporter decides) ──▶ decision step ──▶ DependencyResolver               │
 │                                          └─▶ re-evaluates dependents ──▶ correction steps │
 │ Outbox events (finding accepted, statement changed) ──▶ DependencyResolver too            │
 └─────────────────────────────────────────────────────────────────────────────────────────┘
      tables: research_runs · research_steps · step_refs · contradictions · trail_decisions
```

### Sequence: one pair run

```
Reporter      Chart        API            Queue/Worker        Router/Adapters      Trail
  │ hover A ──▶│ card
  │ "Research in connection with…" ──▶ picking state (Esc cancels)
  │ click B ──▶│ POST /research {A,B} ─▶ create run, job ─▶ 202 {run_id}
  │            │◀─ dashed line "researching"           │
  │            │                        worker picks job ──▶ step 1 plan ───────────────▶ append
  │            │                                         ──▶ step 2 inside-case paths ───▶ append
  │            │                                         ──▶ lookups (parallel per source, throttled)
  │            │                                                 ├─ each request ─▶ request log
  │            │                                                 └─ each response ─▶ search step ─▶ append
  │            │                                         ──▶ match decisions (score ≥ τ link, else wait)
  │            │                                         ──▶ facts → contradiction check
  │            │                                         ──▶ conclusion (template) → AI draft? → checks
  │◀ side panel polls GET /research-runs/{id}?after_seq=n every 1 s while running
  │            │◀─ line badge "possible link · 2 for you" when status=finished
```

---

## 3. Deep dive

### 3.1 Run and step lifecycles

```
run:  queued ─▶ running ─▶ finished
                   │  └──▶ finished_with_gaps   (some sources failed or were skipped)
                   ├──▶ cancelled               (reporter cancelled; last step says so)
                   └──▶ failed                  (pipeline error; steps so far are kept)

step: written (immutable) ─▶ may later be pointed at by:
        · a correction step   (its conclusion no longer holds)
        · a decision step     (reporter accepted / rejected what it proposed)
        · an error report     (reporter marked it wrong, with a note)
      A step's displayed state (current / corrected / reversed / marked wrong)
      is derived from the steps that point at it; the step itself never changes.
```

### 3.2 The pipeline (fixed stages; each writes steps)

| Stage | Actor | What it writes | Rule (versioned) |
|---|---|---|---|
| 1. Plan | rule | the sources picked per party and pair, and which wait (click-only, key missing, mode off) | `router` |
| 2. Inside the case | rule | every simple path of ≤ 4 links with its weakest link; shared neighbours; overlapping dates | `paths`, `timeline_overlap` |
| 3. Searches | source | one step per request: query sent, where, left the machine or not, result count, response hash, licence, cache hit | adapter name + version |
| 4. Match decisions | rule | candidate, score, the field agreements that make it up, threshold, outcome (linked / waits for you / below suggestion level) | `person_match`, `company_match` |
| 5. Facts | source / rule | each typed fact found (for example `appointed_on`), held on the candidate until it is linked | adapter fact extractor |
| 6. Contradictions | rule | subject, property, both values with sources, possible innocent explanations | `contradiction` |
| 7. Skipped | rule | each source not run, and why | `router` |
| 8. Conclusion | rule | template sentence(s) plus `rests_on` step ids | `conclusion_pair` |
| 9. AI draft (optional) | model | the prompt (the steps and records), kept sentences, removed sentences with the check and reason | existing reasoning module + checks |

A failure inside a stage is itself a step (kind `error`): the source, what
was tried, the error, and the retries made. The run carries on with the
other sources (`finished_with_gaps`).

### 3.3 Where the "reasoning" text comes from

- **Rule steps.** The reasoning is the rule's own template, filled with the
  values it used. For example, `person_match v1`: "Name matches exactly
  after normalising; nationality agrees; no birth date in our record, so
  the score is 0.86 — below 0.90, so it waits for you."
  - The template lives next to the rule's code and is tested with it.
  - Explanations are true by construction: the same function that decides
    writes the reason.
- **Source steps.** The reasoning is the router's reason for picking the
  source, plus what came back.
- **AI steps.** The reasoning is the prompt and the model's output, as
  `AIAnalysisCandidate.trace` already stores it. Every sentence shown has
  passed the checks; every sentence removed is listed with the check that
  removed it.
- **Reporter steps.** The reporter's decision and optional note.

### 3.4 Mistakes: what counts, and how each is caught

| Mistake | Caught by | Shown as |
|---|---|---|
| AI sentence with a quote not in its record | `quote_check` | Removed sentence, reason "quote not found" |
| AI number or date not stated by its quotes | `value_check` | Removed sentence, "number not stated" |
| AI cites a record it was not given | `validate_citations` | Whole draft auto-rejected (existing), reason shown |
| AI likelihood word or hedge outside ICD 203 row 1 | `writing_check` | Kept, with a report |
| A match the reporter rejects | Decision step | The original match step marked "reversed", plus corrections downstream |
| A step the reporter marks wrong ("this search used the wrong name") | Error-report step | The step marked "reported wrong", with the note; dependents re-evaluated |
| A rule that had a bug and is now fixed | Rule version check | Runs made with the old version listed "made with person_match v1, since fixed in v2", with a re-run offer |
| A source returned something that later proved wrong (a registry correction) | Contradiction on re-run | A contradiction between the old and new values, both kept |

### 3.5 Corrections propagate (R11)

Every step stores its `rests_on` references in `step_refs`. When a step is
reversed (by a decision or an error report), or a fact it used is rejected
in the findings inbox:

1. The DependencyResolver walks `step_refs` to find the dependent
   conclusions and contradictions. These are a small graph, usually under
   50 steps.
2. It re-runs only the template rules for those steps against the current
   state.
3. When the result differs, it appends a `correction` step that names:
   - what it corrects
   - why (the decision or event)
   - the new statement

   The old step shows struck through.
4. A pattern recompute is triggered through the outbox (`system-design.md`
   3.5).

It never deletes or edits a step.

### 3.6 Data model

```
research_runs
  id PK, investigation_id FK (idx), kind (pair | party | gap | auto_screen), subjects JSON,
  trigger (chart | flag | gap | auto), started_by (user id), lookup_mode_at_start, job_id FK,
  status, started_at, finished_at, conclusion_step_id, rule_versions JSON (snapshot)
  idx (investigation_id, started_at desc)

research_steps
  id PK, run_id FK, seq INT, kind, actor (rule | source | model | reporter),
  actor_detail JSON (rule id + version | adapter + version | model id | user id),
  title TEXT, reasoning TEXT, inputs JSON, outputs JSON, status (ok | error),
  created_at, prev_hash CHAR(64), hash CHAR(64)
  unique (run_id, seq)  ── makes writes idempotent on resume
  idx (run_id, seq), idx (kind)

step_refs                 ── what a step used or pointed at; one row per reference
  step_id FK, ref_type (step | lookup_request | finding | evidence | statement | entity |
                        relationship | claim | ai_candidate | contradiction | decision),
  ref_id, role (rests_on | produced | corrects | decides | reports_wrong)
  idx (ref_type, ref_id)  ── "every step that used this record" (R8)

contradictions
  id PK, investigation_id, subject_type, subject_id, property, value_a, ref_a JSON,
  value_b, ref_b JSON, found_by_step_id, status (open | explained | resolved),
  note, decided_by, decided_at
  unique (subject_type, subject_id, property, hash(value_a, value_b))

trail_decisions           ── one reporter decision, shown in every run it touches
  id PK, investigation_id, target_type, target_id, decision, note, decided_by, decided_at
```

- **Why `step_refs` rather than JSON references.** R8 ("every step that
  used this record") is a reverse lookup. An indexed join table answers it
  with one query, without scanning JSON.
- **Hash.** `sha256(prev_hash ‖ canonical_json(step without hash))`.
  Canonical JSON uses sorted keys, UTF-8 and no spaces, and the hash is
  computed server-side.
- **Backup and deletion.** Backup and restore include all five tables, and
  restore verifies every chain. Deleting an investigation removes them.

### 3.7 API

```
POST /api/investigations/{id}/research            {subjects:[a] | [a,b], trigger, from_flag?}
     → 202 {run_id, job_id}          (joins a run already queued or running for the same subjects)
GET  /api/investigations/{id}/research-runs       ?status&kind&subject
GET  /api/research-runs/{rid}                     → run + counts
GET  /api/research-runs/{rid}/steps?after_seq=n   → new steps (polled every 1 s while running)
POST /api/research-runs/{rid}/cancel              → uses the job cancel route; appends a "cancelled" step
GET  /api/research-runs/{rid}/verify              → {ok, checked, broken_at_seq}
GET  /api/research-runs/{rid}/export?format=json|pdf   → the full trail, for an editor or lawyer
POST /api/research-steps/{sid}/decide             {decision, note}
POST /api/research-steps/{sid}/report             {note}            → error-report step
GET  /api/records/{type}/{rid}/trail              → every step that used this record (R8)
GET  /api/investigations/{id}/contradictions      | PATCH /api/contradictions/{cid} {status, note}
GET  /api/investigations/{id}/mistakes            → removed AI sentences, reversals, error reports,
                                                     runs made with since-fixed rule versions
GET  /api/investigations/{id}/research-waiting    → match decisions under threshold, all runs
```

### 3.8 Queue and events

- **Job kind** `research.run`, on the existing queue. Priority:
  click-started runs come first, auto-screen runs last.
- **Idempotency**
  - A run is keyed by `(investigation, sorted subjects)` while queued or
    running; a second click joins it.
  - Steps are keyed by `(run_id, seq)`. On resume after a crash (attempt 2),
    the worker reads the last `seq` and continues. Searches already logged
    are read back from the cache and request log rather than sent again.
- **Inside a run**, searches go out concurrently per source (asyncio) under
  each source's token bucket. Steps are written in completion order, and
  `seq` is assigned at write time under a per-run lock (a row lock on the
  run in PostgreSQL; a process lock inline).
- **Events in:** finding accepted or rejected, statement changed, and
  decision made trigger the DependencyResolver for runs whose `step_refs`
  touch them.
- **Events out:** a run finished triggers a pattern recompute and the
  chart's line badge.

### 3.9 Caching

- **Outside responses** use the lookup cache (`system-design.md` 3.7). A
  cache hit is still a search step, marked "answered from the cache, sent
  nothing".
- **Inside-case paths** are computed per run. They are cheap at case scale
  and must reflect the case at that moment, so they are not cached.
- **Polling:** the frontend keeps steps already received and asks only
  `after_seq`.

### 3.10 Errors

| Failure | Handling |
|---|---|
| Source error, 429 or timeout | Retries per `system-design.md` 3.8. The final failure is an `error` step. The run ends `finished_with_gaps`. |
| All sources off (lookup mode off) | The run still does stages 1, 2, 6 and 8 inside the case. The plan step says outside sources were off. |
| Worker crash mid-run | The job is marked interrupted. Retry resumes from the last `seq`. |
| AI unavailable or rejected | An AI step records the reason (existing rejection reasons). The template conclusion stands. |
| Chain verify fails | The run shows "trail altered after step n". The export marks it. This is reported on the operator console. |
| Reporter cancels | A `cancelled` step records who and when. Requests already sent stay in the log. |

---

## 4. Scale and reliability

- **Volume.** A pair run writes about 10–40 steps, and an auto-screen run
  about 5–15 per party. A 1,000-party case with every party screened and
  200 pair runs is roughly 1,000 × 10 + 200 × 30 = 16,000 steps. At about
  2 KB each that is around 32 MB, comfortably within SQLite and
  PostgreSQL. `step_refs` holds roughly 5 rows per step, about 80,000 rows.
- **Time.** A run is bound by outside limits. Inside-case work is under
  0.5 s at 10⁴ links. The first step is written within the request, so the
  panel shows it in under 1 s.
- **Verify cost.** Verifying is linear in the number of steps: about 40
  hashes for a run, milliseconds.
- **Scaling.** More Procrastinate workers, in-process or as a separate
  container. Nothing about a run is held in process memory between steps.
- **Monitoring** (operator console):
  - runs by status
  - error steps per source
  - median time to first step
  - chains that fail verification
  - corrections per day (a rise can mean a bad rule version)

---

## 5. Trade-offs

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| How research proceeds | A fixed pipeline with versioned rules | An AI agent choosing its next search | Every step is explainable by the code that made it, runs are comparable, and the same input gives the same trail. Agent mode can come later as a run kind writing to the same trail (question 6). |
| Explanations | Rule templates written by the deciding function | AI-written explanations | Explanations that cannot drift from what happened. AI text stays a checked draft. |
| Mutability | Append-only, corrections as new steps, hash chain | Editing steps in place | Ony asked to "trace every single decision". Edits would erase what was decided before; the chain shows tampering. |
| References | `step_refs` join table | JSON on the step | Fast reverse lookup for "every step that used this record". |
| Live updates | Polling `after_seq` every 1 s | Server-sent events or WebSocket | Matches the existing polling pattern and works behind every proxy. SSE can replace it later without touching the trail. |
| Pair sources | Run per pair, plus both parties' own sources | Only pair-specific sources | A link often shows up only through one side's records, such as an officer list. The cost is limited by the cache and the per-source limits. |
| Contradictions | Kept as their own records with both sides | Flag on a field | They become leads, can be explained or resolved, and are listed across runs. |

---

## 6. What to revisit as it grows

- **Agent mode:** once Ony decides question 6, an AI-planned run kind whose
  every proposed search is a step with its reason, checked against the
  router's licence and limit rules before it runs.
- **Multi-reporter:** decisions per user, disagreements between reporters
  shown as their own contradiction type.
- **Trail size:** beyond about 10⁶ steps, partition `research_steps` by
  investigation (PostgreSQL), and archive finished runs' inputs and outputs
  to compressed files referenced by hash.
- **External timestamping:** anchor each finished run's last hash with an
  RFC 3161 timestamp authority, so the trail's date can be proven to
  others. This is optional: it sends a hash (not content) outside.
- **Rule quality:** use reversals and error reports per rule version to
  find rules that need fixing. The "made with v1, since fixed" list already
  covers re-running.
