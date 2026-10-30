"""What kind of payment a Payment link is (app/services/payment_kinds.py, DECISIONS_LOG 33): set where a payment is
added (POST /relationships, Add by hand) or opened (PATCH /relationships/{id}/payment-kind). An amount owed (an agreed
price, a fine or penalty, an order) is listed apart in the ledger and is not read as money that moved: not by the
totals, the flows, the money checks, the charts or the Red Flag payment rules."""

from __future__ import annotations

from app.db.session import SessionLocal
from app.models.domain import RelationshipEdge
from app.services import payment_kinds
from app.visuals.data_service import payments_by_party
from tests.test_red_flags import _flags, _inv, _party, client, ok


def _pay(inv: str, a: str, b: str, amount: str, currency: str = "USD", kind: str | None = None, **props: list[str]) -> str:
    body = {"investigation_id": inv, "schema": "Payment", "source_entity_id": a, "target_entity_id": b,
            "properties": {"amount": [amount], "currency": [currency], **props}}
    if kind is not None:
        body["payment_kind"] = kind
    return ok(client.post("/api/relationships", json=body))["id"]


def test_the_kinds_are_a_short_list_and_three_of_them_are_amounts_owed():
    assert list(payment_kinds.PAYMENT_KINDS) == ["transfer", "loan", "fee", "settlement", "price", "fine", "ordered"]
    assert payment_kinds.OWED == {"price", "fine", "ordered"}
    assert payment_kinds.check(None) is None and payment_kinds.check(" Fine ") == "fine"
    assert not payment_kinds.is_owed(None) and not payment_kinds.is_owed("loan") and payment_kinds.is_owed("ordered")


def test_a_kind_is_set_on_a_new_payment_changed_cleared_and_refused_outside_the_list():
    inv = _inv("Kinds")
    bank, regulator, owner = _party(inv, "Bank"), _party(inv, "Regulator", "PublicBody"), _party(inv, "Owner")
    rel = client.post("/api/relationships", json={"investigation_id": inv, "schema": "Payment", "source_entity_id": bank, "target_entity_id": regulator,
                                                   "properties": {"amount": ["1000000"], "currency": ["SGD"]}, "payment_kind": "fine"})
    assert rel.status_code == 200, rel.text
    rid = rel.json()["id"]
    assert rel.json()["payment_kind"] == "fine"
    bad = client.post("/api/relationships", json={"investigation_id": inv, "schema": "Payment", "source_entity_id": bank, "target_entity_id": regulator,
                                                   "properties": {}, "payment_kind": "bribe"})
    assert bad.status_code == 422
    not_a_payment = client.post("/api/relationships", json={"investigation_id": inv, "schema": "Ownership", "source_entity_id": owner,
                                                             "target_entity_id": bank, "properties": {}, "payment_kind": "loan"})
    assert not_a_payment.status_code == 400 and "Only a payment" in not_a_payment.text
    changed = client.patch(f"/api/relationships/{rid}/payment-kind", json={"payment_kind": "ordered"})
    assert changed.status_code == 200 and changed.json()["payment_kind"] == "ordered"
    graph = ok(client.get(f"/api/investigations/{inv}/graph"))
    assert next(e for e in graph["edges"] if e["id"] == rid)["payment_kind"] == "ordered"
    cleared = client.patch(f"/api/relationships/{rid}/payment-kind", json={"payment_kind": None})
    assert cleared.status_code == 200 and cleared.json()["payment_kind"] is None
    own = ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": "Ownership", "source_entity_id": owner,
                                                      "target_entity_id": bank, "properties": {}}))["id"]
    assert client.patch(f"/api/relationships/{own}/payment-kind", json={"payment_kind": "loan"}).status_code == 400
    assert client.patch("/api/relationships/nope/payment-kind", json={"payment_kind": "loan"}).status_code == 404


def test_an_amount_owed_is_listed_apart_and_never_counted_as_money_that_moved():
    inv = _inv("Owed")
    fund, shell, bank, regulator = (_party(inv, n) for n in ("Fund", "Shell", "Bank", "Regulator"))
    moved = _pay(inv, fund, shell, "5000000", kind="loan", date=["2012-05-01"])
    fine = _pay(inv, bank, regulator, "13300000", kind="fine", date=["2016-05-24"])
    price = _pay(inv, fund, shell, "8500000000", "MYR", kind="price")
    ledger = ok(client.get(f"/api/investigations/{inv}/financial-flows"))
    assert [t["id"] for t in ledger["transactions"]] == [moved] and ledger["transactions"][0]["paymentKind"] == "loan"
    assert [(t["id"], t["paymentKind"]) for t in ledger["owed"]] == [(fine, "fine"), (price, "price")]  # by date, the undated price last
    assert ledger["currencies"] == ["USD"] and "not a record that the money moved" in ledger["owed_rule"]
    # The Case home's money traced, the money checks and the charts read only the money that moved.
    money = ok(client.get(f"/api/investigations/{inv}/standing"))["money"]
    assert money == {"currency": "USD", "amount": 5000000.0, "payments": 1, "starting_payers": 1, "others": []}
    checks = ok(client.get(f"/api/investigations/{inv}/money-checks"))
    assert [c["currency"] for c in checks["currencies"]] == ["USD"]
    assert regulator not in {c["party_id"] for cur in checks["currencies"] for c in cur["checks"]}, "a fine is no black hole"
    with SessionLocal() as db:
        chart = payments_by_party(db, inv, {"direction": "received"})
    assert [r.label for r in chart.rows] == ["Shell"]
    assert {o["record_id"] for o in chart.omitted if o["reason"] == "an amount owed, not a payment"} == {fine, price}
    # Retyped as a transfer, the fine is money that moved again.
    ok(client.patch(f"/api/relationships/{fine}/payment-kind", json={"payment_kind": "transfer"}))
    assert {t["id"] for t in ok(client.get(f"/api/investigations/{inv}/financial-flows"))["transactions"]} == {moved, fine}


def test_the_red_flag_payment_rules_do_not_read_an_amount_owed():
    inv = _inv("Owed flags")
    bank, regulator = _party(inv, "Bank"), _party(inv, "Regulator", "PublicBody")
    first = _pay(inv, bank, regulator, "9500", kind="fine", purpose=["breach"], date=["2024-01-02"])
    second = _pay(inv, bank, regulator, "9900", kind="fine", purpose=["breach"], date=["2024-01-03"])
    _pay(inv, regulator, bank, "500", kind="ordered")  # no purpose, and it would close a loop
    run = _flags(inv)["flags"]
    assert not {"ML-021", "ML-023", "BO-033"} & {f["indicator_id"] for f in run}, run
    # The same two payments as transfers are structuring.
    ok(client.patch(f"/api/relationships/{first}/payment-kind", json={"payment_kind": "transfer"}))
    ok(client.patch(f"/api/relationships/{second}/payment-kind", json={"payment_kind": None}))
    assert "ML-021" in {f["indicator_id"] for f in _flags(inv)["flags"]}


def test_add_by_hand_keeps_the_kind_and_its_preview_says_a_fine_raises_no_flag():
    inv = _inv("By hand kinds")
    bank, regulator = _party(inv, "Bank"), _party(inv, "Regulator", "PublicBody")
    entry = {"kind": "link", "link": {"schema": "Payment", "source": {"entity_id": bank}, "target": {"entity_id": regulator},
                                      "properties": {"amount": ["4300000"], "currency": ["SGD"]}, "payment_kind": "fine"},
             "source": {"mode": "none"}}
    preview = ok(client.post(f"/api/investigations/{inv}/by-hand/preview", json=entry))
    assert preview["changes"] == []
    plain = {**entry, "link": {**entry["link"], "payment_kind": None}}
    assert any("Red Flag" in c for c in ok(client.post(f"/api/investigations/{inv}/by-hand/preview", json=plain))["changes"]), "no purpose"
    made = client.post(f"/api/investigations/{inv}/by-hand", json=entry)
    assert made.status_code == 201, made.text
    with SessionLocal() as db:
        assert db.get(RelationshipEdge, made.json()["record_id"]).payment_kind == "fine"
    wrong = {"kind": "link", "link": {"schema": "Ownership", "source": {"entity_id": bank}, "target": {"entity_id": regulator},
                                      "properties": {}, "payment_kind": "loan"}, "source": {"mode": "none"}}
    refused = client.post(f"/api/investigations/{inv}/by-hand", json=wrong)
    assert refused.status_code == 422 and "Only a payment" in refused.text
