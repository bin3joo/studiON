<script setup lang="ts">
// Vue Composition API에서 필요한 기능 import
// ref: 반응형 상태값
// computed: 기존 상태를 기반으로 계산되는 값
// onMounted: 컴포넌트가 화면에 붙은 직후 실행되는 생명주기 훅
import { computed, onMounted, ref } from 'vue'

// Vue Router의 링크 컴포넌트
// 클릭 시 페이지 새로고침 없이 라우팅 이동
import { RouterLink } from 'vue-router'

// 프로젝트 카드에 사용할 아이콘들
import { AudioLines, Disc3, Mic, Play } from 'lucide-vue-next'

// 대시보드 상단 헤더 컴포넌트
// 프로젝트 생성 버튼 등이 들어있는 영역으로 보임
import DashboardHeader from './components/DashboardHeader.vue'

// 프로젝트 목록 조회 API 함수
import { fetchProjects } from '@/pages/Project/api/project.api'

// 프로젝트 목록 아이템 타입
import type { ProjectListItem } from '@/pages/Project/types/project.types'

// 서버에서 받아온 프로젝트 목록을 저장하는 상태
const projects = ref<ProjectListItem[]>([])

// 프로젝트 목록 API 요청 중인지 표시하는 상태
const isLoading = ref(false)

// API 실패 시 화면에 보여줄 에러 메시지
const errorMessage = ref('')

// 기존 프로젝트 이름 목록
// DashboardHeader에서 새 프로젝트 기본 이름을 만들 때 중복 방지용으로 사용
const existingProjectNames = computed(() =>
  projects.value.map(project => project.projectName),
)

// 프로젝트 카드마다 순서에 따라 다른 아이콘을 보여주기 위한 함수
function getProjectIcon(index: number) {
  const icons = [Disc3, AudioLines, Mic]
  return icons[index % icons.length]
}

// 밀리초 단위의 재생 시간을 mm:ss 형식으로 변환
function formatPlayTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0:00'
  }

  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// 바이트 단위의 오디오 파일 크기를 MB 또는 GB 단위 문자열로 변환
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

// 프로젝트 마지막 수정 시간을 "EDITED 5M AGO" 같은 문구로 변환
function formatEditedText(lastUpdateAt: string): string {
  const updatedAt = new Date(lastUpdateAt)

  // 날짜 파싱이 실패하면 기본 문구 반환
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

// 프로젝트 목록을 서버에서 불러오는 함수
async function loadProjects() {
  // 로딩 시작
  isLoading.value = true

  // 이전 에러 메시지 초기화
  errorMessage.value = ''

  try {
    // GET /api/v1/projects 호출
    const response = await fetchProjects()

    // 응답 data 안의 projects 배열을 화면 상태에 저장
    // 응답이 비어 있으면 빈 배열로 처리해서 화면이 터지지 않게 함
    projects.value = response.data?.projects ?? []
  }
  catch (error) {
    // API 실패 시 화면에 보여줄 에러 메시지 설정
    errorMessage.value = error instanceof Error
      ? error.message
      : '프로젝트 목록을 불러오는 중 오류가 발생했습니다.'
  }
  finally {
    // 성공/실패와 관계없이 로딩 종료
    isLoading.value = false
  }
}

// 대시보드 페이지가 처음 렌더링되면 프로젝트 목록을 불러옴
onMounted(() => {
  void loadProjects()
})
</script>

<template>
  <!-- 대시보드 전체 화면 -->
  <main class="min-h-screen bg-background text-foreground font-grotesk">
    <!-- 상단 헤더 -->
    <!-- 기존 프로젝트명을 넘겨서 새 프로젝트 생성 시 중복 이름을 피할 수 있게 함 -->
    <DashboardHeader :existing-project-names="existingProjectNames" />

    <!-- 페이지 타이틀 영역 -->
    <section class="relative overflow-hidden px-6 py-12 md:px-10 md:py-16">
      <!-- 배경 효과용 장식 요소 -->
      <div class="pointer-events-none absolute -left-24 top-0 -z-10 h-[40vh] w-[40vh] rounded-full bg-primary/20 blur-[120px]" />
      <div class="absolute inset-0 -z-10 bg-grain opacity-30" />

      <div class="flex flex-col items-start gap-4">
        <h1 class="font-display text-[clamp(3rem,9vw,6rem)] leading-none text-foreground">
          <span class="text-neon-magenta">내 프로젝트</span>
        </h1>
      </div>
    </section>

    <!-- 프로젝트 목록 영역 -->
    <section class="px-6 pb-20 md:px-10 md:pb-28">
      <!-- 활성 프로젝트 개수 표시 -->
      <div class="mb-6 flex items-center justify-between">
        <div class="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {{ projects.length }} 개의 활성 프로젝트
        </div>
      </div>

      <!-- 로딩 중 상태 -->
      <p
        v-if="isLoading"
        class="mb-4 text-sm text-muted-foreground"
      >
        프로젝트 불러오는 중...
      </p>

      <!-- 에러 상태 -->
      <p
        v-else-if="errorMessage"
        class="mb-4 text-sm text-destructive"
      >
        {{ errorMessage }}
      </p>

      <!-- 프로젝트가 하나도 없는 상태 -->
      <div
        v-else-if="projects.length === 0"
        class="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground"
      >
        프로젝트가 없습니다.
      </div>

      <!-- 프로젝트 목록이 있을 때 카드 리스트 표시 -->
      <div
        v-else
        class="space-y-3"
      >
        <!-- 각 프로젝트 카드는 클릭 가능한 RouterLink -->
        <!-- 클릭 시 /project/{projectId}?name={projectName} 으로 이동 -->
        <RouterLink
          v-for="(project, idx) in projects"
          :key="project.projectId"
          :to="{
            path: `/project/${project.projectId}`,
            query: { name: project.projectName },
          }"
          class="group relative flex flex-col md:flex-row md:items-center justify-between gap-4 overflow-hidden rounded-xl border border-border bg-card px-6 py-6 transition hover:border-primary hover:shadow-neon md:gap-8 md:px-8 md:py-7"
        >
          <!-- 카드 왼쪽: 순번, 아이콘, 트랙/길이/용량(새 위치), 프로젝트명 -->
          <div class="flex min-w-0 items-center gap-5 md:gap-6">
            <span class="shrink-0 font-mono-tight text-[10px] uppercase tracking-widest text-muted-foreground">
              {{ String(idx + 1).padStart(2, '0') }}
            </span>

            <div class="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-secondary text-primary transition group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-neon">
              <component
                :is="getProjectIcon(idx)"
                class="h-5 w-5"
              />
            </div>

            <!-- Length, Size, BARS (제목 앞) -->
            <div class="hidden items-center gap-6 border-r border-border pr-6 md:flex shrink-0">

              <div class="flex flex-col w-16 items-end">
                <span class="text-[9px] uppercase tracking-[0.25em] text-muted-foreground whitespace-nowrap">
                  Length
                </span>
                <span class="mt-1 font-mono-tight text-lg leading-none text-foreground text-right whitespace-nowrap">
                  {{ formatPlayTime(project.totalPlayTime) }}
                </span>
              </div>

              <div class="flex flex-col w-16 items-end">
                <span class="text-[9px] uppercase tracking-[0.25em] text-muted-foreground whitespace-nowrap">
                  Size
                </span>
                <span class="mt-1 font-mono-tight text-lg leading-none text-foreground text-right whitespace-nowrap">
                  {{ formatAudioSize(project.totalAudioSize) }}
                </span>
              </div>

              <div class="flex flex-col w-12 items-end">
                <span class="text-[9px] uppercase tracking-[0.25em] text-muted-foreground whitespace-nowrap">
                  Bars
                </span>
                <span class="mt-1 font-mono-tight text-lg leading-none text-foreground text-right whitespace-nowrap">
                  {{ project.totalBarCount }}
                </span>
              </div>
            </div>

            <!-- 프로젝트 명 -->
            <div class="min-w-0 flex-1">
              <h3 class="truncate font-display text-xl leading-tight tracking-wide text-foreground md:text-2xl">
                {{ project.projectName }}
              </h3>
            </div>
          </div>

          <!-- 카드 오른쪽: 참여 멤버 프로필, 수정 시간, 입장 아이콘 -->
          <div class="flex shrink-0 items-center justify-self-end gap-5">
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

    <!-- 하단 푸터 -->
    <footer class="border-t border-border px-6 py-8 md:px-10">
      <div class="flex flex-col items-center justify-between gap-4 text-[10px] uppercase tracking-[0.3em] text-muted-foreground md:flex-row">
        <div>© 2026 스튜디오 연어</div>

        <div class="flex items-center gap-6">
          <a href="javascript:void(0)" class="opacity-50 cursor-not-allowed">Studion</a>
          <a href="javascript:void(0)" class="opacity-50 cursor-not-allowed">테스트중</a>
          <a href="javascript:void(0)" class="opacity-50 cursor-not-allowed">A205</a>
          <a href="javascript:void(0)" class="opacity-50 cursor-not-allowed">문의와 오류 신고 감사합니다.</a>
        </div>
      </div>
    </footer>
  </main>
</template>