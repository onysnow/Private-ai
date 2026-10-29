"""Files made from a recording (mockup INTAKE_4, "Derived files"; ADR-0021): a cleaned copy for listening and the
pinned part of a quote as a clip. Each is a new file with its edit-trail row (app/services/derived_files.py); the
recording itself is never changed, and quotes always play from the original.
"""

from __future__ import annotations

import io
import wave
from pathlib import Path
from typing import Any

import numpy as np
from sqlalchemy.orm import Session

from app.models.derived import DerivedFile
from app.models.documents import Document
from app.models.media import DocumentMedia
from app.services import derived_files
from app.services.native import FILMCRAFT, native
from app.services.transcription import is_media

CLEAN_RATE = 16000
# Light: hum and its harmonics notched out, a little room noise taken down. Enough to hear words, not a restoration.
CLEAN_CHAIN = (("dehum", {"harmonics": 3.0, "amount": 100.0}), ("denoise", {"reduction": 8.0, "threshold": 6.0, "smoothing": 50.0}))
MAX_CLIP_SECONDS = 600.0


class NotARecording(ValueError):
    """The document is not a recording, or the part asked for is outside it."""


def _decoder() -> str:
    import av

    return f"PyAV {av.__version__} (FFmpeg)"


def _decode(path: Path, rate: int, *, stereo: bool = False) -> np.ndarray:
    """The recording decoded to float samples: (channels, samples)."""
    from faster_whisper.audio import decode_audio

    if stereo:
        left, right = decode_audio(str(path), sampling_rate=rate, split_stereo=True)
        return np.stack([left, right]).astype(np.float32)
    return np.asarray(decode_audio(str(path), sampling_rate=rate), dtype=np.float32)[None, :]


def _wav(samples: np.ndarray, rate: int) -> bytes:
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(samples.shape[0])
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.T.tobytes())
    return out.getvalue()


def _recording(db: Session, document: Document) -> DocumentMedia:
    media = db.get(DocumentMedia, document.id)
    if not is_media(document.filename) or media is None:
        raise NotARecording("This document is not a recording that has been read")
    return media


def _original_rate(media: DocumentMedia) -> tuple[int, int]:
    audio: dict[str, Any] = next((s for s in media.streams or [] if s.get("type") == "audio"), {})
    rate = int(audio.get("sample_rate") or 44100)
    channels = int(audio.get("channels") or 1)
    return min(max(rate, 8000), 48000), 2 if channels >= 2 else 1


def cleaned_copy(db: Session, document: Document, *, actor: str | None) -> DerivedFile:
    """A 16 kHz mono copy with the hum taken out and light noise reduction, for listening and transcribing only."""
    _recording(db, document)
    module = native()
    audio = _decode(Path(document.storage_path), CLEAN_RATE)
    for effect, params in CLEAN_CHAIN:
        audio = np.asarray(module.audio.process(effect, audio, float(CLEAN_RATE), params), dtype=np.float32)
    stem = Path(document.filename).stem
    return derived_files.write_derived(
        db, document=document, data=_wav(audio, CLEAN_RATE), filename=f"{stem}_speech-cleaned.wav", mime_type="audio/wav",
        operation="speech_cleaned",
        params={"sample_rate": CLEAN_RATE, "channels": 1, "chain": [{"effect": e, **p} for e, p in CLEAN_CHAIN],
                "use": "listening and transcribing only; quotes play from the original"},
        tool=f"{FILMCRAFT}; decoded by {_decoder()}", created_by=actor)


def clip(db: Session, document: Document, start: float, end: float, *, actor: str | None,
         from_cleaned: bool = False) -> DerivedFile:
    """The part from `start` to `end` seconds as its own WAV file, cut from the original (or the latest cleaned copy)."""
    media = _recording(db, document)
    if not (0 <= start < end <= media.duration + 0.05) or end - start > MAX_CLIP_SECONDS:
        raise NotARecording(f"A clip is a part of the recording, at most {int(MAX_CLIP_SECONDS / 60)} minutes long")
    parent = derived_files.latest(db, document.id, "speech_cleaned") if from_cleaned else None
    if from_cleaned and parent is None:
        raise NotARecording("There is no cleaned copy to cut from: make one first")
    if parent is not None:
        rate, stereo, path = CLEAN_RATE, False, Path(parent.storage_path)
    else:
        rate, channels = _original_rate(media)
        stereo, path = channels == 2, Path(document.storage_path)
    audio = _decode(path, rate, stereo=stereo)
    part = audio[:, int(start * rate):int(end * rate)]
    if part.shape[1] == 0:
        raise NotARecording("That part of the recording holds no sound")
    stem = Path(document.filename).stem
    params: dict[str, Any] = {"start": round(start, 2), "end": round(end, 2), "locator": f"t={start:.1f},{end:.1f}",
                              "sample_rate": rate, "channels": part.shape[0],
                              "from": "the cleaned copy" if parent is not None else "the original"}
    return derived_files.write_derived(
        db, document=document, data=_wav(part, rate), filename=f"clip_{start:.1f}-{end:.1f}_{stem}.wav",
        mime_type="audio/wav", operation="clip", params=params, tool=f"decoded and cut by {_decoder()}", parent=parent,
        created_by=actor)
