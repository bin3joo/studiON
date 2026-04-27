# Validation and Critic Policy

## 목적
이 문서는 workflow suggestion이 validator, runtime critic, offline evaluation에서 어떤 기준으로 검증되는지 정의한다.
핵심 목표는 구조 위반을 빠르게 차단하고, evidence와 action이 어긋난 제안을 걸러내는 것이다.

## 공통 원칙
- validator, critic, offline evaluation은 서로 다른 책임을 가진다.
- validator는 형식과 하드 규칙 위반을 본다.
- critic은 evidence와 action의 정합성을 본다.
- offline evaluation은 런타임 판단을 사후에 비교하고 회귀를 찾는다.
- 자동 보정 전용 이슈와 사용자 선택 이슈를 혼동하지 않는다.

## Hard Validator

### 검사 대상
- JSON 구조가 깨지지 않았는지
- 필수 필드가 모두 채워졌는지
- `actionType`이 허용된 값인지
- `rank`가 정수이며 중복되지 않는지
- 시간/대역 범위가 음수나 역전 상태가 아닌지
- `targetScope="TRACK"`인데 `targetTrackId`가 비어 있지 않은지
- `targetScope="MASTER"`인데 track 전용 필수값을 강제하지 않는지
- `sibilance` 자동 보정 대상을 다시 suggestion으로 생성하지 않았는지

### Verdict
- `PASS`
- `REVISE`
- `REJECT`

## Runtime Critic

### 검사 대상
- suggestion이 실제 분석 evidence와 맞는지
- explanation이 action의 의도를 올바르게 설명하는지
- clipping suggestion이 true peak 초과 구간을 대상으로 하는지
- band overlap / harshness suggestion이 대역과 구간을 일관되게 가지는지
- user-facing suggestion이 auto-fix 전용 이슈를 다시 노출하지 않는지

### Verdict
- `PASS`
- `REVISE`
- `REJECT`

## Offline Evaluation
- prompt version, validator verdict, critic verdict, 최종 issue/action 분포를 기록한다.
- 반복적으로 실패하는 패턴을 찾고 rule/template 회귀 여부를 확인한다.
- source of truth는 MySQL 상태와 Mongo artifact이며 Redis는 조회 최적화용 projection만 가진다.

## 현재 워크플로우 특화 규칙
- `clipping`은 사용자 선택 경로를 타므로 suggestion 생성이 허용된다.
- `sibilance`는 deterministic auto-fix recipe를 생성하므로 suggestion 생성이 금지된다.
- `TRUE_PEAK_LIMITER`는 `MASTER` scope를 허용한다.
