import httpx

from app.connectors.base import (
    Connector,
    ExternalFinding,
    KeyCheck,
    key_check_from_status,
)
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

    async def check_key(self) -> KeyCheck:
        """GET /v2/team/credit-usage: needs the key (401 otherwise), costs no credits, says the credits left."""
        if not self.api_key:
            return KeyCheck("no_key", "No key saved: searches use the shared free limit.")
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(f"{self.base_url}/v2/team/credit-usage", headers=self._headers())
        if resp.status_code == 404:
            return KeyCheck("works", "The source accepted the key (no credit balance on record).")
        check = key_check_from_status(resp.status_code)
        if check.state == "works":
            data = (resp.json() or {}).get("data") or {}
            remaining = data.get("remainingCredits") if isinstance(data, dict) else None
            if isinstance(remaining, (int, float)):
                check.credits = int(remaining)
                check.detail = f"The source accepted the key. {int(remaining):,} credits left."
        return check

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
