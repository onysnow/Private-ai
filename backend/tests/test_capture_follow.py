"""Checking a captured page again (mockup INTAKE_3, app/services/capture_follow.py): "Check again later", "Re-check
now", "Changed since capture", a page that is gone, and a link only's reason and "Ask again in 7 days".

Uses the small site from the Following tests. A capture is made directly (its page source kept on disk, as a finished
capture keeps it), so no browser is needed; the checks themselves are real requests to the site.
"""

from __future__ import annotations

import hashlib
from datetime import timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.models.domain import Capture, MonitorItem, OutboundRequest, PageVersion, Source
from app.services import capture_follow, following
from app.services.web_capture import capture_dir
from tests.test_following import _case, client, site  # noqa: F401  (site is a fixture)


def _saved_capture(inv: str, url: str, html: str) -> str:
    with SessionLocal() as db:
        source = Source(investigation_id=inv, title="About Fernhill Ltd", url=url)
        db.add(source)
        db.flush()
        row = Capture(investigation_id=inv, url=url, final_url=url, status="finished", outcome="saved", http_status=200,
                      captured_at=utcnow_naive() - timedelta(days=3), finished_at=utcnow_naive() - timedelta(days=3),
                      displayed={"title": "About Fernhill Ltd"}, source_id=source.id, files=[])
        db.add(row)
        db.flush()
        folder = capture_dir(settings.document_storage_dir, inv, row.id)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "page.html").write_bytes(html.encode())
        row.files = [{"name": "page.html", "role": "page source as received", "bytes": len(html),
                      "sha256": hashlib.sha256(html.encode()).hexdigest()}]
        db.commit()
        return row.id


def _requests(inv: str) -> int:
    with SessionLocal() as db:
        return len(db.scalars(select(OutboundRequest).where(OutboundRequest.investigation_id == inv)).all())


def test_check_again_later_starts_from_the_captured_page_without_a_visit(site):
    inv = _case()
    cid = _saved_capture(inv, site.base + "/about", site.page)
    r = client.put(f"/api/captures/{cid}/follow", json={"every": "weekly"})
    assert r.status_code == 200, r.text
    follow = r.json()["follow"]
    assert follow["every"] == "weekly" and follow["state"] == "unchecked"
    assert [v["number"] for v in follow["versions"]] == [1] and follow["versions"][0]["captured"] is True
    assert "One request a week" in follow["leaves"]
    assert _requests(inv) == 0 and not site.requests  # version 1 is the captured page: nothing was asked
    with SessionLocal() as db:
        monitor = capture_follow.monitor_for(db, db.get(Capture, cid))
        assert monitor is not None and monitor.kind == "page" and monitor.capture_id == cid
        assert timedelta(days=6, hours=23) < monitor.next_check_at - utcnow_naive() <= timedelta(days=7)
    never = client.put(f"/api/captures/{cid}/follow", json={"every": "never"}).json()["follow"]
    assert never["every"] == "never" and never["next_check_at"] is None


def test_a_recheck_finds_the_same_text_then_a_change_word_by_word(site):
    inv = _case()
    cid = _saved_capture(inv, site.base + "/about", site.page)
    same = client.post(f"/api/captures/{cid}/recheck").json()["follow"]
    assert same["state"] == "same" and same["checks"][0]["status"] == 200 and same["checks"][0]["seconds"] is not None
    assert same["every"] == "never" and same["next_check_at"] is None  # a re-check alone schedules nothing
    site.page = site.page.replace("Harbour Nominees Ltd (40%) and Kestrel SA (60%)", "a privately held company") \
        .replace("Directors: A. Ross, M. Vale.", "Directors: M. Vale.")
    changed = client.post(f"/api/captures/{cid}/recheck").json()
    follow = changed["follow"]
    assert follow["state"] == "changed"
    assert [(v["number"], v["captured"]) for v in follow["versions"]] == [(1, True), (2, False)]
    words = [(s["op"], s["text"].strip()) for block in follow["changes"] for s in block["segments"]]
    assert ("del", "Harbour Nominees Ltd (40%) and Kestrel SA (60%)") in words
    assert ("ins", "a privately held company") in words and ("del", "A. Ross,") in words
    assert follow["captured_text"] and follow["live_text"] and follow["item_id"]
    # The new version waits in Following's queue too: the app watches, a person captures.
    with SessionLocal() as db:
        item = db.get(MonitorItem, follow["item_id"])
        assert item is not None and item.state == "waiting"
    marked = client.post(f"/api/captures/{cid}/mark-changed").json()["follow"]["marked_changed"]
    assert marked["state"] == "changed" and marked["version"] == 2
    with SessionLocal() as db:
        row = db.get(Capture, cid)
        source = db.get(Source, row.source_id)
        assert source.metadata_json["changed_since_capture"]["capture_id"] == cid
        # "Capture version 2 · keeps both": the new capture is linked to the version and its queue item.
        new = Capture(investigation_id=inv, url=row.url, status="queued")
        db.add(new)
        db.commit()
        capture_follow.link_new_capture(db, row, new, "local-owner")
        latest = db.scalars(select(PageVersion).where(PageVersion.number == 2, PageVersion.investigation_id == inv)).one()
        assert latest.captured and latest.capture_id == new.id
        assert db.get(MonitorItem, follow["item_id"]).state == "captured"


def test_a_page_that_now_answers_404_is_gone_and_nothing_else_can_be_marked(site):
    inv = _case()
    cid = _saved_capture(inv, site.base + "/about", site.page)
    assert client.post(f"/api/captures/{cid}/mark-changed").status_code == 409  # not checked: nothing to mark
    site.status["/about"] = 404
    gone = client.post(f"/api/captures/{cid}/recheck").json()["follow"]
    assert gone["state"] == "gone" and gone["checks"][0]["status"] == 404
    assert client.post(f"/api/captures/{cid}/mark-changed").status_code == 200


def test_a_link_only_has_a_reason_a_person_can_change_and_is_asked_again(site):
    inv = _case()
    url = site.base + "/about"
    with SessionLocal() as db:
        row = Capture(investigation_id=inv, url=url, status="finished", outcome="link_only", http_status=404,
                      reason="The site answered 404 Not Found", finished_at=utcnow_naive())
        db.add(row)
        db.commit()
        cid = row.id
    got = client.get(f"/api/captures/{cid}").json()
    assert got["reason_kind"] == "dead_link" and got["reason_kind_by"] is None and got["follow"] is None
    set_ = client.patch(f"/api/captures/{cid}", json={"reason_kind": "blocked"}).json()
    assert set_["reason_kind"] == "blocked" and set_["reason_kind_by"] == "local-owner"
    assert client.patch(f"/api/captures/{cid}", json={"reason_kind": "lost"}).status_code == 422
    asked = client.put(f"/api/captures/{cid}/follow", json={"every": "weekly"}).json()["follow"]
    assert asked["state"] == "unchecked" and asked["versions"] == []  # nothing was captured to start from
    site.status["/about"] = 404
    assert client.post(f"/api/captures/{cid}/recheck").json()["follow"]["state"] == "broken"
    del site.status["/about"]
    answers = client.post(f"/api/captures/{cid}/recheck").json()["follow"]
    assert answers["state"] == "answers" and answers["item_id"]
    screen = client.get(f"/api/investigations/{inv}/following").json()
    assert any(q["id"] == answers["item_id"] and q["state"] == "waiting" for q in screen["queue"])


def test_a_saved_capture_has_no_reason_to_set_and_a_running_one_cannot_be_followed(site):
    inv = _case()
    cid = _saved_capture(inv, site.base + "/about", site.page)
    assert client.get(f"/api/captures/{cid}").json()["reason_kind"] is None
    assert client.patch(f"/api/captures/{cid}", json={"reason_kind": "blocked"}).status_code == 409
    with SessionLocal() as db:
        row = Capture(investigation_id=inv, url=site.base + "/about", status="capturing")
        db.add(row)
        db.commit()
        running = row.id
    assert client.put(f"/api/captures/{running}/follow", json={"every": "daily"}).status_code == 409
    assert client.post("/api/captures/nope/recheck").status_code == 404


def test_a_scheduled_check_runs_only_when_due(site):
    inv = _case()
    cid = _saved_capture(inv, site.base + "/about", site.page)
    client.put(f"/api/captures/{cid}/follow", json={"every": "daily"})
    with SessionLocal() as db:
        assert following.check_due(db) == 0  # due tomorrow
        assert following.check_due(db, now=utcnow_naive() + timedelta(days=1, minutes=10)) == 1
    follow = client.get(f"/api/captures/{cid}").json()["follow"]
    assert follow["state"] == "same" and follow["next_check_at"] is not None
