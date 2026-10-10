# Module 03 — Stakeholder & Consequence Mapping

*Part of Decision Authority System (DAS).*

## Use when

After the option set exists (Module 02), before assumptions are audited or options are compared. Run in full for any Type 1 decision or any decision with more than one materially affected group; a lightweight version (stakeholder list only, no full consequence map) is acceptable for a Type 2, Simple/Clear decision affecting only the decision-maker. A lightweight pass on such a decision (template T02) may skip this module, listing it as skipped in the record (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §18).

## Prompt

```text
OBJECTIVE
Identify everyone affected by the decision, including people not in the room, and map first- and second-order consequences for each surviving option — including consequences that fall unevenly across different stakeholders.

INPUTS
Decision statement and classification: [FROM MODULE 01]
Option list: [FROM MODULE 02]

RULES
1. List every stakeholder group affected by the decision, not only the people making it or present in the discussion. Explicitly consider: end users or customers, employees not in the room, third parties (vendors, partners, regulators), future occupants of a role or situation this decision shapes, and anyone bearing a cost without a corresponding say.
2. Identify any stakeholder group whose interests conflict with the decision-maker's own. Do not let the decision-maker's own framing of "who matters here" be the final word on who gets listed — a stakeholder list built by starting from the preferred option and asking "who would object" is backwards and systematically under-lists people with no natural voice in the process.
3. For each option, state its first-order consequences: the direct, intended effects on each stakeholder group.
4. For each option, state its second-order consequences: what happens as a result of the first-order effects, especially via other people's or systems' reactions to them (a price change's first-order effect is revenue; its second-order effect may be a competitor's response, a customer segment's churn, or a sales team's incentive distortion). Do not stop at first order for a Type 1 or Complex-domain decision, or for the follow-on decision of a Chaotic one (Module 01).
5. State distributional effects explicitly: where a decision's aggregate expected value looks positive but its costs and benefits land very unevenly across stakeholder groups, state the distribution, not only the average or total.
6. Distinguish a consequence that is documented or highly likely from one that is speculative — use the calibrated vocabulary in `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` for each.
7. Flag explicitly if a materially affected stakeholder group was not consulted and has no practical way to make their position known before the decision is made. This is not automatically disqualifying, but it must be stated, not silently absorbed into "stakeholders were considered."
8. Do not let a sympathetic stakeholder's needs crowd out an unsympathetic or low-status stakeholder's real, material interest. Both belong in the map on the same terms.

OUTPUT
A. Stakeholder register
| Stakeholder ID | Stakeholder group | Consulted? (yes/no) | Interest (aligned / conflicting / mixed) with decision-maker | Voice in process (direct / indirect / none) |

B. Consequence map
| Consequence ID(s) (one per order) | Option ID | Stakeholder ID | First-order consequence | Second-order consequence | Distributional note | Confidence (calibrated term) |

C. Unconsulted-conflicting-interest flag
State explicitly whether any stakeholder with a conflicting interest was not consulted and had no practical voice in the process. If none, state that plainly rather than leaving the section blank.
```
