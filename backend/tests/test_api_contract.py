"""The API keeps the contract its OpenAPI schema publishes (Foundation Fixes fix 3).

Schemathesis (MIT; pinned in requirements-test.txt) loads the schema the app
serves at /openapi.json and calls every operation through the app itself:
ASGI, in this process, with no server and no network. The read and the write
tests each start from the same seeded database (tests/conftest.py empties it
between tests), on SQLite and, in the PostgreSQL gate, on PostgreSQL.

Reads (every GET):
  * once with ids from the seeded data and no optional parameters. The reply
    must be 2xx and match the declared model, so every read is proven on real
    data, not only on refusals;
  * then, when it takes query parameters, READ_EXAMPLES more times with
    values its schema allows (Schemathesis's positive mode). Every reply must
    be one the operation documents, in the declared shape: a refusal (4xx) in
    the declared error shape is fine, a server error (5xx) is not.

Writes (every POST, PUT, PATCH and DELETE), with path ids from the same data,
deletions last:
  * WRITE_EXAMPLES requests the schema allows: no 5xx, and every reply,
    success or refusal, documented and in its declared shape;
  * WRITE_EXAMPLES requests the schema forbids (negative mode), where a body
    or a query parameter the test does not fill in can be made invalid:
    refused with a 4xx in the declared error shape.

The only server errors allowed are those an operation documents, which are
about an outside service rather than the request: with OpenAleph switched off
(as here), its operations answer the documented 503 (`_config`).

How the examples are chosen: Hypothesis draws them from each operation's JSON
Schema, with derandomize=True so every run sends the same requests and a
failure reproduces; nothing is shrunk or replayed (a failure is reported as
found, with the curl command Schemathesis prints for it). Three of each keep
the file at about 40 seconds on a busy two-core machine (measured 2026-10-02,
load average 7-9: 37 s on SQLite, 47 s on PostgreSQL), about 700 requests.

What stands in for the outside world: the connector registry holds only
stand-in providers, the AI model is a stand-in that answers with one
presentation draft, the console's test runner never starts pytest, and its API
playground answers from a stand-in transport. Opening a network connection
fails the request (`_no_network`), so nothing here can reach the network.
"""

from __future__ import annotations

import io
import socket
import time
import types
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import hypothesis
import pytest
import schemathesis
from basemap_helpers import install_basemap
from fastapi import FastAPI
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, Phase
from schemathesis.checks import not_a_server_error
from schemathesis.errors import FailureGroup
from schemathesis.python import asgi as schemathesis_asgi
from schemathesis.specs.openapi.checks import (
    content_type_conformance,
    negative_data_rejection,
    response_schema_conformance,
    status_code_conformance,
)
from test_response_models import (
    _ConnectorA,
    _ConnectorB,
    _ConnectorDown,
    _DraftModel,
    _presentation_draft,
)

READ_EXAMPLES = 3
WRITE_EXAMPLES = 3
# Seconds one request may take. Schemathesis's default (10) is for a server of
# its own; here the app runs in this process, on a machine other test suites
# may be sharing, and an AI run builds its whole retrieval packet first.
REQUEST_TIMEOUT = 60

# What every reply is held to: no server error (unless the operation documents
# that status, see `_config`); a status the operation documents; the declared
# media type; the declared shape for that status.
CHECKS = [not_a_server_error, status_code_conformance, content_type_conformance, response_schema_conformance]

# Same requests every run; no example database written into the repository;
# no time limit per example, nor a health check on how fast examples are made
# (the machine's load decides both; the file's total is what is bounded); no
# shrinking.
SETTINGS = hypothesis.settings(
    derandomize=True, database=None, deadline=None, phases=[Phase.explicit, Phase.generate],
    suppress_health_check=[HealthCheck.too_slow],
)

# Never called: the events stream stays open for as long as the client
# listens (its media type is declared; tests/test_opsconsole_package.py reads
# it), and a migration upgrade would rewrite the schema of the database every
# other test shares (its reply is the run status every other run start shows).
NOT_CALLED = {("GET", "/api/console/events"), ("POST", "/api/console/schema/migrations/upgrade")}


def _no_network(*_args: Any, **_kwargs: Any) -> Any:
    raise OSError("the contract test never opens a network connection")


def _config(app: FastAPI) -> schemathesis.Config:
    """The only server errors not_a_server_error lets through: those an
    operation documents. They are answers about an outside service, not about
    the request (`upstream` in app/schemas/responses.py); here, with OpenAleph
    switched off, its operations answer the documented 503."""
    operations = []
    for path, item in app.openapi()["paths"].items():
        for method, operation in item.items():
            documented = [status for status in operation["responses"] if status.startswith("5")]
            if documented:
                operations.append({"include-name": f"{method.upper()} {path}", "checks": {
                    "not_a_server_error": {"expected-statuses": ["2xx", "3xx", "4xx", *documented]}}})
    return schemathesis.Config.from_dict({"operations": operations})


@dataclass
class Seeded:
    """Ids from the seeded data, for every path parameter the API has."""
    ids: dict[str, str]
    # Where one parameter name means different records in different operations.
    per_operation: dict[tuple[str, str], dict[str, str]] = field(default_factory=dict)
    # Required query parameters for the call on real data.
    queries: dict[tuple[str, str], dict[str, Any]] = field(default_factory=dict)

    def path_parameters(self, operation: schemathesis.APIOperation) -> dict[str, str]:
        key = (operation.method.upper(), operation.path)
        values = {**self.ids, **self.per_operation.get(key, {})}
        names = [parameter.name for parameter in operation.path_parameters]
        missing = [name for name in names if name not in values]
        assert not missing, f"{operation.label}: no seeded id for {missing}"
        return {name: values[name] for name in names}


class _TestRunner:
    """The console's test runner without the pytest subprocess: one test,
    which passes (opsconsole.adapters.pytest_runner.PytestRunner otherwise)."""

    def collect(self) -> list[Any]:
        from opsconsole.protocols import TestNode

        return [TestNode(id="tests/test_a.py", kind="file", title="tests/test_a.py"),
                TestNode(id="tests/test_a.py::test_one", kind="test", parent="tests/test_a.py", title="test_one")]

    def run(self, selection: str | None, handle: Any) -> int:
        handle.log("tests/test_a.py::test_one PASSED")
        handle.log("1 passed in 0.01s")
        return 0


def _wait(app: FastAPI, run_id: str, timeout: float = 60.0) -> None:
    """Until a console run is finished and its kind is free again
    (TaskSupervisor records the finish before it lets go of the kind)."""
    console = app.state.opsconsole
    deadline = time.time() + timeout
    while time.time() < deadline:
        row = console.store.run_get(run_id)
        if row and row["status"] != "running" and not console.supervisor.is_running(row["kind"]):
            return
        time.sleep(0.05)
    raise AssertionError(f"console run {run_id} did not finish")


@pytest.fixture
def contract(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[schemathesis.BaseSchema, Seeded]]:
    import app.ai.reasoning as reasoning
    from app.ai.governor import governor
    from app.connectors.registry import registry
    from app.core.config import Settings, settings
    from app.main import create_app
    from opsconsole.adapters.pytest_runner import PytestRunner
    from opsconsole.api import apiplay

    # Files the routes write go to this test's folder.
    for name, value in {"document_storage_dir": tmp_path / "documents", "connector_credentials_file": tmp_path / "connectors.json",
                        "audit_log_file": tmp_path / "audit.jsonl", "app_log_file": tmp_path / "app.jsonl",
                        "console_dir": tmp_path / "console", "basemap_dir": tmp_path / "basemap"}.items():
        monkeypatch.setattr(settings, name, str(value))
    # A small base map, so its tiles, fonts and sprites answer (app/services/basemap.py).
    install_basemap(tmp_path / "basemap")
    # AI on, answered by a stand-in model; connectors are stand-ins only.
    monkeypatch.setattr(settings, "enable_ai_features", True)
    monkeypatch.setattr(settings, "ai_provider", "anthropic")
    monkeypatch.setattr(settings, "ai_runs_per_minute", 10_000)
    governor.reset()
    monkeypatch.setattr(registry, "_connectors", {c.name: c for c in (_ConnectorA(), _ConnectorB(), _ConnectorDown())})
    # The console's test runner and API playground, without a subprocess or a socket.
    monkeypatch.setattr(PytestRunner, "collect", _TestRunner.collect)
    monkeypatch.setattr(PytestRunner, "run", _TestRunner.run)
    # Only the playground's own reference to httpx is replaced (apiplay imports the module).
    standin = types.ModuleType("httpx")
    standin.__dict__.update(httpx.__dict__)
    answer = httpx.MockTransport(lambda request: httpx.Response(200, json={"ok": True}))
    setattr(standin, "Client", lambda **kw: httpx.Client(transport=answer, **kw))
    monkeypatch.setattr(apiplay, "httpx", standin)
    for target, name in ((socket.socket, "connect"), (socket.socket, "connect_ex"), (socket, "getaddrinfo")):
        monkeypatch.setattr(target, name, _no_network)

    app = create_app(Settings(console_dir=str(tmp_path / "console"), console_writes="changesets",
                              app_log_file=str(tmp_path / "app.jsonl"), audit_log_file=str(tmp_path / "audit.jsonl"),
                              api_auth_failure_state_file=""), bootstrap_schema=False)
    client = TestClient(app)
    seeded = _seed(app, client, monkeypatch, reasoning)
    schema = schemathesis.openapi.from_asgi("/openapi.json", app, config=_config(app))
    try:
        yield schema, seeded
    finally:
        # Schemathesis starts the app's lifespan on its first call and keeps
        # it for the process (schemathesis/python/asgi.py); this app is done.
        schemathesis_asgi.shutdown_lifespans()
        app.state.opsconsole.shutdown()
        governor.reset()


def _identifier_proposal(document_id: str) -> str:
    """An email proposal on the seeded document, the way OpenAleph's analysis
    import stores one (payload kind, value and span)."""
    from app.db.session import SessionLocal
    from app.models.domain import Document, DocumentChunk, ExtractionCandidate

    with SessionLocal() as db:
        document = db.get(Document, document_id)
        assert document is not None
        chunk = db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).first()
        row = ExtractionCandidate(investigation_id=document.investigation_id, document_id=document_id, chunk_id=chunk.id if chunk else None,
                                  candidate_type="identifier", confidence=1.0,
                                  payload={"kind": "email", "value": "desk@meridian.example", "span": None,
                                           "rationale": "Seeded for the contract test"})
        db.add(row)
        db.commit()
        return row.id


def _email_document(document_id: str) -> str:
    """An email read by OpenAleph, as the read job keeps it: a document of the
    seeded investigation whose Source carries the headers OpenAleph read
    (jobs/handlers.py _record_openaleph_details)."""
    from app.db.session import SessionLocal
    from app.models.domain import Document, Source

    with SessionLocal() as db:
        seeded = db.get(Document, document_id)
        assert seeded is not None
        source = Source(investigation_id=seeded.investigation_id, title="transfer.eml", source_type="document",
                        metadata_json={"filename": "transfer.eml", "email": {
                            "from": ["Jane Doe <jane.doe@meridian.example>"], "subject": ["Transfer"]}})
        db.add(source)
        db.flush()
        email = Document(investigation_id=seeded.investigation_id, source_id=source.id, filename="transfer.eml",
                         mime_type="message/rfc822", sha256=seeded.sha256, storage_path=seeded.storage_path,
                         extraction_status="complete")
        db.add(email)
        db.commit()
        return email.id


def _cross_reference(investigation_id: str, entity_id: str) -> str:
    """An OpenAleph cross-reference as the corpus job stores one
    (app/services/cross_references.py import_cross_references); the demo
    investigation is never sent to OpenAleph, so it is written directly."""
    from app.db.session import SessionLocal
    from app.models.domain import CrossReferenceProposal

    with SessionLocal() as db:
        row = CrossReferenceProposal(
            investigation_id=investigation_id, entity_id=entity_id, openaleph_entity_id="ours.sig", match_kind="corpus",
            match_openaleph_id="theirs.sig", match_collection_id="99", match_collection_label="Elsewhere",
            match_schema="Company", match_caption="Meridian Holdings Limited", match_properties={"name": ["Meridian Holdings Limited"]},
            matched_properties=[], score=0.9, method="regression-v1", status="open")
        db.add(row)
        db.commit()
        return row.id


def _red_flag(client: TestClient, inv: str) -> str:
    """A Red Flag: a payment with no stated purpose (BO-033) added to the demo investigation."""
    parties = {row["caption"]: row["id"] for row in client.get(f"/api/investigations/{inv}/entities").json()}
    client.post("/api/relationships", json={"investigation_id": inv, "schema": "Payment", "source_entity_id": parties["Meridian Holdings Ltd"],
                                            "target_entity_id": parties["Bellcastle Trading Group"], "properties": {"amount": ["1000"], "currency": ["USD"]}})
    flags = client.post(f"/api/investigations/{inv}/red-flags/run").json()["flags"]
    return next(f["id"] for f in flags if f["indicator_id"] == "BO-033")


def _check_item(client: TestClient) -> str:
    """A "To check" item: what a seven-layer ownership chain's Red Flag (BO-002)
    cannot show from the records, in an investigation of its own."""
    inv = client.post("/api/investigations", json={"name": "Contract: to check"}).json()["id"]
    chain = [client.post("/api/entities", json={"investigation_id": inv, "schema": "Company", "caption": f"Layer {i}",
                                                "properties": {"name": [f"Layer {i}"]}}).json()["id"] for i in range(7)]
    for upper, lower in zip(chain, chain[1:]):
        client.post("/api/relationships", json={"investigation_id": inv, "schema": "Ownership", "source_entity_id": upper,
                                                "target_entity_id": lower, "properties": {}})
    client.post(f"/api/investigations/{inv}/red-flags/run")  # reading To check never brings it up to date
    return client.get(f"/api/investigations/{inv}/checks").json()["items"][0]["id"]


def _watchlist_hit(entry_id: str, document_id: str) -> str:
    """A document a watched name was found in, as a check keeps it
    (app/services/watchlists.py check_entry); the demo investigation is never
    sent to OpenAleph, so it is written directly."""
    from app.db.session import SessionLocal
    from app.models.domain import WatchlistEntry, WatchlistHit

    with SessionLocal() as db:
        entry = db.get(WatchlistEntry, entry_id)
        assert entry is not None
        row = WatchlistHit(investigation_id=entry.investigation_id, entry_id=entry_id, document_key="1.upload",
                           document_id=document_id, title="memo.txt", page_number=None,
                           highlights=[[{"text": "Meridian Holdings Ltd", "match": True}, {"text": " paid Bellcastle.", "match": False}]])
        db.add(row)
        db.commit()
        return row.id


def _seed(app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch, reasoning: Any) -> Seeded:
    """The demo investigation and one of everything else the API can read."""
    def ok(response: httpx.Response) -> Any:
        assert response.status_code < 300, f"{response.request.method} {response.request.url}: {response.status_code} {response.text}"
        return response.json()

    inv = ok(client.post("/api/demo/seed"))["investigation_id"]
    base = f"/api/investigations/{inv}"
    entities = {row["caption"]: row["id"] for row in ok(client.get(f"{base}/entities"))}
    meridian, bellcastle = entities["Meridian Holdings Ltd"], entities["Bellcastle Trading Group"]
    claims = ok(client.get(f"{base}/claims"))
    claim = next(row for row in claims if row["text"].startswith("Meridian Holdings Ltd is wholly"))
    lead = ok(client.get(f"{base}/leads"))[0]["id"]
    task = ok(client.get(f"{base}/reporting-tasks"))[0]["id"]
    relationship = ok(client.get(f"{base}/relationships"))[0]["id"]
    evidence = ok(client.get(f"{base}/evidence"))
    payment = next(row for row in evidence if row["evidence"]["quote"].startswith("Bank records show"))
    relationship_evidence = ok(client.get(f"/api/relationships/{relationship}/evidence-reviews"))

    # A read document, its proposals (one accepted, so a record has a lineage) and the job that read it,
    # sent as part of a bulk import.
    batch = ok(client.post(f"/api/investigations/{inv}/ingestion-batches", json={"label": "Wire memos"}))
    document = ok(client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Wire memo", "batch_id": batch["id"]}, files={
        "file": ("memo.txt", b"Meridian Holdings Ltd paid Bellcastle Trading Group. \"The $2.4M wire cleared on 3 March.\"\n", "text/plain")}))
    proposals = ok(client.get(f"/api/documents/{document['id']}/candidates"))
    proposal = next(row for row in proposals if row["candidate_type"] == "entity")["id"]
    quoted = next(row for row in proposals if row["candidate_type"] == "evidence")["id"]
    ok(client.post(f"/api/extraction-candidates/{quoted}/review", json={"decision": "accept", "note": "checked"}))
    accepted = next(row for row in ok(client.get(f"/api/documents/{document['id']}/candidates")) if row["id"] == quoted)
    # An email proposal as OpenAleph's analysis makes it (app/services/openaleph_analysis.py);
    # the fallback reader used here has no analysis, so it is written directly.
    identifier = _identifier_proposal(document["id"])
    email = _email_document(document["id"])
    # A picture, which an evidence record can be (before and after; app/services/image_reader.py).
    from PIL import Image

    drawn = io.BytesIO()
    Image.new("RGB", (8, 6), "grey").save(drawn, format="PNG")
    picture_bytes = drawn.getvalue()
    picture = ok(client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Market hall"}, files={
        "file": ("hall.png", picture_bytes, "image/png")}))
    # A ledger, which can be mapped to entities (app/services/table_mappings.py).
    # A PDF, whose pages Next up draws (GET .../page-image).
    import fitz
    pdf = fitz.open()
    pdf.new_page().insert_text((72, 72), "Minutes of the board: the parcel was bought on behalf of Fernhill Ltd.")
    pdf_bytes = pdf.tobytes()
    pdf.close()
    minutes = ok(client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Board minutes"}, files={
        "file": ("minutes.pdf", pdf_bytes, "application/pdf")}))
    ledger = ok(client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Ledger"}, files={
        "file": ("ledger.csv", b"Payer,Payee,Amount\nMeridian Holdings Ltd,Bellcastle Trading Group,2400000\n", "text/csv")}))
    # A watched name and a document it was found in.
    watched = ok(client.post(f"{base}/watchlist", json={"query": "Meridian Holdings", "note": "The holding company"}))["entries"][0]["id"]
    watch_hit = _watchlist_hit(watched, document["id"])
    # A tag on a party, a note on it, and a collection holding it (app/services/annotations.py).
    tag = ok(client.post(f"{base}/tags", json={"name": "Holding company", "colour": "#314d65"}))["tags"][0]["id"]
    ok(client.post(f"{base}/record-tags", json={"tag_id": tag, "record_type": "entity", "record_id": meridian}))
    note = ok(client.post(f"{base}/notes", json={"text": "Who signed for Meridian?", "record_type": "entity", "record_id": meridian}))["id"]
    marked = ok(client.post(f"{base}/collections", json={"name": "Money trail"}))["id"]
    ok(client.post(f"/api/collections/{marked}/items", json={"record_type": "entity", "record_id": meridian}))
    # A reporter's timeline event, which can be graded.
    event = ok(client.post("/api/timeline-events", json={"investigation_id": inv, "title": "Wire sent", "date_start": "2023-11-14"}))["id"]

    # Connector findings, a statement assessment, an external relationship review, an enrichment session.
    findings = ok(client.post("/api/connectors/fake-a/search", json={"investigation_id": inv, "query": "Meridian"}))
    company = next(row for row in findings if row["provider_record_id"] == "a-company")
    ownership = next(row for row in findings if row["schema"] == "Ownership")
    assessment = ok(client.post(f"/api/connector-findings/{company['id']}/assessments", json={
        "entity_id": meridian, "prop": "registrationNumber", "value": "GB-123", "status": "accepted"}))
    review = ok(client.post(f"/api/connector-findings/{ownership['id']}/relationship-reviews", json={
        "source_entity_id": bellcastle, "target_entity_id": meridian, "decision": "supported"}))
    session = ok(client.post(f"/api/entities/{meridian}/enrich", json={"providers": ["fake-a", "fake-b"]}))

    # An AI proposal from the stand-in model, accepted, and the write-up and deck made from it.
    # The draft's handling fee is stated by its own record (the quote check holds every value to its quote).
    fee = ok(client.post("/api/evidence", json={"source_id": payment["source"]["id"], "locator": "paragraph 7",
                                                "quote": "On 2024-01-09 Meridian was charged a handling fee of 1,250.50 USD."}))["id"]
    monkeypatch.setattr(reasoning, "get_llm_client", lambda *a, **k: _DraftModel(_presentation_draft(claim["id"], payment["evidence"]["id"], fee)))
    draft = ok(client.post(f"{base}/assistant/presentation-draft", json={"goal": "Show who received the money.", "record_refs": [
        {"record_type": "claim", "record_id": claim["id"]}, {"record_type": "evidence", "record_id": payment["evidence"]["id"]},
        {"record_type": "evidence", "record_id": fee}]}))
    ai_candidate = draft["candidate_id"]
    ok(client.post(f"/api/ai-analysis-candidates/{ai_candidate}/review", json={"decision": "accept"}))
    writeup = ok(client.post(f"/api/ai-analysis-candidates/{ai_candidate}/promote-to-writeup", json={"title": "The brief"}))
    deck = ok(client.post(f"/api/ai-analysis-candidates/{ai_candidate}/promote-to-deck", json={"title": "The deck"}))

    # A person with access to the investigation, and a console-issued token of theirs.
    user = ok(client.post("/api/settings/security/users", json={"display_name": "Contract reporter"}))
    ok(client.put(f"/api/settings/security/users/{user['id']}/investigations/{inv}", json={"role": "reporter"}))
    token = ok(client.post(f"/api/console/users/{user['id']}/tokens", json={"confirm": user["id"]}))

    # The console's own records: a backup, a check run, a test run, an applied change set, a saved query, a collection.
    backup_run = ok(client.post("/api/console/backups", json={"kind": "investigation_export", "selection": inv}))
    _wait(app, backup_run["id"])
    backup = ok(client.get("/api/console/backups"))["providers"][0]["items"][0]
    checks_run = ok(client.post("/api/console/checks/run", json={"only": ["tables_present"]}))
    _wait(app, checks_run["id"])
    tests_run = ok(client.post("/api/console/tests/run", json={"selection": None}))
    _wait(app, tests_run["id"])
    changeset = ok(client.post("/api/console/data/changesets", json={"table": "investigations", "ops": [
        {"op": "update", "pk": {"id": inv}, "set": {"description": "Seeded for the contract test."}}]}))
    ok(client.post(f"/api/console/data/changesets/{changeset['id']}/apply", json={"confirm": changeset["id"]}))
    activity = ok(client.get("/api/console/activity"))["items"][0]["id"]
    second = ok(client.post("/api/console/data/changesets", json={"table": "investigations", "ops": [
        {"op": "update", "pk": {"id": inv}, "set": {"description": "Pending."}}]}))
    saved = ok(client.post("/api/console/query/saved", json={"name": "Investigations", "sql": "SELECT id FROM investigations"}))
    collection = ok(client.post("/api/console/api/collections", json={"name": "Smoke", "requests": [{"method": "GET", "path": "/api/health"}]}))

    # One of the Authority System Suite's own records for the case (app/services/case_records.py).
    case_record = ok(client.post(f"/api/investigations/{inv}/case-records", json={
        "kind": "GAP", "body": {"unresolved_question": "Who signed the transfer?", "bears_on": [claim["id"]]}}))

    # The case's story with one section (app/services/stories.py, mockup ACT_2).
    story = ok(client.post(f"/api/investigations/{inv}/story/sections", json={"title": "Who bought the land"}))
    # Its write-up with one named version (app/services/writeup_versions.py).
    ok(client.post(f"/api/investigations/{inv}/story/writeup"))
    version = ok(client.post(f"/api/investigations/{inv}/story/versions", json={"name": "Before legal read"}))

    return Seeded(
        ids={
            "section_id": story["sections"][0]["id"], "version_id": version["id"], "run_id": draft["job"]["id"],
            "investigation_id": inv, "entity_id": meridian, "claim_id": claim["id"], "lead_id": lead, "relationship_id": relationship,
            "source_id": payment["source"]["id"], "evidence_id": payment["evidence"]["id"], "document_id": document["id"],
            "job_id": document["job"]["id"], "finding_id": company["id"], "session_id": session["id"], "assessment_id": assessment["id"],
            "review_id": review["id"], "writeup_id": writeup["id"], "deck_id": deck["id"], "prop": "jurisdiction", "provider": "fake-a",
            "task_id": task, "cross_reference_id": _cross_reference(inv, meridian), "batch_id": batch["id"],
            "user_id": user["id"], "aid": activity, "bid": backup["id"], "kind": "investigation_export", "qid": saved["id"],
            "name": "investigations", "pk": inv, "source": "app", "uid": user["id"], "tid": token["token_id"],
            "watch_id": watched, "hit_id": watch_hit, "timeline_event_id": event,
            "indicator_id": "BO-001", "system": "las", "number": "01", "case_id": "deripaska-en-rusal", "tag_id": tag, "note_id": note, "collection_id": marked, "flag_id": _red_flag(client, inv),
            "check_id": _check_item(client), "case_record_id": case_record["id"], "thought_id": "CLM-0001",
            "z": "0", "x": "0", "y": "0", "stack": "Noto Sans Regular", "glyph_range": "0-255",
        },
        per_operation={
            ("GET", "/api/ai-analysis-candidates/{candidate_id}"): {"candidate_id": ai_candidate},
            ("GET", "/api/basemap/sprites/{name}"): {"name": "grayscale.json"},
            **{(method, path): {"candidate_id": ai_candidate} for method, path in (
                ("POST", "/api/ai-analysis-candidates/{candidate_id}/promote-to-deck"),
                ("POST", "/api/ai-analysis-candidates/{candidate_id}/promote-to-writeup"),
                ("POST", "/api/ai-analysis-candidates/{candidate_id}/review"),
                ("POST", "/api/ai-analysis-candidates/{candidate_id}/claim-review"))},
            ("GET", "/api/extraction-candidates/{candidate_id}/identifier-targets"): {"candidate_id": identifier},
            ("GET", "/api/documents/{document_id}/email"): {"document_id": email},
            ("GET", "/api/documents/{document_id}/picture"): {"document_id": picture["id"]},
            ("GET", "/api/documents/{document_id}/page-image"): {"document_id": minutes["id"]},
            **{(method, path): {"document_id": ledger["id"]} for method, path in (
                ("GET", "/api/documents/{document_id}/table"),
                ("POST", "/api/documents/{document_id}/table-mappings/preview"),
                ("POST", "/api/documents/{document_id}/table-mappings"))},
            **{(method, path): {"candidate_id": proposal} for method, path in (
                ("GET", "/api/extraction-candidates/{candidate_id}/entity-matches"),
                ("GET", "/api/extraction-candidates/{candidate_id}/same-answer"),
                ("GET", "/api/extraction-candidates/{candidate_id}/openaleph-matches"),
                ("GET", "/api/extraction-candidates/{candidate_id}/explanation"),
                ("GET", "/api/extraction-candidates/{candidate_id}/lineage"),
                ("POST", "/api/extraction-candidates/{candidate_id}/review"))},
            ("GET", "/api/connector-findings/{finding_id}/relationship-candidates"): {"finding_id": ownership["id"]},
            ("GET", "/api/console/checks/runs/{rid}"): {"rid": checks_run["id"]},
            ("GET", "/api/console/tests/runs/{rid}"): {"rid": tests_run["id"]},
            ("GET", "/api/console/tests/runs/{rid}/log"): {"rid": tests_run["id"]},
            ("POST", "/api/console/tests/runs/{rid}/cancel"): {"rid": tests_run["id"]},
            ("GET", "/api/console/data/changesets/{cid}"): {"cid": changeset["id"]},
            ("POST", "/api/console/data/changesets/{cid}/apply"): {"cid": second["id"]},
            ("POST", "/api/console/data/changesets/{cid}/discard"): {"cid": second["id"]},
            ("DELETE", "/api/console/api/collections/{cid}"): {"cid": collection["id"]},
            ("POST", "/api/console/config/flags/{name}"): {"name": "enable_pdf_ocr"},
            ("POST", "/api/relationships/{relationship_id}/evidence/{evidence_id}/reviews"): {
                "evidence_id": relationship_evidence["items"][0]["evidence_id"] if relationship_evidence.get("items") else payment["evidence"]["id"]},
        },
        queries={
            ("GET", "/api/entities/{entity_id}/merge-preview"): {"target_entity_id": bellcastle},
            ("GET", "/api/provenance/extraction-lineage"): {"record_type": "evidence", "record_id": accepted["accepted_record_id"]},
            ("GET", "/api/provenance/trace"): {"record_type": "claim", "record_id": claim["id"]},
            ("GET", "/api/search"): {"q": "Meridian"},
            ("GET", "/api/catalogue/glossary/entry"): {"term": "Beneficial owner"},
            ("GET", "/api/investigations/{investigation_id}/marks"): {"record_type": "entity", "record_id": meridian},
            ("GET", "/api/investigations/{investigation_id}/peek"): {"record_type": "entity", "record_id": meridian},
            ("GET", "/api/investigations/{investigation_id}/paths"): {"from": meridian, "to": bellcastle},
            ("DELETE", "/api/investigations/{investigation_id}/record-tags"): {"tag_id": tag, "record_type": "entity", "record_id": meridian},
            ("DELETE", "/api/collections/{collection_id}/items"): {"record_type": "entity", "record_id": meridian},
            ("GET", "/api/investigations/{investigation_id}/corpus/search"): {"q": "Meridian"},
            ("GET", "/api/investigations/{investigation_id}/since"): {"after": "2020-01-01T00:00:00"},
            ("POST", "/api/console/backups/{bid}/restore/plan"): {"kind": "investigation_export"},
        },
    )


def _operations(schema: schemathesis.BaseSchema, *, reads: bool) -> list[schemathesis.APIOperation]:
    operations = []
    for result in schema.get_all_operations():
        operation = result.ok()
        if (operation.method.upper(), operation.path) in NOT_CALLED or (operation.method.upper() == "GET") != reads:
            continue
        operations.append(operation)
    # Deletions last, so the rest still find what they delete.
    return sorted(operations, key=lambda operation: operation.method.upper() == "DELETE")


def _examples(operation: schemathesis.APIOperation, mode: schemathesis.GenerationMode, seeded: Seeded,
              checks: list[Callable[..., Any]]) -> int:
    """Generated requests to one operation (READ_EXAMPLES or WRITE_EXAMPLES),
    stopping at the first failed check; how many were sent."""
    strategy = operation.as_strategy(generation_mode=mode, path_parameters=seeded.path_parameters(operation),
                                     query=seeded.queries.get((operation.method.upper(), operation.path)))
    count = READ_EXAMPLES if operation.method.upper() == "GET" else WRITE_EXAMPLES
    sent = 0
    failed: list[BaseException] = []

    @hypothesis.settings(SETTINGS, max_examples=count)
    @hypothesis.given(case=strategy)
    def call(case: schemathesis.Case) -> None:
        nonlocal sent
        if failed:
            return
        sent += 1
        # Kept and raised after the run rather than inside it: Hypothesis would
        # replay the failing request, and on an API with state the replay can
        # pass (the first call changed something), hiding the failure.
        try:
            case.call_and_validate(checks=checks, timeout=REQUEST_TIMEOUT)
        except (Exception, FailureGroup) as exc:
            failed.append(exc)

    call()
    if failed:
        raise failed[0]
    return sent


def _can_be_made_invalid(operation: schemathesis.APIOperation, seeded: Seeded) -> bool:
    """Whether negative mode has something to break: a body, or a query
    parameter the test does not fill in itself (path ids always are)."""
    pinned = seeded.queries.get((operation.method.upper(), operation.path), {})
    return bool(len(operation.body)) or any(parameter.name not in pinned for parameter in operation.query)


def _report(problems: dict[str, str]) -> str:
    return f"{len(problems)} operation(s) broke the contract:\n\n" + "\n\n".join(f"== {label}\n{text}" for label, text in problems.items())


def test_reads_answer_real_data_in_their_declared_shape(contract: tuple[schemathesis.BaseSchema, Seeded]) -> None:
    schema, seeded = contract
    problems: dict[str, str] = {}
    operations = _operations(schema, reads=True)
    generated = 0
    for operation in operations:
        key = (operation.method.upper(), operation.path)
        try:
            case = operation.Case(path_parameters=seeded.path_parameters(operation), query=seeded.queries.get(key))
            response = case.call_and_validate(checks=CHECKS, timeout=REQUEST_TIMEOUT)
            assert 200 <= response.status_code < 300, f"answered {response.status_code} on seeded data: {response.text[:500]}"
            if len(operation.query):
                generated += _examples(operation, schemathesis.GenerationMode.POSITIVE, seeded, CHECKS)
        except (Exception, FailureGroup) as exc:  # one report for every operation, not just the first that fails
            problems[operation.label] = str(exc)
    assert len(operations) > 100, "the schema must list the API's reads"
    assert not problems, _report(problems)
    assert generated >= sum(1 for operation in operations if len(operation.query)), "every read with query parameters got examples"


def test_writes_never_fail_on_their_side_and_refuse_in_the_declared_shape(contract: tuple[schemathesis.BaseSchema, Seeded]) -> None:
    schema, seeded = contract
    problems: dict[str, str] = {}
    operations = _operations(schema, reads=False)
    allowed = refused = 0
    for operation in operations:
        try:
            allowed += _examples(operation, schemathesis.GenerationMode.POSITIVE, seeded, CHECKS)
            if _can_be_made_invalid(operation, seeded):
                refused += _examples(operation, schemathesis.GenerationMode.NEGATIVE, seeded, [*CHECKS, negative_data_rejection])
        except (Exception, FailureGroup) as exc:  # one report for every operation, not just the first that fails
            problems[operation.label] = str(exc)
    assert len(operations) > 90, "the schema must list the API's writes"
    assert not problems, _report(problems)
    assert allowed >= len(operations) and refused > 0, "every write got requests the schema allows, and some it forbids"


def test_text_with_a_nul_character_is_refused_not_a_server_error() -> None:
    """Found by the test above on PostgreSQL, which keeps no NUL (U+0000) in
    text or JSON: such a request is refused (400), where it used to fail as a
    server error. SQLite keeps the character, so there the request succeeds."""
    from sqlalchemy.exc import DataError

    from app.db.session import engine
    from app.main import _holds_nul_character, app

    client = TestClient(app)
    inv = client.post("/api/investigations", json={"name": "NUL"}).json()
    entity = client.post("/api/entities", json={"investigation_id": inv["id"], "schema": "Person", "caption": "Jane"}).json()
    reply = client.patch(f"/api/entities/{entity['id']}", json={"properties": {"name": ["Ja\x00ne"]}})
    if engine.dialect.name == "postgresql":
        assert reply.status_code == 400 and reply.json() == {"detail": "Text cannot contain the NUL character (U+0000)."}
    else:
        assert reply.status_code == 200, reply.text

    class Untranslatable(Exception):
        sqlstate = "22P05"  # what the server answers for "\u0000" in JSON

    assert _holds_nul_character(DataError("UPDATE", {}, Exception("PostgreSQL text fields cannot contain NUL (0x00) bytes")))
    assert _holds_nul_character(DataError("UPDATE", {}, Untranslatable("unsupported Unicode escape sequence")))
    assert not _holds_nul_character(DataError("UPDATE", {}, Exception("value too long for type character varying(32)")))
