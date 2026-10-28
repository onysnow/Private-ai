"""A recording read as a document (ADR-0020): what the file is, and its transcript segment by segment.

Each spoken segment is also a passage (DocumentChunk, locator ``t=start,end``) so search, proposals and quotes work as
for any document; these rows keep what a passage cannot: word times and probabilities, and the parts with no speech.
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class DocumentMedia(Base):
    """The recording behind a document: `kind` audio or video, its length and streams, an `outline` of its loudness
    for the player (one peak per step of `outline_step` seconds, 0 to 1), and `transcript`: the tool, model, version,
    language and its probability, when it ran and how long it took."""

    __tablename__ = "document_media"
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), primary_key=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    duration: Mapped[float] = mapped_column(Float)
    streams: Mapped[list] = mapped_column(JSON, default=list)
    outline: Mapped[list] = mapped_column(JSON, default=list)
    outline_step: Mapped[float] = mapped_column(Float)
    transcript: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class TranscriptSegment(Base):
    """One stretch of a recording. `kind` is "speech" (its passage is `chunk_id`) or "no_speech": a silence the
    voice-activity filter found, or a segment the model itself rates as probably not speech. A no_speech segment has
    no passage and is never quoted: words there may be invented by the model. `words` is [{w, s, e, p}]: the word, its
    start and end in seconds, and the model's probability for it."""

    __tablename__ = "transcript_segments"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    chunk_id: Mapped[str | None] = mapped_column(ForeignKey("document_chunks.id"), nullable=True, index=True)
    ordinal: Mapped[int] = mapped_column(Integer)
    start: Mapped[float] = mapped_column(Float)
    end: Mapped[float] = mapped_column(Float)
    kind: Mapped[str] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(Text, default="")
    words: Mapped[list] = mapped_column(JSON, default=list)
    avg_logprob: Mapped[float | None] = mapped_column(Float, nullable=True)
    no_speech_prob: Mapped[float | None] = mapped_column(Float, nullable=True)
    speaker: Mapped[str | None] = mapped_column(String(64), nullable=True)
