# AGENTS.md

## 목적
AI 디렉터리는 AI 서버의 실행 코드와 AI 작업용 하네스 문서를 함께 관리한다.

코드는 구현의 source of truth이고, docs는 AI가 구조를 함부로 깨지 않게 하는 guardrail이다.

## 읽는 순서
AI 관련 작업을 할 때는 아래 순서로 판단한다.

1. `/AI/docs/ai-overview.md`
2. 작업과 직접 관련된 하위 docs 파일
3. 실제 코드

리뷰 작업을 수행할 때는 `/AI/prompts/code-reviewer.md`를 먼저 참고하고, 그 기준에 따라 변경 범위, 구조 위반, 저장소 경계, 테스트/문서 누락 여부를 검토한다.
코드만 읽으면 되는 구현 상세는 docs에 다시 복사하지 않는다.
반대로 코드만 읽어서는 놓치기 쉬운 제약과 계약은 docs에 남긴다.

## Execution Plan Docs
- Active execution plan documents must be stored under `/AI/docs/exec-plans/active`.
- When a task is completed, move its execution plan document to `/AI/docs/exec-plans/complete`.
- Keep `active` limited to in-progress work only; completed plans should not remain there.
- 새로 작성하거나 갱신하는 execution plan 문서는 한글로 작성한다.
- 작업 경계, 상태 복원 이유, 검증 의도처럼 구현 오해를 막기 위한 코드 주석은 한글로 작성한다.

## 문서에 남길 것
- 저장소 경계
- 허용된 상위 흐름
- 출력 스키마
- retrieval 정책
- validation / critic / eval 규칙
- AI가 자주 실수하는 금지사항

## 문서에 깊게 남기지 않을 것
- state 전체 필드 나열
- workflow.py 코드를 그대로 옮긴 설명
- 실험용 임시 로직

## 변경 시 같이 갱신할 것
아래를 바꾸면 관련 docs도 함께 수정한다.

- LangGraph 흐름
- 상태 저장 경계
- interrupt / preview 처리
- suggestion 출력 형식
- retrieval 정책
- validation / critic / eval 규칙
- 공통코드와 연결된 상태값 이름

## 피해야 할 것
- preview 생성과 최종 반영을 한 단계로 합치기
- runtime과 offline eval을 한 워크플로우로 섞기
- 보컬 판별 외 일반 악기 분류를 현재 범위처럼 문서화하기