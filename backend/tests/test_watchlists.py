"""A watchlist of names re-checked as documents arrive (ADR-0006, Wave C;
app/services/watchlists.py). OpenAleph is faked (tests/openaleph_fake.py)
with the search reply shapes OpenAleph 5.3.1 returned live."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Investigation, Lead, LeadLink
from app.services import openaleph_analysis
from app.services.watchlists import search_text
from openaleph_fake import FakeOpenAleph, entity, page

client = TestClient(app)


@pytest.fixture()
def fake(monkeypatch, tmp_path):
    fake = FakeOpenAleph().install(monkeypatch)
    monkeypatch.setattr(settings, "document_reader", "auto")
    monkeypatch.setattr(settings, "openaleph_read_poll_seconds", 0.01)
    monkeypatch.setattr(settings, "openaleph_analysis_timeout_seconds", 5)
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "docs"))
    monkeypatch.setattr(openaleph_analysis, "SEARCH_REFRESH_SECONDS", 0)
    return fake


def _investigation() -> str:
    with SessionLocal() as db:
        inv = Investigation(name="Watchlist")
        db.add(inv)
        db.commit()
        return inv.id


def _upload(inv: str, name: str, data: bytes, mime: str = "text/plain") -> dict:
    reply = client.post("/api/documents/upload", data={"investigation_id": inv, "title": name}, files={"file": (name, data, mime)})
    assert reply.status_code == 200, reply.text
    return reply.json()


MEMO_HIT = {"id": "1.upload", "schema": "PlainText", "caption": "memo.txt", "score": 3.5,
            "highlight": {"content": ["Jane Doe paid <em>Zanzibar Trading</em>."]}}
PAGE_HIT = {"id": "2.upload-page-2", "schema": "Page", "caption": "minutes.pdf", "score": 2.0,
            "properties": {"index": ["2"], "document": [{"id": "2.upload", "schema": "Pages"}]},
            "highlight": {"content": ["The <em>Zanzibar Trading</em> transfer was approved."]}}


def test_a_plain_name_is_searched_as_a_phrase():
    assert search_text("Zanzibar Trading") == '"Zanzibar Trading"'
    assert search_text('"Jane Doe" OR Zanzibar') == '"Jane Doe" OR Zanzibar'
    assert search_text("Zanzi*") == "Zanzi*"


def test_a_watched_name_turns_up_each_document_once_and_becomes_a_lead(fake):
    inv = _investigation()
    memo = _upload(inv, "memo.txt", b"Jane Doe paid Zanzibar Trading.")
    fake.entities["2.upload"] = entity("2.upload", "Pages", fileName="minutes.pdf")
    fake.pages["2.upload"] = [page("2.upload", 1, "Board minutes."), page("2.upload", 2, "The Zanzibar Trading transfer was approved.")]
    minutes = _upload(inv, "minutes.pdf", b"%PDF-", "application/pdf")

    added = client.post(f"/api/investigations/{inv}/watchlist", json={"query": "  Zanzibar   Trading ", "note": "The shell"})
    assert added.status_code == 200, added.text
    assert [e["query"] for e in added.json()["entries"]] == ["Zanzibar Trading"]
    assert client.post(f"/api/investigations/{inv}/watchlist", json={"query": "zanzibar trading"}).status_code == 400   # already watched

    fake.search_hits = [MEMO_HIT, PAGE_HIT]
    checked = client.post(f"/api/investigations/{inv}/watchlist/check").json()
    assert (checked["checked"], checked["new_hits"]) == (1, 2)
    asked = fake.calls("GET", "/api/2/search")[-1].url.params
    assert asked["q"] == '"Zanzibar Trading"' and asked["filter:collection_id"]
    entry = checked["entries"][0]
    assert entry["check_state"] == "ok" and entry["checked_at"]
    by_doc = {hit["document_id"]: hit for hit in entry["hits"]}
    assert set(by_doc) == {memo["id"], minutes["id"]}
    assert by_doc[minutes["id"]]["page_number"] == 2 and by_doc[minutes["id"]]["title"] == "minutes.pdf"
    assert {"text": "Zanzibar Trading", "match": True} in by_doc[memo["id"]]["highlights"][0]

    # The same documents are not hits again.
    assert client.post(f"/api/investigations/{inv}/watchlist/check").json()["new_hits"] == 0

    lead = client.post(f"/api/watchlist-hits/{by_doc[memo['id']]['id']}/lead")
    assert lead.status_code == 200, lead.text
    assert lead.json()["title"] == "“Zanzibar Trading” in memo.txt"
    assert lead.json()["detail"].startswith("The watchlist found “Zanzibar Trading” in memo.txt. Jane Doe paid Zanzibar Trading.")
    with SessionLocal() as db:
        link = db.query(LeadLink).filter_by(lead_id=lead.json()["id"]).one()
        assert link.source_id == memo["source_id"]
    assert client.post(f"/api/watchlist-hits/{by_doc[memo['id']]['id']}/lead").status_code == 400   # already decided
    dismissed = client.post(f"/api/watchlist-hits/{by_doc[minutes['id']]['id']}/dismiss").json()
    assert {hit["status"] for hit in dismissed["entries"][0]["hits"]} == {"lead", "dismissed"}

    # Removing the name removes its hits; the lead stays.
    gone = client.delete(f"/api/watchlist/{entry['id']}").json()
    assert gone["entries"] == []
    with SessionLocal() as db:
        assert db.get(Lead, lead.json()["id"]) is not None


def test_a_newly_read_document_is_checked_against_the_watchlist(fake):
    inv = _investigation()
    client.post(f"/api/investigations/{inv}/watchlist", json={"query": "Zanzibar Trading"})
    fake.search_hits = [MEMO_HIT]
    memo = _upload(inv, "memo.txt", b"Jane Doe paid Zanzibar Trading.")
    assert memo["job"]["message"].endswith("the watchlist found 1 new document(s)")
    hits = client.get(f"/api/investigations/{inv}/watchlist").json()["entries"][0]["hits"]
    assert [hit["document_id"] for hit in hits] == [memo["id"]]


def test_openaleph_off_is_the_entrys_check_state(fake, monkeypatch):
    inv = _investigation()
    client.post(f"/api/investigations/{inv}/watchlist", json={"query": "Zanzibar Trading"})
    monkeypatch.setattr(settings, "openaleph_enabled", False)
    checked = client.post(f"/api/investigations/{inv}/watchlist/check").json()
    assert checked["new_hits"] == 0
    assert checked["entries"][0]["check_state"] == "not_configured"
    assert client.get("/api/investigations/nope/watchlist").status_code == 404
    assert client.post("/api/watchlist-hits/nope/lead").status_code == 404
