"""The visuals routes (app/api/routes_visuals.py): the catalogue, the
preview, their response models (no field dropped), and the investigation
scope that every route in this app keeps."""

from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi.testclient import TestClient
from pydantic import TypeAdapter
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.session import Base, SessionLocal
from app.main import app
from app.schemas import responses as r
from app.services.demo_seed import seed_demo_investigation
from app.services.presentation_style import theme as theme_for
from app.visuals.checker import check_visual
from app.visuals.data_service import describe_catalog, run_query
from app.visuals.echarts import build_chart
from app.visuals.spec import parse_spec

client = TestClient(app)

SPEC = {"kind": "bar", "title": "Meridian received all of the money", "query": {"name": "payments_by_party", "params": {"direction": "received"}}}


def _demo_id() -> str:
    with SessionLocal() as db:
        inv, _ = seed_demo_investigation(db)
        return inv.id


def _same_through_model(model: Any, raw: Any) -> None:
    unfiltered = jsonable_encoder(raw)
    adapter = TypeAdapter(model)
    filtered = adapter.dump_python(adapter.validate_python(raw), mode="json")
    assert filtered == unfiltered, f"{model} changes the reply"


def test_catalog_lists_the_menu_for_this_investigation():
    inv_id = _demo_id()
    response = client.get(f"/api/investigations/{inv_id}/visuals/catalog")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["investigation_id"] == inv_id
    by_name = {q["name"]: q for q in body["queries"]}
    assert by_name["payments_by_party"]["has_data"] is True
    assert by_name["payments_by_party"]["params"]["currency"]["choices"] is None
    assert by_name["documents_by_status"]["has_data"] is False
    assert body["drawn_kinds"] == ["bar", "column"]
    assert client.get("/api/investigations/nope/visuals/catalog").status_code == 404


def test_preview_cooks_draws_and_checks_an_order_without_the_ai():
    inv_id = _demo_id()
    response = client.post(f"/api/investigations/{inv_id}/visuals/preview", json=SPEC)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["spec"]["kind"] == "bar" and body["spec"]["theme"] == "dark_academia"
    assert body["data"]["rows"][0]["label"] == "Meridian Holdings Ltd"
    assert body["data"]["rows"][0]["record_refs"][0]["record_type"] == "relationship"
    assert body["option"]["title"][0]["text"] == SPEC["title"]
    assert body["option"]["animation"] is False
    assert body["report"]["ok"] is True and body["report"]["not_checked"] == {"17": body["report"]["not_checked"]["17"], "18": body["report"]["not_checked"]["18"]}
    assert body["alt_text"].startswith("Bar chart")
    assert body["data_table"]["rows"][0]["record_count"] == 1
    assert body["source_line"].startswith("Source: 1 payment")
    assert (body["width"], body["height"]) == (960, 540)


def test_preview_returns_a_failing_report_rather_than_hiding_it():
    inv_id = _demo_id()
    response = client.post(f"/api/investigations/{inv_id}/visuals/preview", json={**SPEC, "title": "Payments"})
    assert response.status_code == 200
    body = response.json()
    assert body["report"]["ok"] is False
    assert [e["rule"] for e in body["report"]["errors"]] == [13]


def test_preview_refuses_bad_orders_and_kinds_not_drawn_yet():
    inv_id = _demo_id()
    bad = client.post(f"/api/investigations/{inv_id}/visuals/preview", json={**SPEC, "query": {"name": "nope"}})
    assert bad.status_code == 422
    assert "unknown query 'nope'" in bad.text
    numbers = client.post(f"/api/investigations/{inv_id}/visuals/preview", json={**SPEC, "values": [1, 2]})
    assert numbers.status_code == 422
    sankey = client.post(f"/api/investigations/{inv_id}/visuals/preview", json={**SPEC, "kind": "sankey"})
    assert sankey.status_code == 422 and "not drawn yet" in sankey.text
    assert client.post("/api/investigations/nope/visuals/preview", json=SPEC).status_code == 404


def test_response_models_keep_every_field():
    inv_id = _demo_id()
    with SessionLocal() as db:
        _same_through_model(r.VisualCatalogOut, describe_catalog(db, inv_id))
        spec = parse_spec(SPEC)
        data = run_query(db, inv_id, spec.query)
        theme = theme_for(spec.theme)
        built = build_chart(spec, data, theme)
        report = check_visual(spec, data, theme, built)
        reply = {
            "spec": spec.model_dump(mode="json"), "data": data.as_dict(), "option": built.option, "report": report.as_dict(),
            "alt_text": built.alt_text, "description": built.description, "data_table": built.data_table,
            "source_line": built.source_line, "width": built.width, "height": built.height,
        }
        _same_through_model(r.VisualPreviewOut, reply)


def test_operation_ids_follow_the_route_names():
    schema = app.openapi()
    assert schema["paths"]["/api/investigations/{investigation_id}/visuals/catalog"]["get"]["operationId"] == "investigation_visual_catalog"
    assert schema["paths"]["/api/investigations/{investigation_id}/visuals/preview"]["post"]["operationId"] == "investigation_visual_preview"


def test_routes_are_scoped_to_the_investigations_a_token_may_see(monkeypatch):
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse

    from app.core.authorization import InvestigationAuthorizationError, reset_current_authorization_scope, scope_for_request, set_current_authorization_scope
    from app.db.session import get_db
    from app.main import register_domain_routers

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as db:
        allowed, _ = seed_demo_investigation(db)
        allowed_id = allowed.id
        from app.models.domain import Investigation

        denied = Investigation(id="inv-denied", name="Private newsroom")
        db.add(denied)
        db.commit()
    monkeypatch.setattr(settings, "api_auth_investigation_ids", allowed_id)

    scoped = FastAPI()

    def db_override():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    scoped.dependency_overrides[get_db] = db_override

    @scoped.exception_handler(InvestigationAuthorizationError)
    async def denied_handler(_request, _exc):
        return JSONResponse(status_code=404, content={"detail": "Investigation not found"})

    @scoped.middleware("http")
    async def authorization_context(request, call_next):
        token = set_current_authorization_scope(scope_for_request(request))
        try:
            return await call_next(request)
        finally:
            reset_current_authorization_scope(token)

    register_domain_routers(scoped)
    with TestClient(scoped, base_url="https://journalism.example.test") as remote:
        assert remote.get(f"/api/investigations/{allowed_id}/visuals/catalog").status_code == 200
        assert remote.get("/api/investigations/inv-denied/visuals/catalog").status_code == 404
        assert remote.post(f"/api/investigations/{allowed_id}/visuals/preview", json=SPEC).status_code == 200
        assert remote.post("/api/investigations/inv-denied/visuals/preview", json=SPEC).status_code == 404
