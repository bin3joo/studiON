import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchCurrentUser, reissueAccessToken, requestLogout } from '../api/onboarding.api'
import type { CurrentUser } from '../types/onboarding.types'

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<CurrentUser | null>(null)

  const isLoggedIn = computed(() => currentUser.value !== null)

  function setCurrentUser(user: CurrentUser | null) {
    currentUser.value = user
  }

  function clearAuthState() {
    currentUser.value = null
  }

  let silentRefreshPromise: Promise<boolean> | null = null

  async function silentRefresh() {
    if (silentRefreshPromise) {
      return silentRefreshPromise
    }

    silentRefreshPromise = (async () => {
      try {
        const response = await reissueAccessToken()
        if (response?.isSuccess) {
          const meResponse = await fetchCurrentUser()
          setCurrentUser(meResponse.data)
          return true
        }
        return false
      } catch (error) {
        clearAuthState()
        return false
      } finally {
        silentRefreshPromise = null
      }
    })()

    return silentRefreshPromise
  }

  async function logout() {
    clearAuthState()

    try {
      await requestLogout()
    } catch {
      // 서버 요청 실패와 무관하게 클라이언트는 로그아웃 상태를 유지한다.
    }
  }

  return {
    currentUser,
    isLoggedIn,
    setCurrentUser,
    clearAuthState,
    silentRefresh,
    logout,
  }
})
