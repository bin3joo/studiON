from typing import Any

from fastapi import APIRouter
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
    job_id: str
    project_id: str
    track_ids: list[int] = Field(default_factory=list)
    project_snapshot: ProjectSnapshot | None = None
    issue_types: list[str] = Field(default_factory=lambda: ["band_overlap"])
    validator_mode: str = "PASS"
    critic_mode: str = "PASS"
    selected_region_id: str | None = None
    preserve_clip_id: str | None = None
    user_feedback_message: str | None = None
    selected_action_ids: list[str] = Field(default_factory=list)
    user_decision: UserDecision | None = None


class RuntimeRunRequest(BaseModel):
    job_id: str
    project_id: str
    track_ids: list[int] = Field(default_factory=list)
    project_snapshot: ProjectSnapshot | None = None
    issue_types: list[str] = Field(default_factory=lambda: ["band_overlap"])
    validator_mode: str = "PASS"
    critic_mode: str = "PASS"


class ApplyRunRequest(BaseModel):
    job_id: str
    project_id: str
    preview_id: str
    suggestion_group_id: str
    selected_action_ids: list[str] = Field(default_factory=list)
    user_decision: UserDecision | None = None


class WorkflowRunResponse(BaseModel):
    graph_state: WorkflowState
    projections: WorkflowGraphProjections


class WorkflowDispatchResponse(BaseModel):
    job: WorkflowDispatchAccepted


class WorkflowJobView(BaseModel):
    id: str
    project_id: str
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


@router.get("/graph/workflow")
def workflow_graph_summary() -> dict[str, Any]:
    return {
        "graph": "workflow",
        "entrypoint": "load_entry_context",
        "terminal_nodes": [
            "wait_user_plan_input",
            "wait_user_selection",
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
@router.post("/workflow/jobs/start")
def workflow_job_start(request: WorkflowStartPayload) -> WorkflowDispatchResponse:
    return WorkflowDispatchResponse(job=start_workflow_job(request))


@router.post("/workflow/jobs/resume")
def workflow_job_resume(request: WorkflowResumePayload) -> WorkflowDispatchResponse:
    return WorkflowDispatchResponse(job=resume_workflow_job(request))


@router.get("/workflow/jobs/{job_id}")
def workflow_job_status(job_id: str) -> WorkflowJobStatusResponse:
    # 프론트 polling은 이 조회 하나로 job 상태와 projection을 함께 받는다.
    return WorkflowJobStatusResponse.model_validate(get_workflow_job_status(job_id))


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
        "selected_action_ids": request.selected_action_ids,
        "user_decision": request.user_decision,
    }
    result = run_apply_graph(state)
    return ApplyRunResponse.model_validate(build_apply_response(result))
