"""Where a quote stands in a document's text, kept so it can be found again (ADR-0015, research §3.9).

An anchor is the quote's place in one passage (a page as the reader read it): the passage, the character offsets,
32 characters either side, how closely the words matched, and the passage's lines the quote spans. Finding it again
checks the stored place first, then looks for the words anywhere in the document, choosing among several places by
the text either side (the way Hypothesis re-anchors a highlight).

Pure functions on plain dicts ({"id", "locator", "page_number", "text"} per passage), so the migration that anchors
the quotes already in a case uses the same code as the app.
"""
from __future__ import annotations

import re
from typing import Any, Iterable

CONTEXT = 32
# How closely the passage's words match the quote, best first.
MATCHES = ("exact", "case", "spacing")


def _places(text: str, quote: str, match: str) -> list[tuple[int, int]]:
    if match == "exact":
        return [(m.start(), m.start() + len(quote)) for m in re.finditer(re.escape(quote), text)]
    if match == "case":
        return [(m.start(), m.end()) for m in re.finditer(re.escape(quote), text, re.IGNORECASE)]
    words = quote.split()
    if not words:
        return []
    return [(m.start(), m.end()) for m in re.finditer(r"\s+".join(re.escape(w) for w in words), text, re.IGNORECASE)]


def _line(text: str, at: int) -> int:
    return text.count("\n", 0, at) + 1


def _anchor_at(chunk: dict[str, Any], start: int, end: int, match: str, occurrences: int) -> dict[str, Any]:
    text = chunk["text"]
    return {
        "chunk_id": chunk["id"], "locator": chunk.get("locator"), "page": chunk.get("page_number"),
        "start": start, "end": end, "prefix": text[max(0, start - CONTEXT):start], "suffix": text[end:end + CONTEXT],
        "match": match, "occurrences": occurrences,
        # The passage's lines as the reader read them (a page's text keeps its line breaks).
        "line_start": _line(text, start), "line_end": _line(text, max(start, end - 1)),
    }


def _context_score(chunk: dict[str, Any], start: int, end: int, prefix: str, suffix: str) -> int:
    """How much of the stored text either side is still there (characters, nearest first)."""
    text = chunk["text"]
    before, after = text[max(0, start - len(prefix)):start], text[end:end + len(suffix)]
    score = 0
    for a, b in zip(reversed(before), reversed(prefix)):
        if a != b:
            break
        score += 1
    for a, b in zip(after, suffix):
        if a != b:
            break
        score += 1
    return score


def find_anchor(chunks: Iterable[dict[str, Any]], quote: str | None, *, prefix: str = "", suffix: str = "") -> dict[str, Any] | None:
    """The quote's place in the passages: the closest match kind that finds it, and among several places the one
    whose text either side best matches ``prefix``/``suffix`` (the first one when none is given)."""
    if not quote or not quote.strip():
        return None
    chunks = [c for c in chunks if c.get("text")]
    for match in MATCHES:
        found = [(c, s, e) for c in chunks for s, e in _places(c["text"], quote, match)]
        if found:
            best = max(found, key=lambda f: _context_score(f[0], f[1], f[2], prefix, suffix)) if prefix or suffix else found[0]
            return _anchor_at(best[0], best[1], best[2], match, len(found))
    return None


def refind_anchor(stored: dict[str, Any] | None, chunks: Iterable[dict[str, Any]], quote: str | None) -> tuple[dict[str, Any] | None, str]:
    """Find a stored anchor again in the passages as they are now.

    Returns the anchor as found now and what happened: "held" (the same passage and characters still hold the
    quote), "moved" (found, but elsewhere: the document was read again or the text changed around it), "lost"
    (the words are no longer in the text), "not anchored" (nothing was stored; the quote is looked for now)."""
    chunks = list(chunks)
    if not stored:
        return find_anchor(chunks, quote), "not anchored"
    by_id = {c["id"]: c for c in chunks}
    chunk = by_id.get(stored.get("chunk_id"))
    start, end = stored.get("start"), stored.get("end")
    if chunk is not None and isinstance(start, int) and isinstance(end, int) and quote:
        held = chunk["text"][start:end]
        if held == quote or (stored.get("match") != "exact" and re.sub(r"\s+", " ", held).casefold() == re.sub(r"\s+", " ", quote).casefold()):
            return {**stored, **_anchor_at(chunk, start, end, stored.get("match") or "exact", stored.get("occurrences") or 1)}, "held"
    found = find_anchor(chunks, quote, prefix=stored.get("prefix") or "", suffix=stored.get("suffix") or "")
    return (found, "moved") if found else (None, "lost")
