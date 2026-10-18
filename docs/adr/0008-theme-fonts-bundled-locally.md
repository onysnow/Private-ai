# ADR-0008: The themes' fonts are bundled with the app

**Status:** Proposed (2026-10-12)
**Date:** 2026-10-12
**Deciders:** Claude, building the approved HOME_2 and THEMES mockups; for Ony to accept

## Context

The redesign (`Redesigning the investigation workbench`, chapter 03 and §04.11) gives each of the five themes its own fonts, and the THEMES-1 and THEMES-2 pictures name them: Case Night IBM Plex Sans · Source Serif 4 · IBM Plex Mono; Rain Noir Manrope · Jost 300 (titles) · Source Serif 4 · IBM Plex Mono; Archive Public Sans · Domine · IBM Plex Mono; Forest Ledger Inter · Newsreader · IBM Plex Mono; Indigo Clarity Inclusive Sans · Lexend · IBM Plex Mono. The research asks for fonts to be bundled locally, "no request to Google Fonts while working on a sensitive case", and for a decision record before adding font packages.

The app already loads deck fonts from `@fontsource` packages in `frontend/app/layout.tsx` (Inter, IBM Plex Sans, Source Serif 4, Newsreader, Public Sans, Literata, Work Sans and others). Manrope, Jost, Domine, Lexend, Inclusive Sans and IBM Plex Mono were missing.

## Decision

Add six packages, all version 5.3.0 and licensed SIL OFL 1.1, and import them in `frontend/app/layout.tsx`:

- `@fontsource-variable/manrope`, `@fontsource-variable/jost`, `@fontsource-variable/domine`, `@fontsource-variable/lexend`
- `@fontsource/inclusive-sans` (weights 400 and 700), `@fontsource/ibm-plex-mono` (weights 400, 500, 600)

Only `@font-face` rules load at start-up; a font file downloads from the app itself the first time a theme uses it. `--font-mono` in every theme becomes IBM Plex Mono with the system monospace fonts as fallbacks.

## Options considered

- **Google Fonts links.** Rejected: every page view would tell Google which fonts the reporter's screen uses, and work offline would lose them.
- **Copying the font files into the repository by hand.** Works, but updates and licences are then tracked by hand; the `@fontsource` pattern is already the app's.
- **Keeping the earlier substitutes (Work Sans for Rain Noir, Literata for Archive, Atkinson Hyperlegible for Indigo Clarity).** Rejected: they differ from the approved pictures.

## Consequences

The frontend's installed size grows by the six packages; no request leaves the computer for fonts. Bricolage Grotesque and Caveat, also named in the research (the note face on the corkboard), are not added until a screen uses them.
