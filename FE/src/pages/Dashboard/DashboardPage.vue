<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { AudioLines, Disc3, Mic, Play } from 'lucide-vue-next'
import DashboardHeader from './components/DashboardHeader.vue'
import { fetchProjects } from '@/pages/Project/api/project.api'
import type { ProjectListItem } from '@/pages/Project/types/project.types'

const projects = ref<ProjectListItem[]>([])
const isLoading = ref(false)
const errorMessage = ref('')

const existingProjectNames = computed(() =>
  projects.value.map(project => project.projectName),
)

function getProjectIcon(index: number) {
  const icons = [Disc3, AudioLines, Mic]
  return icons[index % icons.length]
}

function formatPlayTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0:00'
  }

  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatAudioSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 MB'
  }

  const mb = bytes / (1024 * 1024)

  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`
  }

  return `${Math.round(mb)} MB`
}

function formatEditedText(lastUpdateAt: string): string {
  const updatedAt = new Date(lastUpdateAt)

  if (Number.isNaN(updatedAt.getTime())) {
    return 'UPDATED RECENTLY'
  }

  const diffMs = Date.now() - updatedAt.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 60) {
    return `EDITED ${Math.max(diffMinutes, 1)}M AGO`
  }

  if (diffHours < 24) {
    return `EDITED ${diffHours}H AGO`
  }

  return `EDITED ${diffDays}D AGO`
}

async function loadProjects() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await fetchProjects()
    projects.value = response.data?.projects ?? []
  }
  catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : '프로젝트 목록을 불러오는 중 오류가 발생했습니다.'
  }
  finally {
    isLoading.value = false
  }
}

onMounted(() => {
  void loadProjects()
})
</script>

<template>
  <main class="min-h-screen bg-background text-foreground font-grotesk">
    <DashboardHeader :existing-project-names="existingProjectNames" />

    <section class="relative overflow-hidden px-6 py-12 md:px-10 md:py-16">
      <div class="pointer-events-none absolute -left-24 top-0 -z-10 h-[40vh] w-[40vh] rounded-full bg-primary/20 blur-[120px]" />
      <div class="absolute inset-0 -z-10 bg-grain opacity-30" />

      <div class="flex flex-col items-start gap-4">
        <h1 class="font-display text-[clamp(3rem,9vw,6rem)] leading-none text-foreground">
          <span class="text-neon-magenta">내 프로젝트</span>
        </h1>
      </div>
    </section>

    <section class="px-6 pb-20 md:px-10 md:pb-28">
      <div class="mb-6 flex items-center justify-between">
        <div class="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {{ projects.length }} 개의 활성 프로젝트
        </div>
      </div>

      <p
        v-if="isLoading"
        class="mb-4 text-sm text-muted-foreground"
      >
        프로젝트 불러오는 중...
      </p>

      <p
        v-else-if="errorMessage"
        class="mb-4 text-sm text-destructive"
      >
        {{ errorMessage }}
      </p>

      <div
        v-else-if="projects.length === 0"
        class="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground"
      >
        프로젝트가 없습니다.
      </div>

      <div
        v-else
        class="space-y-3"
      >
        <RouterLink
          v-for="(project, idx) in projects"
          :key="project.projectId"
          :to="{
            path: `/project/${project.projectId}`,
            query: { name: project.projectName },
          }"
          class="group relative grid grid-cols-1 gap-4 overflow-hidden rounded-xl border border-border bg-card px-6 py-6 transition hover:border-primary hover:shadow-neon md:grid-cols-[auto_minmax(0,1.4fr)_auto_minmax(0,1fr)_auto] md:items-center md:gap-8 md:px-8 md:py-7"
        >
          <div class="flex min-w-0 items-center gap-5">
            <span class="font-mono-tight text-[10px] uppercase tracking-widest text-muted-foreground">
              {{ String(idx + 1).padStart(2, '0') }}
            </span>

            <div class="grid h-12 w-12 place-items-center rounded-lg bg-secondary text-primary transition group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-neon">
              <component
                :is="getProjectIcon(idx)"
                class="h-5 w-5"
              />
            </div>

            <div class="min-w-0">
              <h3 class="truncate font-display text-xl leading-tight tracking-wide text-foreground md:text-2xl">
                {{ project.projectName }}
              </h3>

              <div class="mt-1.5 flex items-center gap-2 text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                <span>{{ project.totalBarCount }} BARS</span>
                <span class="h-1 w-1 rounded-full bg-muted-foreground/50" />
                <span class="text-primary/80">{{ formatPlayTime(project.totalPlayTime) }}</span>
              </div>
            </div>
          </div>

          <div class="hidden h-12 w-px bg-border md:block" />

          <div class="hidden items-center gap-8 md:flex">
            <div class="flex flex-col">
              <span class="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                Tracks
              </span>
              <span class="mt-1 font-display text-lg leading-none text-foreground">
                -
              </span>
            </div>

            <div class="flex flex-col">
              <span class="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                Length
              </span>
              <span class="mt-1 font-mono-tight text-lg leading-none text-foreground">
                {{ formatPlayTime(project.totalPlayTime) }}
              </span>
            </div>

            <div class="flex flex-col">
              <span class="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                Size
              </span>
              <span class="mt-1 font-mono-tight text-lg leading-none text-foreground">
                {{ formatAudioSize(project.totalAudioSize) }}
              </span>
            </div>
          </div>

          <div class="flex items-center justify-self-end gap-5">
            <div class="flex -space-x-2">
              <img
                v-for="member in project.members.slice(0, 3)"
                :key="member.userId"
                :src="member.profileImgUrl"
                :alt="`member-${member.userId}`"
                class="h-7 w-7 rounded-full border-2 border-card object-cover"
              >
            </div>

            <span class="hidden font-mono-tight text-[9px] uppercase tracking-widest text-muted-foreground lg:inline">
              {{ formatEditedText(project.lastUpdateAt) }}
            </span>

            <div class="grid h-10 w-10 place-items-center rounded-full border border-border text-primary transition group-hover:border-primary group-hover:bg-primary/10 group-hover:shadow-neon">
              <Play class="h-4 w-4" />
            </div>
          </div>
        </RouterLink>
      </div>
    </section>

    <footer class="border-t border-border px-6 py-8 md:px-10">
      <div class="flex flex-col items-center justify-between gap-4 text-[10px] uppercase tracking-[0.3em] text-muted-foreground md:flex-row">
        <div>© 2026 스튜디오 연어</div>

        <div class="flex items-center gap-6">
          <a href="#" class="transition hover:text-primary">Privacy</a>
          <a href="#" class="transition hover:text-primary">Terms</a>
          <a href="#" class="transition hover:text-primary">API Docs</a>
          <a href="#" class="transition hover:text-primary">Community</a>
        </div>
      </div>
    </footer>
  </main>
</template>