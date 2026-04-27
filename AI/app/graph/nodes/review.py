from __future__ import annotations

from app.graph.nodes.common import artifact_id, decide_validation_result, workflow_update
from app.graph.state import WorkflowState


def plan_rule_validator(state: WorkflowState) -> WorkflowState:
    plan_payload = state.get("plan_payload") or {}
    if state.get("ranked_candidate_ids") and not plan_payload:
        return workflow_update(
            state,
            node="plan_rule_validator",
            phase="plan_rule_validated",
            progress=76,
            extra={
                "validator_result": "REJECT",
                "plan_revision_notes": ["Plan payload is empty despite ranked candidates."],
            },
        )
    result = decide_validation_result(state, mode_key="validator_mode")
    revision_notes = [*state.get("plan_revision_notes", [])]
    if result == "REVISE":
        revision_notes.append("Rule validator requested a plan revision.")
    if result == "REJECT":
        revision_notes.append("Rule validator rejected the plan.")
    return workflow_update(
        state,
        node="plan_rule_validator",
        phase="plan_rule_validated",
        progress=76,
        extra={
            "validator_result": result,
            "plan_revision_notes": revision_notes,
            "plan_status": "UNDER_REVIEW",
        },
    )


def plan_critic(state: WorkflowState) -> WorkflowState:
    result = decide_validation_result(state, mode_key="critic_mode")
    current_artifact_id = artifact_id(state, "plan-critic")
    revision_notes = [*state.get("plan_revision_notes", [])]
    if result == "REVISE":
        revision_notes.append("Plan critic requested a semantic revision.")
    if result == "REJECT":
        revision_notes.append("Plan critic rejected the strategy.")
    return workflow_update(
        state,
        node="plan_critic",
        phase="plan_critic_checked",
        progress=80,
        extra={
            "critic_result": result,
            "plan_revision_notes": revision_notes,
            "plan_status": "UNDER_REVIEW",
            "mongo_artifact_ids": [*state.get("mongo_artifact_ids", []), current_artifact_id],
            "latest_artifact_id": current_artifact_id,
        },
    )
