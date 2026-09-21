import hashlib
from typing import Any

# Declared Any up front (rather than left for mypy to infer from the try-import below) so the
# ImportError fallback doesn't collide with the imported `model` singleton's own concrete type --
# without this, mypy infers `ftm_model: Model` from the try branch alone, which makes the except
# branch's `ftm_model = None` an "incompatible types in assignment" error and, worse, makes every
# `if ftm_model is not None:` guard below look permanently true, flagging the None-fallback branches
# in _schema_exists/_supports_name as unreachable dead code -- a real (if currently harmless, since
# mypy doesn't gate runtime) mistracking of this module's own documented bootstrap/test fallback.
# Importing straight into the annotated name is a trap: mypy reports no-redef only when
# followthemoney is NOT installed (the import resolves to Any under ignore_missing_imports
# and rebinding an annotated name is flagged), and with warn_unused_ignores=true a
# `# type: ignore[no-redef]` on that line then fails lint wherever followthemoney IS
# installed (Backend Lint CI installs requirements-local -> requirements.txt). Importing under
# a private alias and assigning in `else:` is clean in both environments (checked both ways).
ftm_model: Any = None
try:
    from followthemoney import model as _imported_ftm_model
except ImportError:  # Local bootstrap/test compatibility; production requirements still install FollowTheMoney.
    pass
else:
    ftm_model = _imported_ftm_model

_FALLBACK_SCHEMAS = {
    "Person", "Company", "Organization", "PublicBody", "LegalEntity", "Asset",
    "RealEstate", "Address", "Contract", "CourtCase", "Project", "Event", "Vehicle",
    "Ownership", "Directorship", "Membership", "Employment", "UnknownLink",
}

def _schema_exists(schema: str) -> bool:
    if ftm_model is not None:
        return ftm_model.get(schema) is not None
    return schema in _FALLBACK_SCHEMAS

def _supports_name(schema: str) -> bool:
    if ftm_model is not None:
        schema_obj = ftm_model.get(schema)
        return schema_obj is not None and "name" in schema_obj.properties
    return schema not in {"Address", "Ownership", "Directorship", "Membership", "Employment", "UnknownLink"}

def make_ftm_entity(schema: str, caption: str, properties: dict[str, list[str]]) -> dict:
    if not _schema_exists(schema):
        raise ValueError(f"Unknown FollowTheMoney schema: {schema}")
    props = {k: list(v) for k, v in properties.items()}
    if _supports_name(schema) and not props.get("name"):
        props["name"] = [caption]
    raw = f"{schema}|{caption}|{sorted((k, tuple(v)) for k, v in props.items())}"
    ftm_id = hashlib.sha1(raw.encode("utf-8")).hexdigest()
    return {"id": ftm_id, "schema": schema, "properties": props}
