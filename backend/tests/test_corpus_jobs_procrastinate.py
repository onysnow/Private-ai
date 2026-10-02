"""Corpus pushes on Procrastinate (ADR-0006, Wave B), on PostgreSQL only.

Changes queue one push per investigation (queueing lock); "Sync now" jumps
ahead of it with a lock of its own and runs on the worker inside the API
process. OpenAleph is the fake from tests/openaleph_corpus_fake.py.
"""

from __future__ import annotations

import os
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

import app.main as main_module
from app.core.config import Settings
from app.core.config import settings as app_settings
from app.jobs import corpus as corpus_jobs
from tests.openaleph_corpus_fake import BASE_URL, FakeOpenAleph

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL", "")
pytestmark = pytest.mark.skipif(not POSTGRES_URL.startswith("postgresql"), reason="needs POSTGRES_TEST_URL")


def _queue_rows(engine, investigation_id: str) -> list[tuple[str, str, int, bool]]:
    with engine.connect() as connection:
        rows = connection.execute(text(
            "SELECT status, queueing_lock, priority, scheduled_at > now() FROM procrastinate.procrastinate_jobs "
            "WHERE task_name = 'workbench.corpus_push' AND args->>'investigation_id' = :inv ORDER BY id"
        ), {"inv": investigation_id}).all()
    return [(str(r[0]), str(r[1]), int(r[2]), bool(r[3])) for r in rows]


def test_changes_queue_one_push_and_sync_now_runs_at_once(tmp_path, monkeypatch):
    fake = FakeOpenAleph()
    monkeypatch.setattr(app_settings, "openaleph_enabled", True)
    monkeypatch.setattr(app_settings, "openaleph_base_url", BASE_URL)
    monkeypatch.setattr(app_settings, "openaleph_api_key", "test-key")
    monkeypatch.setattr(app_settings, "openaleph_corpus_push_delay_seconds", 3600.0)  # stays queued
    monkeypatch.setattr(corpus_jobs, "gateway_factory", fake.gateway)
    settings = Settings(job_runner="procrastinate", database_url=POSTGRES_URL, frontend_dist_dir=str(tmp_path / "none"))
    app = main_module.create_app(settings, database_url=POSTGRES_URL)
    engine = create_engine(POSTGRES_URL)
    try:
        with TestClient(app) as client:
            inv = client.post("/api/investigations", json={"name": "Queued corpus"}).json()["id"]
            for caption in ("Jane Doe", "Meridian Holdings Ltd"):
                reply = client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": caption})
                assert reply.status_code == 200, reply.text
            lock = f"workbench.corpus_push:{inv}"
            assert _queue_rows(engine, inv) == [("todo", lock, 0, True)]
            line = client.get(f"/api/investigations/{inv}/corpus/sync").json()
            assert line["background"] is True and line["pending"]["to_send"] == 2

            body = client.post(f"/api/investigations/{inv}/corpus/sync").json()
            assert (body["queued"], body["ran"]) == (True, False)
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                line = client.get(f"/api/investigations/{inv}/corpus/sync").json()
                if line["push"]["status"] == "succeeded":
                    break
                time.sleep(0.2)
            assert line["push"]["status"] == "succeeded", line
            assert line["pushed_records"] == 2 and line["pending"]["to_send"] == 0
            assert sum(len(batch) for batch in fake.bulk_batches) == 2
            rows = _queue_rows(engine, inv)
            assert ("succeeded", f"{lock}:now", 1, False) in rows and ("todo", lock, 0, True) in rows
    finally:
        with engine.begin() as connection:
            # Procrastinate's delete trigger names its tables without a schema.
            connection.execute(text("SET LOCAL search_path TO procrastinate, public"))
            connection.execute(text("DELETE FROM procrastinate_jobs WHERE task_name LIKE 'workbench.corpus%' AND status = 'todo'"))
        engine.dispose()
