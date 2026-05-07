export type ProjectSocketEvent =
  | 'PROJECT_JOIN'
  | 'PROJECT_LEFT'
  | 'PROJECT_RENAME'
  | 'PROJECT_ONLINE_USERS'
  | 'USER_JOINED_PROJECT'
  | 'USER_LEFT_PROJECT'
  | 'PROJECT_RENAMED'
  | 'ERROR'

export interface WsMessage<T = unknown> {
  event: ProjectSocketEvent | string
  payload: T
}

export interface OnlineUser {
  userId: number
  nickname: string
  profileImageUrl: string | null
}

export interface ProjectOnlineUsersPayload {
  projectId: number
  users: OnlineUser[]
}

export interface UserJoinedProjectPayload {
  projectId: number
  user: OnlineUser
}

export interface UserLeftProjectPayload {
  userId: number
}

export interface ProjectRenamedPayload {
  name: string
}