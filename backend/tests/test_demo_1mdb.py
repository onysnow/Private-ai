"""The 1MDB demo case (app/services/demo_1mdb.py): its records hang together, a
document that is not the pinned file is refused, and loading makes the case with
every record in its place. The real documents are not downloaded here."""

from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Claim, Document, RelationshipEdge, TimelineEvent
from app.services import demo_1mdb
from app.services.html_reader import html_blocks
from app.services.relationships import RELATIONSHIP_SCHEMAS

client = TestClient(app)


def test_the_records_hang_together():
    docs = {d["id"] for d in demo_1mdb.manifest()}
    case = demo_1mdb.records()
    keys = {e["key"] for e in case["entities"]}
    assert len(keys) == len(case["entities"]), "entity keys are unique"
    quotes = [q for row in case["entities"] + case["relationships"] + case["claims"] for q in row.get("evidence") or []]
    quotes += [ev["evidence"] for ev in case["events"]]
    assert quotes and all(q["doc"] in docs and q["locator"] and len(q["quote"].split()) >= 5 for q in quotes)
    for r in case["relationships"]:
        assert r["schema"] in RELATIONSHIP_SCHEMAS and r["source"] in keys and r["target"] in keys
        for amount in r.get("properties", {}).get("amount", []):
            assert re.fullmatch(r"\d+", amount), amount
        for date in r.get("properties", {}).get("date", []):
            assert re.fullmatch(r"\d{4}(-\d{2}(-\d{2})?)?", date), date
    assert {c["status"] for c in case["claims"]} == {"supported", "unverified", "disputed", "lead"}
    assert all(not c.get("evidence") for c in case["claims"] if c["status"] == "lead")
    assert all(any(q.get("stance") == "contradicts" for q in c["evidence"]) for c in case["claims"] if c["status"] == "disputed")
    assert all(ev.get("entity") in (None, *keys) for ev in case["events"])
    pinned = [d for d in demo_1mdb.manifest() if d["filename"].endswith(".pdf")]
    assert pinned and all(re.fullmatch(r"[0-9a-f]{64}", d["sha256"]) for d in pinned)


def test_a_document_that_is_not_the_pinned_file_is_refused():
    with pytest.raises(demo_1mdb.DemoDownloadError, match="fingerprint"):
        demo_1mdb.fetch_documents(lambda url: b"not the complaint")


def test_loading_makes_the_case_with_every_record(tmp_path):
    docs = [(meta, f"stand-in for {meta['id']}".encode()) for meta in demo_1mdb.manifest()]
    case = demo_1mdb.records()
    with SessionLocal() as db:
        inv, document_ids = demo_1mdb.build(db, docs, storage_dir=tmp_path)
        assert inv.is_demo and inv.question == case["investigation"]["question"]
        assert len(document_ids) == len(docs) == db.query(Document).filter_by(investigation_id=inv.id).count()
        more = demo_1mdb.more()
        linked_places = sum(1 for p in more["places"] if p.get("link"))
        assert db.query(RelationshipEdge).filter_by(investigation_id=inv.id).count() == \
            len(case["relationships"]) + len(more["relationships"]) + linked_places
        assert db.query(TimelineEvent).filter_by(investigation_id=inv.id).count() == len(case["events"]) + len(more["events"])
        statuses = {c.status for c in db.query(Claim).filter_by(investigation_id=inv.id)}
        assert statuses == {"supported", "confirmed", "unverified", "disputed", "rejected", "lead"}
        assert demo_1mdb.existing(db).id == inv.id
        assert demo_1mdb.LAST_PROBLEMS == []
    n_claims = len(case["claims"]) + len(more["claims"]) + len(more["inferred_claims"])
    body = client.get("/api/demo/1mdb").json()
    assert body["investigation_id"] == inv.id and body["documents"] == len(docs) and body["claims"] == n_claims
    # Loading again changes nothing.
    assert client.post("/api/demo/1mdb").json()["investigation_id"] == inv.id
    # The small made-up demo is still its own case.
    seeded = client.post("/api/demo/seed").json()
    assert seeded["investigation_id"] != inv.id


def test_an_html_page_is_read_as_its_words_not_its_markup():
    page = """<html><head><title>T</title><script>var x = 1;</script><style>p{}</style></head><body>
      <nav><a href="/">Home</a></nav><header>Site name</header>
      <main><h1>MAS directs BSI Bank to shut down</h1><p>Singapore, 24 May 2016 &hellip; MAS announced <b>today</b>.</p>
      <ul><li>First point</li><li>Second</li></ul></main><footer>Contact us</footer></body></html>"""
    assert html_blocks(page) == ["MAS directs BSI Bank to shut down", "Singapore, 24 May 2016 … MAS announced today.", "First point", "Second"]
    assert html_blocks("<div>No main here</div><p>Second block</p>") == ["No main here", "Second block"]


def test_a_web_page_that_is_not_the_expected_page_is_kept_as_a_link(tmp_path):
    pdfs = {d["url"]: d for d in demo_1mdb.manifest() if d.get("sha256")}
    error_page = b"<html><body><main><h1>Sorry, this service is currently unavailable.</h1></main></body></html>"

    def fetch(url: str) -> bytes:
        if url in pdfs:
            raise AssertionError("PDFs are not fetched in this test")
        return error_page

    # PDFs are pinned, so fetch only the pages: run the check directly on each one.
    quotes = demo_1mdb._quotes_by_document()
    pages = [d for d in demo_1mdb.manifest() if not d.get("sha256")]
    assert pages and not any(demo_1mdb.is_expected_page(d, fetch(d["url"]), quotes[d["id"]]) for d in pages)
    good = "<main>" + "".join(f"<p>{q}</p>" for q in quotes[pages[0]["id"]]) + "</main>"
    assert demo_1mdb.is_expected_page(pages[0], good.encode(), quotes[pages[0]["id"]])

    docs = [(meta, None if not meta.get("sha256") else f"stand-in for {meta['id']}".encode()) for meta in demo_1mdb.manifest()]
    with SessionLocal() as db:
        inv, document_ids = demo_1mdb.build(db, docs, storage_dir=tmp_path)
        assert len(document_ids) == len(pdfs)
        assert db.query(RelationshipEdge).filter_by(investigation_id=inv.id).count() >= len(demo_1mdb.records()["relationships"])
        shown = demo_1mdb.progress(db)["not_downloaded"]
        assert {d["url"] for d in pages} <= {p["url"] for p in shown}


def test_a_1mdb_load_that_stops_halfway_keeps_nothing(monkeypatch):
    """As for the small cases: a half-made 1MDB case would pass for the loaded one,
    so it is removed and the progress says what stopped the load."""
    monkeypatch.setattr(demo_1mdb, "fetch_documents", lambda: [(meta, b"stand-in") for meta in demo_1mdb.manifest()])
    real_build = demo_1mdb.build

    def broken_build(db, documents, *, storage_dir):
        from app.services import entities
        monkeypatch.setattr(entities, "create_entity", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("database is locked")))
        return real_build(db, documents, storage_dir=storage_dir)

    monkeypatch.setattr(demo_1mdb, "build", broken_build)
    body = client.post("/api/demo/1mdb").json()
    assert body["state"] == "failed" and "database is locked" in body["error"] and body.get("investigation_id") is None
    with SessionLocal() as db:
        assert demo_1mdb.existing(db) is None
    demo_1mdb.set_state(state="idle")
