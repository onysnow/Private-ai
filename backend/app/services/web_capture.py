"""Capture a web page from a link (ADR-0016, mockup INTAKE_3, research §10 Phase 1).

A pasted link becomes a source: the page as it was served, when, and a fingerprint, kept before anything quotes it
(Authority Suite EGS Module 04: capture before use). Everything runs on this computer: no cookies, no login, no
account. What this module does not do: it does not check that the page is genuine ("Content verified: not done by
this system"), it does not bypass a login or a paywall (that is `not_seen`), and it never sends the text to an AI.

Outcomes: saved | link_only (the address gave nothing back, the link is kept) | not_seen (a login or permission
wall; nothing behind it was seen) | failed. Each is a record: a capture that did not work is still an outcome to see.

A second capture of an address already saved compares the page's text (not its bytes, which change with every
visit on many sites): the same text is "same" and adds a line to the first capture's checks; different text is a new
capture that names the one it follows, so the first stays as it was; a removed page is a link_only capture that
names it ("gone").
"""

from __future__ import annotations

import hashlib
import logging
import re
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.captures import WebCapture
from app.models.base import uid
from app.models.documents import Document
from app.models.investigations import Investigation
from app.models.sources import Source
from app.services import capture_browser
from app.services.capture_net import AddressRefused, FetchError, Fetched, check_address, fetch, request_line
from app.services.capture_record import decode, page_facts, warc_bytes, working_text
from app.services.documents import sha256_bytes, store_document
from app.services.ingestion_batches import find_duplicate
from app.services.outbound_log import record_outbound
from app.services.security import contained_path, resolve_storage_root

logger = logging.getLogger("journalism.web_capture")

STEPS = [("link", "Link checked"), ("page", "Page fetched"), ("source", "Source saved"), ("screenshot", "Screenshot"),
         ("archive", "Archive (WARC)"), ("fingerprint", "Fingerprint"), ("text", "Text read")]
LOGIN_PATH = re.compile(r"/(log-?in|sign-?in|sso|auth|account/login|session/new)\b", re.I)
THIN_TEXT = 200
SOFTWARE = "Journalism Workbench capture 1.0"


def _step(key: str, state: str, seconds: float = 0.0, detail: str = "") -> dict[str, Any]:
    return {"key": key, "label": dict(STEPS)[key], "state": state, "seconds": round(seconds, 1), "detail": detail}


def _slug(url: str) -> str:
    parts = urlsplit(url)
    tail = re.sub(r"[^A-Za-z0-9]+", "-", (parts.path or "").strip("/"))[:60].strip("-")
    return f"{parts.hostname}-{tail}" if tail else str(parts.hostname)


def _headers(pairs: list[tuple[str, str]]) -> list[list[str]]:
    return [[k, v] for k, v in pairs]


def capture_dir(storage_dir: Path, investigation_id: str, capture_id: str) -> Path:
    return contained_path(resolve_storage_root(storage_dir), investigation_id, "captures", capture_id)


def _file(path: Path, role: str, note: str) -> dict[str, Any]:
    data = path.read_bytes()
    return {"name": path.name, "role": role, "note": note, "size": len(data), "sha256": sha256_bytes(data),
            "path": str(path), "owned_by": "capture"}


def _wall(fetched: Fetched, facts: dict, text: str) -> str | None:
    """Why a page that came back is not the page: a login or permission wall, in words; else None."""
    if fetched.status in (401, 403, 407):
        return "The site asked for a login or refused access."
    origin, final = urlsplit(fetched.url), urlsplit(fetched.final_url)
    if LOGIN_PATH.search(final.path) and not LOGIN_PATH.search(origin.path):
        return "The link led to a login page."
    if facts["asks_for_password"] and len(text) < 800:
        return "The page asks for a password."
    return None


def _log_visit(db: Session, investigation_id: str, url: str, status: str, error: str | None, fetched: Fetched | None) -> None:
    host = urlsplit(url).hostname or url
    record_outbound(
        db, investigation_id=investigation_id, service="web_capture", destination=host, local=False, value_sent=url,
        value_kind="the page address", reason="capture", status=status, error=error,
        detail={"request": request_line(url), "status": fetched.status if fetched else None},
    )


def _find_previous(db: Session, investigation_id: str, *urls: str, text_sha: str | None = None, page_sha: str | None = None) -> WebCapture | None:
    saved = db.scalars(select(WebCapture).where(WebCapture.investigation_id == investigation_id, WebCapture.outcome == "saved")
                       .order_by(WebCapture.started_at.desc())).all()
    for row in saved:
        if page_sha and row.page_sha256 == page_sha:
            return row
    for row in saved:
        if row.url in urls or row.final_url in urls:
            return row
    return None


def _latest_of(db: Session, row: WebCapture) -> WebCapture:
    """The newest capture in the chain that follows `row` (a changed page's later copies)."""
    while True:
        nxt = db.scalars(select(WebCapture).where(WebCapture.supersedes_id == row.id, WebCapture.outcome == "saved")
                         .order_by(WebCapture.started_at.desc())).first()
        if nxt is None:
            return row
        row = nxt


def capture_url(db: Session, investigation_id: str, url: str, *, storage_dir: Path, recheck_of: WebCapture | None = None) -> dict[str, Any]:
    """Capture one address and return {capture, document_id, already_in_case, state}. Raises AddressRefused for a link
    that is not fetched (a bad address, a login in the address, a private network). `state` is "new" for a capture
    made, "already_in_case" for the same page found again, and, on a re-check, "same" | "changed" | "gone" | "unreachable"."""
    if db.get(Investigation, investigation_id) is None:
        raise LookupError("Investigation not found")
    clean = check_address(url)
    started = utcnow_naive()
    steps: list[dict[str, Any]] = [_step("link", "done", 0.0, "http or https; not a private network; no login in the address")]
    collector = {"tool": "httpx", "version": _httpx_version(), "runs_on": "this computer", "cookies_sent": False,
                 "signed_in": False, "software": SOFTWARE}

    t0 = time.monotonic()
    fetched: Fetched | None = None
    error: FetchError | None = None
    try:
        fetched = fetch(clean)
    except FetchError as exc:
        error = exc
    except AddressRefused:
        _log_visit(db, investigation_id, clean, "not_sent", "a redirect led to an address that is not fetched", None)
        raise
    _log_visit(db, investigation_id, clean, "sent" if fetched else "failed", error.message if error else None, fetched)

    if fetched is None:
        assert error is not None
        steps.append(_step("page", "failed", time.monotonic() - t0, error.message))
        outcome = "link_only" if error.kind == "dns" and recheck_of is None else "failed"
        return _record_without_page(db, investigation_id, clean, started, collector, steps, outcome, error.message, None, recheck_of)

    steps.append(_step("page", "done", fetched.seconds, f"{fetched.status} {fetched.reason}".strip()))
    final = fetched.final_url
    ctype = (fetched.header("content-type") or "").lower()
    markup = decode(fetched.body, fetched.header("content-type")) if fetched.body else ""
    is_html = "html" in ctype or (not ctype and "<html" in markup[:2000].lower())
    facts = page_facts(markup) if is_html else {"title": None, "byline": None, "published": None, "language": None,
                                                 "description": None, "asks_for_password": False}
    raw_text = working_text(markup) if is_html else ""

    if fetched.status in (404, 410):
        return _record_without_page(db, investigation_id, clean, started, collector, steps, "link_only",
                                    f"The site answered {fetched.status}: the page is not there.", fetched, recheck_of)
    wall = _wall(fetched, facts, raw_text)
    if wall:
        return _record_without_page(db, investigation_id, clean, started, collector, steps, "not_seen",
                                    wall + " Nothing behind it was seen, and captures never log in.", fetched, recheck_of)
    if fetched.status >= 400:
        return _record_without_page(db, investigation_id, clean, started, collector, steps, "failed",
                                    f"The site answered {fetched.status} {fetched.reason}.".strip(), fetched, recheck_of)
    if not is_html:
        return _record_without_page(db, investigation_id, clean, started, collector, steps, "failed",
                                    f"The address gave a {ctype.split(';')[0] or 'file'}, not a web page. Bring it in as a file instead.", fetched, recheck_of)

    capture_id = uid()
    folder = capture_dir(storage_dir, investigation_id, capture_id)
    folder.mkdir(parents=True, exist_ok=True)
    try:
        return _save(db, investigation_id, clean, capture_id, folder, storage_dir, started, collector, steps, fetched, markup, facts,
                     raw_text, recheck_of)
    except Exception:
        db.rollback()
        shutil.rmtree(folder, ignore_errors=True)
        raise


def _save(db: Session, investigation_id: str, clean: str, capture_id: str, folder: Path, storage_dir: Path, started: datetime,
          collector: dict, steps: list[dict], fetched: Fetched, markup: str, facts: dict, raw_text: str,
          recheck_of: WebCapture | None) -> dict[str, Any]:
    final = fetched.final_url
    files: list[dict[str, Any]] = []
    t = time.monotonic()

    shot = rendered = None
    browser_note = ""
    result, why = capture_browser.run(final, folder)
    if result is not None:
        collector = {**collector, "browser": result.tool, "browser_version": result.version}
        shot, rendered = result.screenshot, result.rendered_html
        steps.append(_step("screenshot", "done" if shot else "failed", result.seconds, "the page as the browser drew it"))
    else:
        browser_note = why
        steps.append(_step("screenshot", "skipped", 0.0, why))

    use_rendered = False
    text = raw_text
    rendered_markup = ""
    if rendered is not None:
        rendered_markup = rendered.read_text(encoding="utf-8", errors="replace")
        rendered_text = working_text(rendered_markup)
        if len(raw_text) < THIN_TEXT <= len(rendered_text):
            use_rendered, text = True, rendered_text
    chosen = rendered.read_bytes() if use_rendered and rendered else fetched.body
    page_sha = sha256_bytes(chosen)
    text_bytes = text.encode("utf-8")
    text_sha = sha256_bytes(text_bytes)

    previous = recheck_of or _find_previous(db, investigation_id, clean, final, page_sha=page_sha)
    if previous is not None:
        latest = _latest_of(db, previous)
        same = (latest.page_sha256 == page_sha) or (latest.text_sha256 == text_sha)
        if same:
            shutil.rmtree(folder, ignore_errors=True)
            if recheck_of is not None or latest.url in (clean, final) or latest.final_url in (clean, final):
                _append_check(db, latest, "same", None)
            return {"capture": latest, "document_id": latest.document_id, "state": "same" if recheck_of is not None else "already_in_case",
                    "already_in_case": True}
        previous = latest
    else:
        dup = find_duplicate(db, investigation_id, page_sha)
        if dup is not None:
            shutil.rmtree(folder, ignore_errors=True)
            existing = db.scalars(select(WebCapture).where(WebCapture.document_id == dup.id)).first()
            if existing is not None:
                return {"capture": existing, "document_id": dup.id, "state": "already_in_case", "already_in_case": True}

    # Nothing is written to the case until the page is known to be new.
    (folder / "page.warc").write_bytes(warc_bytes(fetched, started=started, software=SOFTWARE))
    (folder / "text.txt").write_bytes(text_bytes)
    if use_rendered:
        (folder / "page.html").write_bytes(fetched.body)
    steps.append(_step("archive", "done", 0.0, "the request and the answer, as a WARC file"))
    steps.append(_step("fingerprint", "done", 0.0, "SHA-256 of each file kept"))
    steps.append(_step("text", "done", 0.0, f"{len(text):,} characters"))

    title = facts["title"] or urlsplit(final).hostname or final
    filename = f"{_slug(final)}.html"
    doc = store_document(db, investigation_id=investigation_id, title=title, filename=filename, mime_type="text/html", data=chosen,
                         storage_dir=resolve_storage_root(storage_dir), source_metadata={"capture_id": capture_id, "url": final})
    source = db.get(Source, doc.source_id)
    assert source is not None
    source.source_type, source.url, source.title = "web", final, title[:512]
    source.metadata_json = {**(source.metadata_json or {}), "capture": {"id": capture_id, "displayed_byline": facts["byline"],
                                                                         "displayed_published": facts["published"]}}
    db.flush()
    steps.insert(2, _step("source", "done", 0.0, "a web source with the address"))

    files.append({"name": filename, "role": "page" if not use_rendered else "rendered", "note": "the page as the reader reads it" if use_rendered
                  else "the page source, as the site sent it", "size": len(chosen), "sha256": page_sha, "path": doc.storage_path, "owned_by": "document"})
    if use_rendered:
        files.append(_file(folder / "page.html", "page", "the page source as the site sent it (a script builds the text)"))
    files.append(_file(folder / "page.warc", "archive", "the request and the answer (WARC)"))
    if shot is not None:
        files.append(_file(shot, "screenshot", "the page as the browser drew it"))
    if rendered is not None and not use_rendered:
        files.append(_file(rendered, "rendered", "the page after its scripts ran"))
    files.append(_file(folder / "text.txt", "text", "the working copy of the text, hashed apart"))

    ended = utcnow_naive()
    row = WebCapture(
        id=capture_id, investigation_id=investigation_id, source_id=source.id, document_id=doc.id,
        supersedes_id=previous.id if previous is not None else None, url=clean, final_url=final, outcome="saved", reason=browser_note or None,
        title=title, started_at=started, ended_at=ended, collector=collector,
        request={"line": request_line(final), "headers": _headers(fetched.request_headers), "cookie": "(none)"},
        response={"status": fetched.status, "reason": fetched.reason, "http_version": fetched.http_version,
                  "headers": _headers(fetched.response_headers), "redirects": [[c, u] for c, u in fetched.redirects]},
        steps=steps, files=files, page_sha256=page_sha, text_sha256=text_sha,
        displayed={"title": facts["title"], "byline": facts["byline"], "published": facts["published"], "language": facts["language"]},
        checks=[],
    )
    db.add(row)
    if previous is not None:
        _append_check(db, previous, "changed", capture_id, commit=False)
    db.commit()
    db.refresh(row)
    return {"capture": row, "document_id": doc.id, "state": "changed" if previous is not None else "new", "already_in_case": False}


def _append_check(db: Session, row: WebCapture, state: str, capture_id: str | None, *, commit: bool = True) -> None:
    row.checks = [*(row.checks or []), {"at": utcnow_naive().isoformat(timespec="seconds"), "state": state, "capture_id": capture_id}]
    if commit:
        db.commit()


def _record_without_page(db: Session, investigation_id: str, clean: str, started: datetime, collector: dict, steps: list[dict],
                         outcome: str, reason: str, fetched: Fetched | None, recheck_of: WebCapture | None) -> dict[str, Any]:
    """A capture that kept no page: the link, why, and what the site sent back. A re-check of a saved page that finds
    it removed (link_only, 404 or 410) is recorded as "gone" and kept as a capture that names the one it follows; one
    that could not be reached is only a line in the first capture's checks."""
    source_id = None
    if outcome == "link_only" and recheck_of is None:
        source = Source(investigation_id=investigation_id, title=urlsplit(clean).hostname or clean, url=clean, source_type="web",
                        metadata_json={"capture": {"outcome": "link_only", "reason": reason}})
        db.add(source)
        db.flush()
        source_id = source.id
    if recheck_of is not None and outcome not in ("link_only",):
        _append_check(db, recheck_of, "unreachable" if outcome == "failed" else outcome, None)
        return {"capture": recheck_of, "document_id": recheck_of.document_id, "state": "unreachable" if outcome == "failed" else outcome,
                "already_in_case": False}
    steps.append(_step("source", "done" if source_id else "skipped", 0.0, "the link is kept" if source_id else "nothing to cite"))
    row = WebCapture(
        investigation_id=investigation_id, source_id=source_id, supersedes_id=recheck_of.id if recheck_of else None, url=clean,
        final_url=fetched.final_url if fetched else None, outcome=outcome, reason=reason, started_at=started, ended_at=utcnow_naive(),
        collector=collector, steps=steps, files=[],
        request={"line": request_line(clean), "headers": _headers(fetched.request_headers), "cookie": "(none)"} if fetched else None,
        response={"status": fetched.status, "reason": fetched.reason, "http_version": fetched.http_version,
                  "headers": _headers(fetched.response_headers), "redirects": [[c, u] for c, u in fetched.redirects]} if fetched else None,
        checks=[],
    )
    db.add(row)
    if recheck_of is not None:
        _append_check(db, recheck_of, "gone", row.id, commit=False)
    db.commit()
    db.refresh(row)
    return {"capture": row, "document_id": None, "state": "gone" if recheck_of is not None else "new", "already_in_case": False}


def recheck(db: Session, capture: WebCapture, *, storage_dir: Path) -> dict[str, Any]:
    if capture.outcome != "saved":
        raise ValueError("Only a saved capture can be checked again.")
    return capture_url(db, capture.investigation_id, capture.final_url or capture.url, storage_dir=storage_dir, recheck_of=_latest_of(db, capture))


def _httpx_version() -> str:
    import httpx
    return f"httpx {httpx.__version__}"


def capture_files_by_name(row: WebCapture) -> dict[str, dict[str, Any]]:
    return {f["name"]: f for f in (row.files or [])}


def remove_capture_files(row: WebCapture) -> None:
    for f in row.files or []:
        if f.get("owned_by") == "capture":
            Path(f["path"]).unlink(missing_ok=True)
