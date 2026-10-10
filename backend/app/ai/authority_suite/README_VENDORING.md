# The Authority System Suite, vendored

This folder is a plain copy of [onysnow/Authority-System-Suite](https://github.com/onysnow/Authority-System-Suite)
at the commit named in `VENDORED_FROM`. It replaces the old `tas_spec` git submodule (Topic Authority System only).

The app builds its AI prompts from `systems/tas/` (TAS, the Topic Authority System) and reads
`systems/tas/CORE/CONTROL_SURFACE.md` for the session flags. The other systems (RAS, QAS, LAS, DAS, EGS, EHS)
and the root suite documents are kept so the hand-offs TAS names in `INTEROP.md` resolve.

## Updating

1. Clone the suite and check out the commit you want.
2. Replace `systems/` and the root files here: README.md, AGENTS.md, INTEROP.md, CHECKPOINTS.md,
   SYCOPHANCY_CONTROLS.md, FABRICATION_CONTROLS.md, INSTRUCTION_COMPLIANCE.md, CONTROL_SURFACE.md,
   OVERLAYS.md, JUDGEMENT_LEDGER.md, LICENSE, LICENSE-DOCS.
3. Update `VENDORED_FROM`.
4. Run `backend/tests/test_authority_suite_drift.py`; it fails if a module the app uses moved or its schema changed.

Do not edit files here by hand; changes belong upstream.
