"""Settings kept on the server (app/services/preferences.py) and what they decide: the inbox's routes, watches on
facts, outside lookups per source and per case (Off refuses, Automatic looks a new party up), research and the run
defaults for new cases."""
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.connectors.base import Connector, ExternalFinding
from app.connectors.registry import registry
from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import ConnectorRun, PatternFlag
from app.services import notifications, preferences

client = TestClient(app)


class _Found(Connector):
    def __init__(self) -> None:
        self.asked: list[str] = []

    async def search(self, query: str):
        self.asked.append(query)
        return [ExternalFinding(provider="probe", record_id="r1", caption=f"{query} (found)", schema="Company")]


@pytest.fixture
def probe():
    connector = _Found()
    registry.register("probe", connector)
    yield connector
    registry._connectors.pop("probe", None)


def _case(name: str = "Kestrel SA") -> str:
    return client.post("/api/investigations", json={"name": name}).json()["id"]


def _party(inv: str, caption: str = "Fernhill Ltd", schema: str = "Company") -> dict:
    res = client.post("/api/entities", json={"investigation_id": inv, "schema": schema, "caption": caption,
                                             "properties": {"name": [caption]}})
    assert res.status_code == 200, res.text
    return res.json()


def _flag(inv: str, level: str, *, days_ago: int = 0) -> str:
    with SessionLocal() as db:
        flag = PatternFlag(investigation_id=inv, indicator_id="BO-032", fingerprint=f"fp-{level}-{days_ago}", level=level,
                           parties=[], links=[], facts={}, first_seen_at=utcnow_naive() - timedelta(days=days_ago))
        db.add(flag)
        db.commit()
        return flag.id


# --- Notifications -----------------------------------------------------------------------------------------------

def test_notifications_start_from_the_defaults_and_keep_a_change():
    prefs = client.get("/api/settings/notifications").json()
    assert prefs["routes"]["flag_textbook"] == "interrupt"
    assert prefs["routes"]["flag_faint"] == "else"
    assert prefs["quiet_while_reading"] is True and prefs["desktop"] is False
    assert [k["key"] for k in prefs["kinds"]][0] == "flag_textbook"

    saved = client.put("/api/settings/notifications", json={"routes": {"flag_faint": "off"}, "desktop": True}).json()
    assert saved["routes"]["flag_faint"] == "off"
    assert saved["routes"]["flag_strong"] == "needs"
    assert saved["desktop"] is True


def test_only_what_can_mean_danger_may_interrupt():
    res = client.put("/api/settings/notifications", json={"routes": {"flag_faint": "interrupt"}})
    assert res.status_code == 400
    assert "cannot go to" in res.json()["detail"]
    assert client.put("/api/settings/notifications", json={"routes": {"nothing": "needs"}}).status_code == 400


def test_each_person_keeps_their_own_routes():
    with SessionLocal() as db:
        preferences.save_notification_prefs(db, "reporter-a", routes={"flag_strong": "else"}, quiet_while_reading=False, desktop=False)
        assert preferences.notification_prefs(db, "reporter-b")["routes"]["flag_strong"] == "needs"
        assert preferences.notification_prefs(db, "reporter-a")["quiet_while_reading"] is False


def test_inbox_sends_each_row_where_its_kind_goes():
    inv = _case()
    textbook = _flag(inv, "textbook")
    _flag(inv, "faint")
    _flag(inv, "strong", days_ago=10)  # older than a week: not news

    box = client.get(f"/api/investigations/{inv}/inbox").json()
    assert [r["key"] for r in box["interrupt"]] == [f"f:{textbook}"]
    assert box["needs"][0]["kind"] == "flag_textbook"
    assert box["needs"][0]["title"].startswith("Textbook Red Flag: ")
    assert [r["kind"] for r in box["else"]] == ["flag_faint"]
    assert box["week"]["flag_textbook"] == 1 and box["week"]["flag_strong"] == 0

    client.put("/api/settings/notifications", json={"routes": {"flag_textbook": "needs", "flag_faint": "off"}})
    box = client.get(f"/api/investigations/{inv}/inbox").json()
    assert box["interrupt"] == []
    assert [r["kind"] for r in box["needs"]] == ["flag_textbook"]
    assert box["else"] == []
    assert box["week"]["flag_faint"] == 1  # still counted for the replay


# --- Watches -----------------------------------------------------------------------------------------------------

def test_a_watched_claim_shows_when_its_status_changes_until_seen():
    inv = _case()
    claim = client.post("/api/claims", json={"investigation_id": inv, "text": "Kestrel SA bought the harbour land in 2020"}).json()
    watch = client.post("/api/watches", json={"record_type": "claim", "record_id": claim["id"]}).json()
    assert watch["changed"] is False and watch["baseline_words"] == "Lead"

    assert client.patch(f"/api/claims/{claim['id']}", json={"status": "disputed"}).status_code == 200
    listed = client.get(f"/api/investigations/{inv}/watches").json()
    assert listed[0]["changed"] is True and listed[0]["value_words"] == "Disputed"
    row = next(r for r in client.get(f"/api/investigations/{inv}/inbox").json()["needs"] if r["kind"] == "watch")
    assert row["reason"] == "Lead → Disputed"

    seen = client.post(f"/api/watches/{watch['id']}/seen").json()
    assert seen["changed"] is False and seen["baseline"] == "disputed"
    assert not [r for r in client.get(f"/api/investigations/{inv}/inbox").json()["needs"] if r["kind"] == "watch"]

    assert client.delete(f"/api/watches/{watch['id']}").status_code == 204
    assert client.get(f"/api/investigations/{inv}/watches").json() == []


def test_a_watched_red_flag_shows_when_it_stops_firing():
    inv = _case()
    flag = _flag(inv, "strong")
    client.post("/api/watches", json={"record_type": "red_flag", "record_id": flag})
    with SessionLocal() as db:
        db.get(PatternFlag, flag).gone_at = utcnow_naive()
        db.commit()
    assert client.get(f"/api/investigations/{inv}/watches").json()[0]["value_words"] == "No longer fires"
    assert client.post("/api/watches", json={"record_type": "claim", "record_id": "nope"}).status_code == 404


# --- Outside lookups ---------------------------------------------------------------------------------------------

def test_lookups_default_to_ask_and_a_case_can_turn_a_source_off(probe):
    inv = _case()
    looks = client.get("/api/settings/lookups", params={"investigation_id": inv}).json()
    assert {s["key"]: s["mode"] for s in looks["sources"]}["probe"] == "ask"
    assert client.post("/api/connectors/probe/search", json={"investigation_id": inv, "query": "Fernhill"}).status_code == 200

    res = client.put(f"/api/investigations/{inv}/lookups", json={"modes": {"probe": "off"}, "reason": "source protection"})
    assert res.status_code == 200
    assert res.json()["cases"][0]["modes"] == {"probe": "off"}
    refused = client.post("/api/connectors/probe/search", json={"investigation_id": inv, "query": "Fernhill"})
    assert refused.status_code == 403 and "off for this case" in refused.json()["detail"]
    party = _party(inv)
    assert client.post(f"/api/entities/{party['id']}/enrich/probe").status_code == 403
    assert client.post(f"/api/entities/{party['id']}/enrich", json={"providers": ["probe"]}).status_code == 400
    assert probe.asked == ["Fernhill"]

    cleared = client.delete(f"/api/investigations/{inv}/lookups").json()
    assert cleared["cases"] == []
    assert client.post("/api/connectors/probe/search", json={"investigation_id": inv, "query": "Fernhill"}).status_code == 200


def test_a_case_override_needs_a_reason_and_known_sources(probe):
    inv = _case()
    assert client.put(f"/api/investigations/{inv}/lookups", json={"modes": {"probe": "off"}, "reason": " "}).status_code == 400
    assert client.put(f"/api/investigations/{inv}/lookups", json={"modes": {"nowhere": "off"}, "reason": "x"}).status_code == 400


def test_automatic_looks_a_new_party_up_once_and_the_log_names_it(probe):
    inv = _case()
    client.put("/api/settings/lookups", json={"defaults": {"probe": "automatic"}})
    party = _party(inv, "Fernhill Ltd")
    _party(inv, "12 Harbour Road", schema="Address")  # not a name to look up
    assert probe.asked == ["Fernhill Ltd"]
    with SessionLocal() as db:
        runs = [r for r in db.query(ConnectorRun).all() if r.provider == "probe"]
        assert len(runs) == 1 and runs[0].status == "completed"
        from app.services.connectors import automatic_lookups_due
        from app.models.domain import Entity
        assert automatic_lookups_due(db, db.get(Entity, party["id"])) == []

    looks = client.get("/api/settings/lookups", params={"investigation_id": inv}).json()
    source = next(s for s in looks["sources"] if s["key"] == "probe")
    assert source["default"] == "automatic" and source["last"]["sent"] == "Fernhill Ltd" and source["last"]["is_party"]
    assert source["cases_this_month"] == 1
    assert looks["week"][0]["case"] == "Kestrel SA"


def test_a_refused_key_reads_as_refused():
    from app.services.connector_activity import _refused
    assert _refused("Client error '401 Unauthorized' for url")
    assert not _refused("ReadTimeout")


# --- AI and research ---------------------------------------------------------------------------------------------

def test_research_mode_and_run_defaults_for_new_cases():
    res = client.get("/api/settings/research").json()
    assert res["mode"] == "ask" and res["can_change_defaults"] is True
    assert {s["key"] for s in res["settings"]} >= {"source_tier_floor", "devils_advocate"}
    assert res["locked"]

    assert client.put("/api/settings/research", json={"mode": "off"}).json()["mode"] == "off"
    assert client.put("/api/settings/research", json={"options": {"devils_advocate": "ON"}}).status_code == 400  # no reason
    saved = client.put("/api/settings/research", json={"options": {"devils_advocate": "ON"}, "reason": "contested cases"}).json()
    assert next(s for s in saved["settings"] if s["key"] == "devils_advocate")["case_default"] == "ON"
    assert saved["defaults_reason"] == "contested cases"

    # A case that has not saved its own starts from them; one that differs is listed with what differs.
    inv = _case("Harbour land")
    with SessionLocal() as db:
        from app.services.run_plan import get_profile, save_profile
        assert get_profile(db, inv)["options"]["devils_advocate"] == "ON"
        save_profile(db, inv, flags=None, options={"devils_advocate": "OFF", "research_depth": "EXHAUSTIVE"}, premises=None, reason="test")
    cases = client.get("/api/settings/research").json()["cases"]
    assert cases[0]["name"] == "Harbour land" and "Research depth" in cases[0]["differs"]


def test_research_due_only_after_a_run_and_while_asking():
    inv = _case()
    with SessionLocal() as db:
        assert notifications.research_due(db, inv) is None  # never ran: not nagged
