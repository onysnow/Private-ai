"""Which files an upload accepts, for the reader that will read them (ADR-0006).

While OpenAleph reads uploads (``reading_with_openaleph``), every file
ingest-file would read is accepted, and so is everything the Workbench's own
reader reads. Without OpenAleph only the Workbench's own reader's formats
are accepted. Whether ingest-file reads a file is decided the way its
``Manager.auction`` decides it, from the ingestors listed in
app/services/openaleph_formats.py (generated from the ingest-file image):
each ingestor claims the file by its MIME type or by its file-name
extension (both normalised with rigour, as ``Ingestor.match`` does), and
the highest score wins; when that is ``IgnoreIngestor``, OpenAleph would
store the file without reading it. OpenAleph itself asks libmagic for the
MIME type; an upload only has the type the browser sent, so the check
goes by that and the extension.

The size limit stays MAX_DOCUMENT_BYTES whichever reader reads the file.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from rigour.mime import normalize_extension, normalize_mimetype

from app.core.config import settings
from app.services import openaleph_formats
from app.services.documents import SUPPORTED_EXTENSIONS
from app.services.openaleph_reader import reading_with_openaleph

# The Workbench's own reader (documents.extract_chunks), without the dots.
LOCAL_EXTENSIONS = frozenset(ext.lstrip(".") for ext in SUPPORTED_EXTENSIONS)
# What browsers send for a file whose type they do not know: it says nothing.
UNKNOWN_MIME_TYPES = frozenset({"application/octet-stream"})


class UnsupportedFormat(ValueError):
    """The configured reader cannot read this kind of file; the message
    says so in plain words."""


@dataclass(frozen=True)
class FileKind:
    extension: str | None      # lower-case, without the dot
    mime_type: str | None      # normalised; None when unknown


def kind_of(filename: str | None, mime_type: str | None) -> FileKind:
    # A type rigour cannot make sense of comes back as application/octet-stream,
    # which says nothing, like a missing one.
    mime = normalize_mimetype(mime_type) if mime_type else None
    return FileKind(extension=normalize_extension(filename) if filename else None,
                    mime_type=mime if mime not in UNKNOWN_MIME_TYPES else None)


def readable_locally(filename: str | None) -> bool:
    """The Workbench's own reader goes by the extension alone (documents.py)."""
    extension = kind_of(filename, None).extension
    return extension is not None and extension in LOCAL_EXTENSIONS


def openaleph_ingestor(kind: FileKind) -> str | None:
    """The ingestor ingest-file's ``Manager.auction`` gives this kind of file:
    the first one with the highest score above zero that claims its MIME
    type or its extension; None when none claims it."""
    best_score, best = 0, None
    for name, score, mime_types, extensions in openaleph_formats.INGESTORS:
        claims = (kind.mime_type is not None and kind.mime_type in mime_types) or (
            kind.extension is not None and kind.extension in extensions)
        if claims and score > best_score:
            best_score, best = score, name
    return best


def readable_by_openaleph(filename: str | None, mime_type: str | None) -> bool:
    return openaleph_ingestor(kind_of(filename, mime_type)) not in (None, openaleph_formats.IGNORE)


def needs_openaleph(filename: str | None) -> bool:
    """Only OpenAleph can read this file: the Workbench's own reader cannot."""
    return not readable_locally(filename)


def _named(kind: FileKind) -> str:
    if kind.extension:
        return f".{kind.extension} files"
    return f"{kind.mime_type} files" if kind.mime_type else "files without an extension"


def check_upload(filename: str | None, mime_type: str | None) -> None:
    """Raise UnsupportedFormat unless the configured reader can read the file."""
    if readable_locally(filename):
        return
    kind = kind_of(filename, mime_type)
    if reading_with_openaleph():
        if readable_by_openaleph(filename, mime_type):
            return
        raise UnsupportedFormat(f"OpenAleph cannot read {_named(kind)}, so this file was not uploaded.")
    local = ", ".join(f".{ext}" for ext in sorted(LOCAL_EXTENSIONS))
    hint = (" OpenAleph reads them, but this deployment does not read uploads with OpenAleph."
            if readable_by_openaleph(filename, mime_type) else "")
    raise UnsupportedFormat(f"The Workbench's own reader reads {local} files; it cannot read {_named(kind)}, "
                            f"so this file was not uploaded.{hint}")


def accepted_formats() -> dict[str, Any]:
    """The formats an upload accepts now, and the file pickers' ``accept``."""
    with_openaleph = reading_with_openaleph()
    extensions = set(LOCAL_EXTENSIONS) | (set(openaleph_formats.EXTENSIONS) if with_openaleph else set())
    mime_types = set(openaleph_formats.MIME_TYPES) if with_openaleph else set()
    return {
        "reader": "openaleph" if with_openaleph else "workbench",
        "extensions": sorted(extensions),
        "mime_types": sorted(mime_types),
        "openaleph_only_extensions": sorted(extensions - LOCAL_EXTENSIONS),
        "accept": ",".join([*(f".{ext}" for ext in sorted(extensions)), *sorted(mime_types)]),
        "max_bytes": settings.max_document_bytes,
        "ingest_file_image": openaleph_formats.INGEST_FILE_IMAGE if with_openaleph else None,
    }
