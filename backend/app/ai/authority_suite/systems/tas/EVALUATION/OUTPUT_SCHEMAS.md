# Output Schemas

*Part of Topic Authority System (TAS).*

These schemas provide stable fields for validation. Projects may add fields but should not silently change field meaning.

## Evidence record

```json
{
  "evidence_id": "EVID-0001",
  "source_identifier": "exact source ID or null",
  "source_file": "filename",
  "source_location": {"page": 1, "paragraph": null, "line": null, "timestamp": null, "row": null, "cell": null, "message_id": null},
  "source_hash": "SHA-256 when locally archived, or null",
  "source_type": "filing",
  "issuer_or_author": "name or unknown",
  "source_tier": "B",
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

`source_tier` is the source's tier, `A` through `F`, from the table in `CORE/SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md` §3, or `null` when it has not been assessed. It is the value the `source_tier_floor` flag (`CORE/CONTROL_SURFACE.md` §4) reads when deciding whether a record may count toward a CORROBORATED FACT label.

`classification`, here and in the Claim record, is one of the eight evidence classifications of `CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md` §4.2–§4.9: `SOURCE_STATEMENT|CORROBORATED_FACT|ALLEGATION|INFERENCE|HYPOTHESIS|UNKNOWN|NEGATIVE_SEARCH_RESULT|UNRESOLVED_CONFLICT` (`ALLEGATION` is §4.4's allegation or testimony).

## Entity record

```json
{
  "entity_id": "ENT-0001",
  "canonical_name": "",
  "entity_type": "person|organization|account|address|parcel|phone_number|domain|vehicle|other",
  "source_aliases": [{"source_form": "", "evidence_ids": ["EVID-0001"]}],
  "roles": [{"role": "", "start_at": null, "end_at": null, "evidence_ids": ["EVID-0001"]}],
  "evidence_ids": ["EVID-0001"],
  "identity_confidence": null,
  "identity_basis": "",
  "not_merged_with": [{"entity": "ENT-0002", "reason": "", "evidence_needed": ""}],
  "limitations": []
}
```

The Entity record is what Module 01 output C and Module 04 output A mint (Standard §9.1). `source_aliases` keeps every spelling as found; `roles` are time-bounded (Standard §9.3), each with its own dates and evidence. `identity_confidence` takes the Claim record's `confidence` values, with its reason in `identity_basis` (Module 01's Merge confidence, Module 04's Identity confidence). `not_merged_with` is Module 04 output C's merge review: a possible duplicate kept apart, why, and the record that would resolve it.

## Event record

```json
{
  "event_id": "EVT-0001",
  "event_at": "YYYY-MM-DDTHH:MM:SSZ or null",
  "date_precision": "exact|day|month|range|before|after|estimated|unknown",
  "date_type": "EVENT_DATE",
  "description": "",
  "entities": ["ENT-0001"],
  "evidence_ids": ["EVID-0001"],
  "status": "SUPPORTED",
  "conflicts": [],
  "limitations": []
}
```

`date_precision` holds the precisions `VISUAL_STANDARDS/LEGAL_INVESTIGATIVE_VISUAL_STANDARD.md` §7 rule 2 and template T03 require: `before` and `after` for a date known only to fall before or after a stated date (that date and its basis in `limitations`), `estimated` for an approximate date (its supported range and basis in `limitations`, as Standard §8 requires).

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
  "warrant": "",
  "assumptions": [],
  "confidence": "LOW|MEDIUM|HIGH",
  "confidence_term": "ALMOST_CERTAIN|VERY_LIKELY|LIKELY|ROUGHLY_EVEN_CHANCE|UNLIKELY|VERY_UNLIKELY|ALMOST_NO_CHANCE",
  "confidence_basis": "",
  "limitations": []
}
```

`warrant` states, in one sentence, why the supporting evidence bears on this specific claim — not merely that it is topically related (e.g., "the filing date establishes X occurred before Y because..."). It is distinct from `confidence_basis`, which addresses how sure the claim is, not why the cited evidence is relevant to it at all. `confidence_term` is the likelihood term from `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` (seven terms; a record written before 2026-10-03 carries one of the five it then had) and the value carried when a claim is handed to another system; `confidence` is the confidence level in the judgment — the weight the evidence can bear, from its quality, independence, completeness and consistency (Rule 2) — and is not derived from `confidence_term` (Rule 3). `confidence_basis` states why each holds.

## Hypothesis record

```json
{
  "hypothesis_id": "HYP-0001",
  "hypothesis": "",
  "kind": "WORKING_THEORY|INNOCENT_EXPLANATION|ALTERNATIVE_ATTRIBUTION|DATA_QUALITY|OTHER",
  "supporting_evidence": ["EVID-0001"],
  "contradicting_evidence": [],
  "ambiguous_evidence": [],
  "non_diagnostic_evidence": [],
  "assumptions": [],
  "falsifiers": [],
  "missing_records": ["GAP-0001"],
  "viable": true,
  "assessment": "",
  "limitations": []
}
```

The Hypothesis record is a row of Module 06 output A (Standard §11). `kind` names which of Module 06's required alternatives the hypothesis is. `non_diagnostic_evidence` holds evidence consistent with every live hypothesis — Module 06's Diagnostic value column, rule 8 — and is never counted as support. `missing_records` names the Gap records that would test it. `assessment` states its standing in the calibrated vocabulary of `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` (Module 06 output C); a hypothesis is never restated as fact.

## Conflict record

```json
{
  "conflict_id": "CFLT-0001",
  "statement_a": {"statement": "", "evidence_ids": ["EVID-0001"]},
  "statement_b": {"statement": "", "evidence_ids": ["EVID-0002"]},
  "same_proposition": true,
  "same_proposition_basis": "",
  "conflict_type": "DIRECT CONTRADICTION|TEMPORAL CHANGE|DEFINITIONAL MISMATCH|SCOPE DIFFERENCE|AMBIGUOUS|UNRESOLVED",
  "resolution": null,
  "resolving_evidence": [],
  "limitations": []
}
```

The Conflict record is a row of Module 06 output B (Standard §12; Policy §7). `same_proposition_basis` states the Standard §12 test — same entity, event, period, amount definition, accounting basis, document version, question and scope. `conflict_type` is spelled as Module 06 spells it. `resolution` stays `null` while the conflict is open, and a claim resting on it is classified UNRESOLVED_CONFLICT; a resolution names its `resolving_evidence`.

## Gap record

```json
{
  "gap_id": "GAP-0001",
  "unresolved_question": "",
  "bears_on": ["CLM-0001", "HYP-0001"],
  "why_material": "",
  "current_evidence": ["EVID-0001"],
  "needed_record_or_testimony": "",
  "record_existence": "KNOWN|BELIEVED",
  "likely_custodian": null,
  "lawful_access_route": null,
  "priority": null,
  "could_confirm_or_refute": "",
  "depends_on": [],
  "limitations": []
}
```

The Gap record is a row of Module 07's output (Standard §13). `bears_on` names the claim or hypothesis the gap is tied to (Module 07 rule 1); `record_existence` is Module 07 rule 6's distinction; `priority` is the gap's rank, 1 first, or `null` when not ranked; `depends_on` lists the Gap records that must be closed first.

## Right-of-reply record

```json
{
  "reply_id": "ROR-0001",
  "subject_entity_id": "ENT-0001",
  "claim_ids": ["CLM-0001"],
  "what_will_be_said": "",
  "offered_by": "",
  "offered_at": "YYYY-MM-DDTHH:MM:SSZ or null",
  "channel": "",
  "deadline": "YYYY-MM-DDTHH:MM:SSZ or null",
  "status": "OFFERED|RESPONDED|DECLINED|NO_RESPONSE|EXCEPTION",
  "response": null,
  "reflected_in": null,
  "exception_reason": null,
  "exception_decided_by": null
}
```

One record per subject of a finding that alleges, or states adverse conduct by, an identifiable person or organization (Module 08 rule 10; the right-of-reply checkpoint, CP-01). `claim_ids` are the findings put to the subject; `what_will_be_said` is the substance the subject was told; `offered_by` is the person who made the approach, never the model; `response` is the answer verbatim or summarized with its locator, `null` until one arrives; `reflected_in` names where the deliverable reports it. `EXCEPTION` means no approach was made: `exception_reason` states why and `exception_decided_by` names the person who decided it, never the model. A record still `OFFERED` with its `deadline` unpassed is not complete.

## Element-map record

```json
{
  "element_map_id": "ELEM-0001",
  "issue": "",
  "rule_citation": "",
  "rule_text_supplied": true,
  "rule_text": "",
  "needed_before_mapping": [],
  "elements": [
    {
      "element_no": 1,
      "element_text": "",
      "evidence_for": [{"record_id": "EVID-0001", "classification": "", "warrant": ""}],
      "evidence_against": [{"record_id": "CLM-0001", "classification": "", "warrant": ""}],
      "gaps": ["GAP-0001"],
      "turns_on_interpretation": false
    }
  ],
  "standard_of_proof": null,
  "standard_of_proof_source": null,
  "questions_for_counsel": [],
  "for_counsel_or_forum_to_decide": [],
  "conclusion": "none — for counsel or the forum"
}
```

The Element-map record is Module 13's output. `rule_text` is the rule's text exactly as the user supplied it, and `rule_citation` the citation as given; neither is ever filled from the model's memory. When `rule_text_supplied` is `false`, `rule_text` is `null`, `elements` stays empty and `needed_before_mapping` lists what is needed (Module 13 rule 1). `element_text` is in the supplied text's own words. `evidence_for` and `evidence_against` name EVID- or CLM- records, each with its classification (Standard §4) and warrant; an element no record bears on has both empty and its `gaps` say so — "no evidence in the record set", with a GAP- id where Module 07 named one. `turns_on_interpretation` is `true` when the element depends on what the rule's words mean rather than on what happened; each such element has a question in `questions_for_counsel`. `standard_of_proof` is written only as the user or the supplied text states it, and `standard_of_proof_source` says which; otherwise both are `null` and the question goes to counsel. `for_counsel_or_forum_to_decide` lists what counsel or the forum must decide — Module 13 rule 8 and output E. `conclusion` is fixed: it is never "met", "not met", or a predicted outcome.

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
  "verification_status": "VERIFIED|PARTIALLY VERIFIED|ATTRIBUTED BUT UNCORROBORATED|CONTRADICTED|UNRESOLVED|NOT TESTABLE FROM AVAILABLE SOURCES",
  "limitations": []
}
```

`verification_status` is the Module 02 (Source Verification) verdict for the element's statement, spelled as Module 02 spells it; it is `null` until the statement has been through Module 02.

The visual `classification` shows the evidence classification of the record behind the element: `SOURCE_STATEMENT` → `DOCUMENTED`, `CORROBORATED_FACT` → `CORROBORATED`, `ALLEGATION` → `ALLEGED`, `INFERENCE` → `INFERRED`, `HYPOTHESIS` → `HYPOTHESIZED`, `UNRESOLVED_CONFLICT` → `CONTESTED`, `UNKNOWN` and `NEGATIVE_SEARCH_RESULT` → `UNKNOWN`.

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
  "accepted_by": null,
  "acceptance_basis": null,
  "verification_note": ""
}
```

`status: ACCEPTED_RISK` means the finding is known and the artifact is released anyway on a named human's written acceptance, recorded in `accepted_by` (the person) and `acceptance_basis` (what they accepted and why). It is never valid when `severity` is BLOCKING: a BLOCKING finding closes only as CORRECTED or VERIFIED. A model may not set ACCEPTED_RISK on its own authority.

## Prompt evaluation record

```json
{
  "prompt_id": "PEV-0001",
  "prompt_version": "1.0",
  "prompt_hash": null,
  "model_version": "",
  "settings": {},
  "run_date": null,
  "test_case_id": "TEST-0001",
  "input_hash": null,
  "output_hash": null,
  "ground_truth_version": null,
  "blocking_defects": [],
  "rubric_score": null,
  "verdict": "PASS|PASS_WITH_CORRECTIONS|REVISE_AND_RETEST|FAIL",
  "reviewers": [],
  "required_changes": [],
  "limitations": []
}
```

`verdict` is the prompt-adoption verdict of `EVALUATION/PROMPT_QA_RUBRIC.md` (Rating bands). The audit verdict of Module 10 (Final Accuracy Audit) and Module 12 (Legal Document and Prompt Audit) — PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL — is a different judgment and is never written in this field: it is output A of those modules, and for an audit under `EVALUATION/LEGAL_DOCUMENT_AND_PROMPT_AUDIT_GUIDE.md` it is the Verdict row of that Guide's §11 audit record.
