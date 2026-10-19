"""The corpus jobs' view of OpenAleph (app/services/openaleph_gateway.py):
the client it builds, and how each reply OpenAleph can give is read, against
the fake in tests/openaleph_corpus_fake.py."""

from __future__ import annotations

import time
from typing import Any

import httpx
import pytest
from openaleph_client.errors import AlephException

from app.core.config import settings
from app.jobs import corpus as corpus_jobs
from app.services import openaleph_corpus
from app.services.openaleph_gateway import CorpusGateway, OpenAlephNotFound, active_tasks, corpus_client
from tests.openaleph_corpus_fake import BASE_URL, FakeOpenAleph


@pytest.fixture()
def fake(monkeypatch):
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    monkeypatch.setattr(settings, "openaleph_base_url", BASE_URL)
    monkeypatch.setattr(settings, "openaleph_api_key", "test-key")
    server = FakeOpenAleph()
    server.add_collection("1", "fake-ns-1", "Harbour contracts")
    return server


def test_the_client_tries_twice_and_authenticates_as_configured(monkeypatch):
    monkeypatch.setattr(settings, "openaleph_base_url", BASE_URL)
    monkeypatch.setattr(settings, "openaleph_api_key", "secret")
    keyed = corpus_client()
    assert keyed.retries == 2 and keyed.session.headers["Authorization"] == "ApiKey secret"
    # No key: the single-user session token OpenAleph hands out (GET /api/2/metadata).
    monkeypatch.setattr(settings, "openaleph_api_key", "")
    monkeypatch.setattr(openaleph_corpus, "_single_user_tokens", {BASE_URL: ("single-user", time.monotonic())})
    assert corpus_client().session.headers["Authorization"] == "Token single-user"
    # The job runner's default gateway builds that client only when it first talks to OpenAleph.
    gateway = corpus_jobs._new_gateway()
    assert isinstance(gateway, CorpusGateway) and gateway._client is None


def test_errors_other_than_not_found_are_raised(fake):
    gateway = fake.gateway()
    with pytest.raises(OpenAlephNotFound):
        gateway.get_collection("40")
    fake.fail[("GET", "/api/2/collections/1")] = 500
    with pytest.raises(AlephException):
        gateway.get_collection("1")
    fake.fail = {("DELETE", "/api/2/entities/"): 500}
    fake.index["1"]["e.sig"] = {"id": "e.sig", "schema": "Person", "properties": {}}
    with pytest.raises(AlephException):
        gateway.delete_entity("e.sig")
    fake.fail = {}
    assert gateway.delete_entity("e.sig") is True and gateway.delete_entity("e.sig") is False


def test_cross_referencing_replies(fake):
    gateway = fake.gateway()
    with pytest.raises(OpenAlephNotFound):
        gateway.start_cross_reference("40")
    with pytest.raises(OpenAlephNotFound):
        gateway.cross_reference_results("40")
    fake.fail[("POST", "/api/2/collections/1/xref")] = 503
    with pytest.raises(httpx.HTTPStatusError):
        gateway.start_cross_reference("1")
    # Results come in pages until OpenAleph says there is no next one; a
    # malformed row is passed over.
    rows_with_junk: list[Any] = [{"id": f"x{n}", "score": 0.9} for n in range(450)]
    rows_with_junk.append("not a match row")
    fake.xref_rows["1"] = rows_with_junk
    rows = gateway.cross_reference_results("1")
    assert [row["id"] for row in rows] == [f"x{n}" for n in range(450)]
    assert [call for call in fake.calls if call == ("GET", "/api/2/collections/1/xref")] == [("GET", "/api/2/collections/1/xref")] * 3
    assert gateway.cross_reference_running("1") is False
    fake.xref_running = True
    assert gateway.cross_reference_running("1") is True and gateway.index_busy("1") is False


def test_pairwise_judgements(fake):
    gateway = fake.gateway()
    fake.index["1"]["e.sig"] = {"id": "e.sig", "schema": "Company", "properties": {}}
    assert gateway.decide_pairwise("e.sig", "m.sig", "positive") == "profile-1"
    with pytest.raises(ValueError):
        gateway.decide_pairwise("e.sig", "m.sig", "maybe")
    with pytest.raises(OpenAlephNotFound):
        gateway.decide_pairwise("gone.sig", "m.sig", "negative")
    assert fake.pairwise == [{"entity_id": "e.sig", "match_id": "m.sig", "judgement": "positive"}]


def test_active_tasks_reads_openaleph_queue_status():
    assert active_tasks(None) == {} and active_tasks({"todo": 0, "batches": []}) == {}
    status = {"batches": [{"queues": [{"tasks": [
        {"name": "aleph.procrastinate.tasks.index_entities", "todo": 2, "doing": 1},
        {"name": "aleph.procrastinate.tasks.xref_collection", "todo": 0, "doing": 0},
        {"name": "", "todo": 5},
    ]}]}, {"queues": [{"tasks": [{"name": "aleph.procrastinate.tasks.index_entities", "doing": 1}]}]}]}
    assert active_tasks(status) == {"aleph.procrastinate.tasks.index_entities": 4}
