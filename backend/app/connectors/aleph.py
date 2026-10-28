import httpx

from app.connectors.base import (
    Connector,
    ExternalFinding,
    KeyCheck,
    key_check_from_status,
)
from app.core.config import settings


class AlephConnector(Connector):
    """Aleph adapter that prefers structured API results and degrades to a reviewable web lead."""

    def __init__(self, api_key: str | None = None):
        self.base_url = settings.aleph_base_url.rstrip("/")
        self.api_key = settings.aleph_api_key if api_key is None else api_key

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict[str, str]:
        headers = {"User-Agent": "JournalismWorkbench/0.41"}
        if self.api_key:
            headers["Authorization"] = f"ApiKey {self.api_key}"
        return headers

    async def check_key(self) -> KeyCheck:
        """GET /api/2/notifications?limit=0: it answers only a signed-in key (403 otherwise) and sends no search terms.
        (/api/2/metadata cannot tell: OpenAleph answers it for a bad key too, as an anonymous user.)"""
        if not self.api_key:
            return KeyCheck("no_key", "No key saved: public collections only.")
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(f"{self.base_url}/api/2/notifications", params={"limit": 0}, headers=self._headers())
        return key_check_from_status(resp.status_code)

    def _parse_result(self, item: dict) -> ExternalFinding:
        schema = item.get("schema")
        props = item.get("properties") or {}
        caption = (
            item.get("caption")
            or (props.get("name") or [None])[0]
            or item.get("id")
            or "Aleph entity"
        )
        record_id = str(item.get("id") or item.get("entity_id") or caption)
        url = item.get("url") or f"{self.base_url}/entities/{record_id}"
        return ExternalFinding(
            provider="aleph",
            record_id=record_id,
            caption=str(caption),
            schema=schema,
            url=url,
            properties=props,
            raw=item,
        )

    async def search(self, query: str) -> list[ExternalFinding]:
        """Search Aleph's JSON API. Any failure raises; nothing is invented.

        An earlier version fell back to the HTML /search page and reported "found
        something" whenever that page loaded, which made a rate-limited or
        unauthorised API look like a hit. An empty result list is a real answer;
        a network error, an error status or a non-JSON reply is a failure the
        connector run records.
        """
        headers = self._headers()
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(
                f"{self.base_url}/api/2/search",
                params={"q": query},
                headers=headers,
            )
            resp.raise_for_status()
            if "json" not in resp.headers.get("content-type", ""):
                raise ValueError("Aleph did not return JSON")
            payload = resp.json()
            items = payload.get("results") or payload.get("entities") or []
            if not isinstance(items, list):
                raise ValueError("Aleph returned an unexpected result shape")
            return [self._parse_result(item) for item in items]
