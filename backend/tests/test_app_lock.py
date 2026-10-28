"""Your name and the app lock (ADR-0016, mockups ACCOUNT_1-4): enforced by the server, not drawn over the screen."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import ClaimEvidenceLink, Investigation, LocalProfile
from app.services import app_lock

client = TestClient(app)
PASS = "harbour tide lantern copper"


@pytest.fixture(autouse=True)
def _fresh_sessions():
    app_lock.forget_sessions()
    yield
    app_lock.forget_sessions()


def start() -> dict:
    reply = client.post("/api/session/start")
    assert reply.status_code == 200, reply.text
    return reply.json()


def h(token: str) -> dict:
    return {"X-Workbench-Session": token}


def protect(token: str) -> list[str]:
    reply = client.post("/api/me/protection", json={"passphrase": PASS}, headers=h(token))
    assert reply.status_code == 200, reply.text
    return reply.json()["words"]


def test_without_a_passphrase_nothing_changes():
    assert client.get("/api/investigations").status_code == 200
    state = start()
    assert state["protection"] == "none" and state["locked"] is False and state["name"] is None
    assert state["disk"]["state"] in {"encrypted", "encrypting", "paused", "decrypting", "not_encrypted", "unknown"}


def test_your_name_goes_on_your_decisions_and_is_never_filled_in():
    token = start()["session"]
    assert client.put("/api/me/name", json={"name": "   "}, headers=h(token)).status_code == 400
    assert client.put("/api/me/name", json={"name": "  Ony  "}, headers=h(token)).json()["name"] == "Ony"
    inv = client.post("/api/investigations", json={"name": "Named"}).json()["id"]
    claim = client.post("/api/claims", json={"investigation_id": inv, "text": "A claim"}).json()
    src = client.post("/api/sources", json={"investigation_id": inv, "title": "A note", "source_type": "web"}).json()
    ev = client.post("/api/evidence", json={"source_id": src["id"], "quote": "words"}).json()
    client.post(f"/api/claims/{claim['id']}/evidence", json={"evidence_id": ev["id"], "stance": "supports"})
    with SessionLocal() as db:
        link = db.query(ClaimEvidenceLink).filter(ClaimEvidenceLink.claim_id == claim["id"]).one()
        assert (link.decided_by_id, link.decided_by_name) == ("local-owner", "Ony")


def test_a_passphrase_locks_the_api_until_it_is_given():
    token = start()["session"]
    words = protect(token)
    assert len(words) == 12 and app_lock.valid_recovery_words(" ".join(words))
    with SessionLocal() as db:
        row = db.get(LocalProfile, 1)
        assert PASS not in (row.passphrase_hash or "") and row.passphrase_hash.startswith("$argon2id$")
        assert row.backup_recipient.startswith("age1") and "AGE-SECRET-KEY" not in (row.identity_by_passphrase or "")
    # The browser that set it stays open; another one, or none, is locked.
    assert client.get("/api/investigations", headers=h(token)).status_code == 200
    other = start()
    assert other["locked"] is True and "name" not in other or other.get("name") is None
    locked = client.get("/api/investigations", headers=h(other["session"]))
    assert locked.status_code == 423 and locked.json()["locked"] is True
    assert client.get("/api/investigations").status_code == 423
    # The screen at :3000 must see the 423 itself (not a network error), and its preflight is never locked.
    web = {"Origin": "http://localhost:3000"}
    seen = client.get("/api/investigations", headers=web)
    assert seen.status_code == 423 and seen.headers["access-control-allow-origin"] == "http://localhost:3000"
    preflight = client.options("/api/settings/status", headers={**web, "Access-Control-Request-Method": "GET",
                                                                "Access-Control-Request-Headers": "x-workbench-session"})
    assert preflight.status_code == 200
    assert client.get("/api/investigations", headers={"Origin": "https://elsewhere.example"}).headers.get("access-control-allow-origin") is None
    assert client.get("/api/health").status_code == 200
    assert client.post("/api/session/unlock", json={"passphrase": "wrong"}, headers=h(other["session"])).status_code == 400
    assert client.post("/api/session/unlock", json={"passphrase": PASS}, headers=h(other["session"])).json()["locked"] is False
    assert client.get("/api/investigations", headers=h(other["session"])).status_code == 200


def test_idle_hide_and_restart_lock_and_the_pin_reopens_only_after_the_passphrase():
    token = start()["session"]
    protect(token)
    assert client.put("/api/me/locking", json={"quick_pin": True}, headers=h(token)).status_code == 400   # no PIN yet
    assert client.put("/api/me/pin", json={"pin": "12a4"}, headers=h(token)).status_code == 400
    assert client.put("/api/me/pin", json={"pin": "2468"}, headers=h(token)).json()["quick_pin"] is True
    # Hide screen
    assert client.post("/api/session/lock", json={"reason": "hide"}, headers=h(token)).json() == {
        **client.get("/api/session", headers=h(token)).json()}
    assert client.get("/api/investigations", headers=h(token)).status_code == 423
    assert client.post("/api/session/unlock-pin", json={"pin": "2468"}, headers=h(token)).json()["locked"] is False
    # Idle: measured from activity the screen reports, not from requests
    session = app_lock.get_session(token)
    session.last_seen = utcnow_naive() - timedelta(minutes=11)
    assert client.get("/api/investigations", headers=h(token)).status_code == 423
    # 3 wrong PINs and only the passphrase works
    for left in ("2 tries left", "1 try left", "Use the passphrase now"):
        assert left in client.post("/api/session/unlock-pin", json={"pin": "0000"}, headers=h(token)).json()["detail"]
    assert client.post("/api/session/unlock-pin", json={"pin": "2468"}, headers=h(token)).status_code == 400
    assert client.post("/api/session/unlock", json={"passphrase": PASS}, headers=h(token)).json()["locked"] is False
    # A restart forgets every session: a new one may not use the PIN
    app_lock.forget_sessions()
    fresh = start()
    assert fresh["locked"] is True and fresh["pin"] is False
    assert client.post("/api/session/unlock-pin", json={"pin": "2468"}, headers=h(fresh["session"])).status_code == 400


def test_the_recovery_words_open_it_and_set_a_new_passphrase():
    token = start()["session"]
    words = protect(token)
    app_lock.forget_sessions()
    other = start()["session"]
    bad = " ".join(reversed(words))
    assert client.post("/api/session/recover", json={"words": bad, "new_passphrase": "a brand new passphrase"}, headers=h(other)).status_code == 400
    typed = "  ".join(w.upper() for w in words)   # case and spacing do not matter
    assert client.post("/api/session/recover", json={"words": typed, "new_passphrase": "short"}, headers=h(other)).status_code == 400
    assert client.post("/api/session/recover", json={"words": typed, "new_passphrase": "a brand new passphrase"}, headers=h(other)).json()["locked"] is False
    app_lock.forget_sessions()
    third = start()["session"]
    assert client.post("/api/session/unlock", json={"passphrase": PASS}, headers=h(third)).status_code == 400
    assert client.post("/api/session/unlock", json={"passphrase": "a brand new passphrase"}, headers=h(third)).status_code == 200
    with SessionLocal() as db:   # the backup key still opens with the new passphrase and the same words
        row = db.get(LocalProfile, 1)
        assert app_lock.backup_identity(row, passphrase="a brand new passphrase").startswith("AGE-SECRET-KEY")
        assert app_lock.backup_identity(row, words=typed) == app_lock.backup_identity(row, passphrase="a brand new passphrase")


def test_a_case_locked_on_its_own_is_absent_until_opened():
    token = start()["session"]
    secret_case = client.post("/api/investigations", json={"name": "Source case"}).json()["id"]
    other_case = client.post("/api/investigations", json={"name": "Planning files"}).json()["id"]
    assert client.put(f"/api/me/cases/{secret_case}/lock", json={"passphrase": "short"}, headers=h(token)).status_code == 400
    state = client.put(f"/api/me/cases/{secret_case}/lock", json={"passphrase": "quiet river stone"}, headers=h(token)).json()
    assert state["locked_cases"] == [{"id": secret_case, "name": "Source case", "set_at": state["locked_cases"][0]["set_at"], "open": False}]
    ids = {i["id"] for i in client.get("/api/investigations", headers=h(token)).json()}
    assert other_case in ids and secret_case not in ids
    assert client.get(f"/api/investigations/{secret_case}/claims", headers=h(token)).status_code == 404
    # A new case can still be made while another is locked
    assert client.post("/api/investigations", json={"name": "New one"}, headers=h(token)).status_code == 200
    assert client.post(f"/api/session/cases/{secret_case}/open", json={"passphrase": "wrong one"}, headers=h(token)).status_code == 400
    client.post(f"/api/session/cases/{secret_case}/open", json={"passphrase": "quiet river stone"}, headers=h(token))
    assert client.get(f"/api/investigations/{secret_case}/claims", headers=h(token)).status_code == 200
    # Only in this session
    assert secret_case not in {i["id"] for i in client.get("/api/investigations", headers=h(start()["session"])).json()}
    client.post(f"/api/session/cases/{secret_case}/close", headers=h(token))
    assert client.get(f"/api/investigations/{secret_case}/claims", headers=h(token)).status_code == 404
    client.post(f"/api/me/cases/{secret_case}/unlock-for-good", json={"passphrase": "quiet river stone"}, headers=h(token))
    with SessionLocal() as db:
        assert db.get(Investigation, secret_case).case_lock is None


def test_turning_it_off_needs_the_passphrase():
    token = start()["session"]
    protect(token)
    assert client.post("/api/me/protection/off", json={"passphrase": "nope"}, headers=h(token)).status_code == 400
    assert client.post("/api/me/protection/off", json={"passphrase": PASS}, headers=h(token)).json()["protection"] == "none"
    assert client.get("/api/investigations").status_code == 200


# --- encrypted backups, keys that expire, who decided what (ADR-0016) ---------------------------------------------

def test_with_a_passphrase_backups_are_encrypted_and_open_anywhere_with_either_secret():
    from app.services.sealed_backups import is_sealed, open_sealed

    token = start()["session"]
    inv = client.post("/api/investigations", json={"name": "Sealed"}).json()["id"]
    plain = client.get(f"/api/investigations/{inv}/export", headers=h(token))
    assert plain.headers["x-jw-backup-encrypted"] == "false" and not is_sealed(plain.content)
    words = protect(token)
    sealed = client.get(f"/api/investigations/{inv}/export", headers=h(token))
    assert sealed.headers["x-jw-backup-encrypted"] == "true" and is_sealed(sealed.content)
    assert b"Sealed" not in sealed.content and ".encrypted.zip" in sealed.headers["content-disposition"]
    with SessionLocal() as db:
        assert db.get(Investigation, inv).last_backup["encrypted"] is True
        from app.models.domain import BackupEvent
        events = db.query(BackupEvent).filter_by(investigation_id=inv).order_by(BackupEvent.at).all()
        assert [e.encrypted for e in events] == [False, True], "each backup event keeps whether its file was sealed"
    assert open_sealed(sealed.content, PASS) == open_sealed(sealed.content, " ".join(words))
    files = {"file": ("b.zip", sealed.content, "application/zip")}
    no_secret = client.post("/api/backups/preview", files=files, headers=h(token))
    assert no_secret.status_code == 400 and "encrypted" in no_secret.json()["detail"]
    wrong = client.post("/api/backups/preview", files=files, data={"secret": "not it"}, headers=h(token))
    assert wrong.status_code == 400 and "does not open" in wrong.json()["detail"]
    ok = client.post("/api/backups/preview", files=files, data={"secret": " ".join(w.upper() for w in words)}, headers=h(token))
    assert ok.status_code == 200 and ok.json()["investigation"]["name"] == "Sealed"


def test_a_persons_key_expires_and_shows_its_last_two_characters():
    from app.services.identity import scope_for_persisted_token

    made = client.post("/api/settings/security/users", json={"display_name": "Maya Rees", "key_days": 45})
    assert made.status_code == 400
    made = client.post("/api/settings/security/users", json={"display_name": "Maya Rees"}).json()
    row = next(u for u in client.get("/api/settings/security/users").json() if u["id"] == made["id"])
    assert row["token_hint"] == made["token"][-2:] and row["token_status"] == "active" and row["token_expires_at"]
    with SessionLocal() as db:
        assert scope_for_persisted_token(db, made["token"]) is not None
        from app.models.domain import AppUser
        db.get(AppUser, made["id"]).token_expires_at = utcnow_naive() - timedelta(minutes=1)
        db.commit()
        assert scope_for_persisted_token(db, made["token"]) is None
    assert next(u for u in client.get("/api/settings/security/users").json() if u["id"] == made["id"])["token_status"] == "expired"
    renewed = client.post(f"/api/settings/security/users/{made['id']}/token/rotate?key_days=90").json()
    with SessionLocal() as db:
        assert scope_for_persisted_token(db, renewed["token"]) is not None


def test_who_decided_what_counts_by_name_with_a_person_last():
    token = start()["session"]
    inv = client.post("/api/investigations", json={"name": "Counted"}).json()["id"]
    src = client.post("/api/sources", json={"investigation_id": inv, "title": "Note", "source_type": "web"}).json()
    claim = client.post("/api/claims", json={"investigation_id": inv, "text": "A claim"}).json()

    def link() -> None:
        ev = client.post("/api/evidence", json={"source_id": src["id"], "quote": "q"}).json()
        client.post(f"/api/claims/{claim['id']}/evidence", json={"evidence_id": ev["id"], "stance": "supports"}, headers=h(token))

    link()   # no name yet: "a person"
    assert client.get("/api/me", headers=h(token)).json()["unsigned_decisions"] >= 1
    client.put("/api/me/name", json={"name": "Ony"}, headers=h(token))
    link()
    link()
    counted = client.get(f"/api/investigations/{inv}/deciders", headers=h(token)).json()
    assert client.get("/api/me", headers=h(token)).json()["unsigned_decisions"] is None   # asked only before a name
    assert counted == {"days": 30, "people": [{"name": "Ony", "decisions": 2}, {"name": None, "decisions": 1}]}


def test_the_disk_check_says_unknown_rather_than_guess_and_takes_the_reporters_answer(monkeypatch):
    from app.services import disk_encryption

    disk_encryption.disk_status.cache_clear()
    monkeypatch.setattr(disk_encryption, "_in_container", lambda: True)
    monkeypatch.setattr(disk_encryption.platform, "system", lambda: "Linux")
    token = start()["session"]
    disk = client.get("/api/me", headers=h(token)).json()["disk"]
    assert disk["state"] == "unknown" and disk["system"] == "docker" and "Device encryption" in disk["how_to"]
    disk = client.put("/api/me/disk", json={"answer": "encrypted"}, headers=h(token)).json()["disk"]
    assert disk["state"] == "encrypted" and disk["answered"] is True
    assert client.put("/api/me/disk", json={"answer": "maybe"}, headers=h(token)).status_code == 400
    disk_encryption.disk_status.cache_clear()
