# Frontend review: PR #117 (branch claude/laughing-tesla-dstx1t)

Scope: `frontend/` app code (features/, components/, lib/, app/), not `lib/generated/` or `vendor/`. 161 changed source
files. I could not read all of them closely, so coverage is uneven:
- Read closely: timeline (lanes-model, lanes, board, periods), money-view, wire-engine (the HTML-building and money parts),
  inspector-slot, workbench-store, lib/on-screen, lib/timestamps, lib/dates, lib/place-times, Reveal, use-decisions,
  decide-screen, case-home key handlers, deck-editor, is-it-real, your-safety, add-by-hand, pack-check/try-pack,
  deletion-panel, backup-panel, library-model, places-model, mini-network, claims-panel review/supersede, captures (part),
  following (part), notifications-pane, review-queue actions.
- Grepped every changed file for: innerHTML/dangerouslySetInnerHTML, window.open, user URLs in href, localStorage,
  onMutate/setQueryData, window/document keydown listeners, setInterval/ResizeObserver cleanup.

Not found: no HTML injection. Every `innerHTML` in wire-engine.ts runs values through `esc()`, and the only
`dangerouslySetInnerHTML` is the fixed boot script. The ResizeObserver, interval and listener effects I read all clean up.

How I checked things: `vitest` with a scratch config (`/tmp/claude-0/review/scratch/fe/vitest.config.mts`, run from
`frontend/`) that runs throwaway tests against the real modules. Everything else is traced from the code.

---

## 1. Lanes "just under the reporting line" flag mixes currencies and uses a € line for every currency (HIGH)

`frontend/features/timeline/lanes-model.ts:202-226` (`justUnder`), called from `features/timeline/lanes.tsx:202`,
drawn at `lanes.tsx:457` and `:521-526`.

`justUnder` groups payments by payer only, never by currency. It compares the raw `amount` against one `LINE = 10_000`
and labels the bracket with `group[0].currency`. The money row then draws every payment's raw amount against a line
labelled "€10,000 REPORTING LINE". The backend sends `amount_eur` for each lane event (`timeline_lanes.py`), but
nothing uses it.

- Input: one payer, 9,500 EUR on 2020-01-01 and 9,600 JPY on 2020-02-01.
- Wrong output: a structuring bracket "just under 10,000 EUR ×2" over both payments, both bars marked `flagged`. The
  JPY payment is worth about €60.
- The reverse also happens: two 9,500 GBP payments are flagged against a € line they do not sit under in euros.
- `money-view.tsx` takes care to avoid this: it has `REPORTING_LINE = {EUR, USD}` and handles one currency at a time.

Evidence: a scratch test (`/tmp/claude-0/review/scratch/fe/justunder.test.ts`) calls `justUnder` on the input above.
It returns one bracket with both ids.

Fix: group by `${payer}|${currency}` and only consider currencies that have a known line (reuse
`REPORTING_LINE` from money-view). Or compare `amount_eur` against the € line, and plot `amount_eur` on the money row
that the € line labels.

## 2. A dialog inside a hidden section counts as an open layer, so Esc stops working elsewhere (MEDIUM)

`frontend/lib/on-screen.ts:19-25` (`LAYERS`, `layerAbove`, new in this PR). Users: `features/inspector/inspector-slot.tsx:83`,
`features/custody/chain-of-custody.tsx:223`, `features/appearance/appearance-panel.tsx:77`. `case-home.tsx:578` does the
same check by hand with `document.querySelector('[role="dialog"]')`.

`:not([hidden])` only looks at the dialog element itself. Stage sections stay mounted under a `hidden` ancestor once
opened (`section-screen.tsx` keeps `opened`; `case-workbench.tsx:154` keeps stages mounted). A dialog left open in such
a section therefore still counts as "a layer above" on every other screen. Watch the run's thought drawer
(`watch-the-run.tsx:829`, `role="dialog"`) stays open, because its own Esc handler bails out when it is not on screen
(`:296`). The deck `Present` dialog (see #3) does the same.

- Steps: Act › AI drafts → open a thought (the drawer opens) → go to See › Timeline → open a party's dossier in the
  inspector → press Esc.
- Wrong output: nothing happens. `escapeTaken` returns true, so the inspector never steps back or closes. Chain of
  Custody's Esc and the theme-trial Esc are dead in the same way. Case home's 1–4 and J/K keys are disabled.

Evidence: a jsdom scratch test (`layer.test.ts`) with `<section hidden><aside role="dialog">` plus a
`[data-layer]` slot. `layerAbove(slot)` returns `true`.

Fix: in `layerAbove`, also skip elements that have a hidden ancestor:
`.some(el => !el.closest('[hidden]') && el !== self && ...)`. Do the same in case-home's `[role="dialog"]` check.

## 3. Deck editor keys fire while you type in the write-up and while the deck is hidden (MEDIUM)

`frontend/features/decks/deck-editor.tsx:213-222` and `Present` at `:331-345`.

The window keydown handler only ignores `input`, `textarea` and `select`. It does not check contenteditable, modifier
keys, or whether the deck is on screen. The Decks section stays mounted, hidden, once it has been opened (Act stage,
`case-workbench.tsx:318`). The Story write-up editor next to it is a contenteditable (TipTap).

- Steps: open Act › Decks once, then go to Act › Story and type "plan" in the write-up.
- Wrong output: "p" sets `presenting = true`, and "j"/"k" move the deck's slide. Pressing Ctrl+P to print does the same.
- The hidden `Present` dialog then takes Space, the arrows and Esc from anywhere (it only ignores `HTMLInputElement`).
  It also triggers #2, and it is still presenting when the user goes back to Decks.

Fix: return early on `ev.metaKey || ev.ctrlKey || ev.altKey`, on `typingInto(ev.target)`, and on
`!onScreen(rootRef.current)`. This is the pattern money-view and custody already use. Apply the same guard in `Present`.

## 4. Esc that closes a Reveal card also closes the layer underneath (MEDIUM)

`frontend/components/ui/reveal.tsx:90-99` (new component, used on almost every screen).

The card's Esc listener is on `document`. It closes the card but never calls `preventDefault`. The layer rule this PR
adds (`on-screen.ts`, DECISIONS_LOG 40: "The layer that takes Esc calls preventDefault") treats an Esc that is not
prevented as free. `document` listeners run before `window` ones, so the inspector slot (`inspector-slot.tsx:83`),
chain of custody, money-view (`money-view.tsx:146`) and the reading rooms act on the same Esc.

- Steps: inside an open dossier in the inspector, click a mark to pin its Reveal card, then press Esc to dismiss it.
- Wrong output: the card closes and the inspector steps back or closes too, so the dossier the user was reading is gone.

Fix: call `e.preventDefault()` in the card's Esc handler when it closes a card. Listeners that check `escapeTaken` /
`defaultPrevented` will then leave it alone.

## 5. Add by hand stores European amounts wrong (MEDIUM)

`frontend/features/by-hand/add-by-hand.tsx:40-45` (`linkProperties`, new).

`amount.replace(/[,\s]/g, '')` treats a comma as a thousands separator, always. The currency field defaults to `EUR`.

- Input: amount "29.400" (European for 29,400) → stored as `"29.400"`, which is 29.4.
- Input: "29.400,50" → `"29.40050"`.
- Input: "1,5" (1.5) → `"15"`.

The payment then goes into Money, the Lanes money row and the structuring checks with the wrong value.

Fix: reject anything that is not a plain number and say why in the form. Or parse the separators explicitly: when both
`.` and `,` appear, the last one is the decimal mark; for a lone separator, ask. At minimum, show the parsed number back
in the sentence before Add.

## 6. Safety plan and answers stay in plain localStorage after the case is deleted (MEDIUM, security)

`frontend/features/safety/your-safety.tsx:18-33`.

The reporter's safety answers and plan go into `localStorage['workbench.your-safety.<caseId>']` as plain JSON. The plan
fields are "Who knows where you are…" and "How you reach sources, and what you never carry". Keeping them in the
browser is a documented choice. But:
- **Delete → "Remove <case> from this computer"** (`deletion-panel.tsx`) never removes the key. No code anywhere calls
  `removeItem` for it (grepped).
- The key is also outside the passphrase lock and seal (ADR-0016), so anyone with the browser profile can read it while
  the app is locked.

The per-case recent searches (`search-panel.tsx:189`, names the reporter searched for) and `ir-last:<case>` are left
behind the same way.

Fix: clear every per-case `localStorage` key (your-safety, search recents, watchlist looks, ir-last, case-home visit)
in `DeletionPanel`'s success path, or in `onDeleted`. Consider stating plainly on the safety pane that the lock does not
cover it.

## 7. "Is it real?": says "It opened in a new tab" when the popup was blocked (LOW)

`frontend/features/is-it-real/is-it-real.tsx:351-354`.

`window.open` runs after an `await` of the outside-check request. Firefox's user-activation window is about 1 s, so on
a slow reply the popup is blocked and `window.open` returns `null`. The code ignores the return value and reports "Sent
to … and logged. It opened in a new tab." The server logged an outside send that never happened.

Fix: check the return value. If it is `null`, show the URL as a link to click ("Your browser blocked the new tab:
open it here"). Or open a blank tab synchronously before the `await` and set its `location` afterwards.

## 8. Pre-existing bugs in files this PR changes (reported for completeness, not introduced here)

These are on `origin/main` too, but sit in files the PR edits heavily:

- **HIGH: the Wire adds payments in different currencies together.** `features/the-wire/wire-engine.ts:131-138`
  (`linkSentence`), `:249-253` (the strand key has no currency; `S.sum += l.amount` with `cur` taken from the first
  link), `:1309-1313` (path-mode chip), `:1758-1777` (the time-strip bins have no unit at all). A scratch test
  (`wire.test.ts`): 20,000 EUR + 9,400 USD between the same two parties renders as `paid 29,400 EUR · 2× · Feb–Mar 2018`.
  The backend sends each link's raw currency (`app/services/wire.py:130`). Fix: add `l.cur` to the strand key `sk`, sum
  per currency in `linkSentence` and the path chip ("paid 20,000 EUR + 9,400 USD"), and key the time-strip bins by
  currency or show counts instead.
- **MEDIUM: Z undoes a decision while you type on Case home.** `features/case-home/case-home.tsx:433`. The handler has
  no typing check (Decide's has `typing()`). Typing a "z" in the decision card's "Or write why…" note or in the Ask box
  within the 10 s hold silently drops the held answer and eats the letter. Fix: add
  `typing(event.target) || !singleKeysOn()` as decide-screen.tsx:146 does.
