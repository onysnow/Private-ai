# Module 06 — Comparative Evaluation

*Part of Decision Authority System (DAS).*

## Use when

After the option set (Module 02), stakeholder/consequence map (Module 03), assumption/bias audit (Module 04), and uncertainty assessment (Module 05) are complete — producing the actual comparison and recommendation.

## Prompt

```text
OBJECTIVE
Compare the real options against explicit, stated criteria and weights — not an unstated gut feeling dressed up as analysis after the fact.

INPUTS
Surviving options: [FROM MODULE 02, INFORMED BY MODULES 03–05]
Consequence map: [FROM MODULE 03]
Sensitivity-ranked uncertainty table: [FROM MODULE 05]

RULES
1. State the criteria the decision will be judged on before scoring any option against them (e.g., cost, time-to-value, reversibility, strategic fit, stakeholder impact, downside risk). Criteria selected after seeing which option they favor is a justification exercise, not evaluation.
2. State each criterion's weight and the specific basis for that weight — why it matters more or less than the others in this decision. An unweighted pros/cons list is not sufficient for a Type 1 or Complex-domain decision, or for the follow-on decision of a Chaotic one (Module 01).
3. Include at least one criterion drawn directly from the stakeholder/consequence map (Module 03) — a comparison that ignores distributional or second-order effects already identified is not using its own prior work.
4. Before scoring, state one scale for every score (for example 0–10, 0 the worst and 10 the best plausible level of that criterion across the options); the weighted total is the sum of weight × score on it. Score each surviving option against each criterion, with the basis for the score stated alongside the number — a score with no stated basis is false precision.
5. State each option's expected value with its basis type: REFERENCE_CLASS — from the reference class and base rate in Module 04's assumption records; INSIDE_VIEW — from the inside-view estimates in those records, where no genuine reference class exists, labelled as inside-view and given a wider range; or NONE — no defensible estimate, stated as such, with the range left null and the comparison resting on the weighted scores and worst cases (rule 6). Never manufacture a base rate to fill the REFERENCE_CLASS type (Module 04 rule 5). State a range and its basis; do not state a single invented figure.
6. State each option's worst case — its own lowest plausible outcome, informed by Module 05's worst-case note — and, where the comparison turns on it, its maximum regret: the largest shortfall, across the plausible states of the world, between this option's outcome and the best option's outcome in the same state. The two are different measures and can favor different options; record them separately, and where expected value, worst case and regret point to different options, name the decision rule the recommendation follows and why. An option with the highest expected value but an unacceptable worst case is not automatically the right choice — say so if that's the situation.
7. Do not let sunk costs already spent on one option enter the scoring (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §2.6). Only the forward-looking payoff from this point belongs in the comparison; if a past investment does change the forward payoff (e.g., a near-complete milestone), state that specific mechanism explicitly rather than crediting the sunk cost itself.
8. Carry forward any unresolved gap from Module 04 or 05 into the relevant option's worst-case column rather than treating it as resolved by reaching this stage.
9. State the recommendation, and explicitly state what would have to be true for a different option to be the better choice. That is the trade-off actually being made — state it, don't leave it implicit.
10. For a Complex-domain decision (Module 01), compare safe-to-fail probes, not final commitments: each option is a small experiment that can run alongside others, scored on what it would reveal, what it costs, and whether its failure is survivable, with a stated signal to amplify it and a stated signal to dampen it. The recommendation is a portfolio of probes, and Module 09's smallest reversible step is the probe itself; each probe is an option of type PROBE, and the portfolio is the comparison record's recommended probe list. When every option supplied is a final commitment, do not score them: name candidate probes derived from them — each with what it would reveal, a cost ceiling, whether its failure is survivable, and a signal to amplify it and one to dampen it — and return them to Module 02 as options of type PROBE for evidence before they are scored.

OUTPUT
A. Weighted comparison
| Criterion ID | Criterion | Weight | Basis for weight | Option A: score + basis | Option B: score + basis | Option C: score + basis |

B. Expected-value, worst-case and regret table
| Option | Expected value (range + basis type + basis) | Worst case (its own lowest plausible outcome) | Maximum regret (vs the best option in each state), if used | Basis |

C. Recommendation
State the comparison ID, the recommended option, its weighted score, and what would have to be true for a different option to win instead. A and B are recorded as criterion-score records and one comparison record (`EVALUATION/OUTPUT_SCHEMAS.md`).

METHOD NOTE
This module applies multi-criteria decision analysis with explicit weighted scoring — the multi-attribute utility approach formalized by Keeney and Raiffa [DS-12], applied per the general decision-quality process in [DS-14] — rather than an invented synthesis step. Its additive form holds only with every criterion on the common scale of rule 4 and the criteria preferentially independent; where two criteria interact, say so and do not rest the recommendation on the weighted total alone. Do not substitute an unweighted or unstated scoring method.
```
