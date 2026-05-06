from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.graph.state import ApplyState, RuntimeState, WorkflowState


# 런타임 진행 상태를 프론트 polling 응답과 저장 projection에서 공통으로 쓰는 형태로 정리한다.
class RuntimeStatusProjection(BaseModel):
    job_id: int
    phase: str
    current_node: str
    progress: int
    status: str
    heartbeat_at: str | None = None


# 분석 job 자체의 메타데이터를 외부 응답용 projection으로 표현한다.
class AnalysisJobProjection(BaseModel):
    id: int
    project_id: int
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


# 개별 분석 region을 프론트/저장 계층이 바로 쓰기 좋은 형태로 정규화한다.
class AnalysisRegionProjection(BaseModel):
    id: str
    job_id: int
    region_type: str = "ISSUE_REGION"
    issue_type: str | None = None
    start_ms: int | None = None
    end_ms: int | None = None
    measure_start: int | None = None
    measure_end: int | None = None
    severity: str = "MEDIUM"
    analysis_summary: str | None = None
    evidence_doc_id: str | None = None
    ranking_score: float | None = None
    requires_user_action: bool = True
    track_id: int | None = None
    secondary_track_id: int | None = None
    band_low_hz: int | None = None
    band_high_hz: int | None = None
    detector_score: float | None = None
    involved_track_ids: list[int] = Field(default_factory=list)
    # 프론트 잠금은 트랙 단위가 아니라 실제로 겹치는 clip id 집합 기준으로 판단한다.
    affected_clip_ids: list[int] = Field(default_factory=list)
    contributing_track_ids: list[int] = Field(default_factory=list)
    track_contribution_scores: dict[str, float] = Field(default_factory=dict)
    contributor_band_hints: dict[str, list[str]] = Field(default_factory=dict)


# 보컬 추론 결과를 별도 projection으로 노출한다.
class TrackVocalPredictionProjection(BaseModel):
    id: str
    track_id: int
    job_id: int
    vocal_score: float
    is_vocal: bool
    confidence: float | None = None


# 정책 retrieval 결과를 요약해서 외부로 노출한다.
class PlanStateProjection(BaseModel):
    selected_region_id: str | None = None
    preserve_clip_id: int | None = None
    user_feedback_message: str | None = None
    status: str | None = None
    validator_result: str | None = None
    critic_result: str | None = None
    revise_count: int = 0
    revision_notes: list[str] = Field(default_factory=list)


# suggestion 내부의 단일 action을 응답용 스키마로 변환한다.
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


# suggestion 한 개와 그 action 목록을 묶는 projection이다.
class SuggestionProjection(BaseModel):
    id: str
    group_id: str
    rank_no: int
    summary: str
    explanation: str | None = None
    validation_status: str = "PENDING"
    judge_score: float | None = None
    actions: list[SuggestionActionProjection] = Field(default_factory=list)


# suggestion group은 선택된 region 문맥과 suggestion 묶음을 함께 담는다.
class SuggestionGroupProjection(BaseModel):
    id: str
    job_id: int
    region_id: str | None = None
    start_ms: int | None = None
    end_ms: int | None = None
    measure_start: int | None = None
    measure_end: int | None = None
    title: str
    summary: str | None = None
    suggestions: list[SuggestionProjection] = Field(default_factory=list)


# preview render 진행 상태를 외부 응답용으로 평평하게 표현한다.
class PreviewRenderProjection(BaseModel):
    id: str
    job_id: int
    suggestion_id: str | None = None
    status: str
    render_no: int = 1
    preview_target_region: str | None = None
    preview_region_start_ms: int | None = None
    preview_region_end_ms: int | None = None
    preview_measure_start: int | None = None
    preview_measure_end: int | None = None
    preview_action_type: str | None = None
    preview_action_track: int | None = None
    preview_excerpt_range: dict[str, int] | None = None
    requested_by: int | None = None
    requested_at: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    expired_at: str | None = None
    error_code: str | None = None
    error_message: str | None = None


# 실제 적용 결과를 외부 projection으로 표현한다.
class AppliedSuggestionProjection(BaseModel):
    id: str
    job_id: int
    suggestion_id: str | None = None
    before_snapshot_id: str | None = None
    after_snapshot_id: str | None = None
    applied_by: int | None = None
    status: str


# 최종 사용자 의사결정 이벤트를 projection으로 정리한다.
class FeedbackEventProjection(BaseModel):
    id: str
    job_id: int
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)


# workflow 전체에서 노출할 projection 묶음의 최상위 컨테이너다.
class WorkflowGraphProjections(BaseModel):
    runtime_status: RuntimeStatusProjection
    analysis_job: AnalysisJobProjection
    analysis_regions: list[AnalysisRegionProjection] = Field(default_factory=list)
    track_vocal_predictions: list[TrackVocalPredictionProjection] = Field(default_factory=list)
    plan_state: PlanStateProjection | None = None
    suggestion_group: SuggestionGroupProjection | None = None
    preview_render: PreviewRenderProjection | None = None
    applied_suggestion: AppliedSuggestionProjection | None = None
    feedback_event: FeedbackEventProjection | None = None


RuntimeGraphProjections = WorkflowGraphProjections
ApplyGraphProjections = WorkflowGraphProjections


# workflow state를 API 응답/저장 projection 세트로 한 번에 바꾸는 메인 진입점이다.
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
            status=state.get("durable_status", "REQUESTED"),
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
        plan_state=_build_plan_state(state),
        suggestion_group=suggestion_group,
        preview_render=_build_preview_render(state, suggestion_group),
        applied_suggestion=_build_applied_suggestion(state, suggestion_group),
        feedback_event=_build_feedback_event(state),
    )


# runtime graph도 현재는 workflow와 같은 projection 포맷을 공유한다.
def build_runtime_projections(state: RuntimeState) -> RuntimeGraphProjections:
    return build_workflow_projections(state)


# apply graph도 workflow projection 빌더를 그대로 재사용한다.
def build_apply_projections(state: ApplyState) -> ApplyGraphProjections:
    return build_workflow_projections(state)


def _to_validation_status(result: str | None) -> str:
    if result == "PASS":
        return "PASSED"
    if result == "REJECT":
        return "FAILED"
    if result == "REVISE":
        return "NEEDS_REVIEW"
    return "PENDING"


def _to_issue_code(issue_type: object) -> str | None:
    mapping = {
        "band_overlap": "BAND_OVERLAP",
        "track_clipping": "TRACK_CLIPPING",
        "master_clipping": "MASTER_CLIPPING",
        "sibilance": "SIBILANCE",
        "high_band_harshness": "HIGH_BAND_HARSHNESS",
    }
    if issue_type is None:
        return None
    return mapping.get(str(issue_type), str(issue_type))


# 내부 analysis_regions state를 응답용 region projection 목록으로 변환한다.
# 마디 범위와 affected clip id를 외부 포맷으로 고정하는 책임도 여기 있다.
def _build_analysis_regions(state: WorkflowState) -> list[AnalysisRegionProjection]:
    ranking_scores = state.get("ranking_scores", {})
    return [
        AnalysisRegionProjection(
            id=region["id"],
            job_id=state["job_id"],
            issue_type=_to_issue_code(region.get("issue_type")),
            start_ms=region.get("start_ms"),
            end_ms=region.get("end_ms"),
            measure_start=region.get("measure_start"),
            measure_end=region.get("measure_end"),
            severity=region.get("severity", "MEDIUM"),
            analysis_summary=region.get("summary"),
            evidence_doc_id=region.get("evidence_doc_id"),
            ranking_score=ranking_scores.get(region["id"]),
            requires_user_action=bool(region.get("requires_user_action", True)),
            track_id=region.get("track_id"),
            secondary_track_id=region.get("secondary_track_id"),
            band_low_hz=region.get("band_low_hz"),
            band_high_hz=region.get("band_high_hz"),
            detector_score=region.get("score"),
            involved_track_ids=[
                int(track_id) for track_id in region.get("involved_track_ids", [])
            ],
            affected_clip_ids=[int(clip_id) for clip_id in region.get("affected_clip_ids", [])],
            contributing_track_ids=[
                int(track_id) for track_id in region.get("contributing_track_ids", [])
            ],
            track_contribution_scores={
                str(track_id): float(score)
                for track_id, score in region.get("track_contribution_scores", {}).items()
            },
            contributor_band_hints={
                str(track_id): [str(hint) for hint in hints]
                for track_id, hints in region.get("contributor_band_hints", {}).items()
            },
        )
        for region in state.get("analysis_regions", [])
    ]


# inferred_roles를 track vocal prediction projection으로 옮긴다.
def _build_track_vocal_predictions(state: WorkflowState) -> list[TrackVocalPredictionProjection]:
    predictions: list[TrackVocalPredictionProjection] = []
    inferred_roles = state.get("inferred_roles", {})
    role_scores = state.get("track_role_scores", {})
    role_confidences = state.get("track_role_confidences", {})
    for index, (track_id, role) in enumerate(inferred_roles.items(), start=1):
        is_vocal = role == "vocal-like"
        predictions.append(
            TrackVocalPredictionProjection(
                id=f"{state['job_id']}-vocal-prediction-{index}",
                track_id=track_id,
                job_id=state["job_id"],
                vocal_score=float(role_scores.get(track_id, 0.0)),
                is_vocal=is_vocal,
                confidence=(
                    float(role_confidences[track_id])
                    if track_id in role_confidences
                    else None
                ),
            )
        )
    return predictions


# retrieval 문맥 id가 있으면 이를 retrieval projection으로 노출한다.
def _build_plan_state(state: WorkflowState) -> PlanStateProjection | None:
    if not any(
        [
            state.get("selected_region_id"),
            state.get("preserve_clip_id"),
            state.get("user_feedback_message"),
            state.get("plan_status"),
            state.get("validator_result"),
            state.get("critic_result"),
            state.get("plan_revision_notes"),
        ]
    ):
        return None
    return PlanStateProjection(
        selected_region_id=state.get("selected_region_id"),
        preserve_clip_id=state.get("preserve_clip_id"),
        user_feedback_message=state.get("user_feedback_message"),
        status=state.get("plan_status"),
        validator_result=state.get("validator_result"),
        critic_result=state.get("critic_result"),
        revise_count=state.get("revise_count", 0),
        revision_notes=state.get("plan_revision_notes", []),
    )


# suggestion payload를 suggestion group projection으로 정리한다.
# action 파라미터와 선택된 region 문맥을 외부 응답 스키마로 매핑한다.
def _build_suggestion_group(state: WorkflowState) -> SuggestionGroupProjection | None:
    payload = state.get("suggestion_payload") or {}
    if not payload:
        return None

    group_id = state.get("suggestion_group_id") or f"{state['job_id']}-group"
    validation_status = _to_validation_status(
        state.get("critic_result") or state.get("validator_result")
    )
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
                target_scope=action.get("targetScope", "TRACK"),
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

    ranked_region_ids = state.get("ranked_candidate_ids", [])
    # suggestion group은 선택된 region의 시간/마디 문맥을 같이 들고 있어야
    # 프론트가 어떤 구간에 대한 제안인지 자연스럽게 표현할 수 있다.
    selected_region_id = (
        state.get("selected_region_id")
        or next(iter(ranked_region_ids), None)
        or next(iter(state.get("analysis_region_ids", [])), None)
    )
    region_map = {region["id"]: region for region in state.get("analysis_regions", [])}
    selected_region = region_map.get(selected_region_id) if selected_region_id else None
    return SuggestionGroupProjection(
        id=group_id,
        job_id=state["job_id"],
        region_id=selected_region_id,
        start_ms=selected_region.get("start_ms") if selected_region else None,
        end_ms=selected_region.get("end_ms") if selected_region else None,
        measure_start=selected_region.get("measure_start") if selected_region else None,
        measure_end=selected_region.get("measure_end") if selected_region else None,
        title=payload.get("groupTitle", "Workflow suggestion group"),
        summary=payload.get("groupSummary"),
        suggestions=suggestions,
    )


# preview id가 생긴 경우에만 preview projection을 만든다.
def _build_preview_render(
    state: WorkflowState,
    suggestion_group: SuggestionGroupProjection | None,
) -> PreviewRenderProjection | None:
    if not state.get("preview_id"):
        return None
    preview_action = _resolve_preview_action_projection(state, suggestion_group)
    preview_region = _resolve_preview_region_projection(state)
    suggestion_id = (
        suggestion_group.suggestions[0].id
        if suggestion_group and suggestion_group.suggestions
        else None
    )
    return PreviewRenderProjection(
        id=state["preview_id"],
        job_id=state["job_id"],
        suggestion_id=state.get("preview_suggestion_id") or suggestion_id,
        status=state.get("preview_status")
        or ("FAILED" if state.get("phase") == "failed" else "PROCESSING"),
        render_no=int(state.get("preview_render_no", 1) or 1),
        preview_target_region=preview_region.get("id") if preview_region else None,
        preview_region_start_ms=preview_region.get("start_ms") if preview_region else None,
        preview_region_end_ms=preview_region.get("end_ms") if preview_region else None,
        preview_measure_start=preview_region.get("measure_start") if preview_region else None,
        preview_measure_end=preview_region.get("measure_end") if preview_region else None,
        preview_action_type=preview_action.get("action_type") if preview_action else None,
        preview_action_track=preview_action.get("target_track_id") if preview_action else None,
        preview_excerpt_range=_build_preview_excerpt_range(state),
        requested_by=state.get("requested_by"),
        requested_at=state.get("preview_requested_at"),
        started_at=state.get("preview_started_at"),
        completed_at=state.get("preview_completed_at"),
        expired_at=state.get("preview_expired_at"),
        error_code=state.get("preview_error_code") or state.get("failure_code"),
        error_message=state.get("preview_error_message") or state.get("failure_message"),
    )


def _resolve_preview_region_projection(state: WorkflowState) -> dict[str, Any] | None:
    selected_region_id = state.get("selected_region_id")
    if selected_region_id is None:
        return None
    for region in state.get("analysis_regions", []):
        if str(region.get("id")) == str(selected_region_id):
            return region
    return None


def _resolve_preview_action_projection(
    state: WorkflowState,
    suggestion_group: SuggestionGroupProjection | None,
) -> dict[str, Any] | None:
    preview_action_ids = [str(action_id) for action_id in state.get("preview_action_ids", [])]
    if not preview_action_ids or suggestion_group is None:
        return None
    preview_action_id = preview_action_ids[0]
    for suggestion in suggestion_group.suggestions:
        for action in suggestion.actions:
            if action.id == preview_action_id:
                return action.model_dump(mode="python")
    return None


def _build_preview_excerpt_range(state: WorkflowState) -> dict[str, int] | None:
    excerpt_start_ms = state.get("preview_excerpt_start_ms")
    excerpt_end_ms = state.get("preview_excerpt_end_ms")
    if excerpt_start_ms is None or excerpt_end_ms is None:
        return None
    return {
        "start_ms": int(excerpt_start_ms),
        "end_ms": int(excerpt_end_ms),
    }




# apply 결과가 있거나 workflow가 종료 상태에 도달했을 때 적용 projection을 만든다.
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


# 최종 사용자 의사결정을 feedback event projection으로 노출한다.
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
        },
    )
