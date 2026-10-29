"""A quote pinned from a captured page finds itself again (mockup INTAKE_3, "Pin a quote · finds itself again").

Each quote keeps its anchor in the saved copy (app/services/anchors.py: the exact words, 32 characters either side,
its place). Here it is looked for again in the saved copy, and, once the page has been checked again
(app/services/capture_follow.py), in the live page's text too. A quote that cannot be found again goes to the
"Unanchored" tray: never lost, and still tied to the version it was taken from.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Capture, Document, Evidence, PageVersion
from app.services import capture_follow
from app.services.anchor_text import find_anchor, refind_anchor
from app.services.anchors import anchor_document_quotes, chunk_dicts


def _place(anchor: dict[str, Any]) -> str:
    where = anchor.get("locator") or "the page text"
    return f"characters {anchor['start']:,}–{anchor['end']:,} of {where}"


def quotes(db: Session, row: Capture) -> list[dict[str, Any]]:
    """Each quote from this capture's page: found again in the saved copy, and on the live page."""
    if not row.source_id or not row.document_id:
        return []
    chunks = chunk_dicts(db, row.document_id)
    monitor = capture_follow.monitor_for(db, row)
    live: PageVersion | None = None
    first: PageVersion | None = None
    if monitor is not None and monitor.last_checked_at is not None:
        versions = list(db.scalars(select(PageVersion).where(PageVersion.monitor_id == monitor.id).order_by(PageVersion.number)))
        first = next((v for v in versions if v.capture_id == row.id), None)
        live = versions[-1] if versions else None
    out: list[dict[str, Any]] = []
    rows = db.scalars(select(Evidence).where(Evidence.source_id == row.source_id, Evidence.quote.is_not(None)))
    for ev in rows:
        found, state = refind_anchor(ev.anchor, chunks, ev.quote)
        saved = None if found is None else {
            "state": state, "match": found.get("match"), "occurrences": found.get("occurrences") or 1,
            "prefix": found.get("prefix") or "", "suffix": found.get("suffix") or "", "place": _place(found)}
        on_live: dict[str, Any] | None = None
        if live is not None and first is not None:
            if live.text_sha256 == first.text_sha256:
                on_live = {"checked": True, "found": saved is not None, "version": live.number, "same_as_saved": True}
            else:
                hit = find_anchor([{"id": "live", "locator": None, "page_number": None, "text": live.text}], ev.quote,
                                  prefix=str((saved or {}).get("prefix", "")), suffix=str((saved or {}).get("suffix", "")))
                on_live = {"checked": True, "found": hit is not None, "version": live.number, "same_as_saved": False,
                           "match": hit.get("match") if hit else None}
        out.append({"evidence_id": ev.id, "quote": ev.quote, "characters": len(ev.quote or ""), "saved": saved,
                    "live": on_live, "captured_version": first.number if first else 1,
                    "unanchored": saved is None or (on_live is not None and not on_live["found"])})
    return out


def refind(db: Session, row: Capture) -> int:
    """Read the saved copy's quotes again: each quote's anchor is found again in the page's passages. Returns how many
    are anchored."""
    doc = db.get(Document, row.document_id) if row.document_id else None
    if doc is None:
        return 0
    count = anchor_document_quotes(db, doc)
    db.commit()
    return count
