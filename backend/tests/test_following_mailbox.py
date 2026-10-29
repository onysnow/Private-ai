"""Following newsletters through a mailbox (app/services/mailbox.py, DECISIONS_LOG 11): one sender's new messages
queued without marking anything read, kept as they came, captured as an .eml document; the password kept outside the
case and gone with the mailbox; a refused login said in words."""

from __future__ import annotations

import imaplib
from email.message import EmailMessage
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document
from app.models.following import MonitorItem
from app.services import mailbox

client = TestClient(app)


def _mail(uid: int, sender: str, subject: str) -> bytes:
    m = EmailMessage()
    m["From"], m["To"], m["Subject"] = sender, "harbour-desk@example.net", subject
    m["Date"], m["Message-ID"] = "Tue, 15 Oct 2019 08:00:00 +0200", f"<{uid}@example.org>"
    m.set_content("Plain words about the harbour.")
    m.add_alternative('<p>Plain words <img src="https://track.example.org/pixel.gif"> about the harbour.</p>', subtype="html")
    return m.as_bytes()


class FakeImap:
    """A mailbox with three messages, two from the followed sender. Records what it was asked."""
    box = {1: _mail(1, "news@harbourwatch.example.org", "Issue 1"), 2: _mail(2, "someone@else.example", "Hello"),
           3: _mail(3, "news@harbourwatch.example.org", "Issue 2: the plot sale")}
    asked: list[tuple] = []
    password = "right horse"

    def __init__(self, host: str, port: int) -> None:
        self.asked.append(("connect", host, port))

    def login(self, user: str, password: str) -> None:
        if password != self.password:
            raise imaplib.IMAP4.error("[AUTHENTICATIONFAILED] Invalid credentials")
        self.asked.append(("login", user))

    def select(self, box: str, readonly: bool = False) -> None:
        self.asked.append(("select", box, readonly))

    def response(self, code: str):
        return code, [b"7"]

    def uid(self, command: str, *args):
        self.asked.append((command, *args))
        if command == "SEARCH":
            low = int(args[0].split()[1].split(":")[0])
            sender = args[2].strip('"')
            hits = [u for u, raw in self.box.items() if sender.encode() in raw and u >= low] or [max(self.box)]
            return "OK", [" ".join(map(str, hits)).encode()]
        return "OK", [(f"{args[0]} (BODY[] {{1}}".encode(), self.box[int(args[0])]), b")"]

    def logout(self) -> None:
        pass


@pytest.fixture(autouse=True)
def fake(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "documents"))
    monkeypatch.setattr(settings, "connector_credentials_file", str(tmp_path / "keys" / "connectors.json"))
    FakeImap.asked = []
    monkeypatch.setattr(mailbox, "_connect", lambda host, port: FakeImap(host, port))


def _follow(password: str = "right horse"):
    inv = client.post("/api/investigations", json={"name": "Harbour"}).json()["id"]
    r = client.post(f"/api/investigations/{inv}/monitors/mailbox", json={
        "host": "imap.example.net", "user": "harbour-desk@example.net", "password": password, "sender": "news@harbourwatch.example.org"})
    return inv, r


def test_queues_the_senders_new_messages_read_only_and_keeps_the_password_outside_the_case():
    inv, r = _follow()
    assert r.status_code == 200, r.text
    monitor = r.json()
    assert monitor["kind"] == "mailbox" and monitor["health"] == "works" and "right horse" not in str(monitor), monitor["checks"]
    assert monitor["name"] == "Newsletters from news@harbourwatch.example.org"
    assert ("select", "INBOX", True) in FakeImap.asked
    assert all(a[0] != "FETCH" or a[2] == "(BODY.PEEK[])" for a in FakeImap.asked)  # PEEK: nothing marked read
    with SessionLocal() as db:
        items = db.query(MonitorItem).filter(MonitorItem.monitor_id == monitor["id"]).order_by(MonitorItem.key).all()
        assert [i.title for i in items] == ["Issue 1", "Issue 2: the plot sale"]
        assert items[0].summary == "Plain words about the harbour." and str(items[0].published_at) == "2019-10-15 06:00:00"
    secrets = Path(settings.connector_credentials_file).with_name("mailboxes.json")
    assert "right horse" in secrets.read_text() and "right horse" not in str(client.get(f"/api/investigations/{inv}/following").json())

    # Checked again: nothing new is queued twice.
    FakeImap.asked = []
    assert client.post(f"/api/monitors/{monitor['id']}/check").json()["checks"][1]["text"] == "Nothing new from news@harbourwatch.example.org"
    assert ("SEARCH", "UID 4:*", "FROM", '"news@harbourwatch.example.org"') in FakeImap.asked


def test_a_captured_newsletter_is_an_eml_document_and_unfollowing_forgets_the_password():
    inv, r = _follow()
    monitor = r.json()
    with SessionLocal() as db:
        item = db.query(MonitorItem).filter(MonitorItem.monitor_id == monitor["id"], MonitorItem.title == "Issue 1").one()
    done = client.post(f"/api/monitor-items/{item.id}/capture")
    assert done.status_code == 200, done.text
    with SessionLocal() as db:
        kept = db.get(MonitorItem, item.id)
        doc = db.get(Document, kept.document_id)
        assert kept.state == "captured" and doc.filename == "Issue-1.eml" and b"Issue 1" in Path(doc.storage_path).read_bytes()
    assert client.delete(f"/api/monitors/{monitor['id']}").status_code == 204
    assert not Path(settings.connector_credentials_file).with_name("mailboxes.json").exists()


def test_a_refused_login_and_a_bad_sender_are_said_in_words():
    _inv, r = _follow(password="wrong")
    assert r.json()["health"] == "broken" and r.json()["health_detail"] == "the mailbox refused the user name or password"
    inv = client.post("/api/investigations", json={"name": "x"}).json()["id"]
    bad = client.post(f"/api/investigations/{inv}/monitors/mailbox", json={"host": "imap.example.net", "user": "u", "password": "p", "sender": "news"})
    assert bad.status_code == 422 and "Follow one sender" in bad.json()["detail"]
