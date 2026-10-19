# Module 11 — Post-Decision Review Trigger

*Part of Decision Authority System (DAS).*

## Use when

Alongside or immediately after the decision record (Module 08) and the reversibility/commitment check (Module 09), before the decision is considered finalized. Also used to check an existing decision record that lacks a concrete trigger. Rule 10 runs later, when a trigger fires or a review date arrives.

## Prompt

```text
OBJECTIVE
Define concretely when and how this decision gets revisited: a calendar trigger, a threshold trigger, or a new-evidence trigger — not a vague intention to "revisit later."

INPUTS
Decision record: [FROM MODULE 08]
Walk-back conditions: [FROM MODULE 09]
Sensitivity-ranked uncertainty table: [FROM MODULE 05]

RULES
1. Define at least one review trigger from these three types, and state which type it is:
   - **Calendar trigger** — a specific date or interval ("review this decision at the 90-day mark," not "review this periodically").
   - **Threshold trigger** — a named, measurable metric crossing a stated value ("if 90-day retention falls below 60%," not "if things aren't going well").
   - **New-evidence trigger** — a defined category of information that would warrant revisiting the decision, drawn from Module 05's "what would change the recommendation" analysis or Module 09's walk-back conditions ("if a competitor announces a matching price within the quarter," not "if the market changes").
2. Reject any proposed trigger that cannot be checked by someone other than the original decision-maker without further interpretation. "If this doesn't feel right" is not a trigger; "if X metric, measured how, crosses Y" is.
3. Name who is responsible for monitoring each trigger and what happens when it fires — a specific person or role, and a specific next action (an automatic reversal, a mandatory re-review meeting, an escalation), not merely "someone will notice."
4. For a Type 2 decision, at least one trigger must be a threshold or new-evidence trigger tied directly to the reversal conditions from Module 09, not only a generic calendar check-in.
5. For a Type 1 decision with any staged or partially reversible element (per Module 09), define a trigger for the staged portion; for a fully committed, permanent portion, define a trigger that reviews its consequences and their mitigation (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §15).
6. State the review's scope: will it be a full re-run of the pipeline (Modules 01–10) or a narrower check against the specific trigger condition. A full re-run is not required for every trigger firing — state what a proportionate review looks like for this decision.
7. Distinguish a review trigger from a routine status update. A trigger changes what happens (the decision is actively reconsidered — or, for a permanent commitment, its consequences and their mitigation are, rule 5); a status update merely reports whether the metric moved. Do not let a dashboard number stand in for an actual commitment to reconsider.
8. Where the sensitivity table (Module 05) identified a genuine unknown that was accepted as a monitored risk rather than resolved before the decision, that unknown's resolution (once available) must itself be a new-evidence trigger — check that it was not silently dropped between Module 05 and this module.
9. State the trigger's own expiration or superseding condition, if applicable — a decision does not need a review trigger that outlives its own relevance (e.g., a pricing-decision review trigger tied to a contract that has since been renegotiated on different terms).
10. When a trigger fires or a review date arrives, the person or role monitoring it (rule 3) writes the outcome record (`EVALUATION/OUTPUT_SCHEMAS.md`, Outcome record, an OUT- ID) before the review starts: the decision ID it links to, the date it is recorded, what has actually happened so far, the date that outcome became known (null while it is still unfolding), and any limitations on what is known. It describes the outcome and does not judge the process; its linked gap IDs stay empty for Module 10's outcome pass to fill (Module 10 rules 10 and 13). It is kept separate from the decision record and linked to it by ID (Module 08 rule 10).

OUTPUT
A. Review-trigger record (enter each Trigger ID in the decision record's review trigger IDs, Module 08)
| Trigger ID | Type (calendar / threshold / new-evidence) | Exact condition | Monitored by | Action on firing | Linked to (Module 05 sensitivity ID / Module 09 walk-back condition, if applicable) | Expiration or superseding condition (rule 9; "none" if it applies for the decision's life) |

B. Monitored-risk carry-forward check
Confirm every genuine unknown accepted as a monitored risk in Module 05 has a corresponding trigger here, or state why not.

C. Review scope note
State what a proportionate review looks like if each trigger fires — full pipeline re-run or narrower targeted check.

D. Outcome record (written later, when a trigger fires or a review date arrives — rule 10)
| Outcome ID | Decision ID | Recorded at | Outcome summary | Outcome known at | Limitations |
```
