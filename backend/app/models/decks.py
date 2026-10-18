"""Reporter-facing slide decks assembled from investigation evidence --
the "deck" half of the presentation_draft AI module's output (the "brief"
half becomes a Writeup; see app/models/writeups.py and
app/services/presentation.py).

Kept deliberately simple: `slides_json` is a plain ordered list of
{"heading": str, "bullets": [str], "evidence": [{"record_type","record_id"}]}
dicts, not a ProseMirror document -- a deck has no inline rich text to
author, so there is nothing TipTap buys here. Export renders this straight
into python-pptx shapes (see app/services/decks.py:export_deck_pptx).
"""

from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class Deck(Base):
    __tablename__ = "decks"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    slides_json: Mapped[list] = mapped_column(JSON, default=list)
    # {"theme", "fonts"} -- see app/services/presentation_style.py. Per-visual
    # presets/options live on each slide's visual["style"].
    style_json: Mapped[dict | None] = mapped_column(JSON, default=dict, nullable=True)
    source_ai_candidate_id: Mapped[str | None] = mapped_column(ForeignKey("ai_analysis_candidates.id"), nullable=True, index=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)
