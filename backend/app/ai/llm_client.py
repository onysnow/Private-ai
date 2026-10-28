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
from typing import Any

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


class LLMContextError(LLMProviderError):
    """The request does not fit the model's context window. Ollama would otherwise drop the start of the prompt
    (the instructions) without saying so; the reporter can narrow the question or ask for fewer records."""


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

    def _get_client(self) -> Any:
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


def parse_anthropic_response(response: Any, *, fallback_model: str) -> LLMResponse:
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

    def _get_client(self) -> Any:
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


def parse_openai_response(response: Any, *, fallback_model: str) -> LLMResponse:
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


# Host names that mean "this computer". host.docker.internal is Docker
# Desktop's name for the computer the containers run on, which is how the
# Docker stack reaches an Ollama running on the reporter's machine.
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "host.docker.internal"}


def is_local_endpoint(base_url: str) -> bool:
    from urllib.parse import urlsplit

    import ipaddress

    host = (urlsplit(base_url).hostname or "").lower()
    if host in LOCAL_HOSTS:
        return True
    try:
        # A literal address must really be loopback; a name such as
        # "127.0.0.1.evil.com" is not an address and is not local.
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


class OllamaLLMClient(LLMClient):
    """A model served by Ollama, normally on the reporter's own computer.

    Talks to Ollama's REST API (/api/show, /api/chat) with httpx rather than
    the official `ollama` Python client: that client (0.6.3, checked
    2026-10-01) drops the `remote_host` / `remote_model` fields Ollama sets
    when a model actually runs on Ollama's cloud (ollama/api/types.go,
    ShowResponse and ChatResponse), and those fields are what this adapter's
    local-only guarantee rests on.

    Local-only by default: the base URL must be this computer, and the model
    must not be a cloud model (a `-cloud` name, or `remote_host` in
    /api/show) unless `ai_allow_remote_endpoint` is on. Both are checked
    before any evidence is sent.
    """

    accepts_json_schema = True  # generate() takes the module's JSON Schema as Ollama's `format`

    def __init__(self, base_url: str, model: str, *, timeout_seconds: float = 120.0,
                 allow_remote: bool = False, transport: Any = None) -> None:
        if not model.strip():
            raise LLMConfigurationError("ollama_model is not configured (pick one of the models installed in Ollama)")
        if not base_url.strip():
            raise LLMConfigurationError("ollama_base_url is not configured")
        if not allow_remote and not is_local_endpoint(base_url):
            raise LLMConfigurationError(
                f"ollama_base_url {base_url!r} is not this computer; set ai_allow_remote_endpoint to send evidence there"
            )
        self._base_url = base_url.rstrip("/")
        self._model = model.strip()
        self._timeout = timeout_seconds
        self._allow_remote = allow_remote
        self._transport = transport

    def _client(self) -> Any:
        import httpx

        # A model on this computer is reached directly, never through an
        # HTTP(S)_PROXY from the environment, which could carry the evidence
        # off the machine.
        return httpx.Client(base_url=self._base_url, timeout=self._timeout, transport=self._transport,
                            trust_env=not is_local_endpoint(self._base_url))

    def describe_model(self) -> dict[str, Any]:
        """Ollama's /api/show for the configured model, plus whether it runs
        on this computer (`local`)."""
        import httpx

        try:
            with self._client() as client:
                response = client.post("/api/show", json={"model": self._model})
        except httpx.HTTPError as exc:
            raise LLMProviderError(f"ollama is not reachable at {self._base_url}: {exc.__class__.__name__}") from exc
        if response.status_code == 404:
            raise LLMConfigurationError(f"ollama has no model named {self._model!r}; install it with `ollama pull {self._model}`")
        if response.status_code >= 400:
            raise LLMProviderError(f"ollama /api/show failed: HTTP {response.status_code}")
        info = response.json() if response.content else {}
        remote_host = info.get("remote_host") if isinstance(info, dict) else None
        local = not remote_host and not self._model.endswith("-cloud") and not self._model.split(":")[-1].endswith("cloud")
        return {"model": self._model, "local": local, "remote_host": remote_host, "base_url": self._base_url,
                "details": info.get("details") if isinstance(info, dict) else None,
                "model_info": info.get("model_info") if isinstance(info, dict) else None}

    def generate(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 4096,
                 json_schema: dict[str, Any] | None = None) -> LLMResponse:
        import httpx

        described = self.describe_model()
        if not described["local"] and not self._allow_remote:
            raise LLMConfigurationError(
                f"ollama model {self._model!r} runs on Ollama's cloud ({described['remote_host'] or 'cloud model'}), "
                "not on this computer; set ai_allow_remote_endpoint to send evidence there"
            )
        # Ollama's context defaults to 4096 tokens and it drops the start of a longer prompt, the instructions
        # first, without an error. The window is sized to this request instead, within what the model holds.
        num_ctx = context_tokens_needed(system_prompt, user_prompt, max_tokens)
        model_max = model_context_length(described.get("model_info"))
        if model_max and num_ctx > model_max:
            raise LLMContextError(
                f"the request needs about {num_ctx} tokens and {self._model} holds {model_max}; "
                "narrow the question or ask for fewer records"
            )
        body: dict[str, Any] = {
            "model": self._model,
            "stream": False,
            "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
            "options": {"num_predict": max_tokens, "num_ctx": num_ctx},
            # Hold the model to the module's JSON shape; the reasoning layer's
            # own parser and validators still check whatever comes back.
            "format": json_schema or "json",
        }
        try:
            with self._client() as client:
                response = client.post("/api/chat", json=body)
        except httpx.HTTPError as exc:
            raise LLMProviderError(f"ollama request failed: {exc.__class__.__name__}: {exc}") from exc
        if response.status_code >= 400:
            raise LLMProviderError(f"ollama request failed: HTTP {response.status_code}: {response.text[:300]}")
        data = response.json()
        # A prompt that still filled the whole window was cut. (A 10,503-token prompt in an 18,432-token window was
        # read whole, with no "truncating input prompt" in Ollama's log: the window, not window minus answer, is the limit.)
        evaluated = data.get("prompt_eval_count") if isinstance(data, dict) else None
        if isinstance(evaluated, int) and evaluated >= num_ctx - 8:
            raise LLMContextError(f"ollama kept {evaluated} tokens of the prompt, the whole window; the rest was dropped")
        return parse_ollama_response(data, fallback_model=self._model, allow_remote=self._allow_remote)


# Measured on the reasoning prompts with qwen2.5: about 2.9 characters a token (JSON and ids tokenize densely).
# Estimated low on purpose: too big a window costs only memory.
CHARS_PER_TOKEN = 2.5
MIN_CONTEXT = 4096


def context_tokens_needed(system_prompt: str, user_prompt: str, max_tokens: int) -> int:
    """The context window a request needs: its prompt, estimated generously, plus the answer, in 1024-token steps."""
    needed = int((len(system_prompt) + len(user_prompt)) / CHARS_PER_TOKEN) + max_tokens + 256
    return max(MIN_CONTEXT, -(-needed // 1024) * 1024)


def model_context_length(model_info: Any) -> int | None:
    """The model's own window from /api/show (`qwen2.context_length`: 32768), or None if it does not say."""
    if isinstance(model_info, dict):
        for key, value in model_info.items():
            if key.endswith(".context_length") and isinstance(value, int) and value > 0:
                return value
    return None


def parse_ollama_response(payload: Any, *, fallback_model: str, allow_remote: bool = False) -> LLMResponse:
    data = payload if isinstance(payload, dict) else {}
    if data.get("remote_host") and not allow_remote:
        # describe_model() refuses cloud models before sending; this catches a
        # server that answered from elsewhere anyway, so the reply is not used.
        raise LLMProviderError(f"ollama answered from {data['remote_host']}, not this computer")
    raw_message = data.get("message")
    message: dict = raw_message if isinstance(raw_message, dict) else {}
    done_reason = data.get("done_reason")
    return LLMResponse(
        text=str(message.get("content") or ""),
        model=str(data.get("model") or fallback_model),
        truncated=(done_reason == "length"),
        stop_reason=done_reason,
    )


_PROVIDERS = {
    "anthropic": lambda s: AnthropicLLMClient(api_key=s.anthropic_api_key, model=s.anthropic_model, timeout_seconds=s.ai_request_timeout_seconds),
    "openai": lambda s: OpenAILLMClient(api_key=s.openai_api_key, model=s.openai_model, timeout_seconds=s.ai_request_timeout_seconds),
    "ollama": lambda s: OllamaLLMClient(base_url=s.ollama_base_url, model=s.ollama_model, timeout_seconds=s.ai_request_timeout_seconds,
                                        allow_remote=s.ai_allow_remote_endpoint),
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
