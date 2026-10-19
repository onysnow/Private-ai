# ADR-0011: TipTap for the write-up editor

**Status:** Accepted (2026-10-12)
**Deciders:** Claude, building mockup ACT_2 as Ony asked ("continue with the mockups")

## Context

Write-ups are stored on the server as ProseMirror/TipTap JSON (`app/services/writeups.py`), with citations as an
inline atom node `{"type": "citation", "attrs": {"recordType", "recordId", "label"}}`, and rendered to .docx from
that. There was no editor in the app (research Act §8; INVENTORY §11–12). The research asks for TipTap or
ProseMirror directly, as an ADR.

## Decision

Add `@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit` and `@tiptap/pm` at 3.31.3, the version Ony's own site
(onysnow/onysnow-studios) already runs. TipTap writes the format the server already stores, so nothing on the server
changes. The citation is a TipTap inline atom node with the same type and attributes the server reads; the sentence
marks (no source, rests on a disputed claim, AI draft) are decorations worked out in the browser from the cited claims'
statuses, never stored in the text.

**Amended 2026-10-19.** The AI-draft mark is the one mark that is stored: whether a paragraph came from an AI draft
cannot be worked out afterwards, so a paragraph carries `attrs.aiDraft` (the day, YYYY-MM-DD) and `attrs.aiKept`
(a person kept it). It is drawn plum, with its "AI draft · date" tag and Keep · Undo, until kept; kept paragraphs
still count as drafted with AI for the AI-use note. The server ignores both attributes. Nothing inserts AI text into
the story's write-up yet (AI drafts are promoted into write-ups of their own).

## Consequences

Four packages (MIT). The editor is loaded only on the Story screen.
