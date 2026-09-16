from __future__ import annotations
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


def resolve_storage_root(path: str | Path) -> Path:
    return Path(path).expanduser().resolve()


def contained_path(root: str | Path, *parts: str) -> Path:
    root_path = resolve_storage_root(root)
    candidate = root_path.joinpath(*parts).resolve()
    try:
        candidate.relative_to(root_path)
    except ValueError as exc:
        raise ValueError("Path escapes configured storage root") from exc
    return candidate


def redact_database_url(url: str) -> str:
    """Return a diagnostics-safe DB target without credentials or query secrets."""
    if not url:
        return ""
    if url.startswith("sqlite:"):
        return "sqlite"
    try:
        parsed = urlsplit(url)
    except Exception:
        return "configured"
    host = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    dbname = (parsed.path or "").lstrip("/")
    netloc = f"{host}{port}" if host else ""
    path = f"/{dbname}" if dbname else ""
    return urlunsplit((parsed.scheme, netloc, path, "", "")) or "configured"


def parse_csv(value: str) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]
