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
