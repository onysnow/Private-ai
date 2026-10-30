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
from app.models.domain import (
    Document,
    DocumentChunk,
    ExtractionCandidate,
    RelationshipEdge,
    TimelineEvent,
)
from app.patterns import engine
from app.services import demo_cases
from app.services.documents import extract_document, own_part
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


def test_no_case_holds_an_ownership_loop():
    """The ownership loop (BO-001) is kept for the tutorial, not as a case
    (Ony, 11 Oct 2026), so no case may be made to describe one."""
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


def test_each_download_is_counted_for_the_loading_bar():
    """The loading bar counts each document as its download starts."""
    seen = []
    docs = demo_cases.manifest("vekselberg-shell-network")
    by_url = {d["url"]: d for d in docs}
    def offline(url):
        raise OSError("offline")
    with pytest.raises(demo_cases.DemoDownloadError):
        demo_cases.fetch_documents("vekselberg-shell-network", offline, on_fetched=lambda: seen.append(1))
    assert len(seen) == 1 and len(by_url) == len(docs)
    demo_cases.set_state("vekselberg-shell-network", state="downloading", fetched=0, to_fetch=len(docs))
    for _ in docs:
        demo_cases.count_fetched("vekselberg-shell-network")
    state = demo_cases._states["vekselberg-shell-network"]
    assert (state["fetched"], state["to_fetch"]) == (len(docs), len(docs))
    demo_cases.set_state("vekselberg-shell-network", state="idle")


def _pages(doc_id: str) -> list[dict]:
    fixture = json.loads((FIXTURES / f"{doc_id}.json").read_text(encoding="utf-8"))
    return [{"locator": f"page {n}", "page_number": int(n), "text": fixture["pages"][n]} for n in sorted(fixture["pages"], key=int)]


@pytest.mark.parametrize("case_id", demo_cases.CASE_IDS)
def test_a_document_printed_among_others_is_read_for_its_own_part_only(case_id):
    """The Federal Register PDF of the OFAC notice begins with the end of a railway notice and ends with the start of a
    meeting notice: the part named in the manifest covers every quote the case takes from it, and none of the others."""
    for meta in demo_cases.manifest(case_id):
        if not meta.get("part"):
            continue
        pages = _pages(meta["id"])
        shares, not_found = own_part(pages, meta["part"])
        assert not_found is None
        own = {p["locator"]: p["text"][a:b] for p, share in zip(pages, shares) if share for a, b in [share]}
        assert own["page 1"].startswith("DEPARTMENT OF THE TREASURY") and own["page 3"].endswith("[FR Doc. 2018–09147")
        assert not any("CSX" in text or "Federal Advisory Committee" in text for text in own.values())
        for q in _quotes(demo_cases.records(case_id)):
            if q["doc"] == meta["id"]:
                assert re.sub(r"\s+", " ", q["quote"]).strip() in own[q["locator"].split(",")[0]], q


def test_proposals_come_from_the_documents_own_part_and_every_page_is_kept(tmp_path):
    docs = [(meta, f"stand-in for {meta['id']}".encode()) for meta in demo_cases.manifest("deripaska-en-rusal")]
    with SessionLocal() as db:
        inv, _ = demo_cases.build(db, "deripaska-en-rusal", docs, storage_dir=tmp_path)
        doc = db.query(Document).filter_by(investigation_id=inv.id, filename="fr-2018-09147-ofac-sdn-notice.pdf").one()
        pages = _pages("fr-ofac-2018-09147")
        extract_document(db, doc.id, text=(pages, []))
        chunks = {c.id: c for c in db.query(DocumentChunk).filter_by(document_id=doc.id)}
        assert sorted(c.text for c in chunks.values()) == sorted(p["text"] for p in pages)  # the whole file stays searchable
        proposals = db.query(ExtractionCandidate).filter_by(document_id=doc.id).all()
        assert proposals
        said = " ".join(str(p.payload.get("caption") or p.payload.get("text") or p.payload.get("quote")) for p in proposals)
        assert "CSX" not in said and "Federal Railroad" not in said and "Federal Advisory Committee" not in said
        for p in proposals:  # each span still points into its page's text
            span, text = p.payload["span"], chunks[p.chunk_id].text
            found = text[span["start_char"]:span["end_char"]]
            assert found == (p.payload.get("caption") or p.payload.get("text") or p.payload.get("quote")) or p.candidate_type == "entity", p.payload
            assert span["start_char"] >= 0 and span["end_char"] <= len(text)


def test_a_part_whose_start_is_not_found_reads_the_whole_file_and_says_so():
    pages = [{"locator": "page 1", "text": "Nothing here starts the notice."}]
    shares, not_found = own_part(pages, {"from": "DEPARTMENT OF THE TREASURY", "to": "[FR Doc."})
    assert shares == [(0, len(pages[0]["text"]))] and "was not found" in not_found


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
        flags = engine.run(db, inv.id)
        assert flags is not None
        return flags


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
    # 144 deposits with no purpose recorded, into five accounts: one flag per account, not one per deposit.
    no_purpose = [f for f in flags["flags"] if f["indicator_id"] == "BO-033"]
    assert len(no_purpose) == 5 and sum(f["facts"]["payments"] for f in no_purpose) == 144


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
    monkeypatch.setattr(demo_cases, "fetch_documents", lambda cid, **_: [(meta, b"stand-in") for meta in demo_cases.manifest(cid)])
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
    monkeypatch.setattr(demo_cases, "fetch_documents", lambda cid, **_: (_ for _ in ()).throw(AssertionError("must not start")))
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

    def failing_fetch(cid, **_):
        calls.append(cid)
        raise demo_cases.DemoDownloadError("offline")

    monkeypatch.setattr(demo_cases, "fetch_documents", failing_fetch)
    for case_id in ("us-v-anise-structuring", "vekselberg-shell-network"):
        assert client.post(f"/api/demo/cases/{case_id}").json()["state"] == "failed"
        demo_cases.set_state(case_id, state="idle")
    assert calls == ["us-v-anise-structuring", "vekselberg-shell-network"]
    assert not routes_demo._build_lock.locked() and routes_demo._building is None


def test_an_allegation_is_testimony_and_an_authoritys_own_record_is_primary(tmp_path):
    """A complaint's allegations alone never confirm a claim: Tier B (testimony to corroborate), the OFAC notice Tier A."""
    from app.models.domain import Source

    docs = [(meta, f"stand-in for {meta['id']}".encode()) for meta in demo_cases.manifest("vekselberg-shell-network")]
    with SessionLocal() as db:
        inv, _ = demo_cases.build(db, "vekselberg-shell-network", docs, storage_dir=tmp_path)
        tiers = {d.filename: db.get(Source, d.source_id).source_tier for d in db.query(Document).filter_by(investigation_id=inv.id)}
    admitted = {m["filename"]: m.get("admitted") for m, _ in docs}
    assert tiers and all(tiers[name] == ("A" if admitted[name] else "B") for name in tiers), tiers
    assert tiers["fr-2018-09147-ofac-sdn-notice.pdf"] == "A"
