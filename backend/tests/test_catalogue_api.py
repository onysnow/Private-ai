"""The catalogue and glossary endpoints (app/api/routes_catalogue.py)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def test_areas_glossary_search_and_one_indicator():
    areas = ok(client.get("/api/catalogue/areas"))
    found = [a for a in areas if a["key"] != "APP"]
    assert len(found) == 42 and all(a["indicators"] >= a["verified"] > 0 for a in found)
    assert all(a["summary"] and len(a["summary"]) < 120 for a in areas), "a plain line for people choosing a type"
    own = next(a for a in areas if a["key"] == "APP")
    assert own["indicators"] == 0 and own["terms"] >= 4
    page = ok(client.get("/api/catalogue/glossary", params={"q": "beneficial owner"}))
    assert page["total"] > 0
    assert "beneficial owner" in page["terms"][0]["term"].lower()
    bo = ok(client.get("/api/catalogue/glossary", params={"area": "BO", "limit": 500}))
    assert bo["total"] and all("BO" in t["areas"] for t in bo["terms"])
    terms = [t["term"].lower() for t in ok(client.get("/api/catalogue/glossary", params={"limit": 500}))["terms"]]
    assert len(terms) == len(set(terms)), "a term appears once, with every area it belongs to"
    one = ok(client.get("/api/catalogue/indicators/BO-001"))
    assert one["name"] == "Circular ownership" and one["area_name"] and one["sources"]
    assert client.get("/api/catalogue/indicators/XX-999").status_code == 404


def test_the_apps_own_names_are_in_the_glossary():
    terms = {t["term"] for t in ok(client.get("/api/catalogue/glossary", params={"area": "APP"}))["terms"]}
    assert {"Paper Trail", "Red Flags", "Chain of Custody", "The Drop"} <= terms


def test_term_hints_give_the_names_a_term_is_found_by():
    hints = {h["term"]: h for h in ok(client.get("/api/catalogue/terms"))}
    names = lambda term: {n["text"]: n["exact"] for n in hints[term]["names"]}  # noqa: E731
    assert names("Bank Secrecy Act (BSA)") == {"Bank Secrecy Act": False, "BSA": True}
    assert names("HFC (hydrofluorocarbon)") == {"HFC": True, "hydrofluorocarbon": False}
    assert names("Loitering (vessel)") == {"Loitering": False}, "a word in brackets that says which sense is meant is not a name"
    assert names("Travel Act (US)") == {"Travel Act": False}, "nor a two-letter one"
    assert names("3T / 3TG") == {"3TG": True}
    assert names("AAER (Accounting and Auditing Enforcement Release)")["AAER"] is True
    assert names("Strong") == {"Strong": True}, "the app's own names match only as written"
    assert all(len(n["text"]) >= 4 or (len(n["text"]) == 3 and n["text"].isupper()) for h in hints.values() for n in h["names"])
