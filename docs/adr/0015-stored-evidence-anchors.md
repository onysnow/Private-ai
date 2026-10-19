# ADR-0015: Stored evidence anchors

**Status:** Accepted (2026-10-19)
**Deciders:** Claude, building the build list's §6 item "stored anchors (research §3.9, ADR)" (CHECK_2), asked for by Ony on 19 Oct

## Context

Chain of Custody (mockup CHECK_2) shows each quote's anchor: "exact quote + 32 characters before and after, offsets
412–489", and the passage's "lines 14–22". Until now the app kept only the quote and a free-text locator; the anchor
was looked for each time a chain opened ("found now, not stored"), so a document read again could not tell whether
a quote had moved or gone. Research §3.9 asks for anchors stored the way Hypothesis keeps a highlight (exact
words, text either side, offsets, the passage) and found again on a new reading, with quotes that no longer match
going to a person to check.

## Decision

- **Where:** one JSON column, `evidence.anchor` (migration `b3f7d2a9c615`). It travels in the backup with the rest of
  the evidence row; no new table, so no new restore order. It holds `document_id`, `chunk_id`, `locator`, `page`,
  `start` and `end` (characters in the passage text), `prefix` and `suffix` (up to 32 characters each), `match`
  (`exact`, `case` or `spacing`: how closely the passage's words matched), `occurrences` (how many places hold the
  words), `line_start`/`line_end` (the passage's lines as read; a page keeps its line breaks), `anchored_at`, and
  `lost_at` when a new reading no longer holds the words. `chunk_id` is a plain string, not a foreign key: a
  reading replaces its passages, and the anchor must outlive them.
- **The matching** is pure functions on plain dicts (`app/services/anchor_text.py`): look for the exact words, then
  ignoring case, then ignoring spacing; among several places choose the one whose text either side best matches the
  stored prefix and suffix. The migration anchors the quotes already in a case with the same code.
- **When:** a new or changed quote is anchored as it is saved, whatever code path saves it (a `before_flush` hook,
  `app/db/decided_by.py`, beside the mutation guard). Every quote from a document is anchored again when the
  document is read (`extract_document`), so a quote saved before the read gets its place, and one the new reading
  no longer holds keeps its old place marked `lost_at`. A restore puts anchors back as they were and anchors only
  quotes that have none.
- **Reading never writes:** opening a chain finds the stored anchor again (`refind_anchor`) and says what happened —
  `held`, `moved`, `lost`, or `not anchored` for a quote with nothing stored — without changing the row.

## Not done here

- The `check_runs` table and re-hash job from research §3.9 (results of each check kept over time).
- Turning a `lost` quote into a Decide card ("This quote moved or changed in the new reading — check it"): the anchor
  now records it; the card is Decide's work.
- Region anchors for pictures and page crops.
