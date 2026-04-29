from __future__ import annotations

from pathlib import Path
from tempfile import gettempdir
from types import SimpleNamespace

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.clap_inference import CLAPTrackPrediction
from app.services.workflow_artifacts import get_workflow_artifact_store
from app.services.workflow_jobs import WorkflowDispatchMessage, get_workflow_job_store
from app.services.workflow_orchestration import (
    WorkflowStartPayload,
    start_workflow_job,
)
from app.services.workflow_snapshots import get_workflow_snapshot_store
from app.services.workflow_worker import run_workflow_dispatch


def _ensure_test_audio_file(track_id: int, *, vocal_like: bool) -> str:
    sample_rate = 16000
    duration_seconds = 6.0
    time_axis = np.linspace(
        0,
        duration_seconds,
        int(sample_rate * duration_seconds),
        endpoint=False,
    )
    signal = (
        0.42 * np.sin(2 * np.pi * 330 * time_axis)
        + 0.34 * np.sin(2 * np.pi * 520 * time_axis)
    )
    if vocal_like:
        signal += 0.28 * np.sin(2 * np.pi * 6800 * time_axis)
    signal = signal.astype(np.float32)
    audio_dir = Path(gettempdir()) / "studion-ai-test-audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_path = audio_dir / f"dispatch-track-{track_id}-{'vocal' if vocal_like else 'support'}.wav"
    if not audio_path.exists():
        sf.write(audio_path, signal, sample_rate)
    return str(audio_path)


class _FakeCLAPInferenceClient:
    def infer_track_roles(self, *, job_id: str, excerpts: list) -> list[CLAPTrackPrediction]:
        predictions: list[CLAPTrackPrediction] = []
        ordered_track_ids: list[int] = []
        for excerpt in excerpts:
            track_id = int(excerpt.metadata["track_id"])
            if track_id not in ordered_track_ids:
                ordered_track_ids.append(track_id)
        for index, track_id in enumerate(ordered_track_ids):
            is_vocal = index == 0
            predictions.append(
                CLAPTrackPrediction(
                    track_id=track_id,
                    vocal_score=0.91 if is_vocal else 0.24,
                    confidence=0.87 if is_vocal else 0.69,
                    predicted_role="vocal-like" if is_vocal else "supporting",
                    excerpt_scores=[],
                )
            )
        return predictions


@pytest.fixture(autouse=True)
def reset_job_store(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.workflow_jobs.get_settings",
        lambda: SimpleNamespace(resolved_mysql_url=None),
    )
    monkeypatch.setattr(
        "app.graph.nodes.analysis.get_clap_inference_client",
        lambda: _FakeCLAPInferenceClient(),
    )
    monkeypatch.setattr("app.services.workflow_jobs._mysql_store", None)
    store = get_workflow_job_store()
    snapshot_store = get_workflow_snapshot_store()
    artifact_store = get_workflow_artifact_store()
    store.reset()
    snapshot_store.reset()
    artifact_store.reset()
    yield
    store.reset()
    snapshot_store.reset()
    artifact_store.reset()


def build_project_snapshot(*, track_ids: list[int]) -> dict:
    clips = []
    for index, track_id in enumerate(track_ids, start=1):
        clips.append(
            {
                "clip_id": f"clip-{track_id}-{index}",
                "track_id": track_id,
                "start_ms": (index - 1) * 900,
                "end_ms": ((index - 1) * 900) + 2200,
                "audio_path": _ensure_test_audio_file(track_id, vocal_like=index == 1),
                "audio_start_ms": 0,
                "audio_duration_ms": 4800,
            }
        )
    return {
        "duration_ms": 4800,
        "bpm": 120,
        "numerator": 4,
        "denominator": 4,
        "tracks": [{"track_id": track_id, "name": f"Track {track_id}"} for track_id in track_ids],
        "clips": clips,
    }


def build_plan_input(state: dict) -> dict[str, str]:
    selected_region_id = state["ranked_candidate_ids"][0]
    region = next(
        region for region in state["analysis_regions"] if region["id"] == selected_region_id
    )
    return {
        "selected_region_id": selected_region_id,
        "preserve_clip_id": region["affected_clip_ids"][0],
    }


def test_worker_start_dispatch_restores_durable_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: None,
    )
    start_workflow_job(
        WorkflowStartPayload(
            job_id="job-async-start",
            project_id="project-async-start",
            project_snapshot=build_project_snapshot(track_ids=[12, 18]),
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
    assert result["current_node"] == "wait_user_plan_input"
    assert result["runtime_status"] == "waiting_for_user"
    assert stored is not None
    assert stored.phase == "waiting_for_user_plan_input"
    assert stored.status == "WAITING_USER"


def test_worker_start_dispatch_for_clipping_waits_for_plan_input(
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
            project_snapshot=build_project_snapshot(track_ids=[8]),
            issue_types=["clipping"],
        )
    )
    resumed = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id="job-async-resume",
            project_id="project-async-resume",
            dispatch_type="start",
        )
    )

    assert resumed["current_node"] == "wait_user_plan_input"
    assert resumed["ranked_candidate_ids"]


def test_worker_start_dispatch_autofixes_sibilance_without_waiting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sample_rate = 16000
    duration_seconds = 4.8
    time_axis = np.linspace(
        0,
        duration_seconds,
        int(sample_rate * duration_seconds),
        endpoint=False,
    )
    vocal_like = (
        0.26 * np.sin(2 * np.pi * 330 * time_axis)
        + 0.22 * np.sin(2 * np.pi * 520 * time_axis)
        + 0.24 * np.sin(2 * np.pi * 3600 * time_axis)
        + 0.48 * np.sin(2 * np.pi * 6800 * time_axis)
    ).astype(np.float32)
    audio_dir = Path(gettempdir()) / "studion-ai-test-audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_path = audio_dir / "dispatch-sibilance-autofix.wav"
    sf.write(audio_path, vocal_like, sample_rate)
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: None,
    )
    start_workflow_job(
        WorkflowStartPayload(
            job_id="job-async-sibilance",
            project_id="project-async-sibilance",
            project_snapshot={
                "duration_ms": 4800,
                "bpm": 120,
                "numerator": 4,
                "denominator": 4,
                "tracks": [{"track_id": 8, "name": "Track 8"}],
                "clips": [
                    {
                        "clip_id": "clip-8-1",
                        "track_id": 8,
                        "start_ms": 0,
                        "end_ms": 4800,
                        "audio_path": str(audio_path),
                        "audio_start_ms": 0,
                        "audio_duration_ms": 4800,
                    }
                ],
            },
            issue_types=["sibilance"],
        )
    )

    result = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id="job-async-sibilance",
            project_id="project-async-sibilance",
            dispatch_type="start",
        )
    )

    assert result["current_node"] == "finalize_output"
    assert result["sibilance_fix_applied"] is True
    assert result["sibilance_fix_log_id"] is not None


def test_worker_rejects_stale_resume_dispatch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: None,
    )
    start_workflow_job(
        WorkflowStartPayload(
            job_id="job-stale-dispatch",
            project_id="project-stale-dispatch",
            project_snapshot=build_project_snapshot(track_ids=[5, 6]),
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
            "project_snapshot": build_project_snapshot(track_ids=[1, 2]),
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
    assert "project_snapshot" not in stored.state_snapshot


def test_start_api_persists_snapshot_only_in_snapshot_store(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: None,
    )
    payload = WorkflowStartPayload(
        job_id="job-snapshot-store",
        project_id="project-snapshot-store",
        project_snapshot=build_project_snapshot(track_ids=[3, 4]),
        issue_types=["band_overlap"],
    )

    start_workflow_job(payload)

    stored = get_workflow_job_store().get_job("job-snapshot-store")
    snapshot = get_workflow_snapshot_store().get_snapshot("job-snapshot-store-timeline-snapshot")

    assert stored is not None
    assert snapshot is not None
    assert stored.timeline_snapshot_id == snapshot.id
    assert "project_snapshot" not in stored.state_snapshot
    assert snapshot.snapshot["clips"][0]["clip_id"] == "clip-3-1"


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
            project_snapshot=build_project_snapshot(track_ids=[9, 10]),
            issue_types=["band_overlap"],
        )
    )
    run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id="job-api-resume",
            project_id="project-api-resume",
            dispatch_type="start",
        )
    )
    stored = get_workflow_job_store().get_job("job-api-resume")
    assert stored is not None
    plan_input = build_plan_input(stored.state_snapshot)
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/workflow/jobs/resume",
        json={
            "job_id": "job-api-resume",
            "project_id": "project-api-resume",
            **plan_input,
        },
    )

    assert response.status_code == 200
    assert response.json()["job"]["dispatch_type"] == "resume_plan_input"
    assert len(queued_messages) == 2
    assert queued_messages[-1].selected_region_id == plan_input["selected_region_id"]
    assert queued_messages[-1].preserve_clip_id == plan_input["preserve_clip_id"]


def test_job_status_api_returns_job_and_projections(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: None,
    )
    start_workflow_job(
        WorkflowStartPayload(
            job_id="job-status-api",
            project_id="project-status-api",
            project_snapshot=build_project_snapshot(track_ids=[10, 11]),
            issue_types=["band_overlap"],
        )
    )
    run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id="job-status-api",
            project_id="project-status-api",
            dispatch_type="start",
        )
    )
    client = TestClient(create_app())

    response = client.get("/api/v1/workflow/jobs/job-status-api")

    assert response.status_code == 200
    body = response.json()
    assert body["job"]["id"] == "job-status-api"
    assert body["projections"]["analysis_job"]["id"] == "job-status-api"
    assert body["projections"]["analysis_regions"][0]["measure_start"] == 1
    assert body["projections"]["suggestion_group"] is None


def test_workflow_start_payload_defaults_include_clipping() -> None:
    payload = WorkflowStartPayload(
        job_id="job-default-issues",
        project_id="project-default-issues",
        project_snapshot=build_project_snapshot(track_ids=[1]),
    )

    assert payload.issue_types == ["band_overlap", "clipping"]
