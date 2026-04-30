from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import get_settings

ALLOWED_ACTION_TYPES = [
    "GAIN_TRIM",
    "EQ_CUT",
    "DYNAMIC_EQ",
    "HPF",
    "DE_ESSER",
    "SIDECHAIN_COMPRESS",
    "PAN_ADJUST",
    "FADE_ADJUST",
    "TRUE_PEAK_LIMITER",
]


class PlanningLLMError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class PlanningLLMResponse:
    plan_payload: dict[str, object]


class PlanningLLMClient(Protocol):
    def generate_plan(
        self,
        *,
        selected_region_id: str,
        preserve_clip_id: int,
        user_feedback_message: str | None,
        region: dict[str, object],
        clip_context: list[dict[str, object]],
        revision_notes: list[str],
    ) -> PlanningLLMResponse: ...


class HTTPPlanningLLMClient:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout_seconds: float,
        connect_timeout_seconds: float,
    ) -> None:
        self._base_url = base_url
        self._api_key = api_key
        self._model = model
        self._timeout = httpx.Timeout(timeout=timeout_seconds, connect=connect_timeout_seconds)

    def generate_plan(
        self,
        *,
        selected_region_id: str,
        preserve_clip_id: int,
        user_feedback_message: str | None,
        region: dict[str, object],
        clip_context: list[dict[str, object]],
        revision_notes: list[str],
    ) -> PlanningLLMResponse:
        request_payload = {
            "model": self._model,
            "messages": [
                {
                    "role": "developer",
                    "content": _planner_system_prompt(),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "selectedRegionId": selected_region_id,
                            "preserveClipId": preserve_clip_id,
                            "userFeedbackMessage": user_feedback_message,
                            "revisionNotes": revision_notes,
                            "region": region,
                            "clipContext": clip_context,
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._api_key}",
        }

        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.post(self._base_url, headers=headers, json=request_payload)
        except httpx.TimeoutException as exc:
            raise PlanningLLMError(
                "PLANNING_LLM_TIMEOUT",
                "Timed out while waiting for the planning LLM service.",
            ) from exc
        except httpx.HTTPError as exc:
            raise PlanningLLMError(
                "PLANNING_LLM_REQUEST_FAILED",
                "Failed to reach the planning LLM service.",
            ) from exc

        if response.status_code >= 500:
            raise PlanningLLMError(
                "PLANNING_LLM_SERVER_ERROR",
                f"Planning LLM service returned {response.status_code}.",
            )
        if response.status_code >= 400:
            raise PlanningLLMError(
                "PLANNING_LLM_BAD_REQUEST",
                f"Planning LLM service rejected the request with {response.status_code}.",
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise PlanningLLMError(
                "PLANNING_LLM_INVALID_RESPONSE",
                "Planning LLM service returned a non-JSON response body.",
            ) from exc

        message_content = _extract_openai_message_content(payload)
        response_payload = _parse_json_object(message_content)
        _validate_plan_payload_shape(response_payload)
        return PlanningLLMResponse(plan_payload=response_payload)


def get_planning_llm_client() -> PlanningLLMClient:
    settings = get_settings()
    if not settings.planning_llm_enabled:
        raise PlanningLLMError(
            "PLANNING_LLM_DISABLED",
            "Planning LLM is disabled in the current AI server configuration.",
        )
    if not settings.planning_llm_base_url:
        raise PlanningLLMError(
            "PLANNING_LLM_URL_MISSING",
            "Planning LLM URL is not configured.",
        )
    if not settings.planning_llm_api_key:
        raise PlanningLLMError(
            "PLANNING_LLM_API_KEY_MISSING",
            "Planning LLM API key is not configured.",
        )
    return HTTPPlanningLLMClient(
        base_url=settings.planning_llm_base_url,
        api_key=settings.planning_llm_api_key,
        model=settings.planning_llm_model,
        timeout_seconds=settings.planning_llm_timeout_seconds,
        connect_timeout_seconds=settings.planning_llm_connect_timeout_seconds,
    )


def _planner_system_prompt() -> str:
    return (
        "항상 한국어로만 답하라. 반드시 JSON object 하나만 반환하라. "
        "마크다운, 코드펜스, 설명 문단은 금지한다. "
        "너는 오디오 믹싱 수정 계획 생성기다. 입력으로 문제 구간(region), 보존 clip, 사용자 의도를 받는다. "
        "반환 JSON은 반드시 다음 필드를 포함해야 한다: "
        '{"strategyTitle": string, "strategySummary": string, "summary": string, "explanation": string, '
        '"candidate": {"action": {"actionType": string, "targetScope": "TRACK|MASTER", '
        '"targetTrackId": number|null, "targetClipId": number|null, "startMs": number|null, '
        '"endMs": number|null, "bandLowHz": number|null, "bandHighHz": number|null, '
        '"gainDeltaDb": number|null, "params": object}}}. '
        f"허용 actionType 목록은 {', '.join(ALLOWED_ACTION_TYPES)} 이다. "
        "band_overlap과 high_band_harshness는 TRACK 범위 액션만 허용한다. "
        "clipping은 MASTER 범위 액션만 허용한다. "
        "targetScope가 MASTER면 targetTrackId는 null이어야 한다. "
        "targetScope가 TRACK이면 targetTrackId는 반드시 숫자여야 한다. "
        "입력 region의 시간 범위를 벗어나는 startMs/endMs를 만들지 말라. "
        "필요 이상으로 공격적인 수치를 만들지 말고, params는 JSON object로만 반환하라."
    )


def _extract_openai_message_content(payload: dict[str, object]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise PlanningLLMError(
            "PLANNING_LLM_INVALID_RESPONSE",
            "Planning LLM response did not include a valid choices list.",
        )
    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        raise PlanningLLMError(
            "PLANNING_LLM_INVALID_RESPONSE",
            "Planning LLM response included an invalid choice item.",
        )
    message = first_choice.get("message")
    if not isinstance(message, dict):
        raise PlanningLLMError(
            "PLANNING_LLM_INVALID_RESPONSE",
            "Planning LLM response omitted the message payload.",
        )
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_chunks: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text" and isinstance(item.get("text"), str):
                text_chunks.append(item["text"])
        if text_chunks:
            return "".join(text_chunks)
    raise PlanningLLMError(
        "PLANNING_LLM_INVALID_RESPONSE",
        "Planning LLM response omitted a readable message content field.",
    )


def _parse_json_object(content: str) -> dict[str, object]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise PlanningLLMError(
            "PLANNING_LLM_INVALID_RESPONSE",
            "Planning LLM response was not valid JSON content.",
        ) from exc
    if not isinstance(parsed, dict):
        raise PlanningLLMError(
            "PLANNING_LLM_INVALID_RESPONSE",
            "Planning LLM response JSON was not an object.",
        )
    return parsed


def _validate_plan_payload_shape(payload: dict[str, object]) -> None:
    for key in ("strategyTitle", "strategySummary", "summary", "explanation"):
        value = payload.get(key)
        if not isinstance(value, str) or not value.strip():
            raise PlanningLLMError(
                "PLANNING_LLM_INVALID_RESPONSE",
                f"Planning LLM response omitted a valid {key} field.",
            )
    candidate = payload.get("candidate")
    if not isinstance(candidate, dict):
        raise PlanningLLMError(
            "PLANNING_LLM_INVALID_RESPONSE",
            "Planning LLM response omitted a valid candidate object.",
        )
    action = candidate.get("action")
    if not isinstance(action, dict):
        raise PlanningLLMError(
            "PLANNING_LLM_INVALID_RESPONSE",
            "Planning LLM response omitted a valid candidate.action object.",
        )
    action_type = action.get("actionType")
    if not isinstance(action_type, str) or action_type not in ALLOWED_ACTION_TYPES:
        raise PlanningLLMError(
            "PLANNING_LLM_INVALID_RESPONSE",
            "Planning LLM response omitted a supported actionType value.",
        )
