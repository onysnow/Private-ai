"""Tests for the presentation_draft reasoning module: the "evidence + goal
-> brief/deck" workflow (Ony's presentation-generator request). Mirrors
test_reasoning_endpoints.py's pattern (fake LLMClient, no network/API key)
but exercises the record_refs/build_selected_record_context path instead of
a free-text question, and the app-local (non-TAS) prompt-framing branch.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.core.config import settings
import app.ai.reasoning as reasoning_module
from app.ai.governor import governor


class _FakeLLMClient:
    def __init__(self, response_text: str):
        self._response_text = response_text
        self.calls = 0

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> str:
        self.calls += 1
        return self._response_text


@pytest.fixture(autouse=True)
def _restore_ai_settings():
    original = (settings.enable_ai_features, settings.ai_provider, settings.ai_runs_per_minute, settings.ai_max_concurrent_runs)
    governor.reset()
    yield
    settings.enable_ai_features, settings.ai_provider, settings.ai_runs_per_minute, settings.ai_max_concurrent_runs = original
    governor.reset()


def _seeded_investigation(client: TestClient) -> dict:
    inv = client.post("/api/investigations", json={"name": "Presentation draft tests"}).json()
    claim = client.post("/api/claims", json={"investigation_id": inv["id"], "text": "Meridian paid Bellcastle a consulting fee in November 2023."}).json()
    source = client.post("/api/sources", json={"investigation_id": inv["id"], "title": "Wire transfer log", "source_type": "filing", "url": "https://example.test/wire-log"}).json()
    evidence = client.post("/api/evidence", json={"source_id": source["id"], "quote": "$2.4M wired to Bellcastle Holdings on 2023-11-14.", "locator": "row 41"}).json()
    return {"investigation": inv, "claim": claim, "evidence": evidence}


def _draft_response(claim_id: str, evidence_id: str) -> str:
    return json.dumps({
        "title": "The Bellcastle consulting fee",
        "goal_restated": "Summarize what the selected evidence shows about the Bellcastle payment.",
        "executive_takeaway": "Meridian paid Bellcastle $2.4M in November 2023, consistent with the wire log.",
        "sections": [{
            "heading": "The payment",
            "body": "Meridian paid Bellcastle Holdings a $2.4M consulting fee in November 2023.",
            "key_points": [
                {"text": "$2.4M paid to Bellcastle", "evidence": [{"record_type": "evidence", "record_id": evidence_id, "quote": "$2.4M wired to Bellcastle Holdings"}]},
                {"text": "Dated November 2023", "evidence": [{"record_type": "claim", "record_id": claim_id, "quote": "consulting fee in  November 2023"}]},
            ],
            "evidence": [
                {"record_type": "claim", "record_id": claim_id, "quote": "Meridian paid Bellcastle a consulting fee"},
                {"record_type": "evidence", "record_id": evidence_id, "quote": "$2.4M wired to Bellcastle"},
            ],
        }],
        "open_questions": ["Whether the fee was disclosed to the board."],
    })


def test_presentation_draft_disabled_returns_4xx_with_no_llm_call(monkeypatch):
    settings.enable_ai_features = False
    settings.ai_provider = ""
    called = {"n": 0}
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: called.__setitem__("n", called["n"] + 1))
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/presentation-draft",
        json={"goal": "Summarize the payment.", "record_refs": [{"record_type": "claim", "record_id": seeded["claim"]["id"]}]},
    )
    assert 400 <= r.status_code < 500, r.text
    assert called["n"] == 0


def test_presentation_draft_requires_at_least_one_record_ref():
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/presentation-draft",
        json={"goal": "Summarize the payment.", "record_refs": []},
    )
    # Enforced by the Pydantic schema itself (RecordRef min_length=1) before
    # run_reasoning_module ever sees the request.
    assert r.status_code == 422, r.text


def test_presentation_draft_unknown_record_is_a_404_not_a_500(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient("{}"))
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/presentation-draft",
        json={"goal": "Summarize the payment.", "record_refs": [{"record_type": "claim", "record_id": "does-not-exist"}]},
    )
    assert r.status_code == 404, r.text


def test_presentation_draft_rejects_invented_citation(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    bad_response = _draft_response(seeded["claim"]["id"], "INVENTED-NOT-REAL")
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(bad_response))

    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/presentation-draft",
        json={"goal": "Summarize the payment.", "record_refs": [{"record_type": "claim", "record_id": seeded["claim"]["id"]}]},
    )
    assert r.status_code == 422, r.text
    assert "INVENTED-NOT-REAL" in r.text

    with SessionLocal() as db:
        from app.models.domain import AIAnalysisCandidate
        rows = db.query(AIAnalysisCandidate).filter_by(investigation_id=seeded["investigation"]["id"]).all()
        assert len(rows) == 1
        assert rows[0].review_status == "rejected"


def test_presentation_draft_valid_response_is_proposed_and_cites_only_selected_evidence(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    claim_id, evidence_id = seeded["claim"]["id"], seeded["evidence"]["id"]
    fake = _FakeLLMClient(_draft_response(claim_id, evidence_id))
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: fake)

    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/presentation-draft",
        json={
            "goal": "Summarize what the selected evidence shows about the Bellcastle payment.",
            "record_refs": [
                {"record_type": "claim", "record_id": claim_id},
                {"record_type": "evidence", "record_id": evidence_id},
            ],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["review_status"] == "proposed"
    assert body["payload"]["title"] == "The Bellcastle consulting fee"
    assert fake.calls == 1

    with SessionLocal() as db:
        from app.models.domain import AIAnalysisCandidate
        row = db.get(AIAnalysisCandidate, body["candidate_id"])
        assert row.module == "presentation_draft"
        assert {"record_type": "claim", "record_id": claim_id} in row.checked_citation_ids
        assert {"record_type": "evidence", "record_id": evidence_id} in row.checked_citation_ids
        # Exactly the two selected records -- nothing pulled in from elsewhere
        # in the investigation the way a free-text search packet could.
        assert len(row.checked_citation_ids) == 2


def test_presentation_draft_prompt_is_not_framed_as_tas_and_ignores_control_flags(monkeypatch):
    """Architectural boundary: this module is app-local, not vendored TAS
    content (see app/ai/presentation_modules/PRESENTATION_DRAFT.md), so its
    system prompt must not claim TAS framing or mention CONTROL_SURFACE."""
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    claim_id = seeded["claim"]["id"]
    fake = _FakeLLMClient(_draft_response(claim_id, seeded["evidence"]["id"]))
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: fake)
    captured: dict = {}
    original_build = reasoning_module.build_system_prompt

    def _spy(module, contract, flags=None, *rest):
        prompt = original_build(module, contract, flags, *rest)
        captured["prompt"] = prompt
        return prompt

    monkeypatch.setattr(reasoning_module, "build_system_prompt", _spy)

    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/presentation-draft",
        json={
            "goal": "Summarize the payment.",
            "record_refs": [
                {"record_type": "claim", "record_id": claim_id},
                {"record_type": "evidence", "record_id": seeded["evidence"]["id"]},
            ],
        },
    )
    assert r.status_code == 200, r.text
    assert "Topic Authority System" not in captured["prompt"]
    # The module's own text is allowed to mention CONTROL_SURFACE descriptively
    # (PRESENTATION_DRAFT.md explains it is NOT governed by those flags), but
    # the actual SESSION FLAGS block that TAS modules get must be absent.
    assert "SESSION FLAGS" not in captured["prompt"]
    assert "severity_floor =" not in captured["prompt"]


def test_control_flags_rejected_for_presentation_draft(monkeypatch):
    """CONTROL_SURFACE is a TAS CORE concept; presentation_draft never
    claims to be TAS content, so a caller passing control_flags for it is
    a usage error, not a silently-ignored no-op."""
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    with pytest.raises(reasoning_module.ReasoningInputError):
        with SessionLocal() as db:
            reasoning_module.run_reasoning_module(
                db, investigation_id="whatever", module="presentation_draft", question="goal",
                record_refs=[{"record_type": "claim", "record_id": "x"}],
                control_flags={"severity_floor": "ALL"},
            )
