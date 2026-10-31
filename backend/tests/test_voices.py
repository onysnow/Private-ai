"""Voices in a recording (ADR-0026, app/services/voices.py; mockup INTAKE_4 › Voices): who spoke when is told apart on
this computer as numbered guesses, given to each spoken part, and only a person names a voice, as a party of the case
or in words; every earlier name is kept. The model is stood in for, except in the last test, which runs the pinned
models on the fixture recording (CI fetches them; elsewhere it is skipped when they are not on this computer)."""

from __future__ import annotations

import os

import pytest

from app.core.config import settings
from app.db.session import SessionLocal
from app.services import voices
from app.services.voices import Turn
from tests.test_transcription import (
    RECORDING,
    SEGMENTS,
    _case,
    _stand_in,
    _upload,
    client,
)

# Host speaks the first part, Guest the second, Host the last; nobody in the parts with no speech.
TURNS = [Turn(0.0, 2.9, 1), Turn(3.2, 5.9, 2), Turn(16.0, 18.5, 1)]


def _read_with_voices(monkeypatch, turns=TURNS) -> tuple[str, dict]:
    _stand_in(monkeypatch, SEGMENTS)
    monkeypatch.setattr(voices, "available", lambda: None)
    monkeypatch.setattr(voices, "find", lambda audio: turns)
    monkeypatch.setattr("faster_whisper.audio.decode_audio", lambda path, sampling_rate: [0.0] * 10)
    inv = _case()
    doc = _upload(inv)
    assert doc["status"] == 200, doc
    return inv, doc


def test_each_spoken_part_gets_the_voice_that_speaks_most_of_it():
    assert voices.voice_of(0.0, 2.8, TURNS) == 1 and voices.voice_of(3.3, 5.8, TURNS) == 2
    assert voices.voice_of(6.0, 12.0, TURNS) is None  # nobody
    assert voices.voice_of(2.0, 4.0, [Turn(0.0, 2.5, 1), Turn(2.5, 4.0, 2)]) == 2  # 1.5 s of 2 s
    assert voices.voice_of(0.0, 4.0, [Turn(0.0, 1.0, 1), Turn(1.0, 2.0, 2)]) is None  # neither speaks most of it


def test_reading_a_recording_tells_its_voices_apart_as_guesses(monkeypatch):
    _inv, doc = _read_with_voices(monkeypatch)
    assert "2 voices told apart on this computer" in client.get(f"/api/jobs?subject_id={doc['id']}&limit=1").json()[0]["message"]
    t = client.get(f"/api/documents/{doc['id']}/transcript").json()
    assert [s["speaker"] for s in t["segments"]] == ["1", "2", None, None, "1"]
    v = t["voices"]
    assert [(x["voice"], x["turns"], x["name"]) for x in v["voices"]] == [("1", 2, None), ("2", 1, None)]
    assert v["found_by"]["where"] == "this computer" and "segmentation-3.0" in v["found_by"]["segmentation"]
    assert v["turns"][0] == [0.0, 2.9, 1] and v["unavailable"] is None


def test_only_a_person_names_a_voice_and_every_earlier_name_is_kept(monkeypatch):
    inv, doc = _read_with_voices(monkeypatch)
    party = client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": "Maren Holt",
                                               "properties": {"name": ["Maren Holt"]}}).json()["id"]
    url = f"/api/documents/{doc['id']}/voices"
    first = client.patch(f"{url}/1", json={"name": "Host"}).json()
    assert first["voices"][0]["name"] == "Host" and first["voices"][0]["named_at"] and first["voices"][1]["name"] is None
    second = client.patch(f"{url}/2", json={"entity_id": party}).json()
    assert second["voices"][1]["name"] == "Maren Holt" and second["voices"][1]["entity_id"] == party
    cleared = client.patch(f"{url}/1", json={}).json()
    assert cleared["voices"][0]["name"] is None
    assert [(h["voice"], h["name"], h["what"]) for h in cleared["history"]] == [("1", "Host", "name cleared")]
    assert client.patch(f"{url}/9", json={"name": "Nobody"}).status_code == 404
    other = client.post("/api/entities", json={"investigation_id": _case("Other case"), "schema": "Person", "caption": "Ana Petrov",
                                               "properties": {"name": ["Ana Petrov"]}}).json()["id"]
    assert client.patch(f"{url}/2", json={"entity_id": other}).status_code == 422
    # Finding the voices again clears the names (the numbers may now mean other voices), keeping them in the history.
    with SessionLocal() as db:
        found = voices.apply(db, doc["id"], TURNS, 0.1)
        db.commit()
    assert all(x["name"] is None for x in found["voices"].values())
    assert ("2", "Maren Holt", "cleared: the voices were found again") in [(h["voice"], h["name"], h["what"]) for h in found["history"]]


def test_without_the_models_nothing_is_guessed_and_the_screen_says_what_to_run(monkeypatch, tmp_path):
    _stand_in(monkeypatch, SEGMENTS)
    monkeypatch.setattr(settings, "voices_model_dir", str(tmp_path / "no-models"))
    doc = _upload(_case())
    t = client.get(f"/api/documents/{doc['id']}/transcript").json()
    assert all(s["speaker"] is None for s in t["segments"]) and t["voices"]["voices"] == []
    assert "python -m app.services.voices fetch" in t["voices"]["unavailable"]
    r = client.post(f"/api/documents/{doc['id']}/voices")
    assert r.status_code == 503 and "python -m app.services.voices fetch" in r.json()["detail"]


def test_a_failure_finding_voices_never_undoes_the_read(monkeypatch):
    def broken(audio):
        raise RuntimeError("model file damaged")

    _inv, doc = _read_with_voices(monkeypatch, turns=[])
    monkeypatch.setattr(voices, "find", broken)
    second = _upload(_case("Second"), name="ep42.mp3")
    assert second["extraction_status"] == "complete"
    message = client.get(f"/api/jobs?subject_id={second['id']}&limit=1").json()[0]["message"]
    assert "voices could not be told apart (RuntimeError)" in message


def test_the_pinned_models_tell_voices_apart_on_this_computer(monkeypatch):
    folder = os.environ.get("VOICES_TEST_MODEL_DIR", os.path.expanduser("~/voice-models"))
    monkeypatch.setattr(settings, "voices_model_dir", folder)
    if voices.available() is not None:
        if os.environ.get("CI"):
            raise AssertionError(voices.available())  # CI fetches the models (backend-postgres-ci.yml)
        pytest.skip(f"no voice models in {folder}")
    from faster_whisper.audio import decode_audio

    audio = decode_audio(str(RECORDING), sampling_rate=voices.SAMPLE_RATE)
    turns = voices.find(audio)
    assert turns and turns[0].voice == 1 and all(0 <= t.start < t.end <= len(audio) / voices.SAMPLE_RATE + 0.1 for t in turns)
    assert sorted({t.voice for t in turns}) == list(range(1, len({t.voice for t in turns}) + 1))
