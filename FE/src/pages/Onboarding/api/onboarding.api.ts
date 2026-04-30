import { axiosInstance } from '@/shared/api/axiosInstance'
import type {
  FetchPositionsResponse,
  GoogleLoginResponse,
  RegisterRequest,
  RegisterResponse,
} from '../types/onboarding.types'

export async function loginWithGoogle(): Promise<GoogleLoginResponse> {
  const { data } = await axiosInstance.get<GoogleLoginResponse>('/api/v1/auth/login/google')
  return data
}

export async function fetchPositions(): Promise<FetchPositionsResponse> {
  const { data } = await axiosInstance.get<FetchPositionsResponse>('/api/v1/positions')
  return data
}

export async function registerUser(
  payload: RegisterRequest,
  tmpToken: string,
): Promise<RegisterResponse> {
  const { data } = await axiosInstance.post<RegisterResponse>(
    '/api/v1/auth/register',
    payload,
    {
      headers: {
        Authorization: `Bearer ${tmpToken}`,
      },
    },
  )

  return data
}