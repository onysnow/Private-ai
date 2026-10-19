# Calibrated Confidence Language

*Part of Topic Authority System (TAS).*

## Purpose

Vague confidence words ("high," "likely," "probably") mean different things to different readers of the same report — the same failure the intelligence community documented in its own analytic post-mortems. This file defines one shared vocabulary that every module's confidence and assessment language should draw from, so two readers of the same word attach the same rough meaning to it. Adapted from the U.S. Intelligence Community's standardized words of estimative probability (ICD 203): its seven likelihood terms and the probability band each one names.

## Vocabulary

| Term | Band | ICD 203's alternative term | Approximate meaning |
|---|---|---|---|
| Almost certain(ly) | 95-99% | nearly certain | Evidence leaves effectively no viable alternative |
| Very likely | 80-95% | highly probable | Evidence strongly favors this; an alternative remains but little supports it |
| Likely | 55-80% | probable | Evidence favors this over alternatives, but a real alternative remains |
| Roughly even chance | 45-55% | roughly even odds | Evidence does not favor one account over another |
| Unlikely | 20-45% | improbable | Evidence disfavors this, though it isn't excluded |
| Very unlikely | 05-20% | highly improbable | Evidence strongly disfavors this, though it isn't excluded |
| Almost no chance | 01-05% | remote | Evidence is inconsistent with this to the point of exclusion |

ICD 203 prints the first three columns as three rows — two alternative sets of terms over one row of bands (ODNI's copy, https://archive.dni.gov/files/documents/ICD/ICD-203.pdf, read 2026-09-21) — and says of the two sets: "Analysts are strongly encouraged not to mix terms from different rows. Products that do mix terms must include a disclaimer clearly noting the terms indicate the same assessment of probability." TAS uses the Term column; records carry it in capitals (`VERY_LIKELY`).

## Rules

1. Use these terms, or state their approximate meaning in the same words, whenever describing how likely a conclusion, hypothesis, or claim is. A term's band is what the term means, not a figure to write in its place: do not substitute an unsupported numeric percentage. Use the Term column; an output that also uses an alternative term carries the disclaimer ICD 203 requires.
2. Confidence in a judgment is a second, separate dimension: how much the evidence can bear, set by its quality, independence, completeness, and consistency — not by rhetorical certainty, source tone, or how confident the underlying source sounded. ICD 203, which this file adapts, keeps the two apart, and so does TAS: do not state a likelihood term and a confidence level in the same sentence.
3. A Claim record (`EVALUATION/OUTPUT_SCHEMAS.md`) carries both: record the term itself in the Claim record's `confidence_term` field, and the confidence level Rule 2 sets in `confidence` (`LOW|MEDIUM|HIGH`), with the basis of each in `confidence_basis`. Neither is derived from the other: "likely, on a single uncorroborated source" is `LIKELY` with `LOW` confidence. (From TAS 1.10 to 1.11 this rule mapped the terms onto `confidence` one term to one value — almost certain and likely → HIGH, roughly even chance → MEDIUM, unlikely and almost no chance → LOW — which left no field for the evidence's weight; TAS 1.12 separated them.) Claim records written before 2026-10-03 carry the five-term set, without `VERY_LIKELY` and `VERY_UNLIKELY`, and keep their values.

## Restating a finding

A summary, headline, abstract, caption or press line may simplify a finding but may not raise its
confidence term, widen its scope (more people, places, times or cases than the finding covers), or
state an association as a cause. When a restatement does any of the three, the restatement is wrong,
not the finding: correct the restatement. Exaggeration in news reports of research is strongly
associated with exaggeration already present in the research's own press releases (Sumner et al.,
BMJ 2014), and spin appears in the abstracts of trials whose primary outcome was not significant
(Boutron et al., JAMA 2010); in both studies the exaggeration was in the
restatement, not in the result it restated.
