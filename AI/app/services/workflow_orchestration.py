from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, Field

from app.graph.state import UserDecision, WorkflowDispatchType, build_workflow_initial_state
from app.services.workflow_jobs import WorkflowDispatchMessage, get_workflow_job_store
from app.services.workflow_queue import enqueue_workflow_dispatch
from app.services.workflow_snapshots import (
    ProjectSnapshot,
    build_snapshot_id,
    build_timeline_snapshot_document,
    get_workflow_snapshot_store,
)

logger = logging.getLogger(__name__)


class WorkflowDispatchAccepted(BaseModel):
    job_id: int
    project_id: int
    dispatch_type: WorkflowDispatchType
    status: str = "accepted"
    queue_name: str = "workflow"


class WorkflowStartPayload(BaseModel):
    job_id: int
    project_id: int
    project_snapshot: ProjectSnapshot
    issue_types: list[str] = Field(
        default_factory=lambda: [
            "band_overlap",
            "track_clipping",
            "master_clipping",
            "sibilance",
            "high_band_harshness",
        ]
    )
    validator_mode: str = "PASS"
    critic_mode: str = "PASS"
    requested_by: int | None = None


class WorkflowResumePayload(BaseModel):
    job_id: int
    project_id: int
    selected_region_id: str | None = None
    preserve_clip_id: int | None = None
    user_feedback_message: str | None = None
    user_decision: UserDecision | None = None
    requested_by: int | None = None

# start API 다음 단계다.
# 초기 상태를 만들고 pending job을 저장한 뒤,
# worker가 실제 그래프를 돌릴 수 있도록 dispatch 메시지를 큐에 넣는다.
def start_workflow_job(payload: WorkflowStartPayload) -> WorkflowDispatchAccepted:
    store = get_workflow_job_store()
    snapshot_store = get_workflow_snapshot_store()
    timeline_snapshot_id = build_snapshot_id(payload.job_id)
    # 비동기 worker가 동일한 기준선으로 분석하도록 start 시점 snapshot을 먼저 고정 저장한다.
    snapshot_document = build_timeline_snapshot_document(
        job_id=payload.job_id,
        project_id=payload.project_id,
        snapshot_id=timeline_snapshot_id,
        snapshot=payload.project_snapshot,
    )
    snapshot_store.upsert_snapshot(snapshot_document)
    initial_state = build_workflow_initial_state(
        job_id=payload.job_id,
        project_id=payload.project_id,
        timeline_snapshot_id=timeline_snapshot_id,
        project_duration_ms=snapshot_document.duration_ms,
        track_ids=snapshot_document.track_ids,
        bpm=snapshot_document.bpm,
        numerator=snapshot_document.numerator,
        denominator=snapshot_document.denominator,
        bar_mapping=snapshot_document.bar_mapping,
        clip_index=snapshot_document.clip_index,
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
    if job.status == "RUNNING":
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
        selected_region_id=payload.selected_region_id,
        preserve_clip_id=payload.preserve_clip_id,
        user_feedback_message=payload.user_feedback_message,
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


def get_workflow_job_status(job_id: int) -> dict[str, object]:
    from app.persistence.projections import build_workflow_projections

    store = get_workflow_job_store()
    job = store.get_job(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow job was not found.",
        )

    state = build_workflow_initial_state(job_id=job.id, project_id=job.project_id)
    # polling 응답은 MySQL durable state를 기준으로 재구성해 단일 조회 source of truth로 쓴다.
    state.update(job.state_snapshot)
    state.update(
        {
            "job_id": job.id,
            "project_id": job.project_id,
            "phase": job.phase,
            "current_node": job.current_node,
            "progress": job.progress,
            "durable_status": job.status,
            "timeline_snapshot_id": job.timeline_snapshot_id,
            "requested_by": job.requested_by,
            "started_at": job.started_at,
            "completed_at": job.completed_at,
            "failure_code": job.error_code,
            "failure_message": job.error_message,
        }
    )
    return {
        "job": {
            "id": job.id,
            "project_id": job.project_id,
            "status": job.status,
            "phase": job.phase,
            "current_node": job.current_node,
            "progress": job.progress,
            "timeline_snapshot_id": job.timeline_snapshot_id,
            "requested_by": job.requested_by,
            "started_at": job.started_at,
            "completed_at": job.completed_at,
            "error_code": job.error_code,
            "error_message": job.error_message,
        },
        "projections": build_workflow_projections(state).model_dump(mode="json"),
    }


def _dispatch_type_for_phase(phase: str) -> WorkflowDispatchType:
    if phase == "waiting_for_user_plan_input":
        return "resume_plan_input"
    if phase == "waiting_for_user_confirm":
        return "resume_confirm"
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"Workflow job cannot be resumed from phase '{phase}'.",
    )


def _validate_resume_inputs(dispatch_type: WorkflowDispatchType, payload: dict[str, Any]) -> None:
    if dispatch_type == "resume_plan_input" and payload.get("selected_region_id") is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="selected_region_id is required for plan-input resume.",
        )
    if dispatch_type == "resume_plan_input" and payload.get("preserve_clip_id") is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="preserve_clip_id is required for plan-input resume.",
        )
    if dispatch_type == "resume_confirm" and payload.get("user_decision") is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="user_decision is required for confirmation resume.",
        )
