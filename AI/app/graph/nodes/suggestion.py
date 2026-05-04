from __future__ import annotations

from copy import deepcopy

from app.graph.nodes.common import artifact_id, build_action, workflow_update
from app.graph.nodes.runtime import fail_workflow
from app.graph.state import WorkflowState
from app.services.planning_llm import PlanningLLMError, get_planning_llm_client
from app.services.workflow_artifacts import WorkflowArtifactDocument, get_workflow_artifact_store


def planning_agent(state: WorkflowState) -> WorkflowState:
    revise_count = state.get("revise_count", 0)
    if state.get("validator_result") == "REVISE" or state.get("critic_result") == "REVISE":
        revise_count += 1

    selected_region = _resolve_selected_region(state)
    if selected_region is None:
        return fail_workflow(
            {
                **state,
                "failure_code": "PLANNING_REGION_NOT_FOUND",
                "failure_message": (
                    "The selected analysis region could not be restored "
                    "for planning."
                ),
            }
        )

    selected_region_id = str(selected_region["id"])
    preserve_clip_id = state.get("preserve_clip_id")
    if preserve_clip_id is None:
        return fail_workflow(
            {
                **state,
                "failure_code": "MISSING_PRESERVE_CLIP",
                "failure_message": "A preserve clip selection is required before planning.",
            }
        )

    try:
        llm_response = get_planning_llm_client().generate_plan(
            selected_region_id=selected_region_id,
            preserve_clip_id=int(preserve_clip_id),
            user_feedback_message=state.get("user_feedback_message"),
            region=deepcopy(selected_region),
            clip_context=_build_clip_context(state, selected_region, int(preserve_clip_id)),
            revision_notes=[*state.get("plan_revision_notes", [])],
        )
    except PlanningLLMError as exc:
        return fail_workflow(
            {
                **state,
                "failure_code": exc.code,
                "failure_message": exc.message,
            }
        )

    plan_payload = _normalize_plan_payload(
        state,
        region=selected_region,
        preserve_clip_id=int(preserve_clip_id),
        raw_plan_payload=llm_response.plan_payload,
    )
    return workflow_update(
        state,
        node="planning_agent",
        phase="plan_generated",
        progress=74,
        extra={
            "plan_payload": plan_payload,
            "plan_status": "DRAFT",
            "validator_result": None,
            "critic_result": None,
            "revise_count": revise_count,
        },
    )


def approve_plan(state: WorkflowState) -> WorkflowState:
    revision_notes = [
        *state.get("plan_revision_notes", []),
    ]
    return workflow_update(
        state,
        node="approve_plan",
        phase="internal_plan_approved",
        progress=82,
        extra={
            "plan_status": "APPROVED",
            "plan_revision_notes": revision_notes,
        },
    )


def materialize_execution_plan(state: WorkflowState) -> WorkflowState:
    plan_payload = state.get("plan_payload") or {}
    candidate = plan_payload.get("candidate") or {}
    selected_region = _resolve_selected_region(state)
    notes = [*state.get("notes", [])]
    mongo_artifact_ids = [*state.get("mongo_artifact_ids", [])]
    latest_artifact_id = state.get("latest_artifact_id")

    if not candidate:
        if selected_region is not None and selected_region.get("issue_type") == "sibilance":
            notes.append("치찰음 이슈는 suggestion 없이 자동 보정 전용 경로로 유지했다.")
        return workflow_update(
            state,
            node="materialize_execution_plan",
            phase="execution_plan_materialized",
            progress=84,
            extra={
                "suggestion_payload": {},
                "suggestion_group_id": None,
                "preview_action_ids": [],
                "user_action_required": False,
                "notes": notes,
            },
        )

    # approved 되지 않은 계획은 바로 실패 처리함.
    if state.get("plan_status") != "APPROVED":
        return fail_workflow(
            {
                **state,
                "failure_code": "PLAN_NOT_APPROVED",
                "failure_message": (
                    "The execution plan could not be materialized "
                    "before internal approval."
                ),
            }
        )
    if selected_region is None:
        return fail_workflow(
            {
                **state,
                "failure_code": "MATERIALIZE_REGION_NOT_FOUND",
                "failure_message": (
                    "The selected analysis region could not be restored "
                    "for execution plan materialization."
                ),
            }
        )

    # 수정 계획에 있는 action 1개를 꺼냄.
    # 현재는 사실상 action이 1개지만 확장성을 위해 배열로 만들어둠
    # 확장한 후에는 여러 계획안에 여러 action을 만들어서 사용자에게 줄 예정.
    action = candidate["action"]
    suggestion_group_id = state.get("suggestion_group_id") or f"{state['job_id']}-group"
    payload = {
        "groupTitle": plan_payload.get("strategyTitle") or "Workflow suggestion group",
        "groupSummary": plan_payload.get("strategySummary"),
        "suggestions": [
            {
                "rank": 1,
                "summary": plan_payload.get("summary") or "문제 구간 보정 제안",
                "explanation": plan_payload.get("explanation"),
                "actions": [action],
            }
        ],
    }
    preview_action_ids = [action["actionId"]]
    execution_plan_artifact_id = artifact_id(state, "execution-plan")
    get_workflow_artifact_store().upsert_artifact(
        WorkflowArtifactDocument(
            id=execution_plan_artifact_id,
            job_id=state["job_id"],
            artifact_type="execution_plan",
            payload={
                "selectedRegionId": str(selected_region["id"]),
                "issueType": selected_region.get("issue_type"),
                "preserveClipId": state.get("preserve_clip_id"),
                "planPayload": deepcopy(plan_payload),
                "suggestionPayload": deepcopy(payload),
                "previewActionIds": preview_action_ids,
            },
        )
    )
    mongo_artifact_ids.append(execution_plan_artifact_id)
    latest_artifact_id = execution_plan_artifact_id
    notes.append(
        "승인된 실행 계획을 "
        f"suggestion group {suggestion_group_id}과 preview action "
        f"{preview_action_ids[0]}으로 구체화했다."
    )
    return workflow_update(
        state,
        node="materialize_execution_plan",
        phase="execution_plan_materialized",
        progress=84,
        extra={
            "suggestion_payload": payload,
            "suggestion_group_id": suggestion_group_id,
            "preview_action_ids": preview_action_ids,
            "user_action_required": True,
            "mongo_artifact_ids": mongo_artifact_ids,
            "latest_artifact_id": latest_artifact_id,
            "notes": notes,
        },
    )


def _resolve_selected_region(state: WorkflowState) -> dict[str, object] | None:
    region_map = {region["id"]: region for region in state.get("analysis_regions", [])}
    selected_region_id = state.get("selected_region_id") or next(
        iter(state.get("ranked_candidate_ids", [])),
        None,
    )
    if selected_region_id is None and state.get("analysis_regions"):
        selected_region_id = state["analysis_regions"][0]["id"]
    return deepcopy(region_map.get(selected_region_id)) if selected_region_id else None


def _build_clip_context(
    state: WorkflowState,
    region: dict[str, object],
    preserve_clip_id: int,
) -> list[dict[str, object]]:
    involved_track_ids = {int(track_id) for track_id in region.get("involved_track_ids", [])}
    if region.get("track_id") is not None:
        involved_track_ids.add(int(region["track_id"]))
    if region.get("secondary_track_id") is not None:
        involved_track_ids.add(int(region["secondary_track_id"]))
    affected_clip_ids = {int(clip_id) for clip_id in region.get("affected_clip_ids", [])}
    affected_clip_ids.add(preserve_clip_id)

    clip_context: list[dict[str, object]] = []
    for clip in state.get("clip_index", []):
        clip_id = int(clip.get("clip_id") or 0)
        track_id = int(clip.get("track_id") or 0)
        if clip_id not in affected_clip_ids and track_id not in involved_track_ids:
            continue
        clip_context.append(
            {
                "clip_id": clip_id,
                "track_id": track_id,
                "start_ms": clip.get("start_ms"),
                "end_ms": clip.get("end_ms"),
                "is_preserve_target": clip_id == preserve_clip_id,
            }
        )
    return clip_context


def _normalize_plan_payload(
    state: WorkflowState,
    *,
    region: dict[str, object],
    preserve_clip_id: int,
    raw_plan_payload: dict[str, object],
) -> dict[str, object]:
    plan_payload = deepcopy(raw_plan_payload)
    candidate = deepcopy(plan_payload.get("candidate") or {})
    action = deepcopy(candidate.get("action") or {})

    selected_region_id = str(region["id"])
    plan_payload["selectedRegionId"] = selected_region_id
    plan_payload["preserveClipId"] = preserve_clip_id
    plan_payload["userFeedbackMessage"] = state.get("user_feedback_message")

    candidate["candidateId"] = str(
        candidate.get("candidateId") or f"{state['job_id']}-plan-candidate-1"
    )
    candidate["issueType"] = region.get("issue_type")
    candidate["preserveClipId"] = preserve_clip_id

    action["actionId"] = str(action.get("actionId") or f"{state['job_id']}-action-1")
    action["targetScope"] = action.get("targetScope", "TRACK")
    action["params"] = action.get("params") or {}
    candidate["targetTrackId"] = action.get("targetTrackId")
    candidate["action"] = action
    plan_payload["candidate"] = candidate
    return plan_payload


def _build_region_action(
    state: WorkflowState,
    *,
    region: dict[str, object],
    preserve_clip_id: int | None,
    index: int,
) -> dict | None:
    issue = region.get("issue_type")
    if issue == "band_overlap":
        target_track_id = _resolve_overlap_target_track(state, region, preserve_clip_id)
        return build_action(
            state,
            index=index,
            action_type="DYNAMIC_EQ",
            track_id=target_track_id,
            start_ms=region["start_ms"],
            end_ms=region["end_ms"],
            band_low_hz=region.get("band_low_hz"),
            band_high_hz=region.get("band_high_hz"),
            gain_delta_db=-2.4,
            params={"threshold": -19, "ratio": 2.0},
        )
    if issue == "sibilance":
        return build_action(
            state,
            index=index,
            action_type="DE_ESSER",
            track_id=int(region.get("track_id") or 0),
            start_ms=region["start_ms"],
            end_ms=region["end_ms"],
            band_low_hz=region.get("band_low_hz"),
            band_high_hz=region.get("band_high_hz"),
            params={"threshold": -18, "ratio": 2.4},
        )
    if issue == "clipping":
        recommended_trim_db = _recommended_clipping_trim_db(region)
        return build_action(
            state,
            index=index,
            action_type="GAIN_TRIM",
            track_id=None,
            target_scope="MASTER",
            start_ms=region["start_ms"],
            end_ms=region["end_ms"],
            gain_delta_db=round(-recommended_trim_db, 2),
            params={
                "preGainDb": round(-recommended_trim_db, 2),
                "postAction": "TRUE_PEAK_LIMITER",
                "ceilingDbfs": -1.0,
                "attackMs": 2,
                "releaseMs": 80,
                "lookaheadMs": 3,
            },
        )
    if issue == "high_band_harshness":
        return build_action(
            state,
            index=index,
            action_type="DYNAMIC_EQ",
            track_id=int(region.get("track_id") or 0),
            start_ms=region["start_ms"],
            end_ms=region["end_ms"],
            band_low_hz=region.get("band_low_hz"),
            band_high_hz=region.get("band_high_hz"),
            gain_delta_db=-1.8,
            params={"threshold": -19, "ratio": 2.1},
        )
    return None


def _resolve_overlap_target_track(
    state: WorkflowState,
    region: dict[str, object],
    preserve_clip_id: int | None,
) -> int:
    primary = int(region.get("track_id") or 0)
    involved_track_ids = [int(track_id) for track_id in region.get("involved_track_ids", [])]
    if involved_track_ids:
        clip_track_id = (
            _resolve_clip_track_id(state, preserve_clip_id)
            if preserve_clip_id
            else None
        )
        track_scores = {
            int(track_id): float(score)
            for track_id, score in (region.get("track_body_contributions") or {}).items()
        }
        candidate_track_ids = [
            track_id
            for track_id in involved_track_ids
            if clip_track_id is None or track_id != clip_track_id
        ]
        if not candidate_track_ids:
            return primary
        candidate_track_ids.sort(
            key=lambda track_id: (
                track_scores.get(track_id, 0.0),
                track_id == primary,
            ),
            reverse=True,
        )
        return candidate_track_ids[0]

    secondary = region.get("secondary_track_id")
    if secondary is None:
        return primary
    secondary = int(secondary)
    if not preserve_clip_id:
        return secondary

    clip_track_id = _resolve_clip_track_id(state, preserve_clip_id)
    if clip_track_id == primary:
        return secondary
    if clip_track_id == secondary:
        return primary
    return secondary


def _resolve_clip_track_id(state: WorkflowState, clip_id: int) -> int | None:
    for clip in state.get("clip_index", []):
        if int(clip.get("clip_id") or 0) == int(clip_id):
            return int(clip["track_id"])
    return None


def _recommended_clipping_trim_db(region: dict[str, object]) -> float:
    score = float(region.get("score", 0.0))
    severity = str(region.get("severity", "MEDIUM"))
    base_by_severity = {
        "CRITICAL": 3.2,
        "HIGH": 2.4,
        "MEDIUM": 1.6,
        "LOW": 1.2,
    }
    return min(max(base_by_severity.get(severity, 1.6) + (score * 1.25), 1.0), 5.5)
