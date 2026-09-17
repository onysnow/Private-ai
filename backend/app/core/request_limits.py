from __future__ import annotations

from dataclasses import dataclass


class RequestBodyTooLarge(RuntimeError):
    pass


@dataclass(frozen=True)
class RequestLimitPolicy:
    default_bytes: int
    document_bytes: int
    backup_bytes: int

    def for_path(self, path: str) -> int:
        if path.startswith("/api/documents/upload"):
            return self.document_bytes
        if path.startswith("/api/backups/"):
            return self.backup_bytes
        return self.default_bytes


def validate_content_length(value: str | None, limit: int) -> tuple[bool, str]:
    """Validate Content-Length without reading the request body."""
    if value is None or value == "":
        return True, ""
    try:
        length = int(value)
    except (TypeError, ValueError):
        return False, "Invalid Content-Length header."
    if length < 0:
        return False, "Invalid Content-Length header."
    if length > limit:
        return False, f"Request body exceeds the {limit}-byte limit for this endpoint."
    return True, ""



def validate_request_envelope(
    *,
    method: str,
    content_length: str | None,
    content_type: str | None,
    transfer_encoding: str | None,
    limit: int,
) -> tuple[bool, int, str]:
    """Validate body framing before FastAPI parses an unsafe API request.

    Unknown-length/chunked request bodies are rejected for unsafe methods so a
    streaming client cannot bypass the early byte ceiling. Bodyless unsafe actions
    remain allowed when neither Content-Type nor Transfer-Encoding indicates a body.
    """
    method = method.upper()
    may_have_body = method not in {"GET", "HEAD", "OPTIONS"}
    has_body_signal = bool((content_type or "").strip() or (transfer_encoding or "").strip())
    if may_have_body and has_body_signal and content_length is None:
        return False, 411, "Content-Length is required for API requests with a body."
    ok, detail = validate_content_length(content_length, limit)
    if ok:
        return True, 200, ""
    status = 400 if detail.startswith("Invalid") else 413
    return False, status, detail
