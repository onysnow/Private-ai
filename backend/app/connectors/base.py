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
def host_of(connector: object, fallback: str = "") -> str:
    """Where a connector's requests go, for anything with `search` (a test double or plug-in may not say)."""
    return str(getattr(connector, "host", "") or getattr(connector, "base_url", "") or fallback)


def will_send(connector: object) -> bool:
    """Whether a request would actually leave; a connector that does not say is taken to send."""
    check = getattr(connector, "will_send", None)
    return bool(check()) if callable(check) else True


class Connector(ABC):
    # True when the provider refuses a request without a key (the request is then never sent).
    requires_key = False

    @abstractmethod
    async def search(self, query: str) -> list[ExternalFinding]: ...

    async def check_key(self) -> KeyCheck:
        """Ask the source whether it accepts the key, sending no search. A connector with no such endpoint says so."""
        return KeyCheck("not_supported", "This source has no way to check a key without a search.")
    @property
    def host(self) -> str:
        """The address requests go to, for the outbound log (ADR-0015)."""
        return str(getattr(self, "base_url", "") or "")

    def will_send(self) -> bool:
        """Whether a request would actually leave: a provider that needs a key sends nothing without one."""
        return not self.requires_key or bool(getattr(self, "configured", False))

    def request_preview(self, *, query: str | None = None, entity: dict | None = None) -> tuple[str, str]:
        """What a call sends, word for word, and what kind of value it is (the outbound log, ADR-0015).
        Must match what `search` / `enrich` put on the wire; providers that send something else override it."""
        if entity is not None:
            return self.entity_query(entity), "name and details"
        return query or "", "search words"

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
