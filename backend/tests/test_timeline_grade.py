"""A reporter's timeline event graded on Bellingcat's scale (ADR-0005,
line 5; app/services/timeline.py EVENT_GRADES): set when the event is
recorded or later, cleared with null, shown on the timeline and written
beside the event on the timeline chart."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.services.timeline import EVENT_GRADES
from app.visuals.data_service import VisualData, run_query
from app.visuals.echarts import status_words, timeline_text
from app.visuals.spec import QueryRef

client = TestClient(app)


def test_an_event_is_graded_on_bellingcats_scale_when_recorded_or_later():
    assert list(EVENT_GRADES) == ["confirmed", "likely", "weak", "unsubstantiated", "unknown"]
    inv = client.post("/api/investigations", json={"name": "Grades"}).json()
    made = client.post("/api/timeline-events", json={"investigation_id": inv["id"], "title": "Villa searched", "date_start": "2023-11-14",
                                                      "verification_status": "verified", "grade": "weak"})
    assert made.status_code == 200 and made.json()["grade"] == "weak"
    assert client.post("/api/timeline-events", json={"investigation_id": inv["id"], "title": "x", "date_start": "2023",
                                                     "grade": "airstrike"}).status_code == 422
    event_id = made.json()["id"]
    assert client.patch(f"/api/timeline-events/{event_id}", json={"grade": "likely"}).json()["grade"] == "likely"
    assert client.patch("/api/timeline-events/nope", json={"grade": "likely"}).status_code == 404

    events = client.get(f"/api/investigations/{inv['id']}/timeline").json()["events"]
    assert [(e["title"], e["grade"]) for e in events] == [("Villa searched", "likely")]

    # The timeline chart writes the grade beside the event's date and status.
    with SessionLocal() as db:
        data = run_query(db, inv["id"], QueryRef(name="events_in_order"))
    row = data.rows[0]
    assert row.grade == "likely" and status_words(row) == "verified, graded likely"
    assert timeline_text(row) == "14 Nov 2023 · verified, graded likely"
    assert VisualData.from_dict(data.as_dict()).rows[0].grade == "likely"

    assert client.patch(f"/api/timeline-events/{event_id}", json={"grade": None}).json()["grade"] is None
    with SessionLocal() as db:
        assert status_words(run_query(db, inv["id"], QueryRef(name="events_in_order")).rows[0]) == "verified"
