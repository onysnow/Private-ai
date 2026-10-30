"""Audio and video read as documents (ADR-0020): decoded with PyAV, transcribed on this computer by faster-whisper.

A recording's spoken segments become passages (locator ``t=start,end``, the W3C Media Fragments form), so search,
proposals and quotes work as for any document. ``transcript_segments`` keeps each segment's word times and
probabilities, and the parts with no speech: silences the voice-activity filter found, and segments Whisper itself rates
as probably not speech. Those are never passages: words there may be invented by the model.

The model is fetched once at setup (``python -m app.services.transcription fetch``, written to the outbound log) and is
loaded only from disk: reading a recording never contacts a server.
"""

from __future__ import annotations

import logging
import sys
import time
from dataclasses import dataclass, field
from functools import lru_cache
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive

logger = logging.getLogger("journalism.transcription")

AUDIO_EXTENSIONS = frozenset({".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".flac"})
VIDEO_EXTENSIONS = frozenset({".mp4", ".m4v", ".mov", ".webm", ".mkv"})
MEDIA_EXTENSIONS = AUDIO_EXTENSIONS | VIDEO_EXTENSIONS
MEDIA_TYPES = {".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg",
               ".oga": "audio/ogg", ".opus": "audio/ogg", ".flac": "audio/flac", ".mp4": "video/mp4", ".m4v": "video/mp4",
               ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska"}
SAMPLE_RATE = 16000
# A word the model gives less than this is shown as "machine unsure".
UNSURE_BELOW = 0.5
# A silence at least this long between segments is shown as a part with no speech.
SILENCE_SECONDS = 2.0
# Whisper's own test for a segment that is probably not speech (its no_speech_threshold and logprob_threshold).
NO_SPEECH_PROB, LOW_LOGPROB = 0.6, -1.0
# The player's outline: one loudness peak per step, at most this many steps.
OUTLINE_POINTS = 4000


class TranscriptionUnavailable(RuntimeError):
    """The model is not on this computer, or the file has no sound to transcribe."""


def is_media(filename: str | None) -> bool:
    return Path(filename or "").suffix.lower() in MEDIA_EXTENSIONS


def media_type(filename: str) -> str:
    return MEDIA_TYPES.get(Path(filename).suffix.lower(), "application/octet-stream")


@dataclass
class Segment:
    start: float
    end: float
    kind: str
    text: str = ""
    words: list[dict[str, Any]] = field(default_factory=list)
    avg_logprob: float | None = None
    no_speech_prob: float | None = None


@dataclass
class Transcript:
    kind: str
    duration: float
    streams: list[dict[str, Any]]
    outline: list[float]
    outline_step: float
    segments: list[Segment]
    about: dict[str, Any]


def probe(path: Path) -> tuple[str, float, list[dict[str, Any]]]:
    """The file's kind (audio or video), its length in seconds, and its streams."""
    import av

    with av.open(str(path), metadata_errors="ignore") as container:
        streams: list[dict[str, Any]] = []
        for stream in container.streams:
            context: Any = stream.codec_context  # an audio or video context, by the stream's type
            entry: dict[str, Any] = {"type": stream.type, "codec": getattr(context, "name", None)}
            if stream.type == "audio":
                entry.update(channels=context.channels, sample_rate=context.sample_rate)
            elif stream.type == "video":
                entry.update(width=context.width, height=context.height)
                # Cover art in a sound file (an MP3's picture) is a one-picture stream, not moving pictures.
                if "attached_pic" in str(getattr(stream, "disposition", "")):
                    entry["type"] = "cover"
            streams.append(entry)
        duration = float(container.duration) / 1_000_000 if container.duration else 0.0
    if not any(s["type"] == "audio" for s in streams):
        raise TranscriptionUnavailable("The file has no sound to transcribe")
    kind = "video" if any(s["type"] == "video" for s in streams) else "audio"
    return kind, duration, streams


def outline(audio: Any, duration: float) -> tuple[list[float], float]:
    """Loudness peaks for the player's waveform, 0 to 1."""
    import numpy as np

    if not len(audio):
        return [], 0.0
    points = min(OUTLINE_POINTS, max(1, int(duration * 20)), len(audio))
    size = len(audio) // points
    peaks = np.abs(audio[: size * points]).reshape(points, size).max(axis=1)
    top = float(peaks.max()) or 1.0
    return [round(float(p) / top, 3) for p in peaks], round(duration / len(peaks), 4)


@lru_cache(maxsize=2)
def load_model(name: str, folder: str) -> Any:
    from faster_whisper import WhisperModel

    try:
        return WhisperModel(name, device="cpu", compute_type="int8", download_root=folder, local_files_only=True)
    except Exception as exc:
        raise TranscriptionUnavailable(
            f"The transcription model “{name}” is not on this computer. Fetch it once with: "
            f"python -m app.services.transcription fetch") from exc


def _tool() -> str:
    try:
        return f"faster-whisper {version('faster-whisper')}"
    except PackageNotFoundError:
        return "faster-whisper"


def transcribe(path: Path, progress: Callable[[float, str], None]) -> Transcript:
    """Decode the recording and transcribe it. `progress(fraction, words)` is called after each segment; it may raise
    to stop the read."""
    from faster_whisper.audio import decode_audio

    kind, duration, streams = probe(path)
    audio = decode_audio(str(path), sampling_rate=SAMPLE_RATE)
    duration = duration or len(audio) / SAMPLE_RATE
    peaks, step = outline(audio, duration)
    model = load_model(settings.transcription_model, str(Path(settings.transcription_model_dir).expanduser()))
    began = time.monotonic()
    found, info = model.transcribe(audio, word_timestamps=True, vad_filter=True,
                                   language=settings.transcription_language or None)
    segments: list[Segment] = []
    last_end = 0.0
    for seg in found:
        start, end = round(float(seg.start), 2), round(float(seg.end), 2)
        if start - last_end >= SILENCE_SECONDS:
            segments.append(Segment(start=round(last_end, 2), end=start, kind="no_speech"))
        doubtful = seg.no_speech_prob > NO_SPEECH_PROB and seg.avg_logprob < LOW_LOGPROB
        segments.append(Segment(
            start=start, end=end, kind="no_speech" if doubtful else "speech", text=seg.text.strip(),
            words=[{"w": w.word.strip(), "s": round(float(w.start), 2), "e": round(float(w.end), 2), "p": round(float(w.probability), 3)}
                   for w in seg.words or []],
            avg_logprob=round(float(seg.avg_logprob), 3), no_speech_prob=round(float(seg.no_speech_prob), 3)))
        last_end = max(last_end, end)
        progress(min(1.0, end / duration) if duration else 1.0, seg.text.strip()[:60])
    if duration - last_end >= SILENCE_SECONDS:
        segments.append(Segment(start=round(last_end, 2), end=round(duration, 2), kind="no_speech"))
    about = {"tool": _tool(), "model": settings.transcription_model, "language": info.language,
             "language_probability": round(float(info.language_probability), 3), "ran_at": utcnow_naive().isoformat(),
             "seconds": round(time.monotonic() - began, 1), "where": "this computer"}
    return Transcript(kind=kind, duration=round(duration, 2), streams=streams, outline=peaks, outline_step=step,
                      segments=segments, about=about)


def locator(start: float, end: float) -> str:
    return f"t={start:.1f},{end:.1f}"


def read_media_document(db: Session, document_id: str, report: Callable[[int | None, str | None], None]) -> str:
    """The reading job for a recording: transcribe it, then read the passages like any document's, and keep the
    segments and what the file is. A failure marks the document failed with the reason and raises."""
    from app.models.domain import Document, DocumentChunk, DocumentMedia, TranscriptSegment
    from app.services.documents import extract_document

    doc = db.get(Document, document_id)
    if doc is None:
        return "The document was deleted before it was read"
    report(5, "Opening the recording")
    try:
        transcript = transcribe(Path(doc.storage_path),
                                lambda done, words: report(5 + int(85 * done), f"Transcribing · {words}" if words else "Transcribing"))
    except TranscriptionUnavailable as exc:
        _fail(db, document_id, str(exc))
        raise
    except Exception as exc:
        from app.jobs.records import JobStopped

        if isinstance(exc, JobStopped):
            raise
        logger.exception("transcription failed for %s", document_id)
        _fail(db, document_id, f"The recording could not be transcribed: {exc}")
        raise RuntimeError(f"The recording could not be transcribed: {exc}") from exc

    spoken = [s for s in transcript.segments if s.kind == "speech" and s.text]
    issues = []
    if not spoken:
        issues.append("No speech was found in this recording.")
    unsure = sum(1 for s in spoken for w in s.words if w["p"] < UNSURE_BELOW)
    if unsure:
        issues.append(f"{unsure} word{'s' if unsure != 1 else ''} the machine was unsure of: listen before quoting them.")
    report(92, "Reading the transcript")
    # The language the model heard (or was told to hear, in Settings) is the recording's, unless a firmer one is kept.
    heard = transcript.about.get("language")
    told = bool(settings.transcription_language)
    language = (str(heard), None if told else transcript.about.get("language_probability"), _tool(),
                "reader" if told else "detected") if heard else None
    doc = extract_document(db, document_id, text=([{"locator": locator(s.start, s.end), "page_number": None, "text": s.text}
                                                   for s in spoken], issues), language=language)
    if doc is None:
        return "The document was deleted before it was read"
    if doc.extraction_status != "complete":
        raise RuntimeError(doc.extraction_error or "The transcript could not be read")
    chunks = {c.ordinal: c.id for c in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc.id))}
    ordinal_of_speech = 0
    for n, seg in enumerate(transcript.segments, 1):
        chunk_id = None
        if seg.kind == "speech" and seg.text:
            ordinal_of_speech += 1
            chunk_id = chunks.get(ordinal_of_speech)
        db.add(TranscriptSegment(investigation_id=doc.investigation_id, document_id=doc.id, chunk_id=chunk_id, ordinal=n,
                                 start=seg.start, end=seg.end, kind=seg.kind, text=seg.text, words=seg.words,
                                 avg_logprob=seg.avg_logprob, no_speech_prob=seg.no_speech_prob))
    db.merge(DocumentMedia(document_id=doc.id, investigation_id=doc.investigation_id, kind=transcript.kind,
                           duration=transcript.duration, streams=transcript.streams, outline=transcript.outline,
                           outline_step=transcript.outline_step, transcript=transcript.about))
    db.commit()
    minutes = transcript.duration / 60
    message = (f"Transcribed on this computer: {len(spoken)} spoken part{'s' if len(spoken) != 1 else ''} in "
               f"{minutes:.1f} min, {transcript.about['language']}")
    # Who spoke when (ADR-0026), when the voice models are on this computer. Not finding voices never undoes the read.
    from app.services import voices

    if spoken and voices.available() is None:
        report(95, "Listening for voices")
        try:
            message = f"{message}; {voices.find_in_document(db, doc.id, report)}"
        except Exception as exc:
            from app.jobs.records import JobStopped

            if isinstance(exc, JobStopped):
                raise
            db.rollback()
            logger.exception("finding voices failed for %s", document_id)
            message = f"{message}; voices could not be told apart ({type(exc).__name__})"
    return message


def _fail(db: Session, document_id: str, message: str) -> None:
    from app.models.domain import Document

    db.rollback()
    doc = db.get(Document, document_id)
    if doc is not None:
        doc.extraction_status, doc.extraction_error = "failed", message
        db.commit()


def fetch_model(name: str | None = None, folder: str | None = None) -> Path:
    """Download the model once, at setup, writing the download to the outbound log."""
    from faster_whisper.utils import download_model

    from app.services.outbound import record_platform_request

    name = name or settings.transcription_model
    target = Path(folder or settings.transcription_model_dir).expanduser()
    target.mkdir(parents=True, exist_ok=True)
    record_platform_request(None, kind="download", service="transcription model", destination="huggingface.co",
                            sent=f"Whisper model {name} (faster-whisper)", detail="Fetched once at setup; reads never download")
    return Path(download_model(name, cache_dir=str(target)))


if __name__ == "__main__":  # python -m app.services.transcription fetch [model]
    if len(sys.argv) >= 2 and sys.argv[1] == "fetch":
        print(fetch_model(sys.argv[2] if len(sys.argv) > 2 else None))
    else:
        print("usage: python -m app.services.transcription fetch [model]")
        sys.exit(2)
