<script setup lang="ts">
import {ref, onMounted} from 'vue'
import { useAuthStore } from '@/pages/Onboarding/stores/auth.store'

const authStore = useAuthStore()

//인증초기화 완료 여부 추적
const isAuthInitialized = ref(false);


onMounted(async () => {
  // App 로드 시 토큰 자동 복구가 완전히 끝날 때까지 대기
  await authStore.silentRefresh()
  
  // 복구가 끝나면 하위 페이지 렌더링 허용
  isAuthInitialized.value = true
})

</script>

<template>
  <RouterView v-if="isAuthInitialized" />
</template>