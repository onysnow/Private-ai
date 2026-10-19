# Module 08 — Rhetorical vs. Logical Force Separation

*Part of Logic Authority System (LAS) — v0.1.*

## Use when

After the fallacy screen and consistency check (Modules 04, 07) and every module before them — its input is all of their findings. Isolates persuasive technique from logical substance so a well-written but logically weak argument doesn't get credited as strong, and a plainly or awkwardly written but logically strong argument doesn't get discounted.

## Prompt

```text
OBJECTIVE
Identify persuasive techniques present in the argument's presentation, and state explicitly whether each coincides with a genuine logical defect already flagged or is rhetorically separate from the argument's actual validity — so the argument's persuasive force is never credited or debited to its logical force.

ARGUMENT AND PRIOR FINDINGS
[FROM MODULES 01-07]

RULES
1. Identify techniques such as: loaded or emotionally charged language, false urgency, false balance (presenting a settled or lopsided matter as evenly contested), confident or highly credentialed-sounding tone unsupported by the actual certainty of the claims, and repetition used to substitute for support.
2. For each technique identified, state whether it corresponds to an actual fallacy already CONFIRMED in Module 04 (e.g., loaded language framing a policy choice as the only reasonable option may itself be a false dilemma) or is rhetorically separate from the logical content (a valid argument delivered in an inflammatory tone is still valid; an invalid one delivered calmly is still invalid).
3. Do not let a measured, calm, "reasonable-sounding" tone substitute for an actual validity or soundness finding — tone is not evidence of logical quality in either direction. A fluent, confident presentation of an invalid inference is exactly the failure mode this module exists to catch (CORE/LAS_PROMPT_ENGINEERING_STANDARD.md §12 and Rule 9; test L01, fluent invalid inference).
4. Do not penalize an argument's logical assessment for rhetorical flourishes that don't affect the actual inference — note them as a separate, non-logical observation.
5. Where a rhetorical technique appears in one of the two arguments compared in Module 06 (original vs. counterargument) but not the other, note this explicitly and state that the difference in tone or delivery style has no bearing on which argument's crux actually prevails.

OUTPUT
| Technique identified | Passage | Corresponds to a logical defect already confirmed? (FAL-####, or none) | Note |
```
