"""Effective configuration with provenance for any pydantic-settings object:
value (secrets masked), where it came from (environment / env file / default),
the default, whether it is documented in the example file."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from pydantic import SecretStr
from pydantic_settings import BaseSettings

from opsconsole.config import Limits


def _read_env_file(path: Path | None) -> dict[str, str]:
    out: dict[str, str] = {}
    if path is None or not path.exists():
        return out
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if line.startswith("export "):
            line = line[7:]
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip().upper()] = v.strip().strip("'\"")
    return out


def _mask(value: Any) -> str:
    s = value.get_secret_value() if isinstance(value, SecretStr) else str(value)
    if not s:
        return ""
    return "••••••" + s[-4:] if len(s) > 8 else "••••••"


def effective_config(settings: BaseSettings, *, env_file: Path | None, example_file: Path | None, limits: Limits, mutable: set[str]) -> dict[str, Any]:
    dotenv = _read_env_file(env_file)
    documented = set(_read_env_file(example_file)) if example_file else set()
    prefix = str(settings.model_config.get("env_prefix") or "").upper()
    rows: list[dict[str, Any]] = []
    for name, field in type(settings).model_fields.items():
        key = prefix + name.upper()
        value = getattr(settings, name)
        secret = isinstance(value, SecretStr) or limits.is_secret(name)
        default = field.default if field.default_factory is None else "(factory)"
        if key in os.environ:
            source = "environment"
        elif key in dotenv:
            source = "env_file"
        else:
            source = "default"
        rows.append({
            "name": key, "field": name, "value": _mask(value) if secret else _plain(value), "secret": secret, "source": source,
            "default": "(secret)" if (secret and default) else _plain(default), "is_default": value == field.default,
            "documented": (key in documented) if example_file else None, "mutable": name in mutable,
            "type": getattr(field.annotation, "__name__", str(field.annotation)), "description": field.description,
        })
    known = {r["name"] for r in rows}
    return {
        "env_file": str(env_file) if env_file and env_file.exists() else None,
        "example_file": str(example_file) if example_file and example_file.exists() else None,
        "rows": rows,
        "undocumented": sorted(r["name"] for r in rows if r["documented"] is False),
        "unknown_in_env_file": sorted(k for k in dotenv if k not in known),
    }


def _plain(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_plain(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    return str(value)


def set_flag(settings: BaseSettings, name: str, value: Any, *, mutable: set[str]) -> dict[str, Any]:
    if name not in mutable:
        raise PermissionError(f"{name} is not a runtime-mutable setting")
    field = type(settings).model_fields[name]
    before = getattr(settings, name)
    annotation = field.annotation
    coerced: Any = value
    if annotation is bool:
        if isinstance(value, str):
            coerced = value.lower() in ("1", "true", "yes", "on")
        else:
            coerced = bool(value)
    elif annotation is int:
        coerced = int(value)
    elif annotation is float:
        coerced = float(value)
    elif annotation is str:
        coerced = str(value)
    object.__setattr__(settings, name, coerced)
    return {"name": name, "before": _plain(before), "after": _plain(coerced)}
