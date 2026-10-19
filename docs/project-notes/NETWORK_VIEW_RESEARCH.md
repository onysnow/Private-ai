# See · who is linked: readable networks at 100–5,000 parties (research, 11 Oct 2026)

Copied from the claude.ai Project on 11 Oct 2026.

Why: on the 1MDB demo case (81 parties, 108 links) the layered "who controls whom" layout fits everything on one screen and can't be read. Real cases reach 500–5,000 parties. Ony: "that's a design issue and needs researched to figure out how to handle it."

## Decided by Ony (11 Oct 2026)
- **Start from the most-flagged party:** the party with the most open Red Flags and disputed links, falling back to the most-linked one. Search jumps anywhere.
- **Group by default:** accounts roll up into their holder ("Low · 7 accounts") and shell chains collapse into one node. Any group can be opened, or a party pinned out. Only accounts the records say someone holds or controls are rolled up.
- **The mouse wheel zooms the graph;** stepping between parties uses the arrow keys and a "next" control.
- **Add Sigma.js for the whole-case overview** above about 300 parties; React Flow stays for the focus view. Both are already installed.
- Still open (suggested values used unless Ony says otherwise): visible-party cap 50 and per-expand cap 10; whether the time strip nets payments or only filters them; a separate "unknown party" symbol.

## What serious tools do
None draws the whole graph. They start from a search or one party, show its neighbours, and expand on demand.
- **OpenAleph:** diagrams built by hand; expand a party ("Discover asset and shares"); filter before drawing. https://openaleph.org/docs/user-guide/103/network-diagrams
- **ICIJ Offshore Leaks / Linkurious (Pandora Papers):** search, then an entity page, then click to reveal neighbours one step at a time; queries go direct ownership, then indirect, then shortest path. https://www.icij.org/investigations/panama-papers/how-to-database/ · https://linkurious.com/blog/technology-pandora-papers-investigation/
- **Maltego:** "collection nodes" gather 25 or more entities of one type into one node (a Simplify slider sets the number); pinned or noted entities stay out. https://docs.maltego.com/support/solutions/articles/15000010775-collections-tab
- **i2 Analyst's Notebook:** merge aliases; merge many transactions between two parties into one link; "remove all other items"; timeline charts. https://docs.i2group.com/anb/9.4.0/merge_chart_items.html
- **Neo4j Bloom:** starts empty with a search; right-click expands, with a cap; filters fade items rather than delete them; shortest path. https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/bloom-scene-interactions/
- **Kumu:** Focus mode grows the view one degree at a time; clustering by field. https://docs.kumu.io/guides/focus

## Research
- **Degree of interest** (van Ham & Perer 2009): search, show context, expand on demand. A degree-of-interest score both caps the view and points to what to open next. https://dig.cmu.edu/publications/2009-doigraphs.html
- **Node-link vs matrix:** node-link is best for following paths (the journalist's main question); matrices are better for dense groups. Ghoniem et al. https://aviz.fr/~fekete/Visualization%20of%20Graphs.pdf · Okoe et al. 2018 https://smsf.cs.arizona.edu/~kobourov/NL-AM-TVCG18.pdf
- **Path-finding gets significantly harder** above about 50 nodes (dense) or 100 (sparse). Yoghourdjian et al. 2020 https://arxiv.org/abs/2008.07944
- **Edge bundling** hides which line is which, so it can't be used where each link's status must show.
- **Labels:** culled by screen density (Sigma.js: 6 px threshold, one label per 100 px cell), about 100–150 legible labels on a 1,400×900 canvas (an estimate).

## Money and ownership
- **Roll accounts up to their holder and net the flows;** toggle raw, aggregated links and aggregated nodes. Sankey diagrams don't scale for transactions; use the graph for net flow plus a linked timeline for sequence. https://cambridge-intelligence.com/visualization-tools-for-flow-analysis
- **Open Ownership BOVS:** a chain of unknown intermediaries is drawn as one step labelled with a count; unknown parties are an outline with "?" (shape plus words). https://openownership.org/en/publications/beneficial-ownership-visualisation-system/introduction-to-bovs

## Libraries (free or open)
- React Flow (MIT): fine to a few hundred nodes, so the focus view.
- elkjs (EPL-2.0): layered layout in a worker.
- Sigma.js + graphology (MIT): WebGL, tens of thousands of nodes, so the whole-case overview.
- Others: Cytoscape.js (MIT), G6 v5 (MIT, with combos, collapse/expand, timebar), Reagraph (Apache-2.0).

## Recommendation
1. **Focus view by default.** Start at one party, show its neighbourhood by degree of interest, cap it at about 50 parties, lay it out in React Flow.
2. **Group, don't draw:** accounts roll up into their holder; a chain of shells becomes one "Chain of 4 companies"; leftovers become "23 more companies"; grouped links carry a tally in words ("5 shown · 2 not yet shown · 1 disputed").
3. **Interactions:** search to focus; expand by link type, 10 at a time with "more"; group and ungroup, pin a party out of a group; "hide the rest" and "path between A and B"; filters that fade rather than delete; a time strip under the canvas; a "who pays whom" matrix tab for dense clusters.
4. **Whole case above about 300 parties:** a separate Sigma.js overview of groups; clicking a group opens it in the focus view.
5. **Case-home mini network:** the focus party plus its top 8–12 by degree of interest, groups as count chips, the status key, and a tally.
