# Logic Authority System (LAS)

**v0.1 — restructured to match the authoritative build plan: standard,
premise-attribution policy, calibrated-confidence and project-instructions
templates, all ten modules, module catalog, output schemas, evaluation
materials, and templates.**

LAS is a standalone, general-purpose logical-validity and fallacy-detection
prompt-engineering methodology — a sibling to
[Topic Authority System](https://github.com/onysnow/topic-authority-system)
(TAS), Decision Authority System (DAS), and Research Authority System
(RAS), not a part or subset of any of them. TAS governs whether a
specific *claim* is true, given case evidence. DAS governs whether a
*decision* was made well. RAS governs whether a *body of research* has
been searched and weighed honestly. LAS governs whether an *argument* —
anyone's, including the model's own — actually holds together: does the
conclusion follow from the premises, is it free of fallacy, is it
consistent with what its own source has argued elsewhere, and does its
persuasive force come from logic or from something wearing logic's
clothes.


Three further systems were added on 2026-10-10 (DIR-0043), and LAS's job ends where each begins. Whether a statistical result supports a premise, or whether a pattern in data is a cause, is the job of QAS (Quantitative Analysis System); LAS checks whether the conclusion follows from it. Obtaining the evidence a premise needs is the job of EGS (Evidence Gathering System). Weighing public interest against harm is the job of EHS (Ethics and Harm System): LAS marks a normative premise and does not make the value judgement.

## Why this exists

LAS is the only sibling that can meaningfully evaluate an argument without
verifying its premises' truth — validity is about structure, independent
of content. Its central failure mode is a **fluent invalid inference**: a
conclusion that reads as though it follows because the prose is confident
and well-organized, when a structural check would show the conclusion is
broader than the premises support, rests on an unstated and false
assumption, or is doing real work via a fallacy dressed in reasonable
language. Fluent prose and valid reasoning are indistinguishable from the
outside — which is exactly why the check has to be structural (reconstruct
the argument, then test it) rather than a read-through for how convincing
it sounds.

LAS draws on established logic and argumentation theory rather than
inventing a validity standard from scratch — Walton's argumentation
schemes and critical questions, Walton and Krabbe's formal-dialectics
treatment of commitment (the basis for LAS's consistency check), Toulmin's
model of argument structure, the Paul-Elder universal intellectual
standards, Tversky and Kahneman's work on reasoning fallacies, and the
standard formal/informal fallacy taxonomies from Copi/Cohen and Damer —
the same approach TAS, DAS, and RAS each took with their own grounding
disciplines.

## Structure

- `CORE/LAS_PROMPT_ENGINEERING_STANDARD.md` — the central standard: purpose
  and scope, design principles, the argument and reasoning ontology, 14
  non-negotiable rules, the seven-stage (Stage 0–6) reasoning-audit
  pipeline, and the audit protocol, matching TAS's
  `INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md` in structure and rigor.
- `CORE/PREMISE_EVIDENCE_AND_ATTRIBUTION_POLICY.md` — how to attribute a
  premise accurately to its actual source (the arguer, a cited source, or
  LAS's own reconstruction) and how much evidentiary weight it needs
  before soundness can even be assessed.
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` — the shared seven-term ICD
  203-derived vocabulary with its probability bands, reused from TAS/RAS, with worked examples
  specific to argument-structure confidence rather than investigative or
  research confidence.
- `CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md` — the four-layer deployment
  template (project instructions / active guidance / task materials /
  verification archive) adapted to logic auditing.
- `PROMPT_MODULE_CATALOG.md` — the ten-module pipeline and routing rules.
- `PROMPT_MODULES/` — all ten modules: reconstruction, validity check
  (deductive, inductive, and abductive), soundness check, fallacy
  detection (formal and informal, folding in the argumentation-scheme
  critical-questions check that resists over-flagging), hidden
  premise/assumption surfacing, counterargument & steelman stress-test,
  consistency check (new), rhetorical-vs-logical-force separation,
  argument synthesis & verdict, and a final audit in a separate pass.
- `EVALUATION/OUTPUT_SCHEMAS.md` — the formal and informal fallacy
  taxonomies, the argumentation-scheme base set, the intellectual
  standards, stable record IDs, and shared record formats.
- `EVALUATION/PROMPT_QA_RUBRIC.md` and `ADVERSARIAL_TEST_SUITE.md` — 31
  adversarial test cases (L01-L31) plus a regression gate, targeting
  over-flagging and the fallacy fallacy, disguised fallacies, straw-manning, tone-based bias, the
  conjunction fallacy, and — new in this pass — undisclosed contradiction
  across contexts and its false-positive twin, a legitimate change of
  position mistaken for one.
- `PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md` — 8 composed
  templates (T00-T07): a router, the full pipeline, a quick check, a
  targeted fallacy check, a counterargument-pair template, a scheme
  legitimacy check, a standalone consistency check, and an independent
  audit of a third-party analysis.
- `SOURCE_INDEX.md` — 8 numbered sources, LS-01 to LS-08
  (`grep -c '^| LS-0' SOURCE_INDEX.md`), each checked via live search,
  including one deliberately uncited concept (no single academic origin
  was found for steelmanning) rather than a fabricated attribution; and
  26 supporting works read on 2026-10-02 under DIR-0037, none the origin
  of a rule (`grep -c '^- PS-' SOURCE_INDEX.md`).
- `CHANGELOG.md` and `LICENSE` (Creative Commons Attribution 4.0 International).

## Non-negotiable rules (summary — full text in CORE/)

- Reconstruct the actual argument — conclusion, stated premises, and
  unstated ones it depends on — before evaluating anything.
- Separate validity (does the conclusion follow) from soundness (are the
  premises also true) — never let one stand in for the other.
- Checking premise truth is TAS's or RAS's job, not LAS's; LAS flags it.
- Screen for formal and informal fallacies as flagged candidates, resolved
  against argumentation-scheme critical questions before being confirmed —
  never as an automatic verdict.
- Steelman the original during reconstruction; construct the strongest
  opposing argument as a distinct, later step.
- Check the argument's consistency with other claims from the same source,
  distinguishing a genuine contradiction from a legitimate, scoped change
  of position.
- Separate rhetorical technique from logical content — tone proves nothing
  about validity in either direction.
- State what the premises, if true, would actually establish — no more.
- A hidden or shifting key term invalidates an argument even if every
  individual sentence reads fine in isolation.
- A failed argument does not make its conclusion false — an invalid or
  fallacious argument leaves its conclusion unsupported, not refuted.
- A clean validity/fallacy audit establishes the reasoning holds *if the
  premises are true* — it does not itself establish the premises.

## What changed from the prior draft

An earlier v0.1 draft of LAS was written with real, live-verified content
but a file structure and ten-module breakdown that didn't match the
authoritative build plan: a dedicated Argumentation Scheme Classification
module where the plan has none, no Consistency Check module at all, and
several file names that didn't match the plan's exact naming. This build
keeps the prior draft's substance — its standard, its module content, its
schemas, its 13 adversarial cases, and its source index — and remaps it
onto the plan exactly: renaming files, folding the scheme-classification
content into Module 04's fallacy screen (where the plan's own "flag as
possibilities to check" language already implied it belonged), and writing
Module 07 (Consistency Check) from scratch, including two new adversarial
cases and a new verified source (Walton & Krabbe's *Commitment in
Dialogue*, 1995) to ground it. See `CHANGELOG.md` for the full account.

## What's still open

- Whether LAS needs a distinct overlay for auditing an AI system's own
  chain-of-reasoning output, given models can produce fluent invalid
  inferences at a volume no single human author does — named as an open
  question, not resolved here.
- The argumentation-scheme critical-questions library folded into Module
  04 is a deliberate five-scheme subset of Walton's fuller catalog —
  expanding it is a future revision, not an oversight.
- Whether Module 07's consistency check should eventually support
  checking a source against a large accumulated history, not just a
  handful of named other statements — not attempted in this v0.1.

## Status

Feature-complete for a v0.1 that matches the authoritative build plan file
for file: the standard, the premise-attribution policy, the
calibrated-confidence and project-instructions templates, all ten modules
in the plan's exact order and naming, the module catalog, output schemas,
source index, QA rubric, adversarial test suite, and the integrated
template library are all drafted. `CHANGELOG.md` starts at v0.1.0 with
this pass, since this is the first pass where the repository's actual
content matches its own build plan.
