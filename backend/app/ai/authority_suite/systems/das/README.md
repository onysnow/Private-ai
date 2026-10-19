# Decision Authority System (DAS)

**v0.1 — first content pass: standard, all eleven modules, schemas, evaluation materials, and templates**

DAS is a standalone, decision-quality prompt-engineering methodology — a sibling to [Topic Authority System](https://github.com/onysnow/topic-authority-system) (TAS), Research Authority System (RAS), and Logic Authority System (LAS), not a part or subset of any of them.

- **TAS** governs whether a *claim* is true, given case evidence.
- **RAS** governs whether a *body of research* has been searched and weighed honestly.
- **LAS** governs whether an *argument* holds together — does the conclusion follow from the premises, free of fallacy.
- **DAS** governs whether a *decision* was made well — a question about the quality of the process at the time it was made, not about the truth of a claim, the completeness of a literature, or the validity of an argument.

They run parallel, not sequential, and they compose. A task can use TAS or RAS to establish the facts a decision depends on, LAS to check that the reasoning connecting those facts to a conclusion actually holds, and DAS to structure or audit the decision itself. None substitutes for another, and DAS's own bias-audit module cites decision-specific literature (sunk cost, anchoring, groupthink) while cross-referencing RAS's and LAS's overlapping citations rather than re-deriving them.


Three further systems were added on 2026-10-10 (DIR-0043), and DAS's job ends where each begins. Computing the figures a decision rests on, and testing whether a pattern in data is a cause, is the job of QAS (Quantitative Analysis System). Obtaining the records, testimony or online material a decision needs is the job of EGS (Evidence Gathering System). The public-interest and harm judgement behind a decision to publish is the job of EHS (Ethics and Harm System); DAS can structure such a decision, and the decision stays with the person who owns it.

## Why this exists

A good decision can produce a bad outcome, and a careless one can get lucky — genuine uncertainty guarantees this. Judging a decision by how it turned out rather than by the quality of the reasoning available at the time it was made is a well-documented failure mode, sometimes called "resulting." DAS's central discipline is keeping those two things separate: the decision record (what was reasoned, before the outcome was known) and the outcome record (what actually happened, documented later and only linked back). TAS's central failure mode is treating an unproven claim as fact; DAS's is treating a lucky or unlucky outcome as a verdict on the process — a different discipline problem, requiring different rules, not a variant of the evidence problem.

DAS draws on established decision science rather than inventing it — Bezos's reversibility framework, the Cynefin problem-domain model, Klein's pre-mortem technique and naturalistic decision-making research, Kahneman and Tversky's bias literature, Keeney and Raiffa's multi-attribute utility theory, Freeman's stakeholder theory, and related work — the same approach TAS took with evidence law and intelligence tradecraft.

## Structure

- `CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` — the central standard: design principles, the decision ontology, classification requirements, the eleven-stage pipeline, the stage disciplines, and the completion standard every module operates under.
- `CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md` — a tier system (A–F) for weighing evidence, precedent, and expert judgment by how comparable it actually is to the decision in front of you, not by how confidently it's cited.
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` — the shared seven-term vocabulary (Almost certain / Very likely / Likely / Roughly even chance / Unlikely / Very unlikely / Almost no chance) with ICD 203's probability bands, adapted from ICD 203, with worked examples in a decision context.
- `CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md` — the four-layer template (project instructions / active guidance / task materials / verification archive) adapted to decision work.
- `PROMPT_MODULE_CATALOG.md` — the eleven-module pipeline and routing rules.
- `PROMPT_MODULES/` — all eleven modules: framing, option generation and evidence gathering, stakeholder and consequence mapping, assumption and bias audit, uncertainty and risk assessment, comparative evaluation, pre-mortem and failure-mode analysis, decision synthesis and rationale documentation, reversibility and commitment check, final decision audit, and post-decision review triggers.
- `EVALUATION/OUTPUT_SCHEMAS.md` — record formats for every module's output, including the decision record and the outcome record, kept as two separate, linked schemas.
- `EVALUATION/PROMPT_QA_RUBRIC.md` and `ADVERSARIAL_TEST_SUITE.md` — a scored rubric and 32 adversarial test cases (D01–D32) plus a regression gate, targeting sunk-cost elimination, flattering pre-mortems, decision-record advocacy, false irreversibility claims, and ignored conflicting-interest stakeholders specifically.
- `PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md` — 11 composed templates (T00–T10): a router, a full pipeline, a lightweight pass, and targeted templates for Modules 03, 04 and 06–11 (none targets Module 02 or 05 alone).
- `SOURCE_INDEX.md` — every source cited across the CORE files and modules, checked via live search before citing.
- `CHANGELOG.md` and `LICENSE` (Creative Commons Attribution 4.0 International).

## Core rules (summary — full text in `CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §2, §5 and §7–§18)

- Judge a decision by the quality of its process at the time it was made, not by how it turned out.
- Classify the decision — reversibility (Type 1/Type 2) and problem domain (Cynefin) — before choosing how much process it warrants.
- Distinguish the real decision from any proxy question substituted for it.
- Require genuinely distinct options, including status quo and sequenced options where real.
- Identify every stakeholder, including groups whose interests conflict with the decision-maker's own.
- State the assumptions the leading option depends on, and what would falsify each, before treating them as settled.
- Check explicitly for named decision biases — anchoring, availability, overconfidence, confirmation bias, sunk cost, groupthink, status-quo bias, motivated reasoning — as a distinct step, never asserted clean by default.
- Attach calibrated confidence to key uncertain facts, and state what new information would change the recommendation.
- Compare real options against explicit, weighted criteria stated before scoring.
- Require a pre-mortem with at least one genuinely damaging failure mode before committing.
- No false precision: any confidence, cost, or expected-value figure states its basis and range.
- Name the decision owner and a concrete review trigger — calendar, threshold, or new-evidence — never a vague intention to revisit later.
- Keep the decision record and the outcome record separate, always.

## Status

v0.1 content pass complete: the standard, evidence/precedent policy, calibrated-confidence file, project-instructions template, all eleven modules, the module catalog, output schemas, QA rubric, adversarial test suite, and integrated template library are drafted, matching TAS's structure and depth. Drafted in a cloud sandbox using the live TAS repository as a structural reference, then committed and pushed to the `decision-authority-system` repository from Ony's device (`BUILD_LOG.md`, 2026-09-20).
