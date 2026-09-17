# Visual Type Decision Matrix

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

Use this matrix after the underlying evidence table or dataset has been validated. It covers the major practical chart, graph, diagram, map, table, document, dashboard, and uncertainty forms likely to arise in investigative or legal work. Highly specialized scientific, engineering, medical, geospatial, or statistical graphics require the relevant domain standard in addition to this guide. “Use” means the visual is a reasonable default—not that it is automatically appropriate for a particular court, audience, dataset, or jurisdiction.

## Exact records and audit views

| Visual | Best for | Minimum inputs | Required safeguards | Avoid / caution |
|---|---|---|---|---|
| Evidence table | Exact evidence inventory | Stable evidence IDs, source locations | Status, provenance, review state | Do not hide duplicates or unreadable items |
| Chronology table | Exact dated events | Event IDs, date type/precision, source IDs | Preserve conflicts and approximate dates | A table may be better than a compressed timeline |
| Transaction ledger | Exact financial records | Origin, destination, intermediary, date, amount, currency, status | Reconciliation and source row | Never replace with a flow graphic alone |
| Claim-to-evidence matrix | Support/contradiction by claim | Claim and evidence IDs, edge type | Show qualification and common-source dependence | Counts do not equal evidentiary weight |
| Relationship register | Exact entity edges | Resolved entity IDs, edge verb, dates, evidence | Do not merge distinct edge types | Avoid vague “connected to” entries |
| Comparison table | Side-by-side attributes or versions | Common comparison fields | Definitions and comparable scope | Too many columns can obscure the decisive differences |
| Heatmap/matrix | Dense categorical pattern | Stable row/column categories, explicit measure | Numeric values or accessible table | Color cannot be the only meaning |
| Audit dashboard | Review status and defects | Defined metrics, scope, version | Last refresh, filters, unresolved defects | Scores must not imply legal certainty |

## Categorical comparison and composition

| Visual | Best for | Minimum inputs | Required safeguards | Avoid / caution |
|---|---|---|---|---|
| Horizontal bar | Ranking or comparing categories | One comparable measure | Zero baseline; sort logically; units | Categories with different denominators |
| Vertical column | Few ordered categories or periods | Comparable measure and interval | Readable labels; zero baseline | Long labels or many categories |
| Dot/lollipop plot | Compact comparison | Comparable values | Visible baseline/scale | Decorative stems can add clutter |
| Clustered bar | Comparing subgroups | Common categories and subgroup definitions | Consistent order and scale | More than a few subgroups |
| Stacked bar | Total plus composition | Mutually exclusive components | Totals reconcile; order stable | Interior segments are hard to compare |
| 100% stacked bar | Comparing proportions | Non-overlapping parts totaling 100% | Counts/sample size also shown | Hides differences in absolute volume |
| Pie/donut | One simple part-to-whole snapshot | A few non-overlapping parts totaling 100% | Direct labels; accessible table | Close values, many parts, multiple pies, overlap |
| Treemap | Hierarchical composition with many parts | Valid hierarchy and nonnegative magnitude | Direct labels and data table | Precise comparison or courtroom explanation |
| Pareto chart | Ranked categories plus cumulative share | Comparable category counts/amounts | Explain cumulative line | Categories overlap or ranking is unstable |

## Time, sequence, and change

| Visual | Best for | Minimum inputs | Required safeguards | Avoid / caution |
|---|---|---|---|---|
| Line chart | Continuous change over time | Comparable dated observations | Gaps stay visible; aspect ratio checked | Sparse or irregular data without explanation |
| Step chart | Discrete changes in status/balance | Effective date for each change | Explain before/after convention | Uncertain effective dates |
| Area chart | Cumulative magnitude | Ordered nonnegative series | Avoid occlusion; disclose stacking | Precise series comparison |
| Slope chart | Before/after comparison | Exactly comparable start/end values | Label both endpoints | Multiple intervening changes matter |
| Event timeline | Case sequence | Validated event register | Date precision, source key, conflicts | Implies causation unless clearly limited |
| Multi-track timeline | Parallel proceedings/actors | Stable track meaning and events | Shared time scale; track definitions | Too many tracks or unresolved entity assignment |
| Gantt chart | Planned or actual task duration | Start/end and task status | Separate plan from actual | Case facts are not project tasks |
| Calendar heatmap | Volume by day/week | Complete dated counts | Missing days distinguished from zero | Event importance differs from volume |

## Distribution and statistical relationship

| Visual | Best for | Minimum inputs | Required safeguards | Avoid / caution |
|---|---|---|---|---|
| Histogram | Distribution of numeric values | Sufficient observations | Disclose binning and missing values | Tiny samples or mixed units |
| Strip/dot plot | Individual observations | Manageable record count | Preserve overlap or jitter transparently | Exact x-position altered by unexplained jitter |
| Box plot | Comparing distributions | Sufficient observations per group | Explain median/quartiles/outliers | General audience without explanation |
| Violin/density plot | Distribution shape | Sufficient sample and defensible smoothing | Show sample size and method | Small samples, legal exhibits, false precision |
| Scatter plot | Association between two variables | Paired numeric observations | No causal claim; label important outliers | Confounders make pattern misleading |
| Bubble plot | Two variables plus magnitude | Valid third magnitude | Size by area; include legend | Readers need exact magnitude comparison |
| Correlation matrix | Many pairwise associations | Comparable numeric variables | Method/sample shown; no causation | Highly missing or non-independent data |
| Control/run chart | Process stability over time | Repeated comparable process observations | Method and control limits validated | Treating legal events as industrial process data |

## Reconciliation and flow

| Visual | Best for | Minimum inputs | Required safeguards | Avoid / caution |
|---|---|---|---|---|
| Waterfall | Bridge from opening to closing total | Non-overlapping components | Full reconciliation; signed values | Components overlap or endpoints differ in scope |
| Directed funds-flow diagram | Specific documented transfers | Validated transaction ledger | Edge IDs, direction, amount/currency, unknown nodes | Unreconciled data or missing intermediary hidden |
| Sankey/alluvial | Aggregate movement between stages | Validated additive flows | Width scale and companion table | Individual evidentiary transactions matter |
| Process flowchart | Steps and decisions | Defined process states | Distinguish designed process from observed case | Presenting a generic process as actual events |
| Activity flow | Generic mechanics or modus operandi | Supported activity sequence | Label as generic/analytical | Exact dates or actual event proof is required |
| Event flow | Case-specific acts in sequence | Event IDs, actors, dates, evidence | Exact source trace; uncertainty visible | Evidence is insufficient for the sequence |
| Chord diagram | Dense reciprocal flows | Complete origin-destination matrix | Table alternative and careful legend | Public/court use, sparse data, or exact tracing |

## Entities, relationships, and hierarchy

| Visual | Best for | Minimum inputs | Required safeguards | Avoid / caution |
|---|---|---|---|---|
| Link/association chart | Multi-entity connections | Entity and relationship registers | Edge verbs, status, source IDs | Proximity or node degree used as guilt proxy |
| Ownership chart | Legal/economic ownership | Percentages, dates, source records | Separate legal/beneficial/control edges | Beneficial ownership inferred from association |
| Organization chart | Formal roles/hierarchy | Role records and effective dates | Date-bounded roles | Informal influence or historical roles omitted |
| Ego network | Connections around one entity | Complete defined relation set | Scope and cutoff clear | “Centrality” interpreted as culpability |
| Adjacency matrix | Dense network without crossings | Stable entities and binary/weighted edges | Accessible table and definitions | Direction/types collapse into one cell |
| Tree/dendrogram | True hierarchy or taxonomy | Valid parent-child structure | No multiple-parent relation hidden | Networks that are not trees |
| Case-theory map | Hypotheses, claims, evidence, gaps | Stable IDs and edge semantics | Distinguish support/contradict/unknown | Advocacy display presented as neutral fact map |
| Evidence-to-claim bipartite map | Traceability | Claims, evidence, link type | Reveal shared-origin sources | Large corpora become unreadable |

## Geography and documents

| Visual | Best for | Minimum inputs | Required safeguards | Avoid / caution |
|---|---|---|---|---|
| Point map | Specific locations | Verified location precision | Privacy and precision labels | False exactness from geocoding |
| Choropleth | Rate by region | Comparable denominator and boundaries | Normalize; disclose classification | Raw totals with unequal exposure/population |
| Flow map | Geographic movement | Supported origin/destination/direction | Scale and source trace | Direction or route is inferred without support |
| Small-multiple maps | Comparing periods/categories | Same geography and scale | Consistent classification | Different scales that create false comparison |
| Annotated document | Explain source content | Original image/PDF and evidence ID | Preserve original; mark overlay; verify OCR | Cropping away material context |
| Redline/diff | Compare versions | Exact source versions | Identify date/hash and edit type | Inferring author or intent from the change alone |
| Exhibit index/map | Navigate a record set | Exhibit IDs and cross-references | Exact titles/status; missing exhibits flagged | Decorative thumbnails without useful indexing |

## Decision and uncertainty visuals

| Visual | Best for | Minimum inputs | Required safeguards | Avoid / caution |
|---|---|---|---|---|
| Hypothesis matrix | Compare competing explanations | Hypotheses, evidence for/against, falsifiers | Avoid pseudo-precise probability | One favored theory controls all scoring |
| Gap-priority matrix | Prioritize next records/actions | Value, feasibility, dependency, lawful access | Disclose judgment and weights | Score presented as objective truth |
| Decision tree | Explicit conditional logic | Defined criteria and outcomes | Note who set criteria; test branches | Legal standards simplified beyond recognition |
| Risk matrix | Triage | Defined likelihood/impact scales | Show uncertainty and nonlinearity | Used as proof of wrongdoing or legal conclusion |
| Confidence interval/error bars | Sampling/estimation uncertainty | Valid statistical model/sample | Method, confidence level, assumptions | Non-probability sample or misunderstood audience |
| Sensitivity/tornado chart | Effect of assumptions | Valid model and ranges | Disclose model and chosen range | Inputs are allegations or incomparable estimates |

## Specialized and frequently misused forms

| Visual | Best for | Minimum inputs | Required safeguards | Avoid / caution |
|---|---|---|---|---|
| Dual-axis combination chart | Two differently scaled series only when their joint reading is essential | Comparable time base and defined units | Direct labels; visibly separate scales; test misleading correlations | Prefer aligned small multiples; dual axes can manufacture apparent correlation |
| Radar/spider chart | Multivariate profile where every axis has a common, meaningful scale | Consistent normalized measures and stable axis order | Data table and axis definitions | Precise comparison, changing axis order, or subjective scores |
| Gauge/speedometer | One value against a meaningful target in a display | Valid target/range | Exact value and scale shown | Usually replace with a bullet chart; wastes space and can dramatize weak differences |
| Bullet chart | Actual value versus target/ranges | Actual, target, and defined qualitative bands | Disclose how bands were chosen | Bands are subjective or target lacks authority |
| Funnel chart | Attrition through truly sequential, nested stages | Stage counts with consistent population | Reconcile entrants/exits and stage definitions | Categories are not sequential or population changes between stages |
| Venn/Euler diagram | A few set overlaps | Verified set membership | Counts and underlying list/table | More than a few sets, uncertain membership, or area interpreted quantitatively without scale |
| Word cloud | Exploratory display of term frequency | Cleaned text and transparent token rules | Counts/table and preprocessing disclosure | Evidence weight, sentiment, legal meaning, or any consequential conclusion |
| Pictogram/isotype | Simple public-facing whole-number proportion | Small exact counts | State denominator; each icon equal | Precise comparison, partial icons, or decorative persuasion |
| Sunburst/icicle | Deep hierarchy and composition | Valid hierarchy and magnitude | Interactive labels or data table | Multiple-parent networks or courtroom/public precision needs |
| Hexbin/density contour | Dense spatial or scatter distributions | Large sample and validated bin/smoothing method | Method, scale, and raw-data access | Small samples or when individual records matter |
| Cartogram | Geography resized by a quantitative measure | Valid geographic data and measure | Conventional map/table companion | Readers need true distances, borders, or location accuracy |
| Network centrality view | Exploring structural position in a defined network | Complete edge definition and suitable metric | Name metric, scope, and missing-edge limits | Treating centrality, degree, or visual prominence as culpability or control |
| Swimlane/process diagram | Roles and handoffs across a process | Defined actors, states, and transitions | Distinguish designed process from observed events | Role assignment or sequence is disputed |
| Sequence diagram | Ordered interactions among actors/systems | Dated/ordered messages or calls | Evidence ID per interaction and uncertainty labels | Timing/order is incomplete or interactions are inferred |
| Mind map | Brainstorming or issue inventory | Clearly labeled concepts | Mark as planning aid; no evidentiary edges | Factual relationship, chronology, or legal conclusion |
| Fishbone/cause-and-effect diagram | Generating possible contributing factors | Explicitly hypothetical categories | Label as hypothesis-generation; test each branch | Presenting untested causes as findings |
| Force-directed network | Exploratory navigation of many links | Valid relationship data and fixed semantics | Provide deterministic table/layout alternative | Publication/legal display where position appears evidentiary but is algorithmic |
| 3D chart | Rare spatial data with a truly three-dimensional variable | Valid 3D coordinates and interactive inspection | Multiple views, scales, accessible table | Ordinary bars/pies/areas; perspective distorts magnitude and occludes data |

## Universal release test

No visual type is acceptable unless it passes all five questions:

1. Is its question explicit and its chosen form suited to that question?
2. Is every material element supported, classified, and traceable?
3. Are scale, direction, aggregation, denominator, and uncertainty honest?
4. Is it readable and accessible in the final rendered medium?
5. Is its legal/status label accurate and independently reviewed where required?
