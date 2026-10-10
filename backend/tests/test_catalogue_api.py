"""The catalogue and glossary endpoints (app/api/routes_catalogue.py)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def test_areas_glossary_search_and_one_indicator():
    areas = ok(client.get("/api/catalogue/areas"))
    assert len(areas) == 22 and all(a["indicators"] >= a["verified"] > 0 for a in areas)
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
