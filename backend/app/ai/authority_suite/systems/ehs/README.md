# Ethics and Harm System (EHS)

**v0.1 — 2026-10-10, built under DIR-0043. A support system since DIR-0046 (2026-10-10): it serves the authority systems and issues no authority judgement; it lays out and records the ethics weighing and decides nothing.**

EHS is a model-agnostic prompt doctrine for the judgements in journalism and research that
are not about truth: whether publishing serves a public interest in proportion to its
harm, how harm to private people, minors, vulnerable people and victims of trauma is kept
as low as the story allows, how a confidential source is protected, and whether the ethics
records exist before material goes for publication.

EHS lays out the considerations and records the reasoning. The decision to publish, to
name a private person or a minor, to intrude on privacy, or to breach a source's
anonymity is a named person's, written into the record with the date. The model drafts,
records and flags, and decides none of these.

Its required steps are two checkpoints: **CP-02 Source protection** (Module 03) and
**CP-03 Publication ethics record** (Module 04, with the record Module 01 writes).

## Where EHS's job ends

EHS is a support system: it lays out and records the ethics weighing for a named person and
issues no authority judgement. The authority judgements are other systems' jobs:

- Whether a specific claim is true, given case evidence, is TAS's job. TAS also carries
  CP-01, the right of reply; EHS's final check confirms only that its record, or a
  person's recorded decision not to approach, exists.
- Whether a body of research was searched and weighed honestly is RAS's job.
- Whether an argument holds together is LAS's job.
- Whether a decision was made well, as a process, is DAS's job. EHS sets out an ethics
  decision for a person; it does not audit how that person decided.
- Any answer that rests on numbers or on testing a theory against data is QAS's job.
- How primary evidence is obtained and preserved (records requests, interviews, online
  collection) is EGS's job. EHS starts when that gathering, or the material it produced,
  could harm someone or expose a source.

## Structure

- `CORE/EHS_STANDARD.md` — principles, the pipeline, checkpoints, the completion standard,
  record IDs, untrusted content.
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` — the seven-term vocabulary with bands, writing
  a term with its band, restating a finding, and why a harm or public-interest judgement
  is not a probability.
- `PROMPT_MODULE_CATALOG.md` — the four modules and routing.
- `PROMPT_MODULES/01_PUBLIC_INTEREST_AND_PROPORTIONALITY.md`
- `PROMPT_MODULES/02_HARM_MINIMISATION.md`
- `PROMPT_MODULES/03_SOURCE_PROTECTION.md` (CP-02)
- `PROMPT_MODULES/04_FINAL_ETHICS_CHECK.md` (CP-03)
- `PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md` — invocation block and
  templates T00 Router, T01 Full pipeline, T02 Source protection.
- `EVALUATION/OUTPUT_SCHEMAS.md` — EPIT-, EHRM-, ESRC-, EFIN- records.
- `EVALUATION/ADVERSARIAL_TEST_SUITE.md` — tests H01–H12, the regression gate, coverage.
- `SOURCE_INDEX.md` — sources ES-01 to ES-18, the limits and gaps, what was not read.
- `CHANGELOG.md`, `LICENSE`.

A PROMPT_QA_RUBRIC, a PROJECT_INSTRUCTIONS_TEMPLATE and a BUILD_PLAN are deliberately
absent. Under PROP-0007's "small first" they are added only when a recorded run shows a
gap they would close.

## Core rules (summary; full text in `CORE/EHS_STANDARD.md` §2)

- A named person decides; the model writes PENDING in every decision field.
- The public-interest reasoning and the weighing are written and dated before publication.
- Proportionality with recorded reasons, not an absolute "do no harm".
- What interests the public carries no weight.
- Lawful access is a fact, not a justification.
- A harm or public-interest judgement is a reasoned weighing, not a probability.

## License

Creative Commons Attribution 4.0 International (CC BY 4.0); see `LICENSE`.

## Sources

`SOURCE_INDEX.md`.
