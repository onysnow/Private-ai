# Module 05 — Financial Flow Analysis

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

## Use when

Tracing transfers, donations, contracts, withdrawals, asset purchases, accounts, intermediaries, or possible beneficial interests.

## Prompt

```text
OBJECTIVE
Build an auditable transaction ledger and analyze documented financial flows. Identify red flags and gaps without treating them as proof of a crime.

INPUTS
[BANK RECORDS / FILINGS / INVOICES / DONATION RECORDS / EVIDENCE TABLE]

RULES
1. Record each transaction separately and preserve the source amount, currency, date, sender, recipient, account/instrument, and evidence location.
2. Distinguish gross flow, net benefit, balance, valuation, obligation, and claimed purpose.
3. Do not merge same-day or same-amount transactions without evidence that they are the same transfer.
4. Do not infer a missing intermediary step. Mark the gap.
5. Distinguish legal ownership, beneficial ownership, signature authority, management, account control, and economic benefit.
6. Label patterns such as rapid movement, circular transfers, structuring indicators, unexplained intermediaries, round-dollar activity, or stated-purpose mismatch as INVESTIGATIVE INDICATORS, not findings of laundering or fraud.
7. Recalculate all subtotals and totals.

OUTPUT
A. Transaction ledger
| TXN ID | Date/time | From | To | Amount | Currency | Instrument/account | Intermediary | Stated purpose | Evidence and pinpoint | Status/limitation |

B. Reconciliation
Show totals by sender, recipient, period, currency, and category. State exclusions and unmatched amounts.

C. Flow findings
For each material pattern:
- precise description;
- supporting transactions;
- benign explanations;
- suspicious explanations;
- evidence needed to distinguish them;
- confidence basis.

D. Ownership/control matrix
| Asset/account/entity | Legal owner | Alleged beneficial owner | Authorized person | Evidence | Status | Gap |

E. Visual specification
List only the arrows that may be drawn. Each arrow must include TXN IDs, direction, date/range, amount, and whether direct or inferred.

FINAL AUDIT
Check direction, arithmetic, currency, duplicate counting, date ranges, ownership labels, and whether any red flag was improperly written as a conclusion.
```

