from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import router
from app.api.routes_system import router as system_router
from app.api.routes_provenance import router as provenance_router
from app.api.routes_sources import router as sources_router
from app.api.routes_reporting_tasks import router as reporting_tasks_router
from app.core.authorization import (
    AuthorizationScope,
    InvestigationAuthorizationError,
    authorization_scope_context,
    configured_remote_investigation_ids,
    reset_current_authorization_scope,
    scope_for_request,
    set_current_authorization_scope,
)
from app.core.config import settings
from app.db.mutation_guard import lock_pending_investigation_mutations
from app.db.session import Base, get_db
from app.models.domain import Entity, Investigation
from app.services.search import investigation_search


def _db_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _seed(factory):
    with factory() as db:
        allowed = Investigation(id="inv-allowed", name="Allowed newsroom")
        denied = Investigation(id="inv-denied", name="Private newsroom")
        db.add_all([allowed, denied])
        db.add_all([
            Entity(
                id="entity-allowed", investigation_id=allowed.id, ftm_id="person-allowed",
                schema="Person", caption="Visible Alice", properties={"name": ["Visible Alice"]},
            ),
            Entity(
                id="entity-denied", investigation_id=denied.id, ftm_id="person-denied",
                schema="Person", caption="Hidden Bob", properties={"name": ["Hidden Bob"]},
            ),
        ])
        db.commit()


def _scoped_app(factory) -> FastAPI:
    app = FastAPI()

    def db_override():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = db_override

    @app.exception_handler(InvestigationAuthorizationError)
    async def denied(_request, _exc):
        return JSONResponse(status_code=404, content={"detail": "Investigation not found"})

    @app.middleware("http")
    async def authorization_context(request, call_next):
        token = set_current_authorization_scope(scope_for_request(request))
        try:
            return await call_next(request)
        finally:
            reset_current_authorization_scope(token)

    app.include_router(router)
    app.include_router(system_router)
    app.include_router(provenance_router)
    app.include_router(sources_router)
    app.include_router(reporting_tasks_router)
    return app


def test_remote_scope_parser_is_allowlist_and_blank_is_legacy_unrestricted():
    assert configured_remote_investigation_ids("") is None
    assert configured_remote_investigation_ids(" inv-a,inv-b, inv-a ") == frozenset({"inv-a", "inv-b"})


def test_global_search_can_be_restricted_to_visible_investigations():
    factory = _db_factory()
    _seed(factory)
    with factory() as db:
        result = investigation_search(
            db,
            "Alice Bob",
            allowed_investigation_ids=frozenset({"inv-allowed"}),
        )
    assert result["results"]
    assert {item["investigation_id"] for item in result["results"]} == {"inv-allowed"}
    assert all("Hidden Bob" not in item["title"] for item in result["results"])


def test_mutation_guard_fails_closed_for_cross_investigation_write_on_sqlite():
    factory = _db_factory()
    _seed(factory)
    with factory() as db, authorization_scope_context(
        AuthorizationScope("reporter-a", frozenset({"inv-allowed"}), role="reporter")
    ):
        db.add(Entity(
            investigation_id="inv-denied", ftm_id="cross-write", schema="Person",
            caption="Should not persist", properties={"name": ["Should not persist"]},
        ))
        try:
            lock_pending_investigation_mutations(db)
        except InvestigationAuthorizationError:
            db.rollback()
        else:
            raise AssertionError("Cross-investigation write should be denied")

        assert db.query(Entity).filter(Entity.ftm_id == "cross-write").count() == 0


def test_remote_scoped_routes_hide_other_investigations_and_filter_global_surfaces(monkeypatch):
    factory = _db_factory()
    _seed(factory)
    monkeypatch.setattr(settings, "api_auth_investigation_ids", "inv-allowed")
    app = _scoped_app(factory)

    with TestClient(app, base_url="https://journalism.example.test") as client:
        investigations = client.get("/api/investigations")
        assert investigations.status_code == 200
        assert [row["id"] for row in investigations.json()] == ["inv-allowed"]

        search = client.get("/api/search", params={"q": "Alice Bob"})
        assert search.status_code == 200
        assert {row["investigation_id"] for row in search.json()["results"]} == {"inv-allowed"}

        allowed_dossier = client.get("/api/entities/entity-allowed/dossier")
        assert allowed_dossier.status_code == 200

        denied_dossier = client.get("/api/entities/entity-denied/dossier")
        assert denied_dossier.status_code == 404
        assert denied_dossier.json()["detail"] in {"Investigation not found", "Entity not found"}

        denied_graph = client.get("/api/investigations/inv-denied/graph")
        assert denied_graph.status_code == 404

        denied_write = client.post(
            "/api/entities",
            json={
                "investigation_id": "inv-denied",
                "schema": "Person",
                "caption": "Cross-scope write",
                "properties": {"name": ["Cross-scope write"]},
            },
        )
        assert denied_write.status_code == 404

    with factory() as db:
        assert db.query(Entity).filter(Entity.caption == "Cross-scope write").count() == 0
