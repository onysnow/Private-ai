# Module 08 — Decision Synthesis & Rationale Documentation

*Part of Decision Authority System (DAS).*

## Use when

At the moment the decision is actually made — writing the record before the outcome is known.

## Prompt

```text
OBJECTIVE
Produce the actual decision record: the option chosen, the options rejected and why, the key assumptions it depends on, the confidence level, and what would trigger a review. Write it now, before the outcome exists.

AUTHORIZED INPUTS
Framing record: [MODULE 01]
Option list and evidence table: [MODULE 02]
Stakeholder register and consequence map: [MODULE 03]
Assumption table and bias-check finding list: [MODULE 04]
Sensitivity-ranked uncertainty table: [MODULE 05]
Weighted comparison and recommendation: [MODULE 06]
Pre-mortem finding: [MODULE 07]

RULES
1. Write this record before the outcome is known. If any outcome information already exists at the time of writing, state that explicitly as a limitation on this record's independence — do not silently incorporate it into the stated rationale.
2. Include the classification, option set, stakeholder map, assumptions and falsifiers, bias-audit result, sensitivity table, pre-mortem finding, and weighted comparison/recommendation by reference to their record IDs — do not re-derive or re-argue them here.
3. State the option chosen, and state each materially considered option that was rejected, with the specific reason it lost — not merely "we went with option A instead." A record that names only the winner has not documented the actual decision, only its conclusion.
4. Name the decision owner: the specific person or role accountable for this decision (per Module 01's real-decision-maker finding).
5. For a Type 2 decision, state the reversal trigger — the specific observed result that would cause walking back through the door — and name who is watching for it, consistent with Module 11's review-trigger requirement.
6. For a Type 1 decision, state what deliberation or consultation actually occurred before the decision was made, and who is accountable for it.
7. State the confidence level in the recommendation itself, using the calibrated vocabulary, with its basis stated — not merely restating the confidence of individual assumptions.
8. State the decision in a form specific enough that a later reader can determine, without asking the original decision-maker, whether it happened as recorded.
9. Do not write this record in a way that reads as advocacy for a decision already made rather than as documentation of one actually reasoned through — if a rejected option was genuinely competitive, its rejection reason should be stated honestly, not minimized to make the chosen option look like the obvious answer in hindsight.
10. Do not include outcome information in this record. The outcome record is separate, written later, and only linked back to this one.
11. Short form, for a Chaotic-domain stabilizing action only (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §5.2): record the action taken, why it could not wait, the owner (rule 4), the review trigger (Module 11), the follow-on decision it hands to the pipeline (by decision ID), and the outcome-information leakage check. Rules 2, 3, 5–7 and 9 apply to the follow-on decision's full record, not to this one; rules 1, 4, 8 and 10 apply here.

OUTPUT
A. Decision record
| Field | Value |
| Decision ID | |
| Decision statement | |
| Date decided | |
| Owner | |
| Classification (Type, domain) | |
| Options considered (IDs) | |
| Chosen option & basis (ref. Module 06) | |
| Rejected options & specific reason each lost | |
| Stakeholder records (IDs) | |
| Assumptions & falsifiers (IDs) | |
| Bias-audit findings (IDs) | |
| Sensitivity/uncertainty records (IDs) | |
| Pre-mortem findings (IDs) | |
| Weighted comparison (comparison ID, criterion IDs) | |
| Confidence in recommendation (calibrated term + basis) | |
| Reversal trigger & watcher (Type 2) / deliberation & accountable party (Type 1) | |
| Outcome-information leakage check | |
| Record form (FULL / SHORT — rule 11) and, for SHORT, the follow-on decision ID | |
| Chosen probe IDs (Module 06 rule 10, where any) | |
| Constraint IDs (Module 02) | |
| Reversibility revision note (written by Module 09 rule 9 where its type differs from Module 01's) | |
| Review trigger IDs (entered from Module 11's records; at least one before the record is complete, Standard §18) | |

Keep this record and any future outcome record as two separate, linked documents — never collapse them into one.
```
