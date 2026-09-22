"""Connector provider registry.

Each entry in CONNECTOR_SPECS is the single place a connector provider is
registered: its class, and the Settings attribute holding its fallback API
key (used when no per-provider credential has been stored via
app/services/settings.py's save_connector_credential). Adding a new
connector -- Firecrawl, or anything else -- means adding one entry here and
a Connector subclass, not another branch in an if/elif chain (STRUCT-0022).

app/services/settings.py's CONNECTOR_PROVIDERS and connector_credential_status
both derive from this same table so the provider list and its per-provider
fallback-key lookup can't drift out of sync with what's actually registered
here.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from app.connectors.aleph import AlephConnector
from app.connectors.base import Connector
from app.connectors.firecrawl import FirecrawlConnector
from app.connectors.opensanctions import OpenSanctionsConnector
from app.core.config import settings
from app.services.credentials import get_secret


@dataclass(frozen=True)
class ConnectorSpec:
    """Declarative registration for one connector provider."""

    factory: Callable[[str], Connector]
    default_setting: str  # attribute name on Settings holding the fallback key


CONNECTOR_SPECS: dict[str, ConnectorSpec] = {
    "aleph": ConnectorSpec(
        factory=lambda key: AlephConnector(api_key=key),
        default_setting="aleph_api_key",
    ),
    "opensanctions": ConnectorSpec(
        factory=lambda key: OpenSanctionsConnector(api_key=key),
        default_setting="opensanctions_api_key",
    ),
    "firecrawl": ConnectorSpec(
        factory=lambda key: FirecrawlConnector(api_key=key),
        default_setting="firecrawl_api_key",
    ),
}


class ConnectorRegistry:
    def __init__(self) -> None:
        self._connectors: dict[str, Connector] = {}
        self.refresh()

    def _build(self, name: str) -> Any:
        spec = CONNECTOR_SPECS.get(name)
        if spec is None:
            return None
        key = get_secret(settings.connector_credentials_file, name, getattr(settings, spec.default_setting))
        return spec.factory(key)

    def refresh(self, name: str | None = None) -> None:
        names = [name] if name else list(CONNECTOR_SPECS)
        for provider in names:
            connector = self._build(provider)
            if connector is None:
                raise ValueError("Unknown connector")
            self._connectors[provider] = connector

    def names(self) -> list[str]:
        return sorted(self._connectors)

    def get(self, name: str) -> Any:
        return self._connectors.get(name)

    def register(self, name: str, connector: Connector) -> None:
        self._connectors[name] = connector


registry = ConnectorRegistry()
