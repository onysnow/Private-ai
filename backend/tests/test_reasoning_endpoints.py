"""Tests for issue #36: the TAS-backed Case Synthesis / Hypothesis Testing
reasoning endpoints. Covers the test list from the issue body: feature-flag
gating, provider gating, citation validation, schema validation, and the
review-queue promotion flow — using a fake LLMClient so these run with no
network access and no real API key.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.db.session import Base, SessionLocal, engine
from app.main import app
from app.core.config import settings
import app.ai.reasoning as reasoning_module


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


class _FakeLLMClient:
    def __init__(self, response_text: str):
        self._response_text = response_text
        self.calls = 0

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> str:
        self.calls += 1
        return self._response_text


@pytest.fixture(autouse=True)
def _restore_ai_settings():
    """AI settings default off; every test controls exactly what it needs
    and this restores the shared singleton afterward so tests can't leak
    state into each other or into unrelated test modules.
    """
    original = (settings.enable_ai_features, settings.ai_provider)
    yield
    settings.enable_ai_features, settings.ai_provider = original


def _seeded_investigation(client: TestClient) -> dict:
    inv = client.post("/api/investigations", json={"name": "Reasoning endpoint tests"}).json()
    source = client.post("/api/sources", json={"investigation_id": inv["id"], "title": "Filing", "source_type": "filing", "url": "https://example.test/filing"}).json()
    evidence = client.post("/api/evidence", json={"source_id": source["id"], "quote": "Ada North signed the agreement.", "locator": "page 3"}).json()
    return {"investigation": inv, "evidence": evidence}


def test_case_synthesis_disabled_returns_4xx_with_no_llm_call(monkeypatch):
    settings.enable_ai_features = False
    settings.ai_provider = ""
    called = {"n": 0}
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: called.__setitem__("n", called["n"] + 1))

    client = TestClient(app)
    seeded = _seeded_investigation(client)
    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/case-synthesis",
        json={"question": "What is Ada North's role?"},
    )
    assert 400 <= r.status_code < 500, r.text
    assert called["n"] == 0, "LLM client must never be constructed when the feature flag is off"


def test_case_synthesis_no_provider_configured_returns_4xx_with_no_llm_call(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = ""
    called = {"n": 0}
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: called.__setitem__("n", called["n"] + 1))

    client = TestClient(app)
    seeded = _seeded_investigation(client)
    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/case-synthesis",
        json={"question": "What is Ada North's role?"},
    )
    assert 400 <= r.status_code < 500, r.text
    assert called["n"] == 0


def test_case_synthesis_rejects_invented_citation(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)

    bad_response = json.dumps({
        "executive_summary": "Ada North signed an agreement.",
        "claims": [{
            "claim_id": "CLM-0001", "claim": "Ada North signed the agreement.",
            "classification": "CORROBORATED_FACT",
            "supporting_evidence": [{"record_type": "evidence", "record_id": "INVENTED-NOT-REAL"}],
            "contradicting_evidence": [], "warrant": "x", "confidence": "HIGH",
            "confidence_basis": "x", "limitations": [],
        }],
        "investigative_gaps": [],
    })
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(bad_response))

    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/case-synthesis",
        json={"question": "What is Ada North's role?"},
    )
    assert r.status_code == 422, r.text
    assert "INVENTED-NOT-REAL" in r.text

    with SessionLocal() as db:
        from app.models.domain import AIAnalysisCandidate
        rows = db.query(AIAnalysisCandidate).filter_by(investigation_id=seeded["investigation"]["id"]).all()
        assert len(rows) == 1
        assert rows[0].review_status == "rejected", "an invented citation must never be persisted as proposed/accepted"


def test_case_synthesis_rejects_malformed_schema(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)

    malformed_response = json.dumps({"executive_summary": "Missing the claims field entirely."})
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(malformed_response))

    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/case-synthesis",
        json={"question": "What is Ada North's role?"},
    )
    assert r.status_code == 422, r.text
    assert "schema" in r.text.lower()


def test_case_synthesis_valid_response_is_proposed_and_reviewable(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    evidence_id = seeded["evidence"]["id"]

    valid_response = json.dumps({
        "executive_summary": "Ada North signed an agreement, per one directly cited filing.",
        "claims": [{
            "claim_id": "CLM-0001", "claim": "Ada North signed the agreement.",
            "classification": "CORROBORATED_FACT",
            "supporting_evidence": [{"record_type": "evidence", "record_id": evidence_id}],
            "contradicting_evidence": [], "warrant": "The filing directly quotes Ada North's signature on the agreement.",
            "confidence": "HIGH", "confidence_basis": "single direct primary source", "limitations": [],
        }],
        "investigative_gaps": ["No independent corroborating source located yet."],
    })
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(valid_response))

    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/case-synthesis",
        json={"question": "What is Ada North's role?"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["review_status"] == "proposed"
    candidate_id = body["candidate_id"]

    with SessionLocal() as db:
        from app.models.domain import AIAnalysisCandidate
        row = db.get(AIAnalysisCandidate, candidate_id)
        assert row.review_status == "proposed"
        assert {"record_type": "evidence", "record_id": evidence_id} in row.checked_citation_ids

    # Retrievable through the existing candidate-review flow, same shape as
    # /extraction-candidates/{id}/review.
    review = client.post(f"/api/ai-analysis-candidates/{candidate_id}/review", json={"decision": "accept", "note": "Looks right."})
    assert review.status_code == 200, review.text
    assert review.json()["review_status"] == "accepted"

    with SessionLocal() as db:
        from app.models.domain import AIAnalysisCandidate
        row = db.get(AIAnalysisCandidate, candidate_id)
        assert row.review_status == "accepted"
        assert row.reviewer_note == "Looks right."


def test_hypothesis_test_requires_working_theory(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient("{}"))
    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/hypothesis-test",
        json={"working_theory": "", "question": "Did Ada North act alone?"},
    )
    assert r.status_code == 422, r.text  # pydantic min_length=1 rejects before reaching the service layer
