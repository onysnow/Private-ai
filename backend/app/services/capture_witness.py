"""A capture's outside witnesses (ADR-0025; mockup INTAKE_3; source intake DECISIONS call 2 and "snapshot signing").

The capture itself is made on this computer and proves only what this computer's clock and files say. Three outside
services can add to it, each off until a person asks for it on this one capture, each written to the outbound log
before anything goes, and none for a source-protected item:

- **Time proof.** The SHA-256 of the capture's archive (WARC) goes to a time server (RFC 3161), which signs it with
  its own clock. Only the fingerprint is sent, never the page. The token is kept with the capture as a new file
  (`timestamp.tsr`, hashed like the others) and checked here: the signature, its chain to a root bundled in
  `app/trust/tsa/`, that it signs this fingerprint, and that it answers this request (the nonce).
- **Second witness.** The page's address goes to a public web archive (the Internet Archive's Save Page Now), which
  visits the page itself and keeps its own copy. Its address is kept here; what the archive kept is the archive's.
- **Look for a copy elsewhere.** For a page that could not be kept: the address goes to the archive's lookup, which
  says whether it holds a copy and from when. That copy can then be captured like any page.

A witness that fails says why, and the capture stays as it was: nothing here changes a kept file.
"""
from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote, urljoin, urlsplit

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import AuthenticityItem, Capture
from app.services.outbound import mark_outbound_failed, record_outbound
from app.services.security import contained_path

logger = logging.getLogger("journalism.capture_witness")

TRUST_DIR = Path(__file__).resolve().parent.parent / "trust" / "tsa"
TOKEN_NAME = "timestamp.tsr"
ARCHIVE = "Internet Archive"
ARCHIVE_SAVE = "https://web.archive.org/save/"
ARCHIVE_LOOKUP = "https://archive.org/wayback/available"
TIMEOUT_S = 30.0
SAVE_TIMEOUT_S = 120.0  # the archive visits the page before it answers
MAX_REPLY_BYTES = 1024 * 1024

# Each failure is one of these sentences, never a library's own error text (it can carry addresses and internals).
FAILED = {
    "unreachable": "The service could not be reached from this computer.",
    "timeout": "The service did not answer in time.",
    "refused": "The service refused the request.",
    "busy": "The service is busy and asked to be asked later.",
    "unreadable": "The answer could not be read.",
    "not_granted": "The time server did not grant a token.",
    "mismatch": "The token does not sign this capture's fingerprint, or does not answer this request.",
}


class WitnessRefused(ValueError):
    """Not asked: the capture is not saved, is source-protected, or has nothing to send."""


@dataclass
class Reply:
    status: int
    headers: dict[str, str]
    body: bytes
    url: str


def _http(method: str, url: str, *, content: bytes | None = None, headers: dict[str, str] | None = None,
          timeout: float = TIMEOUT_S) -> Reply:
    """One request through the capture guard (public addresses only), redirects not followed. OSError when it fails."""
    import httpx

    from app.services.following import USER_AGENT, _proxy_for
    from app.services.web_capture import check_address

    check_address(url)
    proxy, guard = _proxy_for("direct")
    try:
        if guard is not None:
            guard.__enter__()
        with httpx.Client(proxy=proxy, timeout=timeout, follow_redirects=False, trust_env=False,
                          headers={"User-Agent": USER_AGENT, **(headers or {})}) as client:
            with client.stream(method, url, content=content) as response:
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_REPLY_BYTES:
                        raise OSError("unreadable")
                return Reply(response.status_code, {k.lower(): v for k, v in response.headers.items()}, bytes(body), url)
    except httpx.TimeoutException as exc:
        raise OSError("timeout") from exc
    except httpx.HTTPError as exc:
        raise OSError("unreachable") from exc
    finally:
        if guard is not None:
            guard.__exit__(None, None, None)


# Tests replace this; everything here sends through it.
send: Callable[..., Reply] = _http


def _reason(exc: BaseException) -> str:
    key = str(exc) if str(exc) in FAILED else "unreachable"
    return FAILED[key]


def _now() -> str:
    return utcnow_naive().isoformat(timespec="seconds")


def protected(db: Session, row: Capture) -> bool:
    ids = [i for i in (row.document_id, row.media_document_id) if i]
    return any(getattr(db.get(AuthenticityItem, i), "source_protected", False) for i in ids)


def _set(row: Capture, key: str, value: dict[str, Any]) -> None:
    row.witnesses = {**(row.witnesses or {}), key: value}
    flag_modified(row, "witnesses")


def _refuse_if_protected(db: Session, row: Capture, what: str, value: str) -> None:
    if protected(db, row):
        record_outbound(db, row.investigation_id, service=what, kind="blocked", value=value,
                        reason="Source-protected item: an outside witness was asked for and blocked", outcome="blocked",
                        source={"capture_id": row.id})
        raise WitnessRefused("This capture is source-protected. Nothing is sent from here.")


def _warc(row: Capture) -> dict[str, Any]:
    entry: dict[str, Any] | None = next((f for f in row.files or [] if f.get("name") == "page.warc.gz"), None)
    if row.outcome != "saved" or entry is None:
        raise WitnessRefused("Only a saved capture has a fingerprint to sign.")
    return entry


def _folder(row: Capture) -> Path:
    from app.services.web_capture import capture_dir

    return capture_dir(settings.document_storage_dir, row.investigation_id, row.id)


# --- Time proof (RFC 3161) ---------------------------------------------------------------------------------------

def _roots() -> list[Any]:
    from cryptography import x509

    certs: list[Any] = []
    for pem in sorted(TRUST_DIR.glob("*.pem")):
        certs.extend(x509.load_pem_x509_certificates(pem.read_bytes()))
    return certs


def check_token(token: bytes, warc: bytes, nonce: int | None = None) -> dict[str, Any]:
    """What the token says and whether it holds, read here: the time, the name it is signed in, its serial, and "checked"
    (signature and chain to a bundled root, this fingerprint, this request's nonce), "not_checked" (no bundled root
    for this server) or "failed". Never raises for a token it can parse."""
    from rfc3161_client import VerificationError, VerifierBuilder, decode_timestamp_response

    reply = decode_timestamp_response(token)
    info = reply.tst_info
    out: dict[str, Any] = {
        "time": info.gen_time.astimezone(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds"),
        "serial": str(info.serial_number), "policy": info.policy.dotted_string,
        "signer": _name_of(info.name), "fingerprint": info.message_imprint.message.hex(),
    }
    roots = _roots()
    if not roots:
        return {**out, "check": "not_checked", "check_detail": "No time server root is bundled with this app."}
    wrong = False
    for root in roots:
        builder = VerifierBuilder(roots=[root], nonce=nonce) if nonce is not None else VerifierBuilder(roots=[root])
        try:
            if builder.build().verify_message(reply, warc):
                return {**out, "check": "checked", "check_detail": f"Signed by a certificate that chains to {root.subject.rfc4514_string()}"}
        except (VerificationError, ValueError) as exc:
            # The chain held for this root, then the fingerprint or the nonce did not.
            wrong = wrong or any(word in str(exc).lower() for word in ("nonce", "mismatch between messages", "imprint"))
    if wrong:
        return {**out, "check": "failed", "check_detail": FAILED["mismatch"]}
    return {**out, "check": "not_checked", "check_detail": "Its signer does not chain to a root bundled with this app, so it was not checked here."}


def _name_of(name: Any) -> str:
    value = getattr(name, "value", None)
    try:
        from cryptography.x509.oid import NameOID

        common = value.get_attributes_for_oid(NameOID.COMMON_NAME) if value is not None else []
        if common:
            return str(common[0].value)
    except AttributeError:
        pass
    return str(value or "")[:200]


def time_server_host() -> str:
    return urlsplit(settings.capture_time_server).hostname or settings.capture_time_server


def _request_for(warc: bytes) -> tuple[bytes, int | None]:
    """The time-stamp request for these bytes (their SHA-256, a fresh nonce, the server's certificate asked for)."""
    from rfc3161_client import HashAlgorithm, TimestampRequestBuilder

    request = TimestampRequestBuilder().data(warc).hash_algorithm(HashAlgorithm.SHA256).nonce(nonce=True) \
        .cert_request(cert_request=True).build()
    return request.as_bytes(), request.nonce


def time_proof(db: Session, row: Capture, actor: str | None) -> Capture:
    """Ask the time server to sign this capture's fingerprint. Logged before it goes; the token is kept as a new file
    beside the others. Raises WitnessRefused when there is nothing to sign or the capture is protected."""
    from rfc3161_client import PKIStatus, decode_timestamp_response

    entry = _warc(row)
    server = settings.capture_time_server
    host = time_server_host()
    _refuse_if_protected(db, row, f"time server ({host})", entry["sha256"])
    existing = (row.witnesses or {}).get("time_proof") or {}
    if existing.get("state") == "stamped":
        return row
    folder = _folder(row)
    warc = contained_path(folder, entry["name"]).read_bytes()
    request, nonce = _request_for(warc)
    asked_at = _now()
    request_id = record_outbound(db, row.investigation_id, service=f"time server ({host})", kind="fingerprint",
                                 value=entry["sha256"], reason="Time proof for a capture: the fingerprint only, not the page",
                                 actor=actor or "you", source={"capture_id": row.id, "destination": host})
    base = {"server": server, "asked_at": asked_at, "by": actor or "you", "of": entry["name"], "sent": entry["sha256"],
            "outbound_request_id": request_id}
    try:
        reply = send("POST", server, content=request, headers={"Content-Type": "application/timestamp-query"})
        if reply.status == 429 or reply.status == 503:
            raise OSError("busy")
        if reply.status != 200:
            raise OSError("refused")
        try:
            parsed = decode_timestamp_response(reply.body)
        except ValueError as exc:
            raise OSError("unreadable") from exc
        if parsed.status not in (PKIStatus.GRANTED, PKIStatus.GRANTED_WITH_MODS):
            raise OSError("not_granted")
        checked = check_token(reply.body, warc, nonce)
        if checked["check"] == "failed" or checked["fingerprint"] != entry["sha256"]:
            raise OSError("mismatch")
    except OSError as exc:
        mark_outbound_failed(db, request_id)
        _set(row, "time_proof", {**base, "state": "failed", "reason": _reason(exc)})
        db.commit()
        return row
    path = contained_path(folder, TOKEN_NAME)
    path.write_bytes(reply.body)
    from app.services.web_capture import _sha256

    files = [f for f in row.files or [] if f.get("name") != TOKEN_NAME]
    files.append({"name": TOKEN_NAME, "role": "time proof: the time server's signed token (RFC 3161)",
                  "bytes": len(reply.body), "sha256": _sha256(reply.body)})
    row.files = files
    flag_modified(row, "files")
    _set(row, "time_proof", {**base, "state": "stamped", "answered_at": _now(), "token": TOKEN_NAME, **checked})
    db.commit()
    return row


# --- Second witness and a copy elsewhere (a public web archive) ---------------------------------------------------

def _archive_time(stamp: str) -> str | None:
    try:
        return datetime.strptime(stamp[:14], "%Y%m%d%H%M%S").isoformat(timespec="seconds")
    except ValueError:
        return None


def second_witness(db: Session, row: Capture, actor: str | None) -> Capture:
    """Ask the public web archive to visit the page and keep its own copy. Only the address is sent."""
    if row.outcome != "saved":
        raise WitnessRefused("A second witness is asked for after the page is kept here.")
    url = row.final_url or row.url
    _refuse_if_protected(db, row, ARCHIVE, url)
    existing = (row.witnesses or {}).get("archive") or {}
    if existing.get("state") == "saved":
        return row
    request_id = record_outbound(db, row.investigation_id, service=ARCHIVE, kind="link", value=url,
                                 reason="Second witness for a capture: the archive visits the page and keeps its own copy",
                                 actor=actor or "you", source={"capture_id": row.id, "destination": "web.archive.org"})
    base = {"service": ARCHIVE, "asked_at": _now(), "by": actor or "you", "sent": url, "outbound_request_id": request_id}
    try:
        reply = send("GET", ARCHIVE_SAVE + url, timeout=SAVE_TIMEOUT_S)
        if reply.status in (429, 503, 520, 523):
            raise OSError("busy")
        where = reply.headers.get("content-location") or (reply.headers.get("location") if 300 <= reply.status < 400 else None)
        if reply.status >= 400 or not where or "/web/" not in where:
            raise OSError("refused")
    except OSError as exc:
        mark_outbound_failed(db, request_id)
        _set(row, "archive", {**base, "state": "failed", "reason": _reason(exc)})
        db.commit()
        return row
    copy = urljoin("https://web.archive.org/", where)
    stamp = copy.split("/web/", 1)[1].split("/", 1)[0]
    _set(row, "archive", {**base, "state": "saved", "answered_at": _now(), "url": copy, "archived_at": _archive_time(stamp)})
    db.commit()
    return row


def look_elsewhere(db: Session, row: Capture, actor: str | None) -> Capture:
    """Ask the public web archive whether it holds a copy of a page that could not be kept here, and from when."""
    if row.status != "finished" or row.outcome == "saved":
        raise WitnessRefused("This page was kept here; there is nothing to look for.")
    url = row.url
    _refuse_if_protected(db, row, ARCHIVE, url)
    request_id = record_outbound(db, row.investigation_id, service=ARCHIVE, kind="link", value=url,
                                 reason="Look for a copy elsewhere: asks the archive whether it holds this page",
                                 actor=actor or "you", source={"capture_id": row.id, "destination": "archive.org"})
    base = {"service": ARCHIVE, "asked_at": _now(), "by": actor or "you", "sent": url, "outbound_request_id": request_id}
    try:
        reply = send("GET", f"{ARCHIVE_LOOKUP}?url={quote(url, safe='')}")
        if reply.status in (429, 503):
            raise OSError("busy")
        if reply.status != 200:
            raise OSError("refused")
        import json

        try:
            closest = ((json.loads(reply.body).get("archived_snapshots") or {}).get("closest") or {})
        except (ValueError, AttributeError) as exc:
            raise OSError("unreadable") from exc
    except OSError as exc:
        mark_outbound_failed(db, request_id)
        _set(row, "elsewhere", {**base, "state": "failed", "reason": _reason(exc)})
        db.commit()
        return row
    copy = str(closest.get("url") or "")
    if closest.get("available") and copy.startswith(("http://web.archive.org/", "https://web.archive.org/")):
        copy = "https://" + copy.split("://", 1)[1]
        _set(row, "elsewhere", {**base, "state": "found", "answered_at": _now(), "url": copy,
                                "archived_at": _archive_time(str(closest.get("timestamp") or "")),
                                "archived_status": str(closest.get("status") or "")})
    else:
        _set(row, "elsewhere", {**base, "state": "none", "answered_at": _now()})
    db.commit()
    return row


# --- Asked for when the capture was started -----------------------------------------------------------------------

def ask_when_saved(row: Capture, *, time_proof_on: bool, second_witness_on: bool) -> None:
    """Remember the switches a capture was started with; `after_capture` asks once the page is kept."""
    if time_proof_on or second_witness_on:
        _set(row, "asked", {"time_proof": time_proof_on, "second_witness": second_witness_on})


def after_capture(db: Session, row: Capture) -> None:
    """Run what the capture was started with, now that it is kept. A failure is recorded on the capture, never raised:
    the capture itself is done."""
    asked = (row.witnesses or {}).get("asked") or {}
    if row.outcome != "saved" or not asked:
        return
    for on, run in ((asked.get("time_proof"), time_proof), (asked.get("second_witness"), second_witness)):
        if not on:
            continue
        try:
            run(db, row, row.collector)
        except WitnessRefused:
            continue
        except Exception:  # an outside service must not fail a capture that is already kept
            logger.warning("a witness for capture %s could not be asked", row.id, exc_info=True)
            db.rollback()


def serialize(row: Capture) -> dict[str, Any]:
    out = dict(row.witnesses or {})
    out.pop("asked", None)
    return {key: {k: v for k, v in value.items() if k != "outbound_request_id"} for key, value in out.items()}
