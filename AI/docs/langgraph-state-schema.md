# LangGraph State Rules

## Actual DSP State Note
- `clip_index` may include `audio_metadata_id`, `object_key`, `audio_path`, `audio_start_ms`, and `audio_duration_ms`.
- These fields exist only to resolve waveform input for `cheap_dsp_scan`.
- Raw audio, waveform arrays, STFT, or other large DSP intermediates must stay out of runtime state.
- Full frame summaries produced by full STFT live behind MongoDB artifact documents, not in MySQL state snapshots.
- Plan loop state keeps only `selected_region_id`, `preserve_clip_id`, `user_feedback_message`, `plan_payload`, and plan verdict fields.
- Raw planner/critic transcripts are not stored in runtime state.

## 목적
- state는 orchestration에 필요한 최소 정보만 담는다.
- 큰 결과물이나 원문 payload는 state 대신 저장소 참조로 관리한다.

## Runtime State에만 둘 것
- job id, project id
- phase, current node, progress
- selected region id, preserve clip id
- timeline snapshot id
- clip index, BPM, numerator/denominator, bar mapping
- compact DSP summary
- issue type 목록과 final analysis region 목록
- plan payload, validator/critic verdict, revise count, revision notes
- suggestion group id, preview id, selected action ids
- Redis runtime status용 최소 상태
- MySQL durable lifecycle 상태
- Mongo artifact id 목록

## Runtime State에 두지 않을 것
- raw audio binary
- waveform/STFT/mel 전체 데이터
- CLAP raw window 결과 전체
- external CLAP raw response payload
- planner/critic raw transcript 원문
- preview 본문 전체
- 큰 evidence JSON 본문

## Apply State에만 둘 것
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
  - critic artifact
  - preview detail document

## 상태 규칙
- Redis 값만으로 최종 상태를 판단하지 않는다.
- MySQL이 durable source of truth다.
- state에는 저장소 원문 대신 저장소 id만 둔다.
- analysis region에는 issue type, 시간 구간, severity, target track metadata, evidence doc id만 유지한다.
- analysis region에는 `measure_start`, `measure_end`, `affected_clip_ids`를 함께 유지한다.
