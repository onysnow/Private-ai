"""The Workbench's own reader for emails, mailboxes, .zip archives and
workbooks (app/services/container_readers.py).

Before, only OpenAleph read these, and an email often came back with no
text, so the names proposed from it had no passage to show. These tests
build small files of each kind and check the passages and their locators,
what is reported as not read, and the limits that keep a hostile archive
from unpacking without end. The last test reads a stored email the way an
upload is read and checks every proposal has a passage.
"""

from __future__ import annotations

import io
import mailbox
import zipfile
from email.message import EmailMessage
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.domain import DocumentChunk, ExtractionCandidate, Investigation
from app.services import container_readers
from app.services.documents import extract_chunks, extract_document, store_document


def _email(*, body: str | None = "Jane Doe approved the transfer.\n\nPayment went to Kestrel Holdings Ltd.",
           html: str | None = None, attachment: tuple[str, bytes] | None = None, subject: str = "Transfer") -> EmailMessage:
    message = EmailMessage()
    message["From"] = "Jane Doe <jane@meridian.example>"
    message["To"] = "Audit Team <audit@kestrelwood.example>"
    message["Cc"] = "Omar Reyes <omar@kestrelwood.example>"
    message["Date"] = "Wed, 30 Sep 2009 17:08:00 -0000"
    message["Subject"] = subject
    if body is not None:
        message.set_content(body)
    if html is not None:
        if body is None:
            message.set_content(html, subtype="html")
        else:
            message.add_alternative(html, subtype="html")
    if attachment is not None:
        message.add_attachment(attachment[1], maintype="application", subtype="pdf", filename=attachment[0])
    return message


def _write_eml(tmp_path: Path, message: EmailMessage, name: str = "transfer.eml") -> Path:
    path = tmp_path / name
    path.write_bytes(message.as_bytes())
    return path


# --- .eml ---------------------------------------------------------------------------------

def test_an_email_reads_as_its_headers_then_its_body_paragraphs(tmp_path):
    chunks, issues = extract_chunks(_write_eml(tmp_path, _email()))
    assert [c["locator"] for c in chunks] == ["headers", "body, paragraph 1", "body, paragraph 2"]
    assert chunks[0]["text"] == ("From: Jane Doe <jane@meridian.example> · To: Audit Team <audit@kestrelwood.example> · "
                                 "Cc: Omar Reyes <omar@kestrelwood.example> · Date: Wed, 30 Sep 2009 17:08:00 -0000 · "
                                 "Subject: Transfer")
    assert chunks[1]["text"] == "Jane Doe approved the transfer."
    assert chunks[2]["text"] == "Payment went to Kestrel Holdings Ltd."
    assert all(c["page_number"] is None for c in chunks)
    assert issues == []


def test_an_email_prefers_its_plain_text_and_falls_back_to_its_html(tmp_path):
    both = _email(body="Plain words.", html="<p>HTML words.</p>")
    chunks, _ = extract_chunks(_write_eml(tmp_path, both, "both.eml"))
    assert [c["text"] for c in chunks[1:]] == ["Plain words."]
    only_html = _email(body=None, html="<html><body><p>First block.</p><p>Second block.</p></body></html>")
    chunks, issues = extract_chunks(_write_eml(tmp_path, only_html, "html.eml"))
    assert [(c["locator"], c["text"]) for c in chunks[1:]] == [("body, paragraph 1", "First block."),
                                                                ("body, paragraph 2", "Second block.")]
    assert issues == []


def test_an_emails_attachments_are_named_not_read(tmp_path):
    chunks, issues = extract_chunks(_write_eml(tmp_path, _email(attachment=("ledger.pdf", b"%PDF-1.4"))))
    assert [c["locator"] for c in chunks] == ["headers", "body, paragraph 1", "body, paragraph 2"]
    assert issues == ["This email has 1 attachment(s), which the Workbench's own reader does not read: ledger.pdf."]


def test_an_email_without_a_body_says_so(tmp_path):
    path = tmp_path / "empty.eml"
    path.write_bytes(b"From: Jane Doe <jane@meridian.example>\r\nSubject: Nothing\r\n\r\n")
    chunks, issues = extract_chunks(path)
    assert [c["locator"] for c in chunks] == ["headers"]
    assert chunks[0]["text"] == "From: Jane Doe <jane@meridian.example> · Subject: Nothing"
    assert issues == ["This email has no body text."]


def test_encoded_headers_are_decoded(tmp_path):
    path = tmp_path / "encoded.eml"
    path.write_bytes(b"From: =?utf-8?q?Christie=E2=80=99s?= employee <c@x.invalid>\r\nSubject: Hi\r\n"
                     b"Content-Type: text/plain; charset=\"utf-8\"\r\n\r\nHello.\r\n")
    chunks, _ = extract_chunks(path)
    assert chunks[0]["text"].startswith("From: Christie’s employee <c@x.invalid>")


# --- .mbox --------------------------------------------------------------------------------

def _mbox(tmp_path: Path, messages: list[EmailMessage], name: str = "thread.mbox") -> Path:
    path = tmp_path / name
    box = mailbox.mbox(str(path))
    for message in messages:
        box.add(message)
    box.flush()
    box.close()
    return path


def test_a_mailbox_reads_each_message_with_its_number(tmp_path):
    path = _mbox(tmp_path, [_email(), _email(body="Second message.", subject="Re: Transfer",
                                             attachment=("scan.pdf", b"%PDF"))])
    chunks, issues = extract_chunks(path)
    assert [c["locator"] for c in chunks] == [
        "message 1 · headers", "message 1 · body, paragraph 1", "message 1 · body, paragraph 2",
        "message 2 · headers", "message 2 · body, paragraph 1"]
    assert chunks[3]["text"].endswith("Subject: Re: Transfer")
    assert chunks[4]["text"] == "Second message."
    assert issues == ["Message 2: This email has 1 attachment(s), which the Workbench's own reader does not read: scan.pdf."]


def test_a_mailbox_reads_only_so_many_messages(tmp_path, monkeypatch):
    monkeypatch.setattr(container_readers, "MAX_MBOX_MESSAGES", 2)
    path = _mbox(tmp_path, [_email(body=f"Message {n}.") for n in range(1, 4)])
    chunks, issues = extract_chunks(path)
    assert {c["locator"].split(" · ")[0] for c in chunks} == {"message 1", "message 2"}
    assert issues == ["This mailbox has 3 messages; only the first 2 were read."]


def test_an_empty_mailbox_says_so(tmp_path):
    path = tmp_path / "empty.mbox"
    path.write_bytes(b"")
    assert extract_chunks(path) == ([], ["This mailbox has no messages."])


# --- .zip ---------------------------------------------------------------------------------

def _zip(tmp_path: Path, members: dict[str, bytes], name: str = "bundle.zip") -> Path:
    path = tmp_path / name
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for member, data in members.items():
            archive.writestr(member, data)
    return path


def test_an_archive_reads_the_files_inside_with_their_paths(tmp_path):
    path = _zip(tmp_path, {
        "letters/first.txt": b"Jane Doe met the board.\n\nShe signed the ledger.",
        "mail/transfer.eml": _email().as_bytes(),
        "letters/": b"",
    })
    chunks, issues = extract_chunks(path)
    assert [c["locator"] for c in chunks] == [
        "letters/first.txt · line 1", "letters/first.txt · line 3",
        "mail/transfer.eml · headers", "mail/transfer.eml · body, paragraph 1", "mail/transfer.eml · body, paragraph 2"]
    assert chunks[0]["text"] == "Jane Doe met the board."
    assert issues == []


def test_an_archive_skips_archives_pictures_and_unknown_files_and_says_which(tmp_path):
    path = _zip(tmp_path, {
        "memo.txt": b"Jane Doe met the board.",
        "inner.zip": b"PK\x05\x06" + b"\x00" * 18,
        "photo.jpg": b"\xff\xd8\xff",
        "deck.pptx": b"PK",
        "__MACOSX/._memo.txt": b"\x00\x05\x16\x07",
    })
    chunks, issues = extract_chunks(path)
    assert [c["locator"] for c in chunks] == ["memo.txt · line 1"]
    assert issues == ["3 file(s) in this archive were not read: inner.zip (an archive inside the archive), "
                      "photo.jpg (a picture), deck.pptx (a kind of file the Workbench's own reader does not read)."]


def test_an_archive_passes_on_the_issues_of_the_files_inside(tmp_path):
    path = _zip(tmp_path, {"empty.txt": b"   \n", "memo.txt": b"Jane Doe met the board."})
    chunks, issues = extract_chunks(path)
    assert [c["locator"] for c in chunks] == ["memo.txt · line 1"]
    assert issues == ["empty.txt: This file has no readable text content."]


def test_an_archive_never_unpacks_a_path_outside_itself(tmp_path):
    path = tmp_path / "evil.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("../escape.txt", b"Jane Doe climbed out.")
        archive.writestr("/etc/absolute.txt", b"Jane Doe went to the root.")
        archive.writestr("C:/windows.txt", b"Jane Doe went to the drive.")
        archive.writestr("safe.txt", b"Jane Doe stayed in.")
    chunks, issues = extract_chunks(path)
    assert [c["locator"] for c in chunks] == ["safe.txt · line 1"]
    assert len(issues) == 1 and issues[0].startswith("3 file(s) in this archive were not read: ")
    assert issues[0].count("(its path points outside the archive)") == 3
    assert not (tmp_path / "escape.txt").exists()


def test_an_archive_that_unpacks_to_too_much_is_cut_off(tmp_path, monkeypatch):
    """A "zip bomb": a few kilobytes that unpack to megabytes. Each file and
    the archive as a whole may only unpack to so much."""
    monkeypatch.setattr(settings, "max_document_bytes", 1000)
    path = _zip(tmp_path, {
        "small.txt": b"Jane Doe met the board.",
        "bomb.txt": b"A" * 1_000_000,          # compresses to about a kilobyte
    })
    assert path.stat().st_size < 5000
    chunks, issues = extract_chunks(path)
    assert [c["locator"] for c in chunks] == ["small.txt · line 1"]
    assert issues == ["1 file(s) in this archive were not read: bomb.txt (larger than the 1000 bytes limit)."]


def test_an_archive_that_lies_about_its_sizes_is_still_cut_off(tmp_path, monkeypatch):
    """zipfile stops at the size the archive declares and then finds the
    file damaged, so a file cannot unpack to more than it claims."""
    monkeypatch.setattr(settings, "max_document_bytes", 1000)
    path = _zip(tmp_path, {"liar.txt": b"B" * 50_000})
    original = zipfile.ZipFile.infolist

    def lying(self):
        infos = original(self)
        for info in infos:
            info.file_size = 10   # the archive claims the file is tiny
        return infos

    monkeypatch.setattr(zipfile.ZipFile, "infolist", lying)
    chunks, issues = extract_chunks(path)
    assert chunks == []
    assert issues == ["1 file(s) in this archive were not read: liar.txt (it could not be unpacked: BadZipFile)."]


def test_a_file_that_would_pass_the_total_limit_is_cut_off_while_unpacking(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "max_document_bytes", 1000)
    monkeypatch.setattr(container_readers, "MAX_ZIP_TOTAL_FACTOR", 1)
    path = _zip(tmp_path, {"first.txt": b"F" * 600, "second.txt": b"S" * 600})
    chunks, issues = extract_chunks(path)
    assert [c["locator"] for c in chunks] == ["first.txt · line 1"]
    assert issues == ["1 file(s) in this archive were not read: second.txt (it unpacks to more than the size limit)."]


def test_an_archive_stops_when_its_files_reach_the_total_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "max_document_bytes", 1000)
    monkeypatch.setattr(container_readers, "MAX_ZIP_TOTAL_FACTOR", 2)
    members = {f"part{n}.txt": (f"Part {n} of the ledger. " * 50).encode()[:1000] for n in range(1, 4)}
    chunks, issues = extract_chunks(_zip(tmp_path, members))
    assert {c["locator"].split(" · ")[0] for c in chunks} == {"part1.txt", "part2.txt"}
    assert issues == ["1 file(s) in this archive were not read: part3.txt (the archive's files had reached 2000 bytes in all)."]


def test_an_archive_looks_at_only_so_many_files(tmp_path, monkeypatch):
    monkeypatch.setattr(container_readers, "MAX_ZIP_MEMBERS", 2)
    chunks, issues = extract_chunks(_zip(tmp_path, {f"memo{n}.txt": f"Memo {n} was filed.".encode() for n in range(1, 5)}))
    assert [c["locator"] for c in chunks] == ["memo1.txt · line 1", "memo2.txt · line 1"]
    assert issues == ["This archive holds 4 files; only the first 2 were looked at."]


def test_an_archives_password_protected_files_are_named(tmp_path):
    path = _zip(tmp_path, {"secret.txt": b"Jane Doe's secret.", "open.txt": b"Jane Doe's memo."})
    data = bytearray(path.read_bytes())
    # Set the "encrypted" flag on the first file, in its local header and its central directory entry.
    data[6] |= 0x1
    central = data.index(b"PK\x01\x02")
    data[central + 8] |= 0x1
    path.write_bytes(bytes(data))
    chunks, issues = extract_chunks(path)
    assert [c["locator"] for c in chunks] == ["open.txt · line 1"]
    assert issues == ["1 file(s) in this archive were not read: secret.txt (protected by a password)."]


def test_a_damaged_archive_fails_with_a_reason(tmp_path):
    path = tmp_path / "broken.zip"
    path.write_bytes(b"PK\x03\x04 not really")
    with pytest.raises(ValueError, match=r"^This \.zip file could not be opened: "):
        extract_chunks(path)


# --- .xlsx --------------------------------------------------------------------------------

def _workbook(tmp_path: Path, sheets: dict[str, list[list]], name: str = "ledger.xlsx") -> Path:
    from openpyxl import Workbook

    workbook = Workbook()
    workbook.remove(workbook.active)
    for title, rows in sheets.items():
        sheet = workbook.create_sheet(title)
        for row in rows:
            sheet.append(row)
    path = tmp_path / name
    workbook.save(path)
    return path


def test_a_workbook_reads_each_row_under_its_headers(tmp_path):
    import datetime as dt

    path = _workbook(tmp_path, {
        "transfers": [[None, None], ["date", "payer", "amount"], [dt.datetime(2011, 5, 20), "1MDB", 30000000.0],
                      [None, None, None], [dt.date(2011, 5, 23), "Good Star", None]],
        "notes": [["note"], ["Paid through J.P. Morgan."]],
    })
    chunks, issues = extract_chunks(path)
    assert [(c["locator"], c["text"]) for c in chunks] == [
        ("transfers row 3", "date: 2011-05-20 · payer: 1MDB · amount: 30000000"),
        ("transfers row 5", "date: 2011-05-23 · payer: Good Star"),
        ("notes row 2", "note: Paid through J.P. Morgan."),
    ]
    assert issues == []


def test_a_workbook_reads_only_so_many_rows(tmp_path, monkeypatch):
    monkeypatch.setattr(container_readers, "MAX_XLSX_ROWS", 2)
    chunks, issues = extract_chunks(_workbook(tmp_path, {"s": [["n"], [1], [2], [3]]}))
    assert [c["locator"] for c in chunks] == ["s row 2", "s row 3"]
    assert issues == ["Only the first 2 rows of this workbook were read."]


def test_a_workbook_with_only_headers_says_so(tmp_path):
    assert extract_chunks(_workbook(tmp_path, {"s": [["name", "role"]]})) == (
        [], ["This workbook has no rows with values under a header row."])


def test_a_workbook_inside_an_archive_is_read(tmp_path):
    workbook = _workbook(tmp_path, {"s": [["name"], ["Jane Doe"]]})
    chunks, _ = extract_chunks(_zip(tmp_path, {"tables/ledger.xlsx": workbook.read_bytes()}))
    assert [(c["locator"], c["text"]) for c in chunks] == [("tables/ledger.xlsx · s row 2", "name: Jane Doe")]


# --- Reading a stored email ---------------------------------------------------------------

def test_a_stored_email_makes_proposals_that_each_have_a_passage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "document_read_in_subprocess", False)
    monkeypatch.setattr(settings, "enable_local_entity_suggestions", True)
    message = _email(body="Jane Doe approved the transfer to Kestrel Holdings Ltd on 30 September.\n\n"
                          "The payment was reported to the Audit Committee.",
                     attachment=("ledger.pdf", b"%PDF-1.4"))
    with SessionLocal() as db:
        inv = Investigation(name="Emails")
        db.add(inv)
        db.commit()
        doc = store_document(db, investigation_id=inv.id, title="Transfer", filename="transfer.eml",
                             mime_type="message/rfc822", data=message.as_bytes(), storage_dir=tmp_path / "docs")
        doc = extract_document(db, doc.id)
        assert doc.extraction_status == "complete", doc.extraction_error
        assert doc.extraction_issues == [
            "This email has 1 attachment(s), which the Workbench's own reader does not read: ledger.pdf."]
        proposals = list(db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.document_id == doc.id)))
        assert {p.candidate_type for p in proposals} >= {"evidence", "claim", "entity"}
        for proposal in proposals:
            assert proposal.chunk_id, proposal.payload
            chunk = db.get(DocumentChunk, proposal.chunk_id)
            assert chunk is not None and chunk.text.strip() and chunk.locator
        quotes = {p.payload["locator"]: p.payload["quote"] for p in proposals if p.candidate_type == "evidence"}
        assert set(quotes) == {"headers", "body, paragraph 1", "body, paragraph 2"}
        assert all(quote.strip() for quote in quotes.values())
        names = {p.payload.get("caption") for p in proposals if p.candidate_type == "entity"}
        assert "Jane Doe" in names
