# Prompt Module Catalog

*Part of Logic Authority System (LAS) — v0.1.*

Ten single-purpose, composed modules, in the same spirit as TAS's, DAS's, and RAS's catalogs.

| # | Module | Primary job | Main output |
|---|---|---|---|
| 01 | Argument Reconstruction | Extract conclusion, stated premises, and unstated (enthymematic) premises, steelmanned into the argument's strongest form | Reconstructed argument record |
| 02 | Validity Check | Test whether the conclusion follows from the premises — deductive validity, or inductive/abductive strength | Validity or strength verdict |
| 03 | Soundness Check | Flag which premises are verified, contested, or unverified — deferring to TAS/RAS evidence standards rather than adjudicating truth here | Premise status table |
| 04 | Fallacy Detection | Screen against the named formal and informal fallacy taxonomy as flagged candidates, resolved against argumentation-scheme critical questions before confirming | Fallacy finding list (CANDIDATE / CONFIRMED / DISMISSED) |
| 05 | Hidden Premise / Assumption Surfacing | Surface unstated assumptions doing real work and equivocal key terms | Hidden-premise and equivocation findings |
| 06 | Counterargument & Steelman Stress-Test | Construct the strongest opposing argument and check whether the (already-steelmanned) original survives it | Counterargument, crux, and survival verdict |
| 07 | Consistency Check | Check the argument's consistency with other claims/arguments from the same source, distinguishing genuine contradiction from a scoped change of position | Consistency finding table |
| 08 | Rhetorical vs. Logical Force Separation | Identify persuasive techniques distinct from logical content | Rhetoric/logic separation table |
| 09 | Argument Synthesis & Verdict | Apply the universal intellectual standards and render an explicit, calibrated verdict | Composite verdict |
| 10 | Final Logic Audit | Fresh-context audit against the full record and three non-negotiable checks — a separate pass, independent only when a different model or a person runs it | Integrity verdict |

## Routing rules

- Do not skip Module 01. A fallacy, validity, or consistency check run against an un-reconstructed argument is checking the prose, not the reasoning.
- Module 02 (validity/strength) and Module 04 (fallacy screen) are independent checks and both run regardless of each other's result — an argument can be formally valid and still commit an informal fallacy (a valid argument built on an ad hominem premise), or fallacy-free and still invalid. Module 04 runs after Module 02, because its rule 8 records Module 02's formal fallacies, and after Module 03, because its rule 4 reads Module 03's premise statuses.
- Module 04's scheme-critical-questions step must run before confirming any candidate that resembles an appeal to authority, an analogy, or a causal claim as an actual fallacy — this is the over-flagging guard, folded into Module 04 rather than given a separate module, since `BUILD_PLAN.md` lists exactly ten modules and this check is inseparable from responsible fallacy screening.
- Module 06 (counterargument stress-test) is distinct from the steelmanning Module 01 already performs on the original argument — do not re-run Module 01's job inside Module 06; start from its output and construct the opposing case.
- Module 07 (consistency check) requires other statements from the same source as an input. Where none are available, it is marked not-performed rather than skipped silently, and the final audit (Module 10) treats this as a scope limitation, not a defect.
- Module 07 should run before Module 09's synthesis whenever other statements from the source are available and material — evaluating the argument in total isolation when a documented contradiction exists elsewhere in the source's record risks an incomplete fairness/accuracy assessment.
- Module 08 (rhetoric vs. logic) should run after Module 04, so it can check whether an identified persuasive technique corresponds to an already-confirmed fallacy rather than duplicating that work independently.
- Module 10 should run in a fresh context, apart from whatever produced the analysis, for the same reason every sibling system's final audit does. A fresh context of the same model is a separate pass, not an independent one; independence needs a different model or a person.
- A short, low-stakes argument (a single-sentence claim with an obvious, uncontested inference) does not need the full ten-module pipeline; a consequential argument — a policy case, a legal brief's reasoning, a published op-ed being fact-checked for logic rather than facts — does.

## Open questions

- Whether LAS needs a distinct overlay for evaluating an AI system's own chain-of-reasoning output specifically (as opposed to a human-authored argument), given that models can produce fluent invalid inferences at volume in a way no single human author does. Not resolved here.
- Whether the argumentation-scheme critical-questions library folded into Module 04 should be expanded beyond the five base schemes (expert opinion, analogy, cause-to-effect, sign, practical reasoning) — Walton's own catalog is considerably larger. Deferred to a future revision once the base five have been used.
- Whether Module 07's consistency check should eventually support checking a source against itself across a long time span (a public figure's full recorded history) as a distinct, larger-scope task from checking it against a handful of named other statements — not attempted in this v0.1.
