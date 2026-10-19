"""Per-claim review of an AI answer (research AI §2 "Per-claim decisions"; mockup AI_1's trace drawer): Keep, Correct
or Reject one claim or hypothesis while the whole answer is still proposed, each decision also appended to the run
record as a step by you."""

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.ai.reasoning as reasoning_module
from app.ai.governor import governor
from app.ai.reasoning import review_ai_claim, review_items
from app.core.config import settings
from app.db.session import Base
from app.main import app
from app.models.domain import AIAnalysisCandidate, Investigation
from tests.test_reasoning_endpoints import _FakeLLMClient, _seeded_investigation, requires_suite

client = TestClient(app)


@pytest.fixture(autouse=True)
def _restore_ai_settings():
    original = (settings.enable_ai_features, settings.ai_provider)
    governor.reset()
    yield
    settings.enable_ai_features, settings.ai_provider = original
    governor.reset()


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _two_claims(evidence_id: str) -> str:
    claim = {"classification": "SOURCE_STATEMENT", "contradicting_evidence": [], "warrant": "The filing says so.", "assumptions": [],
             "confidence": "MEDIUM", "confidence_term": "LIKELY", "confidence_basis": "one filing", "limitations": []}
    return json.dumps({
        "executive_summary": "Two claims.", "scope_and_limitations": "Packet only.", "most_likely_failure": "Missing records.",
        "claims": [
            {**claim, "claim_id": "CLM-0001", "claim": "Ada North signed the agreement.",
             "supporting_evidence": [{"record_type": "evidence", "record_id": evidence_id}]},
            {**claim, "claim_id": "CLM-0002", "claim": "Ada North acted for the buyer.", "classification": "INFERENCE", "supporting_evidence": []},
        ],
        "right_of_reply_needed": [], "investigative_gaps": [],
    })


@requires_suite
def test_keep_correct_reject_and_take_back_each_claim_through_the_api(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    seeded = _seeded_investigation(client)
    inv = seeded["investigation"]["id"]
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(_two_claims(seeded["evidence"]["id"])))
    reply = ok(client.post(f"/api/investigations/{inv}/assistant/case-synthesis", json={"question": "What did Ada North sign?"}))
    cand, run_id = reply["candidate_id"], reply["job"]["id"]
    assert ok(client.get(f"/api/ai-analysis-candidates/{cand}"))["claim_reviews"] == {}

    url = f"/api/ai-analysis-candidates/{cand}/claim-review"
    kept = ok(client.post(url, json={"claim_id": "CLM-0001", "decision": "keep"}))
    assert kept["claim_reviews"]["CLM-0001"]["decision"] == "keep" and kept["review_status"] == "proposed"

    # A correction needs new words; the model's stay in the payload.
    assert client.post(url, json={"claim_id": "CLM-0002", "decision": "correct"}).status_code == 400
    assert client.post(url, json={"claim_id": "CLM-0002", "decision": "correct", "text": "Ada North acted for the buyer."}).status_code == 400
    corrected = ok(client.post(url, json={"claim_id": "CLM-0002", "decision": "correct", "text": "Ada North may have acted for the buyer."}))
    assert corrected["claim_reviews"]["CLM-0002"]["text"] == "Ada North may have acted for the buyer."
    assert corrected["payload"]["claims"][1]["claim"] == "Ada North acted for the buyer."

    # A rejection needs a reason; it replaces the correction.
    assert client.post(url, json={"claim_id": "CLM-0002", "decision": "reject"}).status_code == 400
    rejected = ok(client.post(url, json={"claim_id": "CLM-0002", "decision": "reject", "reason": "source does not say it"}))
    assert rejected["claim_reviews"]["CLM-0002"] == {**rejected["claim_reviews"]["CLM-0002"], "decision": "reject", "text": None, "reason": "source does not say it"}

    # Taken back: the claim waits again.
    cleared = ok(client.post(url, json={"claim_id": "CLM-0001", "decision": "clear"}))
    assert set(cleared["claim_reviews"]) == {"CLM-0002"}

    assert client.post(url, json={"claim_id": "CLM-0099", "decision": "keep"}).status_code == 404
    assert client.post("/api/ai-analysis-candidates/no-such/claim-review", json={"claim_id": "CLM-0001", "decision": "keep"}).status_code == 404
    assert client.post(url, json={"claim_id": "CLM-0001", "decision": "maybe"}).status_code == 422

    # Each decision is a step by you in the run record, following the thought it decides.
    events = ok(client.get(f"/api/investigations/{inv}/ai-runs/{run_id}/events"))["events"]
    said = {e["detail"]["thought"]: e["n"] for e in events if e["self_reported"]}
    mine = [e for e in events if e["node"] == "review" and (e["detail"] or {}).get("thought")]
    assert [(e["detail"]["thought"], e["detail"]["mark"], e["verdict"]) for e in mine] == [
        ("CLM-0001", "keep", "KEPT"), ("CLM-0002", "correct", "CORRECTED"), ("CLM-0002", "reject", "REJECTED"), ("CLM-0001", "clear", "UNDECIDED")]
    assert all(e["parent"] == said[e["detail"]["thought"]] for e in mine)
    assert mine[2]["text"] == "You rejected CLM-0002: source does not say it"

    # Decisions close with the whole answer.
    ok(client.post(f"/api/ai-analysis-candidates/{cand}/review", json={"decision": "accept", "note": None}))
    closed = client.post(url, json={"claim_id": "CLM-0001", "decision": "keep"})
    assert closed.status_code == 400 and "as a whole" in closed.json()["detail"]
    assert set(ok(client.get(f"/api/ai-analysis-candidates/{cand}"))["claim_reviews"]) == {"CLM-0002"}


def test_hypotheses_are_decided_the_same_way_and_a_run_less_answer_records_no_step():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        db.add(Investigation(id="inv-h", name="Theory"))
        payload = {"working_theory": "x", "conclusion": "y", "contradiction_log": [], "hypothesis_matrix": [
            {"hypothesis_id": "HYP-0001", "hypothesis": "Ada acted alone.", "supporting_evidence": [{"record_type": "evidence", "record_id": "e1"}],
             "contradicting_evidence": [{"record_type": "evidence", "record_id": "e2"}]}]}
        cand = AIAnalysisCandidate(id="c-h", investigation_id="inv-h", module="hypothesis_test", payload=payload, checked_citation_ids=[])
        db.add(cand)
        db.commit()
        assert review_items("hypothesis_test", payload) == [{"id": "HYP-0001", "text": "Ada acted alone.", "refs": [
            {"record_type": "evidence", "record_id": "e1"}, {"record_type": "evidence", "record_id": "e2"}]}]
        assert review_items("presentation_draft", {"sections": []}) == []
        review_ai_claim(db, cand, claim_id="HYP-0001", decision="reject", reason="overstated")
        assert cand.claim_reviews["HYP-0001"]["decision"] == "reject"
        with pytest.raises(LookupError):
            review_ai_claim(db, cand, claim_id="CLM-0001", decision="keep")
        review_ai_claim(db, cand, claim_id="HYP-0001", decision="clear")
        assert cand.claim_reviews is None
