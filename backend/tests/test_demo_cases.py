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


def test_only_the_jardine_record_holds_an_ownership_loop():
    """BO-001's one real case is the Jardine cross-holding, and its loop is the
    two links the judgment states; no other case is made to describe one."""
    import networkx as nx
    for case_id in demo_cases.CASE_IDS:
        g = nx.DiGraph([(r["source"], r["target"]) for r in demo_cases.records(case_id)["relationships"] if r["schema"] == "Ownership"])
        if case_id == "jardine-cross-holding":
            assert sorted(sorted(c) for c in nx.simple_cycles(g)) == [["jardine-matheson", "jardine-strategic"]]
        else:
            assert nx.is_directed_acyclic_graph(g), case_id


def test_the_jardine_loop_is_the_judgments_two_holdings():
    case = demo_cases.records("jardine-cross-holding")
    links = {(r["source"], r["target"]): r for r in case["relationships"]}
    there, back = links[("jardine-matheson", "jardine-strategic")], links[("jardine-strategic", "jardine-matheson")]
    assert there["properties"]["percentage"] == ["84.9"] and "84.9% of the shares in the Company" in there["evidence"][0]["quote"]
    assert back["properties"]["percentage"] == ["59.3"] and "59.3% of the shares in Jardine Matheson" in back["evidence"][0]["quote"]
    # "the Company" in the judgment is Jardine Strategic Holdings Limited.
    strategic = next(e for e in case["entities"] if e["key"] == "jardine-strategic")
    assert "Jardine Strategic Holdings Limited (“the Company”)" in strategic["evidence"][0]["quote"]


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


def test_deripaska_raises_shared_address_however_it_is_written(tmp_path):
    """Basic Element and En+ give "Esplanade 44, Saint Helier JE4 9WG, Jersey";
    Rusal gives "44 Esplanade, St. Helier JE4 9WG, Jersey": one address. En+ owns
    Rusal, but no link joins Basic Element to either, so all three stand, and the
    flag says which pairs are unlinked. The Moscow address is written "St.", "Str."
    and "Street": En+ is linked to both other holders and drops out; Rusal and
    EuroSibEnergo (both En+'s, with no link between them) share it."""
    flags = _load("deripaska-en-rusal", tmp_path)
    shared = {f["facts"]["value"]: f for f in flags["flags"] if f["indicator_id"] == "BO-032"}
    assert set(shared) == {"Esplanade 44, Saint Helier JE4 9WG, Jersey", "1 Vasilisy Kozhinoy Street, Moscow 121096, Russia"}
    jersey = shared["Esplanade 44, Saint Helier JE4 9WG, Jersey"]
    assert [p["name"] for p in jersey["parties"]] == ["Basic Element Limited", "En+ Group plc", "United Company Rusal plc (Rusal)"]
    assert jersey["facts"]["spellings"] == ["Esplanade 44, Saint Helier JE4 9WG, Jersey", "44 Esplanade, St. Helier JE4 9WG, Jersey"]
    assert "United Company Rusal plc (Rusal): “44 Esplanade, St. Helier JE4 9WG, Jersey”" in jersey["facts"]["as_written"]
    assert jersey["facts"]["no_link"] == ("no link in the records joins Basic Element Limited and En+ Group plc; "
                                          "Basic Element Limited and United Company Rusal plc (Rusal)")
    moscow = shared["1 Vasilisy Kozhinoy Street, Moscow 121096, Russia"]
    assert [p["name"] for p in moscow["parties"]] == ["JSC EuroSibEnergo (ESE)", "United Company Rusal plc (Rusal)"]
    assert moscow["facts"]["spellings"] == ["1 Vasilisy Kozhinoy Street, Moscow 121096, Russia", "1 Vasilisy Kozhinoy Str., Moscow 121096, Russia"]
    assert "also written “1 Vasilisy Kozhinoy Str., Moscow 121096, Russia”" in moscow["summary"]
    assert set(_counts(flags)) == {"BO-032"}


def test_jardine_raises_the_ownership_loop(tmp_path):
    flags = _load("jardine-cross-holding", tmp_path)
    loops = [f for f in flags["flags"] if f["indicator_id"] == "BO-001"]
    assert len(loops) == 1
    assert sorted(loops[0]["facts"]["loop"]) == ["Jardine Matheson Holdings Limited", "Jardine Strategic Holdings Limited"]
    assert loops[0]["facts"]["parties_in_loop"] == 2
    assert {p["name"] for p in loops[0]["parties"]} == {"Jardine Matheson Holdings Limited", "Jardine Strategic Holdings Limited"}
    assert set(_counts(flags)) == {"BO-001"}


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


def test_one_demo_loads_at_a_time(monkeypatch):
    """Two builds at once can break SQLite. While one case loads, asking for it
    again answers with its progress; asking for another is refused, naming it."""
    from app.api import routes_demo
    monkeypatch.setattr(demo_cases, "fetch_documents", lambda cid: (_ for _ in ()).throw(AssertionError("must not start")))
    with routes_demo._one_build_at_a_time("deripaska-en-rusal"):
        demo_cases.set_state("deripaska-en-rusal", state="building", step="Adding the parties, links, events and claims")
        again = client.post("/api/demo/cases/deripaska-en-rusal")
        assert again.status_code == 200 and again.json()["state"] == "building"
        other = client.post("/api/demo/cases/us-v-anise-structuring")
        assert other.status_code == 409
        assert "Deripaska" in other.json()["detail"] or demo_cases.summary("deripaska-en-rusal")["title"] in other.json()["detail"]
        one_mdb = client.post("/api/demo/1mdb")
        assert one_mdb.status_code == 409 and "still loading" in one_mdb.json()["detail"]
    with routes_demo._one_build_at_a_time(routes_demo.ONE_MDB):
        assert "1MDB" in client.post("/api/demo/cases/us-v-anise-structuring").json()["detail"]
    demo_cases.set_state("deripaska-en-rusal", state="idle")


def test_a_failed_load_lets_the_next_one_start(monkeypatch):
    """The lock is let go however a load ends."""
    from app.api import routes_demo
    calls = []

    def failing_fetch(cid):
        calls.append(cid)
        raise demo_cases.DemoDownloadError("offline")

    monkeypatch.setattr(demo_cases, "fetch_documents", failing_fetch)
    for case_id in ("us-v-anise-structuring", "vekselberg-shell-network"):
        assert client.post(f"/api/demo/cases/{case_id}").json()["state"] == "failed"
        demo_cases.set_state(case_id, state="idle")
    assert calls == ["us-v-anise-structuring", "vekselberg-shell-network"]
    assert not routes_demo._build_lock.locked() and routes_demo._building is None
