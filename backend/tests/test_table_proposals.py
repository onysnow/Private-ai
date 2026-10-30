"""A mapping proposed for a table when it arrives (app/services/table_proposals.py; DECISIONS_LOG 38): which column
is which, from the header and checked against the values; nothing is made until a person accepts; accepting runs the
column mapping, whose proposals a person reviews into the ledger."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import (
    ExtractionCandidate,
    Investigation,
    RelationshipEdge,
    TableProposalDecision,
)
from app.services.table_mappings import Table
from app.services.table_proposals import (
    guess_decimal,
    propose_for_table,
    read_date,
    read_number,
)

client = TestClient(app)


def _table(text: str, sep: str = ";") -> Table:
    lines = [line.split(sep) for line in text.strip().splitlines()]
    columns = lines[0]
    return Table(columns, [(n, dict(zip(columns, row))) for n, row in enumerate(lines[1:], 2)], [], None)


def _roles(proposal: dict) -> dict[str, str | None]:
    return {c["column"]: c["role"] for c in proposal["columns"]}


# --- reading cells ----------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("text,decimal,value", [
    ("1.234,56", ",", "1234.56"), ("1,234.56", ".", "1234.56"), ("1'234.56", ".", "1234.56"), ("1 234,56", ",", "1234.56"),
    ("-1.234,56", ",", "-1234.56"), ("1.234,56-", ",", "-1234.56"), ("(1,234.56)", ".", "-1234.56"), ("+50", ".", "50"),
    ("EUR 1.234,56", ",", "1234.56"), ("€12", ".", "12"), ("2,400,000", ".", "2400000"), ("30000000", ".", "30000000"),
    # An English number in a column that is otherwise European is read as written.
    ("1,234.56", ",", "1234.56"),
])
def test_amounts_are_read_with_their_separators_and_signs(text, decimal, value):
    number = read_number(text, decimal)
    assert number is not None and number.value == Decimal(value)


def test_an_amount_says_its_currency_and_way_when_the_cell_does():
    assert read_number("EUR 1.234,56", ",").currency == "EUR"      # type: ignore[union-attr]
    assert read_number("£300").currency == "GBP"                   # type: ignore[union-attr]
    assert read_number("100.00 DR").way == "out" and read_number("100.00 CR").way == "in"   # type: ignore[union-attr]
    for not_a_number in ("1MDB", "lots", "2011-05-20", "Good Star Limited", ""):
        assert read_number(not_a_number) is None


def test_the_decimal_mark_comes_from_the_amounts_that_show_it():
    assert guess_decimal(["1.234,56", "12,00", "3.500,00"]) == ","
    assert guess_decimal(["1,234.56", "12.00", "2,400,000"]) == "."


@pytest.mark.parametrize("text,order,iso", [
    ("2024-03-03", "DMY", "2024-03-03"), ("2024-03-03 10:15:00", "DMY", "2024-03-03"), ("14/03/2024", "DMY", "2024-03-14"),
    ("3/14/2024", "MDY", "2024-03-14"), ("03.04.2024", "DMY", "2024-04-03"), ("14.03.24", "DMY", "2024-03-14"),
    ("May 20, 2011", "DMY", "2011-05-20"), ("20 May 2011", "MDY", "2011-05-20"), ("20. Mai 2011", "DMY", "2011-05-20"),
    ("1er mars 2012", "DMY", "2012-03-01"), ("20240131", "DMY", "2024-01-31"), ("2016", "DMY", "2016"),
])
def test_dates_are_read_day_or_month_first_or_in_words(text, order, iso):
    assert read_date(text, order) == iso


def test_a_date_that_is_not_one_is_not_read():
    assert read_date("31/02/2024") is None and read_date("not stated") is None and read_date("13/13/2024") is None


# --- recognising the columns ------------------------------------------------------------------------------------------


def test_a_payer_and_payee_table_is_payments():
    proposal = propose_for_table(_table("""Date;Payer;Payee;Amount;Currency;Purpose;Payer account
2024-03-03;Meridian Holdings Ltd;Bellcastle Trading Group;2,400,000;GBP;Consultancy;GB12 3456
2024-03-14;Meridian Holdings Ltd;Orrin Shipping SA;150,000;GBP;Freight;GB12 3456"""))
    assert proposal is not None and proposal["kind"] == "payments" and proposal["shape"] == "pair"
    assert _roles(proposal) == {"Date": "date", "Payer": "payer", "Payee": "payee", "Amount": "amount", "Currency": "currency",
                                "Purpose": "purpose", "Payer account": None}       # an account is not the payer
    assert all(c["confidence"] >= 0.9 for c in proposal["columns"] if c["role"])
    assert proposal["sample"][0] == {"number": 2, "date": "2024-03-03", "amount": "2400000", "currency": "GBP",
                                     "payer": "Meridian Holdings Ltd", "payee": "Bellcastle Trading Group", "purpose": "Consultancy",
                                     "problems": []}


def test_booking_date_is_the_date_and_value_date_is_kept_apart():
    proposal = propose_for_table(_table("""Value date;Booking date;Beneficiary name;Amount;Currency
2024-01-04;2024-01-03;Orrin Shipping SA;1,250.00;GBP"""))
    assert proposal is not None
    roles = _roles(proposal)
    assert roles["Booking date"] == "date" and roles["Value date"] == "value_date"
    assert roles["Beneficiary name"] == "payee"          # "name" does not stop it being the payee
    assert proposal["sample"][0]["date"] == "2024-01-03"


def test_a_value_date_alone_is_the_payment_date():
    proposal = propose_for_table(_table("""Value date;Payer;Payee;Amount
2024-01-04;A Ltd;B Ltd;10"""))
    assert proposal is not None and _roles(proposal)["Value date"] == "date"


def test_a_german_statement_with_soll_and_haben_and_european_numbers():
    proposal = propose_for_table(_table("""Buchungstag;Valuta;Auftraggeber / Empfänger;Verwendungszweck;Soll;Haben;Währung
03.04.2024;04.04.2024;Stadtwerke München;Strom April;1.234,56;;EUR
05.04.2024;05.04.2024;ACME GmbH;Gehalt;;3.500,00;EUR"""))
    assert proposal is not None and proposal["kind"] == "payments" and proposal["shape"] == "statement"
    assert proposal["decimal"] == "," and proposal["date_order"] == "DMY"
    assert _roles(proposal) == {"Buchungstag": "date", "Valuta": "value_date", "Auftraggeber / Empfänger": "counterparty",
                                "Verwendungszweck": "purpose", "Soll": "debit", "Haben": "credit", "Währung": "currency"}
    out, paid_in = proposal["sample"]
    assert (out["amount"], out["payee"], "payer" in out) == ("1234.56", "Stadtwerke München", False)   # the holder is not named yet
    assert (paid_in["amount"], paid_in["payer"]) == ("3500", "ACME GmbH")


def test_valuta_holding_currency_codes_is_the_currency():
    proposal = propose_for_table(_table("""Data;Ordinante;Beneficiario;Importo;Valuta
12/03/2023;Banca X;Società Y;1.000,00;EUR"""))
    assert proposal is not None and _roles(proposal)["Valuta"] == "currency" and _roles(proposal)["Data"] == "date"


def test_debit_and_credit_columns_without_a_party_column_read_the_description_as_the_other_party():
    proposal = propose_for_table(_table("""Date,Description,Debit,Credit,Balance
01/02/2024,Coffee Shop,4.50,,1000.00
15/02/2024,Salary,,2500.00,3495.50""", ","))
    assert proposal is not None and proposal["shape"] == "statement"
    roles = _roles(proposal)
    assert (roles["Debit"], roles["Credit"], roles["Balance"], roles["Description"]) == ("debit", "credit", None, "counterparty")
    description = next(c for c in proposal["columns"] if c["column"] == "Description")
    assert description["confidence"] < 0.6                  # a guess, and it says so
    assert proposal["sample"][0]["payee"] == "Coffee Shop" and proposal["sample"][1]["payer"] == "Salary"


def test_a_debit_credit_column_saying_which_way():
    proposal = propose_for_table(_table("""Date;Counterparty;Amount;Dr/Cr
2024-02-01;Coffee Shop;4.50;DR
2024-02-02;Employer Ltd;2500.00;CR"""))
    assert proposal is not None and _roles(proposal)["Dr/Cr"] == "direction" and proposal["shape"] == "statement"
    assert proposal["sample"][0]["payee"] == "Coffee Shop" and proposal["sample"][1]["payer"] == "Employer Ltd"


def test_a_counterparty_with_unsigned_amounts_and_nothing_saying_which_way_is_not_payments():
    proposal = propose_for_table(_table("""Date;Counterparty;Amount
2024-02-01;Coffee Shop;4.50"""))
    assert proposal is None or proposal["kind"] != "payments"


def test_spanish_headers_and_a_column_that_says_the_kind():
    proposal = propose_for_table(_table("""Fecha;Importe;Moneda;Ordenante;Beneficiario;Concepto;Tipo
12/03/2023;1.000.000,00;EUR;Banco X;Empresa Y;Préstamo puente;préstamo
13/03/2023;5.000,00;EUR;Banco X;Empresa Y;Comisión;otro"""))
    assert proposal is not None and proposal["kind"] == "payments"
    assert _roles(proposal)["Tipo"] == "kind"
    assert proposal["sample"][0]["kind"] == "loan" and "kind" not in proposal["sample"][1]    # "otro" says no kind


def test_people_and_companies_lists():
    people = propose_for_table(_table("""Name,Country,Date of birth,Nationality
Viktor Vekselberg,Russia,14/04/1957,RU""", ","))
    assert people is not None and (people["kind"], people["schema"]) == ("parties", "Person")
    assert people["sample"][0]["name"] == "Viktor Vekselberg"
    companies = propose_for_table(_table("""Company name,Company number,Jurisdiction
Meridian Holdings Ltd,GB-123,GB""", ","))
    assert companies is not None and (companies["kind"], companies["schema"]) == ("parties", "Company")
    assert _roles(companies) == {"Company name": "name", "Company number": "registration_number", "Jurisdiction": "country"}


def test_a_table_of_neither_is_not_proposed():
    assert propose_for_table(_table("""Year;Rainfall mm;Station
2020;812;Kew""")) is None


# --- from upload to the ledger ----------------------------------------------------------------------------------------

STATEMENT = (
    "Buchungstag;Valuta;Auftraggeber / Empfänger;Verwendungszweck;Soll;Haben;Währung\n"
    "03.04.2024;04.04.2024;Stadtwerke München;Strom April;1.234,56;;EUR\n"
    "05.04.2024;05.04.2024;ACME GmbH;Gehalt;;3.500,00;EUR\n"
    "07.04.2024;07.04.2024;Stadtwerke München;Strom Mai;99,00;;EUR\n"
).encode("utf-8")


def _investigation() -> str:
    with SessionLocal() as db:
        inv = Investigation(name="Statement")
        db.add(inv)
        db.commit()
        return inv.id


def _upload(inv: str, name: str, data: bytes) -> dict:
    reply = client.post("/api/documents/upload", data={"investigation_id": inv, "title": name},
                        files={"file": (name, data, "text/csv")})
    assert reply.status_code == 200, reply.text
    return reply.json()


def test_from_upload_to_an_accepted_proposal_to_payments_in_the_ledger():
    inv = _investigation()
    doc = _upload(inv, "konto.csv", STATEMENT)
    url = f"/api/documents/{doc['id']}/table-proposal"
    shown = client.get(url).json()
    assert shown["status"] == "proposed" and shown["proposal"]["kind"] == "payments" and shown["proposal"]["shape"] == "statement"
    assert {r["role"] for r in shown["roles"]} >= {"date", "amount", "debit", "credit", "payer", "payee", "counterparty"}

    # Nothing is made until a person accepts.
    with SessionLocal() as db:
        assert db.query(ExtractionCandidate).filter(ExtractionCandidate.document_id == doc["id"]).count() == 0
        assert db.query(RelationshipEdge).filter(RelationshipEdge.investigation_id == inv).count() == 0

    # A statement needs its holder: whose account it is.
    refused = client.post(f"{url}/accept", json={})
    assert refused.status_code == 400 and "whose account" in refused.json()["detail"]
    accepted = client.post(f"{url}/accept", json={"account_holder": "Anna Weber"})
    assert accepted.status_code == 200, accepted.text
    body = accepted.json()
    assert body["proposal"]["status"] == "accepted"
    assert body["proposal"]["decision"]["changed"] is True             # the holder was added
    assert body["proposal"]["decision"]["decided_by"]                  # who accepted
    assert (body["run"]["entities_proposed"], body["run"]["links_proposed"]) == (3, 3)
    assert body["run"]["mapping"]["prepare"]["shape"] == "statement"
    assert client.post(f"{url}/accept", json={"account_holder": "Anna Weber"}).status_code == 400   # once

    with SessionLocal() as db:
        decision = db.query(TableProposalDecision).filter(TableProposalDecision.document_id == doc["id"]).one()
        assert decision.decision == "accepted" and decision.mapping_id == body["run"]["mapping"]["id"]
        assert decision.accepted["account_holder"] == "Anna Weber" and decision.proposed["account_holder"] is None

    candidates = client.get(f"/api/documents/{doc['id']}/candidates").json()
    entities = {c["payload"]["caption"]: c for c in candidates if c["candidate_type"] == "entity"}
    assert set(entities) == {"Anna Weber", "Stadtwerke München", "ACME GmbH"}     # the holder once, paying and paid
    links = [c for c in candidates if c["candidate_type"] == "relationship"]
    by_caption = {c["payload"]["caption"]: c for c in links if c["payload"]["properties"]["amount"] == ["1234.56"]}
    out = by_caption["Anna Weber → Stadtwerke München"]
    assert out["payload"]["properties"]["date"] == ["2024-04-03"] and out["payload"]["properties"]["currency"] == ["EUR"]
    # The evidence is the row as the file has it, never the cells the proposal read.
    assert "↳" not in out["payload"]["row_text"] and "Soll: 1.234,56" in out["payload"]["row_text"]
    assert "payment_kind" not in out["payload"]

    for candidate in entities.values():
        assert client.post(f"/api/extraction-candidates/{candidate['id']}/review", json={"decision": "accept"}).status_code == 200
    for link in links:
        reply = client.post(f"/api/extraction-candidates/{link['id']}/review", json={"decision": "accept"})
        assert reply.status_code == 200, reply.text

    ledger = client.get(f"/api/investigations/{inv}/financial-flows").json()
    assert ledger["currencies"] == ["EUR"] and ledger["incomplete"] == []
    assert sorted((t["from"], t["to"], t["amount"], t["dateTime"][:10]) for t in ledger["transactions"]) == [
        ("ACME GmbH", "Anna Weber", 3500.0, "2024-04-05"),
        ("Anna Weber", "Stadtwerke München", 99.0, "2024-04-07"),
        ("Anna Weber", "Stadtwerke München", 1234.56, "2024-04-03"),
    ]
    assert all(t["paymentKind"] is None for t in ledger["transactions"])
    with SessionLocal() as db:
        edges = db.query(RelationshipEdge).filter(RelationshipEdge.investigation_id == inv).all()
        assert len(edges) == 3 and all(edge.payment_kind is None for edge in edges)


def test_a_proposal_can_be_changed_before_it_is_accepted_or_dismissed():
    inv = _investigation()
    doc = _upload(inv, "ledger.csv", b"Date,From,To,Value,Type\n2024-01-02,Alpha Ltd,Beta SA,\"1,000.00\",fine\n")
    url = f"/api/documents/{doc['id']}/table-proposal"
    shown = client.get(url).json()["proposal"]
    assert _roles(shown) == {"Date": "date", "From": "payer", "To": "payee", "Value": "amount", "Type": "kind"}
    # Leave the kind column out: the payment's kind stays unsaid.
    columns = [{"column": c["column"], "role": None if c["column"] == "Type" else c["role"]} for c in shown["columns"]]
    reply = client.post(f"{url}/accept", json={"columns": columns})
    assert reply.status_code == 200, reply.text
    view = reply.json()["proposal"]
    assert view["decision"]["changed"] is True and _roles(view["proposal"])["Type"] is None
    type_column = next(c for c in view["proposal"]["columns"] if c["column"] == "Type")
    assert type_column["why"] == "Chosen by a person"
    assert reply.json()["run"]["links_proposed"] == 1, reply.json()["run"]["skipped"]
    link = next(c for c in client.get(f"/api/documents/{doc['id']}/candidates").json() if c["candidate_type"] == "relationship")
    assert "payment_kind" not in link["payload"]

    other = _upload(inv, "ledger2.csv", b"Date,From,To,Value,Type\n2024-01-02,Alpha Ltd,Beta SA,10,fine\n")
    url = f"/api/documents/{other['id']}/table-proposal"
    dismissed = client.post(f"{url}/dismiss", json={})
    assert dismissed.status_code == 200 and dismissed.json()["status"] == "dismissed"
    assert client.get(url).json()["status"] == "dismissed"
    with SessionLocal() as db:
        assert db.query(ExtractionCandidate).filter(ExtractionCandidate.document_id == other["id"]).count() == 0


def test_a_kind_said_by_a_column_reaches_the_payment():
    inv = _investigation()
    doc = _upload(inv, "fines.csv", b"Date,From,To,Value,Type\n2024-01-02,Alpha Ltd,Regulator,500,fine\n")
    reply = client.post(f"/api/documents/{doc['id']}/table-proposal/accept", json={})
    assert reply.status_code == 200, reply.text
    candidates = client.get(f"/api/documents/{doc['id']}/candidates").json()
    for candidate in candidates:
        if candidate["candidate_type"] == "entity":
            client.post(f"/api/extraction-candidates/{candidate['id']}/review", json={"decision": "accept"})
    link = next(c for c in candidates if c["candidate_type"] == "relationship")
    assert link["payload"]["payment_kind"] == "fine"
    edge = client.post(f"/api/extraction-candidates/{link['id']}/review", json={"decision": "accept"}).json()
    with SessionLocal() as db:
        assert db.get(RelationshipEdge, edge["record"]["id"]).payment_kind == "fine"


def test_the_demo_tables_are_proposed_as_payments():
    from types import SimpleNamespace

    from app.services.table_proposals import propose

    files = Path(__file__).resolve().parents[1] / "app" / "demo" / "one_mdb" / "files"
    for name in ("doj-2016-park-laurel-transfers.csv", "doj-2016-park-laurel-transfers.xlsx"):
        proposal = propose(SimpleNamespace(filename=name, storage_path=str(files / name)))
        assert proposal is not None and (proposal["kind"], proposal["shape"]) == ("payments", "pair"), name
        roles = _roles(proposal)
        assert {k: v for k, v in roles.items() if v} == {"date": "date", "payer": "payer", "payee": "payee", "amount": "amount",
                                                          "currency": "currency", "purpose": "purpose"}, name
        assert proposal["sample"][0]["amount"] == "30000000" and proposal["sample"][0]["payer"] == "1MDB"
