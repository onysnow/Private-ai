# Module 09 — Reversibility & Commitment Check

*Part of Decision Authority System (DAS).*

## Use when

After the decision record exists (Module 08), before it is executed. This module deliberately runs after synthesis, not before: the true reversibility of the specific committed plan can differ from the reversibility of the general option classified back in Module 01, and only a concrete plan can be checked for a genuinely smaller first step.

## Prompt

```text
OBJECTIVE
Assess how reversible the decision actually is now that a specific plan exists, and identify the smallest reversible first step, rather than committing fully where a smaller test would do.

INPUTS
Decision record: [FROM MODULE 08]
Pre-mortem finding: [FROM MODULE 07]

RULES
1. Restate the reversibility classification from Module 01, then check it specifically against the committed plan, not the general option. A general option can be Type 2 (reversible) while the specific plan chosen to execute it locks in irreversible commitments early (e.g., signing a multi-year contract in month one instead of piloting first) — if so, flag the mismatch.
2. Any claim that the decision is irreversible ("we can't walk this back") must itself be checked, not simply asserted. State the specific mechanism that makes it irreversible (a contractual term, a public commitment, a physical or technical constraint, an relationship cost) — a claimed one-way door with no stated mechanism is treated as unverified, not as established.
3. Where an irreversibility claim does not survive this check, state the actual walk-back cost (time, money, relationship, reputation) rather than treating the decision as a true one-way door. Then classify by `CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §5.1's test, whether that cost is acceptable to the decision-maker: reversible at acceptable cost is Type 2; reversible only at a cost the decision-maker would not accept is difficult to reverse, and stays Type 1. "Not impossible" is not the test.
4. Identify the smallest reversible first step that would resolve the single most significant sensitivity identified in Module 05, or the most significant unaddressed gap from Module 07's pre-mortem, before committing the full plan. State specifically what this step would prove or disprove, and what it costs relative to full commitment.
5. Where no smaller reversible step is genuinely available (a true Type 1 decision with no staged option), state that explicitly rather than manufacturing an artificial "pilot" that doesn't actually reduce commitment.
6. Where a smaller step is available but was rejected in favor of full commitment, require a stated reason (e.g., a real time cost to staging that outweighs the value of the information gained) — "we're confident enough" is not, by itself, a sufficient reason when a materially cheaper reversible test exists.
7. State the specific conditions under which the organization would actually walk back through the door if the reversible step or the full commitment does not perform as expected — this becomes an input to Module 11's review trigger, not a restatement of it.
8. Check whether prior investment already made (planning time, initial spend, public announcement) is being used to argue against staging or against reversal, without a stated forward-looking mechanism (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §2.6). If so, flag it as a sunk-cost pressure on the commitment decision itself, distinct from Module 04's bias audit of the original option choice.
9. State the plan's reversibility type (Type 1 / Type 2, by §5.1's test as applied in rule 3). Where it differs from Module 01's, it supersedes Module 01's for everything downstream: revise the decision record's reversibility fields to match before Module 10 runs (a Type 2 plan needs a reversal trigger and watcher, Module 08 rule 5), note the revision in the decision record's reversibility revision note, and have Module 11 apply its rule 4 to the plan's type.

OUTPUT
A. Reversibility re-check
| Field | Value |
| Check ID | |
| Classification from Module 01 | |
| Plan-specific reversibility (matches / diverges) | |
| Plan reversibility type (Type 1 / Type 2), superseding Module 01's where they differ | |
| Irreversibility mechanism, if claimed (stated / unverified) | |
| Actual walk-back cost, if reversible-but-costly | |

B. Smallest-reversible-step analysis
| Candidate first step | What it would prove/disprove | Cost vs. full commitment | Chosen (yes/no) | Reason if not chosen |

C. Walk-back conditions
State the specific conditions under which the organization would reverse course, feeding Module 11.

D. Sunk-cost-on-commitment flag
State whether prior investment is being used to argue against staging or reversal without a forward-looking mechanism, or "none identified."
```
