from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, Field

from app.graph.state import UserDecision, WorkflowDispatchType, build_workflow_initial_state
from app.services.workflow_jobs import WorkflowDispatchMessage, get_workflow_job_store
from app.services.workflow_queue import enqueue_workflow_dispatch

logger = logging.getLogger(__name__)


class WorkflowDispatchAccepted(BaseModel):
    job_id: str
    project_id: str
    dispatch_type: WorkflowDispatchType
    status: str = "accepted"
    queue_name: str = "workflow"


class WorkflowStartPayload(BaseModel):
    job_id: str
    project_id: str
    track_ids: list[int] = Field(default_factory=list)
    issue_types: list[str] = Field(default_factory=lambda: ["band_overlap"])
    validator_mode: str = "PASS"
    critic_mode: str = "PASS"
    requested_by: int | None = None


class WorkflowResumePayload(BaseModel):
    job_id: str
    project_id: str
    main_track_id: int | None = None
    selected_action_ids: list[str] = Field(default_factory=list)
    user_decision: UserDecision | None = None
    requested_by: int | None = None


def start_workflow_job(payload: WorkflowStartPayload) -> WorkflowDispatchAccepted:
    store = get_workflow_job_store()
    initial_state = build_workflow_initial_state(
        job_id=payload.job_id,
        project_id=payload.project_id,
        track_ids=payload.track_ids,
        issue_types=payload.issue_types,
        validator_mode=payload.validator_mode,
        critic_mode=payload.critic_mode,
        requested_by=payload.requested_by,
    )
    try:
        store.create_pending_job(initial_state)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    message = WorkflowDispatchMessage(
        job_id=payload.job_id,
        project_id=payload.project_id,
        dispatch_type="start",
        requested_by=payload.requested_by,
    )
    logger.info(
        "워크플로 작업 적재 요청: job_id=%s dispatch_type=%s queue=%s",
        payload.job_id,
        message.dispatch_type,
        "workflow",
    )
    enqueue_workflow_dispatch(message)
    return WorkflowDispatchAccepted(
        job_id=payload.job_id,
        project_id=payload.project_id,
        dispatch_type=message.dispatch_type,
    )


def resume_workflow_job(payload: WorkflowResumePayload) -> WorkflowDispatchAccepted:
    store = get_workflow_job_store()
    job = store.get_job(payload.job_id)
    if job is None or job.project_id != payload.project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow job was not found.",
        )
    if job.status == "IN_PROGRESS":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Workflow job is already running.",
        )

    dispatch_type = _dispatch_type_for_phase(job.phase)
    _validate_resume_inputs(dispatch_type, payload.model_dump(mode="python"))

    message = WorkflowDispatchMessage(
        job_id=payload.job_id,
        project_id=payload.project_id,
        dispatch_type=dispatch_type,
        requested_by=payload.requested_by,
        main_track_id=payload.main_track_id,
        selected_action_ids=payload.selected_action_ids,
        user_decision=payload.user_decision,
    )
    # API는 enqueue만 담당하고, durable 복원과 그래프 실행 책임은 worker가 가진다.
    logger.info(
        "워크플로 재개 적재 요청: job_id=%s dispatch_type=%s queue=%s",
        payload.job_id,
        dispatch_type,
        "workflow",
    )
    enqueue_workflow_dispatch(message)
    return WorkflowDispatchAccepted(
        job_id=payload.job_id,
        project_id=payload.project_id,
        dispatch_type=dispatch_type,
    )


def _dispatch_type_for_phase(phase: str) -> WorkflowDispatchType:
    if phase == "waiting_for_user_mix_intent":
        return "resume_mix_intent"
    if phase == "waiting_for_user_selection":
        return "resume_selection"
    if phase == "waiting_for_user_confirm":
        return "resume_confirm"
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"Workflow job cannot be resumed from phase '{phase}'.",
    )


def _validate_resume_inputs(dispatch_type: WorkflowDispatchType, payload: dict[str, Any]) -> None:
    if dispatch_type == "resume_mix_intent" and payload.get("main_track_id") is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="main_track_id is required for mix-intent resume.",
        )
    if dispatch_type == "resume_selection" and not payload.get("selected_action_ids"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="selected_action_ids is required for selection resume.",
        )
    if dispatch_type == "resume_confirm" and payload.get("user_decision") is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="user_decision is required for confirmation resume.",
        )
