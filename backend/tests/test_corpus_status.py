"""Reading progress for an investigation's corpus (ADR-0006, Wave A).

``GET /api/investigations/{id}/corpus/status`` reports OpenAleph's
collection status per stage. OpenAleph is faked over HTTP
(tests/openaleph_fake.py) with the DatasetStatus shape OpenAleph 5.3.1
returned live: zeros and no batches when idle, job counts per batch and
queue while anything is waiting or running.
"""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Investigation, InvestigationCorpusBinding
from app.services import openaleph_http
from openaleph_fake import IDLE, FakeOpenAleph, busy_status

STATUS_PATH = "/api/2/collections/7/status"


@pytest.fixture()
def fake(monkeypatch):
    return FakeOpenAleph().install(monkeypatch)


def _investigation(*, collection_id: str | None = None) -> str:
    with SessionLocal() as db:
        inv = Investigation(name="Corpus status")
        db.add(inv)
        db.flush()
        if collection_id:
            db.add(InvestigationCorpusBinding(investigation_id=inv.id, provider="openaleph",
                                              collection_id=collection_id, status="active"))
        db.commit()
        return inv.id


def _status(investigation_id: str) -> dict:
    reply = TestClient(app).get(f"/api/investigations/{investigation_id}/corpus/status")
    assert reply.status_code == 200, reply.text
    return reply.json()


def _queue(name: str, **counts: int) -> dict:
    row = {"name": name, "todo": 0, "doing": 0, "succeeded": 0, "failed": 0, "aborted": 0, "aborting": 0, "cancelled": 0}
    return {**row, **counts}


def test_stages_are_added_up_across_batches_in_the_order_a_document_passes_them(fake):
    inv = _investigation(collection_id="7")
    fake.statuses.append({**IDLE, "batches": [
        {"name": "1:upload-a", "queues": [_queue("openaleph", todo=2, succeeded=1), _queue("ingest", todo=1, doing=1, succeeded=3, failed=1)]},
        {"name": "1:upload-b", "queues": [_queue("ingest", succeeded=2), _queue("vectorize", aborted=1)]},
    ]})
    status = _status(inv)
    assert status["state"] == "working" and status["active"] is True
    assert status["collection_id"] == "7" and status["detail"] is None
    assert status["stages"] == [
        {"queue": "ingest", "label": "Reading files", "pending": 1, "running": 1, "finished": 6, "failed": 1},
        {"queue": "openaleph", "label": "Indexing for search", "pending": 2, "running": 0, "finished": 1, "failed": 0},
        {"queue": "vectorize", "label": "Preparing similarity search", "pending": 0, "running": 0, "finished": 1, "failed": 1},
    ]
    assert len(fake.calls("GET", STATUS_PATH)) == 1


def test_finished_stages_stay_listed_while_a_later_one_still_works(fake):
    inv = _investigation(collection_id="7")
    fake.statuses.append({**IDLE, "batches": [{"name": "1:x", "queues": [_queue("ingest", succeeded=2), _queue("analyze", doing=1)]}]})
    status = _status(inv)
    assert status["state"] == "working"
    assert [(s["label"], s["pending"], s["running"], s["finished"]) for s in status["stages"]] == [
        ("Reading files", 0, 0, 2), ("Finding names", 0, 1, 0)]


def test_an_idle_collection_reports_no_stages(fake):
    inv = _investigation(collection_id="7")
    status = _status(inv)
    assert status["state"] == "idle" and status["active"] is False and status["stages"] == []


def test_an_unknown_queue_keeps_its_own_name_after_the_known_ones(fake):
    inv = _investigation(collection_id="7")
    fake.statuses.append(busy_status("zzz-custom", "ingest"))
    assert [s["label"] for s in _status(inv)["stages"]] == ["Reading files", "zzz-custom"]


def test_nothing_is_asked_of_openaleph_when_it_is_off_or_holds_nothing_yet(fake, monkeypatch):
    without_collection = _investigation()
    status = _status(without_collection)
    assert status["state"] == "no_collection" and status["collection_id"] is None
    assert status["detail"] == "No document of this investigation has been sent to OpenAleph yet"
    monkeypatch.setattr(settings, "openaleph_enabled", False)
    status = _status(_investigation(collection_id="7"))
    assert status["state"] == "not_configured" and status["collection_id"] == "7"
    assert status["detail"] == "OpenAleph is not switched on for this deployment"
    assert not fake.calls("GET", STATUS_PATH)


def test_openaleph_down_is_a_state_not_an_error(fake, monkeypatch):
    inv = _investigation(collection_id="7")
    fake.fail[STATUS_PATH] = 502
    status = _status(inv)
    assert status["state"] == "unreachable" and status["active"] is False and status["stages"] == []
    assert status["detail"] == "OpenAleph answered 502 when asked how its work stands"

    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    monkeypatch.setattr(openaleph_http, "transport", httpx.MockTransport(refuse))
    assert _status(inv)["detail"] == "OpenAleph did not answer (ConnectError)"


def test_an_unknown_investigation_is_not_found(fake):
    reply = TestClient(app).get("/api/investigations/missing/corpus/status")
    assert reply.status_code == 404 and reply.json()["detail"] == "Investigation not found"
