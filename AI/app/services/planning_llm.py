from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import get_settings

ALLOWED_ACTION_TYPES = [
    "EQ_CUT",
    "DYNAMIC_EQ",
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
        selected_region_id: int,
        preserve_clip_id: int,
        user_feedback_message: str | None,
        selection_context: dict[str, object],
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
        temperature: float,
        timeout_seconds: float,
        connect_timeout_seconds: float,
    ) -> None:
        self._base_url = base_url
        self._api_key = api_key
        self._model = model
        self._temperature = temperature
        self._timeout = httpx.Timeout(timeout=timeout_seconds, connect=connect_timeout_seconds)

    def generate_plan(
        self,
        *,
        selected_region_id: int,
        preserve_clip_id: int,
        user_feedback_message: str | None,
        selection_context: dict[str, object],
        region: dict[str, object],
        clip_context: list[dict[str, object]],
        revision_notes: list[str],
    ) -> PlanningLLMResponse:
        request_payload = {
            "model": self._model,
            "temperature": self._temperature,
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
                            "selectionContext": selection_context,
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
        temperature=settings.planning_llm_temperature,
        timeout_seconds=settings.planning_llm_timeout_seconds,
        connect_timeout_seconds=settings.planning_llm_connect_timeout_seconds,
    )


def _planner_system_prompt() -> str:
    return (
        "You are generating one safe band_overlap correction plan for an audio workflow. "
        "Return only a JSON object and do not add markdown or commentary. "
        "Use the selected region, preserve clip, selection context, clip context, and revision notes exactly as given. "
        "This planner path is only for band_overlap issues. "
        "The only allowed action types are DYNAMIC_EQ and EQ_CUT. "
        "The action must always use TRACK scope. MASTER scope is forbidden. "
        "Never target the preserve clip track. "
        "If selectionContext.selectedTrackId equals selectionContext.preserveTrackId, "
        "treat that selected track as the protected reference, not the required modification target. "
        "In that case, prefer modifying a non-preserve overlapping track. "
        "Keep targetClipId null. "
        "Keep startMs and endMs inside the selected region. "
        "Keep bandLowHz and bandHighHz inside the selected region band when they are provided. "
        "Use a conservative gain reduction and keep the explanation aligned with the actual action. "
        "Use this exact JSON shape: "
        '{"strategyTitle": string, "strategySummary": string, '
        '"summary": string, "explanation": string, '
        '"candidate": {"action": {"actionType": string, "targetScope": "TRACK", '
        '"targetTrackId": number|null, "targetClipId": number|null, "startMs": number|null, '
        '"endMs": number|null, "bandLowHz": number|null, "bandHighHz": number|null, '
        '"gainDeltaDb": number|null, "params": object}}}. '
        f"Allowed actionType values: {', '.join(ALLOWED_ACTION_TYPES)}. "
        "Prefer DYNAMIC_EQ when the overlap is sustained or dynamic, and EQ_CUT when a narrower static cut is safer. "
        "Prefer the non-preserve track with the strongest contribution to the selected problem. "
        "If revision notes mention leakage, range too wide, or overreach, tighten the time range and band range instead of widening them. "
        "If user feedback says to preserve texture, warmth, body, or vocal character, reduce gain more conservatively and avoid wider bands. "
        "Keep gainDeltaDb modest and usually between about -1.5 and -3.0 dB unless the context strongly requires otherwise. "
        "Keep the explanation concrete by naming the target track, band focus, and why the preserve target stays untouched."
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
