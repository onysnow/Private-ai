# LAS Build Plan

## Root files
- [x] LICENSE
- [x] README.md (revised to describe the corrected structure and the v0.1.0 remap)
- [x] CHANGELOG.md (started at v0.1.0 with this remap)
- [x] SOURCE_INDEX.md (8 sources, LS-01 through LS-08)

## CORE/
- [x] CORE/LAS_PROMPT_ENGINEERING_STANDARD.md -- the central standard, restructured into TAS's section pattern with LAS's own 13 non-negotiable rules for its domain
- [x] CORE/PREMISE_EVIDENCE_AND_ATTRIBUTION_POLICY.md -- premise attribution categories and evidentiary-weight thresholds needed before soundness can be assessed
- [x] CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md -- TAS's five-term vocabulary reused, with worked examples adapted to argument-evaluation confidence
- [x] CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md -- TAS's four-layer template adapted to LAS's domain

## PROMPT_MODULES/ (in this order)
- [x] PROMPT_MODULES/01_ARGUMENT_RECONSTRUCTION.md
- [x] PROMPT_MODULES/02_VALIDITY_CHECK.md
- [x] PROMPT_MODULES/03_SOUNDNESS_CHECK.md
- [x] PROMPT_MODULES/04_FALLACY_DETECTION.md
- [x] PROMPT_MODULES/05_HIDDEN_PREMISE_SURFACING.md
- [x] PROMPT_MODULES/06_COUNTERARGUMENT_STRESS_TEST.md
- [x] PROMPT_MODULES/07_CONSISTENCY_CHECK.md
- [x] PROMPT_MODULES/08_RHETORICAL_VS_LOGICAL_FORCE.md
- [x] PROMPT_MODULES/09_ARGUMENT_SYNTHESIS_AND_VERDICT.md
- [x] PROMPT_MODULES/10_FINAL_LOGIC_AUDIT.md

## Routing and templates
- [x] PROMPT_MODULE_CATALOG.md -- routing table, written after all ten modules
- [x] PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md -- 8 composed templates (T00-T07)

## EVALUATION/
- [x] EVALUATION/OUTPUT_SCHEMAS.md -- structured output schemas adapted to LAS's argument/premise/fallacy/consistency records
- [x] EVALUATION/PROMPT_QA_RUBRIC.md -- 12 scored dimensions adapted to this domain
- [x] EVALUATION/ADVERSARIAL_TEST_SUITE.md -- 15 regression test cases (L01-L15), including 2 new cases for the Consistency Check module

Not planned initially: VISUAL_STANDARDS/ (not built).

## Status

All items complete for v0.1.0. This is the file-for-file remap of the
prior structurally-mismatched draft onto this build plan; see
`CHANGELOG.md` for the detailed account of what was reused, extended, or
written new against each line above.

Counts on this list are as built at v0.1.0: the Standard now has 14 non-negotiable rules
(Rule 14, `CHANGELOG.md` 0.1.1) and the suite 31 cases (L01-L31; `CHANGELOG.md`
records when each was added).
