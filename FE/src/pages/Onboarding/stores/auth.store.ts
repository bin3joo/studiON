import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)

  const isLoggedIn = computed(() => accessToken.value !== null)

  function setAccessToken(token: string) {
    accessToken.value = token
  }

  function clearAccessToken() {
    accessToken.value = null
  }

  return {
    accessToken,
    isLoggedIn,
    setAccessToken,
    clearAccessToken,
  }
})