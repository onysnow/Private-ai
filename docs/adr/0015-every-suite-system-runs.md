# ADR-0015: Every Authority System Suite system runs in the app

**Status:** Accepted (2026-10-24)
**Deciders:** Claude, as Ony asked ("prioritize making sure the entire Authority suite system is hooked up properly and working")

## Context

The app ran two of TAS's thirteen modules (06 Hypothesis and Contradiction Testing, 08 Case Synthesis) with an
output contract written in the app (`app/ai/reasoning.py` OUTPUT_SCHEMAS). The other six systems (RAS, QAS, LAS, DAS,
EGS, EHS) were vendored but never run; the run plan named LAS and QAS as hand-offs `not_in_app`
(`docs/authority-suite/SUITE_COVERAGE.md`). Every system's files share one shape: a module catalog, one file per
module with a `## Use when` and a `## Prompt` block, and `EVALUATION/OUTPUT_SCHEMAS.md` (with
`OUTPUT_SCHEMAS_MACHINE.md` for LAS) giving each record as a JSON example. All 67 examples parse.

## Decision

- **The suite's files are the definition.** `app/ai/suite_catalog.py` reads, from the vendored copy, each system's
  name, its modules (number, title, use-when, prompt) and its records (the heading, the JSON example, the id prefix,
  the closed values its prose states as "`field` is `A`, `B` or `C`"). Nothing about a module is written in the app;
  updating the vendored copy updates what runs. A test reads every system and fails if a module or a record stops
  parsing.
- **One run shape for every module.** A suite module runs through the same `run_reasoning_module()` as Modules 06 and
  08: retrieval packet, the run record (ADR-0012), the model call, the shape check, the citation check, an
  `AIAnalysisCandidate` proposed for review, never a canonical write. Its module key is `suite:<system>.<NN>`. The
  model answers `{"summary", "records": [{"kind", "record", "cites"}], "limitations"}`: `kind` is one of that
  system's record headings, `record` is checked against that record's example (every field present, the example's
  JSON types, the stated closed values), and `cites` lists the packet's `{record_type, record_id}` pairs the record
  rests on, which the existing citation check holds to the packet. The model is not told which records a module
  makes: four catalogs (TAS, RAS, LAS, DAS) name them in words, not by id prefix, so the app would have to keep its own
  table; that belongs in the suite (reported to Ony).
- **The prompt** is the system's name, the suite's Non-negotiables (`AGENTS.md`, in force with no load), the module's
  Prompt block, the app's evidence-authority rules (unchanged from Modules 06 and 08), and the system's record
  schemas. Earlier runs given as `prior_run_ids` go in the user turn as quoted records, so a module can read its
  predecessor's records (LAS 01 → 02) and one system can read another's (TAS 08 → LAS 01).
- **Routing** follows `AGENTS.md`'s trigger table: `app/ai/suite_router.py` reads a run's records and says which
  systems the answer trips (a TAS claim classed INFERENCE → LAS; a transaction or a number → QAS; a decision →
  DAS; a records request or interview → EGS; publication or a confidential source → EHS), each with the table row.
  The run plan reports a system as `runs` when it can be run, instead of `not_in_app`.
- **Modules 06 and 08 keep their tailored contract.** Their screens read it; replacing it is a later step.

## Not decided here

The screens for these runs (mockups first); applying `INTEROP.md`'s boundary rules to values that cross systems
beyond quoting the earlier records; a system's whole pipeline run as one chain.
