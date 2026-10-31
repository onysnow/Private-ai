"""Voices in a recording (ADR-0026; mockup INTAKE_4 › Voices): who spoke when, told apart on this computer, and named
by a person.

sherpa-onnx (Apache-2.0) runs pyannote's segmentation-3.0 network (MIT) to find where voices start and stop, and the
3D-Speaker CAM++ voice embedding trained on VoxCeleb (Apache-2.0) to group the stretches by voice. The machine's
voices are numbered in the order they first speak ("Voice 1", "Voice 2"): guesses within this one recording, never a
name. Only a person names a voice, optionally as one of the case's parties; the name is kept with who gave it and
when, and every earlier name stays in its history. A voice is never matched across recordings (voice biometrics,
media-suite research §2.4 and §4.5).

The two model files are fetched once at setup (``python -m app.services.voices fetch``, written to the outbound log)
and checked against their pinned SHA-256; finding voices only reads them from disk.
"""

from __future__ import annotations

import hashlib
import sys
import tarfile
import time
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive

SAMPLE_RATE = 16000
# The two files, where they are published, and their SHA-256 as checked on 29 Oct 2026.
SEGMENTATION = ("segmentation-3-0.onnx", "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/"
                "sherpa-onnx-pyannote-segmentation-3-0.tar.bz2", "220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079")
EMBEDDING = ("campplus-voxceleb-16k.onnx", "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/"
             "3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx", "357a834f702b80161e5b981182c038e18553c1f2ca752ed6cec2052365d4129b")
# Two stretches whose voices are closer than this (cosine distance) are one voice. Tried on a four-speaker recording.
CLUSTER_THRESHOLD = 0.5
# A segment is given the voice that speaks for most of it, if that voice covers at least this share of it.
MOSTLY = 0.5


class VoicesUnavailable(RuntimeError):
    """The model files are not on this computer, or sherpa-onnx is not installed."""


@dataclass
class Turn:
    start: float
    end: float
    voice: int


def _folder() -> Path:
    return Path(settings.voices_model_dir).expanduser()


def available() -> str | None:
    """None when voices can be found here; otherwise why not, in words."""
    try:
        import sherpa_onnx  # noqa: F401
    except ImportError:
        return "sherpa-onnx is not installed"
    missing = [name for name, _url, _sha in (SEGMENTATION, EMBEDDING) if not (_folder() / name).is_file()]
    if missing:
        return "The voice models are not on this computer yet: run python -m app.services.voices fetch"
    return None


def _tool() -> str:
    try:
        return f"sherpa-onnx {version('sherpa-onnx')}"
    except PackageNotFoundError:
        return "sherpa-onnx"


def find(audio: Any) -> list[Turn]:
    """Who spoke when in 16 kHz mono audio (floats, -1 to 1): stretches, each with its voice numbered from 1 in the
    order the voices first speak."""
    import sherpa_onnx as so

    why = available()
    if why:
        raise VoicesUnavailable(why)
    config = so.OfflineSpeakerDiarizationConfig(
        segmentation=so.OfflineSpeakerSegmentationModelConfig(
            pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(_folder() / SEGMENTATION[0]))),
        embedding=so.SpeakerEmbeddingExtractorConfig(model=str(_folder() / EMBEDDING[0])),
        clustering=so.FastClusteringConfig(num_clusters=-1, threshold=CLUSTER_THRESHOLD),
        min_duration_on=0.3, min_duration_off=0.5)
    if not config.validate():
        raise VoicesUnavailable("The voice models on this computer could not be loaded")
    found = so.OfflineSpeakerDiarization(config).process(audio).sort_by_start_time()
    numbers: dict[int, int] = {}
    turns = []
    for seg in found:
        numbers.setdefault(seg.speaker, len(numbers) + 1)
        turns.append(Turn(round(float(seg.start), 2), round(float(seg.end), 2), numbers[seg.speaker]))
    return turns


def voice_of(start: float, end: float, turns: list[Turn]) -> int | None:
    """The voice that speaks for most of [start, end], or None when no voice covers most of it."""
    heard: dict[int, float] = {}
    for t in turns:
        overlap = min(end, t.end) - max(start, t.start)
        if overlap > 0:
            heard[t.voice] = heard.get(t.voice, 0.0) + overlap
    if not heard or end <= start:
        return None
    voice, seconds = max(heard.items(), key=lambda kv: kv[1])
    return voice if seconds / (end - start) >= MOSTLY else None


def apply(db: Session, document_id: str, turns: list[Turn], seconds: float) -> dict[str, Any]:
    """Give each spoken segment its voice and keep the voices on the recording. Names a person gave earlier stay with
    their voice number only if the voices are found again the same way, so they are cleared, with the old names
    kept in the history."""
    from app.models.domain import DocumentMedia, TranscriptSegment

    media = db.get(DocumentMedia, document_id)
    if media is None:
        raise ValueError("This recording has not been transcribed yet")
    rows = list(db.scalars(select(TranscriptSegment).where(TranscriptSegment.document_id == document_id)))
    spoken: dict[int, float] = {}
    turns_of: dict[int, int] = {}
    for t in turns:
        spoken[t.voice] = spoken.get(t.voice, 0.0) + (t.end - t.start)
        turns_of[t.voice] = turns_of.get(t.voice, 0) + 1
    for row in rows:
        voice = voice_of(row.start, row.end, turns) if row.kind == "speech" else None
        row.speaker = str(voice) if voice else None
    before = dict(media.voices or {})
    history = list(before.get("history") or [])
    for key, named in (before.get("voices") or {}).items():
        if named.get("name"):
            history.append({"at": utcnow_naive().isoformat(), "voice": key, "name": named.get("name"),
                            "entity_id": named.get("entity_id"), "by": "the app", "what": "cleared: the voices were found again"})
    media.voices = {
        "found_by": {"tool": _tool(), "segmentation": "pyannote segmentation-3.0 (MIT)",
                     "embedding": "3D-Speaker CAM++ VoxCeleb 16k (Apache-2.0)", "threshold": CLUSTER_THRESHOLD,
                     "ran_at": utcnow_naive().isoformat(), "seconds": round(seconds, 1), "where": "this computer"},
        "voices": {str(v): {"spoken": round(spoken[v], 1), "turns": turns_of[v], "name": None, "entity_id": None,
                            "named_by": None, "named_at": None} for v in sorted(spoken)},
        "turns": [[t.start, t.end, t.voice] for t in turns],
        "history": history,
    }
    return media.voices


def find_in_document(db: Session, document_id: str, report: Callable[[int | None, str | None], None]) -> str:
    """Find the voices of a transcribed recording and keep them. Raises VoicesUnavailable when the models are not here."""
    from faster_whisper.audio import decode_audio

    from app.models.domain import Document

    doc = db.get(Document, document_id)
    if doc is None:
        return "The recording was deleted"
    why = available()
    if why:
        raise VoicesUnavailable(why)
    report(10, "Listening for voices")
    audio = decode_audio(str(doc.storage_path), sampling_rate=SAMPLE_RATE)
    began = time.monotonic()
    turns = find(audio)
    found = apply(db, document_id, turns, time.monotonic() - began)
    db.commit()
    n = len(found["voices"])
    return f"{n} voice{'s' if n != 1 else ''} told apart on this computer: guesses until you name them"


def name(db: Session, document_id: str, voice: str, *, name: str | None, entity_id: str | None, actor: str | None) -> dict:
    """A person names a voice, or clears its name. Kept with who and when; the earlier name goes to the history."""
    from sqlalchemy.orm.attributes import flag_modified

    from app.models.domain import DocumentMedia, Entity

    media = db.get(DocumentMedia, document_id)
    voices = dict((media.voices or {}) if media else {})
    if media is None or voice not in (voices.get("voices") or {}):
        raise LookupError("No such voice in this recording")
    if entity_id is not None:
        party = db.get(Entity, entity_id)
        if party is None or party.investigation_id != media.investigation_id:
            raise ValueError("That party is not in this case")
        name = name or party.caption
    name = (name or "").strip()[:120] or None
    entry = dict(voices["voices"][voice])
    if entry.get("name") or entry.get("entity_id"):
        voices["history"] = [*(voices.get("history") or []), {
            "at": utcnow_naive().isoformat(), "voice": voice, "name": entry.get("name"), "entity_id": entry.get("entity_id"),
            "by": entry.get("named_by"), "what": "renamed" if name else "name cleared"}]
    entry.update(name=name, entity_id=entity_id if name else None, named_by=actor if name else None,
                 named_at=utcnow_naive().isoformat() if name else None)
    voices["voices"] = {**voices["voices"], voice: entry}
    media.voices = voices
    flag_modified(media, "voices")
    db.commit()
    return voices


def serialize(media: Any) -> dict[str, Any]:
    """The recording's voices for the screen: each with how long it spoke, its name if a person gave one, and why there
    are none when there are none."""
    voices = (media.voices or {}) if media is not None else {}
    rows = [{"voice": key, **value} for key, value in sorted((voices.get("voices") or {}).items(), key=lambda kv: int(kv[0]))]
    return {"voices": rows, "turns": voices.get("turns") or [], "found_by": voices.get("found_by"),
            "history": voices.get("history") or [], "unavailable": None if rows else available()}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def fetch_models(folder: str | None = None) -> Path:
    """Download the two model files once, at setup, each written to the outbound log and checked against its pin."""
    import httpx

    from app.services.outbound import record_platform_request

    target = Path(folder or settings.voices_model_dir).expanduser()
    target.mkdir(parents=True, exist_ok=True)
    for name_, url, sha in (SEGMENTATION, EMBEDDING):
        dest = target / name_
        if dest.is_file() and _sha256(dest) == sha:
            continue
        record_platform_request(None, kind="download", service="voice model", destination="github.com", sent=url,
                                detail="Fetched once at setup; finding voices never downloads")
        part = target / (Path(url).name + ".part")
        with httpx.stream("GET", url, follow_redirects=True, timeout=120) as response:
            response.raise_for_status()
            with part.open("wb") as handle:
                for chunk in response.iter_bytes():
                    handle.write(chunk)
        if url.endswith(".tar.bz2"):
            with tarfile.open(part, "r:bz2") as archive:
                member = next(m for m in archive.getmembers() if m.name.endswith("/model.onnx"))
                source = archive.extractfile(member)
                if source is None:
                    raise RuntimeError("The segmentation archive holds no model.onnx")
                dest.write_bytes(source.read())
            part.unlink()
        else:
            part.replace(dest)
        if _sha256(dest) != sha:
            dest.unlink()
            raise RuntimeError(f"{url} is not the expected file (its fingerprint differs); nothing was kept")
    return target


if __name__ == "__main__":  # python -m app.services.voices fetch
    if len(sys.argv) >= 2 and sys.argv[1] == "fetch":
        print(fetch_models(sys.argv[2] if len(sys.argv) > 2 else None))
    else:
        print("usage: python -m app.services.voices fetch [folder]")
