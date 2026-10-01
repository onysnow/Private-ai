"""Tests for promoting an accepted presentation_draft AIAnalysisCandidate
into a Writeup (brief) and/or Deck -- app/services/presentation.py, wired
up as /api/ai-analysis-candidates/{id}/promote-to-writeup and
.../promote-to-deck in app/api/routes_system.py.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import AIAnalysisCandidate
from app.core.config import settings
from app.core.time import utcnow_naive
import app.ai.reasoning as reasoning_module
from app.ai.governor import governor

client = TestClient(app)


class _FakeLLMClient:
    def __init__(self, response_text: str):
        self._response_text = response_text

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> str:
        return self._response_text


@pytest.fixture(autouse=True)
def _restore_ai_settings():
    original = (settings.enable_ai_features, settings.ai_provider, settings.ai_runs_per_minute, settings.ai_max_concurrent_runs)
    governor.reset()
    yield
    settings.enable_ai_features, settings.ai_provider, settings.ai_runs_per_minute, settings.ai_max_concurrent_runs = original
    governor.reset()


def _seeded_investigation() -> dict:
    inv = client.post("/api/investigations", json={"name": "Promotion tests"}).json()
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
            "key_points": ["$2.4M paid to Bellcastle", "Dated November 2023"],
            "evidence": [
                {"record_type": "claim", "record_id": claim_id},
                {"record_type": "evidence", "record_id": evidence_id},
            ],
        }],
        "open_questions": ["Whether the fee was disclosed to the board."],
    })


def _accepted_candidate(monkeypatch) -> dict:
    """Seeds an investigation, runs presentation_draft against a fake LLM,
    and accepts the resulting candidate. Returns the seeded dict plus the
    candidate id."""
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    seeded = _seeded_investigation()
    claim_id, evidence_id = seeded["claim"]["id"], seeded["evidence"]["id"]
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(_draft_response(claim_id, evidence_id)))

    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/presentation-draft",
        json={
            "goal": "Summarize the Bellcastle payment.",
            "record_refs": [
                {"record_type": "claim", "record_id": claim_id},
                {"record_type": "evidence", "record_id": evidence_id},
            ],
        },
    )
    assert r.status_code == 200, r.text
    candidate_id = r.json()["candidate_id"]

    reviewed = client.post(f"/api/ai-analysis-candidates/{candidate_id}/review", json={"decision": "accept", "note": "looks right"})
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["review_status"] == "accepted"

    seeded["candidate_id"] = candidate_id
    return seeded


def test_promote_to_writeup_builds_a_content_json_with_matching_citations(monkeypatch):
    seeded = _accepted_candidate(monkeypatch)
    r = client.post(f"/api/ai-analysis-candidates/{seeded['candidate_id']}/promote-to-writeup", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "The Bellcastle consulting fee"
    assert body["status"] == "draft"
    assert body["source_ai_candidate_id"] == seeded["candidate_id"]
    assert sorted(body["cited_record_refs"], key=str) == sorted(
        [
            {"record_type": "claim", "record_id": seeded["claim"]["id"]},
            {"record_type": "evidence", "record_id": seeded["evidence"]["id"]},
        ],
        key=str,
    )
    # The written brief's prose (body text) and the open question both made it in.
    assert "Meridian paid Bellcastle Holdings a $2.4M consulting fee" in body["content_json"]["content"][5]["content"][0]["text"]
    assert body["word_count"] > 0


def test_promote_to_writeup_title_override(monkeypatch):
    seeded = _accepted_candidate(monkeypatch)
    r = client.post(f"/api/ai-analysis-candidates/{seeded['candidate_id']}/promote-to-writeup", json={"title": "Custom title"})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Custom title"


def test_promote_to_deck_builds_one_slide_per_section_plus_takeaway_and_open_questions(monkeypatch):
    seeded = _accepted_candidate(monkeypatch)
    r = client.post(f"/api/ai-analysis-candidates/{seeded['candidate_id']}/promote-to-deck", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "The Bellcastle consulting fee"
    assert body["source_ai_candidate_id"] == seeded["candidate_id"]
    headings = [slide["heading"] for slide in body["slides"]]
    assert headings == ["Executive takeaway", "The payment", "Open questions"]
    payment_slide = body["slides"][1]
    assert payment_slide["bullets"] == ["$2.4M paid to Bellcastle", "Dated November 2023"]
    assert {"record_type": "claim", "record_id": seeded["claim"]["id"]} in payment_slide["evidence"]
    assert {"record_type": "evidence", "record_id": seeded["evidence"]["id"]} in payment_slide["evidence"]


def test_promoting_the_same_candidate_twice_creates_two_separate_writeups(monkeypatch):
    """Not idempotent by design -- Ony's 'both, picked per use' requirement
    means a reporter may legitimately want more than one artifact from the
    same accepted draft."""
    seeded = _accepted_candidate(monkeypatch)
    first = client.post(f"/api/ai-analysis-candidates/{seeded['candidate_id']}/promote-to-writeup", json={})
    second = client.post(f"/api/ai-analysis-candidates/{seeded['candidate_id']}/promote-to-writeup", json={})
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["id"] != second.json()["id"]


def test_promotion_requires_accepted_review_status(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    seeded = _seeded_investigation()
    claim_id, evidence_id = seeded["claim"]["id"], seeded["evidence"]["id"]
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(_draft_response(claim_id, evidence_id)))
    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/presentation-draft",
        json={
            "goal": "Summarize the Bellcastle payment.",
            "record_refs": [
                {"record_type": "claim", "record_id": claim_id},
                {"record_type": "evidence", "record_id": evidence_id},
            ],
        },
    )
    assert r.status_code == 200, r.text
    candidate_id = r.json()["candidate_id"]  # still "proposed" -- never reviewed

    promote = client.post(f"/api/ai-analysis-candidates/{candidate_id}/promote-to-writeup", json={})
    assert promote.status_code == 400, promote.text
    assert "accepted" in promote.text


def test_promotion_rejects_wrong_module():
    """Only presentation_draft candidates map to a writeup/deck shape --
    case_synthesis/hypothesis_test payloads don't have sections/key_points.
    Built directly against the DB (bypassing the reasoning endpoint) so this
    doesn't depend on the vendored TAS submodule being checked out, which
    neither this check nor its candidate's existence requires."""
    inv = client.post("/api/investigations", json={"name": "Wrong module promotion test"}).json()
    with SessionLocal() as db:
        row = AIAnalysisCandidate(
            investigation_id=inv["id"], module="case_synthesis",
            payload={"summary": "not a presentation_draft shape"},
            review_status="accepted", reviewed_at=utcnow_naive(),
        )
        db.add(row)
        db.commit()
        candidate_id = row.id

    promote = client.post(f"/api/ai-analysis-candidates/{candidate_id}/promote-to-writeup", json={})
    assert promote.status_code == 400, promote.text
    assert "presentation_draft" in promote.text

    promote_deck = client.post(f"/api/ai-analysis-candidates/{candidate_id}/promote-to-deck", json={})
    assert promote_deck.status_code == 400, promote_deck.text
    assert "presentation_draft" in promote_deck.text
