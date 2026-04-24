from __future__ import annotations

from copy import deepcopy
from json import dumps, loads
from threading import RLock
from typing import Protocol

from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.graph.state import UserDecision, WorkflowDispatchType, WorkflowState


class WorkflowDispatchMessage(BaseModel):
    job_id: str
    project_id: str
    dispatch_type: WorkflowDispatchType
    requested_by: int | None = None
    main_track_id: int | None = None
    selected_action_ids: list[str] = Field(default_factory=list)
    user_decision: UserDecision | None = None


class WorkflowJobRecord(BaseModel):
    id: str
    project_id: str
    status: str
    phase: str
    current_node: str | None = None
    progress: int = 0
    langgraph_thread_id: str
    timeline_snapshot_id: str | None = None
    requested_by: int | None = None
    started_at: str | None = None
    completed_at: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    state_snapshot: dict = Field(default_factory=dict)


class WorkflowJobStore(Protocol):
    def reset(self) -> None: ...
    def create_pending_job(self, state: WorkflowState) -> WorkflowJobRecord: ...
    def get_job(self, job_id: str) -> WorkflowJobRecord | None: ...
    def save_graph_state(self, state: WorkflowState) -> WorkflowJobRecord: ...


class InMemoryWorkflowJobStore:
    def __init__(self) -> None:
        self._lock = RLock()
        self._jobs: dict[str, WorkflowJobRecord] = {}

    def reset(self) -> None:
        with self._lock:
            self._jobs.clear()

    def create_pending_job(self, state: WorkflowState) -> WorkflowJobRecord:
        with self._lock:
            job_id = state["job_id"]
            if job_id in self._jobs:
                raise ValueError(f"Workflow job already exists: {job_id}")
            record = _build_record(state)
            self._jobs[job_id] = record
            return record.model_copy(deep=True)

    def get_job(self, job_id: str) -> WorkflowJobRecord | None:
        with self._lock:
            record = self._jobs.get(job_id)
            return record.model_copy(deep=True) if record else None

    def save_graph_state(self, state: WorkflowState) -> WorkflowJobRecord:
        with self._lock:
            job_id = state["job_id"]
            if job_id not in self._jobs:
                raise KeyError(f"Workflow job does not exist: {job_id}")
            record = _build_record(state)
            self._jobs[job_id] = record
            return record.model_copy(deep=True)


class MySQLWorkflowJobStore:
    def __init__(self, mysql_url: str) -> None:
        self._engine: Engine = create_engine(mysql_url, pool_pre_ping=True)
        self._schema_ready = False
        self._schema_lock = RLock()

    def reset(self) -> None:
        self._ensure_schema()
        with self._engine.begin() as conn:
            conn.execute(text("DELETE FROM ai_analysis_job"))

    def create_pending_job(self, state: WorkflowState) -> WorkflowJobRecord:
        self._ensure_schema()
        record = _build_record(state)
        try:
            with self._engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO ai_analysis_job (
                            id, projectId, status, phase, currentNode, progress,
                            langgraphThreadId, timelineSnapshotId, requestedBy,
                            startedAt, completedAt, errorCode, errorMessage, stateJson
                        ) VALUES (
                            :id, :projectId, :status, :phase, :currentNode, :progress,
                            :langgraphThreadId, :timelineSnapshotId, :requestedBy,
                            :startedAt, :completedAt, :errorCode, :errorMessage, :stateJson
                        )
                        """
                    ),
                    _record_params(record),
                )
        except IntegrityError as exc:
            raise ValueError(f"Workflow job already exists: {state['job_id']}") from exc
        return record

    def get_job(self, job_id: str) -> WorkflowJobRecord | None:
        self._ensure_schema()
        with self._engine.begin() as conn:
            row = conn.execute(
                text(
                    """
                    SELECT
                        id, projectId, status, phase, currentNode, progress,
                        langgraphThreadId, timelineSnapshotId, requestedBy,
                        startedAt, completedAt, errorCode, errorMessage, stateJson
                    FROM ai_analysis_job
                    WHERE id = :job_id
                    """
                ),
                {"job_id": job_id},
            ).mappings().first()
        if row is None:
            return None
        return _row_to_record(dict(row))

    def save_graph_state(self, state: WorkflowState) -> WorkflowJobRecord:
        self._ensure_schema()
        record = _build_record(state)
        with self._engine.begin() as conn:
            result = conn.execute(
                text(
                    """
                    UPDATE ai_analysis_job
                    SET
                        projectId = :projectId,
                        status = :status,
                        phase = :phase,
                        currentNode = :currentNode,
                        progress = :progress,
                        langgraphThreadId = :langgraphThreadId,
                        timelineSnapshotId = :timelineSnapshotId,
                        requestedBy = :requestedBy,
                        startedAt = :startedAt,
                        completedAt = :completedAt,
                        errorCode = :errorCode,
                        errorMessage = :errorMessage,
                        stateJson = :stateJson
                    WHERE id = :id
                    """
                ),
                _record_params(record),
            )
        if result.rowcount == 0:
            raise KeyError(f"Workflow job does not exist: {state['job_id']}")
        return record

    def _ensure_schema(self) -> None:
        if self._schema_ready:
            return
        with self._schema_lock:
            if self._schema_ready:
                return
            with self._engine.begin() as conn:
                # 실행 중인 API와 worker가 같은 MySQL row를 바라보도록 최소 durable
                # workflow job 테이블을 여기서 보장한다.
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS ai_analysis_job (
                            id VARCHAR(64) NOT NULL PRIMARY KEY,
                            projectId VARCHAR(64) NOT NULL,
                            status VARCHAR(32) NOT NULL,
                            phase VARCHAR(64) NOT NULL,
                            currentNode VARCHAR(64) NULL,
                            progress TINYINT NOT NULL DEFAULT 0,
                            langgraphThreadId VARCHAR(128) NOT NULL,
                            timelineSnapshotId VARCHAR(128) NULL,
                            requestedBy INT NULL,
                            startedAt VARCHAR(64) NULL,
                            completedAt VARCHAR(64) NULL,
                            errorCode VARCHAR(64) NULL,
                            errorMessage VARCHAR(255) NULL,
                            stateJson JSON NOT NULL
                        )
                        """
                    )
                )
            self._schema_ready = True


def _build_record(state: WorkflowState) -> WorkflowJobRecord:
    return WorkflowJobRecord(
        id=state["job_id"],
        project_id=state["project_id"],
        status=state.get("durable_status", "PENDING"),
        phase=state.get("phase", "queued"),
        current_node=state.get("current_node"),
        progress=state.get("progress", 0),
        langgraph_thread_id=state.get("langgraph_thread_id", f"lg-thread:{state['job_id']}"),
        timeline_snapshot_id=state.get("timeline_snapshot_id"),
        requested_by=state.get("requested_by"),
        started_at=state.get("started_at"),
        completed_at=state.get("completed_at"),
        error_code=state.get("failure_code"),
        error_message=state.get("failure_message"),
        # 현재 resume에 필요한 오케스트레이션 상태만 저장하며, 큰 artifact 본문은
        # MySQL에 넣지 않고 기존 ID/참조만 상태 안에 남긴다.
        state_snapshot=deepcopy(dict(state)),
    )


def _record_params(record: WorkflowJobRecord) -> dict:
    return {
        "id": record.id,
        "projectId": record.project_id,
        "status": record.status,
        "phase": record.phase,
        "currentNode": record.current_node,
        "progress": record.progress,
        "langgraphThreadId": record.langgraph_thread_id,
        "timelineSnapshotId": record.timeline_snapshot_id,
        "requestedBy": record.requested_by,
        "startedAt": record.started_at,
        "completedAt": record.completed_at,
        "errorCode": record.error_code,
        "errorMessage": record.error_message,
        "stateJson": dumps(record.state_snapshot, ensure_ascii=False),
    }


def _row_to_record(row: dict) -> WorkflowJobRecord:
    state_json = row.get("stateJson")
    if isinstance(state_json, str):
        state_snapshot = loads(state_json)
    elif isinstance(state_json, dict):
        state_snapshot = state_json
    else:
        state_snapshot = {}
    return WorkflowJobRecord(
        id=row["id"],
        project_id=row["projectId"],
        status=row["status"],
        phase=row["phase"],
        current_node=row.get("currentNode"),
        progress=int(row.get("progress", 0)),
        langgraph_thread_id=row["langgraphThreadId"],
        timeline_snapshot_id=row.get("timelineSnapshotId"),
        requested_by=row.get("requestedBy"),
        started_at=row.get("startedAt"),
        completed_at=row.get("completedAt"),
        error_code=row.get("errorCode"),
        error_message=row.get("errorMessage"),
        state_snapshot=state_snapshot,
    )


_memory_store = InMemoryWorkflowJobStore()
_mysql_store: MySQLWorkflowJobStore | None = None


def get_workflow_job_store() -> WorkflowJobStore:
    global _mysql_store
    mysql_url = get_settings().resolved_mysql_url
    if not mysql_url:
        return _memory_store
    if _mysql_store is None:
        _mysql_store = MySQLWorkflowJobStore(mysql_url)
    return _mysql_store
