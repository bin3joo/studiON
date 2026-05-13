<script setup lang="ts">
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { MessageSquare, X, Filter } from 'lucide-vue-next'
import { useCommentStore } from '../store/useCommentStore'
import { useTrackStore } from '../store/useTrackStore'
import CommentItem from './CommentItem.vue'

// 기본 props 설정 
const route = useRoute()
const projectId = Number(route.params.projectId)

const commentStore = useCommentStore()
const trackStore = useTrackStore()

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
  (e: 'resolve-comment', commentId: number): void
  (e: 'add-reply', parentCommentId: number, content: string): void
}>()

// 사이드 패널이 열리거나 필터(탭, 트랙선택)가 변경될 때마다 API 재호출
watch(
  [() => props.open, () => commentStore.isResolvedFilter, () => commentStore.selectedTrackId],
  ([isOpen]) => {
    if (isOpen && props.type === 'comments') {
      commentStore.fetchComments(projectId)
    }
  },
  { immediate: true }
)

const panelTitleMap: Record<PanelType, string> = {
  comments: '코멘트',
  history: '버전 기록',
  ai: 'AI 기능',
}

// 필터 변경 핸들러
const setResolvedFilter = (val: boolean) => {
  commentStore.isResolvedFilter = val
}

const getTrackName = (trackId: number) => {
  if (trackId === 999999) return '마스터 트랙'
  const track = trackStore.trackList.find(t => t.trackId === trackId)
  return track ? track.name : `트랙 ${trackId}`
}
</script>

<template>
  <!-- 우측 슬라이드 패널 -->
  <aside
    v-if="open && type"
    class="absolute right-0 top-0 bottom-0 z-[200] flex w-[320px] flex-col border-l border-white/10 bg-[#1c1c1c] shadow-2xl"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-white/10 px-4 py-4 text-white">
      <MessageSquare v-if="type === 'comments'" class="h-4 w-4" />
      <div v-else class="h-4 w-4"></div>
      
      <div class="text-xs font-semibold">
        {{ panelTitleMap[type] }}
      </div>

      <button
        type="button"
        class="inline-flex h-6 w-6 items-center justify-center rounded border border-white/10 text-gray-400 transition hover:bg-white/10 hover:text-white"
        @click="emit('close')"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- 코멘트 패널 내용 -->
    <template v-if="type === 'comments'">
      <!-- Tabs -->
      <div class="border-b border-white/10 p-4 pb-0">
        <div class="flex w-full overflow-hidden rounded-lg bg-black p-1 text-xs text-gray-400">
          <button
            class="flex-1 rounded-md py-2 transition"
            :class="!commentStore.isResolvedFilter ? 'bg-[#262626] text-white shadow' : 'hover:text-white'"
            @click="setResolvedFilter(false)"
          >
            미해결
          </button>
          <button
            class="flex-1 rounded-md py-2 transition"
            :class="commentStore.isResolvedFilter ? 'bg-[#262626] text-white shadow' : 'hover:text-white'"
            @click="setResolvedFilter(true)"
          >
            해결
          </button>
        </div>
      </div>

      <!-- Filter Dropdown -->
      <div class="border-b border-white/10 p-4">
        <div class="relative">
          <Filter class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            v-model="commentStore.selectedTrackId"
            class="w-full appearance-none rounded-md border border-white/10 bg-[#1c1c1c] py-2 pl-9 pr-8 text-xs text-gray-300 outline-none focus:border-white/30"
          >
            <option :value="undefined">모든 트랙</option>
            <!-- trackStore에서 트랙 목록 가져와 렌더링 -->
            <option v-for="track in trackStore.trackList" :key="track.trackId" :value="track.trackId">
              {{ track.name }}
            </option>
          </select>
          <div class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <svg class="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      <!-- List -->
      <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div v-if="commentStore.isLoading" class="text-center text-xs text-gray-500 mt-10">
          불러오는 중...
        </div>
        <div v-else-if="commentStore.comments.length === 0" class="text-center text-xs text-gray-500 mt-10">
          코멘트가 없습니다.
        </div>
        <template v-else>
          <CommentItem
            v-for="comment in commentStore.comments"
            :key="comment.commentId"
            :comment="comment"
            :track-name="getTrackName(comment.trackId)"
            @resolve="emit('resolve-comment', $event)"
            @add-reply="(parent, content) => emit('add-reply', parent, content)"
          />
        </template>
      </div>
    </template>

    <!-- 다른 패널들 -->
    <div v-else class="flex-1 p-4">
      <div class="flex h-full min-h-[260px] items-center justify-center rounded-xl border border-dashed border-white/20 text-xs text-gray-500">
        {{ panelTitleMap[type] }} 내역이 없습니다.
      </div>
    </div>
  </aside>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}
</style>