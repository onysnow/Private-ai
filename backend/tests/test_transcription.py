"""Recordings read as documents (ADR-0020, app/services/transcription.py): an audio file is accepted, transcribed on
this computer, its spoken parts become passages, the parts with no speech are kept apart, the words the machine was
unsure of are kept with their probabilities, and the recording travels in a backup.

Most tests stand in for the model; one transcribes tests/fixtures/media/harbour-talk.mp3 (two spoken sentences, six
seconds of silence, two more) with Whisper's smallest English model, which CI fetches (backend-postgres-ci.yml)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document, DocumentChunk, DocumentMedia, TranscriptSegment
from app.services import transcription
from app.services.exports import build_investigation_export, preview_investigation_restore, restore_investigation_export
from app.services.lifecycle import delete_investigation

client = TestClient(app)
RECORDING = Path(__file__).parent / "fixtures" / "media" / "harbour-talk.mp3"


@pytest.fixture(autouse=True)
def storage(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "documents"))


def _case(name: str = "Harbour") -> str:
    return client.post("/api/investigations", json={"name": name}).json()["id"]


def _upload(inv: str, path: Path = RECORDING, name: str = "ep41_original.mp3") -> dict:
    with path.open("rb") as fh:
        r = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Fernhill Notes ep. 41"},
                        files={"file": (name, fh, "audio/mpeg")})
    return {"status": r.status_code, **r.json()}


def _stand_in(monkeypatch, segments: list[transcription.Segment]) -> None:
    def fake(path, progress):
        progress(1.0, "")
        return transcription.Transcript(kind="audio", duration=19.0, streams=[{"type": "audio", "codec": "mp3"}],
                                        outline=[0.0, 0.5, 1.0], outline_step=6.3, segments=segments,
                                        about={"tool": "faster-whisper 1.2.1", "model": "stand-in", "language": "en",
                                               "language_probability": 0.98, "ran_at": "2026-10-28T10:00:00", "seconds": 0.1,
                                               "where": "this computer"})
    monkeypatch.setattr(transcription, "transcribe", fake)


SEGMENTS = [
    transcription.Segment(0.0, 2.8, "speech", "Last week we spoke about the harbour land.",
                          [{"w": "Last", "s": 0.0, "e": 0.4, "p": 0.9}, {"w": "harbour", "s": 2.0, "e": 2.4, "p": 0.95}]),
    transcription.Segment(3.3, 5.8, "speech", "I never saw a valuation before we voted.",
                          [{"w": "valuation", "s": 3.96, "e": 4.6, "p": 0.31}]),
    transcription.Segment(5.8, 12.4, "no_speech"),
    transcription.Segment(12.4, 15.4, "no_speech", "Thank you for watching.", [{"w": "Thank", "s": 12.4, "e": 12.8, "p": 0.2}]),
    transcription.Segment(16.1, 18.4, "speech", "Mister Ross handled the paperwork with Kestrel himself.",
                          [{"w": "Ross", "s": 16.7, "e": 17.0, "p": 0.57}]),
]


def test_media_files_are_known_by_their_extension():
    assert transcription.is_media("ep41.MP3") and transcription.is_media("clip.webm")
    assert not transcription.is_media("notes.txt") and not transcription.is_media(None)
    assert transcription.locator(731.8, 740.25) == "t=731.8,740.2"
    assert transcription.media_type("x.m4a") == "audio/mp4"


def test_a_recording_becomes_passages_with_its_segments_kept(monkeypatch):
    _stand_in(monkeypatch, SEGMENTS)
    inv = _case()
    doc = _upload(inv)
    assert doc["status"] == 200, doc
    assert doc["extraction_status"] == "complete"
    with SessionLocal() as db:
        chunks = db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc["id"]).order_by(DocumentChunk.ordinal)).all()
        # Only speech is a passage; the silence and the invented "Thank you for watching" are not.
        assert [(c.locator, c.text) for c in chunks] == [
            ("t=0.0,2.8", "Last week we spoke about the harbour land."), ("t=3.3,5.8", "I never saw a valuation before we voted."),
            ("t=16.1,18.4", "Mister Ross handled the paperwork with Kestrel himself.")]
        segments = db.scalars(select(TranscriptSegment).where(TranscriptSegment.document_id == doc["id"]).order_by(TranscriptSegment.ordinal)).all()
        assert [s.kind for s in segments] == ["speech", "speech", "no_speech", "no_speech", "speech"]
        assert segments[0].chunk_id == chunks[0].id and segments[4].chunk_id == chunks[2].id
        assert segments[2].chunk_id is None and segments[3].chunk_id is None
        stored = db.get(Document, doc["id"])
        assert stored.extraction_issues == ["1 word the machine was unsure of: listen before quoting them."]
        assert db.get(DocumentMedia, doc["id"]).duration == 19.0

    t = client.get(f"/api/documents/{doc['id']}/transcript").json()
    assert t["kind"] == "audio" and t["unsure_below"] == 0.5 and t["transcript"]["where"] == "this computer"
    assert [s["kind"] for s in t["segments"]] == ["speech", "speech", "no_speech", "no_speech", "speech"]
    assert t["segments"][1]["words"] == [{"w": "valuation", "s": 3.96, "e": 4.6, "p": 0.31}]


def test_the_recording_plays_unaltered_with_byte_ranges(monkeypatch):
    _stand_in(monkeypatch, SEGMENTS)
    doc = _upload(_case())
    whole = client.get(f"/api/documents/{doc['id']}/media")
    assert whole.status_code == 200 and whole.content == RECORDING.read_bytes()
    assert whole.headers["content-type"] == "audio/mpeg" and whole.headers["accept-ranges"] == "bytes"
    part = client.get(f"/api/documents/{doc['id']}/media", headers={"Range": "bytes=0-99"})
    assert part.status_code == 206 and part.content == RECORDING.read_bytes()[:100]


def test_a_document_that_is_not_a_recording_has_no_transcript():
    inv = _case("Text")
    r = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Memo"},
                    files={"file": ("memo.txt", b"Kestrel SA paid the council.", "text/plain")})
    doc_id = r.json()["id"]
    assert client.get(f"/api/documents/{doc_id}/transcript").status_code == 415
    assert client.get(f"/api/documents/{doc_id}/media").status_code == 415


def test_without_the_model_the_read_fails_saying_what_to_run(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "transcription_model", "tiny.en")
    monkeypatch.setattr(settings, "transcription_model_dir", str(tmp_path / "no-models"))
    transcription.load_model.cache_clear()
    doc = _upload(_case("No model"))
    assert doc["status"] == 422
    assert "python -m app.services.transcription fetch" in doc["detail"]["error"]
    assert "not on this computer" in doc["detail"]["error"]


def test_a_transcribed_recording_travels_in_a_backup(monkeypatch):
    _stand_in(monkeypatch, SEGMENTS)
    inv = _case("Backed up")
    doc = _upload(inv)
    with SessionLocal() as db:
        data, manifest = build_investigation_export(db, inv)
        assert manifest["record_counts"]["transcript_segments"] == 5 and manifest["record_counts"]["document_media"] == 1
        delete_investigation(db, inv, settings.document_storage_dir, confirmation=inv)
        assert db.get(DocumentMedia, doc["id"]) is None
        assert preview_investigation_restore(db, data, Path(settings.document_storage_dir))["can_restore"]
        restore_investigation_export(db, data, Path(settings.document_storage_dir))
        assert db.get(DocumentMedia, doc["id"]) is not None
    assert len(client.get(f"/api/documents/{doc['id']}/transcript").json()["segments"]) == 5


def _real_model_or_skip(monkeypatch):
    folder = os.environ.get("TRANSCRIPTION_TEST_MODEL_DIR", os.path.expanduser("~/whisper-models"))
    monkeypatch.setattr(settings, "transcription_model", "tiny.en")
    monkeypatch.setattr(settings, "transcription_model_dir", folder)
    transcription.load_model.cache_clear()
    try:
        transcription.load_model("tiny.en", folder)
    except transcription.TranscriptionUnavailable:
        if os.environ.get("CI"):
            raise  # CI fetches the model (backend-postgres-ci.yml): missing there is a failure
        pytest.skip(f"no tiny.en model in {folder}")


def test_a_real_recording_is_transcribed_on_this_computer(monkeypatch):
    _real_model_or_skip(monkeypatch)
    doc = _upload(_case("Real"))
    assert doc["status"] == 200 and doc["extraction_status"] == "complete", doc
    t = client.get(f"/api/documents/{doc['id']}/transcript").json()
    spoken = " ".join(s["text"] for s in t["segments"] if s["kind"] == "speech")
    assert "harbo" in spoken.lower() and "kestrel" in spoken.lower() and "million" in spoken.lower()
    # The six seconds of silence between the second and third sentences is a part with no speech.
    gaps = [s for s in t["segments"] if s["kind"] == "no_speech"]
    assert any(s["start"] < 7 and s["end"] > 11 for s in gaps), t["segments"]
    assert t["transcript"]["model"] == "tiny.en" and t["transcript"]["language"] == "en"
    assert 18 < t["duration"] < 20 and len(t["outline"]) > 100 and max(t["outline"]) == 1.0
    assert all(0 <= w["p"] <= 1 for s in t["segments"] for w in s["words"])


def test_a_quote_from_a_recording_is_saved_only_once_it_was_heard(monkeypatch):
    _stand_in(monkeypatch, SEGMENTS)
    doc = _upload(_case("Heard"))
    body = {"source_id": doc["source_id"], "quote": "I never saw a valuation before we voted.", "locator": "t=3.3,5.8"}
    refused = client.post("/api/evidence", json=body)
    assert refused.status_code == 400 and "Listen to this part of the recording" in refused.json()["detail"]
    saved = client.post("/api/evidence", json={**body, "heard": True})
    assert saved.status_code == 200, saved.text
    assert saved.json()["heard_by"] and saved.json()["heard_at"] and saved.json()["locator"] == "t=3.3,5.8"
    # A quote from a written document needs no listening.
    inv = doc["investigation_id"]
    memo = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Memo"},
                       files={"file": ("memo.txt", b"Kestrel SA paid the council.", "text/plain")}).json()
    plain = client.post("/api/evidence", json={"source_id": memo["source_id"], "quote": "Kestrel SA paid the council.", "locator": "line 1"})
    assert plain.status_code == 200 and plain.json()["heard_by"] is None
