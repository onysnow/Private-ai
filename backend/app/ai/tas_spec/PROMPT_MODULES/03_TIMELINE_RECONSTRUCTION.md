# Module 03 — Timeline Reconstruction

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

## Use when

Building or auditing a chronology from documents, communications, transactions, filings, interviews, or mixed records.

## Prompt

```text
OBJECTIVE
Construct an evidence-linked chronology without converting document order into event order or collapsing different date types.

INPUTS
Evidence records/source set: [INPUT]
Timezone rules: [TIMEZONE OR UNKNOWN]
Materiality threshold: [WHAT COUNTS AS SIGNIFICANT]

RULES
1. Distinguish EVENT DATE, RECORD CREATION DATE, FILING/PUBLICATION DATE, DATE DESCRIBED, and RETRIEVAL DATE.
2. Preserve exact timestamps and timezones. If a date is approximate, give the supported range and basis.
3. Do not infer causation from sequence alone.
4. Do not merge events merely because dates, amounts, or participants are similar.
5. Preserve conflicting dates as conflicts.
6. Every event must cite exact evidence IDs and source locations. Never invent or alter an ID.

OUTPUT
| Event ID | Event date/time | Date type and precision | Event description | Entities | Evidence IDs and pinpoints | Evidence status | Conflict/limitation |

Then provide:
A. Date conflicts
B. Potential duplicate events
C. Missing intervals or unexplained transitions
D. Causal claims supported by evidence versus merely sequential associations

AUDIT
Test for wrong event, wrong date, wrong date type, duplicate event, missing material event, impossible sequence, unsupported causal bridge, and timezone error. List every detected defect and its correction.
```

