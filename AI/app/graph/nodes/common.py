from __future__ import annotations

from app.graph.state import WorkflowState, utc_now


def append_transition(state: WorkflowState, name: str) -> list[str]:
    return [*state.get("transition_log", []), name]


def workflow_update(
    state: WorkflowState,
    *,
    node: str,
    phase: str,
    progress: int,
    runtime_status: str | None = None,
    durable_status: str | None = None,
    extra: dict | None = None,
) -> WorkflowState:
    payload: WorkflowState = {
        "current_node": node,
        "phase": phase,
        "progress": progress,
        "heartbeat_at": utc_now(),
        "transition_log": append_transition(state, node),
    }
    if runtime_status is not None:
        payload["runtime_status"] = runtime_status
    if durable_status is not None:
        payload["durable_status"] = durable_status
    if extra:
        payload.update(extra)
    return payload


def artifact_id(state: WorkflowState, label: str) -> str:
    return f"{state['job_id']}:{label}:{len(state.get('transition_log', [])) + 1}"


def decide_validation_result(state: WorkflowState, *, mode_key: str) -> str:
    mode = state.get(mode_key, "PASS")
    revise_count = state.get("revise_count", 0)
    max_revise_count = state.get("max_revise_count", 1)
    if mode == "REJECT":
        return "REJECT"
    if mode == "REVISE_ONCE" and revise_count < max_revise_count:
        return "REVISE"
    return "PASS"


def build_action(
    state: WorkflowState,
    *,
    index: int,
    action_type: str,
    track_id: int | None,
    start_ms: int,
    end_ms: int,
    band_low_hz: int | None = None,
    band_high_hz: int | None = None,
    gain_delta_db: float | None = None,
    params: dict | None = None,
    target_scope: str = "TRACK",
) -> dict:
    return {
        "actionType": action_type,
        "targetTrackId": track_id,
        "targetClipId": None,
        "startMs": start_ms,
        "endMs": end_ms,
        "bandLowHz": band_low_hz,
        "bandHighHz": band_high_hz,
        "gainDeltaDb": gain_delta_db,
        "params": params or {},
        "targetScope": target_scope,
        "actionId": f"{state['job_id']}-action-{index}",
    }
