"""What a document is and what language it is in (BACKLOG "Documents have no kind or language field"; DECISIONS_LOG 37).

Each is filled where the app already knows it, and records how it was set:

* ``reader``: from the file itself, as it was saved or read (its type: an email, a spreadsheet, a recording, a picture,
  a captured web page; what OpenAleph read it as).
* ``source``: as the record it came with states it (a source's ``metadata_json`` ``kind`` and ``language``, as the
  demo cases carry them).
* ``detected``: worked out from its text or sound by a tool (OpenAleph's language detection, faster-whisper's for a
  recording, py3langid's for any other text: ADR-0027), with how sure the tool was.
* ``person``: a person set it (the Library pane or the reading room). A person's value is never replaced by the
  machine; a source's is not replaced by a detection.

A language is kept as its ISO 639-1 code (the primary subtag of a BCP-47 tag, ``en``, ``fr``, ``ms``); a language
with no two-letter code keeps its ISO 639-3 one.
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any, Iterable, Literal, get_args

from app.models.documents import Document

logger = logging.getLogger(__name__)

DocumentKind = Literal["court_filing", "judgment", "official_record", "article", "press_release", "email", "social_post",
                       "spreadsheet", "recording", "photo", "web_capture", "other"]
DOCUMENT_KINDS: tuple[str, ...] = get_args(DocumentKind)
SetBy = Literal["reader", "source", "detected", "person"]
SET_BY: tuple[str, ...] = get_args(SetBy)

# The kinds the demo cases' records name (backend/app/demo/*), and other common words for them, as the app's kinds.
# A word that names a file's format rather than what it is (docx, archive) gives no kind.
KIND_WORDS: dict[str, str] = {
    "court_filing": "court_filing", "complaint": "court_filing", "indictment": "court_filing", "plea": "court_filing",
    "filing": "court_filing", "motion": "court_filing", "affidavit": "court_filing", "pleading": "court_filing",
    "judgment": "judgment", "judgement": "judgment", "order": "judgment", "ruling": "judgment", "verdict": "judgment",
    "official_record": "official_record", "registry": "official_record", "register": "official_record",
    "regulatory_notice": "official_record", "notice": "official_record", "gazette": "official_record",
    "article": "article", "news": "article",
    "press_release": "press_release", "statement": "press_release",
    "email": "email", "e-mail": "email",
    "social": "social_post", "social_post": "social_post", "post": "social_post", "tweet": "social_post",
    "spreadsheet": "spreadsheet", "table": "spreadsheet",
    "audio": "recording", "video": "recording", "recording": "recording", "podcast": "recording",
    "photo": "photo", "picture": "photo", "image": "photo",
    "web_page": "web_capture", "web_capture": "web_capture", "webpage": "web_capture", "capture": "web_capture",
    "other": "other",
}

_EMAIL = {".eml", ".msg", ".emlx"}
_TABLE = {".csv", ".tsv", ".xls", ".xlsx", ".ods"}
_PICTURE = {".jpg", ".jpeg", ".png", ".gif", ".tif", ".tiff", ".webp", ".heic", ".heif", ".bmp", ".dng", ".cr2", ".nef", ".arw"}
_RECORDING = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".flac", ".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi"}
_WEB = {".html", ".htm", ".mhtml", ".warc"}

# How firmly each way of setting a value holds: a later value replaces it only when it holds at least as firmly.
_RANK = {"detected": 1, "reader": 1, "source": 2, "person": 3}

# Below this a detection is not kept: the document's language stays not known.
MIN_CONFIDENCE = 0.8
# Fewer letters than this is too little text to tell a language by.
MIN_LETTERS = 40
DETECTOR = "py3langid"


def kind_word(value: Any) -> str | None:
    """The app's kind for a word a record uses (``complaint`` is a court filing), or None."""
    if not isinstance(value, str):
        return None
    return KIND_WORDS.get(value.strip().lower().replace(" ", "_"))


def kind_from_file(filename: str | None, mime_type: str | None = None, *, openaleph_schema: str | None = None,
                   capture: bool = False) -> str | None:
    """What the file's type says it is; None when its type says nothing about it (a PDF can be anything)."""
    ext = Path(filename or "").suffix.lower()
    mime = (mime_type or "").lower()
    if capture:
        return "web_capture"
    if ext in _EMAIL or mime == "message/rfc822" or openaleph_schema == "Email":
        return "email"
    if ext in _TABLE or openaleph_schema == "Table":
        return "spreadsheet"
    if ext in _RECORDING or mime.startswith(("audio/", "video/")) or openaleph_schema in ("Audio", "Video"):
        return "recording"
    if ext in _PICTURE or mime.startswith("image/") or openaleph_schema == "Image":
        return "photo"
    if ext in _WEB or mime == "text/html" or openaleph_schema == "HyperText":
        return "web_capture"
    return None


def language_code(value: Any) -> str | None:
    """A language as the app keeps it: ``en`` for ``en``, ``EN-gb``, ``eng`` or ``English``; None when it is not a
    language."""
    if not isinstance(value, str) or not value.strip():
        return None
    from rigour.langs import iso_639_alpha2, iso_639_alpha3

    raw = value.strip().replace("_", "-").split("-")[0].lower()
    alpha3 = iso_639_alpha3(raw)
    if alpha3 is None:
        from followthemoney.types import registry

        alpha3 = registry.language.clean(value.strip())
    if alpha3 is None:
        return None
    return iso_639_alpha2(alpha3) or alpha3


def language_name(code: str | None) -> str | None:
    """The English name of a kept language code."""
    if not code:
        return None
    from followthemoney.types import registry
    from rigour.langs import iso_639_alpha3

    alpha3 = iso_639_alpha3(code) or code
    return registry.language.caption(alpha3) or code


def _holds(current: str | None, by: str) -> bool:
    """Whether a value set ``by`` may replace one set ``current``."""
    return current is None or _RANK.get(by, 0) >= _RANK.get(current, 0)


def set_kind(doc: Document, kind: str | None, by: str, who: str | None = None) -> bool:
    """Set the document's kind, unless what is there holds more firmly. A person may clear it. Returns whether it
    changed."""
    if by not in SET_BY or (kind is not None and kind not in DOCUMENT_KINDS) or (kind is None and by != "person"):
        return False
    if not _holds(doc.kind_set_by, by):
        return False
    doc.kind, doc.kind_set_by, doc.kind_by = kind, by, who
    return True


def set_language(doc: Document, code: str | None, by: str, *, who: str | None = None, confidence: float | None = None) -> bool:
    """Set the document's language, unless what is there holds more firmly. A person may clear it."""
    clean = language_code(code) if code is not None else None
    if by not in SET_BY or (code is not None and clean is None) or (clean is None and by != "person"):
        return False
    if not _holds(doc.language_set_by, by):
        return False
    doc.language, doc.language_set_by, doc.language_by = clean, by, who
    doc.language_confidence = round(float(confidence), 3) if confidence is not None else None
    return True


def fill_at_intake(doc: Document, source_metadata: dict[str, Any] | None) -> None:
    """At saving: the kind and language the record it came with states, else the kind its file type gives."""
    meta = source_metadata or {}
    stated = kind_word(meta.get("kind"))
    if stated:
        set_kind(doc, stated, "source")
    else:
        found = kind_from_file(doc.filename, doc.mime_type, capture=bool(meta.get("capture_id")))
        if found:
            set_kind(doc, found, "reader")
    if language_code(meta.get("language")):
        set_language(doc, meta["language"], "source")


_identifier: Any = None
_identifier_lock = threading.Lock()


def _detector() -> Any:
    global _identifier
    with _identifier_lock:
        if _identifier is None:
            from py3langid.langid import MODEL_FILE, LanguageIdentifier

            found = LanguageIdentifier.from_model_file(MODEL_FILE, norm_probs=True)
            # Only languages with a two-letter code: the model's few others are dialects and old languages that a case's
            # text is far likelier to be mistaken for than written in.
            found.set_languages([code for code in found.labels if len(code) == 2])
            _identifier = found
        return _identifier


def detect_language(texts: Iterable[str], *, limit: int = 20000) -> tuple[str, float] | None:
    """The language most of the text is in, and how sure the detector is (0-1); None for too little text, a detector
    that is not installed, or one that is not sure enough."""
    sample = ""
    for text in texts:
        sample += (text or "") + "\n"
        if len(sample) >= limit:
            break
    sample = sample[:limit]
    if sum(ch.isalpha() for ch in sample) < MIN_LETTERS:
        return None
    try:
        code, probability = _detector().classify(sample)
    except ImportError:
        logger.warning("py3langid is not installed: no language is detected")
        return None
    if float(probability) < MIN_CONFIDENCE:
        return None
    return str(code), float(probability)


def fill_from_text(doc: Document, texts: Iterable[str]) -> None:
    """After reading: the language detected in the text, unless a firmer value is there."""
    if not _holds(doc.language_set_by, "detected"):
        return
    found = detect_language(texts)
    if found:
        set_language(doc, found[0], "detected", who=DETECTOR, confidence=found[1])


def describe(doc: Document) -> dict[str, Any]:
    """The fields the API sends with a document."""
    return {"kind": doc.kind, "kind_set_by": doc.kind_set_by, "kind_by": doc.kind_by,
            "language": doc.language, "language_name": language_name(doc.language), "language_set_by": doc.language_set_by,
            "language_by": doc.language_by, "language_confidence": doc.language_confidence}
