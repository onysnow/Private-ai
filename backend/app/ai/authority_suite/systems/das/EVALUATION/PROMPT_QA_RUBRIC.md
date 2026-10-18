# Decision Prompt QA Rubric

*Part of Decision Authority System (DAS).*

## Purpose

Use this rubric to evaluate a prompt and its outputs before adopting it as a project standard. Score the output a prompt actually produces, not the prompt's wording.

A verdict-vocabulary note up front: this rubric uses the same four-value PASS / PASS WITH CORRECTIONS / REVISE AND RETEST / FAIL scale TAS uses for prompt-adoption evaluation, which RAS and LAS also reuse. Module 10's Final Decision Audit uses the same PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL scale TAS's own final-audit modules use for auditing a finished deliverable. Two contexts, two vocabularies, shared across all four Authority Systems rather than invented separately by each.

## Blocking defects

Any one of these prevents a passing result:

- an invented fact, evidence item, precedent, or figure with no traceable basis in the option, evidence, or assumption tables;
- material contradictory or disconfirming evidence silently dropped between Module 02's search and later synthesis;
- an assumption load-bearing enough to appear in the scoring or the final rationale but absent from the assumption table, or present without a falsifier;
- a confidence, cost, or expected-value figure stated with no basis or range — false precision;
- a decision classified without stating why (reversibility or problem domain asserted, not justified);
- an option set built around one real option and a strawman alternative, with no genuinely distinct alternative generated;
- a stakeholder group with a conflicting interest omitted entirely, or omitted from the unconsulted-conflicting-interest flag when it was not consulted;
- a bias check marked NOT PRESENT with no stated evidence for the call (i.e., asserted clean by default rather than actually checked);
- a pre-mortem that produces only flattering, non-damaging failure modes;
- a decision record that reads as advocacy for a foregone conclusion — a rejected option minimized in hindsight with no honestly stated reason it lost;
- an irreversibility claim asserted with no stated mechanism;
- a decision record with no named owner or no review trigger, or a review trigger that cannot be checked by someone other than the original decision-maker;
- outcome information present in a decision record, or blended into a process verdict rather than kept in a separate section (resulting);
- sunk-cost reasoning used to justify continuing without a stated forward-looking mechanism.

## Scored dimensions

Score each from 0 to 3.

| Dimension | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Framing accuracy | Decision statement is the general problem area, not a bounded choice | Bounded but proxy-question risk unaddressed | Framed and proxy question checked, minor gaps | Fully bounded decision statement, real decision-maker named, proxy question explicitly checked |
| Classification rigor | Reversibility/domain absent or asserted with no rationale | One axis justified, the other asserted | Both axes justified, minor gaps | Both axes justified per-instance, process-mismatch explicitly checked |
| Option breadth | Single option or option-plus-strawman | One genuine alternative, status quo or sequencing missing without explanation | Genuine alternative plus most of status quo/sequencing present | Full option breadth per Module 02, with search-discipline note complete |
| Stakeholder and consequence discipline | Not assessed | Stakeholders listed, no consequence map | Consequence map present, distributional/second-order gaps | Full map including conflicting-interest and unconsulted flags, first- and second-order, distributional effects stated |
| Assumption and falsifier discipline | Assumptions absent or unfalsifiable | Some falsifiers present, load-bearing ones missing | Most load-bearing assumptions carry falsifiers | Every load-bearing assumption carries a falsifier and a stated base-rate disposition |
| Bias-audit rigor | Not performed or asserted clean with no evidence | Some biases checked with evidence, others skipped | All named biases checked, evidence present, minor gaps | All named biases checked with specific evidence for each call, including UNCLEAR where genuinely unclear |
| Uncertainty and sensitivity calibration | Ad hoc confidence language | Some calibrated language, inconsistent | Mostly calibrated, most sensitive items identified | Every sensitive uncertain fact carries calibrated confidence, basis, and "what would change the recommendation" |
| Comparative evaluation | Unweighted or absent | Weighted but basis unstated | Weighted with basis, minor gaps in linking to consequence map | Fully weighted, bases stated, at least one criterion linked to the consequence map |
| Pre-mortem quality | Not performed | Performed but only flattering failure modes | Includes a damaging failure mode, linkage to assumptions/bias audit weak | Ranked, includes a damaging failure mode, explicitly linked to assumptions and bias findings |
| Decision-record honesty | Advocacy for a foregone conclusion | Rejected options named but reasons generic | Rejected options and reasons mostly specific | Every rejected option carries a specific, honest reason; no outcome leakage |
| Reversibility and commitment discipline | Not checked | Checked but irreversibility claims unverified | Checked, mechanism stated for most claims | Every irreversibility claim verified or downgraded, smallest reversible step identified or explicitly ruled out |
| Review-trigger concreteness | Absent or vague ("revisit later") | One vague trigger present | Concrete trigger present, monitor or action unclear | Concrete, checkable trigger(s) with named monitor and action, linked to sensitivity/walk-back analysis |
| Output usability | Unusable | Requires major restructuring | Usable with edits | Audience-ready and schema-compliant |

Maximum score: 39.

## Rating bands

| Result | Condition |
|---|---|
| PASS | No blocking defect and score 35-39 |
| PASS WITH CORRECTIONS | No blocking defect and score 28-34 |
| REVISE AND RETEST | No blocking defect and score 20-27 |
| FAIL | Any blocking defect or score below 20 |

## Evaluation protocol

1. Define a small ground-truth test set built from decisions with a genuinely well-documented outcome and process record (e.g., a published business case study or post-mortem with enough detail to check classification, option breadth, and stakeholder impact against). Before scoring any run against it, verify the ground truth itself does not commit the resulting error — a ground truth that scores a well-reasoned decision as bad because it had a bad outcome, or a poorly-reasoned one as good because it got lucky, is the defect to fix, not the run that disagrees with it.
2. Run every case the Regression gate of `ADVERSARIAL_TEST_SUITE.md` names; a prompt is not adopted on this rubric's score while a gated case fails.
3. Run the prompt on at least one decision with genuinely thin evidence or an unresolved genuine unknown, not only decisions with a clean, well-supported answer — a rubric only tested against easy cases won't catch false precision or a hidden unstated assumption on a hard one.
4. Validate deterministic properties by code where possible: assumption records missing a falsifier, decision records missing an owner or review trigger, and internal ID consistency across module outputs.
5. Review qualitative properties independently: proxy-question blindness, flattering-only pre-mortems, decision-record advocacy, and manufactured stakeholder consensus.
6. Record model name/version, settings, prompt version, run date, input hash, output hash, score, and defects.
7. Re-run after a model or material prompt change.

## Evaluation record template

| Field | Value |
|---|---|
| Prompt/module | |
| Prompt version/hash | |
| Model/version | |
| Run date | |
| Test case | |
| Input hash | |
| Output hash | |
| Blocking defects | |
| Score | |
| Verdict | |
| Required changes | |
