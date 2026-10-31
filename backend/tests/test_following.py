"""Following (ADR-0022, app/services/following.py, mockup FOLLOW_1): monitors ask politely and log every request,
what they find waits in a queue for a person, and the signals that an item may not last put it first.

A small site served on this computer stands in for the outside world: a news feed, a second outlet's feed carrying
the same wire story, a sitemap, a page that is edited, a podcast with a transcript, robots.txt. The guard that allows
only public addresses is told 127.0.0.1 is allowed, as the web-capture tests do.
"""

from __future__ import annotations

import json
import socket
import threading
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Monitor, MonitorItem, OutboundRequest, PageVersion
from app.services import following, web_capture
from app.services.exports import build_investigation_export, restore_investigation_export
from app.services.lifecycle import delete_investigation

client = TestClient(app)
RECORDING = Path(__file__).parent / "fixtures" / "media" / "harbour-talk.mp3"

# The publisher's own transcript of the episode: it hears "an evaluation" where ours heard "a valuation".
EP41_VTT = """WEBVTT

00:00:00.000 --> 00:00:02.800
<v Host>Last week we spoke about the harbour land.

00:00:03.000 --> 00:00:06.000
<v Guest>I never saw an evaluation before we voted.
"""

WIRE = ("Harbour authority approves Kestrel lease extension for another twenty years after a closed council "
        "vote on Tuesday evening, documents seen by the paper show")


def _rss(items: list[dict], title: str = "The Fernhill Courier") -> bytes:
    parts = []
    for it in items:
        enclosure = f'<enclosure url="{it["audio"]}" length="76257" type="audio/mpeg"/>' if it.get("audio") else ""
        transcript = f'<podcast:transcript url="{it["transcript"]}" type="text/vtt"/>' if it.get("transcript") else ""
        if it.get("chapters"):
            transcript += f'<podcast:chapters url="{it["chapters"]}" type="application/json+chapters"/>'
        parts.append(f"<item><guid>{it['id']}</guid><title>{it['title']}</title><link>{it['link']}</link>"
                     f"<description>{it.get('text', '')}</description><pubDate>{it['date']}</pubDate>{enclosure}{transcript}</item>")
    return (f'<?xml version="1.0"?><rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel>'
            f"<title>{title}</title>{''.join(parts)}</channel></rss>").encode()


class Site:
    """What the site serves now; tests change it between checks."""

    def __init__(self) -> None:
        self.base = ""
        self.robots = "User-agent: *\nDisallow: /private/\n"
        self.feed = [
            {"id": "a1", "title": "Council minutes uploaded", "link": "/news/minutes", "date": "Mon, 19 Oct 2026 09:00:00 GMT",
             "text": "The minutes of the October meeting are online."},
            {"id": "a2", "title": "Harbour authority approves Kestrel lease extension", "link": "/news/lease",
             "date": "Mon, 19 Oct 2026 09:48:00 GMT", "text": WIRE},
            {"id": "a3", "title": "Ferry timetable changes", "link": "/news/ferry", "date": "Mon, 19 Oct 2026 08:00:00 GMT",
             "text": "Winter sailings start next week."},
        ]
        self.gazette = [{"id": "g1", "title": "Kestrel lease extension approved", "link": "/gazette/lease",
                         "date": "Mon, 19 Oct 2026 11:20:00 GMT", "text": WIRE + " says the Gazette"}]
        self.page = ("<html><head><title>About Fernhill Ltd</title></head><body><nav>Home · About</nav><main>"
                     "<h1>About us</h1><p>Fernhill Ltd is owned by Harbour Nominees Ltd (40%) and Kestrel SA (60%).</p>"
                     "<p>Directors: A. Ross, M. Vale.</p></main><footer>© 2026</footer></body></html>")
        self.status: dict[str, int] = {}
        self.moved: dict[str, str] = {}
        self.requests: list[tuple[str, dict]] = []
        self.etag = '"v1"'


def _handler(site: Site) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args: object) -> None:
            pass

        def _send(self, status: int, body: bytes = b"", kind: str = "text/plain", headers: dict | None = None) -> None:
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            for k, v in (headers or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802
            path = self.path
            site.requests.append((path, dict(self.headers)))
            if path in site.moved:
                return self._send(301, headers={"Location": site.moved[path]})
            if path in site.status:
                return self._send(site.status[path])
            if path == "/robots.txt":
                return self._send(200, site.robots.encode())
            if path == "/feed.xml":
                if self.headers.get("If-None-Match") == site.etag:
                    return self._send(304)
                items = [{**i, "link": site.base + i["link"]} for i in site.feed]
                return self._send(200, _rss(items), "application/rss+xml", {"ETag": site.etag})
            if path == "/gazette.xml":
                items = [{**i, "link": site.base + i["link"]} for i in site.gazette]
                return self._send(200, _rss(items, "Harbour Gazette"), "application/rss+xml")
            if path == "/home":
                return self._send(200, f'<html><head><title>Courier</title><link rel="alternate" type="application/rss+xml" '
                                       f'href="{site.base}/feed.xml"></head><body>Hi</body></html>'.encode(), "text/html")
            if path == "/about":
                return self._send(200, site.page.encode(), "text/html")
            if path == "/sitemap.xml":
                body = ('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
                        'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'
                        f'<url><loc>{site.base}/news/register</loc><news:news><news:title>Councillors declare interests: '
                        '2019 register</news:title><news:publication_date>2026-10-19T10:01:00Z</news:publication_date>'
                        '</news:news></url></urlset>').encode()
                return self._send(200, body, "application/xml")
            if path == "/podcast.xml":
                items = [{"id": "ep41", "title": "Ep. 41 · The parcel question", "link": site.base + "/ep41",
                          "date": "Sat, 17 Oct 2026 06:00:00 GMT", "audio": site.base + "/ep41.mp3",
                          "transcript": site.base + "/ep41.vtt", "chapters": site.base + "/ep41-chapters.json"}]
                return self._send(200, _rss(items, "Fernhill Notes"), "application/rss+xml")
            if path == "/ep41.mp3":
                return self._send(200, RECORDING.read_bytes(), "audio/mpeg")
            if path == "/ep41.vtt":
                return self._send(200, EP41_VTT.encode(), "text/vtt")
            if path == "/ep41-chapters.json":
                return self._send(200, json.dumps({"version": "1.2.0", "chapters": [
                    {"startTime": 0, "title": "Welcome"}, {"startTime": 2.8, "title": "The board meeting"}]}).encode(),
                    "application/json+chapters")
            if path.startswith(("/news/", "/gazette/")):
                return self._send(200, b"<html><body>story</body></html>", "text/html")
            return self._send(404)

    return Handler


@pytest.fixture
def site(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "documents"))
    real = web_capture.resolve_public
    monkeypatch.setattr(web_capture, "resolve_public", lambda host, port: (
        [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))] if host == "127.0.0.1" else real(host, port)))
    following._robots.clear()
    following._last_request.clear()
    state = Site()
    server = ThreadingHTTPServer(("127.0.0.1", 0), _handler(state))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    state.base = f"http://127.0.0.1:{server.server_address[1]}"
    yield state
    server.shutdown()


def _case(name: str = "Harbour land") -> str:
    return client.post("/api/investigations", json={"name": name}).json()["id"]


def _follow(inv: str, target: str, **extra) -> dict:
    r = client.post(f"/api/investigations/{inv}/monitors", json={"target": target, **extra})
    return {"status": r.status_code, **r.json()}


def _screen(inv: str) -> dict:
    return client.get(f"/api/investigations/{inv}/following").json()


def _check(monitor_id: str) -> dict:
    return client.post(f"/api/monitors/{monitor_id}/check").json()


def test_a_page_that_names_its_feed_is_followed_through_the_feed_and_every_request_is_logged(site):
    inv = _case()
    m = _follow(inv, site.base + "/home")
    assert m["status"] == 200, m
    assert m["kind"] == "feed" and m["url"] == site.base + "/feed.xml" and m["name"] == "The Fernhill Courier · news feed"
    assert m["health"] == "works" and m["every_minutes"] == 30 and m["route"] == "direct"
    assert [c["text"] for c in m["checks"]][1] == "Read 3 items"
    assert "asking “anything new since my last visit?”" in m["leaves"]
    screen = _screen(inv)
    assert screen["waiting"] == 3 and {q["state"] for q in screen["queue"]} == {"waiting"}
    assert all(q["risks"] == [{"tone": "", "text": "New · no sign of risk"}] for q in screen["queue"])
    with SessionLocal() as db:
        logged = [r.value for r in db.scalars(select(OutboundRequest).where(OutboundRequest.investigation_id == inv))]
    assert any(v.endswith("/robots.txt") for v in logged) and any(v.endswith("/feed.xml") for v in logged)
    assert all(r.startswith("GET") for r in logged)
    # The request names the app and nothing about the reporter.
    assert any(h.get("User-Agent", "").startswith("JournalismWorkbench") for _p, h in site.requests)


def test_every_request_made_to_find_out_what_an_address_is_is_logged_before_it_goes(site, monkeypatch):
    from app.services import outbound

    inv = _case()
    # A request whose address answers 404: refused, and still in the log.
    site.status["/gone"] = 404
    assert _follow(inv, site.base + "/gone")["status"] == 422
    with SessionLocal() as db:
        logged = [r.value for r in db.scalars(select(OutboundRequest).where(OutboundRequest.investigation_id == inv))]
    assert logged == [f"GET {site.base}/gone"]

    # A page that names its feed: both discovery requests, each written before it went.
    order: list[str] = []
    real_fetch, real_record = following.fetch, outbound.record_outbound
    monkeypatch.setattr(following, "fetch", lambda url, **kw: (order.append(f"fetch {url}"), real_fetch(url, **kw))[1])
    monkeypatch.setattr(outbound, "record_outbound", lambda *a, **kw: (order.append(f"log {kw['value']}"), real_record(*a, **kw))[1])
    assert _follow(inv, site.base + "/home")["status"] == 200
    home, feed = f"{site.base}/home", f"{site.base}/feed.xml"
    assert order[:4] == [f"log GET {home}", f"fetch {home}", f"log GET {feed}", f"fetch {feed}"]
    fetched = [o.split(" ", 1)[1] for o in order if o.startswith("fetch ")]
    assert sum(o.startswith("log ") for o in order) == len(fetched), order

    # One that cannot be reached at all says so in the log.
    monkeypatch.setattr(following, "fetch", lambda url, **kw: (_ for _ in ()).throw(following.FetchFailed("timeout")))
    assert _follow(inv, "https://slow.example.org/feed")["status"] == 422
    with SessionLocal() as db:
        row = db.scalars(select(OutboundRequest).where(OutboundRequest.investigation_id == inv,
                                                       OutboundRequest.value == "GET https://slow.example.org/feed")).one()
        assert row.outcome == "failed"


def test_a_check_asks_only_for_what_is_new(site):
    inv = _case()
    m = _follow(inv, site.base + "/feed.xml")
    again = _check(m["id"])
    assert any(h.get("If-None-Match") == '"v1"' for p, h in site.requests if p == "/feed.xml")
    assert again["checks"][1]["text"] == "Nothing new since the last visit" and again["health"] == "works"


def test_an_edited_item_and_a_deleted_one_are_put_first(site):
    inv = _case()
    m = _follow(inv, site.base + "/feed.xml")
    site.etag = '"v2"'
    site.feed[1]["text"] = WIRE + " Updated: the vote was 5 to 4."
    del site.feed[0]  # the newest item disappears while older ones are still listed
    _check(m["id"])
    queue = _screen(inv)["queue"]
    by_title = {q["title"]: q for q in queue}
    assert {"tone": "amber", "text": "At risk: edited once since first seen"} in by_title[
        "Harbour authority approves Kestrel lease extension"]["risks"]
    assert {"tone": "amber", "text": "Deleted at the source since it was seen"} in by_title["Council minutes uploaded"]["risks"]
    assert queue[-1]["title"] == "Ferry timetable changes"  # no sign of risk: last


def test_a_moved_source_is_paused_until_a_person_accepts_the_new_address(site):
    inv = _case()
    m = _follow(inv, site.base + "/feed.xml")
    site.moved["/feed.xml"] = site.base + "/news/rss"
    moved = _check(m["id"])
    assert moved["health"] == "moved" and moved["moved_to"] == site.base + "/news/rss"
    assert moved["leaves"].startswith("Paused. Nothing is asked until you accept the new address")
    asked = len(site.requests)
    _check(m["id"])
    assert len(site.requests) == asked  # nothing is asked while it waits
    accepted = client.patch(f"/api/monitors/{m['id']}", json={"accept_move": True}).json()
    assert accepted["url"] == site.base + "/news/rss" and accepted["health"] == "unchecked"


def test_robots_txt_is_honoured_for_following(site):
    inv = _case()
    site.robots = "User-agent: *\nDisallow: /feed.xml\n"
    m = _follow(inv, site.base + "/feed.xml")
    assert m["status"] == 200 and m["health"] == "broken" and "robots.txt" in m["health_detail"]
    # The address was asked once, to see what it is; the check itself never fetched the feed.
    assert [p for p, _h in site.requests].count("/feed.xml") == 1


def test_a_page_keeps_a_version_when_its_text_changes_not_its_layout(site):
    inv = _case()
    m = _follow(inv, site.base + "/about")
    assert m["kind"] == "page" and m["every_minutes"] == 1440
    site.page = site.page.replace("<nav>Home · About</nav>", "<nav>Home · About · News</nav>")
    # The menu is not what the page says: a new menu is a layout change, no new version.
    assert _check(m["id"])["checks"][1]["text"] == "Layout changed, text the same"
    assert _check(m["id"])["checks"][1]["text"] == "Text the same as the last version"
    # Capture version 1, then the owners change.
    first = next(q for q in _screen(inv)["queue"] if q["extra"].get("page_version") == 1)
    with SessionLocal() as db:
        item = db.get(MonitorItem, first["id"])
        following.mark_captured(db, item, "a reporter", capture_id=None)
    site.page = site.page.replace("is owned by Harbour Nominees Ltd (40%) and Kestrel SA (60%).",
                                  "is privately held; shareholders are not disclosed.")
    changed = _check(m["id"])
    assert changed["checks"][1]["text"] == "Text differs from the last version · 1 line"
    second = next(q for q in _screen(inv)["queue"] if q["extra"].get("page_version") == 2)
    assert {"tone": "amber", "text": "Changed since capture · 1 line"} in second["risks"]
    versions = client.get(f"/api/monitors/{m['id']}/versions").json()
    assert [v["number"] for v in versions] == [2, 1] and versions[1]["captured"]
    assert any(line.startswith("-") and "Kestrel SA (60%)" in line for line in versions[0]["diff"])


def test_a_sitemap_lists_its_new_addresses(site):
    inv = _case()
    m = _follow(inv, site.base + "/sitemap.xml")
    assert m["kind"] == "sitemap" and m["every_minutes"] == 60
    queue = _screen(inv)["queue"]
    assert [q["title"] for q in queue] == ["Councillors declare interests: 2019 register"]


def test_copies_of_one_wire_story_are_counted_once(site):
    inv = _case()
    _follow(inv, site.base + "/feed.xml")
    _follow(inv, site.base + "/gazette.xml")
    screen = _screen(inv)
    titles = [q["title"] for q in screen["queue"]]
    assert "Kestrel lease extension approved" not in titles  # the later copy is not offered
    original = next(q for q in screen["queue"] if q["title"] == "Harbour authority approves Kestrel lease extension")
    assert {"tone": "teal", "text": "Wire copy of 1 other"} in original["risks"]
    group = screen["copies"][0]
    assert group["count"] == 2 and [mem["original"] for mem in group["members"]] == [True, False]
    assert 0.6 <= group["members"][1]["similarity"] <= 1


def test_skip_undo_and_capture_all_needs_a_reason(site, monkeypatch):
    inv = _case()
    _follow(inv, site.base + "/feed.xml")
    queue = _screen(inv)["queue"]
    skipped = client.post(f"/api/monitor-items/{queue[0]['id']}/skip").json()
    assert next(q for q in skipped["queue"] if q["id"] == queue[0]["id"])["state"] == "skipped" and skipped["skipped"] == 1
    client.post(f"/api/monitor-items/{queue[0]['id']}/undo")
    assert client.post(f"/api/investigations/{inv}/following/capture-all", json={"reason": "fast"}).status_code == 422
    # The web capture itself is tried in its own tests; here the visit fails at once, and the item is still decided.
    monkeypatch.setattr(web_capture, "visit", lambda *a, **k: (_ for _ in ()).throw(OSError("no browser here")))
    done = client.post(f"/api/investigations/{inv}/following/capture-all",
                       json={"reason": "Account is deleting posts"}).json()
    assert done["waiting"] == 0
    decided = [q for q in done["queue"] if q["state"] in ("saved", "not_saved", "capturing")]
    assert len(decided) == 3 and all(q["decision"]["reason"] == "Bulk · Account is deleting posts" for q in decided)
    assert all(q["capture_id"] for q in decided)


def test_a_captured_item_that_is_gone_can_have_its_removal_recorded(site, monkeypatch):
    inv = _case()
    m = _follow(inv, site.base + "/feed.xml")
    target = next(q for q in _screen(inv)["queue"] if q["title"] == "Ferry timetable changes")
    with SessionLocal() as db:
        following.mark_captured(db, db.get(MonitorItem, target["id"]), "a reporter", capture_id=None)
    site.status["/news/ferry"] = 404
    _check(m["id"])
    gone = next(q for q in _screen(inv)["queue"] if q["id"] == target["id"])
    assert gone["state"] == "gone" and {"tone": "bad", "text": "Removed: now answers 404"} in gone["risks"]
    assert gone == _screen(inv)["queue"][0]  # most at risk first
    recorded = client.post(f"/api/monitor-items/{target['id']}/record-removal").json()
    row = next(q for q in recorded["queue"] if q["id"] == target["id"])
    assert row["state"] == "removal_recorded" and row["decision"]["status"] == 404


def test_a_podcast_episode_is_captured_as_its_audio_and_transcribed(site, monkeypatch):
    from app.services import transcription

    def fake(path, progress):
        progress(1.0, "")
        return transcription.Transcript(kind="audio", duration=19.0, streams=[], outline=[0.5], outline_step=19.0,
                                        segments=[transcription.Segment(0.0, 2.8, "speech", "Last week we spoke about the harbour land.",
                                                                        [{"w": "Last", "s": 0.0, "e": 0.4, "p": 0.9}])],
                                        about={"tool": "stand-in", "model": "stand-in", "language": "en",
                                               "language_probability": 1.0, "ran_at": "2026-10-28T10:00:00", "seconds": 0.1,
                                               "where": "this computer"})

    monkeypatch.setattr(transcription, "transcribe", fake)
    inv = _case()
    m = _follow(inv, site.base + "/podcast.xml")
    assert m["kind"] == "podcast" and m["every_minutes"] == 1440 and "The audio file is fetched only when you capture" in m["leaves"]
    episode = _screen(inv)["queue"][0]
    assert {"tone": "teal", "text": "Publisher transcript offered"} in episode["risks"]
    assert episode["extra"]["audio"]["url"].endswith("/ep41.mp3")
    assert "/ep41.mp3" not in [p for p, _h in site.requests]  # nothing fetched before a person captures
    after = client.post(f"/api/monitor-items/{episode['id']}/capture").json()
    done = next(q for q in after["queue"] if q["id"] == episode["id"])
    assert done["state"] == "saved" and done["document_id"]
    doc = client.get(f"/api/documents/{done['document_id']}").json()
    assert doc["extraction_status"] == "complete" and doc["sha256"]


def test_a_podcast_episode_whose_audio_cannot_be_fetched_goes_back_in_the_queue(site):
    inv = _case()
    _follow(inv, site.base + "/podcast.xml")
    episode = _screen(inv)["queue"][0]
    site.status["/ep41.mp3"] = 500
    after = client.post(f"/api/monitor-items/{episode['id']}/capture")
    assert after.status_code == 200, after.text
    back = next(q for q in _screen(inv)["queue"] if q["id"] == episode["id"])
    assert back["state"] == "waiting" and not back["document_id"]
    # And it can be captured again once the file answers.
    del site.status["/ep41.mp3"]
    assert client.post(f"/api/monitor-items/{episode['id']}/capture").status_code == 200


def test_a_closed_platform_has_no_monitor_and_is_never_asked(site):
    inv = _case()
    m = _follow(inv, "https://www.instagram.com/kestrel.sa/")
    assert m["kind"] == "closed" and m["health"] == "closed" and m["next_check_at"] is None
    assert m["leaves"] == "Nothing is fetched: a closed platform has no monitor."
    assert client.patch(f"/api/monitors/{m['id']}", json={"every_minutes": 15}).status_code == 409


def test_an_open_protocol_account_is_read_from_its_public_server_and_deletions_noticed():
    handle = "harbourwatch.example"
    found = following.discover(f"@{handle}")
    assert found.kind == "account" and found.platform == "bluesky" and "actor=harbourwatch.example" in found.url
    assert following.discover("@watch@mastodon.example").url == "https://mastodon.example/@watch.rss"
    body = json.dumps({"feed": [
        {"post": {"uri": f"at://did:plc:x/app.bsky.feed.post/3k{n}", "replyCount": 3,
                  "record": {"text": f"Post {n}", "createdAt": f"2026-10-19T09:{30 - n:02d}:00Z"}}} for n in range(3)]
        + [{"post": {"uri": "at://did:plc:y/app.bsky.feed.post/9", "record": {"text": "Someone else"}}, "reason": {"$type": "repost"}}]
    }).encode()
    entries = following.read_bluesky(body, handle)
    assert [e.title for e in entries] == ["Post 0", "Post 1", "Post 2"]  # the repost is not this account's
    assert entries[0].url == f"https://bsky.app/profile/{handle}/post/3k0"


def test_the_tor_route_says_when_no_tor_is_running(site, monkeypatch):
    monkeypatch.setattr(settings, "tor_socks_url", "socks5h://127.0.0.1:1")
    inv = _case()
    m = _follow(inv, site.base + "/feed.xml")
    changed = client.patch(f"/api/monitors/{m['id']}", json={"route": "tor"}).json()
    assert changed["route"] == "tor"
    checked = _check(m["id"])
    assert checked["health"] == "broken" and "Tor is not running on this computer" in checked["health_detail"]


def test_the_scheduler_checks_what_is_due_and_a_case_backup_keeps_what_it_follows(site):
    inv = _case()
    m = _follow(inv, site.base + "/feed.xml")
    with SessionLocal() as db:
        row = db.get(Monitor, m["id"])
        row.next_check_at = utcnow_naive() - timedelta(minutes=1)
        db.commit()
        following._last_request.clear()
        assert following.check_due(db) == 1
        assert db.get(Monitor, m["id"]).next_check_at > utcnow_naive()
        data, manifest = build_investigation_export(db, inv)
        assert manifest["record_counts"]["monitors"] == 1 and manifest["record_counts"]["monitor_items"] == 3
        delete_investigation(db, inv, settings.document_storage_dir, confirmation=inv)
        assert db.get(Monitor, m["id"]) is None
        restore_investigation_export(db, data, Path(settings.document_storage_dir))
        assert db.get(Monitor, m["id"]).name == "The Fernhill Courier · news feed"
        assert len(db.scalars(select(MonitorItem).where(MonitorItem.monitor_id == m["id"])).all()) == 3
        assert db.scalars(select(PageVersion)).first() is None


# --- Fixes brought over from the other Following (PR #117's review) -------------------------------------------------

def test_an_item_from_a_source_followed_through_tor_is_not_captured_directly(site):
    inv = _case()
    m = _follow(inv, site.base + "/feed.xml")
    client.patch(f"/api/monitors/{m['id']}", json={"route": "tor"})
    item = _screen(inv)["queue"][0]
    r = client.post(f"/api/monitor-items/{item['id']}/capture")
    assert r.status_code == 422 and "through Tor" in r.json()["detail"]
    done = client.post(f"/api/investigations/{inv}/following/capture-all", json={"reason": "Account is deleting posts"}).json()
    assert done["waiting"] == 3  # nothing was visited directly; everything still waits
    with SessionLocal() as db:
        assert db.get(MonitorItem, item["id"]).state == "waiting"


def test_an_item_is_claimed_once_so_two_requests_cannot_both_act_on_it(site):
    inv = _case()
    _follow(inv, site.base + "/feed.xml")
    item = _screen(inv)["queue"][0]
    with SessionLocal() as db:
        row = db.get(MonitorItem, item["id"])
        assert following.claim(db, row, to="captured") is True
        assert following.claim(db, row, to="skipped") is False  # the second one finds it taken
    assert client.post(f"/api/monitor-items/{item['id']}/skip").status_code == 409


def test_an_older_version_of_a_page_cannot_be_captured_and_a_version_is_kept_only_once_saved(site):
    inv = _case()
    m = _follow(inv, site.base + "/about")
    site.page = site.page.replace("is owned by Harbour Nominees Ltd (40%) and Kestrel SA (60%).",
                                  "is privately held; shareholders are not disclosed.")
    _check(m["id"])
    first = next(q for q in _screen(inv)["queue"] if q["extra"].get("page_version") == 1)
    r = client.post(f"/api/monitor-items/{first['id']}/capture")
    assert r.status_code == 422 and "version 2 now" in r.json()["detail"]
    with SessionLocal() as db:
        from app.models.domain import Capture

        capture = Capture(investigation_id=inv, url=site.base + "/about", status="finished", outcome="link_only", files=[],
                          displayed={}, stages=[], exchange={}, media={})
        db.add(capture)
        db.commit()
        latest = db.scalars(select(PageVersion).where(PageVersion.monitor_id == m["id"], PageVersion.number == 2)).one()
        latest.captured, latest.capture_id = True, capture.id
        db.commit()
    versions = client.get(f"/api/monitors/{m['id']}/versions").json()
    assert versions[0]["number"] == 2 and versions[0]["captured"] is False  # asked for, but the page was not saved
