# Output Schemas

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

These schemas provide stable fields for validation. Projects may add fields but should not silently change field meaning.

## Evidence record

```json
{
  "evidence_id": "EVID-0001",
  "source_identifier": "exact source ID or null",
  "source_file": "filename",
  "source_location": {"page": 1, "line": null, "timestamp": null, "row": null},
  "source_type": "filing",
  "issuer_or_author": "name or unknown",
  "created_at": "YYYY-MM-DD or null",
  "event_at": "YYYY-MM-DD or null",
  "retrieved_at": "YYYY-MM-DD",
  "entities": ["ENT-0001"],
  "neutral_summary": "",
  "exact_excerpt": null,
  "classification": "SOURCE_STATEMENT",
  "authenticity_status": "PROVISIONAL",
  "restates_evidence_id": "EVID-0000 or null",
  "limitations": []
}
```

`restates_evidence_id` identifies the evidence record whose underlying statement this record forwards, quotes, requotes, or republishes. Set it whenever a record is a copy of another record's statement rather than an independent one (a forwarded email, a requoted message, a republished article, duplicate testimony). A chain of restatements should all point back to the same original evidence ID. Downstream corroboration counts, verification verdicts, and CORROBORATED FACT classifications must treat a record and everything that restates it as one source, not as one source per copy.

## Event record

```json
{
  "event_id": "EVT-0001",
  "event_at": "YYYY-MM-DDTHH:MM:SSZ or null",
  "date_precision": "exact|day|month|range|unknown",
  "date_type": "EVENT_DATE",
  "description": "",
  "entities": ["ENT-0001"],
  "evidence_ids": ["EVID-0001"],
  "status": "SUPPORTED",
  "conflicts": [],
  "limitations": []
}
```

## Transaction record

```json
{
  "transaction_id": "TXN-0001",
  "transaction_at": "YYYY-MM-DD or null",
  "from_entity": "ENT-0001 or null",
  "to_entity": "ENT-0002 or null",
  "amount_source": "5000.00",
  "currency_source": "USD",
  "amount_normalized": null,
  "currency_normalized": null,
  "instrument_or_account": null,
  "intermediary": null,
  "stated_purpose": null,
  "evidence_ids": ["EVID-0001"],
  "status": "DOCUMENTED",
  "limitations": []
}
```

## Relationship record

```json
{
  "relationship_id": "REL-0001",
  "from_entity": "ENT-0001",
  "predicate": "EMPLOYED_BY",
  "to_entity": "ENT-0002",
  "start_at": null,
  "end_at": null,
  "evidence_status": "DIRECT",
  "evidence_ids": ["EVID-0001"],
  "limitations": []
}
```

## Claim record

```json
{
  "claim_id": "CLM-0001",
  "claim": "",
  "classification": "INFERENCE",
  "supporting_evidence": ["EVID-0001"],
  "contradicting_evidence": [],
  "assumptions": [],
  "confidence": "LOW|MEDIUM|HIGH",
  "confidence_basis": "",
  "limitations": []
}
```

## Null and uncertainty rules

- Use `null` when a field is absent or unknown.
- Do not use an empty string to conceal unknown data.
- Preserve source text in source fields; normalized values belong in separate fields.
- Enumerated status values must be defined before production use.
- Every derived record must retain one or more evidence IDs or be explicitly labeled as context.

## Corpus manifest record

```json
{
  "corpus_id": "CORP-0001",
  "version": "1.0",
  "expected_items": null,
  "received_items": 0,
  "processed_items": 0,
  "failed_items": 0,
  "excluded_items": 0,
  "duplicate_items": 0,
  "source_cutoff": "YYYY-MM-DD or null",
  "manifest_hash": null,
  "exceptions": [],
  "limitations": []
}
```

## Visual element record

```json
{
  "visual_id": "VIS-0001",
  "element_id": "VE-0001",
  "element_type": "node|edge|label|annotation|axis|category|total|other",
  "statement_or_encoding": "",
  "from_entity": null,
  "to_entity": null,
  "direction_semantics": null,
  "value": null,
  "unit_or_currency": null,
  "classification": "DOCUMENTED|CORROBORATED|ALLEGED|INFERRED|HYPOTHESIZED|CONTESTED|UNKNOWN",
  "evidence_ids": [],
  "source_locations": [],
  "verification_status": "VERIFIED|PARTIAL|UNVERIFIED|CONTRADICTED",
  "limitations": []
}
```

## Audit finding record

```json
{
  "finding_id": "AUD-0001",
  "audit_object": "filename, claim ID, prompt version, or visual element ID",
  "audit_pass": "claim-to-evidence",
  "severity": "BLOCKING|MATERIAL|NON_MATERIAL|OPTIONAL",
  "finding": "",
  "supporting_source_ids": [],
  "precise_locations": [],
  "required_correction": "",
  "reviewer_type": "AUTOMATED|AI_ASSISTED|HUMAN|LEGAL_COUNSEL",
  "status": "OPEN|CORRECTED|VERIFIED|ACCEPTED_RISK",
  "verification_note": ""
}
```

## Prompt evaluation record

```json
{
  "prompt_id": "PRM-0001",
  "prompt_version": "1.0",
  "prompt_hash": null,
  "model_version": "",
  "settings": {},
  "test_case_id": "TEST-0001",
  "input_hash": null,
  "output_hash": null,
  "ground_truth_version": null,
  "blocking_defects": [],
  "rubric_score": null,
  "verdict": "PASS|PASS_WITH_CORRECTIONS|REVISE_AND_RETEST|FAIL",
  "reviewers": [],
  "limitations": []
}
```
