# AI 오디오 분석 기반 실시간 음원 협업 툴, studiON

## 🎧 프로젝트 소개

**당신이 있는곳 어디든, 스튜디오가 된다**

**studiON**은 여러 사용자가 하나의 프로젝트 안에서 오디오를 함께 편집하고, AI 분석 결과를 바탕으로 믹싱 작업을 보조받을 수 있는 협업형 웹 기반 오디오 작업 플랫폼입니다.

기존의 개인 중심 오디오 편집 흐름을 넘어, 팀 단위 협업에 필요한 실시간 동기화, 코멘트 기반 피드백, 프로젝트 초대, 버전 관리 기능을 하나의 서비스 안에 통합하는 것을 목표로 합니다.

또한 별도의 AI 분석 서버를 통해 주파수 충돌, 클리핑, 치찰음, 하이 대역 거침 등 믹싱 과정에서 발생할 수 있는 문제를 탐지하고, 사용자가 더 빠르게 의사결정을 내릴 수 있도록 지원합니다.

- 개발 기간: 4/6 ~ 5/21
- 플랫폼: Web Application
- 개발 인원: 6명
- 기관: 삼성 청년 SW·AI 아카데미

## 📊 주요 기능

### 실시간 동시 편집
  - 여러 사용자가 하나의 프로젝트에 동시에 접속해 편집 내용을 즉시 공유하며, 끊기지 않는 협업 작업 흐름을 제공합니다.
### AI 기반 충돌 감지 및 수정
  - AI가 주파수 충돌, 클리핑, 치찰음 등 믹싱 이슈를 빠르게 감지하고, 수정 판단에 필요한 인사이트를 제공합니다.
### 협업형 피드백 시스템
  - 트랙과 구간 단위로 코멘트를 남기고 바로 피드백을 주고받아, 작업 맥락이 끊기지 않는 소통 환경을 만듭니다.
### 웹 기반 믹싱 워크플로
  - 설치형 툴 없이 브라우저에서 업로드, 편집, 조정, 버전 관리, 내보내기까지 한 번에 이어지는 작업 환경을 제공합니다.

## 3. 기술 스택

| 구분 | 기술 |
|---|---|
| Frontend | Vue 3, TypeScript, Vite, Pinia, Tailwind CSS, STOMP / SockJS, Tone.js |
| Backend | Java 21, Spring Boot 3, Spring Security, Spring WebSocket, Spring Data JPA, QueryDSL, Flyway |
| AI | Python 3.11, FastAPI, LangGraph, Dramatiq, Redis, MongoDB, Qdrant |
| Database / Infra | MySQL, MongoDB, Redis, AWS S3, Docker Compose, Nginx |

## 4. 서비스 아키텍처

studiON은 프론트엔드, 백엔드, AI 서버가 분리된 구조를 기반으로 동작합니다.

- `FE`
  Vue 3 기반 웹 클라이언트로, 프로젝트 편집 화면, 대시보드, 온보딩, 코멘트, EQ, 내보내기 UI를 담당합니다.
- `BE`
  Spring Boot 기반 API 서버로, 인증, 프로젝트, 트랙, 클립, 댓글, 오디오 버전, 실시간 협업 동기화 로직을 담당합니다.
- `AI`
  FastAPI 기반 분석 서버로, 오디오 분석 워크플로와 AI 피드백 처리 흐름을 담당합니다.
- `INFRA`
  Docker Compose, 배포 구성, 운영 환경 리소스를 담당합니다.

개발 환경에서는 `compose.dev.yaml`을 통해 MySQL, MongoDB, Redis를 구성하고, 운영 환경에서는 Nginx와 백엔드 서비스, Redis를 조합해 배포할 수 있도록 구성되어 있습니다.

## 5. 디렉터리 구조

```text
.
├─ FE/                 # Vue 3 기반 프론트엔드
├─ BE/                 # Spring Boot 기반 백엔드
├─ AI/                 # FastAPI 기반 AI 분석 서버
├─ INFRA/              # 인프라 및 배포 관련 파일
├─ docs/               # 설계 문서 및 보조 자료
├─ compose.dev.yaml    # 개발용 Docker Compose
└─ compose.prod.yaml   # 운영용 Docker Compose
```

## 👥6. 팀 구성 및 담당 역할

프로필 이미지를 클릭하면 각 팀원의 GitHub 페이지로 이동합니다.

| 프로필 | 이름 | 역할 | 구현 기능 |
|---|---|---|---|
| <a href="https://github.com/hyoseok8948"><img src="https://github.com/hyoseok8948.png?size=100" width="60" alt="김효석 GitHub Profile" /></a> | 김효석 | 팀장, FE | 프로젝트 화면 구현 |
| <a href="https://github.com/bin3joo"><img src="https://github.com/bin3joo.png?size=100" width="60" alt="주세빈 GitHub Profile" /></a> | 주세빈 | PM, FE | 온보딩 대시보드, EQ 화면 구현 |
| <a href="https://github.com/jeongns2611"><img src="https://github.com/jeongns2611.png?size=100" width="60" alt="윤정아 GitHub Profile" /></a> | 윤정아 | BE | 프로젝트, 코멘트 파트 구현 |
| <a href="https://github.com/Charmander0308"><img src="https://github.com/Charmander0308.png?size=100" width="60" alt="한예성 GitHub Profile" /></a> | 한예성 | BE | 트랙, 클립 파트 구현 |
| <a href="https://github.com/kyubongg"><img src="https://github.com/kyubongg.png?size=100" width="60" alt="유규봉 GitHub Profile" /></a> | 유규봉 | AI | 00 AI 기능 구현 |
| <a href="https://github.com/seoliee"><img src="https://github.com/seoliee.png?size=100" width="60" alt="이서현 GitHub Profile" /></a> | 이서현 | INF | 인프라 및 배포 환경 구성 |

