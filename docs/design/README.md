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

## Next
2. Replace the Topic Authority System submodule with the Authority System Suite (commit b1c71e8) and fix the AI
   output contract. 3. The case home and the Decide screen. Then Bring in, See, Act, the AI run view, knowledge and
   safety, themes' effects and formats, the website.
