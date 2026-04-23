from __future__ import annotations

from copy import deepcopy

from app.graph.state import WorkflowState, utc_now


def _append_transition(state: WorkflowState, name: str) -> list[str]:
    return [*state.get("transition_log", []), name]


def _workflow_update(
    state: WorkflowState,
    *,
    node: str,
    phase: str,
    progress: int,
    runtime_status: str | None = None,
    durable_status: str | None = None,
    extra: dict | None = None,
) -> WorkflowState:
    payload: WorkflowState = {
        "current_node": node,
        "phase": phase,
        "progress": progress,
        "heartbeat_at": utc_now(),
        "transition_log": _append_transition(state, node),
    }
    if runtime_status is not None:
        payload["runtime_status"] = runtime_status
    if durable_status is not None:
        payload["durable_status"] = durable_status
    if extra:
        payload.update(extra)
    return payload


def _artifact_id(state: WorkflowState, label: str) -> str:
    return f"{state['job_id']}:{label}:{len(state.get('transition_log', [])) + 1}"


def load_entry_context(state: WorkflowState) -> WorkflowState:
    return {
        "current_node": "load_entry_context",
        "phase": state.get("phase", "queued"),
        "progress": state.get("progress", 0),
        "heartbeat_at": utc_now(),
        "transition_log": _append_transition(state, "load_entry_context"),
    }


def init_state(state: WorkflowState) -> WorkflowState:
    return _workflow_update(
        state,
        node="init_state",
        phase="job_initialized",
        progress=4,
        runtime_status="running",
        durable_status="IN_PROGRESS",
        extra={"started_at": state.get("started_at") or utc_now()},
    )


def load_project_snapshot(state: WorkflowState) -> WorkflowState:
    artifact_id = _artifact_id(state, "snapshot")
    return _workflow_update(
        state,
        node="load_project_snapshot",
        phase="project_snapshot_loaded",
        progress=8,
        extra={
            "timeline_snapshot_id": state.get("timeline_snapshot_id")
            or f"{state['job_id']}-timeline-snapshot",
            "mongo_artifact_ids": [*state.get("mongo_artifact_ids", []), artifact_id],
            "latest_artifact_id": artifact_id,
        },
    )


def sample_track_clips(state: WorkflowState) -> WorkflowState:
    sampled_clip_ids = [f"clip:{track_id}:sample" for track_id in (state.get("track_ids") or [0])]
    return _workflow_update(
        state,
        node="sample_track_clips",
        phase="track_clips_sampled",
        progress=12,
        extra={"sampled_clip_ids": sampled_clip_ids},
    )


def cheap_dsp_scan(state: WorkflowState) -> WorkflowState:
    artifact_id = _artifact_id(state, "cheap-dsp")
    analysis_regions = deepcopy(state.get("analysis_regions", []))
    return _workflow_update(
        state,
        node="cheap_dsp_scan",
        phase="cheap_dsp_scanned",
        progress=18,
        extra={
            "analysis_regions": analysis_regions,
            "clip_feature_artifact_id": artifact_id,
            "mongo_artifact_ids": [*state.get("mongo_artifact_ids", []), artifact_id],
            "latest_artifact_id": artifact_id,
        },
    )


def detect_band_overlap(state: WorkflowState) -> WorkflowState:
    return _append_issue_region(
        state,
        node="detect_band_overlap",
        phase="band_overlap_detected",
        progress=24,
        issue="band_overlap",
        summary="Detected likely masking conflict in overlapping band region.",
    )


def detect_clipping(state: WorkflowState) -> WorkflowState:
    return _append_issue_region(
        state,
        node="detect_clipping",
        phase="clipping_detected",
        progress=28,
        issue="clipping",
        summary="Detected clipping candidate with fixable gain envelope.",
    )


def detect_high_band_harshness(state: WorkflowState) -> WorkflowState:
    return _append_issue_region(
        state,
        node="detect_high_band_harshness",
        phase="high_band_harshness_detected",
        progress=32,
        issue="high_band_harshness",
        summary="Detected harsh high-band region that may require role-aware refinement.",
    )


def select_role_candidates(state: WorkflowState) -> WorkflowState:
    track_ids = state.get("track_ids") or [0]
    role_candidates = track_ids[: min(2, len(track_ids))]
    clap_required = bool(role_candidates) and any(
        issue in {"sibilance", "high_band_harshness"} for issue in state.get("detected_issues", [])
    )
    return _workflow_update(
        state,
        node="select_role_candidates",
        phase="role_candidates_selected",
        progress=36,
        extra={
            "role_candidate_track_ids": role_candidates,
            "clap_required": clap_required,
        },
    )


def clap_gate(state: WorkflowState) -> WorkflowState:
    return _workflow_update(
        state,
        node="clap_gate",
        phase="clap_need_decided",
        progress=38,
    )


def infer_track_roles(state: WorkflowState) -> WorkflowState:
    inferred_roles = {
        track_id: ("vocal-like" if index == 0 else "supporting")
        for index, track_id in enumerate(state.get("role_candidate_track_ids", []))
    }
    return _workflow_update(
        state,
        node="infer_track_roles",
        phase="track_roles_inferred",
        progress=44,
        extra={
            "inferred_roles": inferred_roles,
            "vocal_detected": any(role == "vocal-like" for role in inferred_roles.values()),
        },
    )


def detect_sibilance(state: WorkflowState) -> WorkflowState:
    return _append_issue_region(
        state,
        node="detect_sibilance",
        phase="sibilance_detected",
        progress=48,
        issue="sibilance",
        summary="Detected sibilance candidate after role-aware high-band pass.",
    )


def merge_analysis(state: WorkflowState) -> WorkflowState:
    detected_issues = list(dict.fromkeys(state.get("detected_issues", [])))
    region_ids = [region["id"] for region in state.get("analysis_regions", [])]
    retrieval_needed = any(issue in {"band_overlap", "sibilance"} for issue in detected_issues)
    return _workflow_update(
        state,
        node="merge_analysis",
        phase="analysis_merged",
        progress=54,
        extra={
            "detected_issues": detected_issues,
            "analysis_region_ids": region_ids,
            "retrieval_needed": retrieval_needed,
        },
    )


def candidate_ranking(state: WorkflowState) -> WorkflowState:
    ranking_scores = {
        region_id: round(1.0 - (index * 0.08), 3)
        for index, region_id in enumerate(state.get("analysis_region_ids", []))
    }
    ranked_candidate_ids = sorted(ranking_scores, key=lambda key: ranking_scores[key], reverse=True)
    return _workflow_update(
        state,
        node="candidate_ranking",
        phase="candidates_ranked",
        progress=60,
        extra={
            "ranking_scores": ranking_scores,
            "ranked_candidate_ids": ranked_candidate_ids,
        },
    )


def wait_user_mix_intent(state: WorkflowState) -> WorkflowState:
    return _workflow_update(
        state,
        node="wait_user_mix_intent",
        phase="waiting_for_user_mix_intent",
        progress=62,
        runtime_status="waiting_for_user",
        durable_status="WAITING_USER",
    )


def resume_after_mix_intent(state: WorkflowState) -> WorkflowState:
    if state.get("main_track_id") is None:
        return fail_workflow(
            {
                **state,
                "failure_code": "MISSING_MAIN_TRACK",
                "failure_message": (
                    "A main track selection is required before generating suggestions."
                ),
            }
        )
    notes = [*state.get("notes", [])]
    notes.append(
        f"User selected main track {state['main_track_id']} for the overlap resolution intent."
    )
    return _workflow_update(
        state,
        node="resume_after_mix_intent",
        phase="user_mix_intent_resolved",
        progress=64,
        runtime_status="running",
        durable_status="IN_PROGRESS",
        extra={"notes": notes},
    )


def retrieval_policy_rag(state: WorkflowState) -> WorkflowState:
    detected_issues = state.get("detected_issues", [])
    contexts = [
        f"policy:{issue}" for issue in detected_issues if issue in {"band_overlap", "sibilance"}
    ]
    artifact_id = _artifact_id(state, "retrieval")
    return _workflow_update(
        state,
        node="retrieval_policy_rag",
        phase="policy_retrieved",
        progress=66,
        extra={
            "retrieval_context_ids": contexts,
            "mongo_artifact_ids": [*state.get("mongo_artifact_ids", []), artifact_id],
            "latest_artifact_id": artifact_id,
        },
    )


def generate_suggestions(state: WorkflowState) -> WorkflowState:
    revise_count = state.get("revise_count", 0)
    if state.get("validator_result") == "REVISE" or state.get("critic_result") == "REVISE":
        revise_count += 1

    actions = []
    for index, issue in enumerate(state.get("detected_issues", []), start=1):
        track_id = state.get("main_track_id")
        if track_id is None:
            track_id = (state.get("track_ids") or [0])[0]
        if issue == "clipping":
            action = _build_action(
                state,
                index=index,
                action_type="GAIN_TRIM",
                track_id=track_id,
                start_ms=0,
                end_ms=5000,
                gain_delta_db=-2.0,
            )
        elif issue == "sibilance":
            action = _build_action(
                state,
                index=index,
                action_type="DE_ESSER",
                track_id=track_id,
                start_ms=1200,
                end_ms=4200,
                band_low_hz=6000,
                band_high_hz=8500,
                params={"threshold": -18, "ratio": 2.5},
            )
        elif issue == "high_band_harshness":
            action = _build_action(
                state,
                index=index,
                action_type="DYNAMIC_EQ",
                track_id=track_id,
                start_ms=800,
                end_ms=3800,
                band_low_hz=4500,
                band_high_hz=9000,
                gain_delta_db=-1.8,
                params={"threshold": -19, "ratio": 2.1},
            )
        else:
            action = _build_action(
                state,
                index=index,
                action_type="DYNAMIC_EQ",
                track_id=track_id,
                start_ms=1000,
                end_ms=4000,
                band_low_hz=250,
                band_high_hz=1200,
                gain_delta_db=-2.5,
                params={"threshold": -20, "ratio": 2.0},
            )
        actions.append(action)

    payload = {
        "groupTitle": "Workflow suggestion group",
        "groupSummary": "Candidate edit recipes generated from ranked analysis results.",
        "suggestions": [
            {
                "rank": 1,
                "summary": "Primary corrective action set",
                "explanation": "Use issue-aware actions on the most relevant tracks and regions.",
                "actions": actions,
            }
        ],
    }
    return _workflow_update(
        state,
        node="generate_suggestions",
        phase="suggestions_generated",
        progress=72,
        extra={"suggestion_payload": payload, "revise_count": revise_count},
    )


def hard_rule_validator(state: WorkflowState) -> WorkflowState:
    result = _decide_validation_result(state, mode_key="validator_mode")
    return _workflow_update(
        state,
        node="hard_rule_validator",
        phase="validator_checked",
        progress=76,
        extra={"validator_result": result},
    )


def semantic_critic(state: WorkflowState) -> WorkflowState:
    result = _decide_validation_result(state, mode_key="critic_mode")
    artifact_id = _artifact_id(state, "critic")
    return _workflow_update(
        state,
        node="semantic_critic",
        phase="semantic_critic_checked",
        progress=80,
        extra={
            "critic_result": result,
            "mongo_artifact_ids": [*state.get("mongo_artifact_ids", []), artifact_id],
            "latest_artifact_id": artifact_id,
        },
    )


def group_suggestions(state: WorkflowState) -> WorkflowState:
    suggestion_group_id = state.get("suggestion_group_id") or f"{state['job_id']}-group"
    preview_action_ids = [
        action["actionId"]
        for suggestion in state.get("suggestion_payload", {}).get("suggestions", [])
        for action in suggestion.get("actions", [])
    ]
    payload = deepcopy(state.get("suggestion_payload", {}))
    if payload:
        payload["groupSummary"] = (
            "Grouped by workflow stage, issue type, and dominant target track."
        )
    return _workflow_update(
        state,
        node="group_suggestions",
        phase="suggestions_grouped",
        progress=84,
        extra={
            "suggestion_group_id": suggestion_group_id,
            "preview_action_ids": preview_action_ids,
            "suggestion_payload": payload,
        },
    )


def auto_fix_clipping(state: WorkflowState) -> WorkflowState:
    clipping_fix_applied = "clipping" in state.get("detected_issues", [])
    notes = [*state.get("notes", [])]
    if clipping_fix_applied:
        notes.append("Applied deterministic clipping repair candidate.")
    return _workflow_update(
        state,
        node="auto_fix_clipping",
        phase="clipping_autofix_processed",
        progress=88,
        extra={
            "clipping_fix_applied": clipping_fix_applied,
            "notes": notes,
        },
    )


def log_clipping_fix(state: WorkflowState) -> WorkflowState:
    clipping_fix_log_id = None
    if state.get("clipping_fix_applied"):
        clipping_fix_log_id = f"{state['job_id']}-clipping-fix-log"
    return _workflow_update(
        state,
        node="log_clipping_fix",
        phase="clipping_fix_logged",
        progress=90,
        extra={"clipping_fix_log_id": clipping_fix_log_id},
    )


def persist_analysis_result(state: WorkflowState) -> WorkflowState:
    preview_id = state.get("preview_id") or f"{state['job_id']}-preview"
    return _workflow_update(
        state,
        node="persist_analysis_result",
        phase="analysis_result_persisted",
        progress=92,
        extra={
            "preview_id": preview_id,
            "user_action_required": bool(state.get("preview_action_ids")),
        },
    )


def user_action_gate(state: WorkflowState) -> WorkflowState:
    return _workflow_update(
        state,
        node="user_action_gate",
        phase="user_action_gate_checked",
        progress=94,
    )


def wait_user_selection(state: WorkflowState) -> WorkflowState:
    return _workflow_update(
        state,
        node="wait_user_selection",
        phase="waiting_for_user_selection",
        progress=95,
        runtime_status="waiting_for_user",
        durable_status="WAITING_USER",
    )


def apply_selected_edit_recipe(state: WorkflowState) -> WorkflowState:
    selected_action_ids = state.get("selected_action_ids", [])
    preview_action_ids = set(state.get("preview_action_ids", []))
    if not selected_action_ids:
        return fail_workflow(
            {
                **state,
                "failure_code": "EMPTY_SELECTION",
                "failure_message": "A selected edit recipe is required before applying actions.",
            }
        )
    if not set(selected_action_ids).issubset(preview_action_ids):
        return fail_workflow(
            {
                **state,
                "failure_code": "UNKNOWN_ACTION_SELECTION",
                "failure_message": "Selected actions must come from the preview action set.",
            }
        )
    return _workflow_update(
        state,
        node="apply_selected_edit_recipe",
        phase="selected_recipe_applied",
        progress=96,
        runtime_status="running",
        durable_status="IN_PROGRESS",
        extra={"apply_result_id": f"{state['job_id']}-apply"},
    )


def render_preview(state: WorkflowState) -> WorkflowState:
    return _workflow_update(
        state,
        node="render_preview",
        phase="preview_rendered",
        progress=97,
        extra={
            "preview_id": state.get("preview_id") or f"{state['job_id']}-preview",
            "user_decision": None,
        },
    )


def wait_user_confirm(state: WorkflowState) -> WorkflowState:
    return _workflow_update(
        state,
        node="wait_user_confirm",
        phase="waiting_for_user_confirm",
        progress=98,
        runtime_status="waiting_for_user",
        durable_status="WAITING_USER",
    )


def commit_selected_edit_recipe(state: WorkflowState) -> WorkflowState:
    return _workflow_update(
        state,
        node="commit_selected_edit_recipe",
        phase="selected_recipe_committed",
        progress=99,
        runtime_status="running",
        durable_status="IN_PROGRESS",
    )


def emit_feedback_event(state: WorkflowState) -> WorkflowState:
    return _workflow_update(
        state,
        node="emit_feedback_event",
        phase="feedback_event_emitted",
        progress=99,
        extra={"feedback_event_id": f"{state['job_id']}-feedback"},
    )


def finalize_output(state: WorkflowState) -> WorkflowState:
    notes = [*state.get("notes", [])]
    if state.get("user_decision") == "cancel":
        notes.append("User cancelled suggested edit application.")
    return _workflow_update(
        state,
        node="finalize_output",
        phase="completed",
        progress=100,
        runtime_status="completed",
        durable_status="COMPLETED",
        extra={"completed_at": utc_now(), "notes": notes},
    )


def fail_workflow(state: WorkflowState) -> WorkflowState:
    return _workflow_update(
        state,
        node="fail_workflow",
        phase="failed",
        progress=state.get("progress", 0),
        runtime_status="failed",
        durable_status="FAILED",
        extra={
            "completed_at": utc_now(),
            "failure_code": state.get("failure_code") or "WORKFLOW_FAILED",
            "failure_message": state.get("failure_message")
            or "The workflow could not complete successfully.",
        },
    )


def _append_issue_region(
    state: WorkflowState,
    *,
    node: str,
    phase: str,
    progress: int,
    issue: str,
    summary: str,
) -> WorkflowState:
    detected_issues = [*state.get("detected_issues", [])]
    analysis_regions = deepcopy(state.get("analysis_regions", []))
    artifact_id = _artifact_id(state, issue)
    if issue in state.get("issue_types", []) and issue not in detected_issues:
        region_id = f"{state['job_id']}-{issue}-region"
        detected_issues.append(issue)
        analysis_regions.append(
            {
                "id": region_id,
                "issue_type": issue,
                "summary": summary,
                "start_ms": 1000,
                "end_ms": 4000,
                "severity": "HIGH" if issue in {"clipping", "sibilance"} else "MEDIUM",
                "requires_user_action": issue != "clipping",
                "evidence_doc_id": artifact_id,
            }
        )
    return _workflow_update(
        state,
        node=node,
        phase=phase,
        progress=progress,
        extra={
            "detected_issues": detected_issues,
            "analysis_regions": analysis_regions,
            "mongo_artifact_ids": [*state.get("mongo_artifact_ids", []), artifact_id],
            "latest_artifact_id": artifact_id,
        },
    )


def _build_action(
    state: WorkflowState,
    *,
    index: int,
    action_type: str,
    track_id: int,
    start_ms: int,
    end_ms: int,
    band_low_hz: int | None = None,
    band_high_hz: int | None = None,
    gain_delta_db: float | None = None,
    params: dict | None = None,
) -> dict:
    return {
        "actionType": action_type,
        "targetTrackId": track_id,
        "targetClipId": None,
        "startMs": start_ms,
        "endMs": end_ms,
        "bandLowHz": band_low_hz,
        "bandHighHz": band_high_hz,
        "gainDeltaDb": gain_delta_db,
        "params": params or {},
        "actionId": f"{state['job_id']}-action-{index}",
    }


def _decide_validation_result(state: WorkflowState, *, mode_key: str) -> str:
    mode = state.get(mode_key, "PASS")
    revise_count = state.get("revise_count", 0)
    max_revise_count = state.get("max_revise_count", 1)
    if mode == "REJECT":
        return "REJECT"
    if mode == "REVISE_ONCE" and revise_count < max_revise_count:
        return "REVISE"
    return "PASS"
