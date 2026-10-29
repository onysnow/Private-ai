"""Definition of done for "Supported" (Workbench-redesign-2026.pdf, Check §3.10):
a visible list every claim is held to before the app calls it Supported, run on
the server from the stored records.

"When the app says Supported, I can publish that sentence and defend it to a
lawyer." Each rule is met, not met, or cannot be checked here (``unknown``,
with why). A review to Supported or Confirmed with a rule not met needs a
written reason, kept on the review event; an unknown never blocks, it is shown.

Confirmed adds independence: two supporting sources from different origins, or
one primary official record (a source captured as a public record: the
Authority System Suite's Tier A, the only tier that can carry a fact alone).

When a person has set a source's suite tier it decides: E and F are leads only, A
carries a fact alone, and only A, B and D count as independent origins (C never
does). Evidence that restates another item counts as its original's origin, so a
repeat is not a second source. A source with no tier falls back to its type.

Evidence of events from a file a person marked likely or confirmed synthetic supports nothing: the claim needs other
support, or says it is supported only by a synthetic source. Evidence about the file itself still counts (ADR-0023)."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Claim, ClaimEvidenceLink, Document, DocumentChunk, Evidence, Source
from app.services.authenticity import evidence_blocked
from app.services.suite_fields import original_of

DONE_STATUSES = {"supported", "confirmed"}
# Every rule's key, in the order shown; "independent" is Confirmed's alone.
DONE_RULES = ("supporting", "says_it", "locator", "file", "contradictions", "not_leads_only", "independent")
# Sources the suite keeps as leads only (Tier E/F): they never carry a claim alone.
LEADS_ONLY = {"social"}
PRIMARY_OFFICIAL = {"public_record"}
INDEPENDENT_TIERS = {"A", "B", "D"}


def _leads_only(src: Source) -> bool:
    return src.source_tier in {"E", "F"} if src.source_tier else src.source_type in LEADS_ONLY


def _official(src: Source) -> bool:
    return src.source_tier == "A" if src.source_tier else src.source_type in PRIMARY_OFFICIAL


def _counts_for_independence(src: Source) -> bool:
    return src.source_tier in INDEPENDENT_TIERS if src.source_tier else src.source_type not in LEADS_ONLY


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


def _says_it(db: Session, doc: Document, quote: str) -> bool | None:
    """Whether the quote is in the document's text; None while the document is still being read."""
    wanted = _norm(quote)
    if not wanted:
        return False
    if doc.extraction_status != "complete":
        return None
    text = " ".join(c.text for c in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc.id).order_by(DocumentChunk.ordinal)))
    return wanted in _norm(text)


def _origin(source: Source) -> str:
    host = urlparse(source.url or "").hostname or ""
    return host.removeprefix("www.") or f"source:{source.id}"


def done_checks(db: Session, claim: Claim, *, target: str = "supported") -> dict[str, Any]:
    links = list(db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id == claim.id)))
    return judge(db, claim.id, [(link.stance, db.get(Evidence, link.evidence_id), link.note) for link in links], target=target)


def judge(db: Session, claim_id: str | None, links: list[tuple[str, Evidence | None, str | None]], *,
          target: str = "supported") -> dict[str, Any]:
    """The rules over a claim's evidence links, each (stance, evidence, note). The evidence need not be saved:
    Decide's "what it unlocks" asks what a claim not yet kept would meet (app/services/unlocks.py)."""
    supporting: list[tuple[Evidence, Source | None]] = []
    synthetic = 0
    for stance, ev, _note in links:
        if stance != "supports":
            continue
        if ev is not None and evidence_blocked(db, ev):
            synthetic += 1  # evidence of events from a file a person marked AI-made: it supports nothing (ADR-0023)
        elif ev is not None:
            supporting.append((ev, db.get(Source, ev.source_id)))
    contradicting = [note for stance, _ev, note in links if stance == "contradicts"]
    rules: list[dict[str, Any]] = []

    def rule(key: str, label: str, state: str, detail: str) -> None:
        rules.append({"key": key, "label": label, "state": state, "detail": detail})

    n = len(supporting)
    rule("supporting", "At least one supporting item is linked", "met" if n else "not_met",
         (f"{n} supporting item{'s' if n != 1 else ''}" + (f"; {synthetic} marked AI-made does not count" if synthetic else "")) if n
         else "Supported only by a synthetic source: it needs other support." if synthetic
         else "Link the evidence that shows it, with the stance Supports.")

    says, unknown_says, failed_says = 0, 0, []
    hashes_ok, hash_failed, hash_unknown = 0, [], 0
    for ev, src in supporting:
        doc = _document_of(db, ev, src)
        found = _says_it(db, doc, ev.quote or "") if doc is not None and (ev.quote or "").strip() else None
        if found is None:
            unknown_says += 1
        elif found:
            says += 1
        else:
            failed_says.append(ev.locator or ev.id or "the passage")
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
             "No supporting item comes from a document read here yet, so the words cannot be matched.")
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

    unanswered = [note for note in contradicting if not (note or "").strip()]
    rule("contradictions", "Every contradicting item has a written answer", "not_met" if unanswered else "met",
         f"{len(unanswered)} contradicting item{'s' if len(unanswered) != 1 else ''} without an answer; answer it, or the claim is Disputed."
         if unanswered else (f"{len(contradicting)} answered" if contradicting else "None linked."))

    strong = [src for _, src in supporting if src is not None and not _leads_only(src)]
    rule("not_leads_only", "Not resting on leads-only sources alone", "met" if strong else "not_met",
         "At least one supporting source is above the leads-only tier." if strong
         else "Social posts and anonymous tips stay leads until something else shows the same thing.")

    if target == "confirmed":
        origins = set()
        for ev, _ in supporting:
            src = db.get(Source, original_of(db, ev).source_id)
            if src is not None and _counts_for_independence(src):
                origins.add(_origin(src))
        official = any(src is not None and _official(src) for _, src in supporting)
        rule("independent", "Two independent sources, or one primary official record", "met" if (len(origins) >= 2 or official) else "not_met",
             "A public record supports it." if official else (f"{len(origins)} separate origin{'s' if len(origins) != 1 else ''}."))

    missing = [r for r in rules if r["state"] == "not_met"]
    return {"claim_id": claim_id, "target": target, "rules": rules, "met": not missing,
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
