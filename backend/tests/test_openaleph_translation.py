"""A document's machine translation from OpenAleph's optional translation
service (ADR-0006, Wave C; app/services/openaleph_translation.py). The fake
answers with the properties ftm-translate 5.3.0-argos wrote on OpenAleph
5.3.1 on 2026-10-03: ``translatedText``/``translatedTextLanguage`` on each
page of a paged document, ``translatedText``/``translatedLanguage`` on any
other document."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Investigation
from app.services import openaleph_analysis
from openaleph_fake import FakeOpenAleph, entity, page

client = TestClient(app)


@pytest.fixture()
def fake(monkeypatch, tmp_path):
    fake = FakeOpenAleph().install(monkeypatch)
    monkeypatch.setattr(settings, "document_reader", "auto")
    monkeypatch.setattr(settings, "openaleph_read_poll_seconds", 0.01)
    monkeypatch.setattr(settings, "openaleph_analysis_timeout_seconds", 5)
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "docs"))
    monkeypatch.setattr(openaleph_analysis, "SEARCH_REFRESH_SECONDS", 0)
    return fake


def _investigation() -> str:
    with SessionLocal() as db:
        inv = Investigation(name="Translation")
        db.add(inv)
        db.commit()
        return inv.id


def _upload(inv: str, name: str, data: bytes, mime: str) -> dict:
    reply = client.post("/api/documents/upload", data={"investigation_id": inv, "title": name}, files={"file": (name, data, mime)})
    assert reply.status_code == 200, reply.text
    return reply.json()


def test_a_paged_document_is_shown_page_by_page_beside_its_translation(fake):
    inv = _investigation()
    fake.entities["1.upload"] = entity("1.upload", "Pages", fileName="memo_de.pdf", detectedLanguage=["deu"])
    first, second = page("1.upload", 1, "Die Zahlung wurde freigegeben."), page("1.upload", 2, "Niemand hat widersprochen.")
    first["properties"].update({"translatedText": ["The payment was released."], "translatedTextLanguage": ["eng"]})
    fake.pages["1.upload"] = [second, first]
    doc = _upload(inv, "memo_de.pdf", b"%PDF-", "application/pdf")

    shown = client.get(f"/api/documents/{doc['id']}/translation").json()
    assert shown["state"] == "translated" and shown["detected_languages"] == ["deu"] and shown["translated_language"] == "eng"
    assert shown["parts"] == [
        {"locator": "page 1", "page_number": 1, "original": "Die Zahlung wurde freigegeben.", "translated": "The payment was released."},
        {"locator": "page 2", "page_number": 2, "original": "Niemand hat widersprochen.", "translated": None},
    ]


def test_a_plain_document_carries_its_translation_itself(fake):
    inv = _investigation()
    doc = _upload(inv, "memo_de.txt", "Die Prüfer verlangten Einsicht.".encode(), "text/plain")
    stored = fake.entities["1.upload"]["properties"]
    assert client.get(f"/api/documents/{doc['id']}/translation").json()["state"] == "not_translated"
    stored.update({"bodyText": ["Die Prüfer verlangten Einsicht."], "detectedLanguage": ["deu"],
                   "translatedText": ["The examiners demanded insight."], "translatedLanguage": ["eng"]})
    shown = client.get(f"/api/documents/{doc['id']}/translation").json()
    assert shown["state"] == "translated"
    assert shown["parts"] == [{"locator": "document", "page_number": None, "original": "Die Prüfer verlangten Einsicht.",
                               "translated": "The examiners demanded insight."}]


def test_without_openaleph_or_a_translation_it_says_why(fake, monkeypatch):
    inv = _investigation()
    doc = _upload(inv, "memo.txt", b"Meridian paid.", "text/plain")
    untranslated = client.get(f"/api/documents/{doc['id']}/translation").json()
    assert untranslated["state"] == "not_translated" and untranslated["detail"].startswith("OpenAleph has no translation of this document.")

    def unreachable(entity_id: str):
        raise httpx.ConnectError("refused")
    monkeypatch.setattr("app.services.openaleph_http.get_entity", unreachable)
    assert client.get(f"/api/documents/{doc['id']}/translation").json()["state"] == "unreachable"

    monkeypatch.setattr(settings, "document_reader", "local")
    local = _upload(inv, "local.txt", b"Read here.", "text/plain")
    assert client.get(f"/api/documents/{local['id']}/translation").json()["state"] == "not_in_openaleph"
    monkeypatch.setattr(settings, "openaleph_enabled", False)
    assert client.get(f"/api/documents/{doc['id']}/translation").json()["state"] == "not_configured"
    assert client.get("/api/documents/nope/translation").status_code == 404
