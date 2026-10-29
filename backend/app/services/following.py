"""Following (ADR-0021): the app watches open sources for a case; a person captures.

A monitor is an address polled on a schedule: a feed, a sitemap, a podcast's feed, a YouTube channel's feed, or a page
whose text is watched for changes. A poll asks "anything new since my last visit?" (a conditional GET), politely: one
request to a host at a time with a pause between, the site's robots.txt obeyed, Retry-After honoured, and a
backed-off schedule after a failure. What it finds becomes items waiting in the at-risk queue, never a kept page: only
a capture (app/services/web_capture.py), started by a person, keeps one (EGS rule 8).

Every request goes to a public address only, looked up once and connected to by that address (the same rule as a
capture, ADR-0018), directly or through a Tor the reporter runs. Each poll is written to the outbound log before it
goes (ADR-0015).
"""

from __future__ import annotations

import difflib
import hashlib
import logging
import random
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Callable
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import httpx
from lxml import etree
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import Capture, Investigation, Monitor, MonitorItem, MonitorVersion
from app.services import web_capture
from app.services.html_reader import html_blocks

logger = logging.getLogger("journalism.following")

KINDS = ("feed", "sitemap", "page", "podcast", "youtube")
ROUTES = ("direct", "tor")
INTERVALS = (15, 30, 60, 1440)  # the four on offer; any whole number of minutes from 5 up to a week is accepted
USER_AGENT_TOKEN = "JournalismWorkbench"
USER_AGENT = f"{USER_AGENT_TOKEN}/1.0 (following; one visit from a reporter's own computer)"
MAX_ITEMS_PER_POLL = 2000
MAX_VERSION_TEXT = 200_000
MAX_BACKOFF = timedelta(hours=24)
MAX_SITE_WAIT = timedelta(days=30)
ROBOTS_KEEP = timedelta(hours=1)
# Each at-risk flag's weight in the queue's order: gone first, then edited, then a changed page, then plain new.
RISK = {"gone": 3, "edited": 2, "changed": 1}


class FollowRefused(ValueError):
    """The address, kind, route or interval is not one a monitor can have."""


# --- Fetching ----------------------------------------------------------------------------------------------------

@dataclass
class Fetched:
    status: int
    headers: dict[str, str]
    body: bytes
    url: str
    truncated: bool = False


class FetchFailed(Exception):
    """The request could not be made or never finished: a refused address, no route, a timeout, a reset. `reason` is
    one of the app's own sentences, never the network library's text, so nothing internal reaches the screen."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _network_reason(exc: BaseException, route: str) -> str:
    if isinstance(exc, httpx.ProxyError) or (route == "tor" and isinstance(exc, httpx.ConnectError)):
        return "the Tor on this computer did not answer"
    if isinstance(exc, httpx.TimeoutException):
        return "it did not answer in time"
    if isinstance(exc, httpx.ConnectError):
        return "the connection could not be made"
    if isinstance(exc, (httpx.RemoteProtocolError, httpx.ReadError)):
        return "the connection broke off"
    return "the request failed"


_hosts_lock = threading.Lock()
_host_locks: dict[str, threading.Lock] = {}
_last_finished: dict[str, float] = {}


def _host_lock(host: str) -> threading.Lock:
    with _hosts_lock:
        return _host_locks.setdefault(host, threading.Lock())


def _netloc_for_ip(ip: str, port: int | None, scheme: str) -> str:
    host = f"[{ip}]" if ":" in ip else ip
    return host if port is None or port == (443 if scheme == "https" else 80) else f"{host}:{port}"


def guarded_get(url: str, headers: dict[str, str] | None = None, *, route: str = "direct") -> Fetched:
    """One GET, no redirects followed. Direct: the host is looked up once, every address must be public, and the
    connection goes to that address with the name kept for the Host header and the certificate. Tor: the request goes
    through the reporter's own Tor, which looks the name up itself (an address given as numbers is still checked here)."""
    try:
        web_capture.check_address(url)
    except web_capture.CaptureRefused as exc:
        raise FetchFailed("it is not a public web address") from exc
    parts = urlsplit(url)
    host = (parts.hostname or "").rstrip(".").lower()
    sent = {"User-Agent": USER_AGENT, "Accept": "*/*", "Accept-Encoding": "gzip, deflate", **(headers or {})}
    # One request to a host at a time, held until its answer is read, and a pause after it before the next one.
    with _host_lock(host):
        gap = settings.follow_host_gap_seconds
        wait = _last_finished.get(host, 0.0) + gap - time.monotonic() if gap > 0 else 0
        if wait > 0:
            time.sleep(wait)
        try:
            return _get(url, parts, host, sent, route)
        finally:
            _last_finished[host] = time.monotonic()


def _get(url: str, parts: Any, host: str, sent: dict[str, str], route: str) -> Fetched:
    limit = settings.follow_max_megabytes * 1024 * 1024
    timeout = settings.follow_timeout_seconds
    # The client's timeout covers each wait for data; this covers the whole answer, so a site that trickles bytes
    # cannot hold the scheduler up.
    deadline = time.monotonic() + timeout * 2
    try:
        if route == "tor":
            client = httpx.Client(proxy=settings.tor_socks_url, timeout=timeout, follow_redirects=False)
            target, extensions = url, {}
        else:
            infos = web_capture.resolve_public(host, parts.port or (443 if parts.scheme == "https" else 80))
            if not infos:
                raise FetchFailed("it is not a public web address, or could not be found")
            ip = str(infos[0][4][0]).split("%", 1)[0]
            client = httpx.Client(timeout=timeout, follow_redirects=False, trust_env=False)
            target = urlunsplit((parts.scheme, _netloc_for_ip(ip, parts.port, parts.scheme), parts.path or "/", parts.query, ""))
            sent["Host"] = parts.netloc.rsplit("@", 1)[-1]
            extensions = {"sni_hostname": host}
        with client:
            with client.stream("GET", target, headers=sent, extensions=extensions) as response:
                chunks: list[bytes] = []
                total = 0
                truncated = False
                for chunk in response.iter_bytes():
                    if time.monotonic() > deadline:
                        raise FetchFailed("it took too long to answer")
                    total += len(chunk)
                    if total > limit:
                        truncated = True
                        break
                    chunks.append(chunk)
                return Fetched(response.status_code, {k.lower(): v for k, v in response.headers.items()}, b"".join(chunks), url, truncated)
    except FetchFailed:
        raise
    except (httpx.HTTPError, OSError, ValueError) as exc:
        logger.info("following: request to %s failed", host, exc_info=True)
        raise FetchFailed(_network_reason(exc, route)) from exc


# --- robots.txt (decision 4: a monitor is a robot, so it obeys) ------------------------------------------------------

_robots_lock = threading.Lock()
_robots: dict[tuple[str, str], tuple[datetime, RobotFileParser | None, str | None]] = {}


def _robots_for(url: str, route: str, fetch: Callable[..., Fetched], now: datetime) -> tuple[RobotFileParser | None, str | None]:
    """The host's robots.txt as a parser (None: nothing forbids), or the reason it could not be read. Kept an hour."""
    parts = urlsplit(url)
    key = (f"{parts.scheme}://{parts.netloc}", route)
    with _robots_lock:
        kept = _robots.get(key)
    if kept is not None and now - kept[0] < ROBOTS_KEEP:
        return kept[1], kept[2]
    parser: RobotFileParser | None = None
    problem: str | None = None
    # A site that cannot be reached at all raises FetchFailed to the poll, which records it as unreachable. Redirects
    # are followed, up to five (RFC 9309), each through the same guarded request; rules that cannot be reached that
    # way mean the site is not polled.
    address = f"{key[0]}/robots.txt"
    got = fetch(address, {"Accept": "text/plain"}, route=route)
    for _ in range(5):
        if got.status not in (301, 302, 303, 307, 308):
            break
        address = _absolute(address, got.headers.get("location"))
        if not address:
            break
        got = fetch(address, {"Accept": "text/plain"}, route=route)
    if got.status in (301, 302, 303, 307, 308):
        problem = "robots.txt redirects and its rules could not be read, so the site is not polled for now"
    elif got.status == 200:
        parser = RobotFileParser()
        parser.parse(got.body.decode("utf-8", "replace").splitlines())
    elif got.status in (401, 403) or got.status >= 500:
        # RFC 9309: a server error, or an access wall on robots.txt, means do not crawl for now.
        problem = f"robots.txt answered {got.status}, so the site is not polled for now"
    with _robots_lock:
        _robots[key] = (now, parser, problem)
    return parser, problem


def forget_robots() -> None:
    with _robots_lock:
        _robots.clear()


# --- Reading what came back ----------------------------------------------------------------------------------------

def _local(tag: Any) -> str:
    return etree.QName(tag).localname if isinstance(tag, str) else ""


def _text(el: Any) -> str:
    return " ".join("".join(el.itertext()).split()) if el is not None else ""


def _child(el: Any, *names: str) -> Any:
    for c in el:
        if _local(c.tag) in names:
            return c
    return None


def _parse_xml(body: bytes) -> Any:
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False, recover=False, dtd_validation=False)
    try:
        return etree.fromstring(body, parser)
    except etree.XMLSyntaxError as exc:
        raise ValueError("it is not well-formed XML") from exc


def _absolute(base: str, link: str | None) -> str:
    link = (link or "").strip()
    if not link:
        return ""
    joined = urljoin(base, link)
    return joined if web_capture.is_web_address(joined) else ""


def parse_feed(body: bytes, base: str) -> tuple[str | None, list[dict[str, Any]]]:
    """An RSS, RDF or Atom feed (a podcast's and a YouTube channel's too): its title and its entries as displayed."""
    root = _parse_xml(body)
    kind = _local(root.tag)
    entries: list[dict[str, Any]] = []
    if kind == "feed":  # Atom
        title = _text(_child(root, "title")) or None
        for e in root:
            if _local(e.tag) != "entry":
                continue
            link = ""
            for l in e:
                if _local(l.tag) == "link" and (l.get("rel") in (None, "alternate")):
                    link = l.get("href") or link
            item = {"key": _text(_child(e, "id")) or link, "url": _absolute(base, link), "title": _text(_child(e, "title")),
                    "published": _text(_child(e, "published")) or _text(_child(e, "updated")),
                    "updated": _text(_child(e, "updated")), "summary": _text(_child(e, "summary", "content")),
                    "author": _text(_child(_child(e, "author"), "name")) if _child(e, "author") is not None else ""}
            for g in e.iter():  # YouTube: media:group / media:description, yt:videoId
                if _local(g.tag) == "videoId":
                    item["video_id"] = _text(g)
                if _local(g.tag) == "description" and not item["summary"]:
                    item["summary"] = _text(g)
            entries.append(item)
    elif kind in ("rss", "RDF"):
        channel = _child(root, "channel") if kind == "rss" else root
        if channel is None:
            raise ValueError("it has no channel")
        title = _text(_child(channel, "title")) or None
        holder = channel if kind == "rss" else root
        for e in holder:
            if _local(e.tag) != "item":
                continue
            link = _text(_child(e, "link"))
            guid = _text(_child(e, "guid"))
            item = {"key": guid or link or _text(_child(e, "title")), "url": _absolute(base, link or (guid if guid.startswith("http") else "")),
                    "title": _text(_child(e, "title")), "published": _text(_child(e, "pubDate", "date")), "updated": "",
                    "summary": _text(_child(e, "description", "encoded", "summary")), "author": _text(_child(e, "creator", "author"))}
            for c in e:
                name = _local(c.tag)
                if name == "enclosure" and c.get("url"):
                    item["audio"] = c.get("url")
                    item["audio_type"] = c.get("type") or ""
                    item["audio_bytes"] = c.get("length") or ""
                elif name == "transcript" and c.get("url"):  # podcast:transcript
                    item["transcript"] = c.get("url")
                    item["transcript_type"] = c.get("type") or ""
            entries.append(item)
    else:
        raise ValueError("it is not an RSS or Atom feed")
    return title, [x for x in entries if x["key"] and x["url"]][:MAX_ITEMS_PER_POLL]


def parse_sitemap(body: bytes, base: str) -> tuple[str | None, list[dict[str, Any]]]:
    """A sitemap's addresses (a news sitemap's titles and dates too). A sitemap index lists sitemaps, not pages, and is
    refused with that reason: follow the one wanted."""
    root = _parse_xml(body)
    kind = _local(root.tag)
    if kind == "sitemapindex":
        raise ValueError("it is an index of sitemaps: follow one of the sitemaps it lists")
    if kind != "urlset":
        raise ValueError("it is not a sitemap")
    entries = []
    for u in root:
        if _local(u.tag) != "url":
            continue
        loc = _absolute(base, _text(_child(u, "loc")))
        if not loc:
            continue
        item = {"key": loc, "url": loc, "title": "", "published": _text(_child(u, "lastmod")), "updated": _text(_child(u, "lastmod")),
                "summary": "", "author": ""}
        for n in u.iter():
            name = _local(n.tag)
            if name == "title" and not item["title"]:
                item["title"] = _text(n)
            elif name == "publication_date":
                item["published"] = _text(n)
        entries.append(item)
    return None, entries[:MAX_ITEMS_PER_POLL]


def _decoded(got: Fetched) -> str:
    charset = "utf-8"
    ctype = got.headers.get("content-type", "")
    if "charset=" in ctype:
        charset = ctype.split("charset=", 1)[1].split(";")[0].strip().strip('"') or charset
    try:
        return got.body.decode(charset, "replace")
    except LookupError:
        return got.body.decode("utf-8", "replace")


def _xml_kind(got: Fetched) -> str | None:
    """feed or sitemap when the answer is one, else None."""
    for kind, parse in (("feed", parse_feed), ("sitemap", parse_sitemap)):
        try:
            parse(got.body, got.url)
            return kind
        except ValueError:
            continue
    return None


def looks_like_html(got: Fetched) -> bool:
    head = got.body[:2048].lstrip().lower()
    return head.startswith((b"<!doctype html", b"<html")) or "text/html" in got.headers.get("content-type", "")


# --- Making and changing a monitor --------------------------------------------------------------------------------------

def infer_kind(url: str) -> str:
    parts = urlsplit(url)
    host, path = (parts.hostname or "").lower(), parts.path.lower()
    if host in ("youtube.com", "www.youtube.com") and path == "/feeds/videos.xml":
        return "youtube"
    if "sitemap" in path and path.endswith((".xml", ".xml.gz")):
        return "sitemap"
    if path.endswith((".rss", ".atom", "/feed", "/feed/", "/rss", "/rss/")) or "rss" in path or "feed" in path:
        return "feed"
    return "page"


def _check_settings(kind: str, interval: int, route: str) -> None:
    if kind not in KINDS:
        raise FollowRefused(f"A monitor is one of: {', '.join(KINDS)}")
    if route not in ROUTES:
        raise FollowRefused("The route is direct or tor")
    if not 5 <= interval <= 7 * 24 * 60:
        raise FollowRefused("Look every 5 minutes to 7 days")


def create_monitor(db: Session, investigation_id: str, url: str, *, kind: str | None = None, interval_minutes: int = 30,
                   route: str = "direct", title: str | None = None, created_by: str | None = None) -> Monitor:
    url = url.strip()
    try:
        web_capture.check_address(url)
    except web_capture.CaptureRefused as exc:
        raise FollowRefused(str(exc)) from exc
    kind = kind or infer_kind(url)
    _check_settings(kind, interval_minutes, route)
    if db.get(Investigation, investigation_id) is None:
        raise LookupError("Investigation not found")
    if db.scalar(select(Monitor.id).where(Monitor.investigation_id == investigation_id, Monitor.url == url)):
        raise FollowRefused("This address is already followed in this case")
    row = Monitor(investigation_id=investigation_id, kind=kind, url=url, title=(title or "").strip() or None,
                  interval_minutes=interval_minutes, route=route, created_by=created_by or "you", last_poll={},
                  next_check_at=utcnow_naive())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_monitor(db: Session, row: Monitor, changes: dict[str, Any]) -> Monitor:
    """Kind, interval, route, title, paused or resumed, and the address (to accept where it moved to)."""
    interval = int(changes.get("interval_minutes") or row.interval_minutes)  # a null leaves it as it is
    route = changes.get("route") or row.route
    kind = changes.get("kind") or row.kind
    _check_settings(kind, interval, route)
    if kind != row.kind:  # read afresh as the new kind: the last answer's ETag must not hide it
        row.kind, row.etag, row.last_modified, row.next_check_at = kind, None, None, utcnow_naive()
    if changes.get("url") and changes["url"].strip() != row.url:
        new = changes["url"].strip()
        try:
            web_capture.check_address(new)
        except web_capture.CaptureRefused as exc:
            raise FollowRefused(str(exc)) from exc
        row.url, row.etag, row.last_modified, row.moved_to, row.health, row.health_reason = new, None, None, None, "waiting", None
        row.failures, row.next_check_at = 0, utcnow_naive()
    row.interval_minutes, row.route = interval, route
    if "title" in changes:
        row.title = (changes["title"] or "").strip() or None
    if changes.get("active") is not None:
        row.active = bool(changes["active"])
        if row.active:
            row.next_check_at = utcnow_naive()
            row.failures = 0
    db.commit()
    return row


def delete_monitor(db: Session, row: Monitor) -> None:
    """Stop following. What the monitor found goes with it; captures a person made from it stay, they are the case's."""
    # In this order, flushed: the items and versions point at the monitor, and PostgreSQL checks each delete. A copy
    # elsewhere of one of these items becomes an original again.
    mine = select(MonitorItem.id).where(MonitorItem.monitor_id == row.id).scalar_subquery()
    db.execute(update(MonitorItem).where(MonitorItem.copy_of.in_(mine), MonitorItem.monitor_id != row.id).values(copy_of=None, similarity=None))
    db.execute(update(MonitorItem).where(MonitorItem.monitor_id == row.id).values(copy_of=None))
    db.execute(delete(MonitorItem).where(MonitorItem.monitor_id == row.id))
    db.execute(delete(MonitorVersion).where(MonitorVersion.monitor_id == row.id))
    db.flush()
    db.delete(row)
    db.commit()


# --- One poll -----------------------------------------------------------------------------------------------------------

def _schedule(row: Monitor, now: datetime, *, ok: bool, wait: timedelta | None = None) -> None:
    every = timedelta(minutes=row.interval_minutes)
    if ok:
        row.failures = 0
        delay = every * random.uniform(0.9, 1.1)  # jitter, so monitors do not all poll on the minute
    else:
        row.failures += 1
        delay = min(every * (2 ** min(row.failures, 6)), MAX_BACKOFF)
    if wait is not None:
        # The site's own wait is kept in full (only the app's backoff is capped), short of an absurd one.
        delay = max(delay, min(wait, MAX_SITE_WAIT))
    row.next_check_at = now + delay


def _retry_after(headers: dict[str, str], now: datetime) -> timedelta | None:
    raw = headers.get("retry-after", "").strip()
    if not raw:
        return None
    if raw.isdigit():
        return timedelta(seconds=int(raw))
    try:
        when = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return None
    if when.tzinfo is not None:
        when = when.astimezone(timezone.utc).replace(tzinfo=None)
    return max(timedelta(0), when - now)


def _hash(*parts: str) -> str:
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


@dataclass
class _Outcome:
    seen: int = 0
    new: int = 0
    not_modified: bool = False
    flagged: list[str] = field(default_factory=list)


def _record_entries(db: Session, row: Monitor, entries: list[dict[str, Any]], now: datetime) -> _Outcome:
    out = _Outcome(seen=len(entries))
    fresh: list[MonitorItem] = []
    known = {i.key: i for i in db.scalars(select(MonitorItem).where(MonitorItem.monitor_id == row.id)).all()}
    for e in entries:
        digest = _hash(e["title"], e["summary"], e.get("updated", ""))
        displayed = {k: v for k, v in e.items() if k not in ("key", "url", "title") and v}
        item = known.get(e["key"])
        if item is None:
            made = MonitorItem(investigation_id=row.investigation_id, monitor_id=row.id, key=e["key"], url=e["url"],
                               title=e["title"] or None, displayed=displayed, content_hash=digest, flags=[], state="new",
                               first_seen_at=now, last_seen_at=now)
            db.add(made)
            fresh.append(made)
            out.new += 1
            continue
        item.last_seen_at = now
        if item.state == "new" and e["url"] != item.url:  # the publisher moved the entry: capture where it is now
            item.url = e["url"]
        if item.content_hash != digest:
            item.content_hash, item.title, item.displayed = digest, e["title"] or item.title, displayed
            item.edits += 1
            if "edited" not in item.flags:
                item.flags = [*item.flags, "edited"]
    if fresh:
        db.flush()
        mark_copies(db, row.investigation_id, fresh, now)
    return out


# --- The same story, counted once (research §5.1, §7: "restates, does not establish") -------------------------------
# Two entries are the same story when most of their wording is the same: the share of three-word runs they have in
# common (Jaccard over shingles) of their title and summary. The earliest is the original and stays in the queue; a
# later one is its copy, kept out of the queue and not offered for capture. Exact copies score 1.0.

COPY_THRESHOLD = 0.7
COPY_WINDOW = timedelta(days=14)
MIN_WORDS = 8
_WORD = re.compile(r"[\w']+", re.UNICODE)


def shingles(text: str, size: int = 3) -> set[tuple[str, ...]]:
    words = _WORD.findall(text.lower())
    if len(words) < MIN_WORDS:
        return set()
    return {tuple(words[i:i + size]) for i in range(len(words) - size + 1)}


def similarity(a: set[tuple[str, ...]], b: set[tuple[str, ...]]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def _wording(item: MonitorItem) -> str:
    return f"{item.title or ''} {(item.displayed or {}).get('summary', '')}"


def mark_copies(db: Session, investigation_id: str, fresh: list[MonitorItem], now: datetime) -> None:
    """Point each new entry at the earliest entry with the same wording, if there is one."""
    earlier = list(db.scalars(select(MonitorItem).where(
        MonitorItem.investigation_id == investigation_id, MonitorItem.copy_of.is_(None),
        MonitorItem.first_seen_at >= now - COPY_WINDOW).order_by(MonitorItem.first_seen_at, MonitorItem.id).limit(2000)).all())
    fresh_ids = {f.id for f in fresh}
    seen = [(e, shingles(_wording(e))) for e in earlier if e.id not in fresh_ids and not (e.displayed or {}).get("version")]
    for item in fresh:
        mine = shingles(_wording(item))
        if not mine:
            continue
        best, score = None, 0.0
        for other, theirs in seen:
            s = similarity(mine, theirs)
            if s > score:
                best, score = other, s
        if best is not None and score >= COPY_THRESHOLD:
            item.copy_of, item.similarity = best.id, round(score, 3)
        else:
            seen.append((item, mine))  # an original: a later entry in the same poll may copy it


def _changed_lines(before: str, after: str) -> tuple[int, int]:
    added = removed = 0
    for line in difflib.ndiff(before.splitlines(), after.splitlines()):
        if line.startswith("+ "):
            added += 1
        elif line.startswith("- "):
            removed += 1
    return added, removed


def _record_page(db: Session, row: Monitor, got: Fetched, now: datetime) -> _Outcome:
    text = "\n".join(html_blocks(_decoded(got)))[:MAX_VERSION_TEXT]
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    last = db.scalars(select(MonitorVersion).where(MonitorVersion.monitor_id == row.id).order_by(MonitorVersion.number.desc())).first()
    out = _Outcome(seen=1)
    if last is not None and last.text_sha256 == digest:
        return out
    number = (last.number if last else 0) + 1
    added, removed = _changed_lines(last.text, text) if last else (0, 0)
    db.add(MonitorVersion(investigation_id=row.investigation_id, monitor_id=row.id, number=number, text_sha256=digest, text=text,
                          lines_added=added, lines_removed=removed, seen_at=now))
    db.add(MonitorItem(investigation_id=row.investigation_id, monitor_id=row.id, key=f"{row.url}#v{number}", url=row.url,
                       title=row.title or urlsplit(row.url).netloc, content_hash=digest, edits=0,
                       flags=["changed"] if last else [], state="new", first_seen_at=now, last_seen_at=now,
                       displayed={"version": number, "lines_added": added, "lines_removed": removed}))
    out.new = 1
    return out


def poll_monitor(db: Session, row: Monitor, *, now: datetime | None = None, fetch: Callable[..., Fetched] | None = None,
                 actor: str = "scheduler") -> dict[str, Any]:
    """Look once. Records what was found and when to look next; never raises for a site that fails (that is its
    health), and writes the visit to the outbound log first."""
    from app.services.outbound import mark_outbound_failed, record_outbound

    fetch = fetch or guarded_get
    now = now or utcnow_naive()
    started = time.monotonic()
    request_id = record_outbound(
        db, row.investigation_id, service="following", kind="monitor poll", value=row.url, actor=actor,
        reason=f"Following: asks whether anything is new since the last visit ({'through Tor' if row.route == 'tor' else 'direct'})",
        source={"monitor_id": row.id, "host": urlsplit(row.url).hostname})
    row.last_checked_at = now
    outcome = _Outcome()
    health, reason, wait, ok = "ok", None, None, True
    try:
        parser, problem = _robots_for(row.url, row.route, fetch, now)
        row.robots_checked_at = now
        if problem is not None:
            health, reason, ok = "blocked", problem, False
        elif parser is not None and not parser.can_fetch(USER_AGENT_TOKEN, row.url):
            health, reason, ok = "blocked", "The site's robots.txt asks robots not to fetch this address, so it is not followed (a person can still capture it)", False
        else:
            conditional = {}
            if row.etag:
                conditional["If-None-Match"] = row.etag
            if row.last_modified:
                conditional["If-Modified-Since"] = row.last_modified
            got = fetch(row.url, conditional, route=row.route)
            row.http_status = got.status
            wait = _retry_after(got.headers, now)
            if got.status == 304:
                outcome.not_modified = True
            elif got.status in (301, 302, 303, 307, 308):
                target = _absolute(row.url, got.headers.get("location"))
                same = target and (urlsplit(target).hostname or "").removeprefix("www.") == (urlsplit(row.url).hostname or "").removeprefix("www.")
                if same:  # http to https, a trailing slash: the same site answers there, under its own robots.txt
                    there, there_problem = _robots_for(target, row.route, fetch, now)
                    if there_problem is not None:
                        health, reason, ok = "blocked", there_problem, False
                    elif there is not None and not there.can_fetch(USER_AGENT_TOKEN, target):
                        health, reason, ok = "blocked", "The address redirects to one the site's robots.txt asks robots not to fetch, so it is not followed", False
                    else:
                        got = fetch(target, conditional, route=row.route)
                        row.http_status = got.status
                        wait = _retry_after(got.headers, now)
                        outcome.not_modified = got.status == 304
                else:
                    health, ok = "moved", False
                    row.moved_to = target or None
                    reason = f"The address now points to {target}" if target else "The address redirects, and the new one is not usable"
            if health == "ok" and got.status == 200:
                try:
                    if got.truncated:
                        raise ValueError(f"it is larger than {settings.follow_max_megabytes} MB")
                    if row.kind == "page" and not looks_like_html(got):
                        # An address that read as a page but answers with a feed or a sitemap is followed as one.
                        row.kind = _xml_kind(got) or row.kind
                    if row.kind == "page":
                        outcome = _record_page(db, row, got, now)
                    else:
                        if looks_like_html(got):
                            raise ValueError("it is a web page, not a feed: follow it as a page instead")
                        title, entries = (parse_sitemap if row.kind == "sitemap" else parse_feed)(got.body, row.url)
                        if title and not row.title:
                            row.title = title
                        outcome = _record_entries(db, row, entries, now)
                except ValueError as exc:
                    health, ok, reason = "broken", False, f"The address answered, but {exc}"
                if ok:
                    row.etag, row.last_modified, row.moved_to = got.headers.get("etag"), got.headers.get("last-modified"), None
            elif health == "ok" and got.status != 304:
                ok = False
                if got.status in (401, 402, 403, 407):
                    health, reason = "blocked", f"The site answered {got.status}: a login wall, a paywall or a block on automated visits. The app never logs in"
                elif got.status in (404, 410):
                    health, reason = "broken", f"The address answers {got.status}: nothing is there now"
                elif got.status in (429, 503) and wait is not None:
                    health, reason = "broken", f"The site asked to be left alone for {int(wait.total_seconds() // 60) or 1} min (HTTP {got.status})"
                else:
                    health, reason = "broken", f"The site answered HTTP {got.status}"
    except FetchFailed as exc:
        mark_outbound_failed(db, request_id)
        health, ok, reason = "broken", False, f"Could not reach it: {exc.reason}"
        row.http_status = None
    row.health, row.health_reason = health, reason
    if ok:
        row.last_ok_at = now
    _schedule(row, now, ok=ok, wait=wait)
    row.last_poll = {"at": now.isoformat(), "items_seen": outcome.seen, "items_new": outcome.new, "not_modified": outcome.not_modified,
                     "seconds": round(time.monotonic() - started, 2)}
    db.commit()
    return row.last_poll


def due_monitors(db: Session, now: datetime, limit: int) -> list[Monitor]:
    return list(db.scalars(select(Monitor).where(Monitor.active.is_(True), (Monitor.next_check_at.is_(None)) | (Monitor.next_check_at <= now))
                           .order_by(Monitor.next_check_at).limit(limit)).all())


def poll_due(db: Session) -> dict[str, int]:
    """The scheduler's task (app/jobs/schedule.py): poll each monitor that is due, a few a minute at most."""
    now = utcnow_naive()
    polled = 0
    for row in due_monitors(db, now, settings.follow_max_per_tick):
        try:
            poll_monitor(db, row, now=now)
            polled += 1
        except Exception:
            db.rollback()
            logger.warning("following: polling %s failed", row.id, exc_info=True)
    return {"polled": polled}


# --- Is a captured page still there? (mockup FOLLOW_1, "Gone") ------------------------------------------------------
# Once a day each page a person captured from a followed source is asked for again, as politely as a poll (robots.txt,
# the same guarded request, one line in the outbound log). A 404 or 410 means the site removed it: a "gone" item joins
# the queue, so a person can record that the capture is now the only copy. Nothing else is read or kept.

RECHECK_EVERY = timedelta(days=1)
RECHECKS_PER_TICK = 6


def recheck_captured(db: Session, *, now: datetime | None = None, fetch: Callable[..., Fetched] | None = None) -> dict[str, int]:
    from app.services.outbound import mark_outbound_failed, record_outbound

    fetch = fetch or guarded_get
    now = now or utcnow_naive()
    rows = db.execute(
        select(MonitorItem, Monitor).join(Monitor, Monitor.id == MonitorItem.monitor_id).join(Capture, Capture.id == MonitorItem.capture_id)
        .where(MonitorItem.state == "captured", Monitor.active.is_(True), Monitor.route == "direct", Capture.outcome == "saved",
               ~MonitorItem.key.endswith("#gone"),
               (MonitorItem.rechecked_at.is_(None)) | (MonitorItem.rechecked_at <= now - RECHECK_EVERY))
        .order_by(MonitorItem.rechecked_at.is_not(None), MonitorItem.rechecked_at).limit(RECHECKS_PER_TICK)).all()
    gone = 0
    for item, monitor in rows:
        item.rechecked_at = now
        db.commit()
        if db.scalar(select(MonitorItem.id).where(MonitorItem.monitor_id == item.monitor_id, MonitorItem.key == f"{item.url}#gone")):
            continue
        try:
            parser, problem = _robots_for(item.url, monitor.route, fetch, now)
            if problem is not None or (parser is not None and not parser.can_fetch(USER_AGENT_TOKEN, item.url)):
                continue
            request_id = record_outbound(
                db, item.investigation_id, service="following", kind="capture recheck", value=item.url, actor="scheduler",
                reason="Following: asks whether a captured page is still there (direct)",
                source={"monitor_id": monitor.id, "item_id": item.id, "host": urlsplit(item.url).hostname})
            try:
                got = fetch(item.url, {}, route=monitor.route)
            except FetchFailed:
                mark_outbound_failed(db, request_id)
                continue
        except FetchFailed:
            continue
        if got.status in (404, 410):
            capture = db.get(Capture, item.capture_id) if item.capture_id else None
            kept_at = (capture.captured_at or capture.finished_at) if capture is not None else None
            db.add(MonitorItem(investigation_id=item.investigation_id, monitor_id=item.monitor_id, key=f"{item.url}#gone", url=item.url,
                               title=item.title, flags=["gone"], state="new", first_seen_at=now, last_seen_at=now,
                               displayed={"http_status": got.status, "capture_id": item.capture_id,
                                          "captured_at": kept_at.isoformat() if kept_at is not None else None}))
            db.commit()
            gone += 1
    return {"rechecked": len(rows), "gone": gone}


# --- Reading it back ----------------------------------------------------------------------------------------------------

def host_of(row: Monitor) -> str:
    return urlsplit(row.url).hostname or row.url


def egress_line(row: Monitor) -> str:
    every = row.interval_minutes
    cadence = f"every {every} minutes" if every < 60 else ("every hour" if every == 60 else (f"every {every // 60} hours" if every % 60 == 0 and every != 1440 else "once a day"))
    if row.route == "tor":
        return (f"One request {cadence} for {host_of(row)}, sent through the Tor on this computer, asking \"anything new since my last visit?\". "
                "The site sees a Tor exit address, not this computer's.")
    return (f"One request {cadence} to {host_of(row)}, asking \"anything new since my last visit?\" (an ETag). "
            "The site sees a visit from this computer's address.")


def serialize_monitor(db: Session, row: Monitor) -> dict[str, Any]:
    new = len(db.scalars(select(MonitorItem.id).where(MonitorItem.monitor_id == row.id, MonitorItem.state == "new",
                                                      MonitorItem.copy_of.is_(None))).all())  # a copy waits with its original
    versions = len(db.scalars(select(MonitorVersion.id).where(MonitorVersion.monitor_id == row.id)).all())
    return {
        "id": row.id, "investigation_id": row.investigation_id, "kind": row.kind, "url": row.url, "host": host_of(row),
        "title": row.title, "interval_minutes": row.interval_minutes, "route": row.route, "active": row.active,
        "health": "paused" if not row.active else row.health, "health_reason": row.health_reason, "http_status": row.http_status,
        "failures": row.failures, "moved_to": row.moved_to, "last_checked_at": row.last_checked_at, "last_ok_at": row.last_ok_at,
        "next_check_at": row.next_check_at if row.active else None, "last_poll": row.last_poll or {}, "new_items": new,
        "versions": versions, "egress": egress_line(row), "created_by": row.created_by, "created_at": row.created_at,
    }


def _risk(item: MonitorItem) -> int:
    return sum(RISK.get(f, 0) for f in item.flags or []) + min(item.edits, 3)


def capture_blocker(db: Session, item: MonitorItem, monitor: Monitor | None) -> str | None:
    """Why this item cannot be captured from here, or None. A capture is a direct visit from this computer (ADR-0018),
    so an item from a source followed through Tor is not captured that way: the route chosen to hide the reporter's
    address would be dropped. An older version of a watched page cannot be captured: the page shows a newer one now."""
    if "gone" in (item.flags or []):
        return f"Nothing to capture: the address answers {(item.displayed or {}).get('http_status', 404)} now. Your capture is the copy that remains"
    if item.copy_of:
        original = db.get(MonitorItem, item.copy_of)
        return (f"A copy of “{original.title if original else 'an earlier entry'}”, seen first: copies restate one text and do "
                "not support each other, so only the earliest is offered for capture")
    if monitor is not None and monitor.route == "tor":
        return ("This source is followed through Tor. A capture visits the page directly from this computer, and "
                "capturing through Tor is not built yet, so it is not started from here")
    number = (item.displayed or {}).get("version")
    if number:
        latest = db.scalar(select(MonitorVersion.number).where(MonitorVersion.monitor_id == item.monitor_id)
                           .order_by(MonitorVersion.number.desc()).limit(1))
        if latest is not None and number < latest:
            return f"The page has changed since this version: it shows version {latest} now, and only the page as it is can be captured"
    return None


def serialize_item(row: MonitorItem, monitor: Monitor | None = None, blocked: str | None = None, copies: int = 0) -> dict[str, Any]:
    return {
        "id": row.id, "monitor_id": row.monitor_id, "monitor_kind": monitor.kind if monitor else None,
        "monitor_title": (monitor.title or host_of(monitor)) if monitor else None, "url": row.url, "title": row.title,
        "displayed": row.displayed or {}, "edits": row.edits, "flags": list(row.flags or []), "state": row.state,
        "reason": row.reason, "decided_by": row.decided_by, "decided_at": row.decided_at, "capture_id": row.capture_id,
        "first_seen_at": row.first_seen_at, "last_seen_at": row.last_seen_at, "capture_blocked": blocked,
        "copy_of": row.copy_of, "similarity": row.similarity, "copies": copies,
    }


def overview(db: Session, investigation_id: str) -> dict[str, Any]:
    monitors = list(db.scalars(select(Monitor).where(Monitor.investigation_id == investigation_id).order_by(Monitor.created_at)).all())
    by_id = {m.id: m for m in monitors}
    new = [i for i in db.scalars(select(MonitorItem).where(MonitorItem.investigation_id == investigation_id, MonitorItem.state == "new")).all() if i.monitor_id in by_id]
    # A copy waits outside the queue and is counted once, with its original.
    waiting = [i for i in new if not i.copy_of]
    waiting.sort(key=lambda i: (-_risk(i), i.first_seen_at), reverse=False)
    copies: dict[str, list[MonitorItem]] = {}
    for c in db.scalars(select(MonitorItem).where(MonitorItem.investigation_id == investigation_id, MonitorItem.copy_of.is_not(None))
                        .order_by(MonitorItem.first_seen_at)).all():
        copies.setdefault(str(c.copy_of), []).append(c)
    stories: list[dict[str, Any]] = []
    for original_id, its in copies.items():
        original = db.get(MonitorItem, original_id)
        if original is None or not any(c.state == "new" for c in its) and original.state != "new":
            continue  # every copy and its original decided: nothing about it waits
        stories.append({"original": serialize_item(original, by_id.get(original.monitor_id), copies=len(its)),
                        "copies": [serialize_item(c, by_id.get(c.monitor_id), capture_blocker(db, c, by_id.get(c.monitor_id))) for c in its]})
    stories.sort(key=lambda s: s["original"]["first_seen_at"], reverse=True)
    out = [serialize_monitor(db, m) for m in monitors]
    return {
        "monitors": out,
        "at_risk": [serialize_item(i, by_id.get(i.monitor_id), capture_blocker(db, i, by_id.get(i.monitor_id)), len(copies.get(i.id, [])))
                    for i in waiting],
        "same_story": stories[:20],
        "counts": {"monitors": len(out), "working": sum(1 for m in out if m["health"] == "ok"), "waiting": len(waiting),
                   "direct": sum(1 for m in monitors if m.route == "direct" and m.active), "tor": sum(1 for m in monitors if m.route == "tor" and m.active)},
    }


def version_changes(db: Session, row: MonitorVersion, limit: int = 60) -> dict[str, Any]:
    """What changed from the version before: the lines added and removed, in order."""
    before = db.scalars(select(MonitorVersion).where(MonitorVersion.monitor_id == row.monitor_id, MonitorVersion.number == row.number - 1)).first()
    added, removed = [], []
    for line in difflib.ndiff(before.text.splitlines() if before else [], row.text.splitlines()):
        if line.startswith("+ "):
            added.append(line[2:])
        elif line.startswith("- "):
            removed.append(line[2:])
    return {"added": added[:limit], "removed": removed[:limit], "more": max(0, len(added) - limit) + max(0, len(removed) - limit)}


def serialize_version(db: Session, row: MonitorVersion, *, with_changes: bool = False) -> dict[str, Any]:
    # A capture was asked for while this version was the page's latest; it counts as kept only once it saved the page.
    capture = db.get(Capture, row.capture_id) if row.capture_id else None
    out = {"id": row.id, "monitor_id": row.monitor_id, "number": row.number, "text_sha256": row.text_sha256,
           "lines_added": row.lines_added, "lines_removed": row.lines_removed, "seen_at": row.seen_at, "capture_id": row.capture_id,
           "capture_saved": capture is not None and capture.outcome == "saved", "changes": None}
    if with_changes:
        out["changes"] = version_changes(db, row)
    return out
