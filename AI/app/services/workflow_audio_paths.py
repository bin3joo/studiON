from __future__ import annotations

from pathlib import Path

from app.core.config import get_settings


def resolve_clip_audio_path(clip: dict[str, object]) -> str | None:
    direct_path = clip.get("audio_path")
    if isinstance(direct_path, str) and direct_path.strip():
        candidate = Path(direct_path)
        if candidate.exists():
            return str(candidate)

    object_key = clip.get("object_key")
    if not isinstance(object_key, str) or not object_key.strip():
        return None

    object_key_path = Path(object_key)
    if object_key_path.exists():
        return str(object_key_path)

    audio_root = get_settings().audio_root
    if audio_root:
        rooted_path = Path(audio_root) / object_key
        if rooted_path.exists():
            return str(rooted_path)
    return None
