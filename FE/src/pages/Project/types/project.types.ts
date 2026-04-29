export type ProjectId = number
export type MasterTrackId = number
export type UserId = number

export type RootNote =
  | 'C'
  | 'C#'
  | 'D'
  | 'Eb'
  | 'E'
  | 'F'
  | 'F#'
  | 'G'
  | 'Ab'
  | 'A'
  | 'Bb'
  | 'B'

export type Mode = 'Major' | 'Minor'

export interface CreateProjectRequest {
  name: string
  rootNote: RootNote
  projectMode: Mode
  tempo: number
  timeSigNumerator: number
  timeSigDenominator: number
}

export interface CreateProjectResponse {
  code: number
  message: string
  isSuccess: boolean
  data: {
    project: {
      projectId: number
      name: string
      rootNote: RootNote
      mode: Mode
      tempo: number
      timeSigNumerator: number
      timeSigDenominator: number
      totalBarCount: number
      totalPlayTime: number
    }
    masterTrack: {
      masterTrackId: number
      isSoloed: boolean
      isMuted: boolean
      volume: number
      pan: number
    }
  }
}

export interface ProjectSummary {
  projectId: ProjectId
  name: string
  rootNote: RootNote
  projectMode: Mode
  tempo: number
  timeSigNumerator: number
  timeSigDenominator: number
  totalBarCount: number
  totalPlayTime: number
}

export interface MasterTrackSummary {
  masterTrackId: MasterTrackId
  isSoloed: boolean
  isMuted: boolean
  volume: number
  pan: number
}

export interface CreateProjectData {
  project: ProjectSummary
  masterTrack: MasterTrackSummary
}

export interface CreateProjectResponse {
  code: number
  message: string
  isSuccess: boolean
  data: CreateProjectData
}

export interface ProjectListMember {
  userId: UserId
  profileImgUrl: string
}

export interface ProjectListItem {
  projectId: ProjectId
  projectName: string
  totalBarCount: number
  totalPlayTime: number
  totalAudioSize: number
  lastUpdateAt: string
  members: ProjectListMember[]
}

export interface FetchProjectsData {
  projects: ProjectListItem[]
}

export interface FetchProjectsResponse {
  code: number
  message: string
  isSuccess: boolean
  data: FetchProjectsData
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
