# The indicator catalogue in the app

Status: proposed, 8 October 2026. The catalogue's data and tools exist (`catalogue/`, `backend/app/catalogue/`, `tools/catalogue.py`, `tools/catalogue_pdf.py`, ADR-0007). Nothing below is built into the app yet; it waits on Ony's review of the PDF and the coverage report.

## What Ony asked for

> "Take every single indicator for every single type of investigation for all the various crimes and create a single source of truth for all of them that will become one of the cores of the app."

> "I also want this application to keep an eye on patterns outside of the type of investigation that can hint at other crime."

> "Within the application itself, you can go to a glossary/dictionary, and it will contain a definition for every single relevant thing, examples, sources, and relevant cases the users can look up."

> Indicators "for whether or not the investigator/users who are doing the investigation have uncovered something that could be dangerous for them."

## One source of truth

- **Files.** `catalogue/indicators/<area>.yaml` (one per area, 13 areas) and `catalogue/glossary/<area>.yaml`. The shape is defined by the Pydantic models in `backend/app/catalogue/models.py`, and the JSON Schema in `catalogue/schema/` is exported from them.
- **Verified or pending.** An indicator is `verified` only when every quote was found word for word at its source, every case outcome was confirmed, and any threshold number was found in its cited source. The models refuse an indicator marked verified that is not. Only verified indicators reach Red Flags and the PDF; pending ones stay in the files with what is missing.
- **Three outputs, one input.** Red Flags, the glossary page and the PDF are all made from these files. Correcting an indicator is one edit and one commit.
- **Research and checking.** Each area was collected by one research agent and checked by a second agent that re-opened every source (`tools/catalogue.py ingest` applies the checker's verdicts). The broader evidence base is in `indicators-research.md`.

## Red Flags runs every indicator on every investigation

- **All areas, always.** The investigation's type (procurement, influence, litigation; filled in by the app, changeable by the reporter) only decides the order. Indicators from the investigation's own areas are listed first. Hits from any other area appear in their own group, headed "This may also point to …", so a money-laundering case that starts to show forced-labour signs says so.
- **Cross-hints.** When a flag fires and its indicator has cross-hints, the flag card names the other area, the reason and the source (for example a financial indicator whose source, such as the FATF/APG 2018 report on financial flows from human trafficking, ties it to trafficking). The cross-hint map in the PDF shows which areas point to which.
- **Levels.** Faint, Strong, Textbook, from the indicator's own rules. A level with a number uses only the number its source gives; where no source gives one, Faint and Strong are set by Ony (Settings, later in the tutorial) and Textbook means "meets the published definition as worded".
- **How each indicator runs** follows its `checkable` value:
  - `records`: a rule in the pattern engine (system-design.md §3.3) computes it from the case's own records.
  - `lookups`: the same, once Paper Trail has fetched the outside data it needs; until then the flag shows as a gap ("one fact away"), naming the lookup that would settle it.
  - `person`: the app cannot compute it. The indicator appears as a checklist item on the parties it concerns, and the app points at passages in documents that match its wording. A person ticks it.
- **Combinations.** Every source treats indicators as prompts, not proof, and says combinations matter (AUSTRAC; OCP 2024; indicators-research.md). Red Flags ranks a party higher when several independent indicators fire on it, and shows each one, never a single opaque score.
- **Innocent explanations** are always on the card, above the evidence.
- **A rule per indicator.** Each computable indicator gets a rule module that cites the indicator's ID; the rule's tests use the indicator's own examples. The catalogue is the description; the rule is the code.

## Safety of the investigator, sources and witnesses

- The SA area's indicators are about danger to the reporter or a witness, not about wrongdoing by the subject.
- They are shown apart from Red Flags, in a "Your safety" panel on the investigation, so they are never read as findings about anyone.
- They run on the same engine: some from the case's records (the subject is a state security service; the story concerns organised crime), some after lookups (the subject is linked to a killed journalist in the CPJ database), some only by a person (direct threats received).
- A Strong or Textbook safety indicator puts a notice at the top of the investigation and links to the safety guides; it never blocks work.

## The glossary page

- **Every term** in the catalogue, plus the app's own names (Paper Trail, Red Flags, Chain of Custody, The Drop), with a plain definition, examples, sources, cases to look up, related terms, and the indicators that use it.
- **Search** across terms and definitions, with filter by area.
- **Linked from everywhere.** Every Red Flag card links to its indicator and the terms it uses; a term written anywhere in the app shows a hover card with its definition and a link to the full entry.
- **Cases** in the glossary keep their outcome label exactly; "alleged in published reporting" is shown in its own colour and never as a finding.

## Keeping it current

- **Versions.** Each indicator carries a `version`. Changing its rule, levels or sources raises the version; Red Flags records which version raised each flag.
- **Re-checking.** `tools/catalogue.py` can re-run the checking step on any area; sources older than a year are listed in the coverage report for re-checking.
- **New sources** (for example the ILO's revised forced-labour indicators, newer FATF reports) are added by running the research step for that area again and reviewing the diff.
- **Structured data where it exists.** The Open Contracting Partnership's 73 procurement red flags (with formulas and OCDS fields) and the DISARM framework (published as CSV, SQLite and STIX, CC-BY-SA-4.0) can be read in directly rather than retyped; each needs a licence note in the catalogue.

## Not yet decided (for Ony)

1. The Faint and Strong levels wherever no source gives a threshold.
2. Whether "Your safety" notices can also alert by email or phone.
3. Whether the DISARM framework (share-alike licence) should be imported whole, which would make the catalogue's DISARM part share-alike too.
