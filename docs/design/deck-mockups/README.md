# Deck mockups (for Ony's review)

Two screens at 1440 x 900 in Rain Noir, made from `docs/design/REDESIGN_RESEARCH.md` §9 "Decks and the slide canvas"
(28 Oct 2026). Nothing in the app has changed. The slides are drawn in the app's default deck theme, Dark Academia
(`frontend/components/presentation/slide-canvas.tsx`). Every name, date, amount and source is invented sample data on
the Kestrel SA sample case.

Open `index.html` in a browser. Keys: `1` and `2` switch screens, `N` shows the "Needs / open questions" layer,
`J` / `K` move through slides in the editor, `P` presents, and `←` / `→` move through slides while presenting.

| Screen | Picture | What it is |
|---|---|---|
| DECK_1 Deck editor | `DECK_1-deck-editor.png` | The slide at the largest 16:9 that fits, speaker notes under it, the filmstrip on the bottom edge with a check badge per slide (✓, the number of problems, or Δ changed since made), and the right panel: the slide's figures with shown / estimated / alleged and where each comes from, its checks (a claim not yet shown, 5-5-5, 7×7, contrast) with one-click fixes. A slide citing a claim not yet shown carries a Draft band. Style opens the deck themes in the right panel. Presenting / Slidedoc / Side by side switch the deck kind. |
| DECK_2 Present | `DECK_2-present.png` | Presenter view: the slide now, its notes, the next slide, a timer against the planned length, and "If they ask" (the sources behind the slide on screen). Before presenting, a bar names any slide whose claim changed since the deck was made. |

`states/` holds a slide changed since the deck was made, the style panel open, the cover (Confidential pill and
revision date), and each screen with the notes layer open.

## What it fixes (research §9)
- Decks could be seen only inside the AI panel while a draft was open; there was no deck list, editor or present mode.
- "Keep chart" said "Decks are made from an AI draft" when none existed: a deck is now made from the story tree, a
  collection or an AI draft (backend needs `POST /decks` without an AI candidate).
- Slides were `role="img"`: they are drawn as real text inside a figure.

## Open questions (also on the notes layer)
1. Should a deck with a Draft slide be blocked from Present, or only warned? Drawn: warned.
2. Export to PDF as well as .pptx? DeckCraft's PDF export could do it through the native module.
3. Keep the Side by side view (slidedoc vs presenting)?
4. Two screens (presenter here, audience there) need the browser's window-management permission; fall back to one
   window with a key to swap?
5. Keep "If they ask", or is it too much on screen while talking?
