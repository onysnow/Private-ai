"""Following newsletters through a mailbox (source intake research: "Newsletters via a dedicated mailbox into the `.eml`
path"; DECISIONS_LOG 11). A reporter subscribes with a dedicated address, never their own, and follows one sender in
that mailbox: the app reads the mailbox over IMAP with TLS (Python's own imaplib), never marks a message read, keeps
each new message from that sender as it came (.eml) and puts it in the queue. A person captures it: the .eml becomes
a document of the case and goes through the ordinary email reader, which reads text and never loads remote images,
so a tracking pixel learns nothing.

The password is kept in its own file beside the connector keys (mode 600), never in the database or a backup, and is
removed when the mailbox is no longer followed. Each check is a line in the outbound log.
"""

from __future__ import annotations

import email
import email.policy
import imaplib
import re
import ssl
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.following import Monitor, MonitorItem
from app.models.investigations import Investigation

PORT = 993
TIMEOUT_S = 30.0
NEW_PER_CHECK = 50
MAX_MESSAGE_BYTES = 25 * 1024 * 1024
SENDER = re.compile(r"^(?:[^@\s<>\"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|@[A-Za-z0-9.-]+\.[A-Za-z]{2,})$")
HOST = re.compile(r"^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


class MailboxRefused(ValueError):
    """The mailbox cannot be followed as asked, said in words."""


def _secrets() -> Path:
    return Path(settings.connector_credentials_file).expanduser().resolve().with_name("mailboxes.json")


def _read() -> dict[str, str]:
    """The mailbox passwords, by monitor id (the connector store's own reader keeps only connector names)."""
    import json

    try:
        data = json.loads(_secrets().read_text(encoding="utf-8")) if _secrets().exists() else {}
    except (OSError, json.JSONDecodeError):
        return {}
    return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, str)} if isinstance(data, dict) else {}


def _set_password(monitor_id: str, password: str) -> None:
    from app.services.credentials import _write

    values = _read()
    values[monitor_id] = password
    _write(_secrets(), values)


def _password(monitor_id: str) -> str:
    return _read().get(monitor_id, "")


def forget(db: Session, monitor: Monitor) -> None:
    """Stop following: the password goes, and so do the kept messages nobody captured."""
    from app.services.credentials import _write

    values = _read()
    if values.pop(monitor.id, None) is not None:
        if values:
            _write(_secrets(), values)
        else:
            _secrets().unlink(missing_ok=True)
    folder = _folder(monitor)
    for item in db.scalars(select(MonitorItem).where(MonitorItem.monitor_id == monitor.id, MonitorItem.state != "captured")):
        kept = (item.extra or {}).get("eml")
        if kept:
            (folder / Path(kept).name).unlink(missing_ok=True)


def _folder(monitor: Monitor) -> Path:
    return Path(settings.document_storage_dir).expanduser().resolve() / monitor.investigation_id / "following" / monitor.id


def address(user: str, host: str, port: int, sender: str) -> str:
    return f"imaps://{quote(user, safe='')}@{host}:{port}/INBOX?from={quote(sender, safe='@')}"


def parts(url: str) -> tuple[str, str, int, str]:
    split = urlsplit(url)
    return unquote(split.username or ""), split.hostname or "", split.port or PORT, parse_qs(split.query).get("from", [""])[0]


def follow(db: Session, investigation_id: str, *, host: str, user: str, password: str, sender: str, port: int = PORT,
           every_minutes: int = 60, actor: str | None = None) -> Monitor:
    from app.services.following import EVERY_MINUTES

    if db.get(Investigation, investigation_id) is None:
        raise LookupError("Investigation not found")
    host, user, sender = host.strip().lower(), user.strip(), sender.strip().lower()
    if not HOST.match(host):
        raise MailboxRefused("The mail server is a name such as imap.example.org")
    if not user or not password:
        raise MailboxRefused("Give the mailbox's user name and password")
    if not SENDER.match(sender):
        raise MailboxRefused("Follow one sender: an address (news@example.org) or everything from a domain (@example.org)")
    url = address(user, host, port, sender)
    if db.scalar(select(Monitor.id).where(Monitor.investigation_id == investigation_id, Monitor.url == url)):
        raise MailboxRefused("This case already follows that sender in that mailbox")
    monitor = Monitor(investigation_id=investigation_id, kind="mailbox", platform="email", url=url,
                      name=f"Newsletters from {sender}"[:500], every_minutes=every_minutes if every_minutes in EVERY_MINUTES else 60,
                      route="direct", created_by=actor, health="unchecked", next_check_at=utcnow_naive())
    db.add(monitor)
    db.commit()
    _set_password(monitor.id, password)
    check(db, monitor)
    return monitor


def _plain(message: email.message.EmailMessage) -> str:
    """The message's own plain text, or its HTML with the tags taken out; never anything fetched."""
    body = message.get_body(preferencelist=("plain", "html"))
    if body is None:
        return ""
    text = body.get_content() if body.get_content_maintype() == "text" else ""
    if body.get_content_subtype() == "html":
        text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text, flags=re.S | re.I)
        text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _when(value: str | None) -> datetime | None:
    try:
        when = parsedate_to_datetime(value) if value else None
    except (TypeError, ValueError):
        return None
    if when is None:
        return None
    return when.astimezone(timezone.utc).replace(tzinfo=None) if when.tzinfo else when


def _connect(host: str, port: int) -> imaplib.IMAP4_SSL:
    return imaplib.IMAP4_SSL(host, port, ssl_context=ssl.create_default_context(), timeout=TIMEOUT_S)


def check(db: Session, monitor: Monitor, *, now: datetime | None = None) -> Monitor:
    """Ask the mailbox once for new messages from the sender (read-only: nothing is marked read) and queue them.
    Never raises for the mailbox's own failures: the monitor's health says what happened."""
    from app.services.following import _log, _schedule
    from app.services.outbound import mark_outbound_failed

    now = now or utcnow_naive()
    user, host, port, sender = parts(monitor.url)
    monitor.last_checked_at = now
    request_id = _log(db, monitor, f"IMAP (new mail from {sender}?)", f"imaps://{host}:{port}/INBOX")
    try:
        client = _connect(host, port)
        try:
            client.login(user, _password(monitor.id))
            client.select("INBOX", readonly=True)
            validity = str((client.response("UIDVALIDITY")[1] or [b""])[0] or b"", "ascii", "replace")
            last = int(monitor.etag or 0) if monitor.last_modified == validity else 0
            field = ("FROM", sender.lstrip("@")) if sender.startswith("@") else ("FROM", sender)
            _status, found = client.uid("SEARCH", f'UID {last + 1}:*', field[0], f'"{field[1]}"')
            uids = sorted(int(u) for u in (found[0] or b"").split() if int(u) > last)
            fresh = 0
            for uid in uids[:NEW_PER_CHECK]:
                _status, data = client.uid("FETCH", str(uid), "(BODY.PEEK[])")
                raw = next((part[1] for part in data if isinstance(part, tuple)), b"")
                if not raw or len(raw) > MAX_MESSAGE_BYTES:
                    continue
                fresh += _keep(db, monitor, uid, raw, now)
                last = max(last, uid)
            monitor.etag, monitor.last_modified = str(last), validity
        finally:
            try:
                client.logout()
            except (imaplib.IMAP4.error, OSError):
                pass
    except imaplib.IMAP4.error as exc:
        mark_outbound_failed(db, request_id)
        refused = "authenticat" in str(exc).lower() or "login" in str(exc).lower() or "credential" in str(exc).lower()
        monitor.health = "broken"
        monitor.health_detail = "the mailbox refused the user name or password" if refused else "the mail server refused the request"
        monitor.checks = [{"state": "bad", "text": f"Not read: {monitor.health_detail}"}]
        _schedule(monitor, now)
        db.commit()
        return monitor
    except (OSError, ssl.SSLError) as exc:
        from app.services.following import reason_of

        mark_outbound_failed(db, request_id)
        monitor.health, monitor.health_detail = "broken", f"could not be read: {reason_of(exc)}"
        monitor.checks = [{"state": "bad", "text": f"Not read: {reason_of(exc)}"}]
        _schedule(monitor, now)
        db.commit()
        return monitor
    monitor.health, monitor.health_detail, monitor.last_ok_at = "works", None, now
    monitor.checks = [{"state": "ok", "text": "Mailbox read over TLS, nothing marked read"},
                      {"state": "ok", "text": f"{fresh} new from {sender}" if fresh else f"Nothing new from {sender}"}]
    _schedule(monitor, now)
    db.commit()
    return monitor


def _keep(db: Session, monitor: Monitor, uid: int, raw: bytes, now: datetime) -> int:
    key = f"uid:{monitor.last_modified or ''}:{uid}"
    if db.scalar(select(MonitorItem.id).where(MonitorItem.monitor_id == monitor.id, MonitorItem.key == key)):
        return 0
    message = email.message_from_bytes(raw, policy=email.policy.default)
    folder = _folder(monitor)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{uid}.eml"
    path.write_bytes(raw)
    text = _plain(message)
    db.add(MonitorItem(investigation_id=monitor.investigation_id, monitor_id=monitor.id, key=key, url=None,
                       title=str(message.get("subject") or "(no subject)")[:1000], summary=text[:600],
                       published_at=_when(message.get("date")), first_seen_at=now, last_seen_at=now,
                       extra={"eml": path.name, "from": str(message.get("from") or ""), "message_id": str(message.get("message-id") or ""),
                              "bytes": len(raw)}))
    return 1


def capture(db: Session, item: MonitorItem, actor: str | None) -> str:
    """The kept message becomes a document of the case, as it came; the email reader reads it. Returns its id."""
    from app.services.documents import store_document

    monitor = db.get(Monitor, item.monitor_id)
    if monitor is None:
        raise LookupError("Monitor not found")
    kept = _folder(monitor) / Path(str((item.extra or {}).get("eml") or "")).name
    if not kept.is_file():
        raise MailboxRefused("The kept message is missing from this computer")
    title = item.title or "newsletter"
    slug = re.sub(r"[^A-Za-z0-9]+", "-", title).strip("-")[:60] or "newsletter"
    _user, host, _port, sender = parts(monitor.url)
    doc = store_document(db, investigation_id=item.investigation_id, title=title, filename=f"{slug}.eml", mime_type="message/rfc822",
                         data=kept.read_bytes(), storage_dir=Path(settings.document_storage_dir),
                         source_metadata={"followed_from": f"mailbox {host}, sender {sender}", "message_id": (item.extra or {}).get("message_id"),
                                          "collected_by": actor, "route": "Following, mailbox"})
    item.document_id = doc.id
    kept.unlink(missing_ok=True)
    return doc.id


def serialize_extra(monitor: Monitor) -> dict[str, Any]:
    user, host, port, sender = parts(monitor.url)
    return {"mailbox": {"user": user, "host": host, "port": port, "sender": sender}}
