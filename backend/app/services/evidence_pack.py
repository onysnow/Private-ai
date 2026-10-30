"""The evidence pack (Export sheet, research §11 "Exports"; ADR-0024): a .zip that stands on its own for an editor, a
lawyer or a partner. The story's write-up, an exhibits list made from its citations, each cited passage with the
fingerprint of the file it comes from and a picture of its page, each cited claim's chain of custody, the readiness
record (the gates, who decided, when), the gaps (a citation whose record is gone, a file that changed or is missing),
and the limit stated plainly. MANIFEST.sha256 lists every file's SHA-256; VERIFY.txt says how to check it.

Nothing here is sent anywhere: the pack is made on this computer and handed to the person. When a check before an
outward export is still open, the pack is stamped "Export as draft" on every page, never refused. Original files are
not put in the pack; their fingerprints are, so a reader can ask for an original and check it.
"""

from __future__ import annotations

import base64
import csv
import hashlib
import html
import io
import json
import logging
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import (
    AuthenticityItem,
    Claim,
    ClaimEvidenceLink,
    Document,
    DocumentChunk,
    Evidence,
    Investigation,
    Source,
    Writeup,
)
from app.services.authenticity import STATUS_WORDS
from app.services.claim_done import _document_of, _file_matches
from app.services.claims import superseded_of
from app.services.custody_chain import claim_custody_chain
from app.services.security import resolve_storage_root
from app.services.stories import story_of, story_tree
from app.services.writeups import extract_cited_refs, render_writeup_docx

logger = logging.getLogger("journalism.evidence_pack")

LIMIT = ("Fingerprints (SHA-256) show that the files have not changed since they were added to this case. They do not "
         "show what happened to a file before it was added, or that what a file says is true.")


class NoStory(LookupError):
    """The case has no story with a write-up to pack."""


def _utc(at: datetime | None) -> str:
    return at.replace(tzinfo=timezone.utc).strftime("%Y-%m-%d %H:%M UTC") if at else "not recorded"


def preflight(tree: dict[str, Any]) -> list[dict[str, Any]]:
    """The checks before an outward export, as the Export sheet shows them: each ok or open, with what it waits on."""
    s = tree["sentences"]
    gates = {g["key"]: g for g in tree["gates"]}
    out = [{"key": "sources", "ok": s["total"] > 0 and s["uncited"] == 0,
            "text": "Nothing written yet" if s["total"] == 0 else f"{s['uncited']} sentence(s) without a source" if s["uncited"] else "Every sentence has a source"}]
    for key in ("single", "innocent", "right_of_reply", "legal_read"):
        g = gates.get(key)
        if g is not None:
            out.append({"key": key, "ok": g["state"] == "passed", "text": f"{g['label']}: {g['detail']}"})
    return out


def _exhibits(db: Session, refs: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[tuple[str, str], list[int]], list[str]]:
    """Number every piece of evidence the write-up rests on, in the order the text first cites it: a cited claim brings
    the evidence linked to it (for and against), a cited piece of evidence itself. Returns the exhibits, the exhibit
    numbers behind each citation, and the gaps (citations whose record is gone)."""
    exhibits: list[dict[str, Any]] = []
    by_evidence: dict[str, int] = {}
    behind: dict[tuple[str, str], list[int]] = {}
    gaps: list[str] = []

    def add(ev: Evidence, claim: Claim | None, stance: str | None) -> int:
        if ev.id not in by_evidence:
            exhibits.append({"evidence": ev, "claims": [], "number": len(exhibits) + 1})
            by_evidence[ev.id] = len(exhibits)
        n = by_evidence[ev.id]
        if claim is not None:
            exhibits[n - 1]["claims"].append({"id": claim.id, "text": claim.text, "status": claim.status, "stance": stance})
        return n

    for ref in refs:
        key = (ref["record_type"], ref["record_id"])
        if key[0] == "claim":
            claim = db.get(Claim, key[1])
            if claim is None:
                gaps.append(f"A citation points at a claim that is no longer in the case ({key[1]}).")
                continue
            links = [link for link in db.query(ClaimEvidenceLink).filter(ClaimEvidenceLink.claim_id == claim.id)
                     .order_by(ClaimEvidenceLink.created_at) if link.stance in ("supports", "contradicts")]
            nums = []
            for link in links:
                ev = db.get(Evidence, link.evidence_id)
                if ev is not None:
                    # A superseded record stays an exhibit, said to be superseded, with what replaced it and why.
                    gone = superseded_of(db, link)
                    replaced = f"; replaced by {gone['by_label']}" if gone and gone["by_label"] else ""
                    stance = link.stance if gone is None else f"superseded (was {link.stance}{replaced}: {gone['reason']})"
                    nums.append(add(ev, claim, stance))
            if not nums:
                gaps.append(f"The cited claim “{claim.text[:120]}” has no evidence linked.")
            elif all(not link.counts_toward_claim for link in links if db.get(Evidence, link.evidence_id) is not None):
                gaps.append(f"The cited claim “{claim.text[:120]}” rests only on evidence marked superseded.")
            behind[key] = nums
        elif key[0] == "evidence":
            ev = db.get(Evidence, key[1])
            if ev is None:
                gaps.append(f"A citation points at evidence that is no longer in the case ({key[1]}).")
                continue
            behind[key] = [add(ev, None, None)]
        else:
            behind[key] = []
    return exhibits, behind, gaps


def _render_html(content: dict, behind: dict[tuple[str, str], list[int]], title: str, draft: bool) -> str:
    """The write-up as a page any browser opens: each citation a link to its exhibits."""
    out: list[str] = []

    def inline(node: dict) -> str:
        kind = node.get("type")
        if kind == "text":
            text = html.escape(node.get("text") or "")
            for mark in node.get("marks") or []:
                tag = {"bold": "b", "italic": "i", "underline": "u"}.get(mark.get("type"))
                if tag:
                    text = f"<{tag}>{text}</{tag}>"
            return text
        if kind == "citation":
            attrs = node.get("attrs") or {}
            rtype = "task" if attrs.get("recordType") == "reporting_task" else attrs.get("recordType")
            nums = behind.get((str(rtype), str(attrs.get("recordId"))), [])
            if not nums:
                return '<sup class="gap">[no exhibit]</sup>'
            return "<sup>[" + ", ".join(f'<a href="exhibits/{n:03d}/exhibit.html">{n}</a>' for n in nums) + "]</sup>"
        if kind == "hardBreak":
            return "<br>"
        return "".join(inline(c) for c in node.get("content") or [])

    def block(node: dict) -> None:
        kind = node.get("type")
        if kind == "heading":
            level = min(6, max(2, int((node.get("attrs") or {}).get("level") or 2)))
            out.append(f"<h{level}>{inline(node)}</h{level}>")
        elif kind == "paragraph":
            out.append(f"<p>{inline(node)}</p>")
        elif kind in ("bulletList", "orderedList"):
            tag = "ul" if kind == "bulletList" else "ol"
            out.append(f"<{tag}>" + "".join(f"<li>{''.join(inline(p) for p in (li.get('content') or []))}</li>" for li in node.get("content") or []) + f"</{tag}>")
        elif kind == "blockquote":
            out.append("<blockquote>" + "".join(inline(c) for c in node.get("content") or []) + "</blockquote>")
        elif kind == "evidenceVisual":
            out.append('<p class="note">[A chart or figure: open the .docx to see it drawn.]</p>')
        else:
            for child in node.get("content") or []:
                if isinstance(child, dict):
                    block(child)

    for node in (content or {}).get("content") or []:
        if isinstance(node, dict):
            block(node)
    stamp = '<p class="draft">Export as draft: checks before an outward export are still open (see README.txt).</p>' if draft else ""
    return _page(title, stamp + f"<h1>{html.escape(title)}</h1>" + "".join(out) + '<p class="note"><a href="exhibits.csv">The exhibits list</a> · ' + html.escape(LIMIT) + "</p>")


def _page(title: str, body: str) -> str:
    return ("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>" + html.escape(title) + "</title><style>"
            "body{font:16px/1.6 Georgia,serif;max-width:46em;margin:2em auto;padding:0 1em;color:#1d1a16;background:#fbf8f2}"
            "h1,h2,h3{font-family:system-ui,sans-serif}sup a{color:#7a4b00}.gap{color:#a3261b}.note{color:#6b6257}"
            ".draft{border:2px solid #a3261b;color:#a3261b;padding:.5em 1em;font-family:system-ui,sans-serif}"
            "table{border-collapse:collapse;width:100%;font:14px system-ui,sans-serif}td,th{border-bottom:1px solid #ddd3c4;padding:6px;text-align:left;vertical-align:top}"
            "code{font-size:12px;word-break:break-all}blockquote{border-left:3px solid #c9a227;margin:1em 0;padding:.2em 1em;background:#f3ecdd}"
            "</style></head><body>" + body + "</body></html>")


def _exhibit_files(db: Session, ex: dict[str, Any], draft: bool, storage_root: Path) -> tuple[dict[str, bytes], dict[str, Any], list[str]]:
    """One exhibit's files, its row for the exhibits list, and any gap it shows."""
    ev: Evidence = ex["evidence"]
    n = ex["number"]
    src = db.get(Source, ev.source_id) if ev.source_id else None
    doc = _document_of(db, ev, src)
    gaps: list[str] = []
    files: dict[str, bytes] = {}
    matches = _file_matches(doc) if doc is not None else None
    if doc is not None and matches is False:
        gaps.append(f"Exhibit {n}: the file {doc.filename} no longer matches its fingerprint, or is missing from this computer.")
    chunk = None
    if doc is not None and (ev.anchor or {}).get("chunk_id"):
        chunk = db.get(DocumentChunk, (ev.anchor or {}).get("chunk_id"))
    if doc is not None and chunk is None and ev.quote:
        wanted = " ".join(ev.quote.split()).casefold()
        chunk = next((c for c in db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).order_by(DocumentChunk.ordinal)
                      if wanted and wanted in " ".join(c.text.split()).casefold()), None)
    page = chunk.page_number if chunk is not None else None
    if chunk is not None:
        files["passage.txt"] = (f"{chunk.locator or ''}\n\n{chunk.text}\n").encode()
    picture = None
    item = db.get(AuthenticityItem, doc.id) if doc is not None else None
    protected = bool(item and item.source_protected)
    if doc is not None and matches is not False and not protected:
        picture = _picture(db, doc, page, ev.quote or "", storage_root)
        if picture is not None:
            files[picture[0]] = picture[1]
    real = STATUS_WORDS.get(item.status, item.status) if item is not None else "Not looked at"
    row = {"exhibit": n, "quote": ev.quote or "", "locator": ev.locator or "", "page": page or "",
           "source": src.title if src else "Typed in by hand", "source_url": (src.url or "") if src else "",
           "file": doc.filename if doc else "", "sha256": doc.sha256 if doc else "",
           "fingerprint_now": "matches" if matches else "does not match" if matches is False else "no file",
           "added": _utc(doc.created_at) if doc else "", "is_it_real": real,
           "claims": "; ".join(f"{c['stance'] or 'cited'}: {c['text']}" for c in ex["claims"])}
    caption = "A viewing copy: drawn again here, its metadata removed. The SHA-256 above is the original's." if picture and picture[0] == "picture.jpg" else ""
    picture_html = (f'<p><img src="{picture[0]}" alt="The page this passage is on" style="max-width:100%;border:1px solid #ddd3c4"><br><small>{caption}</small></p>'
                    if picture else '<p class="note">Source-protected: no picture of it is in this pack.</p>' if protected else "")
    body = (('<p class="draft">Export as draft.</p>' if draft else "")
            + f"<h1>Exhibit {n}</h1><blockquote>{html.escape(ev.quote or '(no quote)')}</blockquote>"
            + "<table>" + "".join(f"<tr><th>{html.escape(k)}</th><td>{html.escape(str(v))}</td></tr>" for k, v in (
                ("Where", ev.locator or (f"page {page}" if page else "not recorded")), ("Source", row["source"]), ("Address", row["source_url"]),
                ("File", row["file"] or "no file in the case"), ("SHA-256 of the file as added", row["sha256"]),
                ("Fingerprint checked now", row["fingerprint_now"]), ("Added to the case", row["added"]),
                ("Is it real? (a person's status)", real), ("Cited for", row["claims"] or "cited directly")))
            + "</table>" + picture_html + ("<h2>The passage</h2><pre style=\"white-space:pre-wrap\">" + html.escape(chunk.text) + "</pre>" if chunk else "")
            + f'<p class="note">{html.escape(LIMIT)}</p><p><a href="../../index.html">Back to the write-up</a></p>')
    files["exhibit.html"] = _page(f"Exhibit {n}", body).encode()
    return files, row, gaps


def writeup_pdf(db: Session, investigation_id: str) -> tuple[bytes, str]:
    """The story's write-up for reading, as a PDF printed here: the same page as the pack's index.html, with each
    citation's exhibit numbers. Raises NoStory when there is no write-up."""
    from app.services.print_pdf import html_to_pdf

    story = story_of(db, investigation_id)
    writeup = db.get(Writeup, story.writeup_id) if story is not None and story.writeup_id else None
    if writeup is None:
        raise NoStory("Start the story's write-up first.")
    draft = not all(c["ok"] for c in preflight(story_tree(db, investigation_id)))
    _exhibits_, behind, _gaps = _exhibits(db, extract_cited_refs(writeup.content_json or {}))
    return html_to_pdf(_render_html(writeup.content_json or {}, behind, writeup.title, draft)), writeup.title


def _body(page: bytes) -> str:
    m = re.search(r"<body[^>]*>(.*)</body>", page.decode("utf-8", "replace"), re.S)
    return m.group(1) if m else ""


def pack_pdf(files: dict[str, bytes], title: str) -> bytes:
    """The write-up and every exhibit as one PDF, each exhibit on a new page with its picture, printed here."""
    from app.services.print_pdf import html_to_pdf

    parts = [_body(files["index.html"])]
    for name in sorted(n for n in files if re.match(r"^exhibits/\d{3}/exhibit\.html$", n)):
        folder = name.rsplit("/", 1)[0]
        body = _body(files[name])
        for pic, mime in (("page.png", "image/png"), ("picture.jpg", "image/jpeg")):
            if f"{folder}/{pic}" in files:
                body = body.replace(f'src="{pic}"', f'src="data:{mime};base64,{base64.b64encode(files[f"{folder}/{pic}"]).decode()}"')
        parts.append('<section style="page-break-before:always">' + body + "</section>")
    return html_to_pdf(_page(title, "".join(parts)))


def viewing_copy(data: bytes) -> bytes:
    """A picture drawn again as a plain JPEG: no EXIF, XMP, GPS, camera serial or content credentials leave in a pack.
    The original's SHA-256 stays in the exhibit, for anyone who is given the original to check."""
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(data)) as im:
        shown = ImageOps.exif_transpose(im).convert("RGB")
        shown.thumbnail((1600, 1600))
        out = io.BytesIO()
        shown.save(out, "JPEG", quality=88)
    return out.getvalue()


def _picture(db: Session, doc: Document, page: int | None, quote: str, storage_root: Path) -> tuple[str, bytes] | None:
    """The page the passage is on, drawn with the words marked (a PDF), or the picture itself (a photo)."""
    try:
        if doc.filename.lower().endswith(".pdf"):
            from app.services.page_image import page_png

            data, _pages, _found = page_png(doc.storage_path, storage_root, page or 1, width=1100, highlight=quote[:2000])
            return "page.png", data
        from app.services.image_reader import NotAPicture, shown_path, stored_picture

        try:
            data, _picture = stored_picture(shown_path(db, doc), storage_root)
        except NotAPicture:
            return None
        return "picture.jpg", viewing_copy(data)
    except Exception:  # a page that cannot be drawn leaves the exhibit without its picture, never the pack
        return None


def build_pack(db: Session, investigation_id: str, *, actor: str | None = None) -> tuple[bytes, dict[str, Any]]:
    """The pack's bytes and a summary (exhibits, gaps, draft). Raises NoStory when there is no write-up to pack. Each
    pack is recorded with its own list of files (EvidencePack), so one sent back can be checked against it."""
    from app.core.time import utcnow_naive
    from app.models.base import uid
    from app.models.evidence_pack import EvidencePack

    story = story_of(db, investigation_id)
    writeup = db.get(Writeup, story.writeup_id) if story is not None and story.writeup_id else None
    if writeup is None:
        raise NoStory("Start the story's write-up first: the pack is made from its citations.")
    inv = db.get(Investigation, investigation_id)
    tree = story_tree(db, investigation_id)
    checks = preflight(tree)
    draft = not all(c["ok"] for c in checks)
    refs = extract_cited_refs(writeup.content_json or {})
    exhibits, behind, gaps = _exhibits(db, refs)
    storage_root = resolve_storage_root(settings.document_storage_dir)
    made = datetime.now(timezone.utc)
    pack_id = uid()
    files: dict[str, bytes] = {}

    files["index.html"] = _render_html(writeup.content_json or {}, behind, writeup.title, draft).encode()
    try:
        from app.services.assistant_context import describe_record_refs

        docx = render_writeup_docx(writeup, describe_record_refs(db, investigation_id=investigation_id, refs=refs))
        buf = io.BytesIO()
        docx.save(buf)
        files["writeup.docx"] = buf.getvalue()
    except Exception:  # the .docx is a convenience beside index.html; say it is missing, keep the detail in the log
        logger.exception("evidence pack: the .docx could not be made")
        gaps.append("The .docx could not be made; index.html holds the same write-up.")

    rows = []
    kept: list[dict[str, Any]] = []
    for ex in exhibits:
        ex_files, row, ex_gaps = _exhibit_files(db, ex, draft, storage_root)
        rows.append(row)
        gaps.extend(ex_gaps)
        for name, data in ex_files.items():
            files[f"exhibits/{ex['number']:03d}/{name}"] = data
        ev = ex["evidence"]
        doc = _document_of(db, ev, db.get(Source, ev.source_id) if ev.source_id else None)
        kept.append({"number": ex["number"], "evidence_id": ev.id, "document_id": doc.id if doc else None, "page": row["page"] or None,
                     "quote": ev.quote or "", "picture": next((n for n in ex_files if n in ("page.png", "picture.jpg")), None),
                     "claims": [c["id"] for c in ex["claims"]]})
    table = io.StringIO()
    fields = ["exhibit", "quote", "locator", "page", "source", "source_url", "file", "sha256", "fingerprint_now", "added", "is_it_real", "claims"]
    writer = csv.DictWriter(table, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    files["exhibits.csv"] = table.getvalue().encode()

    cited_claims = [r["record_id"] for r in refs if r["record_type"] == "claim"]
    for claim_id in dict.fromkeys(cited_claims + [c["id"] for ex in exhibits for c in ex["claims"]]):
        chain = claim_custody_chain(db, claim_id)
        if chain is None:
            continue
        log = "\n".join(f"{_utc(e['when']) if isinstance(e['when'], datetime) else e['when']}\t{e['who']}\t{e['what']}" for e in chain["log"])
        done = "\n".join(f"{'✓' if r['state'] == 'met' else '✕' if r['state'] == 'not_met' else '○'} {r['label']}: {r['detail']}" for r in chain["done"]["rules"])
        files[f"custody/{claim_id}.txt"] = (f"Claim: {chain['claim']['text']}\nStatus: {chain['claim']['status']}\n\n"
                                            f"Done rules for Supported\n{done}\n\nChain of custody (UTC)\n{log}\n").encode()

    made_pdf = False
    try:
        files["evidence-pack.pdf"] = pack_pdf(files, writeup.title)
        made_pdf = True
    except Exception as exc:  # the PDF is a reading copy beside the HTML: its absence is a gap, never a failed pack
        logger.warning("evidence pack: no PDF (%s)", exc)
        gaps.append(f"The PDF could not be made here ({exc}); index.html and the exhibits hold the same pages.")
    readiness = {"pack_id": pack_id, "made": made.isoformat(), "story": tree["thesis"], "write_up": writeup.title,
                 "gates": [{"label": g["label"], "state": g["state"], "detail": g["detail"]} for g in tree["gates"]],
                 "recorded": (story.gates if story else {}),
                 "ready": {"by": story.ready_by, "at": story.ready_at.isoformat() if story and story.ready_at else None} if story else None,
                 "checks_before_export": checks, "draft": draft}
    files["readiness.json"] = json.dumps(readiness, indent=2, default=str).encode()
    files["gaps.txt"] = ("\n".join(gaps) if gaps else "None found: every citation reaches its records, and every file still matches its fingerprint.").encode() + b"\n"
    files["README.txt"] = "\n".join([
        f"Evidence pack: {writeup.title}",
        f"Case: {inv.name if inv else investigation_id}",
        f"Made: {made:%Y-%m-%d %H:%M} UTC, on this computer, by the Journalism Workbench. Pack {pack_id}.",
        "",
        "EXPORT AS DRAFT: checks before an outward export are still open:" if draft else "Every check before an outward export passed:",
        *[f"  {'✓' if c['ok'] else '○'} {c['text']}" for c in checks],
        "",
        "Inside:",
        "  index.html        the write-up; each citation links to its exhibits",
        "  writeup.docx      the write-up for editing, with numbered citations",
        f"  exhibits.csv      {len(rows)} exhibit(s): quote, where, source, file, SHA-256, fingerprint checked now",
        "  exhibits/NNN/     each exhibit: exhibit.html, the passage, a picture of its page (or a viewing copy of the picture)",
        "  custody/          the chain of custody of each cited claim, with its Done rules",
        "  readiness.json    the gates, who decided and when",
        f"  gaps.txt          {len(gaps)} gap(s)",
        "  evidence-pack.pdf the write-up and every exhibit as one PDF, for reading and printing",
        "  MANIFEST.sha256   every file's SHA-256; VERIFY.txt says how to check them",
        "  MANIFEST.sha256.sig and PUBLIC_KEY.pem   the list signed with this computer's key",
        "",
        "Original files are not in the pack. Their SHA-256 is: ask for an original and check it against exhibits.csv.",
        "A picture is shown as a viewing copy, drawn again with its metadata removed (no GPS, camera serial or credentials).",
        "Nothing of a source-protected item is pictured.",
        "",
        "Limit: " + LIMIT,
        "",
    ]).encode()
    files["VERIFY.txt"] = ("To check that nothing in this pack changed after it was made, run in this folder:\n"
                           "  sha256sum -c MANIFEST.sha256        (Linux)\n"
                           "  shasum -a 256 -c MANIFEST.sha256    (macOS)\n"
                           "Every line should say OK. On Windows: certutil -hashfile <file> SHA256, and compare.\n"
                           "The list is signed with the key of the computer that made the pack. To check the signature:\n"
                           "  openssl pkeyutl -verify -pubin -inkey PUBLIC_KEY.pem -rawin -in MANIFEST.sha256 -sigfile MANIFEST.sha256.sig\n"
                           "It should say Signature Verified Successfully. It shows who made the pack only as far as you know the key\n"
                           "is theirs: ask them for its fingerprint (the Workbench shows it in Settings) and compare.\n").encode()
    listed = {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}
    files["MANIFEST.sha256"] = "".join(f"{sha}  {name}\n" for name, sha in listed.items()).encode()
    from app.services.pack_signing import sign

    signature, pem, key_fingerprint = sign(db, files["MANIFEST.sha256"])
    files["MANIFEST.sha256.sig"] = signature
    files["PUBLIC_KEY.pem"] = pem
    db.add(EvidencePack(id=pack_id, investigation_id=investigation_id, title=writeup.title, draft=draft, made_by=actor,
                        manifest=files["MANIFEST.sha256"].decode(), manifest_sha256=hashlib.sha256(files["MANIFEST.sha256"]).hexdigest(),
                        files=listed, exhibits=kept, created_at=utcnow_naive(), key_fingerprint=key_fingerprint, pdf=made_pdf))
    db.commit()

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in sorted(files.items()):
            zf.writestr(name, data)
    summary = {"exhibits": len(rows), "gaps": len(gaps), "draft": draft, "files": len(files), "pack_id": pack_id,
               "pdf": made_pdf, "key_fingerprint": key_fingerprint}
    return out.getvalue(), summary
