"""Every Authority System Suite system runs through the app (ADR-0015).

A fake model answers with the system's own record examples, so these check the wiring end to end without a
network: the route, the job, the prompt read from the vendored suite, the record checks, the citation check, the
run record, the earlier runs a module reads, and the hand-offs by AGENTS.md's trigger table."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

import app.ai.reasoning as reasoning_module
from app.ai import suite_catalog as catalog
from app.ai import suite_router
from app.ai.governor import governor
from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import AIAnalysisCandidate
from tests.test_suite_catalog import _filled


class _NoCall:
    """Built for the configuration check; a model call fails the test."""

    def generate(self, *a, **k):
        pytest.fail("no model call")


class _FakeLLM:
    def __init__(self, *answers: str):
        self.answers = list(answers)
        self.system_prompts: list[str] = []
        self.user_prompts: list[str] = []

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> str:
        self.system_prompts.append(system_prompt)
        self.user_prompts.append(user_prompt)
        return self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]


@pytest.fixture(autouse=True)
def _ai_on():
    original = (settings.enable_ai_features, settings.ai_provider)
    settings.enable_ai_features, settings.ai_provider = True, "anthropic"
    governor.reset()
    yield
    settings.enable_ai_features, settings.ai_provider = original
    governor.reset()


def _case(client: TestClient) -> tuple[str, dict]:
    inv = client.post("/api/investigations", json={"name": "Suite run tests"}).json()
    source = client.post("/api/sources", json={"investigation_id": inv["id"], "title": "Filing", "source_type": "filing",
                                               "url": "https://example.test/filing"}).json()
    ev = client.post("/api/evidence", json={"source_id": source["id"], "quote": "Ada North signed the agreement.",
                                            "locator": "page 3"}).json()
    return inv["id"], {"record_type": "evidence", "record_id": ev["id"]}


def _answer(code: str, cite: dict, record: catalog.Record | None = None, **changes) -> str:
    record = record or catalog.system(code).records[0]
    return json.dumps({
        "summary": f"What {code.upper()} found.",
        "records": [{"kind": record.kind, "record": {**_filled(record.example), **changes}, "cites": [cite]}],
        "limitations": ["Only one filing in the packet."],
    })


def _run(client: TestClient, inv: str, path: str, **body):
    return client.post(f"/api/investigations/{inv}/assistant/suite/{path}", json={"question": "Who signed it?", **body})


@pytest.mark.parametrize("code", catalog.SYSTEMS)
def test_every_system_runs_its_first_module_and_lands_for_review(monkeypatch, code):
    client = TestClient(app)
    inv, cite = _case(client)
    fake = _FakeLLM(_answer(code, cite))
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: fake)

    r = _run(client, inv, f"{code}/01")
    assert r.status_code == 200, r.text
    assert r.json()["review_status"] == "proposed"
    system, module = catalog.system(code), catalog.module(f"suite:{code}.01")
    prompt = fake.system_prompts[0]
    assert system.name in prompt and "[AG-031]" in prompt                 # the system and the Non-negotiables
    assert module.prompt[:80] in prompt                                    # the module's own Prompt block
    assert all(rec.kind in prompt for rec in system.records)               # the records it answers in
    assert "QUESTION:\nWho signed it?" in fake.user_prompts[0]

    events = client.get(f"/api/investigations/{inv}/ai-runs/{r.json()['job']['id']}/events").json()["events"]
    route = next(e for e in events if e["kind"] == "ROUTE")
    assert route["system"] == code
    assert route["rule"] == f"AGENTS.md trigger table row {catalog.SYSTEMS.index(code) + 1}"
    assert any(e["kind"] == "LOAD" and e["node"] == f"{code}/01" for e in events)
    said = [e for e in events if e["kind"] == "RULE" and e["self_reported"]]
    assert len(said) == 1 and said[0]["refs"] == [cite]


def test_every_module_of_every_system_builds_its_prompt():
    for system in catalog.systems():
        for module in system.modules:
            prompt = reasoning_module.build_system_prompt(module.key, {"evidence_requires_provenance": True})
            assert module.title in prompt and system.name in prompt, module.key
            assert "OUTPUT CONTRACT" in prompt and "RECORD SCHEMAS" in prompt


def test_a_record_breaking_its_schema_is_rejected(monkeypatch):
    client = TestClient(app)
    inv, cite = _case(client)
    framing = next(r for r in catalog.system("qas").records if r.prefix == "QFRM")
    monkeypatch.setattr(reasoning_module, "get_llm_client",
                        lambda *a, **k: _FakeLLM(_answer("qas", cite, framing, question_type="GUESSWORK")))
    r = _run(client, inv, "qas/01")
    assert r.status_code == 422, r.text
    assert any("GUESSWORK" in e for e in r.json()["detail"]["schema_errors"])


def test_a_record_kind_from_another_system_is_rejected(monkeypatch):
    client = TestClient(app)
    inv, cite = _case(client)
    monkeypatch.setattr(reasoning_module, "get_llm_client",
                        lambda *a, **k: _FakeLLM(_answer("las", cite, catalog.system("das").records[0])))
    r = _run(client, inv, "las/01")
    assert r.status_code == 422
    assert "is not a LAS record" in r.text


def test_an_invented_citation_is_rejected(monkeypatch):
    client = TestClient(app)
    inv, _cite = _case(client)
    monkeypatch.setattr(reasoning_module, "get_llm_client",
                        lambda *a, **k: _FakeLLM(_answer("ehs", {"record_type": "evidence", "record_id": "INVENTED"})))
    r = _run(client, inv, "ehs/01")
    assert r.status_code == 422 and "INVENTED" in r.text


def test_an_unknown_module_is_refused_before_any_model_call(monkeypatch):
    client = TestClient(app)
    inv, _cite = _case(client)
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _NoCall())
    assert _run(client, inv, "las/99").status_code == 400
    assert _run(client, inv, "xyz/01").status_code == 400


def test_a_tas_inference_hands_off_to_las_and_las_reads_that_run(monkeypatch):
    client = TestClient(app)
    inv, cite = _case(client)
    evidence = catalog.system("tas").record("Evidence record")
    inference = json.loads(_answer("tas", cite, evidence, classification="INFERENCE"))
    fake = _FakeLLM(json.dumps(inference), _answer("las", cite))
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: fake)

    first = _run(client, inv, "tas/01")
    assert first.status_code == 200, first.text
    run_id = first.json()["job"]["id"]
    with SessionLocal() as db:
        trace = db.get(AIAnalysisCandidate, first.json()["candidate_id"]).trace
    las = next(h for h in trace["handoffs"] if h["system"] == "las")
    assert las["row"] == 4 and las["module"] == "suite:las.01"
    assert las["records"] == [inference["records"][0]["record"]["evidence_id"]]

    second = _run(client, inv, "las/01", prior_run_ids=[run_id])
    assert second.status_code == 200, second.text
    assert "EARLIER RUNS OF THIS CASE" in fake.user_prompts[1] and run_id in fake.user_prompts[1]
    assert fake.user_prompts[1].index("EARLIER RUNS") < fake.user_prompts[1].index("RETRIEVAL PACKET")


def test_an_earlier_run_must_be_this_cases(monkeypatch):
    client = TestClient(app)
    inv, _cite = _case(client)
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _NoCall())
    assert _run(client, inv, "las/01", prior_run_ids=["not-a-run"]).status_code == 404


def test_the_tailored_modules_hand_off_by_the_same_table():
    synthesis = {"claims": [{"claim_id": "CLM-0001", "classification": "INFERENCE"},
                            {"claim_id": "CLM-0002", "classification": "CORROBORATED_FACT"}],
                 "investigative_gaps": [{"gap_id": "GAP-0001"}]}
    found = {h["system"]: h for h in suite_router.handoffs("case_synthesis", synthesis)}
    assert found["las"]["records"] == ["CLM-0001"] and found["las"]["row"] == 4
    assert found["egs"]["records"] == ["GAP-0001"] and found["egs"]["row"] == 6


def test_the_catalog_lists_every_system_module_and_record():
    body = TestClient(app).get("/api/suite/catalog").json()
    assert [s["code"] for s in body["systems"]] == list(catalog.SYSTEMS)
    assert sum(len(s["modules"]) for s in body["systems"]) == sum(len(s.modules) for s in catalog.systems())
    las = next(s for s in body["systems"] if s["code"] == "las")
    assert las["trigger_row"] == 4 and las["modules"][0]["key"] == "suite:las.01"
