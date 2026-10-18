# The chart builder as a creation tool

Status: proposed, 5 October 2026. Nothing here is built. The prototype is `chart-builder-prototype.html` in this folder, running on the demo investigation's records.

## What Ony asked for

> "I imagined the chart builder as its own creation allowing a user to completely control the flow and representation and design of a chart/graph. They can populate it which whatever entities they want, start auto searching for this with a toggle or set them to auto. Or whatever. It's fully interact-able with drag and drop nodes, connections, entities can be dropped into it and show up as an icon with prefilled names/hover data and more. I want people to be able to have all of the evidence, data, etc and be able to fully customize how they can see, interact, visualize that information and whatever else. I believe people can ultimately make better charts than the sites defaults and then be able to share those chart schemas/designs with other users by exporting a design file or something that the app can read and create from."

Today's builder (docs/visuals/README.md) is an order slip. The reporter picks a kind and fields, the server draws the chart, checks it against rules 0–20, and refuses any chart that fails a rule. The reporter has no control over layout, and nothing on the canvas can be moved.

## Requirements

| # | Requirement | From |
|---|---|---|
| B1 | A free canvas: the reporter places, moves, groups and connects anything | "completely control the flow and representation" |
| B2 | Any record can be dropped in: party, claim, evidence, event, a tag or a collection (brings all its records) | "populate it with whatever entities they want" |
| B3 | A dropped party appears as its kind's icon, with its name already filled in and a hover card built from the record | "show up as an icon with prefilled names/hover data" |
| B4 | Connections are drawn by dragging; links that already exist between two dropped parties come with them (a switch) | "drag and drop nodes, connections" |
| B5 | Each party carries a research switch: off / ask first / automatic (the starting value is question 4; the prototype starts at off) | "auto searching … with a toggle or set them to auto" |
| B6 | Every visual property is controllable per item and per chart: shape, colour, which facts show, line pattern, width, label | "fully customize how they can see" |
| B7 | A second mode for data charts (bars, timelines, scatter) built by dropping fields on shelves | "how they can … visualize that information" |
| B8 | A design file that can be exported, shared, and opened to rebuild the chart | "share those chart schemas/designs … a design file" |
| B9 | Undo/redo, zoom, pan, snap, fit | needed for any direct-manipulation editor (Shneiderman 1983) |

## The line between design and truth

Giving full control over the design raises one question: what is the reporter allowed to change?

The proposal: **the reporter controls how things look; the records control what is true.**

| Reporter may | Reporter may not |
|---|---|
| Place, size, colour, shape, hide, label anything | Type a value into a bar, a date or an amount |
| Draw a connection the records do not have | Make a drawn connection look like a record |
| Draw an unproven link solid | Remove the "not shown by a source" mark from the export |
| Arrange by a rule, then move anything | Hide the source line or the record count |

How it shows in the prototype:

- A connection drawn by hand is plum (the "machine-made / not a record" colour from the discovery colour roles), carries a **NOT A RECORD** badge, and is listed as "drawn by hand" in the design file. Two buttons sit on it: *Make it a claim* and *Research these two*. A hand-drawn line becomes evidence only through the normal claim flow.
- In Chart mode, every value is computed from records. There is no field to type a number into.

### What happens to rules 0–20

Today every rule refuses the chart. In a reporter-made chart that is too strict for style and too loose to drop. The proposal splits them:

- **Still refused** (the chart would state something false): 0 numbers match the data, 1 bars start at zero, 2 no log on bars, 3 no negative sizes, 4 no double totals, 15 every value links to a record, 19 no mixed currencies.
- **Advice, shown in "Check this design" and carried into the export** (the chart is true but may read badly): 5–14, 16, 18, 20, plus three new checks for the free canvas:
  - a colour the reporter picked that the chart already uses for a kind of party or link ("one meaning per colour", Munzner ch. 10);
  - an unproven link drawn solid (readers take solid as shown);
  - connections drawn by hand (count and where).

Advice does not block saving or exporting. A picture exported for a story carries the source line and, where advice was overridden, a note in the alt text and data table.

This split is a decision for Ony (question 1 below).

## Two modes

### Diagram mode (networks, maps of who is involved)

- **Records panel** (left). Tabs: Records (parties, claims, evidence, events, search), Tags & collections, Notes & shapes. Items already on the canvas say so.
- **Canvas** (centre).
  - Dropped parties show the kind's icon, coloured by kind (gold company, blue person, sage organisation, rust property), sized by number of links. Size can also follow money moved, or be the same for all.
  - Every party has a gold dot on its edge. Dragging from it to another item draws a connection.
  - Links from records keep the network's language: tapered for direction (Holten & van Wijk 2009), dashed when not shown by a source, a red "!" when sources disagree, and parallel links bowed apart.
  - Claims, evidence and events drop as cards with a status stripe. Their gold dot connects them to the party they are about.
  - Marks the reporter adds (note, group frame, heading) are plum and never counted as findings. A group frame moves what is inside it.
- **Arrange by a rule** (toolbar): Free, Who controls whom, By kind, Circle. Each rule places everything once and fits it to the view; anything can be moved afterwards. Toolbar also has Fit, "Bring links with a party", "Snap to grid", "Colour by" (kind or tags), and "Size by".
- **Inspector** (right).
  - Nothing selected: the summary (parties, record links, hand-drawn links, other items), what is set to research, and the design check.
  - A party: shape (dot or card), colour, which facts show on the canvas (everything else is in the hover card), the research switch, and *Research in connection with…*.
  - A connection: pattern (by how sure / solid / dashed), width (thin / thick / by money), colour, show words.
- **Hover** on any party lists its kind, country, every link with direction, and its tags. Hover on a link gives the record and how sure it is, or says it was drawn by hand.

### Chart mode (bars, timelines, scatter)

- The shelves follow Tableau's (Stolte, Tang & Hanrahan 2002, Polaris): Across, Up, Colour, Size, Small multiples.
- Fields come from the records (Payments, Events, Claims, Parties). The chart kind is chosen from what is dropped, after Mackinlay, Hanrahan & Stolte 2007 ("Show Me"):
  - category or party across → bars sorted by value;
  - a date across → a timeline with one lane per Colour value;
  - two numbers → a scatter.
- The finished chart goes through the same render service and rules as today. Only the refusal split above changes.

## The design file

The design file is JSON, with `format: "journalism-workbench/chart-design"` and a `version`. It follows Vega-Lite's split (Satyanarayan et al. 2017): the design is a specification, and the data is bound when it is opened.

```json
{
  "format": "journalism-workbench/chart-design",
  "version": 1,
  "title": "Bellcastle money trail",
  "mode": "diagram",
  "contains": "design only: no names, no records",
  "rules": {"colourBy": "kind", "sizeBy": "links", "bringLinks": true, "snap": true},
  "nodes": [
    {"role": "party_1", "kind": "Company", "x": 264, "y": 198, "style": {"shape": "card", "show": ["name", "kind"], "auto": "auto"}},
    {"role": "party_2", "kind": "Company", "x": 572, "y": 198, "style": {"shape": "circle", "show": ["name", "kind"], "auto": "off"}},
    {"role": "mark", "kind": "note", "x": 300, "y": 420, "text": "Write a note…", "style": {}}
  ],
  "connections": [
    {"from": "party_1", "to": "party_2", "record_kind": "Ownership", "drawn_by_hand": false, "style": {}},
    {"from": "party_3", "to": "party_4", "record_kind": null, "drawn_by_hand": true, "style": {}}
  ],
  "chart": {"x": null, "y": null, "color": null, "size": null, "facet": null}
}
```

There are two exports, plus a picture.

- **Design only, to share.** Parties become roles (`party_1`, `party_2`…) with their kind. The file holds no names, no record ids, no claim or evidence text. Only the title the reporter typed is kept. It can be shared outside the newsroom without leaking a case.
- **Design with record references.** For the reporter's own team. It carries record ids, so it opens with the same records only inside an investigation that holds them.
- **Picture (PNG).** For a story. It carries the key, the source line and the rule line.

### Opening a design file

When a design-only file is opened, each role is filled with a party of the same kind. The app tries each starting party and keeps the filling that matches the most of the template's connections to real links (then prefers the most-linked parties). The reporter can swap any party in the inspector.

- A connection that matches no record in this investigation keeps its style and is marked "no matching record here".
- A hand-drawn connection stays hand-drawn.
- In the prototype, opening the demo's own template refilled all four parties and matched 4 of 4 record links.

### Checks on opening a design file

These are proposed for the build; the prototype checks only the format line.

- Validate against a JSON Schema for each `version`, using Pydantic on the server.
- Refuse unknown versions.
- Cap the file size and node count.
- Strip any field the schema does not know.
- Treat text in notes as plain text, never HTML.

## Libraries

The canvas library is the open decision.

| | React Flow (`@xyflow/react` 12, already in the app, MIT) | Konva + react-konva (ADR-0005 line 7, still Proposed, MIT) | tldraw |
|---|---|---|---|
| Nodes as React components (icons, cards, hover cards reuse the app's components) | yes | no, drawn on canvas | yes |
| Handles, connecting, selection, zoom/pan, minimap, snap | built in | build ourselves | built in |
| Free shapes (notes, frames, headings) | as custom nodes | built in | built in |
| Thousands of items | slows past a few thousand DOM nodes | fast (canvas) | — |
| Accessibility (keyboard, screen reader) | DOM, so reachable | canvas needs a separate accessible layer | DOM |
| New package (ADR needed) | no | yes | paid licence (ADR-0005) |

The proposal is React Flow for Diagram mode, because it is already a dependency and covers B1, B3, B4 and B9 out of the box. The tapered, dashed and bowed links would be a custom edge component reusing the network's drawing code. ECharts, also already present, would serve Chart mode through the existing render service.

If React Flow is chosen, ADR-0005 line 7 would be amended rather than accepted. Konva stays the answer if canvases of several thousand items are expected; the research-design scale estimate puts a large case at ~1,000 parties, and a hand-made chart is usually far smaller.

Undo/redo would use snapshot history (as in the prototype) or zundo if the store is Zustand; that needs checking against the frontend's store before choosing.

## Data model and API (sketch)

- **Table `chart_designs`**: `id`, `investigation_id` (null for a shared design-only template), `title`, `mode`, `spec` (JSON, the design file), `version`, `created_by`, `created_at`, `updated_at`.
- **Endpoints**:
  - `GET/POST/PATCH/DELETE /api/investigations/{id}/chart-designs`
  - `POST …/chart-designs/import` (validate, fill roles, return a preview of what matched)
  - `GET …/chart-designs/{did}/export?with_refs=false`
  - `POST …/chart-designs/{did}/check` (returns errors and advice)
- **Research switch**: a party's `auto` value writes to the same `lookup_settings` as discovery (system-design.md). Findings appear as a badge on the party and wait in Research, so the builder adds no new queue.
- **Record changes**: the canvas holds record ids, so a renamed party or a corrected link updates on reload. A deleted record leaves its place empty, with a note naming what was removed.

## Sources

- Shneiderman, B. (1983). *Direct manipulation: a step beyond programming languages*. IEEE Computer 16(8). Visible objects, rapid reversible actions, immediate feedback.
- Stolte, C., Tang, D., Hanrahan, P. (2002). *Polaris: a system for query, analysis and visualization of multidimensional relational databases*. IEEE TVCG 8(1). The shelf model.
- Mackinlay, J., Hanrahan, P., Stolte, C. (2007). *Show Me: automatic presentation for visual analysis*. IEEE TVCG 13(6). Choosing the chart from the fields dropped.
- Satyanarayan, A., Moritz, D., Wongsuphasawat, K., Heer, J. (2017). *Vega-Lite: a grammar of interactive graphics*. IEEE TVCG 23(1). A portable JSON specification bound to data at open time.
- Wilkinson, L. (2005). *The Grammar of Graphics*, 2nd ed. Springer. Design as a specification separate from data.
- Holten, D., van Wijk, J. J. (2009). *A user study on visualizing directed edges in graphs*. CHI 2009. Tapered links for direction.
- Munzner, T. (2014). *Visualization Analysis and Design*, ch. 10. One meaning per colour channel.
- docs/visuals/README.md, "The rule map". Rules 0–20.
- ADR-0005, line 7: the editor-base decision, still Proposed.

## Questions for Ony

1. **Rules.** Should rules 0–4, 15 and 19 stay refusals and the rest become advice in reporter-made charts?
2. **Canvas library.** React Flow (already in the app) or Konva (ADR-0005 line 7)?
3. **Sharing.** Who can a design-only file go to: inside the newsroom only, or anyone? Should the app hold a shared gallery of templates?
4. **Research switch.** Should a party dropped on the canvas start at automatic (as lookups do), or off?
5. **Hand-drawn connections.** Should they be allowed in a picture exported for a story, or only on the canvas and in design files?
