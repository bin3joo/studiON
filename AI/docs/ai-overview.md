# AI Overview

## 목적
이 문서는 현재 AI 시스템의 상위 구조와 고정된 경계를 요약한다.
세부 구현 설명이 아니라 작업 시 지켜야 할 기준만 정리한다.

## 현재 범위
현재 AI 기능은 아래를 포함한다.

- DSP 기반 전체 분석
- CLAP 기반 보컬 여부 판단
- 문제 구간별 수정 제안 생성
- 사용자 선택 기반 preview 생성 및 최종 반영
- 오프라인 평가 분리

현재는 보컬 판별만 다룬다.
현재는 일반 악기 전체 분류를 기본 기능으로 취급하지 않는다.

## 현재 동작 원칙
- clipping은 자동 보정 대상이다.
- band overlap과 sibilance는 기본적으로 사용자 승인 대상이다.
- preview는 최종 반영과 분리한다.
- runtime graph와 offline evaluation graph는 분리한다.
- worker는 사용자 입력을 기다리며 붙잡혀 있지 않는다.
- interrupt가 발생하면 상태를 저장하고 suspend/resume 방식으로 처리한다.

## 저장소 경계
### MySQL
아래 성격의 데이터를 저장한다.

- AI job 상태 요약
- analysis region 요약
- suggestion / suggestion action
- applied suggestion
- preview 상태 요약
- evaluation verdict 요약

### Redis
아래 성격의 데이터를 저장한다.

- 실행 상태
- 프로젝트 단위 락
- 사용자 인터럽트 상태
- preview 진행 상태
- RAG 캐시

Redis는 휘발성 운영 상태 저장소다.
Redis 값이 없어져도 MySQL 기준으로 복구 가능해야 한다.

### MongoDB
아래 성격의 데이터를 저장한다.

- timeline snapshot 전문
- region evidence 전문
- track vocal artifact 전문
- suggestion artifact 전문
- runtime critic 상세
- offline evaluation 상세
- 내부 policy / RAG 문서

MongoDB는 큰 JSON 아티팩트 저장소다.

## 현재 retrieval 원칙
- 내부 curated policy 문서만 retrieval
- retrieval은 분석 자체가 아니라 suggestion generation 보조 역할
- 동일 조건 retrieval은 cache 가능

## 현재 모델 역할
- DSP: 전체 분석과 문제 후보 탐지
- CLAP: 보컬 여부 판별
- generator LLM: 수정 제안 생성
- critic: 의미 검증
- offline judge: 개발용 평가
- - 모델별 세부 선택은 코드와 환경 설정을 따르되, 출력 계약과 검증 정책은 docs 기준을 우선한다.

## 비목표
- 모든 악기 정확 분류
- 자동 믹싱 완전 대체
- runtime 중 무제한 web 검색
- Redis 기반 영구 이력 관리