from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ExternalFinding:
    provider: str
    record_id: str
    caption: str
    schema: str | None = None
    url: str | None = None
    properties: dict = field(default_factory=dict)
    raw: dict = field(default_factory=dict)


@dataclass
class KeyCheck:
    """Whether the source accepts the key, learned without sending a search (Settings › Connector keys)."""
    state: str            # works | refused | no_key | failed | not_supported
    detail: str = ""
    credits: int | None = None


def key_check_from_status(status: int, *, ok_detail: str = "The source accepted the key.") -> KeyCheck:
    if status in (401, 403):
        return KeyCheck("refused", f"The source refused the key ({status}).")
    if 200 <= status < 300:
        return KeyCheck("works", ok_detail)
    return KeyCheck("failed", f"The source answered {status}.")


def entity_sent_value(caption: str | None, properties: dict | None) -> str:
    """What an enrichment sends about an entity, as one line: its name and the values of the properties sent with it."""
    parts = [str(caption)] if caption else []
    for values in (properties or {}).values():
        for value in (values if isinstance(values, list) else [values]):
            text = str(value).strip()
            if text and text not in parts:
                parts.append(text)
    return " · ".join(parts)


class Connector(ABC):
    # True when the service refuses (or the connector will not send) a request without a key; then nothing leaves until one is stored.
    requires_key: bool = False

    @abstractmethod
    async def search(self, query: str) -> list[ExternalFinding]: ...

    async def check_key(self) -> KeyCheck:
        """Ask the source whether it accepts the key, sending no search. A connector with no such endpoint says so."""
        return KeyCheck("not_supported", "This source has no way to check a key without a search.")
    @property
    def host(self) -> str:
        """The address requests go to, for the outbound log (ADR-0015)."""
        return str(getattr(self, "base_url", "") or "")

    def entity_query(self, entity: dict) -> str:
        """Build a conservative text query from a canonical FtM entity.

        Providers with native query-by-example matching should override `enrich`.
        This default gives search-only connectors a useful entity-driven fallback.
        """
        props = entity.get("properties") or {}
        preferred = (
            "name",
            "alias",
            "registrationNumber",
            "taxNumber",
            "idNumber",
            "leiCode",
            "isin",
            "jurisdiction",
            "country",
            "address",
        )
        terms: list[str] = []
        for prop in preferred:
            for value in props.get(prop) or []:
                text = str(value).strip()
                if text and text not in terms:
                    terms.append(text)
                if len(terms) >= 6:
                    return " ".join(terms)
        caption = str(entity.get("caption") or "").strip()
        if caption and caption not in terms:
            terms.insert(0, caption)
        return " ".join(terms[:6])

    def enrich_sent(self, entity: dict) -> str:
        """The words enrich() sends to the service for this entity, for the outbound log (ADR-0015)."""
        return self.entity_query(entity)

    async def enrich(self, entity: dict) -> list[ExternalFinding]:
        query = self.entity_query(entity)
        if not query:
            return []
        return await self.search(query)
