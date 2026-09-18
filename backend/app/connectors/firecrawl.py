import httpx

from app.connectors.base import Connector, ExternalFinding
from app.core.config import settings


class FirecrawlConnector(Connector):
    """Firecrawl web-search adapter.

    Unlike the Aleph and OpenSanctions connectors, Firecrawl's /v2/search
    endpoint is explicitly documented as usable without an API key (at a
    lower, shared rate limit), so this connector does not hard-require a
    key via _require_key(). `configured` still reports whether a key is
    set, for the settings/credential-status UI, but search() and enrich()
    work either way.
    """

    def __init__(self, api_key: str | None = None):
        self.base_url = settings.firecrawl_base_url.rstrip("/")
        self.api_key = settings.firecrawl_api_key if api_key is None else api_key
        self.limit = max(1, min(settings.firecrawl_search_limit, 50))

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict[str, str]:
        headers = {"User-Agent": "JournalismWorkbench/0.12"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _parse_result(self, item: dict) -> ExternalFinding:
        url = item.get("url") or ""
        title = item.get("title") or url or "Firecrawl result"
        description = item.get("description") or ""
        return ExternalFinding(
            provider="firecrawl",
            record_id=url or title,
            caption=str(title),
            schema=None,
            url=url or None,
            properties={"description": [description]} if description else {},
            raw=dict(item),
        )

    async def search(self, query: str) -> list[ExternalFinding]:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.post(
                f"{self.base_url}/v2/search",
                json={"query": query, "limit": self.limit},
                headers=self._headers(),
            )
            resp.raise_for_status()
            payload = resp.json()
            data = payload.get("data") or {}
            items = data.get("web") or []
            if not isinstance(items, list):
                return []
            return [self._parse_result(item) for item in items]
