from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.graph.state import ApplyState, RuntimeState, WorkflowState


class RuntimeStatusProjection(BaseModel):
    job_id: str
    phase: str
    current_node: str
    progress: int
    status: str
    heartbeat_at: str | None = None


class AnalysisJobProjection(BaseModel):
    id: str
    project_id: str
    timeline_snapshot_id: str | None = None
    langgraph_thread_id: str
    status: str
    progress: int
    current_node: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    requested_by: int | None = None
    started_at: str | None = None
    completed_at: str | None = None


class AnalysisRegionProjection(BaseModel):
    id: str
    job_id: str
    region_type: str = "ISSUE_REGION"
    start_ms: int | None = None
    end_ms: int | None = None
    severity: str = "MEDIUM"
    analysis_summary: str | None = None
    evidence_doc_id: str | None = None
    ranking_score: float | None = None
    requires_user_action: bool = True


class TrackVocalPredictionProjection(BaseModel):
    id: str
    track_id: int
    job_id: str
    vocal_score: float
    is_vocal: bool
    confidence: float | None = None


class RagRetrievalProjection(BaseModel):
    id: str
    job_id: str
    query_text: str
    top_k: int
    quality_score: float | None = None
    document_ids: list[str] = Field(default_factory=list)


class SuggestionActionProjection(BaseModel):
    id: str
    suggestion_id: str
    action_type: str
    clip_id: int | None = None
    start_ms: int | None = None
    end_ms: int | None = None
    band_low_hz: int | None = None
    band_high_hz: int | None = None
    gain_delta_db: float | None = None
    move_delta_ms: int | None = None
    params_json: dict[str, Any] = Field(default_factory=dict)
    target_scope: str = "TRACK"
    target_track_id: int | None = None
    source_track_id: int | None = None
    source_clip_id: int | None = None


class SuggestionProjection(BaseModel):
    id: str
    group_id: str
    rank_no: int
    summary: str
    explanation: str | None = None
    validation_status: str = "PENDING"
    judge_score: float | None = None
    actions: list[SuggestionActionProjection] = Field(default_factory=list)


class SuggestionGroupProjection(BaseModel):
    id: str
    job_id: str
    region_id: str | None = None
    start_ms: int | None = None
    end_ms: int | None = None
    title: str
    summary: str | None = None
    suggestions: list[SuggestionProjection] = Field(default_factory=list)


class PreviewRenderProjection(BaseModel):
    id: str
    job_id: str
    suggestion_id: str | None = None
    status: str
    render_no: int = 1
    object_key: str | None = None
    duration_ms: int | None = None
    requested_by: int | None = None
    requested_at: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    expired_at: str | None = None
    error_code: str | None = None
    error_message: str | None = None


class AppliedSuggestionProjection(BaseModel):
    id: str
    job_id: str
    suggestion_id: str | None = None
    before_snapshot_id: str | None = None
    after_snapshot_id: str | None = None
    applied_by: int | None = None
    status: str


class FeedbackEventProjection(BaseModel):
    id: str
    job_id: str
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)


class WorkflowGraphProjections(BaseModel):
    runtime_status: RuntimeStatusProjection
    analysis_job: AnalysisJobProjection
    analysis_regions: list[AnalysisRegionProjection] = Field(default_factory=list)
    track_vocal_predictions: list[TrackVocalPredictionProjection] = Field(default_factory=list)
    rag_retrievals: list[RagRetrievalProjection] = Field(default_factory=list)
    suggestion_group: SuggestionGroupProjection | None = None
    preview_render: PreviewRenderProjection | None = None
    applied_suggestion: AppliedSuggestionProjection | None = None
    feedback_event: FeedbackEventProjection | None = None


RuntimeGraphProjections = WorkflowGraphProjections
ApplyGraphProjections = WorkflowGraphProjections


def build_workflow_projections(state: WorkflowState) -> WorkflowGraphProjections:
    suggestion_group = _build_suggestion_group(state)
    return WorkflowGraphProjections(
        runtime_status=RuntimeStatusProjection(
            job_id=state["job_id"],
            phase=state.get("phase", ""),
            current_node=state.get("current_node", ""),
            progress=state.get("progress", 0),
            status=state.get("runtime_status", "queued"),
            heartbeat_at=state.get("heartbeat_at"),
        ),
        analysis_job=AnalysisJobProjection(
            id=state["job_id"],
            project_id=state["project_id"],
            timeline_snapshot_id=state.get("timeline_snapshot_id"),
            langgraph_thread_id=state.get("langgraph_thread_id", f"lg-thread:{state['job_id']}"),
            status=state.get("durable_status", "PENDING"),
            progress=state.get("progress", 0),
            current_node=state.get("current_node"),
            error_code=state.get("failure_code"),
            error_message=state.get("failure_message"),
            requested_by=state.get("requested_by"),
            started_at=state.get("started_at"),
            completed_at=state.get("completed_at"),
        ),
        analysis_regions=_build_analysis_regions(state),
        track_vocal_predictions=_build_track_vocal_predictions(state),
        rag_retrievals=_build_rag_retrievals(state),
        suggestion_group=suggestion_group,
        preview_render=_build_preview_render(state, suggestion_group),
        applied_suggestion=_build_applied_suggestion(state, suggestion_group),
        feedback_event=_build_feedback_event(state),
    )


def build_runtime_projections(state: RuntimeState) -> RuntimeGraphProjections:
    return build_workflow_projections(state)


def build_apply_projections(state: ApplyState) -> ApplyGraphProjections:
    return build_workflow_projections(state)


def _build_analysis_regions(state: WorkflowState) -> list[AnalysisRegionProjection]:
    ranking_scores = state.get("ranking_scores", {})
    return [
        AnalysisRegionProjection(
            id=region["id"],
            job_id=state["job_id"],
            start_ms=region.get("start_ms"),
            end_ms=region.get("end_ms"),
            severity=region.get("severity", "MEDIUM"),
            analysis_summary=region.get("summary"),
            evidence_doc_id=region.get("evidence_doc_id"),
            ranking_score=ranking_scores.get(region["id"]),
            requires_user_action=bool(region.get("requires_user_action", True)),
        )
        for region in state.get("analysis_regions", [])
    ]


def _build_track_vocal_predictions(state: WorkflowState) -> list[TrackVocalPredictionProjection]:
    predictions: list[TrackVocalPredictionProjection] = []
    inferred_roles = state.get("inferred_roles", {})
    for index, (track_id, role) in enumerate(inferred_roles.items(), start=1):
        is_vocal = role == "vocal-like"
        predictions.append(
            TrackVocalPredictionProjection(
                id=f"{state['job_id']}-vocal-prediction-{index}",
                track_id=track_id,
                job_id=state["job_id"],
                vocal_score=0.92 if is_vocal else 0.36,
                is_vocal=is_vocal,
                confidence=0.88 if is_vocal else 0.64,
            )
        )
    return predictions


def _build_rag_retrievals(state: WorkflowState) -> list[RagRetrievalProjection]:
    if not state.get("retrieval_context_ids"):
        return []
    query_text = "|".join(state.get("detected_issues", []))
    return [
        RagRetrievalProjection(
            id=f"{state['job_id']}-retrieval-1",
            job_id=state["job_id"],
            query_text=query_text,
            top_k=len(state.get("retrieval_context_ids", [])),
            quality_score=0.84,
            document_ids=state.get("retrieval_context_ids", []),
        )
    ]


def _build_suggestion_group(state: WorkflowState) -> SuggestionGroupProjection | None:
    payload = state.get("suggestion_payload") or {}
    if not payload:
        return None

    group_id = state.get("suggestion_group_id") or f"{state['job_id']}-group"
    validation_status = state.get("critic_result") or state.get("validator_result") or "PENDING"
    suggestions: list[SuggestionProjection] = []
    for suggestion_index, suggestion in enumerate(payload.get("suggestions", []), start=1):
        suggestion_id = f"{group_id}-suggestion-{suggestion_index}"
        actions = [
            SuggestionActionProjection(
                id=action["actionId"],
                suggestion_id=suggestion_id,
                action_type=action["actionType"],
                clip_id=action.get("targetClipId"),
                start_ms=action.get("startMs"),
                end_ms=action.get("endMs"),
                band_low_hz=action.get("bandLowHz"),
                band_high_hz=action.get("bandHighHz"),
                gain_delta_db=action.get("gainDeltaDb"),
                move_delta_ms=action.get("moveDeltaMs"),
                params_json=action.get("params") or {},
                target_track_id=action.get("targetTrackId"),
                source_track_id=action.get("sourceTrackId"),
                source_clip_id=action.get("sourceClipId"),
            )
            for action in suggestion.get("actions", [])
        ]
        suggestions.append(
            SuggestionProjection(
                id=suggestion_id,
                group_id=group_id,
                rank_no=suggestion.get("rank", suggestion_index),
                summary=suggestion.get("summary", ""),
                explanation=suggestion.get("explanation"),
                validation_status=validation_status,
                judge_score=None,
                actions=actions,
            )
        )
    first_region_id = next(iter(state.get("analysis_region_ids", [])), None)
    return SuggestionGroupProjection(
        id=group_id,
        job_id=state["job_id"],
        region_id=first_region_id,
        start_ms=1000 if first_region_id else None,
        end_ms=4000 if first_region_id else None,
        title=payload.get("groupTitle", "Workflow suggestion group"),
        summary=payload.get("groupSummary"),
        suggestions=suggestions,
    )


def _build_preview_render(
    state: WorkflowState,
    suggestion_group: SuggestionGroupProjection | None,
) -> PreviewRenderProjection | None:
    if not state.get("preview_id"):
        return None
    suggestion_id = (
        suggestion_group.suggestions[0].id
        if suggestion_group and suggestion_group.suggestions
        else None
    )
    return PreviewRenderProjection(
        id=state["preview_id"],
        job_id=state["job_id"],
        suggestion_id=suggestion_id,
        status="READY" if state.get("phase") != "failed" else "FAILED",
        requested_by=state.get("requested_by"),
        requested_at=state.get("started_at"),
        started_at=state.get("started_at"),
        completed_at=state.get("completed_at"),
        error_code=state.get("failure_code"),
        error_message=state.get("failure_message"),
    )


def _build_applied_suggestion(
    state: WorkflowState,
    suggestion_group: SuggestionGroupProjection | None,
) -> AppliedSuggestionProjection | None:
    if not state.get("apply_result_id") and state.get("phase") not in {"failed", "completed"}:
        return None
    suggestion_id = None
    if suggestion_group and suggestion_group.suggestions:
        suggestion_id = suggestion_group.suggestions[0].id
    status = (
        "APPLIED"
        if state.get("phase") == "completed" and state.get("apply_result_id")
        else "FAILED"
    )
    return AppliedSuggestionProjection(
        id=state.get("apply_result_id") or f"{state['job_id']}-apply-failed",
        job_id=state["job_id"],
        suggestion_id=suggestion_id,
        before_snapshot_id=state.get("timeline_snapshot_id"),
        after_snapshot_id=None,
        applied_by=state.get("requested_by"),
        status=status,
    )


def _build_feedback_event(state: WorkflowState) -> FeedbackEventProjection | None:
    feedback_event_id = state.get("feedback_event_id")
    if not feedback_event_id:
        return None
    return FeedbackEventProjection(
        id=feedback_event_id,
        job_id=state["job_id"],
        event_type="AI_EDIT_CONFIRMATION",
        payload={
            "decision": state.get("user_decision", "confirm"),
            "selectedActionIds": state.get("selected_action_ids", []),
        },
    )
