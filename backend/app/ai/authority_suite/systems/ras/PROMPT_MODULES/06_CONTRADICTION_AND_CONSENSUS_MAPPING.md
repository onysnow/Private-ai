# Module 06 — Contradiction & Consensus Mapping

*Part of Research Authority System (RAS).*

## Use when

After bias and interest disclosure (Module 05), before the currency check
and synthesis. This is where sources are actually weighed against each
other and the real state of agreement or disagreement is characterized.

## Prompt

```text
OBJECTIVE
Where sources disagree, characterize the real state of expert consensus or disagreement — not a false balance that treats a fringe view and a strong consensus as equally weighted. Map agreement and disagreement per claim, weighted by tier and quality, not by how many sources say it.

CLAIM-LEVEL EVIDENCE, CORROBORATION MAP (with each source's tier for each claim), AND BIAS/REPRESENTATIVENESS FINDINGS
[FROM MODULES 04-05]

RULES
1. For each claim, list which sources support it, which contradict it, and which are silent or not applicable — do not fold silence into either column.
2. Weight by tier and quality, not count. State explicitly when a numerically larger set of lower-tier sources is being outweighed by a smaller set of higher-tier ones, and why.
3. Distinguish genuine disagreement (sources examining the same claim at the same scope and reaching different conclusions) from apparent disagreement that's actually about different populations, timeframes, or definitions — a real synthesis resolves the second kind by noting the scope difference, not by picking a side.
4. Flag "manufactured controversy": where the actual research community shows strong consensus but a small, vocal minority of sources creates an appearance of live debate. State the basis for this call (e.g., the dissenting sources are concentrated in low tiers, lack independent replication, or come from sources with disclosed conflicts flagged in Module 05) rather than asserting it without support. Do not treat a fringe minority view and a strong consensus as if they deserve equal narrative weight ("false balance").
5. Equally, do not manufacture false consensus: if the higher-tier sources themselves disagree, or the body of evidence is genuinely thin, say so rather than picking the more common answer and treating it as settled.
6. Assign a degree-of-consensus label per claim, using the shared scale in EVALUATION/OUTPUT_SCHEMAS.md: Established consensus / Majority view with notable dissent / Contested — evidence genuinely mixed / Emerging — insufficient evidence to assess / Minority view against the weight of evidence.
7. Extrapolation flags carried forward from Module 04 are not resolved here — note where a claim under review is itself an extrapolation, so the consensus label attaches to the narrower, actually-studied claim rather than to the broader extrapolated one.

OUTPUT
| Claim | Supporting sources (tier-weighted) | Contradicting sources (tier-weighted) | Scope/definition differences noted | Degree-of-consensus label | Manufactured-controversy flag | False-consensus flag |
```
