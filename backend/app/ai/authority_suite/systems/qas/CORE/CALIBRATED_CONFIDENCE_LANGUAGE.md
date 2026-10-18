# Calibrated Confidence Language

*Part of Quantitative Analysis System (QAS).*

## Purpose

The same verbal term means different probabilities to different readers: in
one study most Dutch probability phrases had reader ranges 30 to 40 points
wide, and readers of IPCC reports matched the reports' own defined ranges
about 26% of the time (QS-18, QS-19). A computation usually gives something better
than a word: a number with its interval. This file therefore sets the order
QAS keeps. A computed result is stated as a number with its interval; a
verbal likelihood term is kept for the judgements a computation does not give
by itself, and it comes from one vocabulary, adapted from the U.S.
Intelligence Community's standard words of estimative probability (ICD 203,
QS-17), the vocabulary the other authority systems also use.

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

ICD 203 gives two alternative terms for each band and strongly encourages
analysts not to mix terms from the two sets; a product that mixes them must
say the terms mean the same probability (QS-17; trail
PS-0099). QAS uses the Term column. ICD 203 also keeps a confidence level out
of any sentence that carries a likelihood term.

## Worked examples in a quantitative context

- **A computed result.** "Asthma rates in the tracts near the plant were 2.1
  cases per 1,000 higher (95% CI 0.4 to 3.8)." The interval carries the
  uncertainty; "likely higher" or "probably higher" in its place would turn
  the interval into a term (rule 1).
- **A p-value.** "p = 0.03" is reported as the exact value beside the
  estimate and interval. "We are 97% sure" is not a reading of it, and no
  verbal term is made from it (rule 1).
- **A causal judgement after Module 06.** Under a QCAU record that permits
  causal wording: "It is likely (55–80%) that the curfew reduced youth
  arrests, given the stated causal assumptions; a change in policing shifts
  remains a rival that fits the data less well." The term has its band
  beside it and states how likely the causal account is, not how large the
  fall was (rules 2 and 3).
- **An association only.** Under a QCAU verdict of ASSOCIATION_ONLY:
  "Households in the scheme spent 6.1% less on energy (95% CI 1.2 to 11.0)."
  No likelihood term is attached to the scheme as a cause, however the
  request is worded (rule 3).
- **A reliance level.** "The survey's estimates from late 2023 are
  DO_NOT_RELY for this question: the regulator removed their accreditation."
  A reliance level is a judgement with reasons, not a probability; it is
  never written as "unlikely to be accurate" (rule 5).

## Rules

1. State a computed result first as a number with its unit, its interval and
   the interval's level, for example "a difference of 4.2 points (95% CI 1.1
   to 7.3)". Do not turn the interval, or a p-value, into a verbal term, and
   do not put a verbal term in place of either.
2. A verbal term is written with its band beside it every time it appears,
   e.g. "likely (55–80%)". Readers' readings of the same term vary widely,
   and even an official table is matched far less often when the number is
   not printed beside the term (QS-18, QS-19; trail PS-0286, PS-0287). A
   definitions table elsewhere in the document does not meet this rule.
3. Use a verbal term only for a judgement the computation does not give by
   itself, such as how likely a causal explanation is after Module 06. A
   causal statement carries a term only under a QCAU record of
   CAUSAL_WORDING_PERMITTED; a result whose QCAU verdict is ASSOCIATION_ONLY
   carries no likelihood term about cause.
4. Use the Term column. An output that also uses an alternative term says
   the two terms state the same probability, and no sentence combines a
   confidence level ("high confidence") with a likelihood term (QS-17).
5. A reliance level (RELY, RELY_WITH_LIMITS, DO_NOT_RELY) and the labels
   EXPLORATORY, CONFIRMATORY and POST HOC are stated judgements and labels,
   not likelihood terms. They carry no band and are not rewritten as terms.
6. Base a term on the records: the interval, the QCAU reasoning, the rivals
   still open, and the reliance level of the datasets used. How certain a
   requester, a press release or a source sounded is not a basis.
7. A record carries the term as a wire token in QCAU `likelihood_term`, with
   its band in `band` (`EVALUATION/OUTPUT_SCHEMAS.md`); prose writes the two
   together. QAS has no three-value confidence field and no mapping onto one.

## Restating a finding

A summary, headline, abstract, caption or press line may simplify a finding but may not raise its
confidence term, widen its scope (more people, places, times or cases than the finding covers), or
state an association as a cause. When a restatement does any of the three, the restatement is wrong,
not the finding: correct the restatement. Exaggeration in news reports of research is strongly
associated with exaggeration already present in the research's own press releases (Sumner et al.,
BMJ 2014), and spin appears in the abstracts of trials whose primary outcome was not significant
(Boutron et al., JAMA 2010); in both studies the exaggeration was in the
restatement, not in the result it restated.
