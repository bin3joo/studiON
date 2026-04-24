# 2026-04-23 load_entry_context Dramatiq 부트스트랩

## 요약
- `load_entry_context`를 workflow 실행용 worker bootstrap 노드로 구현한다.
- Dramatiq enqueue는 LangGraph 바깥에 두고, worker 진입 시 durable workflow context를 복원한다.
- 실행 계획 문서는 먼저 `active`에 기록하고, 사용자가 작업 완료를 확인한 뒤에만 `complete`로 이동한다.

## 범위
- 최초 실행과 모든 재개 경로를 위한 workflow dispatch 계약
- durable workflow job 저장 구조
- `load_entry_context`의 복원 및 검증 동작
- API enqueue 엔드포인트, worker actor 연동, 테스트

## 구현 내용
### 큐 / 워커 경계
- 운영 경로에서는 API가 그래프를 직접 실행하지 않고 enqueue만 수행하도록 workflow dispatch orchestration을 추가했다.
- compact dispatch payload를 소비하고 worker 쪽 graph invocation으로 넘기는 Dramatiq actor 진입점을 추가했다.
- broker 관련 로직은 LangGraph 노드 밖에 유지했다.

### Durable Context 복원
- worker 진입과 직접 테스트/디버그 실행을 구분하기 위해 workflow state에 `dispatch_type`을 추가했다.
- `load_entry_context`에 worker bootstrap 로직을 구현했다.
  - 저장된 job snapshot 조회
  - project 및 phase/dispatch 호환성 검증
  - resume 입력 병합
  - stale 또는 잘못된 resume 메시지 조기 실패 처리
- entry 단계 복원 실패는 바로 `fail_workflow`로 보내도록 라우팅을 보강했다.

### 저장 / API 표면
- durable workflow job store 추상화와 현재 저장소용 in-memory adapter를 추가했다.
- 운영 엔드포인트를 추가했다.
  - `POST /api/v1/workflow/jobs/start`
  - `POST /api/v1/workflow/jobs/resume`
- durable job 레코드를 위해 `AI/init.sql`에 `ai_analysis_job` DDL을 추가했다.

### 주석
- 아래 경계 지점에 의도를 설명하는 짧은 한글 주석을 추가했다.
  - queue/broker 경계
  - `load_entry_context`의 durable 상태 재구성
  - phase + dispatch 검증
  - API enqueue 전용 책임 분리

## 검증
- `python -m ruff check app tests`
- `python -m pytest tests`
- 구현 시점 기준 통과

## 완료 조건
- 코드가 유지되고 검증 결과가 유효할 것
- 사용자가 작업 완료를 확인할 것
- 완료 확인 후 이 문서를 `AI/docs/exec-plans/active`에서 `AI/docs/exec-plans/complete`로 이동할 것
