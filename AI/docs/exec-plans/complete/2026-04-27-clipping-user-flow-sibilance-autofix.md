# 클리핑 사용자 선택 경로 전환 및 치찰음 자동 보정 계획

## 작업 목표
- `clipping`을 사용자 선택과 preview가 가능한 이슈로 전환한다.
- `sibilance`를 deterministic auto-fix recipe 생성 이슈로 전환한다.
- 실제 오디오 렌더나 파일 교체 없이 recipe/log artifact까지만 저장한다.

## 구현 범위
- `analysis_regions[*].requires_user_action` 규칙 변경
- candidate ranking 이후 라우팅 변경
- `auto_fix_clipping` 역할을 `auto_fix_sibilance`로 전환
- clipping suggestion action에 `TRUE_PEAK_LIMITER` 추가
- state, projection, 테스트, 정책 문서 갱신

## 검증 계획
- clipping-only 워크플로우가 `wait_user_plan_input`으로 멈추는지 확인
- sibilance-only 워크플로우가 preview 없이 완료되는지 확인
- clipping suggestion이 `MASTER` scope의 `TRUE_PEAK_LIMITER` action을 만드는지 확인
