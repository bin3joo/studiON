from __future__ import annotations

from copy import deepcopy

from app.graph.nodes.common import build_action, workflow_update
from app.graph.state import WorkflowState


def build_rule_candidates(state: WorkflowState) -> WorkflowState:
    region_map = {region["id"]: region for region in state.get("analysis_regions", [])}
    selected_region_id = state.get("selected_region_id") or next(
        iter(state.get("ranked_candidate_ids", [])),
        None,
    )
    if selected_region_id is None and state.get("analysis_regions"):
        selected_region_id = state["analysis_regions"][0]["id"]
    selected_region = region_map.get(selected_region_id) if selected_region_id else None
    preserve_clip_id = state.get("preserve_clip_id")
    rule_candidate_payload = {
        "selectedRegionId": selected_region_id,
        "preserveClipId": preserve_clip_id,
        "userFeedbackMessage": state.get("user_feedback_message"),
        "region": deepcopy(selected_region) if selected_region else None,
        "candidates": [],
    }
    if selected_region:
        candidate = _build_rule_candidate(state, selected_region, preserve_clip_id)
        if candidate is not None:
            rule_candidate_payload["candidates"].append(candidate)
    return workflow_update(
        state,
        node="build_rule_candidates",
        phase="rule_candidates_built",
        progress=70,
        extra={"rule_candidate_payload": rule_candidate_payload},
    )


def planning_agent(state: WorkflowState) -> WorkflowState:
    revise_count = state.get("revise_count", 0)
    if state.get("validator_result") == "REVISE" or state.get("critic_result") == "REVISE":
        revise_count += 1

    candidate_payload = state.get("rule_candidate_payload") or {}
    candidates = candidate_payload.get("candidates", [])
    if not candidates:
        return workflow_update(
            state,
            node="planning_agent",
            phase="plan_generated",
            progress=74,
            extra={
                "plan_payload": {},
                "plan_status": "SKIPPED",
                "plan_revision_notes": [],
                "revise_count": revise_count,
            },
        )

    selected_candidate = deepcopy(candidates[0])
    region = candidate_payload.get("region") or {}
    user_feedback_message = state.get("user_feedback_message")
    plan_payload = {
        "selectedRegionId": candidate_payload.get("selectedRegionId"),
        "preserveClipId": candidate_payload.get("preserveClipId"),
        "strategyTitle": _group_title_for_region(region),
        "strategySummary": _group_summary_for_region(region, user_feedback_message),
        "summary": _suggestion_summary_for_region(region),
        "explanation": _suggestion_explanation_for_region(region, user_feedback_message),
        "candidate": selected_candidate,
        "userFeedbackMessage": user_feedback_message,
    }
    return workflow_update(
        state,
        node="planning_agent",
        phase="plan_generated",
        progress=74,
        extra={
            "plan_payload": plan_payload,
            "plan_status": "DRAFT",
            "plan_revision_notes": [],
            "validator_result": None,
            "critic_result": None,
            "revise_count": revise_count,
        },
    )


def approve_plan(state: WorkflowState) -> WorkflowState:
    revision_notes = [
        *state.get("plan_revision_notes", []),
    ]
    return workflow_update(
        state,
        node="approve_plan",
        phase="plan_approved",
        progress=82,
        extra={
            "plan_status": "APPROVED",
            "plan_revision_notes": revision_notes,
        },
    )


def materialize_execution_plan(state: WorkflowState) -> WorkflowState:
    plan_payload = state.get("plan_payload") or {}
    candidate = plan_payload.get("candidate") or {}
    if not candidate:
        return workflow_update(
            state,
            node="materialize_execution_plan",
            phase="execution_plan_materialized",
            progress=84,
            extra={
                "suggestion_payload": {},
                "suggestion_group_id": None,
                "preview_action_ids": [],
                "user_action_required": False,
            },
        )

    action = candidate["action"]
    payload = {
        "groupTitle": plan_payload.get("strategyTitle") or "Workflow suggestion group",
        "groupSummary": plan_payload.get("strategySummary"),
        "suggestions": [
            {
                "rank": 1,
                "summary": plan_payload.get("summary") or "문제 구간 보정 제안",
                "explanation": plan_payload.get("explanation"),
                "actions": [action],
            }
        ],
    }
    preview_action_ids = [action["actionId"]]
    return workflow_update(
        state,
        node="materialize_execution_plan",
        phase="execution_plan_materialized",
        progress=84,
        extra={
            "suggestion_payload": payload,
            "suggestion_group_id": state.get("suggestion_group_id") or f"{state['job_id']}-group",
            "preview_action_ids": preview_action_ids,
            "user_action_required": True,
        },
    )


def _build_rule_candidate(
    state: WorkflowState,
    region: dict[str, object],
    preserve_clip_id: str | None,
) -> dict[str, object] | None:
    issue = region.get("issue_type")
    action = _build_region_action(state, region=region, preserve_clip_id=preserve_clip_id, index=1)
    if action is None:
        return None
    return {
        "candidateId": f"{state['job_id']}-rule-candidate-1",
        "issueType": issue,
        "preserveClipId": preserve_clip_id,
        "targetTrackId": action["targetTrackId"],
        "action": action,
    }


def _build_region_action(
    state: WorkflowState,
    *,
    region: dict[str, object],
    preserve_clip_id: str | None,
    index: int,
) -> dict | None:
    issue = region.get("issue_type")
    if issue == "band_overlap":
        target_track_id = _resolve_overlap_target_track(state, region, preserve_clip_id)
        return build_action(
            state,
            index=index,
            action_type="DYNAMIC_EQ",
            track_id=target_track_id,
            start_ms=region["start_ms"],
            end_ms=region["end_ms"],
            band_low_hz=region.get("band_low_hz"),
            band_high_hz=region.get("band_high_hz"),
            gain_delta_db=-2.4,
            params={"threshold": -19, "ratio": 2.0},
        )
    if issue == "sibilance":
        return build_action(
            state,
            index=index,
            action_type="DE_ESSER",
            track_id=int(region.get("track_id") or 0),
            start_ms=region["start_ms"],
            end_ms=region["end_ms"],
            band_low_hz=region.get("band_low_hz"),
            band_high_hz=region.get("band_high_hz"),
            params={"threshold": -18, "ratio": 2.4},
        )
    if issue == "high_band_harshness":
        return build_action(
            state,
            index=index,
            action_type="DYNAMIC_EQ",
            track_id=int(region.get("track_id") or 0),
            start_ms=region["start_ms"],
            end_ms=region["end_ms"],
            band_low_hz=region.get("band_low_hz"),
            band_high_hz=region.get("band_high_hz"),
            gain_delta_db=-1.8,
            params={"threshold": -19, "ratio": 2.1},
        )
    return None


def _group_title_for_region(region: dict[str, object]) -> str:
    title_map = {
        "band_overlap": "대역 충돌 해결 계획",
        "sibilance": "치찰음 완화 계획",
        "high_band_harshness": "고역 harshness 완화 계획",
    }
    return title_map.get(region.get("issue_type"), "문제 구간 보정 계획")


def _group_summary_for_region(
    region: dict[str, object],
    user_feedback_message: str | None,
) -> str:
    base = {
        "band_overlap": "선택한 clip을 우선 보존하면서 겹치는 대역을 정리합니다.",
        "sibilance": "선택한 clip의 치찰음만 필요한 구간에서 보수적으로 줄입니다.",
        "high_band_harshness": "선택한 clip의 거친 고역만 구간 한정으로 완화합니다.",
    }.get(region.get("issue_type"), "선택한 clip 우선순위에 맞춰 문제 구간을 정리합니다.")
    if not user_feedback_message:
        return base
    return f"{base} 사용자 요구: {user_feedback_message}"


def _suggestion_summary_for_region(region: dict[str, object]) -> str:
    issue = region.get("issue_type")
    if issue == "band_overlap":
        return "보존 clip을 남기고 겹치는 대역을 조건부로 정리"
    if issue == "sibilance":
        return "선택 clip의 치찰음 구간만 de-esser 적용"
    if issue == "high_band_harshness":
        return "선택 clip의 고역 harshness만 dynamic EQ로 완화"
    return "문제 구간 보정 제안"


def _suggestion_explanation_for_region(
    region: dict[str, object],
    user_feedback_message: str | None,
) -> str:
    issue = region.get("issue_type")
    base = {
        "band_overlap": (
            "사용자가 보존하려는 clip은 유지하고, 겹치는 상대 clip 쪽 대역만 "
            "보수적으로 누릅니다."
        ),
        "sibilance": (
            "선택한 clip의 치찰음 대역만 줄여 밝기를 크게 해치지 않는 방향으로 "
            "정리합니다."
        ),
        "high_band_harshness": "선택한 clip의 거친 고역만 필요한 구간에 한정해 완화합니다.",
    }.get(issue, "선택한 clip 우선순위에 맞춰 문제 구간을 정리합니다.")
    if not user_feedback_message:
        return base
    return f"{base} 사용자 피드백을 반영해 계획 강도와 우선순위를 조정합니다."


def _resolve_overlap_target_track(
    state: WorkflowState,
    region: dict[str, object],
    preserve_clip_id: str | None,
) -> int:
    primary = int(region.get("track_id") or 0)
    involved_track_ids = [int(track_id) for track_id in region.get("involved_track_ids", [])]
    if involved_track_ids:
        clip_track_id = _resolve_clip_track_id(state, preserve_clip_id) if preserve_clip_id else None
        track_scores = {
            int(track_id): float(score)
            for track_id, score in (region.get("track_body_contributions") or {}).items()
        }
        candidate_track_ids = [
            track_id
            for track_id in involved_track_ids
            if clip_track_id is None or track_id != clip_track_id
        ]
        if not candidate_track_ids:
            return primary
        candidate_track_ids.sort(
            key=lambda track_id: (
                track_scores.get(track_id, 0.0),
                track_id == primary,
            ),
            reverse=True,
        )
        return candidate_track_ids[0]

    secondary = region.get("secondary_track_id")
    if secondary is None:
        return primary
    secondary = int(secondary)
    if not preserve_clip_id:
        return secondary

    clip_track_id = _resolve_clip_track_id(state, preserve_clip_id)
    if clip_track_id == primary:
        return secondary
    if clip_track_id == secondary:
        return primary
    return secondary


def _resolve_clip_track_id(state: WorkflowState, clip_id: str) -> int | None:
    for clip in state.get("clip_index", []):
        if str(clip.get("clip_id")) == str(clip_id):
            return int(clip["track_id"])
    return None
