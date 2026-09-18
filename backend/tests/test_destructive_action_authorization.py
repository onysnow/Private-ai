from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import router
from app.api.routes_system import router as system_router
from app.api.routes_provenance import router as provenance_router
from app.api.routes_sources import router as sources_router
from app.api.routes_reporting_tasks import router as reporting_tasks_router
from app.api.routes_connectors import router as connectors_router
from app.api.routes_extraction_candidates import router as extraction_candidates_router
from app.api.routes_enrichment_sessions import router as enrichment_sessions_router
from app.api.routes_backups import router as backups_router
from app.api.routes_relationships import router as relationships_router
from app.api.routes_claims import router as claims_router
from app.api.routes_leads import router as leads_router
from app.api.routes_documents import router as documents_router
from app.api.routes_connector_findings import router as connector_findings_router
from app.api.routes_settings import router as settings_router
from app.api.routes_entities import router as entities_router
from app.core.authorization import (
    AuthorizationScope,
    reset_current_authorization_scope,
    set_current_authorization_scope,
)
from app.core.config import settings
from app.db.session import Base, get_db
from app.models.domain import Investigation


def _factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _app(factory, scope: AuthorizationScope) -> FastAPI:
    app = FastAPI()

    def db_override():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    @app.middleware("http")
    async def scoped_request(request, call_next):
        request.state.authorization_scope = scope
        token = set_current_authorization_scope(scope)
        try:
            return await call_next(request)
        finally:
            reset_current_authorization_scope(token)

    app.dependency_overrides[get_db] = db_override
    app.include_router(router)
    app.include_router(system_router)
    app.include_router(provenance_router)
    app.include_router(sources_router)
    app.include_router(reporting_tasks_router)
    app.include_router(connectors_router)
    app.include_router(extraction_candidates_router)
    app.include_router(enrichment_sessions_router)
    app.include_router(backups_router)
    app.include_router(relationships_router)
    app.include_router(claims_router)
    app.include_router(leads_router)
    app.include_router(documents_router)
    app.include_router(connector_findings_router)
    app.include_router(settings_router)
    app.include_router(entities_router)
    return app


def _seed(factory):
    with factory() as db:
        db.add(Investigation(id="inv-a", name="A"))
        db.commit()


def test_reporter_cannot_delete_investigation(tmp_path, monkeypatch):
    factory = _factory(); _seed(factory)
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path))
    app = _app(factory, AuthorizationScope(
        actor_id="reporter", investigation_ids=frozenset({"inv-a"}), role="member",
        investigation_roles=(("inv-a", "reporter"),),
    ))
    with TestClient(app) as client:
        response = client.delete("/api/investigations/inv-a", params={"confirmation": "inv-a"})
    assert response.status_code == 403
    assert response.json()["detail"] == "Investigation admin role required"
    with factory() as db:
        assert db.get(Investigation, "inv-a") is not None


def test_investigation_admin_can_delete_investigation(tmp_path, monkeypatch):
    factory = _factory(); _seed(factory)
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path))
    app = _app(factory, AuthorizationScope(
        actor_id="inv-admin", investigation_ids=frozenset({"inv-a"}), role="member",
        investigation_roles=(("inv-a", "admin"),),
    ))
    with TestClient(app) as client:
        preview = client.get("/api/investigations/inv-a/deletion-preview")
        assert preview.status_code == 200
        confirmation = preview.json()["requires_confirmation"]
        response = client.delete("/api/investigations/inv-a", params={"confirmation": confirmation})
    assert response.status_code == 200
    with factory() as db:
        assert db.get(Investigation, "inv-a") is None


def test_reporter_cannot_restore_backup_before_payload_processing(monkeypatch):
    factory = _factory()
    monkeypatch.setattr(settings, "enable_restore_api", True)
    app = _app(factory, AuthorizationScope(
        actor_id="reporter", investigation_ids=frozenset({"inv-a"}), role="member",
        investigation_roles=(("inv-a", "reporter"),),
    ))
    with TestClient(app) as client:
        response = client.post(
            "/api/backups/restore",
            files={"file": ("backup.jwbackup.zip", b"not-a-real-backup", "application/zip")},
        )
    assert response.status_code == 403
    assert response.json()["detail"] == "Global admin role required"


def test_global_admin_reaches_restore_validation(monkeypatch):
    factory = _factory()
    monkeypatch.setattr(settings, "enable_restore_api", True)
    app = _app(factory, AuthorizationScope(actor_id="global-admin", investigation_ids=None, role="admin"))
    with TestClient(app) as client:
        response = client.post(
            "/api/backups/restore",
            files={"file": ("backup.jwbackup.zip", b"not-a-real-backup", "application/zip")},
        )
    assert response.status_code == 400
