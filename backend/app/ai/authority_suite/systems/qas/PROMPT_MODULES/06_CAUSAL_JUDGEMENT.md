# Module 06 — Causal Judgement

*Part of Quantitative Analysis System (QAS).*

## Use when

Any output wording states or implies that one thing causes, drives, raises,
cuts or explains another. Run it before that wording is used.

## Prompt

```text
OBJECTIVE
Decide what causal wording the analysis supports, from stated causal
assumptions, and record the reasoning. Association is the default wording.

INPUTS
- QFRM, QRIV, QPLN and QRES records

RULES
1. Check that the proposed cause comes before the effect in the data. A
   cause has to precede its effect; this rests on logic, not on Hill. If
   order cannot be shown, record that and keep association wording. (logic)
2. Write the causal assumptions as a list of arrows (A -> B) or a diagram
   covering the exposure, the outcome and every other variable considered,
   starting from the QPLN record's causal_assumptions field.
   (QS-09)
3. Choose what to adjust for from those assumptions: adjust for common causes
   of exposure and outcome; do not adjust for a variable the exposure causes,
   or for a common effect of exposure and outcome, since either can create a
   false association. Record the reason per variable. "Control for everything
   available" and selection by statistical association are not reasons.
   (QS-09)
4. Where the causal structure is uncertain, run the analysis under each
   plausible structure (Standard §9) and report each result with its assumptions. (QS-09)
5. Go through Hill's viewpoints as considerations: strength, consistency,
   specificity, temporality, biological gradient, plausibility, coherence,
   experiment, analogy. Record what each shows, including "not available".
   None is required and none settles the question; a viewpoint that is not
   met does not by itself rule cause out. (QS-08)
6. For each rival still open in the QRIV record, record whether it fits the
   facts as well as or better than cause. (QS-08, QS-06)
7. Do not use a significance test as the answer to whether the link is
   causal. (QS-08)
8. Do not move from a between-group result to a claim about what happens
   within a person. (QS-10)
9. Record unmeasured common causes that could explain the result. (logic)
10. Give a verdict: ASSOCIATION ONLY, or CAUSAL WORDING PERMITTED with its
    conditions. A permitted causal statement carries a likelihood term with
    its band (CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md). (Standard §7)
11. Wording under ASSOCIATION ONLY: "is associated with", "was higher among",
    "went with". Not: "causes", "leads to", "drives", "because of", "the
    effect of". Exaggerated causal claims from correlational work recur in
    summaries of research. (QS-20)

OUTPUT
QCAU record:
| causal_id | QCAU-NNNN | result_id |
| temporal_order_shown | yes / no / unclear |
| causal_assumptions | arrows |
| adjustment_set | variable, role, reason |
| alternative_structures | structure, result |
| hill_considerations | viewpoint, finding |
| rivals_fit | rival, fits as well? |
| unmeasured_common_causes |
| verdict | ASSOCIATION_ONLY / CAUSAL_WORDING_PERMITTED |
| conditions | likelihood_term | band | permitted_wording |
```
