from fastapi.testclient import TestClient

from app.db.session import Base, engine
from app.main import app


def make_entity(client, inv_id, schema, caption):
    return client.post("/api/entities", json={
        "investigation_id": inv_id,
        "schema": schema,
        "caption": caption,
        "properties": {"name": [caption]},
    }).json()


def test_ownership_is_a_followthemoney_relationship_entity_and_graph_edge():
    client = TestClient(app)
    inv = client.post("/api/investigations", json={"name": "Relationship graph"}).json()
    owner = make_entity(client, inv["id"], "Person", "Alice Reporter")
    company = make_entity(client, inv["id"], "Company", "Example Holdings LLC")

    response = client.post("/api/relationships", json={
        "investigation_id": inv["id"],
        "schema": "Ownership",
        "source_entity_id": owner["id"],
        "target_entity_id": company["id"],
        "properties": {"percentage": ["51%"], "startDate": ["2024-01-01"]},
        "dataset": "reporter",
        "origin": "source:test-filing",
    })
    assert response.status_code == 200, response.text
    rel = response.json()
    assert rel["schema"] == "Ownership"
    assert rel["source_prop"] == "owner"
    assert rel["target_prop"] == "asset"
    assert rel["properties"]["owner"] == [owner["ftm_id"]]
    assert rel["properties"]["asset"] == [company["ftm_id"]]
    assert rel["properties"]["percentage"] == ["51%"]

    # The interstitial relationship itself is a canonical FtM entity with provenance-bearing statements.
    statements = client.get(f'/api/entities/{rel["relationship_entity_id"]}/statements').json()
    keyed = {(s["prop"], s["value"]): s for s in statements}
    assert keyed[("owner", owner["ftm_id"])]["dataset"] == "reporter"
    assert keyed[("percentage", "51%")]["origin"] == "source:test-filing"

    canonical_nodes = client.get(f'/api/investigations/{inv["id"]}/entities').json()
    assert {row["id"] for row in canonical_nodes} == {owner["id"], company["id"]}
    with_relationship_entities = client.get(f'/api/investigations/{inv["id"]}/entities?include_relationships=true').json()
    assert rel["relationship_entity_id"] in {row["id"] for row in with_relationship_entities}

    graph = client.get(f'/api/investigations/{inv["id"]}/graph').json()
    assert {n["id"] for n in graph["nodes"]} == {owner["id"], company["id"]}
    assert len(graph["edges"]) == 1
    assert graph["edges"][0]["relationship_entity_id"] == rel["relationship_entity_id"]


def test_directorship_direction_and_entity_history():
    client = TestClient(app)
    inv = client.post("/api/investigations", json={"name": "Directorship graph"}).json()
    person = make_entity(client, inv["id"], "Person", "Pat Director")
    org = make_entity(client, inv["id"], "Company", "Board Company")
    rel = client.post("/api/relationships", json={
        "investigation_id": inv["id"],
        "schema": "Directorship",
        "source_entity_id": person["id"],
        "target_entity_id": org["id"],
        "properties": {"role": ["Board member"], "startDate": ["2022-06-01"]},
    }).json()

    person_rels = client.get(f'/api/entities/{person["id"]}/relationships').json()
    org_rels = client.get(f'/api/entities/{org["id"]}/relationships').json()
    assert person_rels[0]["direction"] == "outgoing"
    assert org_rels[0]["direction"] == "incoming"
    assert rel["properties"]["director"] == [person["ftm_id"]]
    assert rel["properties"]["organization"] == [org["ftm_id"]]

    history = client.get(f'/api/entities/{rel["relationship_entity_id"]}/statement-history').json()
    values = {(row["prop"], row["value"]) for row in history}
    assert ("role", "Board member") in values
    assert ("startDate", "2022-06-01") in values


def test_relationship_guards_cross_investigation_and_unknown_schema():
    client = TestClient(app)
    inv1 = client.post("/api/investigations", json={"name": "One"}).json()
    inv2 = client.post("/api/investigations", json={"name": "Two"}).json()
    a = make_entity(client, inv1["id"], "Person", "A")
    b = make_entity(client, inv2["id"], "Company", "B")

    cross = client.post("/api/relationships", json={
        "investigation_id": inv1["id"], "schema": "Employment",
        "source_entity_id": a["id"], "target_entity_id": b["id"],
    })
    assert cross.status_code == 400

    unknown = client.post("/api/relationships", json={
        "investigation_id": inv1["id"], "schema": "MadeUpRelationship",
        "source_entity_id": a["id"], "target_entity_id": a["id"],
    })
    assert unknown.status_code == 400

    schemas = client.get("/api/relationship-schemas").json()["schemas"]
    assert schemas["Employment"]["source_prop"] == "employee"
    assert schemas["Employment"]["target_prop"] == "employer"
