# Suggestion Output Schema

## 목적
이 문서는 수정 제안 생성 LLM이 따라야 하는 출력 계약을 정의한다.
이 문서는 사람이 읽기 위한 설명서가 아니라, AI가 반드시 지켜야 하는 출력 제한 문서다.

## 기본 원칙
- 출력은 항상 구조화된 JSON이어야 한다.
- 자유 서술만 반환하지 않는다.
- suggestion은 현재 시스템이 실제로 저장하고 적용할 수 있는 수준으로만 생성한다.
- 존재하지 않는 track, clip, region, suggestion id를 추측해서 만들지 않는다.
- 근거가 부족한 값은 과장하지 말고 보수적으로 제안한다.
- clipping 자동 보정 결과는 suggestion으로 다시 만들지 않는다.
- suggestion은 preview 가능한 형태여야 한다.

## 출력 단위
하나의 실행에서 반환하는 기본 단위는 아래와 같다.

- suggestion group 1개
- suggestion 2개 또는 3개
- suggestion마다 action 1개 이상

## 상위 스키마
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
상위 필드 규칙
groupTitle
사용자에게 보이는 짧은 그룹 제목이다.
문제 유형이 드러나야 한다.
너무 포괄적인 제목은 피한다.

좋은 예:

보컬 치찰음 완화
저역 대역 충돌 완화
고역 자극 완화

나쁜 예:

수정안
오디오 개선
추천 결과
groupSummary
suggestion group 전체를 짧게 설명한다.
문제 원인과 해결 방향이 함께 드러나야 한다.
1~2문장 이내로 제한한다.
suggestions
2개 또는 3개만 생성한다.
같은 내용을 수치만 조금 다르게 바꿔 늘리지 않는다.
대안 간 차이가 실제로 의미 있어야 한다.
rank
1부터 시작하는 정수다.
중복되면 안 된다.
오름차순이어야 한다.
summary
각 suggestion의 한 줄 요약이다.
사용자가 다른 대안과 차이를 바로 이해할 수 있어야 한다.
explanation
왜 이 제안을 하는지 짧게 설명한다.
action과 모순되면 안 된다.
긴 믹싱 이론 설명은 넣지 않는다.
actions
실제로 저장 가능하고 preview에 연결 가능한 액션 목록이다.
빈 배열이면 안 된다.
action 기본 스키마
```json
{
  "actionType": "GAIN_TRIM | EQ_CUT | DYNAMIC_EQ | HPF | DE_ESSER | SIDECHAIN_COMPRESS | PAN_ADJUST | FADE_ADJUST",
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
공통 action 규칙
actionType은 허용된 값만 사용한다.
targetTrackId는 가능한 한 항상 넣는다.
targetClipId는 clip 단위 수정이 꼭 필요할 때만 사용한다.
시간 구간 기반 제안이면 startMs, endMs를 함께 준다.
대역 기반 제안이면 bandLowHz, bandHighHz를 함께 준다.
gain 조정이면 gainDeltaDb를 준다.
params에는 꼭 필요한 값만 넣는다.
null 필드는 의미 없으면 생략 가능하지만, 구현이 null 허용 기준이면 일관되게 유지한다.
허용 actionType
GAIN_TRIM

트랙 전체 또는 특정 구간의 레벨을 보수적으로 조정한다.

필수:

targetTrackId
gainDeltaDb

선택:

startMs
endMs

주의:

과격한 값은 피한다.
기본적으로 작은 감쇠 또는 소폭 보정이 우선이다.
EQ_CUT

특정 대역을 고정 감쇠한다.

필수:

targetTrackId
bandLowHz
bandHighHz
gainDeltaDb

선택:

startMs
endMs
params.q

주의:

근거 없이 넓은 대역 전체를 크게 깎지 않는다.
DYNAMIC_EQ

문제가 되는 구간 또는 신호 조건에서만 대역을 제어한다.

필수:

targetTrackId
bandLowHz
bandHighHz
gainDeltaDb

선택:

startMs
endMs
params.threshold
params.ratio
params.attackMs
params.releaseMs

주의:

보컬 존재 구간, 특정 충돌 구간처럼 조건성 제안에 우선 사용한다.
HPF

저역 정리를 위해 high-pass filter를 적용한다.

필수:

targetTrackId
params.cutoffHz

선택:

startMs
endMs
params.slopeDbPerOct

주의:

저역 핵심 트랙에는 근거 없이 적용하지 않는다.
DE_ESSER

보컬 치찰음 완화를 위한 제안이다.

필수:

targetTrackId

권장:

bandLowHz
bandHighHz

선택:

params.threshold
params.ratio

주의:

보컬 근거 없이 일반 고역 문제를 전부 de-esser로 처리하지 않는다.
SIDECHAIN_COMPRESS

한 트랙이 다른 트랙에 반응해 순간적으로 눌리게 한다.

필수:

targetTrackId
params.sidechainSourceTrackId

선택:

startMs
endMs
params.attackMs
params.releaseMs
params.ratio

주의:

source track이 실제 존재해야 한다.
관계가 불분명하면 남용하지 않는다.
PAN_ADJUST

좌우 배치를 조정한다.

필수:

targetTrackId

선택:

params.panDelta
params.panValue

주의:

대역 문제를 pan으로만 해결하는 제안은 신중하게 낸다.
FADE_ADJUST

클립 또는 구간의 fade를 조정한다.

필수:

targetTrackId 또는 targetClipId

선택:

params.fadeInMs
params.fadeOutMs
startMs
endMs

주의:

대역 충돌 해결책으로는 우선순위가 낮다.
suggestion 생성 규칙
대안은 실제로 다른 전략이어야 한다.
가능한 경우 아래 우선순위로 차이를 만든다.
level 중심 대안
EQ 중심 대안
dynamic 처리 중심 대안
같은 액션을 수치만 조금 바꿔 반복하지 않는다.
clipping 자동 보정과 겹치는 제안은 만들지 않는다.
preview에서 비교 가능한 정도로 간결해야 한다.
수치 작성 원칙
과격한 수치보다 보수적 수치를 우선한다.
근거가 약하면 좁은 대역, 작은 gain 변화, 짧은 구간을 우선한다.
확신이 낮으면 explanation에 보수적 근거를 반영한다.
근거 없이 boost를 남발하지 않는다.
explanation 작성 원칙
문제 원인과 해결 방향이 연결되어야 한다.
action 목록과 모순되면 안 된다.
장황한 설명보다 action의 의도를 명확히 드러내는 것이 중요하다.

좋은 예:

보컬 존재 구간의 6~8kHz 자극을 조건부로 줄여 치찰음을 완화합니다.
저역 충돌 구간에서 베이스 트랙을 보수적으로 정리해 킥 존재감을 확보합니다.

나쁜 예:

전체적으로 더 좋은 사운드를 위해 조정합니다.
믹스 밸런스를 종합적으로 개선합니다.
금지 규칙
존재하지 않는 id 생성
허용되지 않은 actionType 사용
explanation만 있고 action이 없는 suggestion 반환
action과 explanation이 서로 모순되는 출력
clipping 자동 보정 대상을 다시 suggestion으로 생성
preview 상태나 apply 상태를 suggestion 출력에 섞기
근거 없는 과도한 부스트 또는 넓은 대역 과수정
동일한 대안을 rank만 바꿔 반복
좋은 출력의 기준
현재 시스템에 저장 가능하다.
validator가 검사 가능하다.
critic이 근거와 비교 가능하다.
preview에 바로 연결 가능하다.
사용자가 대안 차이를 이해할 수 있다.
예시 출력
```json
{
  "groupTitle": "보컬 치찰음 완화",
  "groupSummary": "보컬 트랙의 고역 자극 구간을 보수적으로 제어하는 대안들입니다.",
  "suggestions": [
    {
      "rank": 1,
      "summary": "보컬에 de-esser 적용",
      "explanation": "보컬 치찰음 구간에서 6kHz~8kHz 대역을 중심으로 자극을 줄입니다.",
      "actions": [
        {
          "actionType": "DE_ESSER",
          "targetTrackId": 12,
          "targetClipId": null,
          "startMs": 32000,
          "endMs": 41000,
          "bandLowHz": 6000,
          "bandHighHz": 8000,
          "gainDeltaDb": null,
          "params": {
            "threshold": -18,
            "ratio": 2.5
          }
        }
      ]
    },
    {
      "rank": 2,
      "summary": "보컬 고역 대역 dynamic EQ",
      "explanation": "치찰음이 두드러지는 구간에서만 6.5kHz~8.5kHz 대역을 조건부로 감쇠합니다.",
      "actions": [
        {
          "actionType": "DYNAMIC_EQ",
          "targetTrackId": 12,
          "targetClipId": null,
          "startMs": 32000,
          "endMs": 41000,
          "bandLowHz": 6500,
          "bandHighHz": 8500,
          "gainDeltaDb": -2.5,
          "params": {
            "threshold": -20,
            "ratio": 2.0
          }
        }
      ]
    }
  ]
}
```