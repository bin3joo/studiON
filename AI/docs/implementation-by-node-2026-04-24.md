# AI 노드별 구현 현황

## 목적
- workflow graph 각 노드가 지금 무엇까지 실제 구현됐는지 빠르게 확인하기 위한 문서다.
- 이번 개편 이후 핵심 경계는 `분석/운영은 실제 구현`, `plan loop는 규칙 기반 구현`, `preview/apply/commit은 목업`으로 본다.

## 분류 기준
- `실제 구현`
  - 실제 snapshot, 실제 DSP/STFT, 실제 state 복원, 실제 polling/projection 경계를 사용한다.
- `규칙 기반 구현`
  - workflow는 실제로 동작하지만 planner/critic 내부는 deterministic rule/template 중심이다.
- `목업`
  - graph 위치와 상태 전이는 있으나 실제 오디오 편집 엔진은 아직 연결되지 않았다.

## 노드별 정리

### 실제 구현
- `load_entry_context`
  - worker dispatch와 durable state를 복원하고 phase 기반 resume 검증을 수행한다.
- `init_state`
  - runtime/durable status를 시작 상태로 올린다.
- `load_project_snapshot`
  - persisted snapshot에서 BPM, bar mapping, clip index를 복원한다.
- `sample_track_clips`
  - track별 대표 clip id를 샘플링한다.
- `cheap_dsp_scan`
  - 프로젝트 전체 timeline을 복원해 full STFT를 수행하고 frame 요약 artifact를 저장한다.
- `detect_band_overlap`
  - STFT frame summary에서 대역 충돌 region을 생성한다.
- `detect_clipping`
  - mix frame summary에서 clipping region을 생성한다.
- `detect_high_band_harshness`
  - high-band harshness region을 생성한다.
- `detect_sibilance`
  - sibilance region을 생성한다.
- `merge_analysis`
- `candidate_ranking`
  - 사용자 입력이 필요한 region만 ranking한다.
- `wait_user_plan_input`
  - 선택 region, preserve clip, 사용자 요구 입력을 기다린다.
- `resume_after_plan_input`
  - plan input 필수값을 검증하고 plan loop로 복귀시킨다.
- `auto_fix_sibilance`
  - sibilance-only 경로를 deterministic de-esser recipe auto-fix로 정리한다.
- `log_sibilance_fix`
  - sibilance auto-fix 로그 id를 남긴다.
- `persist_analysis_result`
  - preview 필요 여부와 user action 필요 여부를 projection 관점으로 정리한다.
- `user_action_gate`
  - selection wait 또는 finalize 경로를 결정한다.
- `wait_user_selection`
  - preview할 action 선택을 기다린다.
- `wait_user_confirm`
  - confirm/retry/cancel 입력을 기다린다.
- `emit_feedback_event`
  - 최종 feedback event id를 생성한다.
- `finalize_output`
  - workflow를 completed로 종료한다.
- `fail_workflow`
  - failure code/message를 남기고 failed로 종료한다.

### 규칙 기반 구현
- `build_rule_candidates`
  - 선택 region과 preserve clip을 기준으로 실행 가능한 규칙 후보를 만든다.
- `planning_agent`
  - rule candidates와 사용자 feedback을 바탕으로 단일 plan payload를 만든다.
  - 이름은 agent지만 현재 내부 구현은 규칙 기반이다.
- `plan_rule_validator`
  - plan 구조 위반을 검사하고 pass/revise/reject를 반환한다.
- `plan_critic`
  - plan에 대한 의미적 reviewer 역할을 하지만 현재는 규칙 기반 결과를 반환한다.
- `approve_plan`
  - 승인된 plan 상태를 확정한다.
- `materialize_execution_plan`
  - 승인된 plan을 suggestion/action payload로 변환한다.
- `apply_selected_edit_recipe`
  - 선택 action 검증과 apply result id 발급은 실제지만, 실제 편집 엔진 적용은 아니다.

### 목업
- `render_preview`
  - preview id와 상태 전이는 실제지만, 실제 오디오 preview render 엔진은 아직 없다.
- `commit_selected_edit_recipe`
  - commit phase 전이는 있지만 실제 DAW/오디오 엔진 반영은 아직 없다.

## 요약
- 분석과 workflow 운영은 실제 구현이다.
- 제안/검증 구간은 이제 `rule candidates -> planning agent -> validator -> critic -> approve -> materialize`의 plan loop 구조를 갖는다.
- 다만 planner/critic 내부는 아직 규칙 기반이다.
- preview, 실제 편집 적용, commit은 여전히 목업 경계다.
