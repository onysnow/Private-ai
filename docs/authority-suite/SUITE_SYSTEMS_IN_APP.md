# The suite's other systems in the app

Before this change the app ran TAS only (modules 08 and 06). It now runs one app run of each of the other six
systems through the same pipeline: the system's own prompt modules from the vendored copy, an output contract
trimmed from that system's `EVALUATION/OUTPUT_SCHEMAS.md`, its value lists checked against the vendored text
(`tests/test_authority_suite_drift.py`), and the rules the app can read mechanically. Every answer is a proposal and
writes nothing else.

Code: `backend/app/ai/systems.py` (the modules), `backend/app/ai/interop.py` (what crosses between runs),
`POST /api/investigations/{id}/assistant/suite-run`. Tests: `backend/tests/test_suite_systems.py`.

## What runs

| Module key | System | Suite modules | Starts from (accepted answer) | What it may not do in an app run |
|---|---|---|---|---|
| `research_vetting` | RAS | 03 + 04 (Template T03) | — | No synthesis, no certainty or consensus label (only Module 09 assigns them), currency left UNABLE_TO_VERIFY unless a record states it |
| `quant_framing` | QAS | 01 + 03 | theory test (optional) | Computes nothing: no result, estimate or audit; a number no packet record states is flagged |
| `las_argument_check` | LAS | 01 + 02 (Template T02) | case synthesis (optional) | Never judges premise truth; no composite verdict; must say Modules 03–10 did not run |
| `das_framing` | DAS | 01 | — | Decides, ranks and recommends nothing |
| `das_options` | DAS | 02 | decision framing (required) | As above; `upstream_tier` is written by the Workbench from the source's own tier, never by the model |
| `evidence_plan` | EGS | 01 | case synthesis or theory test (required) | Judges nothing; statuses PLANNED or NOT_SOUGHT only; sends nothing |
| `ehs_harm_minimisation` | EHS | 02 | case synthesis (optional) | Every decision field PENDING; no person's field (`decided_by` etc.) |
| `ehs_public_interest` | EHS | 01 | harm assessment (required) | As above |

Not run, and why:
- **EHS Module 03 (source protection).** Its record is a precondition of any CONTACT / RECORD / STORE / SHARE step
  and works from code names only. A packet that holds a confidential source's identity is the material it
  protects; whether sending that packet to a model is itself a SHARE step is for you to decide.
- **Final audits (LAS 10, DAS 10, QAS 07, RAS 10, EHS 04).** Each must run in a fresh context; QAS's cannot give
  PASS in the same one.
- **QAS Modules 04–06.** They need an analysis run as code with its location recorded. The Workbench would have
  to run the check (as the chart catalogue does today); not built.
- **RAS: nothing in the app marks a source as published research.** The model lists case records that are not
  research in `not_research_sources`; a reporter-set marker is an app decision not yet made.

## What crosses between runs (INTEROP.md)

Only an answer a person accepted crosses, and the next run reads the same packet that answer cited. A claim you
rejected never crosses; one you corrected crosses in your words. A value no INTEROP rule carries is held back and
listed in the run record (BLOCK · HELD), field by field, with the rule:

- TAS → LAS: `classification` (§3 maps Module 02 verdicts, not classifications), `confidence` (§2 [IN-012]),
  `confidence_term` (LAS's term grades its own verdict).
- TAS → EGS: `record_existence` (no row; EGS re-derives it and the Workbench flags a disagreement), plus
  `classification` and a hypothesis's `viable` / `assessment`.
- TAS → EHS: `classification`, `confidence`, `confidence_term`. The right-of-reply subjects cross as names only:
  they are not a reply record.
- TAS → QAS: a hypothesis's `kind`, `viable`, `assessment` ([IN-079]: QAS assigns its own rival category).

## Problems in the suite itself (for its owner; the app does not work around them)

1. **LAS: five or seven confidence terms.** `systems/las/PROMPT_MODULES/09_ARGUMENT_SYNTHESIS_AND_VERDICT.md:32`
   says "the five-term value"; `systems/las/EVALUATION/OUTPUT_SCHEMAS.md` and `OUTPUT_SCHEMAS_MACHINE.md` list seven.
2. **LAS: `check_performed` spelled two ways.** `OUTPUT_SCHEMAS.md:91` "checked, not testable from available
   sources"; `OUTPUT_SCHEMAS_MACHINE.md:64` `CHECKED_NOT_TESTABLE`.
3. **INTEROP.md:273 names the wrong TAS classification set** (`DOCUMENTED|CORROBORATED|…`, the visual-record set);
   the Claim record's set is `SOURCE_STATEMENT|…`.
4. **INTEROP has no TAS-classification → LAS row, no TAS → EGS row and no TAS → EHS row**, though the EGS README
   names TAS gaps as its input. The app holds those values back under §0.
5. **EGS: `priority` has no closed set in `OUTPUT_SCHEMAS.md`** (the example `"HIGH"` at :26 only; Module 01 rule 6
   says "high, medium, low").
6. **EHS: no way to record "no public interest found".** Test H02 (`EVALUATION/ADVERSARIAL_TEST_SUITE.md:18`)
   passes when the field says so; the `public_interest` list (`OUTPUT_SCHEMAS.md:47-48`) has no such value, and
   writing OTHER would be the coercion INTEROP §0 forbids.
7. **EHS: `breach_decision: NONE` "needs no name"** (`OUTPUT_SCHEMAS.md:118-119`) against the Standard's rule that
   a decision field with no name is a draft (`CORE/EHS_STANDARD.md:20-21`).
8. **DAS: assumption status spelled two ways.** Module 04:42 "tested-fails"; `OUTPUT_SCHEMAS.md:140` `TESTED_FAILED`.
9. **DAS: no field for the upstream finding's confidence label**, which Policy §8 (`CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md:76`)
   says to cite; and `upstream_tier` is undefined when the evidence cites sources of different tiers (the app
   leaves it empty and says so).
10. **QAS: audit verdict spelled with spaces** (`PASS WITH CORRECTIONS`, `systems/qas/EVALUATION/OUTPUT_SCHEMAS.md:200,204`)
    against INTEROP.md:203 and RAS's `PASS_WITH_CORRECTIONS`, and against QAS's own underscore rule.

## Not built yet

- Screens for these runs. The run panel and the claim-by-claim review read the new answers, and "Before you
  run" shows which systems a next run would use, but starting a suite run and reading its answer need a mockup
  first.
- TAS taking a RAS answer: [AG-012] / INTEROP §3 say a retracted, superseded or unverified-provenance research
  source supports no TAS claim. Nothing hands RAS answers to TAS yet, so there is nothing to block.
