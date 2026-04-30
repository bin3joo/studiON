# AI 노드별 구현 현황

## 목적
- workflow graph의 각 노드가 현재 무엇을 담당하는지 빠르게 확인하기 위한 문서다.
- 코드 전체를 복제하지 않고, 저장소 경계와 책임 분리를 중심으로 현재 구조를 요약한다.

## 분류 기준
- `실제 구현`
  - 현재 workflow에서 실제로 실행되며 외부 저장소, DSP, CLAP, LLM 호출과 연결된 노드
- `규칙 기반 검증`
  - 실행 계획을 직접 만들지는 않고 구조와 안전 규칙을 검사하는 노드
- `목업`
  - 그래프에는 연결돼 있지만 실제 엔진/렌더러 반영은 아직 없는 구간

## 노드 정리

### 실제 구현
- `load_entry_context`
  - worker dispatch와 resume 진입 상태를 복원한다.
- `init_state`
  - runtime/durable status를 실행 중 상태로 전환한다.
- `load_project_snapshot`
  - snapshot에서 BPM, bar mapping, clip index를 복원한다.
- `sample_track_clips`
  - track별 대표 clip을 고르고 CLAP 입력용 원본 경로를 정리한다.
- `cheap_dsp_scan`
  - 전체 timeline을 복원해 full STFT 기반 summary artifact를 만든다.
- `detect_band_overlap`
  - 저중역 충돌 region을 생성한다.
- `detect_clipping`
  - true peak 기반 clipping region을 생성한다.
- `detect_high_band_harshness`
  - high-band harshness region을 생성한다.
- `select_role_candidates`
  - sibilance role inference가 필요한 track 후보를 고른다.
- `infer_track_roles`
  - 외부 CLAP inference service를 호출해 vocal-like/supporting role을 판정한다.
- `detect_sibilance`
  - CLAP 결과를 기준으로 vocal-like track만 sibilance region을 생성한다.
- `merge_analysis`
  - region 중복 제거, 정렬, final issue 목록 갱신을 수행한다.
- `candidate_ranking`
  - 사용자 입력이 필요한 region만 ranking한다.
- `wait_user_plan_input`
  - 선택 region, preserve clip, 사용자 feedback 입력을 기다린다.
- `resume_after_plan_input`
  - 계획 생성 전에 사용자 입력 필수값을 검증하고 note를 남긴다.
- `planning_agent`
  - 선택 region, preserve clip, 사용자 feedback을 바탕으로 실행 가능한 단일 `plan_payload`를 직접 생성한다.
  - GMS OpenAI 호환 Chat Completions `gpt-5.2`를 호출한다.
  - planner 실패는 deterministic fallback 없이 workflow failure로 올린다.
- `plan_critic`
  - Anthropic 호환 GMS endpoint의 `claude-sonnet-4-5-20250929`를 호출해 semantic critic을 수행한다.
- `approve_plan`
  - 승인된 plan 상태를 확정한다.
- `materialize_execution_plan`
  - 승인된 `plan_payload`를 `suggestion_payload`로 변환한다.
- `auto_fix_sibilance`
  - sibilance-only 경로를 deterministic de-esser recipe auto-fix로 처리한다.
- `log_sibilance_fix`
  - sibilance auto-fix log artifact를 기록한다.
- `persist_analysis_result`
  - preview 필요 여부와 user action 필요 여부를 projection 관점으로 정리한다.
- `user_action_gate`
  - selection wait와 finalize 경로를 분기한다.
- `wait_user_selection`
  - preview 대상 action 선택을 기다린다.
- `wait_user_confirm`
  - confirm/retry/cancel 입력을 기다린다.
- `emit_feedback_event`
  - 최종 feedback event id를 생성한다.
- `finalize_output`
  - workflow를 completed로 종료한다.
- `fail_workflow`
  - failure code/message를 기록하고 failed로 종료한다.

### 규칙 기반 검증
- `plan_rule_validator`
  - planner가 만든 `plan_payload`의 구조와 action safety rule을 검사한다.
  - issue별 허용 actionType, scope 규칙, 시간/대역/gain sanity check, preserve target 충돌을 검증한다.
  - 결과는 `PASS`, `REVISE`, `REJECT` 중 하나다.

### 목업
- `render_preview`
  - preview id와 상태는 만들지만 실제 오디오 preview renderer는 아직 없다.
- `commit_selected_edit_recipe`
  - commit phase는 존재하지만 실제 DAW/오디오 엔진 반영은 아직 없다.
- `apply_selected_edit_recipe`
  - action selection 검증과 apply result id는 만들지만 실제 오디오 적용 엔진은 아직 없다.

## 요약
- 분석과 orchestration은 실제 구현 상태다.
- plan loop는 이제 `planning agent -> validator -> critic -> approve -> materialize` 구조다.
- planner는 LLM 기반 실행 계획 생성기, validator는 규칙 기반 안전성 게이트, critic은 별도 LLM 기반 의미 검토 노드다.
- preview/apply/commit은 여전히 목업 경계가 남아 있다.
