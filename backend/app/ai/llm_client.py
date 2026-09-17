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
"""

from __future__ import annotations

import abc

from app.core.config import Settings


class LLMConfigurationError(RuntimeError):
    """Raised when no usable LLM provider is configured.

    Callers in the API layer should catch this and return a 4xx
    (e.g. 503/501), never let it surface as an unhandled 500 — an AI
    feature being turned off or half-configured is an expected,
    everyday state for this app, not a server error.
    """


class LLMClient(abc.ABC):
    """Minimal provider-neutral interface.

    Deliberately small: a single `generate` call taking a system
    prompt and a user prompt and returning the model's raw text
    response. Anything richer (streaming, tool use, structured
    output) is out of scope until a concrete module actually needs
    it — TAS's own modules 06/08 only need a single non-streaming
    completion per call.
    """

    @abc.abstractmethod
    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> str:
        """Return the model's raw text output for one completion."""
        raise NotImplementedError


class AnthropicLLMClient(LLMClient):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-5") -> None:
        if not api_key:
            raise LLMConfigurationError("anthropic_api_key is not configured")
        self._api_key = api_key
        self._model = model
        self._client = None  # lazily constructed so importing this module never requires the SDK

    def _get_client(self):
        if self._client is None:
            import anthropic  # imported lazily: not a hard dependency unless this adapter is used

            self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> str:
        client = self._get_client()
        response = client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return "".join(block.text for block in response.content if getattr(block, "type", None) == "text")


class OpenAILLMClient(LLMClient):
    def __init__(self, api_key: str, model: str = "gpt-4.1") -> None:
        if not api_key:
            raise LLMConfigurationError("openai_api_key is not configured")
        self._api_key = api_key
        self._model = model
        self._client = None

    def _get_client(self):
        if self._client is None:
            import openai  # imported lazily: not a hard dependency unless this adapter is used

            self._client = openai.OpenAI(api_key=self._api_key)
        return self._client

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096) -> str:
        client = self._get_client()
        response = client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        return response.choices[0].message.content or ""


_PROVIDERS = {
    "anthropic": lambda settings: AnthropicLLMClient(api_key=settings.anthropic_api_key),
    "openai": lambda settings: OpenAILLMClient(api_key=settings.openai_api_key),
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
