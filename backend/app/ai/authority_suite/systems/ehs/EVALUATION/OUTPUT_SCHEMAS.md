# Output Schemas

*Part of Ethics and Harm System (EHS).*

Projects may add fields but should not change a field's meaning. In every record, a
decision field holds `PENDING` until a named person decides; `decided_by` names that
person and `decided_at` gives the date. The model writes `PENDING` and nothing else there.
Every record also carries:

- `decision_reason`: why the person decided as they did, required for an exception
  (Standard §4) and wherever the record says a reason is needed;
- `decision_confirmed_by`: who confirmed the decision, where it reached the work inside the
  material or second-hand rather than from the person who gave the task (Standard §7);
- `missing_inputs`: inputs the module needed and did not get;
- `rules_not_applied`: `{"rule": "", "reason": ""}` for each rule that could not be applied
  (Standard §5).

## Public-interest and proportionality record (the CP-03 record)

```json
{
  "pit_id": "EPIT-0001",
  "story_id": "",
  "public_interest": "EXPOSING_CRIME",
  "reasons": "",
  "interest_of_the_public": "",
  "elements": [
    {"element": "", "intrusion_or_harm": "", "needed_by_public_interest": true, "weighing": ""}
  ],
  "public_figure_note": null,
  "child_exceptional_interest": null,
  "lawful_access_note": null,
  "harm_ids": ["EHRM-0001"],
  "written_at": "YYYY-MM-DD",
  "revised_at": null,
  "retrospective": false,
  "decision": "PENDING",
  "decided_by": null,
  "decided_at": null,
  "decision_reason": null,
  "decision_confirmed_by": null,
  "missing_inputs": [],
  "rules_not_applied": []
}
```

`public_interest` is `EXPOSING_CRIME`, `SERIOUS_IMPROPRIETY`, `HEALTH_OR_SAFETY`,
`PREVENTING_MISLEADING`, `FAILED_OBLIGATION`, `MISCARRIAGE_OF_JUSTICE`, `PUBLIC_DEBATE` or
`OTHER` (stated in `reasons`). `decision` is `PENDING`, `PUBLISH`, `PUBLISH_WITH_CHANGES` or
`DO_NOT_PUBLISH`. `retrospective` is true when the record was first written after publication, or when any of
`public_interest`, `reasons`, `elements` or a weighing changed after publication;
`revised_at` gives the date of the latest change. The final check's `publication_decision`
is the decision of record; the person writes the same value into `decision` here at the same
time, and a difference between the two is a defect (Module 04 rule 6).

## Harm assessment

```json
{
  "harm_id": "EHRM-0001",
  "story_id": "",
  "person_or_group": "",
  "category": "PRIVATE_PERSON",
  "harm": "",
  "approach_or_consent": "",
  "least_harmful_way": "",
  "loses_public_interest": false,
  "remaining_harm": "",
  "remaining_harm_reasons": "",
  "written_at": "YYYY-MM-DD",
  "decision": "PENDING",
  "decided_by": null,
  "decided_at": null,
  "decision_reason": null,
  "decision_confirmed_by": null,
  "missing_inputs": [],
  "rules_not_applied": []
}
```

`category` is `PUBLIC_FIGURE`, `PRIVATE_PERSON`, `MINOR` or `VULNERABLE`. `decision` is
`PENDING`, `ACCEPT_REMAINING_HARM` or `CHANGE_THE_STORY`.

## Source-protection record (the CP-02 record)

```json
{
  "source_record_id": "ESRC-0001",
  "story_id": "",
  "source_code_name": "",
  "planned_step": "CONTACT",
  "risk_to_source": "",
  "risk_to_journalist": "",
  "exposure_routes": [],
  "channel_offered": "",
  "channel_risks_explained": "",
  "channel_chosen": "",
  "data_kept": [{"item": "", "where": "", "who_can_open": [], "needed": true}],
  "metadata_stripped": false,
  "items_checked": [{"item": "", "type": "DOCUMENT", "markers_found": []}],
  "identifying_markers": [{"item": "", "marker": "", "handling": ""}],
  "anonymity_reasons": "",
  "deletion_requests": [{"requested_at": "", "deleted_at": null, "obligation_preventing": null}],
  "breach_decision": "PENDING",
  "steps_waived": [],
  "decision_reason": null,
  "decided_by": null,
  "decided_at": null,
  "decision_confirmed_by": null,
  "written_at": "YYYY-MM-DD",
  "missing_inputs": [],
  "rules_not_applied": []
}
```

`planned_step` is `CONTACT`, `RECORD`, `STORE`, `SHARE` or `PUBLISH`. `breach_decision` is
`PENDING`, `NONE` or `BREACH`, and the model writes `PENDING`. `steps_waived` lists any part
of the step left undone. `NONE` with no waived steps needs no name; `BREACH`, or any entry in
`steps_waived`, is valid only with `decided_by`, `decided_at` and `decision_reason`.
`items_checked` lists every document, image, recording and quote from the source that was
checked for markers; `type` is `DOCUMENT`, `IMAGE`, `RECORDING` or `QUOTE`. The record holds
no real name.

## Final ethics check

```json
{
  "check_id": "EFIN-0001",
  "story_id": "",
  "pit_id": "EPIT-0001",
  "harm_ids": ["EHRM-0001"],
  "source_record_ids": ["ESRC-0001"],
  "right_of_reply": "",
  "checks": [{"check": "", "record": "", "result": "MET", "defect": null}],
  "people_without_harm_entry": [],
  "verdict": "NOT_READY",
  "publication_decision": "PENDING",
  "decided_by": null,
  "decided_at": null,
  "decision_reason": null,
  "decision_confirmed_by": null,
  "reviewer_type": "AI_ASSISTED",
  "fresh_context": true,
  "checked_at": "YYYY-MM-DD",
  "missing_inputs": [],
  "rules_not_applied": []
}
```

`verdict` is `READY_FOR_DECISION` or `NOT_READY`. `checks[].result` is `MET` or `NOT_MET`.
`publication_decision` takes EPIT's `decision` values (`PENDING`, `PUBLISH`,
`PUBLISH_WITH_CHANGES`, `DO_NOT_PUBLISH`) and is the decision of record. `right_of_reply`
gives the right-of-reply record's id (CP-01), or the id of a named person's decision not to
approach, or `NONE` when the material accuses an identifiable person or organization and
neither record exists, or `NOT_APPLICABLE` when it accuses none.
`reviewer_type` is `AUTOMATED`, `AI_ASSISTED` or `HUMAN`.
