"""A watchlist of names, re-checked as documents arrive (ADR-0006, Wave C).

The reporter lists names (or searches) to watch. Each is searched in the
investigation's own OpenAleph collection whenever OpenAleph has read a new
document of it (jobs/handlers.py, after the read) and on "Check now". Every
document it is found in becomes a hit, once; the reporter makes a hit a lead
(linked to the document's source) or dismisses it.

Why the Workbench runs the search itself rather than OpenAleph's alerts
(``/api/2/alerts``, ``/notifications``): OpenAleph checks alerts once a day
(``periodic_daily``, cron ``0 0 * * *``, aleph/procrastinate/tasks.py) and
delivers them to its single user, across every collection; a watchlist has
to answer when a document arrives and stay inside its investigation
(ADR-0002). The search is the corpus search the panel already uses
(app/services/openaleph_search.py search_corpus): scoped to the
investigation's collection, a matching page standing for its document.

A plain name is searched as a phrase ("Alaric Voss", not Alaric OR Voss);
a name with its other names in brackets, "Low Taek Jho (Jho Low, Jho)", is
searched as each of them ("Low Taek Jho" OR "Jho Low" OR "Jho"); text that
already uses search syntax (quotes, AND/OR, wildcards) is sent as written.

Where OpenAleph cannot be asked (not switched on, or none of the
investigation's documents sent to it yet), the names are looked for in the
investigation's own read documents instead (``search_local``): the same hit,
one per document, at the first page the name is on, with the passage around
it. The entry's check says so ("local").
"""

from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import Document, DocumentChunk, Investigation, Lead
from app.models.watchlists import WatchlistEntry, WatchlistHit
from app.schemas.api import LeadCreate, LeadLinkCreate
from app.services.openaleph_search import Fetch, search_corpus

logger = logging.getLogger("journalism.watchlists")

CHECK_LIMIT = 50
_SYNTAX = re.compile(r'["*?~]|\b(AND|OR|NOT)\b')
_ALIASES = re.compile(r"^(?P<name>[^()]+?)\s*\((?P<aliases>[^()]+)\)$")
_PHRASE = re.compile(r'"([^"]+)"')
LOCAL_STATE = "local"
_CONTEXT = 240   # characters of the passage kept on each side of a match: enough to read it in its sentence
PASSAGES = 3    # passages kept per document, from different parts of it, the first one's page standing for it


def names_of(query: str) -> list[str]:
    """The names a watched entry stands for: a plain name, a name with its other names in brackets, or the quoted
    phrases and OR'd words of a search. Empty for a search the local fallback cannot read (wildcards, NOT)."""
    query = " ".join(query.split())
    if not _SYNTAX.search(query):
        bracketed = _ALIASES.match(query)
        if bracketed is None:
            return [query] if query else []
        return [name for name in [bracketed["name"].strip(), *(a.strip() for a in re.split(r"[,;]", bracketed["aliases"]))] if name]
    if re.search(r"[*?~]|\b(?:NOT|AND)\b", query):   # the fallback reads names, not boolean logic
        return []
    phrases = _PHRASE.findall(query)
    rest = _PHRASE.sub(" ", query)
    words = [w for w in rest.split() if w != "OR"]
    return [p.strip() for p in phrases if p.strip()] + words


def search_text(query: str) -> str:
    """What is sent to OpenAleph: a plain name as a phrase, a name with its other names as each of them, search
    syntax as written."""
    query = query.strip()
    if _SYNTAX.search(query):
        return query
    names = names_of(query)
    return " OR ".join(f'"{name}"' for name in names) if len(names) > 1 else f'"{query}"'


def _passage(text: str, pattern: re.Pattern[str]) -> list[dict[str, Any]]:
    """The passage around the first match, as highlight pieces (every match inside it marked)."""
    text = " ".join(text.split())
    first = pattern.search(text)
    if first is None:
        return []
    start, end = max(0, first.start() - _CONTEXT), min(len(text), first.end() + _CONTEXT)
    # Cut at word ends, never inside the match.
    if start > 0 and 0 <= text.find(" ", start) < first.start():
        start = text.find(" ", start) + 1
    if end < len(text) and text.rfind(" ", first.end(), end) > first.end():
        end = text.rfind(" ", first.end(), end)
    pieces: list[dict[str, Any]] = []
    at = start
    for match in pattern.finditer(text, start, end):
        if match.start() > at:
            pieces.append({"text": text[at:match.start()], "match": False})
        pieces.append({"text": match.group(0), "match": True})
        at = match.end()
    if at < end:
        pieces.append({"text": text[at:end], "match": False})
    if start > 0:
        pieces.insert(0, {"text": "… ", "match": False})
    if end < len(text):
        pieces.append({"text": " …", "match": False})
    return pieces


def search_local(db: Session, investigation_id: str, query: str, *, limit: int = CHECK_LIMIT) -> list[dict[str, Any]]:
    """The watched names in the investigation's own read documents: one result per document, the first page they
    are on, with up to three passages, in the shape search_corpus gives (app/services/openaleph_search.py)."""
    names = names_of(query)
    if not names:
        return []
    pattern = re.compile(r"(?<!\w)(?:" + "|".join(r"\s+".join(map(re.escape, n.split())) for n in names) + r")(?!\w)", re.IGNORECASE)
    lowered = func.lower(DocumentChunk.text)
    rows = db.execute(select(DocumentChunk.document_id, DocumentChunk.page_number, DocumentChunk.text, Document.filename)
                      .join(Document, Document.id == DocumentChunk.document_id)
                      .where(Document.investigation_id == investigation_id,
                             or_(*(lowered.like(f"%{n.split()[0].lower()}%") for n in names)))
                      .order_by(Document.created_at, DocumentChunk.document_id, DocumentChunk.page_number, DocumentChunk.ordinal))
    found: dict[str, dict[str, Any]] = {}
    for document_id, page_number, text, filename in rows:
        known = found.get(document_id)
        if (known is not None and len(known["highlights"]) >= PASSAGES) or (known is None and len(found) >= limit):
            continue
        pieces = _passage(text or "", pattern)
        if not pieces:
            continue
        if known is None:
            found[document_id] = {"document_id": document_id, "openaleph_entity_id": None, "filename": filename, "title": filename,
                                  "page_number": page_number, "highlights": [pieces]}
        else:
            known["highlights"].append(pieces)
    return list(found.values())


def add_entry(db: Session, investigation_id: str, *, query: str, note: str | None, created_by: str | None) -> WatchlistEntry:
    if db.get(Investigation, investigation_id) is None:
        raise LookupError("Investigation not found")
    query = " ".join((query or "").split())
    if not query:
        raise ValueError("Write the name or search to watch")
    if len(query) > 512:
        raise ValueError("A watched search is at most 512 characters")
    taken = db.scalar(select(WatchlistEntry.id).where(WatchlistEntry.investigation_id == investigation_id,
                                                     func.lower(WatchlistEntry.query) == query.lower()))
    if taken is not None:
        raise ValueError(f"“{query}” is already watched")
    entry = WatchlistEntry(investigation_id=investigation_id, query=query, note=(note or "").strip() or None, created_by=created_by)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def remove_entry(db: Session, entry: WatchlistEntry) -> None:
    """The entry and its hits go; leads already made from them stay. The hits
    are deleted by a statement of their own first: the models have no ORM
    relationship, so one flush would not order the two deletes and PostgreSQL
    would refuse the entry's while its hits still point at it."""
    db.execute(delete(WatchlistHit).where(WatchlistHit.entry_id == entry.id))
    db.delete(entry)
    db.commit()


def check_entry(db: Session, entry: WatchlistEntry, *, fetch: Fetch | None = None) -> int:
    """Search one entry and keep each document it newly turns up. Returns how many are new.
    ``fetch`` replaces the call to OpenAleph (tests)."""
    found = search_corpus(db, entry.investigation_id, search_text(entry.query), limit=CHECK_LIMIT, fetch=fetch)
    if found["state"] in ("not_configured", "no_collection"):
        found = {"state": LOCAL_STATE, "detail": f"{found['detail']}: the investigation's own read documents were searched",
                 "results": search_local(db, entry.investigation_id, entry.query)}
    entry.checked_at = utcnow_naive()
    entry.check_state = found["state"]
    entry.check_detail = found["detail"]
    if found["state"] not in ("ok", LOCAL_STATE):
        db.commit()
        return 0
    known = set(db.scalars(select(WatchlistHit.document_key).where(WatchlistHit.entry_id == entry.id)))
    new = 0
    for result in found["results"]:
        # A page stands for its document; one hit per document, the best-scoring first.
        key = str(result["document_id"] or result["openaleph_entity_id"])
        if key in known:
            continue
        known.add(key)
        db.add(WatchlistHit(investigation_id=entry.investigation_id, entry_id=entry.id, document_key=key,
                            document_id=result["document_id"], title=str(result["filename"] or result["title"])[:512],
                            page_number=result["page_number"], highlights=result["highlights"]))
        new += 1
    db.commit()
    return new


def check_watchlist(db: Session, investigation_id: str, *, fetch: Fetch | None = None) -> dict[str, Any]:
    """Check every watched name of the investigation; never raises for OpenAleph."""
    entries = list(db.scalars(select(WatchlistEntry).where(WatchlistEntry.investigation_id == investigation_id)
                              .order_by(WatchlistEntry.created_at)))
    new = 0
    for entry in entries:
        try:
            new += check_entry(db, entry, fetch=fetch)
        except Exception:   # one bad search must not stop the rest, or a document's read
            db.rollback()
            logger.warning("watchlist check failed", exc_info=True, extra={"entry_id": entry.id})
    return {"checked": len(entries), "new_hits": new}


def make_lead(db: Session, hit: WatchlistHit) -> Lead:
    """The hit as a lead the reporter works like any other, linked to the document's source."""
    from app.services.leads import create_lead, create_lead_link

    if hit.status != "new":
        raise ValueError("This hit was already decided")
    entry = db.get(WatchlistEntry, hit.entry_id)
    if entry is None:
        raise ValueError("The watched name was removed")
    snippet = " … ".join("".join(piece["text"] for piece in fragment) for fragment in (hit.highlights or [])[:2])
    where = f"{hit.title}{f', page {hit.page_number}' if hit.page_number else ''}"
    lead = create_lead(db, LeadCreate(
        investigation_id=hit.investigation_id, title=f"“{entry.query}” in {hit.title}"[:500],
        detail=f"The watchlist found “{entry.query}” in {where}." + (f" {snippet}" if snippet else ""),
        provider="openaleph", provider_record_id=f"watch:{entry.id}:{hit.document_key}"[:512]))
    doc = db.get(Document, hit.document_id) if hit.document_id else None
    if doc is not None:
        create_lead_link(db, lead, LeadLinkCreate(source_id=doc.source_id, note="The document the watchlist found the name in"))
    hit.status = "lead"
    hit.lead_id = lead.id
    hit.decided_at = utcnow_naive()
    db.commit()
    db.refresh(lead)
    return lead


def dismiss(db: Session, hit: WatchlistHit) -> WatchlistHit:
    if hit.status != "new":
        raise ValueError("This hit was already decided")
    hit.status = "dismissed"
    hit.decided_at = utcnow_naive()
    db.commit()
    return hit


def serialize_watchlist(db: Session, investigation_id: str) -> dict[str, Any]:
    entries = list(db.scalars(select(WatchlistEntry).where(WatchlistEntry.investigation_id == investigation_id)
                              .order_by(WatchlistEntry.created_at)))
    hits: dict[str, list[WatchlistHit]] = {}
    for hit in db.scalars(select(WatchlistHit).where(WatchlistHit.investigation_id == investigation_id)
                          .order_by(WatchlistHit.found_at.desc())):
        hits.setdefault(hit.entry_id, []).append(hit)
    return {"investigation_id": investigation_id, "entries": [{
        "id": entry.id, "query": entry.query, "note": entry.note, "created_by": entry.created_by, "created_at": entry.created_at,
        "checked_at": entry.checked_at, "check_state": entry.check_state, "check_detail": entry.check_detail,
        "hits": [{"id": hit.id, "document_id": hit.document_id, "title": hit.title, "page_number": hit.page_number,
                  "highlights": hit.highlights or [], "status": hit.status, "lead_id": hit.lead_id, "found_at": hit.found_at,
                  "decided_by_id": hit.decided_by_id, "decided_by_name": hit.decided_by_name}
                 for hit in hits.get(entry.id, [])],
    } for entry in entries]}
