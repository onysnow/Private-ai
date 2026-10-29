"""Work the app does on its own, on a timer (docs/project-notes/PLATFORM_NEEDS_PLAN.md, part 2).

One tick a minute runs each registered task that is due. The schedule and each task's last run live in the app's
own database (``app_preferences``, scope ``server``, key ``tick:<name>``), so a restart neither forgets nor repeats
them, and only the heartbeat differs by mode: on PostgreSQL a Procrastinate periodic task (the queue makes sure each
minute is deferred once, however many workers run), on SQLite a loop in the app (app/jobs/runner.py). This is
Procrastinate's own "dynamic scheduling" pattern.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.time import utcnow_naive
from app.models.domain import Preference

logger = logging.getLogger("journalism.schedule")

TICK_SECONDS = 60


@dataclass(frozen=True)
class Scheduled:
    name: str
    every: timedelta
    run: Callable[[Session], object]


def _prune_outbound(db: Session) -> object:
    from app.services.outbound import prune

    return prune(db)


def _deliver_notifications(db: Session) -> object:
    from app.services.delivery import deliver_due

    return deliver_due(db)


def _check_sources(db: Session) -> object:
    from app.services.source_freshness import check_sources

    return check_sources(db)


def _follow(db: Session) -> object:
    from app.services.following import poll_due

    return poll_due(db)


TASKS: list[Scheduled] = [
    Scheduled("follow_sources", timedelta(minutes=1), _follow),
    Scheduled("deliver_notifications", timedelta(minutes=1), _deliver_notifications),
    Scheduled("check_sources", timedelta(hours=6), _check_sources),
    Scheduled("prune_outbound", timedelta(days=1), _prune_outbound),
]


def _last_run(db: Session, name: str) -> tuple[Preference | None, datetime | None]:
    row = db.scalar(select(Preference).where(Preference.scope == "server", Preference.subject == "", Preference.key == f"tick:{name}"))
    raw = (row.value or {}).get("at") if row else None
    try:
        return row, datetime.fromisoformat(raw) if raw else None
    except ValueError:
        return row, None


def _mark(db: Session, row: Preference | None, name: str, at: datetime, outcome: str) -> None:
    if row is None:
        row = Preference(scope="server", subject="", key=f"tick:{name}")
        db.add(row)
    row.value = {"at": at.isoformat(), "outcome": outcome}
    row.updated_at = at
    db.commit()


def scheduler_tick(factory: sessionmaker[Session], tasks: list[Scheduled] | None = None,
                   now: datetime | None = None) -> list[str]:
    """Run each due task once; returns the names that ran. A task that fails is logged and counts as run, so a
    broken task does not run every minute."""
    ran: list[str] = []
    for task in TASKS if tasks is None else tasks:
        at = now or utcnow_naive()
        with factory() as db:
            row, last = _last_run(db, task.name)
            if last is not None and at - last < task.every:
                continue
            outcome = "ok"
            try:
                task.run(db)
            except Exception:
                db.rollback()
                outcome = "failed"
                logger.warning("scheduled task %s failed", task.name, exc_info=True)
            row, _ = _last_run(db, task.name)
            _mark(db, row, task.name, at, outcome)
            ran.append(task.name)
    return ran
