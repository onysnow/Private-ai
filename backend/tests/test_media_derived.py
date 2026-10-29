"""Files made from a recording and what its publisher says (mockup INTAKE_4; app/services/media_derived.py,
app/services/publisher_transcript.py): a cleaned copy and a clip, each a new file with its edit-trail row; the
publisher's transcript and chapters fetched with a podcast episode; the two transcripts compared word by word.

The episode comes through Following from the small site of the Following tests; the transcription is a stand-in, the
audio is the real fixture, decoded, cleaned and cut for real.
"""

from __future__ import annotations

import hashlib
import io
import wave

import pytest
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.domain import DerivedFile, Document, OutboundRequest
from app.services import native, transcription
from tests.test_following import _case, _follow, _screen, client, site  # noqa: F401  (site is a fixture)


def _stand_in(path, progress):
    progress(1.0, "")
    seg = transcription.Segment
    return transcription.Transcript(
        kind="audio", duration=19.0, streams=[{"type": "audio", "codec": "mp3", "sample_rate": 44100, "channels": 1}],
        outline=[0.5], outline_step=19.0,
        segments=[seg(0.0, 2.8, "speech", "Last week we spoke about the harbour land.", []),
                  seg(2.8, 6.2, "speech", "I never saw a valuation before we voted.", []),
                  seg(6.2, 9.0, "no_speech", "Thank you for watching.", [])],
        about={"tool": "stand-in", "model": "stand-in", "language": "en", "language_probability": 1.0,
               "ran_at": "2026-10-28T10:00:00", "seconds": 0.1, "where": "this computer"})


@pytest.fixture
def episode(site, monkeypatch):
    monkeypatch.setattr(transcription, "transcribe", _stand_in)
    inv = _case()
    _follow(inv, site.base + "/podcast.xml")
    item = _screen(inv)["queue"][0]
    after = client.post(f"/api/monitor-items/{item['id']}/capture").json()
    doc_id = next(q for q in after["queue"] if q["id"] == item["id"])["document_id"]
    return inv, doc_id


def test_the_publishers_transcript_and_parts_come_with_the_episode(episode, site):
    inv, doc_id = episode
    t = client.get(f"/api/documents/{doc_id}/transcript").json()
    pub = t["publisher"]
    assert pub["url"].endswith("/ep41.vtt") and pub["type"] == "text/vtt" and len(pub["sha256"]) == 64
    assert [c["text"] for c in pub["cues"]] == ["Last week we spoke about the harbour land.", "I never saw an evaluation before we voted."]
    assert pub["cues"][1]["speaker"] == "Guest"
    assert t["parts"] == [{"start": 0.0, "title": "Welcome"}, {"start": 2.8, "title": "The board meeting"}]
    with SessionLocal() as db:
        asked = [r.value for r in db.scalars(select(OutboundRequest).where(OutboundRequest.investigation_id == inv))]
    assert any(v.endswith("/ep41.vtt") for v in asked) and any(v.endswith("/ep41-chapters.json") for v in asked)
    rows = client.get(f"/api/documents/{doc_id}/transcript/compare").json()
    assert [r["kind"] for r in rows] == ["speech", "speech", "no_speech"]
    assert rows[0]["differs"] == 0
    second = rows[1]
    assert [w["w"] for w in second["ours"] if w["differs"]] == ["a", "valuation"]
    assert [w["w"] for w in second["theirs"] if w["differs"]] == ["an", "evaluation"]
    assert rows[2]["theirs"] == [] and rows[2]["no_speech_text"] == "Thank you for watching."


def test_a_recording_with_no_publishers_transcript_has_nothing_to_compare(episode, site):
    _inv, doc_id = episode
    with SessionLocal() as db:
        doc = db.get(Document, doc_id)
        from app.models.domain import Source
        source = db.get(Source, doc.source_id)
        source.metadata_json = {k: v for k, v in (source.metadata_json or {}).items() if k != "publisher_transcript"}
        db.commit()
    assert client.get(f"/api/documents/{doc_id}/transcript").json()["publisher"] is None
    assert client.get(f"/api/documents/{doc_id}/transcript/compare").status_code == 404


def test_a_clip_is_cut_from_the_original_as_a_new_file_with_its_trail(episode):
    _inv, doc_id = episode
    with SessionLocal() as db:
        doc = db.get(Document, doc_id)
        original = open(doc.storage_path, "rb").read()
    r = client.post(f"/api/documents/{doc_id}/derived/clip", json={"start": 2.8, "end": 6.2})
    assert r.status_code == 201, r.text
    row = r.json()
    assert row["operation"] == "clip" and row["params"]["locator"] == "t=2.8,6.2" and row["params"]["from"] == "the original"
    assert row["parent_sha256"] == hashlib.sha256(original).hexdigest() and row["created_by"] == "local-owner"
    got = client.get(f"/api/derived-files/{row['id']}/file")
    assert got.status_code == 200 and got.headers["x-content-sha256"] == row["sha256"]
    with wave.open(io.BytesIO(got.content)) as w:
        assert w.getframerate() == 44100 and abs(w.getnframes() / w.getframerate() - 3.4) < 0.05
    with SessionLocal() as db:
        assert open(db.get(Document, doc_id).storage_path, "rb").read() == original  # the recording is unchanged
    assert client.post(f"/api/documents/{doc_id}/derived/clip", json={"start": 5, "end": 400}).status_code == 422
    assert [d["operation"] for d in client.get(f"/api/documents/{doc_id}/derived").json()] == ["clip"]


@pytest.mark.skipif(not native.available(), reason="needs the native module (backend/native)")
def test_a_cleaned_copy_is_16_khz_mono_and_a_clip_can_be_cut_from_it(episode):
    _inv, doc_id = episode
    r = client.post(f"/api/documents/{doc_id}/derived/cleaned")
    assert r.status_code == 201, r.text
    cleaned = r.json()
    assert cleaned["operation"] == "speech_cleaned" and cleaned["mime_type"] == "audio/wav"
    assert [step["effect"] for step in cleaned["params"]["chain"]] == ["dehum", "denoise"] and "FilmCraft" in cleaned["tool"]
    with wave.open(io.BytesIO(client.get(f"/api/derived-files/{cleaned['id']}/file").content)) as w:
        assert (w.getframerate(), w.getnchannels()) == (16000, 1)
    part = client.post(f"/api/documents/{doc_id}/derived/clip", json={"start": 0, "end": 2.8, "from_cleaned": True}).json()
    assert part["parent_id"] == cleaned["id"] and part["parent_sha256"] == cleaned["sha256"] and part["params"]["sample_rate"] == 16000
    with SessionLocal() as db:
        assert db.scalar(select(DerivedFile).where(DerivedFile.id == part["id"])).parent_id == cleaned["id"]


def test_a_document_that_is_not_a_recording_has_no_clip(site):
    inv = _case()
    up = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Memo"},
                     files={"file": ("memo.txt", b"Kestrel SA bought the harbour land.", "text/plain")}).json()
    assert client.post(f"/api/documents/{up['id']}/derived/clip", json={"start": 0, "end": 1}).status_code == 415
    assert client.get("/api/derived-files/nope/file").status_code == 404
