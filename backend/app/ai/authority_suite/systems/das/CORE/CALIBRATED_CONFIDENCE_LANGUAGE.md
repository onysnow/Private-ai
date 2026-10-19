# Calibrated Confidence Language

*Part of Decision Authority System (DAS).*

## Purpose

Vague confidence words ("high," "likely," "probably") mean different things to different readers of the same decision record — the same failure the intelligence community documented in one of its own estimates, whose drafters later read "serious possibility" as odds anywhere from 20-80 to 80-20 (Kent, "Words of Estimative Probability"; listed under `SOURCE_INDEX.md`'s supporting sources, PS-0188), and the same failure that lets a decision-maker round "roughly even chance" up to "likely" in their own head when a recommendation is later relied on. This file defines one shared vocabulary that every DAS module's confidence and assumption language should draw from, so two readers of the same decision record attach the same rough meaning to it. Adapted from the U.S. Intelligence Community's standardized words of estimative probability (ICD 203) [DS-13] — its seven likelihood terms and the probability band each one names — the same source TAS's own confidence-language file draws on.

## Vocabulary

| Term | Band | ICD 203's alternative term | Approximate meaning |
|---|---|---|---|
| Almost certain(ly) | 95-99% | nearly certain | The evidence and base rate leave effectively no viable alternative |
| Very likely | 80-95% | highly probable | The evidence strongly favors this; an alternative remains but little supports it |
| Likely | 55-80% | probable | The evidence favors this over alternatives, but a real alternative remains |
| Roughly even chance | 45-55% | roughly even odds | The evidence does not favor one outcome over another |
| Unlikely | 20-45% | improbable | The evidence disfavors this, though it isn't excluded |
| Very unlikely | 05-20% | highly improbable | The evidence strongly disfavors this, though it isn't excluded |
| Almost no chance | 01-05% | remote | The evidence is inconsistent with this to the point of exclusion |

ICD 203 [DS-13] prints the first three columns as three rows — two alternative sets of terms over one row of bands (ODNI's copy, https://archive.dni.gov/files/documents/ICD/ICD-203.pdf, read 2026-09-21) — and says of the two sets: "Analysts are strongly encouraged not to mix terms from different rows. Products that do mix terms must include a disclaimer clearly noting the terms indicate the same assessment of probability." DAS uses the Term column.

## Worked examples in a decision context

- "It is **likely** that switching vendors by Q2 costs more in migration effort than the base-rate savings recoup within the first year" — a base-rate-grounded assumption-table entry (Module 04), not a bare intuition.
- "There is a **roughly even chance** the new pricing tier cannibalizes the existing enterprise plan rather than expanding the market" — an honest statement that the evidence genuinely does not favor one side, used in a pre-mortem finding (Module 07) instead of forcing false confidence either way.
- "It is **almost certain** that this hire will not be reversible within the first 90 days once relocation costs are paid" — a reversibility statement (Module 09) grounded in a stated mechanism (sunk relocation cost), not a vague sense of permanence.
- "It is **unlikely**, but not excluded, that the competitor matches this price within a quarter" — an assumption with a stated falsifier (a competitor price-match announcement) rather than an assertion treated as settled.

## Rules

1. Use these terms, or state their approximate meaning in the same words, whenever describing how confident an assumption, base rate, forecast, or recommendation is. A term's band is what the term means, not a figure to write in its place. Use the Term column; an output that also uses an alternative term carries the disclaimer ICD 203 requires. Do not substitute an unsupported numeric percentage; where a number is warranted, state its basis and its range — a bare "73% likely to succeed" with no stated basis is the false-precision failure mode DAS's standard names explicitly (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §9, §10).
2. Confidence must be based on evidence and precedent quality, comparability, independence, completeness, and consistency (`CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md`) — not on rhetorical certainty, how confident a stakeholder sounded, or how much the decision-maker wants the option to be true.
3. This vocabulary governs narrative confidence language in a decision record, an assumption table, or a pre-mortem finding. DAS's records carry the seven terms themselves (`ALMOST_CERTAIN`, `VERY_LIKELY`, `LIKELY`, `ROUGHLY_EVEN_CHANCE`, `UNLIKELY`, `VERY_UNLIKELY`, `ALMOST_NO_CHANCE` — `EVALUATION/OUTPUT_SCHEMAS.md`); DAS has no three-value confidence field and no mapping onto one. State the basis alongside the term in the record's basis field or accompanying prose. Records written before 2026-10-03 carry the five-term set, without `VERY_LIKELY` and `VERY_UNLIKELY`, and keep their values. A confidence level ("high confidence") and a likelihood term do not share a sentence: ICD 203 says products using a confidence level "must not combine a confidence level and a degree of likelihood, which refers to an event or development, in the same sentence."
4. When a genuine reference class exists (`CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md` §3, Tier A/B), state the base rate itself alongside the calibrated term, not instead of it — "likely, based on an 8-of-11 base rate among comparable prior launches" is a complete statement; "likely" alone is not.

## Restating a finding

A summary, headline, abstract, caption or press line may simplify a finding but may not raise its
confidence term, widen its scope (more people, places, times or cases than the finding covers), or
state an association as a cause. When a restatement does any of the three, the restatement is wrong,
not the finding: correct the restatement. Exaggeration in news reports of research is strongly
associated with exaggeration already present in the research's own press releases (Sumner et al.,
BMJ 2014), and spin appears in the abstracts of trials whose primary outcome was not significant
(Boutron et al., JAMA 2010); in both studies the exaggeration was in the
restatement, not in the result it restated.
