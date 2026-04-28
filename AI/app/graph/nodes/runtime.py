from __future__ import annotations

from copy import deepcopy

from app.graph.nodes.common import append_transition, artifact_id, workflow_update
from app.graph.state import WorkflowState, utc_now
from app.services.workflow_artifacts import WorkflowArtifactDocument, get_workflow_artifact_store
from app.services.workflow_jobs import WorkflowDispatchMessage, get_workflow_job_store


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
        durable_status="IN_PROGRESS",
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
                "failure_message": (
                    "A selected region is required before generating a plan."
                ),
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
        durable_status="IN_PROGRESS",
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
        auto_fix_recipe_artifact_id = artifact_id(state, "sibilance-auto-fix")
        get_workflow_artifact_store().upsert_artifact(
            WorkflowArtifactDocument(
                id=auto_fix_recipe_artifact_id,
                job_id=state["job_id"],
                artifact_type="auto_fix_recipe",
                payload={
                    "issueType": "sibilance",
                    "recipes": [_build_sibilance_fix_recipe(region) for region in sibilance_regions],
                },
            )
        )
        mongo_artifact_ids.append(auto_fix_recipe_artifact_id)
        latest_artifact_id = auto_fix_recipe_artifact_id
        notes.append(
            f"Applied deterministic sibilance repair recipe to {len(sibilance_regions)} region(s)."
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

    if state.get("sibilance_fix_applied"):
        sibilance_fix_log_id = artifact_id(state, "sibilance-fix-log")
        get_workflow_artifact_store().upsert_artifact(
            WorkflowArtifactDocument(
                id=sibilance_fix_log_id,
                job_id=state["job_id"],
                artifact_type="auto_fix_log",
                payload={
                    "issueType": "sibilance",
                    "recipeArtifactId": state.get("auto_fix_recipe_artifact_id"),
                    "regionCount": len(
                        [
                            region
                            for region in state.get("analysis_regions", [])
                            if region.get("issue_type") == "sibilance"
                        ]
                    ),
                },
            )
        )
        mongo_artifact_ids.append(sibilance_fix_log_id)
        latest_artifact_id = sibilance_fix_log_id

    return workflow_update(
        state,
        node="log_sibilance_fix",
        phase="sibilance_fix_logged",
        progress=90,
        extra={
            "sibilance_fix_log_id": sibilance_fix_log_id,
            "mongo_artifact_ids": mongo_artifact_ids,
            "latest_artifact_id": latest_artifact_id,
        },
    )


def persist_analysis_result(state: WorkflowState) -> WorkflowState:
    preview_id = state.get("preview_id")
    if state.get("preview_action_ids"):
        preview_id = preview_id or f"{state['job_id']}-preview"
    return workflow_update(
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
    return workflow_update(
        state,
        node="user_action_gate",
        phase="user_action_gate_checked",
        progress=94,
    )


def wait_user_selection(state: WorkflowState) -> WorkflowState:
    return workflow_update(
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
    return workflow_update(
        state,
        node="apply_selected_edit_recipe",
        phase="selected_recipe_applied",
        progress=96,
        runtime_status="running",
        durable_status="IN_PROGRESS",
        extra={"apply_result_id": f"{state['job_id']}-apply"},
    )


def render_preview(state: WorkflowState) -> WorkflowState:
    return workflow_update(
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
    return workflow_update(
        state,
        node="wait_user_confirm",
        phase="waiting_for_user_confirm",
        progress=98,
        runtime_status="waiting_for_user",
        durable_status="WAITING_USER",
    )


def commit_selected_edit_recipe(state: WorkflowState) -> WorkflowState:
    return workflow_update(
        state,
        node="commit_selected_edit_recipe",
        phase="selected_recipe_committed",
        progress=99,
        runtime_status="running",
        durable_status="IN_PROGRESS",
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
            "selected_action_ids": state.get("selected_action_ids", []),
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
            "durable_status": "IN_PROGRESS",
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
    if dispatch.selected_action_ids:
        restored["selected_action_ids"] = dispatch.selected_action_ids
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
        return None
    if dispatch.dispatch_type == "resume_selection":
        if phase != "waiting_for_user_selection":
            return (
                "INVALID_RESUME_PHASE",
                f"Selection resume expected 'waiting_for_user_selection', got '{phase}'.",
            )
        if not dispatch.selected_action_ids:
            return (
                "MISSING_SELECTED_ACTIONS",
                "selected_action_ids is required for selection resume.",
            )
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
