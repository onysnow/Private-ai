"""Safety & data (app/services/safety_data.py, ADR-0015): the outbound log written by the code that sends, and the
page that reads it back with the case's own numbers."""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from app.connectors.base import Connector, ExternalFinding
from app.connectors.registry import registry
from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import OutboundRequest
from app.services.exports import build_investigation_export, inspect_export

client = TestClient(app)


class Sanctions(Connector):
    async def search(self, query: str):
        return [
            ExternalFinding(
                provider="opensanctions",
                record_id="os-1",
                caption="M. Ross",
                schema="Person",
                properties={},
                url="https://x.example/1",
                raw={},
            )
        ]

    def enrich_sent(self, entity: dict) -> str:
        return "M. Ross · 14 Quay Street"


class Broken(Connector):
    async def search(self, query: str):
        raise RuntimeError("down")


def setup_module():
    registry.register("opensanctions", Sanctions())
    registry.register("firecrawl", Broken())


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _inv(name: str) -> str:
    return ok(client.post("/api/investigations", json={"name": name}))["id"]


def test_a_search_and_a_lookup_are_logged_word_for_word_and_a_failure_says_so():
    inv = _inv("Safety log")
    client.post(
        "/api/connectors/opensanctions/search",
        json={"investigation_id": inv, "query": "Harbour Nominees Ltd"},
    )
    entity = ok(
        client.post(
            "/api/entities",
            json={
                "investigation_id": inv,
                "schema": "Person",
                "caption": "M. Ross",
                "properties": {"name": ["M. Ross"]},
            },
        )
    )
    ok(client.post(f"/api/entities/{entity['id']}/enrich/opensanctions"))
    assert (
        client.post(
            "/api/connectors/firecrawl/search",
            json={"investigation_id": inv, "query": "Kestrel SA"},
        ).status_code
        == 502
    )

    page = ok(
        client.get(f"/api/investigations/{inv}/safety-data", params={"period": "all"})
    )
    sent = {(r["service"], r["value"], r["outcome"]) for r in page["outbound"]}
    assert ("opensanctions", "Harbour Nominees Ltd", "sent") in sent
    assert ("opensanctions", "M. Ross · 14 Quay Street", "sent") in sent
    assert ("firecrawl", "Kestrel SA", "failed") in sent
    assert (
        page["totals"]["requests_left"] == 3 and page["totals"]["services_reached"] == 2
    )
    assert (
        page["totals"]["documents_sent_out"] == 0
        and page["totals"]["ai_calls_outside"] == 0
    )
    assert "3 items to 2 services" in page["exposure"]


def test_the_period_and_the_case_limit_what_is_counted():
    inv, other = _inv("Period"), _inv("Another case")
    with SessionLocal() as db:
        old = utcnow_naive() - timedelta(days=40)
        db.add(
            OutboundRequest(
                investigation_id=inv,
                at=old,
                service="opensanctions",
                kind="search text",
                value="old name",
            )
        )
        db.add(
            OutboundRequest(
                investigation_id=inv,
                service="opensanctions",
                kind="search text",
                value="new name",
            )
        )
        db.add(
            OutboundRequest(
                investigation_id=other,
                service="aleph",
                kind="search text",
                value="not this case",
            )
        )
        db.add(
            OutboundRequest(
                investigation_id=inv,
                service="ai:ollama",
                kind="case text",
                value="3 records",
                leaves_computer=False,
            )
        )
        db.commit()
    week = ok(
        client.get(f"/api/investigations/{inv}/safety-data", params={"period": "7d"})
    )
    assert [r["value"] for r in week["outbound"]] == ["3 records", "new name"]
    assert (
        week["totals"]["requests_left"] == 1
    ), "a model on this computer is not a request that left"
    assert (
        ok(
            client.get(
                f"/api/investigations/{inv}/safety-data", params={"period": "all"}
            )
        )["totals"]["requests_left"]
        == 2
    )
    assert (
        ok(client.get(f"/api/investigations/{other}/safety-data"))["outbound"][0][
            "value"
        ]
        == "not this case"
    )


def test_the_stores_and_services_come_from_the_case_and_nothing_is_invented():
    inv = _inv("Stores")
    ok(
        client.post(
            "/api/entities",
            json={
                "investigation_id": inv,
                "schema": "Company",
                "caption": "Acme",
                "properties": {"name": ["Acme"]},
            },
        )
    )
    page = ok(client.get(f"/api/investigations/{inv}/safety-data"))
    stores = {s["id"]: s for s in page["stores"]}
    assert set(stores) == {"records", "documents", "backups", "keys", "log", "ai"}
    assert stores["records"]["count"] >= 1 and stores["documents"]["count"] == 0
    assert (
        stores["backups"]["warning"]
        and page["backup"]["last_backup_at"] is None
        and page["backup"]["encrypted"] is False
    )
    assert {s["id"] for s in page["services"]} >= {
        "aleph",
        "opensanctions",
        "firecrawl",
        "openaleph",
        "ai",
    }
    assert client.get("/api/investigations/nope/safety-data").status_code == 404


def test_the_log_travels_with_a_backup():
    inv = _inv("Backup carries the log")
    client.post(
        "/api/connectors/opensanctions/search",
        json={"investigation_id": inv, "query": "Quay Holdings"},
    )
    with SessionLocal() as db:
        payload, _manifest = build_investigation_export(
            db, inv, include_documents=False
        )
    _manifest, records = inspect_export(payload)
    assert [r["value"] for r in records["outbound_requests"]] == ["Quay Holdings"]


class _FakeModel:
    model = "fake-1"

    def generate(
        self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096
    ) -> str:
        return "not json"


def _ask_the_ai(monkeypatch, provider: str, model: str = "") -> str:
    import app.ai.reasoning as reasoning
    from app.ai.governor import governor
    from app.core.config import settings

    monkeypatch.setattr(settings, "enable_ai_features", True)
    monkeypatch.setattr(settings, "ai_provider", provider)
    monkeypatch.setattr(settings, "ollama_model", model)
    monkeypatch.setattr(reasoning, "get_llm_client", lambda *a, **k: _FakeModel())
    governor.reset()
    inv = _inv(f"AI {provider}")
    client.post(
        f"/api/investigations/{inv}/assistant/case-synthesis",
        json={"question": "Who signed?"},
    )
    return inv


def test_a_model_call_is_logged_and_only_an_outside_model_counts_as_leaving(
    monkeypatch,
):
    outside = ok(
        client.get(
            f"/api/investigations/{_ask_the_ai(monkeypatch, 'anthropic')}/safety-data"
        )
    )
    assert (
        outside["totals"]["ai_calls_outside"] == 1
        and outside["totals"]["requests_left"] == 1
    )
    row = outside["outbound"][0]
    assert (
        row["service"] == "ai:anthropic"
        and row["leaves_computer"] is True
        and "characters" in row["value"]
    )

    here = ok(
        client.get(
            f"/api/investigations/{_ask_the_ai(monkeypatch, 'ollama', 'llama3')}/safety-data"
        )
    )
    assert (
        here["totals"]["ai_calls_outside"] == 0 and here["totals"]["requests_left"] == 0
    )
    assert here["outbound"][0]["leaves_computer"] is False


def test_the_last_backup_and_refusals_are_read_from_the_security_log(
    tmp_path, monkeypatch
):
    import json
    from datetime import datetime, timezone

    from app.core.config import settings

    inv = _inv("From the log")
    now = datetime.now(timezone.utc)
    lines = [
        {
            "timestamp": (now - timedelta(days=3)).isoformat(),
            "event": "api_request",
            "method": "GET",
            "status_code": 200,
            "path": f"/api/investigations/{inv}/export",
        },
        {
            "timestamp": (now - timedelta(hours=2)).isoformat(),
            "event": "access_denied",
            "method": "GET",
            "status_code": 403,
            "path": "/api/x",
        },
        {
            "timestamp": (now - timedelta(days=9)).isoformat(),
            "event": "access_denied",
            "method": "GET",
            "status_code": 403,
            "path": "/api/x",
        },
    ]
    log = tmp_path / "security.jsonl"
    log.write_text(
        "\n".join(
            json.dumps(
                {"request_id": str(i), "client_host": "", "local_request": True, **line}
            )
            for i, line in enumerate(lines)
        )
    )
    monkeypatch.setattr(settings, "audit_log_file", str(log))
    page = ok(client.get(f"/api/investigations/{inv}/safety-data"))
    assert page["backup"]["last_backup_at"] is not None
    assert page["access"]["refused_24h"] == 1
    assert next(s for s in page["stores"] if s["id"] == "log")["count"] == 3


class _NeedsKey(Connector):
    requires_key = True
    configured = False

    async def search(self, query: str):
        raise RuntimeError("no key")


def test_a_search_the_app_stops_for_want_of_a_key_is_blocked_not_counted_as_sent():
    registry.register("opensanctions", _NeedsKey())
    try:
        inv = _inv("No key")
        assert (
            client.post(
                "/api/connectors/opensanctions/search",
                json={"investigation_id": inv, "query": "Quay"},
            ).status_code
            == 502
        )
        page = ok(
            client.get(
                f"/api/investigations/{inv}/safety-data", params={"period": "all"}
            )
        )
        assert [(r["outcome"], r["value"]) for r in page["outbound"]] == [
            ("blocked", "Quay")
        ]
        assert (
            page["totals"]["requests_left"] == 0
            and page["totals"]["services_reached"] == 0
        )
        state = {s["id"]: s for s in page["services"]}
        assert (
            state["opensanctions"]["state"] == "off"
        ), "a key-requiring service without a key can send nothing"
        assert (
            state["firecrawl"]["state"] == "ask_first"
        ), "a service that works without a key is not off for want of one"
    finally:
        registry.register("opensanctions", Sanctions())


def test_a_failed_model_call_is_marked_failed_and_history_does_not_depend_on_the_current_setting(
    monkeypatch,
):
    import app.ai.reasoning as reasoning
    from app.core.config import settings

    class Down(_FakeModel):
        def generate(self, *a, **k):
            raise RuntimeError("timeout")

    inv = _ask_the_ai(monkeypatch, "anthropic")
    monkeypatch.setattr(reasoning, "get_llm_client", lambda *a, **k: Down())
    from app.ai.governor import governor

    governor.reset()
    client.post(
        f"/api/investigations/{inv}/assistant/case-synthesis",
        json={"question": "Again?"},
    )
    monkeypatch.setattr(settings, "ai_provider", "ollama")
    monkeypatch.setattr(settings, "ollama_model", "llama3")
    page = ok(client.get(f"/api/investigations/{inv}/safety-data"))
    assert sorted(r["outcome"] for r in page["outbound"]) == ["failed", "sent"]
    ai = next(s for s in page["services"] if s["id"] == "ai")
    assert ai["sent_count"] == 2 and ai["sends"] == [
        "case text"
    ], "outside calls stay on the screen after switching to a local model"


def test_every_logged_row_is_returned_and_the_prompt_text_is_not_cut():
    inv = _inv("Many")
    long = "x" * 6000
    with SessionLocal() as db:
        for i in range(520):
            db.add(
                OutboundRequest(
                    investigation_id=inv,
                    service="aleph",
                    kind="search text",
                    value=long if i == 0 else f"n{i}",
                )
            )
        db.commit()
    page = ok(
        client.get(f"/api/investigations/{inv}/safety-data", params={"period": "all"})
    )
    assert len(page["outbound"]) == page["outbound_total"] == 520
    assert any(len(r["value"]) == 6000 for r in page["outbound"])


def test_persisted_users_make_the_case_reachable_beyond_this_computer():
    import uuid

    from app.models.domain import AppUser

    inv = _inv("Users")
    assert (
        ok(client.get(f"/api/investigations/{inv}/safety-data"))["access"]["mode"]
        == "local_only"
    )
    with SessionLocal() as db:
        db.add(
            AppUser(
                display_name="Reporter",
                global_role="member",
                token_digest=uuid.uuid4().hex * 2,
            )
        )
        db.commit()
    try:
        assert (
            ok(client.get(f"/api/investigations/{inv}/safety-data"))["access"]["mode"]
            == "remote"
        )
    finally:
        with SessionLocal() as db:
            for u in db.query(AppUser).filter_by(display_name="Reporter"):
                db.delete(u)
            db.commit()


def test_a_sealed_backup_shows_as_encrypted():
    """The last backup's own event says whether it was sealed (ADR-0016); the card and the Backups store follow it."""
    from app.models.domain import BackupEvent

    inv = _inv("Sealed backups")
    with SessionLocal() as db:
        db.add(BackupEvent(investigation_id=inv, size_bytes=10, sha256="0" * 64, encrypted=False, at=utcnow_naive() - timedelta(days=1)))
        db.commit()
    data = client.get(f"/api/investigations/{inv}/safety-data").json()
    assert data["backup"]["encrypted"] is False
    assert next(s for s in data["stores"] if s["id"] == "backups")["warning"] == "Not encrypted: keep it safe"
    with SessionLocal() as db:
        db.add(BackupEvent(investigation_id=inv, size_bytes=10, sha256="1" * 64, encrypted=True))
        db.commit()
    data = client.get(f"/api/investigations/{inv}/safety-data").json()
    assert data["backup"]["encrypted"] is True
    assert next(s for s in data["stores"] if s["id"] == "backups").get("warning") is None


def test_each_outside_source_says_this_cases_lookup_mode_and_the_backup_card_has_its_kept_size_and_checksum():
    import hashlib

    inv = _inv("Modes and backup")
    ok(client.put(f"/api/investigations/{inv}/lookups",
                  json={"modes": {"firecrawl": "automatic", "aleph": "off"}, "reason": "a public-records case"}))
    page = ok(client.get(f"/api/investigations/{inv}/safety-data"))
    state = {s["id"]: (s["state"], s["state_note"]) for s in page["services"]}
    assert state["firecrawl"] == ("automatic", "Works without a key: looks each new party up once, on its own")
    assert state["aleph"][0] == "off"
    # Nothing kept yet: no size or checksum is shown.
    assert page["backup"]["bytes"] is None and page["backup"]["sha256"] is None

    reply = client.get(f"/api/investigations/{inv}/export")
    assert reply.status_code == 200, reply.text
    backup = ok(client.get(f"/api/investigations/{inv}/safety-data"))["backup"]
    assert backup["last_backup_at"] and backup["bytes"] == len(reply.content)
    assert backup["sha256"] == hashlib.sha256(reply.content).hexdigest()
