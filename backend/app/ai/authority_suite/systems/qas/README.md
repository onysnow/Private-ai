# Quantitative Analysis System (QAS)

**v0.3 — 2026-10-10. Full authority system since DIR-0046 (v0.2); router row 3, in the pipeline between TAS (fact, row 2) and LAS (inference, row 4). First built as v0.1 under DIR-0043; v0.3 applies the fixes from the second audit (`CHANGELOG.md`).**

QAS is a model-agnostic prompt doctrine for any answer that rests on numbers
or on testing a theory against data. It governs the work from the question to
the audited result: framing the question before the data are opened, recording
where each dataset came from and every change made to it, judging how far
each dataset can be relied on for the question, listing rival
explanations and designing a check that tells them apart (strong inference at
the centre), running and logging the analysis, stating uncertainty and reading
p-values correctly, judging cause, and a final audit. QAS computes.

## Where QAS's job ends

QAS sits third in the order of work: source, fact, quantitative analysis,
inference, decision. It takes in data whose underlying facts have been
established, keeping the status they arrived with, and passes on audited
results with their intervals, labels, causal verdict and population
(`CORE/QAS_STANDARD.md` §10).

By job:

- Judging whether published research was searched for and weighed honestly,
  without computing anything, begins where QAS ends.
- Deciding whether a specific claim about a real case is true, given case
  evidence, is a separate job that comes before QAS; QAS keeps the status it
  gives the material and does not decide such a claim beyond what the data
  show.
- Checking whether an argument built on a QAS result holds together is a
  separate job that comes after QAS.
- Deciding what to do about a result is a separate job.
- Obtaining primary records, interviews and online material before anyone
  analyses them comes before QAS.
- Deciding whether publishing serves a public interest in proportion to its
  harm, and protecting sources, is a separate job.

By name: RAS judges published studies and does not compute; TAS decides
whether a specific claim is true given case evidence, and comes before QAS
(row 2); LAS checks whether an argument holds together, and comes after QAS
(row 4); DAS checks whether a decision was made well; EGS, a support system,
gathers and preserves primary evidence; EHS, a support system, lays out
ethics and harm considerations for a named person to decide.

## Structure

- `README.md` — this file.
- `LICENSE` — Creative Commons Attribution 4.0 International.
- `CHANGELOG.md` — what changed and when.
- `BUILD_PLAN.md` — what the full structure is and what is still to come.
- `BUILD_LOG.md` — each build, dated.
- `CORE/QAS_STANDARD.md` — principles, pipeline and load, completion
  standard, record ids, untrusted content, terms, hand-offs.
- `CORE/DATA_SOURCE_AND_QUALITY_POLICY.md` — how far a dataset can be relied
  on: by its producer and the assurance behind it, by its documentation, and
  by its fit for the question.
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` — purpose, the seven likelihood
  terms with bands, worked examples, numbered rules (intervals first, the
  band beside every term) and the rule on restating a finding.
- `CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md` — the four-layer project
  instructions for quantitative work.
- `PROMPT_MODULE_CATALOG.md` — routes tasks to the seven modules.
- `PROMPT_MODULES/01_QUESTION_AND_DATA_FRAMING.md`
- `PROMPT_MODULES/02_DATA_PROVENANCE_AND_CLEANING.md`
- `PROMPT_MODULES/03_RIVAL_HYPOTHESES_AND_THE_DISCRIMINATING_TEST.md`
- `PROMPT_MODULES/04_CHOOSING_AND_RUNNING_THE_ANALYSIS.md`
- `PROMPT_MODULES/05_UNCERTAINTY_EFFECT_SIZE_AND_WHAT_A_P_VALUE_IS_NOT.md`
- `PROMPT_MODULES/06_CAUSAL_JUDGEMENT.md`
- `PROMPT_MODULES/07_FINAL_QUANTITATIVE_AUDIT.md`
- `PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md` — invocation
  block and templates T00–T03.
- `EVALUATION/OUTPUT_SCHEMAS.md` — one record format per prefix, and the
  dataset assurance block.
- `EVALUATION/PROMPT_QA_RUBRIC.md` — blocking defects, twelve scored
  dimensions and the adoption protocol for a QAS-based prompt.
- `EVALUATION/ADVERSARIAL_TEST_SUITE.md` — tests Q01–Q33 and the regression
  gate.
- `SOURCE_INDEX.md` — sources QS-01 to QS-39, the limits found by the
  disconfirming searches, and what was not read in full.

## Core rules (summary — full text in `CORE/QAS_STANDARD.md` §2–§4 and §10, and `CORE/DATA_SOURCE_AND_QUALITY_POLICY.md`)

- Write the question, unit of analysis, population and answer form before
  opening the data, or the QFRM record discloses that it was not (Module 01
  rule 9).
- Keep the received data unchanged; record every change as a re-runnable step
  with counts before and after.
- Give each dataset a reliance level for the question from how it was
  collected, its documentation and its fit; a producer's name does not
  settle it.
- List the rivals that can be identified and a check that tells them apart,
  before the confirmatory analysis; label exploration as exploration.
- Record every analysis tried and every choice made after seeing the data.
- Report effect sizes with intervals; read p-values only for what they are.
- Use causal wording only after a causal judgement record permits it.
- Trace every reported number to a recorded step; audit in a fresh context.
- Keep the status received data arrived with; pass results on only as the
  audit's hand-off lists them (§10).

## License

Creative Commons Attribution 4.0 International (CC BY 4.0); see `LICENSE`.

## Sources

`SOURCE_INDEX.md`.
