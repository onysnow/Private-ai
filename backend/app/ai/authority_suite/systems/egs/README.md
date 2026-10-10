# Evidence Gathering System (EGS)

**v0.1 — 2026-10-10, built under DIR-0043. A support system since DIR-0046 (2026-10-10): it serves the authority systems and issues no authority judgement; it obtains evidence and does not judge it.**

EGS is a model-agnostic prompt doctrine for obtaining primary evidence before anyone weighs it. It
governs the evidence plan drawn from the hypotheses or story, public-records requests, interviews,
online collection and preservation, and the gathering log of what was sought and what was not
obtained. It starts where TAS's gap analysis stops: TAS names the missing records and testimony; EGS
plans how to get them, gets them, and records the result.

## Where EGS's job ends

EGS collects and records. As a support system it judges nothing it gathers; the authority
judgements begin where its records are handed on:

- Weighing whether a specific claim is true, given the evidence gathered: **TAS**.
- Judging whether published research was searched and weighed honestly: **RAS**.
- Testing whether an argument built on the evidence holds together: **LAS**.
- Judging whether a decision, such as what to pursue next, was made well: **DAS**.
- Analysing numbers or testing a theory against data that EGS obtained: **QAS**.
- Judging public interest, harm, source protection and the publication record: **EHS**. EGS records
  what an interviewee was told and agreed; it does not judge harm or anonymity.

EGS collects and preserves online material. It does not verify or authenticate it: verifying online
material is not this system's job.

## Core rules (summary)

Plan before contact; documents before people; testimony is a claim to corroborate; preserve before
use; what was not obtained is a finding; deadlines, fees and appeal routes come from the law or
official guidance named for the jurisdiction. The rules are stated once, in
`CORE/EGS_STANDARD.md`.

## Structure

- `CORE/EGS_STANDARD.md` — principles, pipeline, outcome vocabulary, completion standard, record IDs,
  untrusted content, scope.
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` — the seven-term likelihood table, restating a finding, and
  why a request's or capture's status is not a likelihood.
- `PROMPT_MODULE_CATALOG.md` — routing for the five modules.
- `PROMPT_MODULES/01_EVIDENCE_PLAN.md`
- `PROMPT_MODULES/02_PUBLIC_RECORDS_REQUESTS.md`
- `PROMPT_MODULES/03_INTERVIEW_PLANNING_AND_CONDUCT.md`
- `PROMPT_MODULES/04_ONLINE_COLLECTION_AND_PRESERVATION.md`
- `PROMPT_MODULES/05_GATHERING_LOG_AND_FINAL_GATHERING_CHECK.md`
- `PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md` — invocation block, T00 Router, T01 Full
  pipeline, T02 Records request.
- `EVALUATION/OUTPUT_SCHEMAS.md` — GPLN, GREQ, GINT, GCAP and GLOG records, and
  the final gathering check.
- `EVALUATION/ADVERSARIAL_TEST_SUITE.md` — tests E01–E12, regression gate, coverage.
- `SOURCE_INDEX.md` — sources GS-01 to GS-18, limits, and what was not read.
- `CHANGELOG.md`, `LICENSE`.

Deliberately absent: a prompt QA rubric, a project-instructions template and a build plan. Under
PROP-0007's "small first" they are added only when a recorded run shows a gap they would close.

## License

CC BY 4.0. See `LICENSE`.

## Sources

See `SOURCE_INDEX.md`.
