# The redesign (October 2026)

The design research and the redesign of every part of the app are two PDFs kept outside the repo
(Ony's Documents\Private-ai-design): `Design-research-2026.pdf` and `Workbench-redesign-2026.pdf`.
This file tracks what has been built from them, in the PDF's build order.

## 1. Foundations (built)
- **Themes** (`frontend/styles/themes.css`, `frontend/lib/theme.ts`): five contrast-checked themes — Case Night,
  Rain Noir, Archive, Forest Ledger, Indigo Clarity — as role tokens on `<html data-theme>`, with the shadcn/ui
  variables mapped from them. Board effects per theme (hairline grid, CSS bokeh and grain), switchable full / light /
  off, never over text. Calm motion (Settings, or the operating system's reduce-motion setting).
- **Settings › Appearance** (`frontend/features/appearance`): a gallery where each card is drawn in its own theme;
  "Try for this session", then Keep or Go back from a bar on every screen. Formats other than Board are listed as
  planned. Single-key shortcuts can be switched off.
- **Status grammar** (`frontend/components/status.tsx`): Supported ✓, Disputed ✕, Not yet shown ○ (dashed), Ruled
  out; Faint ▮▯▯, Strong ▮▮▯, Textbook ▮▮▮; AI draft. Always a shape and a word, never colour alone.
- **App frame** (`frontend/components/frame/app-frame.tsx`): the old navbar and footer are gone. A breadcrumb is
  always visible top left; the left edge (steps and pages) and the top edge (tools) open after the pointer rests at
  the edge, on their thin handles, or by `[` and `]`; ⌘K opens a command palette on every screen (search the case,
  go to any step or part, try a theme, calm motion); `?` lists the keys. The steps are named Bring in, Check, See,
  Act and Keep.
- Fonts: themes use only families the app already bundles. Adding Manrope, Jost, IBM Plex Mono, Domine, Lexend,
  Inclusive Sans and Bricolage Grotesque (the PDF's choices) needs an ADR first.

## 2. The Authority System Suite (built)
The old `tas_spec` submodule is replaced by a vendored copy of the Authority System Suite
(`backend/app/ai/authority_suite`, see its `README_VENDORING.md`); the AI's output contract follows the suite's records.

## 3. Case home, Decide, Done rules, missing values (built)
- **Addresses** (`frontend/app/(case)/`): Case home `/`, the stages `/bring-in`, `/check`, `/see`, `/act`, `/keep`,
  and `/decide`, all keeping `?inv=`. One layout holds the workbench (`components/case/case-workbench.tsx`), so the
  panels stay mounted between them; a stage's panels mount the first time it opens. A request one panel makes of
  another (open a claim, a dossier, a relationship, a document) opens the stage that holds it. `/dashboard` now
  redirects to Case home. The stage pages still hold the existing panels until each stage is redesigned.
- **Case home** (`features/case-home/case-home.tsx`, mockup HOME_1): one screen, no page scroll. The case's question
  (written in place, `PATCH /api/investigations/{id}`), seven standing numbers counted on the server
  (`GET …/standing`), Bring in (reading now, waiting counts, a drop zone that uploads), Check (status bar, the claims
  most worth a look), Next up (the lifted panel), what changed since your last visit on this computer
  (`GET …/since`), Act · Red Flags (strongest first, the first innocent explanation shown), See · who is linked (the
  six most-linked parties), the year rail and what is pointed at. Scrolling over a module steps inside it after a
  short rest; every step has a click too. No case yet: start one (with its question) or open the sample case.
- **Decide** (`features/case-home/decide-screen.tsx`, mockup CHECK_1) and **Next up** read one list,
  `GET …/decisions` (`backend/app/services/case_home.py`): To check items, missing values, document proposals,
  OpenAleph matches, outside findings, AI drafts and watchlist hits, each the same five-part card. A choice names the
  existing endpoint it posts to, so deciding has no second code path. An answer waits 8 s before it is sent, so Undo
  works for every kind. Keys: S/D/U on Case home; J/K, 1/2/3, Z in Decide. Reason chips under No.
- **Done rules for Supported** (`backend/app/services/claim_done.py`), as the PDF proposed: a supporting item; its
  quote found word for word in its document; an exact locator; the file still matches its fingerprint; every
  contradicting item answered; not resting on leads-only sources (social posts) alone. Confirmed adds two independent
  origins or one public record. A rule that cannot be checked here says so and does not block. Marking it anyway
  needs a written reason, kept on the review. `PATCH /api/claims/{id}` no longer sets Supported or Confirmed.
- **Missing values** (`backend/app/patterns/missing.py`; Ony: "if there are any values that need to exist but don't
  we need a flag for that as well"): a payment without amount, currency or date; an ownership without a share; a
  dated link without a start; a company without jurisdiction or identifier; evidence without a locator or words; a web
  source without an address; a Supported claim with nothing linked; an event with no source. Each names what the gap
  stops, goes when the value is filled in, and can be chased (a lead), marked unknowable, or not needed. Separate
  from Red Flags: a flag is a pattern; a missing value is a gap.

- **The app's values in the suite** (`backend/app/ai/suite_map.py`, `suite_map.json`; Ony: "if there is a need for a
  value that doesn't exist in the Authority system but needs to exist, that's a problem"): every value the app decides
  with is matched to the suite term that defines it, read against the vendored suite: 7 defined, 63 defined only
  nearly, 8 not defined; and 25 things the suite requires that the app does not record yet (source tier,
  classification, likelihood term, right of reply, gap records…). Shown in Settings › Private AI; written out for the
  suite's owner in `docs/authority-suite/SUITE_GAPS.md`. `tests/test_suite_map.py` fails when the app adds a value
  without mapping it, or a suite update drops a mapped term.

## Next
4. Bring in. 5. See. 6. Act. 7. The AI run view (neural paths). 8. Knowledge and safety. 9. Theme effects and
formats. 10. The website. Each starts with mockups of what the PDF's screens did not cover.
