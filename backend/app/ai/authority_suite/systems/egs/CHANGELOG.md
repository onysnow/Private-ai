# Changelog

## 2026-10-10 — DIR-0046: named a support system

- README.md: EGS is named a support system (status line; "Where EGS's job ends"): it serves the authority systems and issues no authority judgement; it obtains evidence and does not judge it. The maintainer's choice, DIR-0046; no rule changed.

## 2026-10-10 — DIR-0045: terms defined from published sources (T-0371)

- Standard §9 "Terms": "risks loss" (online content can be removed or edited, GS-10; a stated retention or destruction date or a person's stated unavailability, logic), "last resort" for a leading question (only after open-ended and then specific-closed questions on the point have not produced the information, GS-05, re-read), and "materiality to the story" (logic; no published definition found).
- Module 01 rules 5 and 6 and Module 03 rule 5 point to Standard §9.
- SOURCE_INDEX.md: GS-19 (Federal Rules of Evidence 611(c)) and limit 5, courts against interview guidance.

## 2026-10-10 — v0.1, built under DIR-0043

- Built the Evidence Gathering System (EGS) under PROP-0007's cost limits: `CORE/EGS_STANDARD.md`,
  `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`, five modules (01 Evidence Plan, 02 Public-Records
  Requests, 03 Interview Planning and Conduct, 04 Online Collection and Preservation, 05 Gathering
  Log and Final Gathering Check), the module catalog, a template library (T00–T02), output schemas
  for GPLN, GREQ, GINT, GCAP and GLOG records, an adversarial test suite (E01–E10, gate E03, E04,
  E05, E06, E09), a source index (GS-01 to GS-18), README and LICENSE.
- Four limits from the disconfirming searches bound the rules: open questioning raises some
  incorrect detail; the PEACE label does not show practice; old guides' deadlines are superseded;
  misinformation effects are weaker in the field.
- Not built, by design: prompt QA rubric, project-instructions template, build plan.
- Second-reader fixes (same day): citations narrowed to what the notes support (Module 01 rule 2,
  Module 03 rules 6 and 8, Module 05 rules 3 and 5); Module 02 rule 6 marks the US 20-day figure as
  from a 2009 guide; Module 03 rule 9 records the days between events and interview and the reason
  for any delay, and its output adds event and interview dates; Module 04 rule 10 drops the
  chain-of-custody sentence; Module 05 rule 7 checks every item of Standard §5 and reads outcomes
  from the log; Module 05 rule 9 defines COMPLETE as every point obtained and adds IN PROGRESS for
  pending points with a next step and date; Standard §3 routes archive, court, private and bought
  records, and §4 says plan status tracks work, not outcome; schemas add per-record GREQ outcomes,
  GPLN `revisions`, and GINT `interview_date` and `notes_written_at`; source index notes how the
  GS-18 authors were sourced. Tests renamed E01–E10.

## 2026-10-10 — DIR-0044: fixes from the first audit (AUDIT_EGS_2026-10-10)

- MISSING-1: GPLN status gains `NOT_SOUGHT`, with `status_reason` required (Module 01 rule 8, schemas).
- MISSING-2: GLOG gains `next_step` and `next_step_date`, required while PENDING (Module 05 rule 1).
- MISSING-3, MISSING-4: a "Final gathering check" schema example (`failed_checks`, `verdict`, `basis`,
  `fresh_context`, no new prefix); Module 05 rule 11 runs the check in a fresh context and says so.
- MISSING-5: `leading_questions` holds `{text, answer_marked_led}`; `claims[]` gains `led`.
- MISSING-6: GPLN gains `existence_likelihood` (term with band); Module 01 rule 4 states it; the
  confidence file says the plan item names what the estimate rests on.
- MISSING-7, BROKEN-3: Module 05 INPUTS add the GLOG entries; rule 7 checks items with no GREQ, GINT
  or GCAP from their GLOG entry.
- MISSING-8: GPLN gains `upstream_refs`; Module 01 takes [UPSTREAM] IDs and rule 1 links them.
- MISSING-9: Module 03 INPUTS add the account so far [ACCOUNT].
- BROKEN-1: Standard §5(3)–(4) and Module 05 rule 7(3)–(4) apply to records whose outcome is
  obtained; other outcomes need their reason (§5(5)).
- BROKEN-2: Standard §4 states a point's outcome from its items; Module 05 rule 9 adds "not sought
  with a reason" to COMPLETE WITH GAPS.
- BROKEN-4: catalog and T01 step 2 route archive, court, private and bought records to Module 05.
- BROKEN-5: Standard §2.6 and Module 02 rule 7 say how a superseded named source is replaced: the
  superseding provision with its locator, marked "not named by the requester", confirmed by the
  requester.
- BROKEN-6: Standard §6 defines plan point, item, record and EGS record; GPLN statuses OBTAINED and
  UNABLE_TO_OBTAIN renamed DONE and STOPPED; §2.5 defines a finding as a reported gap.
- BROKEN-7: SOURCE_INDEX "Not read" excepts GS-13 from "relayed".
- BROKEN-8: Module 05 rule 9 marked "(logic)".
- BROKEN-9: E01 covers Module 01 rule 1; E06's Pass checks Module 03 rule 9's dates and delay reason.
- BROKEN-11: GINT `claims[].status` has one value, UNCORROBORATED, handed on unweighed (Module 03
  rule 10, schemas).
- BROKEN-13: a PENDING GLOG entry is not yet a finding (`reported_as_finding` false).
- BROKEN-14 (part): Module 04 rule 2 drops "probative"; Standard §4 defines "no reply" by a deadline
  in the record or a wait the plan records.
- UNTESTED-2: tests E11 (a failed capture and a declined interview give COMPLETE WITH GAPS; a pending
  item with a next step and date gives IN PROGRESS) and E12 (instruction inside an agency reply),
  with Coverage rows; the suite stays within twelve tests.
- UNTESTED-3: GPLN `order_exception_reason` (Module 01 rule 5) and GCAP `first_used` (Module 04
  rule 1); GCAP custody entries gain `reason`.
- UNSOURCED-1: Module 03 rule 1 cites GS-05 for key witnesses and logic for every interview.
- UNSOURCED-2, -3, -4: unsupported parts of Module 01 rules 3, 6, 8, 9, Module 05 rules 2, 3 and
  Module 04 rules 3, 6, 7 marked "(logic)" or pointed to the Standard.
- UNSOURCED-5: the PEACE-transfer limit cites GS-07 only.
- UNSOURCED-6: Module 01 rule 10 cites GS-10 for the legality principle (2026-10-02 reading of
  paras 14, 28, 38–39); GS-10's row and Rules column updated.
- No rule number moved; Module 05 gains rule 11.
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`: the "Restating a finding" section's last sentence now reads "in both studies the exaggeration was in the restatement, not in the result it restated", the same in every system (audit check 65; AUDIT_EHS_2026-10-10 UNSOURCED-5).
