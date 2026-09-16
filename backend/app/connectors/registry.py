from app.connectors.aleph import AlephConnector
from app.connectors.opensanctions import OpenSanctionsConnector
from app.core.config import settings
from app.services.credentials import get_secret


class ConnectorRegistry:
    def __init__(self):
        self._connectors = {}
        self.refresh()

    def _build(self, name: str):
        if name == "aleph":
            key = get_secret(settings.connector_credentials_file, "aleph", settings.aleph_api_key)
            return AlephConnector(api_key=key)
        if name == "opensanctions":
            key = get_secret(settings.connector_credentials_file, "opensanctions", settings.opensanctions_api_key)
            return OpenSanctionsConnector(api_key=key)
        return None

    def refresh(self, name: str | None = None) -> None:
        names = [name] if name else ["aleph", "opensanctions"]
        for provider in names:
            connector = self._build(provider)
            if connector is None:
                raise ValueError("Unknown connector")
            self._connectors[provider] = connector

    def names(self) -> list[str]:
        return sorted(self._connectors)

    def get(self, name: str):
        return self._connectors.get(name)

    def register(self, name: str, connector) -> None:
        self._connectors[name] = connector


registry = ConnectorRegistry()
