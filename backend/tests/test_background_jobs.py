"""Background jobs, in-process runner (SQLite developer mode and the fast suite).

ADR-0004 / Foundation Fixes fix 1: reading an upload is a job. Here the job
runs before the upload replies, but in a worker thread, so the server keeps
answering other requests while a slow document (OCR) is read.
"""

from __future__ import annotations

import threading
import time

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.core.authorization import AuthorizationScope
from app.core.config import Settings
from app.db.session import SessionLocal
from app.jobs.records import cancel_queued, create_job, execute_job
from app.jobs.runner import resolve_runner
from app.models.domain import BackgroundJob, DocumentChunk


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.api.routes_documents.settings.document_storage_dir", str(tmp_path / "docs"))
    app = main_module.create_app(Settings(job_runner="inline", frontend_dist_dir=str(tmp_path / "no-build")), bootstrap_schema=False)
    with TestClient(app) as test_client:
        yield test_client


def _investigation(client: TestClient, name: str = "Jobs") -> str:
    return client.post("/api/investigations", json={"name": name}).json()["id"]


def _upload(client: TestClient, inv: str, body: bytes = b"Acme Holdings Inc. announced a program.\n", name: str = "memo.txt"):
    return client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Memo"},
                       files={"file": (name, body, "text/plain")})


def test_upload_runs_a_job_and_answers_with_the_read_document(client):
    inv = _investigation(client)
    response = _upload(client, inv)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["extraction_status"] == "complete" and body["chunk_count"] == 1
    job = body["job"]
    assert job["kind"] == "extract_document" and job["status"] == "succeeded" and job["finished"] is True
    assert job["subject_type"] == "document" and job["subject_id"] == body["id"]
    assert job["investigation_id"] == inv and job["attempts"] == 1 and job["progress"] == 100
    assert job["runner"] == "inline" and job["message"] == "Document read"

    assert client.get(f"/api/jobs/{job['id']}").json()["status"] == "succeeded"
    listed = client.get("/api/jobs", params={"investigation_id": inv}).json()
    assert [row["id"] for row in listed] == [job["id"]]
    assert client.get("/api/jobs", params={"subject_id": body["id"]}).json()[0]["id"] == job["id"]
    assert client.get("/api/jobs", params={"status": "nonsense"}).status_code == 422
    assert client.get("/api/jobs/no-such-job").status_code == 404


def test_failed_read_is_recorded_and_retry_reads_it(client, monkeypatch):
    inv = _investigation(client)

    def broken(path):
        raise RuntimeError("simulated OCR crash")

    monkeypatch.setattr("app.services.documents.extract_chunks", broken)
    response = _upload(client, inv)
    assert response.status_code == 422
    detail = response.json()["detail"]
    job = detail["job"]
    assert job["status"] == "failed" and job["error"] == "simulated OCR crash"
    assert detail["document"]["extraction_status"] == "failed" and detail["document"]["chunk_count"] == 0

    # Only failed or cancelled jobs can be retried; this one can.
    monkeypatch.undo()
    retried = client.post(f"/api/jobs/{job['id']}/retry")
    assert retried.status_code == 200, retried.text
    assert retried.json()["status"] == "succeeded" and retried.json()["attempts"] == 2
    document = client.get(f"/api/documents/{detail['document']['id']}").json()
    assert document["extraction_status"] == "complete"
    assert client.post(f"/api/jobs/{job['id']}/retry").status_code == 409


def test_a_document_is_never_read_twice(client):
    inv = _investigation(client)
    document_id = _upload(client, inv).json()["id"]
    with SessionLocal() as db:
        job = create_job(db, kind="extract_document", investigation_id=inv, subject_type="document", subject_id=document_id)
    from app.jobs.handlers import HANDLERS
    assert execute_job(SessionLocal, job.id, HANDLERS) == "failed"
    with SessionLocal() as db:
        assert db.get(BackgroundJob, job.id).error == "Document has already been read"
        assert db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).count() == 1


def test_cancel_only_before_start_and_a_cancelled_job_never_runs(client):
    inv = _investigation(client)
    calls: list[str] = []
    handlers = {"probe": lambda db, job, report: calls.append(job.id) or "ran"}
    with SessionLocal() as db:
        job = create_job(db, kind="probe", investigation_id=inv)
    cancelled = client.post(f"/api/jobs/{job.id}/cancel")
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
    assert execute_job(SessionLocal, job.id, handlers) == "cancelled"
    assert calls == []
    assert client.post(f"/api/jobs/{job.id}/cancel").status_code == 409

    with SessionLocal() as db:
        finished = create_job(db, kind="probe", investigation_id=inv)
    assert execute_job(SessionLocal, finished.id, handlers) == "succeeded"
    assert calls == [finished.id]
    with SessionLocal() as db:
        row = db.get(BackgroundJob, finished.id)
        assert row.message == "ran" and row.finished_at is not None
        with pytest.raises(ValueError, match="have not started"):
            cancel_queued(db, row)


def test_progress_reports_and_unknown_kinds(client):
    inv = _investigation(client)
    seen: list[tuple] = []

    def stepper(db, job, report):
        report(40, "Halfway")
        with SessionLocal() as other:
            row = other.get(BackgroundJob, job.id)
            seen.append((row.status, row.progress, row.message))
        report(250, None)  # clamped
        return None

    with SessionLocal() as db:
        job_id = create_job(db, kind="stepper", investigation_id=inv).id
        unknown_id = create_job(db, kind="no-such-kind", investigation_id=inv).id
    assert execute_job(SessionLocal, job_id, {"stepper": stepper}) == "succeeded"
    assert seen == [("running", 40, "Halfway")]
    assert client.get(f"/api/jobs/{job_id}").json()["message"] == "Done"
    assert execute_job(SessionLocal, unknown_id, {}) == "failed"
    assert "No handler" in client.get(f"/api/jobs/{unknown_id}").json()["error"]


def test_slow_read_does_not_freeze_other_requests(client, monkeypatch):
    """The 2026-10-01 measurement: a health check took 32 s while a scanned
    PDF was read, because the upload ran OCR on the event loop."""
    import app.services.documents as documents

    real = documents.extract_chunks

    def slow(path):
        time.sleep(1.5)
        return real(path)

    monkeypatch.setattr(documents, "extract_chunks", slow)
    inv = _investigation(client)
    result: dict = {}
    upload = threading.Thread(target=lambda: result.setdefault("r", _upload(client, inv)))
    upload.start()
    time.sleep(0.3)  # let the upload reach the slow read
    started = time.monotonic()
    assert client.get("/api/health").json() == {"status": "ok"}
    health_seconds = time.monotonic() - started
    upload.join(10)
    assert result["r"].status_code == 200
    assert health_seconds < 0.75, f"health check waited {health_seconds:.2f}s behind the upload"


def test_startup_fails_inline_jobs_a_stopped_process_left_behind(tmp_path):
    with SessionLocal() as db:
        left = create_job(db, kind="extract_document")
        left.status = "running"
        db.commit()
        left_id = left.id
        done = create_job(db, kind="extract_document")
        done.status = "succeeded"
        db.commit()
        done_id = done.id
    app = main_module.create_app(Settings(job_runner="inline", frontend_dist_dir=str(tmp_path)), bootstrap_schema=False)
    with TestClient(app):
        pass
    with SessionLocal() as db:
        interrupted = db.get(BackgroundJob, left_id)
        assert interrupted.status == "failed" and interrupted.error == "The app stopped before this finished."
        assert db.get(BackgroundJob, done_id).status == "succeeded"


def test_jobs_are_hidden_outside_the_callers_investigations(client):
    from app.api.routes_jobs import _visible_job
    from fastapi import HTTPException

    inv_a, inv_b = _investigation(client, "A"), _investigation(client, "B")
    with SessionLocal() as db:
        job_b_id = create_job(db, kind="probe", investigation_id=inv_b).id
        orphan_id = create_job(db, kind="probe").id
        scoped = AuthorizationScope(actor_id="t", investigation_ids=frozenset({inv_a}), role="shared")
        for job_id in (job_b_id, orphan_id):
            with pytest.raises(HTTPException) as exc:
                _visible_job(db, scoped, job_id)
            assert exc.value.status_code == 404
        owner = AuthorizationScope(actor_id="local-owner", investigation_ids=None, role="owner")
        assert _visible_job(db, owner, orphan_id).id == orphan_id


def test_runner_choice(tmp_path):
    from sqlalchemy import create_engine

    sqlite = create_engine("sqlite://")
    postgres = create_engine("postgresql+psycopg://u:p@localhost/db")
    assert resolve_runner("auto", sqlite) == "inline"
    assert resolve_runner("auto", postgres) == "procrastinate"
    assert resolve_runner("inline", postgres) == "inline"
    with pytest.raises(ValueError, match="needs a PostgreSQL"):
        resolve_runner("procrastinate", sqlite)
    with pytest.raises(ValueError, match="must be one of"):
        resolve_runner("celery", sqlite)


def test_ai_runs_are_jobs_that_keep_the_endpoints_answers(client, monkeypatch):
    """Foundation Fixes fix 4: an AI run is a background job. In-process, the
    endpoint still answers with the candidate, or with the same error status."""
    import json as _json

    import app.ai.reasoning as reasoning_module
    from app.ai.governor import governor
    from app.core.config import settings as app_settings

    monkeypatch.setattr(app_settings, "enable_ai_features", True)
    monkeypatch.setattr(app_settings, "ai_provider", "anthropic")
    governor.reset()
    inv = _investigation(client, "AI jobs")
    claim = client.post("/api/claims", json={"investigation_id": inv, "text": "Meridian paid Bellcastle a consulting fee in November 2023."}).json()
    ref = {"record_type": "claim", "record_id": claim["id"], "quote": "Meridian paid Bellcastle"}
    draft = {"title": "t", "goal_restated": "g", "executive_takeaway": "e", "open_questions": [],
             "sections": [{"heading": "h", "body": "b", "key_points": [{"text": "Paid", "evidence": [ref]}], "evidence": [ref]}]}

    class Fake:
        def __init__(self, text):
            self.text = text

        def generate(self, system_prompt, user_prompt, *, max_tokens=4096):
            return self.text

    body = {"goal": "Summarize.", "record_refs": [{"record_type": "claim", "record_id": claim["id"]}]}
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: Fake(_json.dumps(draft)))
    ok = client.post(f"/api/investigations/{inv}/assistant/presentation-draft", json=body)
    assert ok.status_code == 200, ok.text
    job = ok.json()["job"]
    assert job["kind"] == "ai_reasoning" and job["status"] == "succeeded" and job["result"]["candidate_id"] == ok.json()["candidate_id"]
    assert ok.json()["review_status"] == "proposed"

    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: Fake("not json at all"))
    bad = client.post(f"/api/investigations/{inv}/assistant/presentation-draft", json=body)
    assert bad.status_code == 502 and bad.json()["detail"]["rejection_reason"] == "not_json"
    failed = client.get("/api/jobs", params={"investigation_id": inv, "status": "failed"}).json()
    assert failed[0]["kind"] == "ai_reasoning" and failed[0]["result"]["status_code"] == 502
    governor.reset()


def test_stop_reading_stops_at_the_next_page_and_leaves_nothing_half_read(client, tmp_path):
    import fitz

    from app.jobs.handlers import HANDLERS, STOPPED_READ
    from app.jobs.records import request_stop
    from app.models.domain import Document, Source

    inv = _investigation(client)
    path = tmp_path / "long.pdf"
    pdf = fitz.open()
    for n in range(3):
        pdf.new_page().insert_text((72, 72), f"Page {n + 1} of a long filing, with enough words to be read as text.")
    pdf.save(path); pdf.close()
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Filing", source_type="document")
        db.add(src); db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="long.pdf", sha256="cd" * 32, storage_path=str(path), extraction_status="pending")
        db.add(doc); db.commit()
        job = create_job(db, kind="extract_document", investigation_id=inv, subject_type="document", subject_id=doc.id)
        doc_id, job_id = doc.id, job.id
        # A queued job is cancelled outright; only a running one is asked to stop.
        with pytest.raises(ValueError):
            request_stop(db, job)

    real = HANDLERS["extract_document"]

    def stop_then_read(db, job, report):
        request_stop(db, db.get(BackgroundJob, job.id))  # as if the person pressed Stop reading as it started
        return real(db, job, report)

    assert execute_job(SessionLocal, job_id, {**HANDLERS, "extract_document": stop_then_read}) == "cancelled"
    with SessionLocal() as db:
        stopped = db.get(BackgroundJob, job_id)
        assert stopped.message == "Stopped by you" and "stop_requested" not in (stopped.payload or {})
        document = db.get(Document, doc_id)
        assert (document.extraction_status, document.extraction_error) == ("failed", STOPPED_READ)
        assert db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id).count() == 0
    # Read again, it starts over and finishes.
    assert client.post(f"/api/jobs/{job_id}/retry").json()["status"] == "succeeded"
    with SessionLocal() as db:
        assert db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id).count() == 3


def test_a_read_says_what_it_has_found_so_far(client, tmp_path):
    """Case home's Bring in (mockup HOME_1): "page 2 of 2 · 2 names and 1 claim found so far", counted from the
    pages read with the proposals' own rules, before the proposals are made at the end of the read."""
    import fitz

    from app.core.config import settings
    from app.jobs.handlers import HANDLERS
    from app.models.domain import Document, ExtractionCandidate, Source

    inv = _investigation(client)
    path = tmp_path / "minutes.pdf"
    pdf = fitz.open()
    pdf.new_page().insert_text((72, 72), "Minutes of the board of Fernhill Holdings.")
    pdf.new_page().insert_text((72, 72), "Marlow Shipping paid the harbour authority in March.")
    pdf.save(path); pdf.close()
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Minutes", source_type="document")
        db.add(src); db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="minutes.pdf", sha256="ef" * 32, storage_path=str(path), extraction_status="pending")
        db.add(doc); db.commit()
        job = create_job(db, kind="extract_document", investigation_id=inv, subject_type="document", subject_id=doc.id)
        doc_id, job_id = doc.id, job.id
    said: list[str] = []
    real = HANDLERS["extract_document"]

    def listening(db, job, report):
        def tell(progress, message):
            said.append(message)
            return report(progress, message)
        return real(db, job, tell)

    old = settings.enable_local_entity_suggestions
    settings.enable_local_entity_suggestions = True
    try:
        assert execute_job(SessionLocal, job_id, {**HANDLERS, "extract_document": listening}) == "succeeded"
    finally:
        settings.enable_local_entity_suggestions = old
    assert "Reading · page 1 of 2 · 1 name found so far" in said, said
    assert "Reading · page 2 of 2 · 2 names and 1 claim found so far" in said, said
    with SessionLocal() as db:
        made = {t: db.query(ExtractionCandidate).filter_by(document_id=doc_id, candidate_type=t).count() for t in ("entity", "claim")}
    assert made == {"entity": 2, "claim": 1}  # what the read said it found is what it proposed
