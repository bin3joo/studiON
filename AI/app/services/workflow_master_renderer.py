from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from tempfile import gettempdir

import numpy as np
import soundfile as sf

from app.services.workflow_audio_rendering import (
    RENDER_PEAK_LIMIT,
    RENDER_TARGET_SR,
    load_clip_segment,
    ms_to_frames,
)
from app.services.workflow_audio_paths import resolve_clip_audio_path


@dataclass(slots=True)
class MasterRenderResult:
    object_key: str
    duration_ms: int
    sample_rate: int


class MasterRenderError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def render_master_audio(
    *,
    job_id: int,
    project_duration_ms: int,
    clip_index: list[dict[str, object]],
) -> MasterRenderResult:
    if project_duration_ms <= 0:
        raise MasterRenderError(
            "INVALID_MASTER_DURATION",
            "master 렌더링에는 0보다 큰 프로젝트 길이가 필요합니다.",
        )
    if not clip_index:
        raise MasterRenderError(
            "MASTER_CLIP_INDEX_EMPTY",
            "master 렌더링에는 clip_index가 필요합니다.",
        )

    total_frames = ms_to_frames(project_duration_ms, RENDER_TARGET_SR)
    mix = np.zeros((total_frames, 2), dtype=np.float32)
    rendered_clip_count = 0

    for clip in clip_index:
        resolved_audio_path = resolve_clip_audio_path(clip)
        if resolved_audio_path is None:
            raise MasterRenderError(
                "MASTER_AUDIO_NOT_FOUND",
                f"clip {clip.get('clip_id')}의 master 오디오 경로를 해석할 수 없습니다.",
            )
        clip_segment = load_clip_segment(
            resolved_audio_path,
            audio_start_ms=int(clip.get("audio_start_ms") or 0),
            audio_duration_ms=int(clip.get("audio_duration_ms") or 0),
        )
        if clip_segment.size == 0:
            continue
        start_frame = ms_to_frames(int(clip.get("start_ms") or 0), RENDER_TARGET_SR)
        end_frame = min(start_frame + clip_segment.shape[0], mix.shape[0])
        if end_frame <= start_frame:
            continue
        segment = clip_segment[: end_frame - start_frame]
        mix[start_frame:end_frame] += segment
        rendered_clip_count += 1

    if rendered_clip_count == 0:
        raise MasterRenderError(
            "MASTER_RENDER_EMPTY",
            "master 렌더링 결과에 포함된 오디오 clip이 없습니다.",
        )

    peak = float(np.max(np.abs(mix))) if mix.size else 0.0
    if peak > RENDER_PEAK_LIMIT and peak > 0.0:
        mix *= RENDER_PEAK_LIMIT / peak

    output_path = _master_output_path(job_id)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_path, mix, RENDER_TARGET_SR)
    duration_ms = int(round((mix.shape[0] / RENDER_TARGET_SR) * 1000))
    return MasterRenderResult(
        object_key=str(output_path),
        duration_ms=duration_ms,
        sample_rate=RENDER_TARGET_SR,
    )


def _master_output_path(job_id: int) -> Path:
    master_root = Path(gettempdir()) / "studion-ai-master" / str(job_id)
    return master_root / "master.wav"
