<script setup lang="ts">
import { ref, watch} from 'vue'
import { useRoute} from 'vue-router'
import { projectApi } from '../api/project.api';
import type {CommentDto} from '../types/comment.types'

//기본 props 설정 
const route = useRoute()
const projectId = Number(route.params.projectId)

// 필터 상태 관리 (UI와 v-model 등으로 바인딩 예정)
const isResolvedFilter = ref<boolean>(false) // 기본값: 미해결(false) 탭 활성화
const selectedTrackId = ref<number | undefined>(undefined) // 기본값: 모든 트랙
// 코멘트 데이터 상태
const comments = ref<CommentDto[]>([])
const isLoading = ref<boolean>(false)

// 1. 타입을 먼저 선언
type PanelType = 'comments' | 'history' | 'ai'
// 2. props 선언
const props = defineProps<{
  open: boolean
  type: PanelType | null
}>()
// 3. emit 선언
const emit = defineEmits<{
  (e: 'close'): void
}>()

// API 호출 함수
const fetchComments = async () => {
  try {
    isLoading.value = true
    const response = await projectApi.getComments(projectId, {
      isResolved: isResolvedFilter.value,
      trackId: selectedTrackId.value
      // mentionedMe 옵션은 필요시 추가
    })
    comments.value = response
  } catch (error) {
    console.error('코멘트 목록 조회 실패:', error)
  } finally {
    isLoading.value = false
  }
}
// 사이드 패널이 열리거나 필터(탭, 트랙선택)가 변경될 때마다 API 재호출
watch(
  [() => props.open, isResolvedFilter, selectedTrackId],
  ([isOpen]) => {
    if (isOpen && props.type === 'comments') {
      fetchComments()
    }
  },
  { immediate: true }
)

const panelTitleMap: Record<PanelType, string> = {
  comments: '댓글 목록',
  history: '버전 기록',
  ai: 'AI 기능',
}
</script>

<template>
  <aside
    v-if="open && type"
    class="absolute inset-y-0 right-0 z-30 w-[320px] border-l border-border bg-card shadow-2xl"
  >
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between border-b border-border px-4 py-4">
        <div class="text-sm font-semibold text-foreground">
          {{ panelTitleMap[type] }}
        </div>

        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="flex-1 p-4">
        <div
          class="flex h-full min-h-[260px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground"
        >
          <template v-if="type === 'comments'">
            댓글 목록 영역
          </template>
          <template v-else-if="type === 'history'">
            버전 기록 영역
          </template>
        </div>
      </div>
    </div>
  </aside>
</template>