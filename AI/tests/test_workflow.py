from pathlib import Path
from tempfile import gettempdir

import numpy as np
import pytest
import soundfile as sf
from scipy.signal import resample_poly

from app.graph import nodes
from app.graph.nodes import analysis as analysis_nodes
from app.graph.nodes import suggestion as suggestion_nodes
from app.graph.state import build_workflow_initial_state
from app.graph.workflow import build_workflow_response, run_workflow_graph
from app.services.workflow_artifacts import WorkflowArtifactDocument, get_workflow_artifact_store
from app.services.workflow_snapshots import ProjectSnapshot, build_snapshot_runtime_context


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


def build_project_snapshot(*, track_ids: list[int]) -> ProjectSnapshot:
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
                    "clip_id": f"clip-{track_id}-1",
                    "track_id": track_id,
                    "start_ms": 0,
                    "end_ms": duration_ms,
                    "audio_path": audio_path,
                    "audio_start_ms": 0,
                    "audio_duration_ms": duration_ms,
                }
                for track_id, audio_path in track_audio_paths.items()
            ],
        }
    )


def build_plan_input(state: dict, *, user_feedback_message: str | None = None) -> dict[str, str]:
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
            "job_id": "job-selection",
            "project_id": "project-selection",
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
            "job_id": "job-no-action",
            "project_id": "project-no-action",
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
            "job_id": "job-rag",
            "project_id": "project-rag",
            "project_snapshot": build_project_snapshot(track_ids=[3, 4]),
            "issue_types": ["band_overlap", "clipping"],
        }
    )
    result = run_workflow_graph({**waiting, **build_plan_input(waiting)})

    assert result["current_node"] == "wait_user_selection"
    assert result["plan_status"] == "APPROVED"


def test_workflow_skips_clap_when_not_needed() -> None:
    result = run_workflow_graph(
        {
            "job_id": "job-no-clap",
            "project_id": "project-no-clap",
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
            "job_id": "job-revise",
            "project_id": "project-revise",
            "project_snapshot": build_project_snapshot(track_ids=[7]),
            "issue_types": ["clipping"],
            "validator_mode": "REVISE_ONCE",
            "critic_mode": "PASS",
        }
    )
    result = run_workflow_graph({**waiting, **build_plan_input(waiting)})

    assert result["current_node"] == "wait_user_selection"
    assert result["transition_log"].count("planning_agent") == 2


def test_workflow_fails_when_validator_rejects() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": "job-fail",
            "project_id": "project-fail",
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
    result = run_workflow_graph(
        {
            "job_id": "job-preview",
            "project_id": "project-preview",
            "project_snapshot": build_project_snapshot(track_ids=[8]),
            "issue_types": ["sibilance"],
        }
    )

    assert result["current_node"] == "finalize_output"
    assert result["runtime_status"] == "completed"
    assert result["preview_action_ids"] == []
    assert result["sibilance_fix_applied"] is True
    assert result["sibilance_fix_log_id"] is not None
    assert result["auto_fix_recipe_artifact_id"] is not None


def test_workflow_resume_from_selection_to_preview_confirm_wait() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": "job-preview-2",
            "project_id": "project-preview-2",
            "project_snapshot": build_project_snapshot(track_ids=[8]),
            "issue_types": ["clipping"],
        }
    )
    selected = run_workflow_graph({**waiting, **build_plan_input(waiting)})

    resumed = run_workflow_graph(
        {
            **selected,
            "selected_action_ids": ["job-preview-2-action-1"],
        }
    )

    assert resumed["current_node"] == "wait_user_confirm"
    assert resumed["runtime_status"] == "waiting_for_user"
    assert resumed["apply_result_id"] == "job-preview-2-apply"


def test_workflow_confirm_commits_and_finalizes() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": "job-confirm",
            "project_id": "project-confirm",
            "project_snapshot": build_project_snapshot(track_ids=[4, 14]),
            "issue_types": ["band_overlap"],
        }
    )
    mix_resolved = run_workflow_graph(
        {**waiting, **build_plan_input(waiting)}
    )
    preview_wait = run_workflow_graph(
        {
            **mix_resolved,
            "selected_action_ids": ["job-confirm-action-1"],
        }
    )
    confirmed = run_workflow_graph(
        {
            **preview_wait,
            "user_decision": "confirm",
        }
    )

    assert confirmed["current_node"] == "finalize_output"
    assert confirmed["runtime_status"] == "completed"
    assert confirmed["feedback_event_id"] == "job-confirm-feedback"


def test_workflow_retry_and_cancel_paths_return_to_expected_nodes() -> None:
    mix_resolved = run_workflow_graph(
        {
            "job_id": "job-retry",
            "project_id": "project-retry",
            "project_snapshot": build_project_snapshot(track_ids=[6]),
            "issue_types": ["clipping"],
        }
    )
    mix_resolved = run_workflow_graph({**mix_resolved, **build_plan_input(mix_resolved)})
    preview_wait = run_workflow_graph(
        {
            **mix_resolved,
            "selected_action_ids": ["job-retry-action-1"],
        }
    )

    retried = run_workflow_graph({**preview_wait, "user_decision": "retry"})
    cancelled = run_workflow_graph({**preview_wait, "user_decision": "cancel"})

    assert retried["current_node"] == "wait_user_confirm"
    assert cancelled["current_node"] == "finalize_output"


def test_workflow_uses_user_selected_main_track_for_generated_action() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": "job-main-track",
            "project_id": "project-main-track",
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
            "job_id": "job-projection",
            "project_id": "project-projection",
            "project_snapshot": snapshot,
            "issue_types": ["band_overlap", "sibilance"],
        }
    )
    result = run_workflow_graph({**waiting, **build_plan_input(waiting)})
    response = build_workflow_response(result)

    assert response["graph_state"]["job_id"] == "job-projection"
    assert response["projections"]["analysis_job"]["id"] == "job-projection"
    assert response["projections"]["analysis_regions"][0]["job_id"] == "job-projection"
    assert response["projections"]["analysis_regions"][0]["issue_type"] in {
        "band_overlap",
        "sibilance",
    }
    assert response["projections"]["suggestion_group"]["id"] == "job-projection-group"
    assert response["projections"]["preview_render"]["id"] == "job-projection-preview"
    assert response["projections"]["analysis_regions"][0]["measure_start"] == 1
    assert response["projections"]["analysis_regions"][0]["affected_clip_ids"]


def test_workflow_clipping_only_waits_for_user_plan_input() -> None:
    result = run_workflow_graph(
        {
            "job_id": "job-clipping-only",
            "project_id": "project-clipping-only",
            "project_snapshot": build_project_snapshot(track_ids=[6]),
            "issue_types": ["clipping"],
        }
    )

    assert result["current_node"] == "wait_user_plan_input"
    assert result["clipping_fix_applied"] is False
    assert result["preview_id"] is None
    assert result["preview_action_ids"] == []
    assert result["detected_issues"] == ["clipping"]


def test_workflow_analysis_regions_include_detector_metadata() -> None:
    snapshot = build_project_snapshot(track_ids=[30, 31])
    waiting = run_workflow_graph(
        {
            "job_id": "job-region-shape",
            "project_id": "project-region-shape",
            "project_snapshot": snapshot,
            "issue_types": ["band_overlap", "sibilance", "clipping"],
        }
    )
    result = run_workflow_graph({**waiting, **build_plan_input(waiting)})

    region_by_issue = {region["issue_type"]: region for region in result["analysis_regions"]}
    overlap = region_by_issue["band_overlap"]
    clipping = region_by_issue["clipping"]
    sibilance = region_by_issue["sibilance"]

    assert overlap["secondary_track_id"] is None
    assert set(overlap["involved_track_ids"]) == {30, 31}
    assert overlap["band_low_hz"] == 250
    assert overlap["band_high_hz"] == 1200
    assert overlap["measure_start"] == 1
    assert overlap["measure_end"] in {1, 2}
    assert "clip-30-1" in overlap["affected_clip_ids"]
    assert "clip-31-2" in overlap["affected_clip_ids"]
    assert clipping["requires_user_action"] is True
    assert sibilance["track_id"] == 30
    assert result["sibilance_fix_applied"] is True
    assert result["ranking_scores"][overlap["id"]] > 0


def test_merge_analysis_keeps_all_regions_without_issue_cap() -> None:
    initial = build_workflow_initial_state(
        job_id="job-all-regions",
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


def test_run_workflow_graph_derives_timeline_metadata_from_project_snapshot() -> None:
    result = run_workflow_graph(
        {
            "job_id": "job-snapshot-derivation",
            "project_id": "project-snapshot-derivation",
            "project_snapshot": build_project_snapshot(track_ids=[7, 8]),
            "issue_types": ["band_overlap"],
        }
    )

    assert result["track_ids"] == [7, 8]
    assert result["bar_mapping"][0]["measure_no"] == 1
    assert result["clip_index"][0]["clip_id"] == "clip-7-1"


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
            "job_id": "job-actual-dsp",
            "project_id": "project-actual-dsp",
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
    assert result["sampled_clip_ids"] == ["clip-10-1", "clip-20-1"]


def test_workflow_fails_when_audio_source_is_missing() -> None:
    result = run_workflow_graph(
        {
            "job_id": "job-missing-audio",
            "project_id": "project-missing-audio",
            "project_snapshot": ProjectSnapshot.model_validate(
                {
                    "duration_ms": 4800,
                    "bpm": 120,
                    "numerator": 4,
                    "denominator": 4,
                    "tracks": [{"track_id": 1, "name": "Track 1"}],
                    "clips": [
                        {
                            "clip_id": "clip-1-1",
                            "track_id": 1,
                            "start_ms": 0,
                            "end_ms": 2400,
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
            job_id="job-band-region",
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
        job_id="job-band-region",
        project_id="project-band-region",
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
        job_id="job-band-target",
        project_id="project-band-target",
        clip_index=[
            {"clip_id": "clip-10", "track_id": 10},
            {"clip_id": "clip-20", "track_id": 20},
            {"clip_id": "clip-30", "track_id": 30},
        ],
    )

    action = suggestion_nodes._build_region_action(
        state,
        region=region,
        preserve_clip_id="clip-10",
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
        job_id="job-true-peak",
        project_id="project-true-peak",
        issue_types=["clipping"],
        clip_feature_artifact_id="artifact-true-peak",
    )
    artifact_store = get_workflow_artifact_store()
    artifact_store.reset()
    artifact_store.upsert_artifact(
        WorkflowArtifactDocument(
            id="artifact-true-peak",
            job_id="job-true-peak",
            artifact_type="full_stft_frame_summary",
            payload={"mix_frames": mix_frames},
        )
    )

    regions = nodes.detect_clipping(state)["analysis_regions"]

    assert mix_frames[0]["peak_dbfs"] < 0.0
    assert mix_frames[0]["true_peak_dbfs"] > 0.0
    assert len(regions) == 1
    assert regions[0]["issue_type"] == "clipping"
