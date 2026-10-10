# DAS Build Plan
## Root files
- [x] LICENSE
- [x] README.md (placeholder framing; revise once the mission statement lands)
- [x] CHANGELOG.md (start at v0.1.0 once the first real content lands; don't create an empty stub)
- [x] SOURCE_INDEX.md (grows as modules cite sources; start it when the first module needs a citation)
## CORE/
- [x] CORE/DAS_PROMPT_ENGINEERING_STANDARD.md -- the central standard (TAS's equivalent is CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md, ~19KB -- read it for the level of rigor and structure expected, then write DAS's own non-negotiable rules for its domain, not a reworded copy)
- [x] CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md -- which kinds of evidence, precedent, and expert input count as authoritative for a decision, and how to weigh precedent against the specifics of the current decision
- [x] CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md -- mostly domain-agnostic; adapt TAS's version's examples to this system's domain rather than rewriting from scratch
- [x] CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md -- adapt TAS's four-layer (project instructions / active guidance / task materials / verification archive) template to this system's domain
## PROMPT_MODULES/ (in this order)
- [x] PROMPT_MODULES/01_DECISION_FRAMING.md -- Decision Framing: Identify the actual decision being made, the real decision-maker, what's actually at stake, how reversible it is, and the real deadline -- and distinguish the real question from a proxy question someone substituted for it.
- [x] PROMPT_MODULES/02_OPTION_GENERATION_AND_EVIDENCE_GATHERING.md -- Option Generation & Evidence Gathering: Enumerate the real set of options (not just the ones already on the table), and gather evidence for and against each option without cherry-picking toward a preferred outcome.
- [x] PROMPT_MODULES/03_STAKEHOLDER_AND_CONSEQUENCE_MAPPING.md -- Stakeholder & Consequence Mapping: Identify everyone affected by the decision and map first- and second-order consequences, including distributional effects that fall unevenly on different stakeholders.
- [x] PROMPT_MODULES/04_ASSUMPTION_AND_BIAS_AUDIT.md -- Assumption & Bias Audit: Surface unexamined assumptions underlying each option and check explicitly for known decision biases: anchoring, availability, overconfidence, confirmation bias, sunk-cost reasoning, groupthink, status-quo bias, and motivated reasoning.
- [x] PROMPT_MODULES/05_UNCERTAINTY_AND_RISK_ASSESSMENT.md -- Uncertainty & Risk Assessment: Attach calibrated confidence to the key uncertain facts the decision depends on, and identify what new information would be significant enough to change the decision.
- [x] PROMPT_MODULES/06_COMPARATIVE_EVALUATION.md -- Comparative Evaluation: Compare the real options against explicit, stated criteria and weights -- not an unstated gut feeling dressed up as analysis after the fact.
- [x] PROMPT_MODULES/07_PRE_MORTEM_AND_FAILURE_MODE_ANALYSIS.md -- Pre-Mortem & Failure Mode Analysis: Imagine the chosen option has already failed a year from now, and work backward to the most plausible causes, the same way a pre-mortem surfaces risk a forward-looking risk register misses.
- [x] PROMPT_MODULES/08_DECISION_SYNTHESIS_AND_RATIONALE.md -- Decision Synthesis & Rationale Documentation: Produce the actual decision record: the option chosen, the options rejected and why, the key assumptions it depends on, the confidence level, and what would trigger a review.
- [x] PROMPT_MODULES/09_REVERSIBILITY_AND_COMMITMENT_CHECK.md -- Reversibility & Commitment Check: Assess how reversible the decision actually is and identify the smallest reversible first step, rather than committing fully where a smaller test would do.
- [x] PROMPT_MODULES/10_FINAL_DECISION_AUDIT.md -- Final Decision Audit: Before finalizing, check the whole decision record against the non-negotiable rules: no invented facts, no silently dropped contradictory evidence, no unstated assumptions, calibrated language throughout.
- [x] PROMPT_MODULES/11_POST_DECISION_REVIEW_TRIGGER.md -- Post-Decision Review Trigger: Define concretely when and how this decision gets revisited: a calendar trigger, a threshold trigger (e.g. a KPI crossing some value), or a new-evidence trigger -- not a vague intention to 'revisit later.'
## Routing and templates
- [x] PROMPT_MODULE_CATALOG.md -- routing table, written only after all modules above exist
- [x] PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md -- combines modules into common end-to-end task templates
## EVALUATION/
- [x] EVALUATION/OUTPUT_SCHEMAS.md -- structured output schemas for this domain's key objects (adapt TAS's Evidence/Event/Transaction/Relationship/Claim pattern to what this domain actually produces)
- [x] EVALUATION/PROMPT_QA_RUBRIC.md -- adapt TAS's rubric dimensions to this domain
- [x] EVALUATION/ADVERSARIAL_TEST_SUITE.md -- regression test cases with adversarial traps specific to this domain's failure modes

Not planned initially: VISUAL_STANDARDS/ (don't build it).

The "non-negotiable rules" lines 8 and 22 name are, in the built Standard, its classification requirements (§5), stage disciplines (§7–§13, §15) and completion standard (§18), the set Standard §14 and Module 10 audit against; it holds no list under that name (CODE_REVIEW_DAS_2026-09-26 F2).
