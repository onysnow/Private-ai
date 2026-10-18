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
text that already uses search syntax (quotes, AND/OR, wildcards) is sent
as written.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import Document, Investigation, Lead
from app.models.watchlists import WatchlistEntry, WatchlistHit
from app.schemas.api import LeadCreate, LeadLinkCreate
from app.services.openaleph_search import Fetch, search_corpus

logger = logging.getLogger("journalism.watchlists")

CHECK_LIMIT = 50
_SYNTAX = re.compile(r'["*?~]|\b(AND|OR|NOT)\b')


def search_text(query: str) -> str:
    """What is sent to OpenAleph: a plain name as a phrase, search syntax as written."""
    query = query.strip()
    return query if _SYNTAX.search(query) else f'"{query}"'


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
    entry.checked_at = utcnow_naive()
    entry.check_state = found["state"]
    entry.check_detail = found["detail"]
    if found["state"] != "ok":
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
                  "highlights": hit.highlights or [], "status": hit.status, "lead_id": hit.lead_id, "found_at": hit.found_at}
                 for hit in hits.get(entry.id, [])],
    } for entry in entries]}
