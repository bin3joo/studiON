# 🎧 studiON

AI 오디오 분석 기반 실시간 음원 협업 플랫폼

여러 사용자가 하나의 프로젝트 안에서 오디오 트랙을 함께 편집하고,  
AI 분석 결과를 바탕으로 주파수 충돌, 클리핑, 치찰음 등 믹싱 이슈를 빠르게 확인할 수 있는  
웹 기반 협업형 오디오 작업 서비스입니다.

**팀의 연결, 더 똑똑한 믹싱 studiON**

- 개발 기간: 작성 필요
- 플랫폼: Web Application
- 개발 인원: 6명
- 기관: 삼성 청년 SW·AI 아카데미

## 👥 팀원 소개

| 이름 | 역할 | GitHub | 주요 담당 업무 |
|---|---|---|---|
| 김효석 | Team Lead · Front-End | hyoseok8948 | 프로젝트 리딩, 프론트엔드 화면 및 협업 플로우 구현 |
| 주세빈 | PM · Front-End | bin3joo | 프로젝트 관리, 프론트엔드 화면 및 사용자 경험 구현 |
| 윤정아 | Back-End | jeongns2611 | 프로젝트, 코멘트, 협업 피드백 기능 구현 |
| 한예성 | Back-End | Charmander0308 | 트랙, 클립, 실시간 편집 동기화 기능 구현 |
| 유규봉 | AI | kyubongg | AI 오디오 분석 워크플로 및 분석 서버 구현 |
| 이서현 | Infra | seoliee | 인프라, 배포 환경, 운영 구성 구현 |

## 🛠️ 기술 스택

### 🌕 Frontend

| Category | Stack |
|---|---|
| Language | TypeScript |
| Runtime Environment | Node.js, Vite |
| Framework | Vue 3 |
| Styling | Tailwind CSS |
| State / Data | Pinia, Pinia Persisted State |
| Network / Realtime | Axios, STOMP, SockJS |
| Audio | Tone.js, Web Audio API |
| UI | Reka UI, Lucide Vue |
| Build Tool | Vite |

### 🌑 Backend

| Category | Stack |
|---|---|
| Language | Java 21 |
| Framework | Spring Boot 3.5.13 |
| Security | Spring Security, OAuth2 Client, JWT |
| Realtime | Spring WebSocket |
| Data Access | Spring Data JPA, QueryDSL, Spring Data Redis, Spring Data MongoDB |
| Database | MySQL, MongoDB, Redis |
| Storage | AWS S3 Compatible Storage |
| API Docs | Springdoc OpenAPI / Swagger UI |
| Migration | Flyway |
| Build Tool | Gradle |
| Monitoring | Spring Actuator |

### 🌘 AI

| Category | Stack |
|---|---|
| Language | Python 3.11 |
| Framework | FastAPI |
| Workflow | LangGraph |
| Queue | Dramatiq, Redis |
| Data / Artifact Store | MySQL, MongoDB, Qdrant |
| Audio Processing | Librosa, NumPy |
| LLM Integration | OpenAI-compatible API |
| Package / Runtime | uv, Uvicorn |

### ⚙️ Infra / DevOps

| Category | Stack |
|---|---|
| Containerization | Docker, Docker Compose |
| Web / Proxy | Nginx |
| CI/CD | Jenkins |
| Certificate | Certbot, Let's Encrypt |
| Version Control | GitLab |

## 🌐 시스템 아키텍처

studiON은 프론트엔드, 백엔드, AI 서버, 인프라 구성이 분리된 구조로 동작합니다.

```text
사용자 브라우저
  └─ FE (Vue 3)
       ├─ REST API / OAuth / JWT
       ├─ WebSocket / STOMP 협업 이벤트
       └─ Web Audio API 기반 편집·렌더링

BE (Spring Boot)
  ├─ 인증 / 사용자 / 프로젝트
  ├─ 트랙 / 클립 / 코멘트 / 버전
  ├─ WebSocket 협업 이벤트 중계
  ├─ S3 Presigned URL 기반 오디오 업로드
  └─ AI 서버 연동

AI (FastAPI)
  ├─ 오디오 분석 워크플로
  ├─ 주파수 충돌 / 클리핑 / 치찰음 분석
  ├─ EQ / 리미터 제안 생성
  └─ LangGraph 기반 작업 상태 관리

Infra
  ├─ MySQL
  ├─ MongoDB
  ├─ Redis
  ├─ Nginx
  └─ Docker Compose
```

## 📦 서비스 구성

| 서비스명 | 설명 | 기술 스택 |
|---|---|---|
| FE | 프로젝트 편집 화면, 대시보드, 온보딩, EQ, 코멘트, 버전 저장 UI | Vue 3, TypeScript, Vite, Pinia, Tone.js |
| BE | 인증, 프로젝트, 트랙, 클립, 댓글, 오디오 버전, 실시간 협업 API | Spring Boot, MySQL, MongoDB, Redis, WebSocket |
| AI | 오디오 분석, AI 제안, 워크플로 상태 관리 | FastAPI, LangGraph, Dramatiq, Redis, MongoDB |
| INFRA | 개발·운영 배포 환경 및 프록시 구성 | Docker Compose, Nginx, Certbot |

## 📦 프로젝트 산출물

### 📐 와이어프레임



### 🗄️ ERD

이미지 파일 추가 필요

### ✅ API Documentation

- Backend API: `/swagger-ui.html`
- AI API: FastAPI `/docs`

### 🔄 CI/CD Pipeline

Jenkins와 Docker 기반의 빌드 및 배포 파이프라인을 구성합니다.

- 프론트엔드 정적 빌드
- 백엔드 애플리케이션 빌드
- Docker 이미지 생성
- Nginx 기반 서비스 배포
- Redis healthcheck 기반 백엔드 기동 제어

## 📊 주요 기능

| 기능 | 설명 |
|---|---|
| 프로젝트 생성 / 참여 | 새 프로젝트를 만들고 초대 코드를 통해 팀원이 참여할 수 있습니다. |
| 실시간 동시 편집 | WebSocket 기반으로 트랙, 클립, 프로젝트 설정 변경을 실시간 동기화합니다. |
| 오디오 업로드 | MP3, WAV 파일을 업로드하고 트랙에 클립으로 배치합니다. |
| 타임라인 편집 | 클립 이동, 복사, 잘라내기, 붙여넣기, 분할, 삭제 등 기본 편집을 지원합니다. |
| 재생 컨트롤 | 재생, 정지, 루프, 메트로놈, BPM, 박자, 키 설정을 제공합니다. |
| EQ 편집 | 트랙별 EQ 밴드를 추가·수정·삭제하고 실시간으로 오디오 체인을 반영합니다. |
| AI 믹스 분석 | 주파수 충돌, 클리핑, 치찰음 등 믹싱 이슈를 분석합니다. |
| AI EQ 제안 | 분석 결과를 기반으로 Before / After EQ 비교와 AI 적용 흐름을 제공합니다. |
| 코멘트 피드백 | 트랙과 마디 단위로 코멘트를 남기고 협업 피드백을 관리합니다. |
| 프로젝트 저장 | 현재 작업 상태를 스냅샷으로 저장합니다. |
| 버전 저장 | 작업 결과를 오디오 버전으로 저장하고 기록에서 확인할 수 있습니다. |
| 음원 내보내기 | 브라우저에서 믹스다운된 WAV 파일을 생성하고 다운로드합니다. |
| 대시보드 | 프로젝트 목록, 초대 코드 참여, 오디오 사용량, 공지 배너를 제공합니다. |

## 🎨 주요 화면

### 🏠 온보딩

서비스 소개, 로그인, 프로필 설정 흐름을 제공합니다.

### 📁 대시보드

내 프로젝트 목록, 새 프로젝트 생성, 초대 코드 참여, 사용량 확인 기능을 제공합니다.

### 🎚️ 프로젝트 편집

타임라인, 트랙 리스트, 마스터 트랙, 재생 컨트롤러, EQ 패널을 중심으로 오디오 편집 작업을 수행합니다.

### 🤖 AI 분석 / EQ 제안

AI 분석 결과를 타임라인 오버레이와 EQ 패널에서 확인하고, 제안된 EQ를 비교·적용할 수 있습니다.

### 💬 협업 코멘트

트랙 및 마디 기준으로 코멘트를 작성하고, 사이드 패널에서 피드백을 관리합니다.

## 📁 디렉터리 구조

```text
.
├─ FE/                 # Vue 3 기반 프론트엔드
├─ BE/                 # Spring Boot 기반 백엔드
├─ AI/                 # FastAPI 기반 AI 분석 서버
├─ INFRA/              # 인프라 및 배포 관련 파일
├─ docs/               # 설계 문서 및 보조 자료
├─ compose.dev.yaml    # 개발용 데이터베이스/Redis Docker Compose
├─ compose.ai.yaml     # AI 서버/워커 Docker Compose
└─ compose.prod.yaml   # 운영용 Nginx/Backend/Redis Docker Compose
```

## 🚀 실행 방법

### Frontend

```bash
cd FE
npm install
npm run dev
```

### Backend

```bash
cd BE
./gradlew bootRun
```

### AI

```bash
cd AI
uv sync
uv run uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000
```

### 개발 인프라

```bash
docker compose -f compose.dev.yaml up -d
docker compose -f compose.ai.yaml up -d
```

## 🎧 studiON - 팀의 연결, 더 똑똑한 믹싱
