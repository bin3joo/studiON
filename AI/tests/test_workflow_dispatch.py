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
from app.services.plan_critic_llm import PlanCriticLLMResponse
from app.services.planning_llm import PlanningLLMResponse
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


def _clip_id(track_id: int, ordinal: int) -> int:
    return (track_id * 1000) + ordinal


class _FakeCLAPInferenceClient:
    def infer_track_roles(self, *, job_id: int, excerpts: list) -> list[CLAPTrackPrediction]:
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


@pytest.fixture(autouse=True)
def patch_planning_clients(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakePlanningClient:
        def generate_plan(
            self,
            *,
            selected_region_id: str,
            preserve_clip_id: int,
            user_feedback_message: str | None,
            region: dict[str, object],
            clip_context: list[dict[str, object]],
            revision_notes: list[str],
        ) -> PlanningLLMResponse:
            return PlanningLLMResponse(
                plan_payload={
                    "strategyTitle": "dispatch test plan",
                    "strategySummary": "dispatch test summary",
                    "summary": "dispatch test suggestion",
                    "explanation": "dispatch test explanation",
                    "candidate": {
                        "action": {
                            "actionType": "TRUE_PEAK_LIMITER",
                            "targetScope": "MASTER",
                            "targetTrackId": None,
                            "targetClipId": None,
                            "startMs": int(region["start_ms"]),
                            "endMs": int(region["end_ms"]),
                            "bandLowHz": None,
                            "bandHighHz": None,
                            "gainDeltaDb": None,
                            "params": {"ceilingDbTP": -1.0, "releaseMs": 60},
                        }
                    },
                }
            )

    class _FakeCriticClient:
        def review_plan(
            self,
            *,
            selected_region_id: str,
            preserve_clip_id: int,
            user_feedback_message: str | None,
            region: dict[str, object],
            plan_payload: dict[str, object],
            revision_notes: list[str],
        ) -> PlanCriticLLMResponse:
            return PlanCriticLLMResponse(result="PASS", note="")

    monkeypatch.setattr(
        "app.graph.nodes.suggestion.get_planning_llm_client",
        lambda: _FakePlanningClient(),
    )
    monkeypatch.setattr(
        "app.graph.nodes.review.get_plan_critic_llm_client",
        lambda: _FakeCriticClient(),
    )


def build_project_snapshot(*, track_ids: list[int]) -> dict:
    clips = []
    for index, track_id in enumerate(track_ids, start=1):
        clips.append(
            {
                "clip_id": _clip_id(track_id, index),
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


def build_plan_input(state: dict) -> dict[str, object]:
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
            job_id=20001,
            project_id=30001,
            project_snapshot=build_project_snapshot(track_ids=[12, 18]),
            issue_types=["band_overlap", "sibilance"],
        )
    )

    result = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20001,
            project_id=30001,
            dispatch_type="start",
        )
    )

    stored = get_workflow_job_store().get_job(20001)
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
            job_id=20002,
            project_id=30002,
            project_snapshot=build_project_snapshot(track_ids=[8]),
            issue_types=["clipping"],
        )
    )
    resumed = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20002,
            project_id=30002,
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
            job_id=20003,
            project_id=30003,
            project_snapshot={
                "duration_ms": 4800,
                "bpm": 120,
                "numerator": 4,
                "denominator": 4,
                "tracks": [{"track_id": 8, "name": "Track 8"}],
                "clips": [
                    {
                        "clip_id": _clip_id(8, 1),
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
            job_id=20003,
            project_id=30003,
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
            job_id=20004,
            project_id=30004,
            project_snapshot=build_project_snapshot(track_ids=[5, 6]),
            issue_types=["band_overlap"],
        )
    )
    run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20004,
            project_id=30004,
            dispatch_type="start",
        )
    )

    failed = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20004,
            project_id=30004,
            dispatch_type="resume_selection",
            selected_action_ids=["20004-action-1"],
        )
    )

    assert failed["current_node"] == "fail_workflow"
    assert failed["runtime_status"] == "failed"
    assert failed["failure_code"] == "INVALID_RESUME_PHASE"


def test_worker_rejects_plan_resume_without_selected_region(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: None,
    )
    start_workflow_job(
        WorkflowStartPayload(
            job_id=20005,
            project_id=30005,
            project_snapshot=build_project_snapshot(track_ids=[3, 7]),
            issue_types=["band_overlap"],
        )
    )
    run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20005,
            project_id=30005,
            dispatch_type="start",
        )
    )
    stored = get_workflow_job_store().get_job(20005)
    assert stored is not None
    preserve_clip_id = build_plan_input(stored.state_snapshot)["preserve_clip_id"]

    failed = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20005,
            project_id=30005,
            dispatch_type="resume_plan_input",
            preserve_clip_id=preserve_clip_id,
        )
    )

    assert failed["current_node"] == "fail_workflow"
    assert failed["runtime_status"] == "failed"
    assert failed["failure_code"] == "MISSING_SELECTED_REGION"


def test_worker_rejects_plan_resume_without_preserve_clip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: None,
    )
    start_workflow_job(
        WorkflowStartPayload(
            job_id=20006,
            project_id=30006,
            project_snapshot=build_project_snapshot(track_ids=[4, 9]),
            issue_types=["band_overlap"],
        )
    )
    run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20006,
            project_id=30006,
            dispatch_type="start",
        )
    )
    stored = get_workflow_job_store().get_job(20006)
    assert stored is not None
    selected_region_id = build_plan_input(stored.state_snapshot)["selected_region_id"]

    failed = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20006,
            project_id=30006,
            dispatch_type="resume_plan_input",
            selected_region_id=selected_region_id,
        )
    )

    assert failed["current_node"] == "fail_workflow"
    assert failed["runtime_status"] == "failed"
    assert failed["failure_code"] == "MISSING_PRESERVE_CLIP"


def test_worker_rejects_selection_resume_without_selected_actions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = get_workflow_job_store()
    store.create_pending_job(
        {
            "job_id": 20007,
            "project_id": 30007,
            "phase": "waiting_for_user_selection",
            "current_node": "wait_user_selection",
            "progress": 95,
            "runtime_status": "waiting_for_user",
            "durable_status": "WAITING_USER",
            "timeline_snapshot_id": "20007-timeline-snapshot",
            "langgraph_thread_id": "lg-thread:20007",
            "selected_action_ids": [],
            "preview_action_ids": ["20007-action-1", "20007-action-2"],
        }
    )

    failed = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20007,
            project_id=30007,
            dispatch_type="resume_selection",
        )
    )

    assert failed["current_node"] == "fail_workflow"
    assert failed["runtime_status"] == "failed"
    assert failed["failure_code"] == "MISSING_SELECTED_ACTIONS"


def test_worker_rejects_confirm_resume_without_user_decision(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: None,
    )
    start_workflow_job(
        WorkflowStartPayload(
            job_id=20008,
            project_id=30008,
            project_snapshot=build_project_snapshot(track_ids=[11]),
            issue_types=["clipping"],
        )
    )
    waiting = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20008,
            project_id=30008,
            dispatch_type="start",
        )
    )
    preview_wait = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20008,
            project_id=30008,
            dispatch_type="resume_plan_input",
            **build_plan_input(waiting),
        )
    )
    assert preview_wait["phase"] == "waiting_for_user_confirm"

    failed = run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20008,
            project_id=30008,
            dispatch_type="resume_confirm",
        )
    )

    assert failed["current_node"] == "fail_workflow"
    assert failed["runtime_status"] == "failed"
    assert failed["failure_code"] == "MISSING_USER_DECISION"


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
            "job_id": 20009,
            "project_id": 30009,
            "project_snapshot": build_project_snapshot(track_ids=[1, 2]),
            "issue_types": ["band_overlap"],
            "requested_by": 101,
        },
    )

    assert response.status_code == 200
    assert response.json()["job"]["dispatch_type"] == "start"
    assert len(queued_messages) == 1
    assert queued_messages[0].job_id == 20009
    stored = get_workflow_job_store().get_job(20009)
    assert stored is not None
    assert stored.phase == "queued"
    assert stored.status == "REQUESTED"
    assert "project_snapshot" not in stored.state_snapshot


def test_start_api_allows_cors_preflight() -> None:
    client = TestClient(create_app())

    response = client.options(
        "/api/v1/workflow/jobs/start",
        headers={
            "Origin": "http://127.0.0.1:5500",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"


def test_start_api_persists_snapshot_only_in_snapshot_store(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.workflow_orchestration.enqueue_workflow_dispatch",
        lambda message: None,
    )
    payload = WorkflowStartPayload(
        job_id=20010,
        project_id=30010,
        project_snapshot=build_project_snapshot(track_ids=[3, 4]),
        issue_types=["band_overlap"],
    )

    start_workflow_job(payload)

    stored = get_workflow_job_store().get_job(20010)
    snapshot = get_workflow_snapshot_store().get_snapshot("20010-timeline-snapshot")

    assert stored is not None
    assert snapshot is not None
    assert stored.timeline_snapshot_id == snapshot.id
    assert "project_snapshot" not in stored.state_snapshot
    assert snapshot.snapshot["clips"][0]["clip_id"] == _clip_id(3, 1)


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
            job_id=20011,
            project_id=30011,
            project_snapshot=build_project_snapshot(track_ids=[9, 10]),
            issue_types=["band_overlap"],
        )
    )
    run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20011,
            project_id=30011,
            dispatch_type="start",
        )
    )
    stored = get_workflow_job_store().get_job(20011)
    assert stored is not None
    plan_input = build_plan_input(stored.state_snapshot)
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/workflow/jobs/resume",
        json={
            "job_id": 20011,
            "project_id": 30011,
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
            job_id=20012,
            project_id=30012,
            project_snapshot=build_project_snapshot(track_ids=[10, 11]),
            issue_types=["band_overlap"],
        )
    )
    run_workflow_dispatch(
        WorkflowDispatchMessage(
            job_id=20012,
            project_id=30012,
            dispatch_type="start",
        )
    )
    client = TestClient(create_app())

    response = client.get("/api/v1/workflow/jobs/20012")

    assert response.status_code == 200
    body = response.json()
    assert body["job"]["id"] == 20012
    assert body["projections"]["analysis_job"]["id"] == 20012
    assert body["projections"]["analysis_regions"][0]["measure_start"] == 1
    assert body["projections"]["suggestion_group"] is None


def test_workflow_start_payload_defaults_include_clipping() -> None:
    payload = WorkflowStartPayload(
        job_id=20013,
        project_id=30013,
        project_snapshot=build_project_snapshot(track_ids=[1]),
    )

    assert payload.issue_types == ["band_overlap", "clipping"]
