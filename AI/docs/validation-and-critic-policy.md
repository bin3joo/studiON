# Validation and Critic Policy

## 목적
이 문서는 suggestion 생성 이후에 수행되는 검증 규칙을 정의한다.
이 문서는 런타임 validator, runtime critic, offline evaluation의 책임을 분리하기 위한 하네스 문서다.

## 기본 원칙
- validator, critic, offline evaluation은 서로 역할이 다르다.
- deterministic하게 검사할 수 있는 것은 validator가 맡는다.
- 의미 해석과 근거 일치성 평가는 critic이 맡는다.
- 개발용 품질 비교는 offline evaluation이 맡는다.
- 하나의 단계가 다른 단계의 책임을 대신하지 않는다.

## 전체 흐름
현재 검증은 아래 순서를 따른다.

1. suggestion 생성
2. hard validator
3. runtime critic
4. 사용자 제시
5. offline evaluation은 별도 배치 또는 개발 흐름에서 수행

## 1. Hard Validator

### 목적
hard validator는 코드 기반의 기계적 검사 단계다.
여기서는 해석이 아니라 규칙 위반 여부를 본다.

### 반드시 확인할 것
- JSON 형식이 유효한가
- 필수 필드가 모두 있는가
- 허용된 actionType만 사용했는가
- rank가 중복되지 않는가
- suggestion 개수가 허용 범위인가
- targetTrackId, targetClipId가 실제 존재하는가
- startMs, endMs 범위가 유효한가
- bandLowHz, bandHighHz 범위가 유효한가
- gainDeltaDb가 허용 범위를 벗어나지 않는가
- sidechain source track이 실제 존재하는가
- clipping 자동 보정 대상을 suggestion으로 다시 만들지 않았는가

### 결과
validator는 아래 상태 중 하나를 반환한다.

- `PASS`
- `REVISE`
- `REJECT`

### validator 원칙
- deterministic해야 한다
- 같은 입력이면 같은 결과가 나와야 한다
- 새로운 suggestion을 창작하지 않는다
- 짧고 구조화된 violation만 남긴다

## 2. Runtime Critic

### 목적
runtime critic은 suggestion이 evidence와 실제로 잘 맞는지 확인하는 단계다.
여기서는 형식보다 의미를 본다.

### 반드시 확인할 것
- suggestion이 실제 문제 유형과 맞는가
- explanation이 action과 모순되지 않는가
- 근거 대역과 제안 대역이 크게 어긋나지 않는가
- 수정 강도가 과도하지 않은가
- 대안 간 차이가 실제로 의미가 있는가
- 사용자가 이해 가능한 수준으로 설명됐는가

### critic이 하면 안 되는 것
- 새로운 evidence를 만들어내기
- validator를 우회해서 형식 오류를 통과시키기
- 직접 DB 저장용 action을 다시 작성하기
- apply 여부를 최종 결정하기

### 결과
critic은 아래 상태 중 하나를 반환한다.

- `PASS`
- `REVISE`
- `REJECT`

그리고 항상 짧은 이유를 남긴다.

### critic 원칙
- 입력으로 주어진 evidence와 suggestion만 사용한다
- reasoning을 길게 늘어놓지 않는다
- revise 사유는 재생성에 바로 쓸 수 있게 구체적으로 쓴다

## 3. Offline Evaluation

### 목적
offline evaluation은 개발용 judge 단계다.
runtime 응답 속도와 분리해서 suggestion 품질을 비교하고 개선 포인트를 찾는다.

### 사용 시점
- prompt 변경 전후 비교
- validator 규칙 변경 검증
- critic 정책 조정 검증
- 실패 케이스 회귀 확인
- 샘플 run 품질 점검

### 반드시 확인할 것
- prompt version별 품질 차이
- validator 통과율
- critic revise 비율
- 사용자 선택과 verdict의 상관
- 반복적으로 실패하는 actionType
- 특정 issueType에서의 약한 패턴

### 원칙
- offline judge는 runtime 경로에 직접 연결하지 않는다
- 개발용 품질 비교와 사용자-facing 처리 로직을 섞지 않는다
- 단일 점수보다 failure pattern 분류를 더 중요하게 본다

## Verdict 기준

### PASS
현재 suggestion을 그대로 사용할 수 있다.

### REVISE
일부 수정 후 다시 검토해야 한다.
형식은 맞지만 의미나 강도가 아쉬운 경우가 여기에 해당한다.

### REJECT
폐기 또는 재생성이 필요하다.
잘못된 대상 참조, 심각한 모순, 근거 불일치가 여기에 해당한다.

## 실패 처리 규칙
- validator가 `REJECT`면 critic으로 넘기지 않는다.
- validator가 `REVISE`면 재생성 또는 보정 후 다시 validator를 거친다.
- critic이 `REVISE`면 generator 재호출 또는 제한된 수정 루프를 허용한다.
- critic이 `REJECT`면 사용자에게 제시하지 않는다.

## 로그와 저장 원칙
- validator는 짧은 violation 코드와 요약만 남긴다.
- critic은 verdict, score, 짧은 reason만 요약 저장한다.
- 긴 raw output과 상세 artifact는 MongoDB에 둔다.
- MySQL에는 verdict와 요약 결과만 둔다.
- Redis는 검증 결과의 영구 저장소가 아니다.

## 금지 규칙
- validator 없이 critic만으로 통과 처리
- critic이 새로운 action을 임의로 추가
- offline judge를 사용자 응답 흐름에 직접 연결
- 긴 raw 평가 결과를 MySQL에 직접 저장
- 검증 실패 suggestion을 preview 대상으로 넘기기