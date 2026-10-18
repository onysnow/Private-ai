# Money flows (Payment relationships → ledger → Sankey)

## Data

Payments are ordinary canonical relationships with the FollowTheMoney `Payment`
schema (`payer` → `beneficiary`), created through the existing
`POST /api/relationships`, so they get the same evidence attachments, evidence
reviews, provenance statements, duplicate reconciliation and export as every
other relationship.

Properties used: `amount`, `currency`, `date` (or `startDate`), `purpose`,
`transactionNumber`. On create, present values are checked
(`validate_payment_properties` in `backend/app/services/relationships.py`):
amount must be a number (commas allowed, stripped), currency a 3-letter code
(upper-cased), dates `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. Missing values are allowed.

## Ledger

`GET /api/investigations/{id}/financial-flows` (`backend/app/services/financial_flows.py`),
read-only:

- `transactions` — complete payments (one amount, one currency, both endpoints),
  sorted by date. Fields match `FinancialFlowTransaction` in
  `frontend/lib/financial-flow-types.ts`, plus entity ids and evidence counts.
- `incomplete` — payments left out of the chart, each with `problems`
  (missing amount/currency, multiple values, missing endpoint).
- Reviewed duplicate payments count once (same reconciliation view as the graph);
  unreviewed look-alikes are listed separately.
- `flowType`: `direct` only when at least one attached evidence record's latest
  reporter review is `supports`; otherwise `inferred`. The rule is returned as
  `flow_type_rule`.
- Different entities that share a caption get a disambiguated label so the chart
  does not merge them.

## UI

Relationship graph section on `app/page.tsx`:

- The relationship form offers `Payment`; choosing it shows amount / currency /
  date / purpose fields.
- "Money flows" panel: loads the ledger on demand, shows `<FinancialFlowSankey>`
  (lazy-loaded) for complete payments, the ledger table, and the "Not charted"
  list with reasons.
- `<FinancialFlowSankey>` never sums across currencies (currency selector). If the
  selected currency's flows contain a cycle (A → B → A), it says so instead of
  drawing, because ECharts' Sankey cannot render cycles; the ledger still lists
  every payment.

Connector findings with schema `Payment` are now handled like other relationship
findings (endpoint matching + reporter review before promotion).
