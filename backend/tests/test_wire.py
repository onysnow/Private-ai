"""The Wire (app/services/wire.py): every party placed on one map, accounts drawn
on their holder, links with their family, amount and quotes, and dated events; and
one link's sources for the link panel (SEE_1), each with the page its quote is on."""

from __future__ import annotations

import hashlib

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document, DocumentChunk, PatternFlag, Source

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _party(inv: str, name: str, schema: str = "Company", **props) -> str:
    return ok(client.post("/api/entities", json={"investigation_id": inv, "schema": schema, "caption": name,
                                                 "properties": {"name": [name], **props}}))["id"]


def _link(inv: str, schema: str, s: str, t: str, **props) -> str:
    return ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": schema, "source_entity_id": s,
                                                      "target_entity_id": t, "properties": props}))["id"]


def test_the_wire_places_every_party_rolls_accounts_into_holders_and_keeps_link_facts():
    inv = ok(client.post("/api/investigations", json={"name": "Harbour wire"}))["id"]
    fund = _party(inv, "Meridian Holdings Ltd (MHL)", jurisdiction=["gb"], notes=["The fund at the top."])
    shell = _party(inv, "Bellcastle Trading Group")
    owner = _party(inv, "Ada Varga", "Person")
    account = _party(inv, "Account 0042", "BankAccount")
    alone = _party(inv, "Orrin Shipping SA")
    _link(inv, "Ownership", owner, shell)
    _link(inv, "Ownership", shell, account)
    _link(inv, "Payment", fund, account, amount=["2400000"], currency=["usd"], date=["2011-05-23"], purpose=["consultancy"])
    ok(client.post("/api/timeline-events", json={"investigation_id": inv, "title": "Fund set up", "date_start": "2009-07-01"}))

    body = ok(client.get(f"/api/investigations/{inv}/wire"))
    ents = {e["id"]: e for e in body["entities"]}
    assert set(ents) == {fund, shell, owner, account, alone}
    assert ents[fund]["short"] == "Meridian Holdings Ltd" and ents[fund]["jur"] == "gb" and ents[fund]["note"] == "The fund at the top."
    assert ents[owner]["kind"] == "person" and ents[account]["kind"] == "account"
    # The account sits on its holder and in the holder's group.
    assert ents[account]["holder"] == shell and (ents[account]["x"], ents[account]["y"]) == (ents[shell]["x"], ents[shell]["y"])
    assert ents[account]["c"] == ents[shell]["c"] >= 0
    # A party linked to no one sits in the bottom row, in no group.
    assert ents[alone]["c"] == -1 and ents[alone]["y"] >= 1560
    for e in ents.values():
        assert 0 <= e["x"] <= 2400 and 0 <= e["y"] <= 1700
    pay = next(link for link in body["links"] if link["fam"] == "money")
    assert (pay["s"], pay["t"], pay["amount"], pay["cur"], pay["date"], pay["role"]) == (fund, account, 2400000.0, "USD", "2011-05-23", "consultancy")
    assert {link["fam"] for link in body["links"]} == {"owns", "money"}
    assert body["events"] == [{"date": "2009-07-01", "title": "Fund set up", "entity": None}]
    # The same case lays out the same way each time.
    again = {e["id"]: (e["x"], e["y"]) for e in ok(client.get(f"/api/investigations/{inv}/wire"))["entities"]}
    assert again == {i: (e["x"], e["y"]) for i, e in ents.items()}


def test_the_wire_of_an_empty_case_is_empty():
    inv = ok(client.post("/api/investigations", json={"name": "Nothing yet"}))["id"]
    assert ok(client.get(f"/api/investigations/{inv}/wire")) == {"investigation_id": inv, "entities": [], "links": [], "events": []}
    assert client.get("/api/investigations/nope/wire").status_code == 404


def test_reading_the_wire_never_runs_the_rules_and_shows_what_the_last_run_left():
    from app.api.routes_case_home import get_wire
    from app.core.authorization import AuthorizationScope, authorization_scope_context
    from app.db.session import SessionLocal
    from tests.stored_rules_rows import stored

    inv = ok(client.post("/api/investigations", json={"name": "Wire: reading never writes"}))["id"]
    a, b, c = _party(inv, "A Ltd"), _party(inv, "B Ltd"), _party(inv, "C Ltd")
    for x, y in ((a, b), (b, c), (c, a)):
        _link(inv, "Ownership", x, y)
    before = stored(inv)
    body = ok(client.get(f"/api/investigations/{inv}/wire"))
    assert all(e["flags"] is None for e in body["entities"]), "never run: no flag on any party yet"
    assert stored(inv) == before == {"flags": {}, "checks": {}, "run": None}, "reading the Wire runs no rule"

    ok(client.post(f"/api/investigations/{inv}/red-flags/run"))
    ran = stored(inv)
    body = ok(client.get(f"/api/investigations/{inv}/wire"))
    flagged = {e["id"] for e in body["entities"] if e["flags"]}
    assert flagged == {a, b, c}, "after a run the Wire shows the circle's flag on each party"
    assert stored(inv) == ran

    d = _party(inv, "D Ltd")
    _link(inv, "Payment", c, d, amount=["5000"], currency=["EUR"])
    again = ok(client.get(f"/api/investigations/{inv}/wire"))
    assert {e["id"] for e in again["entities"] if e["flags"]} == flagged, "the new party carries no flag until the next run"
    assert d in {e["id"] for e in again["entities"]}, "the records themselves are read as they are"
    assert stored(inv) == ran
    with SessionLocal() as db, authorization_scope_context(AuthorizationScope("reader-1", frozenset({inv}), role="viewer")):
        read = get_wire(inv, db)
    assert {e["id"] for e in read["entities"] if e["flags"]} == flagged, "a reader reads the stored flags"
    assert stored(inv) == ran


def test_a_links_sources_give_each_quote_its_page_its_review_and_the_flags_resting_on_the_link(tmp_path):
    inv = ok(client.post("/api/investigations", json={"name": "Link panel"}))["id"]
    harbour = _party(inv, "Harbour Nominees Ltd")
    kestrel = _party(inv, "Kestrel SA")
    link = _link(inv, "Directorship", harbour, kestrel, startDate=["2017-07-03"])
    body = b"Change of directors"
    path = tmp_path / "register.pdf"
    path.write_bytes(body)
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Register filing", source_type="document")
        db.add(src)
        db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="register.pdf", sha256=hashlib.sha256(body).hexdigest(),
                       storage_path=str(path), extraction_status="complete")
        db.add(doc)
        db.flush()
        db.add(DocumentChunk(document_id=doc.id, locator="page 1", page_number=1, ordinal=0, text="Luxembourg business register"))
        db.add(DocumentChunk(document_id=doc.id, locator="page 2", page_number=2, ordinal=1,
                             text="Harbour Nominees Ltd appointed director, 3 July 2017"))
        typed = Source(investigation_id=inv, title="Board minutes (typed)", source_type="web", url="https://example.test/minutes")
        db.add(typed)
        db.flush()
        db.add(PatternFlag(investigation_id=inv, indicator_id="ML-023", fingerprint="f", level="textbook", parties=[harbour, kestrel],
                           links=[link], facts={"summary": "Circular ownership"}))
        db.add(PatternFlag(investigation_id=inv, indicator_id="BO-031", fingerprint="g", level="faint", parties=[kestrel], links=["other"]))
        db.commit()
        src_id, typed_id, doc_id = src.id, typed.id, doc.id
    filed = ok(client.post("/api/evidence", json={"source_id": src_id, "quote": "appointed director, 3 July 2017", "locator": "p.2"}))
    minutes = ok(client.post("/api/evidence", json={"source_id": typed_id, "quote": "signed for Harbour Nominees", "locator": "p.2 ¶3"}))
    for ev in (filed, minutes):
        ok(client.post(f"/api/relationships/{link}/evidence", json={"evidence_id": ev["id"]}))
    ok(client.post(f"/api/relationships/{link}/evidence/{filed['id']}/reviews", json={"stance": "supports", "rationale": "the filing says it"}))

    out = ok(client.get(f"/api/relationships/{link}/sources"))
    assert out["relationship_id"] == link
    first, second = out["evidence"]
    assert (first["evidence_id"], first["document_id"], first["filename"], first["page"]) == (filed["id"], doc_id, "register.pdf", 2)
    assert first["source_title"] == "Register filing" and first["stance"] == "supports" and first["reviewed_at"]
    # Typed in by hand: no file, so no page to draw, and not reviewed yet.
    assert (second["document_id"], second["page"], second["stance"]) == (None, None, None)
    assert second["quote"] == "signed for Harbour Nominees" and second["locator"] == "p.2 ¶3"
    # Only the open flag that rests on this link.
    assert out["flags"] == [{"flag_id": out["flags"][0]["flag_id"], "id": "ML-023", "level": "textbook", "text": "Circular ownership"}]
    assert client.get("/api/relationships/nope/sources").status_code == 404
