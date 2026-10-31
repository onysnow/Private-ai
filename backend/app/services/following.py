"""Following (ADR-0022, source intake Phase 3, mockup FOLLOW_1): the app watches, a person captures.

A monitor asks its source "anything new since my last visit?" on a schedule (a conditional GET, through the same guard
the web capture uses: public addresses only, a byte budget), honours robots.txt, backs off when told to, and writes
each request to the outbound log. What it finds goes in a queue; nothing is kept until a person captures it (the
ordinary web capture, ADR-0018, or for a podcast the episode's audio file). Signals that an item may not last put it
first: an account deleting posts, an item edited since it was first seen, a followed page changed since it was
captured, something captured that now answers 404. Copies of one wire story are counted once: only the earliest is
offered.

No account logins, cookies or API keys anywhere (decision 1, 19 Oct): feeds (RSS, Atom, YouTube channel feeds),
sitemaps, single pages, podcasts, and open-protocol public accounts (Bluesky through its public read-only server,
Mastodon through the account's public feed). A closed platform is a row with no monitor.
"""

from __future__ import annotations

import calendar
import difflib
import hashlib
import html
import logging
import random
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from collections.abc import Sequence
from pathlib import Path
from typing import Any
from urllib.parse import quote, urljoin, urlsplit
from urllib.robotparser import RobotFileParser

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import Capture, Investigation
from app.models.following import Monitor, MonitorItem, PageVersion

logger = logging.getLogger("journalism.following")

KINDS = ("feed", "sitemap", "page", "podcast", "account", "closed", "mailbox")
EVERY_MINUTES = (15, 30, 60, 1440, 10080)
ROUTES = ("direct", "tor")
USER_AGENT = "JournalismWorkbench/1.0 (following open sources; honours robots.txt)"
MAX_SOURCE_BYTES = 20 * 1024 * 1024
TIMEOUT_S = 30.0
MONITORS_PER_TICK = 5
HOST_GAP_S = 10.0  # at least this long between two requests to one host from the scheduler
GONE_CHECKS_PER_RUN = 3
SIMILAR = 0.6  # word-shingle Jaccard at or above this: the same story
CLUSTER_WINDOW_DAYS = 14
BULK_REASON_MIN = 8

# Platforms with no open way to follow them: a pasted link is captured logged out, or the reporter supplies files.
CLOSED_HOSTS = ("x.com", "twitter.com", "instagram.com", "facebook.com", "fb.com", "tiktok.com", "linkedin.com",
                "threads.net", "threads.com", "whatsapp.com", "t.me", "telegram.me", "snapchat.com", "discord.com")


class FollowRefused(ValueError):
    """The address cannot be followed; the message says why and what can be done instead."""


# Why a source could not be read, in the app's own words: what the screen shows is always one of these, never the
# text of an error from a library.
REASONS = {
    "unreachable": "the site could not be reached",
    "timeout": f"the site did not answer within {int(TIMEOUT_S)} s",
    "too_large": f"the answer was larger than {MAX_SOURCE_BYTES // (1024 * 1024)} MB",
    "redirects": "it sent the request on too many times",
    "tor": "Tor is not running on this computer",
    "address": "it is not a public web address",
    "unreadable": "it is not a feed or page the app can read",
}


class FetchFailed(OSError):
    """A source could not be read; `reason` is a key of REASONS."""

    def __init__(self, reason: str) -> None:
        super().__init__(REASONS[reason])
        self.reason = reason


def reason_of(exc: BaseException) -> str:
    from app.services.web_capture import CaptureRefused

    if isinstance(exc, FetchFailed):
        return REASONS[exc.reason]
    if isinstance(exc, CaptureRefused):
        return REASONS["address"]
    return REASONS["unreadable"] if isinstance(exc, ValueError) else REASONS["unreachable"]


@dataclass
class Fetched:
    status: int
    url: str
    headers: dict[str, str]
    body: bytes
    seconds: float
    moved_to: str | None = None


@dataclass
class Entry:
    key: str
    url: str | None
    title: str
    summary: str = ""
    published: datetime | None = None
    extra: dict[str, Any] = field(default_factory=dict)


# --- Requests ------------------------------------------------------------------------------------------------------

_last_request: dict[str, float] = {}
_robots: dict[str, tuple[float, RobotFileParser | None]] = {}


def _proxy_for(route: str) -> tuple[str | None, Any]:
    """(proxy URL, guard) for a route: Direct goes through the capture guard (public addresses only, a byte budget);
    Tor goes to the Tor the reporter runs, which resolves the name itself."""
    from app.services.web_capture import _Guard

    if route == "tor":
        return settings.tor_socks_url, None
    guard = _Guard(budget=MAX_SOURCE_BYTES)
    return guard.url, guard


def fetch(url: str, *, route: str = "direct", etag: str | None = None, last_modified: str | None = None,
          accept: str = "*/*") -> Fetched:
    """One GET, conditional when it can be. A temporary redirect is followed (three at most); a permanent one is
    reported as moved and not followed. Raises OSError when the source cannot be reached."""
    import httpx

    from app.services.web_capture import check_address

    check_address(url)
    headers = {"User-Agent": USER_AGENT, "Accept": accept}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified
    proxy, guard = _proxy_for(route)
    started = time.monotonic()
    try:
        if guard is not None:
            guard.__enter__()
        with httpx.Client(proxy=proxy, timeout=TIMEOUT_S, follow_redirects=False, headers=headers, trust_env=False) as client:
            current = url
            for _hop in range(4):
                with client.stream("GET", current) as response:
                    if response.status_code in (301, 308) and response.headers.get("location"):
                        return Fetched(response.status_code, current, dict(response.headers), b"", time.monotonic() - started,
                                       moved_to=urljoin(current, response.headers["location"]))
                    if response.status_code in (302, 303, 307) and response.headers.get("location"):
                        current = urljoin(current, response.headers["location"])
                        check_address(current)
                        continue
                    body = bytearray()
                    for chunk in response.iter_bytes():
                        body.extend(chunk)
                        if len(body) > MAX_SOURCE_BYTES:
                            raise FetchFailed("too_large")
                    return Fetched(response.status_code, current, dict(response.headers), bytes(body), time.monotonic() - started)
            raise FetchFailed("redirects")
    except httpx.HTTPError as exc:
        if route == "tor" and isinstance(exc, (httpx.ConnectError, httpx.ProxyError)):
            raise FetchFailed("tor") from exc
        raise FetchFailed("timeout" if isinstance(exc, httpx.TimeoutException) else "unreachable") from exc
    finally:
        if guard is not None:
            guard.__exit__(None, None, None)


def _log(db: Session, monitor: Monitor, what: str, url: str) -> str:
    from app.services.outbound import record_outbound

    host = urlsplit(url).hostname or url
    return record_outbound(db, monitor.investigation_id, service=f"following:{host}", kind=monitor.kind, value=f"{what} {url}",
                           reason=f"Following: {monitor.name}" + (" (through Tor)" if monitor.route == "tor" else ""),
                           actor="automatic", source={"monitor_id": monitor.id, "destination": host})


def robots_allow(db: Session, monitor: Monitor, url: str) -> bool:
    """robots.txt is honoured for monitoring (decision 4): read once a day per host, with the request logged. A site
    with no robots.txt, or one that cannot be read, allows."""
    parts = urlsplit(url)
    origin = f"{parts.scheme}://{parts.netloc}"
    cached = _robots.get(origin)
    if cached is None or time.time() - cached[0] > 86400:
        parser: RobotFileParser | None = None
        request_id = _log(db, monitor, "GET", f"{origin}/robots.txt")
        try:
            got = fetch(f"{origin}/robots.txt", route=monitor.route, accept="text/plain")
            if got.status == 200:
                parser = RobotFileParser()
                parser.parse(got.body.decode("utf-8", "replace").splitlines())
        except OSError:
            from app.services.outbound import mark_outbound_failed

            mark_outbound_failed(db, request_id)
        _robots[origin] = cached = (time.time(), parser)
    parser = cached[1]
    return parser is None or parser.can_fetch(USER_AGENT, url)


# --- Reading what came back ----------------------------------------------------------------------------------------

def _text(markup: str | None, limit: int = 2000) -> str:
    plain = re.sub(r"<[^>]+>", " ", markup or "")
    return re.sub(r"\s+", " ", html.unescape(plain)).strip()[:limit]


def _when(parsed: Any) -> datetime | None:
    try:
        return datetime.fromtimestamp(calendar.timegm(parsed), timezone.utc).replace(tzinfo=None) if parsed else None
    except (TypeError, ValueError, OverflowError):
        return None


def _iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        moment = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.tzinfo is not None:  # kept as naive UTC, like every time the app stores
        moment = moment.astimezone(timezone.utc).replace(tzinfo=None)
    return moment


def read_feed(body: bytes) -> tuple[list[Entry], dict[str, Any]]:
    """Entries of an RSS or Atom feed, newest first as the feed lists them, and what the feed says about itself."""
    import feedparser

    parsed = feedparser.parse(body)
    if parsed.bozo and not parsed.entries:
        raise ValueError("not a feed the app can read")
    entries: list[Entry] = []
    for item in parsed.entries:
        link = item.get("link")
        extra: dict[str, Any] = {}
        for enclosure in item.get("enclosures", []) or []:
            if str(enclosure.get("type", "")).startswith(("audio/", "video/")):
                extra["audio"] = {"url": enclosure.get("href"), "type": enclosure.get("type"),
                                  "bytes": int(enclosure["length"]) if str(enclosure.get("length", "")).isdigit() else None}
                break
        transcript = item.get("podcast_transcript")
        if transcript:
            extra["publisher_transcript"] = {"url": transcript.get("url"), "type": transcript.get("type")}
        chapters = item.get("podcast_chapters")
        if chapters:
            extra["chapters"] = {"url": chapters.get("url"), "type": chapters.get("type")}
        duration = item.get("itunes_duration")
        if duration:
            extra["duration"] = str(duration)
        content = (item.get("content") or [{}])[0].get("value") if item.get("content") else None
        entries.append(Entry(key=str(item.get("id") or link or item.get("title") or ""), url=link,
                             title=_text(item.get("title"), 500), summary=_text(content or item.get("summary")),
                             published=_when(item.get("published_parsed") or item.get("updated_parsed")), extra=extra))
    feed = parsed.feed
    about = {"title": _text(feed.get("title"), 300), "audio": sum(1 for e in entries if "audio" in e.extra),
             "transcripts": sum(1 for e in entries if "publisher_transcript" in e.extra)}
    return [e for e in entries if e.key], about


_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9", "news": "http://www.google.com/schemas/sitemap-news/0.9"}


def read_sitemap(body: bytes) -> tuple[list[Entry], list[str]]:
    """(addresses of a urlset, child sitemaps of an index). The standard library's parser never fetches external
    entities, and the expat Python carries limits entity expansion."""
    try:
        root = ET.fromstring(body)
    except ET.ParseError as exc:
        raise ValueError(f"not a sitemap the app can read ({exc})") from exc
    tag = root.tag.rsplit("}", 1)[-1]
    if tag == "sitemapindex":
        children = [(loc.text or "").strip() for loc in root.iter(f"{{{_NS['sm']}}}loc")]
        return [], [c for c in children if c]
    entries = []
    for url in root.findall("sm:url", _NS):
        loc = (url.findtext("sm:loc", "", _NS) or "").strip()
        if not loc:
            continue
        title = (url.findtext("news:news/news:title", "", _NS) or "").strip()
        when = _iso(url.findtext("news:news/news:publication_date", None, _NS) or url.findtext("sm:lastmod", None, _NS))
        entries.append(Entry(key=loc, url=loc, title=title or loc, published=when))
    entries.sort(key=lambda e: e.published or datetime.min, reverse=True)
    return entries, []


class _MainText(HTMLParser):
    """A page's readable text, block by block: scripts, styles, navigation, headers, footers, forms and asides left
    out, so a change in the menu or an advert is not a change in what the page says."""

    SKIP = {"script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg", "template", "iframe"}
    BLOCK = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "td", "th", "dt", "dd", "section", "article",
             "blockquote", "pre", "br", "table", "main", "address", "figcaption"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.lines: list[str] = []
        self.current: list[str] = []
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.SKIP:
            self.depth += 1
        elif tag in self.BLOCK:
            self._flush()
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP and self.depth:
            self.depth -= 1
        elif tag in self.BLOCK:
            self._flush()
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        elif not self.depth:
            self.current.append(data)

    def _flush(self) -> None:
        line = re.sub(r"\s+", " ", "".join(self.current)).strip()
        if line:
            self.lines.append(line)
        self.current = []


def main_text(body: bytes) -> tuple[str, str]:
    """(title, main text one block per line) of an HTML page."""
    parser = _MainText()
    parser.feed(body.decode("utf-8", "replace"))
    parser.close()
    parser._flush()
    return re.sub(r"\s+", " ", parser.title).strip(), "\n".join(parser.lines)


def feed_links(body: bytes, base: str) -> list[str]:
    """The feeds a page names in <link rel="alternate">."""
    found = []
    for tag in re.findall(r"<link\b[^>]*>", body.decode("utf-8", "replace"), flags=re.I):
        if re.search(r'rel=["\']?alternate', tag, re.I) and re.search(r"type=[\"']?application/(rss|atom)\+xml", tag, re.I):
            href = re.search(r'href=["\']([^"\']+)', tag, re.I)
            if href:
                found.append(urljoin(base, html.unescape(href.group(1))))
    return found


def read_bluesky(body: bytes, handle: str) -> list[Entry]:
    import json

    data = json.loads(body)
    entries = []
    for row in data.get("feed", []):
        post = row.get("post") or {}
        uri = str(post.get("uri") or "")
        if not uri or row.get("reason"):  # a repost is someone else's post
            continue
        record = post.get("record") or {}
        rkey = uri.rsplit("/", 1)[-1]
        text = str(record.get("text") or "")
        entries.append(Entry(key=uri, url=f"https://bsky.app/profile/{handle}/post/{rkey}", title=text[:200] or "(no text)",
                             summary=text, published=_iso(record.get("createdAt")),
                             extra={"replies": post.get("replyCount")}))
    return entries


_TG_POST = re.compile(r'data-post="([A-Za-z0-9_]+/\d+)"')
_TG_TEXT = re.compile(r'<div class="tgme_widget_message_text js-message_text"[^>]*>(.*?)</div>', re.S)
_TG_TIME = re.compile(r'<a class="tgme_widget_message_date" href="([^"]+)"><time datetime="([^"]+)"')
_TG_FORWARD = re.compile(r'<div class="tgme_widget_message_forwarded_from[^"]*">(.*?)</div>', re.S)
_TG_EDITED = re.compile(r'class="tgme_widget_message_meta">(.*?)<a class="tgme_widget_message_date"', re.S)
_TG_VIEWS = re.compile(r'<span class="tgme_widget_message_views">([^<]+)</span>')
_TG_MEDIA = (("tgme_widget_message_photo", "photo"), ("tgme_widget_message_video", "video"),
             ("tgme_widget_message_roundvideo", "video message"), ("tgme_widget_message_voice", "voice message"),
             ("tgme_widget_message_document", "file"), ("tgme_widget_message_poll", "poll"))


def _tg_text(markup: str) -> str:
    markup = re.sub(r"<br\s*/?>", "\n", markup)
    return html.unescape(re.sub(r"<[^>]+>", "", markup)).strip()


def read_telegram(body: bytes) -> list[Entry]:
    """The posts a public Telegram channel's web preview (t.me/s/<channel>) shows: the latest twenty or so. A post
    forwarded from another channel is kept and says where from; a post with only a picture, a video or a file is
    named by what it carries, as the preview does not show it."""
    page = body.decode("utf-8", "replace")
    starts = [m for m in _TG_POST.finditer(page)]
    entries = []
    for n, m in enumerate(starts):
        block = page[m.start():starts[n + 1].start() if n + 1 < len(starts) else len(page)]
        when = _TG_TIME.search(block)
        text_m = _TG_TEXT.search(block)
        text = _tg_text(text_m.group(1)) if text_m else ""
        carries = next((word for cls, word in _TG_MEDIA if cls in block), None)
        extra: dict[str, Any] = {}
        forward = _TG_FORWARD.search(block)
        if forward:
            # "Forwarded from <name>"; the name is blank when the original poster hides it.
            extra["forwarded_from"] = re.sub(r"^Forwarded from\s*", "", _tg_text(forward.group(1)).replace("\xa0", " ")) or "a hidden sender"
        if carries:
            extra["carries"] = carries
        views = _TG_VIEWS.search(block)
        if views:
            extra["views"] = views.group(1).strip()
        meta = _TG_EDITED.search(block)
        if meta and "edited" in _tg_text(meta.group(1)):
            extra["edited"] = True
        title = text.split("\n", 1)[0][:200] if text else f"({carries or 'a post the preview does not show'})"
        entries.append(Entry(key=f"telegram:{m.group(1)}", url=when.group(1) if when else f"https://t.me/{m.group(1)}",
                             title=title, summary=text, published=_iso(when.group(2)) if when else None, extra=extra))
    return list(reversed(entries))  # newest first, as the other readers give them


# --- Following something -------------------------------------------------------------------------------------------

@dataclass
class Found:
    kind: str
    url: str
    name: str
    platform: str | None = None


def _bluesky_handle(text: str) -> str | None:
    text = text.strip()
    m = re.match(r"^https?://bsky\.app/profile/([^/?#]+)", text)
    if m:
        return m.group(1)
    if text.startswith("@") and text.count("@") == 1 and "." in text:
        return text[1:]
    return None


def _mastodon_feed(text: str) -> tuple[str, str] | None:
    text = text.strip()
    m = re.match(r"^@?([A-Za-z0-9_]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})$", text)
    if m:
        return f"https://{m.group(2)}/@{m.group(1)}.rss", f"@{m.group(1)}@{m.group(2)}"
    m = re.match(r"^https?://([A-Za-z0-9.-]+)/@([A-Za-z0-9_]+)/?$", text)
    if m and m.group(1) != "bsky.app":
        return f"https://{m.group(1)}/@{m.group(2)}.rss", f"@{m.group(2)}@{m.group(1)}"
    return None


_TG_NAME = r"([A-Za-z][A-Za-z0-9_]{3,31})"


def _telegram_channel(text: str) -> str | None:
    """The public channel a Telegram address names: t.me/<name>, t.me/s/<name> or a post's t.me/<name>/<n>. A private
    group's invite (t.me/+…, t.me/joinchat/…) or a private channel's post (t.me/c/…) names none."""
    m = re.match(rf"^(?:https?://)?(?:www\.)?(?:t|telegram)\.me/(?:s/)?{_TG_NAME}(?:/\d+)?/?(?:[?#].*)?$", text.strip())
    if not m or m.group(1).lower() in ("joinchat", "addstickers", "share", "proxy", "socks", "addlist", "boost", "iv"):
        return None
    return m.group(1)


def closed_platform(url: str) -> str | None:
    host = (urlsplit(url).hostname or "").lower()
    return next((h for h in CLOSED_HOSTS if host == h or host.endswith("." + h)), None)


class DiscoveryLog:
    """Each request made to find out what an address is, written in the case's outbound log before it goes (ADR-0015),
    whether or not the address can be followed; one that fails says so there."""

    def __init__(self, db: Session, investigation_id: str, text: str, route: str) -> None:
        self.db, self.investigation_id, self.text, self.route = db, investigation_id, text.strip()[:300], route

    def before(self, url: str) -> str:
        from app.services.outbound import record_outbound

        host = urlsplit(url).hostname or url
        return record_outbound(self.db, self.investigation_id, service=f"following:{host}", kind="web address", value=f"GET {url}",
                               reason=f"Following: what is {self.text}?" + (" (through Tor)" if self.route == "tor" else ""),
                               actor="automatic", source={"destination": host})

    def failed(self, request_id: str) -> None:
        from app.services.outbound import mark_outbound_failed

        mark_outbound_failed(self.db, request_id)


def _ask(url: str, *, route: str, log: DiscoveryLog | None, accept: str = "*/*") -> Fetched:
    request_id = log.before(url) if log is not None else None
    try:
        return fetch(url, route=route, accept=accept)
    except Exception:
        if log is not None and request_id is not None:
            log.failed(request_id)
        raise


def discover(text: str, *, route: str = "direct", log: DiscoveryLog | None = None) -> Found:
    """What an address or handle the reporter typed can be followed as. Asks the source once, or twice for a page that
    names its feed; `log` writes each request in the case's outbound log before it goes. Raises FollowRefused."""
    handle = _bluesky_handle(text)
    if handle:
        return Found("account", f"https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor={quote(handle)}&limit=20"
                     "&filter=posts_no_replies", f"@{handle} · public account", "bluesky")
    mastodon = _mastodon_feed(text)
    if mastodon:
        return Found("account", mastodon[0], f"{mastodon[1]} · public account", "mastodon")
    channel = _telegram_channel(text)
    if channel:
        return _telegram(channel, route, log)
    url = text.strip()
    if not re.match(r"^https?://", url, re.I):
        raise FollowRefused("Give a web address (https://…), a Bluesky handle (@name.bsky.social), a Mastodon "
                            "account (@name@server) or a public Telegram channel (t.me/name)")
    closed = closed_platform(url)
    if closed:
        return Found("closed", url, f"{closed} · closed platform")
    try:
        got = _ask(url, route=route, log=log)
    except OSError as exc:
        raise FollowRefused(f"The address could not be read: {reason_of(exc)}") from exc
    if got.moved_to:
        raise FollowRefused(f"The address has moved to {got.moved_to}: follow that address instead")
    if got.status != 200:
        raise FollowRefused(f"The address answered {got.status}")
    kind_hint = got.headers.get("content-type", "").split(";")[0].strip().lower()
    head = got.body[:2000].lstrip().lower()
    host = urlsplit(url).hostname or url
    if b"<urlset" in head or b"<sitemapindex" in head:
        return Found("sitemap", url, f"{host} · news sitemap")
    if kind_hint in ("application/rss+xml", "application/atom+xml", "application/xml", "text/xml") or b"<rss" in head \
            or b"<feed" in head:
        entries, about = read_feed(got.body)
        kind = "podcast" if about["audio"] and about["audio"] >= max(1, len(entries) // 2) else "feed"
        platform = "youtube" if "youtube.com/feeds/" in url else None
        label = "podcast" if kind == "podcast" else "news feed"
        return Found(kind, url, f"{about['title'] or host} · {label}", platform)
    feeds = feed_links(got.body, got.url)
    title, _text_ = main_text(got.body)
    if feeds:
        # A page that names its feed: following the feed is lighter for the site and lists every new item.
        return discover(feeds[0], route=route, log=log)
    return Found("page", url, f"{title or host} · page")


def _telegram(channel: str, route: str, log: DiscoveryLog | None = None) -> Found:
    """A public channel is followed through its web preview, which Telegram shows logged out; a channel without one
    (private, or a person or group) cannot be followed."""
    url = f"https://t.me/s/{channel}"
    try:
        got = _ask(url, route=route, log=log, accept="text/html")
    except OSError as exc:
        raise FollowRefused(f"The channel could not be read: {reason_of(exc)}") from exc
    if got.status != 200 or urlsplit(got.url).path.rstrip("/") != f"/s/{channel}" or b"tgme_channel_info" not in got.body:
        raise FollowRefused(f"t.me/{channel} has no public web preview: only a public channel can be followed. A private "
                            "channel, a group or a person's account is captured one post at a time from a pasted link, "
                            "or from files you supply.")
    title = re.search(rb'<meta property="og:title" content="([^"]*)"', got.body)
    name = html.unescape(title.group(1).decode("utf-8", "replace")) if title else channel
    return Found("account", url, f"{name} (t.me/{channel}) · public Telegram channel", "telegram")


def follow(db: Session, investigation_id: str, text: str, *, every_minutes: int | None = None, route: str = "direct",
           actor: str | None = None) -> Monitor:
    if db.get(Investigation, investigation_id) is None:
        raise LookupError("Investigation not found")
    if route not in ROUTES:
        raise FollowRefused(f"Route must be one of {', '.join(ROUTES)}")
    found = discover(text, route=route, log=DiscoveryLog(db, investigation_id, text, route))
    if db.scalar(select(Monitor.id).where(Monitor.investigation_id == investigation_id, Monitor.url == found.url)):
        raise FollowRefused("This case already follows that address")
    if found.kind == "sitemap":
        # A sitemap has no title of its own: it is named after a feed of the same site this case already follows.
        host = urlsplit(found.url).hostname
        for other in db.scalars(select(Monitor).where(Monitor.investigation_id == investigation_id,
                                                      Monitor.kind.in_(("feed", "podcast")))):
            if urlsplit(other.url).hostname == host:
                found.name = f"{other.name.split(' · ')[0]} · news sitemap"
                break
    default_every = {"feed": 30, "sitemap": 60, "page": 1440, "podcast": 1440, "account": 15, "closed": 0}[found.kind]
    every = every_minutes if every_minutes in EVERY_MINUTES else default_every
    monitor = Monitor(investigation_id=investigation_id, kind=found.kind, platform=found.platform, url=found.url,
                      name=found.name[:500], every_minutes=every, route=route, created_by=actor,
                      health="closed" if found.kind == "closed" else "unchecked",
                      next_check_at=None if found.kind == "closed" else utcnow_naive())
    db.add(monitor)
    db.commit()
    if found.kind != "closed":
        check(db, monitor)
    return monitor


# --- Checking a source ---------------------------------------------------------------------------------------------

def _lines(n: int) -> str:
    return f"{n} line{'' if n == 1 else 's'}"


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _schedule(monitor: Monitor, now: datetime, *, after: timedelta | None = None) -> None:
    if monitor.every_minutes == 0 and after is None:
        monitor.next_check_at = None  # asked only when a person presses Re-check
        return
    every = timedelta(minutes=monitor.every_minutes or 30)
    # A little jitter so many monitors on one host do not all ask in the same minute.
    jitter = timedelta(seconds=random.uniform(0, min(every.total_seconds() * 0.1, 300)))
    monitor.next_check_at = now + (after if after is not None else every) + jitter


def _retry_after(headers: dict[str, str]) -> timedelta | None:
    value = headers.get("retry-after", "")
    if value.isdigit():
        return timedelta(seconds=min(int(value), 86400))
    return None


def _upsert(db: Session, monitor: Monitor, entries: list[Entry], now: datetime) -> int:
    """Add what is new, note edits; returns how many are new. An entry the source no longer lists while it still
    lists older ones was deleted at the source."""
    known = {i.key: i for i in db.scalars(select(MonitorItem).where(MonitorItem.monitor_id == monitor.id))}
    new = 0
    listed = set()
    for entry in entries:
        listed.add(entry.key)
        digest = _sha(f"{entry.title}\n{entry.summary}")
        row = known.get(entry.key)
        if row is None:
            row = MonitorItem(investigation_id=monitor.investigation_id, monitor_id=monitor.id, key=entry.key[:4000],
                              url=entry.url, title=entry.title or (entry.url or ""), summary=entry.summary,
                              published_at=entry.published, first_seen_at=now, last_seen_at=now, extra=entry.extra,
                              versions=[{"at": now.isoformat(), "sha256": digest, "title": entry.title}])
            db.add(row)
            known[entry.key] = row
            new += 1
            continue
        row.last_seen_at = now
        row.vanished_at = None
        if row.versions and row.versions[-1].get("sha256") != digest:
            row.versions = [*row.versions, {"at": now.isoformat(), "sha256": digest, "title": entry.title}]
            row.title, row.summary = entry.title or row.title, entry.summary
        row.extra = {**(row.extra or {}), **entry.extra}
    dated = [e.published for e in entries if e.published]
    oldest = min(dated) if dated else None
    deleted = 0
    if monitor.kind in ("account", "feed", "podcast") and oldest is not None:
        for row in known.values():
            if row.key in listed or row.published_at is None or row.published_at < oldest:
                continue
            if row.vanished_at is None:
                row.vanished_at = now
            deleted += 1
    if monitor.kind == "account":
        monitor.deleted_recent, monitor.window = deleted, len(entries) + deleted
    return new


def _page_version(db: Session, monitor: Monitor, body: bytes, now: datetime) -> tuple[str, int]:
    """Keep a new version when the page's main text changed. Returns (what happened, lines changed)."""
    title, text = main_text(body)
    text_sha, layout_sha = _sha(text), hashlib.sha256(body).hexdigest()
    last = db.scalars(select(PageVersion).where(PageVersion.monitor_id == monitor.id).order_by(PageVersion.number.desc())).first()
    if last is not None and last.text_sha256 == text_sha:
        if last.layout_sha256 != layout_sha and (not last.layout_changes or last.layout_changes[-1].get("sha256") != layout_sha):
            last.layout_changes = [*(last.layout_changes or []), {"at": now.isoformat(), "sha256": layout_sha}]
            return "layout", 0
        return "same", 0
    old_lines = last.text.splitlines() if last is not None else []
    new_lines = text.splitlines()
    diff = [line for line in difflib.unified_diff(old_lines, new_lines, lineterm="", n=0)
            if line[:1] in "+-" and not line.startswith(("+++", "---"))]
    changed = max(sum(1 for d in diff if d.startswith("-")), sum(1 for d in diff if d.startswith("+"))) if last else 0
    number = (last.number + 1) if last is not None else 1
    version = PageVersion(investigation_id=monitor.investigation_id, monitor_id=monitor.id, number=number, seen_at=now,
                          text_sha256=text_sha, layout_sha256=layout_sha, text=text, lines_changed=changed, diff=diff[:400])
    db.add(version)
    db.flush()
    db.add(MonitorItem(investigation_id=monitor.investigation_id, monitor_id=monitor.id, key=f"version:{number}",
                       url=monitor.url, title=f"{title or monitor.name} · {'new version' if last else 'version 1'}",
                       summary="\n".join(new_lines[:6])[:2000], first_seen_at=now, last_seen_at=now, published_at=now,
                       extra={"page_version": number, "version_id": version.id, "lines_changed": changed},
                       versions=[{"at": now.isoformat(), "sha256": text_sha, "title": title}]))
    return ("changed" if last else "first"), changed


def _check_gone(db: Session, monitor: Monitor, now: datetime) -> None:
    """A few captured items a day: does the address still answer? 404 or 410 puts it back in the queue as gone."""
    rows = db.scalars(select(MonitorItem).where(MonitorItem.monitor_id == monitor.id, MonitorItem.state == "captured",
                                                MonitorItem.url.is_not(None))).all()
    due = [r for r in rows if r.link_checked_at is None or now - r.link_checked_at > timedelta(hours=24)]
    for row in due[:GONE_CHECKS_PER_RUN]:
        row.link_checked_at = now
        url = row.url or ""
        if not robots_allow(db, monitor, url):
            continue
        request_id = _log(db, monitor, "GET (still there?)", url)
        try:
            got = fetch(url, route=monitor.route)
        except (OSError, ValueError):
            from app.services.outbound import mark_outbound_failed

            mark_outbound_failed(db, request_id)
            continue
        if got.status in (404, 410):
            row.state, row.gone_status = "gone", got.status


def check(db: Session, monitor: Monitor, *, now: datetime | None = None) -> Monitor:
    """Ask the source once and file what it says. Never raises for the source's own failures: the monitor's health
    says what happened."""
    from app.services.outbound import mark_outbound_failed

    now = now or utcnow_naive()
    if monitor.kind == "closed" or monitor.health in ("paused", "moved"):
        return monitor
    if monitor.kind == "mailbox":
        from app.services import mailbox

        return mailbox.check(db, monitor, now=now)
    monitor.last_checked_at = now
    if not robots_allow(db, monitor, monitor.url):
        monitor.health, monitor.health_detail = "broken", "robots.txt asks robots not to fetch this address: not followed"
        monitor.checks = [{"state": "bad", "text": "robots.txt disallows following this address"}]
        monitor.robots_allowed = False
        _schedule(monitor, now, after=timedelta(days=1))
        db.commit()
        return monitor
    monitor.robots_allowed = True
    request_id = _log(db, monitor, "GET (anything new since my last visit?)", monitor.url)
    accept = "application/json" if monitor.platform == "bluesky" else "text/html" if monitor.platform == "telegram" else (
        "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5" if monitor.kind != "page" else "text/html")
    try:
        got = fetch(monitor.url, route=monitor.route, etag=monitor.etag, last_modified=monitor.last_modified, accept=accept)
    except (OSError, ValueError) as exc:
        mark_outbound_failed(db, request_id)
        monitor.health, monitor.health_detail = "broken", f"could not be read: {reason_of(exc)}"
        monitor.checks = [{"state": "bad", "text": f"Not read: {reason_of(exc)}"}]
        _schedule(monitor, now)
        db.commit()
        return monitor
    checks = [{"state": "ok", "text": f"Answered {got.status} in {got.seconds:.1f} s", "status": got.status,
               "seconds": round(got.seconds, 2)}]
    if got.moved_to:
        monitor.health, monitor.moved_to = "moved", got.moved_to
        monitor.health_detail = f"moved: the old address answers {got.status} → {got.moved_to}"
        monitor.checks = [{"state": "bad", "text": f"Old address answers {got.status} → {got.moved_to}"},
                          {"state": "wait", "text": "Not read"}]
        db.commit()
        return monitor
    if got.status in (429, 503):
        monitor.health_detail = f"asked to wait (answered {got.status})"
        monitor.checks = [{"state": "warn", "text": f"Answered {got.status}: asked to wait, waiting"}]
        _schedule(monitor, now, after=_retry_after({k.lower(): v for k, v in got.headers.items()}) or timedelta(hours=1))
        db.commit()
        return monitor
    if got.status == 304:
        checks.append({"state": "ok", "text": "Nothing new since the last visit"})
        monitor.health, monitor.health_detail, monitor.last_ok_at, monitor.checks = "works", None, now, checks
        _check_gone(db, monitor, now)
        _schedule(monitor, now)
        db.commit()
        return monitor
    if got.status != 200:
        monitor.health, monitor.health_detail = "broken", f"answered {got.status}"
        monitor.checks = [{"state": "bad", "text": f"Answered {got.status}", "status": got.status,
                           "seconds": round(got.seconds, 2)}]
        _schedule(monitor, now)
        db.commit()
        return monitor
    headers = {k.lower(): v for k, v in got.headers.items()}
    try:
        if monitor.kind == "page":
            happened, lines = _page_version(db, monitor, got.body, now)
            checks.append({"state": "warn" if happened == "changed" else "ok", "text": {
                "first": "Main text kept as version 1", "changed": f"Text differs from the last version · {_lines(lines)}",
                "layout": "Layout changed, text the same", "same": "Text the same as the last version"}[happened]})
        elif monitor.kind == "sitemap":
            entries, children = read_sitemap(got.body)
            if children:
                child = children[-1]
                _log(db, monitor, "GET (newest sitemap of the index)", child)
                entries, _ = read_sitemap(fetch(child, route=monitor.route).body)
            new = _upsert(db, monitor, entries[:1000], now)
            checks.append({"state": "ok", "text": f"Read {len(entries)} addresses"})
            if entries and entries[0].published:
                checks.append({"state": "ok", "text": f"Newest entry {entries[0].published:%d %b %H:%M}"})
        elif monitor.platform == "bluesky":
            handle = re.search(r"actor=([^&]+)", monitor.url)
            entries = read_bluesky(got.body, handle.group(1) if handle else "")
            new = _upsert(db, monitor, entries, now)
            checks.append({"state": "ok", "text": f"Read {len(entries)} latest posts"})
        elif monitor.platform == "telegram":
            if b"tgme_channel_info" not in got.body:
                raise ValueError("the channel no longer has a public web preview")
            entries = read_telegram(got.body)
            new = _upsert(db, monitor, entries, now)
            checks.append({"state": "ok", "text": f"Read {len(entries)} latest posts"})
        else:
            entries, about = read_feed(got.body)
            new = _upsert(db, monitor, entries, now)
            noun = "post" if monitor.kind == "account" else ("episode" if monitor.kind == "podcast" else "item")
            noun += "" if len(entries) == 1 else "s"
            checks.append({"state": "ok", "text": f"Read {len(entries)} {'latest ' if monitor.kind == 'account' else ''}{noun}"})
            if monitor.kind == "podcast" and about["transcripts"]:
                checks.append({"state": "ok", "text": f"Transcripts offered for {about['transcripts']}"})
            elif entries and entries[0].published:
                checks.append({"state": "ok", "text": f"Newest item {entries[0].published:%d %b %H:%M}"})
        if monitor.kind == "account" and monitor.deleted_recent:
            checks.append({"state": "warn", "text": f"{monitor.deleted_recent} of the last {monitor.window} posts were deleted"})
    except (ValueError, OSError) as exc:
        db.rollback()
        monitor = db.get(Monitor, monitor.id) or monitor
        monitor.last_checked_at = now
        monitor.health, monitor.health_detail = "broken", f"could not be read: {reason_of(exc)}"
        monitor.checks = [checks[0], {"state": "bad", "text": f"Could not be read: {reason_of(exc)}"}]
        _schedule(monitor, now)
        db.commit()
        return monitor
    monitor.etag, monitor.last_modified = headers.get("etag"), headers.get("last-modified")
    monitor.health, monitor.health_detail, monitor.last_ok_at, monitor.checks = "works", None, now, checks
    _check_gone(db, monitor, now)
    _schedule(monitor, now)
    db.commit()
    cluster_copies(db, monitor.investigation_id, now=now)
    return monitor


def check_due(db: Session, *, now: datetime | None = None) -> int:
    """The scheduler's minute: check the monitors that are due, a few at a time, never two to one host too close."""
    now = now or utcnow_naive()
    due = db.scalars(select(Monitor).where(Monitor.next_check_at.is_not(None), Monitor.next_check_at <= now,
                                           Monitor.health.not_in(("paused", "moved", "closed")))
                     .order_by(Monitor.next_check_at).limit(MONITORS_PER_TICK * 3)).all()
    done = 0
    for monitor in due:
        host = urlsplit(monitor.url).hostname or ""
        if time.monotonic() - _last_request.get(host, -1e9) < HOST_GAP_S:
            continue
        _last_request[host] = time.monotonic()
        try:
            check(db, monitor, now=now)
        except Exception:  # one source's failure never stops the others
            db.rollback()
            logger.warning("checking monitor %s failed", monitor.id, exc_info=True)
        done += 1
        if done >= MONITORS_PER_TICK:
            break
    return done


# --- Copies of one story -------------------------------------------------------------------------------------------

def _shingles(text: str) -> set[str]:
    words = re.findall(r"\w+", text.lower())
    return {" ".join(words[i:i + 3]) for i in range(max(len(words) - 2, 1))} if words else set()


def similarity(a: str, b: str) -> float:
    sa, sb = _shingles(a), _shingles(b)
    return len(sa & sb) / len(sa | sb) if sa and sb else 0.0


def cluster_copies(db: Session, investigation_id: str, *, now: datetime | None = None) -> None:
    """Group the case's recent items that restate one text. The earliest is the original; a later copy still waiting
    leaves the queue as a copy (it does not support the original, it repeats it)."""
    now = now or utcnow_naive()
    rows = db.scalars(select(MonitorItem).where(MonitorItem.investigation_id == investigation_id,
                                                MonitorItem.first_seen_at >= now - timedelta(days=CLUSTER_WINDOW_DAYS),
                                                ~MonitorItem.key.startswith("version:"))).all()
    rows = sorted(rows, key=lambda r: (r.published_at or r.first_seen_at, r.first_seen_at))
    texts = {r.id: f"{r.title} {r.summary}" for r in rows}
    originals: list[MonitorItem] = []
    for row in rows:
        if row.cluster and row.cluster != row.id:
            continue
        match = next((o for o in originals if o.monitor_id != row.monitor_id
                      and similarity(texts[o.id], texts[row.id]) >= SIMILAR), None)
        if match is None:
            originals.append(row)
            continue
        row.cluster, row.similarity = match.cluster or match.id, round(similarity(texts[match.id], texts[row.id]), 2)
        match.cluster = match.cluster or match.id
        if row.state == "waiting":
            row.state = "copy"
    db.commit()


# --- What the screen shows -----------------------------------------------------------------------------------------

def risks(item: MonitorItem, monitor: Monitor, *, copies: int, captured_version: bool) -> list[dict[str, str]]:
    out = []
    if item.state in ("gone", "removal_recorded"):
        out.append({"tone": "bad", "text": f"Removed: now answers {item.gone_status or 'gone'}"})
    if monitor.kind == "account" and monitor.deleted_recent and item.state == "waiting":
        out.append({"tone": "amber", "text": f"At risk: this account deleted {monitor.deleted_recent} of its last "
                                             f"{monitor.window} posts"})
    if item.vanished_at is not None:
        out.append({"tone": "amber", "text": "Deleted at the source since it was seen"})
    edits = len(item.versions or []) - 1
    if edits > 0 and not str(item.key).startswith("version:"):
        out.append({"tone": "amber", "text": f"At risk: edited {'once' if edits == 1 else f'{edits} times'} since first seen"})
    lines = (item.extra or {}).get("lines_changed")
    if str(item.key).startswith("version:") and lines:
        out.append({"tone": "amber", "text": (f"Changed since capture · {_lines(lines)}" if captured_version
                                              else f"Changed · {_lines(lines)}")})
    if copies:
        out.append({"tone": "teal", "text": f"Wire copy of {copies} other{'s' if copies != 1 else ''}"})
    if (item.extra or {}).get("publisher_transcript"):
        out.append({"tone": "teal", "text": "Publisher transcript offered"})
    return out or [{"tone": "", "text": "New · no sign of risk"}]


RANK = {"bad": 3, "amber": 2, "teal": 1, "": 0}


def capture_state(db: Session, item: MonitorItem) -> str:
    """waiting, capturing, saved, not_saved, skipped, copy, gone or removal_recorded."""
    if item.state == "captured":
        capture = db.get(Capture, item.capture_id) if item.capture_id else None
        if capture is None:
            return "saved" if item.document_id else "capturing"
        if capture.status != "finished":
            return "capturing"
        return "saved" if capture.outcome == "saved" else "not_saved"
    return item.state


def overview(db: Session, investigation_id: str) -> dict[str, Any]:
    """Everything the Following screen shows, in one answer."""
    monitors = db.scalars(select(Monitor).where(Monitor.investigation_id == investigation_id).order_by(Monitor.created_at)).all()
    by_id = {m.id: m for m in monitors}
    items = db.scalars(select(MonitorItem).where(MonitorItem.investigation_id == investigation_id)).all()
    copies: dict[str, int] = {}
    for row in items:
        if row.cluster and row.cluster != row.id:
            copies[row.cluster] = copies.get(row.cluster, 0) + 1
    captured_versions = {v.monitor_id for v in db.scalars(select(PageVersion).where(
        PageVersion.investigation_id == investigation_id, PageVersion.captured.is_(True)))}
    queue: list[dict[str, Any]] = []
    recent = utcnow_naive() - timedelta(days=7)
    for row in items:
        monitor = by_id.get(row.monitor_id)
        if monitor is None or row.state == "copy":
            continue
        state = capture_state(db, row)
        # What waits is always shown; what a person decided stays a week, so the queue shows what was just done.
        decided = (row.decision or {}).get("at")
        if state not in ("waiting", "gone") and (decided is None or datetime.fromisoformat(decided) < recent):
            continue
        said = risks(row, monitor, copies=copies.get(row.id, 0), captured_version=monitor.id in captured_versions)
        queue.append({"id": row.id, "monitor_id": row.monitor_id, "kind": monitor.kind, "platform": monitor.platform,
                      "title": row.title, "url": row.url, "summary": row.summary[:400], "published_at": row.published_at,
                      "first_seen_at": row.first_seen_at, "state": state, "risks": said,
                      "rank": max(RANK[r["tone"]] for r in said), "source": monitor.name, "extra": row.extra or {},
                      "capture_id": row.capture_id, "document_id": row.document_id, "decision": row.decision or {}})
    queue.sort(key=lambda q: (q["state"] not in ("waiting", "gone"), -q["rank"],
                              -(q["published_at"] or q["first_seen_at"]).timestamp()))
    waiting = sum(1 for q in queue if q["state"] in ("waiting", "gone"))
    groups = []
    for original_id, n in copies.items():
        members = sorted([r for r in items if r.cluster == original_id or r.id == original_id],
                         key=lambda r: (r.published_at or r.first_seen_at))
        if not members:
            continue
        head = members[0]
        groups.append({"id": original_id, "title": head.title, "count": n + 1, "members": [
            {"id": r.id, "source": by_id[r.monitor_id].name if r.monitor_id in by_id else "", "title": r.title,
             "first_seen_at": r.first_seen_at, "original": r.id == head.id, "similarity": r.similarity} for r in members]})
    return {"monitors": [serialize_monitor(m, items) for m in monitors], "queue": queue, "waiting": waiting,
            "captured": sum(1 for q in queue if q["state"] in ("saved", "capturing")),
            "skipped": sum(1 for q in queue if q["state"] == "skipped"), "copies": groups, "egress": egress(monitors),
            "working": sum(1 for m in monitors if m.health == "works"),
            "followed": sum(1 for m in monitors if m.kind != "closed")}


def leaves(monitor: Monitor) -> str:
    host = urlsplit(monitor.url).hostname or monitor.url
    how = {15: "every 15 minutes", 30: "every 30 minutes", 60: "an hour", 1440: "a day", 10080: "a week",
           0: "only when you ask"}.get(monitor.every_minutes, "")
    if monitor.kind == "closed":
        return "Nothing is fetched: a closed platform has no monitor."
    if monitor.health == "moved":
        return "Paused. Nothing is asked until you accept the new address. A moved source is never followed by itself."
    route = " through Tor: the site sees a Tor exit, not this computer" if monitor.route == "tor" else \
        ". The site sees a visit from this computer's address"
    if monitor.kind == "mailbox":
        return (f"One sign-in {how} to your mail server {host} over TLS, asking only for new mail from this sender. "
                "Nothing is marked read; images in the mail are never loaded, so the sender learns nothing.")
    if monitor.platform == "bluesky":
        return (f"One request {how} to {host}, Bluesky's public read-only server, naming this handle. That server "
                f"learns you read this account{'; through Tor' if monitor.route == 'tor' else ''}.")
    if monitor.platform == "telegram":
        return (f"One request {how} to t.me for this channel's public web preview{route}. Telegram learns that "
                f"{'a Tor exit' if monitor.route == 'tor' else 'this computer'} read the channel; no account is used.")
    if monitor.kind == "podcast":
        return f"One request {how} to {host} for the feed{route}. The audio file is fetched only when you capture an episode."
    if monitor.kind == "page":
        return f"One request {how} to {host}{route}. Only the page's main text is compared."
    return f"One request {how} to {host}, asking “anything new since my last visit?”{route}."


def serialize_monitor(monitor: Monitor, items: Sequence[MonitorItem] | None = None) -> dict[str, Any]:
    waiting = sum(1 for i in (items or []) if i.monitor_id == monitor.id and i.state in ("waiting", "gone"))
    return {"id": monitor.id, "kind": monitor.kind, "platform": monitor.platform, "url": monitor.url, "name": monitor.name,
            "every_minutes": monitor.every_minutes, "route": monitor.route, "health": monitor.health,
            "health_detail": monitor.health_detail, "moved_to": monitor.moved_to, "checks": monitor.checks or [],
            "last_checked_at": monitor.last_checked_at, "last_ok_at": monitor.last_ok_at,
            "next_check_at": monitor.next_check_at, "robots_allowed": monitor.robots_allowed, "waiting": waiting,
            "leaves": leaves(monitor), "created_by": monitor.created_by, "created_at": monitor.created_at}


def egress(monitors: Sequence[Monitor]) -> dict[str, Any]:
    active = [m for m in monitors if m.kind != "closed"]
    return {"sources": len(monitors), "third_party": 0,
            "direct": sum(1 for m in active if m.platform != "bluesky" and m.route == "direct"),
            "tor": sum(1 for m in active if m.route == "tor"),
            "public_server": sum(1 for m in active if m.platform == "bluesky"),
            "no_monitor": sum(1 for m in monitors if m.kind == "closed")}


def versions(db: Session, monitor_id: str) -> list[dict[str, Any]]:
    rows = db.scalars(select(PageVersion).where(PageVersion.monitor_id == monitor_id).order_by(PageVersion.number.desc())).all()
    def kept(v: PageVersion) -> bool:
        # A version counts as captured once its capture saved the page, not when the capture was asked for.
        if not v.capture_id:
            return bool(v.captured)
        capture = db.get(Capture, v.capture_id)
        return capture is not None and capture.outcome == "saved"

    return [{"id": v.id, "number": v.number, "seen_at": v.seen_at, "sha256": v.text_sha256, "lines_changed": v.lines_changed,
             "diff": v.diff or [], "layout_changes": v.layout_changes or [], "captured": kept(v),
             "capture_id": v.capture_id} for v in rows]


# --- What a person does --------------------------------------------------------------------------------------------

def decide(item: MonitorItem, action: str, actor: str | None, reason: str | None = None) -> None:
    item.decision = {"action": action, "by": actor, "at": utcnow_naive().isoformat(), **({"reason": reason} if reason else {})}


def skip(db: Session, item: MonitorItem, actor: str | None) -> MonitorItem:
    if not claim(db, item, to="skipped", from_states=("waiting", "gone")):
        raise FollowRefused("Only an item waiting in the queue can be skipped")
    decide(item, "skipped", actor)
    db.commit()
    return item


def undo(db: Session, item: MonitorItem, actor: str | None) -> MonitorItem:
    if item.state != "skipped":
        raise FollowRefused("Only a skipped item goes back in the queue")
    item.state = "waiting"
    item.decision = {}
    db.commit()
    return item


def record_removal(db: Session, item: MonitorItem, actor: str | None) -> MonitorItem:
    """A captured item that now answers 404 or 410: the removal itself is recorded (when it was found, what the
    address answered), next to the capture made before."""
    if item.state != "gone":
        raise FollowRefused("Only an item found gone can have its removal recorded")
    item.state = "removal_recorded"
    decide(item, "removal_recorded", actor)
    item.decision = {**item.decision, "status": item.gone_status, "url": item.url}
    db.commit()
    return item


def claim(db: Session, item: MonitorItem, *, to: str, from_states: tuple[str, ...] = ("waiting",)) -> bool:
    """Take the item out of the queue in one statement, so two requests (a double click, Capture all overlapping a
    Skip) cannot both act on it: only the one whose update still finds it in `from_states` goes ahead."""
    done = db.execute(update(MonitorItem).where(MonitorItem.id == item.id, MonitorItem.state.in_(from_states)).values(state=to))
    db.commit()
    db.refresh(item)
    return getattr(done, "rowcount", 0) == 1


def capture_target(db: Session, item: MonitorItem) -> tuple[str, str]:
    """("page", address) to capture as a web page, ("audio", file address) for a podcast episode, or ("email", kept
    file) for a newsletter from a mailbox. Refuses what the capture would do wrong: a page from a source followed
    through Tor (a web capture is a direct visit, ADR-0018, so the route chosen to hide the reporter's address would be
    dropped), and an older version of a followed page (the page shows a newer one now)."""
    monitor = db.get(Monitor, item.monitor_id)
    version_id = (item.extra or {}).get("version_id")
    if version_id:
        version = db.get(PageVersion, version_id)
        latest = db.scalar(select(PageVersion.number).where(PageVersion.monitor_id == item.monitor_id)
                           .order_by(PageVersion.number.desc()).limit(1))
        if version is not None and latest is not None and version.number < latest:
            raise FollowRefused(f"The page has changed since this version: it shows version {latest} now, and only the page "
                                "as it is can be captured")
    if monitor is not None and monitor.kind == "mailbox":
        return "email", str((item.extra or {}).get("eml") or "")
    audio = (item.extra or {}).get("audio") or {}
    if monitor is not None and monitor.kind == "podcast" and audio.get("url"):
        return "audio", str(audio["url"])
    if not item.url:
        raise FollowRefused("This item has no address to capture")
    if monitor is not None and monitor.route == "tor":
        raise FollowRefused("This source is followed through Tor. A capture visits the page directly from this computer, "
                            "and capturing through Tor is not built yet, so it is not started from here")
    return "page", item.url


def mark_captured(db: Session, item: MonitorItem, actor: str | None, *, capture_id: str | None = None,
                  reason: str | None = None) -> None:
    item.state, item.capture_id = "captured", capture_id or item.capture_id
    decide(item, "captured", actor, reason)
    version_id = (item.extra or {}).get("version_id")
    if version_id:
        version = db.get(PageVersion, version_id)
        if version is not None:
            version.captured, version.capture_id = True, capture_id
    db.commit()


def bulk_ready(reason: str | None) -> str:
    text = (reason or "").strip()
    if len(text) < BULK_REASON_MIN:
        raise FollowRefused("Capturing several at once needs a reason (at least 8 characters): it goes in the custody log")
    return text


def fetch_audio(db: Session, item: MonitorItem, actor: str | None) -> str:
    """A podcast episode's audio file, fetched through the guard (public addresses, MAX_MEDIA_BYTES) and kept as a
    recording of the case; the reading job transcribes it. Returns the document id."""
    import httpx

    from app.services.documents import store_document
    from app.services.transcription import is_media
    from app.services.web_capture import _Guard, check_address

    monitor = db.get(Monitor, item.monitor_id)
    if monitor is None:
        raise LookupError("Monitor not found")
    _kind, url = capture_target(db, item)
    check_address(url)
    name = urlsplit(url).path.rsplit("/", 1)[-1] or "episode.mp3"
    if not is_media(name):
        name = f"{name}.mp3" if "mpeg" in str(((item.extra or {}).get("audio") or {}).get("type", "")) else f"{name}.m4a"
    request_id = _log(db, monitor, "GET (episode audio)", url)
    body = bytearray()
    try:
        if monitor.route == "tor":
            proxy, guard = settings.tor_socks_url, None
        else:
            guard = _Guard(budget=settings.max_media_bytes)
            guard.__enter__()
            proxy = guard.url
        try:
            with httpx.Client(proxy=proxy, timeout=120, follow_redirects=True, headers={"User-Agent": USER_AGENT},
                              trust_env=False) as client, client.stream("GET", url) as response:
                if response.status_code != 200:
                    raise FetchFailed("unreachable")
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > settings.max_media_bytes:
                        raise FetchFailed("too_large")
        finally:
            if guard is not None:
                guard.__exit__(None, None, None)
    except (httpx.HTTPError, OSError) as exc:
        from app.services.outbound import mark_outbound_failed

        mark_outbound_failed(db, request_id)
        raise FollowRefused(f"The episode could not be fetched: {reason_of(exc)}") from exc
    doc = store_document(db, investigation_id=item.investigation_id, title=item.title or name, filename=name,
                         mime_type=None, data=bytes(body), storage_dir=Path(settings.document_storage_dir),
                         source_metadata={"followed_from": monitor.url, "episode": item.url, "audio_url": url,
                                          "collected_by": actor, "route": f"Following, {monitor.route}"})
    item.document_id = doc.id
    _publisher_extras(db, monitor, item, doc)
    return doc.id


def _publisher_extras(db: Session, monitor: Monitor, item: MonitorItem, doc: Any) -> None:
    """The episode's own transcript and chapters, when the feed names them: fetched now, through the same route, each
    request logged, and kept on the episode's source as they came (app/services/publisher_transcript.py)."""
    from app.models.domain import Source
    from app.services import publisher_transcript
    from app.services.outbound import mark_outbound_failed

    source = db.get(Source, doc.source_id)
    if source is None:
        return
    for key, what, accept in (("publisher_transcript", "GET (the publisher's transcript)", "text/vtt, application/x-subrip, application/json, */*;q=0.5"),
                              ("chapters", "GET (the episode's chapters)", "application/json+chapters, application/json, */*;q=0.5")):
        named = (item.extra or {}).get(key) or {}
        url = named.get("url")
        if not url:
            continue
        request_id = _log(db, monitor, what, url)
        try:
            got = fetch(url, route=monitor.route, accept=accept)
            if got.status != 200:
                raise FetchFailed("unreachable")
            if len(got.body) > publisher_transcript.MAX_BYTES:
                raise FetchFailed("too_large")
            publisher_transcript.keep(db, source, key, url=url, kind=named.get("type"), body=got.body)
        except (OSError, ValueError) as exc:
            mark_outbound_failed(db, request_id)
            publisher_transcript.keep(db, source, key, url=url, kind=named.get("type"), body=None, error=reason_of(exc))
    db.commit()
