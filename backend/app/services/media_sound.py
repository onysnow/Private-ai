"""A recording's sound (mockup MEDIA_2; media research §2.8, §5 ideas 1 and 2): whether mains hum is in it and at
which frequency, its loudness, a spectrogram of a stretch (the original or the cleaned copy, A/B), a cleaned copy made
with the steps a person picks (hum, room noise, loudness) with its loudness before and after in the trail, and two
recordings of one event lined up by matching their sound, an offset a person accepts.

Nothing here changes a recording: a copy is a new file with its trail row (app/services/derived_files.py), and the
accepted offset is kept beside the recording, never in it. The words quoted from a recording are always checked
against the original.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.time import utcnow_naive
from app.models.domain import DerivedFile, Document, DocumentMedia
from app.services import derived_files
from app.services.media_derived import CLEAN_RATE, NotARecording, _decode, _decoder, _recording, _wav
from app.services.native import FILMCRAFT, native

SPECTRO_MAX_SECONDS = 180.0
SPECTRO_TOP_HZ = 4000
SYNC_SECONDS = 600.0  # how much of each recording is compared: the first ten minutes
NOISE = {"off": None, "light": {"reduction": 6.0, "threshold": 6.0, "smoothing": 50.0},
         "medium": {"reduction": 12.0, "threshold": 6.0, "smoothing": 50.0}}


def _mono(db: Session, document: Document, *, seconds: float | None = None, cleaned: bool = False) -> np.ndarray:
    _recording(db, document)
    path = Path(document.storage_path)
    if cleaned:
        copy = derived_files.latest(db, document.id, "speech_cleaned")
        if copy is None:
            raise NotARecording("There is no cleaned copy yet: make one first")
        path = Path(copy.storage_path)
    audio: np.ndarray = np.asarray(_decode(path, CLEAN_RATE)[0], dtype=np.float32)
    return np.asarray(audio[: int(seconds * CLEAN_RATE)]) if seconds else audio


def find_hum(audio: np.ndarray, rate: int = CLEAN_RATE) -> dict[str, Any]:
    """Mains hum: the 50 or 60 Hz line and how many of its harmonics stand clear (10 dB) of the sound beside them, in
    the power averaged over one-second windows of the first minute (so a chance peak in noise does not count)."""
    seconds = min(len(audio) // rate, 60)
    if seconds < 2:
        return {"hz": None, "harmonics": 0, "above_db": 0.0}
    frames = audio[: seconds * rate].reshape(seconds, rate) * np.hanning(rate)
    power = (np.abs(np.fft.rfft(frames, axis=1)) ** 2).mean(axis=0) + 1e-18  # 1 Hz per bin

    def stands(f: int) -> float:
        around = np.median(np.concatenate([power[f - 12: f - 3], power[f + 3: f + 12]]))
        return float(10 * np.log10(power[f - 1: f + 2].max() / around))

    best: dict[str, Any] = {"hz": None, "harmonics": 0, "above_db": 0.0}
    for base in (50, 60):
        lines = [stands(base * k) for k in (1, 2, 3, 4)]
        count = sum(1 for db_ in lines if db_ >= 10)
        # The base line must stand clear; between 50 and 60 Hz, the one with more clear lines (then the stronger) wins.
        if lines[0] >= 10 and (best["hz"] is None or (count, lines[0]) > (best["harmonics"] + 1, best["above_db"])):
            best = {"hz": base, "harmonics": count - 1, "above_db": round(lines[0], 1)}
    return best


def loudness(audio: np.ndarray, rate: int = CLEAN_RATE) -> float | None:
    """Integrated loudness in LUFS (ITU-R BS.1770, FilmCraft's meter), None for silence."""
    measured = native().audio.loudness(np.asarray(audio, dtype=np.float32)[None, :], float(rate))
    value = float(measured["integrated_lufs"])
    return round(value, 1) if np.isfinite(value) and value > -70 else None


def sound_view(db: Session, document: Document) -> dict[str, Any]:
    audio = _mono(db, document)
    cleaned = derived_files.latest(db, document.id, "speech_cleaned")
    media = db.get(DocumentMedia, document.id)
    return {"document_id": document.id, "duration": round(len(audio) / CLEAN_RATE, 2), "hum": find_hum(audio),
            "loudness_lufs": loudness(audio), "cleaned_id": cleaned.id if cleaned is not None else None,
            "sync": (media.sync if media is not None else None) or None}


def spectrogram_png(db: Session, document: Document, start: float, end: float, *, cleaned: bool = False,
                    width: int = 900, height: int = 260) -> bytes:
    """A stretch of the recording as a spectrogram: time across, 0 to 4 kHz up a square-root scale (so the hum lines
    at 50, 100 and 150 Hz can be seen), loudness as the amber's brightness."""
    from PIL import Image

    if not (0 <= start < end) or end - start > SPECTRO_MAX_SECONDS:
        raise NotARecording(f"A spectrogram is drawn for a stretch of up to {int(SPECTRO_MAX_SECONDS)} seconds")
    audio = _mono(db, document, cleaned=cleaned)[int(start * CLEAN_RATE): int(end * CLEAN_RATE)]
    if len(audio) < 2048:
        raise NotARecording("That stretch of the recording holds no sound")
    win = 2048
    hop = max(64, (len(audio) - win) // width)
    frames = np.lib.stride_tricks.sliding_window_view(audio, win)[::hop][:width] * np.hanning(win)
    power = 20 * np.log10(np.abs(np.fft.rfft(frames, axis=1)) + 1e-9)
    freqs = np.fft.rfftfreq(win, 1 / CLEAN_RATE)
    rows = np.sqrt(np.linspace(0, 1, height)) * SPECTRO_TOP_HZ  # bottom row 0 Hz, top row 4 kHz
    picked = power[:, np.clip(np.searchsorted(freqs, rows), 0, len(freqs) - 1)].T[::-1]
    lo, hi = np.percentile(picked, 5), np.percentile(picked, 99.5)
    level = np.clip((picked - lo) / max(1e-6, hi - lo), 0, 1)
    rgb = np.stack([level ** 0.8 * 245, level ** 1.4 * 170, level ** 3 * 60], axis=-1).astype(np.uint8)
    out = io.BytesIO()
    Image.fromarray(rgb, "RGB").resize((width, height)).save(out, "PNG")
    return out.getvalue()


def clean(db: Session, document: Document, *, hum: bool, noise: str, loudness_target: float | None,
          actor: str | None) -> DerivedFile:
    """A 16 kHz mono copy for listening with the steps asked for, and its loudness before and after in the trail."""
    if noise not in NOISE:
        raise NotARecording("Room noise is off, light or medium")
    if loudness_target is not None and not -30 <= loudness_target <= -10:
        raise NotARecording("Even out loudness to between -30 and -10 LUFS")
    module = native()
    audio = _mono(db, document)[None, :]
    before = loudness(audio[0])
    chain: list[dict[str, Any]] = []
    found = find_hum(audio[0])
    if hum:
        hz = found["hz"] or 50
        params = {"frequency": 0.0 if hz == 50 else 1.0, "harmonics": float(max(2, found["harmonics"] + 1)), "amount": 100.0}
        audio = np.asarray(module.audio.process("dehum", audio, float(CLEAN_RATE), params), dtype=np.float32)
        chain.append({"effect": "dehum", "hz": hz, **params})
    if NOISE[noise]:
        audio = np.asarray(module.audio.process("denoise", audio, float(CLEAN_RATE), NOISE[noise]), dtype=np.float32)
        chain.append({"effect": "denoise", "level": noise, **(NOISE[noise] or {})})
    if loudness_target is not None:
        # Gain toward the target, then a limiter so no peak passes -1 dB; the limiter takes some loudness back, so
        # the gain is corrected and the pair run again (three passes at most).
        total = 0.0
        for _ in range(3):
            now = loudness(audio[0])
            if now is None or abs(loudness_target - now) < 0.5:
                break
            gain = max(-96.0, min(24.0, float(loudness_target - now)))
            total += gain
            audio = np.asarray(module.audio.process("amplify", audio, float(CLEAN_RATE), {"gain": gain}), dtype=np.float32)
            audio = np.asarray(module.audio.process("limiter", audio, float(CLEAN_RATE), {"ceiling": -1.0}), dtype=np.float32)
        chain.append({"effect": "loudness", "target_lufs": loudness_target, "gain_db": round(total, 1), "limiter_ceiling_db": -1.0})
    if not chain:
        raise NotARecording("Pick at least one step: hum, room noise or loudness")
    after = loudness(audio[0])
    stem = Path(document.filename).stem
    return derived_files.write_derived(
        db, document=document, data=_wav(audio, CLEAN_RATE), filename=f"{stem}_speech-cleaned.wav", mime_type="audio/wav",
        operation="speech_cleaned",
        params={"sample_rate": CLEAN_RATE, "channels": 1, "chain": chain, "loudness_before_lufs": before,
                "loudness_after_lufs": after, "use": "listening and transcribing only; quotes play from the original"},
        tool=f"{FILMCRAFT}; decoded by {_decoder()}", created_by=actor)


def find_sync(db: Session, document: Document, other: Document) -> dict[str, Any]:
    """Where `other` lines up in this recording, found by matching their sound (FilmCraft's find_offset over the first
    ten minutes of each). A positive offset: the other recording started that many seconds after this one."""
    if other.investigation_id != document.investigation_id:
        raise NotARecording("The other recording is not in this case")
    a, b = _mono(db, document, seconds=SYNC_SECONDS), _mono(db, other, seconds=SYNC_SECONDS)
    found = native().audio.find_offset(a, b, CLEAN_RATE, SYNC_SECONDS)
    if found is None:
        return {"other_document_id": other.id, "offset_seconds": None, "confidence": 0.0, "reliable": False}
    return {"other_document_id": other.id, "offset_seconds": round(float(found["lag_seconds"]), 3),
            "confidence": round(float(found["confidence"]), 3), "reliable": bool(found["reliable"]),
            "distinct": round(float(found["distinct"]), 3) if np.isfinite(found["distinct"]) else None,
            "inverted": bool(found["inverted"])}


def accept_sync(db: Session, document: Document, found: dict[str, Any], *, actor: str | None) -> dict[str, Any]:
    """A person accepts an offset: it is kept beside the recording with who and when (never in the file)."""
    media = _recording(db, document)
    if found.get("offset_seconds") is None:
        raise NotARecording("Nothing lined up: there is no offset to accept")
    media.sync = {**found, "accepted_by": actor, "accepted_at": utcnow_naive().isoformat(), "found_by": f"{FILMCRAFT} find_offset"}
    flag_modified(media, "sync")
    db.commit()
    return media.sync
