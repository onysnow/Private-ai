# QAS Build Plan

*Updated 2026-10-10 under DIR-0046, after the second audit (v0.3).*

## What full structure means for QAS

QAS was first built under PROP-0007's "small first" (DIR-0043): a short
load (Standard and confidence file), seven modules, a template library,
schemas, a twelve-test suite and a source index, with no domain policy, QA
rubric, project-instructions template or build plan. DIR-0046 made QAS a full
authority system, router row 3 in the pipeline between fact (row 2) and
inference (row 4), and lifted PROP-0007's cost limits for it. Full structure
means the same file set the other authority systems carry: a Standard, a
domain policy, a confidence file and a project-instructions template in
CORE/; the modules and their catalog; a template library; schemas, a QA
rubric and an adversarial suite with a regression gate in EVALUATION/; a
source index; and this plan and its log.

## Root files
- [x] LICENSE
- [x] README.md — status line, the order of work, every file listed
- [x] CHANGELOG.md
- [x] BUILD_PLAN.md — this file
- [x] BUILD_LOG.md
- [x] SOURCE_INDEX.md — QS-01 to QS-39

## CORE/
- [x] CORE/QAS_STANDARD.md — principles, pipeline and load, completion standard, record ids, untrusted content, terms, hand-offs
- [x] CORE/DATA_SOURCE_AND_QUALITY_POLICY.md — how far a dataset can be relied on for one question (DIR-0046)
- [x] CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md — purpose, vocabulary, worked examples, rules, restating a finding (full shape since v0.3)
- [x] CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md — four layers (DIR-0046)

## PROMPT_MODULES/
- [x] PROMPT_MODULES/01_QUESTION_AND_DATA_FRAMING.md
- [x] PROMPT_MODULES/02_DATA_PROVENANCE_AND_CLEANING.md — rule 12 applies the policy (DIR-0046)
- [x] PROMPT_MODULES/03_RIVAL_HYPOTHESES_AND_THE_DISCRIMINATING_TEST.md
- [x] PROMPT_MODULES/04_CHOOSING_AND_RUNNING_THE_ANALYSIS.md
- [x] PROMPT_MODULES/05_UNCERTAINTY_EFFECT_SIZE_AND_WHAT_A_P_VALUE_IS_NOT.md
- [x] PROMPT_MODULES/06_CAUSAL_JUDGEMENT.md
- [x] PROMPT_MODULES/07_FINAL_QUANTITATIVE_AUDIT.md — rule 14 writes the hand-off (v0.3)

## Routing and templates
- [x] PROMPT_MODULE_CATALOG.md
- [x] PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md — T00–T03

## EVALUATION/
- [x] EVALUATION/OUTPUT_SCHEMAS.md — eight record types and the dataset assurance block
- [x] EVALUATION/PROMPT_QA_RUBRIC.md (DIR-0046)
- [x] EVALUATION/ADVERSARIAL_TEST_SUITE.md — Q01–Q33; gate Q03, Q06, Q07, Q11, Q12, Q13, Q19, Q20, Q21

Not planned: VISUAL_STANDARDS/.

## Still to come

- **Runs.** No test in the suite has been run, and no gate run exists. The
  gate runs are T-0366, parked under DIR-0040's cancellation of suite runs,
  which DIR-0046 did not lift. The rubric's protocol (step 3) asks for a
  second arm, the same model given the input alone, so a run can show
  whether the doctrine changes behaviour (AUDIT_QAS_2026-10-10 UNTESTED-1).
- **Rules named by no test.** None since v0.3: Q25–Q33 name Policy rules 1,
  6, 11, 16 and 20, limit 7, template T03, the project-instructions
  template's rule 10 and the hand-off (AUDIT_QAS_2026-10-10b UNTESTED-2).
  The suite has 33 tests.
- **Audits.** The second audit (AUDIT_QAS_2026-10-10b) covered the DIR-0046
  build; its findings were fixed in v0.3 except those left to the
  maintainer: which LAS premise status a handed-off QAS result takes
  (MISSING-7), the runs (UNTESTED-1) and claim-ledger.py's pattern
  (UNTESTED-4). v0.3 itself has not been audited.
- **Reading limits.** Several DIR-0046 sources were read in part (SOURCE_INDEX
  "Not read"); the Code of Practice 3.0 PDF, the European code PDF and OMB
  Statistical Policy Directive No. 1 were not read.
- **Outside this directory.** The router row, the order of work in the
  umbrella files and the interoperation entries for the assurance block and
  the hand-off belong to the umbrella and are not built here.
