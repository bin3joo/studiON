from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal, NotRequired, TypedDict

IssueType = Literal["band_overlap", "clipping", "sibilance", "high_band_harshness"]
ValidatorOutcome = Literal["PASS", "REVISE", "REJECT"]
CriticOutcome = Literal["PASS", "REVISE", "REJECT"]
RuntimeStatus = Literal[
    "queued",
    "running",
    "waiting_for_user",
    "failed",
    "completed",
]
DurableJobStatus = Literal[
    "PENDING",
    "IN_PROGRESS",
    "WAITING_USER",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
]
UserDecision = Literal["confirm", "retry", "cancel"]


class WorkflowState(TypedDict, total=False):
    job_id: str
    project_id: str
    phase: str
    current_node: str
    progress: int
    heartbeat_at: str
    transition_log: list[str]
    runtime_status: RuntimeStatus
    durable_status: DurableJobStatus
    langgraph_thread_id: str
    timeline_snapshot_id: str | None
    track_ids: list[int]
    sampled_clip_ids: list[str]
    role_candidate_track_ids: list[int]
    inferred_roles: dict[int, str]
    issue_types: list[IssueType]
    detected_issues: list[IssueType]
    analysis_region_ids: list[str]
    analysis_regions: list[dict]
    ranked_candidate_ids: list[str]
    ranking_scores: dict[str, float]
    main_track_id: int | None
    clip_feature_artifact_id: str | None
    retrieval_needed: bool
    retrieval_context_ids: list[str]
    vocal_detected: bool
    clap_required: bool
    clipping_fix_applied: bool
    clipping_fix_log_id: str | None
    suggestion_payload: dict
    suggestion_group_id: str | None
    preview_id: str | None
    preview_action_ids: list[str]
    selected_action_ids: list[str]
    user_decision: UserDecision | None
    user_action_required: bool
    validator_mode: str
    validator_result: ValidatorOutcome | None
    critic_mode: str
    critic_result: CriticOutcome | None
    revise_count: int
    max_revise_count: int
    apply_result_id: str | None
    feedback_event_id: str | None
    latest_artifact_id: str | None
    mongo_artifact_ids: list[str]
    failure_code: str | None
    failure_message: str | None
    requested_by: int | None
    started_at: str | None
    completed_at: str | None
    notes: NotRequired[list[str]]


# Backward-compatible aliases while the rest of the AI app converges on WorkflowState.
RuntimeState = WorkflowState
ApplyState = WorkflowState


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def build_workflow_initial_state(
    job_id: str,
    project_id: str,
    **overrides: object,
) -> WorkflowState:
    state: WorkflowState = {
        "job_id": job_id,
        "project_id": project_id,
        "phase": "queued",
        "current_node": "load_entry_context",
        "progress": 0,
        "heartbeat_at": utc_now(),
        "transition_log": [],
        "runtime_status": "queued",
        "durable_status": "PENDING",
        "langgraph_thread_id": f"lg-thread:{job_id}",
        "timeline_snapshot_id": None,
        "track_ids": [],
        "sampled_clip_ids": [],
        "role_candidate_track_ids": [],
        "inferred_roles": {},
        "issue_types": ["band_overlap"],
        "detected_issues": [],
        "analysis_region_ids": [],
        "analysis_regions": [],
        "ranked_candidate_ids": [],
        "ranking_scores": {},
        "main_track_id": None,
        "clip_feature_artifact_id": None,
        "retrieval_needed": False,
        "retrieval_context_ids": [],
        "vocal_detected": False,
        "clap_required": False,
        "clipping_fix_applied": False,
        "clipping_fix_log_id": None,
        "suggestion_payload": {},
        "suggestion_group_id": None,
        "preview_id": None,
        "preview_action_ids": [],
        "selected_action_ids": [],
        "user_decision": None,
        "user_action_required": False,
        "validator_mode": "PASS",
        "validator_result": None,
        "critic_mode": "PASS",
        "critic_result": None,
        "revise_count": 0,
        "max_revise_count": 1,
        "apply_result_id": None,
        "feedback_event_id": None,
        "latest_artifact_id": None,
        "mongo_artifact_ids": [],
        "failure_code": None,
        "failure_message": None,
        "requested_by": None,
        "started_at": None,
        "completed_at": None,
        "notes": [],
    }
    state.update(overrides)
    return state


def build_runtime_initial_state(job_id: str, project_id: str, **overrides: object) -> RuntimeState:
    return build_workflow_initial_state(job_id=job_id, project_id=project_id, **overrides)


def build_apply_initial_state(
    job_id: str,
    project_id: str,
    preview_id: str,
    suggestion_group_id: str,
    **overrides: object,
) -> ApplyState:
    return build_workflow_initial_state(
        job_id=job_id,
        project_id=project_id,
        preview_id=preview_id,
        suggestion_group_id=suggestion_group_id,
        phase="waiting_for_user_selection",
        runtime_status="waiting_for_user",
        durable_status="WAITING_USER",
        **overrides,
    )
