"""Notifications outside the app: email, a phone through ntfy, and Web Push (docs/project-notes/PLATFORM_NEEDS_PLAN.md,
part 5). Off until each reporter turns a channel on (docs/discovery/indicators.md, 9 Oct).

What is sent is fixed text: the kind of alert and how many, never a name, a case or a word from the records
("A Textbook Red Flag in one of your cases. Open the Workbench to see it."). Each send is recorded in the log of what
leaves this computer, and in a ledger so nothing is sent twice on one channel. The scheduler (app/jobs/schedule.py)
calls deliver_due() every minute: interrupts go at once; the daily summary of Needs you goes once a day.

Email and ntfy go through Apprise (one URL per target); the server's mail account is NOTIFY_MAIL_URL, a TLS
`mailtos://` URL, and a reporter gives only their address. Web Push uses VAPID (pywebpush); the signing key is made
on first use and kept in NOTIFY_SECRETS_FILE, readable by the server's user only.
"""

from __future__ import annotations

import base64
import json
import logging
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlparse

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import AppUser, Investigation, InvestigationMembership, NotificationDelivery, PushSubscription
from app.services import preferences

logger = logging.getLogger("journalism.delivery")

CHANNELS = ("email", "phone", "webpush")
MODES = {"email": ("off", "interrupts", "daily"), "phone": ("off", "interrupts"), "webpush": ("off", "interrupts")}
APP_NAME = "Journalism Workbench"
SUBJECT = "Journalism Workbench"
# Dots are excluded from the labels so the pieces cannot overlap (no backtracking blow-up on long input).
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$")
NTFY_SCHEMES = ("ntfys", "ntfy")
DAILY_HOUR_UTC = 7


# --- What a person chose -----------------------------------------------------------------------------------------

def channel_prefs(db: Session, person: str) -> dict[str, Any]:
    stored = (row.value if (row := preferences._get(db, "person", person, "notifications")) else {}) or {}
    outside = stored.get("outside")
    raw: dict[str, Any] = outside if isinstance(outside, dict) else {}
    out: dict[str, Any] = {}
    for channel in CHANNELS:
        found = raw.get(channel)
        value: dict[str, Any] = found if isinstance(found, dict) else {}
        mode = value.get("mode") if value.get("mode") in MODES[channel] else "off"
        out[channel] = {"mode": mode, **({"address": value.get("address") or ""} if channel == "email" else {}),
                        **({"url": value.get("url") or ""} if channel == "phone" else {})}
    return out


def server_status() -> dict[str, Any]:
    """What this server can send, without saying how (no address or password leaves the server)."""
    mail_ok = _mail_url_ok(settings.notify_mail_url)
    push_ok = settings.notify_push_subject.startswith(("mailto:", "https://"))
    return {"email": mail_ok, "webpush": push_ok, "webpush_key": vapid_public_key() if push_ok else None}


def _mail_url_ok(url: str) -> bool:
    return urlparse((url or "").strip()).scheme == "mailtos"


def check_phone_url(url: str) -> str:
    """An ntfy address, as Apprise writes it: ntfys://host/topic (TLS), or ntfy://host/topic on a network you trust."""
    text = (url or "").strip()
    parsed = urlparse(text)
    if parsed.scheme not in NTFY_SCHEMES or not parsed.netloc:
        raise ValueError("Give an ntfy address such as ntfys://ntfy.sh/a-long-random-topic or ntfys://ntfy.your-newsroom.org/topic")
    if parsed.netloc in ("ntfy.sh",) and len(parsed.path.strip("/")) < 16:
        raise ValueError("On ntfy.sh anyone who guesses the topic can read it: use a long random topic (16 characters or more)")
    return text


def save_channel(db: Session, person: str, channel: str, *, mode: str, address: str | None = None, url: str | None = None) -> dict[str, Any]:
    if channel not in CHANNELS:
        raise ValueError(f"No channel is called {channel!r}")
    if mode not in MODES[channel]:
        raise ValueError(f"{channel} cannot be set to {mode!r}")
    value: dict[str, Any] = {"mode": mode}
    if channel == "email":
        addr = (address or "").strip()
        if mode != "off" and (len(addr) > 254 or not EMAIL_RE.match(addr)):
            raise ValueError("Give your email address first")
        if mode != "off" and not _mail_url_ok(settings.notify_mail_url):
            raise ValueError("This server has no mail account set up (NOTIFY_MAIL_URL in its environment file)")
        value["address"] = addr
    if channel == "phone":
        value["url"] = check_phone_url(url or "") if mode != "off" else (url or "").strip()
    if channel == "webpush" and mode != "off" and not server_status()["webpush"]:
        raise ValueError("This server has no Web Push contact set up (NOTIFY_PUSH_SUBJECT in its environment file)")
    row = preferences._get(db, "person", person, "notifications")
    stored = dict((row.value if row else {}) or {})
    outside = dict(stored.get("outside") or {})
    outside[channel] = value
    stored["outside"] = outside
    preferences._put(db, "person", person, "notifications", stored)
    return channel_prefs(db, person)


# --- Web Push keys and subscriptions ----------------------------------------------------------------------------

def _secrets() -> dict[str, str]:
    path = Path(settings.notify_secrets_file).expanduser()
    try:
        data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _vapid() -> Any:
    from py_vapid import Vapid01

    pem = _secrets().get("vapid_private_pem")
    if pem:
        return Vapid01.from_pem(pem.encode())
    from app.services.credentials import _write

    key = Vapid01()
    key.generate_keys()
    _write(settings.notify_secrets_file, {**_secrets(), "vapid_private_pem": key.private_pem().decode()})
    return key


def vapid_public_key() -> str:
    """The application server key a browser subscribes with (base64url, uncompressed P-256 point)."""
    from cryptography.hazmat.primitives import serialization

    raw = _vapid().public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def add_subscription(db: Session, person: str, endpoint: str, keys: dict[str, str], label: str | None) -> PushSubscription:
    if not endpoint.startswith("https://") or not keys.get("p256dh") or not keys.get("auth"):
        raise ValueError("Not a push subscription a browser makes")
    row = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    if row is None:
        row = PushSubscription(person=person, endpoint=endpoint, keys={"p256dh": keys["p256dh"], "auth": keys["auth"]}, label=label)
        db.add(row)
    else:
        row.person, row.keys, row.label, row.failures = person, {"p256dh": keys["p256dh"], "auth": keys["auth"]}, label, 0
    db.commit()
    return row


def remove_subscription(db: Session, person: str, endpoint: str) -> None:
    row = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint, PushSubscription.person == person))
    if row is not None:
        db.delete(row)
        db.commit()


# --- Sending ---------------------------------------------------------------------------------------------------

def _record(db: Session, kind: str, service: str, destination: str, outcome: str, detail: str | None = None) -> None:
    from app.services.outbound import record_outbound

    record_outbound(db, kind=kind, service=service, destination=destination, outcome=outcome, detail=detail,
                    sent="the kind of alert and how many; no names, cases or text from the records")


def _apprise_send(url: str, title: str, body: str) -> bool:
    import apprise

    asset = apprise.AppriseAsset(app_id=APP_NAME, app_desc=APP_NAME, app_url="")
    sender = apprise.Apprise(asset=asset)
    if not sender.add(url):
        raise ValueError("Apprise could not read that address")
    return bool(sender.notify(title=title, body=body))


def send_email(db: Session, address: str, title: str, body: str) -> bool:
    base = settings.notify_mail_url.strip()
    if not _mail_url_ok(base):
        raise ValueError("This server has no mail account set up")
    joiner = "&" if "?" in base else "?"
    url = f"{base}{joiner}{urlencode({'to': address})}"
    host = urlparse(base).hostname or "mail"
    try:
        ok = _apprise_send(url, title, body)
    except Exception as exc:
        _record(db, "mail", "email", host, "failed", str(exc))
        raise
    _record(db, "mail", "email", host, "sent" if ok else "failed")
    return ok


def send_phone(db: Session, url: str, title: str, body: str) -> bool:
    host = urlparse(url).hostname or "ntfy"
    try:
        ok = _apprise_send(url, title, body)
    except Exception as exc:
        _record(db, "push", "ntfy", host, "failed", str(exc))
        raise
    _record(db, "push", "ntfy", host, "sent" if ok else "failed")
    return ok


def send_webpush(db: Session, person: str, title: str, body: str) -> int:
    """To every browser the person registered; a subscription the push service says is gone is dropped."""
    from pywebpush import WebPushException, webpush

    sent = 0
    for sub in db.scalars(select(PushSubscription).where(PushSubscription.person == person)):
        host = urlparse(sub.endpoint).hostname or "push"
        try:
            webpush(subscription_info={"endpoint": sub.endpoint, "keys": sub.keys}, data=json.dumps({"title": title, "body": body}),
                    vapid_private_key=_vapid(), vapid_claims={"sub": settings.notify_push_subject}, ttl=86400)
            _record(db, "push", "web push", host, "sent")
            sent += 1
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            _record(db, "push", "web push", host, "failed", f"{status or ''} {exc}".strip())
            if status in (404, 410):
                db.delete(sub)
            else:
                sub.failures += 1
            db.commit()
    return sent


def send(db: Session, person: str, channel: str, title: str, body: str) -> bool:
    prefs = channel_prefs(db, person)[channel]
    if channel == "email":
        return send_email(db, prefs["address"], title, body)
    if channel == "phone":
        return send_phone(db, prefs["url"], title, body)
    return send_webpush(db, person, title, body) > 0


# --- What is due -------------------------------------------------------------------------------------------------

def _people(db: Session) -> list[str]:
    rows = db.scalars(select(preferences.Preference).where(preferences.Preference.scope == "person",
                                                           preferences.Preference.key == "notifications"))
    return [r.subject for r in rows if any(v["mode"] != "off" for v in channel_prefs(db, r.subject).values())]


def cases_for(db: Session, person: str) -> list[str]:
    """The cases a person may see: every case for the computer's owner, their memberships for a persisted user."""
    if db.get(AppUser, person) is not None:
        return [m.investigation_id for m in db.scalars(select(InvestigationMembership).where(InvestigationMembership.user_id == person))]
    if person == "shared-bearer":
        from app.core.authorization import configured_remote_investigation_ids

        allowed = configured_remote_investigation_ids()
        if allowed is not None:
            return sorted(allowed)
    return [i for i in db.scalars(select(Investigation.id).where(Investigation.is_demo.is_(False)))]


def _claim(db: Session, person: str, channel: str, key: str) -> bool:
    """Take the ledger line for this send; False when it was already sent."""
    try:
        db.add(NotificationDelivery(person=person, channel=channel, row_key=key))
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def _count_words(counts: dict[str, int]) -> str:
    labels = {k["key"]: k["label"] for k in preferences.NOTIFICATION_KINDS}
    return ", ".join(f"{n} × {labels.get(k, k)}" for k, n in sorted(counts.items(), key=lambda kv: -kv[1]))


def _delivered(db: Session, person: str, channel: str, key: str) -> bool:
    return db.scalar(select(NotificationDelivery.id).where(NotificationDelivery.person == person, NotificationDelivery.channel == channel,
                                                           NotificationDelivery.row_key == key)) is not None


def deliver_due(db: Session, now: datetime | None = None) -> dict[str, int]:
    """Send what is due on each channel a person turned on: each interrupt once (only the new Textbook Red Flags
    are read for this, every minute), and the daily summary of Needs you once a day (the whole inbox, read then)."""
    from app.services.notifications import _flag_rows, inbox

    now = now or utcnow_naive()
    sent = {"interrupts": 0, "summaries": 0}
    for person in _people(db):
        chans = {c: p for c, p in channel_prefs(db, person).items() if p["mode"] != "off"}
        cases = cases_for(db, person)
        interrupts = preferences.notification_prefs(db, person)["routes"].get("flag_textbook") == "interrupt"
        rows: list[dict[str, Any]] = []
        if interrupts:
            for inv in cases:
                rows += [r for r in _flag_rows(db, inv, now - timedelta(days=2)) if r["kind"] == "flag_textbook"]
        today = f"daily:{now:%Y-%m-%d}"
        summary_for = [c for c, p in chans.items() if p["mode"] == "daily" and now.hour >= DAILY_HOUR_UTC
                       and not _delivered(db, person, c, today)]
        needs: dict[str, int] = {}
        if summary_for:
            for inv in cases:
                for r in inbox(db, inv, person, sees_security=False)["needs"]:
                    needs[r["kind"]] = needs.get(r["kind"], 0) + 1
        for channel in chans:
            new = [r for r in rows if _claim(db, person, channel, r["key"])]
            if new:
                n = len(new)
                body = (f"{n} Textbook Red Flags in your cases." if n > 1 else "A Textbook Red Flag in one of your cases.") + \
                    " Open the Workbench to see it."
                try:
                    send(db, person, channel, SUBJECT, body)
                    sent["interrupts"] += 1
                except Exception:
                    logger.warning("could not send an interrupt by %s", channel, exc_info=True)
            if channel in summary_for and needs and _claim(db, person, channel, today):
                try:
                    send(db, person, channel, SUBJECT, f"Waiting for you: {_count_words(needs)}. Open the Workbench to see them.")
                    sent["summaries"] += 1
                except Exception:
                    logger.warning("could not send the daily summary by %s", channel, exc_info=True)
    return sent


def send_test(db: Session, person: str, channel: str) -> bool:
    """A test message on one channel, so a reporter sees it arrive before relying on it."""
    if channel_prefs(db, person)[channel]["mode"] == "off":
        raise ValueError("Turn the channel on first")
    return send(db, person, channel, SUBJECT, "A test from the Workbench. Alerts will look like this: the kind only, never names.")
