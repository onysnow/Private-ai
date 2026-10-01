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
        time.sleep(2)
        return real(path)

    monkeypatch.setattr(documents, "extract_chunks", slow)
    inv = client.post("/api/investigations", json={"name": "Queue"}).json()["id"]
    started = time.monotonic()
    response = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Memo"},
                           files={"file": ("memo.txt", b"Acme Holdings Inc. announced a program.\n", "text/plain")})
    upload_seconds = time.monotonic() - started
    assert response.status_code == 202, response.text
    body = response.json()
    assert upload_seconds < 1.5, f"upload took {upload_seconds:.2f}s; it should not wait for the read"
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
