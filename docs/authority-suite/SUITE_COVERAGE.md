# What the app does with each Authority System Suite system

The 23 Oct 2026 audit (P2, "Authority System Suite executable coverage") asked for this table so
that having a system's prompts in the repo is not mistaken for the app running it. Read from the
code on 24 Oct 2026 against the vendored suite (`backend/app/ai/authority_suite/VENDORED_FROM`).
`SUITE_GAPS.md` next to this file is the word-by-word comparison of the app's values with the
suite's; this file is about what runs.

**Short answer (updated 24 Oct 2026, ADR-0015): every module of all seven systems runs in the app**
(60 modules: RAS 10, TAS 13, QAS 7, LAS 10, DAS 11, EGS 5, EHS 4) through
`POST /api/investigations/{id}/assistant/suite/{system}/{number}`, with the prompt and the records read from
the vendored suite (`app/ai/suite_catalog.py`). TAS Modules 06 and 08 also keep their tailored endpoints.
A run's answer names the systems it trips by AGENTS.md's trigger table, each with the module to run next
(`app/ai/suite_router.py`). The table below is the state before that change, kept as the audit's record;
the rows marked *now* are what changed.

| | TAS Topic | EHS Ethics & Harm | EGS Evidence Gathering | LAS Logic | QAS Quantitative | RAS Research | DAS Decision |
|---|---|---|---|---|---|---|---|
| Protocol in the repo (vendored) | yes | yes | yes | yes | yes | yes | yes |
| Fields stored on the app's records | claim, source, evidence and link suite fields (`routes_suite.py`, `services/suite_fields.py`) | — | lead gathering outcome (`models/leads.py`) | — | — | — | — |
| Suite records the app keeps (`services/case_records.py`) | GAP, ROR, HYP, CFLT, RLOG | ESRC (CP-02), EPIT (CP-03) | CAPT (Module 04) | — | — | — | — |
| API | `PATCH …/suite`, `/case-records`, reasoning endpoints | `/case-records` | `/case-records`, lead fields | — | — | — | — |
| Checks without a model | closed lists match the suite (`suite_vocab.py`); record rules (a reply's offerer is a person, a resolved conflict names its evidence, a negative search has a scope); tier floor; citations checked against the retrieval packet (`quote_check.py`) | closed lists for decisions, planned steps, breaches | closed list of gathering outcomes | — | — | — | — |
| Runs with a model | Module 08 Case Synthesis, Module 06 Hypothesis and Contradiction Testing (`ai/reasoning.py`) | — | — | named as a hand-off it cannot make (`run_plan.py`: `not_in_app`) | named as a hand-off for hypothesis tests (`not_in_app`) | named, `not_expected` | named, `not_expected` |
| Tests | `test_reasoning_endpoints.py` (fake model: invented citation refused, malformed answer refused, valid answer staged for review), `test_suite_records.py`, `test_suite_map.py`, `test_authority_suite_drift.py` | closed lists; ESRC and EPIT rules (`test_the_other_records_keep_their_rules`) | lead outcome; CAPT hash and custody log | — | — | — | — |
| *Now:* runs with a model | every module, `suite:<system>.<NN>` (`ai/suite_modules.py`) | every module | every module | every module, and handed off to when a TAS claim is an inference | every module, and handed off to for transactions and hypotheses | every module | every module |
| *Now:* tests | `test_suite_runs.py`: one module of each system with a fake model, every module's prompt built, a record breaking its schema refused, an invented citation refused, TAS → LAS hand-off read by LAS through `prior_run_ids` | same | same | same | same | same | same |
| Run with a real model | not verified in this inventory | — | — | — | — | — | — |

## Gaps this shows

- **Records that had no test.** Until 24 Oct, `test_suite_records.py` made only GAP, ROR and RLOG
  records. `test_the_other_records_keep_their_rules` now makes HYP, CFLT, ESRC, EPIT and CAPT and
  checks each rule `case_records.py` enforces for them; all held.
- **Six of seven systems have no model workflow.** LAS and QAS are the two the run plan already
  says a TAS answer would need; their absence is shown to the reporter as `not_in_app`, not hidden.
- **No real-model run is on record.** The reasoning tests use a fake model. Whether a local Ollama
  model follows Module 06 and 08's schemas has not been measured.

Whether to add any of LAS, QAS, RAS or DAS, and in the app or the suite, is a decision for the
suite's owner (the 23 Oct "Actual Stack and Viable Library Additions" review says to add a library
such as Z3 or SymPy only for a named, tested gap).
