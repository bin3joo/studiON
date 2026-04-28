# AI 구현 체크포인트

## 전체 상태
- [x] 단일 workflow graph가 `load_entry_context`부터 `finalize_output`까지 전 구간 연결되어 있다.
- [x] `POST /api/v1/workflow/jobs/start`가 전체 `project_snapshot`을 받는다.
- [x] `GET /api/v1/workflow/jobs/{job_id}`가 job 상태와 projections를 함께 반환한다.
- [x] `AnalysisRegionProjection`이 `measure_start`, `measure_end`, `affected_clip_ids`를 포함한다.

## Snapshot 저장/복원
- [x] `start_workflow_job()`가 worker dispatch 전에 snapshot을 먼저 저장한다.
- [x] snapshot 본문은 Mongo snapshot store에 저장하고, MySQL job state에는 `timeline_snapshot_id`와 최소 state만 남긴다.
- [x] `load_project_snapshot()`가 저장된 snapshot을 다시 읽어 `track_ids`, `bpm`, `numerator`, `denominator`, `bar_mapping`, `clip_index`를 복원한다.

## Full STFT 기반 DSP
- [x] `cheap_dsp_scan()`이 프로젝트 전체 timeline을 기준으로 track별 full-length signal을 복원한다.
- [x] 각 track signal에 대해 full STFT를 수행한다.
- [x] STFT 전체 행렬은 runtime state나 MySQL에 저장하지 않는다.
- [x] frame 단위 요약값만 artifact payload로 저장한다.
- [x] runtime state에는 compact summary와 `clip_feature_artifact_id`만 남긴다.

## 오디오 소스 해석
- [x] clip snapshot이 `audio_metadata_id`, `object_key`, `audio_path`, `audio_start_ms`, `audio_duration_ms`를 가질 수 있다.
- [x] `clip.audio_metadata_id -> audio_metadata.objectKey` 경로를 지원한다.
- [x] `audio_path` 직접 경로를 우선 사용한다.
- [x] direct `objectKey` 경로를 지원한다.
- [x] `audio_root/objectKey` 경로를 지원한다.
- [x] clip 하나라도 오디오 소스를 못 찾으면 workflow를 실패시킨다.
- [x] mock DSP fallback은 제거됐다.

## Detection 파이프라인
- [x] `detect_band_overlap`가 frame 요약 artifact를 읽어 region을 만든다.
- [x] `detect_clipping`가 mix frame 요약을 읽고 oversampled `true_peak_dbfs`를 주판정으로 사용해 region을 만든다.
- [x] `detect_high_band_harshness`가 high-band frame 요약을 읽어 region을 만든다.
- [x] `detect_sibilance`가 vocal-like track frame 요약을 읽어 region을 만든다.
- [x] detect 결과는 연속 frame 병합 후 region으로 materialize된다.
- [x] region 후처리에서 `measure_start`, `measure_end`, `affected_clip_ids`가 계산된다.

## Artifact 저장 경계
- [x] full STFT frame summary를 위한 별도 artifact store가 추가됐다.
- [x] artifact store는 Mongo 사용 가능 시 Mongo collection을 사용한다.
- [x] Mongo 미설정 환경에서는 in-memory artifact store로 테스트 가능하다.
- [x] large JSON artifact를 MySQL state snapshot에 직접 저장하지 않는다.

## Suggestion/Preview 흐름
- [x] `band_overlap`와 `clipping`이 있으면 main track 선택 대기로 진입한다.
- [x] retrieval context는 `band_overlap -> sibilance` 순서로 정렬된다.
- [x] clipping만 있는 경우 사용자 plan 입력 대기로 진입하고 preview/confirm 경로를 탄다.
- [x] sibilance만 있는 경우 preview 없이 auto-fix recipe/log를 남기고 완료된다.
- [x] selection/confirm resume 흐름이 기존과 같은 phase 계약을 유지한다.

## 자동 검증
- [x] `tests/test_workflow.py`가 full STFT 경로 기준으로 통과한다.
- [x] `tests/test_workflow_dispatch.py`가 start/resume/polling 회귀를 통과한다.
- [x] 실제 임시 WAV를 생성하는 테스트로 full STFT 경로를 검증한다.
- [x] 오디오 소스 누락 시 `AUDIO_SOURCE_MISSING` 실패를 검증한다.
- [x] `ruff check app tests scripts`가 통과한다.

## 수동 검증
- [ ] 실제 프로젝트 WAV를 넣고 수동으로 full STFT 결과를 확인한다.
- [ ] 긴 프로젝트(예: 5분 이상)에서 후반 구간 충돌 검출을 수동 확인한다.
- [ ] 실제 운영용 오디오 파일 경로와 `audio_metadata.objectKey` 해석을 운영 DB 기준으로 확인한다.

## 아직 남은 항목
- [ ] CLAP를 실제 외부 추론기와 연결한다.
- [ ] preview/apply를 실제 오디오 엔진과 연결한다.
- [ ] full STFT 성능 측정을 실제 프로젝트 길이 기준으로 남긴다.
