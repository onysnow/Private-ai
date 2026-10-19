# The indicator catalogue

One source of truth for published warning signs of wrongdoing (ADR-0007). Red Flags, the glossary and the printed PDF are all made from these files.

- `indicators/<area>.yaml`: one file per area. An indicator stays `pending` until every quote, case outcome and threshold number has been re-opened and checked; only `verified` ones reach Red Flags and the PDF.
- `glossary/<area>.yaml`: the terms a reader needs, with definitions, examples, sources and cases.
- `schema/`: JSON Schema exported from `backend/app/catalogue/models.py`.

Tests: `backend/tests/test_catalogue.py`.
