# Module 05 — Hidden Premise / Assumption Surfacing

*Part of Logic Authority System (LAS) — v0.1.*

## Use when

After Modules 02–04 (Stage 3, CORE/LAS_PROMPT_ENGINEERING_STANDARD.md §6): it reads the equivocations Module 02 named (Module 02 rule 9), and records its own with a status under Module 04's rules. Focuses specifically on unstated assumptions doing real work, and on key terms whose meaning shifts, which a validity or fallacy check can miss if it takes the argument's own wording at face value.

## Prompt

```text
OBJECTIVE
Identify the unstated premises an argument silently depends on to reach its conclusion, and state them explicitly so they can be evaluated on their own — including flagging any key term whose meaning shifts between where it's used in the premises and where it's used in the conclusion (equivocation), a closely related failure of the same kind: a gap the argument's surface wording papers over.

RECONSTRUCTED ARGUMENT
[FROM MODULE 01]

EQUIVOCATIONS MODULE 02 NAMED
[FROM MODULE 02, RULE 9]

RULES
1. For each enthymematic premise already identified in Module 01, assess whether it's a reasonable, widely shared assumption (BACKGROUND ASSUMPTION per CORE/PREMISE_EVIDENCE_AND_ATTRIBUTION_POLICY.md) or a substantive, contestable claim doing real work in the argument — the more the argument depends on the latter, the more it needs to be surfaced explicitly to the reader, not just noted internally.
2. Rank surfaced hidden premises by how much work they do — a premise the conclusion cannot survive without ranks above one the argument merely leans on for extra support. Asking whether the conclusion survives a premise's removal is a heuristic, not a test that sorts every premise: where it gives no clear answer, record that premise's role as uncertain.
3. Identify every key term used in more than one place in the argument, and check whether it means the same thing each time it's used. A term that shifts meaning (e.g., "freedom" meaning "absence of legal restriction" in one premise and "freedom from want" in the conclusion) invalidates the inference even though each individual sentence may read fine in isolation.
4. Distinguish three kinds of term: an equivocation (a key term that shifts between meanings across the premises and conclusion an inference connects — rule 3); an ambiguous term with no shown shift (multiple defensible meanings, unclear which is intended), which leaves the validity of the inferences it enters not assessable until its meaning is pinned down (CORE/LAS_PROMPT_ENGINEERING_STANDARD.md Rule 11) and is not an equivocation; and a vague-but-consistent one (the same imprecise meaning used throughout, which is a clarity issue for Module 09's synthesis, not an equivocation).
5. Where an equivocation is found, state both meanings explicitly and show which premise/conclusion pairing breaks once the terms are pinned to consistent definitions.
6. Do not surface a hidden premise the argument does not actually need — invented over-surfacing is as much a misreading of the argument as failing to surface a real one.
7. Record each equivocation as a fallacy finding too (Equivocation, EVALUATION/OUTPUT_SCHEMAS.md), with its located step and a status under Module 04's rules 2 and 7 — CONFIRMED when both meanings are stated and the break shown (rule 5), CANDIDATE when the shift is arguable — so it reaches the validity verdict at synthesis (Module 09 rule 7) and the final audit (Module 10 rule 10). An ambiguous term with no shown shift is not a fallacy finding; record it in its own row for Module 09.

OUTPUT
| Field | Value |
| Unstated (hidden) premises (PREM-####), ranked by how much work they do, a role left unclear marked uncertain (rule 2) | |
| Key terms used more than once | |
| Equivocation findings (FAL-####, term, two meanings, where the break occurs, status CANDIDATE / CONFIRMED) | |
| Ambiguous terms with no shown shift (validity not assessable until pinned down — Rule 11) | |
| Vague-but-consistent terms (flagged for Module 09, not as equivocation) | |
```
