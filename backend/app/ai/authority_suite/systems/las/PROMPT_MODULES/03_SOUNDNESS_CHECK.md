# Module 03 — Soundness Check

*Part of Logic Authority System (LAS) — v0.1.*

## Use when

After the validity check (Module 02), and before the fallacy screen (Module 04), which reads its statuses (Module 04 rule 4). Flags premise status without performing TAS's or RAS's actual verification work.

## Prompt

```text
OBJECTIVE
Flag the verification status of each premise the argument depends on — without adjudicating whether it's actually true. Checking premise truth belongs to TAS's evidentiary standards or RAS's evidence-quality grading, not to LAS (CORE/LAS_PROMPT_ENGINEERING_STANDARD.md, Rule 3). This module's job is to flag status and defer, explicitly, not to re-litigate the premises' factual content here.

PREMISES
[FROM MODULE 01, WITH ATTRIBUTION CATEGORIES]

RULES
1. For each premise, state its verification status: VERIFIED (for an empirical premise, a citation or established fact this task can confirm against TAS/RAS-tier evidence; for a definitional premise, the definition is used consistently for the rest of the argument — CORE/PREMISE_EVIDENCE_AND_ATTRIBUTION_POLICY.md §4), CONTESTED (credible sources disagree), REFUTED (TAS- or RAS-tier evidence shows the premise false — cited, not judged here), UNVERIFIED (not established: either no check was performed, or a check was performed and fell short of CORE/PREMISE_EVIDENCE_AND_ATTRIBUTION_POLICY.md §4's bar — record which in the check column), or UNVERIFIABLE (a claim that checking sources cannot settle, e.g., a value judgment: mark a normative premise as a value premise and state it openly as one; this status takes no position on whether such claims can be true). A USER-STIPULATED premise stays UNVERIFIED, its check column reading "stipulated by the requester".
2. Apply CORE/PREMISE_EVIDENCE_AND_ATTRIBUTION_POLICY.md's evidentiary-weight thresholds: a load-bearing empirical premise needs TAS-tier corroboration or RAS-tier moderate-or-better evidence before it can be marked VERIFIED; a peripheral one needs less; a normative premise is never VERIFIED or CONTESTED, only UNVERIFIABLE.
3. Where TAS or RAS output is actually available for a premise, cite it directly rather than re-deriving a verification judgment independently. Where no verification tool or source is available, do not guess — mark UNVERIFIED and say so plainly, rather than letting the premise pass silently as though it were checked.
4. Distinguish an empirical premise (verifiable in principle) from a value/normative premise (not verifiable by evidence) — a normative premise being UNVERIFIABLE is not a defect in the argument; treating a value premise as though it needs empirical proof, or an empirical premise as though it's just a matter of opinion, are both errors to flag.
5. A citation to a source (ATTRIBUTED SOURCE premise) establishes only that the source says this — check the source's own tier/certainty before moving the premise past UNVERIFIED, rather than treating the citation itself as sufficient.
6. State plainly: this argument's soundness — as opposed to its validity or inferential strength, already assessed in Module 02 — depends on every UNVERIFIED or CONTESTED premise here being resolved; a REFUTED load-bearing premise makes the argument unsound, which leaves its conclusion unsupported by this argument, not false (CORE/LAS_PROMPT_ENGINEERING_STANDARD.md Rule 14). Where no premise verification was performed at all (LAS used standalone, without TAS or RAS), state this as a scope limitation on the whole audit, not just a per-premise note.
7. A premise TAS Module 02 returns in either status below lands as the table says. Never round it to one status: a PARTIALLY VERIFIED premise is not marked wholly VERIFIED or wholly UNVERIFIED, and an attribution is not dropped.
| TAS status | LAS status |
| PARTIALLY VERIFIED | VERIFIED for the part TAS confirmed (its corrected wording), recorded as its own premise; UNVERIFIED, checked, short of the bar, for the rest |
| ATTRIBUTED BUT UNCORROBORATED | UNVERIFIED, checked, short of the bar, with the attribution (who says it) noted in the Source column |

OUTPUT
| Premise id (PREM-####, from Module 01) | Premise | Attribution category | Type (empirical / normative / definitional) | Verification status (VERIFIED / CONTESTED / REFUTED / UNVERIFIED / UNVERIFIABLE) | Check performed (none / checked, short of the bar / checked, not testable from available sources / stipulated by the requester) | Source (if VERIFIED / CONTESTED / REFUTED; the attribution under rule 7) | Load-bearing or peripheral |
```
