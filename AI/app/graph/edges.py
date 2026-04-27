from app.graph.state import WorkflowState


def route_after_entry(state: WorkflowState) -> str:
    if state.get("runtime_status") == "failed" or state.get("durable_status") == "FAILED":
        return "fail_workflow"
    if state.get("phase") == "waiting_for_user_plan_input":
        if (
            state.get("selected_region_id") is not None
            and state.get("preserve_clip_id") is not None
        ):
            return "resume_after_plan_input"
        return "wait_user_plan_input"
    if state.get("phase") == "waiting_for_user_selection":
        if state.get("selected_action_ids"):
            return "apply_selected_edit_recipe"
        return "wait_user_selection"
    if state.get("phase") == "waiting_for_user_confirm":
        return "wait_user_confirm"
    return "init_state"


def route_after_clap_gate(state: WorkflowState) -> str:
    return "infer_track_roles" if state.get("clap_required") else "detect_sibilance"


def route_after_dsp_scan(state: WorkflowState) -> str:
    return "fail_workflow" if state.get("runtime_status") == "failed" else "detect_band_overlap"


def route_after_candidate_ranking(state: WorkflowState) -> str:
    if state.get("ranked_candidate_ids"):
        return "wait_user_plan_input"
    if state.get("analysis_regions"):
        return "build_rule_candidates"
    return "materialize_execution_plan"


def route_after_plan_input(state: WorkflowState) -> str:
    return "build_rule_candidates"


def route_after_validator(state: WorkflowState) -> str:
    result = state.get("validator_result")
    if result == "PASS":
        return "plan_critic"
    if result == "REVISE" and state.get("revise_count", 0) < state.get("max_revise_count", 1):
        return "planning_agent"
    return "fail_workflow"


def route_after_critic(state: WorkflowState) -> str:
    result = state.get("critic_result")
    if result == "PASS":
        return "approve_plan"
    if result == "REVISE" and state.get("revise_count", 0) < state.get("max_revise_count", 1):
        return "planning_agent"
    return "fail_workflow"


def route_after_user_action_gate(state: WorkflowState) -> str:
    return "wait_user_selection" if state.get("user_action_required") else "finalize_output"


def route_after_wait_user_confirm(state: WorkflowState) -> str:
    decision = state.get("user_decision")
    if decision == "confirm":
        return "commit_selected_edit_recipe"
    if decision == "retry":
        return "render_preview"
    if decision == "cancel":
        return "finalize_output"
    return "END"
