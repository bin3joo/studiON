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
    rootNote: string;
    mode: string;
    tempo: number;
    timeSigNumerator: number;
    timeSigDenominator: number;
    totalBarCount: number;
    totalPlayTime: number;
    tracks: TrackDto[];

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
  }
}




const MOCK_PROJECT_CREATE_DELAY_MS = 400;
const MOCK_PROJECT_LIST_DELAY_MS = 300;
const DEFAULT_PROJECT_NAME = '새 프로젝트';
const DEFAULT_ROOT_NOTE: RootNote = 'C';
const DEFAULT_MODE: Mode = 'Major';
const DEFAULT_TEMPO = 120.0;
const DEFAULT_TIME_SIG_NUMERATOR = 4;
const DEFAULT_TIME_SIG_DENOMINATOR = 4;

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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

export function buildCreateProjectPayload(existingProjectNames: string[] = []): CreateProjectRequest {
  return {
    name: getNextDefaultProjectName(existingProjectNames),
    rootNote: DEFAULT_ROOT_NOTE,
    mode: DEFAULT_MODE,
    tempo: DEFAULT_TEMPO,
    timeSigNumerator: DEFAULT_TIME_SIG_NUMERATOR,
    timeSigDenominator: DEFAULT_TIME_SIG_DENOMINATOR,
  }
}

/**
 * 프로젝트 생성
 * 현재는 백엔드가 없어서 mock 응답을 사용한다.
 * 백엔드 연결 시 아래 real API 코드를 주석 해제하고 mock 부분을 제거하면 된다.
 */
export async function createProject(
  payload: CreateProjectRequest = buildCreateProjectPayload(),
): Promise<CreateProjectResponse> {
  // =========================
  // mock implementation
  // =========================
  await wait(MOCK_PROJECT_CREATE_DELAY_MS)

  const fakeProjectId = Date.now()

  return {
    code: 200,
    message: '프로젝트가 생성되었습니다.',
    isSuccess: true,
    data: {
      project: {
        projectId: fakeProjectId,
        name: payload.name,
        rootNote: payload.rootNote,
        mode: payload.mode,
        tempo: payload.tempo,
        timeSigNumerator: payload.timeSigNumerator,
        timeSigDenominator: payload.timeSigDenominator,
        totalBarCount: 0,
        totalPlayTime: 0,
      },
      masterTrack: {
        masterTrackId: fakeProjectId,
        isSoloed: false,
        isMuted: false,
        volume: 1,
        pan: 0,
      },
    },
  }

  // =========================
  // real API implementation
  // =========================
  // const response = await fetch('/api/v1/projects', {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify(payload),
  // })
  //
  // if (!response.ok) {
  //   throw new Error('프로젝트 생성에 실패했습니다.')
  // }
  //
  // const contentType = response.headers.get('content-type') ?? ''
  //
  // if (!contentType.includes('application/json')) {
  //   return {}
  // }
  //
  // return await response.json() as CreateProjectResponse
}

export async function fetchProjects(): Promise<FetchProjectsResponse> {
  // =========================
  // mock implementation
  // =========================
  await wait(MOCK_PROJECT_LIST_DELAY_MS)

  return {
    code: 200,
    message: '요청에 성공하였습니다.',
    isSuccess: true,
    data: {
      projects: [
        {
          projectId: 1,
          projectName: '새 프로젝트',
          totalBarCount: 0,
          totalPlayTime: 0,
          totalAudioSize: 0,
          lastUpdateAt: '2026-04-20T12:30:44',
          members: [
            {
              userId: 1,
              profileImgUrl: 'https://example.com/profile-1.png',
            },
          ],
        },
        {
          projectId: 2,
          projectName: '새 프로젝트1',
          totalBarCount: 8,
          totalPlayTime: 180000,
          totalAudioSize: 314572800,
          lastUpdateAt: '2026-04-21T10:00:00',
          members: [
            {
              userId: 1,
              profileImgUrl: 'https://example.com/profile-1.png',
            },
            {
              userId: 2,
              profileImgUrl: 'https://example.com/profile-2.png',
            },
          ],
        },
      ],
    },
  }

  // =========================
  // real API implementation
  // =========================
  // const response = await fetch('/api/v1/projects', {
  //   method: 'GET',
  //   headers: {
  //     'Content-Type': 'application/json',
  //   },
  // })
  //
  // if (!response.ok) {
  //   throw new Error('프로젝트 목록 조회에 실패했습니다.')
  // }
  //
  // return await response.json() as FetchProjectsResponse
}

/**
 * 프로젝트 참여 (초대코드 검증)
 * 현재는 실제 백엔드 호출을 사용한다.
 * 백엔드가 없으면 404가 나는 것이 정상이다.
 */
export async function joinProject(payload: JoinProjectRequest): Promise<JoinProjectResponse> {
  const response = await fetch('/api/v1/projects/join', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error('초대코드 확인에 실패했습니다.')
  }

  const contentType = response.headers.get('content-type') ?? ''

  if (!contentType.includes('application/json')) {
    return {}
  }

  return await response.json() as JoinProjectResponse
}

/**
 * 프로젝트 초대코드 생성
 * 현재는 실제 백엔드 호출을 사용한다.
 * 백엔드가 없으면 404가 나는 것이 정상이다.
 */
export async function createProjectInviteCode(projectId: ProjectId): Promise<CreateInviteCodeResponse> {
  const response = await fetch(`/api/v1/projects/${projectId}/invite-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('초대코드 생성에 실패했습니다.')
  }

  const contentType = response.headers.get('content-type') ?? ''

  if (!contentType.includes('application/json')) {
    return {}
  }

  return await response.json() as CreateInviteCodeResponse
}
