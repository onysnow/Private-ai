"""The small real demo cases (app/services/demo_cases.py): every quote is in the
page it cites, the records hang together, a document that is not the pinned
file is refused, and loading each case raises the red flags it is there for.

The documents are not downloaded here: tests/fixtures/demo_cases/ holds the
text of each cited page, taken from the pinned PDFs' text layer (PyMuPDF,
whitespace collapsed), with the PDF's sha256 so it cannot drift from the file
the case pins."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document, RelationshipEdge, TimelineEvent
from app.patterns import engine
from app.services import demo_cases
from app.services.relationships import RELATIONSHIP_SCHEMAS

client = TestClient(app)
FIXTURES = Path(__file__).parent / "fixtures" / "demo_cases"


def _quotes(case: dict) -> list[dict]:
    out = [q for row in case["entities"] + case["relationships"] + case["claims"] for q in row.get("evidence") or []]
    return out + [ev["evidence"] for ev in case["events"]]


@pytest.mark.parametrize("case_id", demo_cases.CASE_IDS)
def test_every_quote_is_in_the_page_it_cites(case_id):
    pinned = {d["id"]: d["sha256"] for d in demo_cases.manifest(case_id)}
    for q in _quotes(demo_cases.records(case_id)):
        fixture = json.loads((FIXTURES / f"{q['doc']}.json").read_text(encoding="utf-8"))
        assert fixture["sha256"] == pinned[q["doc"]], f"{q['doc']}: the page text is not from the pinned file"
        page = re.match(r"page (\d+)\b", q["locator"])
        assert page, q["locator"]
        text = fixture["pages"][page.group(1)]
        assert re.sub(r"\s+", " ", q["quote"]).strip() in text, f"{q['doc']} {q['locator']}: {q['quote']!r}"


@pytest.mark.parametrize("case_id", demo_cases.CASE_IDS)
def test_the_records_hang_together(case_id):
    case = demo_cases.records(case_id)
    docs = {d["id"] for d in demo_cases.manifest(case_id)}
    keys = [e["key"] for e in case["entities"]]
    assert len(set(keys)) == len(keys), "entity keys are unique"
    assert all(q["doc"] in docs for q in _quotes(case))
    assert all(e.get("evidence") for e in case["entities"]) and all(r.get("evidence") for r in case["relationships"])
    for r in case["relationships"]:
        assert r["schema"] in RELATIONSHIP_SCHEMAS and r["source"] in keys and r["target"] in keys, r
        for amount in r["properties"].get("amount", []):
            assert re.fullmatch(r"\d+(\.\d+)?", amount), amount
        for date in r["properties"].get("date", []):
            assert re.fullmatch(r"\d{4}(-\d{2}(-\d{2})?)?", date), date
        for pct in r["properties"].get("percentage", []):
            assert 0 < float(pct) <= 100, pct
    assert all(ev.get("entity") in (None, *keys) for ev in case["events"])
    assert all(re.fullmatch(r"[0-9a-f]{64}", d["sha256"]) for d in demo_cases.manifest(case_id))
    assert "real case" in case["investigation"]["name"].lower()


def test_no_case_fakes_an_ownership_loop():
    """BO-001 has no real case here: none of these records describes one."""
    import networkx as nx
    for case_id in demo_cases.CASE_IDS:
        g = nx.DiGraph([(r["source"], r["target"]) for r in demo_cases.records(case_id)["relationships"] if r["schema"] == "Ownership"])
        assert nx.is_directed_acyclic_graph(g), case_id


def test_the_anise_deposits_are_the_indictments():
    case = demo_cases.records("us-v-anise-structuring")
    deposits = [r for r in case["relationships"] if r["schema"] == "Payment"]
    count_two = [r for r in deposits if "Count Two" in r["evidence"][0]["locator"]]
    assert len(count_two) == 138 and len(deposits) == 144
    assert sum(9000 <= float(r["properties"]["amount"][0]) < 10000 for r in count_two) == 74
    assert {r["source"] for r in deposits} == {"anise"} and all(r["properties"]["currency"] == ["USD"] for r in deposits)
    assert not any("purpose" in r["properties"] for r in deposits), "the indictment states no purpose"
    # Count One's three rows add up to the total the indictment gives.
    assert sum(float(r["properties"]["amount"][0]) for r in deposits if "Count One" in r["evidence"][0]["locator"]) == 38400


def test_a_document_that_is_not_the_pinned_file_is_refused():
    with pytest.raises(demo_cases.DemoDownloadError, match="fingerprint"):
        demo_cases.fetch_documents("deripaska-en-rusal", lambda url: b"not the notice")


def _load(case_id: str, tmp_path: Path) -> dict:
    docs = [(meta, f"stand-in for {meta['id']}".encode()) for meta in demo_cases.manifest(case_id)]
    case = demo_cases.records(case_id)
    with SessionLocal() as db:
        inv, document_ids = demo_cases.build(db, case_id, docs, storage_dir=tmp_path)
        assert inv.is_demo and inv.name == case["investigation"]["name"]
        assert len(document_ids) == len(docs) == db.query(Document).filter_by(investigation_id=inv.id).count()
        assert db.query(RelationshipEdge).filter_by(investigation_id=inv.id).count() == len(case["relationships"])
        assert db.query(TimelineEvent).filter_by(investigation_id=inv.id).count() == len(case["events"])
        assert demo_cases.existing(db, case_id).id == inv.id
        return engine.flags(db, inv.id)


def _counts(flags: dict) -> Counter:
    return Counter(f["indicator_id"] for f in flags["flags"])


def test_anise_raises_the_structuring_flag(tmp_path):
    flags = _load("us-v-anise-structuring", tmp_path)
    ml021 = [f for f in flags["flags"] if f["indicator_id"] == "ML-021"]
    assert len(ml021) == 1
    facts = ml021[0]["facts"]
    # 74 in Count Two's table, and the $9,500 deposit of 2 February 2010 in Count One's.
    assert facts["count"] == 75 and facts["first_date"] == "2009-12-08" and facts["last_date"] == "2012-01-26"
    assert ml021[0]["parties"][0]["name"] == "Magdy Fouad Anise"
    assert not {"BO-001", "BO-002", "BO-032", "ML-023"} & set(_counts(flags))


def test_vekselberg_raises_layering_and_shared_address(tmp_path):
    flags = _load("vekselberg-shell-network", tmp_path)
    layers = {f["facts"]["bottom"]: (f["facts"]["layers"], f["level"]) for f in flags["flags"] if f["indicator_id"] == "BO-002"}
    assert layers["Fisher Island Penthouse"] == (6, "strong")
    assert layers["Southampton House"] == (5, "faint")
    assert layers["Lamesa Holding S.A."] == (4, "faint")
    shared = [f for f in flags["flags"] if f["indicator_id"] == "BO-032"]
    assert len(shared) == 1 and shared[0]["facts"]["value"] == "Commerce House, 1 Bowring Road, Ramsey, Isle of Man"
    assert {p["name"] for p in shared[0]["parties"]} == {"“Tango” (Isle of Man)", "Jersey bank account in the name “Tango”"}
    assert "BO-001" not in _counts(flags)


def test_deripaska_raises_shared_address_on_the_exact_spelling_only(tmp_path):
    """Basic Element and En+ give "Esplanade 44, Saint Helier JE4 9WG, Jersey";
    Rusal gives "44 Esplanade, St. Helier JE4 9WG, Jersey". The rule's matching
    (lower case, punctuation folded) treats only the first two as one address."""
    flags = _load("deripaska-en-rusal", tmp_path)
    shared = [f for f in flags["flags"] if f["indicator_id"] == "BO-032"]
    assert len(shared) == 1
    assert {p["name"] for p in shared[0]["parties"]} == {"Basic Element Limited", "En+ Group plc"}
    assert shared[0]["facts"]["value"] == "Esplanade 44, Saint Helier JE4 9WG, Jersey"
    assert not {"BO-001", "BO-002", "ML-021"} & set(_counts(flags))


def test_the_routes_list_and_follow_each_case(tmp_path):
    for case_id in demo_cases.CASE_IDS:  # another test may have left a failed load behind
        demo_cases.set_state(case_id, state="idle")
    listed = client.get("/api/demo/cases").json()
    assert [c["id"] for c in listed] == list(demo_cases.CASE_IDS)
    assert all(c["progress"]["state"] == "idle" and c["documents"] >= 1 for c in listed)
    assert client.get("/api/demo/cases/not-a-case").status_code == 422
    docs = [(meta, b"stand-in") for meta in demo_cases.manifest("deripaska-en-rusal")]
    with SessionLocal() as db:
        inv_id = demo_cases.build(db, "deripaska-en-rusal", docs, storage_dir=tmp_path)[0].id
    body = client.get("/api/demo/cases/deripaska-en-rusal").json()
    assert body["investigation_id"] == inv_id and body["documents"] == 2
    # Loading again changes nothing, and the other cases are their own.
    assert client.post("/api/demo/cases/deripaska-en-rusal").json()["investigation_id"] == inv_id
    assert client.get("/api/demo/cases/us-v-anise-structuring").json().get("investigation_id") is None


def test_a_load_that_stops_halfway_keeps_nothing(monkeypatch):
    """A half-made case would pass for the loaded one, so it is removed and the
    progress says what stopped the load."""
    case_id = "us-v-anise-structuring"
    monkeypatch.setattr(demo_cases, "fetch_documents", lambda cid: [(meta, b"stand-in") for meta in demo_cases.manifest(cid)])
    real_build = demo_cases.build

    def broken_build(db, cid, documents, *, storage_dir):
        from app.services import entities
        monkeypatch.setattr(entities, "create_entity", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("database is locked")))
        return real_build(db, cid, documents, storage_dir=storage_dir)

    monkeypatch.setattr(demo_cases, "build", broken_build)
    body = client.post(f"/api/demo/cases/{case_id}").json()
    assert body["state"] == "failed" and "database is locked" in body["error"] and body.get("investigation_id") is None
    with SessionLocal() as db:
        assert demo_cases.existing(db, case_id) is None
    demo_cases.set_state(case_id, state="idle")
