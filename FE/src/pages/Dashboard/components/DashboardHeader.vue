<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import InviteCodeInputButton from './InviteCodeInputButton.vue'
import logoLight from '@/assets/logo_light.png'
import logoDark from '@/assets/logo_dark.png'
import { useAuthStore } from '@/pages/Onboarding/stores/auth.store'

const router = useRouter()
const authStore = useAuthStore()

const props = withDefaults(defineProps<{
  existingProjectNames?: string[]
}>(), {
  existingProjectNames: () => [],
})

const emit = defineEmits(['openFeedback'])

const navItems = [
  { label: '내 프로젝트', to: '/dashboard', active: true },
]

async function handleLogout() {
  await authStore.logout()
  router.push('/onboarding')
}
</script>

<template>
  <nav class="bg-[#131313]/70 backdrop-blur-xl border-b border-white/10 shadow-[0_0_20px_rgba(255,177,196,0.1)] sticky top-0 flex justify-between items-center w-full px-6 md:px-10 h-[64px] z-50">
    <div class="flex items-center gap-14">
      <RouterLink to="/dashboard" class="inline-flex items-center">
        <img :src="logoDark" alt="StudiON logo" class="h-10 w-auto" />
      </RouterLink>

      <div class="hidden md:flex gap-6 mt-1.5">
        <RouterLink
          v-for="item in navItems"
          :key="item.label"
          :to="item.to"
          class="transition-all duration-300 font-body-md text-[16px]"
          :class="item.active ? 'text-[#ffb1c4] border-b-2 border-[#ffb1c4] pb-1' : 'text-[#e5bcc5] hover:text-[#ffb1c4]'"
        >
          {{ item.label }}
        </RouterLink>
      </div>
    </div>

    <div class="flex items-center gap-3 md:gap-4 mr-4 md:mr-6">
      <InviteCodeInputButton />

      <!-- Feedback Button -->
      <button
        @click="emit('openFeedback')"
        class="hidden md:flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#ffb1c4]/20 to-[#e3b5ff]/20 border border-[#ffb1c4]/30 text-[#ffb1c4] text-sm font-bold tracking-wide animate-[pulse_2s_ease-in-out_infinite] hover:shadow-[0_0_15px_rgba(255,177,196,0.4)] transition-all"
      >
        <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">campaign</span>
        피드백 남기기
      </button>

      <!-- Logout Button -->
      <button
        @click="handleLogout"
        class="text-[#e5bcc5] hover:text-[#ffb1c4] transition-all duration-300 flex items-center justify-center p-1.5 rounded-full hover:shadow-[0_0_15px_rgba(255,177,196,0.4)]"
        title="로그아웃"
      >
        <span class="material-symbols-outlined text-[20px]" style="font-variation-settings: 'FILL' 0;">logout</span>
      </button>
    </div>
  </nav>
</template>
