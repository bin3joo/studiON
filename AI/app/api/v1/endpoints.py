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
    resume_workflow_job,
    start_workflow_job,
)

router = APIRouter()


class WorkflowRunRequest(BaseModel):
    job_id: str
    project_id: str
    track_ids: list[int] = Field(default_factory=list)
    issue_types: list[str] = Field(default_factory=lambda: ["band_overlap"])
    validator_mode: str = "PASS"
    critic_mode: str = "PASS"
    main_track_id: int | None = None
    selected_action_ids: list[str] = Field(default_factory=list)
    user_decision: UserDecision | None = None


class RuntimeRunRequest(BaseModel):
    job_id: str
    project_id: str
    track_ids: list[int] = Field(default_factory=list)
    issue_types: list[str] = Field(default_factory=lambda: ["band_overlap"])
    validator_mode: str = "PASS"
    critic_mode: str = "PASS"


class ApplyRunRequest(BaseModel):
    job_id: str
    project_id: str
    preview_id: str
    suggestion_group_id: str
    main_track_id: int | None = None
    selected_action_ids: list[str] = Field(default_factory=list)
    user_decision: UserDecision | None = None


class WorkflowRunResponse(BaseModel):
    graph_state: WorkflowState
    projections: WorkflowGraphProjections


class WorkflowDispatchResponse(BaseModel):
    job: WorkflowDispatchAccepted


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
            "wait_user_mix_intent",
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


@router.post("/workflow/jobs/start")
def workflow_job_start(request: WorkflowStartPayload) -> WorkflowDispatchResponse:
    return WorkflowDispatchResponse(job=start_workflow_job(request))


@router.post("/workflow/jobs/resume")
def workflow_job_resume(request: WorkflowResumePayload) -> WorkflowDispatchResponse:
    return WorkflowDispatchResponse(job=resume_workflow_job(request))


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
        "main_track_id": request.main_track_id,
        "selected_action_ids": request.selected_action_ids,
        "user_decision": request.user_decision,
    }
    result = run_apply_graph(state)
    return ApplyRunResponse.model_validate(build_apply_response(result))
