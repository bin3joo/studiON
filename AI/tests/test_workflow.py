from app.graph.workflow import build_workflow_response, run_workflow_graph


def test_workflow_waits_for_user_mix_intent_before_suggestions() -> None:
    result = run_workflow_graph(
        {
            "job_id": "job-selection",
            "project_id": "project-selection",
            "track_ids": [12],
            "issue_types": ["band_overlap", "sibilance"],
        }
    )

    assert result["runtime_status"] == "waiting_for_user"
    assert result["durable_status"] == "WAITING_USER"
    assert result["current_node"] == "wait_user_mix_intent"
    assert result["preview_id"] is None
    assert result["suggestion_group_id"] is None


def test_workflow_finalize_without_user_action_when_no_suggestions_exist() -> None:
    result = run_workflow_graph(
        {
            "job_id": "job-no-action",
            "project_id": "project-no-action",
            "track_ids": [9],
            "issue_types": [],
        }
    )

    assert result["current_node"] == "finalize_output"
    assert result["runtime_status"] == "completed"
    assert result["durable_status"] == "COMPLETED"


def test_workflow_retrieval_runs_for_band_overlap_and_sibilance() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": "job-rag",
            "project_id": "project-rag",
            "track_ids": [3],
            "issue_types": ["band_overlap", "sibilance"],
        }
    )
    result = run_workflow_graph({**waiting, "main_track_id": 3})

    assert result["retrieval_needed"] is True
    assert result["retrieval_context_ids"] == ["policy:band_overlap", "policy:sibilance"]


def test_workflow_skips_clap_when_not_needed() -> None:
    result = run_workflow_graph(
        {
            "job_id": "job-no-clap",
            "project_id": "project-no-clap",
            "track_ids": [2],
            "issue_types": ["band_overlap"],
        }
    )

    assert result["clap_required"] is False
    assert result["current_node"] == "wait_user_mix_intent"
    assert result["inferred_roles"] == {}


def test_workflow_revises_once_then_passes() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": "job-revise",
            "project_id": "project-revise",
            "track_ids": [7],
            "issue_types": ["sibilance"],
            "main_track_id": None,
        }
    )
    result = run_workflow_graph(
        {
            **waiting,
            "main_track_id": 7,
            "validator_mode": "REVISE_ONCE",
            "critic_mode": "PASS",
        }
    )

    assert result["current_node"] == "wait_user_selection"
    assert result["transition_log"].count("generate_suggestions") == 2


def test_workflow_fails_when_validator_rejects() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": "job-fail",
            "project_id": "project-fail",
            "track_ids": [1],
            "issue_types": ["band_overlap"],
        }
    )
    result = run_workflow_graph(
        {
            **waiting,
            "main_track_id": 1,
            "validator_mode": "REJECT",
        }
    )

    assert result["current_node"] == "fail_workflow"
    assert result["runtime_status"] == "failed"
    assert result["durable_status"] == "FAILED"


def test_workflow_resume_from_mix_intent_to_selection_wait() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": "job-preview",
            "project_id": "project-preview",
            "track_ids": [8],
            "issue_types": ["sibilance"],
        }
    )

    resumed = run_workflow_graph(
        {
            **waiting,
            "main_track_id": 8,
        }
    )

    assert resumed["current_node"] == "wait_user_selection"
    assert resumed["runtime_status"] == "waiting_for_user"
    assert resumed["preview_action_ids"] == ["job-preview-action-1"]


def test_workflow_resume_from_selection_to_preview_confirm_wait() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": "job-preview-2",
            "project_id": "project-preview-2",
            "track_ids": [8],
            "issue_types": ["sibilance"],
        }
    )
    selected = run_workflow_graph(
        {
            **waiting,
            "main_track_id": 8,
        }
    )

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
            "track_ids": [4],
            "issue_types": ["band_overlap"],
        }
    )
    mix_resolved = run_workflow_graph(
        {
            **waiting,
            "main_track_id": 4,
        }
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
    waiting = run_workflow_graph(
        {
            "job_id": "job-retry",
            "project_id": "project-retry",
            "track_ids": [6],
            "issue_types": ["sibilance"],
        }
    )
    mix_resolved = run_workflow_graph(
        {
            **waiting,
            "main_track_id": 6,
        }
    )
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
            "track_ids": [11, 22],
            "issue_types": ["band_overlap"],
        }
    )

    resumed = run_workflow_graph({**waiting, "main_track_id": 22})

    action = resumed["suggestion_payload"]["suggestions"][0]["actions"][0]
    assert action["targetTrackId"] == 22


def test_workflow_response_contains_unified_projections() -> None:
    waiting = run_workflow_graph(
        {
            "job_id": "job-projection",
            "project_id": "project-projection",
            "track_ids": [10],
            "issue_types": ["band_overlap", "sibilance"],
        }
    )
    result = run_workflow_graph({**waiting, "main_track_id": 10})
    response = build_workflow_response(result)

    assert response["graph_state"]["job_id"] == "job-projection"
    assert response["projections"]["analysis_job"]["id"] == "job-projection"
    assert response["projections"]["analysis_regions"][0]["job_id"] == "job-projection"
    assert response["projections"]["rag_retrievals"][0]["document_ids"] == [
        "policy:band_overlap",
        "policy:sibilance",
    ]
    assert response["projections"]["suggestion_group"]["id"] == "job-projection-group"
    assert response["projections"]["preview_render"]["id"] == "job-projection-preview"
