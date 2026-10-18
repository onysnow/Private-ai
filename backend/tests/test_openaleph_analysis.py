"""OpenAleph's name-finding becomes review proposals (ADR-0006, Wave A).

OpenAleph is faked over HTTP (tests/openaleph_fake.py) with the reply
shapes OpenAleph 5.3.1 returned live: ftm-analyze's results are lower-cased,
normalised properties of the document entity, the collection status shows
the analyze and index queues, and POST /entities/{id}/analyze answers 202.
"""

from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.jobs.handlers import HANDLERS
from app.jobs.records import create_job, execute_job
from app.main import app
from app.models.domain import BackgroundJob, Document, DocumentChunk, ExtractionCandidate, Investigation
from app.services import openaleph_analysis
from app.services.documents import extract_document, store_document
from app.services.openaleph_analysis import (
    ANALYSIS_KINDS, Analysis, analysis_from_entity, find_names, import_analysis_proposals, locate,
    needs_requested_analysis, spacy_models_for, wait_for_analysis, was_analysed,
)
from app.services.openaleph_status import analysis_settled, is_active, stages
from openaleph_fake import IDLE, FakeOpenAleph, busy_status, entity, page

KIND = {kind.prop: kind for kind in ANALYSIS_KINDS}
MEMO = (
    "Memo from the finance desk.\n\n"
    "Jane Doe met Angela Merkel's adviser and JANE  DOE again about Meridian Holdings Ltd.\n\n"
    "Pay GB82WEST12345698765432 (printed as GB82 WEST 1234 5698 7654 32). "
    "Write to Jane.Doe@Meridian.example or call +44 20 7946 0958."
)


def _report(progress, message):
    return None


_storage: list = []
_sessions: list = []


@pytest.fixture(autouse=True)
def _storage_and_sessions(tmp_path):
    """Documents are stored under the test's own folder; sessions handed to
    the import are closed after the test."""
    _storage[:] = [tmp_path / "docs"]
    yield
    while _sessions:
        _sessions.pop().close()


def settings_storage():
    return _storage[0]


def db_session():
    session = SessionLocal()
    _sessions.append(session)
    return session


@pytest.fixture()
def fake(monkeypatch):
    fake = FakeOpenAleph().install(monkeypatch)
    monkeypatch.setattr(settings, "document_reader", "auto")
    monkeypatch.setattr(settings, "openaleph_read_poll_seconds", 0.01)
    monkeypatch.setattr(settings, "openaleph_analysis_timeout_seconds", 5)
    monkeypatch.setattr(settings, "enable_local_entity_suggestions", True)
    monkeypatch.setattr(openaleph_analysis, "SEARCH_REFRESH_SECONDS", 0)
    return fake


def _chunks(*texts):
    return [SimpleNamespace(id=f"c{i}", locator=f"paragraph {i}", page_number=None, text=text)
            for i, text in enumerate(texts, 1)]


# --- Finding OpenAleph's values again in the text --------------------------

def test_a_name_is_found_in_its_original_spelling_wherever_it_occurs():
    chunks = _chunks(MEMO, "Nothing here.", "jane\ndoe signed.")
    found = locate(KIND["peopleMentioned"], "jane doe", chunks)
    assert [(o.chunk_id, o.text) for o in found] == [("c1", "Jane Doe"), ("c1", "JANE  DOE"), ("c3", "jane\ndoe")]
    assert MEMO[found[0].start_char:found[0].end_char] == "Jane Doe"


def test_a_possessive_and_trailing_punctuation_do_not_hide_a_name():
    found = locate(KIND["peopleMentioned"], "angela merkel", _chunks(MEMO))
    assert [o.text for o in found] == ["Angela Merkel"]
    company = locate(KIND["companiesMentioned"], "meridian holdings ltd", _chunks(MEMO))
    assert [o.text for o in company] == ["Meridian Holdings Ltd"]


def test_only_whole_words_match():
    chunks = _chunks("Janet Doerr and Jane Doering are not Jane Doe.")
    assert [o.text for o in locate(KIND["peopleMentioned"], "jane doe", chunks)] == ["Jane Doe"]
    assert locate(KIND["peopleMentioned"], "   ", chunks) == []


def test_identifiers_are_found_as_written():
    chunks = _chunks(MEMO)
    email = locate(KIND["emailMentioned"], "Jane.Doe@meridian.example", chunks)
    assert [o.text for o in email] == ["Jane.Doe@Meridian.example"]
    assert locate(KIND["emailMentioned"], "doe@meridian.example", chunks) == [], "not a part of a longer address"
    phone = locate(KIND["phoneMentioned"], "+442079460958", chunks)
    assert [o.text for o in phone] == ["+44 20 7946 0958"]


def test_an_iban_is_found_with_and_without_its_print_grouping():
    """ftm-analyze only detects the unbroken form (its IBAN_REGEX needs seven
    digits in a row after the bank code), but the same number printed in
    groups elsewhere in the document is found too."""
    found = locate(KIND["ibanMentioned"], "GB82WEST12345698765432", _chunks(MEMO))
    assert [o.text for o in found] == ["GB82WEST12345698765432", "GB82 WEST 1234 5698 7654 32"]
    assert locate(KIND["ibanMentioned"], "", _chunks(MEMO)) == []


# --- What an analysis is ---------------------------------------------------------

def test_which_properties_show_that_ftm_analyze_ran():
    assert was_analysed({"detectedLanguage": ["eng"]})
    assert was_analysed({"peopleMentioned": ["jane doe"]})
    # ingest-file writes these two itself for an email's sender and recipients.
    assert not was_analysed({"namesMentioned": ["Jane Doe"], "emailMentioned": ["jane@example.org"]})
    analysis = analysis_from_entity("7", "e1", entity("e1", "Email", namesMentioned="Jane Doe", bodyText="long text",
                                                      language="deu", detectedLanguage="eng", parent={"id": "x"}))
    assert analysis.schema == "Email" and analysis.properties["namesMentioned"] == ["Jane Doe"]
    assert "bodyText" not in analysis.properties and "parent" not in analysis.properties
    assert analysis.languages == ["deu", "eng"]
    assert analysis_from_entity("7", "e1", None).properties == {}


def test_emails_are_the_documents_the_workbench_asks_ftm_analyze_for():
    assert needs_requested_analysis("Email") and needs_requested_analysis("Message")
    for schema in ("PlainText", "Pages", "Package", "Folder", "Workbook", "Page", None, "NoSuchSchema"):
        assert not needs_requested_analysis(schema), schema


def test_the_spacy_model_follows_the_detected_language():
    assert spacy_models_for(["eng"]) == ["en_core_web_sm"]
    assert spacy_models_for(["deu", "fra", "deu"]) == ["de_core_news_sm", "fr_core_news_sm"]
    assert spacy_models_for(["tlh"]) == ["en_core_web_sm"], "ftm-analyze falls back to English"
    assert spacy_models_for([]) == ["en_core_web_sm"]


def test_collection_status_is_summed_per_stage_in_pipeline_order():
    status = {**IDLE, "batches": [
        {"name": "b1", "queues": [
            {"name": "openaleph", "todo": 1, "doing": 0, "succeeded": 2, "failed": 0, "aborted": 0, "cancelled": 0},
            {"name": "ingest", "todo": 0, "doing": 1, "succeeded": 3, "failed": 1, "aborted": 0, "cancelled": 0},
            "not a queue",
        ]},
        {"name": "b2", "queues": [{"name": "custom", "todo": 0, "doing": 0, "succeeded": 1, "failed": 0, "aborted": 1, "cancelled": 0}]},
        "not a batch",
    ]}
    rows = stages(status)
    assert [(s.queue, s.label, s.pending, s.running, s.finished, s.failed) for s in rows] == [
        ("ingest", "Reading files", 0, 1, 4, 1),
        ("openaleph", "Indexing for search", 1, 0, 2, 0),
        ("custom", "custom", 0, 0, 2, 1),
    ]
    assert is_active(status) and not analysis_settled(status)
    assert not is_active(IDLE) and analysis_settled(IDLE)
    assert analysis_settled(busy_status("ingest")), "reading other files does not hold back a document's names"


# --- Waiting for OpenAleph ---------------------------------------------------------------

def test_results_already_on_the_document_end_the_wait_at_once(fake):
    fake.entities["e1"] = entity("e1", peopleMentioned="jane doe", detectedLanguage="eng")
    analysis = wait_for_analysis("7", "e1", _report)
    assert analysis.analysed and analysis.settled and analysis.properties["peopleMentioned"] == ["jane doe"]
    assert not fake.calls("GET", "/api/2/collections/7/status")


def test_the_wait_ends_when_the_name_finding_queues_are_idle(fake):
    fake.entities["e1"] = entity("e1")
    fake.queue_analysis("e1", {"companiesMentioned": ["meridian holdings ltd"], "detectedLanguage": ["eng"]}, busy_checks=2)
    analysis = wait_for_analysis("7", "e1", _report)
    assert analysis.settled and analysis.properties["companiesMentioned"] == ["meridian holdings ltd"]
    assert len(fake.calls("GET", "/api/2/collections/7/status")) == 3


def test_a_document_without_names_is_settled_once_the_queues_are_idle(fake):
    fake.entities["e1"] = entity("e1")
    analysis = wait_for_analysis("7", "e1", _report)
    assert analysis.settled and not analysis.analysed and analysis.issue() is None


def test_the_wait_is_bounded(fake, monkeypatch):
    monkeypatch.setattr(settings, "openaleph_analysis_timeout_seconds", 120)
    fake.entities["e1"] = entity("e1")
    fake.statuses = [busy_status("analyze") for _ in range(50)]
    now = [0.0]

    def sleep(seconds):
        now[0] += 30

    analysis = wait_for_analysis("7", "e1", _report, sleep=sleep, clock=lambda: now[0])
    assert not analysis.settled and not analysis.analysed
    assert analysis.issue() == ("OpenAleph had not finished finding names after 2 minute(s); "
                                "use “Find names again” to fetch them when it has.")


def test_a_fresh_wait_ignores_the_old_results(fake):
    fake.entities["e1"] = entity("e1", peopleMentioned="jane doe", detectedLanguage="eng")
    fake.queue_analysis("e1", {"peopleMentioned": ["john roe"]})
    analysis = wait_for_analysis("7", "e1", _report, fresh=True)
    assert analysis.properties["peopleMentioned"] == ["jane doe", "john roe"]
    assert len(fake.calls("GET", "/api/2/collections/7/status")) == 2


def test_losing_openaleph_while_waiting_is_reported(fake):
    def down(entity_id):
        raise httpx.ConnectError("refused")

    analysis = wait_for_analysis("7", "e1", _report, fetch=down)
    assert analysis.error == "lost contact with OpenAleph while it was finding names (ConnectError)"
    assert analysis.issue() == ("Names from OpenAleph are missing: lost contact with OpenAleph while it was finding "
                                "names (ConnectError). Use “Find names again” when it is running.")


def test_an_email_is_analysed_on_request(fake):
    fake.entities["e1"] = entity("e1", "Email", namesMentioned="Jane Doe")
    fake.analysis["e1"] = {"peopleMentioned": ["jane doe"], "detectedLanguage": ["eng"]}
    analysis = find_names("7", "e1", "Email", _report)
    assert [r.url.path for r in fake.calls("POST", "/api/2/entities/e1/analyze")] == ["/api/2/entities/e1/analyze"]
    assert analysis.analysed and analysis.properties["peopleMentioned"] == ["jane doe"]
    assert not fake.calls("POST", "/api/2/entities/e2/analyze")
    fake.entities["e2"] = entity("e2", "PlainText", detectedLanguage="eng")
    assert find_names("7", "e2", "PlainText", _report).analysed
    assert not fake.calls("POST", "/api/2/entities/e2/analyze"), "ingest-file already queues analysis for other documents"


@pytest.mark.parametrize("reply, error", [
    (400, "OpenAleph's name-finding is switched off on this OpenAleph"),
    (404, "OpenAleph no longer has this document"),
    (200, "OpenAleph answered HTTP 200 instead of queuing the analysis"),
    (409, "could not ask OpenAleph to find names (HTTPStatusError)"),
    (500, "could not ask OpenAleph to find names (HTTPStatusError)"),
])
def test_an_analysis_request_that_fails_says_why(fake, reply, error):
    fake.entities["e1"] = entity("e1", "Email")
    fake.analyze_reply = reply
    analysis = find_names("7", "e1", "Email", _report)
    assert analysis.error == error and not analysis.analysed


# --- Proposals -------------------------------------------------------------------------

def _document(text=MEMO, *, find_names=False):
    with SessionLocal() as db:
        inv = Investigation(name="Names")
        db.add(inv); db.commit(); db.refresh(inv)
        doc = store_document(db, investigation_id=inv.id, title="Memo", filename="memo.txt", mime_type="text/plain",
                             data=text.encode(), storage_dir=settings_storage())
        chunks = [{"locator": f"paragraph {i}", "page_number": None, "text": part,
                   "provenance": {"provider": "openaleph", "extraction_method": "openaleph_ingest_file"}}
                  for i, part in enumerate(text.split("\n\n"), 1)]
        extract_document(db, doc.id, text=(chunks, []), find_names=find_names)
        return doc.id


def _proposals(document_id):
    with SessionLocal() as db:
        rows = db.scalars(select(ExtractionCandidate).where(
            ExtractionCandidate.document_id == document_id,
            ExtractionCandidate.candidate_type.in_(("entity", "identifier"))).order_by(ExtractionCandidate.created_at)).all()
        for row in rows:
            db.expunge(row)
        return rows


ANALYSIS = Analysis(collection_id="7", entity_id="e1", schema="PlainText", properties={
    "peopleMentioned": ["jane doe", "angela merkel"], "companiesMentioned": ["meridian holdings ltd"],
    "locationMentioned": ["finance desk london"], "ibanMentioned": ["GB82WEST12345698765432"],
    "namesMentioned": ["Jane Doe", "Audit Desk"], "emailMentioned": ["Jane.Doe@meridian.example"],
    "phoneMentioned": ["+442079460958"], "detectedLanguage": ["eng"], "language": ["deu"],
})


def test_every_value_becomes_one_proposal_with_its_place_and_provenance():
    document_id = _document()
    counts = import_analysis_proposals(db_session(), document_id, ANALYSIS)
    assert counts == {"retrieved": 9, "entities": 6, "identifiers": 2, "skipped": 1, "unlocated": 2}
    rows = {(r.candidate_type, r.payload.get("suggested_schema") or r.payload["kind"], r.payload["caption"]): r for r in _proposals(document_id)}
    assert set(rows) == {
        ("entity", "Person", "Jane Doe"), ("entity", "Person", "Angela Merkel"),
        ("entity", "Company", "Meridian Holdings Ltd"), ("entity", "Address", "finance desk london"),
        ("entity", "BankAccount", "GB82WEST12345698765432"), ("entity", "LegalEntity", "Audit Desk"),
        ("identifier", "email", "Jane.Doe@Meridian.example"), ("identifier", "phone", "+44 20 7946 0958"),
    }
    jane = rows[("entity", "Person", "Jane Doe")]
    assert jane.confidence == 0.85 and jane.review_status == "proposed"
    assert jane.payload["located"] is True and jane.payload["occurrence_count"] == 2
    assert jane.payload["locator"] == "paragraph 2" and jane.payload["openaleph_value"] == "jane doe"
    assert jane.payload["properties"] == {"name": ["Jane Doe"]}
    assert jane.payload["provenance"] == {
        "provider": "openaleph", "collection_id": "7", "provider_document_id": "e1", "provider_entity_id": "e1",
        "provider_schema": "PlainText", "provider_property": "peopleMentioned", "extraction_method": "openaleph_ftm_analyze",
        "found_by": "ftm-analyze", "detected_languages": ["eng"], "chunk_extraction_method": "openaleph_ingest_file",
        "ner_engine": "spacy", "ner_models": ["de_core_news_sm", "en_core_web_sm"],
    }
    with SessionLocal() as db:
        chunk = db.get(DocumentChunk, jane.chunk_id)
        assert chunk.text[jane.payload["span"]["start_char"]:jane.payload["span"]["end_char"]] == "Jane Doe"
    account = rows[("entity", "BankAccount", "GB82WEST12345698765432")]
    assert account.payload["properties"] == {"iban": ["GB82WEST12345698765432"], "accountNumber": ["GB82WEST12345698765432"]}
    assert account.payload["occurrence_count"] == 2 and account.payload["provenance"]["pattern"] == "iban"
    assert account.confidence == 1.0
    place = rows[("entity", "Address", "finance desk london")]
    assert place.payload["located"] is False and "span" not in place.payload and place.chunk_id is None
    assert place.payload["properties"] == {"full": ["finance desk london"]}
    unknown = rows[("entity", "LegalEntity", "Audit Desk")]
    assert unknown.payload["schema_question"] is True and unknown.payload["schema_choices"] == ["Person", "Company", "Organization", "LegalEntity"]
    assert unknown.confidence == 0.5 and unknown.payload["located"] is False
    email = rows[("identifier", "email", "Jane.Doe@Meridian.example")]
    assert email.payload["value"] == "Jane.Doe@meridian.example" and email.payload["provenance"]["pattern"] == "email"
    phone = rows[("identifier", "phone", "+44 20 7946 0958")]
    assert phone.payload["value"] == "+442079460958" and phone.payload["span"] and phone.chunk_id


def test_a_value_is_proposed_once_per_document_whoever_found_it():
    # The Workbench's own pattern finder proposed "Jane Doe" first.
    document_id = _document(find_names=True)
    before = [r.payload["caption"] for r in _proposals(document_id) if r.candidate_type == "entity"]
    assert "Jane Doe" in before
    counts = import_analysis_proposals(db_session(), document_id, ANALYSIS)
    assert counts["skipped"] >= 2, "jane doe from ftm-analyze and from the headers"
    captions = [r.payload["caption"] for r in _proposals(document_id) if r.candidate_type == "entity"]
    assert captions.count("Jane Doe") == 1
    again = import_analysis_proposals(db_session(), document_id, ANALYSIS)
    assert again["entities"] == again["identifiers"] == 0 and again["skipped"] == 9


def test_a_rejected_value_is_not_proposed_again():
    document_id = _document()
    import_analysis_proposals(db_session(), document_id, ANALYSIS)
    with SessionLocal() as db:
        row = db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.document_id == document_id,
                                                           ExtractionCandidate.candidate_type == "identifier")).first()
        row.review_status = "rejected"
        db.commit()
    assert import_analysis_proposals(db_session(), document_id, ANALYSIS)["identifiers"] == 0


def test_header_names_of_an_email_say_ingest_file_found_them():
    document_id = _document("Dear Rebecca, the cargo is late.\n\nGustavo")
    email = Analysis(collection_id="7", entity_id="e2", schema="Email", properties={
        "namesMentioned": ["Rebecca Thornton"], "emailMentioned": ["rebecca@halvorsen.example", "invoice-1@halvorsen.example"],
        "from": ["Rebecca Thornton <rebecca@halvorsen.example>"]})
    import_analysis_proposals(db_session(), document_id, email)
    rows = {r.payload["caption"]: r.payload["provenance"] for r in _proposals(document_id)}
    assert rows["Rebecca Thornton"]["found_by"] == "ingest-file email headers" and "ner_engine" not in rows["Rebecca Thornton"]
    assert rows["rebecca@halvorsen.example"]["found_by"] == "ingest-file email headers"
    assert rows["invoice-1@halvorsen.example"]["found_by"] == "ftm-analyze"


def test_importing_into_a_missing_document_fails():
    with pytest.raises(ValueError, match="Document not found"):
        import_analysis_proposals(db_session(), "missing", ANALYSIS)


# --- The whole read, through the job ---------------------------------------------------

def _upload(name="memo.txt", data=MEMO.encode()):
    with SessionLocal() as db:
        inv = Investigation(name="Read")
        db.add(inv); db.commit(); db.refresh(inv)
        doc = store_document(db, investigation_id=inv.id, title=name, filename=name, mime_type="text/plain",
                             data=data, storage_dir=settings_storage())
        return doc.id


def _run(document_id, kind="extract_document"):
    with SessionLocal() as db:
        inv_id = db.get(Document, document_id).investigation_id
        job_id = create_job(db, kind=kind, investigation_id=inv_id, subject_type="document", subject_id=document_id).id
    status = execute_job(SessionLocal, job_id, HANDLERS)
    with SessionLocal() as db:
        job = db.get(BackgroundJob, job_id)
        db.expunge(job)
    return status, job


def test_a_read_document_gets_openaleph_names_and_no_pattern_names(fake):
    document_id = _upload()
    fake.queue_analysis("1.upload", {"peopleMentioned": ["jane doe"], "emailMentioned": ["Jane.Doe@meridian.example"],
                                     "detectedLanguage": ["eng"]}, busy_checks=2)
    status, job = _run(document_id)
    assert status == "succeeded", job.error
    assert job.message == "Read by OpenAleph (3 paragraph(s)); 1 name(s) and 1 email address(es) or phone number(s) from OpenAleph"
    rows = _proposals(document_id)
    assert [(r.candidate_type, r.payload["caption"]) for r in rows] == [("entity", "Jane Doe"), ("identifier", "Jane.Doe@Meridian.example")]
    assert all(r.payload["provenance"]["extraction_method"] == "openaleph_ftm_analyze" for r in rows)


def test_a_document_openaleph_did_not_analyse_gets_the_pattern_finder(fake, monkeypatch):
    monkeypatch.setattr(settings, "openaleph_analysis_timeout_seconds", 0.05)
    document_id = _upload()
    fake.statuses = [busy_status("analyze") for _ in range(200)]
    status, job = _run(document_id)
    assert status == "succeeded", job.error
    assert job.message == "Read by OpenAleph (3 paragraph(s)); OpenAleph gave no analysis, so the Workbench's own name-finder looked for names"
    with SessionLocal() as db:
        doc = db.get(Document, document_id)
        assert doc.extraction_issues == ["OpenAleph had not finished finding names after 1 minute(s); "
                                         "use “Find names again” to fetch them when it has."]
    rows = _proposals(document_id)
    assert rows and all(r.payload.get("rationale", {}).get("rule") == "capitalized_name_sequence" for r in rows)


def test_a_document_in_which_openaleph_found_nothing_says_so(fake):
    document_id = _upload()
    fake.entities["1.upload"] = entity("1.upload", bodyText=MEMO, detectedLanguage="eng")
    status, job = _run(document_id)
    assert status == "succeeded" and job.message == "Read by OpenAleph (3 paragraph(s)); OpenAleph found no names"
    assert _proposals(document_id) == []


def test_an_email_gets_its_body_analysed(fake):
    body = "Dear Gustavo,\n\nJonathan Whitaker signed the invoice."
    fake.entities["1.upload"] = entity("1.upload", "Email", bodyText=body, namesMentioned="Rebecca Thornton",
                                       emailMentioned="rebecca@halvorsen.example",
                                       **{"from": "Rebecca Thornton <rebecca@halvorsen.example>"})
    fake.analysis["1.upload"] = {"peopleMentioned": ["jonathan whitaker", "rebecca thornton"], "detectedLanguage": ["eng"]}
    document_id = _upload("invoice.eml", body.encode())
    status, job = _run(document_id)
    assert status == "succeeded", job.error
    assert fake.calls("POST", "/api/2/entities/1.upload/analyze")
    captions = sorted(r.payload["caption"] for r in _proposals(document_id))
    assert captions == ["Jonathan Whitaker", "Rebecca Thornton", "rebecca@halvorsen.example"]


def test_a_paged_document_gets_names_located_on_their_pages(fake):
    fake.entities["1.upload"] = entity("1.upload", "Pages", peopleMentioned=["maria fernandez"], detectedLanguage="eng")
    fake.pages["1.upload"] = [page("1.upload", 1, "Board minutes."), page("1.upload", 2, "Maria Fernandez chaired.")]
    document_id = _upload("minutes.pdf", b"%PDF-")
    status, job = _run(document_id)
    assert status == "succeeded" and job.message == "Read by OpenAleph (2 page(s)); 1 name(s) from OpenAleph"
    (row,) = _proposals(document_id)
    assert row.payload["locator"] == "page 2" and row.payload["caption"] == "Maria Fernandez"


# --- "Find names again" --------------------------------------------------------------------

def _client():
    return TestClient(app)


def test_find_names_again_imports_the_new_results_as_a_job(fake):
    document_id = _upload()
    fake.entities["1.upload"] = entity("1.upload", bodyText=MEMO, detectedLanguage="eng")
    assert _run(document_id)[0] == "succeeded"
    fake.analysis["1.upload"] = {"peopleMentioned": ["angela merkel"], "phoneMentioned": ["+442079460958"]}
    reply = _client().post(f"/api/documents/{document_id}/openaleph/analyze")
    assert reply.status_code == 200, reply.text   # developer mode: the job has finished when this answers
    job = reply.json()
    assert job["kind"] == "openaleph_analyze" and job["status"] == "succeeded", job
    assert job["message"] == "1 name(s) and 1 email address(es) or phone number(s) from OpenAleph"
    assert job["result"] == {"retrieved": 2, "entities": 1, "identifiers": 1, "skipped": 0, "unlocated": 0}
    again = _client().post(f"/api/documents/{document_id}/openaleph/analyze").json()
    assert again["message"] == "OpenAleph found no new names"


def test_find_names_again_needs_a_document_openaleph_has(fake, monkeypatch):
    client = _client()
    assert client.post("/api/documents/missing/openaleph/analyze").status_code == 404
    monkeypatch.setattr(settings, "document_reader", "local")
    document_id = _upload()
    assert _run(document_id)[0] == "succeeded"
    reply = client.post(f"/api/documents/{document_id}/openaleph/analyze")
    assert reply.status_code == 409
    assert reply.json()["detail"] == "This document is not in OpenAleph, so OpenAleph cannot look for names in it"


@pytest.mark.parametrize("setup, error", [
    ("refused", "OpenAleph's name-finding is switched off on this OpenAleph"),
    ("unreachable", "Could not reach OpenAleph (HTTPStatusError); try again when it is running"),
    ("lost", "Could not finish: lost contact with OpenAleph while it was finding names (HTTPStatusError)"),
])
def test_find_names_again_that_fails_says_why_and_can_be_retried(fake, setup, error):
    document_id = _upload()
    fake.entities["1.upload"] = entity("1.upload", bodyText=MEMO, detectedLanguage="eng")
    assert _run(document_id)[0] == "succeeded"
    if setup == "refused":
        fake.analyze_reply = 400
    elif setup == "unreachable":
        fake.fail["/api/2/entities/1.upload/analyze"] = 503
    else:
        fake.fail["/api/2/collections/7/status"] = 502
    job = _client().post(f"/api/documents/{document_id}/openaleph/analyze").json()
    assert job["status"] == "failed" and job["error"] == error
    fake.fail.clear()
    fake.analyze_reply = 202
    retried = _client().post(f"/api/jobs/{job['id']}/retry").json()
    assert retried["status"] == "succeeded"


def test_find_names_again_on_a_document_deleted_meanwhile(fake):
    with SessionLocal() as db:
        job_id = create_job(db, kind="openaleph_analyze", subject_type="document", subject_id="gone").id
    assert execute_job(SessionLocal, job_id, HANDLERS) == "failed"
    with SessionLocal() as db:
        assert db.get(BackgroundJob, job_id).error == "The document no longer exists"
