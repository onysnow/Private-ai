"""The inbox behind the bell (mockup HOME_2, research §8): everything the case has to tell one person, each row sent
where that person chose for its kind (Settings › Notifications): the top band (interrupt, Textbook only), Needs you,
Everything else, or nowhere. Built on read from the records' own tables; nothing is stored here but the person's
routes, so a row goes away when what it is about is dealt with.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.reasoning import ai_reasoning_status
from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import BackgroundJob, Claim, Document, Entity, IngestionBatch, Investigation, PatternFlag
from app.patterns.engine import indicator
from app.services import preferences, watches
from app.services.case_home import decisions

WEEK = timedelta(days=7)

# The Decide queue's kinds, as the kinds a person routes.
DECISION_KIND = {"to_check": "to_check", "missing": "to_check", "proposal": "proposal", "match": "outside",
                 "outside": "outside", "ai": "ai", "watchlist": "watchlist"}


def _row(key: str, kind: str, title: str, reason: str, href: str, created_at: datetime | None, *, level: str | None = None,
         actor: str = "", actor_kind: str = "app") -> dict[str, Any]:
    return {"key": key, "kind": kind, "title": title, "reason": reason, "href": href, "created_at": created_at,
            "level": level, "actor": actor, "actor_kind": actor_kind}


def _decision_rows(db: Session, investigation_id: str) -> list[dict[str, Any]]:
    out = []
    for item in decisions(db, investigation_id, limit=500)["items"]:
        kind = DECISION_KIND.get(item["kind"])
        if kind is None:
            continue
        out.append(_row(f"d:{item['kind']}:{item['id']}", kind, item["question"], item.get("actor") or "",
                        f"/decide?kind={item['kind']}", item.get("created_at"), level=item.get("level"),
                        actor=item.get("actor") or "", actor_kind=item.get("actor_kind") or "app"))
    return out


def _flag_rows(db: Session, investigation_id: str, after: datetime) -> list[dict[str, Any]]:
    flags = list(db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id, PatternFlag.first_seen_at > after,
                                                      PatternFlag.gone_at.is_(None), PatternFlag.status == "open")))
    ids = {p for f in flags for p in (f.parties or [])[:3]}
    names = dict(db.execute(select(Entity.id, Entity.caption).where(Entity.id.in_(ids))).all()) if ids else {}
    out = []
    for f in flags:
        found = indicator(f.indicator_id)
        name = found[0].name if found else f.indicator_id
        parties = ", ".join(names[p] for p in (f.parties or [])[:3] if p in names)
        out.append(_row(f"f:{f.id}", f"flag_{f.level}", f"{f.level.capitalize()} Red Flag: {name}", parties,
                        "/act#red-flags", f.first_seen_at, level=f.level, actor="Red Flags"))
    return out


def _documents_since(db: Session, investigation_id: str, after: datetime) -> int:
    return int(db.scalar(select(func.count()).select_from(Document).where(
        Document.investigation_id == investigation_id, Document.created_at > after, Document.parent_document_id.is_(None))) or 0)


def research_due(db: Session, investigation_id: str) -> dict[str, Any] | None:
    """Ask first: documents came in since this case's last AI run, so it may be worth running again. Only for a case
    that has had a run (a case that never ran is not nagged) and only while the AI is set up."""
    from app.services.saved_questions import case_research_mode

    if case_research_mode(db, investigation_id)[0] != "ask" or not ai_reasoning_status(settings).get("enabled"):
        return None
    last = db.scalar(select(func.max(BackgroundJob.finished_at)).where(
        BackgroundJob.investigation_id == investigation_id, BackgroundJob.kind == "ai_reasoning", BackgroundJob.status == "succeeded"))
    if last is None:
        return None
    n = _documents_since(db, investigation_id, last)
    return {"documents": n, "last_run_at": last} if n else None


def _import_rows(db: Session, investigation_id: str, after: datetime) -> list[dict[str, Any]]:
    from app.services.ingestion_batches import batch_summary

    out = []
    for batch in db.scalars(select(IngestionBatch).where(IngestionBatch.investigation_id == investigation_id,
                                                         IngestionBatch.finished_at > after)):
        n = batch_summary(db, batch)
        problems = f" · {n['problems']} need{'s' if n['problems'] == 1 else ''} you" if n["problems"] else ""
        out.append(_row(f"i:{batch.id}:{batch.finished_at:%Y%m%d%H%M%S}", "import",
                        f"{n['files']} file{'s' if n['files'] != 1 else ''} read{problems}", batch.label or "",
                        "/bring-in#the-drop", batch.finished_at, actor="The Drop"))
    return out


def backup_due(db: Session, investigation_id: str, days: int, now: datetime) -> dict[str, Any] | None:
    """The case changed since its last full backup, and that backup (or the case's start, if never) is older than
    ``days``. Counted from the records' own times: documents, claims and parties added since."""
    if not days:
        return None
    inv = db.get(Investigation, investigation_id)
    if inv is None:
        return None
    # Only a backup that carried the documents counts as a full one.
    last = inv.last_backup if (inv.last_backup or {}).get("documents_included") else None
    backed_up = datetime.fromisoformat(str(last["at"]).replace("Z", "+00:00")).replace(tzinfo=None) if last else None
    since = backed_up or inv.created_at
    if now - since < timedelta(days=days):
        return None
    changed = sum(int(db.scalar(select(func.count()).select_from(model).where(model.investigation_id == investigation_id,
                                                                             model.created_at > since)) or 0)
                  for model in (Document, Claim, Entity))
    if not changed:
        return None
    return {"since": since, "changed": changed, "never": backed_up is None, "days": (now - since).days}


def _source_rows(db: Session, after: datetime) -> list[dict[str, Any]]:
    from app.services.source_freshness import recent_changes

    return [_row(f"src:{c['source']}:{c['version']}", "source", f"{c['label']} updated its data",
                 "Names already looked up there are checked again where the case allows it.", "/settings#lookups",
                 c["at"], actor=c["label"], actor_kind="connector")
            for c in recent_changes(db, after)]


def inbox(db: Session, investigation_id: str, person: str, *, sees_security: bool) -> dict[str, Any]:
    now = utcnow_naive()
    week_ago = now - WEEK
    prefs = preferences.notification_prefs(db, person)
    rows = _decision_rows(db, investigation_id) + _flag_rows(db, investigation_id, week_ago)
    docs = _documents_since(db, investigation_id, week_ago)
    if docs:
        rows.append(_row(f"c:documents:{docs}", "documents", f"{docs} document{'s' if docs != 1 else ''} added this week", "",
                         "/bring-in#document-ingestion", now, actor_kind="person"))
    for w in watches.listing(db, person, investigation_id):
        if w["changed"]:
            rows.append(_row(f"w:{w['id']}:{w['value']}", "watch", w["label"], f"{w['baseline_words']} → {w['value_words']}",
                             "/act#red-flags" if w["record_type"] == "red_flag" else "/check#claim-verification", now,
                             actor="You watch this"))
    rows += _import_rows(db, investigation_id, week_ago) + _source_rows(db, week_ago)
    backup = backup_due(db, investigation_id, prefs["backup_days"], now)
    if backup:
        when = "never backed up" if backup["never"] else f"not backed up for {backup['days']} days"
        rows.append(_row(f"b:{investigation_id}:{now:%Y%m%d}", "backup", f"This case was {when}",
                         f"{backup['changed']} record{'s' if backup['changed'] != 1 else ''} added since. Backups: Keep › Backup.",
                         "/keep#backup-restore", now))
    due = research_due(db, investigation_id)
    if due:
        n = due["documents"]
        rows.append(_row(f"r:{n}", "research", f"{n} document{'s' if n != 1 else ''} added since the last AI run",
                         "Run it again? Nothing runs until you say so.", "/act#ai-reasoning-panel", now, actor_kind="ai"))
    if sees_security:
        from app.services.settings import security_alerts

        denied = int(security_alerts(window_hours=24.0, max_examples=0).get("total_denials") or 0)
        if denied:
            rows.append(_row(f"s:{now:%Y-%m-%d}", "security", f"{denied} request{'s' if denied != 1 else ''} refused in 24 hours", "",
                             "/settings#log", now))
    week: dict[str, int] = {k["key"]: 0 for k in preferences.NOTIFICATION_KINDS}
    for r in rows:
        if r["created_at"] is None or r["created_at"] > week_ago:
            week[r["kind"]] += 1
    routed: dict[str, list[dict[str, Any]]] = {"interrupt": [], "needs": [], "else": []}
    for r in rows:
        route = prefs["routes"][r["kind"]]
        r["route"] = route
        if route == "off":
            continue
        if route == "interrupt":
            routed["interrupt"].append(r)
            route = "needs"
        routed[route].append(r)
    order = {k["key"]: n for n, k in enumerate(preferences.NOTIFICATION_KINDS)}
    for bucket in routed.values():
        bucket.sort(key=lambda r: order[r["kind"]])
    return {"investigation_id": investigation_id, **routed, "week": week,
            "quiet_while_reading": prefs["quiet_while_reading"], "desktop": prefs["desktop"]}
