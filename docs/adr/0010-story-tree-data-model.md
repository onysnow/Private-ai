# ADR-0010: The story tree's data model

**Status:** Accepted (2026-10-12)
**Deciders:** Claude, building mockup ACT_2 as Ony asked ("continue with the mockups"); the open questions below are Ony's

## Context

Research Act §7 asks for a "what the story needs" view: the story's one-line thesis, the sections it will say, the
claims under each section and their evidence, gates that say what must be true before it runs, and a "Ready to run"
decision stored with who and when. It names this an ADR for the data model (`story` and `story_node`).

## Decision

Three tables (migration b4e8d2a6c931):

- `stories`: one per case for now (unique on `investigation_id`); `thesis`; the write-up it is told in
  (`writeup_id`); `gates` (JSON: the gates a person records, right of reply `{to, on}` and legal read `{by, on}`);
  `ready_by` / `ready_at`.
- `story_sections`: `title`, `position`.
- `story_claims`: a claim placed under a section, with `position`; a claim sits in one section of a story.

Nothing about strength is stored. A branch's status (shown, not yet shown, disputed, empty) is worked out on read
from its claims' statuses, so it can never disagree with them. The other gates are computed too: every sentence of the
write-up has a citation (from its citation nodes), every open Red Flag's innocent explanations looked at, and the
statements resting on one record. "Ready to run" is refused until every gate passes, and is cleared when the thesis
or a recorded gate changes. Reading the story writes nothing.

**Added 2026-10-19 (migration e4c8a1f7b392).** `writeup_versions`: snapshots of the write-up's whole TipTap document,
named by a person ("Before legal read"), taken on their own before a save (at most one every ten minutes, the newest
30 kept), or taken just before an older version is restored, so a restore can be undone. A snapshot is never edited;
it travels in the case backup and goes when its write-up is deleted. The story's own notes are ordinary notes on the
record type "story" (no new table).

## Open questions for Ony

- One story per case, or several?
- Which gates are required by default (right of reply and legal read could be optional for citizen investigators)?
