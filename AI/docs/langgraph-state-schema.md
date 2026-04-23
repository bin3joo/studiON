# LangGraph State Rules

## 목적
state는 orchestration을 위한 최소 정보만 담는다.
큰 결과물이나 원문 payload는 state가 아니라 외부 저장소 참조로 관리한다.

## Runtime State에 남길 것
- job id, project id
- phase, current node
- resume pointer
- track id, region id
- issue type 목록
- suggestion group id, preview id
- interrupt 요청 여부
- revise count
- Redis runtime status key
- MySQL job status id
- Mongo artifact id 목록

## Runtime State에 남기지 않을 것
- raw audio binary
- waveform/STFT/mel 전체 데이터
- CLAP raw window 전체 결과
- LLM raw output 전문
- preview 본문 전체
- 큰 evidence JSON

## Apply State에 남길 것
- job id, project id
- preview id, suggestion group id
- selected action id 목록
- apply phase, current node
- apply result id
- failure code

## 상태 저장 경계
- Redis
  - live runtime status
  - current node / phase / progress
  - heartbeat
  - interrupt flag
  - lock
  - resume pointer
- MySQL
  - durable lifecycle status
  - preview / suggestion / apply 참조
  - failure summary
  - 사용자 조회와 복구 기준 상태
- MongoDB
  - snapshot
  - DSP / CLAP evidence
  - validator / critic raw artifact
  - preview detail document

## 상태 규칙
- Redis 값만으로 최종 상태를 판단하지 않는다.
- MySQL이 durable source of truth다.
- Redis 유실 시 MySQL 기준으로 복구 가능해야 한다.
- state에는 저장소 원문을 넣지 않고 저장소 id만 둔다.
