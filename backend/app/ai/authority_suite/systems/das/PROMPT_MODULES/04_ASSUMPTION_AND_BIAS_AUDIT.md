# Module 04 — Assumption & Bias Audit

*Part of Decision Authority System (DAS).*

## Use when

Once a leading option (or a short list) exists and the stakeholder/consequence map (Module 03) is complete, before committing to it.

## Prompt

```text
OBJECTIVE
State the assumptions the leading option's success depends on, what would falsify each, and reason from a genuine reference class where one exists. Then check the reasoning behind the leading option for specific, named cognitive and social biases. Do not accept "no bias found" without evidence for each check.

INPUTS
Leading option(s): [FROM MODULE 02]
Consequence map: [FROM MODULE 03]
Case-specific plan or estimate being relied on: [DESCRIPTION]

RULES — ASSUMPTIONS AND BASE RATES
1. List every assumption the leading option's success depends on — factual, causal, and about other parties' future behavior.
2. For each assumption, state what evidence — obtainable now or before the decision must be made — would prove it wrong (Standard §4.5).
3. Distinguish an assumption (unverified but checkable) from a genuine unknown (cannot currently be resolved either way, by anyone, before the decision must be made).
4. Identify whether a real reference class exists per `CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md`. State the base rate if one exists (e.g., "X of Y comparable projects finished on time").
5. Do not manufacture a reference class that doesn't genuinely exist. If none is available, state that plainly rather than substituting an intuited number dressed up as one.
6. If the inside-view estimate is more optimistic than the base rate, name the gap explicitly and require a stated, specific reason this case is actually different — not a general assertion that "this time is different." This is the signature of the planning fallacy: near-best-case scenarios built for this specific plan while similar plans' actual historical performance is ignored [DS-06, DS-07].

RULES — BIAS AUDIT
7. Anchoring: check whether the current estimate or target looks tied to an initial number (a first quote, a prior year's figure, a competitor's figure) rather than an independently built one [DS-08, DS-09]. Where it is, record an independently derived range as the mitigation, and Module 06 scores from that range, not the anchored figure.
8. Availability: check whether a stated risk or likelihood is shaped by a vivid, recent, or easily-recalled case rather than the actual base rate established above [DS-08, DS-09].
9. Overconfidence / planning fallacy: check whether the stated confidence exceeds what the assumption and base-rate evidence actually supports [DS-06, DS-08].
10. Confirmation bias: check whether evidence against the leading option was actively sought (Module 02, Rule 8), or only evidence consistent with it was gathered [DS-11].
11. Sunk-cost reasoning: check whether a past investment is being used to justify continuing without a stated forward-looking mechanism for why it changes the payoff of continuing versus stopping (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §2.6) [DS-20].
12. Groupthink / social-proof pressure: check whether dissent was actually invited — a named dissenting view sought or an outside check performed — or whether the option converged without either [DS-10]. Cross-check against any unconsulted conflicting-interest stakeholder flagged in Module 03.
13. Status-quo bias: check whether the default/status-quo option is being favored (or penalized) simply for being the default, independent of its actual merits on the criteria that will be used in Module 06 [DS-21].
14. For each bias check, state PRESENT, NOT PRESENT, or UNCLEAR with the specific evidence for that call. Do not mark a bias NOT PRESENT solely because no one happened to raise it — state what was actually checked.
15. Attain distance: now that assumptions and a leading option are concrete, would a successor picking this up fresh, with no attachment to work already done, choose the same option? State the answer and why.
16. Motivated reasoning: check whether a preferred conclusion steered the reasoning — evidence and assumptions favoring the leading option accepted on weaker support than those against it, or a justification built after the option was already favored [PS-0219]. State the finding under rule 14, like the other bias checks.

OUTPUT
A. Assumption table
| Assumption ID | Assumption | Type (assumption / genuine unknown) | Falsifier | Evidence obtainable before decision | Status (untested / tested-holds / tested-fails) |

B. Base-rate note
State the reference class used (or "none genuinely available" and why not); the base rate or outcome distribution; the inside-view estimate; the gap between the two; and the specific stated reason for any divergence, or "no reason given" if none was offered.

C. Bias-check finding list
| Finding ID | Bias | Finding (PRESENT / NOT PRESENT / UNCLEAR) | Evidence | Effect on the decision if present | Mitigation if present |

D. Distance-check note
2–4 sentences: the successor/outside-advisor read, now that the option is concrete.
```
