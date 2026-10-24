from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import register_domain_routers
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

    register_domain_routers(app)
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


def _seed_presentation_and_relationship(factory, investigation_id: str, suffix: str) -> None:
    """A deck, a write-up and a relationship edge in one investigation."""
    from app.models.decks import Deck
    from app.models.relationships import RelationshipEdge
    from app.models.writeups import Writeup

    with factory() as db:
        ends = [
            Entity(id=f"{name}-{suffix}", investigation_id=investigation_id, ftm_id=f"{name}-{suffix}", schema=schema,
                   caption=name, properties={"name": [name]} if schema != "Ownership" else {})
            for name, schema in (("owner", "Person"), ("asset", "Company"), ("link", "Ownership"))
        ]
        db.add_all(ends)
        db.add_all([
            Deck(id=f"deck-{suffix}", investigation_id=investigation_id, title="Deck", slides_json=[]),
            Writeup(id=f"writeup-{suffix}", investigation_id=investigation_id, title="Write-up",
                    content_json={"type": "doc", "content": []}),
            RelationshipEdge(id=f"edge-{suffix}", investigation_id=investigation_id, relationship_entity_id=f"link-{suffix}",
                             schema="Ownership", source_entity_id=f"owner-{suffix}", target_entity_id=f"asset-{suffix}",
                             source_prop="owner", target_prop="asset"),
        ])
        db.commit()


def test_decks_writeups_and_relationships_stay_inside_their_investigation(monkeypatch):
    factory = _db_factory()
    _seed(factory)
    _seed_presentation_and_relationship(factory, "inv-allowed", "allowed")
    _seed_presentation_and_relationship(factory, "inv-denied", "denied")
    monkeypatch.setattr(settings, "api_auth_investigation_ids", "inv-allowed")
    app = _scoped_app(factory)

    with TestClient(app, base_url="https://journalism.example.test") as client:
        for path in ("/api/decks/deck-{}", "/api/writeups/writeup-{}", "/api/relationships/edge-{}/evidence-reviews"):
            assert client.get(path.format("allowed")).status_code == 200, path
            denied = client.get(path.format("denied"))
            assert denied.status_code == 404, path
            assert denied.json()["detail"] == "Investigation not found"
        assert client.get("/api/decks/deck-denied/export.pptx").status_code == 404
        assert client.get("/api/writeups/writeup-denied/export.docx").status_code == 404
        assert client.patch("/api/writeups/writeup-denied", json={"title": "Taken"}).status_code == 404
        assert client.delete("/api/decks/deck-denied").status_code == 404

    from app.models.decks import Deck
    from app.models.writeups import Writeup
    with factory() as db:
        assert db.get(Deck, "deck-denied") is not None
        assert db.get(Writeup, "writeup-denied").title == "Write-up"


# Path parameters that name something other than an investigation's record:
# console and settings routes are local-request-only, and these name a kind,
# a provider, a property or a table rather than a row.
_NOT_INVESTIGATION_RECORDS = {
    "investigation_id", "user_id", "provider", "prop", "name", "kind", "pk", "asset", "source",
    "aid", "bid", "cid", "qid", "rid", "tid", "uid",
    # The base map (routes_basemap.py): a tile's zoom and column and row, a font
    # stack and glyph range, a sprite file. The same for every investigation.
    "z", "x", "y", "stack", "glyph_range",
    # The indicator catalogue (routes_catalogue.py): the same for every investigation.
    "indicator_id",
    # A small real demo case (routes_demo.py, app/services/demo_cases.py): one of three fixed names.
    "case_id",
    # A suite system and module number (routes_investigations.investigation_suite_module, ADR-0015): the same for
    # every investigation, which the path names.
    "system", "number",
    # Records that live inside an investigation named in the same path, and are looked up through it:
    # a story section (stories.section_of), an AI run and a thought in it (routes_ai_runs._run_row, run_events),
    # a version of the story's write-up (routes_stories._version).
    # Another case's id gives a 404, so the scope check on investigation_id covers them.
    "section_id", "run_id", "thought_id", "version_id",
}


# An AI run, a story section, a thought and a write-up version exist only inside one investigation.
_NESTED_UNDER_INVESTIGATION = {"run_id", "section_id", "thought_id", "version_id"}


def test_every_record_in_a_path_is_traced_to_its_investigation():
    """A route that takes a record id the scope check cannot trace would let a
    reporter limited to one investigation read another's record (the gap the
    deck and write-up routes had)."""
    import inspect
    import re

    from app.core import authorization
    from app.main import app

    source = inspect.getsource(authorization._resource_investigation_id)
    paths = [path for path in app.openapi()["paths"] if path.startswith("/api/") and not path.startswith("/api/console/")]
    params = {name for path in paths for name in re.findall(r"{(\w+)}", path)}
    untraced = {name for name in params - _NOT_INVESTIGATION_RECORDS if f'"{name}"' not in source}
    # Records that only exist inside one investigation are reached through it
    # (/investigations/{investigation_id}/...), which the router check authorizes,
    # and each route looks the record up within that investigation (_run_row,
    # section_of). The guarantee holds only while the path stays nested, so it is
    # checked here rather than assumed.
    nested = {name for name in untraced if name in _NESTED_UNDER_INVESTIGATION}
    for path in paths:
        for name in nested & set(re.findall(r"{(\w+)}", path)):
            assert "{investigation_id}" in path, f"{path}: {name} must stay nested under {{investigation_id}}"
    untraced -= nested
    assert not untraced, f"path parameters the investigation scope cannot trace: {sorted(untraced)}"
