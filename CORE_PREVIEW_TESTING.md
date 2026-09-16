# Journalism Workbench Core Preview 0.85 — Manual Test Guide

This preview is deliberately usable **without AI**. The future local investigator is not required to start or use the core reporting application.

## Fastest local Windows test

1. Extract the source snapshot to a normal writable folder.
2. Double-click `Start Journalism Workbench.bat`.
3. The first 0.85 launch creates/updates the private `.venv` and installs the complete local dependency set.
4. The browser opens to `http://127.0.0.1:8000`.
5. `GET /api/capabilities` should report `mode: core_preview` and `ai_features_enabled: false`.

Local mode stores the SQLite database at `backend/journalism.db` and document bytes below the configured backend document-storage directory.

## Core workflow to test

Use one investigation and walk this chain end to end:

1. Create an investigation.
2. Upload a `.txt`, `.md`, `.csv`, `.html`, `.pdf`, or `.docx` document.
3. Review extraction proposals rather than treating them as canonical automatically.
4. Accept exact evidence with its document locator.
5. Create/review canonical FollowTheMoney entities.
6. Create a claim and attach evidence as `supports`, `contradicts`, or `context`.
7. Create a FollowTheMoney relationship and attach exact evidence when appropriate.
8. Open the entity dossier and relationship graph.
9. Search the investigation and follow provenance targets.
10. Create a reporting lead/task from the relationship or claim context.
11. Run Aleph/OpenSanctions only as external lead/enrichment sources; do not promote provider results without review.
12. Export a portable investigation backup.

## Automated core-preview smoke test

The backend regression includes `tests/test_core_preview_smoke.py`. It exercises a real upload and this chain:

`document -> extraction proposal -> reviewed evidence -> claim -> evidence link -> FollowTheMoney relationship -> graph/dossier -> provenance -> lead`

AI is not involved in that test.

## Current limitations

- The local zero-Node preview uses SQLite. PostgreSQL remains the production target and still needs a real-server full regression/concurrency gate.
- The Docker/Next.js/PostgreSQL stack has not been container-built in this execution environment because no Docker/Podman runtime is available here.
- Frontend dependency retrieval remains unverified because npm registry installation timed out in this environment.
- OCR depends on a working Tesseract installation/language pack on the host. Native-text PDFs and other supported document types do not require AI.
