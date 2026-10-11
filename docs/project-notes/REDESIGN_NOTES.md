# Workbench redesign (started 10 Oct 2026)

Copied from the claude.ai Project on 11 Oct 2026; the Project copy may be newer.

Ony: "this entire site needs redesigned. It is not user friendly at ALL."

## Decided
- Colours: dark colours, not black (navy, forest, oxblood, plum, slate), with very light cream text (#F5ECDA). No black backgrounds anywhere.
- Mockups first; Ony approves before the app changes.
- Problems named: no user flow, things weirdly nested, the dashboard spread down one long page.
- One screen, no page scrolling, unless a feature is made for scrolling. Things happen when you scroll over components.
- Whole-screen features; side/top navigation hidden until the pointer reaches the edge. The most important parts of every feature are front and centre on the dashboard.
- The references are inspiration: recreate, then add and innovate, translated into components for what this app does.
- Lots of animation, so the app feels modern and fresh. Panels floating over a board get drop shadows. (Motion is switched off for people whose system asks for reduced motion.)
- Entirely different themes/formats chosen in a theme setting. Ony's pick: gritty, rainy, bokeh — "Rain Noir", built from his OnySnow Studios portfolio components (Documents\onysnow-push).
- A live "neural paths" view of the AI researching through the Authority System Suite (lights through nodes, colours for good/bad/in between, trace any thought), plus per-run operating-instruction controls from the suite.
- Replace the old TAS submodule with the Authority System Suite (github.com/onysnow/Authority-System-Suite) and reintegrate fully.
- Product pages: what it is, the goal, about the creator (drafted for Ony to edit), for users, reporters, journalists, influencers. Name: Ony wants proposals.
- The research and the redesign are delivered as two designed PDFs, not markdown.
- Timeline: mockups using all the references plus additions for large amounts of information.
- The fully open timeline: the timeline docked at the bottom, a board of that period's material above it; scrolling slides the board and the next period's items arrive. Two versions: clean, and a full corkboard.
- Ony (after the PDFs): the 16 mockup images do not cover every feature. More mockups are made as each area is built.
- Any value a case needs but doesn't have gets a flag (Missing values). Any value the app needs that the Authority System Suite lacks (or the reverse) is a problem to track (suite coverage map).

## Delivered
- Design-research-2026.pdf (120 pages) and Workbench-redesign-2026.pdf (255 pages), saved in Ony's Documents\Private-ai-design.

## Build progress (branch timeline-wip)
- Step 1, done (e2b3fa6): five themes as role tokens (Case Night default, Rain Noir, Archive, Forest Ledger, Indigo Clarity); Settings › Appearance; edge-hidden app frame; status grammar (shape + word, never colour alone); stages renamed Bring in, Check, See, Act, Keep.
- Step 2, done (5e45804): the Authority System Suite vendored at backend/app/ai/authority_suite.
- Step 3, done (cfa0f85, 49746c7): Case home dashboard; Decide screen; Missing values; Done rules for claims; suite coverage map (docs/authority-suite/SUITE_GAPS.md).
- 1MDB demo case (fdac7e8) and its expansion on 11 Oct (see DEMO_CASES.md).
- Act section screen with Red Flags list and detail (758e8fb).
- Open for Ony: BO-033 fires once per payment with no purpose (should it need a document saying there was none?); ~19,000 proposals flood Decide (needs bulk deciding); Act's type row picked unrelated types for 1MDB (fixed: types now come from Red Flags); close the app-side suite gaps (source tier, claim classification, likelihood term, right of reply) before step 4?
- Push blocked from cloud sessions until onysnow/Private-ai is added to the session's sources.
- Next: 4 Bring in, 5 See, 6 Act, 7 AI run view (neural paths), 8 knowledge and safety, 9 theme effects (Rain Noir port) and formats, 10 the product website. Each starts with mockups for features the 16 screens don't cover.

## Mockups
Canvas "Workbench redesign": https://claude.ai/artifact/A7So1mxoEw4sYHkryasdBz (boards 1–13). See prototype: https://claude.ai/artifact/8u73poSPQa9eLc5RZZXdn3.

## References Ony sent
timeline-slider, contour-timeline, chronicaltimeline, evidenceboard, processsection, streamlined-types (framer.website / framer.app); Framer marketplace: Animated Path Pro, Scroll Video Play, Scroll Stack Cards, Service Tiles, Filterable Gallery. Paid components are not copied; the app gets its own versions.
