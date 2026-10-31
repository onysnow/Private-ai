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
    # Every area the catalogue's own data holds, each once: an area added there needs no edit here (review C2).
    from app.catalogue.loader import load
    assert sorted(a["key"] for a in found) == sorted(area.key for area in load().areas)
    assert all(a["indicators"] >= a["verified"] > 0 for a in found)
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


def test_glossary_keeps_every_areas_own_definition():
    everything = []
    for offset in range(0, 5000, 500):
        everything += ok(client.get("/api/catalogue/glossary", params={"limit": 500, "offset": offset}))["terms"]
    assert len(everything) == ok(client.get("/api/catalogue/glossary", params={"limit": 1}))["total"]
    assert all(t["definitions"] and t["definitions"][0]["definition"] == t["definition"] for t in everything)
    assert all({d["area"] for d in t["definitions"]} <= set(t["areas"]) for t in everything)
    several = [t for t in everything if len(t["definitions"]) > 1]
    assert several, "terms defined by more than one area keep each area's wording"
    one = several[0]
    entry = ok(client.get("/api/catalogue/glossary/entry", params={"term": one["term"].upper()}))
    assert entry["term"] == one["term"] and entry["definitions"] == one["definitions"]
    assert client.get("/api/catalogue/glossary/entry", params={"term": "no such term at all"}).status_code == 404
    hints = {h["term"]: h for h in ok(client.get("/api/catalogue/terms"))}
    assert hints[one["term"]]["definitions"] == len(one["definitions"]) and hints[one["term"]]["related"] == one["related"]


def test_catalogue_map_counts_how_each_area_is_checked_and_its_cross_hints():
    m = ok(client.get("/api/catalogue/map"))
    areas = {a["key"]: a for a in m["areas"]}
    totals = {a["key"]: a["indicators"] for a in ok(client.get("/api/catalogue/areas")) if a["key"] != "APP"}
    assert set(areas) == set(totals)
    assert all(a["records"] + a["lookups"] + a["person"] == totals[k] for k, a in areas.items())
    assert areas["BO"]["rules"] >= 1, "BO has detection rules (catalogue/detection/bo.yaml)"
    assert m["cross_hints"] and all(h["source"] != h["target"] and h["count"] > 0 and h["target"] in areas for h in m["cross_hints"])


def test_indicator_list_by_area_and_search():
    bo = ok(client.get("/api/catalogue/indicators", params={"area": "BO"}))
    assert bo["total"] == len(bo["indicators"]) and all(r["area"] == "BO" for r in bo["indicators"])
    first = bo["indicators"][0]
    assert first["id"] == "BO-001" and first["rule"] is True and first["levels_set"] == ["textbook"], "unset levels are not 'set'"
    everything = ok(client.get("/api/catalogue/indicators", params={"limit": 3000}))
    assert everything["total"] == len(everything["indicators"]) == sum(a["indicators"] for a in ok(client.get("/api/catalogue/areas")))
    found = ok(client.get("/api/catalogue/indicators", params={"q": "circular OWNERSHIP"}))["indicators"]
    assert "BO-001" in [r["id"] for r in found]
    assert ok(client.get("/api/catalogue/indicators", params={"q": "bo-001"}))["indicators"][0]["id"] == "BO-001"
