# Output Schemas

*Part of Evidence Gathering System (EGS).*

One example per record type, plus the final check. Projects may add fields but do not change a field's meaning. Outcome
values are those of Standard §4: `OBTAINED`, `REFUSED`, `NOT_HELD`, `NO_REPLY`, `UNABLE_TO_OBTAIN`,
and the working status `PENDING`.

## Evidence-plan item (Module 01)

```json
{
  "plan_item_id": "GPLN-0001",
  "upstream_refs": [],
  "hypothesis": "",
  "point_to_establish": "",
  "confirms_if": "",
  "refutes_if": "",
  "record_or_testimony": "",
  "holder": "",
  "route": "RECORDS_REQUEST",
  "existence": "BELIEVED",
  "existence_basis": "",
  "existence_likelihood": null,
  "type": "DOCUMENT",
  "priority": "HIGH",
  "priority_reason": "",
  "order_exception_reason": null,
  "status": "PLANNED",
  "status_reason": null,
  "alternative_route": null,
  "superseded_by": null,
  "revisions": [
    {"date": "YYYY-MM-DD", "change": "", "evidence": ""}
  ],
  "linked_records": []
}
```

`route` is `RECORDS_REQUEST`, `INTERVIEW`, `ONLINE_CAPTURE`, `ARCHIVE_OR_COURT`, `PURCHASE` or
`OTHER`. `upstream_refs` holds the IDs of the records the point came from, as written by the system
that produced them. `existence` is `KNOWN` or `BELIEVED`; `existence_likelihood`, when an estimate is
given, is a term with its band, such as "likely (55–80%)", resting on `existence_basis`. `type` is
`DOCUMENT`, `PERSON` or `ONLINE`. `order_exception_reason` is set when a person is approached before
the records that check their account (Module 01 rule 5). `status` is `PLANNED`, `SOUGHT`, `DONE`,
`STOPPED` or `NOT_SOUGHT`; `STOPPED` and `NOT_SOUGHT` need `status_reason`. `status` tracks work
only: outcomes are held in the GLOG entries, and Module 05 reads the point's outcome from them
(Standard §4). `revisions` records each change under Module 01 rule 9.

## Records request (Module 02)

```json
{
  "request_id": "GREQ-0001",
  "plan_item_ids": ["GPLN-0001"],
  "body": "",
  "jurisdiction": "",
  "law_or_guidance": null,
  "request_text": "",
  "records_described": [
    {"subject": "", "date_range": "", "record_type": "", "format": "", "outcome": "PENDING"}
  ],
  "sent": {"date": "YYYY-MM-DD", "method": "", "proof_kept": ""},
  "tracking_number": null,
  "deadlines": [
    {"event": "REPLY", "date": null, "source": "deadline not established"}
  ],
  "fees": {"category_claimed": null, "waiver_sought": false, "maximum_stated": null},
  "exemptions_cited": [],
  "narrowing": [],
  "appeal": {"route": null, "deadline": null, "grounds": []},
  "outcome": "PENDING",
  "outcome_wording": null,
  "copies_kept": ""
}
```

`deadlines[].event` is `REPLY`, `EXTENSION`, `APPEAL_OR_REVIEW`, `REGULATOR_OR_MEDIATION` or
`OTHER`; each `source` cites the law or guidance, or reads "deadline not established". Each
`records_described[].outcome` holds that record's outcome, so a partial release is `OBTAINED` for the
part released and `REFUSED` for the part withheld (Standard §4); the top-level `outcome` summarises.

## Interview (Module 03)

```json
{
  "interview_id": "GINT-0001",
  "plan_item_ids": ["GPLN-0002"],
  "interviewee": "",
  "plan": {"topics": [], "records_to_check_against": [], "lead": "", "written_on": "YYYY-MM-DD"},
  "told_and_agreed": {"text": "", "time": ""},
  "recording": "AUDIO",
  "start_time": "",
  "end_time": "",
  "event_date": "",
  "interview_date": "YYYY-MM-DD",
  "days_between": null,
  "delay_reason": null,
  "notes_written_at": null,
  "leading_questions": [
    {"text": "", "answer_marked_led": true}
  ],
  "claims": [
    {"claim": "", "led": false, "status": "UNCORROBORATED", "check_source": ""}
  ],
  "closure_corrections": [],
  "evaluation": {"covered": [], "not_covered": [], "question_errors": []},
  "outcome": "OBTAINED"
}
```

`recording` is `AUDIO`, `CONTEMPORANEOUS_NOTES` or `RECONSTRUCTED_NOTES`; `notes_written_at` is set
for `RECONSTRUCTED_NOTES`. `claims[].status` has one value, `UNCORROBORATED`: EGS hands each claim on
unweighed (Standard §1). `claims[].led` is `true` for an answer to a leading question (Module 03
rule 5).

## Online capture (Module 04)

```json
{
  "capture_id": "GCAP-0001",
  "plan_item_ids": ["GPLN-0003"],
  "url": "",
  "page_source_file": "",
  "capture_file": "",
  "tool_and_version": "",
  "collector": "",
  "start_time": "",
  "end_time": "",
  "displayed_metadata": {"uploader": "", "posted": "", "uploaded": "", "note": "as displayed, not verified"},
  "hash": {"algorithm": "SHA-256", "value": ""},
  "original_location": "",
  "working_copies": [{"location": "", "hash": ""}],
  "custody_log": [{"person": "", "time": "", "action": "", "reason": "", "storage": ""}],
  "content_verified": "not done by this system",
  "first_used": null,
  "outcome": "OBTAINED",
  "failure_reason": null
}
```

## Gathering-log entry (Module 05)

```json
{
  "log_id": "GLOG-0001",
  "plan_item_id": "GPLN-0001",
  "item": "",
  "holder": "",
  "route": "RECORDS_REQUEST",
  "date_sought": "YYYY-MM-DD",
  "date_of_outcome": null,
  "outcome": "NOT_HELD",
  "reason": "",
  "record_ids": ["GREQ-0001"],
  "next_step": null,
  "next_step_date": null,
  "reported_as_finding": true
}
```

`next_step` and `next_step_date` are required while `outcome` is `PENDING`. `reported_as_finding` is
`true` for every outcome other than `OBTAINED`; a `PENDING` entry is not yet a finding and is
`false`.

## Final gathering check (Module 05)

```json
{
  "plan_item_ids": ["GPLN-0001"],
  "log_ids": ["GLOG-0001"],
  "failed_checks": [
    {"check": "5(3)", "record": "GINT-0001", "failure": ""}
  ],
  "verdict": "COMPLETE_WITH_GAPS",
  "basis": "",
  "fresh_context": true,
  "checked_at": "YYYY-MM-DD"
}
```

No new prefix: the check is identified by the run. `failed_checks[].check` names the Standard §5
item. `verdict` is `COMPLETE`, `COMPLETE_WITH_GAPS`, `IN_PROGRESS` or `INCOMPLETE` (Module 05 rule
9). `fresh_context` states whether rules 7 and 9 ran in a fresh context (Module 05 rule 11).
