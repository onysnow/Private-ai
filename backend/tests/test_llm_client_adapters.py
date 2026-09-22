"""Adapter-level tests for app/ai/llm_client.py -- no SDK, no network.

The response parsers are pure functions over duck-typed SDK objects, so the
two things a route must be able to trust (text assembly and truncation
detection) are tested here directly, plus the configuration gate.
"""

from types import SimpleNamespace

import pytest

from app.ai.llm_client import (
    AnthropicLLMClient,
    LLMConfigurationError,
    LLMResponse,
    OpenAILLMClient,
    coerce_response,
    get_llm_client,
    parse_anthropic_response,
    parse_openai_response,
)
from app.core.config import Settings


def test_anthropic_parser_joins_text_blocks_and_flags_max_tokens():
    message = SimpleNamespace(
        model="claude-sonnet-4-5-20250929",
        stop_reason="max_tokens",
        content=[
            SimpleNamespace(type="text", text='{"executive_summary": "part one'),
            SimpleNamespace(type="tool_use", name="ignored"),
            SimpleNamespace(type="text", text=', part two'),
        ],
    )
    parsed = parse_anthropic_response(message, fallback_model="fallback")
    assert parsed == LLMResponse(text='{"executive_summary": "part one, part two', model="claude-sonnet-4-5-20250929", truncated=True, stop_reason="max_tokens")

    complete = parse_anthropic_response(SimpleNamespace(model=None, stop_reason="end_turn", content=[SimpleNamespace(type="text", text="{}")]), fallback_model="fallback")
    assert complete.truncated is False and complete.model == "fallback"


def test_openai_parser_flags_length_and_tolerates_empty_choices():
    completion = SimpleNamespace(model="gpt-4.1-2025", choices=[SimpleNamespace(finish_reason="length", message=SimpleNamespace(content='{"a": 1'))])
    parsed = parse_openai_response(completion, fallback_model="fallback")
    assert parsed.truncated is True and parsed.text == '{"a": 1' and parsed.model == "gpt-4.1-2025"

    empty = parse_openai_response(SimpleNamespace(model=None, choices=[]), fallback_model="fallback")
    assert empty == LLMResponse(text="", model="fallback", truncated=False, stop_reason=None)
    none_content = parse_openai_response(SimpleNamespace(model="m", choices=[SimpleNamespace(finish_reason="stop", message=SimpleNamespace(content=None))]), fallback_model="f")
    assert none_content.text == ""


def test_coerce_response_accepts_test_double_strings():
    assert coerce_response("{}", model="fake") == LLMResponse(text="{}", model="fake")
    real = LLMResponse(text="x", model="m")
    assert coerce_response(real) is real


def test_adapters_take_model_and_timeout_from_settings_and_refuse_missing_config():
    s = Settings(ai_provider="anthropic", anthropic_api_key="k", anthropic_model="claude-x", ai_request_timeout_seconds=7.5)
    client = get_llm_client(s)
    assert isinstance(client, AnthropicLLMClient) and client._model == "claude-x" and client._timeout == 7.5

    s2 = Settings(ai_provider="openai", openai_api_key="k", openai_model="gpt-y", ai_request_timeout_seconds=9)
    client2 = get_llm_client(s2)
    assert isinstance(client2, OpenAILLMClient) and client2._model == "gpt-y" and client2._timeout == 9

    with pytest.raises(LLMConfigurationError):
        get_llm_client(Settings(ai_provider="anthropic", anthropic_api_key=""))
    with pytest.raises(LLMConfigurationError):
        get_llm_client(Settings(ai_provider="openai", openai_api_key="k", openai_model="   "))
    with pytest.raises(LLMConfigurationError):
        get_llm_client(Settings(ai_provider="gemini"))
    with pytest.raises(LLMConfigurationError):
        get_llm_client(Settings(ai_provider=""))
