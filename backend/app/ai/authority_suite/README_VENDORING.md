# The Authority System Suite, vendored

This folder is a plain copy of [onysnow/Authority-System-Suite](https://github.com/onysnow/Authority-System-Suite)
at the commit named in `VENDORED_FROM`. It replaces the old `tas_spec` git submodule (Topic Authority System only).

The app builds its AI prompts from all seven systems: TAS (`systems/tas/`, with
`systems/tas/CORE/CONTROL_SURFACE.md` for the session flags) and one app run of each of RAS, QAS, LAS, DAS, EGS
and EHS. `backend/app/ai/suite.py` is the one service that routes every module to its system; the hand-offs
between systems follow `INTEROP.md` (`backend/app/ai/interop.py`).

## Updating

1. Clone the suite and check out the commit you want.
2. Replace `systems/` and the root files here: README.md, AGENTS.md, INTEROP.md, CHECKPOINTS.md,
   SYCOPHANCY_CONTROLS.md, FABRICATION_CONTROLS.md, INSTRUCTION_COMPLIANCE.md, CONTROL_SURFACE.md,
   OVERLAYS.md, JUDGEMENT_LEDGER.md, LICENSE, LICENSE-DOCS.
3. Update `VENDORED_FROM`.
4. Regenerate `docs/authority-suite/SUITE_GAPS.md` (the command is in `backend/tests/test_suite_map.py`'s failure
   message), then run `backend/tests/test_authority_suite_drift.py`, `test_suite_map.py`, `test_suite_service.py`
   and `test_suite_systems.py`; they fail if a module the app uses moved, a value list changed, or a system moved
   row in the trigger table.

Do not edit files here by hand; changes belong upstream.
