"""A recording's sound (app/services/media_sound.py, mockup MEDIA_2): mains hum found and at which frequency, the
loudness, a spectrogram of a stretch, a cleaned copy with the steps a person picks and its loudness before and after,
and two recordings of one event lined up by their sound, kept only once a person accepts it."""

from __future__ import annotations

import io
import os
import wave

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import DocumentMedia
from app.services import media_sound, native, transcription

client = TestClient(app)
RATE = 16000


@pytest.fixture(autouse=True)
def storage(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "documents"))
    if not native.available():
        if os.environ.get("CI"):
            raise AssertionError("CI builds the native module (backend-postgres-ci.yml); it is missing")
        pytest.skip("the native module is not built here")

    def stand_in(path, progress):
        progress(1.0, "")
        return transcription.Transcript(kind="audio", duration=8.0, streams=[{"type": "audio", "codec": "pcm", "sample_rate": RATE, "channels": 1}],
                                        outline=[0.5], outline_step=8.0, segments=[],
                                        about={"tool": "stand-in", "model": "stand-in", "language": "en", "language_probability": 1.0,
                                               "ran_at": "2026-10-29T10:00:00", "seconds": 0.1, "where": "this computer"})
    monkeypatch.setattr(transcription, "transcribe", stand_in)


def _wav(samples: np.ndarray) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((np.clip(samples, -1, 1) * 32000).astype("<i2").tobytes())
    return out.getvalue()


def _event(seconds: float = 12.0) -> np.ndarray:
    rng = np.random.default_rng(3)
    # A crowd's sound: noise shaped into bursts, like speech, which two microphones in one room both hear.
    noise = rng.standard_normal(int(RATE * seconds)) * 0.2
    bursts = (np.sin(np.arange(len(noise)) / RATE * 2 * np.pi * 1.3) > 0).astype(float) * 0.8 + 0.2
    return (noise * bursts).astype(np.float32)


def _upload(inv: str, name: str, samples: np.ndarray) -> str:
    r = client.post("/api/documents/upload", data={"investigation_id": inv, "title": name}, files={"file": (name, _wav(samples), "audio/wav")})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_mains_hum_is_found_at_its_frequency():
    t = np.arange(RATE * 10) / RATE
    hum = 0.1 * (np.sin(2 * np.pi * 50 * t) + 0.5 * np.sin(2 * np.pi * 100 * t) + 0.3 * np.sin(2 * np.pi * 150 * t))
    found = media_sound.find_hum((_event(10) * 0.3 + hum).astype(np.float32))
    assert found["hz"] == 50 and found["harmonics"] >= 2
    assert media_sound.find_hum(_event(10))["hz"] is None


def test_a_cleaned_copy_keeps_its_steps_and_its_loudness_before_and_after():
    inv = client.post("/api/investigations", json={"name": "Sound"}).json()["id"]
    t = np.arange(RATE * 8) / RATE
    doc = _upload(inv, "meeting.wav", _event(8) * 0.05 + 0.08 * np.sin(2 * np.pi * 50 * t))
    sound = client.get(f"/api/documents/{doc}/sound").json()
    assert sound["hum"]["hz"] == 50 and sound["loudness_lufs"] < -16 and sound["cleaned_id"] is None
    png = client.get(f"/api/documents/{doc}/spectrogram.png", params={"start": 0, "end": 6})
    assert png.status_code == 200 and png.content.startswith(b"\x89PNG")
    assert client.get(f"/api/documents/{doc}/spectrogram.png", params={"start": 0, "end": 400}).status_code == 422
    made = client.post(f"/api/documents/{doc}/derived/cleaned", json={"hum": True, "noise": "light", "loudness_target": -16})
    assert made.status_code == 201, made.text
    params = made.json()["params"]
    assert [step["effect"] for step in params["chain"]] == ["dehum", "denoise", "loudness"]
    assert params["chain"][0]["hz"] == 50
    assert params["loudness_before_lufs"] < -20 and abs(params["loudness_after_lufs"] + 16) < 1.5
    assert client.post(f"/api/documents/{doc}/derived/cleaned", json={"hum": False, "noise": "off", "loudness_target": None}).status_code == 422
    # With no steps given the copy is made as before (hum out, light noise reduction).
    assert client.post(f"/api/documents/{doc}/derived/cleaned").status_code == 201
    assert client.get(f"/api/documents/{doc}/spectrogram.png", params={"start": 0, "end": 6, "cleaned": True}).status_code == 200


def test_two_recordings_of_one_event_are_lined_up_and_kept_once_accepted():
    inv = client.post("/api/investigations", json={"name": "Two microphones"}).json()["id"]
    event = _event(12)
    council = _upload(inv, "council-video.wav", event)
    phone = _upload(inv, "phone.wav", event[int(2.48 * RATE):] * 0.6)
    found = client.post(f"/api/documents/{council}/sync", json={"other_document_id": phone}).json()
    assert found["reliable"] and abs(found["offset_seconds"] - 2.48) < 0.01
    with SessionLocal() as db:
        assert db.get(DocumentMedia, council).sync is None  # nothing kept until a person accepts it
    kept = client.post(f"/api/documents/{council}/sync/accept", json={"other_document_id": phone}).json()
    assert kept["accepted_by"] == "local-owner" and abs(kept["offset_seconds"] - 2.48) < 0.01
    assert client.get(f"/api/documents/{council}/sound").json()["sync"]["other_document_id"] == phone
    other = client.post("/api/investigations", json={"name": "Elsewhere"}).json()["id"]
    stranger = _upload(other, "elsewhere.wav", event)
    assert client.post(f"/api/documents/{council}/sync", json={"other_document_id": stranger}).status_code == 422
