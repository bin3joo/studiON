from __future__ import annotations

from threading import RLock
from typing import Protocol

from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.core.config import get_settings


class TrackEqCommitError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class TrackEqRecord(BaseModel):
    id: int
    track_id: int


class TrackEqBandRecord(BaseModel):
    id: int
    track_eq_id: int


class TrackEqBandUpdatePayload(BaseModel):
    eq_type_code: str
    frequency_hz: int
    q: float
    gain_delta_db: float
    job_id: int
    suggestion_action_id: str
    applied_suggestion_id: str | None = None
    source_type_code: str
    updated_by: int


class WorkflowTrackEqCommitStore(Protocol):
    def get_track_eq_by_track_id(self, track_id: int) -> TrackEqRecord | None: ...
    def get_active_track_eq_band(self, track_eq_id: int) -> TrackEqBandRecord | None: ...
    def update_track_eq_band(
        self,
        band_id: int,
        payload: TrackEqBandUpdatePayload,
    ) -> TrackEqBandRecord: ...


class MySQLWorkflowTrackEqCommitStore:
    def __init__(self, mysql_url: str) -> None:
        self._engine: Engine = create_engine(mysql_url, pool_pre_ping=True)

    def get_track_eq_by_track_id(self, track_id: int) -> TrackEqRecord | None:
        query = text(
            """
            SELECT id, trackId
            FROM track_eq
            WHERE trackId = :track_id
              AND deletedAt IS NULL
            ORDER BY id ASC
            LIMIT 1
            """
        )
        with self._engine.begin() as conn:
            row = conn.execute(query, {"track_id": track_id}).mappings().first()
        if row is None:
            return None
        return TrackEqRecord(
            id=int(row["id"]),
            track_id=int(row["trackId"]),
        )

    def get_active_track_eq_band(self, track_eq_id: int) -> TrackEqBandRecord | None:
        query = text(
            """
            SELECT id, trackEqId
            FROM track_eq_band
            WHERE trackEqId = :track_eq_id
              AND deletedAt IS NULL
            ORDER BY id ASC
            """
        )
        with self._engine.begin() as conn:
            rows = conn.execute(query, {"track_eq_id": track_eq_id}).mappings().all()
        if not rows:
            return None
        if len(rows) > 1:
            raise TrackEqCommitError(
                "MULTIPLE_ACTIVE_TRACK_EQ_BANDS",
                (
                    "track_eq_band 활성 row가 여러 개라서 "
                    "MVP 단일 band commit 규칙을 적용할 수 없습니다."
                ),
            )
        row = rows[0]
        return TrackEqBandRecord(
            id=int(row["id"]),
            track_eq_id=int(row["trackEqId"]),
        )

    def update_track_eq_band(
        self,
        band_id: int,
        payload: TrackEqBandUpdatePayload,
    ) -> TrackEqBandRecord:
        query = text(
            """
            UPDATE track_eq_band
            SET
                eqTypeCode = :eq_type_code,
                frequencyHz = :frequency_hz,
                q = :q,
                gainDeltaDb = :gain_delta_db,
                jobId = :job_id,
                suggestionActionId = :suggestion_action_id,
                appliedSuggestionId = :applied_suggestion_id,
                sourceTypeCode = :source_type_code,
                updatedAt = CURRENT_TIMESTAMP,
                updatedBy = :updated_by
            WHERE id = :band_id
              AND deletedAt IS NULL
            """
        )
        params = payload.model_dump(mode="python")
        params["band_id"] = band_id
        with self._engine.begin() as conn:
            result = conn.execute(query, params)
        if result.rowcount != 1:
            raise TrackEqCommitError(
                "TRACK_EQ_BAND_UPDATE_FAILED",
                f"track_eq_band {band_id} update가 반영되지 않았습니다.",
            )
        return self._get_track_eq_band_by_id(band_id)

    def _get_track_eq_band_by_id(self, band_id: int) -> TrackEqBandRecord:
        query = text(
            """
            SELECT id, trackEqId
            FROM track_eq_band
            WHERE id = :band_id
            """
        )
        with self._engine.begin() as conn:
            row = conn.execute(query, {"band_id": band_id}).mappings().first()
        if row is None:
            raise TrackEqCommitError(
                "TRACK_EQ_BAND_NOT_FOUND",
                f"track_eq_band {band_id}를 다시 조회하지 못했습니다.",
            )
        return TrackEqBandRecord(
            id=int(row["id"]),
            track_eq_id=int(row["trackEqId"]),
        )


_store_lock = RLock()
_store: WorkflowTrackEqCommitStore | None = None


def get_workflow_track_eq_commit_store() -> WorkflowTrackEqCommitStore | None:
    global _store
    mysql_url = get_settings().resolved_mysql_url
    if not mysql_url:
        return None
    with _store_lock:
        if _store is None:
            _store = MySQLWorkflowTrackEqCommitStore(mysql_url)
        return _store
