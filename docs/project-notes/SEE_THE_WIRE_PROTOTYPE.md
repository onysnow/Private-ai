# See · "The Wire" prototype (11 Oct 2026, awaiting Ony's approval)

Prototype: https://claude.ai/artifact/8u73poSPQa9eLc5RZZXdn3. Source: docs/design/see-the-wire/
(src.html with a `__DATA__` placeholder, prep.py builds the data from the 1MDB case and the red
flags API). Built on NETWORK_VIEW_RESEARCH.md. The name "The Wire" is a proposal.

## One map, three altitudes (semantic zoom)
- **Whole case:** parties sit in soft merged patches.
  - Patches are groups found by community detection, named "Around <most-linked member>", each with party and open-flag counts.
  - Unlinked parties sit in a "Not linked to anyone yet" row.
  - Labels are culled so none overlap.
- **Around a party:** the view opens here, on the most-flagged party (Tanore Finance, 9 flags).
  - Compass sectors: owners and directors W, what it owns E, money in N, money out S, money both ways NE, other links SW.
  - Ring 1 is cards. Ring 2 is dots chosen by degree of interest (flags×3 + links), two per branch, with "+N more" chips.
  - The rest of the case stays as dust.
- **One link:** the two parties sit at the ends of a straight wire.
  - Each record is a bead on a date axis: above the line goes one way, below goes back.
  - Each bead hangs a tag with the amount, date, purpose and the source quote with document and page.
- **Moving between them:** the wheel drops to "around a party" past a depth over a party, and rises to the whole case when zoomed out far. An altimeter on the right shows the altitude, and each stop is clickable.

## Other pieces
- **Lens (L):** a fisheye loupe on the map (after yWorks Wonderlens), with names on its ring and a kind tally.
- **Follow the money (F):** the shortest chain between two parties, preferring payments, drawn as a red thread with a chip per hop.
- **Money as current:** lights run along payment lines the way the money went. Thickness is the amount on a log scale. No arrowheads.
- **Accounts rolled into holders:** the accounts show as beads on the holder's card. This exposes the round trip Malaysian Official 1 → Tanore → back. "ROUND TRIP · TEXTBOOK" marks where ML-023 fired.
- **Shell chains:** collapse to a stacked deck you click to open.
- **Time strip:** money per quarter plus events. The handles fade links outside the window, and Play grows the case through time.
- **Navigation:** a "Where you've been" trail, "Next most-flagged", arrow keys around the ring, and Esc to rise one altitude.

## Open for Ony
- **The name** "The Wire".
- **Line styles:** the shown / not yet shown / disputed styles need reviewed links.
- **Build plan once approved:** React Flow for the focus view, and Sigma for the map above ~300 parties.
