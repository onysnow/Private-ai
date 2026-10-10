# Source Authority and Retrieval Policy

*Part of Research Authority System (RAS).*

## 1. Purpose

This policy governs how RAS selects, retrieves, labels, cites, and
reconciles sources for a general research question — "what does the
evidence/research say about X," where X can be medical, historical,
technical, policy, or any other domain. It exists to prevent two recurring
failures: treating every source as equally authoritative regardless of its
evidentiary position, and letting a search's convenience — whatever ranked
first, whatever was easiest to find, whatever the model already
"remembered" — pass for a fair survey of the actual evidence.

This is RAS's own version of a source-authority policy, built for
general-research questions. It is a structural sibling to, not a copy of,
Topic Authority System's `CORE/SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md`,
which governs authenticated case evidence, chain-of-custody, and legal
records for a specific investigation. RAS's tiers are about a source's
position in the published-and-public evidence hierarchy on a general
question; TAS's tiers are about a piece of evidence's authenticity and
proximity to a specific documented event. The two hierarchies are not
interchangeable, and a RAS-tiered systematic review is not a substitute for
TAS-tiered primary case evidence when a task actually needs the latter.

## 2. Authority is claim-specific

A source can be authoritative for one proposition and weak for another. A
large observational cohort study is authoritative for the correlations it
actually measured, not for a causal mechanism it merely speculates about in
its discussion section. A recognized professional body's consensus
statement is authoritative for that body's official position, not for every
individual member's personal view repeated in the same document.

Evaluate authority for the exact claim using:

- the source's evidentiary tier for that specific proposition (Section 3);
- whether the claim is the source's own finding or an aside;
- independence from other sources already relied on for the same claim;
- contemporaneity — how much the field has moved since publication;
- methodological fit — whether the study design can actually support the
  kind of claim (correlational, causal, definitional, predictive) being
  drawn from it;
- disclosed funding, authorship conflicts, and institutional interest;
- venue legitimacy (peer review, editorial standards, indexing, corrections
  history); and
- whether the source is reporting original evidence, synthesizing others'
  evidence, or repeating a claim it did not itself establish.

## 3. Default source tiers

Ordered highest to lowest evidentiary position for a general research
question. Tier is about the source's position in the evidence hierarchy,
not its subject matter, its confidence, or how persuasive it reads. The ladder is a default, not a bar on judgment: a source's tier for a claim can sit above or below its row when the reason is stated (Section 2), and Module 03 records it as a claim-specific tier exception (Module 03 rule 1).

| Tier | Source type | Normal use |
|---|---|---|
| 1 | Systematic review / meta-analysis | The strongest available synthesis of the primary literature on a specific, matched question |
| 2 | Peer-reviewed primary study that is itself an independent replication of an earlier finding | One study that repeats an earlier finding with separate data, methods or researchers; whether a finding is multiple, independently replicated is judged per claim in Module 04's corroboration verdict, not by any one source's tier |
| 3 | Formal, documented consensus statement of a recognized expert or official body (states its evidence and how the position was reached) | Defining a field's formal collective position, methods, or terminology |
| 4 | Single peer-reviewed study that is not a replication | One data point; not yet "the research shows" (see `CORE/RAS_PROMPT_ENGINEERING_STANDARD.md` Rule 9) |
| 5 | Preprint / non-peer-reviewed academic work; a single expert's opinion; an official statement that states no evidence for its claim | Currency and emerging findings, or a named expert's or body's stated position as that position; not load-bearing for a settled claim |
| 6 | Trade or industry publication | Practitioner context; treat reported research claims as tertiary unless the primary source is named and linked |
| 7 | Quality journalism with named, checkable sourcing | Current-events facts and locating primary sources; not a substitute for the primary source when reachable |
| 8 | Opinion, blog, or unvetted user-generated content | Orientation only, or representing a named individual's stated view as their view |

A source additionally carries a *venue legitimacy flag* — `standard`,
`non-indexed-unclear`, or `known-predatory` (a predatory or pay-to-publish
venue) — independent of tier. Do not tier a non-indexed or predatory venue as ordinary peer-reviewed
work merely because it uses journal-like branding.

**Provenance flag.** A source additionally carries a provenance flag —
`verified` or `unverified-provenance`. It is `unverified-provenance` when
it has no named, checkable author or publisher and at least one further mark:
it states no method or data for a claim that needs them, its citations do not
resolve, or its text is duplicated across unrelated sites with no named
original — together the marks of machine-generated or search-farmed content,
which are checked, not guessed from style. One mark alone does not set the
flag: an official body's statement or a news article with a named byline
states no method and is tiered as its row in the table says, and a syndicated
article that names its originating outlet is duplicated but not unverified. A source so flagged is tiered
no higher than 8 and never counted as corroboration (Module 04 rule 2),
however authoritative it looks; a citation it gives is followed to the
original, which is tiered on its own merits. This is an interim rule: no
named detection framework is adopted yet (`SOURCE_INDEX.md`, open items).

## 4. Search and diversity requirements

Authority cannot be assessed on a source set that was never searched
fairly. Before tiering, a search must satisfy:

- **multiple independent query formulations** — a single query's ranking
  reflects that query's wording and the engine's ranking algorithm, not the
  state of the evidence;
- **a distinct pass aimed at disconfirming, null-result, or minority-
  position sources** — not a byproduct of the main search;
- **viewpoint and source-type diversity** — the candidate set should not
  consist entirely of sources that cite or restate one another (an echo
  chamber), or entirely of one institution, one country, one funder, or one
  language, without that concentration being disclosed as a limitation; and
- **a documented retrieval log** (Section 5) — an undocumented search
  cannot later be distinguished from a lucky or an unlucky one.

See `PROMPT_MODULES/02_SOURCE_DISCOVERY_AND_DIVERSITY_CHECK.md` for the
full search-and-diversity procedure this policy governs.

## 5. Retrieval log

For a material search, record:

| Field | Requirement |
|---|---|
| Search objective | The claim, question, or evidence sought |
| Query formulations used | Every distinct query wording run, including at least one disconfirming-focused query |
| Databases/engines searched | Which were used; which relevant ones were unavailable (paywall, access, language) |
| Search date | Include when currency matters |
| Results found / reviewed | Number found and number actually reviewed in depth, with the selection criterion stated |
| Stopped because | Saturation (new searches stopped surfacing new relevant sources), plan exhausted, or budget with what remained unsearched — the coverage line of Module 02 output D |
| Access limits | Paywalled, broken link, registration-gated, or otherwise inaccessible sources, flagged rather than cited from a snippet |
| Negative result | State only that no responsive source was found within the recorded scope — never that the underlying fact or effect does not exist |

## 6. Claim-level citation rule

Every material claim in a final synthesis must be traceable to:

- a specific source and, where the source is long, a section, page, or
  figure/table reference; or
- a stable identifier (DOI, PMID, ISBN, docket/record ID); or
- a direct canonical URL with a retrieval date.

Do not cite a search-results page, a database as a whole, or an entire
corpus when a more precise location exists. Do not cite a source merely
because it discusses the same general topic as the claim — confirm the
cited material actually supports the claim at the same scope (population,
timeframe, and proposition) the claim is stated at.

## 7. Source isolation

When a task says "use only these supplied sources," do not import facts
from memory, earlier chats, or unrelated web results. External knowledge
may be used only to explain general background concepts, clearly labeled as
such and only when permitted.

When open-ended research is allowed, keep two layers distinct:

- **evidence layer** — the tiered, retrieved sources actually supporting
  the claims in the synthesis;
- **context layer** — general background, definitions, and methodology
  explanations not themselves cited as evidence for a specific claim.

Never let the context layer silently fill an evidentiary gap in the
evidence layer.

## 8. Conflicts between sources

When sources conflict:

1. preserve both accounts rather than silently picking one;
2. determine whether they actually address the same population, timeframe,
   definition, and question (see
   `PROMPT_MODULES/06_CONTRADICTION_AND_CONSENSUS_MAPPING.md`);
3. compare tier, independence, methodological rigor, and currency;
4. look for a higher-tier source (a systematic review, an updated
   consensus statement) capable of resolving the conflict;
5. if it remains unresolved, state the conflict and the actual state of
   disagreement rather than averaging or picking the more convenient
   account; and
6. do not let a numerically larger set of lower-tier sources outvote a
   smaller set of higher-tier ones — weigh by tier and quality, never by
   count.

## 9. Web-only and inaccessible originals

If an authoritative source cannot be fully retrieved:

- retain its canonical URL/identifier, title, publisher, date/version, and
  retrieval date;
- use a mirror only if its identity and its content can be confirmed to
  match the original, and label it as a mirror;
- do not present a summary, abstract, or secondhand description as if it
  were the full original document; and
- flag the access limitation in both the retrieval log and, where the
  limitation is material to the claim's certainty, in the synthesis itself.

## 10. Currency

A source's tier and authority at the time of retrieval do not guarantee it
is still current. Apply
`PROMPT_MODULES/07_CURRENCY_AND_RETRACTION_CHECK.md` to every source
actually relied on before finalizing a synthesis — retraction, correction,
or supersession by a newer systematic review or guideline changes what a
source establishes, regardless of how authoritative it was tiered at
retrieval.

## 11. Model-specific prompt sources

For prompting behavior itself (not the substantive research question),
apply this priority, consistent with TAS's and DAS's own policies:

1. current first-party guidance for the active model and product surface;
2. current first-party general guidance from the model provider;
3. tested internal evaluation results;
4. cross-provider best practices;
5. academic taxonomies and older prompt literature; and
6. community prompt collections.

Techniques such as forced chain-of-thought or elaborate personas are not
universal defaults; test them against the active model and task rather than
assuming they transfer.
