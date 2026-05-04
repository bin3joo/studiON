from pathlib import Path
from tempfile import gettempdir
from types import SimpleNamespace

import numpy as np
import pytest
import soundfile as sf
from scipy.signal import resample_poly

from app.graph import nodes
from app.graph.nodes import analysis as analysis_nodes
from app.graph.nodes import runtime as runtime_nodes
from app.graph.nodes import suggestion as suggestion_nodes
from app.graph.state import build_workflow_initial_state
from app.graph.workflow import build_workflow_response, run_workflow_graph
from app.services.clap_inference import CLAPInferenceError, CLAPTrackPrediction
from app.services.plan_critic_llm import PlanCriticLLMResponse
from app.services.planning_llm import PlanningLLMError, PlanningLLMResponse
from app.services.workflow_artifacts import WorkflowArtifactDocument, get_workflow_artifact_store
from app.services.workflow_audio_metadata import AudioMetadataRecord
from app.services.workflow_preview_renderer import (
    PREVIEW_CONTEXT_PADDING_MS,
    render_preview_audio,
)
from app.services.workflow_snapshots import ProjectSnapshot, build_snapshot_runtime_context

_TEST_AUDIO_METADATA: dict[int, AudioMetadataRecord] = {}


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
    audio_path = audio_dir / f"track-{track_id}-{'vocal' if vocal_like else 'support'}.wav"
    if not audio_path.exists():
        sf.write(audio_path, signal, sample_rate)
    return str(audio_path)


def _clip_id(track_id: int, ordinal: int) -> int:
    return (track_id * 1000) + ordinal


def _audio_metadata_id(track_id: int, ordinal: int) -> int:
    return (track_id * 1000) + ordinal


def _register_audio_metadata(metadata_id: int, audio_path: str, *, duration_ms: int = 4800) -> int:
    _TEST_AUDIO_METADATA[metadata_id] = AudioMetadataRecord(
        id=metadata_id,
        object_key=audio_path,
        duration_ms=duration_ms,
    )
    return metadata_id


def _write_sine_audio(
    name: str,
    *,
    frequency_hz: float,
    amplitude: float,
    duration_ms: int,
    sample_rate: int = 44100,
) -> str:
    sample_count = int(round((duration_ms / 1000.0) * sample_rate))
    time_axis = np.arange(sample_count, dtype=np.float32) / float(sample_rate)
    signal = (amplitude * np.sin(2 * np.pi * frequency_hz * time_axis)).astype(np.float32)
    audio_dir = Path(gettempdir()) / "studion-ai-test-audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_path = audio_dir / f"{name}.wav"
    sf.write(audio_path, signal, sample_rate)
    return str(audio_path)


def _band_magnitude(
    waveform: np.ndarray,
    *,
    sample_rate: int,
    frequency_hz: float,
) -> float:
    mono = waveform[:, 0] if waveform.ndim == 2 else waveform
    spectrum = np.fft.rfft(mono)
    frequencies = np.fft.rfftfreq(mono.shape[0], d=1.0 / sample_rate)
    index = int(np.argmin(np.abs(frequencies - frequency_hz)))
    return float(np.abs(spectrum[index]))


class _FakeAudioMetadataStore:
    def get_by_ids(self, audio_metadata_ids: list[int]) -> dict[int, AudioMetadataRecord]:
        return {
            int(audio_metadata_id): _TEST_AUDIO_METADATA[int(audio_metadata_id)]
            for audio_metadata_id in audio_metadata_ids
            if int(audio_metadata_id) in _TEST_AUDIO_METADATA
        }


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
                    vocal_score=0.93 if is_vocal else 0.22,
                    confidence=0.89 if is_vocal else 0.71,
                    predicted_role="vocal-like" if is_vocal else "supporting",
                    excerpt_scores=[],
                )
            )
        return predictions


@pytest.fixture(autouse=True)
def patch_clap_client(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.graph.nodes.analysis.get_clap_inference_client",
        lambda: _FakeCLAPInferenceClient(),
    )


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
            issue_type = str(region.get("issue_type"))
            if issue_type == "clipping":
                action = {
                    "actionType": "GAIN_TRIM",
                    "targetScope": "MASTER",
                    "targetTrackId": None,
                    "targetClipId": None,
                    "startMs": int(region["start_ms"]),
                    "endMs": int(region["end_ms"]),
                    "bandLowHz": None,
                    "bandHighHz": None,
                    "gainDeltaDb": -2.2,
                    "params": {
                        "preGainDb": -2.2,
                        "postAction": "TRUE_PEAK_LIMITER",
                        "ceilingDbfs": -1.0,
                    },
                }
            else:
                preserve_track_id = next(
                    (
                        int(item["track_id"])
                        for item in clip_context
                        if bool(item.get("is_preserve_target"))
                    ),
                    None,
                )
                involved_track_ids = [
                    int(track_id) for track_id in region.get("involved_track_ids", [])
                ]
                target_track_id = next(
                    (
                        track_id
                        for track_id in involved_track_ids
                        if preserve_track_id is None or track_id != preserve_track_id
                    ),
                    int(region.get("track_id") or 0),
                )
                action = {
                    "actionType": "DYNAMIC_EQ",
                    "targetScope": "TRACK",
                    "targetTrackId": target_track_id,
                    "targetClipId": None,
                    "startMs": int(region["start_ms"]),
                    "endMs": int(region["end_ms"]),
                    "bandLowHz": int(region.get("band_low_hz") or 250),
                    "bandHighHz": int(region.get("band_high_hz") or 1200),
                    "gainDeltaDb": -2.4,
                    "params": {"threshold": -19, "ratio": 2.0},
                }
            return PlanningLLMResponse(
                plan_payload={
                    "strategyTitle": f"Plan for {issue_type}",
                    "strategySummary": "Planner-generated strategy summary",
                    "summary": "Planner-generated summary",
                    "explanation": "Planner-generated explanation",
                    "candidate": {"action": action},
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


@pytest.fixture(autouse=True)
def reset_preview_related_stores(monkeypatch: pytest.MonkeyPatch) -> None:
    _TEST_AUDIO_METADATA.clear()
    settings = SimpleNamespace(
        mongo_url=None,
        mongo_database="studion_ai",
        mongo_snapshot_collection="timeline_snapshots",
        mongo_artifact_collection="workflow_artifacts",
        audio_root=None,
    )
    monkeypatch.setattr("app.services.workflow_artifacts.get_settings", lambda: settings)
    monkeypatch.setattr("app.services.workflow_snapshots.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.services.workflow_snapshots.get_workflow_audio_metadata_store",
        lambda: _FakeAudioMetadataStore(),
    )
    monkeypatch.setattr("app.services.workflow_artifacts._mongo_store", None)
    monkeypatch.setattr("app.services.workflow_snapshots._mongo_store", None)
    artifact_store = get_workflow_artifact_store()
    snapshot_store = analysis_nodes.get_workflow_snapshot_store()
    artifact_store.reset()
    snapshot_store.reset()
    yield
    artifact_store.reset()
    snapshot_store.reset()
    _TEST_AUDIO_METADATA.clear()


def build_project_snapshot(*, track_ids: list[int]) -> ProjectSnapshot:
    clips = []
    for index, track_id in enumerate(track_ids, start=1):
        metadata_id = _register_audio_metadata(
            _audio_metadata_id(track_id, index),
            _ensure_test_audio_file(track_id, vocal_like=index == 1),
        )
        clips.append(
            {
                "clip_id": _clip_id(track_id, index),
                "track_id": track_id,
                "start_ms": (index - 1) * 900,
                "end_ms": ((index - 1) * 900) + 2200,
                "audio_metadata_id": metadata_id,
                "audio_start_ms": 0,
                "audio_duration_ms": 4800,
            }
        )
    return ProjectSnapshot.model_validate(
        {
            "duration_ms": 4800,
            "bpm": 120,
            "numerator": 4,
            "denominator": 4,
            "tracks": [
                {"track_id": track_id, "name": f"Track {track_id}"} for track_id in track_ids
            ],
            "clips": clips,
        }
    )


def build_project_snapshot_with_audio(
    *,
    track_audio_paths: dict[int, str],
    duration_ms: int = 4800,
) -> ProjectSnapshot:
    return ProjectSnapshot.model_validate(
        {
            "duration_ms": duration_ms,
            "bpm": 120,
            "numerator": 4,
            "denominator": 4,
            "tracks": [
                {"track_id": track_id, "name": f"Track {track_id}"}
                for track_id in track_audio_paths.keys()
            ],
            "clips": [
                {
                    "clip_id": _clip_id(track_id, 1),
                    "track_id": track_id,
                    "start_ms": 0,
                    "end_ms": duration_ms,
                    "audio_metadata_id": _register_audio_metadata(
                        _audio_metadata_id(track_id, 1),
                        audio_path,
                        duration_ms=duration_ms,
                    ),
                    "audio_start_ms": 0,
                    "audio_duration_ms": duration_ms,
                }
                for track_id, audio_path in track_audio_paths.items()
            ],
        }
    )


def build_plan_input(
    state: dict,
    *,
    user_feedback_message: str | None = None,
) -> dict[str, object]:
    selected_region_id = state["ranked_candidate_ids"][0]
    region = next(
        region for region in state["analysis_regions"] if region["id"] == selected_region_id
    )
    preserve_clip_id = region["affected_clip_ids"][0]
    payload = {
        "selected_region_id": selected_region_id,
        "preserve_clip_id": preserve_clip_id,
    }
    if user_feedback_message is not None:
        payload["user_feedback_message"] = user_feedback_message
    return payload


def test_workflow_waits_for_user_mix_intent_before_suggestions() -> None:
    result = run_workflow_graph(
        {
            "job_id": 10001,
            "project_id": 20001,
            "project_snapshot": build_project_snapshot(track_ids=[12, 18]),
            "issue_types": ["band_overlap", "clipping"],
        }
    )

    assert result["runtime_status"] == "waiting_for_user"
    assert result["durable_status"] == "WAITING_USER"
    assert result["current_node"] == "wait_user_plan_input"
    assert result["preview_id"] is None
    assert result["suggestion_group_id"] is None


def test_workflow_finalize_without_user_action_when_no_suggestions_exist() -> None:
    result = run_workflow_graph(
        {
            "job_id": 10002,
            "project_id": 20002,
            "project_snapshot": build_project_snapshot(track_ids=[9]),
            "issue_types": [],
        }
    )

    assert result["current_node"] == "finalize_output"
    assert result["runtime_status"] == "completed"
    assert result["durable_status"] == "COMPLETED"


def test_workflow_plan_loop_runs_for_band_overlap_and_clipping() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": 10003,
            "project_id": 20003,
            "project_snapshot": build_project_snapshot(track_ids=[3, 4]),
            "issue_types": ["band_overlap", "clipping"],
        }
    )
    result = run_workflow_graph({**waiting, **build_plan_input(waiting)})
    artifact_store = get_workflow_artifact_store()
    execution_plan_artifact_id = next(
        artifact_id
        for artifact_id in reversed(result["mongo_artifact_ids"])
        if "execution-plan" in artifact_id
    )
    execution_plan_artifact = artifact_store.get_artifact(execution_plan_artifact_id)

    assert result["current_node"] == "wait_user_confirm"
    assert result["plan_status"] == "APPROVED"
    assert result["preview_action_ids"] == ["10003-action-1"]
    assert result["preview_status"] == "READY"
    assert result["preview_suggestion_id"] == "10003-group-suggestion-1"
    assert result["preview_duration_ms"] is not None
    assert result["preview_duration_ms"] > 0
    assert result["preview_object_key"] is not None
    assert Path(result["preview_object_key"]).exists()
    assert execution_plan_artifact is not None
    assert execution_plan_artifact.artifact_type == "execution_plan"
    assert execution_plan_artifact.payload["previewActionIds"] == ["10003-action-1"]
    preview_action_id = (
        execution_plan_artifact.payload["suggestionPayload"]["suggestions"][0]["actions"][0][
            "actionId"
        ]
    )
    assert preview_action_id == "10003-action-1"


def test_materialize_execution_plan_fails_before_internal_approval() -> None:
    state = build_workflow_initial_state(
        job_id=10041,
        project_id=20041,
        analysis_regions=[
            {
                "id": "region-1",
                "issue_type": "clipping",
                "start_ms": 0,
                "end_ms": 400,
                "affected_clip_ids": [1],
            }
        ],
        selected_region_id="region-1",
        preserve_clip_id=1,
        plan_status="DRAFT",
        plan_payload={
            "strategyTitle": "title",
            "strategySummary": "summary",
            "summary": "candidate summary",
            "explanation": "candidate explanation",
            "candidate": {
                "action": {
                    "actionId": "10041-action-1",
                    "actionType": "GAIN_TRIM",
                    "targetScope": "MASTER",
                    "targetTrackId": None,
                    "targetClipId": None,
                    "startMs": 0,
                    "endMs": 400,
                    "bandLowHz": None,
                    "bandHighHz": None,
                    "gainDeltaDb": -2.0,
                    "params": {"preGainDb": -2.0},
                }
            },
        },
    )

    result = suggestion_nodes.materialize_execution_plan(state)

    assert result["current_node"] == "fail_workflow"
    assert result["failure_code"] == "PLAN_NOT_APPROVED"


def test_workflow_skips_clap_when_not_needed() -> None:
    result = run_workflow_graph(
        {
            "job_id": 10004,
            "project_id": 20004,
            "project_snapshot": build_project_snapshot(track_ids=[2, 5]),
            "issue_types": ["band_overlap"],
        }
    )

    assert result["clap_required"] is False
    assert result["current_node"] == "wait_user_plan_input"
    assert result["inferred_roles"] == {}


def test_workflow_revises_once_then_passes() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": 10005,
            "project_id": 20005,
            "project_snapshot": build_project_snapshot(track_ids=[7, 8]),
            "issue_types": ["band_overlap"],
            "validator_mode": "REVISE_ONCE",
            "critic_mode": "PASS",
        }
    )
    result = run_workflow_graph({**waiting, **build_plan_input(waiting)})

    assert result["current_node"] == "wait_user_confirm"
    assert result["transition_log"].count("planning_agent") == 2


def test_workflow_planning_agent_uses_llm_plan_payload_when_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
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
                    "strategyTitle": "LLM plan title",
                    "strategySummary": "LLM plan summary",
                    "summary": "LLM summary",
                    "explanation": "LLM explanation",
                    "candidate": {
                        "action": {
                            "actionType": "DYNAMIC_EQ",
                            "targetScope": "TRACK",
                            "targetTrackId": 24,
                            "targetClipId": None,
                            "startMs": int(region["start_ms"]),
                            "endMs": int(region["end_ms"]),
                            "bandLowHz": int(region.get("band_low_hz") or 250),
                            "bandHighHz": int(region.get("band_high_hz") or 1200),
                            "gainDeltaDb": -2.4,
                            "params": {"threshold": -19, "ratio": 2.0},
                        }
                    },
                }
            )

    monkeypatch.setattr(
        "app.graph.nodes.suggestion.get_planning_llm_client",
        lambda: _FakePlanningClient(),
    )
    waiting = run_workflow_graph(
        {
            "job_id": 10034,
            "project_id": 20034,
            "project_snapshot": build_project_snapshot(track_ids=[12, 24]),
            "issue_types": ["band_overlap"],
        }
    )

    result = run_workflow_graph({**waiting, **build_plan_input(waiting)})

    suggestion = result["suggestion_payload"]["suggestions"][0]
    assert result["plan_payload"]["strategyTitle"] == "LLM plan title"
    assert result["plan_payload"]["strategySummary"] == "LLM plan summary"
    assert suggestion["summary"] == "LLM summary"
    assert suggestion["explanation"] == "LLM explanation"


def test_workflow_planning_agent_fails_when_llm_call_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FailingPlanningClient:
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
            raise PlanningLLMError("PLANNING_LLM_TIMEOUT", "timeout")

    monkeypatch.setattr(
        "app.graph.nodes.suggestion.get_planning_llm_client",
        lambda: _FailingPlanningClient(),
    )
    waiting = run_workflow_graph(
        {
            "job_id": 10035,
            "project_id": 20035,
            "project_snapshot": build_project_snapshot(track_ids=[14, 15]),
            "issue_types": ["band_overlap"],
        }
    )

    result = run_workflow_graph({**waiting, **build_plan_input(waiting)})

    assert result["current_node"] == "fail_workflow"
    assert result["failure_code"] == "PLANNING_LLM_TIMEOUT"
    assert result["runtime_status"] == "failed"


def test_workflow_fails_when_validator_rejects() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": 10006,
            "project_id": 20006,
            "project_snapshot": build_project_snapshot(track_ids=[1, 2]),
            "issue_types": ["band_overlap"],
        }
    )
    result = run_workflow_graph(
        {
            **waiting,
            **build_plan_input(waiting),
            "validator_mode": "REJECT",
        }
    )

    assert result["current_node"] == "fail_workflow"
    assert result["runtime_status"] == "failed"
    assert result["durable_status"] == "FAILED"


def test_workflow_autofixes_sibilance_without_preview() -> None:
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
    audio_path = audio_dir / "workflow-sibilance-autofix.wav"
    sf.write(audio_path, vocal_like, sample_rate)

    result = run_workflow_graph(
        {
            "job_id": 10040,
            "project_id": 20040,
            "project_snapshot": build_project_snapshot_with_audio(
                track_audio_paths={8: str(audio_path)}
            ),
            "issue_types": ["sibilance"],
        }
    )
    artifact_store = get_workflow_artifact_store()
    recipe_artifact = artifact_store.get_artifact(result["auto_fix_recipe_artifact_id"])
    log_artifact = artifact_store.get_artifact(result["sibilance_fix_log_id"])

    assert result["current_node"] == "finalize_output"
    assert result["runtime_status"] == "completed"
    assert result["preview_action_ids"] == []
    assert result["sibilance_fix_applied"] is True
    assert result["sibilance_fix_log_id"] is not None
    assert result["auto_fix_recipe_artifact_id"] is not None
    assert recipe_artifact is not None
    assert recipe_artifact.payload["issueType"] == "sibilance"
    assert recipe_artifact.payload["appliedInMixedIssueFlow"] is False
    assert recipe_artifact.payload["regionIds"]
    assert recipe_artifact.payload["groups"][0]["issueType"] == "sibilance"
    assert log_artifact is not None
    assert log_artifact.payload["recipeArtifactId"] == result["auto_fix_recipe_artifact_id"]
    assert log_artifact.payload["regionIds"] == recipe_artifact.payload["regionIds"]


def test_workflow_keeps_preview_flow_and_logs_sibilance_in_mixed_issue_run() -> None:
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
    audio_path = audio_dir / "workflow-mixed-sibilance.wav"
    sf.write(audio_path, vocal_like, sample_rate)

    waiting = run_workflow_graph(
        {
            "job_id": 10042,
            "project_id": 20042,
            "project_snapshot": build_project_snapshot_with_audio(
                track_audio_paths={
                    8: str(audio_path),
                    9: _ensure_test_audio_file(9, vocal_like=False),
                }
            ),
            "issue_types": ["band_overlap", "sibilance"],
        }
    )
    result = run_workflow_graph({**waiting, **build_plan_input(waiting)})
    artifact_store = get_workflow_artifact_store()
    recipe_artifact = artifact_store.get_artifact(result["auto_fix_recipe_artifact_id"])
    log_artifact = artifact_store.get_artifact(result["sibilance_fix_log_id"])

    assert result["current_node"] == "wait_user_confirm"
    assert result["preview_action_ids"] == ["10042-action-1"]
    assert result["sibilance_fix_applied"] is True
    assert result["auto_fix_recipe_artifact_id"] is not None
    assert result["sibilance_fix_log_id"] is not None
    assert recipe_artifact is not None
    assert recipe_artifact.payload["appliedInMixedIssueFlow"] is True
    assert recipe_artifact.payload["groups"][0]["issueType"] == "sibilance"
    assert log_artifact is not None
    assert log_artifact.payload["recipeArtifactId"] == result["auto_fix_recipe_artifact_id"]


def test_workflow_auto_applies_representative_preview_action() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": 10037,
            "project_id": 20037,
            "project_snapshot": build_project_snapshot(track_ids=[8, 9]),
            "issue_types": ["band_overlap"],
        }
    )
    selected = run_workflow_graph({**waiting, **build_plan_input(waiting)})

    assert selected["current_node"] == "wait_user_confirm"
    assert selected["runtime_status"] == "waiting_for_user"
    assert selected["apply_result_id"] == "10037-apply"
    assert selected["preview_action_ids"] == ["10037-action-1"]
    assert selected["preview_requested_at"] is not None
    assert selected["preview_started_at"] is not None
    assert selected["preview_completed_at"] is not None
    assert selected["preview_status"] == "READY"


def test_workflow_confirm_commits_and_finalizes() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": 10038,
            "project_id": 20038,
            "project_snapshot": build_project_snapshot(track_ids=[4, 14]),
            "issue_types": ["band_overlap"],
        }
    )
    mix_resolved = run_workflow_graph(
        {**waiting, **build_plan_input(waiting)}
    )
    confirmed = run_workflow_graph(
        {
            **mix_resolved,
            "user_decision": "confirm",
        }
    )

    assert confirmed["current_node"] == "finalize_output"
    assert confirmed["runtime_status"] == "completed"
    assert confirmed["feedback_event_id"] == "10038-feedback"


def test_workflow_cancel_path_finalizes() -> None:
    mix_resolved = run_workflow_graph(
        {
            "job_id": 10039,
            "project_id": 20039,
            "project_snapshot": build_project_snapshot(track_ids=[6, 7]),
            "issue_types": ["band_overlap"],
        }
    )
    mix_resolved = run_workflow_graph({**mix_resolved, **build_plan_input(mix_resolved)})
    cancelled = run_workflow_graph({**mix_resolved, "user_decision": "cancel"})

    assert cancelled["current_node"] == "finalize_output"


def test_user_action_gate_routes_directly_to_apply_when_action_is_required() -> None:
    original = build_workflow_initial_state(
        job_id=10036,
        project_id=20036,
        phase="analysis_result_persisted",
        preview_action_ids=["10036-action-1"],
        user_action_required=True,
    )
    gated = nodes.user_action_gate(original)

    assert gated["phase"] == "user_action_gate_checked"
    from app.graph.edges import route_after_user_action_gate

    assert route_after_user_action_gate({**original, **gated}) == "apply_selected_edit_recipe"


def test_workflow_fails_when_no_preview_action_exists() -> None:
    failed = nodes.apply_selected_edit_recipe(
        build_workflow_initial_state(
            job_id=10017,
            project_id=20017,
            phase="analysis_result_persisted",
            preview_action_ids=[],
        )
    )

    assert failed["current_node"] == "fail_workflow"
    assert failed["runtime_status"] == "failed"
    assert failed["failure_code"] == "MISSING_PREVIEW_ACTION"


def test_workflow_fails_when_multiple_preview_actions_exist() -> None:
    failed = nodes.apply_selected_edit_recipe(
        build_workflow_initial_state(
            job_id=10018,
            project_id=20018,
            phase="analysis_result_persisted",
            preview_action_ids=[
                "job-unknown-selection-action-1",
                "job-unknown-selection-action-2",
            ],
        )
    )

    assert failed["current_node"] == "fail_workflow"
    assert failed["runtime_status"] == "failed"
    assert failed["failure_code"] == "INVALID_PREVIEW_ACTION_COUNT"


def test_render_preview_fails_when_audio_source_cannot_be_resolved() -> None:
    failed = nodes.render_preview(
        build_workflow_initial_state(
            job_id=10019,
            project_id=20019,
            selected_region_id="region-1",
            preview_id="10019-preview",
            preview_action_ids=["10019-action-1"],
            suggestion_group_id="10019-group",
            analysis_regions=[
                {
                    "id": "region-1",
                    "issue_type": "band_overlap",
                    "start_ms": 0,
                    "end_ms": 800,
                    "measure_start": 1,
                    "measure_end": 1,
                }
            ],
            suggestion_payload={
                "suggestions": [
                    {
                        "rank": 1,
                        "summary": "preview",
                        "actions": [
                            {
                                "actionId": "10019-action-1",
                                "actionType": "DYNAMIC_EQ",
                                "targetScope": "TRACK",
                                "targetTrackId": 10,
                                "startMs": 0,
                                "endMs": 800,
                                "bandLowHz": 180,
                                "bandHighHz": 420,
                                "gainDeltaDb": -2.0,
                                "params": {"threshold": -19, "ratio": 2.0},
                            }
                        ],
                    }
                ]
            },
            clip_index=[
                {
                    "clip_id": _clip_id(10, 1),
                    "track_id": 10,
                    "start_ms": 0,
                    "end_ms": 1200,
                    "audio_path": str(Path(gettempdir()) / "missing-preview-source.wav"),
                    "audio_start_ms": 0,
                    "audio_duration_ms": 1200,
                }
            ],
        )
    )

    assert failed["current_node"] == "fail_workflow"
    assert failed["runtime_status"] == "failed"
    assert failed["failure_code"] == "PREVIEW_AUDIO_NOT_FOUND"
    assert failed["preview_status"] == "FAILED"


def test_render_preview_audio_generates_preview_wav() -> None:
    preview_id = "10043-preview"
    duration_ms = 2200
    target_path = _write_sine_audio(
        "preview-target-10043",
        frequency_hz=220.0,
        amplitude=0.5,
        duration_ms=duration_ms,
    )
    support_path = _write_sine_audio(
        "preview-support-10043",
        frequency_hz=1000.0,
        amplitude=0.2,
        duration_ms=duration_ms,
    )
    result = render_preview_audio(
        job_id=10043,
        preview_id=preview_id,
        clip_index=[
            {
                "clip_id": _clip_id(12, 1),
                "track_id": 12,
                "start_ms": 0,
                "end_ms": duration_ms,
                "audio_path": target_path,
                "audio_start_ms": 0,
                "audio_duration_ms": duration_ms,
            },
            {
                "clip_id": _clip_id(24, 1),
                "track_id": 24,
                "start_ms": 0,
                "end_ms": duration_ms,
                "audio_path": support_path,
                "audio_start_ms": 0,
                "audio_duration_ms": duration_ms,
            },
        ],
        action={
            "actionType": "DYNAMIC_EQ",
            "targetScope": "TRACK",
            "targetTrackId": 12,
            "startMs": 100,
            "endMs": 700,
            "bandLowHz": 180,
            "bandHighHz": 420,
            "gainDeltaDb": -2.5,
            "params": {"threshold": -19, "ratio": 2.0},
        },
        focus_region={
            "id": "region-10043",
            "start_ms": 100,
            "end_ms": 700,
            "measure_start": 1,
            "measure_end": 1,
        },
        project_duration_ms=duration_ms,
    )

    assert result.duration_ms > 0
    assert result.duration_ms == duration_ms
    assert result.excerpt_start_ms == 0
    assert result.excerpt_end_ms == duration_ms
    assert Path(result.object_key).exists()
    waveform, sample_rate = sf.read(result.object_key, always_2d=True)
    assert sample_rate == 44100
    assert waveform.shape[0] == int(round((duration_ms / 1000.0) * sample_rate))

    effect_start_frame = int(round((100 / 1000.0) * sample_rate))
    effect_end_frame = int(round((700 / 1000.0) * sample_rate))
    rendered_effect = waveform[effect_start_frame:effect_end_frame]

    baseline_target, _ = sf.read(target_path, always_2d=True)
    baseline_support, _ = sf.read(support_path, always_2d=True)
    baseline_effect = (
        baseline_target[effect_start_frame:effect_end_frame]
        + baseline_support[effect_start_frame:effect_end_frame]
    )

    rendered_target_band = _band_magnitude(
        rendered_effect,
        sample_rate=sample_rate,
        frequency_hz=220.0,
    )
    baseline_target_band = _band_magnitude(
        baseline_effect,
        sample_rate=sample_rate,
        frequency_hz=220.0,
    )
    rendered_support_band = _band_magnitude(
        rendered_effect,
        sample_rate=sample_rate,
        frequency_hz=1000.0,
    )
    baseline_support_band = _band_magnitude(
        baseline_effect,
        sample_rate=sample_rate,
        frequency_hz=1000.0,
    )

    assert rendered_target_band < baseline_target_band * 0.9
    assert rendered_support_band == pytest.approx(baseline_support_band, rel=0.05)


def test_workflow_uses_user_selected_main_track_for_generated_action() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": 10041,
            "project_id": 20041,
            "project_snapshot": build_project_snapshot(track_ids=[11, 22]),
            "issue_types": ["band_overlap"],
        }
    )

    plan_input = build_plan_input(waiting)
    resumed = run_workflow_graph({**waiting, **plan_input})

    action = resumed["suggestion_payload"]["suggestions"][0]["actions"][0]
    assert action["targetTrackId"] in {11, 22}


def test_workflow_response_contains_unified_projections() -> None:
    snapshot = build_project_snapshot(track_ids=[10, 20])
    waiting = run_workflow_graph(
        {
            "job_id": 10042,
            "project_id": 20042,
            "project_snapshot": snapshot,
            "issue_types": ["band_overlap", "sibilance"],
        }
    )
    result = run_workflow_graph({**waiting, **build_plan_input(waiting)})
    response = build_workflow_response(result)

    assert response["graph_state"]["job_id"] == 10042
    assert response["projections"]["analysis_job"]["id"] == 10042
    assert response["projections"]["analysis_regions"][0]["job_id"] == 10042
    assert response["projections"]["analysis_regions"][0]["issue_type"] in {
        "BAND_OVERLAP",
        "SIBILANCE",
    }
    assert response["projections"]["suggestion_group"]["id"] == "10042-group"
    assert response["projections"]["preview_render"]["id"] == "10042-preview"
    assert response["projections"]["preview_render"]["status"] == "READY"
    assert response["projections"]["preview_render"]["object_key"] is not None
    assert response["projections"]["preview_render"]["before_object_key"] is not None
    assert Path(response["projections"]["preview_render"]["object_key"]).exists()
    assert Path(response["projections"]["preview_render"]["before_object_key"]).exists()
    assert response["projections"]["preview_render"]["duration_ms"] > 0
    assert (
        response["projections"]["preview_render"]["before_duration_ms"]
        == response["projections"]["preview_render"]["duration_ms"]
    )
    assert response["projections"]["preview_render"]["preview_target_region"] == (
        result["selected_region_id"]
    )
    assert response["projections"]["preview_render"]["preview_action_track"] is not None
    assert response["projections"]["preview_render"]["preview_excerpt_range"]["start_ms"] == max(
        0,
        next(
            region["start_ms"]
            for region in result["analysis_regions"]
            if region["id"] == result["selected_region_id"]
        )
        - PREVIEW_CONTEXT_PADDING_MS,
    )
    assert response["projections"]["analysis_regions"][0]["measure_start"] == 1
    assert response["projections"]["analysis_regions"][0]["affected_clip_ids"]


def test_workflow_clipping_only_waits_for_user_plan_input() -> None:
    result = run_workflow_graph(
        {
            "job_id": 10031,
            "project_id": 20031,
            "project_snapshot": build_project_snapshot(track_ids=[6]),
            "issue_types": ["clipping"],
        }
    )

    assert result["current_node"] == "finalize_output"
    assert result["clipping_fix_applied"] is True
    assert result["preview_id"] is None
    assert result["preview_action_ids"] == []
    assert (
        "track_clipping" in result["detected_issues"]
        or "master_clipping" in result["detected_issues"]
    )


def test_workflow_analysis_regions_include_detector_metadata() -> None:
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
    supporting = (0.28 * np.sin(2 * np.pi * 330 * time_axis)).astype(np.float32)
    audio_dir = Path(gettempdir()) / "studion-ai-test-audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    first_path = audio_dir / "workflow-region-shape-vocal.wav"
    second_path = audio_dir / "workflow-region-shape-support.wav"
    sf.write(first_path, vocal_like, sample_rate)
    sf.write(second_path, supporting, sample_rate)
    snapshot = build_project_snapshot_with_audio(
        track_audio_paths={30: str(first_path), 31: str(second_path)}
    )
    waiting = run_workflow_graph(
        {
            "job_id": 10007,
            "project_id": 20007,
            "project_snapshot": snapshot,
            "issue_types": ["band_overlap", "sibilance", "track_clipping", "master_clipping"],
        }
    )
    result = run_workflow_graph({**waiting, **build_plan_input(waiting)})

    region_by_issue = {region["issue_type"]: region for region in result["analysis_regions"]}
    overlap = region_by_issue["band_overlap"]
    clipping = region_by_issue.get("track_clipping") or region_by_issue.get("master_clipping")
    sibilance = region_by_issue["sibilance"]

    assert overlap["secondary_track_id"] is None
    assert set(overlap["involved_track_ids"]) == {30, 31}
    assert overlap["band_low_hz"] == 250
    assert overlap["band_high_hz"] == 1200
    assert overlap["measure_start"] == 1
    assert overlap["measure_end"] in {1, 2, 3}
    assert _clip_id(30, 1) in overlap["affected_clip_ids"]
    assert _clip_id(31, 1) in overlap["affected_clip_ids"]
    assert clipping is not None
    assert clipping["requires_user_action"] is False
    assert sibilance["track_id"] == 30
    assert result["sibilance_fix_applied"] is True
    assert result["ranking_scores"][overlap["id"]] > 0


def test_merge_analysis_keeps_all_regions_without_issue_cap() -> None:
    initial = build_workflow_initial_state(
        job_id=10019,
        project_id=41,
        issue_types=["band_overlap"],
    )
    context = build_snapshot_runtime_context(build_project_snapshot(track_ids=[101, 202]))
    initial["bar_mapping"] = context.bar_mapping
    initial["clip_index"] = context.clip_index
    initial["analysis_regions"] = [
        {
            "id": f"job-all-regions-band-overlap-region-{index}",
            "issue_type": "band_overlap",
            "summary": "Detected likely masking conflict in low-mid body band.",
            "start_ms": 1000 + (index * 500),
            "end_ms": 1360 + (index * 500),
            "severity": "MEDIUM",
            "requires_user_action": True,
            "evidence_doc_id": f"job-all-regions:band-overlap-evidence-{index}",
            "track_id": 101,
            "secondary_track_id": 202,
            "band_low_hz": 250,
            "band_high_hz": 1200,
            "score": 0.6 + (index * 0.01),
            "window_count": 2,
        }
        for index in range(5)
    ]

    result = nodes.merge_analysis(initial)

    assert len(result["analysis_regions"]) == 5
    assert [region["id"] for region in result["analysis_regions"]] == [
        f"job-all-regions-band-overlap-region-{index}" for index in range(5)
    ]


def test_merge_analysis_keeps_highest_score_region_for_same_key() -> None:
    initial = build_workflow_initial_state(
        job_id=10020,
        project_id=51,
        issue_types=["clipping", "band_overlap"],
    )
    initial["analysis_regions"] = [
        {
            "id": "job-merge-dedup-clipping-region-1",
            "issue_type": "clipping",
            "summary": "Lower score clipping region.",
            "start_ms": 1200,
            "end_ms": 1440,
            "severity": "MEDIUM",
            "requires_user_action": True,
            "evidence_doc_id": "job-merge-dedup:clipping-evidence-1",
            "track_id": 1,
            "secondary_track_id": None,
            "involved_track_ids": [],
            "band_low_hz": None,
            "band_high_hz": None,
            "score": 0.18,
            "window_count": 1,
            "measure_start": 1,
            "measure_end": 1,
            "affected_clip_ids": ["clip-a"],
        },
        {
            "id": "job-merge-dedup-clipping-region-2",
            "issue_type": "clipping",
            "summary": "Higher score clipping region.",
            "start_ms": 1200,
            "end_ms": 1440,
            "severity": "HIGH",
            "requires_user_action": True,
            "evidence_doc_id": "job-merge-dedup:clipping-evidence-2",
            "track_id": 1,
            "secondary_track_id": None,
            "involved_track_ids": [],
            "band_low_hz": None,
            "band_high_hz": None,
            "score": 0.32,
            "window_count": 1,
            "measure_start": 1,
            "measure_end": 1,
            "affected_clip_ids": ["clip-b"],
        },
        {
            "id": "job-merge-dedup-band-overlap-region-1",
            "issue_type": "band_overlap",
            "summary": "Separate issue should remain.",
            "start_ms": 1800,
            "end_ms": 2160,
            "severity": "MEDIUM",
            "requires_user_action": True,
            "evidence_doc_id": "job-merge-dedup:band-overlap-evidence-1",
            "track_id": 2,
            "secondary_track_id": None,
            "involved_track_ids": [2, 3],
            "band_low_hz": 250,
            "band_high_hz": 1200,
            "score": 0.61,
            "window_count": 2,
            "measure_start": 1,
            "measure_end": 2,
            "affected_clip_ids": ["clip-c", "clip-d"],
        },
    ]

    result = nodes.merge_analysis(initial)

    assert [region["id"] for region in result["analysis_regions"]] == [
        "job-merge-dedup-clipping-region-2",
        "job-merge-dedup-band-overlap-region-1",
    ]
    assert result["detected_issues"] == ["clipping", "band_overlap"]
    assert result["analysis_region_ids"] == [
        "job-merge-dedup-clipping-region-2",
        "job-merge-dedup-band-overlap-region-1",
    ]
    assert result["analysis_regions"][0]["affected_clip_ids"] == ["clip-b"]


def test_merge_analysis_keeps_distinct_time_ranges() -> None:
    initial = build_workflow_initial_state(
        job_id=10021,
        project_id=52,
        issue_types=["clipping"],
    )
    initial["analysis_regions"] = [
        {
            "id": "job-merge-time-clipping-region-1",
            "issue_type": "clipping",
            "summary": "Earlier clipping region.",
            "start_ms": 500,
            "end_ms": 740,
            "severity": "HIGH",
            "requires_user_action": True,
            "evidence_doc_id": "job-merge-time:clipping-evidence-1",
            "track_id": 1,
            "secondary_track_id": None,
            "involved_track_ids": [],
            "band_low_hz": None,
            "band_high_hz": None,
            "score": 0.22,
            "window_count": 1,
            "measure_start": 1,
            "measure_end": 1,
            "affected_clip_ids": ["clip-1"],
        },
        {
            "id": "job-merge-time-clipping-region-2",
            "issue_type": "clipping",
            "summary": "Later clipping region.",
            "start_ms": 900,
            "end_ms": 1140,
            "severity": "HIGH",
            "requires_user_action": True,
            "evidence_doc_id": "job-merge-time:clipping-evidence-2",
            "track_id": 1,
            "secondary_track_id": None,
            "involved_track_ids": [],
            "band_low_hz": None,
            "band_high_hz": None,
            "score": 0.21,
            "window_count": 1,
            "measure_start": 1,
            "measure_end": 1,
            "affected_clip_ids": ["clip-2"],
        },
    ]

    result = nodes.merge_analysis(initial)

    assert [region["id"] for region in result["analysis_regions"]] == [
        "job-merge-time-clipping-region-1",
        "job-merge-time-clipping-region-2",
    ]
    assert result["analysis_region_ids"] == [
        "job-merge-time-clipping-region-1",
        "job-merge-time-clipping-region-2",
    ]


def test_merge_analysis_uses_score_as_third_sort_key() -> None:
    initial = build_workflow_initial_state(
        job_id=10022,
        project_id=53,
        issue_types=["clipping"],
    )
    initial["analysis_regions"] = [
        {
            "id": "job-merge-sort-clipping-region-1",
            "issue_type": "clipping",
            "summary": "Lower score duplicate ordering candidate.",
            "start_ms": 800,
            "end_ms": 1040,
            "severity": "MEDIUM",
            "requires_user_action": True,
            "evidence_doc_id": "job-merge-sort:clipping-evidence-1",
            "track_id": 1,
            "secondary_track_id": None,
            "involved_track_ids": [],
            "band_low_hz": None,
            "band_high_hz": None,
            "score": 0.14,
            "window_count": 1,
            "measure_start": 1,
            "measure_end": 1,
            "affected_clip_ids": ["clip-1"],
        },
        {
            "id": "job-merge-sort-clipping-region-2",
            "issue_type": "clipping",
            "summary": "Higher score duplicate ordering candidate.",
            "start_ms": 800,
            "end_ms": 1040,
            "severity": "HIGH",
            "requires_user_action": True,
            "evidence_doc_id": "job-merge-sort:clipping-evidence-2",
            "track_id": 2,
            "secondary_track_id": None,
            "involved_track_ids": [],
            "band_low_hz": None,
            "band_high_hz": None,
            "score": 0.28,
            "window_count": 1,
            "measure_start": 1,
            "measure_end": 1,
            "affected_clip_ids": ["clip-2"],
        },
    ]

    result = nodes.merge_analysis(initial)

    assert [region["id"] for region in result["analysis_regions"]] == [
        "job-merge-sort-clipping-region-2",
        "job-merge-sort-clipping-region-1",
    ]


def test_candidate_ranking_ignores_auto_fix_only_regions_for_user_candidates() -> None:
    initial = build_workflow_initial_state(
        job_id=10023,
        project_id=61,
        issue_types=["sibilance", "band_overlap"],
    )
    initial["analysis_regions"] = [
        {
            "id": "job-ranking-autofix-sibilance-region-1",
            "issue_type": "sibilance",
            "summary": "Auto-fix only sibilance region.",
            "start_ms": 900,
            "end_ms": 1280,
            "severity": "HIGH",
            "requires_user_action": False,
            "evidence_doc_id": "job-ranking-autofix:sibilance-evidence-1",
            "track_id": 10,
            "secondary_track_id": None,
            "involved_track_ids": [],
            "band_low_hz": 5000,
            "band_high_hz": 9000,
            "score": 0.82,
            "window_count": 2,
            "measure_start": 1,
            "measure_end": 1,
            "affected_clip_ids": ["clip-a"],
        },
        {
            "id": "job-ranking-autofix-band-overlap-region-1",
            "issue_type": "band_overlap",
            "summary": "User-facing overlap region.",
            "start_ms": 1000,
            "end_ms": 1480,
            "severity": "MEDIUM",
            "requires_user_action": True,
            "evidence_doc_id": "job-ranking-autofix:band-overlap-evidence-1",
            "track_id": 20,
            "secondary_track_id": None,
            "involved_track_ids": [20, 21],
            "band_low_hz": 250,
            "band_high_hz": 1200,
            "score": 0.58,
            "window_count": 2,
            "measure_start": 1,
            "measure_end": 2,
            "affected_clip_ids": ["clip-b", "clip-c"],
        },
    ]

    result = nodes.candidate_ranking(initial)

    assert result["ranking_scores"]["job-ranking-autofix-sibilance-region-1"] > 0
    assert result["ranked_candidate_ids"] == [
        "job-ranking-autofix-band-overlap-region-1"
    ]


def test_candidate_ranking_prioritizes_issue_type_before_raw_score() -> None:
    initial = build_workflow_initial_state(
        job_id=10024,
        project_id=62,
        issue_types=["clipping", "band_overlap"],
    )
    initial["analysis_regions"] = [
        {
            "id": "job-ranking-priority-band-overlap-region-1",
            "issue_type": "band_overlap",
            "summary": "Strong overlap region.",
            "start_ms": 1400,
            "end_ms": 1960,
            "severity": "HIGH",
            "requires_user_action": True,
            "evidence_doc_id": "job-ranking-priority:band-overlap-evidence-1",
            "track_id": 2,
            "secondary_track_id": None,
            "involved_track_ids": [2, 3],
            "band_low_hz": 250,
            "band_high_hz": 1200,
            "score": 0.74,
            "window_count": 3,
            "measure_start": 1,
            "measure_end": 2,
            "affected_clip_ids": ["clip-c", "clip-d"],
        },
        {
            "id": "job-ranking-priority-clipping-region-1",
            "issue_type": "clipping",
            "summary": "Critical clipping should outrank overlap.",
            "start_ms": 1600,
            "end_ms": 1760,
            "severity": "CRITICAL",
            "requires_user_action": True,
            "evidence_doc_id": "job-ranking-priority:clipping-evidence-1",
            "track_id": 1,
            "secondary_track_id": None,
            "involved_track_ids": [],
            "band_low_hz": None,
            "band_high_hz": None,
            "score": 0.26,
            "window_count": 1,
            "measure_start": 1,
            "measure_end": 1,
            "affected_clip_ids": ["clip-a"],
        },
    ]

    result = nodes.candidate_ranking(initial)

    assert result["ranking_scores"]["job-ranking-priority-clipping-region-1"] > 0
    assert result["ranked_candidate_ids"] == [
        "job-ranking-priority-band-overlap-region-1",
        "job-ranking-priority-clipping-region-1",
    ]


def test_candidate_ranking_uses_severity_and_start_time_as_tie_breakers() -> None:
    initial = build_workflow_initial_state(
        job_id=10025,
        project_id=63,
        issue_types=["high_band_harshness"],
    )
    initial["analysis_regions"] = [
        {
            "id": "job-ranking-tie-high-band-region-1",
            "issue_type": "high_band_harshness",
            "summary": "Earlier high-band region.",
            "start_ms": 900,
            "end_ms": 1100,
            "severity": "MEDIUM",
            "requires_user_action": True,
            "evidence_doc_id": "job-ranking-tie:high-band-evidence-1",
            "track_id": 1,
            "secondary_track_id": None,
            "involved_track_ids": [],
            "band_low_hz": 5000,
            "band_high_hz": 9000,
            "score": 0.42,
            "window_count": 1,
            "measure_start": 1,
            "measure_end": 1,
            "affected_clip_ids": ["clip-a"],
        },
        {
            "id": "job-ranking-tie-high-band-region-2",
            "issue_type": "high_band_harshness",
            "summary": "Later but more severe high-band region.",
            "start_ms": 1200,
            "end_ms": 1400,
            "severity": "HIGH",
            "requires_user_action": True,
            "evidence_doc_id": "job-ranking-tie:high-band-evidence-2",
            "track_id": 2,
            "secondary_track_id": None,
            "involved_track_ids": [],
            "band_low_hz": 5000,
            "band_high_hz": 9000,
            "score": 0.382,
            "window_count": 1,
            "measure_start": 1,
            "measure_end": 1,
            "affected_clip_ids": ["clip-b"],
        },
        {
            "id": "job-ranking-tie-high-band-region-3",
            "issue_type": "high_band_harshness",
            "summary": "Same weighted score but earlier start.",
            "start_ms": 600,
            "end_ms": 800,
            "severity": "HIGH",
            "requires_user_action": True,
            "evidence_doc_id": "job-ranking-tie:high-band-evidence-3",
            "track_id": 3,
            "secondary_track_id": None,
            "involved_track_ids": [],
            "band_low_hz": 5000,
            "band_high_hz": 9000,
            "score": 0.382,
            "window_count": 1,
            "measure_start": 1,
            "measure_end": 1,
            "affected_clip_ids": ["clip-c"],
        },
    ]

    result = nodes.candidate_ranking(initial)

    assert result["ranked_candidate_ids"] == [
        "job-ranking-tie-high-band-region-3",
        "job-ranking-tie-high-band-region-2",
        "job-ranking-tie-high-band-region-1",
    ]


def test_run_workflow_graph_derives_timeline_metadata_from_project_snapshot() -> None:
    result = run_workflow_graph(
        {
            "job_id": 10008,
            "project_id": 20008,
            "project_snapshot": build_project_snapshot(track_ids=[7, 8]),
            "issue_types": ["band_overlap"],
        }
    )

    assert result["track_ids"] == [7, 8]
    assert result["bar_mapping"][0]["measure_no"] == 1
    assert result["clip_index"][0]["clip_id"] == _clip_id(7, 1)


def test_workflow_uses_full_stft_summary_when_audio_paths_exist(tmp_path) -> None:
    artifact_store = get_workflow_artifact_store()
    artifact_store.reset()
    sample_rate = 16000
    duration_seconds = 4.8
    time_axis = np.linspace(
        0,
        duration_seconds,
        int(sample_rate * duration_seconds),
        endpoint=False,
    )
    vocal_like = (
        0.25 * np.sin(2 * np.pi * 440 * time_axis)
        + 0.22 * np.sin(2 * np.pi * 6800 * time_axis)
    ).astype(np.float32)
    supporting = (0.28 * np.sin(2 * np.pi * 330 * time_axis)).astype(np.float32)
    first_path = tmp_path / "track-10.wav"
    second_path = tmp_path / "track-20.wav"
    sf.write(first_path, vocal_like, sample_rate)
    sf.write(second_path, supporting, sample_rate)

    result = run_workflow_graph(
        {
            "job_id": 10009,
            "project_id": 20009,
            "project_snapshot": build_project_snapshot_with_audio(
                track_audio_paths={
                    10: str(first_path),
                    20: str(second_path),
                }
            ),
            "issue_types": ["band_overlap", "sibilance", "clipping"],
        }
    )

    assert result["dsp_scan_summary"]["analysis_source"] == "full_stft"
    assert result["dsp_scan_summary"]["track_windows_preview"]["10"][0]["spectral_centroid_hz"] > 0
    assert result["clip_feature_artifact_id"] is not None
    assert result["sampled_clip_ids"] == [_clip_id(10, 1), _clip_id(20, 1)]
    assert result["track_representative_specs"] == [
        {
            "track_id": 10,
            "clip_id": _clip_id(10, 1),
            "resolved_audio_path": str(first_path),
            "source_format": ".wav",
        },
        {
            "track_id": 20,
            "clip_id": _clip_id(20, 1),
            "resolved_audio_path": str(second_path),
            "source_format": ".wav",
        },
    ]


def test_sample_track_clips_builds_track_representative_specs_across_multiple_clips() -> None:
    state = build_workflow_initial_state(job_id=10010, project_id=20010)
    state["track_ids"] = [10]
    state["clip_index"] = [
        {
            "clip_id": 10001,
            "track_id": 10,
            "start_ms": 0,
            "end_ms": 5000,
            "audio_path": _ensure_test_audio_file(10, vocal_like=True),
            "audio_start_ms": 0,
            "audio_duration_ms": 5000,
        },
        {
            "clip_id": 10002,
            "track_id": 10,
            "start_ms": 6000,
            "end_ms": 11000,
            "audio_path": _ensure_test_audio_file(10, vocal_like=True),
            "audio_start_ms": 1000,
            "audio_duration_ms": 5000,
        },
        {
            "clip_id": 10003,
            "track_id": 10,
            "start_ms": 12000,
            "end_ms": 18000,
            "audio_path": _ensure_test_audio_file(10, vocal_like=True),
            "audio_start_ms": 200,
            "audio_duration_ms": 6000,
        },
        {
            "clip_id": 10004,
            "track_id": 10,
            "start_ms": 19000,
            "end_ms": 23000,
            "audio_path": _ensure_test_audio_file(10, vocal_like=True),
            "audio_start_ms": 0,
            "audio_duration_ms": 4000,
        },
    ]

    result = analysis_nodes.sample_track_clips(state)

    assert result["sampled_clip_ids"] == [10001]
    assert result["track_representative_specs"] == [
        {
            "track_id": 10,
            "clip_id": 10001,
            "resolved_audio_path": _ensure_test_audio_file(10, vocal_like=True),
            "source_format": ".wav",
        }
    ]


def test_select_role_candidates_uses_high_band_issue_tracks() -> None:
    state = build_workflow_initial_state(
        job_id=10011,
        project_id=20011,
    )
    state["issue_types"] = ["sibilance"]
    state["analysis_regions"] = [
        {"issue_type": "high_band_harshness", "track_id": 3},
        {"issue_type": "high_band_harshness", "track_id": 1},
        {"issue_type": "clipping", "track_id": 8},
        {"issue_type": "high_band_harshness", "track_id": 3},
    ]

    result = analysis_nodes.select_role_candidates(state)

    assert result["role_candidate_track_ids"] == [1, 3]
    assert result["clap_required"] is True


def test_select_role_candidates_falls_back_to_high_band_windows_for_sibilance() -> None:
    artifact_store = get_workflow_artifact_store()
    artifact_store.reset()
    artifact_store.upsert_artifact(
        WorkflowArtifactDocument(
            id="artifact-role-candidates",
            job_id=10012,
            artifact_type="full_stft_frame_summary",
            payload={
                "track_frames": {
                    "2": [
                        {
                            "high_band_ratio": 0.36,
                            "presence_energy": 0.08,
                            "spectral_centroid_hz": 3600,
                        }
                    ],
                    "7": [
                        {
                            "high_band_ratio": 0.2,
                            "presence_energy": 0.04,
                            "spectral_centroid_hz": 2500,
                        }
                    ],
                }
            },
        )
    )
    state = build_workflow_initial_state(
        job_id=10012,
        project_id=20012,
        issue_types=["sibilance"],
        clip_feature_artifact_id="artifact-role-candidates",
    )

    result = analysis_nodes.select_role_candidates(state)

    assert result["role_candidate_track_ids"] == [2]
    assert result["clap_required"] is True


def test_infer_track_roles_calls_clap_and_persists_summary_artifact() -> None:
    artifact_store = get_workflow_artifact_store()
    artifact_store.reset()
    state = build_workflow_initial_state(job_id=10013, project_id=20013)
    state["clip_index"] = [
        {
            "clip_id": 1001,
            "track_id": 1,
            "start_ms": 0,
            "end_ms": 4800,
            "audio_path": _ensure_test_audio_file(1, vocal_like=True),
            "audio_start_ms": 0,
            "audio_duration_ms": 4800,
        },
        {
            "clip_id": 2001,
            "track_id": 2,
            "start_ms": 0,
            "end_ms": 4800,
            "audio_path": _ensure_test_audio_file(2, vocal_like=False),
            "audio_start_ms": 0,
            "audio_duration_ms": 4800,
        },
    ]
    state["role_candidate_track_ids"] = [1, 2]
    state["track_representative_specs"] = analysis_nodes._build_track_representative_specs(
        state
    )

    result = analysis_nodes.infer_track_roles(state)
    response = build_workflow_response({**state, **result})
    artifact = artifact_store.get_artifact(result["clap_artifact_id"])

    assert result["inferred_roles"] == {1: "vocal-like", 2: "supporting"}
    assert result["track_role_scores"] == {1: 0.93, 2: 0.22}
    assert result["track_role_confidences"] == {1: 0.89, 2: 0.71}
    assert result["vocal_detected"] is True
    assert result["clap_artifact_id"] is not None
    assert artifact is not None
    assert artifact.artifact_type == "clap_track_role_inference"
    assert response["projections"]["track_vocal_predictions"] == [
        {
            "id": "10013-vocal-prediction-1",
            "track_id": 1,
            "job_id": 10013,
            "vocal_score": 0.93,
            "is_vocal": True,
            "confidence": 0.89,
        },
        {
            "id": "10013-vocal-prediction-2",
            "track_id": 2,
            "job_id": 10013,
            "vocal_score": 0.22,
            "is_vocal": False,
            "confidence": 0.71,
        },
    ]


def test_infer_track_roles_fails_without_fallback_when_clap_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _RaisingCLAPClient:
        def infer_track_roles(self, *, job_id: int, excerpts: list) -> list[CLAPTrackPrediction]:
            raise CLAPInferenceError("CLAP_INFERENCE_TIMEOUT", "timeout")

    monkeypatch.setattr(
        "app.graph.nodes.analysis.get_clap_inference_client",
        lambda: _RaisingCLAPClient(),
    )
    state = build_workflow_initial_state(job_id=10014, project_id=20014)
    state["clip_index"] = [
        {
            "clip_id": 1001,
            "track_id": 1,
            "start_ms": 0,
            "end_ms": 4800,
            "audio_path": _ensure_test_audio_file(1, vocal_like=True),
            "audio_start_ms": 0,
            "audio_duration_ms": 4800,
        }
    ]
    state["role_candidate_track_ids"] = [1]
    state["track_representative_specs"] = analysis_nodes._build_track_representative_specs(
        state
    )

    result = analysis_nodes.infer_track_roles(state)

    assert result["current_node"] == "infer_track_roles"
    assert result["runtime_status"] == "failed"
    assert result["durable_status"] == "FAILED"
    assert result["failure_code"] == "CLAP_INFERENCE_TIMEOUT"


def test_workflow_fails_when_audio_source_is_missing() -> None:
    result = run_workflow_graph(
        {
            "job_id": 10015,
            "project_id": 20015,
            "project_snapshot": ProjectSnapshot.model_validate(
                {
                    "duration_ms": 4800,
                    "bpm": 120,
                    "numerator": 4,
                    "denominator": 4,
                    "tracks": [{"track_id": 1, "name": "Track 1"}],
                    "clips": [
                        {
                            "clip_id": _clip_id(1, 1),
                            "track_id": 1,
                            "start_ms": 0,
                            "end_ms": 2400,
                            "audio_metadata_id": _audio_metadata_id(1, 1),
                            "audio_start_ms": 0,
                            "audio_duration_ms": 2400,
                        }
                    ],
                }
            ),
            "issue_types": ["band_overlap"],
        }
    )

    assert result["current_node"] == "fail_workflow"
    assert result["runtime_status"] == "failed"
    assert result["failure_code"] == "AUDIO_SOURCE_MISSING"


def test_detect_band_overlap_groups_congested_time_region_across_multiple_tracks() -> None:
    artifact_store = get_workflow_artifact_store()
    artifact_store.reset()
    artifact_store.upsert_artifact(
        WorkflowArtifactDocument(
            id="job-band-region:cheap-dsp",
            job_id=10026,
            artifact_type="full_stft_frame_summary",
            payload={
                "track_frames": {
                    "10": [
                        {
                            "start_ms": 0,
                            "end_ms": 120,
                            "body_energy": 0.44,
                            "low_mid_energy": 0.05,
                            "window_energy": 0.1,
                        },
                        {
                            "start_ms": 120,
                            "end_ms": 240,
                            "body_energy": 0.46,
                            "low_mid_energy": 0.05,
                            "window_energy": 0.1,
                        },
                    ],
                    "20": [
                        {
                            "start_ms": 0,
                            "end_ms": 120,
                            "body_energy": 0.39,
                            "low_mid_energy": 0.04,
                            "window_energy": 0.09,
                        },
                        {
                            "start_ms": 120,
                            "end_ms": 240,
                            "body_energy": 0.4,
                            "low_mid_energy": 0.04,
                            "window_energy": 0.09,
                        },
                    ],
                    "30": [
                        {
                            "start_ms": 0,
                            "end_ms": 120,
                            "body_energy": 0.33,
                            "low_mid_energy": 0.04,
                            "window_energy": 0.08,
                        },
                        {
                            "start_ms": 120,
                            "end_ms": 240,
                            "body_energy": 0.34,
                            "low_mid_energy": 0.04,
                            "window_energy": 0.08,
                        },
                    ],
                    "40": [
                        {
                            "start_ms": 0,
                            "end_ms": 120,
                            "body_energy": 0.1,
                            "low_mid_energy": 0.01,
                            "window_energy": 0.07,
                        },
                        {
                            "start_ms": 120,
                            "end_ms": 240,
                            "body_energy": 0.1,
                            "low_mid_energy": 0.01,
                            "window_energy": 0.07,
                        },
                    ],
                }
            },
        )
    )
    state = build_workflow_initial_state(
        job_id=10026,
        project_id=20026,
        issue_types=["band_overlap"],
        clip_feature_artifact_id="job-band-region:cheap-dsp",
    )

    regions = nodes.detect_band_overlap(state)["analysis_regions"]

    assert len(regions) == 1
    assert set(regions[0]["involved_track_ids"]) == {10, 20, 30}
    assert regions[0]["track_id"] == 10
    assert regions[0]["secondary_track_id"] is None


def test_band_overlap_target_track_excludes_preserved_clip_track() -> None:
    region = {
        "issue_type": "band_overlap",
        "track_id": 10,
        "involved_track_ids": [10, 20, 30],
        "track_body_contributions": {"10": 0.46, "20": 0.41, "30": 0.35},
        "start_ms": 0,
        "end_ms": 240,
        "band_low_hz": 250,
        "band_high_hz": 1200,
    }
    state = build_workflow_initial_state(
        job_id=10016,
        project_id=20016,
        clip_index=[
            {"clip_id": _clip_id(10, 1), "track_id": 10},
            {"clip_id": _clip_id(20, 1), "track_id": 20},
            {"clip_id": _clip_id(30, 1), "track_id": 30},
        ],
    )

    action = suggestion_nodes._build_region_action(
        state,
        region=region,
        preserve_clip_id=_clip_id(10, 1),
        index=1,
    )

    assert action is not None
    assert action["targetTrackId"] == 20


def test_compute_mix_frames_uses_4x_oversampled_true_peak() -> None:
    signal = (0.98 * np.sin(2 * np.pi * 0.1875 * np.arange(1536))).astype(np.float32)

    frames = analysis_nodes._compute_mix_frames(signal, target_track_id=1)
    first_frame = signal[: analysis_nodes.STFT_WIN_LENGTH]

    expected_true_peak = float(
        np.max(
            np.abs(
                resample_poly(
                    first_frame,
                    up=analysis_nodes.TRUE_PEAK_OVERSAMPLE_FACTOR,
                    down=1,
                )
            )
        )
    )
    assert frames[0]["peak_dbfs"] < 0.0
    assert frames[0]["true_peak_dbfs"] > frames[0]["peak_dbfs"]
    assert frames[0]["true_peak_dbfs"] == round(analysis_nodes._to_dbfs(expected_true_peak), 3)


def test_detect_clipping_can_trigger_on_oversampled_true_peak() -> None:
    signal = (0.98 * np.sin(2 * np.pi * 0.1875 * np.arange(1536))).astype(np.float32)
    mix_frames = analysis_nodes._compute_mix_frames(signal, target_track_id=11)
    state = build_workflow_initial_state(
        job_id=10027,
        project_id=20027,
        issue_types=["master_clipping"],
        clip_feature_artifact_id="artifact-true-peak",
    )
    artifact_store = get_workflow_artifact_store()
    artifact_store.reset()
    artifact_store.upsert_artifact(
        WorkflowArtifactDocument(
            id="artifact-true-peak",
            job_id=10027,
            artifact_type="full_stft_frame_summary",
            payload={"mix_frames": mix_frames},
        )
    )

    regions = nodes.detect_master_clipping(state)["analysis_regions"]

    assert mix_frames[0]["peak_dbfs"] < 0.0
    assert mix_frames[0]["true_peak_dbfs"] > 0.0
    assert len(regions) == 1
    assert regions[0]["issue_type"] == "master_clipping"


def test_detect_clipping_ignores_near_ceiling_without_true_peak_overflow() -> None:
    signal = (0.995 * np.sin(2 * np.pi * 0.25 * np.arange(1536))).astype(np.float32)
    mix_frames = analysis_nodes._compute_mix_frames(signal, target_track_id=11)
    state = build_workflow_initial_state(
        job_id=10028,
        project_id=20028,
        issue_types=["master_clipping"],
        clip_feature_artifact_id="artifact-near-ceiling",
    )
    artifact_store = get_workflow_artifact_store()
    artifact_store.reset()
    artifact_store.upsert_artifact(
        WorkflowArtifactDocument(
            id="artifact-near-ceiling",
            job_id=10028,
            artifact_type="full_stft_frame_summary",
            payload={"mix_frames": mix_frames},
        )
    )

    regions = nodes.detect_master_clipping(state)["analysis_regions"]

    assert mix_frames[0]["peak_dbfs"] >= -0.1
    assert mix_frames[0]["true_peak_dbfs"] <= 0.0
    assert regions == []


def test_master_clipping_promotes_clear_contributor_to_track_fix() -> None:
    artifact_store = get_workflow_artifact_store()
    artifact_store.reset()
    artifact_store.upsert_artifact(
        WorkflowArtifactDocument(
            id="artifact-master-promote",
            job_id=10034,
            artifact_type="full_stft_frame_summary",
            payload={
                "mix_frames": [
                    {
                        "start_ms": 0,
                        "end_ms": 96,
                        "peak_dbfs": -0.02,
                        "true_peak_dbfs": 0.22,
                        "clip_ratio": 0.02,
                    },
                    {
                        "start_ms": 96,
                        "end_ms": 192,
                        "peak_dbfs": -0.01,
                        "true_peak_dbfs": 0.24,
                        "clip_ratio": 0.02,
                    },
                ],
                "track_frames": {
                    "10": [
                        {
                            "start_ms": 0,
                            "end_ms": 96,
                            "peak_dbfs": 0.18,
                            "window_energy": 0.92,
                            "low_mid_energy": 0.08,
                            "body_energy": 0.11,
                            "high_band_ratio": 0.14,
                        },
                        {
                            "start_ms": 96,
                            "end_ms": 192,
                            "peak_dbfs": 0.16,
                            "window_energy": 0.9,
                            "low_mid_energy": 0.07,
                            "body_energy": 0.1,
                            "high_band_ratio": 0.13,
                        },
                    ],
                    "20": [
                        {
                            "start_ms": 0,
                            "end_ms": 96,
                            "peak_dbfs": -6.0,
                            "window_energy": 0.12,
                            "low_mid_energy": 0.06,
                            "body_energy": 0.08,
                            "high_band_ratio": 0.09,
                        },
                        {
                            "start_ms": 96,
                            "end_ms": 192,
                            "peak_dbfs": -5.8,
                            "window_energy": 0.11,
                            "low_mid_energy": 0.06,
                            "body_energy": 0.08,
                            "high_band_ratio": 0.08,
                        },
                    ],
                },
            },
        )
    )
    state = build_workflow_initial_state(
        job_id=10034,
        project_id=20034,
        issue_types=["master_clipping"],
        clip_feature_artifact_id="artifact-master-promote",
    )

    result = nodes.detect_master_clipping(state)

    track_regions = [
        region for region in result["analysis_regions"] if region["issue_type"] == "track_clipping"
    ]
    master_regions = [
        region for region in result["analysis_regions"] if region["issue_type"] == "master_clipping"
    ]
    groups = runtime_nodes._build_non_user_issue_recipe_groups(result)

    assert len(track_regions) == 1
    assert master_regions == []
    assert track_regions[0]["track_id"] == 10
    assert track_regions[0]["auto_fix_source"] == "promoted_master_contributor"
    assert groups[0]["issueType"] == "track_clipping"
    assert all(group["issueType"] != "master_clipping" for group in groups)
    assert groups[0]["recipes"][0]["actionType"] == "GAIN_TRIM"


def test_master_clipping_keeps_master_recipe_when_contributors_are_distributed() -> None:
    artifact_store = get_workflow_artifact_store()
    artifact_store.reset()
    artifact_store.upsert_artifact(
        WorkflowArtifactDocument(
            id="artifact-master-distributed",
            job_id=10035,
            artifact_type="full_stft_frame_summary",
            payload={
                "mix_frames": [
                    {
                        "start_ms": 0,
                        "end_ms": 96,
                        "peak_dbfs": -0.03,
                        "true_peak_dbfs": 0.18,
                        "clip_ratio": 0.02,
                    },
                    {
                        "start_ms": 96,
                        "end_ms": 192,
                        "peak_dbfs": -0.02,
                        "true_peak_dbfs": 0.19,
                        "clip_ratio": 0.02,
                    },
                ],
                "track_frames": {
                    "10": [
                        {
                            "start_ms": 0,
                            "end_ms": 96,
                            "peak_dbfs": -0.05,
                            "window_energy": 0.42,
                            "low_mid_energy": 0.11,
                            "body_energy": 0.14,
                            "high_band_ratio": 0.16,
                        },
                        {
                            "start_ms": 96,
                            "end_ms": 192,
                            "peak_dbfs": -0.05,
                            "window_energy": 0.42,
                            "low_mid_energy": 0.11,
                            "body_energy": 0.14,
                            "high_band_ratio": 0.16,
                        },
                    ],
                    "20": [
                        {
                            "start_ms": 0,
                            "end_ms": 96,
                            "peak_dbfs": -0.04,
                            "window_energy": 0.41,
                            "low_mid_energy": 0.11,
                            "body_energy": 0.14,
                            "high_band_ratio": 0.16,
                        },
                        {
                            "start_ms": 96,
                            "end_ms": 192,
                            "peak_dbfs": -0.04,
                            "window_energy": 0.41,
                            "low_mid_energy": 0.11,
                            "body_energy": 0.14,
                            "high_band_ratio": 0.16,
                        },
                    ],
                    "30": [
                        {
                            "start_ms": 0,
                            "end_ms": 96,
                            "peak_dbfs": -0.05,
                            "window_energy": 0.4,
                            "low_mid_energy": 0.11,
                            "body_energy": 0.14,
                            "high_band_ratio": 0.16,
                        },
                        {
                            "start_ms": 96,
                            "end_ms": 192,
                            "peak_dbfs": -0.05,
                            "window_energy": 0.4,
                            "low_mid_energy": 0.11,
                            "body_energy": 0.14,
                            "high_band_ratio": 0.16,
                        },
                    ],
                },
            },
        )
    )
    state = build_workflow_initial_state(
        job_id=10035,
        project_id=20035,
        issue_types=["master_clipping"],
        clip_feature_artifact_id="artifact-master-distributed",
    )

    result = nodes.detect_master_clipping(state)

    master_regions = [
        region for region in result["analysis_regions"] if region["issue_type"] == "master_clipping"
    ]
    track_regions = [
        region for region in result["analysis_regions"] if region["issue_type"] == "track_clipping"
    ]
    groups = runtime_nodes._build_non_user_issue_recipe_groups(result)

    assert track_regions == []
    assert len(master_regions) == 1
    assert set(master_regions[0]["contributing_track_ids"]) == {10, 20, 30}
    assert any(group["issueType"] == "master_clipping" for group in groups)
    master_group = next(group for group in groups if group["issueType"] == "master_clipping")
    assert master_group["recipes"][0]["targetScope"] == "MASTER"


def test_workflow_defaults_include_clipping_detection() -> None:
    sample_rate = 16000
    signal = (0.98 * np.sin(2 * np.pi * 0.1875 * np.arange(sample_rate * 2))).astype(np.float32)
    audio_dir = Path(gettempdir()) / "studion-ai-test-audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_path = audio_dir / "workflow-default-clipping.wav"
    sf.write(audio_path, signal, sample_rate)

    result = run_workflow_graph(
        {
            "job_id": 10032,
            "project_id": 20032,
            "project_snapshot": build_project_snapshot_with_audio(
                track_audio_paths={10: str(audio_path)}
            ),
        }
    )

    assert result["current_node"] == "finalize_output"
    assert (
        "track_clipping" in result["detected_issues"]
        or "master_clipping" in result["detected_issues"]
    )
    assert result["clipping_fix_applied"] is True


def test_workflow_skips_sibilance_when_clap_candidate_is_absent() -> None:
    sample_rate = 16000
    duration_seconds = 4.8
    time_axis = np.linspace(
        0,
        duration_seconds,
        int(sample_rate * duration_seconds),
        endpoint=False,
    )
    supporting = (0.24 * np.sin(2 * np.pi * 220 * time_axis)).astype(np.float32)
    audio_dir = Path(gettempdir()) / "studion-ai-test-audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_path = audio_dir / "workflow-no-sibilance-candidate.wav"
    sf.write(audio_path, supporting, sample_rate)

    result = run_workflow_graph(
        {
            "job_id": 10033,
            "project_id": 20033,
            "project_snapshot": build_project_snapshot_with_audio(
                track_audio_paths={10: str(audio_path)}
            ),
            "issue_types": ["sibilance"],
        }
    )

    assert result["clap_required"] is False
    assert result["inferred_roles"] == {}
    assert result["vocal_detected"] is False
    assert "sibilance" not in result["detected_issues"]
    assert result["current_node"] == "finalize_output"


def test_detect_sibilance_uses_only_vocal_like_tracks() -> None:
    artifact_store = get_workflow_artifact_store()
    artifact_store.reset()
    artifact_store.upsert_artifact(
        WorkflowArtifactDocument(
            id="artifact-sibilance-role-aware",
            job_id=10029,
            artifact_type="full_stft_frame_summary",
            payload={
                "track_frames": {
                    "10": [
                        {
                            "start_ms": 0,
                            "end_ms": 120,
                            "sibilance_ratio": 0.24,
                            "high_band_ratio": 0.26,
                            "spectral_centroid_hz": 4200,
                        },
                        {
                            "start_ms": 120,
                            "end_ms": 240,
                            "sibilance_ratio": 0.23,
                            "high_band_ratio": 0.25,
                            "spectral_centroid_hz": 4100,
                        },
                    ],
                    "20": [
                        {
                            "start_ms": 0,
                            "end_ms": 120,
                            "sibilance_ratio": 0.28,
                            "high_band_ratio": 0.29,
                            "spectral_centroid_hz": 4300,
                        },
                        {
                            "start_ms": 120,
                            "end_ms": 240,
                            "sibilance_ratio": 0.27,
                            "high_band_ratio": 0.28,
                            "spectral_centroid_hz": 4250,
                        },
                    ],
                }
            },
        )
    )
    state = build_workflow_initial_state(
        job_id=10029,
        project_id=20029,
        issue_types=["sibilance"],
        clip_feature_artifact_id="artifact-sibilance-role-aware",
        inferred_roles={10: "vocal-like", 20: "supporting"},
        vocal_detected=True,
    )

    regions = nodes.detect_sibilance(state)["analysis_regions"]

    assert len(regions) == 1
    assert regions[0]["track_id"] == 10
    assert regions[0]["issue_type"] == "sibilance"


def test_clipping_autofix_materializes_master_true_peak_limiter_recipe() -> None:
    result = run_workflow_graph(
        {
            "job_id": 10030,
            "project_id": 20030,
            "project_snapshot": build_project_snapshot(track_ids=[14, 15]),
            "issue_types": ["clipping"],
        }
    )
    artifact_store = get_workflow_artifact_store()
    recipe_artifact = artifact_store.get_artifact(result["auto_fix_recipe_artifact_id"])

    assert recipe_artifact is not None
    master_group = next(
        group
        for group in recipe_artifact.payload["groups"]
        if group["issueType"] == "master_clipping"
    )
    action = master_group["recipes"][0]

    assert action["actionType"] == "TRUE_PEAK_LIMITER"
    assert action["targetScope"] == "MASTER"
    assert action["targetTrackId"] is None
    assert action["params"]["ceilingDbfs"] == -1.0
