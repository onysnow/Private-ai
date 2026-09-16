import httpx
from app.core.config import settings
from app.connectors.base import Connector, ExternalFinding

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

    def _parse_result(self, item: dict) -> ExternalFinding:
        schema = item.get("schema")
        props = item.get("properties") or {}
        caption = item.get("caption") or (props.get("name") or [None])[0] or item.get("id") or "Aleph entity"
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
        headers = self._headers()
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            try:
                resp = await client.get(f"{self.base_url}/api/2/search", params={"q": query}, headers=headers)
                if resp.is_success and "json" in resp.headers.get("content-type", ""):
                    payload = resp.json()
                    items = payload.get("results") or payload.get("entities") or []
                    if isinstance(items, list) and items:
                        return [self._parse_result(item) for item in items]
            except (httpx.HTTPError, ValueError, TypeError):
                pass

            resp = await client.get(f"{self.base_url}/search", params={"q": query}, headers=headers)
            resp.raise_for_status()
            return [ExternalFinding(
                provider="aleph",
                record_id=f"search:{query}",
                caption=f"Aleph search: {query}",
                schema=None,
                url=str(resp.url),
                properties={"http_status": [str(resp.status_code)]},
                raw={"fallback": True, "query": query},
            )]
