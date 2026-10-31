"""Does it work today? (app/services/platform_checks.py, mockup WORKS_1): each platform's public test item tried with
the tool a real save uses; today and the last 14 days; off by default; a pasted link warned about when its platform is
broken; each try in the outbound log. The tools are stood in for: the outside world is not asked from tests."""

from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import OutboundRequest, PlatformCheck
from app.services import platform_checks
from app.services.platform_checks import Result

client = TestClient(app)


@pytest.fixture
def tools(monkeypatch):
    said = {"yt-dlp": Result("works", "Saved as expected", []), "page": Result("broken", "A login wall came back instead of the post", ["the post"]),
            "open": Result("works", "Read 20 latest posts", [])}
    asked: list[str] = []
    monkeypatch.setattr(platform_checks, "_ytdlp", lambda url: asked.append(url) or said["yt-dlp"])
    monkeypatch.setattr(platform_checks, "_page", lambda url: asked.append(url) or said["page"])
    monkeypatch.setattr(platform_checks, "_open", lambda platform, url: asked.append(url) or said["open"])
    with SessionLocal() as db:
        db.query(PlatformCheck).delete()
        db.commit()
    return said, asked


def test_off_by_default_and_the_daily_run_asks_nothing_until_turned_on(tools):
    _said, asked = tools
    with SessionLocal() as db:
        assert platform_checks.setting(db)["daily"] is False
        assert platform_checks.daily(db) == 0 and asked == []
    on = client.patch("/api/platform-checks", json={"daily": True}).json()
    assert on["daily"] is True
    with SessionLocal() as db:
        assert platform_checks.daily(db) == len(platform_checks.PLATFORMS)
    assert len(asked) == len(platform_checks.PLATFORMS)
    client.patch("/api/platform-checks", json={"daily": False})


def test_each_platform_says_today_and_the_last_fourteen_days(tools):
    said, _asked = tools
    r = client.post("/api/platform-checks/run")
    assert r.status_code == 202, r.text
    out = client.get("/api/platform-checks").json()
    by = {p["key"]: p for p in out["platforms"]}
    assert by["youtube"]["state"] == "works" and by["instagram"]["state"] == "broken" and by["telegram"]["state"] == "works"
    assert by["instagram"]["detail"] == "A login wall came back instead of the post" and by["instagram"]["broken_since"]
    assert len(by["youtube"]["days"]) == 14 and by["youtube"]["days"][-1]["state"] == "works" and by["youtube"]["days"][0]["state"] is None
    assert out["checked"] == len(platform_checks.PLATFORMS) and out["working"] == sum(1 for p in out["platforms"] if p["state"] == "works")
    # Every try is a line in the outbound log, with what was asked and why.
    with SessionLocal() as db:
        lines = db.scalars(select(OutboundRequest).where(OutboundRequest.service == "Instagram (works today?)")).all()
        assert lines and lines[-1].value == "https://www.instagram.com/instagram/" and lines[-1].outcome == "failed"
    # A day earlier it worked: broken since today, the strip shows both.
    with SessionLocal() as db:
        db.add(PlatformCheck(platform="instagram", test_url="x", state="works", detail="", missing=[], seconds=1, tool="",
                             checked_at=utcnow_naive() - timedelta(days=1)))
        db.commit()
    by = {p["key"]: p for p in client.get("/api/platform-checks").json()["platforms"]}
    assert [d["state"] for d in by["instagram"]["days"][-2:]] == ["works", "broken"]


def test_a_pasted_link_is_warned_about_and_a_test_item_can_be_changed(tools):
    client.post("/api/platform-checks/run", params={"platform": "instagram"})
    warn = client.get("/api/platform-checks/for", params={"url": "https://www.instagram.com/p/abc/"}).json()
    assert warn["name"] == "Instagram" and warn["state"] == "broken"
    assert client.get("/api/platform-checks/for", params={"url": "https://news.example/a"}).json() is None
    client.patch("/api/platform-checks", json={"warn": False})
    assert client.get("/api/platform-checks/for", params={"url": "https://www.instagram.com/p/abc/"}).json() is None
    client.patch("/api/platform-checks", json={"warn": True})
    changed = client.patch("/api/platform-checks", json={"items": {"vimeo": "https://vimeo.com/1084537"}}).json()
    assert {p["key"]: p["test_url"] for p in changed["platforms"]}["vimeo"] == "https://vimeo.com/1084537"
    back = client.patch("/api/platform-checks", json={"items": {"vimeo": None}}).json()
    assert {p["key"]: p["test_url"] for p in back["platforms"]}["vimeo"] == "https://vimeo.com/76979871"
    assert client.patch("/api/platform-checks", json={"items": {"myspace": "https://myspace.example"}}).status_code == 422
    assert client.post("/api/platform-checks/run", params={"platform": "myspace"}).status_code == 422


def test_one_tool_failing_says_so_and_the_others_still_run(tools, monkeypatch):
    def broken(url):
        raise RuntimeError("extractor gone")

    monkeypatch.setattr(platform_checks, "_ytdlp", broken)
    client.post("/api/platform-checks/run")
    by = {p["key"]: p for p in client.get("/api/platform-checks").json()["platforms"]}
    assert by["youtube"]["state"] == "broken" and by["youtube"]["detail"] == "The check failed (RuntimeError)"
    assert by["telegram"]["state"] == "works"


def test_what_yt_dlp_answers_becomes_works_partly_or_broken(monkeypatch):
    import yt_dlp

    answers: list = []

    class Fake:
        def __init__(self, options):
            assert options["proxy"].startswith("http://127.0.0.1") and options["format"] == "b"

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def extract_info(self, url, download):
            assert download is False  # a check never downloads the media
            answer = answers.pop(0)
            if isinstance(answer, Exception):
                raise answer
            return answer

    monkeypatch.setattr(yt_dlp, "YoutubeDL", Fake)
    answers[:] = [{"title": "Me at the zoo", "uploader": "jawed", "url": "https://media.example/v.mp4"},
                  {"title": "A clip", "url": "https://media.example/v.mp4"},
                  yt_dlp.utils.DownloadError("ERROR: Sign in to confirm you're not a bot"),
                  yt_dlp.utils.DownloadError("ERROR: Requested format is not available")]
    assert platform_checks._ytdlp("https://www.youtube.com/watch?v=x").state == "works"
    partly = platform_checks._ytdlp("https://vimeo.com/1")
    assert partly.state == "partly" and partly.missing == ["the account"]
    walled = platform_checks._ytdlp("https://www.youtube.com/watch?v=y")
    assert walled.state == "broken" and "sign-in" in walled.detail
    assert platform_checks._ytdlp("https://www.tiktok.com/@a/video/1").state == "partly"


def test_a_visit_is_in_the_outbound_log_before_it_goes(monkeypatch):
    """ADR-0015: a visit that hangs or crashes midway is still in the log."""
    seen: list[int] = []

    def crash(url: str) -> Result:
        with SessionLocal() as db:
            seen.append(len(db.scalars(select(OutboundRequest).where(OutboundRequest.service == "Instagram (works today?)",
                                                                       OutboundRequest.value == url)).all()))
        raise RuntimeError("the browser crashed")

    monkeypatch.setattr(platform_checks, "_page", crash)
    with SessionLocal() as db:
        before = len(db.scalars(select(OutboundRequest).where(OutboundRequest.service == "Instagram (works today?)")).all())
        row = platform_checks.check(db, "instagram")
        assert row.state == "broken"
        lines = db.scalars(select(OutboundRequest).where(OutboundRequest.service == "Instagram (works today?)")).all()
    assert seen == [before + 1] and len(lines) == before + 1 and lines[-1].outcome == "failed"
