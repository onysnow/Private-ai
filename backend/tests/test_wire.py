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
