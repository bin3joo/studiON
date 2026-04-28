# True Peak 중심 클리핑 탐지 정리

## 목표
- `cheap_dsp_scan`이 계산한 `true_peak_dbfs`를 clipping 탐지의 주판정으로 사용한다.
- `peak_dbfs`, `clip_ratio`는 보조 신호로만 남기고 단독 region 생성 조건에서는 제외한다.
- 기본 `issue_types`에 `clipping`을 포함해 별도 지정 없이도 clipping 탐지가 켜지도록 맞춘다.

## 구현 메모
- `detect_clipping`은 `true_peak_dbfs > 0.0`에서만 후보를 생성한다.
- 점수 계산은 `true_peak_dbfs` 초과량을 중심으로 하고 `peak_dbfs`, `clip_ratio`는 가중치 보정에만 사용한다.
- API payload 기본값, orchestration 기본값, workflow 초기 state 기본값을 함께 수정한다.
- 관련 테스트는 `true_peak` 단독 검출, near-ceiling 미검출, 기본 issue type 확장을 함께 검증한다.

## 검증
- `tests/test_workflow.py`
- `tests/test_workflow_dispatch.py`
