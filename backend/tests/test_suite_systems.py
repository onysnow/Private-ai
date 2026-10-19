"""The suite's other systems as app runs (app/ai/systems.py, app/ai/interop.py): each module's prompt comes from its
own system, its answer is held to that system's value lists and mechanical rules, and a run that starts from an
accepted answer receives only what INTEROP.md lets cross, with every value held back listed in the run record.
A fake model client stands in, so nothing leaves the test."""

import json

import pytest
from fastapi.testclient import TestClient

import app.ai.reasoning as reasoning_module
from app.ai.governor import governor
from app.ai.systems import SUITE_MODULES
from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import AIRunEvent, Source


class _Model:
    """Answers each call with the next prepared text, keeping what it was sent."""

    def __init__(self, *answers: dict):
        self.answers = [json.dumps(a) for a in answers]
        self.system_prompts: list[str] = []
        self.user_prompts: list[str] = []

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> str:
        self.system_prompts.append(system_prompt)
        self.user_prompts.append(user_prompt)
        return self.answers.pop(0)


@pytest.fixture(autouse=True)
def _ai_on():
    original = (settings.enable_ai_features, settings.ai_provider)
    settings.enable_ai_features, settings.ai_provider = True, "anthropic"
    governor.reset()
    yield
    settings.enable_ai_features, settings.ai_provider = original
    governor.reset()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def _case(client: TestClient, *, tier: str | None = None) -> dict:
    inv = client.post("/api/investigations", json={"name": "Suite systems tests"}).json()
    source = client.post("/api/sources", json={"investigation_id": inv["id"], "title": "Board minutes", "source_type": "document"}).json()
    if tier:
        with SessionLocal() as db:
            db.get(Source, source["id"]).source_tier = tier
            db.commit()
    evidence = client.post("/api/evidence", json={"source_id": source["id"], "quote": "Ada North approved the 2019 transfer of 40,000.", "locator": "page 2"}).json()
    return {"inv": inv["id"], "source": source["id"], "evidence": evidence["id"]}


def _ref(case: dict) -> dict:
    return {"record_type": "evidence", "record_id": case["evidence"]}


def _synthesis(case: dict) -> dict:
    return {
        "executive_summary": "Ada North approved a transfer.",
        "claims": [
            {"claim_id": "CLM-0001", "claim": "Ada North approved the 2019 transfer.", "classification": "SOURCE_STATEMENT",
             "supporting_evidence": [_ref(case)], "contradicting_evidence": [], "warrant": "The minutes record her approval.",
             "assumptions": [], "confidence": "MEDIUM", "confidence_term": "LIKELY", "confidence_basis": "one record",
             "limitations": []},
            {"claim_id": "CLM-0002", "claim": "The transfer was concealed from the board.", "classification": "INFERENCE",
             "supporting_evidence": [_ref(case)], "contradicting_evidence": [], "warrant": "No later minute mentions it.",
             "assumptions": ["Every board discussion is minuted"], "confidence": "LOW", "confidence_term": "UNLIKELY",
             "confidence_basis": "absence only", "limitations": []},
        ],
        "right_of_reply_needed": [{"subject": "Ada North", "claim_ids": ["CLM-0001"], "what_will_be_said": "She approved it.",
                                   "draft_questions": ["Did you approve it?"]}],
        "investigative_gaps": [{"gap_id": "GAP-0001", "unresolved_question": "Who received the transfer?", "bears_on": ["CLM-0001"],
                                "why_material": "It names the beneficiary.", "needed_record_or_testimony": "The bank statement",
                                "record_existence": "KNOWN", "could_confirm_or_refute": "It shows the payee."}],
    }


def _accepted_synthesis(client: TestClient, monkeypatch, case: dict, *, review: dict | None = None) -> str:
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model(_synthesis(case)))
    run = client.post(f"/api/investigations/{case['inv']}/assistant/case-synthesis", json={"question": "Who approved the transfer?"})
    assert run.status_code == 200, run.text
    cid = run.json()["candidate_id"]
    if review:
        assert client.post(f"/api/ai-analysis-candidates/{cid}/claim-review", json=review).status_code == 200
    assert client.post(f"/api/ai-analysis-candidates/{cid}/review", json={"decision": "accept"}).status_code == 200
    return cid


def _logic_check(case: dict, **changes) -> dict:
    answer = {
        "modules_not_run": "A compressed check: Modules 03-10 were not run, and premise truth was not checked.",
        "arguments": [{
            "arg_id": "ARG-0001", "reviews": ["CLM-0002"], "conclusion": "The transfer was concealed from the board.",
            "explicit_premises": ["PREM-0001"], "unstated_premises": ["PREM-0002"],
            "argument_lines": [{"line": 1, "premises": ["PREM-0001", "PREM-0002"], "inferential_type": "ABDUCTIVE",
                                "validity_verdict": None, "strength": "weak: absence of a minute is not concealment",
                                "logical_form": None, "confidence_term": "LIKELY"}],
            "formal_fallacy": None, "rival_explanation_not_addressed": "It was discussed but not minuted.",
            "conclusion_scope_mismatch": None, "equivocation_affecting_inference": [], "no_premises_offered": False,
        }],
        "premises": [
            {"premise_id": "PREM-0001", "premise_text": "No later minute mentions the transfer.", "attribution_category": "STATED_BY_ARGUER",
             "type": "EMPIRICAL", "load_bearing": True, "source": [_ref(case)]},
            {"premise_id": "PREM-0002", "premise_text": "Every board discussion is minuted.", "attribution_category": "RECONSTRUCTED_BY_EVALUATOR",
             "type": "EMPIRICAL", "load_bearing": True, "source": []},
        ],
    }
    answer.update(changes)
    return answer


def _suite_run(client: TestClient, case: dict, module: str, **body):
    return client.post(f"/api/investigations/{case['inv']}/assistant/suite-run", json={"module": module, "question": body.pop("question", "Ada North approved the transfer"), **body})


def test_every_module_builds_a_prompt_from_its_own_system():
    for key, module in SUITE_MODULES.items():
        prompt = reasoning_module.build_system_prompt(key, {"missing_evidence_must_be_reported_as_unknown": True})
        assert f"({module.system.upper()}) of the Authority System Suite" in prompt
        for path in module.files:
            assert path.read_text(encoding="utf-8")[:200] in prompt, (key, path.name)
        for line in module.limits:
            assert line in prompt
        assert "OUTPUT CONTRACT" in prompt and "HANDOFF section" in prompt


def test_logic_check_starts_from_the_accepted_synthesis_and_withholds_what_cannot_cross(client, monkeypatch):
    case = _case(client)
    cid = _accepted_synthesis(client, monkeypatch, case)
    model = _Model(_logic_check(case))
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: model)
    run = _suite_run(client, case, "las_argument_check", handoff_from=cid, premises=["The minutes are complete"])
    assert run.status_code == 200, run.text
    assert run.json()["review_status"] == "proposed"

    sent = model.user_prompts[0]
    handoff = json.loads(sent.split("HANDOFF (accepted by a person; INTEROP.md rules applied):\n", 1)[1].split("\n\nRETRIEVAL PACKET", 1)[0])
    assert [c["claim_id"] for c in handoff["records"]] == ["CLM-0001", "CLM-0002"]
    assert all(set(c) & {"classification", "confidence", "confidence_term"} == set() for c in handoff["records"])
    assert {w["field"] for w in handoff["withheld_fields"]} == {"classification", "confidence", "confidence_term"}
    assert "LOW|MEDIUM|HIGH is a local value" in json.dumps(handoff["withheld_fields"])
    assert "Logic Authority System (LAS)" in model.system_prompts[0]
    assert "USER_STIPULATED" in model.system_prompts[0] and "The minutes are complete" in model.system_prompts[0]

    body = client.get(f"/api/ai-analysis-candidates/{run.json()['candidate_id']}").json()
    assert body["module"] == "las_argument_check"
    assert body["request"]["handoff_from"] == cid
    assert body["trace"]["handoff"]["held"][0]["values"], "the run record keeps the values that stayed behind"
    assert body["trace"]["suite_checks"]["flags"], "one stipulated premise given, none marked USER_STIPULATED"
    with SessionLocal() as db:
        events = db.query(AIRunEvent).filter(AIRunEvent.run_id == body["trace"]["run_id"]).all()
    assert any(e.kind == "ROUTE" and e.system == "las" and e.rule == "AGENTS.md trigger table row 4" for e in events)
    assert sum(1 for e in events if e.kind == "BLOCK" and e.verdict == "HELD") == 3
    assert any(e.kind == "RULE" and e.node == "las/01+02" and e.self_reported for e in events)


def test_only_an_accepted_answer_of_the_right_module_is_handed_over(client, monkeypatch):
    case = _case(client)
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model(_synthesis(case)))
    run = client.post(f"/api/investigations/{case['inv']}/assistant/case-synthesis", json={"question": "Who approved it?"})
    proposed = run.json()["candidate_id"]
    model = _Model()
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: model)

    not_accepted = _suite_run(client, case, "las_argument_check", handoff_from=proposed)
    assert not_accepted.status_code == 400 and "accepted" in not_accepted.text
    client.post(f"/api/ai-analysis-candidates/{proposed}/review", json={"decision": "accept"})
    wrong_module = _suite_run(client, case, "das_options", handoff_from=proposed)
    assert wrong_module.status_code == 400 and "Decision framing" in wrong_module.text
    other = _case(client)
    elsewhere = _suite_run(client, other, "las_argument_check", handoff_from=proposed)
    assert elsewhere.status_code == 404
    needs_one = _suite_run(client, case, "evidence_plan")
    assert needs_one.status_code == 400 and "handoff_from" in needs_one.text
    no_premises = _suite_run(client, case, "das_framing", premises=["x"])
    assert no_premises.status_code == 400
    assert model.user_prompts == [], "every refusal comes before the model is asked"


def test_a_rejected_claim_never_crosses_and_a_corrected_one_crosses_in_your_words(client, monkeypatch):
    case = _case(client)
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model(_synthesis(case)))
    cid = client.post(f"/api/investigations/{case['inv']}/assistant/case-synthesis", json={"question": "Ada North approved the transfer"}).json()["candidate_id"]
    client.post(f"/api/ai-analysis-candidates/{cid}/claim-review", json={"claim_id": "CLM-0001", "decision": "correct", "text": "The minutes record Ada North's approval."})
    client.post(f"/api/ai-analysis-candidates/{cid}/claim-review", json={"claim_id": "CLM-0002", "decision": "reject", "reason": "Absence is not concealment."})
    client.post(f"/api/ai-analysis-candidates/{cid}/review", json={"decision": "accept"})
    answer = _logic_check(case, arguments=[{**_logic_check(case)["arguments"][0], "reviews": ["CLM-0001"]}])
    model = _Model(answer)
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: model)
    run = _suite_run(client, case, "las_argument_check", handoff_from=cid)
    assert run.status_code == 200, run.text
    sent = model.user_prompts[0]
    assert "The minutes record Ada North's approval." in sent and '"corrected_by_you": true' in sent
    assert "The transfer was concealed from the board." not in sent.split("RETRIEVAL PACKET", 1)[0]
    assert '"left_out_by_you": [\n    "CLM-0002"' in sent

    # A logic check naming a claim the hand-over does not hold is malformed.
    bad = _Model(_logic_check(case))  # reviews CLM-0002, which was left out
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: bad)
    refused = _suite_run(client, case, "las_argument_check", handoff_from=cid)
    assert refused.status_code == 422 and "CLM-0002" in refused.text


def test_logic_check_rules_are_read_mechanically(client, monkeypatch):
    case = _case(client)
    line = {"line": 1, "premises": ["PREM-0009"], "inferential_type": "DEDUCTIVE", "validity_verdict": None,
            "strength": None, "logical_form": None, "confidence_term": "LIKELY"}
    answer = _logic_check(case)
    answer["arguments"] = [{**answer["arguments"][0], "reviews": [], "argument_lines": [line]}]
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model(answer))
    run = _suite_run(client, case, "las_argument_check")
    assert run.status_code == 422
    assert "PREM-0009" in run.text and "deductive and has no validity_verdict" in run.text


def _plan(case: dict, **changes) -> dict:
    item = {"plan_item_id": "GPLN-0001", "upstream_refs": ["GAP-0001"], "hypothesis": "Ada North approved a transfer to a related party",
            "point_to_establish": "who received the transfer", "confirms_if": "the payee is related", "refutes_if": "the payee is unrelated",
            "record_or_testimony": "bank statement", "holder": "the company's bank", "route": "RECORDS_REQUEST",
            "existence": "BELIEVED", "existence_basis": "transfers leave statements", "existence_evidence": [_ref(case)],
            "existence_likelihood": None, "type": "DOCUMENT", "priority": "HIGH", "priority_reason": "names the beneficiary",
            "order_exception_reason": None, "status": "PLANNED", "status_reason": None}
    item.update(changes)
    return {"plan_items": [item], "order_of_work": ["GPLN-0001"]}


def test_evidence_plan_takes_the_gaps_and_flags_a_different_existence_without_changing_either(client, monkeypatch):
    case = _case(client)
    cid = _accepted_synthesis(client, monkeypatch, case)
    model = _Model(_plan(case))
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: model)
    run = _suite_run(client, case, "evidence_plan", handoff_from=cid, context="UK; no paid databases")
    assert run.status_code == 200, run.text
    sent = model.user_prompts[0]
    assert "JURISDICTION AND ACCESS LIMITS (as the requester gives them):\nUK; no paid databases" in sent
    handed = sent.split("RETRIEVAL PACKET", 1)[0]
    assert "Who received the transfer?" in handed and '"record_existence": "KNOWN"' not in handed and "KNOWN" not in handed
    body = client.get(f"/api/ai-analysis-candidates/{run.json()['candidate_id']}").json()
    assert body["payload"]["plan_items"][0]["existence"] == "BELIEVED"
    assert any("TAS gap GAP-0001 said KNOWN" in f for f in body["trace"]["suite_checks"]["flags"])

    for broken, why in ((_plan(case, upstream_refs=["GAP-0404"]), "GAP-0404"), (_plan(case, refutes_if=""), "refutes_if"),
                        (_plan(case, status="DONE"), "status"), (_plan(case, route="BREAK_IN"), "route")):
        monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, b=broken, **k: _Model(b))
        refused = _suite_run(client, case, "evidence_plan", handoff_from=cid)
        assert refused.status_code == 422 and why in refused.text, refused.text


def _harm(case: dict, **changes) -> dict:
    entry = {"harm_id": "EHRM-0001", "person_or_group": "Ada North", "identified_in": [_ref(case)], "category": "PRIVATE_PERSON",
             "harm": "Named in connection with a transfer", "approach_or_consent": "NOT GIVEN", "least_harmful_way": "Name only her role",
             "loses_public_interest": False, "remaining_harm": "She is identifiable", "remaining_harm_reasons": "Her role is the story",
             "decision": "PENDING", "missing_inputs": [], "rules_not_applied": []}
    entry.update(changes)
    return {"story_id": "the transfer story", "harm_assessments": [entry], "people_without_harm_entry": []}


def test_ethics_runs_decide_nothing_and_chain_harm_into_public_interest(client, monkeypatch):
    case = _case(client)
    cid = _accepted_synthesis(client, monkeypatch, case)
    for broken, why in ((_harm(case, decision="ACCEPT_REMAINING_HARM"), "decision"), (_harm(case, decided_by="the model"), "decided_by")):
        monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, b=broken, **k: _Model(b))
        refused = _suite_run(client, case, "ehs_harm_minimisation", handoff_from=cid)
        assert refused.status_code == 422 and why in refused.text

    model = _Model(_harm(case))
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: model)
    harm = _suite_run(client, case, "ehs_harm_minimisation", handoff_from=cid, context="Ada North has not been approached")
    assert harm.status_code == 200, harm.text
    assert '"subject": "Ada North"' in model.user_prompts[0] and "not a reply record" in model.user_prompts[0]
    assert "support system" in model.system_prompts[0]
    hid = harm.json()["candidate_id"]
    client.post(f"/api/ai-analysis-candidates/{hid}/review", json={"decision": "accept"})

    pit = {"pit_id": "EPIT-0001", "public_interest": "SERIOUS_IMPROPRIETY", "reasons": "A director approved a transfer the board did not see",
           "reasons_evidence": [_ref(case)], "interest_of_the_public": "Readers are curious about her", "elements": [
               {"element": "Her name", "intrusion_or_harm": "Identifies her", "needed_by_public_interest": True, "weighing": "Her role is the impropriety",
                "evidence": [_ref(case)]}],
           "public_figure_note": None, "child_exceptional_interest": None, "lawful_access_note": None, "harm_ids": ["EHRM-0001"],
           "decision": "PENDING", "missing_inputs": [], "rules_not_applied": []}
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model(pit))
    weighed = _suite_run(client, case, "ehs_public_interest", handoff_from=hid)
    assert weighed.status_code == 200, weighed.text
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model({**pit, "decision": "PUBLISH"}))
    assert _suite_run(client, case, "ehs_public_interest", handoff_from=hid).status_code == 422


def _framing() -> dict:
    return {"decision_id": "DEC-0001", "decision_statement": "Publish now or wait for Ada North's reply?", "proxy_question": None,
            "decision_maker": "the editor", "required_consultation": ["legal"], "stakes": "An unanswered allegation",
            "reversibility_type": "TYPE_1", "reversibility_rationale": "Publication cannot be undone", "problem_domain": "COMPLICATED",
            "domain_rationale": "Known factors, expert judgement", "domain_parts": [], "deadline": None, "deadline_type": "NEGOTIABLE",
            "recommended_process": "Modules 02-07 compressed", "process_mismatch_flag": None, "ambiguity_flag": None,
            "routing_note": "02 in full", "evidence": []}


def _options(case: dict, **row) -> dict:
    evidence = {"evidence_id": "DSE-0001", "option_id": "OPT-0002", "evidence_or_precedent": "The minutes", "cites": [_ref(case)],
                "tier": "DAS:C", "upstream_tier": "TAS:F", "comparability_note": "Same company", "direction": "FAVORS",
                "independence": "INDEPENDENT", "limitations": []}
    evidence.update(row)
    return {"decision_id": "DEC-0001", "options": [
        {"option_id": "OPT-0001", "option": "Wait for her reply", "status": "EXISTING", "option_type": "STATUS_QUO",
         "resourcing_and_timeline": "a week", "reversibility_note": None, "limitations": []},
        {"option_id": "OPT-0002", "option": "Publish the documented part now", "status": "NEWLY_GENERATED", "option_type": "SEQUENCED",
         "resourcing_and_timeline": "a day", "reversibility_note": "the rest can follow", "limitations": []}],
        "evidence_table": [evidence], "search_discipline_note": "Sought reasons not to wait; none found",
        "distance_check": "An outside editor would wait", "constraints": [
            {"constraint_id": "CST-0001", "constraint": "Legal review first", "source": None, "source_refs": [], "tier": None,
             "options_removed": [], "status": "HELD_AS_ASSUMPTION"}]}


def test_decision_runs_structure_and_the_workbench_writes_the_upstream_tier(client, monkeypatch):
    case = _case(client, tier="B")
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model(_framing()))
    framed = _suite_run(client, case, "das_framing", question="Ada North approved the transfer: publish now or wait?", context="The editor decides by Friday")
    assert framed.status_code == 200, framed.text
    fid = framed.json()["candidate_id"]
    client.post(f"/api/ai-analysis-candidates/{fid}/review", json={"decision": "accept"})

    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model(_options(case)))
    opts = _suite_run(client, case, "das_options", handoff_from=fid)
    assert opts.status_code == 200, opts.text
    body = client.get(f"/api/ai-analysis-candidates/{opts.json()['candidate_id']}").json()
    assert body["payload"]["evidence_table"][0]["upstream_tier"] == "TAS:B", "the source's own tier, never the model's"
    assert body["payload"]["evidence_table"][0]["tier"] == "DAS:C", "DAS's comparability tier is untouched"

    for broken, why in ((_options(case, independence="MOTIVATED_PARTY"), "DAS:F"), (_options(case, tier="B"), "tier")):
        monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, b=broken, **k: _Model(b))
        refused = _suite_run(client, case, "das_options", handoff_from=fid)
        assert refused.status_code == 422 and why in refused.text


def test_quantitative_framing_flags_a_number_no_record_states(client, monkeypatch):
    case = _case(client)
    answer = {
        "framing": {"framing_id": "QFRM-0001", "question": "Were the 2019 transfers larger than earlier ones?", "question_type": "COMPARATIVE",
                    "unit_of_analysis": "one payment", "target_population": "the company's payments", "data_coverage_expected": "2019 only",
                    "coverage_gap": "no earlier years", "claim_level": "POPULATION", "variables": [{"name": "amount", "definition": "paid", "unit": "GBP"}],
                    "answer_form": {"quantity": "difference", "unit": "GBP", "denominator": "none"},
                    "result_against_expected": "not yet testable", "data_viewed_before_framing": {"viewed": True, "fields_affected": []},
                    "modules_skipped": [{"module": "04", "reason": "the Workbench runs analyses"}]},
        "rival_set": {"rival_set_id": "QRIV-0001", "framing_id": "QFRM-0001", "phase": "EXPLORATORY", "round": 1,
                      "rivals_identified_so_far": [{"rival": "Inflation", "category": "COMMON_CAUSE",
                                                    "prediction": "Amounts near 40,000 rise by about 7,300 a year", "differs_from": [],
                                                    "from_hypothesis": None, "evidence": [_ref(case)]}],
                      "check": {"design": "Compare amounts by year", "outcomes": [], "assumptions": [], "weak_points": []},
                      "remaining_rivals": ["Inflation"], "data_needed": ["earlier years"]},
    }
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model(answer))
    run = _suite_run(client, case, "quant_framing", question="Ada North transfer amounts")
    assert run.status_code == 200, run.text
    flags = client.get(f"/api/ai-analysis-candidates/{run.json()['candidate_id']}").json()["trace"]["suite_checks"]["flags"]
    assert any("7,300" in f for f in flags) and not any("40,000" in f for f in flags)
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model({**answer, "rival_set": {**answer["rival_set"], "framing_id": "QFRM-0002"}}))
    assert _suite_run(client, case, "quant_framing").status_code == 422


def test_research_vetting_keeps_its_own_tier_scale_and_assigns_no_certainty(client, monkeypatch):
    case = _case(client)
    source = {"source_id": "RSRC-0001", "record": _ref(case), "citation": "Board minutes", "tier": 3, "claim_specific_tier_exceptions": [],
              "venue_legitimacy_flag": "STANDARD", "provenance_flag": "VERIFIED", "source_level": "PRIMARY", "study_design": None,
              "sample_size": None, "funding_coi_status": "NOT_CHECKED", "funding_conflicts_of_interest": None, "disclosed_limitations": [],
              "quality_flag": "CLEAN", "currency_status": "UNABLE_TO_VERIFY", "retrieved_at": None, "access_status": "FULL_TEXT"}
    claim = {"claim_id": "RCLM-0001", "claim_text": "Boards minute approvals", "supporting_sources": [
        {"source_id": "RSRC-0001", "tier": 3, "pinpoint_location": "p2", "evidence": [_ref(case)]}], "contradicting_sources": [],
             "corroboration_verdict": "SINGLE_SOURCE", "corroboration_basis": "one", "replication_status": "NOT_APPLICABLE",
             "extrapolation_flag": False, "warrant": "stated"}
    answer = {"scope_and_limitations": "Partial: no search ran", "not_research_sources": [], "sources": [source], "claims": [claim]}
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model(answer))
    assert _suite_run(client, case, "research_vetting").status_code == 200
    for broken, why in (({**answer, "sources": [{**source, "tier": "A"}]}, "tier"), ({**answer, "sources": [{**source, "tier": 9}]}, "1-8"),
                        ({**answer, "claims": [{**claim, "certainty_of_evidence": "HIGH"}]}, "Module 09"),
                        ({**answer, "claims": [{**claim, "corroboration_verdict": "CORROBORATED"}]}, "fewer than two")):
        monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, b=broken, **k: _Model(b))
        refused = _suite_run(client, case, "research_vetting")
        assert refused.status_code == 422 and why in refused.text, refused.text


def test_the_plan_shows_the_hand_over_and_the_next_systems(client, monkeypatch):
    case = _case(client)
    cid = _accepted_synthesis(client, monkeypatch, case)
    tas_plan = client.post(f"/api/investigations/{case['inv']}/assistant/plan", json={"module": "case_synthesis", "question": "Who approved it?"})
    assert tas_plan.status_code == 200, tas_plan.text
    states = {s["system"]: s["state"] for s in tas_plan.json()["systems"]}
    assert states["TAS"] == "runs" and states["LAS"] == states["EGS"] == states["EHS"] == "next_run" and states["DAS"] == "not_expected"

    plan = client.post(f"/api/investigations/{case['inv']}/assistant/plan", json={"module": "evidence_plan", "question": "Plan it", "handoff_from": cid})
    assert plan.status_code == 200, plan.text
    steps = plan.json()["steps"]
    assert steps[0]["key"] == "handoff" and "TAS record_existence" in steps[0]["detail"]
    assert plan.json()["system"] == "EGS 01"
    assert client.post(f"/api/investigations/{case['inv']}/assistant/plan", json={"module": "evidence_plan", "question": "Plan it"}).status_code == 400


def test_a_suite_answer_is_reviewed_part_by_part(client, monkeypatch):
    case = _case(client)
    cid = _accepted_synthesis(client, monkeypatch, case)
    monkeypatch.setattr(reasoning_module, "get_llm_client", lambda *a, **k: _Model(_plan(case)))
    run = _suite_run(client, case, "evidence_plan", handoff_from=cid)
    pid = run.json()["candidate_id"]
    kept = client.post(f"/api/ai-analysis-candidates/{pid}/claim-review", json={"claim_id": "GPLN-0001", "decision": "keep"})
    assert kept.status_code == 200, kept.text
    assert client.post(f"/api/ai-analysis-candidates/{pid}/claim-review", json={"claim_id": "GPLN-0404", "decision": "keep"}).status_code == 404
