"""The Wire (app/services/wire.py): every party placed on one map, accounts drawn
on their holder, links with their family, amount and quotes, and dated events."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

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
    assert ok(client.get(f"/api/investigations/{inv}/wire")) == {"investigation_id": inv, "entities": [], "links": [], "events": [], "worked_out": []}
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


def test_each_quote_names_its_document_and_the_page_its_passage_is_on(tmp_path):
    import hashlib

    from app.db.session import SessionLocal
    from app.models.domain import Document, DocumentChunk, Source

    inv = ok(client.post("/api/investigations", json={"name": "Wire: the scan"}))["id"]
    nominee, kestrel = _party(inv, "Harbour Nominees Ltd"), _party(inv, "Kestrel SA")
    rel = _link(inv, "Directorship", nominee, kestrel, role=["director"])
    body = b"%PDF register"
    path = tmp_path / "register.pdf"
    path.write_bytes(body)
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Luxembourg business register", source_type="document")
        typed = Source(investigation_id=inv, title="A note", source_type="web", url="https://example.test/n")
        db.add_all([src, typed])
        db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="register.pdf", sha256=hashlib.sha256(body).hexdigest(),
                       storage_path=str(path), extraction_status="complete", mime_type="application/pdf")
        db.add(doc)
        db.flush()
        db.add(DocumentChunk(document_id=doc.id, locator="page 1", page_number=1, ordinal=0, text="Change of directors"))
        db.add(DocumentChunk(document_id=doc.id, locator="page 2", page_number=2, ordinal=1,
                             text="Harbour Nominees Ltd appointed director, 3 July 2017"))
        db.commit()
        src_id, typed_id, doc_id = src.id, typed.id, doc.id
    ev = ok(client.post("/api/evidence", json={"source_id": src_id, "quote": "Harbour  Nominees Ltd appointed director", "locator": "RCS B204417 p.2"}))
    note = ok(client.post("/api/evidence", json={"source_id": typed_id, "quote": "Nominee director since 2017", "locator": "web"}))
    for e in (ev, note):
        ok(client.post(f"/api/relationships/{rel}/evidence", json={"evidence_id": e["id"]}))

    link = next(lk for lk in ok(client.get(f"/api/investigations/{inv}/wire"))["links"] if lk["id"] == rel)
    by_ev = {q["evidence_id"]: q for q in link["ev"]}
    assert (by_ev[ev["id"]]["document_id"], by_ev[ev["id"]]["page"], by_ev[ev["id"]]["pdf"]) == (doc_id, 2, True)
    assert (by_ev[note["id"]]["document_id"], by_ev[note["id"]]["page"], by_ev[note["id"]]["pdf"]) == (None, None, False)
    assert link["flags"] == []


def test_the_app_works_out_indirect_ownership_and_never_stores_it():
    from app.db.session import SessionLocal
    from app.models.domain import RelationshipEdge

    inv = ok(client.post("/api/investigations", json={"name": "Wire: worked out"}))["id"]
    top, mid, low, other = _party(inv, "Top Holdings"), _party(inv, "Mid BV"), _party(inv, "Low SA"), _party(inv, "Other Ltd")
    a = _link(inv, "Ownership", top, mid, percentage=["50"])
    b = _link(inv, "Ownership", mid, low, percentage=["40"])
    c = _link(inv, "Ownership", top, other, percentage=["10"])
    d = _link(inv, "Ownership", other, low)           # no percentage: that path's share is not known
    with SessionLocal() as db:
        stored_before = db.query(RelationshipEdge).filter_by(investigation_id=inv).count()

    body = ok(client.get(f"/api/investigations/{inv}/wire"))
    worked = {(w["s"], w["t"]): w for w in body["worked_out"]}
    assert set(worked) == {(top, low)}, "only an owner reaching a company it does not own directly"
    w = worked[(top, low)]
    assert w["pct"] == "" and w["share_unknown_because"] == "1 of 2 path(s) have a link with no percentage"
    assert (w["rule"], w["rule_name"], w["paths"], w["steps"], w["fam"], w["schema"]) == ("indirect_ownership", "Indirect ownership", 2, 2, "owns", "Ownership")
    assert set(w["inputs"]) == {a, b, c, d} and w["flag_id"] is None and w["id"] == f"worked:{top}:{low}"
    assert {lk["id"] for lk in body["links"]} == {a, b, c, d}, "never mixed with the stored links"

    with SessionLocal() as db:
        assert db.query(RelationshipEdge).filter_by(investigation_id=inv).count() == stored_before, "reading stores nothing"

    inv2 = ok(client.post("/api/investigations", json={"name": "Wire: worked out, every share stated"}))["id"]
    top, mid, low, other = _party(inv2, "Top Holdings"), _party(inv2, "Mid BV"), _party(inv2, "Low SA"), _party(inv2, "Other Ltd")
    _link(inv2, "Ownership", top, mid, percentage=["50"])
    _link(inv2, "Ownership", mid, low, percentage=["40"])
    _link(inv2, "Ownership", top, other, percentage=["10"])
    _link(inv2, "Ownership", other, low, percentage=["30"])
    w = {(x["s"], x["t"]): x for x in ok(client.get(f"/api/investigations/{inv2}/wire"))["worked_out"]}[(top, low)]
    # 50% x 40% + 10% x 30% = 23%
    assert (w["pct"], w["share_unknown_because"]) == ("23", "") and w["via"] in ([mid], [other])


def test_a_worked_out_link_through_a_circle_names_the_circular_ownership_flag():
    inv = ok(client.post("/api/investigations", json={"name": "Wire: circle"}))["id"]
    k, h, lp = _party(inv, "Kestrel SA"), _party(inv, "Harbour Nominees Ltd"), _party(inv, "Loop Two BV")
    x = _link(inv, "Ownership", k, h, percentage=["40"])
    y = _link(inv, "Ownership", h, lp, percentage=["60"])
    z = _link(inv, "Ownership", lp, k, percentage=["100"])
    before = ok(client.get(f"/api/investigations/{inv}/wire"))["worked_out"]
    assert {(w["s"], w["t"]) for w in before} == {(k, lp), (h, k), (lp, h)}
    assert all(w["pct"] == "" and "circle" in w["share_unknown_because"] and w["flag_id"] is None for w in before), "no flag before a run"
    ok(client.post(f"/api/investigations/{inv}/red-flags/run"))
    body = ok(client.get(f"/api/investigations/{inv}/wire"))
    ring = {f["flag_id"] for lk in body["links"] for f in lk["flags"] if f["path"]}
    assert len(ring) == 1, "each ownership link carries the circular-ownership flag"
    one = next(lk for lk in body["links"] if lk["id"] == x)["flags"][0]
    assert one["level"] in {"faint", "strong", "textbook"} and one["name"] and "→" in one["path"]
    assert {w["flag_id"] for w in body["worked_out"]} == ring
    w = next(w for w in body["worked_out"] if (w["s"], w["t"]) == (k, lp))
    assert w["inputs"][:2] == [x, y] and w["via"] == [h] and z not in w["inputs"]
