# Calibrated Confidence Language

*Part of Research Authority System (RAS).*

## Purpose

Vague confidence words ("high," "likely," "probably") mean different things
to different readers of the same synthesis — the same failure the
intelligence community documented in its own analytic post-mortems. This
file defines one shared vocabulary that every RAS module's confidence and
assessment language should draw from, so two readers of the same word
attach the same rough meaning to it. Adapted from the U.S. Intelligence
Community's standardized words of estimative probability (ICD 203) — its
seven likelihood terms and the probability band each one names — the same
source TAS's own `CALIBRATED_CONFIDENCE_LANGUAGE.md` draws from, reused
rather than re-derived, since the underlying calibration problem is
domain-agnostic.

This vocabulary states how confident a *hypothesis or estimate* is. RAS
also uses two further, distinct scales that this vocabulary does not
replace: the **certainty-of-evidence** scale (High/Moderate/Low/Very low,
adapted from GRADE) and the **degree-of-consensus** scale (Established
consensus through Minority view), both defined in
`EVALUATION/OUTPUT_SCHEMAS.md`. Certainty of evidence describes how much
confidence the body of evidence supports; degree of consensus describes how
much the relevant expert/research community actually agrees; the
estimative-probability vocabulary below is for stating confidence in a
specific claim, inference, or forecast within that broader picture — for
example, how confident a synthesis is that a given effect will hold in a
new but similar context, or how confident a gap-analysis finding is that a
given line of evidence genuinely doesn't exist rather than merely wasn't
found. Use the term that matches what is actually being estimated; do not
let one vocabulary silently stand in for the other two.

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

ICD 203 prints the first three columns as three rows — two alternative
sets of terms over one row of bands (ODNI's copy,
https://archive.dni.gov/files/documents/ICD/ICD-203.pdf, read 2026-09-21;
`SOURCE_INDEX.md`, "ICD 203, cross-referenced") — and says of the two sets:
"Analysts are strongly encouraged not to mix terms from different rows.
Products that do mix terms must include a disclaimer clearly noting the
terms indicate the same assessment of probability." RAS uses the Term
column.

## Worked examples in a research-synthesis context

- **Almost certain**: "It is almost certain that smoking increases lung
  cancer risk" — decades of convergent epidemiological, clinical, and
  mechanistic evidence across independent research groups leave no viable
  alternative explanation for the association.
- **Likely**: "It is likely that the observed effect generalizes to
  adolescents" when the underlying studies were conducted in adults —
  the mechanism and partial adolescent data favor generalizing, but a real
  alternative (a genuine developmental difference) has not been ruled out.
  Label this explicitly as an extrapolation (see
  `PROMPT_MODULES/04_CLAIM_EXTRACTION_AND_CORROBORATION_MAPPING.md`), not
  as a direct finding.
- **Roughly even chance**: "It is roughly an even chance that the newer
  intervention outperforms the established one" when two well-conducted
  studies point in opposite directions and no third, higher-tier source
  resolves the conflict — the correct report of a genuinely contested
  question (`PROMPT_MODULES/06_CONTRADICTION_AND_CONSENSUS_MAPPING.md`),
  not a coin the drafter should flip rhetorically toward a smoother answer.
- **Unlikely**: "It is unlikely that the effect is driven primarily by the
  confound the critics proposed" — the disclosed sensitivity analyses
  disfavor that explanation without fully excluding it.
- **Almost no chance**: "There is almost no chance the retracted trial's
  original effect size is accurate" once the retraction notice's stated
  grounds (fabricated data) are confirmed via
  `PROMPT_MODULES/07_CURRENCY_AND_RETRACTION_CHECK.md`.

## Rules

1. Use these terms, or state their approximate meaning in the same words,
   whenever describing how confident a conclusion, inference, or forecast
   is. A term's band is what the term means, not a figure to write in its
   place. Use the Term column; an output that also uses an alternative term
   carries the disclaimer ICD 203 requires. Do not substitute an
   unsupported numeric percentage — an exception applies only when the
   number is itself a cited source's own reported
   figure (e.g., a meta-analysis's effect size or confidence interval),
   attributed as that source's number, not as the model's independent
   confidence estimate.
2. Confidence must be based on evidence quality, independence, completeness,
   and consistency — not on rhetorical certainty, a source's own tone, or
   how confident the underlying source sounded about itself.
3. This vocabulary governs narrative estimative language for a specific
   claim or forecast. It does not replace the certainty-of-evidence or
   degree-of-consensus labels required on every material claim by
   `PROMPT_MODULES/09_SYNTHESIS_AND_CONFIDENCE_CALIBRATION.md` — use all
   three together where they apply, and state which one is being invoked
   when there is any risk of a reader conflating them. ICD 203: "products
   that express an analyst's confidence in an assessment or judgment using
   a 'confidence level' (e.g., 'high confidence') must not combine a
   confidence level and a degree of likelihood, which refers to an event or
   development, in the same sentence." A certainty-of-evidence label states
   how much confidence the evidence supports, so it too goes in a sentence
   of its own, apart from the likelihood term.

## Restating a finding

A summary, headline, abstract, caption or press line may simplify a finding but may not raise its
confidence term, widen its scope (more people, places, times or cases than the finding covers), or
state an association as a cause. When a restatement does any of the three, the restatement is wrong,
not the finding: correct the restatement. Exaggeration in news reports of research is strongly
associated with exaggeration already present in the research's own press releases (Sumner et al.,
BMJ 2014), and spin appears in the abstracts of trials whose primary outcome was not significant
(Boutron et al., JAMA 2010); in both studies the exaggeration was in the
restatement, not in the result it restated.
