"""The Ollama adapter (Foundation Fixes fix 4): a model on the reporter's own
computer, refused when it is not.

Ollama is faked with httpx.MockTransport using the field names of Ollama's
REST API (ollama/api/types.go: ShowResponse and ChatResponse carry
remote_host / remote_model for models served from Ollama's cloud).
A real local Ollama is exercised only by test_against_a_real_local_ollama,
skipped when none is running.
"""

from __future__ import annotations

import json
import os

import httpx
import pytest

from app.ai.llm_client import (
    LLMConfigurationError, LLMContextError, LLMProviderError, OllamaLLMClient, context_tokens_needed, get_llm_client,
    is_local_endpoint, parse_ollama_response,
)
from app.core.config import Settings


def _ollama(show: dict | None = None, chat: dict | None = None, show_status: int = 200, seen: list | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}")
        if seen is not None:
            seen.append((request.url.path, body))
        if request.url.path == "/api/show":
            return httpx.Response(show_status, json=show if show is not None else {"details": {"family": "llama"}})
        if request.url.path == "/api/chat":
            return httpx.Response(200, json=chat if chat is not None else {
                "model": body["model"], "message": {"role": "assistant", "content": '{"ok": true}'},
                "done": True, "done_reason": "stop",
            })
        return httpx.Response(404)
    return httpx.MockTransport(handler)


def test_only_this_computer_counts_as_local():
    for url in ("http://127.0.0.1:11434", "http://localhost:11434", "http://[::1]:11434", "http://127.0.1.1:11434",
                "http://host.docker.internal:11434"):
        assert is_local_endpoint(url), url
    for url in ("http://10.0.0.5:11434", "https://ollama.com", "http://gpu-box.newsroom.lan:11434"):
        assert not is_local_endpoint(url), url


def test_remote_address_refused_unless_allowed():
    with pytest.raises(LLMConfigurationError, match="is not this computer"):
        OllamaLLMClient("http://gpu-box.newsroom.lan:11434", "llama3.2")
    OllamaLLMClient("http://gpu-box.newsroom.lan:11434", "llama3.2", allow_remote=True)
    with pytest.raises(LLMConfigurationError, match="ollama_model is not configured"):
        OllamaLLMClient("http://127.0.0.1:11434", "  ")


def test_generate_sends_the_schema_and_reads_the_reply():
    seen: list = []
    client = OllamaLLMClient("http://127.0.0.1:11434", "llama3.2", transport=_ollama(seen=seen))
    schema = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]}
    response = client.generate("system", "user", max_tokens=321, json_schema=schema)
    assert response.text == '{"ok": true}' and response.model == "llama3.2" and not response.truncated
    assert [path for path, _ in seen] == ["/api/show", "/api/chat"]
    chat = seen[1][1]
    assert chat["format"] == schema and chat["options"] == {"num_predict": 321, "num_ctx": 4096} and chat["stream"] is False
    assert [m["role"] for m in chat["messages"]] == ["system", "user"]


def test_the_context_window_is_sized_to_the_request():
    """Ollama's default 4096-token window drops the start of a longer prompt, the instructions first, without an
    error (an earlier trial kept 2,050 of 26,957 tokens). The window is sized to each request instead."""
    seen: list = []
    show = {"details": {}, "model_info": {"qwen2.context_length": 32768}}
    client = OllamaLLMClient("http://127.0.0.1:11434", "qwen2.5:3b", transport=_ollama(show=show, seen=seen))
    client.generate("s" * 30000, "u" * 30000, max_tokens=2000)
    num_ctx = seen[1][1]["options"]["num_ctx"]
    assert num_ctx == context_tokens_needed("s" * 30000, "u" * 30000, 2000) and num_ctx >= 20000 + 2000

    seen.clear()
    with pytest.raises(LLMContextError, match="holds 32768"):
        client.generate("s" * 120000, "u", max_tokens=2000)
    assert [path for path, _ in seen] == ["/api/show"], "nothing is sent that cannot fit"


def test_a_prompt_that_still_filled_the_window_is_refused():
    chat = {"model": "llama3.2", "message": {"role": "assistant", "content": "{}"}, "done": True, "done_reason": "stop",
            "prompt_eval_count": 4096}
    client = OllamaLLMClient("http://127.0.0.1:11434", "llama3.2", transport=_ollama(chat=chat))
    with pytest.raises(LLMContextError, match="dropped"):
        client.generate("system", "user", max_tokens=64)

    # A prompt that fit, however little room it left the answer, is not refused (Ollama read 10,503 tokens of an
    # 18,432-token window whole).
    chat["prompt_eval_count"] = 4096 - 64 - 100
    client = OllamaLLMClient("http://127.0.0.1:11434", "llama3.2", transport=_ollama(chat=chat))
    assert client.generate("system", "user", max_tokens=64).text == "{}"


@pytest.mark.parametrize("model, show", [
    ("gpt-oss:120b-cloud", {"details": {}}),
    ("llama3.2", {"remote_host": "https://ollama.com:443", "remote_model": "llama3.2"}),
])
def test_cloud_models_are_refused_before_any_evidence_is_sent(model, show):
    seen: list = []
    client = OllamaLLMClient("http://127.0.0.1:11434", model, transport=_ollama(show=show, seen=seen))
    assert client.describe_model()["local"] is False
    with pytest.raises(LLMConfigurationError, match="runs on Ollama's cloud"):
        client.generate("system", "evidence", json_schema=None)
    assert all(path != "/api/chat" for path, _ in seen)
    allowed = OllamaLLMClient("http://127.0.0.1:11434", model, allow_remote=True, transport=_ollama(show=show))
    assert allowed.generate("s", "u").text


def test_missing_model_and_unreachable_ollama_are_clear_errors():
    client = OllamaLLMClient("http://127.0.0.1:11434", "not-installed", transport=_ollama(show_status=404))
    with pytest.raises(LLMConfigurationError, match="ollama pull not-installed"):
        client.generate("s", "u")

    def down(request):
        raise httpx.ConnectError("refused")
    with pytest.raises(LLMProviderError, match="not reachable"):
        OllamaLLMClient("http://127.0.0.1:11434", "llama3.2", transport=httpx.MockTransport(down)).generate("s", "u")


def test_reply_parsing():
    cut = parse_ollama_response({"model": "m", "message": {"content": "{"}, "done_reason": "length"}, fallback_model="x")
    assert cut.truncated and cut.stop_reason == "length"
    with pytest.raises(LLMProviderError, match="not this computer"):
        parse_ollama_response({"model": "m", "message": {"content": "{}"}, "remote_host": "https://ollama.com"}, fallback_model="m")
    assert parse_ollama_response({"message": {"content": "x"}, "remote_host": "h"}, fallback_model="m", allow_remote=True).model == "m"


def test_settings_select_the_adapter():
    client = get_llm_client(Settings(ai_provider="ollama", ollama_model="llama3.2"))
    assert isinstance(client, OllamaLLMClient)
    with pytest.raises(LLMConfigurationError, match="is not this computer"):
        get_llm_client(Settings(ai_provider="ollama", ollama_model="llama3.2", ollama_base_url="http://10.1.2.3:11434"))


def _installed_local_model() -> tuple[str, str] | None:
    url = os.environ.get("OLLAMA_TEST_URL", "http://127.0.0.1:11434")
    try:
        models = httpx.get(f"{url}/api/tags", timeout=2).json().get("models") or []
    except (httpx.HTTPError, ValueError):
        return None
    names = [m.get("name") for m in models if m.get("name") and not m.get("remote_host") and "cloud" not in m.get("name", "")]
    wanted = os.environ.get("OLLAMA_TEST_MODEL")
    name = wanted if wanted in names else (names[0] if names else None)
    return (url, name) if name else None


def test_against_a_real_local_ollama():
    found = _installed_local_model()
    if found is None:
        pytest.skip("no local Ollama with an installed model (OLLAMA_TEST_URL / OLLAMA_TEST_MODEL pick one)")
    client = OllamaLLMClient(found[0], found[1], timeout_seconds=300)
    assert client.describe_model()["local"] is True
    schema = {"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"]}
    response = client.generate("Reply with JSON only.", "Say hello in the answer field.", max_tokens=64, json_schema=schema)
    assert isinstance(json.loads(response.text)["answer"], str)
