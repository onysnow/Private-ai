# Prompt Module Catalog

*Part of Quantitative Analysis System (QAS).*

This catalog routes tasks to the seven modules in `PROMPT_MODULES/`. Each
module does one job, runs alone, and leaves a record named in
`CORE/QAS_STANDARD.md` §5.

| # | Module | Primary job | Main output |
|---|---|---|---|
| 01 | Question and Data Framing | Fix the question, unit of analysis, population, variables and answer form before any data are opened | QFRM record |
| 02 | Data Provenance and Cleaning | Record each dataset's origin, keep the received file unchanged, record every change with counts, write the data dictionary, set how far the dataset can be relied on | QDAT (with assurance block) and QCLN records |
| 03 | Rival Hypotheses and the Discriminating Test | List the rivals that can be identified, their differing predictions, and a check that counts against some; repeat; label exploration | QRIV record |
| 04 | Choosing and Running the Analysis | Plan before outcome data where possible; log every analysis and data-dependent choice; run robustness versions | QPLN and QRES records |
| 05 | Uncertainty, Effect Size and What a p-value Is Not | State effect sizes with intervals; read p-values correctly; check base rates and subgroups; report every analysis | Completed QRES records |
| 06 | Causal Judgement | Decide what causal wording the analysis supports, from stated causal assumptions | QCAU record |
| 07 | Final Quantitative Audit | Trace every number, check wording and restatements, give a verdict, write the hand-off, in a fresh context | QAUD record: PASS / PASS WITH CORRECTIONS / FAIL, and its handoff |

## Routing rules

- Start with Module 01 before any dataset is opened. If data were already
  opened, Module 01 still runs and records that.
- Run Module 02 for each dataset as it arrives. A new dataset added later
  gets its own QDAT record before it is used. Module 02 rule 12 applies
  `CORE/DATA_SOURCE_AND_QUALITY_POLICY.md`; to judge one dataset's
  reliance without analysing it, use template T03.
- A DESCRIPTIVE question with no comparison may skip Modules 03 and 06; the
  QFRM record lists the skip and the reason.
- An exploratory pass may come before Module 03 fixes the rivals. Its output
  is labelled exploratory and goes into Module 03 as candidates.
- Run Module 04's plan before the outcome data are examined where possible.
- Run Module 05 on every result before it is reported.
- Run Module 06 whenever the draft wording states or implies cause.
- Run Module 07 last, in a fresh context holding only the records and the
  draft. Pass a result on only as the QAUD `handoff` lists it
  (`CORE/QAS_STANDARD.md` §10).

## Composition pattern

```text
Request
  -> QFRM (01)
  -> QDAT + QCLN per dataset (02)
  -> [labelled exploratory pass]
  -> QRIV (03), repeated per round
  -> QPLN, then QRES (04)
  -> completed QRES (05)
  -> QCAU (06), if cause is stated or implied
  -> draft
  -> QAUD (07), fresh context
  -> handoff (07 rule 14; Standard §10)
```

Pass records between modules. Do not paste every module into one prompt.
