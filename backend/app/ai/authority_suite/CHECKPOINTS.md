# Checkpoints — Required Steps at Named Moments

A checkpoint is the smallest unit of doctrine: one step a piece of work must take at one
moment, the exceptions to it, and the record that shows it was taken. [CK-001] It is not a
reminder. A reminder whose record nothing reads is a prose rule, the kind that failed for
research plans until `trail.py` refused results before a PLAN and audit check 9 (b) read the
order (DIR-0039); a checkpoint names the record and the check that reads it (TR-0231). [CK-002]
Adopted by the maintainer on 2026-10-05 ("Unit + right of reply", DIR-0042). CP-02 and CP-03, carried by the Ethics and Harm System, were added on 2026-10-10 under
the maintainer's delegation (DIR-0043: “I mean whichever one is justified”).

## 1. The parts

Every checkpoint in §3 carries seven field lines, and audit check 64 fails one that lacks
any of them: [CK-003]

- `TRIGGER:` the moment, stated as what the work is about to produce, as `AGENTS.md`'s
  trigger table states its rows.
- `STEP:` what must be done before the work goes on. [CK-012]
- `EXCEPTIONS:` when the step may be left undone, and who decides; never the model. [CK-013]
- `RECORD:` the record the step leaves, by its prefix and the schema that defines it.
- `RULE:` the module rules that require the step, each naming the checkpoint's id.
- `TEST:` the suite test that exercises it.
- `SOURCES:` where the step comes from, each source's role stated.

## 2. Where a checkpoint sits

A checkpoint only adds a requirement, as a constraint overlay does (`OVERLAYS.md` §2), and no
checkpoint weakens a protected layer. [CK-004] Unlike an overlay it is not optional: it
applies whenever its trigger matches. [CK-005]

Each checkpoint is written into the system whose trigger covers its moment — the rule, the
record and the test live in that system's files, so the system still runs on its own
(DEC-0036) — and this file indexes them. [CK-006]

An exception goes to a person. The record names who decided it and why; the model drafts,
records and flags, and decides no exception itself. [CK-007] Since DIR-0043 the Ethics and
Harm System lays out and records the considerations behind the decisions to publish, to name, to
intrude and to breach a source's anonymity (its Modules 01–03); it decides none of them, and it
judges no exception to a checkpoint (its Standard and Module 04). [CK-014]

## 3. The checkpoints

### CP-01 — Right of reply

TRIGGER: about to deliver, for publication, a finding that accuses an identifiable person or organization or states adverse conduct by one (within `AGENTS.md`'s trigger row 2, so TAS carries it).
STEP: the subject is offered the chance to respond before publication — told what will be said and given time to answer — and the answer is reported in the work.
EXCEPTIONS: no approach is made only when a named person decides so and the record states why; the source's example is an approach that could compromise a criminal arrest. [CK-015] The model never decides an exception. [CK-016]
RECORD: `ROR-`, the Right-of-reply record in `systems/tas/EVALUATION/OUTPUT_SCHEMAS.md`.
RULE: `systems/tas/PROMPT_MODULES/08_CASE_SYNTHESIS.md` rule 10; `systems/tas/PROMPT_MODULES/10_FINAL_ACCURACY_AUDIT.md`, its right-of-reply check.
TEST: A62 in `systems/tas/EVALUATION/ADVERSARIAL_TEST_SUITE.md`.
SOURCES: PS-0130, Media Helping Media, "Fairness in journalism" — the origin (offer the right of reply when making allegations; exceptions checked with senior editors; a record of when, how and where the subject was approached and what they answered). PS-0241, IPSO Editors' Code, Clause 1 — related only: a fair opportunity to reply to significant inaccuracies, a correction standard after publication.
ADOPTED: 2026-10-05, the maintainer's choice (DIR-0042).

### CP-02 — Source protection

TRIGGER: about to contact, record, store, share or publish anything from or about a confidential source (EHS carries it).
STEP: a source-protection record is written before the step: a risk assessment for the source and for the journalist; identifying data minimised (only what the work needs kept, metadata stripped, files sent to as few people as possible, data deleted when the source asks, within legal and contractual obligations); a secure channel offered with its risks explained; before publication, every document, image, recording and quote checked for markers that could identify the source; the source named only by a code name in drafts and records. [CK-021]
EXCEPTIONS: anonymity is breached, or any part of the step left undone, only when a named person decides so and the record states who, when and why; the source's standard is the most exceptional circumstances. [CK-017] The model never decides an exception. [CK-018]
RECORD: `ESRC-`, the Source-protection record in `systems/ehs/EVALUATION/OUTPUT_SCHEMAS.md`.
RULE: `systems/ehs/PROMPT_MODULES/03_SOURCE_PROTECTION.md` rule 1 (with rules 2–9, which set what the record holds); `systems/ehs/PROMPT_MODULES/04_FINAL_ETHICS_CHECK.md` rule 4 checks the record exists before publication.
TEST: H05 in `systems/ehs/EVALUATION/ADVERSARIAL_TEST_SUITE.md` (H06, H11 and H12 also exercise it).
SOURCES: PS-0291, Posetti, Dreyfus and Colvin, "The Perugia Principles for Journalists Working with Whistleblowers in the Digital Age" (2019, via GIJN) — the origin of the protection steps it states (protect identity and breach anonymity only in the most exceptional circumstances; secure first contact with each channel's risks explained; threat-modelling for journalist and source; scrub metadata and limit who receives files; delete source data on request within obligations). PS-0276, Julie Posetti, MediaShift (2017), summarising the UNESCO study — supporting: surveillance, data retention, intermediary handover and metadata expose sources; it does not itself recommend minimisation. [CK-022] PS-0277, IJNet (2018) — supporting: platforms can release sensitive data under pressure. PS-0241, IPSO Editors' Code, Clause 14 — related: a moral obligation to protect confidential sources. PS-0109, Dahl et al. (2024) — indirect only, for keeping the breach decision with a person: models cannot tell when they are wrong, and the authors caution against unsupervised use in legal tasks. [CK-023] Two parts of the step rest on no source: keeping only the identifying data the work needs is an inference from the exposure routes PS-0276 describes, and the code name in drafts is this checkpoint's design (AUDIT_EHS_2026-10-10, BROKEN-5).
ADOPTED: 2026-10-10, under the maintainer's delegation (DIR-0043: “I mean whichever one is justified”).

### CP-03 — Publication ethics record

TRIGGER: about to deliver for publication material that intrudes on privacy, concerns a minor or vulnerable person, or could cause serious harm (EHS carries it).
STEP: a public-interest and proportionality record exists, written and dated before publication: the specific public interest served with reasons from the story, kept apart from what interests the public, weighed against each intrusion and harm, with intrusion only as far as the public interest needs. A final ethics check then confirms that record predates publication and is not retrospective, the harm assessment covers everyone the material names or makes identifiable, a source-protection record exists where a confidential source is involved, and, where the material accuses an identifiable person or organization, a right-of-reply record (CP-01) whose answer is reported or whose reply period has ended, or a person's recorded decision not to approach, exists. [CK-024] The check's verdict is READY FOR DECISION or NOT READY, never "approved"; the publication decision is recorded with the named person who made it and the date, in the final check's record, which is the decision of record, with the public-interest record's decision written to match. [CK-025]
EXCEPTIONS: material goes for publication without the record, or with a NOT READY verdict, only when a named person decides so and the record states who, when and why; a record written after publication is marked retrospective and does not satisfy the step. [CK-019] The model never decides an exception or the publication. [CK-020]
RECORD: `EPIT-`, the Public-interest and proportionality record in `systems/ehs/EVALUATION/OUTPUT_SCHEMAS.md`; the final check leaves an EFIN- record in the same file.
RULE: `systems/ehs/PROMPT_MODULES/04_FINAL_ETHICS_CHECK.md` rule 1 (rules 2–7 set the checks); `systems/ehs/PROMPT_MODULES/01_PUBLIC_INTEREST_AND_PROPORTIONALITY.md` rule 9 (rules 1–8 set what the record holds).
TEST: H09 in `systems/ehs/EVALUATION/ADVERSARIAL_TEST_SUITE.md` (H10 and H12 also exercise it).
SOURCES: PS-0241, IPSO Editors' Code, the Public Interest section — the origin (public-interest exceptions only where shown; editors must show publication was proportionate and explain how they reached the decision at the time; an exceptional public interest for children under 16). [CK-026] PS-0284, Brian Cathcart, Inforrm (2011) — the limit that shaped the step: the public interest is retro-fitted after the fact and the hard part is proportionality, so reasons are recorded at the time. PS-0285, Wendy Collinson, Ethical Journalism Network (2012) — supporting: public interest is not what the public is interested in; hard decisions at the highest editorial level (indirect support for the decision staying with a person). [CK-027] PS-0275, Ofcom Broadcasting Code Section Eight — supporting: the public interest must outweigh privacy in the specific circumstances, and the means of gathering must be proportionate. [CK-028] PS-0135, SPJ Code of Ethics — supporting: unavoidable harm is accepted in proportion; minors and vulnerable people get heightened sensitivity. PS-0109, Dahl et al. (2024) — indirect only, for keeping the decision with a person.
ADOPTED: 2026-10-10, under the maintainer's delegation (DIR-0043: “I mean whichever one is justified”).

## 4. Adding a checkpoint

A session may propose a checkpoint in `papertrail/project/PROPOSALS.md` with its seven
parts; it enters §3 only when the maintainer adopts it, recorded as a directive or a `DEC-`.
[CK-008] Its rule, record and test are written in the owning system in the same change, so
check 64 passes from the entry's first audit. [CK-009]

## 5. What is checked

Audit check 64 reads §3. Every `CP-` entry carries the seven field lines; the prefix its
RECORD names is defined in the named schema and listed on `INTEROP.md` §7's row for that
system; every file its RULE names exists and contains the checkpoint's id; and the test its
TEST names is a heading in the named suite whose text contains the id. [CK-010] The check does
not see whether the step was taken in any piece of work: that is the record's job and the
owning system's final audit (TAS Module 10 for CP-01; EHS Module 04 for CP-02 and CP-03). [CK-011]
