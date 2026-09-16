from fastapi.testclient import TestClient
from app.db.session import Base, engine
from app.main import app
from app.connectors.registry import registry
from app.connectors.base import Connector, ExternalFinding

class AConnector(Connector):
    async def search(self, query: str): return []
    async def enrich(self, entity: dict):
        return [ExternalFinding(provider="a", record_id="a-1", caption="NiSource Inc", schema="Company", properties={"name":["NiSource Inc."],"leiCode":["549300ABC123"],"jurisdiction":["us-in"]}, url="https://a.example/a-1", raw={})]

class BConnector(Connector):
    async def search(self, query: str): return []
    async def enrich(self, entity: dict):
        return [ExternalFinding(provider="b", record_id="b-1", caption="NISOURCE INC.", schema="Company", properties={"name":["NiSource Inc"],"leiCode":["549300ABC123"],"address":["801 E 86th Ave"]}, url="https://b.example/b-1", raw={})]

def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    registry.register("a", AConnector()); registry.register("b", BConnector())

def test_cross_provider_cluster_and_reporter_decision():
    client=TestClient(app)
    inv=client.post("/api/investigations",json={"name":"Cluster test"}).json()
    entity=client.post("/api/entities",json={"investigation_id":inv["id"],"schema":"Company","caption":"NiSource Inc.","properties":{"name":["NiSource Inc."]}}).json()
    session=client.post(f'/api/entities/{entity["id"]}/enrich',json={"providers":["a","b"]}).json()
    clusters=client.get(f'/api/enrichment-sessions/{session["id"]}/clusters').json()
    assert len(clusters)==1
    c=clusters[0]
    assert set(c["providers"])=={"a","b"}
    assert c["score"] >= 0.9
    assert any(r["kind"]=="identifier" for r in c["pairs"][0]["reasons"])
    assert c["decision"] is None
    decision=client.post(f'/api/enrichment-sessions/{session["id"]}/clusters/decision',json={"finding_ids":c["finding_ids"],"decision":"positive","confidence":0.98,"rationale":"Matching LEI and name"})
    assert decision.status_code==200
    refreshed=client.get(f'/api/enrichment-sessions/{session["id"]}/clusters').json()[0]
    assert refreshed["decision"]["decision"]=="positive"
    history=client.get(f'/api/entities/{entity["id"]}/cross-provider-decisions').json()
    assert history[0]["cluster_key"]==c["cluster_key"]

def test_cross_provider_decision_rejects_same_provider_only():
    client=TestClient(app)
    inv=client.post("/api/investigations",json={"name":"Provider guard"}).json()
    entity=client.post("/api/entities",json={"investigation_id":inv["id"],"schema":"Company","caption":"Acme","properties":{"name":["Acme"]}}).json()
    session=client.post(f'/api/entities/{entity["id"]}/enrich',json={"providers":["a"]}).json()
    findings=client.get(f'/api/investigations/{inv["id"]}/connector-findings').json()
    ids=[f["id"] for f in findings if f["provider"]=="a"]
    # duplicate same provider id to exercise the minimum guard first
    response=client.post(f'/api/enrichment-sessions/{session["id"]}/clusters/decision',json={"finding_ids":[ids[0]],"decision":"positive"})
    assert response.status_code==400
