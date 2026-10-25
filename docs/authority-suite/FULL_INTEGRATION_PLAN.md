# Running the whole Authority System Suite in the Workbench: the plan

Written 25 Oct 2026, after reading every prompt module, schema and core file of the seven systems (vendored at
d2b2186) against what the app does today. Ony asked for the suite to be integrated fully, and for the best way to do
it to be worked out first. Nothing here is built yet.

## Where it stands

13 of the 60 modules run, in 10 app runs: TAS 06 and 08, and PR #87's eight runs (RAS 03+04, QAS 01+03, LAS 01+02,
DAS 01, DAS 02, EGS 01, EHS 02, EHS 01). Each of #87's runs is a hand-written contract of about 100 lines, and the
front end keeps its own copy of each run's parts (`features/ai/claim-review.ts` SUITE_ITEMS).

## What the modules need (from the suite's own text)

| Kind | Modules | What it takes |
|---|---|---|
| A model run over the case's records | TAS 01, 03, 04, 05; RAS 01; EHS 01, 02; EGS 01 | Nothing new. |
| A model run over earlier runs' records | TAS 07, 08; RAS 05, 06, 08, 09; QAS 02 (with app-computed counts), 03, 04 plan; LAS 03, 04, 05, 06, 08, 09; DAS 03, 05, 07, 09, 11; EGS 02 draft, 03 plan | A run that reads several earlier runs (today: one). RAS 09 reads 01–08; LAS 09 reads 01–08. |
| Needs something a person supplies first | TAS 06 (working theory), 07 (access limits), 11 (question, audience, medium), 12 (scope, intended use), 13 (the rule's text); LAS 07 (the source's other statements); DAS 04 (leading option and plan), 06 (criterion weights: the decision-maker's values); EGS 02 (the law the requester names) | A place to give it, and the run refused until it is there. |
| A person's record, not a model step | DAS 08 (the decision itself, then a model may draft the record around it), DAS 11 rule 10 (the outcome, after the event); EGS 02 tracking, 03 conduct, 04 capture, 05 log; EHS 03 (source protection, CP-02) | Forms. Screens need mockups first. The app stores some today (case_records.py); CAPT is wrong against the suite (prefix GCAP; most fields missing; a failed capture cannot be recorded). |
| A final audit, in a fresh context | TAS 10, 12; RAS 10; QAS 07; LAS 10; DAS 10; EGS 05; EHS 04 | Runnable: every app call is a fresh context. The suite: "a fresh context of the same model is a separate pass, not an independent one" (LAS 10:7). Each records its reviewer as a separate pass; code runs the mechanical rules first (AUTOMATED). |
| Numbers the model must not produce | QAS 02 (counts, hashes), 04 results, 05 (estimates, intervals, p-values, subgroups), 06 rule 4 | A deterministic, versioned analysis catalogue in the app over a hashed snapshot of the case, with its location recorded in `QRES.code_location` (QAS 04:49-50). |
| Takes what tools are available as an input | RAS 02 (`Databases/engines available`), RAS 07 ("where authorized to check external sources"), TAS 02 (`External research allowed: YES/NO`), EGS 04 (`Tools available`) | Nothing new: the suite is self-contained. With none available, each runs as written and records the gap the way its rules say (RAS 02 rule 4 and its limits section, RAS 07 rule 3 "unable to verify", TAS 02 against the supplied evidence only). A search or capture a person made is recorded with the tool they used. No connector is built. |
| Needs the model to see an image | TAS 09 (the rendered visual is its input, `[FILE]`) | A model that reads images; the text-only model in use cannot. Otherwise a person looks at it. |
| Amends an accepted record | DAS 09 (reversibility on the decision record), DAS 11 (trigger ids on it) | A proposal to amend, reviewed like any other. |

## The design

1. **One run engine, defined from the suite's files.** A new module is declared as: its prompt file(s), the record
   kinds it writes (read from the system's `OUTPUT_SCHEMAS.md` by `suite_catalog.py`: fields, types, closed values),
   the earlier runs it reads, the inputs a person must give, the fields only a person may fill (forced PENDING or
   null), what it must not do, and the extra checks the suite's rules allow code to make. No value list is copied.
   The answer is the suite's own records, so every module's output has one shape the screens can show.
2. **A store of the case's suite records.** A record proposed by a run and accepted by a person, or entered by a
   person, is stored once under its suite id (one namespace per case, as INTEROP requires). Later runs, final
   audits and code checks read the store. A person's correction or rejection of a record follows it.
3. **Runs that read several earlier runs.** Within one system, records pass whole. Between systems, INTEROP's
   boundary rules (#87's `interop.py`) decide what crosses, and every held-back value is listed in the run record.
4. **Final audits as separate passes.** Fed only the deliverable and the records under audit; code checks first.
5. **Inputs a person gives**, declared per module and refused when missing; **amendments** as proposals.
6. **The QAS analysis catalogue**: fixed functions, versioned, over a hashed snapshot; the model plans and
   interprets, the app computes.
7. **The server says how to show each answer's parts**, so the front end stops keeping its own per-run copy.
8. **#87's eight runs** keep working; the gaps the reading found in them are fixed (LAS "T02" label, missing
   DAS/LAS/RAS/EGS/EHS checks, hand-offs stricter than the suite for EGS 01 and EHS 01, `written_at`).

## Problems found in the suite (for Ony to fix there)

About forty, with file and line; they go into `SUITE_PROBLEMS.md` next to this file as the work starts. The main kinds: outputs with no record
or id prefix (RAS 01/06–10, TAS 02/10/12 verdicts, LAS 10 reviewer field, EGS final check), value lists spelled two
ways (QAS PASS WITH CORRECTIONS; TAS date_type; RAS consensus labels), input lists that omit records the rules use
(DAS 05, 06, 09), forward references (DAS 02 → 04; TAS HYP → GAP), and EHS never saying whether giving material to a
model is a SHARE step.
