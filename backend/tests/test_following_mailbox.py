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
REAL_CONNECT = mailbox._connect


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


def test_a_mailbox_is_never_set_to_tor_and_one_set_to_tor_is_not_read_directly():
    from app.models.following import Monitor
    from app.models.outbound import OutboundRequest

    inv, r = _follow()
    mid = r.json()["id"]
    refused = client.patch(f"/api/monitors/{mid}", json={"route": "tor"})
    assert refused.status_code == 422 and "Tor is not built yet" in refused.json()["detail"]
    with SessionLocal() as db:
        assert db.get(Monitor, mid).route == "direct"
        # A mailbox row already set to Tor (before this was refused) is treated as refused: no connection at all.
        db.get(Monitor, mid).route = "tor"
        db.commit()
        logged = db.query(OutboundRequest).filter(OutboundRequest.investigation_id == inv).count()
    FakeImap.asked = []
    checked = client.post(f"/api/monitors/{mid}/check").json()
    assert FakeImap.asked == [] and checked["health"] == "broken" and "Tor" in checked["health_detail"]
    with SessionLocal() as db:
        rows = db.query(OutboundRequest).filter(OutboundRequest.investigation_id == inv).all()
        assert len(rows) == logged and not any("through Tor" in (row.reason or "") for row in rows)


def test_the_mail_server_is_a_public_address_on_an_imap_port_and_failures_read_the_same(monkeypatch):
    import socket

    inv = client.post("/api/investigations", json={"name": "Probe"}).json()["id"]
    body = {"host": "mail.corp.example", "user": "u", "password": "p", "sender": "news@example.org"}
    port = client.post(f"/api/investigations/{inv}/monitors/mailbox", json={**body, "port": 22})
    assert port.status_code == 422 and "993" in port.json()["detail"]

    monkeypatch.setattr(mailbox, "_connect", REAL_CONNECT)
    dialled: list[tuple] = []
    monkeypatch.setattr(socket, "create_connection", lambda address, timeout=None: dialled.append(address) or (_ for _ in ()).throw(
        ConnectionRefusedError(111, "Connection refused")))
    answers = {}
    for name, address in (("private", "10.0.0.5"), ("loopback", "127.0.0.1"), ("link-local", "169.254.1.1"), ("public", "93.184.216.34")):
        monkeypatch.setattr(socket, "getaddrinfo", lambda host, p, *a, _ip=address, **k: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (_ip, p))])
        r = client.post(f"/api/investigations/{inv}/monitors/mailbox", json={**body, "sender": f"{name}@example.org"})
        assert r.status_code == 200, r.text
        answers[name] = r.json()["health_detail"]
    # Only the public address was dialled, at the address that was checked; every failure says the same.
    assert dialled == [("93.184.216.34", 993)]
    assert set(answers.values()) == {"the mail server could not be read over TLS"}


def test_a_mailbox_the_server_renumbers_still_queues_its_new_messages_once(monkeypatch):
    inv, r = _follow()
    monitor = r.json()
    old = dict(FakeImap.box)
    # The server renumbers the mailbox (UIDVALIDITY 7 becomes 8): a new message takes number 1, the old ones move on.
    monkeypatch.setattr(FakeImap, "box", {1: _mail(9, "news@harbourwatch.example.org", "Issue 3"), 4: old[1], 6: old[3]})
    monkeypatch.setattr(FakeImap, "response", lambda self, code: (code, [b"8"]))
    checked = client.post(f"/api/monitors/{monitor['id']}/check").json()
    assert checked["checks"][1]["text"] == "1 new from news@harbourwatch.example.org"
    with SessionLocal() as db:
        items = db.query(MonitorItem).filter(MonitorItem.monitor_id == monitor["id"]).all()
        assert sorted(i.title for i in items) == ["Issue 1", "Issue 2: the plot sale", "Issue 3"]
        folder = Path(settings.document_storage_dir) / inv / "following" / monitor["id"]
        assert sorted(p.name for p in folder.glob("*.eml")) == sorted(i.extra["eml"] for i in items)
