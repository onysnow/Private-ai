"""The platform needs (docs/project-notes/PLATFORM_NEEDS_PLAN.md): the log of what leaves the computer, the scheduler,
imports finished and backups made, saved questions and research without approval, notifications outside the app,
key checks without a search, and sources that updated their data."""
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.connectors.base import Connector, ExternalFinding, KeyCheck
from app.connectors.registry import registry
from app.core.config import settings
from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.jobs.schedule import Scheduled, scheduler_tick
from app.main import app
from app.models.domain import (
    BackgroundJob, Document, IngestionBatch, IngestionBatchItem, Investigation, NotificationDelivery, OutboundRequest, PatternFlag,
    SavedQuestion, Source,
)
from app.services import delivery, ingestion_batches, notifications, outbound, preferences, saved_questions, source_freshness

client = TestClient(app)


class _Probe(Connector):
    def __init__(self) -> None:
        self.asked: list[str] = []
        self.key_state = "works"
        self.api_key = "k"
        self.base_url = "https://probe.example.org"

    async def search(self, query: str):
        self.asked.append(query)
        return [ExternalFinding(provider="probe", record_id="r1", caption=f"{query} (found)", schema="Company")]

    async def check_key(self) -> KeyCheck:
        return KeyCheck(self.key_state, "checked")


@pytest.fixture
def probe():
    connector = _Probe()
    registry.register("probe", connector)
    yield connector
    registry._connectors.pop("probe", None)


def _case(name: str = "Kestrel SA") -> str:
    return client.post("/api/investigations", json={"name": name}).json()["id"]


# --- 1. What leaves the computer -------------------------------------------------------------------------------

def test_a_lookup_is_logged_with_what_was_sent(probe):
    inv = _case()
    client.post("/api/connectors/probe/search", json={"investigation_id": inv, "query": "Fernhill Ltd"})
    party = client.post("/api/entities", json={"investigation_id": inv, "schema": "Company", "caption": "Harbour Nominees SA",
                                              "properties": {"name": ["Harbour Nominees SA"]}}).json()
    client.post(f"/api/entities/{party['id']}/enrich/probe")
    with SessionLocal() as db:
        lines = outbound.recent(db)
    assert [(line["kind"], line["sent"], line["destination"], line["case"]) for line in lines] == [
        ("lookup", "Harbour Nominees SA", "https://probe.example.org", "Kestrel SA"),
        ("lookup", "Fernhill Ltd", "https://probe.example.org", "Kestrel SA"),
    ]
    week = client.get("/api/settings/lookups").json()["week"]
    assert week[0]["sent"].startswith("Harbour Nominees SA")


def test_a_failed_lookup_is_logged_and_a_refused_key_says_refused(probe):
    async def refuse(query: str):
        raise RuntimeError("Client error '401 Unauthorized'")
    probe.search = refuse  # type: ignore[method-assign]
    inv = _case()
    assert client.post("/api/connectors/probe/search", json={"investigation_id": inv, "query": "Fernhill"}).status_code == 502
    with SessionLocal() as db:
        assert outbound.recent(db)[0]["outcome"] == "refused"


def test_the_log_keeps_ninety_days():
    with SessionLocal() as db:
        db.add(OutboundRequest(kind="download", service="demo case", destination="example.org", value_sent="x", at=utcnow_naive() - timedelta(days=91)))
        db.add(OutboundRequest(kind="download", service="demo case", destination="example.org", value_sent="y"))
        db.commit()
        assert outbound.prune(db) == 1
        assert [r["sent"] for r in outbound.recent(db, days=365)] == ["y"]


# --- 2. The scheduler ------------------------------------------------------------------------------------------

def test_the_tick_runs_each_task_when_due_and_survives_a_failing_one():
    calls: list[str] = []

    def boom(db):
        calls.append("boom")
        raise RuntimeError("no")

    tasks = [Scheduled("t_every_hour", timedelta(hours=1), lambda db: calls.append("hour")), Scheduled("t_boom", timedelta(hours=1), boom)]
    start = datetime(2026, 10, 19, 8, 0)
    assert scheduler_tick(SessionLocal, tasks, now=start) == ["t_every_hour", "t_boom"]
    assert scheduler_tick(SessionLocal, tasks, now=start + timedelta(minutes=30)) == []
    assert scheduler_tick(SessionLocal, tasks, now=start + timedelta(hours=1)) == ["t_every_hour", "t_boom"]
    assert calls == ["hour", "boom", "hour", "boom"]


# --- 3. Imports finished and backups ---------------------------------------------------------------------------

def _batch_with(db, inv: str, statuses: list[str]) -> IngestionBatch:
    batch = IngestionBatch(investigation_id=inv, label="Board minutes")
    source = Source(investigation_id=inv, title="Board minutes", source_type="document")
    db.add_all([batch, source])
    db.commit()
    for n, status in enumerate(statuses):
        doc = Document(investigation_id=inv, source_id=source.id, filename=f"f{n}.pdf", mime_type="application/pdf", storage_path=f"/x/{n}", sha256=f"{n:064d}")
        db.add(doc)
        db.commit()
        db.add(IngestionBatchItem(batch_id=batch.id, position=n, filename=doc.filename, outcome="saved", document_id=doc.id))
        db.add(BackgroundJob(kind="extract_document", investigation_id=inv, subject_type="document", subject_id=doc.id, status=status, runner="inline"))
        db.commit()
    return batch


def test_an_import_finishes_when_its_last_file_is_read_and_the_inbox_says_so():
    inv = _case()
    with SessionLocal() as db:
        batch = _batch_with(db, inv, ["succeeded", "running"])
        first = db.scalar(__import__("sqlalchemy").select(IngestionBatchItem.document_id).where(IngestionBatchItem.position == 0, IngestionBatchItem.batch_id == batch.id))
        assert ingestion_batches.after_read(db, first) == []
        job = db.scalar(__import__("sqlalchemy").select(BackgroundJob).where(BackgroundJob.status == "running", BackgroundJob.investigation_id == inv))
        job.status = "failed"
        db.commit()
        assert [b.id for b in ingestion_batches.after_read(db, first)] == [batch.id]
    row = next(r for r in client.get(f"/api/investigations/{inv}/inbox").json()["needs"] if r["kind"] == "import")
    assert row["title"] == "2 files read · 1 needs you" and row["reason"] == "Board minutes"


def test_a_changed_case_not_backed_up_is_mentioned_until_a_full_backup():
    inv = _case()
    with SessionLocal() as db:
        db.get(Investigation, inv).created_at = utcnow_naive() - timedelta(days=20)
        db.commit()
    client.post("/api/claims", json={"investigation_id": inv, "text": "Kestrel SA bought the harbour land"})
    row = next(r for r in client.get(f"/api/investigations/{inv}/inbox").json()["else"] if r["kind"] == "backup")
    assert row["title"] == "This case was never backed up" and row["reason"].startswith("1 record added since")

    assert client.get(f"/api/investigations/{inv}/export", params={"include_documents": "false"}).status_code == 200
    assert any(r["kind"] == "backup" for r in client.get(f"/api/investigations/{inv}/inbox").json()["else"])  # records only: not a full backup
    assert client.get(f"/api/investigations/{inv}/export").status_code == 200
    assert not any(r["kind"] == "backup" for r in client.get(f"/api/investigations/{inv}/inbox").json()["else"])

    client.put("/api/settings/notifications", json={"backup_days": 0})
    with SessionLocal() as db:
        assert notifications.backup_due(db, inv, 0, utcnow_naive()) is None
    assert client.put("/api/settings/notifications", json={"backup_days": 3}).status_code == 422


# --- 4. Saved questions and research without approval ------------------------------------------------------------

def test_saved_questions_are_kept_once_and_need_a_theory_to_test_one():
    inv = _case()
    body = {"module": "case_synthesis", "question": "Who controlled Fernhill Ltd?"}
    first = client.post(f"/api/investigations/{inv}/saved-questions", json=body).json()
    assert client.post(f"/api/investigations/{inv}/saved-questions", json=body).json()["id"] == first["id"]
    assert client.post(f"/api/investigations/{inv}/saved-questions", json={"module": "hypothesis_test", "question": "q"}).status_code == 400
    research = client.get(f"/api/investigations/{inv}/research").json()
    assert research["mode"] == "ask" and not research["own"] and [q["question"] for q in research["questions"]] == ["Who controlled Fernhill Ltd?"]
    assert client.delete(f"/api/saved-questions/{first['id']}").status_code == 204


def test_a_case_set_to_without_approval_runs_its_saved_questions_once_per_import(monkeypatch):
    inv = _case()
    assert client.put(f"/api/investigations/{inv}/research", json={"mode": "automatic"}).status_code == 400  # needs a reason
    case = client.put(f"/api/investigations/{inv}/research", json={"mode": "automatic", "reason": "fast-moving story"}).json()
    assert case["mode"] == "automatic" and case["own"] and case["reason"] == "fast-moving story"
    client.post(f"/api/investigations/{inv}/saved-questions", json={"module": "case_synthesis", "question": "Who controlled Fernhill Ltd?"})
    started: list[str] = []
    monkeypatch.setattr(settings, "enable_ai_features", True)
    monkeypatch.setattr(settings, "ai_provider", "ollama")
    monkeypatch.setattr(settings, "ollama_model", "qwen2.5:7b")
    monkeypatch.setattr(saved_questions, "_start", lambda db, job_id: started.append(job_id))
    with SessionLocal() as db:
        batch = _batch_with(db, inv, ["succeeded"])
        assert len(saved_questions.on_import_finished(db, batch)) == 1
        assert saved_questions.on_import_finished(db, batch) == []  # once per import
        job = db.get(BackgroundJob, started[0])
        assert job.kind == "ai_reasoning" and job.payload["question"] == "Who controlled Fernhill Ltd?"
        assert job.payload["started_by"] == "the app, after an import"
        assert db.scalar(__import__("sqlalchemy").select(SavedQuestion)).last_batch_id == batch.id
    client.put(f"/api/investigations/{inv}/research", json={"mode": None})
    assert client.get(f"/api/investigations/{inv}/research").json()["own"] is False


def test_ask_first_is_the_only_mode_that_adds_the_run_again_row(monkeypatch):
    inv = _case()
    client.put(f"/api/investigations/{inv}/research", json={"mode": "off", "reason": "no AI on this case"})
    with SessionLocal() as db:
        assert notifications.research_due(db, inv) is None


# --- 5. Notifications outside the app ------------------------------------------------------------------------------

def test_channels_are_off_until_turned_on_and_say_what_they_need(monkeypatch):
    prefs = client.get("/api/settings/notifications").json()
    assert {c: v["mode"] for c, v in prefs["outside"].items()} == {"email": "off", "phone": "off", "webpush": "off"}
    assert prefs["server"]["email"] is False and prefs["push_devices"] == 0
    res = client.put("/api/settings/notifications/channels/email", json={"mode": "interrupts", "address": "me@example.org"})
    assert res.status_code == 400 and "NOTIFY_MAIL_URL" in res.json()["detail"]
    monkeypatch.setattr(settings, "notify_mail_url", "mailto://user:pw@smtp.example.org")
    assert client.put("/api/settings/notifications/channels/email", json={"mode": "interrupts", "address": "me@example.org"}).status_code == 400
    monkeypatch.setattr(settings, "notify_mail_url", "mailtos://user:pw@smtp.example.org")
    assert client.put("/api/settings/notifications/channels/email", json={"mode": "interrupts", "address": "not an address"}).status_code == 400
    ok = client.put("/api/settings/notifications/channels/email", json={"mode": "daily", "address": "me@example.org"}).json()
    assert ok["outside"]["email"] == {"mode": "daily", "address": "me@example.org", "url": None}
    short = client.put("/api/settings/notifications/channels/phone", json={"mode": "interrupts", "url": "ntfys://ntfy.sh/abc"})
    assert short.status_code == 400 and "long random topic" in short.json()["detail"]
    assert client.put("/api/settings/notifications/channels/phone", json={"mode": "interrupts", "url": "https://ntfy.sh/x"}).status_code == 400
    assert client.put("/api/settings/notifications/channels/phone", json={"mode": "interrupts", "url": "ntfys://ntfy.sh/kestrel-7f3a9c2e5b1d"}).status_code == 200


def test_an_interrupt_goes_out_once_with_the_kind_only_and_is_logged(monkeypatch):
    inv = _case()
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(delivery, "_apprise_send", lambda url, title, body: sent.append((url, body)) or True)
    with SessionLocal() as db:
        db.add(PatternFlag(investigation_id=inv, indicator_id="BO-032", fingerprint="t1", level="textbook", parties=[], links=[], facts={}))
        db.commit()
        delivery.save_channel(db, "local-owner", "phone", mode="interrupts", url="ntfys://ntfy.example.org/kestrel")
        assert delivery.deliver_due(db)["interrupts"] == 1
        assert delivery.deliver_due(db)["interrupts"] == 0  # never twice
        assert db.query(NotificationDelivery).count() == 1
        line = outbound.recent(db)[0]
    assert sent == [("ntfys://ntfy.example.org/kestrel", "A Textbook Red Flag in one of your cases. Open the Workbench to see it.")]
    assert (line["kind"], line["service"], line["destination"]) == ("push", "ntfy", "ntfy.example.org")
    assert "no names" in line["sent"]


def test_the_daily_summary_counts_kinds_and_names_nothing(monkeypatch):
    inv = _case()
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(settings, "notify_mail_url", "mailtos://user:pw@smtp.example.org?from=wb@example.org")
    monkeypatch.setattr(delivery, "_apprise_send", lambda url, title, body: sent.append((url, body)) or True)
    with SessionLocal() as db:
        db.add(PatternFlag(investigation_id=inv, indicator_id="BO-032", fingerprint="s1", level="strong", parties=[], links=[], facts={}))
        db.commit()
        delivery.save_channel(db, "local-owner", "email", mode="daily", address="me@example.org")
        morning = utcnow_naive().replace(hour=9)
        assert delivery.deliver_due(db, now=morning)["summaries"] == 1
        assert delivery.deliver_due(db, now=morning + timedelta(hours=1))["summaries"] == 0
    url, body = sent[0]
    assert url.endswith("&to=me%40example.org")
    assert body == "Waiting for you: 1 × Strong Red Flag. Open the Workbench to see them."


def test_a_push_subscription_is_kept_per_person():
    res = client.post("/api/settings/push-subscriptions", json={"endpoint": "https://web.push.apple.com/abc", "keys": {"p256dh": "k", "auth": "a"}})
    assert res.json()["push_devices"] == 1
    assert client.post("/api/settings/push-subscriptions", json={"endpoint": "http://insecure/abc", "keys": {"p256dh": "k", "auth": "a"}}).status_code == 400
    assert client.post("/api/settings/push-subscriptions/remove", json={"endpoint": "https://web.push.apple.com/abc"}).json()["push_devices"] == 0


# --- 6 and 7. Key checks and sources that updated -----------------------------------------------------------------

def test_a_key_check_sends_no_search_and_is_kept(probe):
    res = client.post("/api/settings/connectors/probe/check").json()
    assert res["state"] == "works" and probe.asked == []
    probe.key_state = "refused"
    client.post("/api/settings/connectors/probe/check")
    source = next(s for s in client.get("/api/settings/lookups").json()["sources"] if s["key"] == "probe")
    assert source["key_check"]["state"] == "refused"
    with SessionLocal() as db:
        lines = outbound.recent(db)
    assert [(r["kind"], r["outcome"], r["sent"]) for r in lines][:2] == [
        ("key_check", "refused", "the key only; no search and no names"), ("key_check", "sent", "the key only; no search and no names")]


def test_a_new_opensanctions_version_is_noted_and_parties_are_looked_up_again(monkeypatch):
    class _OS(_Probe):
        dataset = "default"
        versions = ["20261018", "20261018", "20261019"]

        async def catalog(self, etag=None):
            return 200, {"datasets": [{"name": "default", "version": self.versions.pop(0)}]}, "etag-1"

    os_probe = _OS()
    registry.register("opensanctions", os_probe)
    try:
        inv = _case()
        client.put("/api/settings/lookups", json={"defaults": {"opensanctions": "automatic"}})
        monkeypatch.setattr(source_freshness, "_start", lambda db, job_id: None, raising=False)
        import app.services.saved_questions as sq
        monkeypatch.setattr(sq, "_start", lambda db, job_id: None)
        client.post("/api/entities", json={"investigation_id": inv, "schema": "Company", "caption": "Fernhill Ltd", "properties": {"name": ["Fernhill Ltd"]}})
        with SessionLocal() as db:
            assert source_freshness.check_sources(db) == {"opensanctions": None, "rechecks": 0}  # first sight: nothing to compare
            assert source_freshness.check_sources(db) == {"opensanctions": None, "rechecks": 0}  # same version
            result = source_freshness.check_sources(db)
            assert result == {"opensanctions": "20261019", "rechecks": 1}
            job = db.scalar(__import__("sqlalchemy").select(BackgroundJob).where(BackgroundJob.kind == "outside_lookup",
                                                                                   BackgroundJob.message == "Waiting to look up again"))
            assert job.payload == {"recheck": ["opensanctions"]}
        row = next(r for r in client.get(f"/api/investigations/{inv}/inbox").json()["else"] if r["kind"] == "source")
        assert row["title"] == "OpenSanctions updated its data"
    finally:
        registry.refresh("opensanctions")
