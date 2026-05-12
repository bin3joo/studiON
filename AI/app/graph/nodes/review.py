from __future__ import annotations

from app.graph.nodes.common import artifact_id, decide_validation_result, workflow_update
from app.graph.nodes.runtime import fail_workflow
from app.graph.state import WorkflowState
from app.services.plan_critic_llm import (
    PlanCriticLLMError,
    get_plan_critic_llm_client,
)

ISSUE_ALLOWED_ACTIONS = {
    "band_overlap": {"DYNAMIC_EQ"},
    "high_band_harshness": {"DYNAMIC_EQ"},
    "sibilance": {"DYNAMIC_EQ"},
    "track_clipping": {"DYNAMIC_EQ", "EQ_CUT"},
}


def plan_rule_validator(state: WorkflowState) -> WorkflowState:
    plan_payload = state.get("plan_payload") or {}
    validation_error = _validate_plan_payload(state, plan_payload)
    if validation_error is not None:
        return workflow_update(
            state,
            node="plan_rule_validator",
            phase="plan_rule_validated",
            progress=76,
            extra={
                "validator_result": "REJECT",
                "plan_revision_notes": [*state.get("plan_revision_notes", []), validation_error],
            },
        )

    result = decide_validation_result(state, mode_key="validator_mode")
    revision_notes = [*state.get("plan_revision_notes", [])]
    if result == "REVISE":
        revision_notes.append("Rule validator requested a plan revision.")
    if result == "REJECT":
        revision_notes.append("Rule validator rejected the plan.")
    return workflow_update(
        state,
        node="plan_rule_validator",
        phase="plan_rule_validated",
        progress=76,
        extra={
            "validator_result": result,
            "plan_revision_notes": revision_notes,
            "plan_status": "UNDER_REVIEW",
        },
    )


def plan_critic(state: WorkflowState) -> WorkflowState:
    selected_region = _resolve_selected_region(state)
    preserve_clip_id = state.get("preserve_clip_id")
    if selected_region is None or preserve_clip_id is None:
        return fail_workflow(
            {
                **state,
                "failure_code": "PLAN_CRITIC_CONTEXT_MISSING",
                "failure_message": "Plan critic could not restore the selected region context.",
            }
        )

    try:
        critic_response = get_plan_critic_llm_client().review_plan(
            selected_region_id=int(selected_region["id"]),
            preserve_clip_id=int(preserve_clip_id),
            user_feedback_message=state.get("user_feedback_message"),
            region=selected_region,
            plan_payload=state.get("plan_payload") or {},
            revision_notes=[*state.get("plan_revision_notes", [])],
        )
    except PlanCriticLLMError as exc:
        return fail_workflow(
            {
                **state,
                "failure_code": exc.code,
                "failure_message": exc.message,
            }
        )

    result = critic_response.result
    current_artifact_id = artifact_id(state, "plan-critic")
    revision_notes = [*state.get("plan_revision_notes", [])]
    if critic_response.note:
        revision_notes.append(critic_response.note)

    mode_override = decide_validation_result(state, mode_key="critic_mode")
    if mode_override != "PASS":
        result = mode_override
    if result == "REVISE" and critic_response.note == "":
        revision_notes.append("Plan critic requested a semantic revision.")
    if result == "REJECT" and critic_response.note == "":
        revision_notes.append("Plan critic rejected the strategy.")

    return workflow_update(
        state,
        node="plan_critic",
        phase="plan_critic_checked",
        progress=80,
        extra={
            "critic_result": result,
            "plan_revision_notes": revision_notes,
            "plan_status": "UNDER_REVIEW",
            "mongo_artifact_ids": [*state.get("mongo_artifact_ids", []), current_artifact_id],
            "latest_artifact_id": current_artifact_id,
        },
    )


def _validate_plan_payload(state: WorkflowState, plan_payload: dict[str, object]) -> str | None:
    if state.get("ranked_candidate_ids") and not plan_payload:
        return "Plan payload is empty despite ranked candidates."

    selected_region = _resolve_selected_region(state)
    if selected_region is None:
        return "Selected region could not be restored for validation."

    candidate = plan_payload.get("candidate")
    if not isinstance(candidate, dict):
        return "Plan payload omitted a valid candidate object."
    action = candidate.get("action")
    if not isinstance(action, dict):
        return "Plan payload omitted a valid candidate action."
    for field_name in ("strategyTitle", "strategySummary", "summary", "explanation"):
        value = plan_payload.get(field_name)
        if not isinstance(value, str) or not value.strip():
            return f"Plan payload omitted a valid {field_name} field."

    issue_type = str(selected_region.get("issue_type") or "")
    action_type = action.get("actionType")
    if not isinstance(action_type, str):
        return "Plan action omitted a valid actionType."
    allowed_action_types = ISSUE_ALLOWED_ACTIONS.get(issue_type)
    if allowed_action_types is None or action_type not in allowed_action_types:
        return f"Action type {action_type} is not allowed for issue {issue_type}."

    target_scope = action.get("targetScope")
    if target_scope != "TRACK":
        return "Plan action omitted a valid targetScope."
    target_track_id = action.get("targetTrackId")
    if target_track_id is None:
        return "TRACK-scoped actions must include targetTrackId."

    start_ms = action.get("startMs")
    end_ms = action.get("endMs")
    region_start_ms = selected_region.get("start_ms")
    region_end_ms = selected_region.get("end_ms")
    if not isinstance(start_ms, int) or not isinstance(end_ms, int):
        return "Plan action omitted valid startMs/endMs values."
    if start_ms > end_ms:
        return "Plan action startMs must not exceed endMs."
    if isinstance(region_start_ms, int) and start_ms < region_start_ms:
        return "Plan action startMs cannot precede the selected region."
    if isinstance(region_end_ms, int) and end_ms > region_end_ms:
        return "Plan action endMs cannot exceed the selected region."

    band_low_hz = action.get("bandLowHz")
    band_high_hz = action.get("bandHighHz")
    if band_low_hz is not None and band_high_hz is not None:
        if not isinstance(band_low_hz, int) or not isinstance(band_high_hz, int):
            return "Plan action band fields must be integers when present."
        if band_low_hz > band_high_hz:
            return "Plan action bandLowHz must not exceed bandHighHz."

    gain_delta_db = action.get("gainDeltaDb")
    if gain_delta_db is not None and not isinstance(gain_delta_db, int | float):
        return "Plan action gainDeltaDb must be numeric when present."
    if isinstance(gain_delta_db, int | float) and abs(float(gain_delta_db)) > 12.0:
        return "Plan action gainDeltaDb exceeded the allowed safety range."

    params = action.get("params")
    if not isinstance(params, dict):
        return "Plan action params must be an object."

    selected_region_id = plan_payload.get("selectedRegionId")
    if selected_region_id is not None and int(selected_region_id) != int(selected_region["id"]):
        return "Plan payload selectedRegionId did not match the selected region."
    preserve_clip_id = state.get("preserve_clip_id")
    if (
        plan_payload.get("preserveClipId") is not None
        and preserve_clip_id is not None
        and int(plan_payload["preserveClipId"]) != int(preserve_clip_id)
    ):
        return "Plan payload preserveClipId did not match the selected preserve clip."

    if issue_type == "band_overlap":
        preserve_track_id = (
            _resolve_clip_track_id(state, int(preserve_clip_id))
            if preserve_clip_id
            else None
        )
        if (
            preserve_track_id is not None
            and target_track_id is not None
            and int(target_track_id) == preserve_track_id
        ):
            return "Band-overlap plans must not target the preserved clip track."
    elif issue_type == "sibilance" and action_type != "DYNAMIC_EQ":
        return "Sibilance plans must use DYNAMIC_EQ in EQ-only mode."
    elif issue_type == "track_clipping" and action_type not in {"DYNAMIC_EQ", "EQ_CUT"}:
        return "Track-clipping plans must use an EQ action in EQ-only mode."
    return None


def _resolve_selected_region(state: WorkflowState) -> dict[str, object] | None:
    region_map = {region["id"]: region for region in state.get("analysis_regions", [])}
    selected_region_id = state.get("selected_region_id") or next(
        iter(state.get("ranked_candidate_ids", [])),
        None,
    )
    if selected_region_id is None and state.get("analysis_regions"):
        selected_region_id = state["analysis_regions"][0]["id"]
    region = region_map.get(selected_region_id) if selected_region_id else None
    return dict(region) if isinstance(region, dict) else None


def _resolve_clip_track_id(state: WorkflowState, clip_id: int) -> int | None:
    for clip in state.get("clip_index", []):
        if int(clip.get("clip_id") or 0) == int(clip_id):
            return int(clip["track_id"])
    return None
