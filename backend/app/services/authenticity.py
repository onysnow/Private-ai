"""Is it real? (mockup CHECK_3, ADR-0023, research §9): four layers of findings, then a person decides.

1. Provenance: the file's content credentials (C2PA), validated here against the trust lists bundled in
   app/trust/c2pa, and any IPTC digital source type in its XMP. Findings, never a status.
2. Source: what the case already holds about the item's outlet and first appearance. Outside lookups (domain age,
   ownership, content-farm lists) are not made on their own; the row says so.
3. Hints: detectors, off by default for images and suppressed on short text; none is installed here, so none runs.
4. You decide: a status with what you checked and why. Only a person sets anything but "unverified".

Nothing here blocks anything until a person records a decision. A decision of likely or confirmed synthetic stops the
item's evidence of events supporting claims (app/services/claim_done.py) and shows the suite DISPUTED on it
(DECISIONS.md call 7); evidence about the item itself (it circulated, when, posted by whom) keeps its support (call 8).
Outside checks go only with consent for that one item, never for a source-protected one, and are written to the
outbound log (app/services/outbound.py).
"""

from __future__ import annotations

import io
import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import (
    AuthenticityCheck, AuthenticityItem, Capture, Claim, ClaimEvidenceLink, DerivedFile, Document, DocumentChunk,
    DocumentPhoto, Evidence, Source,
)
from app.services.outbound import record_outbound
from app.services.suite_fields import original_of

STATUSES = ("verified_origin", "unverified", "likely_synthetic", "confirmed_synthetic", "disputed")
SYNTHETIC = {"likely_synthetic", "confirmed_synthetic"}
ROLES = ("events", "subject")
CHECKED = ("read_findings", "looked_up_source", "asked_poster", "compared_copies", "checked_place_time")
STATUS_WORDS = {"verified_origin": "Verified origin", "unverified": "Unverified", "likely_synthetic": "Likely synthetic",
                "confirmed_synthetic": "Confirmed synthetic", "disputed": "Disputed"}
CHECKED_WORDS = {"read_findings": "Read the findings", "looked_up_source": "Looked up the source",
                 "asked_poster": "Asked the poster", "compared_copies": "Compared copies",
                 "checked_place_time": "Checked place and time"}
# IPTC digital source types that say a machine made the picture (https://cv.iptc.org/newscodes/digitalsourcetype/).
AI_SOURCE_TYPES = {"trainedAlgorithmicMedia", "compositeWithTrainedAlgorithmicMedia", "algorithmicMedia",
                   "compositeSynthetic", "algorithmicallyEnhanced"}
SOURCE_TYPE_WORDS = {"trainedAlgorithmicMedia": "Created using generative AI",
                     "compositeWithTrainedAlgorithmicMedia": "Edited using generative AI",
                     "algorithmicMedia": "Made by an algorithm, without a camera",
                     "compositeSynthetic": "Composited from synthetic parts",
                     "algorithmicallyEnhanced": "Enhanced by an algorithm",
                     "digitalCapture": "Captured by a camera", "negativeFilm": "Scanned from a negative",
                     "positiveFilm": "Scanned from a slide", "print": "Scanned from a print",
                     "minorHumanEdits": "Captured, with minor edits", "composite": "Composited from several captures",
                     "digitalArt": "Drawn by a person on a computer", "dataDrivenMedia": "Made from data"}
TRUST_DIR = Path(__file__).resolve().parent.parent / "trust" / "c2pa"
TRUST_LIST = TRUST_DIR / "C2PA-TRUST-LIST.pem"
TRUST_LIST_DATE = "2026-10-28"  # app/trust/c2pa/SOURCE.md
SHORT_TEXT_WORDS = 300
# A local copy differs from another by at most this many of its 64 dHash bits to count as the same picture.
SAME_PICTURE_BITS = 10
REVERSE_SEARCH = {"tineye": ("TinEye", "https://tineye.com/search?url={}"),
                  "lens": ("Google Lens", "https://lens.google.com/uploadbyurl?url={}")}
WEB_SEARCH = ("DuckDuckGo", "https://duckduckgo.com/?q={}")


class AuthenticityRefused(ValueError):
    """The request cannot be done as asked; the message says why, in the person's words."""


def kind_of(doc: Document) -> str:
    mime = (doc.mime_type or "").lower()
    name = doc.filename.lower()
    if mime.startswith("image/") or name.endswith((".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif", ".avif", ".dng")):
        return "image"
    if mime.startswith("video/") or name.endswith((".mp4", ".mov", ".m4v", ".avi", ".webm")):
        return "video"
    if mime.startswith("audio/") or name.endswith((".mp3", ".m4a", ".wav", ".flac", ".ogg", ".opus")):
        return "audio"
    return "text"


def _log(db: Session, doc: Document, kind: str, text: str, *, actor: str = "system", person: str | None = None,
         method: str | None = None, tool: str | None = None, version: str | None = None,
         input_sha256: str | None = None, local: bool = True, result: dict[str, Any] | None = None) -> AuthenticityCheck:
    row = AuthenticityCheck(document_id=doc.id, investigation_id=doc.investigation_id, kind=kind, actor=actor,
                            person=person, method=method, tool=tool, version=version, input_sha256=input_sha256,
                            local=local, result=result or {}, text=text)
    db.add(row)
    return row


def _short(sha: str) -> str:
    return f"{sha[:4]} {sha[4:8]} …{sha[-4:]}" if len(sha) >= 12 else sha


def _capture_of(db: Session, doc: Document) -> Capture | None:
    return db.scalar(select(Capture).where((Capture.document_id == doc.id) | (Capture.media_document_id == doc.id))
                     .order_by(Capture.requested_at))


# ── 1. Provenance ─────────────────────────────────────────────────────────────────────────────────────────────────

def _c2pa_version() -> str | None:
    try:
        import c2pa
    except ImportError:
        return None
    return str(getattr(c2pa, "__version__", "") or "")


def read_credentials(data: bytes, mime: str, trust_pem: str | None = None) -> dict[str, Any]:
    """Validate a file's content credentials here, fetching nothing. `state` is trusted (valid, signer on the trust
    list), valid (signature sound, signer not on the list), invalid, absent (no manifest), unsupported (a format the
    reader does not take) or unavailable (c2pa-python is not installed)."""
    try:
        import c2pa
    except ImportError:
        return {"state": "unavailable"}
    pem = trust_pem if trust_pem is not None else (TRUST_LIST.read_text() if TRUST_LIST.is_file() else "")
    settings = {"verify": {"verify_trust": True, "remote_manifest_fetch": False}, "trust": {"trust_anchors": pem}}
    try:
        context = c2pa.Context(c2pa.Settings.from_json(json.dumps(settings)))
        reader = c2pa.Reader(mime, io.BytesIO(data), context=context)
        report = json.loads(reader.json())
    except Exception as exc:  # the reader names its errors by class; a missing manifest is the common one
        name = type(exc).__name__ + " " + str(exc)
        if "ManifestNotFound" in name or "JUMBF" in name:
            return {"state": "absent"}
        if "NotSupported" in name or "UnsupportedType" in name:
            return {"state": "unsupported"}
        return {"state": "invalid", "errors": [str(exc)[:300]]}
    active = report.get("active_manifest")
    manifest = (report.get("manifests") or {}).get(active) or {}
    failures = [f.get("code") for f in ((report.get("validation_results") or {}).get("activeManifest") or {}).get("failure", [])]
    raw_state = str(report.get("validation_state") or "").lower()
    state = "trusted" if raw_state == "trusted" else "invalid" if raw_state == "invalid" else "valid"
    sig = manifest.get("signature_info") or {}
    source_types: list[str] = []
    for assertion in manifest.get("assertions") or []:
        if str(assertion.get("label", "")).startswith("c2pa.actions"):
            for action in (assertion.get("data") or {}).get("actions") or []:
                kind = str(action.get("digitalSourceType") or "").rsplit("/", 1)[-1]
                if kind and kind not in source_types:
                    source_types.append(kind)
    generator = ", ".join(g.get("name", "") for g in manifest.get("claim_generator_info") or [] if g.get("name"))
    return {"state": state, "signer": sig.get("common_name") or sig.get("issuer"), "issuer": sig.get("issuer"),
            "signed_at": sig.get("time"), "source_types": source_types, "generator": generator or None,
            "failures": [f for f in failures if f], "title": manifest.get("title")}


def xmp_source_types(data: bytes) -> list[str]:
    """IPTC DigitalSourceType values the file's XMP states (an attribute or element anywhere in the packet)."""
    found: list[str] = []
    for m in re.finditer(rb"digitalsourcetype/([A-Za-z]+)", data[:4_000_000], re.IGNORECASE):
        kind = m.group(1).decode("ascii", "replace")
        if kind not in found:
            found.append(kind)
    return found


def provenance(db: Session, doc: Document) -> dict[str, Any]:
    kind = kind_of(doc)
    path = Path(doc.storage_path)
    if kind == "text":
        return {"kind": kind, "state": "absent", "expected": True}
    if not path.is_file():
        return {"kind": kind, "state": "missing"}
    data = path.read_bytes()
    found = read_credentials(data, doc.mime_type or ("image/jpeg" if kind == "image" else "application/octet-stream"))
    found["kind"] = kind
    found["xmp_source_types"] = xmp_source_types(data)
    found["trust_list_date"] = TRUST_LIST_DATE
    return found


def ai_declared(prov: dict[str, Any]) -> list[str]:
    return [t for t in (prov.get("source_types") or []) + (prov.get("xmp_source_types") or []) if t in AI_SOURCE_TYPES]


def jpeg_quality(path: Path) -> int | None:
    """About what quality a JPEG was last saved at, from its luminance table (the libjpeg scaling, reversed)."""
    std = (16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22,
           29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103,
           121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99)
    try:
        from PIL import Image

        with Image.open(path) as im:
            tables = getattr(im, "quantization", None)
            if im.format != "JPEG" or not tables:
                return None
            table = list(tables[0])
    except Exception:
        return None
    if len(table) != 64:
        return None
    # Paired by size, so the estimate does not depend on the order the table is stored in.
    scale = sum(q * 100 / s for q, s in zip(sorted(table), sorted(std))) / 64
    quality = (200 - scale) / 2 if scale <= 100 else 5000 / scale
    return max(1, min(100, int(round(quality))))


# ── 2. Source ─────────────────────────────────────────────────────────────────────────────────────────────────────

def source_rows(db: Session, doc: Document) -> list[dict[str, Any]]:
    """What the case holds about where the item came from. tone: good, warn, or none (not looked up)."""
    src = db.get(Source, doc.source_id)
    cap = _capture_of(db, doc)
    rows: list[dict[str, Any]] = []
    rows.append({"key": "account_age", "label": "Account or outlet age", "tone": "none",
                 "text": "Not looked up. Nothing is sent on its own; ask for an outside check on the right."})
    rows.append({"key": "ownership", "label": "Ownership", "tone": "none", "text": "Not looked up."})
    author = None
    if cap is not None:
        author = (cap.displayed or {}).get("author")
    author = author or (src.issuer_or_author if src else None)
    if author:
        same = [s for s in db.scalars(select(Source).where(Source.investigation_id == doc.investigation_id))
                if (s.issuer_or_author or "").strip().casefold() == author.strip().casefold()]
        caps = [c for c in db.scalars(select(Capture).where(Capture.investigation_id == doc.investigation_id))
                if str((c.displayed or {}).get("author") or "").strip().casefold() == author.strip().casefold()]
        n = len({s.id for s in same} | {c.source_id for c in caps if c.source_id})
        rows.append({"key": "byline", "label": "Byline history", "tone": "good" if n > 1 else "none",
                     "text": f"“{author}” on {n} item{'s' if n != 1 else ''} in this case, as the page displays it, not verified."})
    else:
        rows.append({"key": "byline", "label": "Byline history", "tone": "warn", "text": "No named person."})
    rows.append({"key": "content_farm", "label": "Content-farm list", "tone": "none", "text": "No list imported."})
    copies = list(db.scalars(select(Document).where(Document.investigation_id == doc.investigation_id,
                                                   Document.sha256 == doc.sha256).order_by(Document.created_at)))
    first = copies[0] if copies else doc
    when = (cap.captured_at if cap is not None and first.id == doc.id and cap.captured_at else first.created_at)
    how = "captured" if cap is not None and first.id == doc.id else "added"
    if first.id == doc.id:
        text = f"Earliest copy we hold is this one, {how} {when:%-d %b %Y %H:%M}."
    else:
        text = f"An earlier copy: {first.filename}, added {first.created_at:%-d %b %Y %H:%M}."
    if len(copies) > 1:
        text += f" {len(copies)} copies with this fingerprint in the case."
    rows.append({"key": "first_seen", "label": "First seen", "tone": "good", "text": text})
    return rows


# ── 3. Hints ──────────────────────────────────────────────────────────────────────────────────────────────────────

def _text_of(db: Session, doc_id: str) -> str:
    return " ".join(c.text for c in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc_id)
                                               .order_by(DocumentChunk.ordinal)))


def hints(db: Session, doc: Document) -> dict[str, Any]:
    kind = kind_of(doc)
    if kind == "text":
        words = len(_text_of(db, doc.id).split())
        if words < SHORT_TEXT_WORDS:
            return {"state": "suppressed", "words": words,
                    "text": f"Hidden, not just off. This text is {words} words, which is too short, and it may be "
                            "second-language writing. In a 2023 study, seven detectors flagged on average 61% of "
                            "essays by non-native English writers as AI."}
        return {"state": "none_installed", "words": words,
                "text": "No text detector is installed on this computer. A hint would change no status."}
    if kind == "image":
        return {"state": "off_by_default",
                "text": "Off for images. On a file a platform has re-saved, image detectors fall to chance. "
                        "No image detector is installed on this computer, so none can run."}
    return {"state": "none_installed", "text": f"No {kind} detector is installed on this computer. A hint would change no status."}


# ── Examination ───────────────────────────────────────────────────────────────────────────────────────────────────

def get_item(db: Session, doc: Document) -> AuthenticityItem:
    item = db.get(AuthenticityItem, doc.id)
    if item is None:
        item = AuthenticityItem(document_id=doc.id, investigation_id=doc.investigation_id, status="unverified",
                                role="events", source_protected=False, checked=[], findings={}, about_evidence=[], suite_restore={})
        db.add(item)
        db.flush()
    return item


def examine(db: Session, doc: Document, *, again: bool = False) -> AuthenticityItem:
    """Record the findings once (or `again`, when asked): each layer is a line in the history. Commits."""
    item = get_item(db, doc)
    if item.examined_at is not None and not again:
        return item
    cap = _capture_of(db, doc)
    if item.examined_at is None:
        how = "Captured from link" if cap is not None else "Added from a file"
        _log(db, doc, "intake", f"{how}. Fingerprint {_short(doc.sha256)}.", method="sha256", input_sha256=doc.sha256)
    prov = provenance(db, doc)
    version = _c2pa_version()
    state_words = {"trusted": "found, signature valid, signer trusted", "valid": "found, signature valid, signer not on the trust list",
                   "invalid": "found, not valid", "absent": "none in the file", "unsupported": "this format cannot carry them here",
                   "unavailable": "not read: c2pa-python is not installed", "missing": "not read: the file is missing"}
    if prov.get("kind") != "text":
        line = f"Content credentials read · c2pa-python {version or '(not installed)'} · local: {state_words.get(prov['state'], prov['state'])}"
        if prov.get("source_types"):
            line += f", source type “{', '.join(prov['source_types'])}”"
        _log(db, doc, "provenance", line + ".", method="C2PA validation, trust list of " + TRUST_LIST_DATE, tool="c2pa-python",
             version=version, input_sha256=doc.sha256, result=prov)
    declared = ai_declared(prov)
    flags = []
    if declared:
        flags.append({"key": "ai_declared", "text": "Declares AI origin. The signer says this was made with generative AI. "
                      "Nothing is blocked until you decide. A valid signature proves who signed, not what is real."
                      if prov.get("source_types") else
                      "Declares AI origin in its metadata. Nothing is blocked until you decide. Metadata can be added or removed by anyone."})
        _log(db, doc, "flag", "Raised review flag “Declares AI origin”. Non-blocking.", result={"source_types": declared})
    rows = source_rows(db, doc)
    _log(db, doc, "source", "Reputation from this case · local: " + "; ".join(r["text"] for r in rows if r["tone"] != "none")[:400],
         method="case records", result={"rows": rows})
    hint = hints(db, doc)
    _log(db, doc, "hints", {"suppressed": "Detector hints: suppressed (short text).", "off_by_default": "Detectors: not run (off for images).",
                            "none_installed": "Detectors: not run (none installed)."}[hint["state"]], result=hint)
    quality = jpeg_quality(Path(doc.storage_path)) if prov.get("kind") == "image" else None
    item.findings = {"provenance": prov, "flags": flags, "source": rows, "hints": hint, "jpeg_quality": quality}
    item.examined_at = utcnow_naive()
    db.commit()
    return item


# ── Which claims lean on it ───────────────────────────────────────────────────────────────────────────────────────

def item_evidence(db: Session, doc: Document) -> list[Evidence]:
    """The evidence records that come from this file: quoted from it, or from its source when they name no file, and
    any record restating one of those (a derivative inherits its parent's standing)."""
    rows = list(db.scalars(select(Evidence).where(
        (Evidence.document_id == doc.id) | ((Evidence.document_id.is_(None)) & (Evidence.source_id == doc.source_id)))))
    ids = {e.id for e in rows}
    frontier = set(ids)
    while frontier:
        more = [e for e in db.scalars(select(Evidence).where(Evidence.restates_evidence_id.in_(frontier))) if e.id not in ids]
        rows.extend(more)
        frontier = {e.id for e in more}
        ids |= frontier
    return rows


def evidence_blocked(db: Session, ev: Evidence) -> bool:
    """Whether this evidence (or the record it restates) shows events through a file a person marked likely or
    confirmed synthetic: then it supports no claim (research §9.3). Evidence about the file itself keeps its support."""
    for e in {ev.id: ev, original_of(db, ev).id: original_of(db, ev)}.values():
        doc_ids = [e.document_id] if e.document_id else list(db.scalars(select(Document.id).where(Document.source_id == e.source_id)))
        for doc_id in doc_ids:
            item = db.get(AuthenticityItem, doc_id)
            if item is not None and item.status in SYNTHETIC and e.id not in (item.about_evidence or []):
                return True
    return False


def about_suggestion(db: Session, doc: Document) -> str:
    """A claim the item can carry about itself, for the person to edit: when it was seen and who posted it."""
    cap = _capture_of(db, doc)
    src = db.get(Source, doc.source_id)
    noun = {"image": "image", "video": "video", "audio": "recording", "text": "text"}[kind_of(doc)]
    seen = cap.captured_at if cap is not None and cap.captured_at else doc.created_at
    author = ((cap.displayed or {}).get("author") if cap is not None else None) or (src.issuer_or_author if src else None)
    return f"This {noun} was online by {seen:%-d %b %Y}" + (f", posted by {author}." if author else ".")


def claims_preview(db: Session, doc: Document, status: str, role: str) -> dict[str, Any]:
    """What `status` with `role` would do to the claims this item supports, or does now when they are the item's own.
    Synthetic takes the item's support away from claims about what it shows (outcome loses, or keeps when another
    source still supports them); claims about the item itself (outcome about) keep it."""
    item = get_item(db, doc)
    about = set(item.about_evidence or [])
    mine = {e.id for e in item_evidence(db, doc)}
    links = list(db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.evidence_id.in_(mine),
                                                            ClaimEvidenceLink.stance == "supports"))) if mine else []
    blocking = status in SYNTHETIC
    claims: list[dict[str, Any]] = []
    for claim_id in dict.fromkeys(link.claim_id for link in links):
        claim = db.get(Claim, claim_id)
        if claim is None:
            continue
        through = {link.evidence_id for link in links if link.claim_id == claim_id}
        if through <= about:
            claims.append({"id": claim.id, "text": claim.text, "status": claim.status, "outcome": "about", "others": 0, "other": None})
            continue
        others = []
        for link in db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id == claim_id,
                                                               ClaimEvidenceLink.stance == "supports")):
            if link.evidence_id in mine:
                continue
            ev = db.get(Evidence, link.evidence_id)
            if ev is not None and not evidence_blocked(db, ev):
                src = db.get(Source, ev.source_id)
                others.append({"evidence_id": ev.id, "source": src.title if src else "", "locator": ev.locator})
        claims.append({"id": claim.id, "text": claim.text, "status": claim.status,
                       "outcome": ("keeps" if others else "loses") if blocking else "unchanged",
                       "others": len({o["source"] for o in others}), "other": others[0] if others else None})
    derived = [{"id": d.id, "operation": d.operation} for d in db.scalars(select(DerivedFile).where(DerivedFile.document_id == doc.id))]
    restating = [e.id for e in item_evidence(db, doc) if e.restates_evidence_id]
    applied = status == item.status and role == item.role
    shown = [c for c in claims if c["outcome"] != "about"]
    lose = sum(c["outcome"] == "loses" for c in claims)
    if blocking and role == "subject":
        headline = "As the subject, it still supports claims about itself"
    elif blocking:
        headline = f"These {len(shown)} claim{'s' if len(shown) != 1 else ''} lose support from this item" if shown else "No claim about what it shows leans on it"
    else:
        headline = "No change to claims"
    return {"status": status, "role": role, "applied": applied, "blocking": blocking, "headline": headline,
            "claims": claims, "losing": lose, "derived": derived, "restating": restating,
            "suggestion": about_suggestion(db, doc) if role == "subject" else None}


def add_about_claim(db: Session, doc: Document, text: str, person: str | None) -> Claim:
    """A claim about the item itself (it circulated, when, posted by whom), supported by the item even when it is
    synthetic: a new claim, a new evidence record from the item marked as about it, and the link. Commits."""
    if len(text.strip()) < 10:
        raise AuthenticityRefused("Write the claim about the item.")
    item = get_item(db, doc)
    claim = Claim(investigation_id=doc.investigation_id, text=text.strip(), status="unverified")
    ev = Evidence(source_id=doc.source_id, document_id=doc.id, locator="the item itself",
                  notes="About the item itself, not what it shows (Is it real?, the subject of the story).")
    db.add_all([claim, ev])
    db.flush()
    db.add(ClaimEvidenceLink(claim_id=claim.id, evidence_id=ev.id, stance="supports"))
    item.about_evidence = [*(item.about_evidence or []), ev.id]
    _log(db, doc, "claim", f"Added a claim about the item itself: “{claim.text}”", actor="person", person=person,
         result={"claim_id": claim.id, "evidence_id": ev.id})
    db.commit()
    return claim


# ── 4. You decide ─────────────────────────────────────────────────────────────────────────────────────────────────

def _apply_suite(db: Session, doc: Document, item: AuthenticityItem) -> None:
    """Show the suite DISPUTED on the item's evidence of events while it is marked synthetic, keeping each record's
    earlier value to put back (DECISIONS.md call 7: the suite has no synthetic value yet). Evidence about the item
    itself is left alone."""
    restore = dict(item.suite_restore or {})
    if item.status in SYNTHETIC:
        about = set(item.about_evidence or [])
        for ev in item_evidence(db, doc):
            if ev.id in about:
                continue
            if ev.id not in restore:
                restore[ev.id] = ev.authenticity_status
            ev.authenticity_status = "DISPUTED"
    else:
        for ev_id, before in restore.items():
            restored = db.get(Evidence, ev_id)
            if restored is not None and restored.authenticity_status == "DISPUTED":
                restored.authenticity_status = before
        restore = {}
    item.suite_restore = restore


def decide(db: Session, doc: Document, *, status: str, checked: list[str], reason: str, person: str | None) -> AuthenticityItem:
    item = get_item(db, doc)
    if status not in STATUSES:
        raise AuthenticityRefused(f"The status is one of {', '.join(STATUSES)}")
    if status == item.status:
        raise AuthenticityRefused("Pick a different status to record a decision.")
    bad = [c for c in checked if c not in CHECKED]
    if bad:
        raise AuthenticityRefused(f"Unknown check: {', '.join(bad)}")
    if not checked or len(reason.strip()) < 10:
        raise AuthenticityRefused("Tick what you checked and write at least a short reason.")
    before = item.status
    item.status, item.checked, item.reason = status, list(dict.fromkeys(checked)), reason.strip()
    item.decided_by, item.decided_at = person, utcnow_naive()
    _apply_suite(db, doc, item)
    n = len(item.checked)
    _log(db, doc, "decision", f"Set status to “{STATUS_WORDS[status]}” (was “{STATUS_WORDS[before]}”). Reasons: "
         f"{n} check{'s' if n != 1 else ''} ticked. “{item.reason}”", actor="person", person=person,
         result={"from": before, "to": status, "checked": item.checked, "reason": item.reason, "role": item.role})
    db.commit()
    return item


def update(db: Session, doc: Document, *, role: str | None, source_protected: bool | None, platform_label: str | None,
           person: str | None) -> AuthenticityItem:
    item = get_item(db, doc)
    if role is not None and role != item.role:
        if role not in ROLES:
            raise AuthenticityRefused(f"The role is one of {', '.join(ROLES)}")
        item.role = role
        _apply_suite(db, doc, item)
        _log(db, doc, "role", "Used as " + ("evidence of events." if role == "events" else "the subject of the story."),
             actor="person", person=person, result={"role": role})
    if source_protected is not None and source_protected != item.source_protected:
        item.source_protected = source_protected
        _log(db, doc, "protected", "Marked source-protected: nothing about it is sent from here." if source_protected
             else "No longer source-protected.", actor="person", person=person, result={"source_protected": source_protected})
    if platform_label is not None and (platform_label.strip() or None) != item.platform_label:
        item.platform_label = platform_label.strip() or None
        _log(db, doc, "label", f"Platform label noted: “{item.platform_label}”." if item.platform_label else "Platform label cleared.",
             actor="person", person=person, result={"platform_label": item.platform_label})
    db.commit()
    return item


# ── Before anything is sent ───────────────────────────────────────────────────────────────────────────────────────

def _dhash(path: Path) -> int | None:
    try:
        from PIL import Image

        with Image.open(path) as im:
            small = im.convert("L").resize((9, 8))
            px = list(small.getdata())
    except Exception:
        return None
    bits = 0
    for row in range(8):
        for col in range(8):
            bits = (bits << 1) | (px[row * 9 + col] > px[row * 9 + col + 1])
    return bits


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.split()) >= 8]


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


def compare_local(db: Session, doc: Document, person: str | None) -> dict[str, Any]:
    """Compare the item with the case's own files, on this computer: the same picture (a 64-bit difference hash) or
    the same sentences, word for word. Nothing leaves. Commits."""
    others = [d for d in db.scalars(select(Document).where(Document.investigation_id == doc.investigation_id,
                                                           Document.id != doc.id))]
    matches: list[dict[str, Any]] = []
    if kind_of(doc) == "image":
        mine = _dhash(Path(doc.storage_path))
        pool = [d for d in others if kind_of(d) == "image"]
        if mine is not None:
            for d in pool:
                theirs = _dhash(Path(d.storage_path))
                if theirs is not None and bin(mine ^ theirs).count("1") <= SAME_PICTURE_BITS:
                    matches.append({"document_id": d.id, "filename": d.filename, "bits": bin(mine ^ theirs).count("1"),
                                    "same_file": d.sha256 == doc.sha256})
        method, text = "difference hash (64 bits)", f"Compared with this case's {len(pool)} pictures: {len(matches)} look the same."
    else:
        mine_s = _sentences(_text_of(db, doc.id))
        pool = [d for d in others if kind_of(d) == "text"]
        found: dict[str, list[str]] = {}
        for d in pool:
            their_text = _norm(_text_of(db, d.id))
            hits = [s for s in mine_s if _norm(s) in their_text]
            if hits:
                found[d.id] = hits
                matches.append({"document_id": d.id, "filename": d.filename, "sentences": len(hits), "first": hits[0][:200]})
        n = len({s for hits in found.values() for s in hits})
        method = "sentences of 8 words or more, word for word"
        text = f"Similarity · local: {n} of {len(mine_s)} sentences match {len(matches)} of this case's {len(pool)} documents."
    _log(db, doc, "similarity", text, actor="person", person=person, method=method, input_sha256=doc.sha256,
         result={"matches": matches, "pool": len(pool)})
    db.commit()
    return {"text": text, "matches": matches, "pool": len(pool)}


def public_address(db: Session, doc: Document) -> str | None:
    cap = _capture_of(db, doc)
    if cap is not None:
        return cap.final_url or cap.url
    src = db.get(Source, doc.source_id)
    return src.url if src is not None and src.url and src.url.startswith(("http://", "https://")) else None


def outside_options(db: Session, doc: Document, item: AuthenticityItem) -> list[dict[str, Any]]:
    """The consent card's choices. Only the ones that send a public address or a few words are offered: uploading the
    file, or a cloud detector, needs a service set up here, and none is."""
    kind = kind_of(doc)
    address = public_address(db, doc)
    options: list[dict[str, Any]] = []
    if kind == "image":
        for key, (name, _) in REVERSE_SEARCH.items():
            options.append({"key": key, "label": f"Reverse-image search: send only the item's public address ({name})",
                            "to": f"To a reverse-image site ({name}, a third party)", "sends": address,
                            "available": bool(address) and not item.source_protected,
                            "why_not": None if address else "The item has no public address to send."})
        options.append({"key": "upload", "label": "Reverse-image search: upload the image",
                        "to": "Discloses the picture itself.", "sends": None, "available": False,
                        "why_not": "Not offered: no upload service is set up here."})
        options.append({"key": "cloud_detector", "label": "Cloud detector: upload the image", "to": "To a cloud service (third party)",
                        "sends": None, "available": False, "why_not": "Not offered: no cloud detector is set up here."})
    elif kind == "text":
        quoted = [e.quote for e in item_evidence(db, doc) if e.quote and e.quote.strip()][:2]
        sentences = quoted or _sentences(_text_of(db, doc.id))[:2]
        query = " ".join(f"“{s.strip()[:160]}”" for s in sentences)
        options.append({"key": "web", "label": f"Search the web for {len(sentences)} sentence{'s' if len(sentences) != 1 else ''}",
                        "to": "To a search engine (third party). It sees the words.", "sends": query or None,
                        "available": bool(query) and not item.source_protected,
                        "why_not": None if query else "The text has no sentence long enough to search for."})
        options.append({"key": "cloud_detector", "label": "Cloud detector: send the text", "to": "To a cloud service (third party)",
                        "sends": None, "available": False, "why_not": "Not offered: the text is too short for a hint, and no cloud detector is set up here."
                        if hints(db, doc)["state"] == "suppressed" else "Not offered: no cloud detector is set up here."})
    else:
        options.append({"key": "cloud_detector", "label": f"Cloud detector: upload the {kind}", "to": "To a cloud service (third party)",
                        "sends": None, "available": False, "why_not": "Not offered: no cloud detector is set up here."})
    return options


def send_outside(db: Session, doc: Document, key: str, person: str | None) -> dict[str, Any]:
    """With consent for this one item: log what goes, to whom and why, and give the address to open. The app sends
    nothing itself; the person's browser opens the link. Refused for a source-protected item. Commits."""
    item = get_item(db, doc)
    if item.source_protected:
        record_outbound(db, doc.investigation_id, service="authenticity", kind="blocked", value=doc.filename,
                        reason="Source-protected item: an outside check was asked for and blocked", outcome="blocked",
                        source={"document_id": doc.id})
        raise AuthenticityRefused("This item is source-protected. Nothing is sent from here.")
    option = next((o for o in outside_options(db, doc, item) if o["key"] == key), None)
    if option is None or not option["available"]:
        raise AuthenticityRefused(option["why_not"] if option else "That check is not offered for this item.")
    sends = str(option["sends"])
    if key in REVERSE_SEARCH:
        name, pattern = REVERSE_SEARCH[key]
        url = pattern.format(quote_plus(sends))
    else:
        name, pattern = WEB_SEARCH
        url = pattern.format(quote_plus(sends))
    request_id = record_outbound(db, doc.investigation_id, service=name, kind="public address" if key in REVERSE_SEARCH else "search words",
                                 value=sends, reason="Is it real? An outside check, allowed once for this item",
                                 source={"document_id": doc.id})
    _log(db, doc, "outside", f"Allowed once: sent {('the public address' if key in REVERSE_SEARCH else 'the words')} to {name}, "
         "opened in your browser.", actor="person", person=person, method=option["label"], local=False,
         result={"service": name, "sent": sends, "outbound_request_id": request_id, "url": url})
    db.commit()
    return {"url": url, "service": name, "sent": sends, "outbound_request_id": request_id}


# ── The screen ────────────────────────────────────────────────────────────────────────────────────────────────────

def history(db: Session, doc: Document) -> list[AuthenticityCheck]:
    return list(db.scalars(select(AuthenticityCheck).where(AuthenticityCheck.document_id == doc.id)
                           .order_by(AuthenticityCheck.created_at.desc(), AuthenticityCheck.id.desc())))


def item_card(db: Session, doc: Document, item: AuthenticityItem) -> dict[str, Any]:
    src = db.get(Source, doc.source_id)
    cap = _capture_of(db, doc)
    photo = db.get(DocumentPhoto, doc.id)
    path = Path(doc.storage_path)
    displayed = (cap.displayed or {}) if cap is not None else {}
    excerpt = None
    quotes: list[str] = []
    if kind_of(doc) == "text":
        excerpt = _text_of(db, doc.id)[:700] or None
        quotes = [e.quote for e in item_evidence(db, doc) if e.quote and e.quote.strip()][:6]
    quality = (item.findings or {}).get("jpeg_quality")
    note = f"Saved at JPEG quality about {quality}: a platform or an editor re-saved it." if quality and quality < 90 else None
    return {"document_id": doc.id, "kind": kind_of(doc), "title": displayed.get("title") or (src.title if src else doc.filename),
            "posted_by": displayed.get("author") or (src.issuer_or_author if src else None),
            "outlet": (cap.final_url or cap.url) if cap is not None else (src.url if src else None),
            "captured_at": cap.captured_at if cap is not None else None, "added_at": doc.created_at,
            "from_link": cap is not None, "filename": doc.filename, "size": path.stat().st_size if path.is_file() else None,
            "width": photo.width if photo else None, "height": photo.height if photo else None, "sha256": doc.sha256,
            "note": note, "excerpt": excerpt, "quotes": quotes, "words": len(_text_of(db, doc.id).split()) if kind_of(doc) == "text" else None}


def screen(db: Session, doc: Document) -> dict[str, Any]:
    item = examine(db, doc)
    return {"item": item_card(db, doc, item), "status": item.status, "role": item.role,
            "source_protected": item.source_protected, "decided_by": item.decided_by, "decided_at": item.decided_at,
            "reason": item.reason, "checked": item.checked or [], "platform_label": item.platform_label,
            "findings": item.findings or {}, "examined_at": item.examined_at,
            "preview": claims_preview(db, doc, item.status, item.role),
            "outside": outside_options(db, doc, item),
            "history": [{"id": h.id, "kind": h.kind, "actor": h.actor, "person": h.person, "method": h.method, "tool": h.tool,
                         "version": h.version, "local": h.local, "text": h.text, "at": h.created_at} for h in history(db, doc)]}


def statuses(db: Session, investigation_id: str) -> list[dict[str, Any]]:
    """Each examined or decided file's standing, for the Check stage's list."""
    rows = db.scalars(select(AuthenticityItem).where(AuthenticityItem.investigation_id == investigation_id))
    return [{"document_id": r.document_id, "status": r.status, "role": r.role, "source_protected": r.source_protected,
             "decided_at": r.decided_at, "flagged": bool((r.findings or {}).get("flags"))} for r in rows]

