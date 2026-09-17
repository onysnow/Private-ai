# Legal and Investigative Visual Standard

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

Version: 1.0  
Prepared: 2026-09-16  
Applies to: investigative reports, legal review, financial-crime analysis, case chronologies, corporate and ownership research, public-record work, presentations, and proposed demonstrative or summary exhibits.

## 1. Purpose

This standard governs how to select, specify, build, label, cite, and audit charts, graphs, diagrams, maps, tables, and document-based visuals. Its central rule is:

> A visual may simplify presentation, but it may not simplify away provenance, uncertainty, scope, or a material alternative explanation.

The standard is an information-design and quality-control framework. It does not decide admissibility, satisfy jurisdiction-specific procedure, establish authenticity, or replace review by qualified counsel.

## 2. Non-negotiable rules

1. **Validate the data before drawing.** Build the evidence table, event register, relationship register, or transaction ledger first.
2. **Trace every material element.** Every node, arrow, amount, date, category, quotation, area, line, and conclusion must map to a source or be explicitly labeled as analytical or unknown.
3. **Do not let visual certainty exceed evidentiary certainty.** A suspected connection may not look identical to a documented connection.
4. **Do not use proximity as proof.** Items placed near one another can imply association or causation; make the intended relation explicit.
5. **Do not use chronology as proof of causation.** Sequence alone does not establish motive, coordination, or cause.
6. **Separate ownership, control, management, agency, signatory authority, shared address, payment, communication, and allegation.** These are different edge types.
7. **Separate gross, net, fee, refund, reversal, attempted, pending, and completed amounts.** State currency and conversion basis.
8. **Use labels or symbols in addition to color.** The visual must remain intelligible in grayscale and to readers with color-vision differences.
9. **Show scope and exclusions.** State period, included sources, materiality threshold, aggregation rules, and known omissions.
10. **Preserve a non-visual alternative.** Provide an accessible table or text summary containing the same material information.
11. **Label the visual's status.** At minimum: working analysis, publication graphic, illustrative aid, proposed summary, or admitted exhibit.
12. **Audit the rendered artifact.** Inspect the actual PDF, slide, image, or webpage—not only the source code or data.

## 3. Required visual specification

Create this specification before production:

| Field | Required content |
|---|---|
| Visual ID | Stable identifier, such as `VIS-004` |
| Question | The one question the visual should answer |
| Audience and use | Investigator, editor, counsel, court, public, internal review, or other stated audience |
| Legal/status label | Working analysis, illustrative aid, Rule 1006 candidate, publication graphic, etc. |
| Controlling dataset | Named evidence, event, relationship, or transaction table and version/hash |
| Unit of analysis | Transaction, entity, event, document, claim, account, jurisdiction, or time interval |
| Included scope | Date range, entities, sources, currencies, jurisdictions, thresholds |
| Exclusions | Missing periods, unreadable records, filtered items, de minimis threshold, unresolved duplicates |
| Encodings | Exact meaning of position, length, area, color, shape, line, arrow, thickness, pattern, and opacity |
| Uncertainty treatment | How allegation, inference, hypothesis, conflict, approximation, and unknown are shown |
| Citation method | Element IDs, footnotes, evidence keys, hyperlinking, or source appendix |
| Accessibility output | Text alternative and data table location |
| Acceptance criteria | Factual, mathematical, visual, and legal-review gates |

If the question cannot be written in one sentence, split the visual or create a dashboard with separately titled panels.

## 4. Visual selection rule

Choose by analytical question, not by appearance.

| Question | Default visual | Common legal/investigative use | Do not use when |
|---|---|---|---|
| What happened, and when? | Event table plus timeline | Case chronology, notice, communication, filings | Dates are too uncertain to order without showing ranges |
| Who is connected to whom? | Link or relationship chart | People, entities, accounts, communications | Edge type or direction cannot be established |
| Who owns or controls what? | Ownership/control diagram | Corporate structures, beneficial ownership, signatory authority | Ownership and control are being inferred from one proxy |
| Where did value move? | Transaction table plus directed flow diagram | Funds, assets, invoices, disbursements | Amounts cannot be reconciled or intermediaries are missing |
| How did a process operate? | Process/activity/event-flow diagram | Scheme mechanics, approval chain, document lifecycle | A generic process is being presented as a case-specific event sequence |
| How do categories compare? | Sorted bar or dot plot | Counts, amounts, cases, entities, jurisdictions | Baselines or category definitions differ materially |
| How did a value change over time? | Line or step chart | Balances, volume, filings, communications | Observations are sparse or intervals are incomparable |
| What is the distribution? | Histogram, dot plot, or box plot | Transaction sizes, delays, durations | Sample is too small or data quality is unknown |
| Are two numeric variables related? | Scatter plot | Amount versus frequency, delay versus value | The chart may be misread as proving causation |
| How does a total bridge between components? | Waterfall chart | Gross-to-net reconciliation, opening-to-closing balance | Components overlap or do not reconcile |
| What proportion belongs to each part? | 100% stacked bar; pie only for a few simple parts | Portfolio or category shares | Parts overlap, do not total 100%, or precise comparison matters |
| What evidence supports which claim? | Claim-to-evidence matrix or bipartite map | Brief, report, allegation audit | The display would obscure contradictory sources |
| What is known versus disputed? | Evidence-state matrix | Competing accounts, authenticity, source conflicts | Categories are not defined consistently |
| Where did events occur? | Point/choropleth/flow map | Property, transactions, travel, filings | Geography is incidental or location precision creates risk |
| Which issue deserves attention? | Prioritization matrix or table | Leads, gaps, review queue | Scores are subjective but presented as objective measurement |

See `VISUAL_TYPE_DECISION_MATRIX.md` for the expanded catalog.

## 5. Investigative diagram grammar

### 5.1 Node types

Use a restrained and stable shape system. Always include a text label; shape may reinforce but never replace the label.

| Node | Suggested form | Required minimum label |
|---|---|---|
| Person | Circle or rounded rectangle | Name/alias and stable entity ID |
| Organization/legal entity | Rectangle | Legal name, jurisdiction if relevant, entity ID |
| Account/wallet | Capsule or rectangle with account icon | Masked identifier, institution/network, account ID |
| Asset/property | Hexagon or tagged rectangle | Asset description and asset ID |
| Document/evidence item | Page-shaped or plain rectangle | Evidence ID, date, document type |
| Event | Dated card/marker | Event ID, date precision, short verb phrase |
| Unknown/intermediary | Neutral outlined node | `Unknown` plus a unique placeholder ID |

Do not encode guilt, credibility, or importance through node size unless a defined measured variable controls the size and the scale is shown.

### 5.2 Edge types

Each edge requires a verb and, when relevant, direction, effective period, value, and evidence key.

| Relationship | Example label | Direction |
|---|---|---|
| Legal ownership | `owns 35%` | Owner → owned entity |
| Claimed beneficial ownership | `alleged beneficial owner` | Alleged owner → asset/entity |
| Operational control | `authorized payments` | Controller → account/process |
| Management role | `director, 2021–2023` | Person → entity |
| Payment/transfer | `$125,000 USD, 2024-03-11` | Origin → destination |
| Communication | `emailed 14 times` | Directed only if direction is analytically relevant |
| Agency/representation | `represented` | Agent → principal |
| Shared attribute | `same registered address` | Usually undirected |
| Documentary support | `supported by` | Claim → evidence |

Never draw an unlabeled line when more than one relationship type is possible.

### 5.3 Evidence status

Use a redundant encoding that survives grayscale reproduction:

| Status | Line/pattern | Marker/label | Meaning |
|---|---|---|---|
| Documented | Solid | `D` or no qualifier where legend defines default | Directly supported by identified evidence |
| Corroborated | Solid, slightly heavier | `C` | Supported by independent reliable sources or authoritative primary record |
| Alleged/testimonial | Long dash | `A` | Attributed statement, not established independently |
| Inferred | Short dash | `I` | Reasoned conclusion from stated evidence |
| Hypothesized | Dotted | `H` | Testable proposition, not a finding |
| Contested | Double marker or conflict badge | `CONTESTED` | Material sources disagree |
| Unknown | Gray outline | `UNKNOWN` | Evidence does not establish the value or relation |

The UNODC analyst manual uses solid and dotted connections to distinguish confirmed from suspected associations. This standard expands that binary scheme because legal and investigative work also needs allegations, inferences, hypotheses, conflicts, and unknowns to remain distinct.

### 5.4 Arrow semantics

Arrow direction must mean one—and only one—thing per visual. State it in the legend.

- For money: payer/origin → payee/destination.
- For ownership: owner → owned asset/entity.
- For control: controller → controlled account/process/entity.
- For communication: sender → recipient.
- For event sequence: earlier → later.
- For documentary support: claim → supporting evidence.

If the direction is unknown, use a non-directional connector and say so. Do not use a bidirectional arrow merely because direction was not determined.

## 6. Statistical chart rules

### 6.1 Bars, dots, and columns

- Use bars or dots for categorical comparison.
- Begin quantitative bar axes at zero unless a clearly disclosed analytical reason requires otherwise.
- Sort by value when category order has no independent meaning.
- Prefer horizontal bars for long legal names or many categories.
- Avoid 3D bars, cylinders, pictograms, and area-scaled decorations.
- With grouped or stacked bars, disclose whether components overlap and whether totals reconcile.

### 6.2 Lines, steps, and areas

- Use lines for continuous or meaningfully ordered time intervals.
- Use a step chart when a value changes at discrete legal or transactional moments.
- Show missing periods as gaps; do not silently interpolate.
- Distinguish event dates from record, filing, publication, and retrieval dates.
- Keep aspect ratio from exaggerating or flattening the apparent trend.
- Use area charts only when cumulative magnitude is the message and series ordering will not conceal relevant values.

### 6.3 Scatter, bubble, and distribution charts

- Use scatter plots to show association, not causation.
- Label or annotate consequential outliers and verify that they are not data errors.
- If bubble area encodes a third variable, size by area—not radius—and provide a legend.
- State sample size, missing values, inclusion criteria, and transformations.
- Histograms require disclosed bin logic; changing bins may change the visible story.
- Box or violin plots require an audience able to interpret them, or an accompanying explanation.

### 6.4 Parts of a whole

- Prefer a 100% stacked bar when readers must compare multiple compositions.
- Use a pie/donut only for a single, non-overlapping total with a small number of materially different parts.
- Require components to total 100% after stated rounding.
- Do not use multiple pies for close comparison.

### 6.5 Waterfall, Sankey, and alluvial charts

- Waterfalls must reconcile opening value, components, and closing value.
- Sankey/alluvial widths may encode only a validated magnitude with a stated unit.
- Do not use a visually continuous flow to bridge an undocumented intermediary. Insert an `UNKNOWN` node or break.
- Provide an accompanying transaction or reconciliation table for consequential financial visuals.
- Avoid chord diagrams for evidence-heavy public or courtroom use unless the audience is technically sophisticated and the underlying matrix is provided.

## 7. Timeline and event-chart rules

1. Maintain an event register with stable event IDs before creating the timeline.
2. Record date type and precision: exact time, date only, month, range, before/after, or estimated.
3. Mark approximate dates visually and textually; never place them on an apparently exact scale without qualification.
4. Separate parallel tracks only when each track has a stable meaning, such as actor, proceeding, transaction stream, or document lifecycle.
5. A line or arrow shows temporal order unless the legend expressly defines a different relationship.
6. Do not hide contradictory timestamps. Display the selected date and disclose the conflict in a note or companion table.
7. For long matters, use overview plus detailed panels rather than shrinking text below readable size.

## 8. Financial-flow rules

Before drawing, reconcile a transaction ledger containing transaction ID, source account, destination account, intermediary, date/time, amount, currency, status, source location, and uncertainty.

The visual must:

- preserve transaction direction;
- state whether arrows represent individual transactions or aggregates;
- state aggregation period and rule;
- distinguish fees, reversals, refunds, cash withdrawals, conversions, and non-cash assets;
- state exchange-rate source/date when currencies are converted;
- prevent arrow thickness from implying value unless scaled and explained;
- distinguish documented movement from inferred onward movement;
- retain unknown intermediaries and unresolved destinations; and
- reconcile depicted totals to the controlling ledger within a stated tolerance.

Avoid the phrase “money laundering flow” unless the legal characterization is established or carefully attributed. Prefer neutral descriptions such as “documented transfers,” “funds-flow analysis,” or “transactions reviewed.”

## 9. Ownership, control, and organization charts

- Put percentage and effective dates on ownership edges.
- Identify the source and date of each ownership record.
- Use separate styles for legal title, beneficial ownership allegation, voting control, management authority, signatory authority, and practical influence.
- Do not infer beneficial ownership solely from office, mailing address, formation agent, family connection, or payment activity.
- Represent nominees, trusts, partnerships, and layered vehicles according to their actual legal relationship; do not collapse them into a single “owner.”
- When structures changed, use time slices or effective-date annotations.

## 10. Maps and location visuals

- Use maps only when geography materially affects the analysis.
- State whether points represent precise coordinates, addresses, municipalities, or approximate areas.
- Avoid publishing sensitive precise locations unless lawful and necessary.
- For choropleths, map rates or normalized values when population/exposure differs; disclose denominator.
- Do not imply that administrative boundaries prove operational jurisdiction, residence, or presence.
- Use flow maps only when origin, destination, and direction are supported.

## 11. Document and evidence visuals

### 11.1 Annotated document

- Preserve an unaltered original.
- Mark annotations as overlays, not original content.
- Cite page and evidence ID.
- Do not crop away qualifications, headers, signatures, or context material to meaning.
- Identify OCR-derived text and verify consequential passages against the image.

### 11.2 Side-by-side comparison or redline

- Identify exact versions, dates, and hashes where available.
- Distinguish textual differences from formatting changes.
- Do not imply who made a change unless evidence establishes authorship.
- Include unchanged context needed to interpret the revision.

### 11.3 Evidence-to-claim map

- Give each claim and evidence item a stable ID.
- Show support, contradiction, and qualification as different edge types.
- Keep a claim visibly unresolved when evidence conflicts.
- Avoid node count as a proxy for evidentiary weight; several derivative sources may have one origin.

## 12. Tables, matrices, and dashboards

Tables are the default when exact values, citations, or auditability matter more than pattern recognition.

- Keep one fact per field where practical.
- Preserve stable IDs.
- Put units in headers and retain currency per row when mixed.
- Do not use blank cells ambiguously; use `unknown`, `not applicable`, `not reviewed`, or `not found within stated search`.
- Freeze definitions for categorical statuses.
- Use conditional formatting only as a redundant cue, not as the sole meaning.
- Dashboards must show data currency, filter state, scope, and last refresh.
- A risk or priority score must disclose its formula, weights, and human judgments; it is not a finding of wrongdoing.

## 13. Color, typography, and accessibility

### 13.1 Color

- Start in grayscale; add color only when it carries defined meaning or improves navigation.
- Use a restrained print-safe palette.
- Avoid red/green as the only distinction.
- Direct-label series where practical instead of relying on a distant legend.
- Maintain at least the applicable WCAG contrast target: generally 4.5:1 for normal text, 3:1 for large text, and 3:1 for essential graphical objects and states.
- Test grayscale, common color-vision simulations, screen display, and print/PDF export.

### 13.2 Typography and layout

- Use one type family or a disciplined pair.
- Establish title, subtitle, label, note, and citation levels.
- Avoid all-caps paragraphs and decorative type.
- Keep labels horizontal where practical.
- Prevent clipping, overlap, ambiguous connector crossings, orphan labels, and illegible footnotes.
- Use whitespace to separate analytical groups; do not use decorative boxes that imply unsupported categories.

### 13.3 Alternative form

Every consequential visual requires:

- a concise text alternative explaining the question and principal supported pattern;
- the underlying data or evidence table, subject to lawful redaction;
- definitions for abbreviations, symbols, and encodings; and
- a statement of limitations and unresolved items.

## 14. Citations and provenance

Use one of these models:

1. **Element key:** each node/edge/annotation has a visual element ID that maps to an evidence appendix.
2. **Direct footnote:** each material label or group has a nearby source note.
3. **Evidence layer:** an interactive visual reveals source IDs and locations on selection.
4. **Panel source note:** acceptable only when every element in the panel comes from the same clearly bounded dataset and individual traceability remains available elsewhere.

The evidence appendix should include:

| Visual element ID | Element statement | Evidence ID(s) | Precise location | Classification | Verification status | Notes |
|---|---|---|---|---|---|---|

Do not cite a whole folder, website, or document collection where a precise page, row, timestamp, filing, or transaction record is available.

## 15. Legal-use classification and review gates

### 15.1 Working analysis

May include hypotheses and unresolved leads if they are conspicuously labeled. It still requires provenance and must not be circulated without its status label.

### 15.2 Publication or client-facing graphic

Requires claim-level verification, editorial/legal review appropriate to the risk, a text alternative, and disclosure of material limitations. Remove internal hypotheses that are not necessary or sufficiently supported.

### 15.3 Illustrative aid

Under current U.S. Federal Rule of Evidence 107, an illustrative aid may help explain evidence or argument but is not itself evidence; the court must guard against unfair prejudice, confusion, or misleading use. The rule and local practice—not this guide—control. Label the proposed status and obtain jurisdiction-specific legal review.

### 15.4 Summary offered as evidence

Current Federal Rule of Evidence 1006 separately addresses summaries, charts, or calculations offered to prove the content of voluminous admissible materials. The underlying originals or duplicates must be made available as the rule requires. A chart used only as an illustration is instead governed by Rule 107. Do not call a visual a “Rule 1006 summary” unless counsel has confirmed the foundation and procedural requirements.

### 15.5 Authentication and prejudice checks

For proposed legal use, include review under the controlling jurisdiction's rules. In federal practice, relevant checkpoints include Rule 901 authentication and Rule 403 risks of unfair prejudice, confusion, or misleading the factfinder. These are review prompts, not admissibility conclusions.

## 16. Build workflow

1. Define the question, audience, and legal/status label.
2. Inventory and validate the controlling sources.
3. Create the normalized data/evidence table.
4. Resolve duplicates, date types, entities, currencies, and unknowns.
5. Choose the least complex visual that answers the question.
6. Write the full visual specification and evidence-state grammar.
7. Produce a low-fidelity draft.
8. Create the element-to-evidence appendix.
9. Perform factual, mathematical, semantic, accessibility, and rendered-layout audits.
10. Correct blocking and material defects.
11. Obtain the required human, editorial, and legal review.
12. Export the final artifact with version, date, source cutoff, and status label.

## 17. Audit checklist

### Gate A — Evidence and mathematics

- [ ] Every element appears in the trace table.
- [ ] Dates, amounts, currencies, totals, percentages, and directions match the controlling data.
- [ ] Aggregations and thresholds are disclosed and reproducible.
- [ ] Contradictory and exculpatory evidence is not suppressed.
- [ ] Unknowns and missing intermediaries remain visible.

### Gate B — Semantics

- [ ] Every shape, color, pattern, line, arrow, position, size, and opacity has one defined meaning.
- [ ] Allegations, inferences, hypotheses, and documented facts are visually distinct.
- [ ] Ownership, control, association, payment, and communication are not conflated.
- [ ] Sequence is not presented as causation.
- [ ] Visual hierarchy does not exaggerate a legally or factually weak item.

### Gate C — Design and accessibility

- [ ] Title states the conclusion no more strongly than the evidence permits.
- [ ] Labels, legend, notes, citations, and footnotes are readable at final size.
- [ ] Color is redundant with text, symbol, pattern, or line style.
- [ ] Contrast and grayscale checks pass.
- [ ] A text alternative and accessible data table exist.
- [ ] The rendered artifact has no clipping, overlap, wrapping, or connector ambiguity.

### Gate D — Legal and release status

- [ ] Jurisdiction, intended use, and status are explicit.
- [ ] Proposed illustrative/summary status has been reviewed by qualified counsel where needed.
- [ ] Originals, metadata, and chain-of-custody information are preserved where relevant.
- [ ] Confidential, privileged, sealed, personal, or protected information is handled under governing rules.
- [ ] Version, date, source cutoff, reviewer, and unresolved limitations are recorded.

## 18. Failure conditions

Do not release or mark the visual complete if any of these remains:

- unsupported or misdirected arrow;
- material element without provenance;
- allegation, inference, or hypothesis rendered as established fact;
- wrong amount, currency, date, entity, total, percentage, scale, or transaction direction;
- undisclosed missing source, intermediary, filter, aggregation, or denominator;
- inaccessible meaning that depends only on color;
- unreadable final rendering;
- false claim that a visual is evidence, authenticated, admitted, complete, or legally sufficient; or
- a proposed legal exhibit lacking the required human/legal review.

## 19. Source basis

This standard is derived from and should be checked against the originals indexed in `SOURCE_INDEX.md`, especially:

- UNODC, *Criminal Intelligence: Manual for Analysts* [VZ-01], for link analysis, association matrices, event charts, flow analysis, inference, and presentation;
- UK Government Analysis Function, *Data visualisation: charts* and *Data visualisation: colours* [VZ-02, VZ-03], for chart selection, formatting, labels, color, testing, and accessible alternatives;
- W3C, *Web Content Accessibility Guidelines (WCAG) 2.2* [VZ-04], for accessibility requirements;
- Federal Rules of Evidence 403, 107, 901, and 1006 [LA-01], for federal illustrative-aid, summary, authentication, and misleading-risk distinctions;
- The Sedona Conference, *Commentary on ESI Evidence & Admissibility, Second Edition* [LA-04], for electronically stored information (ESI), authenticity, relevance, original/duplicate, hearsay, and Rule 403 issue spotting; and
- the evidence, timeline, relationship, financial-flow, and audit requirements in this collection's core standard and modules.

