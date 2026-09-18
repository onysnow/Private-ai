from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.models.domain import AppUser, Entity, Investigation, InvestigationMembership
from app.services.identity import scope_for_persisted_token, token_digest
from app.core.authorization import authorization_scope_context, InvestigationAuthorizationError
from app.db.mutation_guard import lock_pending_investigation_mutations


def _factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def test_persisted_token_resolves_membership_roles_without_storing_plaintext():
    factory = _factory()
    token = "reporter-secret-token"
    with factory() as db:
        db.add(Investigation(id="inv-a", name="A"))
        user = AppUser(id="user-a", display_name="Reporter A", token_digest=token_digest(token))
        db.add(user)
        db.add(InvestigationMembership(user_id=user.id, investigation_id="inv-a", role="reporter"))
        db.commit()
        scope = scope_for_persisted_token(db, token)
        assert scope is not None
        assert scope.actor_id == "user-a"
        assert scope.allows("inv-a")
        assert scope.role_for("inv-a") == "reporter"
        assert scope.allows_write("inv-a")
        assert user.token_digest != token


def test_viewer_membership_is_read_only_at_orm_boundary():
    factory = _factory()
    token = "viewer-token"
    with factory() as db:
        db.add(Investigation(id="inv-a", name="A"))
        db.add(AppUser(id="viewer", display_name="Viewer", token_digest=token_digest(token)))
        db.add(InvestigationMembership(user_id="viewer", investigation_id="inv-a", role="viewer"))
        db.commit()
        scope = scope_for_persisted_token(db, token)
        assert scope is not None and scope.allows("inv-a") and not scope.allows_write("inv-a")
        with authorization_scope_context(scope):
            db.add(Entity(investigation_id="inv-a", ftm_id="blocked", schema="Person", caption="Blocked", properties={}))
            try:
                lock_pending_investigation_mutations(db)
            except InvestigationAuthorizationError:
                db.rollback()
            else:
                raise AssertionError("viewer write must be denied")
        assert db.query(Entity).filter(Entity.ftm_id == "blocked").count() == 0


def test_global_admin_token_is_unrestricted_and_write_capable():
    factory = _factory()
    with factory() as db:
        db.add(AppUser(id="admin", display_name="Admin", token_digest=token_digest("admin-token"), global_role="admin"))
        db.commit()
        scope = scope_for_persisted_token(db, "admin-token")
        assert scope is not None and scope.unrestricted and scope.role == "admin"
        assert scope.allows_write("any-investigation")


def test_local_owner_can_create_user_and_membership_and_token_is_only_returned_once():
    from fastapi import FastAPI
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

    factory = _factory()
    with factory() as db:
        db.add(Investigation(id="inv-a", name="A"))
        db.commit()

    app = FastAPI()
    def db_override():
        db = factory()
        try:
            yield db
        finally:
            db.close()
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

    with TestClient(app) as client:
        created = client.post("/api/settings/security/users", json={"display_name": "Reporter One"})
        assert created.status_code == 200
        body = created.json()
        assert body["token"]
        assert body["global_role"] == "member"
        user_id = body["id"]

        membership = client.put(
            f"/api/settings/security/users/{user_id}/investigations/inv-a",
            json={"role": "reporter"},
        )
        assert membership.status_code == 200
        assert membership.json()["role"] == "reporter"

        listed = client.get("/api/settings/security/users")
        assert listed.status_code == 200
        assert listed.json()[0]["memberships"] == [{"investigation_id": "inv-a", "role": "reporter"}]
        assert "token" not in listed.json()[0]

    with factory() as db:
        user = db.get(AppUser, user_id)
        assert user is not None
        assert user.token_digest == token_digest(body["token"])


def test_token_usage_revocation_and_disable_lifecycle():
    factory = _factory()
    token = "lifecycle-token"
    with factory() as db:
        db.add(Investigation(id="inv-a", name="A"))
        user = AppUser(id="user-life", display_name="Lifecycle", token_digest=token_digest(token))
        db.add(user)
        db.add(InvestigationMembership(user_id=user.id, investigation_id="inv-a", role="reporter"))
        db.commit()

        scope = scope_for_persisted_token(db, token, mark_used=True)
        assert scope is not None and scope.allows_write("inv-a")
        db.refresh(user)
        assert user.token_last_used_at is not None

        user.disabled = True
        db.commit()
        assert scope_for_persisted_token(db, token) is None
        user.disabled = False
        user.token_revoked_at = user.token_last_used_at
        db.commit()
        assert scope_for_persisted_token(db, token) is None


def test_local_owner_can_disable_rotate_and_revoke_user_token():
    from fastapi import FastAPI
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

    factory = _factory()
    app = FastAPI()
    def db_override():
        db = factory()
        try:
            yield db
        finally:
            db.close()
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

    with TestClient(app) as client:
        created = client.post("/api/settings/security/users", json={"display_name": "Reporter Lifecycle"})
        assert created.status_code == 200
        user_id = created.json()["id"]
        original_token = created.json()["token"]

        disabled = client.patch(f"/api/settings/security/users/{user_id}", json={"disabled": True})
        assert disabled.status_code == 200
        assert disabled.json()["disabled"] is True
        assert disabled.json()["disabled_at"] is not None

        enabled = client.patch(f"/api/settings/security/users/{user_id}", json={"disabled": False, "global_role": "admin"})
        assert enabled.status_code == 200
        assert enabled.json()["disabled"] is False
        assert enabled.json()["disabled_at"] is None
        assert enabled.json()["global_role"] == "admin"

        rotated = client.post(f"/api/settings/security/users/{user_id}/token/rotate")
        assert rotated.status_code == 200
        replacement_token = rotated.json()["token"]
        assert replacement_token and replacement_token != original_token
        assert rotated.json()["token_rotated_at"] is not None

        listed = client.get("/api/settings/security/users")
        assert listed.status_code == 200
        row = listed.json()[0]
        assert row["token_status"] == "active"
        assert row["token_rotated_at"] is not None
        assert "token" not in row and "token_digest" not in row

        revoked = client.post(f"/api/settings/security/users/{user_id}/token/revoke")
        assert revoked.status_code == 200
        assert revoked.json()["token_status"] == "revoked"
        assert revoked.json()["token_revoked_at"] is not None

    with factory() as db:
        user = db.get(AppUser, user_id)
        assert user is not None
        assert user.token_digest == token_digest(replacement_token)
        assert user.token_digest != token_digest(original_token)
        assert user.token_rotated_at is not None
        assert user.token_revoked_at is not None
        assert scope_for_persisted_token(db, original_token) is None
        assert scope_for_persisted_token(db, replacement_token) is None


def test_rotating_revoked_token_reactivates_credential_but_not_disabled_user():
    from fastapi import FastAPI
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

    factory = _factory()
    app = FastAPI()
    def db_override():
        db = factory()
        try:
            yield db
        finally:
            db.close()
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

    with TestClient(app) as client:
        created = client.post("/api/settings/security/users", json={"display_name": "Reporter Revoked"})
        user_id = created.json()["id"]
        client.post(f"/api/settings/security/users/{user_id}/token/revoke")
        rotated = client.post(f"/api/settings/security/users/{user_id}/token/rotate")
        assert rotated.status_code == 200
        new_token = rotated.json()["token"]
        client.patch(f"/api/settings/security/users/{user_id}", json={"disabled": True})

    with factory() as db:
        user = db.get(AppUser, user_id)
        assert user.token_revoked_at is None
        assert user.disabled is True
        assert scope_for_persisted_token(db, new_token) is None
