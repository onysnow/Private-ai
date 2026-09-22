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
from app.ai.governor import governor
from app.ai.llm_client import LLMProviderError, LLMResponse


# The vendored TAS spec is a private submodule; CI without TAS_REPO_TOKEN runs
# without it (see .github/workflows/backend-postgres-ci.yml). Tests that actually
# build a prompt from it skip there, mirroring tests/test_tas_submodule_drift.py;
# gating/queue/settings tests that never read a spec file still run.
_TAS_SPEC_PRESENT = (reasoning_module.TAS_SPEC_ROOT / "PROMPT_MODULES").exists()
requires_tas_spec = pytest.mark.skipif(not _TAS_SPEC_PRESENT, reason="tas_spec submodule not checked out")


class _FakeLLMClient:
    def __init__(self, response_text: str):
        self._response_text = response_text
        self.calls = 0
        self.system_prompts: list[str] = []

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> str:
        self.calls += 1
        self.system_prompts.append(system_prompt)
        return self._response_text


@pytest.fixture(autouse=True)
def _restore_ai_settings():
    """AI settings default off; every test controls exactly what it needs
    and this restores the shared singleton afterward so tests can't leak
    state into each other or into unrelated test modules.
    """
    original = (settings.enable_ai_features, settings.ai_provider, settings.ai_runs_per_minute, settings.ai_max_concurrent_runs)
    governor.reset()
    yield
    settings.enable_ai_features, settings.ai_provider, settings.ai_runs_per_minute, settings.ai_max_concurrent_runs = original
    governor.reset()


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


@requires_tas_spec
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


@requires_tas_spec
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


@requires_tas_spec
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


def _valid_case_synthesis(evidence_id: str) -> str:
    return json.dumps({
        "executive_summary": "Ada North signed an agreement, per one directly cited filing.",
        "claims": [{
            "claim_id": "CLM-0001", "claim": "Ada North signed the agreement.",
            "classification": "CORROBORATED_FACT",
            "supporting_evidence": [{"record_type": "evidence", "record_id": evidence_id}],
            "contradicting_evidence": [], "warrant": "The filing directly quotes Ada North's signature on the agreement.",
            "confidence": "HIGH", "confidence_basis": "single direct primary source", "limitations": [],
        }],
        "investigative_gaps": [],
    })


@requires_tas_spec
def test_candidate_queue_list_get_and_filters(monkeypatch):
    """The reviewer-facing surface: list per investigation (newest first,
    payload omitted), filter by review_status/module, fetch one by id with
    the full payload and the request that produced it."""
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    inv_id = seeded["investigation"]["id"]
    evidence_id = seeded["evidence"]["id"]

    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(_valid_case_synthesis(evidence_id)))
    first = client.post(f"/api/investigations/{inv_id}/assistant/case-synthesis", json={"question": "What did Ada North sign?"})
    assert first.status_code == 200, first.text
    # An auto-rejected one (invented citation) must also show up in the queue, as rejected.
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(_valid_case_synthesis("NOT-A-REAL-ID")))
    second = client.post(f"/api/investigations/{inv_id}/assistant/case-synthesis", json={"question": "Who else signed with Ada North?"})
    assert second.status_code == 422, second.text

    listed = client.get(f"/api/investigations/{inv_id}/ai-analysis-candidates")
    assert listed.status_code == 200, listed.text
    rows = listed.json()["candidates"]
    assert [r["review_status"] for r in rows] == ["rejected", "proposed"], "newest first"
    assert all("payload" not in r for r in rows), "list omits payloads"
    assert rows[1]["request"]["question"] == "What did Ada North sign?"
    assert rows[1]["checked_citation_count"] >= 1

    proposed_only = client.get(f"/api/investigations/{inv_id}/ai-analysis-candidates", params={"review_status": "proposed"}).json()["candidates"]
    assert [r["id"] for r in proposed_only] == [first.json()["candidate_id"]]
    assert client.get(f"/api/investigations/{inv_id}/ai-analysis-candidates", params={"module": "hypothesis_test"}).json()["candidates"] == []
    assert client.get(f"/api/investigations/{inv_id}/ai-analysis-candidates", params={"review_status": "bogus"}).status_code == 400
    assert client.get(f"/api/investigations/{inv_id}/ai-analysis-candidates", params={"module": "bogus"}).status_code == 400
    assert client.get("/api/investigations/does-not-exist/ai-analysis-candidates").status_code == 404

    one = client.get(f"/api/ai-analysis-candidates/{first.json()['candidate_id']}")
    assert one.status_code == 200, one.text
    body = one.json()
    assert body["module"] == "case_synthesis"
    assert body["payload"]["claims"][0]["claim_id"] == "CLM-0001"
    assert {"record_type": "evidence", "record_id": evidence_id} in body["checked_citation_ids"]
    assert body["request"] == {
        "question": "What did Ada North sign?", "working_theory": None, "max_results": 30, "include_external_leads": True,
        "control_flags": {"severity_floor": "ALL", "source_tier_floor": "C"},  # TAS CONTROL_SURFACE defaults when omitted
        "provider": "anthropic", "model": "unknown",  # the fake client returns a bare str, so no model id is known
    }
    assert client.get("/api/ai-analysis-candidates/does-not-exist").status_code == 404

    # Review through the existing endpoint is reflected in both list and get.
    client.post(f"/api/ai-analysis-candidates/{body['id']}/review", json={"decision": "reject", "note": "Needs a second source."})
    assert client.get(f"/api/ai-analysis-candidates/{body['id']}").json()["reviewer_note"] == "Needs a second source."
    assert client.get(f"/api/investigations/{inv_id}/ai-analysis-candidates", params={"review_status": "proposed"}).json()["candidates"] == []


def test_settings_status_reports_ai_reasoning_state_without_secrets():
    settings.enable_ai_features = False
    settings.ai_provider = ""
    client = TestClient(app)
    ai = client.get("/api/settings/status").json()["ai"]
    assert ai["enabled"] is False
    assert ai["provider"] is None
    assert ai["endpoints_callable"] is False
    assert set(ai["tas_spec"]["modules"]) == {"case_synthesis", "hypothesis_test"}
    assert "spec_file" in ai["tas_spec"]["modules"]["case_synthesis"]

    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    original_key = settings.anthropic_api_key
    try:
        settings.anthropic_api_key = "sk-ant-should-never-appear"
        r = client.get("/api/settings/status")
        ai = r.json()["ai"]
        assert ai["enabled"] is True and ai["provider"] == "anthropic" and ai["provider_key_configured"] is True
        assert "sk-ant" not in r.text, "settings status must never leak key material"
        if ai["tas_spec"]["present"]:
            assert ai["endpoints_callable"] is True
            assert ai["tas_spec"]["version"], "vendored TAS version should be read from the submodule CHANGELOG"
    finally:
        settings.anthropic_api_key = original_key


def test_missing_tas_spec_file_is_a_clean_400_not_a_500(monkeypatch):
    """Runs everywhere (no submodule needed): point the module table at a path
    that does not exist and make sure the endpoint answers with a message a
    reporter can act on rather than an unhandled FileNotFoundError."""
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient("{}"))
    monkeypatch.setitem(reasoning_module.MODULE_FILES, "case_synthesis", reasoning_module.TAS_SPEC_ROOT / "PROMPT_MODULES" / "99_DOES_NOT_EXIST.md")
    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/case-synthesis",
        json={"question": "What did Ada North sign?"},
    )
    assert r.status_code == 400, r.text
    assert "99_DOES_NOT_EXIST.md" in r.text and "submodule" in r.text
    with SessionLocal() as db:
        from app.models.domain import AIAnalysisCandidate
        assert db.query(AIAnalysisCandidate).filter_by(investigation_id=seeded["investigation"]["id"]).count() == 0, "nothing is persisted when the prompt cannot even be built"


def test_control_surface_flags_are_validated_before_any_llm_call(monkeypatch):
    """TAS v1.9 CONTROL_SURFACE §4: unknown values are a 400, not silently
    defaulted, and the LLM client is never even constructed for them."""
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    called = {"n": 0}
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: called.__setitem__("n", called["n"] + 1))
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    url = f"/api/investigations/{seeded['investigation']['id']}/assistant/case-synthesis"

    # Literal-typed request fields: pydantic refuses out-of-table values at 422 with the
    # field named, before the route body runs.
    bad_tier = client.post(url, json={"question": "What did Ada North sign?", "source_tier_floor": "Z"})
    assert bad_tier.status_code == 422, bad_tier.text
    assert "source_tier_floor" in bad_tier.text
    bad_severity = client.post(url, json={"question": "What did Ada North sign?", "severity_floor": "NONE"})
    assert bad_severity.status_code == 422, bad_severity.text
    assert "severity_floor" in bad_severity.text
    assert called["n"] == 0

    # The service layer rejects flags outside the table too (routes are thin; this is the real gate).
    with pytest.raises(reasoning_module.ReasoningInputError):
        reasoning_module.normalize_control_flags({"auto_run_adversarial_gate": True})
    assert reasoning_module.normalize_control_flags(None) == {"severity_floor": "ALL", "source_tier_floor": "C"}
    assert reasoning_module.normalize_control_flags({"source_tier_floor": "b", "severity_floor": None}) == {"severity_floor": "ALL", "source_tier_floor": "B"}


@requires_tas_spec
def test_control_surface_flags_reach_the_prompt_and_the_stored_request_without_touching_validation(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    evidence_id = seeded["evidence"]["id"]
    fake = _FakeLLMClient(_valid_case_synthesis(evidence_id))
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: fake)

    r = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/case-synthesis",
        json={"question": "What did Ada North sign?", "severity_floor": "BLOCKING", "source_tier_floor": "B"},
    )
    assert r.status_code == 200, r.text
    prompt = fake.system_prompts[-1]
    assert "severity_floor = BLOCKING" in prompt and "source_tier_floor = B" in prompt
    assert "never weaken, skip, or make optional" in prompt, "the §2 boundary must be stated to the model"
    # The evidence-authority rules and output contract are unchanged by flags.
    assert "Never invent, alter, or guess a record_type/record_id" in prompt and "OUTPUT CONTRACT:" in prompt

    stored = client.get(f"/api/ai-analysis-candidates/{r.json()['candidate_id']}").json()
    assert stored["request"]["control_flags"] == {"severity_floor": "BLOCKING", "source_tier_floor": "B"}
    # The exact prompts are kept so a reviewer can reconstruct the run.
    assert stored["trace"]["system_prompt"] == prompt and "RETRIEVAL PACKET" in stored["trace"]["user_prompt"]
    assert stored["trace"]["packet_summary"]["citation_count"] >= 1 and stored["trace"]["response"]["truncated"] is False
    assert "trace" not in client.get(f"/api/investigations/{seeded['investigation']['id']}/ai-analysis-candidates").json()["candidates"][0], "list stays light"

    # Same flags, invented citation: still auto-rejected -- flags cannot relax the citation gate.
    fake_bad = _FakeLLMClient(_valid_case_synthesis("NOT-A-REAL-ID"))
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: fake_bad)
    r2 = client.post(
        f"/api/investigations/{seeded['investigation']['id']}/assistant/case-synthesis",
        json={"question": "What did Ada North sign?", "severity_floor": "BLOCKING", "source_tier_floor": "F"},
    )
    assert r2.status_code == 422, r2.text


def test_settings_status_lists_the_supported_control_surface():
    settings.enable_ai_features = False
    settings.ai_provider = ""
    cs = TestClient(app).get("/api/settings/status").json()["ai"]["tas_spec"]["control_surface"]
    assert cs["spec_file"] == "CORE/CONTROL_SURFACE.md"
    assert cs["flags"]["severity_floor"] == {"default": "ALL", "allowed": ["ALL", "MATERIAL", "BLOCKING"]}
    assert cs["flags"]["source_tier_floor"]["default"] == "C" and cs["flags"]["source_tier_floor"]["allowed"] == list("ABCDEF")


# --- Review fixes: provider-side failures, gating order, throttling ------------------------

class _TruncatingClient:
    def generate(self, system_prompt, user_prompt, *, max_tokens=4096):
        return LLMResponse(text='{"executive_summary": "cut off mid', model="claude-test", truncated=True, stop_reason="max_tokens")


class _FailingClient:
    def generate(self, system_prompt, user_prompt, *, max_tokens=4096):
        raise LLMProviderError("anthropic request failed: APIConnectionError: boom")


@requires_tas_spec
def test_truncated_model_output_is_a_502_and_a_rejected_candidate_not_a_400(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _TruncatingClient())
    r = client.post(f"/api/investigations/{seeded['investigation']['id']}/assistant/case-synthesis", json={"question": "What did Ada North sign?"})
    assert r.status_code == 502, r.text
    assert r.json()["detail"]["rejection_reason"] == "truncated"
    rows = client.get(f"/api/investigations/{seeded['investigation']['id']}/ai-analysis-candidates").json()["candidates"]
    assert len(rows) == 1 and rows[0]["review_status"] == "rejected" and rows[0]["rejection_reason"] == "truncated"
    full = client.get(f"/api/ai-analysis-candidates/{rows[0]['id']}").json()
    assert full["payload"]["raw_output"].startswith('{"executive_summary"'), "the cut-off text is kept for the audit trail"
    assert full["request"]["model"] == "claude-test" and full["request"]["provider"] == "anthropic"


@requires_tas_spec
def test_prose_around_the_json_object_is_tolerated(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    wrapped = "Here is the analysis you asked for:\n```json\n" + _valid_case_synthesis(seeded["evidence"]["id"]) + "\n```\nLet me know if you need more."
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FakeLLMClient(wrapped))
    r = client.post(f"/api/investigations/{seeded['investigation']['id']}/assistant/case-synthesis", json={"question": "What did Ada North sign?"})
    assert r.status_code == 200, r.text
    assert r.json()["review_status"] == "proposed"


@requires_tas_spec
def test_provider_failure_is_a_502_without_vendor_text(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _FailingClient())
    r = client.post(f"/api/investigations/{seeded['investigation']['id']}/assistant/case-synthesis", json={"question": "What did Ada North sign?"})
    assert r.status_code == 502, r.text
    assert "APIConnectionError" not in r.text and "boom" not in r.text
    assert governor.in_flight == 0, "a failed run must release its concurrency slot"


def test_no_json_object_at_all_is_not_json(monkeypatch):
    with pytest.raises(reasoning_module.ModelOutputError) as exc:
        reasoning_module._parse_model_json("I cannot answer that.")
    assert exc.value.reason == "not_json"
    with pytest.raises(reasoning_module.ModelOutputError):
        reasoning_module._parse_model_json("[1, 2, 3]")
    assert reasoning_module._parse_model_json('```json\n{"a": 1}\n``` trailing prose') == {"a": 1}


def test_per_actor_rate_limit_refuses_before_the_provider_is_called(monkeypatch):
    settings.enable_ai_features = True
    settings.ai_provider = "anthropic"
    settings.ai_runs_per_minute = 2
    called = {"n": 0}

    class _Counting:
        def generate(self, *a, **k):
            called["n"] += 1
            return "{}"  # schema-invalid on purpose; we only care whether it was called

    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Counting())
    client = TestClient(app)
    seeded = _seeded_investigation(client)
    url = f"/api/investigations/{seeded['investigation']['id']}/assistant/case-synthesis"
    statuses = [client.post(url, json={"question": "What did Ada North sign?"}).status_code for _ in range(3)]
    if _TAS_SPEC_PRESENT:
        assert statuses[:2] == [422, 422], statuses  # ran, then schema-rejected
    third = client.post(url, json={"question": "What did Ada North sign?"})
    assert statuses[2] == 429 and third.status_code == 429, (statuses, third.text)
    assert third.headers.get("retry-after", "").isdigit()
    assert called["n"] == (2 if _TAS_SPEC_PRESENT else 0), "the third and fourth runs must never reach the provider"


def test_concurrency_cap_refuses_a_second_in_flight_run():
    settings.ai_max_concurrent_runs = 1
    settings.ai_runs_per_minute = 100
    from app.ai.governor import ReasoningThrottled
    with governor.acquire("actor-a", settings):
        assert governor.in_flight == 1
        with pytest.raises(ReasoningThrottled) as exc:
            with governor.acquire("actor-b", settings):
                pass
        assert exc.value.retry_after_seconds >= 1
    assert governor.in_flight == 0
    # Released on exception paths too.
    with pytest.raises(RuntimeError):
        with governor.acquire("actor-a", settings):
            raise RuntimeError("provider blew up")
    assert governor.in_flight == 0
