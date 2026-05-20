<script setup lang="ts">
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { MessageSquare, X, Filter, Download, Trash2, History } from 'lucide-vue-next'
import { useCommentStore } from '../store/useCommentStore'
import { useTrackStore } from '../store/useTrackStore'
import { useAudioVersionStore } from '../store/useAudioVersionStore'
import CommentItem from './CommentItem.vue'
import { computed } from 'vue'
import { useAuthStore } from '@/pages/Onboarding/stores/auth.store'

// 기본 props 설정 
const route = useRoute()
const projectId = Number(route.params.projectId)

const commentStore = useCommentStore()
const trackStore = useTrackStore()
const audioVersionStore = useAudioVersionStore()
const authStore = useAuthStore()

const currentUserNickname = computed(() => {
  if (!authStore.accessToken) return null
  try {
    const payload = JSON.parse(atob(authStore.accessToken.split('.')[1]))
    // JWT의 subject(sub)가 userId입니다.
    const userId = Number(payload.sub)
    if (!userId) return null
    
    // projectMembers에서 내 정보 찾기
    const me = trackStore.projectMembers.find(m => m.userId === userId)
    return me ? me.nickname : null
  } catch(e) {
    return null
  }
})

const filteredComments = computed(() => {
  // 1. 백엔드에서 모든 코멘트를 가져오므로, 프론트엔드에서 isResolved 상태를 직접 필터링합니다.
  let result = commentStore.comments.filter(comment => comment.isResolved === commentStore.isResolvedFilter)
  if (commentStore.selectedTrackId !== undefined) {
    result = result.filter(comment => comment.trackId === commentStore.selectedTrackId)
  }

  // 2. 멘션 필터링
  if (!commentStore.isMentionedFilter) return result
  
  const myNickname = currentUserNickname.value
  if (!myNickname) return []
  
  const mentionPattern = `@${myNickname}`
  
  return result.filter(comment => {
    // 1. 코멘트 본문에 멘션이 포함되어 있는지
    const hasMentionInContent = comment.content.includes(mentionPattern)
    
    // 2. 대댓글 중 하나라도 멘션이 포함되어 있는지
    const hasMentionInReplies = comment.replies && comment.replies.some((reply: any) => 
      reply.content.includes(mentionPattern)
    )
    
    return hasMentionInContent || hasMentionInReplies
  })
})

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
  (e: 'add-reply', parentCommentId: number, content: string, mentionedUserIds: number[]): void
}>()

// 사이드 패널이 열리거나 필터(탭, 트랙선택)가 변경될 때마다 API 재호출
watch(
  [() => props.open, () => props.type, () => commentStore.isResolvedFilter],
  ([isOpen, currentType]) => {
    if (isOpen) {
      if (currentType === 'comments') {
        commentStore.fetchComments(projectId)
      } else if (currentType === 'history') {
        audioVersionStore.fetchVersions(projectId)
      }
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

// 유틸리티 포맷 함수
const formatDuration = (ms: number) => {
  if (!ms) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const formatSize = (bytes: number) => {
  if (!bytes) return '0 MB'
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(2)} MB`
}

const formatDate = (dateString: string) => {
  if (!dateString) return ''
  const d = new Date(dateString)
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const handleDownloadVersion = async (versionId: number, name: string) => {
  await audioVersionStore.downloadVersion(projectId, versionId, name)
}

const handleDeleteVersion = async (versionId: number) => {
  if (confirm('정말로 이 버전을 삭제하시겠습니까?')) {
    await audioVersionStore.removeVersion(projectId, versionId)
  }
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
      <div class="flex items-center gap-2 text-xs font-semibold">
        <MessageSquare v-if="type === 'comments'" class="h-4 w-4" />
        <History v-else-if="type === 'history'" class="h-4 w-4" />
        <div v-else class="h-4 w-4"></div>
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
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
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
          
          <button
            class="flex items-center gap-1.5 whitespace-nowrap rounded-md border py-2 px-3 text-xs transition"
            :class="commentStore.isMentionedFilter ? 'border-primary text-primary bg-primary/10' : 'border-white/10 text-gray-400 hover:text-white hover:border-white/30'"
            @click="commentStore.isMentionedFilter = !commentStore.isMentionedFilter"
            title="나를 멘션한 코멘트만 보기"
          >
            <span class="font-bold text-[13px] leading-none">@</span> 언급됨
          </button>
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
            v-for="comment in filteredComments"
            :key="comment.commentId"
            :comment="comment"
            :track-name="getTrackName(comment.trackId)"
            @resolve="emit('resolve-comment', $event)"
            @add-reply="(parent, content, ids) => emit('add-reply', parent, content, ids)"
          />
        </template>
      </div>
    </template>

    <!-- 버전 기록 패널 내용 -->
    <template v-else-if="type === 'history'">
      <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div v-if="audioVersionStore.isLoading" class="text-center text-xs text-gray-500 mt-10">
          불러오는 중...
        </div>
        <div v-else-if="!audioVersionStore.versions || audioVersionStore.versions.length === 0" class="text-center text-xs text-gray-500 mt-10">
          저장된 버전 기록이 없습니다.
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="version in audioVersionStore.versions"
            :key="version.versionId"
            class="rounded-lg border border-white/10 bg-[#262626] p-3 transition hover:border-primary/50"
          >
            <div class="mb-1 flex items-start justify-between">
              <h4 class="text-sm font-semibold text-white break-all pr-2">{{ version.name }}</h4>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  class="rounded p-1.5 text-gray-400 hover:bg-primary/20 hover:text-primary transition"
                  title="다운로드"
                  @click="handleDownloadVersion(version.versionId, version.name)"
                >
                  <Download class="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  class="rounded p-1.5 text-gray-400 hover:bg-destructive/20 hover:text-destructive transition"
                  title="삭제"
                  @click="handleDeleteVersion(version.versionId)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            
            <p v-if="version.memo" class="mb-2 text-xs text-gray-400 line-clamp-2">{{ version.memo }}</p>
            
            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
              <span class="flex items-center gap-1"><History class="h-3 w-3" /> {{ formatDate(version.createdAt) }}</span>
              <span>{{ formatDuration(version.durationMs) }}</span>
              <span>{{ formatSize(version.sizeBytes) }}</span>
            </div>
          </div>
        </div>
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
