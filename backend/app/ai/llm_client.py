"""Pluggable, provider-agnostic LLM client abstraction.

This module intentionally knows nothing about TAS, investigations, or
citation validation — it is a thin, swappable transport layer. Callers
(e.g. the case-synthesis / hypothesis-test endpoints) are responsible
for prompt construction and for validating/parsing whatever text comes
back. Keeping this layer dumb is deliberate: it means adding a third
provider later never touches the reasoning/validation code, and it
means the reasoning/validation code can be unit-tested against a fake
adapter without any network access or real API keys.

Nothing here is imported or wired up unless a caller explicitly asks
for a client via `get_llm_client()`, and that function itself raises
a clear, catchable error rather than silently falling back to some
default provider when configuration is incomplete — the caller (an
API route) is expected to turn that into a 4xx, not a 500.

Every adapter:
- takes its model id and request timeout from Settings (a deprecation is
  a config change, and a hung provider cannot pin a worker thread for the
  SDK's default ten minutes);
- returns an LLMResponse, not a bare string, so the caller can tell a
  complete answer from one the provider cut off at max_tokens and can
  record which model actually produced it.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass

from app.core.config import Settings


class LLMConfigurationError(RuntimeError):
    """Raised when no usable LLM provider is configured.

    Callers in the API layer should catch this and return a 4xx
    (e.g. 503/501), never let it surface as an unhandled 500 — an AI
    feature being turned off or half-configured is an expected,
    everyday state for this app, not a server error.
    """


class LLMProviderError(RuntimeError):
    """The provider call itself failed (network, auth, 5xx, timeout).

    Wrapped here so the reasoning layer never has to import a vendor SDK's
    exception hierarchy; the route turns this into a 502.
    """


@dataclass(frozen=True)
class LLMResponse:
    text: str
    model: str
    truncated: bool = False          # provider stopped at max_tokens: the text is cut off, not complete
    stop_reason: str | None = None


class LLMClient(abc.ABC):
    """Minimal provider-neutral interface.

    Deliberately small: a single `generate` call taking a system
    prompt and a user prompt and returning the model's response. Anything
    richer (streaming, tool use) is out of scope until a concrete module
    actually needs it — TAS's own modules 06/08 only need a single
    non-streaming completion per call.
    """

    @abc.abstractmethod
    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> LLMResponse | str:
        """Return the model's output for one completion.

        Returning a bare str is tolerated (test doubles do it); callers
        should go through `coerce_response()` rather than assuming a type.
        """
        raise NotImplementedError


def coerce_response(value: LLMResponse | str, *, model: str = "unknown") -> LLMResponse:
    if isinstance(value, LLMResponse):
        return value
    return LLMResponse(text=str(value), model=model)


class AnthropicLLMClient(LLMClient):
    def __init__(self, api_key: str, model: str, *, timeout_seconds: float = 120.0) -> None:
        if not api_key:
            raise LLMConfigurationError("anthropic_api_key is not configured")
        if not model.strip():
            raise LLMConfigurationError("anthropic_model is not configured")
        self._api_key = api_key
        self._model = model
        self._timeout = timeout_seconds
        self._client = None  # lazily constructed so importing this module never requires the SDK

    def _get_client(self):
        if self._client is None:
            import anthropic  # imported lazily: not a hard dependency unless this adapter is used

            # max_retries=1: a retry doubles the worst-case wall time a worker is held; one is enough
            # for a transient 529/overloaded, more belongs to the caller's own retry policy.
            self._client = anthropic.Anthropic(api_key=self._api_key, timeout=self._timeout, max_retries=1)
        return self._client

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> LLMResponse:
        client = self._get_client()
        try:
            response = client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
        except Exception as exc:  # the SDK's hierarchy stays here; callers see one error type
            raise LLMProviderError(f"anthropic request failed: {exc.__class__.__name__}: {exc}") from exc
        return parse_anthropic_response(response, fallback_model=self._model)


def parse_anthropic_response(response, *, fallback_model: str) -> LLMResponse:
    """Pure function over the SDK's Message object (duck-typed so tests need no SDK)."""
    text = "".join(getattr(block, "text", "") for block in getattr(response, "content", []) if getattr(block, "type", None) == "text")
    stop_reason = getattr(response, "stop_reason", None)
    return LLMResponse(
        text=text,
        model=getattr(response, "model", None) or fallback_model,
        truncated=(stop_reason == "max_tokens"),
        stop_reason=stop_reason,
    )


class OpenAILLMClient(LLMClient):
    def __init__(self, api_key: str, model: str, *, timeout_seconds: float = 120.0) -> None:
        if not api_key:
            raise LLMConfigurationError("openai_api_key is not configured")
        if not model.strip():
            raise LLMConfigurationError("openai_model is not configured")
        self._api_key = api_key
        self._model = model
        self._timeout = timeout_seconds
        self._client = None

    def _get_client(self):
        if self._client is None:
            import openai  # imported lazily: not a hard dependency unless this adapter is used

            self._client = openai.OpenAI(api_key=self._api_key, timeout=self._timeout, max_retries=1)
        return self._client

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> LLMResponse:
        client = self._get_client()
        try:
            response = client.chat.completions.create(
                model=self._model,
                max_tokens=max_tokens,
                # The reasoning prompts always demand a single JSON object; asking the
                # API to enforce that removes the "prose around the JSON" failure mode.
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
        except Exception as exc:
            raise LLMProviderError(f"openai request failed: {exc.__class__.__name__}: {exc}") from exc
        return parse_openai_response(response, fallback_model=self._model)


def parse_openai_response(response, *, fallback_model: str) -> LLMResponse:
    choices = getattr(response, "choices", None) or []
    first = choices[0] if choices else None
    message = getattr(first, "message", None)
    finish_reason = getattr(first, "finish_reason", None) if first is not None else None
    return LLMResponse(
        text=(getattr(message, "content", None) or "") if message is not None else "",
        model=getattr(response, "model", None) or fallback_model,
        truncated=(finish_reason == "length"),
        stop_reason=finish_reason,
    )


_PROVIDERS = {
    "anthropic": lambda s: AnthropicLLMClient(api_key=s.anthropic_api_key, model=s.anthropic_model, timeout_seconds=s.ai_request_timeout_seconds),
    "openai": lambda s: OpenAILLMClient(api_key=s.openai_api_key, model=s.openai_model, timeout_seconds=s.ai_request_timeout_seconds),
}


def get_llm_client(settings: Settings) -> LLMClient:
    """Build the configured provider's client, or raise LLMConfigurationError.

    Callers must also check `settings.enable_ai_features` themselves
    before calling this — this function only enforces that, given AI
    features are on, a real provider is actually usable. The two
    checks are kept separate on purpose: `enable_ai_features` is the
    one global kill switch, `ai_provider`/keys are the "which backend"
    detail, and an endpoint should report which of the two is missing
    rather than a single generic error.
    """

    provider = (settings.ai_provider or "").strip().lower()
    if not provider:
        raise LLMConfigurationError("ai_provider is not configured")
    factory = _PROVIDERS.get(provider)
    if factory is None:
        raise LLMConfigurationError(
            f"unknown ai_provider {provider!r}; supported providers: {sorted(_PROVIDERS)}"
        )
    return factory(settings)
