"""Background jobs on Procrastinate (the product's PostgreSQL path; ADR-0004).

Runs only against PostgreSQL (POSTGRES_TEST_URL, as run_postgres_gate.py and
CI's PostgreSQL job set it). The upload answers 202 straight away; the
worker inside the API process reads the document; the screen follows the
job at GET /api/jobs/{id}.
"""

from __future__ import annotations

import os
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

import app.main as main_module
from app.core.config import Settings
from app.jobs.queue_schema import ensure_queue_schema, queue_schema_present

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL", "")
pytestmark = pytest.mark.skipif(not POSTGRES_URL.startswith("postgresql"), reason="needs POSTGRES_TEST_URL")


def _wait_for(client: TestClient, job_id: str, timeout: float = 30.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["finished"]:
            return job
        time.sleep(0.1)
    raise AssertionError(f"job {job_id} did not finish in {timeout}s: {job}")


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.api.routes_documents.settings.document_storage_dir", str(tmp_path / "docs"))
    settings = Settings(job_runner="procrastinate", database_url=POSTGRES_URL, frontend_dist_dir=str(tmp_path / "none"))
    app = main_module.create_app(settings, database_url=POSTGRES_URL)
    with TestClient(app) as test_client:
        yield test_client


def test_upload_answers_at_once_and_the_worker_reads_the_document(client, monkeypatch):
    import app.services.documents as documents

    real = documents.extract_chunks

    def slow(path):
        time.sleep(5)
        return real(path)

    monkeypatch.setattr(documents, "extract_chunks", slow)
    inv = client.post("/api/investigations", json={"name": "Queue"}).json()["id"]
    started = time.monotonic()
    response = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Memo"},
                           files={"file": ("memo.txt", b"Acme Holdings Inc. announced a program.\n", "text/plain")})
    upload_seconds = time.monotonic() - started
    assert response.status_code == 202, response.text
    body = response.json()
    # Well under the 5 s read, with room for a slow CI machine.
    assert upload_seconds < 3, f"upload took {upload_seconds:.2f}s; it should not wait for the read"
    assert body["extraction_status"] == "queued" and body["chunk_count"] == 0
    assert body["job"]["runner"] == "procrastinate" and body["job"]["finished"] is False

    health_started = time.monotonic()
    assert client.get("/api/health").json() == {"status": "ok"}
    assert time.monotonic() - health_started < 0.75

    job = _wait_for(client, body["job"]["id"])
    assert job["status"] == "succeeded", job
    document = client.get(f"/api/documents/{body['id']}").json()
    assert document["extraction_status"] == "complete" and len(document["chunks"]) == 1

    engine = create_engine(POSTGRES_URL)
    with engine.connect() as connection:
        queue_job_id = connection.execute(text("SELECT queue_job_id FROM background_jobs WHERE id = :id"), {"id": job["id"]}).scalar()
        status = connection.execute(text("SELECT status FROM procrastinate.procrastinate_jobs WHERE id = :id"), {"id": queue_job_id}).scalar()
    engine.dispose()
    assert status == "succeeded"


def test_failed_read_then_retry_through_the_queue(client, monkeypatch):
    import app.services.documents as documents

    real = documents.extract_chunks
    monkeypatch.setattr(documents, "extract_chunks", lambda path: (_ for _ in ()).throw(RuntimeError("scan unreadable")))
    inv = client.post("/api/investigations", json={"name": "Queue retry"}).json()["id"]
    body = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Scan"},
                       files={"file": ("scan.txt", b"Text that will read on retry.\n", "text/plain")}).json()
    job = _wait_for(client, body["job"]["id"])
    assert job["status"] == "failed" and job["error"] == "scan unreadable"

    monkeypatch.setattr(documents, "extract_chunks", real)
    assert client.post(f"/api/jobs/{job['id']}/retry").status_code == 200
    job = _wait_for(client, job["id"])
    assert job["status"] == "succeeded" and job["attempts"] == 2
    assert client.get(f"/api/documents/{body['id']}").json()["extraction_status"] == "complete"


def test_queue_schema_is_separate_and_restored_if_missing():
    engine = create_engine(POSTGRES_URL)
    try:
        with engine.connect() as connection:
            public_queue_tables = connection.execute(text(
                "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'procrastinate%'"
            )).scalar()
        assert public_queue_tables == 0
        ensure_queue_schema(engine)
        with engine.begin() as connection:
            assert queue_schema_present(connection)
        assert ensure_queue_schema(engine) is False  # already there: nothing to do
    finally:
        engine.dispose()


def test_ai_run_is_queued_and_its_result_is_on_the_job(client, monkeypatch):
    import json as _json

    import app.ai.reasoning as reasoning_module
    from app.ai.governor import governor
    from app.core.config import settings as app_settings

    monkeypatch.setattr(app_settings, "enable_ai_features", True)
    monkeypatch.setattr(app_settings, "ai_provider", "anthropic")
    governor.reset()
    inv = client.post("/api/investigations", json={"name": "Queued AI"}).json()["id"]
    claim = client.post("/api/claims", json={"investigation_id": inv, "text": "Meridian paid Bellcastle a consulting fee in November 2023."}).json()
    ref = {"record_type": "claim", "record_id": claim["id"], "quote": "paid Bellcastle a consulting fee"}
    draft = {"title": "t", "goal_restated": "g", "executive_takeaway": "e", "open_questions": [],
             "sections": [{"heading": "h", "body": "b", "key_points": [{"text": "Paid", "evidence": [ref]}], "evidence": [ref]}]}

    class Slow:
        def generate(self, system_prompt, user_prompt, *, max_tokens=4096):
            time.sleep(1.5)
            return _json.dumps(draft)

    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: Slow())
    started = time.monotonic()
    response = client.post(f"/api/investigations/{inv}/assistant/presentation-draft",
                           json={"goal": "Summarize.", "record_refs": [{"record_type": "claim", "record_id": claim["id"]}]})
    assert response.status_code == 202, response.text
    assert time.monotonic() - started < 1.0, "the request does not wait for the model"
    assert response.json()["candidate_id"] is None
    job = _wait_for(client, response.json()["job"]["id"])
    assert job["status"] == "succeeded", job
    candidate = client.get(f"/api/ai-analysis-candidates/{job['result']['candidate_id']}").json()
    assert candidate["review_status"] == "proposed"
    governor.reset()


def test_the_watchdog_fails_what_a_stopped_process_left_outside_the_queue(client, tmp_path):
    """The app stopped between saving a document and making its job, and
    between making a job and handing it to the queue (app/jobs/recovery.py).
    Once neither has moved for a while, the stalled-job check gives each a
    failed job the reporter can retry; it never touches what is in the queue."""
    from datetime import timedelta

    from sqlalchemy.orm import Session

    from app.core.time import utcnow_naive
    from app.jobs import recovery
    from app.jobs.records import create_job
    from app.models.domain import BackgroundJob, Document
    from app.services.documents import store_document

    inv = client.post("/api/investigations", json={"name": "Stopped mid-upload"}).json()["id"]
    engine = create_engine(POSTGRES_URL)
    try:
        with Session(engine) as db:
            unread = store_document(db, investigation_id=inv, title="Memo", filename="memo.txt", mime_type="text/plain",
                                    data=b"Acme Holdings Inc. announced a program.\n", storage_dir=tmp_path / "docs").id
            never_queued = create_job(db, kind="probe", investigation_id=inv, runner="procrastinate").id
            fresh = create_job(db, kind="probe", investigation_id=inv, runner="procrastinate").id
            old = utcnow_naive() - timedelta(hours=2)
            db.execute(Document.__table__.update().where(Document.id == unread).values(created_at=old))
            db.execute(BackgroundJob.__table__.update().where(BackgroundJob.id == never_queued).values(updated_at=old))
            db.commit()

        client.portal.call(client.app.state.jobs._retry_stalled)

        with Session(engine) as db:
            doc = db.get(Document, unread)
            assert doc.extraction_status == "failed" and doc.extraction_error == recovery.UNREAD_DOCUMENT
            [reading] = db.query(BackgroundJob).filter(BackgroundJob.subject_id == unread).all()
            assert reading.status == "failed" and reading.runner == "procrastinate"
            assert db.get(BackgroundJob, never_queued).error == recovery.NEVER_QUEUED_ERROR
            assert db.get(BackgroundJob, fresh).status == "queued"
            reading_id = reading.id

        assert client.post(f"/api/jobs/{reading_id}/retry").status_code == 200
        job = _wait_for(client, reading_id)
        assert job["status"] == "succeeded", job
        assert client.get(f"/api/documents/{unread}").json()["extraction_status"] == "complete"
    finally:
        engine.dispose()


def test_only_one_recovery_sweep_runs_at_a_time(client, tmp_path):
    """Two API processes sweeping at once would each give an unread document
    a job; the second waits its turn instead (app/jobs/recovery.py)."""
    from datetime import timedelta

    from sqlalchemy.orm import Session

    from app.core.time import utcnow_naive
    from app.jobs import recovery
    from app.models.domain import BackgroundJob, Document
    from app.services.documents import store_document

    inv = client.post("/api/investigations", json={"name": "Two sweeps"}).json()["id"]
    engine = create_engine(POSTGRES_URL)
    try:
        with Session(engine) as db:
            unread = store_document(db, investigation_id=inv, title="Memo", filename="memo.txt", mime_type="text/plain",
                                    data=b"Acme Holdings Inc. announced a program.\n", storage_dir=tmp_path / "docs").id
            db.execute(Document.__table__.update().where(Document.id == unread)
                       .values(created_at=utcnow_naive() - timedelta(hours=2)))
            db.commit()
        sweep = dict(runner="procrastinate", storage_root=None, documents_older_than=timedelta(minutes=10),
                     jobs_older_than=timedelta(hours=1), staged_older_than=timedelta(hours=1))
        with Session(engine) as first, Session(engine) as second:
            first.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": recovery.RECOVERY_LOCK_KEY})
            assert recovery.recover(second, **sweep).documents == 0   # the first holds the sweep
            first.rollback()
            assert recovery.recover(second, **sweep).documents == 1
            assert recovery.recover(second, **sweep).documents == 0   # done once, never again
            assert second.query(BackgroundJob).filter(BackgroundJob.subject_id == unread).count() == 1
    finally:
        engine.dispose()
