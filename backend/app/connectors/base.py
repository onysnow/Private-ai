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


class Connector(ABC):
    @abstractmethod
    async def search(self, query: str) -> list[ExternalFinding]: ...

    async def check_key(self) -> KeyCheck:
        """Ask the source whether it accepts the key, sending no search. A connector with no such endpoint says so."""
        return KeyCheck("not_supported", "This source has no way to check a key without a search.")

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

    async def enrich(self, entity: dict) -> list[ExternalFinding]:
        query = self.entity_query(entity)
        if not query:
            return []
        return await self.search(query)
