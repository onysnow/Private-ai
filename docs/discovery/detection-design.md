# Detecting every indicator: design

Ony, 10 October 2026: "go ahead and develop/design/research the system charged
with detecting all the indicators." This is the design. It rests on two pieces
of research run the same day: how existing systems detect warning signs
(anti-money-laundering monitors, procurement and company-network engines, rule
formats, document and checklist tools), and a judgement, for each of the 1,581
verified indicators, of how software could detect it
(`detection-classification.json`, one row per indicator: method, template,
inputs, parameters, and whether the records alone can show part of it).

Today there are 8 hand-written rules. Writing 1,581 more by hand is not
possible to do well, so the design changes how a rule is made.

## What the indicators need

| How it can be detected | Indicators | From the case's records | After lookups | Only a person |
|---|---|---|---|---|
| A property has a value, is missing, or two records disagree | 274 | 183 | 85 | 6 |
| A person must confirm it (interview, observation) | 210 | 1 | 3 | 206 |
| The party is on an outside list (sanctions, PEPs, registers) | 200 | 3 | 195 | 2 |
| A shape among parties and links (loop, chain, shared node, path) | 186 | 87 | 93 | 6 |
| A person must read a document and judge it | 178 | 71 | 37 | 70 |
| Unusual against its own past or similar parties | 101 | 56 | 41 | 4 |
| One thing, then another, within a time | 101 | 63 | 31 | 7 |
| A number over or under a published figure | 98 | 63 | 33 | 2 |
| Counts or sums within a period | 97 | 59 | 37 | 1 |
| Words or phrases in documents | 71 | 39 | 7 | 25 |
| A statistic across many records (Benford, rounding, clearance rate) | 65 | 39 | 26 | 0 |

1,188 of the 1,581 can be partly seen in the records even when part of the
definition needs a person; under the rule decided on 10 October those are
Faint flags that say what the records cannot show.

## The idea: detectors are code, indicators are data

Every mature system separates the two (Tazama, Oracle FCCM, Jube, OCP
Cardinal, Sigma):

- **A detector** is a small, tested Python function that measures one kind of
  thing on the case: a path length, a count in a window, a time between two
  events, a shared address, a value against a number, a field that is missing.
  About 20 families cover the eleven methods above.
- **An indicator's detection spec** is data, kept with the catalogue
  (`catalogue/detection/<area>.yaml`): which detector family, its parameters,
  and what each level means, written out. One spec per indicator; a new
  indicator is a spec and its examples, not new code.

A spec, for example BO-002:

```yaml
- indicator: BO-002
  version: 1
  family: path_length
  needs: [Ownership]                      # applicability gate, from data_needed
  params: {link: Ownership, measure: layers_between_person_and_asset}
  bands:                                  # lower bound inclusive, upper exclusive
    - {level: faint,    from: 4, to: 6,  reason: "More than 3 layers (Puppet Masters three-layer test)"}
    - {level: strong,   from: 6,          reason: "More than 5 layers (TJN 2020)"}
  cannot_run:
    - {when: no_links_of: Ownership, reason: "No ownership links in this case yet"}
  not_shown: ["whether there is a business reason for the layers"]
  examples:                               # tests, run by one command
    - {name: seven-company chain, expect: strong}
    - {name: two-company chain, expect: none}
```

What this gives:

- **Bands with a reason each** map onto Faint, Strong and Textbook, and the
  reason is the sentence the card shows (Tazama's bands).
- **Cannot run, with a reason** is never confused with "nothing found": a
  case without dated payments says "this check needs dated payments", which
  is also what the card's "the records can't show" line draws on (Tazama's
  exit conditions; Marble's hit / no hit / error per rule).
- **The applicability gate**: a spec runs only when the case holds the kinds
  of records it needs (Marble's trigger). Most specs do not apply to most
  cases, so the engine stays fast.
- **The values it read are stored with the flag**, so the drawer can say
  "6 layers; Strong starts at 6" (Oracle's binding values, Jube's backtest).
- **Versions**: each spec and each family has a version; every flag records
  both, so a flag stays explainable after a recalibration (Marble).
- **Examples are tests** beside the spec, run by one command, with a check
  that every band fired in some example (OPA's test model).

## The detector families

Over the case graph the engine already builds (`app/patterns/graph.py`):

1. **Shape**: cycle, path length, shared node (address, phone, director,
   owner), path to a flagged party, a small pattern graph matched with
   networkx's subgraph matcher (already installed; no new package).
2. **Attribute**: in a set (a jurisdiction, a role), missing, two records
   disagree, the same property with two values.
3. **Threshold**: a value against a number, or a ratio against a reference
   value in the records.
4. **Window**: count, sum, distinct count within a period, grouped by a key
   (payer, account, address) (Sigma correlations, Marble aggregations).
5. **Sequence**: A then B within a time, by a join key, with "B never came"
   as a case (EQL sequences).
6. **Baseline**: unusual against the party's own past, or against similar
   parties when the case holds enough of them; otherwise "cannot run: needs
   a population" (OCP's warning that outlier tests need a population).
7. **Statistic**: Benford, last-digit, round-number share, over a set.
8. **List**: the party matches an outside list. Runs once lookups exist
   (step 4), through FtM matching (`nomenklatura`, MIT, FtM-native; ADR).
9. **Words in documents**: curated terms per indicator searched in the
   document chunks the app already makes, with SQLite's built-in full-text
   search (bm25, snippet, highlight): no new package. Every hit is a passage,
   shown with the words highlighted.
10. **Reading a document**: the words step narrows to candidate passages; a
    person marks each "shows it / does not / unclear". An optional local model
    step (an NLI classifier or a local LLM through Ollama) can rank passages
    later, behind an ADR, never deciding on its own, and any quote a model
    gives is found again in the stored text before it is shown (LangExtract's
    rule; research shows zero-shot models over-flag).
11. **Checklist**: an item a person confirms: observed / not observed /
    unknown, with who, when and the source (Minnesota and Berkeley protocols,
    ILO checklists).

Families 1 to 7 and 9 run on today's records; 8 needs lookups; 10 and 11 are
a person's work with the app's help.

## Combinations and ranking

- **Combination rules as data**: some sources publish how indicators combine
  (the ILO: at least one involuntariness and one penalty indicator, one of
  them strong). A combination spec names its parts and the rule, and shows
  every part.
- **Ranking** stays as decided (each flag 1, more for flags that agree on the
  same parties, less for weak or unreviewed links), with risk added up per
  party over the case, like Splunk's risk-based alerting, and the parts always
  shown.

## Making 1,581 specs

- The classification gives each indicator its family and parameters. An agent
  round drafts a spec for each, from the indicator's definition and levels,
  with positive and negative examples; a checking round runs the examples
  against the family and rejects any spec whose numbers are not in the
  indicator's levels.
- Specs are linted: unknown family, a band with no reason, a number not in the
  levels, overlapping bands, no example per band.
- They land area by area, records-checkable families first.

## What changes in the app

- `app/patterns/detectors/` (the families) and `app/patterns/specs.py` (load,
  gate, run, store). The 8 existing rules become specs of their families.
- Flags gain the values read, the spec and family versions, and the reason
  per band. "Cannot run" results are kept per case, so Red Flags can say
  which checks ran, which could not and why.
- Red Flags gets two more kinds of item beside flags: **passages to read**
  (family 9 and 10) and **checklist items** (family 11), each opening in the
  drawer.

## Built (10 October 2026)

- `backend/app/patterns/detectors/`: the first nine families (cycle,
  path_length, missing_property, shared_property, count_in_band,
  shared_holder_link, property_threshold, count_in_window, sequence_within).
- `backend/app/patterns/specs.py`: specs load from `catalogue/detection/*.yaml`,
  pass the applicability gate or say why they cannot run, turn values into
  levels through their bands, and are linted.
- The seven hand-written rules are now specs (`catalogue/detection/bo.yaml`,
  `ml.yaml`) with their examples; the old rule modules are gone.
- Red Flags says how many checks ran and lists the ones that could not, with
  the reason.
- `backend/tests/test_detection_specs.py` runs every spec's examples and the lint.

- Five more families (attribute_in_set, missing_link, conflicting_values,
  baseline_change, amount_statistic with round-number share and Benford), so
  fourteen in all.
- **To check** (`backend/app/patterns/checks.py`, the `check_items` table,
  `GET /api/investigations/{id}/checks`, `POST /api/checks/{id}/decide`, and
  `frontend/features/to-check/`): a panel in the Verify stage.
  - Every part a flag's records cannot show (`not_shown`) is a checklist item
    on the flag's parties, linked to the flag; the flag's "records can't show"
    line links to the item and shows the decision once made.
  - Check specs (`catalogue/detection/checks/*.yaml`) add passages (an
    indicator's words found in the case's document chunks, whole words and
    phrases, any case; matched in Python so the same search runs on SQLite and
    Postgres) and checklist items per party of a kind or per case. None are
    written yet: that is part of the spec drafting that is on hold.
  - A person marks each item shows it / does not / unclear, with a note. Items
    are kept by fingerprint, so a decision stays when the case changes; an
    item no longer called for is kept under "No longer called for" with its
    decision.

## Decided (Ony, 10 October 2026)

1. **Spec format: settings only.** Each spec picks a family and fills in its
   numbers; no expression language and no new package. Anything the families
   cannot say waits for a new family.
2. **Local models for reading documents: later.** Words-in-documents uses the
   database's built-in full-text search first.
3. **Drafting the specs waits until the catalogue is complete** (round 3 of
   the research is still adding areas). The framework and the families are
   built now; the 8 existing rules move onto it.
4. **Placement: left to the design.** Passages to read and checklist items
   live in their own **"To check"** panel in the Verify stage: they are work a
   person does, not patterns found, and Verify is where claims and evidence
   are checked. Each item names its indicator and the parties; a Faint flag
   whose records cannot show a part links to the matching item, and an item
   links back to the flags on the same parties. Red Flags stays what the
   records show.

## The questions as asked

1. **Spec format**: parameters only (no new package; the families do the
   logic), or parameters plus a small safe expression language (Google CEL,
   `cel-python`, Apache-2.0; ADR) for indicators the families cannot say.
   Recommended: parameters only first; add CEL only if specs need it.
2. **Local models for reading documents**: later, behind an ADR (they bring in
   torch and large model files), or now.
3. **Drafting all 1,581 specs with agents, then checking them by running
   their examples**, area by area.
4. **Where checklists and passages live**: in Red Flags beside the flags, or
   in their own panel.

## Sources

The prior-art research (Tazama, Marble, Jube, Oracle FCCM, SAS, Actimize,
FFIEC and the 2021 interagency statement on model risk, Wolfsberg; OCP
Cardinal and its red flags guide, GTI/Opentender, OpenSanctions nomenklatura
and logic-v2, Aleph xref, ICIJ Datashare, Open Ownership's red flags analysis,
networkx matchers, grand-cypher; Sigma, CEL, JSONLogic, DMN, Rego, EQL,
Splunk RBA, YARA, Great Expectations; ILO forced labour indicators and survey
guidelines, FATF–Egmont, the Berkeley and Minnesota protocols, zero-shot and
NLI models, sentence-transformers, SQLite FTS5, reciprocal rank fusion,
SetFit, AIMS.au, LangExtract, Ollama structured outputs, MiniCheck, GLiNER)
is in `detection-prior-art.md`, with links, licences and what each offers.
