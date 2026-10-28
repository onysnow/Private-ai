"""The video or audio on a captured page (ADR-0020, source intake Phase 2c; DECISIONS.md call 5).

yt-dlp (Unlicense) fetches one item, logged out, with no cookie file, through the same guard proxy as the page capture
(app/services/web_capture.py): every connection goes only to public addresses, and the whole download stays within
MAX_MEDIA_BYTES. Only single-file formats are taken, so no FFmpeg is needed to join streams. The file and what yt-dlp
read about it (its info.json) are kept with the capture, each with its SHA-256; the file also becomes a recording under
the page's document and is transcribed like any upload. Each item records its platform, its id there, the account it
came from, and the route it took ("yt-dlp, logged out"), so counsel can apply the right platform terms.
"""

from __future__ import annotations

import json
import logging
import shutil
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.db.locking import lock_investigation_transaction
from app.models.domain import Capture, Investigation, Source
from app.services.outbound import mark_outbound_failed, record_outbound
from app.services.security import contained_path, resolve_storage_root
from app.services.transcription import is_media, media_type
from app.services.web_capture import _first_line, _Guard, _sha256, capture_dir

logger = logging.getLogger("journalism.media_links")

SERVICE = "media download"
ROUTE = "yt-dlp, logged out, no cookies, through this computer's own connection"


class _Quiet:
    """yt-dlp's messages go to the app's log, not to the console."""

    def debug(self, msg: str) -> None:
        logger.debug(msg)

    def warning(self, msg: str) -> None:
        logger.info(msg)

    def error(self, msg: str) -> None:
        logger.info(msg)


def _tool() -> str:
    try:
        return f"yt-dlp {version('yt-dlp')}"
    except PackageNotFoundError:
        return "yt-dlp"


def _reason(text: str, refused: list[str], over: bool) -> str:
    """What went wrong, in words, from yt-dlp's error and the guard's record."""
    low = text.lower()
    if over:
        return f"The video or audio is larger than the {settings.max_media_bytes // (1024 * 1024)} MB limit for a recording"
    if refused:
        return f"The download went to {refused[-1]}, a private or local address: it was stopped there"
    if "unsupported url" in low or "no video formats" in low or "no media" in low:
        return "No video or audio was found on this page"
    if any(word in low for word in ("sign in", "log in", "login", "private video", "members-only", "confirm your age")):
        return "The site asks for a sign-in to show it; nothing is collected signed in"
    if "requested format is not available" in low:
        return "The site offers it only as separate picture and sound streams, which this computer does not join"
    return f"The video or audio could not be collected: {text.removeprefix('ERROR: ')[:300]}"


def collect_media(db: Session, capture_id: str, report: Callable[[int | None, str | None], None], *,
                  read_document: Callable[[str], None] | None = None) -> dict[str, Any]:
    """The job: collect the one video or audio item on a captured page, keep it with the capture, and make it a
    recording to transcribe. A capture that already has its media is left as it is."""
    import yt_dlp

    from app.services.documents import store_document

    row = db.get(Capture, capture_id)
    if row is None:
        return {"message": "The capture was deleted", "result": {}}
    if (row.media or {}).get("status") == "collected":
        return {"message": "The media on this page was already collected", "result": {"document_id": row.media_document_id}}
    investigation_id, url = row.investigation_id, row.final_url or row.url
    row.media = {**(row.media or {}), "status": "collecting", "requested_at": utcnow_naive().isoformat()}
    db.commit()
    request_id = record_outbound(db, investigation_id, service=SERVICE, kind="web address", value=url,
                                 reason="Collect the video or audio on this page (one item, logged out)", actor="you",
                                 source={"capture_id": capture_id})
    root = settings.document_storage_dir
    staging = contained_path(resolve_storage_root(root), ".capture-staging", f"{capture_id}-media")
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)

    def progress(state: dict[str, Any]) -> None:
        total = state.get("total_bytes") or state.get("total_bytes_estimate")
        if state.get("status") == "downloading" and total:
            report(5 + int(80 * (state.get("downloaded_bytes") or 0) / total), "Collecting the video or audio")

    report(5, "Looking for the video or audio on the page")
    info: dict[str, Any] | None = None
    reason: str | None = None
    with _Guard(settings.max_media_bytes) as guard:
        options = {"outtmpl": str(staging / "media.%(ext)s"), "noplaylist": True, "playlist_items": "1",
                   "writeinfojson": True, "format": "b", "proxy": guard.url, "max_filesize": settings.max_media_bytes,
                   "socket_timeout": 30, "retries": 1, "quiet": True, "no_warnings": True, "noprogress": True,
                   "logger": _Quiet(), "progress_hooks": [progress], "cachedir": False}
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(url, download=True)
        except yt_dlp.utils.DownloadError as exc:
            reason = _reason(str(exc), guard.refused, guard.over)
        except Exception as exc:  # the downloader itself failed: say so rather than vanish
            logger.exception("media collection failed for capture %s", capture_id)
            reason = f"The downloader failed: {_first_line(exc)}"
        if reason is None and guard.over:
            reason = _reason("", [], True)
    if info and info.get("_type") == "playlist":
        info = (info.get("entries") or [None])[0]
    downloaded = [Path(d["filepath"]) for d in (info or {}).get("requested_downloads") or [] if d.get("filepath")]
    media_file = next((p for p in downloaded if p.is_file()), None)
    if reason is None and (media_file is None or not is_media(media_file.name)):
        reason = "What the page offers is not a video or audio file this app reads"
    if reason is not None:
        mark_outbound_failed(db, request_id)
        shutil.rmtree(staging, ignore_errors=True)
        row = db.get(Capture, capture_id)
        if row is not None:
            row.media = {**(row.media or {}), "status": "failed", "reason": reason, "tool": _tool(), "route": ROUTE}
            db.commit()
        return {"message": reason, "result": {"collected": False}}
    assert media_file is not None and info is not None

    data = media_file.read_bytes()
    about_file = next(iter(staging.glob("*.info.json")), None)
    about = about_file.read_bytes() if about_file else json.dumps(info, default=str).encode("utf-8")
    name = f"media{media_file.suffix.lower()}"
    kept = [{"name": name, "role": "the video or audio as served", "bytes": len(data), "sha256": _sha256(data)},
            {"name": "media.info.json", "role": "what yt-dlp read about it", "bytes": len(about), "sha256": _sha256(about)}]

    # Under the lock deletion takes, and only if the case and the capture are still there, the files join the capture.
    lock_investigation_transaction(db, investigation_id)
    db.expire_all()
    row = db.get(Capture, capture_id)
    if row is None or db.get(Investigation, investigation_id) is None:
        shutil.rmtree(staging, ignore_errors=True)
        db.rollback()
        return {"message": "The case or the capture was deleted while the media was being collected; nothing was kept", "result": {}}
    folder = capture_dir(root, investigation_id, capture_id)
    folder.mkdir(parents=True, exist_ok=True)
    contained_path(folder, name).write_bytes(data)
    contained_path(folder, "media.info.json").write_bytes(about)
    shutil.rmtree(staging, ignore_errors=True)

    title = str(info.get("title") or info.get("fulltitle") or row.displayed.get("title") or "Recording")[:400]
    facts = {"status": "collected", "platform": info.get("extractor_key") or info.get("extractor"), "item_id": info.get("id"),
             "account": info.get("uploader") or info.get("channel") or info.get("uploader_id"), "title": title,
             "uploaded": info.get("upload_date"), "duration": info.get("duration"), "webpage_url": info.get("webpage_url") or url,
             "live_status": info.get("live_status"), "tool": _tool(), "route": ROUTE, "collected_at": utcnow_naive().isoformat()}
    doc = store_document(db, investigation_id=investigation_id, title=title, filename=f"{Path(title).stem[:80] or 'recording'}{media_file.suffix.lower()}",
                         mime_type=media_type(name), data=data, storage_dir=Path(root), parent_document_id=row.document_id,
                         source_metadata={"capture_id": capture_id, "media": facts})
    source = db.get(Source, doc.source_id)
    if source is not None:
        source.source_type, source.url, source.title = "web", str(facts["webpage_url"]), title[:512]
        if facts["account"]:
            source.issuer_or_author = str(facts["account"])[:512]
    row = db.get(Capture, capture_id) or row
    row.files = [*(f for f in row.files or [] if f["name"] not in {name, "media.info.json"}), *kept]
    row.media, row.media_document_id = facts, doc.id
    db.commit()
    if read_document is not None:
        report(90, "Transcribing the recording")
        read_document(doc.id)
    return {"message": f"Collected: {title}", "result": {"collected": True, "document_id": doc.id}}
