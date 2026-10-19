# Changelog

*Ethics and Harm System (EHS)*

## 2026-10-12 — DIR-0049: a retrospective record does not satisfy CP-03 (T-0376)

`PROMPT_MODULES/01_PUBLIC_INTEREST_AND_PROPORTIONALITY.md` rule 3 now says a retrospective record does not satisfy CP-03 (Module 04 rule 2) and that the record says so wherever it is delivered. Before, the consequence lived only in Module 04, which a task writing the record after publication does not run, so gate case H01 could not be passed by following Module 01 (RUN-0023, T-0376). The maintainer's approval: DIR-0049.

## 2026-10-10 — DIR-0046: named a support system

- README.md: EHS is named a support system (status line; a lead-in under "Where EHS's job ends"): it serves the authority systems and issues no authority judgement; it lays out and records the ethics weighing and decides nothing. The maintainer's choice, DIR-0046; no rule changed.

## 2026-10-10 — DIR-0045: terms defined from published sources (T-0372)

- Standard §8 "Terms": "minor" is a person under 18 (ES-19, ES-20; it was "under 16", IPSO's age, which still applies where that code governs, ES-01); "confidential source" is a source the journalist has agreed not to identify (ES-02, re-read, ES-21), with a source who asks treated as one until a named person decides (design); "serious harm" has no general published threshold (RL-0024), so the EHRM entry records the reasons, and the one statutory test found covers reputation only, in UK law (ES-22).
- Module 01 rule 7 and Module 02 rule 2 use "minor (Standard §8)" in place of "under 16".
- SOURCE_INDEX.md: ES-19 to ES-23 and limit 5, the law protecting more than confidential sources.

## 2026-10-10 — v0.1, built under DIR-0043

Built under the maintainer's directive DIR-0043 (PROP-0007), the form chosen under his
delegation ("I mean whichever one is justified"): a small system of judgement modules
whose required steps are checkpoints.

- `CORE/EHS_STANDARD.md` and `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`, the load.
- Four modules: 01 Public Interest and Proportionality, 02 Harm Minimisation, 03 Source
  Protection (carries CP-02), 04 Final Ethics Check (carries CP-03).
- Record prefixes EPIT-, EHRM-, ESRC-, EFIN- in `EVALUATION/OUTPUT_SCHEMAS.md`.
- Tests H01–H10, with a regression gate of H01, H04, H05, H09, H10.
- Template library with T00, T01, T02.
- `SOURCE_INDEX.md` with ES-01 to ES-16 and a "Limits and gaps" section: two limits from the disconfirming searches and two gaps found in reading.
- No QA rubric, project-instructions template or build plan ("small first").

### Second reader's fixes, same day

- `SOURCE_INDEX.md`: limit 1 cites ES-08 alone; the section is "Limits and gaps" (limits 3–4 are gaps found in reading); ES-06 added to "Not read"; ES-16 notes the authors come from general knowledge; the logic note covers Module 03 rules 4 and 6.
- Standard §2.5 and Module 01 rule 8: "already public" / "prior publication" dropped from the ES-02 citation (Module 01 rule 6 keeps it, citing ES-01).
- Module 03 rule 4: "keep only what the work needs" marked as an inference from ES-04 and logic; ES-10 kept for metadata, recipients, deletion. Rule 6: markers other than metadata marked (logic).
- Module 04 rule 6: only a decision other than PENDING with no named person or date is a defect.
- Module 02 rules 2–3 rewritten as recorded steps.
- Module 01 rule 3 and the EPIT- schema: retrospective when public interest, reasons, elements or weighing change after publication; `revised_at` added.
- Schemas: ESRC- `breach_decision` is PENDING | NONE | BREACH, default PENDING, with `steps_waived` and `decision_reason`; EHRM- gains `written_at`.
- Catalog: Module 02 runs whenever anyone is named or identifiable, public figures included.
- H05 targets Module 03 rules 1, 4 and 8; H07 follows the new Module 02 rule 3. No rule was renumbered.

## 2026-10-10 — DIR-0044: fixes from the first audit (AUDIT_EHS_2026-10-10)

- MISSING-1, -2, -6: every record carries `decision_reason`, `decision_confirmed_by`, `missing_inputs` and `rules_not_applied`; Module 04 rule 7 records the reason; Standard §7 and Module 04 rule 6 name `decision_confirmed_by`.
- MISSING-3: ESRC- gains `items_checked`; Module 03 rule 6 fills it; Module 04 rule 4 compares it with the material.
- MISSING-4: Module 01's OUTPUT lists story_id, harm_ids and the public-figure, child and lawful-access notes.
- MISSING-5: Module 03 rule 9 covers any part of rules 2–8 left undone, recorded in `steps_waived`; Module 04 rule 6 reads it.
- MISSING-7: ESRC- gains `story_id`; Module 03 takes it as an input.
- MISSING-8: EFIN- `publication_decision`, `checks[].result` (MET / NOT_MET) and `right_of_reply` value `NONE` defined.
- MISSING-9: T01 takes how each person was approached and the right-of-reply record or decision not to approach.
- BROKEN-1: Module 03's OUTPUT gives the breach decision as PENDING or the person's NONE or BREACH.
- BROKEN-2: EFIN- `publication_decision` is the decision of record; EPIT- `decision` is written at the same time; Module 04 rule 6 lists a mismatch.
- BROKEN-3: Module 04 rule 5 accepts a right-of-reply record only when the answer is reported or the reply period has ended.
- UNTESTED-2: tests H11 (Module 03 rule 9, Standard §7) and H12 (Module 04 rule 4); the Coverage section lists the rules no test reaches.
- UNSOURCED-1, -2, -3: Module 03 rules 8 and 1 and Module 02 rules 1 and 6 mark their unsourced parts as design or logic; `SOURCE_INDEX.md`'s note names them.
- UNSOURCED-4: ES-17 (PS-0131) and ES-18 (PS-0132) added and cited at Standard §7.
- No rule was renumbered.
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`: the "Restating a finding" section's last sentence now reads "in both studies the exaggeration was in the restatement, not in the result it restated", the same in every system (audit check 65; AUDIT_EHS_2026-10-10 UNSOURCED-5).
