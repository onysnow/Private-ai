# Open items

## Waiting on Ony's decision (each was asked; don't decide alone)

1. **The stage header vs the mockups.** Every mockup shows only a breadcrumb above the screen. The app adds a stage
   header (title, a line of text, part tabs) above every screen, so Money doesn't fit on one 1440×900 screen as
   drawn. Changing it changes every screen.
2. **The Wire (SEE_1):** a new mockup, from SEE_1, SEE_2 and research chapter 07, for his approval.
3. **AI_2:** the default for outside lookups. The mockup says "Ask first"; the decided global default is
   automatic (INV §8). The app uses Ask first for runs.
4. **AI_2:** should Tier C be shown at all? It is drawn hatched as "never counts".
5. **AI_1:** the name "Run record". The suite calls its ledger "Paper Trail", which the app already uses for the
   sources panel.
6. **AI_1:** draw the suite's whole pipeline, dimmed where the app doesn't run it (the current choice), or only
   what runs?
7. **AI_1:** should "Copy cite" links work outside the app, for example in a .docx export?
8. **Chain of Custody:** should the custody log export be part of the backup, or its own "evidence pack"?
9. **Story:** one story per case, or several? Which gates are required by default?
10. **Money:** the €10,000 EU reporting line (Regulations 2018/1672 and 2024/1624) is applied per currency. Confirm.

## Known gaps (not stored, so not shown, and said so on screen)
- OCR legibility %.
- Reviewers' names: the app shows "a person" where the mockup says "Ony".
- Passage line numbers (L.14–22).
- Stored evidence anchors. The anchor is found when the chain is opened; research §3.9 calls for an ADR.
- The time of the last backup.

## Not built yet (see the [ ] items in MOCKUP_BUILD_LIST)
- **Money:**
  - "Add to To check" from a money check (To check only holds indicator questions; it needs a backend kind);
  - hovering a band to light its ledger rows;
  - top 20 flows plus "others" for very large ledgers.
- **Chain of Custody:** scroll-over replay along the log; draw-in motion; the claim card's Done checklist.
- **AI:**
  - AI_1 matched to its mockup;
  - "Ask the case" as a four-step entry from elsewhere;
  - per-claim review of AI candidates (today, accept/reject applies to the whole answer);
  - the "More" row of umbrella session flags (no runtime in the app).
- **Story:** AI-draft marks, Notes tab, version history, hovering a citation for its quote, dragging claims into the
  text, Leads as Now / Next / Later, the export sheet.
- **Rain Noir:** Glass panels; the calm "after the rain" still.

## Authority System Suite (beta) notes for Ony
- The app runs TAS only (modules 08 and 06). LAS, QAS, RAS, DAS, EGS and EHS are vendored but never invoked, so the
  plan and the run map show them as "not in the app yet".
- Two suite items describe chat sessions rather than an app run, so the app adapts them:
  - `research_depth: exhaustive` asks for "a disconfirming search per question"; in an app run the search is
    within the packet;
  - the devil's advocate is the suite's `/devils-advocate` command (TAS CONTROL_SURFACE §3), not the flag
    `auto_run_adversarial_gate`, which the research mentions.

  Neither is a suite bug, but if he wants run-level flags defined in the suite, that is his to add.

## CI
The GitHub Actions jobs on PR #58 (backend-lint, backend-postgres, frontend, docker-build) fail because the jobs
never get a runner. That is an account or billing problem, not test failures, and it was already explained in one
PR comment. Don't post a second comment for the same failure. Local checks are the source of truth until runners
work again.
