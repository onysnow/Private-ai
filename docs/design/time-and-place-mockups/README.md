# Time and place mockups (for Ony's review)

Three screens at 1440 x 900 in Rain Noir, made from `docs/design/REDESIGN_RESEARCH.md` §2.9 (the timeline) and §2.10
(places), the "stack in depth" decided in `docs/discovery/README.md` (10 Oct), and the BACKLOG items "See › Timeline"
and "See › Places" (28 Oct 2026). Nothing in the app has changed. Every name, place, date, amount and count is invented
sample data on the Kestrel SA sample case: nothing on these screens was measured. Ony's canvas frames 4–13 are not in
the repo; the screens follow the research's description of them.

Open `index.html` in a browser. Keys: `1` to `3` switch screens, `N` shows the "Needs / open questions" layer. The
file is self-contained: fonts are embedded, no network is used.

| Screen | Picture | What it is | Research it uses |
|---|---|---|---|
| TIME_1 Timeline · Lanes | `TIME_1-timeline-lanes.png` | The working view: a lane per party, My timeline (your beliefs and placeholders) above the record, one mark for "is it shown" and a band for how exact the date is, quarter bars with a share-shown line, named periods as tints, a sequence check (tender → bid → **no award** → payment), the drag-on filmstrip, the undated tray, the time rail | §2.9 (Lanes, one certainty mark, sequence checks, confidence line, my timeline vs the record, adding events, states); BACKLOG timeline items |
| TIME_2 Timeline · Stack in depth | `TIME_2-timeline-stack-in-depth.png` | Ony's stack: one layer per week of evidence, the later layers receding, empty stretches skipped ("4 weeks later"), month-only evidence in its own dashed layer, cards that show the evidence itself with one hue per kind | discovery README "stack in depth"; §2.9 Stack |
| PLACE_1 Places | `PLACE_1-places.png` | Map of the town with the street map shipped in the app, rings for how sure a place is (document / town only / not yet shown), one address holding 7 companies, a party's path hop by hop with dates, places off this map as edge markers, "Can't be placed" with reasons, one dated row per place under the map with the window from the rail | §2.10 (TimeMap layout, the ring grammar, movement path, same-address cluster, before-and-after, no base map); BACKLOG places items |

`states/` holds other states of the same screens (the out-of-order payment selected, a placeholder selected, the
month-only layer on top, the money's path with the same-address panel, a place not yet shown) and each screen with the
notes layer open.

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
2. Should an out-of-order pair become a lead on its own, or only when you press Make a lead? Drawn: only on the button.
3. Lanes by source as well as by party: keep both?
4. Stack: library (Swiper cards, Codrops 3D stack) or plain CSS 3D as drawn? Every card in a layer, or five and "+3 more"?
5. Allow optional geocoding (it sends addresses out)? Drawn: off, and the key says so.
6. Places off this map: edge markers as drawn, or zoom out to show them?
7. Should GPS in a photo's metadata become a proposed place in Decide?
