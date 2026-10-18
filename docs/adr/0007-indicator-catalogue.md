# ADR-0007: The indicator catalogue is YAML in the repository

**Status:** Proposed (2026-10-08)
**Date:** 2026-10-08
**Deciders:** Claude, under Ony's instruction to build the indicator catalogue (project doc `INDICATOR_CATALOGUE_PROMPT.md`)

## Context

Ony asked for one source of truth for every published warning sign of wrongdoing, used by Red Flags, the in-app glossary and a printed PDF, with "nothing typed twice". The entries are long-lived reference data that people will read, correct and extend by hand, and every change should be reviewable line by line.

## Decision

1. **The catalogue lives in `catalogue/` at the repository root as YAML files**, one file per area for indicators (`catalogue/indicators/<area>.yaml`) and one per area for glossary terms (`catalogue/glossary/<area>.yaml`).
2. **Pydantic models in `backend/app/catalogue/models.py` define the shape.** The JSON Schema files in `catalogue/schema/` are exported from them, so the schema and the code cannot drift. No JSON Schema validator package is added; Pydantic (already used everywhere) validates.
3. **PyYAML is pinned in `backend/requirements.txt` (6.0.3, MIT).** It is already installed as a dependency of followthemoney; it is pinned because the Workbench now imports it, the same rule as openpyxl and networkx.
4. **The PDF is made with PyMuPDF**, already a pinned dependency (its Story API lays out HTML and CSS into PDF pages). No new package.
5. **An indicator is `pending` until every quote, case outcome and threshold number has been re-opened and checked**; only `verified` indicators reach Red Flags and the PDF. The models refuse an indicator marked verified that is not.

## Options considered

- **A database table edited through the app.** Rejected for now: reviewing changes would need its own history screen, and the data must ship with every install.
- **JSON files.** No new pin, but long quoted text and multi-line definitions are harder to read and edit by hand.
- **YAML files (chosen).** Readable, diff-friendly, one pin of a library already installed.

## Consequences

Correcting an indicator is an ordinary commit. The app reads the files at start-up (a later step); a running install changes only when it is updated.
