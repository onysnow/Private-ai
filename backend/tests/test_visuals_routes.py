"""The visuals routes (app/api/routes_visuals.py): the catalogue, the
preview, their response models (no field dropped), and the investigation
scope that every route in this app keeps."""

from typing import Any

import pytest
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
    assert body["drawn_kinds"] == ["area", "bar", "column", "donut", "histogram", "line", "scatter", "stacked_bar_100", "treemap"]
    assert [q["id"] for q in body["questions"]] == ["ranking", "change_over_time", "part_of_whole", "distribution", "correlation", "flow"]
    assert by_name["payment_amounts"]["questions"] == ["ranking", "distribution"]
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


def _demo_with_payments() -> str:
    """The demo investigation with more payments, so every statistical kind
    has something to draw: amounts to bin, parties to rank and plot, months
    to follow."""
    from app.models.domain import Entity
    from app.services.relationships import create_relationship

    with SessionLocal() as db:
        inv, _ = seed_demo_investigation(db)
        ids = {e.caption: e.id for e in db.query(Entity).filter_by(investigation_id=inv.id).all()}
        for payer, payee, amount, date in (
            ("Meridian Holdings Ltd", "Harborline Civic Trust", "5000", "2023-12-02"), ("Meridian Holdings Ltd", "Harborline Civic Trust", "7000", "2024-01-15"),
            ("Meridian Holdings Ltd", "Alaric Voss", "45000", "2024-01-20"), ("Bellcastle Trading Group", "Alaric Voss", "250000", "2024-02-03"),
            ("Meridian Holdings Ltd", "Priya Kavanagh", "12000", "2024-02-11"),
        ):
            create_relationship(db, investigation_id=inv.id, schema="Payment", source_entity_id=ids[payer], target_entity_id=ids[payee],
                                properties={"amount": [amount], "currency": ["USD"], "date": [date]})
        return inv.id


KIND_ORDERS = {
    "line": {"kind": "line", "title": "Payments fell after the November transfer", "query": {"name": "payments_over_time"}},
    "area": {"kind": "area", "title": "Payments fell after the November transfer", "query": {"name": "payments_over_time"}},
    "stacked_bar_100": {"kind": "stacked_bar_100", "title": "Meridian received most of the money", "query": {"name": "payments_by_party"}},
    "donut": {"kind": "donut", "title": "Meridian received most of the money", "query": {"name": "payments_by_party"}, "limit": 3},
    # The payments are too lopsided for a treemap to name each part (rule 12); the kinds of link are not.
    "treemap": {"kind": "treemap", "title": "Payments are most of the links", "query": {"name": "links_by_type"}},
    "histogram": {"kind": "histogram", "title": "Most payments were small", "query": {"name": "payment_amounts"}},
    "scatter": {"kind": "scatter", "title": "Meridian took one large payment", "query": {"name": "payments_count_and_total_by_party"}},
}


def test_preview_draws_and_checks_every_statistical_kind():
    inv_id = _demo_with_payments()
    for kind, order in KIND_ORDERS.items():
        response = client.post(f"/api/investigations/{inv_id}/visuals/preview", json=order)
        assert response.status_code == 200, (kind, response.text)
        body = response.json()
        assert body["spec"]["kind"] == kind and body["report"]["ok"] is True, (kind, body["report"]["errors"])
        assert body["option"]["series"] and body["data_table"]["rows"] and body["alt_text"]
        assert set(body["report"]["not_applicable"]).isdisjoint({str(r) for r in body["report"]["checked_rules"]})
    scatter = client.post(f"/api/investigations/{inv_id}/visuals/preview", json=KIND_ORDERS["scatter"]).json()
    assert scatter["data"]["measure_labels"]["x"] == "Number of payments received" and "x" in scatter["data"]["rows"][0]
    assert "x_formatted" in scatter["data_table"]["rows"][0]
    donut = client.post(f"/api/investigations/{inv_id}/visuals/preview", json=KIND_ORDERS["donut"]).json()
    assert sum(row["share"] for row in donut["data_table"]["rows"]) == pytest.approx(100, abs=0.5)


def test_preview_refuses_a_kind_that_cannot_draw_the_query():
    inv_id = _demo_id()
    response = client.post(f"/api/investigations/{inv_id}/visuals/preview", json={**SPEC, "kind": "histogram"})
    assert response.status_code == 422 and "a histogram needs one value per record" in response.text
    pairs = client.post(f"/api/investigations/{inv_id}/visuals/preview", json={**KIND_ORDERS["scatter"], "kind": "bar"})
    assert pairs.status_code == 422 and "draw it as a scatter plot" in pairs.text


def test_response_models_keep_every_field_for_every_kind():
    inv_id = _demo_with_payments()
    with SessionLocal() as db:
        for order in KIND_ORDERS.values():
            spec = parse_spec(order)
            data = run_query(db, inv_id, spec.query)
            theme = theme_for(spec.theme)
            built = build_chart(spec, data, theme)
            report = check_visual(spec, data, theme, built)
            _same_through_model(r.VisualPreviewOut, {
                "spec": spec.model_dump(mode="json"), "data": data.as_dict(), "option": built.option, "report": report.as_dict(),
                "alt_text": built.alt_text, "description": built.description, "data_table": built.data_table,
                "source_line": built.source_line, "width": built.width, "height": built.height,
            })


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
