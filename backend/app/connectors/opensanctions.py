import httpx

from app.connectors.base import Connector, ExternalFinding
from app.core.config import settings


class OpenSanctionsConnector(Connector):
    """OpenSanctions FtM search and query-by-example enrichment adapter."""

    def __init__(self, api_key: str | None = None):
        self.base_url = settings.opensanctions_base_url.rstrip("/")
        self.api_key = settings.opensanctions_api_key if api_key is None else api_key
        self.dataset = settings.opensanctions_dataset or "default"
        self.limit = max(1, min(settings.opensanctions_search_limit, 50))

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> dict[str, str]:
        headers = {"User-Agent": "JournalismWorkbench/0.12"}
        if self.api_key:
            headers["Authorization"] = f"ApiKey {self.api_key}"
        return headers

    def _require_key(self) -> None:
        if not self.api_key:
            raise RuntimeError(
                "OpenSanctions API access is not configured. Set OPENSANCTIONS_API_KEY in backend/.env. "
                "OpenSanctions offers API keys for public-interest journalism."
            )

    def _parse_result(
        self, item: dict, *, match_meta: dict | None = None
    ) -> ExternalFinding:
        props = item.get("properties") or {}
        caption = (
            item.get("caption")
            or (props.get("name") or [None])[0]
            or item.get("id")
            or "OpenSanctions entity"
        )
        record_id = str(item.get("id") or caption)
        raw = dict(item)
        if match_meta:
            raw["_match"] = match_meta
        return ExternalFinding(
            provider="opensanctions",
            record_id=record_id,
            caption=str(caption),
            schema=item.get("schema"),
            url=f"https://www.opensanctions.org/entities/{record_id}/",
            properties=props,
            raw=raw,
        )

    async def search(self, query: str) -> list[ExternalFinding]:
        self._require_key()
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(
                f"{self.base_url}/search/{self.dataset}",
                params={"q": query, "limit": self.limit},
                headers=self._headers(),
            )
            resp.raise_for_status()
            payload = resp.json()
            items = payload.get("results") or []
            if not isinstance(items, list):
                return []
            return [self._parse_result(item) for item in items]

    async def enrich(self, entity: dict) -> list[ExternalFinding]:
        """Match a canonical FtM entity using OpenSanctions query-by-example."""
        self._require_key()
        schema = entity.get("schema")
        properties = entity.get("properties") or {}
        if not schema:
            raise RuntimeError(
                "OpenSanctions entity matching requires a FollowTheMoney schema."
            )
        query_entity = {"schema": schema, "properties": properties}
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.post(
                f"{self.base_url}/match/{self.dataset}",
                json={"queries": {"q": query_entity}},
                headers=self._headers(),
            )
            resp.raise_for_status()
            payload = resp.json()
        response = (payload.get("responses") or {}).get("q") or {}
        items = response.get("results") or []
        if not isinstance(items, list):
            return []
        findings: list[ExternalFinding] = []
        for item in items[: self.limit]:
            meta = {
                key: item.get(key)
                for key in ("score", "match", "features")
                if item.get(key) is not None
            }
            findings.append(self._parse_result(item, match_meta=meta))
        return findings
