from datetime import datetime

from app.core.time import utcnow_iso, utcnow_naive


def test_utcnow_naive_preserves_existing_db_contract():
    value = utcnow_naive()
    assert isinstance(value, datetime)
    assert value.tzinfo is None


def test_utcnow_iso_is_explicit_utc_rfc3339():
    value = utcnow_iso()
    assert value.endswith('Z')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    assert parsed.utcoffset().total_seconds() == 0
