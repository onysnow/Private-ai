# Module 05 — Uncertainty & Risk Assessment

*Part of Decision Authority System (DAS).*

## Use when

After the assumption and bias audit (Module 04), before options are formally compared (Module 06). This module's job is narrower than Module 04's: it takes the assumptions and base rates already surfaced and asks specifically what would have to change to flip the decision.

## Prompt

```text
OBJECTIVE
Attach calibrated confidence to the key uncertain facts the decision depends on, and identify what new information would be significant enough to change the decision — not merely information that would be interesting to have.

INPUTS
Assumption table and base-rate note: [FROM MODULE 04]
Bias-check finding list: [FROM MODULE 04]
Leading option(s): [FROM MODULE 02]

RULES
1. From the assumption table, identify the subset of assumptions the recommendation is actually sensitive to — where a different answer would plausibly change which option is preferred, not merely change a minor detail of execution.
2. For each sensitive assumption, state a confidence level using the vocabulary in `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`, with its basis (evidence tier, base rate, or expert judgment per `CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md`) stated alongside it. Do not state a bare percentage with no basis — that is the false-precision failure this doctrine forbids.
3. For each sensitive assumption, state explicitly what new information — obtainable before or shortly after the decision — would be significant enough to change the recommended option. "More data would help" is not sufficient; state the specific finding, threshold, or event that would flip the recommendation.
4. Distinguish a genuine unknown (cannot be resolved before the decision must be made) from an assumption that could be resolved with reasonable additional effort but has not been, due to time or resource constraints. State which applies to each sensitive item, and whether the constraint is itself negotiable.
5. Where a genuine unknown cannot be resolved in time, state the value of resolving it anyway, weighed against the cost and delay of doing so — do not default to "gather more information" as though information-gathering were free. A reversible (Type 2) decision facing a genuine unknown may reasonably proceed and treat the unknown as a monitored risk rather than a blocking gap; a Type 1 decision facing the same unknown should not proceed on the same terms without stating why the risk is acceptable.
6. State the worst-case scenario for the leading option specifically attributable to a sensitive uncertain fact turning out unfavorably — distinct from the pre-mortem's broader failure-mode analysis (Module 07), which comes later and is not limited to uncertainty in stated assumptions.
7. Where more than one sensitive assumption interacts (two uncertain facts that jointly determine the outcome, rather than independently), state the interaction explicitly rather than treating each in isolation.
8. Do not let a long list of low-sensitivity uncertainties crowd out or dilute attention to the few genuinely decision-relevant ones. Rank by sensitivity, not by how easy each was to identify.

OUTPUT
A. Sensitivity-ranked uncertainty table
| Sensitivity ID | Assumption ID (from Module 04) | Sensitivity (would a different answer change the recommendation?) | Confidence (calibrated term + basis) | What would change the recommendation | Resolvable before decision? (yes / no — genuine unknown) | Disposition (resolved / monitored risk / deadline extended) | Monitored by |

B. Worst-case note
State the worst-case outcome specifically attributable to the highest-sensitivity uncertain fact(s), and whether it is acceptable given the decision's reversibility classification (Module 01).

C. Interaction note
State any material interaction between two or more sensitive uncertainties, or "none identified" if genuinely none exists.

D. Information-value note
For each genuine unknown that cannot be resolved before the decision, state whether it should be: accepted as a monitored risk with a named owner, or should instead extend the deadline to resolve it first — and why, given the decision's reversibility [DS-16].
```
