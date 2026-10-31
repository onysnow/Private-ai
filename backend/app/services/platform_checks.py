"""Does it work today? (mockup WORKS_1; DECISIONS call 5; DECISIONS_LOG 5)

Platforms change their pages without notice and the tools that save from them break. Each platform the app saves from
is tried on one public test item, through the same tool and route a real save uses: yt-dlp for video and audio, the
capture browser for a post page, the open-protocol reader for Telegram, Bluesky and Mastodon. Each try is a row kept
per platform (`platform_checks`), so the screen shows today and the last fourteen days, and a pasted link can be warned
about when its platform is broken.

Off by default: turned on, it runs once a day (the scheduler); "Check all now" runs it when a person asks. Each request
goes in the outbound log; nothing about any case is sent. Test items ship with the app and a person can change any.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.platform_check import PlatformCheck
from app.models.preferences import Preference

KEY = "platform_checks"
DAYS = 14


@dataclass(frozen=True)
class Platform:
    key: str
    name: str
    how: str  # yt-dlp | page | telegram | bluesky | mastodon
    test_url: str
    saves: str  # what a good save holds, in words
    hosts: tuple[str, ...]
    route: str  # as shown under the name


# Each test item is a public post or account of the platform itself or a long-lived one, chosen because it does not change.
PLATFORMS: tuple[Platform, ...] = (
    Platform("youtube", "YouTube", "yt-dlp", "https://www.youtube.com/watch?v=jNQXAC9IVRw", "video, title, channel",
             ("youtube.com", "youtu.be"), "video · yt-dlp"),
    Platform("instagram", "Instagram", "page", "https://www.instagram.com/instagram/", "the post's picture and caption",
             ("instagram.com",), "post · page capture"),
    Platform("x", "X", "page", "https://x.com/jack/status/20", "the post's text and picture",
             ("x.com", "twitter.com"), "post · page capture"),
    Platform("tiktok", "TikTok", "yt-dlp", "https://www.tiktok.com/@scout2015/video/6718335390845095173", "video, caption, account",
             ("tiktok.com",), "video · yt-dlp"),
    Platform("facebook", "Facebook", "page", "https://www.facebook.com/facebook", "the page's text and picture",
             ("facebook.com", "fb.com"), "public page post · page capture"),
    Platform("telegram", "Telegram", "telegram", "https://t.me/s/telegram", "latest posts, forwards, edits",
             ("t.me", "telegram.me"), "public channel · web preview"),
    Platform("bluesky", "Bluesky", "bluesky", "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=bsky.app&limit=5",
             "posts, deletions", ("bsky.app",), "public API"),
    Platform("mastodon", "Mastodon", "mastodon", "https://mastodon.social/@Mastodon.rss", "posts", (), "account RSS"),
    Platform("vimeo", "Vimeo", "yt-dlp", "https://vimeo.com/76979871", "video, title", ("vimeo.com",), "video · yt-dlp"),
    Platform("soundcloud", "SoundCloud", "yt-dlp", "https://soundcloud.com/forss/flickermood", "audio, title",
             ("soundcloud.com",), "audio · yt-dlp"),
)
BY_KEY = {p.key: p for p in PLATFORMS}


# --- Settings (server-wide: the platforms are the same for every case) -------------------------------------------------

def _setting_row(db: Session) -> Preference | None:
    return db.scalar(select(Preference).where(Preference.scope == "server", Preference.subject == "", Preference.key == KEY))


def setting(db: Session) -> dict[str, Any]:
    value = dict((row.value or {}) if (row := _setting_row(db)) else {})
    return {"daily": bool(value.get("daily", False)), "warn": bool(value.get("warn", True)), "items": dict(value.get("items") or {})}


def change(db: Session, *, daily: bool | None = None, warn: bool | None = None, items: dict[str, str | None] | None = None) -> dict[str, Any]:
    from app.services.web_capture import check_address

    now = setting(db)
    if daily is not None:
        now["daily"] = daily
    if warn is not None:
        now["warn"] = warn
    for key, url in (items or {}).items():
        if key not in BY_KEY:
            raise ValueError(f"No platform called {key}")
        if url:
            check_address(url)
            now["items"][key] = url
        else:
            now["items"].pop(key, None)  # back to the item the app ships with
    row = _setting_row(db)
    if row is None:
        row = Preference(scope="server", subject="", key=KEY)
        db.add(row)
    row.value = now
    row.updated_at = utcnow_naive()
    db.commit()
    return now


def test_url(db: Session, platform: Platform) -> str:
    return setting(db)["items"].get(platform.key) or platform.test_url


# --- Trying one platform -----------------------------------------------------------------------------------------------

@dataclass
class Result:
    state: str  # works | partly | broken
    detail: str
    missing: list[str]


def _ytdlp(url: str) -> Result:
    import yt_dlp

    from app.services.media_links import _Quiet, _reason
    from app.services.web_capture import _Guard

    with _Guard(settings.max_media_bytes) as guard:
        options = {"noplaylist": True, "playlist_items": "1", "format": "b", "proxy": guard.url, "socket_timeout": 30,
                   "retries": 1, "quiet": True, "no_warnings": True, "noprogress": True, "logger": _Quiet(), "cachedir": False}
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(url, download=False) or {}
        except yt_dlp.utils.DownloadError as exc:
            reason = _reason(str(exc), guard.refused, guard.over)
            if "separate picture and sound" in reason:
                return Result("partly", reason, ["a single file"])
            return Result("broken", reason, ["the video or audio"])
    if info.get("_type") == "playlist":
        info = (info.get("entries") or [{}])[0] or {}
    missing = [w for w, ok in (("the title", info.get("title")), ("the account", info.get("uploader") or info.get("channel")),
                               ("the video or audio", info.get("url") or info.get("requested_formats") or info.get("formats"))) if not ok]
    if "the video or audio" in missing:
        return Result("broken", "No video or audio was offered", missing)
    return Result("partly" if missing else "works", "Saved as expected" if not missing else f"Saved without {', '.join(missing)}", missing)


LOGIN_WORDS = ("log in", "sign in", "login", "anmelden", "connexion")


def _page(url: str) -> Result:
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import sync_playwright

    from app.services.web_capture import QUIET_BROWSER, _Guard

    with _Guard(settings.max_media_bytes) as guard, sync_playwright() as p:
        try:
            browser = p.chromium.launch(executable_path=settings.capture_browser_path or None, proxy={"server": guard.url, "bypass": "<-loopback>"},
                                        args=QUIET_BROWSER)
        except PlaywrightError:
            return Result("broken", "The capture browser is not installed on this computer", ["everything"])
        try:
            page = browser.new_context(service_workers="block", accept_downloads=False).new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=int(settings.capture_timeout_seconds * 1000))
            page.wait_for_timeout(1500)
            final = page.url
            meta = page.evaluate("""() => { const m = n => document.querySelector(`meta[property="${n}"]`)?.content || '';
                return {title: m('og:title'), image: m('og:image'), text: document.body ? document.body.innerText.slice(0, 3000) : ''}; }""")
        except PlaywrightError as exc:
            return Result("broken", f"The page did not load ({str(exc).splitlines()[0][:120]})", ["everything"])
        finally:
            browser.close()
    path = urlsplit(final).path.lower()
    walled = any(w in path for w in ("/login", "/accounts/login", "/i/flow/login", "checkpoint")) or (
        not meta.get("title") and any(w in (meta.get("text") or "").lower()[:400] for w in LOGIN_WORDS))
    if walled:
        return Result("broken", "A login wall came back instead of the post", ["the post"])
    missing = [w for w, ok in (("the text", meta.get("title")), ("the picture", meta.get("image"))) if not ok]
    if len(missing) == 2:
        return Result("broken", "The page showed nothing of the post", missing)
    return Result("partly" if missing else "works", "Saved as expected" if not missing else f"Saved without {', '.join(missing)}", missing)


def _open(platform: Platform, url: str) -> Result:
    from app.services import following

    try:
        got = following.fetch(url, accept="application/json" if platform.how == "bluesky" else "text/html" if platform.how == "telegram" else "*/*")
    except OSError as exc:
        return Result("broken", f"Not read: {following.reason_of(exc)}", ["everything"])
    if got.status != 200:
        return Result("broken", f"Answered {got.status}", ["everything"])
    try:
        if platform.how == "telegram":
            entries = following.read_telegram(got.body)
        elif platform.how == "bluesky":
            entries = following.read_bluesky(got.body, "bsky.app")
        else:
            entries, _about = following.read_feed(got.body)
    except (ValueError, OSError):
        return Result("broken", "What came back could not be read", ["the posts"])
    return Result("works", f"Read {len(entries)} latest posts", []) if entries else Result("partly", "Read, but no posts in it", ["the posts"])


def check(db: Session, key: str, *, actor: str = "automatic") -> PlatformCheck:
    from app.services.outbound import mark_outbound_failed, record_platform_request

    platform = BY_KEY[key]
    url = test_url(db, platform)
    # In the log before the visit (ADR-0015), so a visit that hangs or crashes is still there.
    request_id = record_platform_request(
        db, kind="web address", service=f"{platform.name} (works today?)", destination=urlsplit(url).hostname or url, sent=url,
        detail=f"Does it work today? A public test item, logged out ({'you asked' if actor != 'automatic' else 'daily check'})")
    started = time.monotonic()
    try:
        result = _ytdlp(url) if platform.how == "yt-dlp" else _page(url) if platform.how == "page" else _open(platform, url)
    except Exception as exc:  # one platform's tool failing says so; it never stops the others
        result = Result("broken", f"The check failed ({type(exc).__name__})", ["everything"])
    seconds = round(time.monotonic() - started, 1)
    if result.state == "broken":
        mark_outbound_failed(db, request_id)
    row = PlatformCheck(platform=key, test_url=url, state=result.state, detail=result.detail[:500], missing=result.missing,
                        seconds=seconds, tool=platform.route, checked_at=utcnow_naive())
    db.add(row)
    db.commit()
    return row


def check_all(db: Session, *, actor: str = "automatic", report: Any = None) -> int:
    for n, platform in enumerate(PLATFORMS):
        if report:
            report(int(100 * n / len(PLATFORMS)), f"Trying {platform.name}")
        check(db, platform.key, actor=actor)
    return len(PLATFORMS)


def daily(db: Session) -> object:
    """The scheduler's daily run: only when a person turned it on."""
    return check_all(db) if setting(db)["daily"] else 0


# --- What the screen shows --------------------------------------------------------------------------------------------

def overview(db: Session, *, now: datetime | None = None) -> dict[str, Any]:
    now = now or utcnow_naive()
    since = now - timedelta(days=DAYS)
    rows = list(db.scalars(select(PlatformCheck).where(PlatformCheck.checked_at >= since).order_by(PlatformCheck.checked_at)))
    out = []
    for platform in PLATFORMS:
        mine = [r for r in rows if r.platform == platform.key]
        by_day: dict[str, str] = {}
        for r in mine:
            by_day[r.checked_at.date().isoformat()] = r.state  # the day's last try
        days = [{"day": (now.date() - timedelta(days=DAYS - 1 - i)).isoformat(), "state": by_day.get((now.date() - timedelta(days=DAYS - 1 - i)).isoformat())}
                for i in range(DAYS)]
        last = mine[-1] if mine else None
        broken_since = None
        if last is not None and last.state == "broken":
            for r in reversed(mine):
                if r.state != "broken":
                    break
                broken_since = r.checked_at
        out.append({"key": platform.key, "name": platform.name, "route": platform.route, "saves": platform.saves,
                    "test_url": test_url(db, platform), "shipped_url": platform.test_url,
                    "state": last.state if last else None, "detail": last.detail if last else None,
                    "missing": last.missing if last else [], "seconds": last.seconds if last else None,
                    "checked_at": last.checked_at if last else None, "broken_since": broken_since, "days": days})
    checked = [r.checked_at for r in rows]
    s = setting(db)
    return {"daily": s["daily"], "warn": s["warn"], "platforms": out, "last_checked_at": max(checked) if checked else None,
            "working": sum(1 for p in out if p["state"] == "works"), "checked": sum(1 for p in out if p["state"])}


def for_url(db: Session, url: str) -> dict[str, Any] | None:
    """The platform a pasted link is on, and how it was at its last check: for the warning before a capture."""
    host = (urlsplit(url).hostname or "").lower()
    platform = next((p for p in PLATFORMS if any(host == h or host.endswith("." + h) for h in p.hosts)), None)
    if platform is None or not setting(db)["warn"]:
        return None
    last = db.scalar(select(PlatformCheck).where(PlatformCheck.platform == platform.key).order_by(PlatformCheck.checked_at.desc()).limit(1))
    if last is None:
        return {"key": platform.key, "name": platform.name, "state": None, "detail": None, "checked_at": None}
    return {"key": platform.key, "name": platform.name, "state": last.state, "detail": last.detail, "checked_at": last.checked_at}
