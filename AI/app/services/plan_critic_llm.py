from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import get_settings


class PlanCriticLLMError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class PlanCriticLLMResponse:
    result: str
    note: str


class PlanCriticLLMClient(Protocol):
    def review_plan(
        self,
        *,
        selected_region_id: int,
        preserve_clip_id: int,
        user_feedback_message: str | None,
        region: dict[str, object],
        plan_payload: dict[str, object],
        revision_notes: list[str],
    ) -> PlanCriticLLMResponse: ...


class HTTPPlanCriticLLMClient:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        anthropic_version: str,
        max_tokens: int,
        timeout_seconds: float,
        connect_timeout_seconds: float,
    ) -> None:
        self._base_url = base_url
        self._api_key = api_key
        self._model = model
        self._anthropic_version = anthropic_version
        self._max_tokens = max_tokens
        self._timeout = httpx.Timeout(timeout=timeout_seconds, connect=connect_timeout_seconds)

    def review_plan(
        self,
        *,
        selected_region_id: int,
        preserve_clip_id: int,
        user_feedback_message: str | None,
        region: dict[str, object],
        plan_payload: dict[str, object],
        revision_notes: list[str],
    ) -> PlanCriticLLMResponse:
        request_payload = {
            "model": self._model,
            "max_tokens": self._max_tokens,
            "messages": [
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "selectedRegionId": selected_region_id,
                            "preserveClipId": preserve_clip_id,
                            "userFeedbackMessage": user_feedback_message,
                            "revisionNotes": revision_notes,
                            "region": region,
                            "planPayload": plan_payload,
                        },
                        ensure_ascii=False,
                    ),
                }
            ],
            "system": (
                "항상 한국어로만 답하라. 반드시 JSON object 하나만 반환하라. "
                '반환 형식은 {"result":"PASS|REVISE|REJECT","note":"string"} 이다. '
                "의미 없는 칭찬은 금지하고, 계획의 안정성, "
                "사용자 의도 적합성, 과도한 보정 여부를 비평하라."
            ),
        }
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self._api_key,
            "anthropic-version": self._anthropic_version,
        }

        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.post(self._base_url, headers=headers, json=request_payload)
        except httpx.TimeoutException as exc:
            raise PlanCriticLLMError(
                "PLAN_CRITIC_TIMEOUT",
                "Timed out while waiting for the plan critic service.",
            ) from exc
        except httpx.HTTPError as exc:
            raise PlanCriticLLMError(
                "PLAN_CRITIC_REQUEST_FAILED",
                "Failed to reach the plan critic service.",
            ) from exc

        if response.status_code >= 500:
            raise PlanCriticLLMError(
                "PLAN_CRITIC_SERVER_ERROR",
                f"Plan critic service returned {response.status_code}.",
            )
        if response.status_code >= 400:
            raise PlanCriticLLMError(
                "PLAN_CRITIC_BAD_REQUEST",
                f"Plan critic service rejected the request with {response.status_code}.",
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise PlanCriticLLMError(
                "PLAN_CRITIC_INVALID_RESPONSE",
                "Plan critic service returned a non-JSON response body.",
            ) from exc

        message_content = _extract_anthropic_text(payload)
        response_payload = _parse_json_object(message_content)
        result = _require_string(response_payload, "result").upper()
        if result not in {"PASS", "REVISE", "REJECT"}:
            raise PlanCriticLLMError(
                "PLAN_CRITIC_INVALID_RESPONSE",
                "Plan critic response omitted a supported result field.",
            )
        return PlanCriticLLMResponse(
            result=result,
            note=_require_string(response_payload, "note"),
        )


def get_plan_critic_llm_client() -> PlanCriticLLMClient:
    settings = get_settings()
    if not settings.plan_critic_enabled:
        raise PlanCriticLLMError(
            "PLAN_CRITIC_DISABLED",
            "Plan critic LLM is disabled in the current AI server configuration.",
        )
    if not settings.plan_critic_base_url:
        raise PlanCriticLLMError(
            "PLAN_CRITIC_URL_MISSING",
            "Plan critic LLM URL is not configured.",
        )
    if not settings.plan_critic_api_key:
        raise PlanCriticLLMError(
            "PLAN_CRITIC_API_KEY_MISSING",
            "Plan critic LLM API key is not configured.",
        )
    return HTTPPlanCriticLLMClient(
        base_url=settings.plan_critic_base_url,
        api_key=settings.plan_critic_api_key,
        model=settings.plan_critic_model,
        anthropic_version=settings.plan_critic_anthropic_version,
        max_tokens=settings.plan_critic_max_tokens,
        timeout_seconds=settings.plan_critic_timeout_seconds,
        connect_timeout_seconds=settings.plan_critic_connect_timeout_seconds,
    )


def _extract_anthropic_text(payload: dict[str, object]) -> str:
    content = payload.get("content")
    if not isinstance(content, list) or not content:
        raise PlanCriticLLMError(
            "PLAN_CRITIC_INVALID_RESPONSE",
            "Plan critic response did not include a valid content list.",
        )
    text_chunks: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "text" and isinstance(item.get("text"), str):
            text_chunks.append(item["text"])
    if not text_chunks:
        raise PlanCriticLLMError(
            "PLAN_CRITIC_INVALID_RESPONSE",
            "Plan critic response omitted readable text content.",
        )
    return "".join(text_chunks)


def _parse_json_object(content: str) -> dict[str, object]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise PlanCriticLLMError(
            "PLAN_CRITIC_INVALID_RESPONSE",
            "Plan critic response was not valid JSON content.",
        ) from exc
    if not isinstance(parsed, dict):
        raise PlanCriticLLMError(
            "PLAN_CRITIC_INVALID_RESPONSE",
            "Plan critic response JSON was not an object.",
        )
    return parsed


def _require_string(payload: dict[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise PlanCriticLLMError(
            "PLAN_CRITIC_INVALID_RESPONSE",
            f"Plan critic response omitted a valid {key} field.",
        )
    return value.strip()
