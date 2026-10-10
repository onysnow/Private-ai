# Module 10 — Final Logic Audit

*Part of Logic Authority System (LAS) — v0.1.*

## Use when

As the last step before a logic audit is delivered or relied upon. Run in a fresh context, apart from whatever produced the analysis, matching every sibling system's final-audit requirement. A fresh context of the same model is a separate pass, not an independent one; independence needs a different model or a person.

## Prompt

```text
OBJECTIVE
Audit the completed logic analysis, in a pass separate from the one that produced it, against its own prior module records and against three non-negotiable checks: no invented premises, no strawmanning, and no fallacy flagged without stating exactly which step of the argument it applies to.

ORIGINAL ARGUMENT (the text reviewed, and any other statements Module 07 compared)
[TASK MATERIALS — rules 1, 2 and 7 check against this; if it is not supplied, those rules cannot run and the verdict is LIMITED REVIEW]

DRAFT SYNTHESIS AND ALL PRIOR MODULE RECORDS
[FROM MODULES 01-09]

RULES
1. No invented premises: re-check the reconstructed argument (Module 01) against the original source — confirm no premise was dropped, added, or subtly reworded during reconstruction in a way that changes the argument being evaluated, and confirm every enthymematic premise is actually required by the argument rather than supplied gratuitously; and confirm the conclusion Module 01 states is the conclusion as argued — not broadened, narrowed or changed in kind.
2. No strawmanning: confirm Module 01's reconstruction is genuinely the steelmanned version of what the arguer actually argued, not a simplified or weakened version that happens to be easier to fault — and confirm Module 06's counterargument is a genuinely distinct, separately-constructed opposing case, not a restatement of Module 01's steelman relabeled.
3. Fallacy flags must cite the specific step: confirm every fallacy status reported as CONFIRMED in the final synthesis names the exact passage and the exact step of the argument (which premise, or which inferential move) it applies to — a fallacy finding that only names the fallacy's type without locating it in the argument fails this check.
4. Confirm the validity/strength verdict (Module 02) and every CONFIRMED fallacy (Module 04) both appear, accurately, in the final written synthesis — a common failure pattern is a fallacy correctly identified in Module 04 that quietly disappears by Module 09's prose. Check the pipeline's enumerated lists the same way — reconstructed premises (Module 01), fallacy candidates (Module 04), hidden premises (Module 05): a list whose length looks set by habit rather than by the argument (cut or padded to a round number, or every list the same length) is a finding unless the record shows why, and an item a module found that the synthesis drops because it fit no heading is the same failure as the vanished fallacy above.
5. Confirm every UNVERIFIED, CONTESTED, REFUTED or USER-STIPULATED premise from Module 03 is still flagged as such in the final synthesis, not silently treated as settled.
6. Check for over-flagging specifically: a candidate CONFIRMED as a fallacy where the relevant scheme's critical questions (Module 04) were not actually checked, or were checked and answered adequately but the finding was confirmed anyway.
7. Confirm any DIRECT CONTRADICTION reported in Module 07 actually passes the same-scope test (CORE/LAS_PROMPT_ENGINEERING_STANDARD.md §11; Module 07 rule 1) across both statements, and that a SCOPED CHANGE OF POSITION was not mischaracterized as a contradiction.
8. Verify the composite verdict in Module 09 is actually supported by the standards assessment table, not a mismatch between a critical standards table and an unearned positive (or negative) headline verdict. Also check the deliverable's required sections and its fit to the stated audience.
9. Check for the fallacy fallacy: confirm the synthesis nowhere concludes the argument's conclusion is false, disproven or refuted because a fallacy was confirmed, the argument was found invalid, or a premise was REFUTED (CORE/LAS_PROMPT_ENGINEERING_STANDARD.md Rule 14, §4.10) — and, equally, nowhere claims the conclusion is established because the reasoning was found valid and fallacy-free (Rule 13).
10. Confirm every equivocation Module 05 found is reflected in the validity verdict the synthesis states (Module 09 rule 7) — INVALID for a CONFIRMED equivocation, UNKNOWN for a CANDIDATE one — an equivocation left only in Module 05's table fails this check.

OUTPUT
A. Audit table, naming the Module 09 verdict audited (VER-####)
| Check | Finding | Verdict (PASS / FAIL) |

B. Overall verdict: PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL
LIMITED REVIEW applies when the original source argument itself is incomplete, ambiguous beyond what reconstruction can resolve, or other statements needed for Module 07 were unavailable, or the module records or the original argument text were not supplied (T07) — distinct from FAIL, matching the vocabulary TAS and RAS both use for this distinction. Name what was missing as the Limited-review trigger (EVALUATION/OUTPUT_SCHEMAS.md, Final audit record). State who ran this audit: a separate pass (the same model, fresh context) or independent (a different model, or a person).

C. Required corrections, if any, before delivery.
```
