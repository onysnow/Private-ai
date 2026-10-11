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
    assert flags["BO-033"]["summary"].startswith("Gamma paid Alpha 5,000 EUR")
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


def test_repeated_payments_just_under_10000_dollars_are_faint_and_say_what_is_not_shown():
    inv = _inv("Structuring")
    payer, bank, other = _party(inv, "J Doe", "Person"), _party(inv, "Bank account 1"), _party(inv, "Bank account 2")
    _link(inv, "Payment", payer, bank, amount=["9,500"], currency=["USD"], purpose=["deposit"], date=["2024-01-02"])
    _link(inv, "Payment", payer, bank, amount=["10000"], currency=["USD"], purpose=["deposit"])
    _link(inv, "Payment", payer, other, amount=["9500"], currency=["EUR"], purpose=["deposit"])
    assert "ML-021" not in {f["indicator_id"] for f in _flags(inv)["flags"]}, "one payment in the band is not repeated"
    _link(inv, "Payment", payer, other, amount=["9900"], currency=["usd"], purpose=["deposit"], date=["2024-01-03"])
    flag = next(f for f in _flags(inv)["flags"] if f["indicator_id"] == "ML-021")
    assert flag["level"] == "faint" and flag["facts"]["payments"] == 2 and flag["facts"]["total"] == 19400
    assert flag["not_shown"] == ["whether the money was cash", "whether it was split to avoid the report"]
    assert "from 2024-01-02 to 2024-01-03" in flag["summary"]
    assert "Treasury" in flag["indicator"]["levels"]["faint"] and "not a rule" in flag["indicator"]["levels"]["threshold_note"]


def test_payments_between_companies_with_a_shared_owner_are_faint():
    inv = _inv("Shared owner")
    owner, a, b, parent = _party(inv, "M Smith", "Person"), _party(inv, "A Ltd"), _party(inv, "B Ltd"), _party(inv, "Parent Ltd")
    _link(inv, "Payment", a, b, amount=["5000"], currency=["GBP"], purpose=["services"])
    assert "BO-031" not in {f["indicator_id"] for f in _flags(inv)["flags"]}
    _link(inv, "Ownership", owner, a)
    _link(inv, "Directorship", owner, b)
    _link(inv, "Ownership", parent, a)
    _link(inv, "Payment", parent, a, amount=["100"], currency=["GBP"], purpose=["capital"])
    flags = [f for f in _flags(inv)["flags"] if f["indicator_id"] == "BO-031"]
    assert len(flags) == 1, "a parent paying its own company is not counted"
    assert flags[0]["level"] == "faint" and flags[0]["not_shown"] == ["whether there was a business reason for the payments"]
    assert {p["name"] for p in flags[0]["parties"]} == {"A Ltd", "B Ltd", "M Smith"}
    assert "M Smith (directorship and ownership)" in flags[0]["summary"]


def test_the_investigation_type_comes_from_flags_and_records_and_the_reporter_can_set_it():
    from app.services.exports import collect_investigation_records

    inv = _inv("Fishing fleet")
    a, b, c = _party(inv, "A Ltd"), _party(inv, "B Ltd"), _party(inv, "C Ltd")
    for upper, lower in ((a, b), (b, c), (c, a)):
        _link(inv, "Ownership", upper, lower)
    _party(inv, "MV Example", "Vessel")
    body = _flags(inv)
    kind = body["investigation_type"]
    assert kind["set_by"] == "app"
    areas = {x["key"]: x for x in kind["areas"]}
    assert "Red Flag: Circular ownership (BO-001)" in areas["BO"]["reasons"]
    assert kind["areas"][0]["key"] == "BO", "areas with a Red Flag come first"
    assert any(r.startswith("Records hold Vessel") for r in areas["SF"]["reasons"]), "a kind that says something about the case counts"
    assert not any("Company" in r or "Ownership" in r for x in kind["areas"] for r in x["reasons"]), "kinds most areas need point nowhere"

    chosen = ok(client.put(f"/api/investigations/{inv}/type", json={"areas": ["OC", "ML", "OC"]}))
    assert chosen.pop("suggested") == kind["suggested"], "the app's picks stay on offer"
    assert chosen == {"set_by": "reporter", "areas": [{"key": "OC", "name": "Organised crime and illicit goods", "reasons": ["Chosen by the reporter"]},
                                                       {"key": "ML", "name": "Money laundering", "reasons": ["Chosen by the reporter"]}]}
    assert {k: v for k, v in _flags(inv)["investigation_type"].items() if k != "suggested"} == chosen
    with SessionLocal() as db:
        assert collect_investigation_records(db, inv)["investigations"][0]["type_areas"] == ["OC", "ML"], "it travels in a backup"
    assert client.put(f"/api/investigations/{inv}/type", json={"areas": ["XX"]}).status_code == 400
    assert client.put(f"/api/investigations/{inv}/type", json={"areas": ["SA"]}).status_code == 400, "the reporter's safety is not a type"
    assert ok(client.put(f"/api/investigations/{inv}/type", json={"areas": None}))["set_by"] == "app"
