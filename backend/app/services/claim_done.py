"""Definition of done for "Supported" (Workbench-redesign-2026.pdf, Check §3.10):
a visible list every claim is held to before the app calls it Supported, run on
the server from the stored records.

"When the app says Supported, I can publish that sentence and defend it to a
lawyer." Each rule is met, not met, or cannot be checked here (``unknown``,
with why). A review to Supported or Confirmed with a rule not met needs a
written reason, kept on the review event; an unknown never blocks, it is shown.

Confirmed adds independence: two supporting sources from different origins, or
one primary official record (a source captured as a public record: the
Authority System Suite's Tier A, the only tier that can carry a fact alone)."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Claim, ClaimEvidenceLink, Document, DocumentChunk, Evidence, Source

DONE_STATUSES = {"supported", "confirmed"}
# Every rule's key, in the order shown; "independent" is Confirmed's alone.
DONE_RULES = ("supporting", "says_it", "locator", "file", "contradictions", "not_leads_only", "independent")
# Sources the suite keeps as leads only (Tier E/F): they never carry a claim alone.
LEADS_ONLY = {"social"}
PRIMARY_OFFICIAL = {"public_record"}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


def _document_of(db: Session, evidence: Evidence, source: Source | None) -> Document | None:
    if evidence.document_id:
        return db.get(Document, evidence.document_id)
    if source is not None and source.source_type == "document":
        return db.scalar(select(Document).where(Document.source_id == source.id).order_by(Document.created_at))
    return None


def _file_matches(doc: Document) -> bool | None:
    path = Path(doc.storage_path)
    if not path.is_file():
        return False
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest() == doc.sha256


def _says_it(db: Session, doc: Document, quote: str) -> bool:
    wanted = _norm(quote)
    if not wanted:
        return False
    text = " ".join(c.text for c in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc.id).order_by(DocumentChunk.ordinal)))
    return wanted in _norm(text)


def _origin(source: Source) -> str:
    host = urlparse(source.url or "").hostname or ""
    return host.removeprefix("www.") or f"source:{source.id}"


def done_checks(db: Session, claim: Claim, *, target: str = "supported") -> dict[str, Any]:
    links = list(db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id == claim.id)))
    supporting: list[tuple[Evidence, Source | None]] = []
    for link in links:
        if link.stance != "supports":
            continue
        ev = db.get(Evidence, link.evidence_id)
        if ev is not None:
            supporting.append((ev, db.get(Source, ev.source_id)))
    contradicting = [link for link in links if link.stance == "contradicts"]
    rules: list[dict[str, Any]] = []

    def rule(key: str, label: str, state: str, detail: str) -> None:
        rules.append({"key": key, "label": label, "state": state, "detail": detail})

    n = len(supporting)
    rule("supporting", "At least one supporting item is linked", "met" if n else "not_met",
         f"{n} supporting item{'s' if n != 1 else ''}" if n else "Link the evidence that shows it, with the stance Supports.")

    says, unknown_says, failed_says = 0, 0, []
    hashes_ok, hash_failed, hash_unknown = 0, [], 0
    for ev, src in supporting:
        doc = _document_of(db, ev, src)
        if doc is None or not (ev.quote or "").strip():
            unknown_says += 1
        elif _says_it(db, doc, ev.quote or ""):
            says += 1
        else:
            failed_says.append(ev.locator or ev.id)
        if doc is None:
            hash_unknown += 1
        elif _file_matches(doc):
            hashes_ok += 1
        else:
            hash_failed.append(doc.filename)
    if not n:
        rule("says_it", "Every supporting quote says it, in its document", "not_met", "Nothing to check yet.")
    elif failed_says:
        rule("says_it", "Every supporting quote says it, in its document", "not_met",
             f"The quote is not in the document's text at {', '.join(failed_says[:3])}.")
    elif unknown_says == n:
        rule("says_it", "Every supporting quote says it, in its document", "unknown",
             "No supporting item comes from a document read here, so the words cannot be matched.")
    else:
        rule("says_it", "Every supporting quote says it, in its document", "met",
             f"{says} found word for word" + (f"; {unknown_says} not from a document read here" if unknown_says else ""))

    no_locator = [ev.id for ev, _ in supporting if not (ev.locator or "").strip()]
    rule("locator", "Every supporting item has an exact locator", "not_met" if (not n or no_locator) else "met",
         "Nothing to check yet." if not n else (f"{len(no_locator)} without a page, paragraph or timestamp." if no_locator else "Each says where."))

    if hash_failed:
        rule("file", "The file behind each item still matches its fingerprint", "not_met",
             f"Changed or missing: {', '.join(sorted(set(hash_failed))[:3])}.")
    elif n and hash_unknown == n:
        rule("file", "The file behind each item still matches its fingerprint", "unknown", "No supporting item has a stored file.")
    else:
        rule("file", "The file behind each item still matches its fingerprint", "met" if n else "not_met",
             f"{hashes_ok} file{'s' if hashes_ok != 1 else ''} checked" if n else "Nothing to check yet.")

    unanswered = [link for link in contradicting if not (link.note or "").strip()]
    rule("contradictions", "Every contradicting item has a written answer", "not_met" if unanswered else "met",
         f"{len(unanswered)} contradicting item{'s' if len(unanswered) != 1 else ''} without an answer; answer it, or the claim is Disputed."
         if unanswered else (f"{len(contradicting)} answered" if contradicting else "None linked."))

    strong = [src for _, src in supporting if src is not None and src.source_type not in LEADS_ONLY]
    rule("not_leads_only", "Not resting on leads-only sources alone", "met" if strong else "not_met",
         "At least one supporting source is above the leads-only tier." if strong
         else "Social posts and anonymous tips stay leads until something else shows the same thing.")

    if target == "confirmed":
        origins = {_origin(src) for _, src in supporting if src is not None and src.source_type not in LEADS_ONLY}
        official = any(src is not None and src.source_type in PRIMARY_OFFICIAL for _, src in supporting)
        rule("independent", "Two independent sources, or one primary official record", "met" if (len(origins) >= 2 or official) else "not_met",
             "A public record supports it." if official else (f"{len(origins)} separate origin{'s' if len(origins) != 1 else ''}."))

    missing = [r for r in rules if r["state"] == "not_met"]
    return {"claim_id": claim.id, "target": target, "rules": rules, "met": not missing,
            "left": len(missing), "unknown": sum(r["state"] == "unknown" for r in rules)}


def require_done(db: Session, claim: Claim, status: str, override_reason: str | None) -> dict[str, Any] | None:
    """For a review to Supported or Confirmed: None when every rule is met;
    the result when not, which is allowed only with a written reason."""
    if status not in DONE_STATUSES:
        return None
    result = done_checks(db, claim, target=status)
    if result["met"]:
        return None
    if not (override_reason or "").strip():
        left = ", ".join(r["label"].lower() for r in result["rules"] if r["state"] == "not_met")
        raise ValueError(f"{status.capitalize()} still needs: {left}. Give a reason to mark it anyway.")
    return result
