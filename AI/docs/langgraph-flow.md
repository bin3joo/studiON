# LangGraph Flow Rules

## 목적
이 문서는 LangGraph 코드 설명서가 아니라, AI가 흐름을 수정할 때 지켜야 하는 상위 규칙만 정리한다.

## Runtime Flow
현재 runtime flow는 아래 순서를 따른다.

1. job 시작
2. project snapshot 로드
3. DSP 기반 전체 분석
4. 보컬 후보 판별
5. band overlap / clipping / sibilance 관련 결과 정리
6. clipping 자동 보정
7. retrieval 필요 시 내부 policy 문서 조회
8. suggestion 생성
9. validator 통과 여부 확인
10. critic 검토
11. suggestion 저장
12. 사용자 선택 대기
13. preview 생성
14. 사용자 확정 또는 취소
15. 최종 반영 또는 종료

## Flow Rules
- clipping 자동 보정 흐름과 suggestion 승인 흐름을 섞지 않는다.
- preview 생성 전에는 최종 반영하지 않는다.
- 사용자 선택이 필요한 단계에서는 interrupt 후 suspend/resume 방식으로 처리한다.
- worker는 사용자 응답을 기다리며 점유되지 않는다.
- web fallback branch를 만들지 않는다.
- offline evaluation은 runtime graph 내부에 넣지 않는다.

## Interrupt Rules
interrupt가 가능한 대표 지점은 아래와 같다.

- suggestion 선택 대기
- preview 확인 대기

interrupt 진입 시:
- runtime state를 저장한다.
- job 상태를 waiting 계열로 전환한다.
- worker는 반환 또는 suspend 상태로 빠진다.

## Offline Evaluation Rules
offline evaluation은 runtime 종료 후 별도 흐름으로 실행한다.

허용:
- 완료된 run trace 수집
- sample 기반 평가
- validator / critic / judge 비교
- prompt / rule 개선

비허용:
- runtime 중 heavy evaluation 실행
- 사용자 응답 경로에 offline judge 연결

## 변경 시 주의
- 새로운 노드를 추가해도 상위 흐름 분리는 유지한다.
- 자동 처리와 사용자 승인 처리의 경계를 흐리지 않는다.
- interrupt 위치를 바꾸면 관련 상태 저장 규칙도 함께 수정한다.