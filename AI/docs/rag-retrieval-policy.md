# RAG Retrieval Policy

## 목적
이 문서는 AI suggestion 생성 시 retrieval을 어떻게 사용할지 제한한다.

## 기본 원칙
- retrieval은 선택 사항이다.
- retrieval은 분석 자체가 아니라 suggestion generation 보조 용도다.
- 현재는 내부 curated policy 문서만 사용한다.
- web fallback은 사용하지 않는다.

## 언제 retrieval을 사용하는가
아래 조건 중 하나에 해당하면 retrieval을 고려한다.

- band overlap 해결책이 여러 방식으로 갈릴 수 있을 때
- sibilance 대응 방식 선택이 필요할 때
- severity에 따라 보수적 제안이 필요한 때
- 동일 문제 유형에 대한 내부 정책 참조가 필요한 때

## 언제 retrieval을 생략하는가
- clipping 자동 보정
- 단순 gain trim 제안
- 명백한 rule-based 제안
- retrieval 없이도 deterministic하게 처리 가능한 경우

## retrieval 입력
retrieval query는 자유 텍스트보다 구조화된 조건을 우선한다.

예:
- issueType
- band range
- vocal flag
- severity
- project / track context
- prompt version

## retrieval 출력
retrieval 결과는 짧고 재사용 가능한 문서 id 집합이어야 한다.

권장:
- topK는 작게 유지
- 중복 문서 제거
- 사용한 문서 id와 score를 추적 가능하게 남김

## cache 원칙
동일 조건의 retrieval은 Redis cache 사용 가능하다.
cache key는 query 조건과 prompt / policy version을 반영해야 한다.

## 금지 규칙
- 외부 웹 검색 사용
- retrieval 결과를 근거 없이 과장
- policy 문서가 없는데 있는 것처럼 생성
- retrieval 결과를 state에 전문으로 넣기