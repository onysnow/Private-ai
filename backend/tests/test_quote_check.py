"""The quote check on AI presentation drafts (Foundation Fixes fix 4)."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

import app.ai.reasoning as reasoning_module
from app.ai.governor import governor
from app.ai.quote_check import TextSource, check_presentation_quotes, find_quote, prompt_record_texts
from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import AIAnalysisCandidate

client = TestClient(app)


class _FakeLLM:
    def __init__(self, text: str):
        self.text, self.user_prompt = text, ""

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> str:
        self.user_prompt = user_prompt
        return self.text


@pytest.fixture(autouse=True)
def _ai_on():
    original = (settings.enable_ai_features, settings.ai_provider)
    settings.enable_ai_features, settings.ai_provider = True, "anthropic"
    governor.reset()
    yield
    settings.enable_ai_features, settings.ai_provider = original
    governor.reset()


def test_find_quote_is_word_for_word_apart_from_spacing():
    text = "On 14 Nov 2023,\n  $2.4M was\twired to Bellcastle Holdings."
    source = [TextSource("evidence", "e1", "quote", text)]
    match = find_quote("$2.4M was wired   to Bellcastle", source)
    assert match is not None
    assert text[match["start_char"]:match["end_char"]] == "$2.4M was\twired to Bellcastle"
    assert match["matched_text"] == "$2.4M was\twired to Bellcastle" and match["field"] == "quote"
    assert find_quote("$2.4M was sent to Bellcastle", source) is None      # a different word
    assert find_quote("$2.4m was wired to Bellcastle", source) is None      # case counts
    assert find_quote("Bellcastle Holdings", source) is None                # shorter than three words
    chunked = [TextSource("document", "d1", "chunk", "Page one text.", chunk_id="c1", locator="page 1"),
               TextSource("document", "d1", "chunk", "The council approved the contract.", chunk_id="c2", locator="page 2")]
    assert find_quote("council approved the contract", chunked)["chunk_id"] == "c2"


def _seed() -> dict:
    inv = client.post("/api/investigations", json={"name": "Quote check"}).json()
    claim = client.post("/api/claims", json={"investigation_id": inv["id"], "text": "Meridian paid Bellcastle a consulting fee in November 2023."}).json()
    source = client.post("/api/sources", json={"investigation_id": inv["id"], "title": "Wire log", "source_type": "filing"}).json()
    evidence = client.post("/api/evidence", json={"source_id": source["id"], "quote": "$2.4M wired to Bellcastle Holdings on 2023-11-14.", "locator": "row 41"}).json()
    return {"inv": inv["id"], "claim": claim["id"], "evidence": evidence["id"]}


def _ref(kind: str, record_id: str, quote: str | None) -> dict:
    ref = {"record_type": kind, "record_id": record_id}
    if quote is not None:
        ref["quote"] = quote
    return ref


def _draft(s: dict, *, key_point_quote: str, figure_quote: str) -> dict:
    return {
        "title": "Bellcastle", "goal_restated": "g", "executive_takeaway": "t",
        "sections": [{
            "heading": "The payment", "body": "b",
            "key_points": [
                {"text": "$2.4M to Bellcastle", "evidence": [_ref("evidence", s["evidence"], key_point_quote)]},
                {"text": "Paid in November 2023", "evidence": [_ref("claim", s["claim"], "consulting fee in November 2023")]},
                {"text": "Approved by the board", "evidence": [_ref("claim", s["claim"], None)]},
            ],
            "evidence": [_ref("claim", s["claim"], "Meridian paid Bellcastle"), _ref("evidence", s["evidence"], "wired to Bellcastle Inc")],
            "visual": {"type": "figures", "items": [
                {"value": "$2.4M", "label": "wired", "evidence": [_ref("evidence", s["evidence"], figure_quote)]},
            ]},
        }],
        "open_questions": [],
    }


def _run(monkeypatch, s: dict, payload: dict):
    fake = _FakeLLM(json.dumps(payload))
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: fake)
    response = client.post(f"/api/investigations/{s['inv']}/assistant/presentation-draft", json={
        "goal": "Summarize the payment.",
        "record_refs": [{"record_type": "claim", "record_id": s["claim"]}, {"record_type": "evidence", "record_id": s["evidence"]}],
    })
    return response, fake


def test_draft_keeps_only_what_its_quotes_support(monkeypatch):
    s = _seed()
    response, fake = _run(monkeypatch, s, _draft(s, key_point_quote="$2.4M wired to Bellcastle", figure_quote="$2.4M wired to"))
    assert response.status_code == 200, response.text
    assert '"record_texts"' in fake.user_prompt and "$2.4M wired to Bellcastle Holdings on 2023-11-14." in fake.user_prompt
    section = response.json()["payload"]["sections"][0]
    assert section["key_points"] == ["$2.4M to Bellcastle", "Paid in November 2023"]
    first = section["key_point_evidence"][0][0]
    assert (first["record_type"], first["field"], first["start_char"], first["end_char"]) == ("evidence", "quote", 0, 25)
    assert [ref["record_type"] for ref in section["evidence"]] == ["claim"]
    assert section["visual"]["items"][0]["evidence"][0]["matched_text"] == "$2.4M wired to"

    with SessionLocal() as db:
        row = db.get(AIAnalysisCandidate, response.json()["candidate_id"])
        removed = row.trace["quote_check"]["removed"]
    assert {"where": "The payment: key point 3", "record": ["claim", s["claim"]], "reason": "no quote given"} in removed
    assert any(r["where"] == "The payment: evidence" and r["reason"] == "quote not found in the cited record" for r in removed)


def test_a_draft_with_nothing_quoted_is_rejected(monkeypatch):
    s = _seed()
    payload = _draft(s, key_point_quote="paid a lot of money", figure_quote="two point four")
    payload["sections"][0]["key_points"] = payload["sections"][0]["key_points"][:1]
    payload["sections"][0]["evidence"] = [_ref("claim", s["claim"], "a fee that never was")]
    response, _ = _run(monkeypatch, s, payload)
    assert response.status_code == 422, response.text
    assert "none of its quotes could be found" in response.text
    with SessionLocal() as db:
        row = db.query(AIAnalysisCandidate).filter_by(investigation_id=s["inv"]).one()
        assert row.review_status == "rejected" and row.reviewer_note.startswith("Auto-rejected: none of the draft's quotes")
        assert reasoning_module.rejection_reason(row) == "quotes"


def test_documents_are_quoted_from_their_chunks(tmp_path):
    from tests.document_helpers import ingest_document

    with SessionLocal() as db:
        inv = client.post("/api/investigations", json={"name": "Doc quotes"}).json()
        doc = ingest_document(db, investigation_id=inv["id"], title="Minutes", filename="minutes.txt", mime_type="text/plain",
                              data=b"Opening remarks.\n\nThe council approved the Bellcastle contract on 3 May.\n", storage_dir=tmp_path)
        texts = prompt_record_texts(db, [{"record_type": "document", "record_id": doc.id}])
        assert texts[0]["text"] == "[line 1] Opening remarks.\n[line 3] The council approved the Bellcastle contract on 3 May."
        payload = {"sections": [{"heading": "h", "body": "b", "key_points": [
            {"text": "Approved", "evidence": [{"record_type": "document", "record_id": doc.id, "quote": "approved the Bellcastle contract"}]}],
            "evidence": []}]}
        checked, report = check_presentation_quotes(db, payload)
    ref = checked["sections"][0]["key_point_evidence"][0][0]
    assert ref["locator"] == "line 3" and ref["field"] == "chunk" and report["verified_quotes"] == 1
