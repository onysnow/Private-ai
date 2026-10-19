"""What the rules leave stored for a case, for tests that prove a read writes none of it.

GET .../red-flags, .../checks, .../decisions and .../wire read the flags and To check items as the
last run (POST .../red-flags/run) left them. A test takes ``stored(inv)`` before and after a read:
every flag and item, with the times a run or a person sets, and the case's record of the last run."""
from __future__ import annotations

from typing import Any

from app.db.session import SessionLocal
from app.models.domain import CheckItem, Investigation, PatternFlag


def stored(inv: str) -> dict[str, Any]:
    with SessionLocal() as db:
        case = db.get(Investigation, inv)
        return {
            "flags": {f.id: (f.fingerprint, f.status, f.level, f.weight, f.first_seen_at, f.last_seen_at, f.gone_at)
                      for f in db.query(PatternFlag).filter_by(investigation_id=inv)},
            "checks": {c.id: (c.fingerprint, c.status, c.question, c.parties, c.first_seen_at, c.decided_at, c.gone_at)
                       for c in db.query(CheckItem).filter_by(investigation_id=inv)},
            "run": case.red_flag_run if case else None,
        }
