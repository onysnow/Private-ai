import hashlib

try:
    from followthemoney import model as ftm_model
except ImportError:  # Local bootstrap/test compatibility; production requirements still install FollowTheMoney.
    ftm_model = None

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
