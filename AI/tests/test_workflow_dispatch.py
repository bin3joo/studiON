from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.workflow_jobs import WorkflowDispatchMessage, get_workflow_job_store
from app.services.workflow_orchestration import (
    WorkflowResumePayload,
    WorkflowStartPayload,
    resume_workflow_job,
    start_workflow_job,
)
from app.services.workflow_worker import run_workflow_dispatch


@pytest.fixture(autouse=True)
def reset_job_store() -> None:
    store = get_workflow_job_store()
    store.reset()
    yield
    store.reset()


def test_worker_start_dispatch_restores_durable_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: None,
    )
    start_workflow_job(
        WorkflowStartPayload(
            job_id="job-async-start",
            project_id="project-async-start",
            track_ids=[12],
            issue_types=["band_overlap", "sibilance"],
        )
    )

    result = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id="job-async-start",
            project_id="project-async-start",
            dispatch_type="start",
        )
    )

    stored = get_workflow_job_store().get_job("job-async-start")
    assert result["current_node"] == "wait_user_mix_intent"
    assert result["runtime_status"] == "waiting_for_user"
    assert stored is not None
    assert stored.phase == "waiting_for_user_mix_intent"
    assert stored.status == "WAITING_USER"


def test_worker_resume_mix_intent_dispatch_reaches_selection_wait(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: None,
    )
    start_workflow_job(
        WorkflowStartPayload(
            job_id="job-async-resume",
            project_id="project-async-resume",
            track_ids=[8],
            issue_types=["sibilance"],
        )
    )
    run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id="job-async-resume",
            project_id="project-async-resume",
            dispatch_type="start",
        )
    )

    accepted = resume_workflow_job(
        WorkflowResumePayload(
            job_id="job-async-resume",
            project_id="project-async-resume",
            main_track_id=8,
        )
    )
    resumed = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id="job-async-resume",
            project_id="project-async-resume",
            dispatch_type=accepted.dispatch_type,
            main_track_id=8,
        )
    )

    assert accepted.dispatch_type == "resume_mix_intent"
    assert resumed["current_node"] == "wait_user_selection"
    assert resumed["preview_action_ids"] == ["job-async-resume-action-1"]


def test_worker_rejects_stale_resume_dispatch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: None,
    )
    start_workflow_job(
        WorkflowStartPayload(
            job_id="job-stale-dispatch",
            project_id="project-stale-dispatch",
            track_ids=[5],
            issue_types=["band_overlap"],
        )
    )
    run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id="job-stale-dispatch",
            project_id="project-stale-dispatch",
            dispatch_type="start",
        )
    )

    failed = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id="job-stale-dispatch",
            project_id="project-stale-dispatch",
            dispatch_type="resume_selection",
            selected_action_ids=["job-stale-dispatch-action-1"],
        )
    )

    assert failed["current_node"] == "fail_workflow"
    assert failed["runtime_status"] == "failed"
    assert failed["failure_code"] == "INVALID_RESUME_PHASE"


def test_start_api_enqueues_without_running_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    queued_messages: list[WorkflowDispatchMessage] = []
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: queued_messages.append(message),
    )
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/workflow/jobs/start",
        json={
            "job_id": "job-api-start",
            "project_id": "project-api-start",
            "track_ids": [1, 2],
            "issue_types": ["band_overlap"],
            "requested_by": 101,
        },
    )

    assert response.status_code == 200
    assert response.json()["job"]["dispatch_type"] == "start"
    assert len(queued_messages) == 1
    assert queued_messages[0].job_id == "job-api-start"
    stored = get_workflow_job_store().get_job("job-api-start")
    assert stored is not None
    assert stored.phase == "queued"
    assert stored.status == "PENDING"


def test_resume_api_infers_dispatch_type_from_waiting_phase(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    queued_messages: list[WorkflowDispatchMessage] = []
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: queued_messages.append(message),
    )
    start_workflow_job(
        WorkflowStartPayload(
            job_id="job-api-resume",
            project_id="project-api-resume",
            track_ids=[9],
            issue_types=["sibilance"],
        )
    )
    run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id="job-api-resume",
            project_id="project-api-resume",
            dispatch_type="start",
        )
    )
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/workflow/jobs/resume",
        json={
            "job_id": "job-api-resume",
            "project_id": "project-api-resume",
            "main_track_id": 9,
        },
    )

    assert response.status_code == 200
    assert response.json()["job"]["dispatch_type"] == "resume_mix_intent"
    assert len(queued_messages) == 2
    assert queued_messages[-1].main_track_id == 9
