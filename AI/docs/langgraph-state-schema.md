# LangGraph State Rules

## Actual DSP State Note
- `clip_index` may include `audio_metadata_id`, `object_key`, `audio_path`, `audio_start_ms`, and `audio_duration_ms`.
- These fields exist only to resolve waveform input for `cheap_dsp_scan`.
- Raw audio, waveform arrays, STFT, or other large DSP intermediates must still stay out of runtime state.
- Runtime state keeps only compact DSP summary fields such as frame size, hop size, track stats, and `clip_feature_artifact_id`.
- Runtime state keeps only compact CLAP summary fields such as `inferred_roles`, `track_role_scores`, `track_role_confidences`, and `clap_artifact_id`.
- Full frame summaries produced by full STFT live behind MongoDB artifact documents, not in MySQL state snapshots.
- Plan loop state keeps only `selected_region_id`, `preserve_clip_id`, `user_feedback_message`, `rule_candidate_payload`, `plan_payload`, and plan verdict fields. Raw LLM transcripts or large planning artifacts are not required in runtime state.

## 목적
state는 orchestration을 위한 최소 정보만 담는다.
큰 결과물이나 원문 payload는 state가 아니라 외부 저장소 참조로 관리한다.

## Runtime State에 남길 것
- job id, project id
- phase, current node
- resume pointer
- track id, region id
- timeline snapshot id
- clip index, 고정 BPM/박자, bar mapping처럼 projection 계산에 필요한 파생 메타데이터
- compact DSP scan summary
- issue type 목록
- suggestion group id, preview id
- interrupt 요청 여부
- revise count
- Redis runtime status key
- MySQL job status id
- Mongo artifact id 목록

## Runtime State에 남기지 않을 것
- raw audio binary
- waveform/STFT/mel 전체 데이터
- CLAP raw window 전체 결과
- external CLAP raw response payload
- LLM raw output 전문
- preview 본문 전체
- 큰 evidence JSON

## Apply State에 남길 것
- job id, project id
- preview id, suggestion group id
- selected action id 목록
- apply phase, current node
- apply result id
- failure code

## 상태 저장 경계
- Redis
  - live runtime status
  - current node / phase / progress
  - heartbeat
  - interrupt flag
  - lock
  - resume pointer
- MySQL
  - durable lifecycle status
  - preview / suggestion / apply 참조
  - failure summary
  - 사용자 조회와 복구 기준 상태
- MongoDB
  - snapshot
  - DSP / CLAP evidence
  - validator / critic raw artifact
  - preview detail document

## 상태 규칙
- Redis 값만으로 최종 상태를 판단하지 않는다.
- MySQL이 durable source of truth다.
- Redis 유실 시 MySQL 기준으로 복구 가능해야 한다.
- state에는 저장소 원문을 넣지 않고 저장소 id만 둔다.
- DSP 탐지 state는 raw waveform/STFT 대신 압축된 window 요약만 유지한다.
- analysis region은 issue type, 시간 구간, severity, target track 메타데이터, evidence doc id만 요약 상태로 유지한다.
- analysis region에는 프론트 잠금 계산용 `measure_start`, `measure_end`, `affected_clip_ids`를 함께 둘 수 있다.
