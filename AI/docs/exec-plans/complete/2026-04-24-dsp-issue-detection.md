# DSP 문제 구간 탐지 구현

## 요약
- LangGraph의 DSP 탐지 스텁을 compact scan summary 기반의 결정론적 탐지 로직으로 교체했다.
- `band_overlap`, `clipping`, `sibilance`, `high_band_harshness`가 각각 시간 구간, 트랙 메타데이터, severity, evidence 참조를 가진 analysis region으로 생성된다.
- `clipping`은 자동 보정 전용으로 유지하고, 사용자 승인 대상은 `band_overlap`, `sibilance`, `high_band_harshness`만 suggestion/preview로 연결했다.

## 구현 의도
- state에는 raw waveform/STFT를 넣지 않고, 40ms hop / 120ms frame 스캔 결과를 압축한 DSP 요약만 둔다.
- MySQL projection에는 region 요약만 노출하고, 상세 근거는 Mongo artifact id로만 이어지게 유지한다.
- main track 선택 이후 overlap 보정은 선택된 메인 트랙을 남기고 반대편 트랙을 우선 정리하는 방향으로 action target을 정한다.

## 검증
- `tests/test_workflow.py`를 통과하도록 탐지, 랭킹, suggestion, clipping autofix 경로를 보정했다.
- projection 테스트에서 analysis region의 `issue_type`, track 메타데이터, band 범위가 응답에 포함되는지 확인했다.
- worker/API dispatch 테스트는 현재 로컬 MySQL 접속 환경이 필요해 별도 실행 확인이 남아 있다.
