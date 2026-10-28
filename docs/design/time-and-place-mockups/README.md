# Time and place mockups (for Ony's review)

Nine screens at 1440 x 900 in Rain Noir (eight timeline views and Places), made from `docs/design/REDESIGN_RESEARCH.md` §2.9 (the timeline) and §2.10
(places), the "stack in depth" decided in `docs/discovery/README.md` (10 Oct), and the BACKLOG items "See › Timeline"
and "See › Places" (28 Oct 2026). Nothing in the app has changed. Every name, place, date, amount and count is invented
sample data on the Kestrel SA sample case: nothing on these screens was measured. The three earlier Timeline designs
(claude.ai canvases: Timeline mockups, Workbench redesign boards 4–13, Workbench_Walkthrough) were read board by board
on 28 Oct; what they had and this set lacked is now drawn (below). Following DECISIONS.md, Lanes is the base, Build
your own is a mode, and the Story scrub is Replay.

Open `index.html` in a browser. Keys: `1` to `9` switch screens, `N` shows the "Needs / open questions" layer. The
file is self-contained: fonts are embedded, no network is used.

| Screen | Picture | What it is | Research it uses |
|---|---|---|---|
| TIME_1 Timeline · Lanes | `TIME_1-timeline-lanes.png` | The working view: a lane per party, My timeline (your beliefs and placeholders) above the record, one mark for "is it shown" and a band for how exact the date is, quarter bars with a share-shown line, named periods as tints, a sequence check (tender → bid → **no award** → payment), the drag-on filmstrip, the undated tray, the time rail | §2.9 (Lanes, one certainty mark, sequence checks, confidence line, my timeline vs the record, adding events, states); BACKLOG timeline items |
| TIME_2 Timeline · Stack in depth | `TIME_2-timeline-stack-in-depth.png` | Ony's stack: one layer per week of evidence, the later layers receding, empty stretches skipped ("4 weeks later"), month-only evidence in its own dashed layer, cards that show the evidence itself with one hue per kind | discovery README "stack in depth"; §2.9 Stack |
| TIME_3 Timeline · Build your own | `TIME_3-timeline-build-your-own.png` | A mode beside the record (DECISIONS.md): several named timelines, a palette of every piece of evidence to drag in or Add, drag to reorder, × to take a card off, placeholders with "When, if known"; a card told out of date order says so in amber, and the record's date never moves | Timeline mockups (10 Oct) "Build your own" |
| TIME_4 Timeline · Replay | `TIME_4-timeline-replay.png` | The Story view's scrub as Replay (DECISIONS.md): the steps with a progress line and figures, a deck of each step's evidence (the wheel moves one), play, a scrubber, and a stop at each unresolved event | Workbench redesign board 9 (Story); the Walkthrough's Play |
| TIME_5 Timeline · Board | `TIME_5-timeline-board.png` | Ony's corkboard: one board per named period with documents, a person, a sticky note, a small chart and a photo, red string only where a record joins two items (dashed when not yet shown), the period's own timeline docked below | Workbench redesign boards 7, 12 and 13 |
| TIME_6 · TIME_7 · TIME_8 Slider, Curve, Periods | `TIME_6-timeline-slider.png`, `TIME_7-timeline-curve.png`, `TIME_8-timeline-periods.png` | One event at a time; a year's events as a rising line; each named period as its own screen with your summary | Workbench redesign boards 4, 5 and 6 |
| PLACE_1 Places | `PLACE_1-places.png` | Map of the town with the street map shipped in the app, rings for how sure a place is (document / town only / not yet shown), one address holding 7 companies, a party's path hop by hop with dates, places off this map as edge markers, "Can't be placed" with reasons, one dated row per place under the map with the window from the rail | §2.10 (TimeMap layout, the ring grammar, movement path, same-address cluster, before-and-after, no base map); BACKLOG places items |

`states/` holds other states of the same screens (on Lanes: the three payments with their flag, a placeholder,
Kestrel SA lit in every lane, Play paused in mid-2018, lanes by how sure at a two-year zoom, the list view; the
month-only layer on top of the Stack; a placeholder in Build your own; Replay's second step; the money's path with the
same-address panel; a place not yet shown) and each screen with the notes layer open.

## What changed after comparing with the earlier Timeline designs (28 Oct)

The three earlier designs (Timeline mockups 10 Oct, Workbench redesign boards 4–13, the Walkthrough's timeline) were
read board by board against this set. What was missing is now drawn:
- **TIME_1 Lanes:** Play (Space) grows the case month by month, later events fade behind the as-of handle; lanes by
  party, kind, source or how sure; the key is also the filter, with counts, and "hide" the month- or year-only dates;
  zoom presets with the window drawn over the quarter bars; Flags (a bracket over the time a Red Flag covers), Money (a
  row of payments on a log scale, the €10,000 line dashed, never added up) and Periods, each with its key (F, M, P);
  click a name to light that party in every lane (rings joined by a stitch); Before and after in this lane; Add to my
  timeline and Trace; List view (L); the full key list; the view opens on the next unresolved event.
- **TIME_2 Stack:** Space plays, as on every view (it was "next layer"); layers step with ↓ ↑ or J K; Auto and minute
  steps.
- **New:** Build your own as a mode (TIME_3), Replay (TIME_4), Ony's Board (TIME_5), and Slider, Curve and Periods
  (TIME_6–8), so no view tab leads to an undrawn screen.

## What each screen fixes from the backlog
- **Timeline:** the axis spans the case's own years and the 1952 record is a stub at the left edge; labels take a free
  spot beside their mark or join a group, so none overlap; plain words, no `incorporationDate` or `source:<uuid>`; each
  date is shown once; a month or a year is a band, never an invented 1 January; "source saved" dates are not events.
- **Places:** the street map comes with the app; places have dated events and say how exact they are (an address or a
  town only); the map follows the time rail.

## What you can try on the page
- TIME_1: click any mark, band or group to see it in the right panel; the dashed placeholders are yours.
- TIME_2: scroll over the stack, press Space, or pick a layer on the left; "Open them" jumps to the month-only layer.
- PLACE_1: click a place; switch the path between M. Ross and the €42,000; scroll over the strip to move the window;
  arrow keys move between places; Reset dates.

## Open questions (also on each screen's notes layer)
1. Which timeline view opens a new case? Drawn: Lanes above 40 events, Periods once periods are named, Slider otherwise.
   Keep all seven views, or drop some (Curve could fold into Lanes' year zoom)?
2. Should an out-of-order pair become a lead on its own, or only when you press Make a lead? Drawn: only on the button.
3. Lanes by source as well as by party: keep both?
4. Stack: library (Swiper cards, Codrops 3D stack) or plain CSS 3D as drawn? Every card in a layer, or five and "+3 more"?
5. Allow optional geocoding (it sends addresses out)? Drawn: off, and the key says so.
6. Places off this map: edge markers as drawn, or zoom out to show them?
7. Should GPS in a photo's metadata become a proposed place in Decide?
8. Money row and Red Flag brackets on Lanes: on by default, as drawn, or off until asked?
9. Board: Rich (as drawn) or Clean as the default; can people move the cards (the string follows)?
10. Replay: stop at every unresolved event, as drawn, or only when asked?
11. A built timeline: per person, as drawn, or shared with the case? Should it become a deck's outline?
