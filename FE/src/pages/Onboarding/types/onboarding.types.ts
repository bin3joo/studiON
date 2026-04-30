export interface GoogleLoginData {
  isNewUser: boolean
  accessToken: string | null
  refreshToken: string | null
  tmpToken: string | null
}

export interface GoogleLoginResponse {
  code: number
  message: string
  isSuccess: boolean
  data: GoogleLoginData
}

export interface PositionItem {
  positionId: number
  positionName: string
  order: number
}

export interface PositionGroup {
  groupCode: number
  groupName: string
  position: PositionItem[]
}

export interface FetchPositionsResponse {
  code: number
  message: string
  isSuccess: boolean
  data: {
    group: PositionGroup[]
  }
}

export interface RegisterRequest {
  nickname: string
  positionIds: number[]
}

export interface RegisterData {
  accessToken: string
  refreshToken: string
}

export interface RegisterResponse {
  code: number
  message: string
  isSuccess: boolean
  data: RegisterData
}
