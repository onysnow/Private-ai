from __future__ import annotations

import json
import os
import stat
import tempfile
from pathlib import Path


def _supported_connectors() -> set[str]:
    # Deferred import: app.connectors.registry imports get_secret from this
    # module, so importing it back at module load time would be circular.
    # Deriving from CONNECTOR_SPECS here (rather than a hardcoded set) keeps
    # this the same single source of truth as CONNECTOR_PROVIDERS and
    # connector_credential_status in app/services/settings.py (STRUCT-0022) --
    # this was a third, previously-missed hardcoded provider list that would
    # have made get_secret("firecrawl", ...) raise ValueError at registry
    # build time.
    from app.connectors.registry import CONNECTOR_SPECS

    return set(CONNECTOR_SPECS)


def _validate_provider(provider: str) -> str:
    provider = (provider or "").strip().lower()
    if provider not in _supported_connectors():
        raise ValueError("Unsupported connector credential")
    return provider


def _path(path: str | Path) -> Path:
    return Path(path).expanduser().resolve()


def _read(path: str | Path) -> dict[str, str]:
    target = _path(path)
    if not target.exists():
        return {}
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError("Connector credential store is unreadable") from exc
    if not isinstance(data, dict):
        raise RuntimeError("Connector credential store has invalid format")
    supported = _supported_connectors()
    result: dict[str, str] = {}
    for key, value in data.items():
        if key in supported and isinstance(value, str) and value:
            result[key] = value
    return result


def _restrict_permissions(path: Path) -> None:
    # POSIX: owner read/write only. On Windows chmod still removes broad write bits
    # from Python's view; the app remains localhost-only until auth is implemented.
    try:
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError as exc:
        raise RuntimeError("Could not restrict connector credential file permissions") from exc


def _write(path: str | Path, values: dict[str, str]) -> None:
    target = _path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(target.parent, stat.S_IRWXU)
    except OSError:
        pass
    fd, temp_name = tempfile.mkstemp(prefix=".credentials-", suffix=".tmp", dir=target.parent)
    temp = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(values, handle, separators=(",", ":"), sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        _restrict_permissions(temp)
        os.replace(temp, target)
        _restrict_permissions(target)
    finally:
        if temp.exists():
            temp.unlink(missing_ok=True)


def set_secret(path: str | Path, provider: str, secret: str) -> None:
    provider = _validate_provider(provider)
    secret = (secret or "").strip()
    if not secret:
        raise ValueError("Credential cannot be blank")
    values = _read(path)
    values[provider] = secret
    _write(path, values)


def remove_secret(path: str | Path, provider: str) -> bool:
    provider = _validate_provider(provider)
    values = _read(path)
    existed = provider in values
    values.pop(provider, None)
    target = _path(path)
    if values:
        _write(target, values)
    elif target.exists():
        target.unlink()
    return existed


def get_secret(path: str | Path, provider: str, fallback: str = "") -> str:
    provider = _validate_provider(provider)
    return _read(path).get(provider) or fallback or ""


def credential_status(path: str | Path, provider: str, fallback: str = "") -> dict:
    provider = _validate_provider(provider)
    target = _path(path)
    values = _read(target)
    local = bool(values.get(provider))
    configured = local or bool(fallback)
    mode = None
    if target.exists() and os.name != "nt":
        mode = stat.S_IMODE(target.stat().st_mode)
    return {
        "configured": configured,
        "source": "local_store" if local else ("environment" if fallback else "none"),
        "local_store_present": local,
        "permissions_restricted": mode == 0o600 if mode is not None else (target.exists() if os.name == "nt" else True),
        "storage_protection": "owner_permissions",
    }
