<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, computed, watch } from 'vue'
import { SmilePlus, ArrowUpCircle, X, Check, Trash2 } from 'lucide-vue-next'
import { useAuthStore } from '@/pages/Onboarding/stores/auth.store'
import type { TrackMeasureCommentGroup, TimelineComment } from '../types/comment.types'
import { useTrackStore } from '../store/useTrackStore';

const trackStore = useTrackStore();
const authStore = useAuthStore()

const currentUserProfileImageUrl = computed(() => {
  if (!authStore.accessToken) return null
  try {
    const payload = JSON.parse(atob(authStore.accessToken.split('.')[1]))
    return payload.profileImgUrl || null
  } catch(e) {
    return null
  }
})

type Placement = 'top' | 'bottom'

const props = defineProps<{
  trackId: string
  trackName: string
  totalBarCount: number
  pixelPerBar: number
  subDivision: number
  timelineWidth: number
  hoveredMeasure: number | null
  hoveredTrackId: string | null
  commentedGroups: TrackMeasureCommentGroup[]
}>()

const emit = defineEmits<{
    'hover-measure': [payload: {
    trackId: string | null
    measure: number | null
  }]
  'submit-inline-comment': [payload: {
    trackId: string
    trackName: string
    measure: number
    content: string
  }]
  'resolve-comment': [payload: {
    trackId: string
    measure: number
  }]
  'delete-comment': [payload: {
    commentId: number
  }]
  'track-contextmenu': [event: MouseEvent]
  'track-pointerdown': [event: MouseEvent]
  'comment-expanded': [isExpanded: boolean]
}>()

const draftComment = ref('')
const expandedMeasure = ref<number | null>(null)
const expandedCellLeft = ref(0)
const expandedPlacement = ref<Placement>('bottom')
const rootRef = ref<HTMLElement | null>(null)

const COMMENT_BOX_HEIGHT = 280
const VIEWPORT_MARGIN = 24

// [성능 최적화] 마우스 위치에서 셀 위치를 동적으로 계산 (수만 개 div 제거)
const activeCellLocation = ref<number | null>(null)
const activeCellLeft = ref(0)

// 작성자별 고유 색상 생성기 (간단한 해시)
const userColors = ['#00D06C', '#FFD700', '#FF3DCB', '#00E5FF', '#FF5722', '#B400FF']
function getAuthorColor(authorName: string) {
  if (!authorName) return userColors[0]
  let hash = 0
  for (let i = 0; i < authorName.length; i++) {
    hash = authorName.charCodeAt(i) + ((hash << 5) - hash)
  }
  return userColors[Math.abs(hash) % userColors.length]
}

let hideTimeout: ReturnType<typeof setTimeout> | null = null
const isButtonHovered = ref(false)

const onButtonMouseLeave = () => {
  isButtonHovered.value = false
  if (props.hoveredTrackId !== props.trackId || props.hoveredMeasure === null) {
    activeCellLocation.value = null
  } else {
    updateCellLocation(props.hoveredMeasure)
  }
}

function updateCellLocation(newVal: number) {
  activeCellLocation.value = newVal
  const safeSubDivision = Math.max(1, props.subDivision)
  const totalSubs = Math.round((newVal - 1) * safeSubDivision)
  const bar = Math.floor(totalSubs / safeSubDivision) + 1
  const sub = totalSubs % safeSubDivision
  const subCellW = props.pixelPerBar / safeSubDivision
  activeCellLeft.value = (bar - 1) * props.pixelPerBar + sub * subCellW
}

watch(() => [props.hoveredMeasure, props.hoveredTrackId], ([newMeasure, newTrackId]) => {
  if (newMeasure === null || newTrackId !== props.trackId) {
    if (hideTimeout) return
    hideTimeout = setTimeout(() => {
      activeCellLocation.value = null
    }, 50)
    return
  }

  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }

  // 버튼에 마우스가 올라가 있다면 위치를 고정 (마우스가 옆으로 살짝 새어도 도망가지 않음)
  if (isButtonHovered.value) return

  updateCellLocation(newMeasure as number)
}, { immediate: true })

function isSameLocation(a: number, b: number) {
  return Math.abs(a - b) < 0.0001
}

function hasComment(location: number) {
  return props.commentedGroups.some(
    group =>
      group.trackId === props.trackId &&
      isSameLocation(group.measure, location),
  )
}

function getCommentGroup(location: number) {
  return props.commentedGroups.find(
    group =>
      group.trackId === props.trackId &&
      isSameLocation(group.measure, location),
  ) ?? null
}

function getPreviewComment(location: number) {
  return getCommentGroup(location)?.comments?.[0] ?? null
}

function isExpanded(location: number) {
  return expandedMeasure.value !== null &&
    isSameLocation(expandedMeasure.value, location)
}

async function openCommentBox(measure: number, event?: MouseEvent) {
  isButtonHovered.value = false
  document.dispatchEvent(new CustomEvent('close-other-comments', { detail: props.trackId }))
  
  expandedMeasure.value = measure

  const safeSubDivision = Math.max(1, props.subDivision)
  const totalSubs = Math.round((measure - 1) * safeSubDivision)
  const bar = Math.floor(totalSubs / safeSubDivision) + 1
  const sub = totalSubs % safeSubDivision
  const subCellW = props.pixelPerBar / safeSubDivision
  expandedCellLeft.value = (bar - 1) * props.pixelPerBar + sub * subCellW

  nextTick(() => {
    draftComment.value = ''
    emit('comment-expanded', true)
  })

  if (event) {
    const triggerRect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    
    // 타임라인 컨테이너의 영역을 기준으로 가용 공간 계산
    const scrollContainer = rootRef.value?.closest('.custom-scrollbar') as HTMLElement | null
    const containerRect = scrollContainer ? scrollContainer.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
    
    const spaceAbove = triggerRect.top - containerRect.top - VIEWPORT_MARGIN
    const spaceBelow = containerRect.bottom - triggerRect.bottom - VIEWPORT_MARGIN

    if (spaceBelow >= COMMENT_BOX_HEIGHT) {
      expandedPlacement.value = 'bottom'
    }
    else if (spaceAbove >= COMMENT_BOX_HEIGHT) {
      expandedPlacement.value = 'top'
    }
    else {
      expandedPlacement.value = spaceBelow > spaceAbove ? 'bottom' : 'top'
    }
  }
  else {
    await nextTick()
    expandedPlacement.value = 'top'
  }
}

function closeCommentBox() {
  expandedMeasure.value = null
  draftComment.value = ''
  activeCellLocation.value = null
  emit('hover-measure', { trackId: null, measure: null })
  emit('comment-expanded', false)
}

function submitComment(measure: number) {
  const trimmed = draftComment.value.trim()

  if (!trimmed) return

  emit('submit-inline-comment', {
    trackId: props.trackId,
    trackName: props.trackName,
    measure,
    content: trimmed,
  })

  draftComment.value = ''
}

function requestDeleteComment(commentId: string | number) {
  const parsedCommentId = Number(commentId)

  if (!Number.isInteger(parsedCommentId)) {
    console.error('[댓글 삭제 실패] 유효하지 않은 commentId:', commentId)
    return
  }

  emit('delete-comment', {
    commentId: parsedCommentId,
  })
}

function handleOutsideClick(event: MouseEvent) {
  if (!rootRef.value) return

  const target = event.target as Node

  if (!rootRef.value.contains(target)) {
    closeCommentBox()
  }
}

function handleCloseOtherComments(e: Event) {
  const customEvent = e as CustomEvent
  if (customEvent.detail !== props.trackId) {
    closeCommentBox()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleOutsideClick)
  document.addEventListener('close-other-comments', handleCloseOtherComments)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleOutsideClick)
  document.removeEventListener('close-other-comments', handleCloseOtherComments)
})

// 댓글 마커 클러스터링
interface FlatCommentMarker {
  measure: number
  x: number
  group: TrackMeasureCommentGroup
}

interface CommentCluster {
  x: number
  items: FlatCommentMarker[]
}

const flatCommentMarkers = computed<FlatCommentMarker[]>(() => {
  return props.commentedGroups
    .filter(group => group.trackId === props.trackId)
    .map(group => ({
      measure: group.measure,
      x: (group.measure - 1) * props.pixelPerBar,
      group,
    }))
    .sort((a, b) => a.x - b.x)
})

const shouldClusterComments = computed(() =>
  props.pixelPerBar < 120,
)

const clusterMergeDistance = computed(() =>
  shouldClusterComments.value ? 40 : 0,
)

const clusteredCommentMarkers = computed<CommentCluster[]>(() => {
  const markers = flatCommentMarkers.value

  if (!markers.length) return []

  if (!shouldClusterComments.value) {
    return markers.map(marker => ({
      x: marker.x,
      items: [marker],
    }))
  }

  const clusters: CommentCluster[] = []

  for (const marker of markers) {
    const lastCluster = clusters[clusters.length - 1]

    if (!lastCluster) {
      clusters.push({
        x: marker.x,
        items: [marker],
      })
      continue
    }

    const lastClusterX = lastCluster.x

    if (marker.x - lastClusterX <= clusterMergeDistance.value) {
      lastCluster.items.push(marker)
      lastCluster.x =
        lastCluster.items.reduce((sum, item) => sum + item.x, 0) /
        lastCluster.items.length
    }
    else {
      clusters.push({
        x: marker.x,
        items: [marker],
      })
    }
  }

  return clusters
})

function openCommentCluster(cluster: CommentCluster, event: MouseEvent) {
  const firstItem = cluster.items[0]

  if (!firstItem) return

  activeCellLocation.value = firstItem.measure
  activeCellLeft.value = firstItem.x
  openCommentBox(firstItem.measure, event)
}
function parseMentions(content: string) {
  if (!content) return []
  const regex = /(@\S+)/g
  const parts = content.split(regex)
  return parts.map(part => ({
    text: part,
    isMention: part.startsWith('@')
  }))
}
</script>

<template>
  <div
    ref="rootRef"
    class="absolute left-0 top-0 h-full pointer-events-none"
    :style="{
      width: `${props.timelineWidth}px`,
      minWidth: `${props.timelineWidth}px`,
    }"
  >
<!-- 등록된 댓글 마커 / 클러스터 레이어 -->
    <div class="pointer-events-none absolute inset-0 z-40">
      <button
        v-for="cluster in clusteredCommentMarkers"
        :key="`${trackId}-cluster-${cluster.x}-${cluster.items.length}`"
        type="button"
        class="pointer-events-auto absolute top-0 -translate-y-1/2 z-40 translate-x-0.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-[6px] border px-1.5 shadow-md transition hover:border-primary before:absolute before:-inset-3 before:content-['']"
        :class="cluster.items[0].group.resolved ? 'border-green-500 bg-[#1c1c1c]' : 'border-white/20 bg-[#1c1c1c]'"
        :style="{ left: `${cluster.x}px` }"
        @mousedown.stop.prevent="openCommentCluster(cluster, $event)"
      >
        <template v-if="cluster.items.length === 1">
          <div class="flex h-[18px] w-[18px] overflow-hidden items-center justify-center rounded-full" :style="{ backgroundColor: cluster.items[0].group.comments[0]?.profileImageUrl ? 'transparent' : getAuthorColor(cluster.items[0].group.comments[0]?.author || '') }">
            <img v-if="cluster.items[0].group.comments[0]?.profileImageUrl" :src="cluster.items[0].group.comments[0]?.profileImageUrl || undefined" class="h-full w-full object-cover" />
            <span v-else class="text-[8px] font-bold text-white/90">{{ cluster.items[0].group.comments[0]?.author?.slice(0, 2) || '' }}</span>
          </div>
        </template>
        <template v-else>
          <div class="flex items-center gap-1">
            <div class="flex h-[18px] w-[18px] overflow-hidden items-center justify-center rounded-full" :style="{ backgroundColor: cluster.items[0].group.comments[0]?.profileImageUrl ? 'transparent' : getAuthorColor(cluster.items[0].group.comments[0]?.author || '') }">
              <img v-if="cluster.items[0].group.comments[0]?.profileImageUrl" :src="cluster.items[0].group.comments[0]?.profileImageUrl || undefined" class="h-full w-full object-cover" />
              <span v-else class="text-[8px] font-bold text-white/90">{{ cluster.items[0].group.comments[0]?.author?.slice(0, 2) || '' }}</span>
            </div>
            <span class="text-[10px] font-bold text-white">{{ cluster.items.length }}</span>
          </div>
        </template>
      </button>
    </div>

    <!-- [성능 최적화] 투명 오버레이 1개로 수만 개의 셀 div를 대체 -->
    <div
      class="absolute top-0 left-0 h-full pointer-events-none"
      :class="trackStore.isCommentMode ? 'z-20' : 'z-auto'"
      :data-track-id="props.trackId"
      :style="{ width: `${props.timelineWidth}px` }"
      @pointerdown.stop="emit('track-pointerdown', $event)"
      @contextmenu.prevent.stop="emit('track-contextmenu', $event)"
    >
      <!-- hover된 마디 세로 강조선 -->
      <div
        v-if="trackStore.isCommentMode && activeCellLocation !== null"
        class="pointer-events-none absolute inset-y-0 w-px bg-primary"
        :style="{ left: `${activeCellLeft}px` }"
      />

      <!-- 댓글 없는 경우: hover 시 댓글 추가 버튼 -->
      <button
        v-if="trackStore.isCommentMode && activeCellLocation !== null && !hasComment(activeCellLocation) && !isExpanded(activeCellLocation)"
        type="button"
        class="pointer-events-auto absolute top-0 -translate-y-1/2 z-40 grid h-7 w-7 translate-x-0.5 place-items-center rounded-full border border-white/20 bg-[#282828] text-white shadow-md transition hover:border-primary hover:text-primary before:absolute before:-inset-4 before:content-['']"
        :style="{ left: `${activeCellLeft}px` }"
        @mousedown.stop.prevent="openCommentBox(activeCellLocation, $event)"
        @mouseenter="isButtonHovered = true"
        @mouseleave="onButtonMouseLeave"
      >
        <SmilePlus class="h-4 w-4 relative z-10" />
      </button>

      <!-- 댓글 있는 경우: hover 시 preview -->
      <button
        v-if="trackStore.isCommentMode && activeCellLocation !== null && hasComment(activeCellLocation) && !isExpanded(activeCellLocation)"
        type="button"
        class="pointer-events-auto absolute top-0 -translate-y-1/2 z-40 flex h-[26px] max-w-[300px] translate-x-0.5 items-center gap-2 overflow-hidden whitespace-nowrap rounded-[6px] border border-white/20 bg-[#1c1c1c] px-2.5 shadow-xl transition hover:border-primary"
        :style="{ left: `${activeCellLeft}px` }"
        @mousedown.stop.prevent="openCommentBox(activeCellLocation, $event)"
        @mouseenter="isButtonHovered = true"
        @mouseleave="onButtonMouseLeave"
      >
        <div class="flex h-5 w-5 shrink-0 overflow-hidden items-center justify-center rounded-full" :style="{ backgroundColor: getPreviewComment(activeCellLocation)?.profileImageUrl ? 'transparent' : getAuthorColor(getPreviewComment(activeCellLocation)?.author || '') }">
          <img v-if="getPreviewComment(activeCellLocation)?.profileImageUrl" :src="getPreviewComment(activeCellLocation)?.profileImageUrl || undefined" class="h-full w-full object-cover" />
          <span v-else class="text-[9px] font-bold text-white/90">{{ getPreviewComment(activeCellLocation)?.author?.slice(0, 2) || '' }}</span>
        </div>
        <div class="shrink-0 text-[11px] font-medium text-white/60">
          {{ getPreviewComment(activeCellLocation)?.author }}
        </div>
        <p class="truncate text-[11px] text-white">
          {{ getPreviewComment(activeCellLocation)?.content }}
        </p>
      </button>

      <!-- 확장 댓글 박스 -->
      <div
        v-if="expandedMeasure !== null"
        class="pointer-events-auto absolute z-120 w-[300px] -translate-x-1/2 rounded-[6px] border border-white/20 bg-[#1c1c1c] shadow-2xl p-3"
        :class="expandedPlacement === 'top' ? 'bottom-[calc(100%+20px)]' : 'top-[20px]'"
        :style="{ left: `calc(${expandedCellLeft}px + 13px)` }"
        @mousedown.stop
        @click.stop
      >
        <!-- 말풍선 꼬리 (Arrow) -->
        <div 
          class="absolute left-1/2 -translate-x-1/2 h-3.5 w-3.5 rotate-45 border-white/20 bg-[#1c1c1c]"
          :class="expandedPlacement === 'top' ? 'bottom-[-7.5px] border-b border-r' : 'top-[-7.5px] border-t border-l'"
        ></div>

        <!-- 공통 헤더: 트랙 이름 & 마디 수 -->
        <div class="mb-2.5 flex items-center justify-between border-b border-white/10 pb-2">
          <span class="text-[11px] font-semibold text-white/50">
            {{ trackStore.masterTrack.trackId === Number(props.trackId) ? trackStore.masterTrack.name : (trackStore.trackList.find(t => String(t.trackId) === props.trackId)?.name || `트랙 ${props.trackId}`) }} · {{ expandedMeasure }}마디
          </span>
          <!-- 닫기 버튼 -->
          <button
            class="shrink-0 transition hover:scale-110"
            @click.stop="closeCommentBox"
            title="닫기"
          >
            <X class="h-3.5 w-3.5 text-white/40 hover:text-white" />
          </button>
        </div>

        <!-- 새 댓글 달기 (Empty State) -->
        <div v-if="!getCommentGroup(expandedMeasure)" class="relative z-10 flex items-center gap-2">
          <div class="flex h-5 w-5 shrink-0 overflow-hidden items-center justify-center rounded-full bg-[#FF3DCB]">
            <img v-if="currentUserProfileImageUrl" :src="currentUserProfileImageUrl || undefined" class="h-full w-full object-cover" />
            <span v-else class="text-[9px] font-bold text-white/90">나</span>
          </div>
          <input
            v-model="draftComment"
            type="text"
            placeholder="댓글 추가"
            class="flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-white/40"
            @keydown.enter.prevent="submitComment(expandedMeasure)"
          />
          <button
            class="shrink-0 transition hover:scale-110 disabled:opacity-50"
            :disabled="!draftComment.trim()"
            @click="submitComment(expandedMeasure)"
          >
            <ArrowUpCircle class="h-4 w-4 text-white/40 hover:text-white" />
          </button>
        </div>

        <!-- 댓글 목록 & 입력 (Populated State) -->
        <div v-else class="relative z-10 flex flex-col">
          <!-- 댓글 목록 -->
          <div class="flex max-h-[300px] flex-col gap-3 overflow-y-auto custom-scrollbar">
            <div
              v-for="(comment, idx) in getCommentGroup(expandedMeasure)?.comments || []"
              :key="comment.id"
              class="group flex flex-col gap-1"
              :class="getCommentGroup(expandedMeasure)?.resolved ? 'opacity-50' : ''"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="flex h-5 w-5 shrink-0 overflow-hidden items-center justify-center rounded-full" :style="{ backgroundColor: comment.profileImageUrl ? 'transparent' : (comment.color || getAuthorColor(comment.author)) }">
                    <img v-if="comment.profileImageUrl" :src="comment.profileImageUrl || undefined" class="h-full w-full object-cover" />
                    <span v-else class="text-[9px] font-bold text-white/90">{{ comment.author.slice(0, 2) }}</span>
                  </div>
                  <span class="text-[11px] font-medium text-white/60">{{ comment.author }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <button
                    class="opacity-0 transition-opacity group-hover:opacity-100"
                    @click.stop="requestDeleteComment(comment.id)"
                    title="삭제"
                  >
                    <Trash2 class="h-3.5 w-3.5 text-white/40 hover:text-red-400" />
                  </button>
                  <button
                    v-if="idx === 0"
                    class="transition-colors"
                    :class="getCommentGroup(expandedMeasure)?.resolved ? 'text-green-500' : 'text-white hover:text-green-400'"
                    @click.stop="emit('resolve-comment', { trackId, measure: expandedMeasure })"
                    title="해결됨 표시"
                  >
                    <Check class="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div class="pl-[18px]">
                <p class="whitespace-pre-wrap text-[11px] leading-relaxed text-white">
                  <template v-for="(part, i) in parseMentions(comment.mention ? comment.mention + ' \n' + comment.content : comment.content)" :key="i">
                    <span v-if="part.isMention" class="font-medium text-[#FF3DCB]">{{ part.text }}</span>
                    <span v-else>{{ part.text }}</span>
                  </template>
                </p>
              </div>
            </div>
          </div>

          <!-- 댓글 입력 줄 -->
          <div class="mt-3 flex items-center gap-2">
            <div class="flex h-5 w-5 shrink-0 overflow-hidden items-center justify-center rounded-full bg-[#FF3DCB]">
              <img v-if="currentUserProfileImageUrl" :src="currentUserProfileImageUrl || undefined" class="h-full w-full object-cover" />
              <span v-else class="text-[9px] font-bold text-white/90">나</span>
            </div>
            <div class="flex flex-1 items-center justify-between rounded-[6px] border border-white/15 bg-transparent px-2.5 py-1.5">
              <input
                v-model="draftComment"
                type="text"
                placeholder="댓글 추가"
                class="flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-white/40"
                @keydown.enter.prevent="submitComment(expandedMeasure)"
              />
              <button
                class="shrink-0 transition hover:scale-110 disabled:opacity-50"
                :disabled="!draftComment.trim()"
                @click="submitComment(expandedMeasure)"
              >
                <ArrowUpCircle class="h-4 w-4 text-white/40 hover:text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>