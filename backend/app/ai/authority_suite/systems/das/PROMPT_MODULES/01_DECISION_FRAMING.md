# Module 01 — Decision Framing

*Part of Decision Authority System (DAS).*

## Use when

At the start of any decision process, before any option is generated or evaluated. Every downstream module's rigor depends on this module's output.

## Prompt

```text
OBJECTIVE
Identify the actual decision being made, the real decision-maker, what's actually at stake, how reversible it is, and the real deadline — and distinguish the real question from any proxy question that has been substituted for it. Do not evaluate any option's merits yet — that happens in later modules.

DECISION UNDER REVIEW
[DESCRIPTION OF THE DECISION AS CURRENTLY UNDERSTOOD, INCLUDING WHO RAISED IT AND WHY]

RULES
1. State the decision being made in one sentence, as a bounded question with a finite set of possible answers — not the general goal or problem area it sits inside ("should we renew, renegotiate, or switch vendors by Q2" is a decision statement; "fix our vendor problem" is not).
2. Identify the real decision-maker: the specific person or body with actual authority to make this call, distinct from whoever is asking the question, running the analysis, or most vocal about it. Name who else must be consulted or must sign off, and distinguish that from who merely wants to be.
3. Check for a proxy-question substitution: is the question actually being analyzed ("should we hire this candidate," scored against a checklist) standing in for a different real decision ("does this team need this role at all")? If a substitution is suspected, state both the proxy question and the real question separately, and flag which one the rest of this task should actually answer.
4. State what is actually at stake: the material consequences of getting this wrong, in concrete terms (cost, time, relationships, safety, reputation, legal exposure) — not a generic "this is important" statement.
5. Classify reversibility: Type 1 (one-way door — consequential, difficult or impossible to reverse) or Type 2 (two-way door — reversible at acceptable cost). State why, and state it for this specific instance, not by category or precedent — the same kind of decision (a hire, a pricing change, a public statement) can be Type 1 in one case and Type 2 in another.
6. Classify the problem domain: Simple/Clear (cause and effect obvious, best practice applies), Complicated (cause and effect knowable but requires expertise), Complex (cause and effect clear only in hindsight; no expert can predict the result in advance), Chaotic (no discernible cause-and-effect relationship yet; its observable signal is a situation changing faster than analysis can finish, where waiting is itself causing harm), or Disorder (it is unclear which of the other four applies). State the observable signal behind the classification.
7. Flag it explicitly if a Complicated-domain approach (expert analysis converging on one right answer) is being applied to a Complex-domain problem (no right answer exists to find in advance; only safe-to-fail experiments reveal one).
8. State the real deadline, and check whether it is genuinely fixed (a contractual date, an external event) or self-imposed and negotiable. A soft deadline treated as hard forces unnecessary Type-1-caliber urgency onto what may be a Type 2 decision.
9. State the process rigor the combination of reversibility and domain implies (e.g., Type 2 + Simple/Clear: fast individual or small-group call, roughly 70% of desired information is enough; Type 1 + Complex: broad consultation plus staged, safe-to-fail probing, not a single upfront analysis; Chaotic: act now to establish stability, record the action, and analyse the follow-on decision once stable).
10. If reversibility or domain is genuinely ambiguous, state the two live possibilities and what would resolve the ambiguity, rather than forcing a single box. An ambiguous domain is recorded as Disorder, with the live possibilities in the domain rationale; where the situation has distinct parts, classify each part; the part the decision turns on sets the problem domain that routes the pipeline. Whatever the domain, an option that will be lost before the analysis can finish is secured first: the stabilising step is taken now, with a named owner, and recorded in short form with a review trigger; the rest goes through the pipeline.

OUTPUT
A. Framing record
| Field | Value |
| Decision ID | |
| Decision statement | |
| Proxy question (if any) | |
| Real decision-maker | |
| Required consultation / sign-off | |
| What's actually at stake | |
| Reversibility (Type 1 / Type 2) | |
| Reversibility rationale | |
| Problem domain (Simple/Complicated/Complex/Chaotic/Disorder) | |
| Domain rationale | |
| Domain by part (if the parts differ) | |
| Real deadline (fixed / negotiable) | |
| Recommended process rigor | |
| Process-mismatch flag | |
| Ambiguity flag | |

B. Routing note
State which of Modules 02–07 this decision needs run in full, and which (if any) a lightweight pass can compress or skip, per the routing rules in `PROMPT_MODULE_CATALOG.md`; a lightweight pass still meets the minimum `CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §18 names, and its record lists each skipped stage as skipped. A Type 1 or Complex-domain decision should not compress Modules 02–07. A Chaotic-domain decision acts first: the stabilizing action is taken and recorded, and Modules 02–07 run on the follow-on decision once the situation is stable (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §5.2). A Disorder classification is resolved first (rule 10).
```
