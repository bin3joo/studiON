from __future__ import annotations

from copy import deepcopy
from math import sqrt

from app.graph.nodes.common import append_transition, artifact_id, workflow_update
from app.graph.state import WorkflowState, utc_now
from app.services.workflow_artifacts import WorkflowArtifactDocument, get_workflow_artifact_store
from app.services.workflow_jobs import WorkflowDispatchMessage, get_workflow_job_store
from app.services.workflow_preview_renderer import PreviewRenderError, resolve_preview_excerpt_range
from app.services.workflow_track_eq_commit import (
    TrackEqBandUpdatePayload,
    TrackEqCommitError,
    get_workflow_track_eq_commit_store,
)


def load_entry_context(state: WorkflowState) -> WorkflowState:
    dispatch_type = state.get("dispatch_type")
    if dispatch_type:
        return _load_worker_entry_context(state)
    return {
        "current_node": "load_entry_context",
        "phase": state.get("phase", "queued"),
        "progress": state.get("progress", 0),
        "heartbeat_at": utc_now(),
        "transition_log": append_transition(state, "load_entry_context"),
    }


def init_state(state: WorkflowState) -> WorkflowState:
    return workflow_update(
        state,
        node="init_state",
        phase="job_initialized",
        progress=4,
        runtime_status="running",
        durable_status="RUNNING",
        extra={"started_at": state.get("started_at") or utc_now()},
    )


def wait_user_plan_input(state: WorkflowState) -> WorkflowState:
    return workflow_update(
        state,
        node="wait_user_plan_input",
        phase="waiting_for_user_plan_input",
        progress=62,
        runtime_status="waiting_for_user",
        durable_status="WAITING_USER",
    )


def resume_after_plan_input(state: WorkflowState) -> WorkflowState:
    if not state.get("selected_region_id"):
        return fail_workflow(
            {
                **state,
                "failure_code": "MISSING_SELECTED_REGION",
                "failure_message": "A selected region is required before generating a plan.",
            }
        )
    if not state.get("preserve_clip_id"):
        return fail_workflow(
            {
                **state,
                "failure_code": "MISSING_PRESERVE_CLIP",
                "failure_message": "A preserve clip selection is required before planning.",
            }
        )
    validation_error = _validate_plan_input_selection(state)
    if validation_error is not None:
        return fail_workflow(
            {
                **state,
                "failure_code": validation_error[0],
                "failure_message": validation_error[1],
            }
        )
    notes = [*state.get("notes", [])]
    notes.append(
        f"User selected region {state['selected_region_id']} and preserve clip "
        f"{state['preserve_clip_id']} for plan generation."
    )
    if state.get("user_feedback_message"):
        notes.append(f"User feedback: {state['user_feedback_message']}")
    return workflow_update(
        state,
        node="resume_after_plan_input",
        phase="user_plan_input_resolved",
        progress=64,
        runtime_status="running",
        durable_status="RUNNING",
        extra={"notes": notes},
    )


def auto_fix_sibilance(state: WorkflowState) -> WorkflowState:
    sibilance_regions = [
        region
        for region in state.get("analysis_regions", [])
        if region.get("issue_type") == "sibilance"
    ]
    sibilance_fix_applied = bool(sibilance_regions)
    notes = [*state.get("notes", [])]
    auto_fix_recipe_artifact_id = None
    mongo_artifact_ids = [*state.get("mongo_artifact_ids", [])]
    latest_artifact_id = state.get("latest_artifact_id")

    if sibilance_fix_applied:
        recipes = [_build_sibilance_fix_recipe(region) for region in sibilance_regions]
        region_ids = [
            str(region.get("id"))
            for region in sibilance_regions
            if region.get("id") is not None
        ]
        track_ids = sorted(
            {
                int(region.get("track_id") or 0)
                for region in sibilance_regions
                if region.get("track_id") is not None
            }
        )
        applied_in_mixed_issue_flow = any(
            region.get("requires_user_action", True)
            for region in state.get("analysis_regions", [])
            if region.get("issue_type") != "sibilance"
        )
        auto_fix_recipe_artifact_id = artifact_id(state, "sibilance-auto-fix")
        get_workflow_artifact_store().upsert_artifact(
            WorkflowArtifactDocument(
                id=auto_fix_recipe_artifact_id,
                job_id=state["job_id"],
                artifact_type="auto_fix_recipe",
                payload={
                    "issueType": "sibilance",
                    "regionIds": region_ids,
                    "trackIds": track_ids,
                    "appliedInMixedIssueFlow": applied_in_mixed_issue_flow,
                    "recipes": recipes,
                },
            )
        )
        mongo_artifact_ids.append(auto_fix_recipe_artifact_id)
        latest_artifact_id = auto_fix_recipe_artifact_id
        notes.append(
            f"Applied deterministic sibilance repair recipe to {len(sibilance_regions)} region(s)."
        )
        if applied_in_mixed_issue_flow:
            notes.append(
                "사용자 승인 이슈와 함께 탐지된 치찰음도 "
                "같은 run에서 자동 보정 artifact로 기록했다."
            )

    return workflow_update(
        state,
        node="auto_fix_sibilance",
        phase="sibilance_autofix_processed",
        progress=88,
        extra={
            "clipping_fix_applied": False,
            "clipping_fix_log_id": None,
            "sibilance_fix_applied": sibilance_fix_applied,
            "auto_fix_recipe_artifact_id": auto_fix_recipe_artifact_id,
            "mongo_artifact_ids": mongo_artifact_ids,
            "latest_artifact_id": latest_artifact_id,
            "notes": notes,
        },
    )


def log_sibilance_fix(state: WorkflowState) -> WorkflowState:
    sibilance_fix_log_id = None
    mongo_artifact_ids = [*state.get("mongo_artifact_ids", [])]
    latest_artifact_id = state.get("latest_artifact_id")
    notes = [*state.get("notes", [])]

    if state.get("sibilance_fix_applied"):
        sibilance_regions = [
            region
            for region in state.get("analysis_regions", [])
            if region.get("issue_type") == "sibilance"
        ]
        sibilance_fix_log_id = artifact_id(state, "sibilance-fix-log")
        get_workflow_artifact_store().upsert_artifact(
            WorkflowArtifactDocument(
                id=sibilance_fix_log_id,
                job_id=state["job_id"],
                artifact_type="auto_fix_log",
                payload={
                    "logVersion": 1,
                    "issueType": "sibilance",
                    "recipeArtifactId": state.get("auto_fix_recipe_artifact_id"),
                    "applied": True,
                    "regionIds": [
                        str(region.get("id"))
                        for region in sibilance_regions
                        if region.get("id") is not None
                    ],
                    "trackIds": sorted(
                        {
                            int(region.get("track_id") or 0)
                            for region in sibilance_regions
                            if region.get("track_id") is not None
                        }
                    ),
                    "regionCount": len(sibilance_regions),
                },
            )
        )
        mongo_artifact_ids.append(sibilance_fix_log_id)
        latest_artifact_id = sibilance_fix_log_id
        notes.append(
            f"치찰음 자동 보정 로그 artifact {sibilance_fix_log_id}를 기록했다."
        )

    return workflow_update(
        state,
        node="log_sibilance_fix",
        phase="sibilance_fix_logged",
        progress=90,
        extra={
            "sibilance_fix_log_id": sibilance_fix_log_id,
            "mongo_artifact_ids": mongo_artifact_ids,
            "latest_artifact_id": latest_artifact_id,
            "notes": notes,
        },
    )


def auto_fix_non_user_issues(state: WorkflowState) -> WorkflowState:
    notes = [*state.get("notes", [])]
    mongo_artifact_ids = [*state.get("mongo_artifact_ids", [])]
    latest_artifact_id = state.get("latest_artifact_id")
    auto_fix_recipe_artifact_id = None
    grouped_recipes = _build_non_user_issue_recipe_groups(state)

    clipping_fix_applied = any(
        group["issueType"] in {"track_clipping", "master_clipping"} for group in grouped_recipes
    )
    sibilance_fix_applied = any(group["issueType"] == "sibilance" for group in grouped_recipes)
    high_band_harshness_fix_applied = any(
        group["issueType"] == "high_band_harshness" for group in grouped_recipes
    )

    if grouped_recipes:
        first_group = grouped_recipes[0]
        auto_fix_recipe_artifact_id = artifact_id(state, "non-user-auto-fix")
        get_workflow_artifact_store().upsert_artifact(
            WorkflowArtifactDocument(
                id=auto_fix_recipe_artifact_id,
                job_id=state["job_id"],
                artifact_type="auto_fix_recipe",
                payload={
                    "recipeVersion": 2,
                    "issueType": first_group["issueType"],
                    "regionIds": first_group["regionIds"],
                    "trackIds": first_group["trackIds"],
                    "appliedInMixedIssueFlow": first_group["appliedInMixedIssueFlow"],
                    "containsPromotedMasterContributor": first_group[
                        "containsPromotedMasterContributor"
                    ],
                    "recipes": first_group["recipes"],
                    "groups": grouped_recipes,
                },
            )
        )
        mongo_artifact_ids.append(auto_fix_recipe_artifact_id)
        latest_artifact_id = auto_fix_recipe_artifact_id
        notes.append(
            "Applied deterministic auto-fix recipes to "
            f"{len(grouped_recipes)} non-user issue group(s)."
        )

    return workflow_update(
        state,
        node="auto_fix_non_user_issues",
        phase="non_user_issue_autofix_processed",
        progress=88,
        extra={
            "clipping_fix_applied": clipping_fix_applied,
            "clipping_fix_log_id": None,
            "sibilance_fix_applied": sibilance_fix_applied,
            "sibilance_fix_log_id": None,
            "high_band_harshness_fix_applied": high_band_harshness_fix_applied,
            "auto_fix_log_artifact_id": None,
            "auto_fix_recipe_artifact_id": auto_fix_recipe_artifact_id,
            "mongo_artifact_ids": mongo_artifact_ids,
            "latest_artifact_id": latest_artifact_id,
            "notes": notes,
        },
    )


def log_non_user_issue_fixes(state: WorkflowState) -> WorkflowState:
    grouped_recipes = _build_non_user_issue_recipe_groups(state)
    mongo_artifact_ids = [*state.get("mongo_artifact_ids", [])]
    latest_artifact_id = state.get("latest_artifact_id")
    notes = [*state.get("notes", [])]
    auto_fix_log_artifact_id = None

    if grouped_recipes:
        first_group = grouped_recipes[0]
        auto_fix_log_artifact_id = artifact_id(state, "non-user-auto-fix-log")
        get_workflow_artifact_store().upsert_artifact(
            WorkflowArtifactDocument(
                id=auto_fix_log_artifact_id,
                job_id=state["job_id"],
                artifact_type="auto_fix_log",
                payload={
                    "logVersion": 2,
                    "recipeArtifactId": state.get("auto_fix_recipe_artifact_id"),
                    "issueType": first_group["issueType"],
                    "regionIds": first_group["regionIds"],
                    "trackIds": first_group["trackIds"],
                    "regionCount": first_group["regionCount"],
                    "groups": [
                        {
                            "issueType": group["issueType"],
                            "applied": True,
                            "regionIds": group["regionIds"],
                            "trackIds": group["trackIds"],
                            "regionCount": group["regionCount"],
                            "containsPromotedMasterContributor": group[
                                "containsPromotedMasterContributor"
                            ],
                        }
                        for group in grouped_recipes
                    ],
                },
            )
        )
        mongo_artifact_ids.append(auto_fix_log_artifact_id)
        latest_artifact_id = auto_fix_log_artifact_id
        notes.append(f"Recorded non-user auto-fix log artifact {auto_fix_log_artifact_id}.")

    return workflow_update(
        state,
        node="log_non_user_issue_fixes",
        phase="non_user_issue_fixes_logged",
        progress=90,
        extra={
            "clipping_fix_log_id": (
                auto_fix_log_artifact_id if state.get("clipping_fix_applied") else None
            ),
            "sibilance_fix_log_id": (
                auto_fix_log_artifact_id if state.get("sibilance_fix_applied") else None
            ),
            "auto_fix_log_artifact_id": auto_fix_log_artifact_id,
            "mongo_artifact_ids": mongo_artifact_ids,
            "latest_artifact_id": latest_artifact_id,
            "notes": notes,
        },
    )


def persist_analysis_result(state: WorkflowState) -> WorkflowState:
    preview_id = state.get("preview_id")
    user_action_required = any(
        bool(region.get("requires_user_action")) for region in state.get("analysis_regions", [])
    ) and bool(state.get("preview_action_ids"))
    if user_action_required:
        preview_id = preview_id or f"{state['job_id']}-preview"
    return workflow_update(
        state,
        node="persist_analysis_result",
        phase="analysis_result_persisted",
        progress=92,
        extra={
            "preview_id": preview_id,
            "user_action_required": user_action_required,
        },
    )


def user_action_gate(state: WorkflowState) -> WorkflowState:
    return workflow_update(
        state,
        node="user_action_gate",
        phase="user_action_gate_checked",
        progress=94,
    )


def apply_selected_edit_recipe(state: WorkflowState) -> WorkflowState:
    preview_action_ids = [*state.get("preview_action_ids", [])]
    if not preview_action_ids:
        return fail_workflow(
            {
                **state,
                "failure_code": "MISSING_PREVIEW_ACTION",
                "failure_message": (
                    "대표 레시피를 적용하기 전에 "
                    "프리뷰 액션이 필요합니다."
                ),
            }
        )
    if len(preview_action_ids) != 1:
        return fail_workflow(
            {
                **state,
                "failure_code": "INVALID_PREVIEW_ACTION_COUNT",
                "failure_message": (
                    "현재 MVP 흐름에서는 대표 프리뷰 액션이 "
                    "정확히 1개여야 합니다."
                ),
            }
        )
    notes = [*state.get("notes", [])]
    notes.append(
        "Automatically applied representative preview action "
        f"{preview_action_ids[0]} without selection wait."
    )
    requested_at = utc_now()
    return workflow_update(
        state,
        node="apply_selected_edit_recipe",
        phase="selected_recipe_applied",
        progress=96,
        runtime_status="running",
        durable_status="RUNNING",
        extra={
            "apply_result_id": f"{state['job_id']}-apply",
            "preview_suggestion_id": _resolve_preview_suggestion_id(
                state,
                preview_action_id=preview_action_ids[0],
            ),
            "preview_status": "PROCESSING",
            "preview_render_no": max(int(state.get("preview_render_no", 1) or 1), 1),
            "preview_excerpt_start_ms": None,
            "preview_excerpt_end_ms": None,
            "preview_requested_at": requested_at,
            "preview_started_at": None,
            "preview_completed_at": None,
            "preview_expired_at": None,
            "preview_error_code": None,
            "preview_error_message": None,
            "notes": notes,
        },
    )


def render_preview(state: WorkflowState) -> WorkflowState:
    preview_id = state.get("preview_id") or f"{state['job_id']}-preview"
    started_at = utc_now()
    try:
        focus_region = _resolve_preview_focus_region(state)
        _resolve_preview_action(state)
        excerpt_start_ms, excerpt_end_ms = resolve_preview_excerpt_range(
            clip_index=state.get("clip_index", []),
            focus_region=focus_region,
            project_duration_ms=state.get("project_duration_ms"),
        )
    except PreviewRenderError as exc:
        return fail_workflow(
            {
                **state,
                "preview_id": preview_id,
                "preview_status": "FAILED",
                "preview_started_at": started_at,
                "preview_completed_at": utc_now(),
                "preview_error_code": exc.code,
                "preview_error_message": exc.message,
                "failure_code": exc.code,
                "failure_message": exc.message,
            }
        )

    return workflow_update(
        state,
        node="render_preview",
        phase="preview_rendered",
        progress=97,
        extra={
            "preview_id": preview_id,
            "preview_status": "READY",
            "preview_excerpt_start_ms": excerpt_start_ms,
            "preview_excerpt_end_ms": excerpt_end_ms,
            "preview_started_at": started_at,
            "preview_completed_at": utc_now(),
            "preview_error_code": None,
            "preview_error_message": None,
            "user_decision": None,
        },
    )


def wait_user_confirm(state: WorkflowState) -> WorkflowState:
    return workflow_update(
        state,
        node="wait_user_confirm",
        phase="waiting_for_user_confirm",
        progress=98,
        runtime_status="waiting_for_user",
        durable_status="WAITING_USER",
    )


def commit_selected_edit_recipe(state: WorkflowState) -> WorkflowState:
    try:
        action = _resolve_preview_action(state)
        target_track_id, band_update = _build_track_eq_band_update_payload(state, action=action)
        store = get_workflow_track_eq_commit_store()
        if store is None:
            raise TrackEqCommitError(
                "TRACK_EQ_STORE_UNAVAILABLE",
                "track_eq commit을 수행할 MySQL 저장소를 구성하지 못했습니다.",
            )
        track_eq = store.get_track_eq_by_track_id(target_track_id)
        if track_eq is None:
            raise TrackEqCommitError(
                "TRACK_EQ_NOT_FOUND",
                f"트랙 {target_track_id}의 track_eq row를 찾지 못했습니다.",
            )
        active_band = store.get_active_track_eq_band(track_eq.id)
        if active_band is None:
            raise TrackEqCommitError(
                "ACTIVE_TRACK_EQ_BAND_NOT_FOUND",
                f"track_eq {track_eq.id}에 활성 track_eq_band가 없습니다.",
            )
        committed_band = store.update_track_eq_band(active_band.id, band_update)
    except PreviewRenderError as exc:
        return fail_workflow(
            {
                **state,
                "failure_code": exc.code,
                "failure_message": exc.message,
            }
        )
    except TrackEqCommitError as exc:
        return fail_workflow(
            {
                **state,
                "failure_code": exc.code,
                "failure_message": exc.message,
            }
        )

    notes = [*state.get("notes", [])]
    notes.append(
        f"트랙 {target_track_id}의 EQ band {committed_band.id}를 "
        f"preview action {band_update.suggestion_action_id} 기준으로 갱신했다."
    )
    return workflow_update(
        state,
        node="commit_selected_edit_recipe",
        phase="selected_recipe_committed",
        progress=99,
        runtime_status="running",
        durable_status="RUNNING",
        extra={
            "committed_track_eq_band_id": committed_band.id,
            "notes": notes,
        },
    )


def emit_feedback_event(state: WorkflowState) -> WorkflowState:
    return workflow_update(
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
    return workflow_update(
        state,
        node="finalize_output",
        phase="completed",
        progress=100,
        runtime_status="completed",
        durable_status="COMPLETED",
        extra={"completed_at": utc_now(), "notes": notes},
    )


def fail_workflow(state: WorkflowState) -> WorkflowState:
    return workflow_update(
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
            "preview_id": state.get("preview_id"),
            "preview_suggestion_id": state.get("preview_suggestion_id"),
            "preview_status": state.get("preview_status"),
            "preview_render_no": state.get("preview_render_no", 1),
            "preview_excerpt_start_ms": state.get("preview_excerpt_start_ms"),
            "preview_excerpt_end_ms": state.get("preview_excerpt_end_ms"),
            "preview_requested_at": state.get("preview_requested_at"),
            "preview_started_at": state.get("preview_started_at"),
            "preview_completed_at": state.get("preview_completed_at"),
            "preview_expired_at": state.get("preview_expired_at"),
            "preview_error_code": state.get("preview_error_code"),
            "preview_error_message": state.get("preview_error_message"),
        },
    )


def _load_worker_entry_context(state: WorkflowState) -> WorkflowState:
    store = get_workflow_job_store()
    job = store.get_job(state["job_id"])
    if job is None:
        return _entry_failure(
            state,
            failure_code="WORKFLOW_JOB_NOT_FOUND",
            failure_message="The workflow job could not be restored for worker execution.",
        )
    if job.project_id != state["project_id"]:
        return _entry_failure(
            state,
            failure_code="WORKFLOW_PROJECT_MISMATCH",
            failure_message="The queued workflow payload did not match the stored project.",
        )

    dispatch = WorkflowDispatchMessage.model_validate(
        {
            "job_id": state["job_id"],
            "project_id": state["project_id"],
            "dispatch_type": state["dispatch_type"],
            "requested_by": state.get("requested_by"),
            "selected_region_id": state.get("selected_region_id"),
            "preserve_clip_id": state.get("preserve_clip_id"),
            "user_feedback_message": state.get("user_feedback_message"),
            "user_decision": state.get("user_decision"),
        }
    )
    failure = _validate_dispatch(job.state_snapshot, dispatch)
    if failure is not None:
        return _entry_failure(state, failure_code=failure[0], failure_message=failure[1])

    restored = deepcopy(job.state_snapshot)
    restored.update(
        {
            "job_id": dispatch.job_id,
            "project_id": dispatch.project_id,
            "dispatch_type": dispatch.dispatch_type,
            "requested_by": dispatch.requested_by
            if dispatch.requested_by is not None
            else restored.get("requested_by"),
            "runtime_status": "running",
            "durable_status": "RUNNING",
            "heartbeat_at": utc_now(),
            "transition_log": append_transition(restored, "load_entry_context"),
            "current_node": "load_entry_context",
        }
    )
    if dispatch.selected_region_id is not None:
        restored["selected_region_id"] = dispatch.selected_region_id
    if dispatch.preserve_clip_id is not None:
        restored["preserve_clip_id"] = dispatch.preserve_clip_id
    if dispatch.user_feedback_message is not None:
        restored["user_feedback_message"] = dispatch.user_feedback_message
    if dispatch.user_decision is not None:
        restored["user_decision"] = dispatch.user_decision
    return restored


def _validate_dispatch(
    snapshot: dict,
    dispatch: WorkflowDispatchMessage,
) -> tuple[str, str] | None:
    phase = snapshot.get("phase", "queued")
    if dispatch.dispatch_type == "start":
        if phase != "queued":
            return (
                "INVALID_START_PHASE",
                f"Queued workflow start expected 'queued' phase, got '{phase}'.",
            )
        return None
    if dispatch.dispatch_type == "resume_plan_input":
        if phase != "waiting_for_user_plan_input":
            return (
                "INVALID_RESUME_PHASE",
                f"Plan-input resume expected 'waiting_for_user_plan_input', got '{phase}'.",
            )
        if dispatch.selected_region_id is None:
            return (
                "MISSING_SELECTED_REGION",
                "selected_region_id is required for plan-input resume.",
            )
        if dispatch.preserve_clip_id is None:
            return (
                "MISSING_PRESERVE_CLIP",
                "preserve_clip_id is required for plan-input resume.",
            )
        restored_snapshot = deepcopy(snapshot)
        restored_snapshot["selected_region_id"] = dispatch.selected_region_id
        restored_snapshot["preserve_clip_id"] = dispatch.preserve_clip_id
        selection_error = _validate_plan_input_selection(restored_snapshot)
        if selection_error is not None:
            return selection_error
        return None
    if phase != "waiting_for_user_confirm":
        return (
            "INVALID_RESUME_PHASE",
            f"Confirmation resume expected 'waiting_for_user_confirm', got '{phase}'.",
        )
    if dispatch.user_decision is None:
        return ("MISSING_USER_DECISION", "user_decision is required for confirmation resume.")
    return None


def _entry_failure(
    state: WorkflowState,
    *,
    failure_code: str,
    failure_message: str,
) -> WorkflowState:
    return {
        "current_node": "load_entry_context",
        "phase": state.get("phase", "queued"),
        "progress": state.get("progress", 0),
        "heartbeat_at": utc_now(),
        "transition_log": append_transition(state, "load_entry_context"),
        "runtime_status": "failed",
        "durable_status": "FAILED",
        "failure_code": failure_code,
        "failure_message": failure_message,
    }


def _validate_plan_input_selection(state: WorkflowState) -> tuple[str, str] | None:
    selected_region_id = state.get("selected_region_id")
    preserve_clip_id = state.get("preserve_clip_id")
    ranked_candidate_ids = [str(region_id) for region_id in state.get("ranked_candidate_ids", [])]
    if selected_region_id is None or preserve_clip_id is None:
        return None
    if str(selected_region_id) not in ranked_candidate_ids:
        return (
            "INVALID_SELECTED_REGION",
            "selected_region_id must reference a ranked user-action candidate.",
        )
    selected_region = next(
        (
            region
            for region in state.get("analysis_regions", [])
            if str(region.get("id")) == str(selected_region_id)
        ),
        None,
    )
    if not isinstance(selected_region, dict):
        return (
            "INVALID_SELECTED_REGION",
            "selected_region_id did not match a known analysis region.",
        )
    if not bool(selected_region.get("requires_user_action")):
        return (
            "INVALID_SELECTED_REGION",
            "selected_region_id must reference a user-action issue.",
        )
    affected_clip_ids = {
        int(clip_id)
        for clip_id in selected_region.get("affected_clip_ids", [])
        if clip_id is not None
    }
    if affected_clip_ids and int(preserve_clip_id) not in affected_clip_ids:
        return (
            "INVALID_PRESERVE_CLIP",
            "preserve_clip_id must belong to the selected region.",
        )
    return None


def _resolve_preview_action(state: WorkflowState) -> dict[str, object]:
    preview_action_ids = [*state.get("preview_action_ids", [])]
    if len(preview_action_ids) != 1:
        raise PreviewRenderError(
            "INVALID_PREVIEW_ACTION_COUNT",
            "프리뷰 렌더링에는 대표 프리뷰 액션이 정확히 1개 필요합니다.",
        )
    preview_action_id = preview_action_ids[0]
    payload = state.get("suggestion_payload") or {}
    for suggestion in payload.get("suggestions", []):
        for action in suggestion.get("actions", []):
            if action.get("actionId") == preview_action_id:
                return action
    raise PreviewRenderError(
        "PREVIEW_ACTION_NOT_FOUND",
        f"preview action {preview_action_id}를 suggestion_payload에서 찾지 못했습니다.",
    )


def _resolve_preview_focus_region(state: WorkflowState) -> dict[str, object]:
    selected_region_id = state.get("selected_region_id")
    if selected_region_id is None:
        raise PreviewRenderError(
            "PREVIEW_REGION_NOT_FOUND",
            "프리뷰 렌더링에는 선택된 문제 구간 정보가 필요합니다.",
        )
    for region in state.get("analysis_regions", []):
        if str(region.get("id")) == str(selected_region_id):
            return region
    raise PreviewRenderError(
        "PREVIEW_REGION_NOT_FOUND",
        f"selected region {selected_region_id}를 analysis_regions에서 찾지 못했습니다.",
    )


def _resolve_preview_suggestion_id(
    state: WorkflowState,
    *,
    preview_action_id: str,
) -> str | None:
    payload = state.get("suggestion_payload") or {}
    group_id = state.get("suggestion_group_id") or f"{state['job_id']}-group"
    for suggestion_index, suggestion in enumerate(payload.get("suggestions", []), start=1):
        for action in suggestion.get("actions", []):
            if action.get("actionId") == preview_action_id:
                return f"{group_id}-suggestion-{suggestion_index}"
    return None


def _build_track_eq_band_update_payload(
    state: WorkflowState,
    *,
    action: dict[str, object],
) -> tuple[int, TrackEqBandUpdatePayload]:
    action_type = str(action.get("actionType") or "")
    target_scope = str(action.get("targetScope") or "")
    target_track_id = action.get("targetTrackId")
    if action_type not in {"DYNAMIC_EQ", "EQ_CUT"} or target_scope != "TRACK":
        raise TrackEqCommitError(
            "UNSUPPORTED_COMMIT_ACTION",
            (
                "현재 commit_selected_edit_recipe는 TRACK scope의 "
                "EQ 계열 action(DYNAMIC_EQ/EQ_CUT)만 반영할 수 있습니다."
            ),
        )
    if not isinstance(target_track_id, int):
        raise TrackEqCommitError(
            "UNSUPPORTED_COMMIT_ACTION",
            "TRACK EQ commit에는 정수 targetTrackId가 필요합니다.",
        )
    gain_delta_db = action.get("gainDeltaDb")
    if not isinstance(gain_delta_db, int | float):
        raise TrackEqCommitError(
            "INVALID_EQ_BAND_MAPPING",
            "EQ commit에는 숫자 gainDeltaDb가 필요합니다.",
        )

    # action payload에는 실제 DB용 중심 주파수와 Q가 없어서,
    # MVP에서는 대역 범위를 BELL band 1개로 투영하는 규칙을 여기서 고정한다.
    frequency_hz = _resolve_eq_center_frequency(action)
    q = _resolve_eq_q_value(action, frequency_hz=frequency_hz)
    preview_action_id = str(action.get("actionId") or "")
    applied_suggestion_id = state.get("apply_result_id") or state.get("preview_suggestion_id")
    if applied_suggestion_id is None and preview_action_id:
        applied_suggestion_id = _resolve_preview_suggestion_id(
            state,
            preview_action_id=preview_action_id,
        )
    return target_track_id, TrackEqBandUpdatePayload(
        eq_type_code="BELL",
        frequency_hz=frequency_hz,
        q=q,
        gain_delta_db=round(float(gain_delta_db), 3),
        job_id=int(state["job_id"]),
        suggestion_action_id=preview_action_id,
        applied_suggestion_id=applied_suggestion_id,
        source_type_code="AI_SUGGESTION",
        updated_by=int(state.get("requested_by") or 0),
    )


def _resolve_eq_center_frequency(action: dict[str, object]) -> int:
    band_low_hz, band_high_hz = _resolve_eq_band_bounds(action)
    if band_low_hz <= 0 or band_high_hz <= 0:
        raise TrackEqCommitError(
            "INVALID_EQ_BAND_MAPPING",
            "EQ 중심 주파수를 계산하려면 양수 bandLowHz/bandHighHz가 필요합니다.",
        )
    return int(round(sqrt(band_low_hz * band_high_hz)))


def _resolve_eq_q_value(
    action: dict[str, object],
    *,
    frequency_hz: int,
) -> float:
    params = action.get("params") or {}
    if isinstance(params, dict):
        q_value = params.get("q")
        if isinstance(q_value, int | float) and float(q_value) > 0:
            return round(float(q_value), 3)
    band_low_hz, band_high_hz = _resolve_eq_band_bounds(action)
    bandwidth_hz = band_high_hz - band_low_hz
    if bandwidth_hz <= 0:
        raise TrackEqCommitError(
            "INVALID_EQ_BAND_MAPPING",
            "EQ Q 값을 계산하려면 bandHighHz가 bandLowHz보다 커야 합니다.",
        )
    q_value = float(frequency_hz) / float(bandwidth_hz)
    if q_value <= 0:
        raise TrackEqCommitError(
            "INVALID_EQ_BAND_MAPPING",
            "계산된 EQ Q 값이 유효하지 않습니다.",
        )
    return round(q_value, 3)


def _resolve_eq_band_bounds(action: dict[str, object]) -> tuple[int, int]:
    band_low_hz = action.get("bandLowHz")
    band_high_hz = action.get("bandHighHz")
    if not isinstance(band_low_hz, int) or not isinstance(band_high_hz, int):
        raise TrackEqCommitError(
            "INVALID_EQ_BAND_MAPPING",
            "EQ commit에는 정수 bandLowHz/bandHighHz가 필요합니다.",
        )
    return band_low_hz, band_high_hz


def _build_sibilance_fix_recipe(region: dict[str, object]) -> dict[str, object]:
    score = float(region.get("score", 0.0))
    reduction_target_db = round(min(max(1.5 + (score * 8.0), 2.0), 6.5), 2)
    return {
        "regionId": region.get("id"),
        "actionType": "DE_ESSER",
        "targetScope": "TRACK",
        "targetTrackId": int(region.get("track_id") or 0),
        "startMs": int(region.get("start_ms") or 0),
        "endMs": int(region.get("end_ms") or 0),
        "bandLowHz": region.get("band_low_hz"),
        "bandHighHz": region.get("band_high_hz"),
        "params": {
            "threshold": -18,
            "ratio": 2.4,
            "attackMs": 2,
            "releaseMs": 60,
            "mix": 1.0,
            "gainReductionDbTarget": reduction_target_db,
        },
    }


def _build_non_user_issue_recipe_groups(state: WorkflowState) -> list[dict[str, object]]:
    issue_builders = {
        "track_clipping": _build_track_clipping_fix_recipe,
        "high_band_harshness": _build_high_band_harshness_fix_recipe,
        "sibilance": _build_sibilance_fix_recipe,
        "master_clipping": _build_master_clipping_fix_recipe,
    }
    ordered_issue_types = [
        "track_clipping",
        "high_band_harshness",
        "sibilance",
        "master_clipping",
    ]
    mixed_issue_flow = any(
        bool(region.get("requires_user_action")) for region in state.get("analysis_regions", [])
    )
    groups: list[dict[str, object]] = []
    for issue_type in ordered_issue_types:
        regions = [
            region
            for region in state.get("analysis_regions", [])
            if region.get("issue_type") == issue_type
        ]
        if not regions:
            continue
        builder = issue_builders[issue_type]
        groups.append(
            {
                "issueType": issue_type,
                "regionIds": [
                    str(region.get("id")) for region in regions if region.get("id") is not None
                ],
                "trackIds": sorted(
                    {
                        int(region.get("track_id") or 0)
                        for region in regions
                        if region.get("track_id") is not None
                    }
                ),
                "regionCount": len(regions),
                "appliedInMixedIssueFlow": mixed_issue_flow,
                "containsPromotedMasterContributor": any(
                    region.get("auto_fix_source") == "promoted_master_contributor"
                    for region in regions
                ),
                "recipes": [builder(region) for region in regions],
            }
        )
    return groups


def _build_track_clipping_fix_recipe(region: dict[str, object]) -> dict[str, object]:
    score = float(region.get("score", 0.0))
    gain_trim_db = round(min(max(1.0 + (score * 4.0), 1.5), 4.5), 2)
    band_hints = _collect_track_clipping_band_hints(region)
    action_type = "GAIN_TRIM"
    band_low_hz = None
    band_high_hz = None
    gain_delta_db: float | None = -gain_trim_db
    params: dict[str, object] = {"preGainDb": -gain_trim_db}
    if "high" in band_hints:
        action_type = "DYNAMIC_EQ"
        band_low_hz = 4500
        band_high_hz = 9000
        gain_delta_db = -round(min(max(1.0 + (score * 2.2), 1.5), 3.0), 2)
        params = {"threshold": -20, "ratio": 2.0, "preGainDb": -gain_trim_db}
    elif "low_mid" in band_hints:
        action_type = "EQ_CUT"
        band_low_hz = 180
        band_high_hz = 1200
        gain_delta_db = -round(min(max(0.8 + (score * 1.6), 1.2), 2.8), 2)
        params = {"q": 1.1, "preGainDb": -gain_trim_db}
    return {
        "regionId": region.get("id"),
        "actionType": action_type,
        "targetScope": "TRACK",
        "targetTrackId": int(region.get("track_id") or 0),
        "startMs": int(region.get("start_ms") or 0),
        "endMs": int(region.get("end_ms") or 0),
        "bandLowHz": band_low_hz,
        "bandHighHz": band_high_hz,
        "gainDeltaDb": gain_delta_db,
        "params": params,
        "origin": region.get("auto_fix_source", "direct_detection"),
        "sourceMasterCandidateId": region.get("source_master_candidate_id"),
    }


def _build_high_band_harshness_fix_recipe(region: dict[str, object]) -> dict[str, object]:
    score = float(region.get("score", 0.0))
    reduction_db = round(min(max(1.2 + (score * 2.5), 1.5), 3.5), 2)
    return {
        "regionId": region.get("id"),
        "actionType": "DYNAMIC_EQ",
        "targetScope": "TRACK",
        "targetTrackId": int(region.get("track_id") or 0),
        "startMs": int(region.get("start_ms") or 0),
        "endMs": int(region.get("end_ms") or 0),
        "bandLowHz": region.get("band_low_hz"),
        "bandHighHz": region.get("band_high_hz"),
        "gainDeltaDb": -reduction_db,
        "params": {"threshold": -20, "ratio": 2.1},
    }


def _build_master_clipping_fix_recipe(region: dict[str, object]) -> dict[str, object]:
    score = float(region.get("score", 0.0))
    pre_gain_db = round(min(max(1.5 + (score * 3.5), 2.0), 5.0), 2)
    action_type = "TRUE_PEAK_LIMITER"
    gain_delta_db = None
    params: dict[str, object] = {
        "preGainDb": -pre_gain_db,
        "ceilingDbfs": -1.0,
        "attackMs": 2,
        "releaseMs": 80,
        "lookaheadMs": 3,
    }
    if float(region.get("score", 0.0)) < 0.2 and not region.get("contributing_track_ids"):
        action_type = "GAIN_TRIM"
        gain_delta_db = -pre_gain_db
        params = {"preGainDb": -pre_gain_db}
    return {
        "regionId": region.get("id"),
        "actionType": action_type,
        "targetScope": "MASTER",
        "targetTrackId": None,
        "startMs": int(region.get("start_ms") or 0),
        "endMs": int(region.get("end_ms") or 0),
        "bandLowHz": None,
        "bandHighHz": None,
        "gainDeltaDb": gain_delta_db,
        "params": params,
        "origin": region.get("auto_fix_source", "residual_master_clipping"),
        "sourceMasterCandidateId": region.get("source_master_candidate_id"),
    }


def _collect_track_clipping_band_hints(region: dict[str, object]) -> set[str]:
    hints: set[str] = set()
    for hint in region.get("band_hints", []) or []:
        hints.add(str(hint))
    contributor_hints = region.get("contributor_band_hints", {})
    track_id = region.get("track_id")
    if track_id is not None and str(track_id) in contributor_hints:
        hints.update(str(hint) for hint in contributor_hints[str(track_id)])
    if track_id in contributor_hints:
        hints.update(str(hint) for hint in contributor_hints[track_id])
    return hints
