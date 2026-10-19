# RAS Build Plan

*Updated 2026-09-20 — v0.1.0 content pass complete for all items marked [x] below.*

## Root files
- [x] LICENSE
- [x] README.md (placeholder framing; revise once the mission statement lands) — revised to describe the corrected v0.1 structure and its supersession of the earlier mismatched draft.
- [x] CHANGELOG.md (start at v0.1.0 once the first real content lands; don't create an empty stub) — v0.1.0 entry added, describing the full remap.
- [x] SOURCE_INDEX.md (grows as modules cite sources; start it when the first module needs a citation) — 14 sources (RS-01 through RS-14), all live-verified.

## CORE/
- [x] CORE/RAS_PROMPT_ENGINEERING_STANDARD.md -- the central standard (TAS's equivalent is CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md, ~19KB -- read it for the level of rigor and structure expected, then write RAS's own non-negotiable rules for its domain, not a reworded copy)
- [x] CORE/SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md -- which kinds of sources count as authoritative for a general research question and how to retrieve and cite them -- adapted from TAS's own source-authority policy for non-investigative research
- [x] CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md -- mostly domain-agnostic; adapt TAS's version's examples to this system's domain rather than rewriting from scratch
- [x] CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md -- adapt TAS's four-layer (project instructions / active guidance / task materials / verification archive) template to this system's domain

## PROMPT_MODULES/ (in this order)
- [x] PROMPT_MODULES/01_RESEARCH_QUESTION_FRAMING.md
- [x] PROMPT_MODULES/02_SOURCE_DISCOVERY_AND_DIVERSITY_CHECK.md
- [x] PROMPT_MODULES/03_SOURCE_VETTING_AND_AUTHORITY_RANKING.md
- [x] PROMPT_MODULES/04_CLAIM_EXTRACTION_AND_CORROBORATION_MAPPING.md
- [x] PROMPT_MODULES/05_BIAS_AND_INTEREST_DISCLOSURE.md
- [x] PROMPT_MODULES/06_CONTRADICTION_AND_CONSENSUS_MAPPING.md
- [x] PROMPT_MODULES/07_CURRENCY_AND_RETRACTION_CHECK.md
- [x] PROMPT_MODULES/08_RESEARCH_GAP_ANALYSIS.md
- [x] PROMPT_MODULES/09_SYNTHESIS_AND_CONFIDENCE_CALIBRATION.md
- [x] PROMPT_MODULES/10_FINAL_RESEARCH_AUDIT.md

## Routing and templates
- [x] PROMPT_MODULE_CATALOG.md -- routing table, written only after all modules above exist
- [x] PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md -- combines modules into common end-to-end task templates

## EVALUATION/
- [x] EVALUATION/OUTPUT_SCHEMAS.md -- structured output schemas for this domain's key objects (adapt TAS's Evidence/Event/Transaction/Relationship/Claim pattern to what this domain actually produces)
- [x] EVALUATION/PROMPT_QA_RUBRIC.md -- adapt TAS's rubric dimensions to this domain
- [x] EVALUATION/ADVERSARIAL_TEST_SUITE.md -- regression test cases with adversarial traps specific to this domain's failure modes

Not planned initially: VISUAL_STANDARDS/ (not built, per plan).

## Notes for the next pass

- Every item in this plan is now content-complete for v0.1.0. Nothing was
  left as an empty stub.
- Two items carry explicitly flagged open questions for a future revision
  (not blocking v0.1.0): the lightweight single-fact-lookup path's full
  specification, and a possible domain-specific overlay (e.g., a
  medical-evidence overlay). Both are noted in `README.md`'s "What's still
  open" section and `PROMPT_MODULE_CATALOG.md`'s "Open questions" section.
- The judgment call on redistributing the earlier draft's Module 04
  (Individual Source Quality & Risk-of-Bias Assessment) across the new
  Modules 03, 04, and 05 is recorded in `CHANGELOG.md` for Ony's review.
