from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.graph.state import ApplyState, RuntimeState, UserDecision, WorkflowState
from app.graph.workflow import (
    build_apply_graph,
    build_apply_response,
    build_runtime_graph,
    build_runtime_response,
    build_workflow_graph,
    build_workflow_response,
    run_apply_graph,
    run_runtime_graph,
    run_workflow_graph,
)
from app.persistence.projections import (
    ApplyGraphProjections,
    RuntimeGraphProjections,
    WorkflowGraphProjections,
)
from app.services.workflow_orchestration import (
    WorkflowDispatchAccepted,
    WorkflowResumePayload,
    WorkflowStartPayload,
    get_workflow_job_status,
    resume_workflow_job,
    start_workflow_job,
)
from app.services.workflow_snapshots import ProjectSnapshot

router = APIRouter()


class WorkflowRunRequest(BaseModel):
    job_id: int
    project_id: int
    track_ids: list[int] = Field(default_factory=list)
    project_snapshot: ProjectSnapshot | None = None
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
    selected_region_id: str | None = None
    preserve_clip_id: int | None = None
    user_feedback_message: str | None = None
    user_decision: UserDecision | None = None


class RuntimeRunRequest(BaseModel):
    job_id: int
    project_id: int
    track_ids: list[int] = Field(default_factory=list)
    project_snapshot: ProjectSnapshot | None = None
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


class ApplyRunRequest(BaseModel):
    job_id: int
    project_id: int
    preview_id: str
    suggestion_group_id: str
    user_decision: UserDecision | None = None


class WorkflowRunResponse(BaseModel):
    graph_state: WorkflowState
    projections: WorkflowGraphProjections


class WorkflowDispatchResponse(BaseModel):
    job: WorkflowDispatchAccepted


class WorkflowJobView(BaseModel):
    id: int
    project_id: int
    status: str
    phase: str
    current_node: str | None = None
    progress: int = 0
    timeline_snapshot_id: str | None = None
    requested_by: int | None = None
    started_at: str | None = None
    completed_at: str | None = None
    error_code: str | None = None
    error_message: str | None = None


class WorkflowJobStatusResponse(BaseModel):
    job: WorkflowJobView
    projections: WorkflowGraphProjections


class RuntimeRunResponse(BaseModel):
    graph_state: RuntimeState
    projections: RuntimeGraphProjections


class ApplyRunResponse(BaseModel):
    graph_state: ApplyState
    projections: ApplyGraphProjections


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

# langgraph workflow의 메타정보 제공
# 시작 노드, 종료 노드 후보, 컴파일된 그래프 이름
@router.get("/graph/workflow")
def workflow_graph_summary() -> dict[str, Any]:
    return {
        "graph": "workflow",
        "entrypoint": "load_entry_context",
        "terminal_nodes": [
            "wait_user_plan_input",
            "wait_user_confirm",
            "finalize_output",
            "fail_workflow",
        ],
        "compiled": build_workflow_graph().name,
    }


@router.get("/graph/runtime")
def runtime_graph_summary() -> dict[str, Any]:
    return {
        "graph": "runtime",
        "delegates_to": "workflow",
        "compiled": build_runtime_graph().name,
    }


@router.get("/graph/apply")
def apply_graph_summary() -> dict[str, Any]:
    return {
        "graph": "apply",
        "delegates_to": "workflow",
        "compiled": build_apply_graph().name,
    }


@router.post("/graph/workflow/run")
def workflow_graph_run(request: WorkflowRunRequest) -> WorkflowRunResponse:
    state = run_workflow_graph(request.model_dump())
    return WorkflowRunResponse.model_validate(build_workflow_response(state))

# 프론트에서 AI 분석 시작을 눌렀을 때 받는 API
# 프론트의 "AI 분석 시작" 버튼이 직접 호출하는 진입 API다.
# 여기서는 그래프를 바로 실행하지 않고 start_workflow_job으로 넘겨
# 비동기 워크플로우 시작만 요청한다.
@router.post("/internal/workflow/jobs/start")
def workflow_job_start(request: WorkflowStartPayload) -> WorkflowDispatchResponse:
    return WorkflowDispatchResponse(job=start_workflow_job(request))


@router.post("/internal/workflow/jobs/resume")
def workflow_job_resume(request: WorkflowResumePayload) -> WorkflowDispatchResponse:
    return WorkflowDispatchResponse(job=resume_workflow_job(request))


@router.get("/internal/workflow/jobs/{job_id}")
def workflow_job_status(job_id: int) -> WorkflowJobStatusResponse:
    # 프론트 polling은 이 조회 하나로 job 상태와 projection을 함께 받는다.
    return WorkflowJobStatusResponse.model_validate(get_workflow_job_status(job_id))


@router.get("/internal/workflow/jobs/{job_id}/preview/audio")
def workflow_job_preview_audio(job_id: int) -> FileResponse:
    # preview가 READY 상태가 되면 문제 구간 master-context after excerpt wav를 재생 가능하게 노출한다.
    status_payload = get_workflow_job_status(job_id)
    preview_render = status_payload["projections"].get("preview_render")
    if not isinstance(preview_render, dict):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preview render was not found for this workflow job.",
        )
    if preview_render.get("status") != "READY":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Preview audio is not ready yet.",
        )

    object_key = preview_render.get("object_key")
    if not isinstance(object_key, str) or not object_key.strip():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preview audio file path is missing.",
        )

    preview_path = Path(object_key)
    if not preview_path.exists() or not preview_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preview audio file could not be found on disk.",
        )
    return FileResponse(
        path=preview_path,
        media_type="audio/wav",
        filename=preview_path.name,
    )


@router.get("/internal/workflow/jobs/{job_id}/preview/before/audio")
def workflow_job_preview_before_audio(job_id: int) -> FileResponse:
    status_payload = get_workflow_job_status(job_id)
    preview_render = status_payload["projections"].get("preview_render")
    if not isinstance(preview_render, dict):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preview render was not found for this workflow job.",
        )
    if preview_render.get("status") != "READY":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Preview before audio is not ready yet.",
        )

    object_key = preview_render.get("before_object_key")
    if not isinstance(object_key, str) or not object_key.strip():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preview before audio file path is missing.",
        )

    before_path = Path(object_key)
    if not before_path.exists() or not before_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preview before audio file could not be found on disk.",
        )
    return FileResponse(
        path=before_path,
        media_type="audio/wav",
        filename=before_path.name,
    )


@router.get("/internal/workflow/jobs/{job_id}/master/audio")
def workflow_job_master_audio(job_id: int) -> FileResponse:
    status_payload = get_workflow_job_status(job_id)
    master_audio = status_payload["projections"].get("master_audio")
    if not isinstance(master_audio, dict):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Master audio was not found for this workflow job.",
        )
    if master_audio.get("status") != "READY":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Master audio is not ready yet.",
        )

    object_key = master_audio.get("object_key")
    if not isinstance(object_key, str) or not object_key.strip():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Master audio file path is missing.",
        )

    master_path = Path(object_key)
    if not master_path.exists() or not master_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Master audio file could not be found on disk.",
        )
    return FileResponse(
        path=master_path,
        media_type="audio/wav",
        filename=master_path.name,
    )


@router.post("/graph/runtime/run")
def runtime_graph_run(request: RuntimeRunRequest) -> RuntimeRunResponse:
    state = run_runtime_graph(request.model_dump())
    return RuntimeRunResponse.model_validate(build_runtime_response(state))


@router.post("/graph/apply/run")
def apply_graph_run(request: ApplyRunRequest) -> ApplyRunResponse:
    state: ApplyState = {
        "job_id": request.job_id,
        "project_id": request.project_id,
        "preview_id": request.preview_id,
        "suggestion_group_id": request.suggestion_group_id,
        "user_decision": request.user_decision,
    }
    result = run_apply_graph(state)
    return ApplyRunResponse.model_validate(build_apply_response(result))


