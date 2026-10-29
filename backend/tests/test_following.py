"""Following (ADR-0021, app/services/following.py): what a poll reads, the politeness it keeps (conditional requests,
robots.txt, Retry-After, backoff), the items and versions it records, the at-risk queue, and what a person does with it.

The polls run against a small server on this machine. Loopback is refused to Following for real, so those tests let
127.0.0.1 through by replacing the host check; the check itself is tested on its own."""

from __future__ import annotations

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
from app.jobs.schedule import TASKS, scheduler_tick
from app.main import app
from app.models.domain import Capture, Monitor, MonitorItem, MonitorVersion, OutboundRequest
from app.services import following, web_capture
from app.services.exports import build_investigation_export, restore_investigation_export
from app.services.lifecycle import delete_investigation

client = TestClient(app)

RSS = b"""<?xml version="1.0"?><rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel>
<title>The Marlow Courier</title>
<item><title>Harbour authority approves Kestrel lease</title><link>https://marlow.example/a</link><guid>a-1</guid>
 <pubDate>Mon, 19 Oct 2026 09:48:00 GMT</pubDate><description>The lease runs 25 years.</description></item>
<item><title>Fernhill Notes ep. 41</title><link>https://marlow.example/ep41</link><guid>ep-41</guid>
 <enclosure url="https://cdn.example/ep41.mp3" length="48000000" type="audio/mpeg"/>
 <podcast:transcript url="https://marlow.example/ep41.vtt" type="text/vtt"/></item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015"
 xmlns:media="http://search.yahoo.com/mrss/"><title>Harbour TV</title>
<entry><id>yt:video:abc123</id><yt:videoId>abc123</yt:videoId><title>Council meeting</title>
 <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/><author><name>Harbour TV</name></author>
 <published>2026-10-19T09:00:00+00:00</published><updated>2026-10-19T09:30:00+00:00</updated>
 <media:group><media:description>The full meeting.</media:description></media:group></entry></feed>"""

SITEMAP = b"""<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
<url><loc>https://marlow.example/n1</loc><news:news><news:title>Councillors declare interests</news:title><news:publication_date>2026-10-18</news:publication_date></news:news></url>
<url><loc>https://marlow.example/n2</loc><lastmod>2026-10-17</lastmod></url></urlset>"""


# --- Reading feeds and sitemaps -------------------------------------------------------------------------------------

def test_an_rss_feed_and_a_podcast_are_read_as_displayed():
    title, items = following.parse_feed(RSS, "https://marlow.example/feed.xml")
    assert title == "The Marlow Courier" and [i["key"] for i in items] == ["a-1", "ep-41"]
    assert items[0]["url"] == "https://marlow.example/a" and items[0]["published"] == "Mon, 19 Oct 2026 09:48:00 GMT"
    assert items[1]["audio"] == "https://cdn.example/ep41.mp3" and items[1]["transcript_type"] == "text/vtt"
    assert items[1]["transcript"] == "https://marlow.example/ep41.vtt"


def test_an_atom_feed_and_a_youtube_channel_feed_are_read():
    title, items = following.parse_feed(ATOM, "https://www.youtube.com/feeds/videos.xml?channel_id=x")
    assert title == "Harbour TV" and len(items) == 1
    assert items[0]["video_id"] == "abc123" and items[0]["summary"] == "The full meeting." and items[0]["author"] == "Harbour TV"
    assert items[0]["url"] == "https://www.youtube.com/watch?v=abc123"


def test_a_sitemap_gives_its_addresses_and_a_news_sitemap_its_titles():
    _, items = following.parse_sitemap(SITEMAP, "https://marlow.example/sitemap.xml")
    assert [(i["url"], i["title"], i["published"]) for i in items] == [
        ("https://marlow.example/n1", "Councillors declare interests", "2026-10-18"), ("https://marlow.example/n2", "", "2026-10-17")]


def test_what_is_not_a_feed_or_a_sitemap_says_why():
    with pytest.raises(ValueError, match="index of sitemaps"):
        following.parse_sitemap(b'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://a.example/s.xml</loc></sitemap></sitemapindex>', "https://a.example/")
    with pytest.raises(ValueError, match="not an RSS or Atom feed"):
        following.parse_feed(b"<html><body>hello</body></html>", "https://a.example/")
    with pytest.raises(ValueError, match="not well-formed"):
        following.parse_feed(b"<rss><channel>", "https://a.example/")


def test_entities_in_a_feed_are_not_expanded_and_files_are_not_read():
    body = b'<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss version="2.0"><channel><title>t</title><item><title>&x;</title><link>https://a.example/1</link></item></channel></rss>'
    _, items = following.parse_feed(body, "https://a.example/")
    assert "root:" not in items[0]["title"]


def test_the_kind_is_worked_out_from_the_address():
    assert following.infer_kind("https://www.youtube.com/feeds/videos.xml?channel_id=UC1") == "youtube"
    assert following.infer_kind("https://x.example/news-sitemap.xml") == "sitemap"
    assert following.infer_kind("https://x.example/feed.xml") == "feed" and following.infer_kind("https://x.example/about") == "page"


# --- Polling a site -------------------------------------------------------------------------------------------------

class _Site(BaseHTTPRequestHandler):
    routes: dict[str, dict] = {}
    hits: list[tuple[str, dict]] = []

    def do_GET(self):
        route = self.routes.get(self.path.split("?")[0])
        _Site.hits.append((self.path, {k.lower(): v for k, v in self.headers.items()}))
        if route is None:
            self.send_response(404)
            self.end_headers()
            return
        etag = route.get("etag")
        if etag and self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.end_headers()
            return
        self.send_response(route.get("status", 200))
        for k, v in {"Content-Type": route.get("type", "application/xml"), **({"ETag": etag} if etag else {}), **route.get("headers", {})}.items():
            self.send_header(k, v)
        body = route.get("body", b"")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture()
def site(monkeypatch):
    monkeypatch.setattr(settings, "follow_host_gap_seconds", 0.0)
    real = web_capture.resolve_public
    monkeypatch.setattr(web_capture, "resolve_public", lambda host, port: (
        [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))] if host in ("127.0.0.1", "marlow.example") else real(host, port)))
    following.forget_robots()
    _Site.routes, _Site.hits = {"/robots.txt": {"body": b"User-agent: *\nDisallow: /private/\n", "type": "text/plain"}}, []
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Site)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    yield type("S", (), {"base": base, "routes": _Site.routes, "hits": _Site.hits})
    server.shutdown()
    following.forget_robots()


def _case(name: str = "Following") -> str:
    return client.post("/api/investigations", json={"name": name}).json()["id"]


def _follow(site, path: str = "/feed.xml", **body) -> dict:
    r = client.post(f"/api/investigations/{_case()}/monitors", json={"url": site.base + path, **body})
    assert r.status_code == 201, r.text
    return r.json()


def test_a_feed_is_followed_and_what_it_found_waits_for_a_person(site):
    site.routes["/feed.xml"] = {"body": RSS, "etag": '"v1"'}
    m = _follow(site)
    assert m["kind"] == "feed" and m["health"] == "ok" and m["title"] == "The Marlow Courier"
    assert m["last_poll"]["items_seen"] == 2 and m["last_poll"]["items_new"] == 2 and m["new_items"] == 2
    assert m["egress"].startswith("One request every 30 minutes to 127.0.0.1")
    following_ = client.get(f"/api/investigations/{m['investigation_id']}/following").json()
    assert following_["counts"] == {"monitors": 1, "working": 1, "waiting": 2, "direct": 1, "tor": 0}
    assert {i["title"] for i in following_["at_risk"]} == {"Harbour authority approves Kestrel lease", "Fernhill Notes ep. 41"}
    assert all(i["state"] == "new" and i["flags"] == [] for i in following_["at_risk"])
    # Nothing was captured: the app watches, a person captures.
    with SessionLocal() as db:
        assert db.scalars(select(Capture)).all() == []


def test_the_next_look_asks_whether_anything_changed_and_a_304_costs_nothing(site):
    site.routes["/feed.xml"] = {"body": RSS, "etag": '"v1"'}
    m = _follow(site)
    again = client.post(f"/api/monitors/{m['id']}/poll").json()
    assert again["last_poll"]["not_modified"] is True and again["health"] == "ok" and again["http_status"] == 304
    feed_hits = [h for p, h in site.hits if p == "/feed.xml"]
    assert "if-none-match" not in feed_hits[0] and feed_hits[1]["if-none-match"] == '"v1"'
    assert feed_hits[0]["user-agent"].startswith("JournalismWorkbench/1.0")
    assert again["new_items"] == 2  # still the same two


def test_a_new_entry_is_new_and_an_edited_one_is_flagged_at_risk(site):
    site.routes["/feed.xml"] = {"body": RSS}
    m = _follow(site)
    site.routes["/feed.xml"] = {"body": RSS.replace(b"The lease runs 25 years.", b"The lease runs 20 years.").replace(
        b"</channel>", b"<item><title>Councillors declare interests</title><link>https://marlow.example/c</link><guid>c-1</guid></item></channel>")}
    after = client.post(f"/api/monitors/{m['id']}/poll").json()
    assert after["last_poll"]["items_new"] == 1 and after["new_items"] == 3
    items = client.get(f"/api/investigations/{m['investigation_id']}/following").json()["at_risk"]
    assert items[0]["title"] == "Harbour authority approves Kestrel lease" and items[0]["flags"] == ["edited"] and items[0]["edits"] == 1


def test_robots_txt_is_obeyed_and_nothing_is_fetched(site):
    site.routes["/private/feed.xml"] = {"body": RSS}
    m = _follow(site, "/private/feed.xml")
    assert m["health"] == "blocked" and "robots.txt" in m["health_reason"]
    assert [p for p, _ in site.hits] == ["/robots.txt"]
    assert m["next_check_at"] is not None and m["failures"] == 1


def test_a_failing_site_has_a_health_and_a_longer_wait_each_time(site):
    m = _follow(site, "/gone.xml")
    assert m["health"] == "broken" and "404" in m["health_reason"] and m["failures"] == 1
    site.routes["/login.xml"] = {"status": 403}
    assert _follow(site, "/login.xml")["health"] == "blocked"
    with SessionLocal() as db:
        row = db.get(Monitor, m["id"])
        first = row.next_check_at - row.last_checked_at
        following.poll_monitor(db, row)
        assert row.failures == 2 and row.next_check_at - row.last_checked_at > first * 1.5


def test_retry_after_is_honoured(site):
    site.routes["/slow.xml"] = {"status": 429, "headers": {"Retry-After": "7200"}}
    m = _follow(site, "/slow.xml")
    assert m["health"] == "broken" and "asked to be left alone" in m["health_reason"]
    with SessionLocal() as db:
        row = db.get(Monitor, m["id"])
        assert row.next_check_at - row.last_checked_at >= timedelta(hours=2)


def test_a_feed_address_that_is_a_web_page_says_to_follow_it_as_a_page(site):
    site.routes["/about"] = {"body": b"<!doctype html><html><body><p>About</p></body></html>", "type": "text/html"}
    m = _follow(site, "/about", kind="feed")
    assert m["health"] == "broken" and "follow it as a page" in m["health_reason"]


def test_a_cross_site_redirect_is_moved_and_a_person_accepts_the_new_address(site):
    site.routes["/old.xml"] = {"status": 301, "headers": {"Location": "https://news.other.example/feed.xml"}}
    m = _follow(site, "/old.xml")
    assert m["health"] == "moved" and m["moved_to"] == "https://news.other.example/feed.xml"
    fixed = client.patch(f"/api/monitors/{m['id']}", json={"url": site.base + "/feed.xml"}).json()
    assert fixed["health"] == "waiting" and fixed["moved_to"] is None and fixed["failures"] == 0


def test_a_same_site_redirect_is_followed(site):
    site.routes["/feed"] = {"status": 301, "headers": {"Location": "/feed.xml"}}
    site.routes["/feed.xml"] = {"body": RSS}
    assert _follow(site, "/feed")["health"] == "ok"


def test_a_sitemap_and_a_page_are_followed_too(site):
    site.routes["/news-sitemap.xml"] = {"body": SITEMAP}
    m = _follow(site, "/news-sitemap.xml")
    assert m["kind"] == "sitemap" and m["new_items"] == 2
    site.routes["/about"] = {"body": b"<html><body><main><p>Owners: A and B</p><p>Director: C</p></main></body></html>", "type": "text/html"}
    page = _follow(site, "/about")
    assert page["kind"] == "page" and page["versions"] == 1 and page["new_items"] == 1


def test_a_page_keeps_every_version_and_says_what_changed(site):
    site.routes["/about"] = {"body": b"<html><body><main><p>Owners: A and B</p><p>Director: C</p></main></body></html>", "type": "text/html"}
    m = _follow(site, "/about")
    again = client.post(f"/api/monitors/{m['id']}/poll").json()
    assert again["versions"] == 1 and again["new_items"] == 1  # the same text is not a new version
    site.routes["/about"] = {"body": b"<html><body><main><p>Owners: A</p><p>Director: C</p><p>Secretary: D</p></main></body></html>", "type": "text/html"}
    after = client.post(f"/api/monitors/{m['id']}/poll").json()
    assert after["versions"] == 2 and after["new_items"] == 2
    versions = client.get(f"/api/monitors/{m['id']}/versions").json()
    assert [v["number"] for v in versions] == [2, 1]
    assert versions[0]["changes"] == {"added": ["Owners: A", "Secretary: D"], "removed": ["Owners: A and B"], "more": 0}
    assert (versions[0]["lines_added"], versions[0]["lines_removed"]) == (2, 1)
    waiting = client.get(f"/api/investigations/{m['investigation_id']}/following").json()["at_risk"]
    assert waiting[0]["flags"] == ["changed"] and waiting[0]["displayed"]["version"] == 2


def test_each_poll_is_in_the_outbound_log_before_it_goes(site):
    m = _follow(site)
    with SessionLocal() as db:
        lines = db.scalars(select(OutboundRequest).where(OutboundRequest.investigation_id == m["investigation_id"])).all()
        assert len(lines) == 1 and lines[0].service == "following" and lines[0].value == site.base + "/feed.xml"
        assert lines[0].leaves_computer is True and "direct" in lines[0].reason


def test_an_unreachable_site_marks_its_log_line_failed(site):
    m = _follow(site, "/feed.xml").copy()
    unreachable = client.post(f"/api/investigations/{_case()}/monitors", json={"url": "http://127.0.0.1:1/feed.xml"}).json()
    assert unreachable["health"] == "broken" and unreachable["health_reason"].startswith("Could not reach it")
    with SessionLocal() as db:
        assert db.scalar(select(OutboundRequest.outcome).where(OutboundRequest.investigation_id == unreachable["investigation_id"])) == "failed"


# --- Where a request goes -------------------------------------------------------------------------------------------

def test_the_request_goes_to_the_address_that_was_checked_and_keeps_the_name(site):
    site.routes["/feed.xml"] = {"body": RSS}
    got = following.guarded_get(f"http://marlow.example:{site.base.rsplit(':', 1)[1]}/feed.xml")
    assert got.status == 200 and site.hits[-1][1]["host"] == f"marlow.example:{site.base.rsplit(':', 1)[1]}"


@pytest.mark.parametrize("url", ["http://127.0.0.1/", "http://169.254.169.254/latest/", "http://localhost/", "ftp://a.example/x", "http://[::1]/"])
def test_private_addresses_are_refused_to_a_monitor(url):
    inv = _case()
    r = client.post(f"/api/investigations/{inv}/monitors", json={"url": url})
    assert r.status_code == 422
    assert client.get(f"/api/investigations/{inv}/following").json()["monitors"] == []


def test_a_name_that_resolves_to_a_private_address_is_never_connected_to(monkeypatch):
    monkeypatch.setattr(web_capture, "resolve_public", lambda host, port: [])
    with pytest.raises(following.FetchFailed, match="not a public web address"):
        following.guarded_get("https://rebind.example/feed.xml")


def test_the_tor_route_goes_through_the_reporters_tor(monkeypatch):
    seen = {}

    class FakeClient:
        def __init__(self, **kw):
            seen.update(kw)

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def stream(self, method, target, headers=None, extensions=None):
            seen["target"] = target
            raise following.httpx.ConnectError("Tor is not running")

    monkeypatch.setattr(following.httpx, "Client", FakeClient)
    monkeypatch.setattr(settings, "follow_host_gap_seconds", 0.0)
    with pytest.raises(following.FetchFailed, match="Tor is not running"):
        following.guarded_get("https://news.example/feed.xml", route="tor")
    assert seen["proxy"] == settings.tor_socks_url and seen["target"] == "https://news.example/feed.xml"
    m = following.egress_line(Monitor(url="https://news.example/feed.xml", interval_minutes=60, route="tor"))
    assert "through the Tor on this computer" in m and "every hour" in m


# --- The queue and what a person does with it -----------------------------------------------------------------------

def _fake_capture(monkeypatch):
    made = []

    async def start(db, request, investigation_id, url):
        row = Capture(investigation_id=investigation_id, url=url, status="finished", outcome="saved", files=[], displayed={}, stages=[],
                      exchange={}, media={}, collector="you")
        db.add(row)
        db.commit()
        made.append(url)
        return row

    from app.api import routes_following
    monkeypatch.setattr(routes_following, "start_capture", start)
    return made


def test_a_person_captures_or_skips_each_item(site, monkeypatch):
    made = _fake_capture(monkeypatch)
    site.routes["/feed.xml"] = {"body": RSS}
    m = _follow(site)
    a, b = client.get(f"/api/investigations/{m['investigation_id']}/following").json()["at_risk"]
    got = client.post(f"/api/monitor-items/{a['id']}/capture").json()
    assert got["item"]["state"] == "captured" and got["item"]["capture_id"] == got["capture"]["id"] and made == [a["url"]]
    assert client.post(f"/api/monitor-items/{a['id']}/capture").status_code == 409
    skipped = client.post(f"/api/monitor-items/{b['id']}/skip", json={"reason": "A podcast we do not need"}).json()
    assert skipped["state"] == "skipped" and skipped["reason"] == "A podcast we do not need"
    assert client.get(f"/api/investigations/{m['investigation_id']}/following").json()["at_risk"] == []
    assert [i["state"] for i in client.get(f"/api/monitors/{m['id']}/items").json()] in (["captured", "skipped"], ["skipped", "captured"])


def test_capturing_many_needs_a_reason_and_puts_it_on_each(site, monkeypatch):
    made = _fake_capture(monkeypatch)
    site.routes["/feed.xml"] = {"body": RSS}
    m = _follow(site)
    url = f"/api/investigations/{m['investigation_id']}/following/capture-all"
    assert client.post(url, json={"reason": ""}).status_code == 422
    done = client.post(url, json={"reason": "Both are named in the Kestrel story"}).json()
    assert len(done["captured"]) == 2 and done["left"] == 0 and len(made) == 2
    assert {c["item"]["reason"] for c in done["captured"]} == {"Both are named in the Kestrel story"}


def test_a_captured_page_version_is_linked_to_its_capture(site, monkeypatch):
    _fake_capture(monkeypatch)
    site.routes["/about"] = {"body": b"<html><body><main><p>Owners: A</p></main></body></html>", "type": "text/html"}
    m = _follow(site, "/about")
    item = client.get(f"/api/investigations/{m['investigation_id']}/following").json()["at_risk"][0]
    cap = client.post(f"/api/monitor-items/{item['id']}/capture").json()["capture"]
    assert client.get(f"/api/monitors/{m['id']}/versions").json()[0]["capture_id"] == cap["id"]


def test_pausing_changing_and_stopping_a_monitor(site):
    site.routes["/feed.xml"] = {"body": RSS}
    m = _follow(site)
    paused = client.patch(f"/api/monitors/{m['id']}", json={"active": False, "interval_minutes": 60, "route": "tor"}).json()
    assert paused["health"] == "paused" and paused["interval_minutes"] == 60 and paused["route"] == "tor" and paused["next_check_at"] is None
    assert client.patch(f"/api/monitors/{m['id']}", json={"interval_minutes": 1}).status_code == 422
    assert client.post(f"/api/investigations/{m['investigation_id']}/monitors", json={"url": m["url"]}).status_code == 422  # already followed
    assert client.delete(f"/api/monitors/{m['id']}").status_code == 204
    assert client.get(f"/api/monitors/{m['id']}/items").status_code == 404
    with SessionLocal() as db:
        assert db.scalars(select(MonitorItem)).all() == [] and db.scalars(select(MonitorVersion)).all() == []


# --- The scheduler --------------------------------------------------------------------------------------------------

def test_the_scheduler_polls_what_is_due_and_no_more_than_a_few_a_minute(site, monkeypatch):
    site.routes["/feed.xml"] = {"body": RSS}
    inv = _case()
    with SessionLocal() as db:
        due = [following.create_monitor(db, inv, f"{site.base}/feed.xml?n={n}") for n in range(3)]
        later = following.create_monitor(db, inv, f"{site.base}/feed.xml?n=later")
        later.next_check_at = utcnow_naive() + timedelta(hours=1)
        paused = following.create_monitor(db, inv, f"{site.base}/feed.xml?n=paused")
        paused.active = False
        db.commit()
        ids, later_id, paused_id = [d.id for d in due], later.id, paused.id
    monkeypatch.setattr(settings, "follow_max_per_tick", 2)
    assert "follow_sources" in [t.name for t in TASKS]
    task = next(t for t in TASKS if t.name == "follow_sources")
    with SessionLocal() as db:
        assert task.run(db) == {"polled": 2}
        assert task.run(db) == {"polled": 1}
        assert task.run(db) == {"polled": 0}
        assert all(db.get(Monitor, i).health == "ok" for i in ids)
        assert db.get(Monitor, later_id).last_checked_at is None and db.get(Monitor, paused_id).last_checked_at is None
    assert scheduler_tick(SessionLocal, [task]) == ["follow_sources"]


# --- Backup, restore and deletion -----------------------------------------------------------------------------------

def test_what_is_followed_travels_in_a_backup_and_a_restored_case_sends_nothing_until_resumed(site, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "documents"))
    site.routes["/feed.xml"] = {"body": RSS}
    m = _follow(site)
    inv = m["investigation_id"]
    with SessionLocal() as db:
        data, manifest = build_investigation_export(db, inv)
        delete_investigation(db, inv, settings.document_storage_dir, confirmation=inv)
        assert db.get(Monitor, m["id"]) is None and db.scalars(select(MonitorItem)).all() == []
        restore_investigation_export(db, data, Path(settings.document_storage_dir))
        row = db.get(Monitor, m["id"])
        assert row is not None and row.active is False and row.url == site.base + "/feed.xml"
        assert len(db.scalars(select(MonitorItem).where(MonitorItem.monitor_id == m["id"])).all()) == 2
    hits_before = len(site.hits)
    with SessionLocal() as db:
        assert following.poll_due(db) == {"polled": 0}
    assert len(site.hits) == hits_before
    assert client.get(f"/api/investigations/{inv}/following").json()["monitors"][0]["health"] == "paused"
