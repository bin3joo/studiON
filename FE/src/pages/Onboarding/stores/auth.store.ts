import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { reissueAccessToken } from '../api/onboarding.api'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)

  const isLoggedIn = computed(() => accessToken.value !== null)

  function setAccessToken(token: string) {
    accessToken.value = token
  }

  function clearAccessToken() {
    accessToken.value = null
  }

  async function silentRefresh() {
    try {
      const response = await reissueAccessToken()
      if (response && response.data && response.data.accessToken) {
        setAccessToken(response.data.accessToken)
        return true
      }
      return false
    } catch (error) {
      clearAccessToken()
      return false
    }
  }

  return {
    accessToken,
    isLoggedIn,
    setAccessToken,
    clearAccessToken,
    silentRefresh,
  }
})