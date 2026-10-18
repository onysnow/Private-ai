# Module 09 — Synthesis & Confidence Calibration

*Part of Research Authority System (RAS).*

## Use when

After research gap analysis (Module 08). This module has two parts run in
sequence: first assign the actual calibrated certainty and consensus
language each claim will carry, then draft the synthesis itself, carrying
that calibration into the prose rather than letting confident writing
smuggle back in confidence the evidence doesn't support.

## Prompt

```text
OBJECTIVE
Part A: Assign certainty-of-evidence and degree-of-consensus language to each claim, using the shared vocabulary in EVALUATION/OUTPUT_SCHEMAS.md — never an ad hoc word like "proven" or "shown."
Part B: Write the research synthesis itself, carrying forward every claim's tier, corroboration status, certainty, and consensus labeling from Part A and the prior modules.

INPUTS
Framed question and scope: [MODULE 01]
Search log and search limitations: [MODULE 02 PARTS A AND C]
Tiered, vetted source records with citations: [MODULE 03]
Claim-level evidence, pinpoint locations and corroboration map: [MODULE 04]
Bias/representativeness verdict: [MODULE 05]
Consensus map: [MODULE 06]
Currency findings: [MODULE 07]
Gap analysis and gap disclosure statement: [MODULE 08]

PART A — CALIBRATION RULES
1. Assign each claim a certainty-of-evidence level (High / Moderate / Low / Very low, per the GRADE-derived scale in EVALUATION/OUTPUT_SCHEMAS.md) based on source tier, corroboration status, consistency across sources, and the representativeness verdict from Module 05, which caps the level as EVALUATION/OUTPUT_SCHEMAS.md states: LIKELY REPRESENTATIVE WITH NOTED GAPS — at most Moderate; LIMITED-NOT ESTABLISHED — Very low; REPRESENTATIVE — no cap. No claim exceeds its cap, however consistent the sources found actually are.
2. Separately assign each claim the degree-of-consensus label already determined in Module 06. Certainty and consensus are independent axes; state both, not one standing in for the other.
3. Where a claim's corroboration verdict from Module 04 is SINGLE-SOURCE, the certainty level cannot exceed Low regardless of how large or well-designed that single source is, absent independent replication.
4. Where degree-of-consensus is "Minority view against the weight of evidence," state this plainly rather than presenting the minority source's claim with the same confidence language as a mainstream one.
5. Never use unsupported numerical precision (e.g., "73% likely") in place of the calibrated tiers, unless the number itself comes directly from the cited evidence (e.g., a meta-analysis's own reported effect size) — in which case cite it as the source's number, not as the model's independent confidence estimate. Use CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md's estimative-probability vocabulary for any forecast or inference-level confidence statement distinct from the certainty/consensus labels.

PART B — SYNTHESIS DRAFTING RULES
6. State the representativeness verdict, search limitations, and the gap disclosure statement up front, not buried at the end — a reader deciding how much weight to give the synthesis needs this before the claims, not after.
7. For every claim stated as more than a passing mention, attach its certainty-of-evidence and degree-of-consensus labels inline or in an adjacent citation — do not let the prose imply a higher certainty than Part A assigned.
8. Where evidence is genuinely mixed or thin, say so in the same sentence as the claim, not in a disclaimer paragraph the reader can skip.
9. Where a retraction or supersession from Module 07 changed a claim's status, reflect the corrected status in the synthesis — never cite the original, now-invalid version because it fit the narrative better.
10. Do not resolve a "Contested — evidence genuinely mixed" claim into a single confident answer for narrative smoothness. State both positions and the actual state of the evidence between them.
11. Distinguish, in the prose itself, between what the cited sources establish and any extrapolation or interpretation added on top — flag interpretation as interpretation, using the extrapolation flags carried from Module 04.
12. Disclose research gaps from Module 08 in the body of the synthesis, not only in an internal record — a gap the reader never sees was not actually disclosed.
13. Cite specific sources for specific claims (pinpoint citation), not a block bibliography at the end standing in for claim-level sourcing.

OUTPUT
A. Calibrated claim table
| Claim | Corroboration verdict | Certainty of evidence (High/Moderate/Low/Very low) | Degree of consensus | Basis for certainty level | Basis for consensus label |

B. Draft synthesis (prose, following Part B rules above)
C. Claim-to-citation map (which specific source(s) back which specific sentence/claim in the draft)
D. Self-flagged uncertainties — anything in the draft the drafter is not confident correctly reflects the calibration table, for Module 10 to check
```
