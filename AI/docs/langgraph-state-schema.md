# LangGraph State Rules

## 목적
이 문서는 전체 state 필드 목록이 아니라, state에 넣어도 되는 값과 넣으면 안 되는 값을 제한하기 위한 문서다.

## State에 넣어도 되는 값
- jobId
- projectId
- current phase 또는 current node의 요약값
- region id 목록
- track id 목록
- suggestion group id
- preview id 또는 preview 참조값
- interrupt 관련 최소 정보
- 에러 코드와 짧은 요약 메시지
- Mongo / MySQL / Redis 참조 id

## State에 넣지 말아야 하는 값
- raw audio binary
- 긴 waveform 배열
- STFT / mel 전체 행렬
- CLAP raw window 전체 결과
- LLM raw output 전문
- 큰 evidence JSON 전문
- preview 파일 본문
- 긴 trace 전문

큰 데이터는 state에 직접 넣지 않고 외부 저장소 참조값만 넣는다.

## 저장 경계
- state는 workflow 중간 전달용이다.
- 최종 요약 상태는 MySQL로 간다.
- 휘발성 운영 상태는 Redis로 간다.
- 큰 JSON 전문은 MongoDB로 간다.

## Resume 최소 정보
interrupt 이후 resume에 필요한 최소 정보는 아래를 만족해야 한다.

- job 식별자
- 현재 phase 또는 resume 지점
- 사용자가 응답해야 하는 대상 id
- 관련 suggestion group 또는 preview 참조
- 마지막 유효 상태 버전

## 명명 원칙
- 필드명은 짧고 일관되게 유지한다.
- 내부 계산용 임시 값은 오래 남기지 않는다.
- UI 전용 표현 필드는 state보다 응답 스키마에서 관리한다.

## 금지 규칙
- state를 영구 저장소처럼 확장하지 않는다.
- Redis와 state의 책임을 섞지 않는다.
- Mongo에 가야 할 문서를 state에 그대로 넣지 않는다.