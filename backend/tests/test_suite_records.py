"""The app-side Authority System Suite gaps (docs/authority-suite/SUITE_GAPS.md): the
suite's closed lists match the suite, the fields and records are stored and
checked, and the Confirmed rule reads a source's tier and collapses restatements."""

import re
from pathlib import Path

from fastapi.testclient import TestClient

from app.ai import suite_vocab
from app.ai.authority_sdk import suite_text
from app.ai.suite_map import coverage
from app.main import app
from app.models import domain

client = TestClient(app)


def test_every_closed_list_matches_the_suite():
    for name, (file, line) in suite_vocab.VOCAB_SOURCES.items():
        text = suite_text(file)
        values = getattr(suite_vocab, name)
        if line is None:
            bullets = {m.strip().lower() for m in re.findall(r"^- ([A-Z][A-Z _]+)$", text, re.M)}
            missing = [x for x in values if x.lower() not in bullets]
        else:
            assert line in text, f"{name}: the line is gone from {file}"
            low = line.lower().replace("_", " ")
            missing = [x for x in values if x.lower().replace("_", " ") not in low]
        assert missing == [], f"{name}: {missing} not in {file}"


def test_every_recorded_gap_names_a_real_column_or_record_kind():
    from app.services.case_records import KINDS
    for gap in coverage()["suite_requires_app_lacks"]:
        where = gap.get("recorded_in")
        assert where, gap["what"]
        if where.startswith("record:"):
            assert where.split(":", 1)[1] in KINDS
        else:
            model, column = where.split(".")
            assert column in getattr(domain, model).__table__.columns, where


def _claim(inv):
    return client.post("/api/claims", json={"investigation_id": inv, "text": "Meridian paid Bellcastle", "status": "unverified",
                                            "confidence": 0.5}).json()["id"]


def _case():
    inv = client.post("/api/investigations", json={"name": "Suite fields"}).json()["id"]
    return inv, _claim(inv)


def _evidence(inv, url, source_type="web", tier=None):
    src = client.post("/api/sources", json={"investigation_id": inv, "title": url, "url": url, "source_type": source_type}).json()["id"]
    if tier:
        assert client.patch(f"/api/sources/{src}/suite", json={"source_tier": tier}).status_code == 200
    return client.post("/api/evidence", json={"source_id": src, "quote": "paid", "locator": "p. 1"}).json()["id"]


def test_claim_fields_are_checked_and_kept_as_a_review_event():
    _, claim = _case()
    assert client.patch(f"/api/claims/{claim}/suite", json={"classification": "GUESS", "rationale": "x"}).status_code == 400
    assert client.patch(f"/api/claims/{claim}/suite", json={"confidence_term": "LIKELY", "rationale": "x"}).status_code == 400  # no basis
    assert client.patch(f"/api/claims/{claim}/suite", json={"verification_verdict": "PARTIALLY VERIFIED", "rationale": "x"}).status_code == 400
    ok = client.patch(f"/api/claims/{claim}/suite", json={
        "classification": "ALLEGATION", "confidence_term": "LIKELY", "confidence_basis": "Two filings agree",
        "assumptions": ["The ledger is complete"], "rationale": "Read the filings", "reviewer_type": "AI_ASSISTED"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["classification"] == "ALLEGATION" and ok.json()["assumptions"] == ["The ledger is complete"]
    assert client.patch(f"/api/claims/{claim}/suite", json={"reviewer_type": "ROBOT", "rationale": "x"}).status_code == 400


def test_evidence_and_link_fields_are_checked():
    inv, _ = _case()
    a, b = _evidence(inv, "https://a.example/1"), _evidence(inv, "https://b.example/1")
    assert client.patch(f"/api/evidence/{a}/suite", json={"authenticity_status": "MAYBE"}).status_code == 400
    assert client.patch(f"/api/evidence/{a}/suite", json={"published_on": "last year"}).status_code == 400
    ok = client.patch(f"/api/evidence/{b}/suite", json={"restates_evidence_id": a, "authenticity_status": "PROVISIONAL", "published_on": "2015-03"})
    assert ok.status_code == 200 and ok.json()["restates_evidence_id"] == a
    assert client.patch(f"/api/evidence/{a}/suite", json={"restates_evidence_id": b}).status_code == 400  # a loop


def test_records_are_numbered_checked_and_amended_with_history():
    inv, claim = _case()
    url = f"/api/investigations/{inv}/case-records"
    # A reply is offered by a person; an exception names who decided it.
    assert client.post(url, json={"kind": "ROR", "body": {"subject_entity_id": "e1", "claim_ids": [claim], "status": "OFFERED"}}).status_code == 400
    assert client.post(url, json={"kind": "ROR", "body": {"subject_entity_id": "e1", "claim_ids": [claim], "status": "EXCEPTION",
                                                         "exception_reason": "Risk to a source"}}).status_code == 400
    # A negative result has a scope and lists nothing responsive.
    assert client.post(url, json={"kind": "RLOG", "body": {"search_objective": "Bellcastle filings", "systems_searched": ["Registry"],
                                                          "query_terms": ["Bellcastle"], "searched_at": "2026-10-12",
                                                          "negative_result": True}}).status_code == 400
    gap = client.post(url, json={"kind": "GAP", "body": {"unresolved_question": "Who signed?", "bears_on": [claim]}})
    assert gap.status_code == 200, gap.text
    assert gap.json()["record_id"] == "GAP-0001"
    assert client.post(url, json={"kind": "GAP", "body": {"unresolved_question": "When?", "bears_on": [claim]}}).json()["record_id"] == "GAP-0002"
    rid = gap.json()["id"]
    amended = client.patch(f"/api/case-records/{rid}", json={"body": {"unresolved_question": "Who signed the transfer?", "bears_on": [claim]}})
    assert amended.status_code == 200
    assert amended.json()["history"][0]["body"]["unresolved_question"] == "Who signed?"
    assert [r["record_id"] for r in client.get(url, params={"kind": "GAP"}).json()] == ["GAP-0001", "GAP-0002"]


def test_lead_outcome_and_link_status_are_checked():
    inv, _ = _case()
    lead = client.post("/api/leads", json={"investigation_id": inv, "title": "Ask the registry"}).json()["id"]
    assert client.patch(f"/api/leads/{lead}", json={"gathering_outcome": "LOST"}).status_code == 400
    assert client.patch(f"/api/leads/{lead}", json={"gathering_outcome": "NOT_HELD"}).json()["gathering_outcome"] == "NOT_HELD"


def _confirmed(claim):
    rules = client.get(f"/api/claims/{claim}/review-workspace").json()["done"]["confirmed"]["rules"]
    return {r["key"]: r["state"] for r in rules}


def test_confirmed_reads_the_tier_and_a_restatement_is_not_a_second_source():
    inv, claim = _case()
    a = _evidence(inv, "https://a.example/1", tier="B")
    b = _evidence(inv, "https://b.example/1", tier="B")
    for ev in (a, b):
        assert client.post(f"/api/claims/{claim}/evidence", json={"evidence_id": ev, "stance": "supports"}).status_code == 200
    assert _confirmed(claim)["independent"] == "met"
    client.patch(f"/api/evidence/{b}/suite", json={"restates_evidence_id": a})
    assert _confirmed(claim)["independent"] == "not_met"
    # Tier C never counts toward independence; tier E/F stay leads.
    claim2 = _claim(inv)
    for url, tier in (("https://c.example/1", "C"), ("https://d.example/1", "E")):
        client.post(f"/api/claims/{claim2}/evidence", json={"evidence_id": _evidence(inv, url, tier=tier), "stance": "supports"})
    rules = _confirmed(claim2)
    assert rules["independent"] == "not_met" and rules["not_leads_only"] == "met"
    # A Tier A record carries a fact alone, whatever its type.
    claim3 = _claim(inv)
    client.post(f"/api/claims/{claim3}/evidence", json={"evidence_id": _evidence(inv, "https://e.example/1", tier="A"), "stance": "supports"})
    assert _confirmed(claim3)["independent"] == "met"


def test_suite_records_and_restatements_travel_in_a_backup(tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db.session import Base, SessionLocal
    from app.services.exports import build_investigation_export, restore_investigation_export

    inv, claim = _case()
    original, repeat = _evidence(inv, "https://a.example/1"), _evidence(inv, "https://b.example/1")
    client.patch(f"/api/evidence/{repeat}/suite", json={"restates_evidence_id": original})
    gap = client.post(f"/api/investigations/{inv}/case-records", json={"kind": "GAP", "body": {"unresolved_question": "Who signed?", "bears_on": [claim]}}).json()
    with SessionLocal() as db:
        package, _ = build_investigation_export(db, inv, include_documents=False)
    engine = create_engine(f"sqlite:///{tmp_path / 'restored.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, autoflush=False, autocommit=False)() as db:
        restore_investigation_export(db, package, tmp_path / "restored-documents")
        assert db.get(domain.CaseRecord, gap["id"]).record_id == "GAP-0001"
        assert db.get(domain.Evidence, repeat).restates_evidence_id == original


def test_the_other_records_keep_their_rules():
    """HYP, CFLT, ESRC, EPIT and CAPT, each refused when it breaks the rule the
    suite states for it and kept when it does not (docs/authority-suite/SUITE_COVERAGE.md)."""
    inv, claim = _case()
    url = f"/api/investigations/{inv}/case-records"

    def post(kind, body):
        return client.post(url, json={"kind": kind, "body": body})

    # HYP: a kind from the suite's list.
    assert post("HYP", {"hypothesis": "The fee was for real work", "kind": "GUESS"}).status_code == 400
    assert post("HYP", {"hypothesis": "The fee was for real work", "kind": "INNOCENT_EXPLANATION",
                        "falsifiers": ["No deliverable exists"]}).json()["record_id"] == "HYP-0001"

    # CFLT: a resolution names its resolving evidence; the same-proposition test is stated.
    conflict = {"statement_a": {"statement": "Paid in March"}, "statement_b": {"statement": "Paid in May"},
                "same_proposition": True, "same_proposition_basis": "Same payment, same ledger",
                "conflict_type": "DIRECT CONTRADICTION"}
    assert post("CFLT", {**conflict, "resolution": "March is right"}).status_code == 400
    assert post("CFLT", {**conflict, "same_proposition_basis": ""}).status_code == 400
    assert post("CFLT", {**conflict, "resolution": "March is right", "resolving_evidence": ["ev-1"]}).status_code == 200

    # ESRC: a breach, or a waived step, names who decided, when and why.
    source = {"source_code_name": "HERON", "planned_step": "CONTACT"}
    assert post("ESRC", {**source, "breach_decision": "BREACH"}).status_code == 400
    assert post("ESRC", {**source, "steps_waived": ["metadata check"], "decided_by": "Editor"}).status_code == 400
    assert post("ESRC", {**source, "breach_decision": "BREACH", "decided_by": "Editor", "decided_at": "2026-10-24",
                         "decision_reason": "Court order"}).status_code == 200

    # EPIT: a decision is a named person's; OTHER grounds are stated.
    interest = {"public_interest": "EXPOSING_CRIME", "written_at": "2026-10-24"}
    assert post("EPIT", {**interest, "decision": "PUBLISH"}).status_code == 400
    assert post("EPIT", {**interest, "public_interest": "OTHER"}).status_code == 400
    assert post("EPIT", {**interest, "decision": "PUBLISH", "decided_by": "Editor"}).status_code == 200

    # CAPT: a SHA-256 hash and a custody log with at least one entry.
    capture = {"url": "https://example.test/filing", "captured_at": "2026-10-24", "hash_value": "a" * 64,
               "custody_log": [{"person": "Reporter", "time": "2026-10-24T10:00", "action": "captured"}]}
    assert post("CAPT", {**capture, "hash_value": "not-a-hash"}).status_code == 400
    assert post("CAPT", {**capture, "custody_log": []}).status_code == 400
    assert post("CAPT", capture).json()["record_id"] == "CAPT-0001"
