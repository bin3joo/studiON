<script setup lang="ts">

import { useAuthStore } from '@/pages/Onboarding/stores/auth.store'

const authStore = useAuthStore()
// App 로드 시 백그라운드에서 토큰 자동 복구 시도 (Silent Refresh)
authStore.silentRefresh()
</script>

<template>
  <RouterView/>
</template>