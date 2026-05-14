<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Plus } from 'lucide-vue-next'
import { Button } from '@/shared/ui/button'
import ThemeToggle from '@/shared/ui/theme/ThemeToggle.vue'
import { buildCreateProjectPayload, createProject, projectApi } from '@/pages/Project/api/project.api'
import type { CreateProjectResponse, ProjectId } from '@/pages/Project/types/project.types'
import InviteCodeInputButton from './InviteCodeInputButton.vue'
import logoLight from '@/assets/logo_light.png'
import logoDark from '@/assets/logo_dark.png'
import { trackEvent } from '@/shared/utils/analytics'

const router = useRouter()
const isCreating = ref(false)
const errorMessage = ref('')

const props = withDefaults(defineProps<{
  existingProjectNames?: string[]
}>(), {
  existingProjectNames: () => [],
})

const navItems = [
  { label: '내 프로젝트', to: '/dashboard', active: true },
]

function extractProjectId(response: CreateProjectResponse): ProjectId | null {
  return response.data.project.projectId ?? null
}

function extractProjectName(response: CreateProjectResponse): string {
  return response.data?.project?.name ?? '새 프로젝트'
}

async function handleCreateProjectClick() {
  isCreating.value = true
  errorMessage.value = ''

  try {
    const payload = buildCreateProjectPayload(props.existingProjectNames)
    const response = await createProject(payload)
    const projectId = extractProjectId(response)
    const projectName = extractProjectName(response)

    if (!projectId) {
      throw new Error('생성된 프로젝트 ID를 확인할 수 없습니다.')
    }

    trackEvent('project_created', {
      project_id: projectId,
    })

    //라우팅 전 강제로 스냅샷 저장 호출
    //백엔드의 Redis 캐시에만 존재하는 디폴트 트랙을 DB로 넣음
    await projectApi.saveProjectSnapshot(projectId);

    await router.push({
      path: `/project/${projectId}`,
      query: { name: projectName },
    })
  }
  catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : '프로젝트 생성 중 오류가 발생했습니다.'
  }
  finally {
    isCreating.value = false
  }
}
</script>

<template>
  <header class="border-b border-border px-6 py-5 md:px-10">
    <div class="flex items-center justify-between gap-6">
      <div class="flex items-center gap-10">
        <RouterLink
  to="/dashboard"
  class="inline-flex items-center"
>
  <img
    :src="logoLight"
    alt="StudiON logo"
    class="h-20 w-auto dark:hidden"
  >
  <img
    :src="logoDark"
    alt="StudiON logo"
    class="hidden h-20 w-auto dark:block"
  >
</RouterLink>

        <nav class="hidden items-center gap-7 md:flex">
          <RouterLink
            v-for="item in navItems"
            :key="item.label"
            :to="item.to"
            class="relative font-display text-sm tracking-[0.15em] transition"
            :class="item.active
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'"
          >
            {{ item.label }}
            <span
              v-if="item.active"
              class="absolute -bottom-2 left-0 h-px w-full bg-primary shadow-neon"
            />
          </RouterLink>
        </nav>
      </div>

      <div class="flex items-center gap-2 md:gap-3">
        <ThemeToggle />

        <Button
          type="button"
          :disabled="isCreating"
          class="inline-flex h-auto items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[10px] font-medium uppercase tracking-[0.2em] text-primary-foreground transition hover:shadow-neon md:text-xs"
          @click="handleCreateProjectClick"
        >
          <Plus class="h-3.5 w-3.5" />
          <span class="hidden sm:inline">
            {{ isCreating ? '생성 중...' : '프로젝트 생성' }}
          </span>
        </Button>

        <InviteCodeInputButton />
      </div>
    </div>

    <p
      v-if="errorMessage"
      class="mt-3 text-[11px] tracking-wide text-destructive animate-fade-in"
    >
      {{ errorMessage }}
    </p>
  </header>
</template>
