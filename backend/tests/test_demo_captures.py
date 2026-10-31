"""The 1MDB demo case's web captures (app/services/demo_captures.py): made from the pages the demo loader already
brought in, nothing fetched and no browser run; each kept file is on disk with its SHA-256, the capture points at the
case document; a page the publisher did not answer with is "link only" with that reason; seeding again adds nothing."""

from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Capture, Source
from app.schemas.api import InvestigationCreate
from app.services import web_capture
from app.services.demo_captures import DEMO_TOOL, PAGES, seed_captures
from app.services.documents import store_document
from app.services.investigations import create_investigation

client = TestClient(app)
PAGE = b"<html><head><title>Heist of the century</title></head><body><p>PetroSaudi as a front.</p></body></html>"


def _case() -> tuple[str, str]:
    """A case with the first saved page downloaded and the link-only page recorded as not downloaded."""
    with SessionLocal() as db:
        inv = create_investigation(db, InvestigationCreate(name="Captures demo")).id
        doc = store_document(db, investigation_id=inv, title="Heist of the century", filename="sr-2015-heist.html",
                             mime_type="text/html", data=PAGE, storage_dir=Path(settings.document_storage_dir))
        source = db.get(Source, doc.source_id)
        assert source is not None
        source.url, source.title, source.metadata_json = PAGES[0]["url"], "Heist of the century", {"date": "2015-02-28", "demo": "1mdb"}
        db.add(Source(investigation_id=inv, url=PAGES[2]["url"], title="MAS directs BSI Bank to shut down", source_type="public_record",
                      metadata_json={"not_downloaded": "The publisher did not answer with the page when the case was loaded."}))
        db.commit()
        return inv, doc.id


def test_the_demo_keeps_the_downloaded_page_as_a_capture_and_fetches_nothing(monkeypatch):
    def no_network(*_a, **_k):
        raise AssertionError("seeding must not visit a page")

    monkeypatch.setattr(web_capture, "visit", no_network)
    inv, doc_id = _case()
    with SessionLocal() as db:
        # The FINMA page is not in this case: no capture is claimed for it.
        assert seed_captures(db, inv) == 2
        rows = {c.outcome: c for c in db.scalars(select(Capture).where(Capture.investigation_id == inv))}
    saved, link = rows["saved"], rows["link_only"]
    assert saved.document_id == doc_id and saved.tool == DEMO_TOOL and saved.collector == "1MDB demo"
    assert saved.displayed == {"title": "Heist of the century", "published": "2015-02-28"}
    # No browser: no screenshot and no headers, and the lane says the picture was not taken.
    assert [f["name"] for f in saved.files] == ["page.html", "page.warc.gz"] and saved.exchange == {}
    assert {s["key"]: s["state"] for s in saved.stages}["screenshot"] == "skipped"
    assert all(s["seconds"] is None for s in saved.stages)
    for entry in saved.files:
        path, _ = web_capture.capture_file(saved, entry["name"])
        assert hashlib.sha256(path.read_bytes()).hexdigest() == entry["sha256"] and path.stat().st_size == entry["bytes"]
    assert web_capture.capture_file(saved, "page.html")[0].read_bytes() == PAGE
    from warcio.archiveiterator import ArchiveIterator

    with web_capture.capture_file(saved, "page.warc.gz")[0].open("rb") as fh:
        records = [(r.rec_type, r.rec_headers.get_header("WARC-Target-URI"), r.content_stream().read()) for r in ArchiveIterator(fh)]
    assert ("response", PAGES[0]["url"], PAGE) in records
    assert b"1MDB demo loader" in next(body for kind, _, body in records if kind == "warcinfo")

    assert link.reason == "The publisher did not answer with the page when the case was loaded." and link.reason_kind == "blocked"
    assert link.files == [] and link.document_id is None
    assert [s["state"] for s in link.stages][:3] == ["done", "stopped", "skipped"]

    # The screen's answer: both, newest first, each with its outcome.
    listed = client.get(f"/api/investigations/{inv}/captures").json()
    assert {c["outcome"] for c in listed} == {"saved", "link_only"}
    assert client.get(f"/api/captures/{saved.id}/files/page.html").content == PAGE


def test_seeding_again_adds_nothing():
    inv, _ = _case()
    with SessionLocal() as db:
        assert seed_captures(db, inv) == 2
        assert seed_captures(db, inv) == 0
        assert len(db.scalars(select(Capture).where(Capture.investigation_id == inv)).all()) == 2


def test_a_page_whose_download_is_missing_is_not_claimed():
    inv, doc_id = _case()
    with SessionLocal() as db:
        from app.models.domain import Document

        doc = db.get(Document, doc_id)
        assert doc is not None
        Path(doc.storage_path).unlink()
        assert seed_captures(db, inv) == 1
        assert {c.outcome for c in db.scalars(select(Capture).where(Capture.investigation_id == inv))} == {"link_only"}
