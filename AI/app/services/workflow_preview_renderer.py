from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from tempfile import gettempdir

import numpy as np
import soundfile as sf

from app.services.workflow_audio_paths import resolve_clip_audio_path
from app.services.workflow_audio_rendering import (
    RENDER_PEAK_LIMIT,
    RENDER_TARGET_SR,
    load_clip_segment,
    ms_to_frames,
)

PREVIEW_CONTEXT_PADDING_MS = 4000


@dataclass(slots=True)
class PreviewRenderResult:
    object_key: str
    duration_ms: int
    excerpt_start_ms: int
    excerpt_end_ms: int
    sample_rate: int


@dataclass(slots=True)
class PreviewBeforeRenderResult:
    object_key: str
    duration_ms: int
    sample_rate: int


class PreviewRenderError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# preview wav를 문제 구간 master-context after excerpt로 만든다.
def render_preview_audio(
    *,
    job_id: int,
    preview_id: str,
    clip_index: list[dict[str, object]],
    action: dict[str, object],
    focus_region: dict[str, object] | None = None,
    project_duration_ms: int | None = None,
) -> PreviewRenderResult:
    action_type = str(action.get("actionType") or "")
    target_scope = str(action.get("targetScope") or "")
    if action_type != "DYNAMIC_EQ" or target_scope != "TRACK":
        raise PreviewRenderError(
            "UNSUPPORTED_PREVIEW_ACTION",
            "현재 MVP 프리뷰 렌더링은 TRACK 범위의 DYNAMIC_EQ 액션만 지원합니다. "
            f"입력값: {target_scope} {action_type}",
        )

    target_track_id = action.get("targetTrackId")
    if target_track_id is None:
        raise PreviewRenderError(
            "MISSING_PREVIEW_TARGET",
            "TRACK 범위 프리뷰 렌더링에는 targetTrackId가 필요합니다.",
        )

    action_start_ms = _require_int_field(action, "startMs")
    action_end_ms = _require_int_field(action, "endMs")
    if action_end_ms <= action_start_ms:
        raise PreviewRenderError(
            "INVALID_PREVIEW_RANGE",
            "프리뷰 렌더링에서는 endMs가 startMs보다 커야 합니다.",
        )

    issue_start_ms = int(focus_region.get("start_ms")) if focus_region else action_start_ms
    issue_end_ms = int(focus_region.get("end_ms")) if focus_region else action_end_ms
    if issue_end_ms <= issue_start_ms:
        raise PreviewRenderError(
            "INVALID_PREVIEW_RANGE",
            "문제 구간이 비어 있어 preview excerpt를 만들 수 없습니다.",
        )

    timeline_end_ms = _resolve_timeline_end_ms(
        clip_index=clip_index,
        project_duration_ms=project_duration_ms,
    )
    excerpt_start_ms, excerpt_end_ms = _expand_range_with_context(
        issue_start_ms=issue_start_ms,
        issue_end_ms=issue_end_ms,
        timeline_end_ms=timeline_end_ms,
    )

    overlapping_target_exists = False
    total_frames = ms_to_frames(excerpt_end_ms - excerpt_start_ms, RENDER_TARGET_SR)
    mix = np.zeros((total_frames, 2), dtype=np.float32)
    rendered_clip_count = 0

    for clip in clip_index:
        clip_start_ms = int(clip.get("start_ms") or 0)
        clip_end_ms = int(clip.get("end_ms") or 0)
        overlap_start_ms = max(clip_start_ms, excerpt_start_ms)
        overlap_end_ms = min(clip_end_ms, excerpt_end_ms)
        if overlap_end_ms <= overlap_start_ms:
            continue

        resolved_audio_path = resolve_clip_audio_path(clip)
        if resolved_audio_path is None:
            raise PreviewRenderError(
                "PREVIEW_AUDIO_NOT_FOUND",
                f"clip {clip.get('clip_id')}의 프리뷰 오디오 경로를 해석할 수 없습니다.",
            )

        clip_segment = load_clip_segment(
            resolved_audio_path,
            audio_start_ms=int(clip.get("audio_start_ms") or 0),
            audio_duration_ms=int(clip.get("audio_duration_ms") or 0),
        )
        if clip_segment.size == 0:
            continue

        clip_excerpt = _slice_timeline_overlap(
            clip_segment,
            overlap_start_ms=overlap_start_ms,
            overlap_end_ms=overlap_end_ms,
            clip_start_ms=clip_start_ms,
        )
        if clip_excerpt.size == 0:
            continue

        is_target_track = int(clip.get("track_id") or -1) == int(target_track_id)
        if is_target_track and overlap_end_ms > action_start_ms and overlap_start_ms < action_end_ms:
            overlapping_target_exists = True
            effect_start_ms = max(overlap_start_ms, action_start_ms)
            effect_end_ms = min(overlap_end_ms, action_end_ms)
            effect_start_frame = ms_to_frames(effect_start_ms - overlap_start_ms, RENDER_TARGET_SR)
            effect_end_frame = ms_to_frames(effect_end_ms - overlap_start_ms, RENDER_TARGET_SR)
            clip_excerpt = _apply_dynamic_eq_preview(
                clip_excerpt,
                sample_rate=RENDER_TARGET_SR,
                action=action,
                effect_start_frame=effect_start_frame,
                effect_end_frame=effect_end_frame,
            )

        mix_start_frame = ms_to_frames(overlap_start_ms - excerpt_start_ms, RENDER_TARGET_SR)
        mix_end_frame = min(mix_start_frame + clip_excerpt.shape[0], mix.shape[0])
        if mix_end_frame <= mix_start_frame:
            continue
        mix[mix_start_frame:mix_end_frame] += clip_excerpt[: mix_end_frame - mix_start_frame]
        rendered_clip_count += 1

    if not overlapping_target_exists:
        raise PreviewRenderError(
            "PREVIEW_TARGET_CLIP_NOT_FOUND",
            f"track {target_track_id}에서 프리뷰 액션 구간과 겹치는 대상 clip을 찾지 못했습니다.",
        )
    if rendered_clip_count == 0:
        raise PreviewRenderError(
            "PREVIEW_RENDER_EMPTY",
            "preview excerpt에 포함된 오디오 clip이 없습니다.",
        )

    peak = float(np.max(np.abs(mix))) if mix.size else 0.0
    if peak > RENDER_PEAK_LIMIT and peak > 0.0:
        mix *= RENDER_PEAK_LIMIT / peak

    output_path = _preview_output_path(job_id=job_id, preview_id=preview_id)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_path, mix, RENDER_TARGET_SR)

    duration_ms = int(round((mix.shape[0] / RENDER_TARGET_SR) * 1000))
    return PreviewRenderResult(
        object_key=str(output_path),
        duration_ms=duration_ms,
        excerpt_start_ms=excerpt_start_ms,
        excerpt_end_ms=excerpt_end_ms,
        sample_rate=RENDER_TARGET_SR,
    )


def render_preview_before_audio(
    *,
    job_id: int,
    preview_id: str,
    master_audio_path: str,
    excerpt_start_ms: int,
    excerpt_end_ms: int,
) -> PreviewBeforeRenderResult:
    if excerpt_end_ms <= excerpt_start_ms:
        raise PreviewRenderError(
            "INVALID_PREVIEW_RANGE",
            "before excerpt를 만들기 위한 구간이 비어 있습니다.",
        )

    master_path = Path(master_audio_path)
    if not master_path.exists() or not master_path.is_file():
        raise PreviewRenderError(
            "MASTER_AUDIO_NOT_FOUND",
            "before excerpt를 만들 master 오디오 파일을 찾지 못했습니다.",
        )

    waveform, sample_rate = sf.read(master_path, always_2d=True)
    if waveform.size == 0:
        raise PreviewRenderError(
            "EMPTY_MASTER_AUDIO",
            "before excerpt를 만들 master 오디오가 비어 있습니다.",
        )

    start_frame = max(ms_to_frames(excerpt_start_ms, sample_rate), 0)
    end_frame = min(ms_to_frames(excerpt_end_ms, sample_rate), waveform.shape[0])
    if end_frame <= start_frame:
        raise PreviewRenderError(
            "PREVIEW_BEFORE_RANGE_EMPTY",
            "before excerpt에 해당하는 master 프레임 구간이 비어 있습니다.",
        )

    excerpt = waveform[start_frame:end_frame].astype(np.float32, copy=True)
    output_path = _preview_before_output_path(job_id=job_id, preview_id=preview_id)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_path, excerpt, sample_rate)
    duration_ms = int(round((excerpt.shape[0] / sample_rate) * 1000))
    return PreviewBeforeRenderResult(
        object_key=str(output_path),
        duration_ms=duration_ms,
        sample_rate=sample_rate,
    )


def _require_int_field(action: dict[str, object], key: str) -> int:
    value = action.get(key)
    if value is None:
        raise PreviewRenderError(
            "MISSING_PREVIEW_ACTION_FIELD",
            f"프리뷰 렌더링에는 action 필드 '{key}'가 필요합니다.",
        )
    return int(value)


def _resolve_timeline_end_ms(
    *,
    clip_index: list[dict[str, object]],
    project_duration_ms: int | None,
) -> int:
    if project_duration_ms is not None and int(project_duration_ms) > 0:
        return int(project_duration_ms)
    if not clip_index:
        raise PreviewRenderError(
            "PREVIEW_CLIP_INDEX_EMPTY",
            "프리뷰 렌더링에는 clip_index가 필요합니다.",
        )
    return max(int(clip.get("end_ms") or 0) for clip in clip_index)


def _slice_timeline_overlap(
    clip_segment: np.ndarray,
    *,
    overlap_start_ms: int,
    overlap_end_ms: int,
    clip_start_ms: int,
) -> np.ndarray:
    local_start_frame = ms_to_frames(overlap_start_ms - clip_start_ms, RENDER_TARGET_SR)
    local_end_frame = min(
        ms_to_frames(overlap_end_ms - clip_start_ms, RENDER_TARGET_SR),
        clip_segment.shape[0],
    )
    if local_end_frame <= local_start_frame:
        return np.zeros((0, 2), dtype=np.float32)
    return clip_segment[local_start_frame:local_end_frame].astype(np.float32, copy=True)


def _apply_dynamic_eq_preview(
    segment: np.ndarray,
    *,
    sample_rate: int,
    action: dict[str, object],
    effect_start_frame: int,
    effect_end_frame: int,
) -> np.ndarray:
    if sample_rate <= 0:
        raise PreviewRenderError(
            "INVALID_PREVIEW_SAMPLE_RATE",
            "프리뷰 렌더링에는 0보다 큰 sample rate가 필요합니다.",
        )
    if effect_end_frame <= effect_start_frame:
        raise PreviewRenderError(
            "PREVIEW_EFFECT_RANGE_EMPTY",
            "문제 구간이 비어 있어 preview 효과를 적용할 수 없습니다.",
        )

    gain_delta_db = float(action.get("gainDeltaDb") or 0.0)
    band_low_hz = float(action.get("bandLowHz") or 0.0)
    band_high_hz = float(action.get("bandHighHz") or 0.0)
    if band_low_hz <= 0.0 or band_high_hz <= band_low_hz:
        raise PreviewRenderError(
            "INVALID_PREVIEW_BAND",
            "프리뷰 렌더링에는 올바른 bandLowHz/bandHighHz 구간이 필요합니다.",
        )

    rendered = segment.astype(np.float32, copy=True)
    effect_segment = rendered[effect_start_frame:effect_end_frame]
    fft = np.fft.rfft(effect_segment, axis=0)
    frequencies = np.fft.rfftfreq(effect_segment.shape[0], d=1.0 / sample_rate)
    mask = (frequencies >= band_low_hz) & (frequencies <= band_high_hz)
    if not np.any(mask):
        raise PreviewRenderError(
            "PREVIEW_BAND_OUT_OF_RANGE",
            "프리뷰 밴드 구간이 소스 스펙트럼과 겹치지 않습니다.",
        )

    gain = float(10 ** (gain_delta_db / 20.0))
    fft[mask, :] *= gain
    rendered_effect = np.fft.irfft(
        fft,
        n=effect_segment.shape[0],
        axis=0,
    ).astype(np.float32)
    rendered[effect_start_frame:effect_end_frame] = rendered_effect
    return rendered


def _expand_range_with_context(
    *,
    issue_start_ms: int,
    issue_end_ms: int,
    timeline_end_ms: int,
) -> tuple[int, int]:
    if issue_end_ms <= issue_start_ms:
        raise PreviewRenderError(
            "INVALID_PREVIEW_RANGE",
            "문제 구간이 비어 있어 앞뒤 문맥 구간을 확장할 수 없습니다.",
        )
    return (
        max(0, issue_start_ms - PREVIEW_CONTEXT_PADDING_MS),
        min(timeline_end_ms, issue_end_ms + PREVIEW_CONTEXT_PADDING_MS),
    )


def _preview_output_path(*, job_id: int, preview_id: str) -> Path:
    preview_root = Path(gettempdir()) / "studion-ai-preview" / str(job_id)
    return preview_root / f"{preview_id}.wav"


def _preview_before_output_path(*, job_id: int, preview_id: str) -> Path:
    preview_root = Path(gettempdir()) / "studion-ai-preview" / str(job_id)
    return preview_root / f"{preview_id}-before.wav"
