# Calibrated Confidence Language

*Part of Logic Authority System (LAS) — v0.1.*

## Purpose

Vague confidence words ("high," "likely," "probably") mean different things to different readers of the same report. This file defines one shared vocabulary for every module's confidence and verdict language, adapted from the U.S. Intelligence Community's standardized words of estimative probability (ICD 203) and shared with TAS and RAS.

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

ICD 203 (https://archive.dni.gov/files/documents/ICD/ICD-203.pdf) prints the first three columns as rows, two alternative term sets over the bands, and says: "Analysts are strongly encouraged not to mix terms from different rows. Products that do mix terms must include a disclaimer clearly noting the terms indicate the same assessment of probability." LAS uses the Term column; an output that also uses an alternative term carries that disclaimer.

## Applying this vocabulary to argument evaluation

TAS uses this vocabulary for how confident an *investigative conclusion* is. LAS uses the same terms for how confident *the verdict about the argument itself* is — its validity, its inductive/abductive strength, or its overall quality — never for how likely the argument's conclusion is to be true (Rule 4).

Worked examples:

- **Validity is deductive, not probabilistic — confidence in the finding is not.** Validity is binary given the stated premises (`CORE/LAS_PROMPT_ENGINEERING_STANDARD.md` §4.4); how confident the evaluator is that a VALID or INVALID verdict is right is not, since a formalization can be uncertain (Module 02 rule 2), and is stated with this vocabulary (rule 1). It also states *inductive or abductive strength* (§4.5): "the premises make the conclusion **likely**, but a real alternative explanation — the observed rise coincided with an unrelated policy change — remains" is a properly calibrated inductive-strength statement; "the argument proves its conclusion" is not.
- **Confidence in a fallacy finding.** "This passage is **almost certainly** an ad hominem — the paragraph addresses only the speaker's past conduct and never engages the claim" is calibrated; "this is definitely a fallacy" is not, unless the mechanism is that unambiguous.
- **Confidence that a scheme is used well.** "It is **likely** this argument from expert opinion holds up — the economist works on this policy area and matches a stated consensus, though a named dissenting camp goes unaddressed" is calibrated; a bare "this appeal to authority is fine" is not.

## Rules

1. Use these terms, or state their approximate meaning in the same words, whenever describing how confident a validity, inductive-strength, fallacy, or verdict finding is. A term's band is its meaning, not a figure to write in its place: do not substitute an unsupported numeric percentage.
2. Confidence must be based on the mechanism actually identified — how directly the passage matches a fallacy's definition, how completely a scheme's critical questions were answered, how cleanly the premises support the conclusion's exact scope — not on rhetorical certainty, source tone, or how confident the arguer sounded.
3. This vocabulary governs narrative confidence language about the argument's structure. It maps onto the three-value `confidence` field (`LOW|MEDIUM|HIGH`) on a Verdict record (`EVALUATION/OUTPUT_SCHEMAS.md`) one term to one value: almost certain, very likely and likely → HIGH; roughly even chance → MEDIUM; unlikely, very unlikely and almost no chance → LOW. Apply the term to the verdict the record states, never to its negation: "almost no chance this is an ad hominem" is recorded as the verdict that no ad hominem is present, at almost certain → HIGH. LOW therefore means the record's own verdict is disfavored by the evidence — advanced only as the best explanation on offer, and said so. LOW does not arise for a two-valued verdict (fallacy present or absent), whose favored value is the one stated; only a many-valued one — the composite verdict, or a validity verdict of NOT CLEANLY FORMALIZABLE against VALID / INVALID — can be LOW (the three-value field exists on the Verdict record only). The mapping loses information — HIGH does not say whether the term was likely or almost certain — so record the term itself in the Verdict record's `Confidence term` field, and never reconstruct it from the three-value field. Records from before 2026-10-03 keep their five-term values. Do not combine a confidence level (HIGH, "high confidence") and a term in one sentence (ICD 203).
4. Never let this vocabulary's application to the argument's *structure* bleed into an implied confidence about the conclusion's *truth*. A clean validity and fallacy audit supports at most "the reasoning holds **if the premises are true**" (`CORE/LAS_PROMPT_ENGINEERING_STANDARD.md` §2.3, Rule 13); never write "likely true" for a conclusion that was only shown to be validly reasoned.

## Restating a finding

A summary, headline, abstract, caption or press line may simplify a finding but may not raise its
confidence term, widen its scope (more people, places, times or cases than the finding covers), or
state an association as a cause. When a restatement does any of the three, the restatement is wrong,
not the finding: correct the restatement. Exaggeration in news reports of research is strongly
associated with exaggeration already present in the research's own press releases (Sumner et al.,
BMJ 2014), and spin appears in the abstracts of trials whose primary outcome was not significant
(Boutron et al., JAMA 2010); in both studies the exaggeration was in the
restatement, not in the result it restated.
