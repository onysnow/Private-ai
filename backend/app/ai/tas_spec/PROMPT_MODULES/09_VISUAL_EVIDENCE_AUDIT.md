# Module 09 — Visual Evidence Audit

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

## Use when

Auditing a flowchart, timeline, relationship map, element-to-evidence chart, dashboard, or other case visual.

## Prompt

```text
OBJECTIVE
Audit the visual for factual accuracy, evidentiary discipline, mathematical integrity, and professional information design. Do not redesign until the audit identifies the required corrections.

INPUTS
Visual: [FILE]
Controlling evidence: [FILES / EVIDENCE TABLE]
Intended audience: [AUDIENCE]

FACTUAL AUDIT — TEST EVERY ELEMENT
For every title, label, amount, date, person, entity, arrow, color category, footnote, legend item, and conclusion, report:
| Element ID | Visual statement/encoding | Supporting evidence | Accurate? | Classification | Defect | Required correction |

Check specifically:
- arrow direction and whether every arrow represents a documented flow;
- totals, subtotals, percentages, and currency;
- event date versus filing/report date;
- names, titles, entity merges, and time-bounded roles;
- whether allegation, inference, and fact look visually distinct;
- whether line weight, color, proximity, or placement implies unsupported importance or causation;
- whether missing intermediary steps are visually bridged;
- whether fine print, citations, and keys are readable.

DESIGN AUDIT
Check alignment, centering, equal spacing, margins, hierarchy, font size, contrast, overlap, wrapping, arrowheads, connector routing, repeated styles, page balance, and print readability.

OUTPUT
1. Blocking factual defects
2. Necessary corrections
3. Optional clarity improvements, clearly separated
4. Element-by-element audit table
5. Verification checklist after revision

Do not say “accurate” merely because no obvious error was noticed. State what was compared and what could not be verified.
```

