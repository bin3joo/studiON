# AGENTS.md

## 목적
AI 디렉터리는 AI 서버의 실행 코드와 AI 작업용 하네스 문서를 함께 관리한다.

이 디렉터리의 문서는 사람 설명용 설계 문서가 아니라, AI가 작업할 때 참고하는 제약, 출력 계약, 금지사항, 저장 경계 문서다.
코드는 구현의 source of truth이고, docs는 AI가 구조를 함부로 깨지 않게 하는 guardrail이다.

## 읽는 순서
AI 관련 작업을 할 때는 아래 순서로 판단한다.

1. 이 파일
2. `/AI/docs/ai-overview.md`
3. 작업과 직접 관련된 하위 docs 파일
4. 실제 코드

리뷰 작업을 수행할 때는 `/AI/prompts/code-reviewer.md`를 먼저 참고하고, 그 기준에 따라 변경 범위, 구조 위반, 저장소 경계, 테스트/문서 누락 여부를 검토한다.
코드만 읽으면 되는 구현 상세는 docs에 다시 복사하지 않는다.
반대로 코드만 읽어서는 놓치기 쉬운 제약과 계약은 docs에 남긴다.

## 현재 범위
현재 AI 기능은 아래 범위를 우선한다.

- DSP 기반 전체 분석
- CLAP 기반 보컬 여부 판별
- 문제 구간별 수정 제안 생성
- 사용자 선택 기반 프리뷰 및 확정
- 오프라인 평가 분리

현재는 보컬 판별만 우선하고, 일반 악기 역할 분류는 추후 확장 대상으로 둔다.
현재는 web fallback 없이 내부 정책 문서 기반 RAG-lite만 사용한다.

## 저장소 경계
- MySQL: 상태, 요약 결과, 관계형 데이터, 사용자 선택 결과
- Redis: 실행 상태, 락, 인터럽트, 프리뷰 상태 같은 휘발성 운영 정보
- MongoDB: 스냅샷, 근거, 상세 아티팩트, 평가 문서 같은 큰 JSON

Redis를 영구 저장소처럼 사용하지 않는다.
MySQL에는 큰 JSON 전문을 넣지 않는다.
MongoDB는 요약 상태 저장소가 아니라 상세 문서 저장소다.

## 현재 동작 원칙
- clipping은 자동 보정 대상이다.
- band overlap과 sibilance는 기본적으로 사용자 승인 대상이다.
- preview는 최종 반영과 분리한다.
- runtime graph와 offline evaluation graph는 분리한다.
- worker는 사용자 입력을 기다리며 붙잡혀 있지 않는다.
- interrupt가 발생하면 상태를 저장하고 suspend/resume 방식으로 처리한다.

## 모델 사용 원칙
- 보컬 판별은 CLAP 기반으로 처리한다.
- 수정 제안 생성은 구조화된 출력 계약을 따른다.
- critic과 offline judge는 suggestion generator와 역할을 분리한다.
- 모델별 세부 선택은 코드와 환경 설정을 따르되, 출력 계약과 검증 정책은 docs 기준을 우선한다.

## 문서에 남길 것
- 저장소 경계
- 허용된 상위 흐름
- 출력 스키마
- retrieval 정책
- validation / critic / eval 규칙
- AI가 자주 실수하는 금지사항

## 문서에 깊게 남기지 않을 것
- 각 노드의 내부 알고리즘 설명
- state 전체 필드 나열
- workflow.py 코드를 그대로 옮긴 설명
- 함수 수준 구현 상세
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
- web fallback 다시 추가
- Redis에 최종 정답 데이터 저장
- MySQL에 큰 JSON 전문 저장
- preview 생성과 최종 반영을 한 단계로 합치기
- runtime과 offline eval을 한 워크플로우로 섞기
- 보컬 판별 외 일반 악기 분류를 현재 범위처럼 문서화하기

## Execution Plan Docs
- Active execution plan documents must be stored under `/AI/docs/exec-plans/active`.
- When a task is completed, move its execution plan document to `/AI/docs/exec-plans/complete`.
- Keep `active` limited to in-progress work only; completed plans should not remain there.
- 새로 작성하거나 갱신하는 execution plan 문서는 한글로 작성한다.
- 작업 경계, 상태 복원 이유, 검증 의도처럼 구현 오해를 막기 위한 코드 주석은 한글로 작성한다.
