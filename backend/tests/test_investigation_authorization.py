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
    # A way the app tells a person outside it (routes_preferences.py: email, phone, webpush): theirs, in no case.
    "channel",
    # A voice in a recording (routes for Voices, app/services/voices.py): a number within the document named in the same
    # path, which document_id traces.
    "voice",
    # Records that live inside an investigation named in the same path, and are looked up through it:
    # a story section (stories.section_of), an AI run and a thought in it (routes_ai_runs._run_row, run_events),
    # a version of the story's write-up (routes_stories._version).
    # Another case's id gives a 404, so the scope check on investigation_id covers them.
    "section_id", "run_id", "thought_id", "version_id",
}


# An AI run, a story section, a thought and a write-up version exist only inside one investigation.
_NESTED_UNDER_INVESTIGATION = {"run_id", "section_id", "thought_id", "version_id"}


def test_every_record_in_a_path_is_traced_to_its_investigation(_two_cases):
    """A route that takes a record id the scope check cannot trace would let a
    reporter limited to one investigation read another's record (the gap the
    deck and write-up routes had). Asked of the scope check itself with case B's
    real records (review C5), not looked for in its source text."""
    import re

    from app.core import authorization
    from app.main import app

    _client, b_ids, factory = _two_cases
    paths = [path for path in app.openapi()["paths"] if path.startswith("/api/") and not path.startswith("/api/console/")]
    params = {name for path in paths for name in re.findall(r"{(\w+)}", path)}
    # Records that only exist inside one investigation are reached through it
    # (/investigations/{investigation_id}/...), which the router check authorizes,
    # and each route looks the record up within that investigation (_run_row,
    # section_of). The guarantee holds only while the path stays nested, so it is
    # checked here rather than assumed.
    for path in paths:
        for name in _NESTED_UNDER_INVESTIGATION & set(re.findall(r"{(\w+)}", path)):
            assert "{investigation_id}" in path, f"{path}: {name} must stay nested under {{investigation_id}}"
    untraced = []
    with factory() as db:
        for name in sorted(params - _NOT_INVESTIGATION_RECORDS):
            value = _b_value(name, b_ids)
            if value is None or authorization._resource_investigation_id(db, name, value) != _B_ID:
                untraced.append(name)
    assert not untraced, f"path parameters the investigation scope cannot trace: {untraced}"


# --- Review A5: try the other case's records on every route ------------------------------
#
# Case A is the one the remote scope allows; case B has one record of every kind
# (tests/full_rows.py), every string in it starting with _B, so a response that shows any of
# B's data shows the marker. Every investigation-scoped route is called with B's ids in its
# path, then with A's investigation and B's ids in the rest of the path, in the query and in
# the body. Each must refuse (403/404, or 4xx for a body) and show nothing of B.

import re as _re

import pytest as _pytest

_B = "zzB~"
_A_ID, _B_ID = "inv-scope-a", "inv-scope-b"

# Path and body names of the records a route can be given, and their tables. Names that are
# also foreign-key columns resolve through the models; these are the rest.
_RECORD_TABLES = {
    "built_id": ["built_timelines"], "candidate_id": ["extraction_candidates", "ai_analysis_candidates"],
    "capture_id": ["captures"], "check_id": ["check_items"], "cross_reference_id": ["cross_reference_proposals"],
    "deck_id": ["decks"], "derived_file_id": ["derived_files"], "fact_watch_id": ["fact_watches"],
    "hit_id": ["watchlist_hits"], "job_id": ["background_jobs"], "link_id": ["claim_evidence_links"],
    "monitor_item_id": ["monitor_items"], "note_id": ["notes"], "period_id": ["timeline_periods"],
    "saved_question_id": ["saved_questions"], "timeline_event_id": ["timeline_events"],
    "watch_id": ["watchlist_entries"], "version_id": ["writeup_versions", "story_versions"],
    "thought_id": ["ai_run_events"], "run_id": ["connector_runs", "ai_run_events"],
}


def _record_tables(name: str) -> list[str]:
    if name in _RECORD_TABLES:
        return [t for t in _RECORD_TABLES[name] if t in Base.metadata.tables]
    return sorted({fk.column.table.name for table in Base.metadata.tables.values()
                   for fk in table.foreign_keys if fk.parent.name == name})


def _scoped_operations() -> list[tuple[str, str]]:
    from app.main import app as real_app

    out = []
    for path, ops in real_app.openapi()["paths"].items():
        if not path.startswith("/api/") or path.startswith("/api/console/"):
            continue
        for method, op in ops.items():
            params = set(_re.findall(r"{(\w+)}", path))
            queries = {p["name"] for p in op.get("parameters", []) if p["in"] == "query"}
            if params & ({"investigation_id"} | set(_RECORD_TABLES)) or any(_record_tables(n) for n in params) \
                    or any(q.endswith("_id") for q in queries) or "requestBody" in op:
                out.append((method.upper(), path))
    return out


@_pytest.fixture(scope="module")
def _two_cases():
    from tests.full_rows import full_rows

    factory = _db_factory()
    b_rows = full_rows(Base.metadata, investigation_id=_B_ID, prefix=_B)
    a_rows = full_rows(Base.metadata, [t for t in Base.metadata.tables if t not in {"local_profile"}],
                       investigation_id=_A_ID, prefix="zzA~", int_start=1000)
    engine = factory.kw["bind"]
    with engine.begin() as conn:
        for rows in (b_rows, a_rows):
            for name, table_rows in rows.items():
                conn.execute(Base.metadata.tables[name].insert(), table_rows)
    b_ids = {name: [r[c.name] for r in rows for c in Base.metadata.tables[name].primary_key]
             for name, rows in b_rows.items()}
    with _pytest.MonkeyPatch.context() as mp:
        mp.setattr(settings, "api_auth_investigation_ids", _A_ID)
        app = _scoped_app(factory)
        with TestClient(app, base_url="https://journalism.example.test", raise_server_exceptions=False) as client:
            yield client, b_ids, factory


def _b_value(name: str, b_ids: dict[str, list]) -> str | None:
    if name == "investigation_id":
        return _B_ID
    for table in _record_tables(name):
        if b_ids.get(table):
            return str(b_ids[table][-1])
    return None


def _example(schema: dict, spec: dict, b_ids: dict, depth: int = 0) -> object:
    """The smallest value a schema accepts, with B's record wherever a field names one."""
    if "$ref" in schema:
        schema = spec["components"]["schemas"][schema["$ref"].rsplit("/", 1)[-1]]
    for key in ("anyOf", "oneOf", "allOf"):
        if key in schema:
            options = [s for s in schema[key] if s.get("type") != "null"] or schema[key]
            return _example(options[0], spec, b_ids, depth)
    if "enum" in schema:
        return schema["enum"][0]
    if "default" in schema and schema.get("type") != "object":
        return schema["default"]
    kind = schema.get("type")
    if kind == "object" or "properties" in schema:
        if depth > 4:
            return {}
        out = {}
        for name, sub in (schema.get("properties") or {}).items():
            value = _b_value(name, b_ids) if name.endswith("_id") else None
            if name == "investigation_id":
                out[name] = _A_ID
            elif value is not None:
                out[name] = value
            elif name.endswith("_ids") and _b_value(name[:-1], b_ids) is not None:
                out[name] = [_b_value(name[:-1], b_ids)]
            elif name in schema.get("required", []):
                out[name] = _example(sub, spec, b_ids, depth + 1)
        return out
    if kind == "array":
        return [_example(schema.get("items", {}), spec, b_ids, depth + 1)] if schema.get("minItems") else []
    if kind == "integer":
        return max(1, schema.get("minimum", 1))
    if kind == "number":
        return max(1.0, schema.get("minimum", 1.0))
    if kind == "boolean":
        return False
    if schema.get("format") == "date-time":
        return "2026-01-01T00:00:00Z"
    if schema.get("format") == "date":
        return "2026-01-01"
    return "x" * max(1, schema.get("minLength", 1))


def _binary_fields(schema: dict, spec: dict) -> list[str]:
    if "$ref" in schema:
        schema = spec["components"]["schemas"][schema["$ref"].rsplit("/", 1)[-1]]
    return [name for name, sub in (schema.get("properties") or {}).items()
            if sub.get("format") == "binary" or sub.get("contentMediaType") == "application/octet-stream"
            or any(o.get("format") == "binary" for o in sub.get("anyOf", []))]


@_pytest.mark.parametrize("method,path", _scoped_operations())
def test_another_cases_records_are_refused_on_every_route(_two_cases, method, path):
    """Review A5: the behavioural check behind the source-text check above."""
    from app.main import app as real_app

    client, b_ids, _factory = _two_cases
    spec = real_app.openapi()
    op = spec["paths"][path][method.lower()]
    names = _re.findall(r"{(\w+)}", path)
    record_names = [n for n in names if n != "investigation_id" and _b_value(n, b_ids) is not None]
    query_names = [p["name"] for p in op.get("parameters", []) if p["in"] == "query"]
    required_query = {p["name"]: p for p in op.get("parameters", []) if p["in"] == "query" and p.get("required")}
    json_schema = (op.get("requestBody", {}).get("content", {}).get("application/json") or {}).get("schema")
    is_multipart = "multipart/form-data" in op.get("requestBody", {}).get("content", {})

    def call(path_values: dict[str, str], query: dict[str, str], body: object):
        url = path
        for name in names:
            url = url.replace("{" + name + "}", path_values.get(name) or "x")
        kwargs: dict = {"params": query}
        if is_multipart:
            files = set(_binary_fields(op["requestBody"]["content"]["multipart/form-data"]["schema"], spec))
            kwargs["data"] = {k: v for k, v in (body or {}).items() if isinstance(v, str) and k not in files}
            kwargs["files"] = {k: ("note.txt", b"A note.", "text/plain") for k in files}
        elif json_schema is not None:
            kwargs["json"] = body
        return client.request(method, url, **kwargs)

    def base_query(investigation: str) -> dict[str, str]:
        query = {}
        for name, p in required_query.items():
            if name == "investigation_id":
                query[name] = investigation
            else:
                query[name] = str(_example(p.get("schema", {}), spec, b_ids))
        return query

    body = _example(json_schema, spec, b_ids) if json_schema else {}
    if is_multipart:
        schema = op["requestBody"]["content"]["multipart/form-data"]["schema"]
        body = _example(schema, spec, b_ids)
    tries: list[tuple[str, dict, dict, object]] = []
    a_path = {n: (_A_ID if n == "investigation_id" else _b_value(n, b_ids) or "x") for n in names}
    if "investigation_id" in names:
        # B's investigation with B's records: the router check alone refuses it.
        b_path = {n: (_b_value(n, b_ids) or "x") for n in names}
        tries.append(("B's investigation in the path", b_path, base_query(_B_ID), body))
    if record_names:
        # A's investigation (when the path has one) with B's records: the lookup must stay in A.
        tries.append(("B's record in the path", a_path, base_query(_A_ID), body))
    for name in query_names:
        value = _b_value(name, b_ids) if name.endswith("_id") else None
        if value is not None and name != "investigation_id":
            q = base_query(_A_ID) | {name: value}
            if "investigation_id" in query_names:
                q.setdefault("investigation_id", _A_ID)
            tries.append((f"B's {name} in the query", a_path, q, body))
    if "investigation_id" in query_names and "investigation_id" not in names:
        tries.append(("B's investigation in the query", a_path, base_query(_A_ID) | {"investigation_id": _B_ID}, body))
    body_ids = isinstance(body, dict) and any(_B in str(v) or v == _B_ID for v in body.values())
    if body_ids and not record_names and "investigation_id" not in names:
        tries.append(("B's records in the body", a_path, base_query(_A_ID), body))
    if not tries:
        _pytest.skip("names no record of a case")

    for what, path_values, query, sent in tries:
        response = call(path_values, query, sent)
        assert response.status_code < 500, f"{what}: {method} {path} answered {response.status_code}: {response.text[:300]}"
        if what == "B's records in the body":
            assert 400 <= response.status_code < 500, f"{what}: {method} {path} answered {response.status_code}: {response.text[:300]}"
        else:
            assert response.status_code in (403, 404, 422), f"{what}: {method} {path} answered {response.status_code}: {response.text[:300]}"
        if response.status_code != 422:  # a validation error echoes what was sent
            assert _B not in response.text and _B_ID not in response.text, f"{what}: {method} {path} shows case B: {response.text[:300]}"
