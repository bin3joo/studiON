# Code Review Policy

## 목적
이 문서는 Codex CLI plan mode를 포함한 AI 코딩 에이전트가 AI 디렉터리의 코드를 읽고, 수정안이나 구현 계획을 만들 때 따르는 리뷰 기준을 정의한다.

이 문서는 사람 설명용 설계 문서가 아니라, AI가 저장소를 수정할 때 지켜야 하는 작업 규칙 문서다.

## 이 문서의 역할
이 문서는 아래를 제한한다.

- 변경 범위를 과도하게 넓히지 않기
- 현재 구조와 저장소 경계를 깨지 않기
- 문서와 코드의 불일치를 줄이기
- 검증 가능한 수정만 제안하기
- 미정 내용을 임의로 확정하지 않기

## 기본 원칙
- 현재 범위를 우선한다.
- 가장 작은 변경으로 문제를 해결한다.
- 기존 흐름을 이해한 뒤 수정한다.
- 구조 변경보다 국소 수정이 우선이다.
- 합의되지 않은 미래 확장을 현재 코드에 섞지 않는다.
- 코드 변경이 문서 계약에 영향을 주면 관련 docs도 같이 갱신한다.

## 현재 범위 기준
현재 AI 기능은 아래 범위를 기준으로 리뷰한다.

- DSP 기반 전체 분석
- CLAP 기반 보컬 여부 판단
- suggestion 생성
- validator / critic / offline evaluation 분리
- 사용자 선택 기반 preview 및 최종 반영

현재는 보컬 판별만 기본 범위다.
현재는 일반 악기 전체 분류를 기본 기능처럼 확장하지 않는다.

## 리뷰 전에 반드시 확인할 것
코드 수정이나 계획 제안 전에 아래를 먼저 확인한다.

1. `/AI/AGENTS.md`
2. `/AI/docs/ai-overview.md`
3. 작업과 직접 관련된 docs 파일
4. 실제 구현 코드

다음 중 하나가 바뀌는 작업이면 관련 문서를 같이 본다.

- LangGraph 흐름
- suggestion 출력 형식
- validation / critic / eval 규칙
- Redis / MySQL / MongoDB 저장 경계
- 공통코드와 연결된 상태값
- preview / interrupt 처리 방식

## 변경 범위 원칙
- 요청한 문제를 해결하는 최소 범위만 수정한다.
- 관련 없는 리팩터링을 끼워 넣지 않는다.
- 파일 이동, 대규모 이름 변경, 계층 재구성은 명시적 필요가 있을 때만 한다.
- 추상화가 현재 코드보다 복잡도를 올리면 추가하지 않는다.
- 실험용 유틸을 공용 구조로 승격시키지 않는다.

## 저장소 경계 리뷰 기준
### MySQL
아래 성격의 값만 둔다.

- 상태 요약
- 관계형 참조
- 사용자 선택 결과
- verdict / status / code 기반 값

다음을 MySQL에 직접 저장하지 않는다.

- 큰 JSON 전문
- raw LLM output 전문
- CLAP window 전체 결과
- evidence 전문
- 긴 trace 전문

### Redis
Redis는 휘발성 운영 상태용이다.

허용:
- 실행 상태
- 프로젝트 락
- 사용자 인터럽트 상태
- preview 상태
- RAG 캐시

비허용:
- 최종 정답 데이터 저장
- 영구 이력 저장
- 큰 분석 결과 전문 저장

### MongoDB
MongoDB는 큰 JSON 아티팩트 저장소다.

허용:
- snapshot 전문
- evidence 전문
- vocal artifact 전문
- suggestion artifact 전문
- runtime critic 상세
- offline eval 상세
- policy / retrieval 문서

리뷰 시에는 저장 위치가 이 경계를 어기는지 먼저 확인한다.

## LangGraph 관련 리뷰 기준
- runtime graph와 offline evaluation graph를 섞지 않는다.
- clipping 자동 보정 흐름과 suggestion 승인 흐름을 섞지 않는다.
- preview 생성과 최종 반영을 합치지 않는다.
- interrupt 시 worker를 붙잡아두지 않는다.
- 사용자 응답 대기는 suspend / resume 구조를 유지한다.
- state에는 큰 문서를 직접 넣지 않고 참조값만 둔다.

## suggestion 관련 리뷰 기준
- generator 출력은 구조화된 JSON 계약을 따라야 한다.
- validator가 먼저 형식을 검사하고 critic이 의미를 검사해야 한다.
- critic이 validator를 대체하면 안 된다.
- offline judge는 사용자 응답 경로에 직접 연결하지 않는다.
- 허용되지 않은 actionType을 새로 만들지 않는다.
- 존재하지 않는 track, clip, region id를 추정하지 않는다.

## preview 관련 리뷰 기준
- preview는 임시 결과다.
- preview 상태와 최종 반영 상태를 구분한다.
- preview 실패는 apply 실패와 같은 상태가 아니다.
- preview 파일은 TTL 또는 만료 정책을 고려한다.
- preview 생성 중 사용자 흐름이 막히지 않도록 한다.

## 인터럽트 관련 리뷰 기준
- interrupt 상태는 Redis 캐시만으로 끝나면 안 된다.
- waiting 상태의 source of truth는 MySQL에도 남아 있어야 한다.
- Redis TTL 만료를 비즈니스 종료로 해석하면 안 된다.
- 사용자 응답이 늦는 경우 expired 전이 로직이 있어야 한다.
- suggestion 자체는 영속 저장소에 먼저 저장되어야 한다.

## 공통코드 리뷰 기준
공통코드는 현재 최소 집합만 유지한다.

유지 대상:
- AI_ANALYSIS_JOB_STATUS
- AI_ANALYSIS_REGION_TYPE
- AI_ANALYSIS_SEVERITY
- AI_TIMELINE_SNAPSHOT_TYPE
- AI_SUGGESTION_ACTION_TYPE
- AI_SUGGESTION_VALIDATION_STATUS
- AI_APPLIED_SUGGESTION_STATUS
- AI_PREVIEW_STATUS
- AI_EVALUATION_VERDICT

공통코드를 새로 추가할 때는 아래를 만족해야 한다.

- 여러 테이블에서 재사용될 가능성이 있다
- UI, 운영, 통계에서 필터링 가치가 있다
- 문자열 literal보다 코드 관리가 명확하다

그 외 값은 우선 일반 컬럼이나 문서 메타데이터로 둔다.

## 금지 규칙
- web fallback 추가
- Redis를 영구 저장소처럼 사용
- MySQL에 큰 JSON 전문 추가
- 현재 범위 밖 악기 분류 기능을 기본 기능처럼 확장
- validator 없이 critic만으로 통과 처리
- preview 없이 바로 최종 반영하는 흐름으로 단순화
- runtime에서 heavy offline evaluation 실행
- 요청하지 않은 대규모 리팩터링
- 문서 계약과 어긋나는 임의 필드 추가

## 계획 작성 규칙
Codex CLI plan mode에서 계획을 제시할 때는 아래 순서를 따른다.

1. 문제 요약
2. 영향받는 파일
3. 최소 변경안
4. 저장소 경계 영향
5. 검증 방법
6. 문서 갱신 필요 여부
7. 위험 요소 또는 보류 사항

계획은 짧고 실행 가능한 단계로 쓴다.
미래 확장 아이디어는 현재 수정안과 분리한다.

## 코드 수정 후 자기 점검 체크리스트
수정 후 아래를 다시 확인한다.

- 요청 범위를 넘는 변경이 들어가지 않았는가
- docs와 코드가 충돌하지 않는가
- MySQL / Redis / MongoDB 경계를 어기지 않았는가
- interrupt / preview 흐름을 깨지 않았는가
- suggestion 출력 계약을 깨지 않았는가
- validator / critic 역할 분리가 유지되는가
- 테스트 또는 최소 검증 경로가 있는가

## 테스트와 검증 원칙
- 작은 로직 수정이라도 가능한 최소 검증을 포함한다.
- 테스트가 없으면 적어도 어떤 입력/출력을 확인해야 하는지 명시한다.
- 실패 케이스와 정상 케이스를 구분해서 본다.
- 구조 변경이면 회귀 위험을 함께 적는다.

## 문서 갱신 규칙
아래가 바뀌면 docs도 같이 수정한다.

- job 상태 이름
- suggestion 출력 필드
- validator / critic 결과 형식
- preview 상태 필드
- retrieval 정책
- 저장소별 책임

문서를 갱신하지 않을 경우, 왜 변경이 문서 영향이 없는지 설명 가능해야 한다.