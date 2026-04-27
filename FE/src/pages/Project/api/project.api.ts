import type {
  CreateInviteCodeResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  JoinProjectRequest,
  JoinProjectResponse,
  ProjectId,
} from '../types/project.types'

const MOCK_PROJECT_CREATE_DELAY_MS = 400

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 프로젝트 생성
 * 현재는 백엔드가 없어서 mock 응답을 사용한다.
 * 백엔드 연결 시 아래 real API 코드를 주석 해제하고 mock 부분을 제거하면 된다.
 */
export async function createProject(
  payload: CreateProjectRequest = { name: '새 프로젝트' },
): Promise<CreateProjectResponse> {
  // =========================
  // mock implementation
  // =========================
  await wait(MOCK_PROJECT_CREATE_DELAY_MS)

  const normalizedName = payload.name.trim().replace(/\s+/g, '-').toLowerCase()
  const fakeProjectId = normalizedName.length > 0
    ? `mock-${normalizedName}`
    : 'mock-project-id'

  return {
    data: {
      projectId: fakeProjectId,
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