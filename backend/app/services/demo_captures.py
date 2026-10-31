"""The 1MDB demo case's web captures (Links & captures, ADR-0018; mockup INTAKE_3), so the screen shows real material.

Nothing is fetched here and no browser is run. Each capture is made from what the demo loader already brought to this
computer when the case was built (app/services/demo_1mdb.py): the page it downloaded from the address, stored as the
case document. That page is kept again as the capture's own files (page.html, and a WARC 1.1 record of it), each with
its SHA-256, and the capture points at the document the case already read, so its quotes find themselves again.

What a demo capture cannot have, it does not claim: there was no browser visit, so no screenshot (the lane says "not
run"), no rendered page and no request or response headers; the tool and the collector say "1MDB demo loader". A page
the publisher did not answer with when the case was loaded is a "link only" capture, with that reason.

Seeding is idempotent: an address the case has already captured is left alone.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import Capture, Document, Source
from app.services.security import contained_path
from app.services.web_capture import STAGES, capture_dir, warc_from_har

DEMO_TOOL = "1MDB demo loader: the page as downloaded with the case (no browser visit, no screenshot)"
DEMO_COLLECTOR = "1MDB demo"

# The pages, by the address the demo case records for them. "saved" needs the downloaded page on this computer; a page
# the publisher did not answer with becomes "link only" with the loader's own reason.
PAGES: tuple[dict[str, str], ...] = (
    {"url": "https://www.sarawakreport.org/2015/02/heist-of-the-century-how-jho-low-used-petrosaudi-as-a-front-to-siphon-"
            "billions-out-of-1mdb-world-exclusive/", "outcome": "saved"},
    {"url": "https://finma.ch/en/news/2016/05/20160524-mm-bsi", "outcome": "saved"},
    {"url": "https://www.mas.gov.sg/news/media-releases/2016/mas-directs-bsi-bank-to-shut-down-in-singapore", "outcome": "link_only"},
)


def _stages(done: tuple[str, ...], stopped: str | None = None) -> list[dict[str, Any]]:
    """The lane with no seconds (nothing was timed): done, stopped, or not run."""
    out, after = [], False
    for key, label in STAGES:
        if key == stopped:
            state, after = "stopped", True
        else:
            state = "done" if key in done and not after else "skipped"
        out.append({"key": key, "label": label, "state": state, "seconds": None})
    return out


def _meta(source: Source) -> dict[str, Any]:
    return dict(source.metadata_json or {})


def _warc(url: str, body: bytes, when: datetime) -> bytes:
    """A WARC 1.1 response record of the page as the loader received it, through the capture's own writer."""
    har = {"log": {"entries": [{"startedDateTime": when.isoformat() + "Z",
                                "request": {"method": "GET", "url": url, "headers": []},
                                "response": {"status": 200, "statusText": "OK", "headers": [{"name": "Content-Type", "value": "text/html"}],
                                             "content": {"text": body.decode("utf-8", errors="replace")}}}]}}
    return warc_from_har(json.dumps(har).encode("utf-8"), DEMO_TOOL)


def _keep(folder: Path, name: str, role: str, data: bytes) -> dict[str, Any]:
    import hashlib

    contained_path(folder, name).write_bytes(data)
    return {"name": name, "role": role, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def seed_captures(db: Session, investigation_id: str, *, storage_dir: str | Path | None = None) -> int:
    """Give the case the demo's captures. Returns how many were added (0 when all were there or none can be made)."""
    root = storage_dir or settings.document_storage_dir
    have = set(db.scalars(select(Capture.url).where(Capture.investigation_id == investigation_id)))
    added = 0
    for page in PAGES:
        url = page["url"]
        if url in have:
            continue
        source = db.scalars(select(Source).where(Source.investigation_id == investigation_id, Source.url == url)).first()
        if source is None:
            continue
        meta = _meta(source)
        doc = db.scalars(select(Document).where(Document.source_id == source.id).order_by(Document.created_at)).first()
        displayed = {"title": source.title, "published": meta.get("date")}
        if page["outcome"] == "saved":
            try:
                body = Path(doc.storage_path).read_bytes() if doc is not None else None
            except OSError:
                body = None
            if doc is None or not body:
                continue  # the loader did not bring this page: no capture is claimed
            when = doc.created_at
            row = Capture(investigation_id=investigation_id, url=url, final_url=url, status="finished", outcome="saved",
                          http_status=200, collector=DEMO_COLLECTOR, tool=DEMO_TOOL, requested_at=when, started_at=when,
                          finished_at=when, captured_at=when, files=[], displayed=displayed, exchange={}, media={},
                          stages=_stages(("checked", "fetched", "source", "archive", "fingerprint", "text")),
                          source_id=source.id, document_id=doc.id)
            db.add(row)
            db.flush()
            folder = capture_dir(root, investigation_id, row.id)
            folder.mkdir(parents=True, exist_ok=True)
            row.files = [_keep(folder, "page.html", "page source as received (by the demo loader)", body),
                         _keep(folder, "page.warc.gz", "WARC 1.1 archive of the page as received", _warc(url, body, when))]
        else:
            when = source.created_at or utcnow_naive()
            reason = meta.get("not_downloaded") or "The publisher did not answer with the page when the case was loaded."
            row = Capture(investigation_id=investigation_id, url=url, status="finished", outcome="link_only", reason=reason,
                          reason_kind="blocked", collector=DEMO_COLLECTOR, tool=DEMO_TOOL, requested_at=when - timedelta(seconds=2),
                          started_at=when - timedelta(seconds=2), finished_at=when, files=[], displayed={}, exchange={},
                          media={}, stages=_stages(("checked",), stopped="fetched"))
            db.add(row)
        added += 1
    db.commit()
    return added
