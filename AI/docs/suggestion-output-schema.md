# Suggestion Output Schema

## 목적
이 문서는 워크플로우가 사용자에게 노출하는 `suggestion_payload`의 최소 계약을 정의한다.
분석 결과를 바로 노출하지 않고, 실제로 선택하거나 미리듣기할 수 있는 편집 액션만 이 스키마로 전달한다.

## 핵심 규칙
- suggestion payload는 항상 직렬화 가능한 JSON이어야 한다.
- suggestion은 preview 또는 이후 apply 단계에서 그대로 참조할 수 있어야 한다.
- 각 action은 track, clip, 구간, 대역, 파라미터를 명시적으로 가져야 한다.
- 자동 보정만 수행하는 `sibilance`는 suggestion으로 다시 만들지 않는다.
- 사용자 선택 대상인 `band_overlap`, `clipping`, `high_band_harshness`만 suggestion/action으로 materialize한다.
- clipping suggestion은 마스터 기준 액션을 허용하므로 `targetTrackId`가 `null`일 수 있다.

## 상위 구조
```json
{
  "groupTitle": "string",
  "groupSummary": "string",
  "suggestions": [
    {
      "rank": 1,
      "summary": "string",
      "explanation": "string",
      "actions": []
    }
  ]
}
```

## 필드 의미
- `groupTitle`
  사용자가 어떤 문제를 다루는지 바로 이해할 수 있는 제목이다.
- `groupSummary`
  선택된 문제 구간과 해결 방향을 한두 문장으로 요약한다.
- `suggestions`
  현재 MVP에서는 보통 1개지만, 형식상 복수 suggestion을 허용한다.
- `summary`
  각 suggestion의 대표 한 줄 요약이다.
- `explanation`
  왜 이 액션을 제안하는지 설명한다.
- `actions`
  preview/apply가 실제로 소비하는 실행 단위다.

## Action Schema
```json
{
  "actionType": "GAIN_TRIM | EQ_CUT | DYNAMIC_EQ | HPF | DE_ESSER | SIDECHAIN_COMPRESS | PAN_ADJUST | FADE_ADJUST | TRUE_PEAK_LIMITER",
  "targetScope": "TRACK | MASTER",
  "targetTrackId": 0,
  "targetClipId": null,
  "startMs": null,
  "endMs": null,
  "bandLowHz": null,
  "bandHighHz": null,
  "gainDeltaDb": null,
  "params": {}
}
```

## Action 공통 규칙
- `actionType`은 허용된 편집 타입 중 하나여야 한다.
- `targetScope`
  - `TRACK`: 특정 트랙 또는 클립에 적용하는 액션
  - `MASTER`: 믹스 전체에 적용하는 액션
- `targetTrackId`
  - `TRACK` 액션에서는 필수다.
  - `MASTER` 액션에서는 `null`일 수 있다.
- `targetClipId`는 clip 단위 액션일 때만 사용한다.
- 시간 기반 보정은 `startMs`, `endMs`를 함께 가진다.
- 주파수 기반 보정은 `bandLowHz`, `bandHighHz`를 함께 가진다.
- `gainDeltaDb`는 명시적인 gain 변화를 나타낼 때 사용한다.
- 세부 파라미터는 `params`에 둔다.

## 대표 액션 타입
- `DYNAMIC_EQ`
  대역 중복, 고역 harshness 같은 구간형 보정에 사용한다.
- `DE_ESSER`
  치찰음 자동 보정 recipe에서 사용한다.
- `TRUE_PEAK_LIMITER`
  clipping 구간 suggestion에서 사용한다.
  - 기본적으로 `targetScope="MASTER"`를 사용한다.
  - `params.preGainDb`, `params.ceilingDbfs`, `params.attackMs`, `params.releaseMs`, `params.lookaheadMs`를 포함한다.

## 워크플로우 계약
- `clipping` suggestion은 preview와 confirm 단계를 탄다.
- `sibilance`는 deterministic auto-fix recipe와 로그 artifact만 남기고 suggestion/preview를 만들지 않는다.
- preview와 apply는 같은 suggestion payload를 참조해야 한다.
