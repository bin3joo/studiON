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
  positionGroup: PositionGroup
  name: string
  order: number
}

export type FetchPositionsResponse = ApiResponse<Position[]>

export interface OnboardingRequest {
  positionCodes: number[]
}

export interface AuthTokenData {
  isNewUser: boolean
  accessToken: string
}

export type OnboardingResponse = ApiResponse<AuthTokenData>
export type TokenExchangeResponse = ApiResponse<AuthTokenData>