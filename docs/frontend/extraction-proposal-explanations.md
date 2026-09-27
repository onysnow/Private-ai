# Extraction proposal explanations (#190)

Document extraction stays propose-then-confirm: every entity, claim, evidence and
relationship proposal needs a reporter's accept/reject. Each proposal now also says
**why it exists**, part by part.

## API

- `GET /api/extraction-candidates/{id}/explanation` — one proposal's explanation.
- `GET /api/documents/{id}/candidates?explain=true` — the usual candidate rows, each
  with an `explanation` field. Without `explain` the response is unchanged.

Built by `backend/app/services/extraction_explanations.py`. Read-only.

| Field | Meaning |
|---|---|
| `summary` | One line: what is proposed. |
| `method` | `{id, label, description, automated}` — which rule or provider produced it. |
| `rationale_basis` | `recorded` (extractor stored its reasoning at creation), `reconstructed` (older proposal; current rules re-applied to the stored text, flagged in `caveats`), `provider` (OpenAleph), `reporter` (reporter-staged relationship). |
| `confidence` | `{value, basis}` — `basis` states what the number means. Local rule values are fixed per rule (evidence 1.0, claim 0.55, entity 0.40); they are not probabilities. |
| `parts[]` | `{id, label, value, reasoning[], sources[]}` per part of the proposal. |
| `sources[]` | Document (filename, SHA-256), source record, provider record. |
| `caveats[]` | What the method does not check, OCR warnings, missing locators, missing records. |

Parts per type:

- **evidence** — `quote`, `locator`
- **claim** — `text` (sentence rule: length range, matched assertion verb)
- **entity** — `caption`, `schema` (organizational suffix matched, or the Person default), `provider_resolution` when OpenAleph linked the mention (lead only)
- **relationship** (composite) — `schema`, `source`, `target`, `claim`, `evidence`, plus `properties` / `note` when present

Chunk sources carry an `excerpt` (`before`, `match`, `after`, `start_char`, `end_char`)
so the UI can highlight the matched text inside its chunk.

## Recorded rationale

`_candidate_payloads()` in `services/documents.py` writes `payload.rationale` on new
local proposals (`whole_chunk`; `sentence_assertion` + `trigger` + `length`;
`capitalized_name_sequence` + `schema_basis` + `matched_suffix`). The rule constants
(`CLAIM_TRIGGER_RE`, `CLAIM_MIN_CHARS`, `CLAIM_MAX_CHARS`, `ORG_SUFFIX`) are shared with
the explainer.

## UI

`frontend/components/extraction-explanation.tsx` (`ExtractionExplanationView`) renders a
collapsed "Why this was proposed" panel under each proposal in the document review list
on `app/page.tsx`.
