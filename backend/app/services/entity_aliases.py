from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.domain import Entity


def resolve_active_entity(db: Session, entity: Entity | None) -> tuple[Entity | None, list[Entity]]:
    """Follow merged aliases to the surviving canonical entity without deleting history.

    Returns ``(active_entity, alias_chain)`` where ``alias_chain`` contains every merged
    record traversed in order. Cycles and broken references are treated as invalid state.
    """
    if entity is None:
        return None, []
    current = entity
    chain: list[Entity] = []
    seen: set[str] = set()
    while current.merged_into_entity_id:
        if current.id in seen:
            raise ValueError("Entity merge alias cycle detected")
        seen.add(current.id)
        chain.append(current)
        target = db.get(Entity, current.merged_into_entity_id)
        if target is None:
            raise ValueError("Merged entity points to a missing canonical target")
        if target.investigation_id != entity.investigation_id:
            raise ValueError("Merged entity points outside its investigation")
        current = target
    return current, chain


def entity_alias_payload(entity: Entity, active: Entity, chain: list[Entity]) -> dict | None:
    if not chain:
        return None
    return {
        "requested_entity_id": entity.id,
        "requested_caption": entity.caption,
        "active_entity_id": active.id,
        "active_caption": active.caption,
        "alias_chain": [
            {"id": row.id, "caption": row.caption, "merged_into_entity_id": row.merged_into_entity_id}
            for row in chain
        ],
    }
