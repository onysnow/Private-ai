"""Sortable ids and timestamps shared by the store and the supervisor."""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone

_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def new_id() -> str:
    """A ULID-shaped id: 10 chars of millisecond time + 16 chars of randomness,
    Crockford base32, lexically sortable by creation time."""
    ms = int(time.time() * 1000)
    head = ""
    for _ in range(10):
        head = _ALPHABET[ms & 31] + head
        ms >>= 5
    rand = int.from_bytes(os.urandom(10), "big")
    tail = ""
    for _ in range(16):
        tail = _ALPHABET[rand & 31] + tail
        rand >>= 5
    return head + tail


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
