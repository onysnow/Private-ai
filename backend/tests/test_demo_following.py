"""The 1MDB demo case's followed sources (app/services/demo_following.py): seeded straight into the case with what they
turned up, nothing fetched; the Following screen's answer has a queue, a changed page and a copy counted once; seeding
again adds nothing."""

from __future__ import annotations


from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Monitor, MonitorItem, PageVersion
from app.schemas.api import InvestigationCreate
from app.services import following
from app.services.demo_following import SOURCES, seed_following
from app.services.investigations import create_investigation

client = TestClient(app)


def _case() -> str:
    with SessionLocal() as db:
        return create_investigation(db, InvestigationCreate(name="Following demo")).id


def test_the_demo_follows_sources_with_items_waiting_and_fetches_nothing(monkeypatch):
    def no_network(*_a, **_k):
        raise AssertionError("seeding must not fetch")

    monkeypatch.setattr(following, "fetch", no_network)
    inv = _case()
    with SessionLocal() as db:
        assert seed_following(db, inv) == len(SOURCES)
        monitors = db.scalars(select(Monitor).where(Monitor.investigation_id == inv)).all()
        assert {m.kind for m in monitors} == {"feed", "page", "podcast", "closed"}
        # Each followed source works and is first asked a day from now; the closed platform has no monitor.
        for m in monitors:
            if m.kind == "closed":
                assert m.health == "closed" and m.next_check_at is None
            else:
                assert m.health == "works" and m.last_checked_at is not None
        items = db.scalars(select(MonitorItem).where(MonitorItem.investigation_id == inv,
                                                      ~MonitorItem.key.startswith("version:"))).all()
        assert all(2015 <= i.published_at.year <= 2019 for i in items)
        assert db.scalars(select(PageVersion).where(PageVersion.investigation_id == inv)).all()
        # Nothing is due now: a demo loaded offline does not ask anyone until tomorrow.
        # A demo never checks a site by itself: only a person's "Check now" does.
        assert all(m.next_check_at is None for m in monitors)

    body = client.get(f"/api/investigations/{inv}/following").json()
    assert body["followed"] == len(SOURCES) - 1 == body["working"]
    assert body["waiting"] == 7
    risks = {r["text"] for q in body["queue"] for r in q["risks"]}
    assert "Changed since capture · 2 lines" in risks
    assert any(t.startswith("At risk: edited") for t in risks)
    # The settlement and its restatement are one story: only the earliest waits.
    [group] = body["copies"]
    assert group["count"] == 2 and group["members"][0]["original"]
    assert all(q["state"] != "copy" for q in body["queue"])
    assert any(q["state"] == "skipped" for q in body["queue"])
    podcast = next(q for q in body["queue"] if q["kind"] == "podcast")
    assert podcast["extra"]["audio"]["bytes"]
    page = next(m for m in body["monitors"] if m["kind"] == "page")
    versions = client.get(f"/api/monitors/{page['id']}/versions").json()
    assert [v["number"] for v in versions] == [2, 1] and versions[1]["captured"] and versions[0]["lines_changed"] == 2


def test_seeding_again_adds_nothing():
    inv = _case()
    with SessionLocal() as db:
        seed_following(db, inv)
        counts = (db.query(Monitor).filter_by(investigation_id=inv).count(), db.query(MonitorItem).filter_by(investigation_id=inv).count(),
                  db.query(PageVersion).filter_by(investigation_id=inv).count())
        assert seed_following(db, inv) == 0
        assert counts == (db.query(Monitor).filter_by(investigation_id=inv).count(), db.query(MonitorItem).filter_by(investigation_id=inv).count(),
                          db.query(PageVersion).filter_by(investigation_id=inv).count())
