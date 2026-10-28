# Where the code is

The frontend is Next.js 15 with the TanStack Query generated client (`frontend/lib/generated`, Zod-checked) and a
zustand store (`frontend/lib/workbench-store.ts`). The backend is FastAPI with SQLAlchemy and Alembic.

## The frame
- Stages and their parts: `frontend/components/case/case-workbench.tsx`. `screen('see', [...])` lists each stage's
  parts by anchor, for example `#money-flows`, `#chain-of-custody` and `#ai-runs`.
- The shared stage layout is `components/case/section-screen.tsx`. It opens the part named in the URL hash.
- Global styles are in `frontend/styles/*.css`, imported in `frontend/app/layout.tsx`. Theme tokens are in `styles/themes.css`.
- Themes are defined in `frontend/lib/theme.ts`: case-night, rain-noir, archive, forest-ledger and indigo-clarity.
  Calm motion is `html[data-motion='calm']`.

## Screens built in this stretch

| Screen | Frontend | Backend | Tests |
|---|---|---|---|
| See › Money (SEE_2) | `features/money/money-view.tsx`, `money-layout.ts`, `styles/money.css` | `app/services/money_checks.py`, `financial_flows.py`; `GET /investigations/{id}/money-checks`, `/financial-flows` | `frontend/tests/test-money-view.test.tsx`, `backend/tests/test_money_checks.py` |
| Check › Chain of Custody (CHECK_2) | `features/custody/chain-of-custody.tsx`, `styles/custody.css` | `app/services/custody_chain.py`; `GET /claims/{id}/custody-chain`, `POST /documents/{id}/recheck-hash` (`routes_provenance.py`) | `test-chain-of-custody.test.tsx`, `test_custody_chain.py` |
| Act › Red Flags (ACT_1) | `features/act/red-flags-board.tsx`, `styles/act.css` | `app/patterns/engine.py` (`mark_innocent`), `POST /red-flags/{id}/innocent` | `test-red-flags-board.test.tsx`, `test_red_flags.py` |
| Act › Story (ACT_2) | `features/story/story-screen.tsx`, `writeup-editor.tsx` (TipTap, ADR-0011), `sentences.ts`, `styles/story.css` | `app/models/stories.py`, `app/services/stories.py`, `app/api/routes_stories.py` (ADR-0010) | `test-story.test.tsx`, `test_stories.py` |
| Act › AI runs: Ask, then Before you run (AI_2) | `features/ai/before-you-run.tsx`, `styles/before-run.css` | `app/services/run_plan.py`; `POST /investigations/{id}/assistant/plan`, `GET/PUT …/assistant/profile`; run options in `app/ai/reasoning.py` (`RUN_OPTIONS`, `normalize_run_options`, `normalize_premises`) | `test-before-you-run.test.tsx`, `test_run_plan.py` |
| Act › AI runs: Watch the run (AI_1, first pass) | `features/ai/watch-the-run.tsx` (styles at the end of `before-run.css`) | `app/ai/run_events.py` (`RunRecorder`, `record_thoughts`), `app/api/routes_ai_runs.py`, model `AIRunEvent` in `app/models/ai.py` (ADR-0012) | `test_run_events.py` |
| Rain Noir effects | `frontend/vendor/onysnow-effects` (alias `@fx/*`), `features/effects/rain-pane.tsx`, `board-effects.tsx` | | (ADR-0009) |

## The AI pipeline
- `app/ai/reasoning.py` has `run_reasoning_module`, which records the run events, and `_run_reasoning_module`,
  which does the work:
  - the flags: `CONTROL_SURFACE_FLAGS`, i.e. severity_floor and source_tier_floor (default D, allowed A–D);
  - the prompt: `build_system_prompt`;
  - the checks: `validate_output_shape`, `validate_citations`, plus quote, chart and writing checks for drafts.
- Runs are background jobs: `app/jobs/handlers.py` `ai_reasoning_job` passes `run_id=job.id`.
- The old AI panel is still in Act › AI drafts: `frontend/components/ai-reasoning-panel.tsx`.
- The suite is bundled in the `authority-suite-sdk` package, read through `backend/app/ai/authority_sdk.py` (beta: report problems found there to Ony).

## Migrations added in this stretch (`backend/alembic/versions/`)
- `a9c3e7f1d204`: `pattern_flags.innocent`
- `b4e8d2a6c931`: stories
- `c7d1f3a8e520`: `investigations.ai_run_profile`
- `d3a6b9c2e714`: `ai_run_events` (the current head)

Every new table that hangs off investigations must be added to the backup: `app/services/exports.py`
(`MODEL_BY_TABLE`, `RESTORE_ORDER`, and the collection in `collect_investigation_records`).
