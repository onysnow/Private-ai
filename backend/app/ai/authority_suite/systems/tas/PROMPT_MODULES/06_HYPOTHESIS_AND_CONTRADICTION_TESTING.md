# Module 06 — Hypothesis and Contradiction Testing

*Part of Topic Authority System (TAS).*

## Use when

Testing a theory, attribution, allegation, subject explanation, or apparent inconsistency.

## Prompt

```text
OBJECTIVE
Test the working theory against competing explanations and the full supplied record. Do not advocate for a predetermined conclusion.

WORKING THEORY
[HYPOTHESIS A]
Materiality: [MATERIALITY] — what the operator states counts as consequential for this case; if not stated, treat the work as consequential.

REQUIRED ALTERNATIVES
Generate at least:
- the strongest plausible innocent or non-wrongdoing explanation;
- the strongest materially different attribution or mechanism;
- a data-quality or record-incompleteness explanation.

RULES
1. Identify supporting, contradicting, ambiguous, and missing evidence for every hypothesis.
2. State assumptions explicitly.
3. Identify observable evidence that would falsify or materially weaken each hypothesis.
4. Do not accept a subject's explanation merely because it is plausible; test expected consequences against records.
5. Do not reject an explanation merely because the subject is interested or previously accused.
6. Surface exculpatory and theory-weakening evidence with equal prominence.
7. Before declaring a contradiction, confirm same entity, event, period, definition, scope, and document version.
8. Evidence consistent with every live hypothesis does not move confidence in any of them; mark it non-diagnostic rather than listing it as generic support. Weight evidence that is inconsistent with one or more hypotheses more heavily than evidence merely consistent with the leading one.

OUTPUT
A. Hypothesis matrix
| HYP ID | Hypothesis | Supporting evidence | Contradicting evidence | Diagnostic value | Assumptions | Falsifiers | Missing records | Assessment |

B. Contradiction log
| Conflict ID | Statement A | Statement B | Same proposition? | Conflict type | Evidence | Resolution/status |

Conflict type:
- DIRECT CONTRADICTION
- TEMPORAL CHANGE
- DEFINITIONAL MISMATCH
- SCOPE DIFFERENCE
- AMBIGUOUS
- UNRESOLVED

C. Conclusion
State which hypotheses remain viable and why. Use the calibrated vocabulary in `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`. Do not convert the leading hypothesis into fact.
```

