# Media suite: the UX/UI research mapped to the mockup boards

Date: 18 October 2026

This document sets what the design research says against what the "Media suite mockups" artifact contains and does. It records findings and measurements. It proposes no changes, the mockup has not been edited, and nothing has been built.

| Item | Reference |
|---|---|
| Mockup | "Media suite mockups", 60 boards, https://claude.ai/artifact/TJZpzyzP7itaRMhZ5ShRDr, version 1792318662-ce9b |
| UX/UI research | Figma-library "Design research for the investigation workbench", 120 pages, Drive id 1W2yLTbS4Tw8yvyZ_5t7kfTJt1LAon3Sh |
| Companion | "Media suite: source verification, round 2" (Claude Doc, checks the mockup's factual claims against primary sources) |

---

## 1. Scope and method

### 1.1 What was read in the research

- The section headed "Twenty things the research says" (printed pages 6 to 8 of 120).
- The "For our app" notes in the trends chapter (chapter 03).
- Chapters 04 to 09 (printed pages 27 to 80): look, how it works, seeing information, AI people can trust, brand and story, and "our own material".
- Not used: chapter 10 ("Figures that did not hold up") and appendix A (one line per article).
- The picture captions in the research cite proposals numbered C1 to C8 and D1 to D12. Those proposals sit in the companion volume the research mentions, which was not provided, so they are not mapped here.

### 1.2 What was done to the mockup

- A copy of the published artifact (1,761,622 bytes) was opened in Chromium through Playwright, viewport 1500 by 900. The mockup's scaler is 1280 px wide at scale 1, so pixel figures are design pixels.
- Each of the 60 boards was opened from its tab in its default state. No board was operated except where section 6 says so. Requests to Google Fonts were blocked, so fallback fonts were used for layout.
- Every board was audited in both themes (Case Night, Rain Noir) for text contrast and for controls. The counts of controls, target sizes, titled elements and unnamed controls were identical in the two themes, so one figure is reported. Text sizes were measured once, in Case Night.
- A full-page screenshot of every board in its default state (Case Night) was taken and each of the 60 was viewed. Rows that first rested on board text (basis T) were rechecked against these renders; where the render and the text differ, the render is used, and the basis is now R.
- The source text of each board was searched with regular expressions for key handlers, AI chips and similar markers. These are text matches, not tested behaviour.
- Token contrast and border contrast were computed from the mockup's CSS colour values with the WCAG relative-luminance formula.

### 1.3 Labels used

Result of mapping a research finding to the mockup:

| Result | Meaning |
|---|---|
| Reflected | The mockup does what the finding describes, as far as the basis below shows |
| Partly reflected | Some of what the finding describes is present and some is not, or is not shown |
| Differs | The mockup does the opposite or falls short of a figure the research gives |
| Not present | The item is not in any board |
| Not assessed | I did not examine it |
| Not applicable | The item belongs to the other app (the case and Red Flag app) or is not a design requirement |

Basis of each result:

| Code | Meaning |
|---|---|
| M | Measured in the rendered mockup |
| C | Computed from the mockup's CSS colour values |
| R | The board as drawn: a full-page screenshot of its default state, read by eye. I read what is on screen; I did not operate it |
| T | The board's own text (its notes or its one-line description). I read it; I did not test the behaviour it describes |
| S | Text match in the board's source code |

Whether a research item is applicable to the media suite is my judgement. The research's "For our app" notes were written for a different app (a case app with Red Flags, a corkboard, a network view and story mode), and section 5 lists what I set aside and why.

### 1.4 Thresholds used

| Threshold | Source |
|---|---|
| Text 4.5:1, large text 3:1 | WCAG 1.4.3, cited by the research |
| UI component boundaries and graphics 3:1 | WCAG 1.4.11, cited by the research |
| Target size 24 by 24 CSS px | WCAG 2.2 SC 2.5.8 (Level AA) |
| Target size 44 by 44 px | The figure the research gives for targets (it matches WCAG SC 2.5.5, Level AAA) |
| Focus indicator: at least a 2 px perimeter with a 3:1 change | WCAG 2.4.13, cited by the research |
| Single-key shortcuts must be switchable off or remappable | WCAG 2.1.4, cited by the research and by the mockup |

### 1.5 Results changed by the check against the renders

Rows that first rested on board text were rechecked against the rendered boards. Nine results changed; the other rows kept their result and, where the render supports them, now cite it.

| Row | Before | After | Why |
|---|---|---|---|
| Finding 4, hidden navigation | Not assessed | Partly reflected | Navigation is drawn in view on the boards; the pause before a hidden menu opens is behaviour and was not tested |
| Finding 16, a key on screen | Partly reflected | Reflected | Chain of Custody and the Listen bench in States · a bench draw a key for line style and swatches |
| Finding 18, payoff at the choice | Partly reflected | Reflected | Decide with media draws what happens and why this one is next beside the choices |
| Light scans on a dark base | Not assessed | Partly reflected | The only light images are sign crops in outlined frames |
| Monospace marks machine output | Reflected | Partly reflected | Mono is used for values and proposals; machine-made transcript text is not in mono |
| Pending change sets and named versions | Reflected | Partly reflected | A group preview and a numbered version line are drawn; Discard and Apply and named version cards were not seen |
| Standing "can make mistakes" footer | Not assessed | Not present | The footer row of every board holds key hints and a sample-data note |
| Deletion prompts with equal-weight choices | Not assessed | Partly reflected | The safe choice is ringed and outlined; the delete choice is a muted fill |
| Each diagram opens with its question | Not assessed | Partly reflected | Several main panels open with a question; others do not |

---

## 2. Measured summary

### 2.1 Counts across the 60 boards

| Measure | Result |
|---|---|
| Visible focusable controls (button, link, input, select, textarea, tabindex, role button or tab, summary) | 1,452 |
| Controls smaller than 24 by 24 px (smaller side) | 332 (22.9%), present in 53 of 60 boards |
| Controls smaller than 44 by 44 px (smaller side) | 1,287 (88.6%), present in all 60 boards; in 27 boards every control is under 44 |
| Controls with no accessible name by my test (no text, aria-label, aria-labelledby, title, alt or label) | 7, all inputs: 5 in Redaction editor, 1 in Clip line-up, 1 in Clearer for pictures and video |
| Visible elements with a `title` attribute (hover tooltip) | 363 across 29 boards; 17 of them are controls, the rest are non-interactive elements |
| Smallest rendered text per board | 7.2 px to 9.5 px; all 60 boards have text under 10 px |
| Share of characters by rendered size (rounded to whole px) | 1.5% at 9 px or less; 17.5% at 10 px or less; 42.1% at 11 px or less; 92.7% at 12 px or less; 99.8% at 16 px or less |
| Text nodes under 11 px | 3,528 of 8,968 (39.3%) |
| Visible `.chip` elements | 864; 812 contain a word of two or more letters; 52 do not (examples: ✓, ✕, Ƒ, ○, ⑂, and codes such as C3, F2, 1, 2) |
| `chip ai` markers in board source | 60 uses in 27 boards |
| Boards whose source handles a bare-letter key | 27 of 60 |
| Boards whose source has a key handler of any kind | 48 of 60 |
| Visible disabled controls | 32 (among 1,282 controls matched by a narrower selector) |
| Controls with `aria-pressed` | 247 (same narrower selector) |
| Theme switcher entries | 2 (Case Night, Rain Noir), both dark |

### 2.2 Text contrast (rendered text, each theme)

8,604 text nodes were checked in each theme. Excluded: 183 nodes per theme that are SVG text or sit on gradients or images, disabled controls, and the "›" separators in the breadcrumb.

| Theme | Nodes below their threshold | Boards affected | Lowest ratio | Of which short key labels (e.g. "R", "Enter", 10.5 px) |
|---|---|---|---|---|
| Case Night | 39 (0.45%) | 23 | 3.19:1 | 18 at 3.42:1 |
| Rain Noir | 27 (0.31%) | 21 | 2.65:1 | 18 at 2.65:1 |

No large-text failures in either theme. The other nodes below 4.5:1:

| Case Night | Ratio |
|---|---|
| The Narrowing: chip "WEAK" (9.5 px) | 3.19 |
| Look bench: "not a 360 picture" | 3.43 |
| The Narrowing: "model guess, not evidence", "needs a chosen area" | 3.43 |
| The Narrowing: chip "NOT RUN" | 3.65 |
| Is it genuine? (audio): four "MATCHES" labels (9 px) | 3.66 |
| Watchlist: five muted digits | 4.12 |
| Command palette: chip "SAID", chip "exact words", file name, the quoted line | 4.36 to 4.49 |
| Check a claim: two "✓" cells | 4.49 |
| Jobs: one text line | 4.44 |

In Rain Noir the same Narrowing items fail (3.26 to 4.13), as do the Look bench item (3.73) and the four Is it genuine? labels (3.89); the Watchlist digits, Command palette and Check a claim items do not.

### 2.3 Colour tokens, computed

Contrast of each token against the page ground and against the lightest surface (s3).

| Token | Case Night on ground | Case Night on s3 | Rain Noir on ground | Rain Noir on s3 |
|---|---|---|---|---|
| text | 13.08 | 7.54 | 15.51 | 11.44 |
| muted | 8.08 | 4.66 | 8.66 | 6.38 |
| accent | 7.50 | 4.32 | 7.27 | 5.36 |
| accent2 | 7.13 | 4.11 | 7.27 | 5.36 |
| ok | 7.98 | 4.60 | 10.32 | 7.61 |
| bad | 7.04 | 4.05 | 7.01 | 5.17 |
| unshown | 8.76 | 5.05 | 9.89 | 7.29 |
| ai | 6.98 | 4.02 | 8.70 | 6.42 |
| strong | 6.94 | 4.00 | 7.04 | 5.19 |
| line | 4.27 | 2.46 | 3.79 | 2.79 |

Surface steps (contrast between neighbouring surfaces): Case Night ground to s1 1.20, s1 to s2 1.23, s2 to s3 1.18; Rain Noir 1.08, 1.10, 1.14.

Ground values: Case Night #14263A, Rain Noir #18120F. Neither is black.

### 2.4 Borders, computed

The mockup draws chip and button borders with the `line` colour at reduced opacity (chip 0.7, button 0.6). Over each theme's surfaces I computed 12 combinations per theme (chip or button fill against the surface around it: ground, s1, s2).

| Theme | Range of border contrast | Combinations at 3:1 or more |
|---|---|---|
| Case Night | 1.92 to 3.16 | 1 of 12 (a chip border on an s2 fill against ground, 3.16) |
| Rain Noir | 1.99 to 2.67 | 0 of 12 |

WCAG 1.4.11 asks for 3:1 only where the boundary is needed to identify the control; many of these controls also carry a text label and a fill.

### 2.5 Focus indicator

The global rule is a 2 px solid outline in the accent colour with a 2 px offset. Accent against the ground is 7.50:1 in Case Night and 7.27:1 in Rain Noir; against s3 it is 4.32:1 and 5.36:1. A thicker 3 px variant in the text colour exists only inside the High contrast specimen on States · access.

### 2.6 Type

Three families through CSS variables: IBM Plex Sans (interface), Source Serif 4 (reading), IBM Plex Mono (data and machine values).

---

## 3. The twenty findings mapped to the boards

Findings are numbered in the order the research prints them. (The research's own stray numerals in the page text do not line up with the headlines, so the order is used.)

| # | Research finding | In the mockup | Basis | Result |
|---|---|---|---|---|
| 1 | Low contrast is the commonest failure; cream on dark must clear 4.5:1 for text and 3:1 for lines and marks | Text: 39 of 8,604 nodes under threshold in Case Night, 27 in Rain Noir (section 2.2). Lines: the `line` token is 4.27:1 on the ground but 2.46:1 on s3 in Case Night; computed chip and button borders reach 3:1 in 1 of 24 combinations (section 2.4). The Narrowing's own "WEAK" chip is 3.19:1 | M, C | Partly reflected |
| 2 | Dark mode is a coloured dark, not black; depth from three or four surface steps | Ground navy #14263A (Case Night) and warm dark #18120F (Rain Noir); ground plus three surfaces (s1 to s3); step contrast 1.08 to 1.23 | C | Reflected |
| 3 | One alarm colour, used rarely | Seven signal tokens per theme besides text, muted and line: accent, accent2, ok, bad, unshown, ai, strong. `bad` and `strong` are both warm red-orange tones. In the renders the amber accent marks the selected tab, the primary button and waveform fills on most boards, and a red-orange outline marks blocked, disagreeing and failed states (BLOCKED, DISAGREES, FOUND, CRASHED). How often each colour is used was not counted | C, R | Differs |
| 4 | Hidden menus cost clicks; hidden navigation needs a visible handle, a keyboard way in and a pause before it opens | In the renders navigation is drawn in view: tab strips inside boards (for example Listen, Look, Watch), a breadcrumb, section lists (Settings), a "Search or type a command" button with ⌘K in the headers the screenshots show, and a footer row of key hints (most end in "? keys"). No board was seen hiding its navigation until hover. A pause before a hidden menu opens is behaviour and was not tested | R | Partly reflected |
| 5 | Edges are fast, corners are far (Fitts' law) | Control placement on screen edges and corners was not measured | none | Not assessed |
| 6 | Motion should explain change; feedback within 100 to 200 ms | A global reduced-motion rule exists. In the render of States · access: a Reduce motion switch, a meter-refresh slider (8/s to 3/s) and the line "Nothing flashes more than 3 times a second". Compare two items says blink is capped and has a still alternative (board text). Feedback timing in milliseconds and whether the same object moves instead of reappearing were not measured | R, T | Partly reflected |
| 7 | Never colour alone: every status needs a shape and a word as well as a colour | 812 of 864 visible chips carry a word; the other 52 carry a glyph or a code only (✓, ✕, Ƒ, ○, ⑂, C3, F2, digits). In the renders most status chips pair a glyph with a word (✓ AGREES, ✕ DISAGREES, ✕ BLOCKED, ○ NOT HEARD) and unconfirmed items are dashed where confirmed ones are solid. Some cells are shape only, with no word on the cell: the step cells in each Shelf row (✓, ✕, ?, ·; the row's own chip carries the word) and the FLAG column of the frame table in Video timeline (✓ in an outline) | M, R | Partly reflected |
| 8 | Fewer choices, reveal in steps (Hick's law, progressive disclosure) | In the renders: Decide with media shows one question with three numbered choices, and the reasons for "No" appear on a separate line under "If no"; Case home's "Next up" card is one clip with three answers; dialogs have two or three buttons. Board notes: "One primary action beside the selection" (Media drop), "One line, then the details" (Check a claim), seven steps per item (Shelf). Case home and Shelf also draw many panels at once. Number of choices per screen was not counted | R, T | Partly reflected |
| 9 | People judge a page in about 50 ms; the first screen must say what this is and what to do | Not testable by measurement here. 3 of 60 boards open their one-line description with a question | none | Not assessed |
| 10 | Easy to verify builds credibility: every claim one click from its source | In the renders: media locators written out beside each quote and span (for example "media:ab12…77b0#t=160.0,164.6") in Chain of Custody, Check a claim and Findings pack; "Open" or "Enter opens" beside search results and lookups; "Behind this cell" in Rival stories shows the source crop with an Open button; "Open the span" and "Re-check hash" in Chain of Custody. Click depth was not tested | R | Reflected |
| 11 | Polish can lie; weak evidence must never look strong | In the renders, machine and unconfirmed content is drawn differently from confirmed content: dashed outlines and PROPOSED, MACHINE-MADE and UNREVIEWED chips, a dashed "NOT YET SHOWN" claim card with "Supported stays off: 2 checks left", "not yet judged" cells, and a band worded "LIKELY · support moderate" rather than a percentage. Board notes: "Weak evidence is marked, not removed", "No verdict anywhere". The "WEAK" chip itself measures 3.19:1 | R, T, M | Reflected |
| 12 | People use AI but do not trust it (78% efficient, 32% can rely on it) | A statistic about users, not a design requirement. The Glossary note says the research found people over-trust machine output | T | Not applicable |
| 13 | The trusted AI tools show their work: a plan, a step log with counts, checkpoints, AI as an actor in the same history as people | In the renders: Chain of Custody draws 13 steps from file to claim, an "AI · downstream" card and a custody log in which the app and the AI appear as actors beside people; a plan dialog lists steps with time and memory per step and totals ("Plan: Full listen on 4 items"); Decide with media has "Show the work" beside each machine proposal; Shelf draws step cells per item. Board notes: derived-file log (Clearer for audio), "The case as it stood" (Watchlist) | R, T | Reflected |
| 14 | Mark what is grounded and what is guessed | In the renders the chips THE FILE SAYS, Ƒ WORKED OUT, AI · PROPOSED, AI · READS TEXT, ⑂ DERIVED, BY HAND and HEARD · ONLY sit beside the item they describe (Rival stories, Chain of Custody, Check a claim). A plum `ai` token; `chip ai` in 27 boards | R, S | Reflected |
| 15 | Say when AI was used (disclose up front) | In the renders: Findings pack draws "Parts of this analysis were machine-assisted and checked by a named editor", a "How this was made" panel (sidecar.json: 6 models, fingerprints, licence text, a Model passport link); Check a claim repeats the sentence as "Audience line" with its length; custody-log lines carry date, time and actor, for example "14 Oct 10:38 App · AI Proposed words 02:00 to 03:00 (unreviewed)" | R | Reflected |
| 16 | Line style can carry meaning; keep a key on screen | In the renders: Chain of Custody draws a key at the top right of the diagram, a solid line "confirmed by a person", a dashed line "proposed", a dotted line "worked out", and a dashed plum line "AI". The Listen bench in States · a bench draws a swatch key under the waveform (heard, skimmed, silent, machine only, not played) | R | Reflected |
| 17 | Diagrams have error checks built in (miracle, black hole, grey hole) | In the renders: a "GAP" card in Rival stories ("Nothing outside the file puts the picture on 14 Oct except the sun window"), a gaps line in Check a claim and in Findings pack, NOT RUN and CANNOT CHECK cells in Leak report detail. Board notes: "Counts that add up" (Source adapters), "The receipt counts what was lost" (Media drop). The research's three terms are not used | R, T | Partly reflected |
| 18 | Show the payoff at the moment of choice | In the renders: Decide with media draws "What happens if yes" beside the choices, with three consequences, and "Why this one is next. Hearing it lets claim C-07 quote the span."; Rival stories draws "What would settle it" cards that say what each next step would test; most dialogs list "What will happen" above their buttons | R | Reflected |
| 19 | A credible tool shows its sources and its limits | In the renders: a sample-data note in every board footer, a "Not here: the real app, real analysis" line under every board, source codes at the foot of Settings (for example "sources: R8-S098"), "Known remainders on this computer" (Fixity and backups), "What bleeping does not hide" (Bleep by name). Board notes: "Honest limits, in the app's own words" (Glossary), "What this cannot see" (Forensic views) | R, T | Reflected |
| 20 | Sustainable and accessible go together (lean code, optimised images, contrast, screen readers, keyboard flows, no dark patterns) | Accessibility measures are in section 2. Lean code, image optimisation and hosting are not properties a mockup shows; the mockup file is 1,761,622 bytes. Dark-pattern items are in section 4 | M | Partly reflected |

Tally: Reflected 9 (findings 2, 10, 11, 13, 14, 15, 16, 18, 19); Partly reflected 7 (1, 4, 6, 7, 8, 17, 20); Differs 1 (3); Not assessed 2 (5, 9); Not applicable 1 (12).

---

## 4. Further research items that bear on the media suite

These are items from chapters 03 to 07 that I judged applicable to the media boards. Each row names the research item and the chapter it comes from.

| Research item | Chapter | In the mockup | Basis | Result |
|---|---|---|---|---|
| Keep a dark (not black) base with cream text and a small set of signal colours where meaning lives | 03, 04 | Section 2.3: dark coloured grounds, cream text; seven signal tokens per theme | C | Reflected |
| Measured contrast check for cream on each surface level | 03 | States · access shows "text … muted …" figures for one surface (s1) only; see section 6, item 4 | M, C | Partly reflected |
| A light reading theme for long documents and exported write-ups | 03 | Theme switcher has two entries, both dark. The visual theme of the four Findings-pack output forms was not assessed | M | Not present |
| Light scans on a dark base: thin outline or soft shadow so white scans do not glare | 03 | In the renders the only light images are the cream sign crops (Clearer for pictures and video, Chain of Custody, Check a claim); they sit inside rounded, outlined frames. No white document scan is drawn in any board | R | Partly reflected |
| Evidence images are corrected, not graded; correction first, accuracy over feeling | 04 | In the renders: Clearer for pictures and video draws ORIGINAL and COPY · DERIVED labels on a before and after slider, "Acceptable with a log" against "Not evidence" for generated detail; Dialogs · derive says an Illustration "cannot be used for that" | R | Reflected |
| One voice across interface, reading and data (Plex Sans, Source Serif 4, Plex Mono); avoid hairline faces | 04 | The three families in section 2.6 | M | Reflected |
| Body text around 16 px; text under 10 pt (about 13.3 px) is hard to read | 04 | 92.7% of characters render at 12 px or less; smallest text per board 7.2 to 9.5 px; 39.3% of text nodes are under 11 px | M | Differs |
| Monospace marks machine output | 03 | In the renders mono is used for hashes, media locators, proposed offsets ("proposed offset 270.436 s"), stamps and machine proposals ("a minute → midnight"). Machine-made transcript text in States · a bench and Decide with media is set in the reading or interface face and carries a MACHINE-MADE or PROPOSED chip instead | R | Partly reflected |
| Colour-blind safety: shape and word with colour, check red and green, never colour alone | 04 | In the render of States · access: a "Spectrogram without colour alone" panel with Default, Cividis-type, Grey and Inverse palettes and NORMAL, PROTAN, DEUTAN, TRITAN previews, marks that differ by shape (HUM triangle, SIREN square, SPEECH dot). Status chips pair glyph and word (finding 7). `ok` is green-toned and `bad` red-toned | R | Reflected |
| Name tokens for their role | 04 | Tokens are `ground`, `s1` to `s3`, `text`, `muted`, `line`, `accent`, `ok`, `bad`, `unshown`, `ai`, `strong` | S | Reflected |
| Reduced-motion fallback for every animation; flashes limited to 3 per second | 03, 04 | A global reduced-motion rule (source). Render of States · access: a Reduce motion switch, a meter-refresh slider, "Nothing flashes more than 3 times a second" | R, S | Reflected |
| Keyboard-only flows with a visible focus ring | 03, 05 | 48 boards have key handlers; focus ring in section 2.5. In the renders every board draws a footer row of its keys. Dialogs draw a ringed default button | R, S, C | Reflected |
| Focus Appearance (WCAG 2.4.13): at least a 2 px perimeter, 3:1 change | 05 | 2 px accent outline, 7.50:1 and 7.27:1 against the ground | C | Reflected |
| Single-key shortcuts must be switchable off or remappable (WCAG 2.1.4) | 05 | 27 boards handle bare-letter keys. The render of Command palette and key map draws a Remap control with a live conflict message ("S is Safe review. Pick another key."). No control for turning bare-letter keys off was found (section 6, item 3) | S, R, M | Partly reflected |
| Targets 44 by 44 px | 05 | 1,287 of 1,452 controls are smaller (section 2.1) | M | Differs |
| WCAG 2.5.8 target size, 24 by 24 px | 05 | 332 of 1,452 controls are smaller; the spacing and inline exceptions in the criterion were not applied | M | Differs |
| Hover tooltips fail on touch; use tap or click with an "i" | 05 | 363 visible `title` tooltips in 29 boards; 17 on controls. Shelf's note says each state has "a tooltip" | M, T | Differs |
| Button states: loading, success, error, selected with `aria-pressed`, disabled controls say why | 05 | `aria-pressed` on 247 controls; 32 visible disabled controls. In the renders a disabled button has its reason beside it: "Accept stays off until you have played the span" (Bleep by name), "Supported stays off: 2 checks left" (Check a claim), "4 spans still proposed. Accept or reject each one first" | M, R | Reflected |
| Draw each screen's state combinations, including the invisible states | 05 | The States group has 3 boards. Shelf and the Listen bench each draw a numbered picker of seven states (for example Empty, Loading, Working, Error rows, Offline, Huge list, No Docker); States · access draws the access specimens. Other boards show one state | R | Partly reflected |
| Empty links and empty buttons are common failures | 05 | 7 controls without an accessible name (section 2.1) | M | Partly reflected |
| Undo rather than confirm; in-line messages rather than pop-ups | 05 | In the renders: an Undo button with a 10 s timer in Decide with media, an Undo button in Bleep by name. The Dialogs group draws 7 boards of pop-ups, including a delete that needs the typed case name | R | Partly reflected |
| Progress, not points: coverage bars | 03 | In the renders: Case home draws "Coverage · 1 h 17 min of recordings" as a stacked bar with a legend (heard by a person, machine-read only, failed); Decide with media draws "Heard on this recording 12 min 40 s of 41:08"; Settings draws a storage bar by kind | R | Reflected |
| On opening, list what is waiting, each item clickable | 03 | In the renders: Case home draws "What changed while you were away" as four tiles and "Next up" as one card; a tile reading "7 to check · need a person" sits in the top row. Whether each tile is clickable was not tested | R | Reflected |
| Agents propose; only a person confirms (the "To check" rule) | 03 | In the renders: "0 OF 2 OFFSETS ACCEPTED" and "proposed offset … not applied" (Clip line-up); cells marked "PROPOSED · CONFIRM C" (Rival stories); "Accept stays off until you have played the span" (Bleep by name) | R | Reflected |
| Hidden vote, then "Results revealed" | 06 | In the renders: a "hide proposals until I call" checkbox (Rival stories), a "Call it first" switch (Decide with media, Case home), and a dialog "Your call first" with "SUGGESTION HIDDEN", "Lock my call and reveal" and "Show now" | R | Reflected |
| Microphone button in search and the assistant prompt; voice notes; hands-free review | 03 | A label search of the controls found no voice-input control. The 'Speak selection' control reads a selection aloud | M | Not present |
| Plans: show, edit and revise before running | 07 | In the renders: a dialog "Plan: Full listen on 4 items" with a tick box per step, time and memory per step, totals, "Measure again" and "Run plan" | R | Reflected |
| Pending change sets with Discard or Apply; named version cards | 07 | In the renders: "Accept group · 50 siren tags, same method" with "Preview the group" (Listen bench); "Version 3 · changed …, 14 Oct 16:02 · history" at the foot of the legal record. A Discard and Apply change set and named version cards were not seen. Board note: "Versions with names" (Legal status) | R, T | Partly reflected |
| AI suggestions always labelled, and every answer jumps to the exact moment | 07 | In the renders: AI and MACHINE ONLY chips on search results, "Enter opens" and "open at the word" beside them (Command palette and key map) | R | Reflected |
| A "can make mistakes" footer is the industry minimum | 07 | Not present as a standing line: the footer row of every board holds key hints and a note such as "Sample data". Per-item labels carry the message instead (MACHINE-MADE, PROPOSED, UNREVIEWED, "Machine-made hits say so") | R | Not present |
| Cost shown before an AI action runs | 07 | In the renders: "About 9 min on this computer's processor for the 2 audio files. Run after I look" (Watchlist); "Downloads 1.6 GB" (model dialog); time and memory per step in the plan dialog | R | Reflected |
| Consent for data access and operations must be built by the implementer | 07 | In the renders: dialogs list "What will happen" with "Writes the ledger line first" before each outside request; Lookup ledger lists every request with a status | R | Reflected |
| Stop the line when something is abnormal (andon) | 07 | In the renders: "Blocked by a hold" and "Refused while a legal hold is set" (Fixity and backups), "1 line not clear" on the export gate (Decide with media), a disabled "Build Editor brief" with "Closed: Every machine output has a review state" (Findings pack) | R | Reflected |
| State exactly what changed, old to new, and what did not | 07 | In the renders: a field-by-field BEFORE and AFTER table with REMOVED, REPLACED, CHANGED chips (Leak report detail); "Now / New" version lines in the model-update dialog | R | Reflected |
| Deletion and backup prompts state plainly what will happen, with equal-weight choices and no pre-selected destructive option | 03 | In the renders: each prompt lists what will happen and what is not reached. The ringed default is the safe button in the delete, burn and keep-until prompts. The choices are not equal in weight: in "Delete 3 originals for good?" the safe button is outlined and ringed while the delete button is a muted red-brown fill until the case name is typed | R | Partly reflected |
| Roles for a small team (view, comment, edit) | 06 | In the render of Watchlist and what is new: "People and roles" with a "Preview as" selector and five permitted actions (Acquire and lock, Open the media pane, Mark HEARD, Delete, Export) and a "Roles collide" warning. The actions are not named view, comment and edit | R | Reflected |
| Thumbnails small; full images only in the viewer | 03 | In the renders: the Command palette results list draws no images; Shelf rows carry thumbnails about 40 px wide; Earliest upload draws keyframes about 210 px wide; Safe review draws a shot sheet of covered tiles ("No frame shown yet") | R | Partly reflected |
| Each diagram opens with the one question it answers | 06 | In the renders several main panels open with a question as their heading: "Which story has the least against it?" (Rival stories), "When did the sun stand that high?" (Sun and shadow), "Did …say “midnight” at 02:43?" (Decide with media), "Is it still the same file" (Fixity and backups). Others open with a name or a label (Settings, Lookup ledger, Watchlist). Not counted across the 60 boards | R | Partly reflected |

---

## 5. Research items set aside as not applicable to the media suite

The following belong to the other app (the case and Red Flag app, called the Authority suite in the research), to the product's own website, or are trends the research itself rejects. Each is my reading of applicability.

| Set aside | Reason |
|---|---|
| Chapter 03 "For our app" notes on the case home as list-as-navigation, the 42 Red Flag areas and per-area tint, Red Flag levels, the corkboard and collage, story mode and per-chapter tint, the "traced so far" bar, "related by" labels in the network, a radial menu on nodes, new-case setup in two questions, the Places map filter bar | Written for the case and Red Flag app. The media boards have none of these screens |
| Chapter 06 diagram forms: ego-network, who-told-whom sequence view, approval-chain lanes, why-chain, publication graph, confidence scale, connection grid | Proposals for the other app's network and money views; their numbers (C1 to C8, D1 to D12) refer to the companion volume |
| Chapter 07 sections A11 and A12 (the Authority System Suite, where the AI stands in that app) | Describe the other app's internals |
| Chapter 08 (landing pages, calls to action, portfolio sites, logos, style guides, pitch decks) and its section B "What a credible journalism-tool site must show" | About the product's website and brand material, not the app's boards |
| Chapter 09 "Our own material: the portfolio effects and the Authority suite" | About a portfolio site and the other app |
| Retrofuturism, neo-brutalism, loud maximalism | The research's own audience, goals and values test cuts them |
| Chapter 10 and appendix A | Not used (see section 1.1) |

---

## 6. The mockup's own statements checked against measurement

Where the mockup says something about its own behaviour, this section records what I found when I checked.

1. **"At 400% the layout reflows and targets stay at least 24 by 24 px"** (States · access, note "Contrast and zoom, computed"; the board's list also says "Targets at least 24 by 24 px").
   - Measured on States · access in its default state: 27 controls, 15 under 24 px, 26 under 44 px.
   - The only 24 px rule in the CSS is `#gaSpec.t24 .btn{min-height:24px;min-width:24px}`. It applies to buttons inside the small specimen on that board, and only when the specimen's target toggle is on. Inputs in the specimen get an outline but no minimum size.

2. **Settings · Display and access, "High contrast: Raises text and shape contrast; statuses already carry a word and a shape."**
   - I pressed the switch. It changed from off to on. Across all 1,130 elements on the page, comparing seven computed properties (text colour, background colour, border colour, border width, outline width, font size, opacity), exactly one element changed: the switch itself.
   - The High contrast segmented control on States · access changes only the specimen (`#gaSpec`), by adding a 2 px border and a 3 px focus ring.

3. **Bare-letter keys can be turned off (WCAG 2.1.4)**, stated on Command palette and key map, States · access (two places) and the Settings keys summary. The States · access note also says the app "offers a switch that turns bare-letter keys off".
   - Source: 27 boards handle bare-letter keys.
   - Settings · Keys and review habits shows: Remap…, and three switches (Commit, then reveal; Show proposal now (deadline mode); Second ear on quotes).
   - A label search of every visible element on all 60 boards found no control worded as a switch for letter keys, bare keys or single-key shortcuts. The statement appears in notes and checklists; I found no rendered control for it.

4. **"The ratios shown are computed from this theme's colours"** (States · access).
   - The board shows one line, "text … muted …", computed from the text and muted colours against the `s1` surface.
   - In Case Night it reads 10.9:1 and 6.7:1, matching my computation on s1 (10.91 and 6.74).
   - After switching to Rain Noir the line still read 10.9:1 and 6.7:1 until a contrast control on the board was pressed; it then read 14.3:1 and 8.0:1 (my computation on s1: 14.35 and 8.01). It was computed once when the board was built and again on a contrast-control press.
   - Only text and muted against s1 are shown; no other colour pair or surface is.

5. **Shelf, "Every state has a word and a shape … each with a word in the legend and a tooltip."**
   - The Shelf board has 64 visible elements with a `title` attribute; none of them is a control.

---

## 7. Board by board

Columns: Controls = visible focusable controls; <24 and <44 = controls whose smaller side is under 24 or 44 design px; Low contrast = text nodes under their threshold, Case Night / Rain Noir; Titled = visible elements with a `title` attribute; AI chips = `chip ai` markers in the board source; Bare keys = the board source handles a bare-letter key; Unnamed = controls with no accessible name by my test. All figures are for the board's default state.

| # | Group | Board | Controls | <24 | <44 | Low contrast (CN / RN) | Titled | AI chips | Bare keys | Unnamed |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Shelf & import | Shelf (`shelf`) | 11 | 1 | 4 | 1 / 1 | 64 | 0 | no | 0 |
| 2 | Benches | Listen bench (`listen`) | 39 | 13 | 39 | 0 / 0 | 16 | 3 | yes | 0 |
| 3 | Benches | Look bench (`look`) | 23 | 5 | 18 | 1 / 1 | 1 | 3 | yes | 0 |
| 4 | Benches | Watch bench (`watch`) | 28 | 2 | 20 | 0 / 0 | 0 | 3 | yes | 0 |
| 5 | Where & when | The Narrowing (`narrow`) | 32 | 14 | 28 | 4 / 4 | 11 | 0 | yes | 0 |
| 6 | Safe & share | Make safe (`safe`) | 29 | 1 | 29 | 1 / 1 | 0 | 2 | no | 0 |
| 7 | Settings & trust | Models & lookups (`models`) | 29 | 7 | 29 | 0 / 0 | 0 | 0 | no | 0 |
| 8 | Shelf & import | Media drop (`drop`) | 27 | 1 | 21 | 1 / 1 | 1 | 0 | no | 0 |
| 9 | Shelf & import | Evidence strip (`strip`) | 20 | 11 | 20 | 1 / 1 | 3 | 0 | yes | 0 |
| 10 | Shelf & import | Compare two items (`compare`) | 13 | 1 | 10 | 0 / 0 | 0 | 1 | no | 0 |
| 11 | Shelf & import | Collections & search (`collections`) | 25 | 6 | 24 | 1 / 1 | 7 | 1 | yes | 0 |
| 12 | Shelf & import | File passport (`passport`) | 24 | 4 | 18 | 0 / 0 | 1 | 0 | yes | 0 |
| 13 | Shelf & import | Source adapters (`adapters`) | 20 | 2 | 20 | 0 / 0 | 0 | 0 | yes | 0 |
| 14 | Shelf & import | Jobs (`jobs`) | 16 | 5 | 16 | 2 / 1 | 0 | 0 | yes | 0 |
| 15 | Shelf & import | Glossary and how to read (`glossary`) | 18 | 0 | 7 | 0 / 0 | 0 | 0 | no | 0 |
| 16 | Benches | Spectrogram (`spectro`) | 37 | 8 | 28 | 1 / 1 | 84 | 1 | no | 0 |
| 17 | Benches | Words review (`words`) | 36 | 10 | 24 | 0 / 0 | 16 | 2 | no | 0 |
| 18 | Benches | Translation workspace (`translate`) | 32 | 17 | 27 | 0 / 0 | 2 | 2 | no | 0 |
| 19 | Benches | Clip log (`clips`) | 30 | 5 | 23 | 1 / 1 | 3 | 1 | no | 0 |
| 20 | Benches | What’s that noise? (`noise`) | 27 | 8 | 27 | 0 / 0 | 0 | 2 | no | 0 |
| 21 | Benches | Clearer for audio (`clearer-audio`) | 21 | 4 | 21 | 0 / 0 | 0 | 2 | no | 0 |
| 22 | Benches | Is it genuine? (audio) (`genuine-audio`) | 14 | 0 | 13 | 4 / 4 | 3 | 0 | no | 0 |
| 23 | Benches | Forensic views (`forensic`) | 24 | 2 | 16 | 1 / 1 | 0 | 0 | yes | 0 |
| 24 | Benches | Redaction editor (`redact`) | 23 | 5 | 21 | 1 / 1 | 0 | 2 | yes | 5 |
| 25 | Benches | Visual search (`visual-search`) | 19 | 3 | 14 | 0 / 0 | 0 | 3 | yes | 0 |
| 26 | Benches | Panorama and 360 (`pano`) | 18 | 0 | 16 | 1 / 1 | 0 | 1 | no | 0 |
| 27 | Benches | Video timeline (`watch-timeline`) | 16 | 4 | 15 | 0 / 0 | 0 | 1 | yes | 0 |
| 28 | Benches | CCTV and recorder intake (`cctv`) | 5 | 1 | 5 | 0 / 0 | 0 | 4 | yes | 0 |
| 29 | Benches | Clip line-up (`sync`) | 17 | 2 | 13 | 1 / 1 | 0 | 1 | yes | 1 |
| 30 | Benches | Earliest upload (`upload`) | 17 | 0 | 13 | 0 / 0 | 0 | 0 | yes | 0 |
| 31 | Benches | Clearer for pictures and video (`clearer-visual`) | 24 | 1 | 24 | 0 / 0 | 0 | 0 | yes | 1 |
| 32 | Where & when | Sun and shadow (`sun`) | 25 | 5 | 25 | 0 / 0 | 14 | 0 | yes | 0 |
| 33 | Where & when | Map features (`map-search`) | 34 | 7 | 32 | 0 / 0 | 0 | 0 | yes | 0 |
| 34 | Where & when | Calculators (`calc`) | 15 | 2 | 12 | 0 / 0 | 3 | 0 | yes | 0 |
| 35 | Where & when | Rival stories (`hypotheses`) | 39 | 8 | 33 | 0 / 0 | 2 | 0 | no | 0 |
| 36 | Where & when | Time Lanes (`timelanes`) | 20 | 5 | 20 | 0 / 0 | 8 | 0 | yes | 0 |
| 37 | Safe & share | Findings pack (`pack`) | 20 | 8 | 16 | 0 / 0 | 7 | 0 | no | 0 |
| 38 | Safe & share | Leak report detail (`leak`) | 17 | 2 | 17 | 1 / 1 | 0 | 0 | no | 0 |
| 39 | Safe & share | Bleep by name (`bleep`) | 22 | 6 | 22 | 0 / 0 | 12 | 1 | no | 0 |
| 40 | Settings & trust | Legal status (`legal`) | 20 | 3 | 20 | 1 / 1 | 0 | 0 | no | 0 |
| 41 | Settings & trust | Settings · Media (`settings`) | 20 | 6 | 20 | 0 / 0 | 5 | 0 | no | 0 |
| 42 | Settings & trust | Lookup ledger (`ledger`) | 21 | 0 | 21 | 0 / 0 | 0 | 0 | no | 0 |
| 43 | Settings & trust | Fixity & backups (`fixity`) | 18 | 3 | 18 | 1 / 1 | 0 | 0 | no | 0 |
| 44 | Care | Safe review (`safe-review`) | 25 | 7 | 18 | 1 / 1 | 5 | 4 | yes | 0 |
| 45 | In the app | Chain of Custody with media (`custody`) | 30 | 5 | 16 | 0 / 0 | 0 | 6 | yes | 0 |
| 46 | In the app | Case home with media (`casehome`) | 10 | 1 | 10 | 0 / 0 | 3 | 2 | no | 0 |
| 47 | In the app | Command palette and key map (`palette`) | 29 | 8 | 23 | 4 / 0 | 24 | 0 | yes | 0 |
| 48 | In the app | Decide with media (`decide`) | 22 | 7 | 19 | 1 / 1 | 1 | 6 | no | 0 |
| 49 | In the app | Check a claim with media (`claim`) | 17 | 3 | 11 | 2 / 0 | 1 | 1 | no | 0 |
| 50 | In the app | Watchlist and what is new (`watchlist`) | 13 | 4 | 13 | 6 / 1 | 14 | 1 | no | 0 |
| 51 | Modals | Dialogs · outside lookups (`m-lookup`) | 35 | 14 | 35 | 0 / 0 | 2 | 0 | no | 0 |
| 52 | Modals | Dialogs · legal (`m-legal`) | 44 | 7 | 44 | 0 / 0 | 0 | 0 | no | 0 |
| 53 | Modals | Dialogs · models (`m-models`) | 31 | 9 | 31 | 0 / 0 | 0 | 0 | no | 0 |
| 54 | Modals | Dialogs · derive (`m-derive`) | 36 | 14 | 36 | 0 / 0 | 0 | 0 | no | 0 |
| 55 | Modals | Dialogs · review (`m-review`) | 41 | 15 | 41 | 0 / 0 | 0 | 2 | no | 0 |
| 56 | Modals | Dialogs · care (`m-care`) | 43 | 14 | 42 | 0 / 0 | 0 | 0 | yes | 0 |
| 57 | Modals | Dialogs · data (`m-data`) | 38 | 11 | 38 | 0 / 0 | 0 | 0 | no | 0 |
| 58 | States | States · Shelf (`s-shelf`) | 14 | 0 | 14 | 0 / 0 | 49 | 0 | no | 0 |
| 59 | States | States · a bench (`s-bench`) | 12 | 0 | 11 | 0 / 0 | 1 | 0 | yes | 0 |
| 60 | States | States · access (`s-a11y`) | 27 | 15 | 26 | 0 / 0 | 0 | 2 | yes | 0 |

---

## 8. Limits

- Each board was measured in its default state. Dialogs opened from boards, states reached by interaction and the behaviour of controls were not exercised, except as stated in section 6.
- Target size is the control's own box. The spacing, inline, equivalent-control and essential exceptions in WCAG 2.5.8 were not applied.
- The text contrast audit skips 183 text nodes per theme (SVG text and text over gradients or images). Disabled controls and the breadcrumb separators were excluded.
- Because Google Fonts requests were blocked, text used fallback faces. Font sizes are set in CSS and are unaffected; the box sizes of text-based controls could differ slightly with the real faces.
- Source-code counts (key handlers, AI chips) are regular-expression matches in the board's source, not tests of behaviour. Key lists were capped at 12 keys per board.
- Rows marked T rest on what a board says about itself. I read the text; I did not test that the behaviour exists. Rows marked R rest on my reading of a full-page screenshot of the board's default state; all 60 boards were viewed once. Where a board's text and its render differ, the render is used.
- No screen reader, no real users and no usability test were involved. Findings 5 and 9, and some rows in section 4, need examination or testing I did not do (placement against screen edges, a 50 ms first look, click depth, how long a menu waits before it opens).
- The research is a secondary source: a reading of Figma-library articles. Its own chapter 10 lists figures that did not hold up; that chapter was not used here.
- Applicability of the research's "For our app" notes (section 5) is my judgement.
- No change has been made to the mockup, and nothing has been built.
