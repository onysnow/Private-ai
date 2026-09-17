"""UTC timestamp helpers.

Database columns are currently timezone-naive for compatibility with the initial
Alembic schema. Generate UTC values using the modern timezone-aware API, then
strip tzinfo at the persistence boundary until a future migration promotes the
columns to ``TIMESTAMP WITH TIME ZONE`` on PostgreSQL.
"""

from datetime import UTC, datetime


def utcnow_naive() -> datetime:
    """Return the current UTC time as a naive datetime for existing DB columns."""
    return datetime.now(UTC).replace(tzinfo=None)


def utcnow_iso() -> str:
    """Return an RFC 3339 UTC timestamp suitable for manifests/API metadata."""
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
