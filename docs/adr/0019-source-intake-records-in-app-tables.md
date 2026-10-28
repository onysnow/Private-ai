# ADR-0019: Source-intake records live in the app's tables first

**Status:** Accepted (2026-10-28)
**Deciders:** Claude, on Ony's instruction to make the source-intake judgement calls (`DECISIONS.md`, call 9)

## Context

Captures, monitors, versions and authenticity checks need a home. FollowTheMoney 4.11 covers articles but not social
posts or captures, and OpenAleph has no web capture or WARC, hashes with sha1 by default, keeps a self-asserted
retrieval date, and overwrites a re-captured URL's metadata instead of keeping versions (`SOURCE_INTAKE_RESEARCH.md`
§8.1–8.2). A custom FtM model must be loaded by every OpenAleph process and needs a reindex.

## Decision

- New records go in the app's own tables, with migrations, in backups and in deletion like every case table:
  `captures` now; `monitors`, `capture_versions`, `authenticity_checks` (append-only) and `transcript_segments` as their
  phases are built.
- A capture's main text becomes an ordinary `Document` (with its `Source`), so search, reading, proposals and OpenAleph
  sync treat it like any file. The capture keeps the evidentiary files and their hashes; the document is the working copy.
- Mirroring into FollowTheMoney/OpenAleph (the research's Phase 6) waits until the schemata are tested in a running
  OpenAleph stack.

## Consequences

- One source of truth for a capture's custody, independent of OpenAleph being up.
- When the mirror is built, it maps these rows out; nothing here depends on it.
