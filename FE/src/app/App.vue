<script setup lang="ts">
// 이제 HelloWorld는 쓰지 않으므로 import 할 필요가 없습니다!
import { Button } from '@/shared/ui/button' // 아까 다운받은 버튼 부품 가져오기!
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center space-y-6">
    <div class="text-center space-y-2">
      <h1 class="text-4xl font-bold text-blue-500">
        StudiON Vue 버전
      </h1>
    </div>

    <Button variant="default" size="lg">
      shadcn-vue 버튼 테스트
    </Button>
  </div>
</template>