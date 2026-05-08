//프로젝트 도메인 관련한 백엔드 통신을 모아둠.
import type {
  CreateInviteCodeResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  FetchProjectsResponse,
  JoinProjectRequest,
  JoinProjectResponse,
  Mode,
  ProjectId,
  RootNote,
} from '../types/project.types'
import { axiosInstance } from '@/shared/api/axiosInstance';
import type { TrackDto } from '@/pages/Project/types';

// ==========================================
// [인터페이스] 백엔드 응답 규격 (명세서 기반)
// ==========================================

//프로젝트 상세보기 응답
export interface ProjectDetailResponse {
  code: number;
  message: string;
  isSuccess: boolean;
  data: {
    projectId: number;
    name: string;
    rootNote: string;
    projectMode: string;
    tempo: number;
    timeSigNumerator: number;
    timeSigDenominator: number;
    totalBarCount: number;
    totalPlayTime: number;
    tracks: TrackDto[];

  }
}

// --- [타입 선언부] ---
export interface AudioDetailResponse {
  code: string;
  message: string;
  isSuccess: boolean;
  data: {
    audioMetadataId: number;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    durationMs: number;
    audioUrl: string; // ✨ 백엔드에서 반환해주는 실제 오디오 URL
  }
}


// ==============================
// 프로젝트 생성 기본값
// ==============================

const MOCK_PROJECT_CREATE_DELAY_MS = 400;
const MOCK_PROJECT_LIST_DELAY_MS = 300;
const DEFAULT_PROJECT_NAME = '새 프로젝트';
const DEFAULT_ROOT_NOTE: RootNote = 'C';
const DEFAULT_MODE: Mode = 'Major';
const DEFAULT_TEMPO = 120.0;
const DEFAULT_TIME_SIG_NUMERATOR = 4;
const DEFAULT_TIME_SIG_DENOMINATOR = 4;

// 기존 프로젝트명과 겹치지 않는 기본 프로젝트명을 만든다.
// 예: 새 프로젝트, 새 프로젝트1, 새 프로젝트2
export function getNextDefaultProjectName(existingProjectNames: string[]): string {
  const nameSet = new Set(existingProjectNames)

  if (!nameSet.has(DEFAULT_PROJECT_NAME)) {
    return DEFAULT_PROJECT_NAME
  }

  let suffix = 1

  while (nameSet.has(`${DEFAULT_PROJECT_NAME}${suffix}`)) {
    suffix += 1
  }

  return `${DEFAULT_PROJECT_NAME}${suffix}`
}

// 프로젝트 생성 API에 보낼 기본 payload를 만든다.
export function buildCreateProjectPayload(
  existingProjectNames: string[] = [],
): CreateProjectRequest {
  return {
    name: getNextDefaultProjectName(existingProjectNames),
    rootNote: DEFAULT_ROOT_NOTE,
    projectMode: DEFAULT_MODE,
    tempo: DEFAULT_TEMPO,
    timeSigNumerator: DEFAULT_TIME_SIG_NUMERATOR,
    timeSigDenominator: DEFAULT_TIME_SIG_DENOMINATOR,
  }
}

// ==========================================
// [추가] 오디오 파일 업로드 관련 API 인터페이스
// ==========================================
export interface GetUploadUrlRequest {
  originalName: string;
  mimeType: 'MPEG' | 'WAV';
  sizeBytes: number;
}

export interface GetUploadUrlResponse {
  code: string;
  message: string;
  isSuccess: boolean;
  data: {
    objectKey: string;
    storedName: string;
    uploadUrl: string; // S3 Presigned URL
  }
}

export interface SaveAudioMetadataRequest {
  objectKey: string;
  originalName: string;
  storedName: string;
  mimeType: 'MPEG' | 'WAV';
  sizeBytes: number;
  durationMs: number;
}

export interface SaveAudioMetadataResponse {
  code: string;
  message: string;
  isSuccess: boolean;
  data: {
    audioMetadataId: number;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    durationMs: number;
  }
}


// ==========================================
// [API 객체] 프로젝트 관련 통신 모음집
// ==========================================
export const projectApi = {
  // ------------------------------------------
  // 1. 프로젝트 초기 데이터
  // ------------------------------------------
  /**
   * 프로젝트 상세 조회 (초기 로딩)
   * GET /api/v1/projects/{projectId}
   */
  getProjectDetail: async (projectId: number) => {
    //shared에서 정의한 axios사용 -> 인증로직 자동첨부됨
    const response = await axiosInstance.get<ProjectDetailResponse>(`/api/v1/projects/${projectId}`);

    //인터셉터 덕분에 response.data에 data객체가 바로 들어있음
    return response.data.data;
  },

  // [추가] 오디오 단건 상세 조회 (오디오 URL 획득용)
  getAudioDetail: async (projectId: number, audioMetadataId: number) => {
    const response = await axiosInstance.get<AudioDetailResponse>(`/api/v1/projects/${projectId}/audios/${audioMetadataId}`);
    return response.data.data;
  },

  // S3 업로드 URL 발급
  getAudioUploadUrl: async (projectId: number, payload: GetUploadUrlRequest) => {
    const response = await axiosInstance.post<GetUploadUrlResponse>(`/api/v1/projects/${projectId}/audios/upload-url`, payload);
    return response.data.data;
  },

  // 메타데이터 저장
  saveAudioMetadata: async (projectId: number, payload: SaveAudioMetadataRequest) => {
    const response = await axiosInstance.post<SaveAudioMetadataResponse>(`/api/v1/projects/${projectId}/audios`, payload);
    return response.data.data;
  }

}

// 프로젝트 목록 조회

export async function fetchProjects(): Promise<FetchProjectsResponse> {
  const { data } = await axiosInstance.get('/api/v1/projects')
  return data
}

/**
 * 프로젝트 생성
 */
export async function createProject(
  payload: CreateProjectRequest = buildCreateProjectPayload(),
): Promise<CreateProjectResponse> {

  const response = await axiosInstance.post<CreateProjectResponse>(
    '/api/v1/projects',
    payload,
  )

  return response.data
}


// 프로젝트 참여 (초대코드 검증)
export async function joinProject(payload: JoinProjectRequest): Promise<JoinProjectResponse> {
  const response = await axiosInstance.post<JoinProjectResponse>(
    '/api/v1/projects/join',
    payload,
  )

  return response.data
}

//프로젝트 초대코드 생성

export async function createProjectInviteCode(projectId: ProjectId): Promise<CreateInviteCodeResponse> {
  const response = await axiosInstance.post<CreateInviteCodeResponse>(
    `/api/v1/projects/${projectId}/invite-code`,
  )

  return response.data
}
