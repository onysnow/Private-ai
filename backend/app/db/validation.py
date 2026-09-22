from __future__ import annotations

from sqlalchemy import String, event, inspect
from typing import Iterator
from sqlalchemy.orm import Session


def _iter_string_limits(obj: object) -> Iterator[tuple[str, int]]:
    state = inspect(obj)
    assert state is not None
    mapper = state.mapper
    for attr in mapper.column_attrs:
        if not attr.columns:
            continue
        column = attr.columns[0]
        column_type = column.type
        if not isinstance(column_type, String) or column_type.length is None:
            continue
        yield attr.key, int(column_type.length)


def validate_modeled_string_lengths(session: Session) -> None:
    """Make SQLite/dev writes obey the same VARCHAR(n) limits PostgreSQL enforces.

    SQLite generally ignores VARCHAR length declarations. Without an application-side guard,
    local tests can accept data that PostgreSQL later rejects with StringDataRightTruncation.
    Keep the model declaration as the single source of truth and validate every ORM flush.
    """
    candidates = set(session.new).union(session.dirty)
    for obj in candidates:
        state = inspect(obj)
        if not state.mapper:
            continue
        for attr_name, limit in _iter_string_limits(obj):
            value = getattr(obj, attr_name, None)
            if isinstance(value, str) and len(value) > limit:
                model_name = obj.__class__.__name__
                raise ValueError(
                    f"{model_name}.{attr_name} exceeds VARCHAR({limit}) limit "
                    f"({len(value)} characters)"
                )


@event.listens_for(Session, "before_flush")
def _enforce_modeled_string_lengths(session: Session, flush_context: object, instances: object) -> None:
    validate_modeled_string_lengths(session)
