export type ProjectId = string | number

export interface CreateProjectRequest {
  name: string
}

export interface CreateProjectData {
  id?: ProjectId | null
  projectId?: ProjectId | null
}

export interface CreateProjectResponse {
  id?: ProjectId | null
  projectId?: ProjectId | null
  data?: CreateProjectData | null
}

export interface JoinProjectRequest {
  inviteCode: string
}

export interface JoinProjectData {
  id?: ProjectId | null
  projectId?: ProjectId | null
}

export interface JoinProjectResponse {
  id?: ProjectId | null
  projectId?: ProjectId | null
  data?: JoinProjectData | null
}

export interface InviteCodeData {
  inviteCode?: string | null
  code?: string | null
}

export interface CreateInviteCodeResponse {
  inviteCode?: string | null
  code?: string | null
  data?: InviteCodeData | null
}
