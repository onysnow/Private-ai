"""Red Flags: the first rules, ranking, and what a reporter does with a flag
(app/patterns/)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Lead, LeadLink

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _inv(name: str) -> str:
    return ok(client.post("/api/investigations", json={"name": name}))["id"]


def _party(inv: str, name: str, schema: str = "Company", **props: list[str]) -> str:
    return ok(client.post("/api/entities", json={"investigation_id": inv, "schema": schema, "caption": name, "properties": {"name": [name], **props}}))["id"]


def _link(inv: str, schema: str, a: str, b: str, **props: list[str]) -> str:
    return ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": schema, "source_entity_id": a, "target_entity_id": b, "properties": props}))["id"]


def _flags(inv: str) -> dict:
    return ok(client.get(f"/api/investigations/{inv}/red-flags"))


def test_circular_ownership_and_circular_payments_are_textbook():
    inv = _inv("Loops")
    a, b, c = _party(inv, "A Ltd"), _party(inv, "B Ltd"), _party(inv, "C Ltd")
    _link(inv, "Ownership", a, b)
    _link(inv, "Ownership", b, c)
    _link(inv, "Ownership", c, a)
    _link(inv, "Payment", a, b, amount=["100"], currency=["USD"], purpose=["fee"])
    _link(inv, "Payment", b, a, amount=["90"], currency=["USD"], purpose=["refund"])
    body = _flags(inv)
    by = {f["indicator_id"]: f for f in body["flags"]}
    assert by["BO-001"]["level"] == "textbook"
    assert set(p["name"] for p in by["BO-001"]["parties"]) == {"A Ltd", "B Ltd", "C Ltd"}
    assert len(by["BO-001"]["links"]) == 3
    assert by["ML-023"]["level"] == "textbook"
    assert by["BO-001"]["indicator"]["name"] == "Circular ownership"
    assert by["BO-001"]["indicator"]["innocent_explanations"]
    assert {r["indicator_id"] for r in body["rules"]} >= {"BO-001", "BO-002", "ML-023", "BO-033", "BO-032"}


def test_ownership_layers_use_the_catalogue_numbers():
    inv = _inv("Layers")
    chain = [_party(inv, f"L{i}") for i in range(7)]
    for upper, lower in zip(chain, chain[1:]):
        _link(inv, "Ownership", upper, lower)
    flag = next(f for f in _flags(inv)["flags"] if f["indicator_id"] == "BO-002")
    assert flag["facts"]["layers"] == 6
    assert flag["level"] == "strong"
    inv2 = _inv("Layers 2")
    short = [_party(inv2, f"S{i}") for i in range(5)]
    for upper, lower in zip(short, short[1:]):
        _link(inv2, "Ownership", upper, lower)
    assert next(f for f in _flags(inv2)["flags"] if f["indicator_id"] == "BO-002")["level"] == "faint"
    inv3 = _inv("Layers 3")
    three = [_party(inv3, f"T{i}") for i in range(4)]
    for upper, lower in zip(three, three[1:]):
        _link(inv3, "Ownership", upper, lower)
    assert not any(f["indicator_id"] == "BO-002" for f in _flags(inv3)["flags"])


def test_payment_with_no_purpose_and_shared_contact_between_unlinked_parties():
    inv = _inv("Contacts")
    a = _party(inv, "Alpha", phone=["+44 20 7946 0000"])
    b = _party(inv, "Beta", phone=["+44 (20) 7946-0000"])
    c = _party(inv, "Gamma")
    _link(inv, "Payment", c, a, amount=["5000"], currency=["EUR"])
    flags = {f["indicator_id"]: f for f in _flags(inv)["flags"]}
    assert flags["BO-033"]["summary"].startswith("Gamma paid Alpha 5000 EUR")
    assert flags["BO-032"]["facts"]["kind"] == "phone"
    assert {p["name"] for p in flags["BO-032"]["parties"]} == {"Alpha", "Beta"}
    # Once the two are linked, the shared phone is no longer unexplained: the flag stops firing.
    _link(inv, "Employment", a, b)
    body = _flags(inv)
    assert not any(f["indicator_id"] == "BO-032" for f in body["flags"])
    assert any(f["indicator_id"] == "BO-032" for f in body["gone"])


def test_ranking_parts_dismissal_that_sticks_and_a_flag_made_a_lead():
    inv = _inv("Decide")
    a, b = _party(inv, "Payer"), _party(inv, "Payee")
    _link(inv, "Payment", a, b, amount=["1"], currency=["USD"])
    _link(inv, "Payment", b, a, amount=["1"], currency=["USD"])
    flags = _flags(inv)["flags"]
    loop = next(f for f in flags if f["indicator_id"] == "ML-023")
    whys = [p["why"] for p in loop["weight_parts"]]
    assert whys[0] == "one flag"
    assert any("other open flag" in w for w in whys)
    assert any("not yet supported" in w for w in whys)
    assert loop["weight"] == round(sum(p["value"] for p in loop["weight_parts"]), 2)

    assert client.post(f"/api/red-flags/{loop['id']}/dismiss", json={"reason": " "}).status_code in (400, 422)
    ok(client.post(f"/api/red-flags/{loop['id']}/dismiss", json={"reason": "Known intercompany settlement"}))
    again = next(f for f in _flags(inv)["flags"] if f["indicator_id"] == "ML-023")
    assert (again["id"], again["status"], again["dismissed_reason"]) == (loop["id"], "dismissed", "Known intercompany settlement")
    ok(client.post(f"/api/red-flags/{loop['id']}/reopen"))

    no_purpose = next(f for f in flags if f["indicator_id"] == "BO-033")
    lead = ok(client.post(f"/api/red-flags/{no_purpose['id']}/lead"))
    assert lead["title"].startswith("Red Flag: ")
    assert client.post(f"/api/red-flags/{no_purpose['id']}/lead").status_code == 400
    with SessionLocal() as db:
        assert db.get(Lead, lead["id"]).provider == "red_flags"
        links = db.query(LeadLink).filter(LeadLink.lead_id == lead["id"]).all()
        assert {l.entity_id for l in links if l.entity_id} == {a, b}
        assert any(l.relationship_id for l in links)
