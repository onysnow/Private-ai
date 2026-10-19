"""Requests for Decide (app/api/routes_case_home.py): putting a decision off (H) and bringing it back."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

DecisionKindIn = Literal["to_check", "missing", "proposal", "match", "outside", "ai", "watchlist"]


class DecisionSnoozeCreate(BaseModel):
    """Puts one decision off: until a time, until the item changes (the default), or whichever comes first."""
    kind: DecisionKindIn
    item_id: str = Field(min_length=1, max_length=64)
    until: datetime | None = Field(default=None, description="When it comes back; none: only when the item changes.")
    wake_on_activity: bool = Field(default=True, description="Comes back as soon as the item changes (new activity on it).")


class DecisionWake(BaseModel):
    """Brings a decision put off back into the queue now (the snoozed list's Restore, and Z)."""
    kind: DecisionKindIn
    item_id: str = Field(min_length=1, max_length=64)
