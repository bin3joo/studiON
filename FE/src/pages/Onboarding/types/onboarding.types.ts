export interface ApiResponse<T> {
  isSuccess: boolean
  code: string
  message: string
  data: T
}

export interface PositionGroup {
  code: number
  name: string
  order: number
}

export interface Position {
  code: number
  name: string
  order: number
  groupCode: number
  groupName: string
  groupOrder: number
}

export type FetchPositionsResponse = ApiResponse<Position[]>

export interface OnboardingRequest {
  positionCodes: number[]
}

export interface AuthTokenData {
  isNewUser: boolean
}

export type OnboardingResponse = ApiResponse<AuthTokenData>
export type TokenExchangeResponse = ApiResponse<AuthTokenData>

export interface CurrentUser {
  userId: number
  nickname: string
  profileImageUrl: string | null
}

export type CurrentUserResponse = ApiResponse<CurrentUser>
