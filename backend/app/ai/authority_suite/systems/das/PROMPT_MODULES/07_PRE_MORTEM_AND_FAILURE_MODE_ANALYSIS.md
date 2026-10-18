# Module 07 — Pre-Mortem & Failure Mode Analysis

*Part of Decision Authority System (DAS).*

## Use when

After the comparison and recommendation (Module 06) — the last stress-test before writing the decision record.

## Prompt

```text
OBJECTIVE
Imagine the chosen option has already failed a year from now, and work backward to the most plausible causes — the same way a pre-mortem surfaces risk a forward-looking risk register misses [DS-05].

INPUTS
Recommended option and its basis: [FROM MODULE 06]
Assumption table, bias audit, and sensitivity table: [FROM MODULES 04–05]
Stakeholder/consequence map: [FROM MODULE 03]

RULES
1. Assume this decision has already been carried out, a year has passed, and the plan has failed — its intended result did not happen. State this as a premise, not a hedge — do not soften it to "might fail." The premise is that the plan failed, not that the decision was a mistake: a well-made decision can fail (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §2.1), and the exercise finds causes; it does not judge the choice.
2. State the single most likely reason it failed. Where more than one plausible failure mode exists, name the top three to five, ranked by likelihood.
3. Require at least one failure mode that would actually be embarrassing or damaging if it came true — not only flattering causes like "we were too successful too fast" or "the market moved faster than anyone could have predicted." A pre-mortem that only generates causes nobody in the room would feel responsible for has not done its job.
4. Draw explicitly on the stakeholder/consequence map (Module 03): include at least one failure mode rooted in a stakeholder reaction, not only an execution or market failure mode.
5. Draw explicitly on the bias-audit findings (Module 04): if a bias was marked PRESENT or UNCLEAR, check whether it plausibly contributes to one of the ranked failure modes, and say so if it does.
6. For each named failure mode, check whether the current option, its stated assumptions, its uncertainty treatment, or the plan already address it.
7. If a failure mode is not addressed, surface the gap explicitly. Do not silently fold it into an existing assumption or downgrade its rank because surfacing it is inconvenient this late in the process.
8. Distinguish a failure mode that restates an assumption already tracked with a falsifier (Module 04) from a genuinely new failure mode this pre-mortem itself surfaced.
9. Do not use the pre-mortem to relitigate the classification (Module 01) or reopen option generation (Module 02). Its job is to stress-test the option already in front of you and surface what must change before commitment — not to restart the process.

OUTPUT
A. Pre-mortem finding
| Failure mode ID | Rank | Failure mode (stated as already having happened) | Source (execution / market / stakeholder reaction / bias-linked / other) | Already addressed by (option / assumption / plan element), or "GAP" | Required action if GAP |

B. Damaging-failure-mode check
State which ranked failure mode is the one that would actually be embarrassing or costly to the decision-maker specifically, confirming Rule 3 was met rather than only flattering causes being generated.

C. Carry-forward note
State which GAP items must be resolved before the decision record (Module 08) is written, and which can be carried forward as a monitored risk with a named owner.
```
