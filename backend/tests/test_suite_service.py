"""The suite service (app/ai/suite.py): one front door that routes every AI module to its system and trigger-table
row, reports the vendored suite's version, and routes an answer onward by what it contains."""

import json
import re

import pytest
from fastapi.testclient import TestClient

import app.ai.reasoning as reasoning_module
import app.services.run_plan as run_plan
from app.ai import suite
from app.ai.governor import governor
from app.core.config import settings
from app.main import app


@pytest.fixture(autouse=True)
def _ai_on():
    original = (settings.enable_ai_features, settings.ai_provider)
    settings.enable_ai_features, settings.ai_provider = True, "anthropic"
    governor.reset()
    yield
    settings.enable_ai_features, settings.ai_provider = original
    governor.reset()


class _Model:
    def __init__(self, answer: dict):
        self.answer = json.dumps(answer)
        self.user_prompts: list[str] = []

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> str:
        self.user_prompts.append(user_prompt)
        return self.answer


def test_every_route_sits_on_its_trigger_table_row():
    agents = (suite.SUITE_ROOT / "AGENTS.md").read_text(encoding="utf-8")
    rows = {m.group(2): int(m.group(1)) for m in re.finditer(r"^\| (\d) \| `systems/([a-z]+)/` \|", agents, re.M)}
    assert set(rows) == set(suite.SYSTEM_ORDER)
    for key, r in suite.ROUTES.items():
        if r.system == "app":
            assert r.row is None and r.rule is None, key
            continue
        assert r.row == rows[r.system], key
        assert all(p.is_file() for p in r.files), key
    assert [rows[s] for s in suite.SYSTEM_ORDER] == list(range(1, 8)), "the suite's own order"


def test_the_pipeline_and_the_plan_read_their_modules_from_the_service():
    assert set(reasoning_module.MODULE_FILES) == set(suite.ROUTES)
    for key, r in suite.ROUTES.items():
        assert reasoning_module.MODULE_FILES[key] == r.files[0]
        assert reasoning_module.MODULE_TITLES[key] == r.title
        assert reasoning_module.MODULE_NODES[key] == r.node
    assert set(run_plan.MODULE_TEXT) == set(suite.ROUTES)
    with pytest.raises(suite.UnknownModule):
        suite.route("nope")


def test_status_reports_every_system_and_its_version():
    client = TestClient(app)
    ai = client.get("/api/settings/status").json()["ai"]["authority_suite"]
    assert re.fullmatch(r"onysnow/Authority-System-Suite@[0-9a-f]{7,40}", ai["source"])
    systems = {s["system"]: s for s in ai["systems"]}
    assert list(systems) == list(suite.SYSTEM_ORDER)
    assert systems["tas"]["version"] == ai["tas_version"] and systems["tas"]["row"] == 2
    assert {s["kind"] for s in ai["systems"]} == {"authority", "support"}
    assert systems["egs"]["kind"] == systems["ehs"]["kind"] == "support"
    for s in ai["systems"]:
        assert s["present"] and s["latest_change"], s["system"]
        assert s["modules"] and all(m["available"] for m in s["modules"]), s["system"]


def _case(client: TestClient) -> dict:
    inv = client.post("/api/investigations", json={"name": "Suite service tests"}).json()
    source = client.post("/api/sources", json={"investigation_id": inv["id"], "title": "Minutes", "source_type": "document"}).json()
    evidence = client.post("/api/evidence", json={"source_id": source["id"], "quote": "Ada North approved the transfer.", "locator": "p1"}).json()
    return {"inv": inv["id"], "ref": {"record_type": "evidence", "record_id": evidence["id"]}}


def _synthesis(ref: dict) -> dict:
    return {
        "executive_summary": "s", "scope_and_limitations": "l", "most_likely_failure": "f",
        "claims": [{"claim_id": "CLM-0001", "claim": "The transfer was hidden.", "classification": "INFERENCE",
                    "supporting_evidence": [ref], "contradicting_evidence": [], "warrant": "w", "assumptions": [],
                    "confidence": "LOW", "confidence_term": "UNLIKELY", "confidence_basis": "b", "limitations": []}],
        "right_of_reply_needed": [{"subject": "Ada North", "claim_ids": ["CLM-0001"], "what_will_be_said": "x", "draft_questions": []}],
        "investigative_gaps": [],
    }


def test_one_endpoint_routes_every_module_and_refuses_what_a_module_does_not_take(monkeypatch):
    client = TestClient(app)
    case = _case(client)
    run = f"/api/investigations/{case['inv']}/assistant/run"
    model = _Model(_synthesis(case["ref"]))
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: model)
    tas = client.post(run, json={"module": "case_synthesis", "question": "Ada North approved the transfer",
                                 "severity_floor": "MATERIAL"})
    assert tas.status_code == 200, tas.text
    cid = tas.json()["candidate_id"]
    body = client.get(f"/api/ai-analysis-candidates/{cid}").json()
    assert body["request"]["control_flags"]["severity_floor"] == "MATERIAL"
    assert [n["module"] for n in body["next_runs"]] == ["las_argument_check", "ehs_harm_minimisation"]
    assert body["next_runs"][0]["row"] == 4 and "CLM-0001" in body["next_runs"][0]["why"]

    refusals = [
        {"module": "case_synthesis", "question": "q", "handoff_from": cid},
        {"module": "las_argument_check", "question": "q", "severity_floor": "ALL"},
        {"module": "las_argument_check", "question": "q", "options": {"devils_advocate": "ON"}},
        {"module": "presentation_draft", "question": "goal"},
        {"module": "las_argument_check", "question": "q", "handoff_from": cid, "packet_from": {"run_id": "x", "step": 1}},
    ]
    for refused in refusals:
        r = client.post(run, json=refused)
        assert r.status_code == 400, (refused, r.text)
    assert len(model.user_prompts) == 1, "every refusal comes before the model is asked"

    client.post(f"/api/ai-analysis-candidates/{cid}/review", json={"decision": "accept"})
    check = {"modules_not_run": "Modules 03-10 not run.", "arguments": [], "premises": []}
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model(check))
    las = client.post(run, json={"module": "las_argument_check", "question": "Is it hidden?", "handoff_from": cid})
    assert las.status_code == 200, las.text
    assert client.get(f"/api/ai-analysis-candidates/{las.json()['candidate_id']}").json()["next_runs"] == []


def test_next_runs_follow_what_the_answer_contains():
    assert suite.next_runs("case_synthesis", {"claims": [{"claim_id": "CLM-0001", "classification": "SOURCE_STATEMENT"}]}) == []
    gaps = suite.next_runs("case_synthesis", {"investigative_gaps": [{"gap_id": "GAP-0001"}]})
    assert [n["module"] for n in gaps] == ["evidence_plan"] and gaps[0]["system"] == "EGS"
    assert [n["module"] for n in suite.next_runs("hypothesis_test", {"hypothesis_matrix": [{"missing_records": ["bank"]}]})] == [
        "quant_framing", "evidence_plan"]
    assert suite.next_runs("das_framing", {"decision_id": "DEC-0001"})[0]["module"] == "das_options"
    for key, nexts in suite.POSSIBLE_NEXT.items():
        for n in nexts:
            assert key in suite.ROUTES[n].takes_from, (key, n)


def test_a_run_names_the_answer_it_saved_its_current_review_and_its_route(monkeypatch):
    """A run the checks stopped still saved its answer (as rejected); the summary finds it through the run record, and
    a run's review status is the answer's as it stands now, not as it was when the run ended."""
    client = TestClient(app)
    case = _case(client)
    run = f"/api/investigations/{case['inv']}/assistant/run"
    stopped = _synthesis({"record_type": "evidence", "record_id": "not-in-the-packet"})
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model(stopped))
    assert client.post(run, json={"module": "case_synthesis", "question": "Ada North approved the transfer"}).status_code == 422
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model(_synthesis(case["ref"])))
    ok = client.post(run, json={"module": "case_synthesis", "question": "Ada North approved the transfer"}).json()
    client.post(f"/api/ai-analysis-candidates/{ok['candidate_id']}/review", json={"decision": "reject", "note": "No."})

    runs = client.get(f"/api/investigations/{case['inv']}/ai-runs").json()["runs"]
    by_status = {r["status"]: r for r in runs}
    assert by_status["failed"]["candidate_id"], "the stopped run's rejected answer is named, not 'none saved'"
    assert by_status["failed"]["review_status"] == "rejected"
    assert by_status["succeeded"]["candidate_id"] == ok["candidate_id"]
    assert by_status["succeeded"]["review_status"] == "rejected", "the review as it stands now"
    route = by_status["succeeded"]["route"]
    assert route["system"] == "tas" and route["row"] == 2 and route["node"] == "tas/08"
    assert route["modules_in_system"] == suite.module_count("tas") and route["final_audit"]["node"] == "tas/10"
    for system, name in suite.FINAL_AUDIT.items():
        assert (suite.SYSTEMS_ROOT / system / "PROMPT_MODULES" / name).is_file(), system


def test_a_draft_run_names_the_records_it_drafted_from():
    """Run again plans a presentation draft with the same records, so the run summary carries them."""
    from app.api.routes_ai_runs import AI_REASONING
    from app.db.session import SessionLocal
    from app.models.jobs import BackgroundJob

    client = TestClient(app)
    case = _case(client)
    with SessionLocal() as db:
        job = BackgroundJob(kind=AI_REASONING, investigation_id=case["inv"], status="succeeded", payload={
            "module": "presentation_draft", "question": "Brief the editor",
            "record_refs": [{"record_type": "evidence", "record_id": "ev-1"}, "not a ref"]})
        db.add(job)
        db.commit()
    runs = client.get(f"/api/investigations/{case['inv']}/ai-runs").json()["runs"]
    draft = next(r for r in runs if r["module"] == "presentation_draft")
    assert draft["record_refs"] == [{"record_type": "evidence", "record_id": "ev-1"}]
