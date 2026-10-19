# Module 09 — Argument Synthesis & Verdict

*Part of Logic Authority System (LAS) — v0.1.*

## Use when

After Modules 01–08 have all run (Module 07 may be marked not-performed if no other statements were available). Produces the composite verdict and the written deliverable.

## Prompt

```text
OBJECTIVE
Synthesize all prior findings into a composite verdict on the argument's validity, soundness, and quality, using the universal intellectual standards (clarity, accuracy, precision, relevance, depth, breadth, logic, significance, fairness) and the calibrated confidence vocabulary in CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md, and write the deliverable — with an explicit verdict, not just a quality description.

ALL PRIOR MODULE OUTPUTS
[FROM MODULES 01-08]

RULES
1. Score or characterize the argument against each standard: Clarity (free of vague-but-consistent terms flagged in Module 05), Accuracy (do the premises check out per Module 03), Precision (is the conclusion's scope matched to what the premises support, per Module 02), Relevance (does each premise actually bear on the conclusion, or is one a red herring per Module 04), Depth (does the argument engage the strongest opposing case from Module 06), Breadth (does it consider other relevant viewpoints), Logic (validity/strength from Module 02, confirmed fallacies from Module 04), Significance (does the argument focus on what actually matters to the conclusion), Fairness (is the treatment of the topic and any opposing view even-handed, per Module 08's rhetoric findings, and is the source consistent with itself per Module 07).
2. Render an explicit verdict using the composite verdict scale (rule 8) — not a single averaged number that hides which standards were actually met and which weren't, and not a bare quality description without a stated verdict.
3. Carry forward, explicitly, in the written deliverable: the validity/strength verdict, every CONFIRMED fallacy (named and located, not just alluded to), any unresolved UNVERIFIED/CONTESTED premises, every REFUTED or USER-STIPULATED premise, the crux identified in Module 06's counterargument stress-test, and any DIRECT CONTRADICTION from Module 07.
4. State plainly what the analysis does and doesn't establish: a clean pass on validity and fallacy checks means the reasoning holds *if the premises are true* — it does not itself establish the premises are true. Equally, an invalid argument, a CONFIRMED fallacy or a REFUTED premise means the argument fails to support its conclusion — never that the conclusion is false (CORE/LAS_PROMPT_ENGINEERING_STANDARD.md Rule 14).
5. State the verdict's own confidence using the calibrated vocabulary, distinguishing confidence in the *structural* findings (validity, fallacy status) from anything about the conclusion's truth (CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md).
6. Where the argument fails on a specific standard, say which one and why, rather than a generic "this argument is weak."
7. Carry Module 05's equivocation findings into the validity verdict: a CONFIRMED equivocation on a key term makes the inference it crosses INVALID (or unsupported, for a non-deductive line) even where Module 02 marked it VALID or strong, and the synthesis states the corrected verdict and why (CORE/LAS_PROMPT_ENGINEERING_STANDARD.md Rule 11). A CANDIDATE equivocation, or an ambiguous term Module 05 records with no shown shift, leaves that inference's verdict not assessable until the term is pinned down: it is recorded UNKNOWN (EVALUATION/OUTPUT_SCHEMAS.md null rules) with the term named, never INVALID on that ground.
8. The composite verdict scale — one value per argument: SUPPORTED (every line valid or strong, no CONFIRMED fallacy the conclusion depends on, every load-bearing empirical premise VERIFIED); SUPPORTED IF PREMISES HOLD (the same, with at least one load-bearing premise UNVERIFIED, CONTESTED or USER-STIPULATED); PARTLY SUPPORTED (the premises support a narrower conclusion than the one stated, Rule 10, or one line of several holds); NOT SUPPORTED (every line INVALID, weak or unsupported, a CONFIRMED fallacy the conclusion depends on, or a REFUTED load-bearing premise — never that the conclusion is false, Rule 14); NOT ASSESSABLE (a verdict turns on a term not yet pinned down, Rule 11, or no premises were offered, Module 01 rule 7). The confidence fields state how confident the evaluator is in the value chosen.

OUTPUT
A. Standards assessment
| Standard | Assessment | Basis (reference prior module) |

B. Verdict id (VER-####) and composite verdict (one value of the composite verdict scale, rule 8), with its Confidence (LOW / MEDIUM / HIGH), Confidence term (the five-term value) and Confidence basis (CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md rule 3)
C. Written synthesis for the requester, carrying forward validity/strength, confirmed fallacies, unresolved premises, the crux, and any consistency findings
```
