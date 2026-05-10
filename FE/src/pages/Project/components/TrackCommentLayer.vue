<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import { SmilePlus, ArrowUp, X, Check, Trash2 } from 'lucide-vue-next'
import type { TrackMeasureCommentGroup } from '../types/comment.types'
import { useTrackStore } from '../store/useTrackStore';

const trackStore = useTrackStore();

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
}>()

const draftComment = ref('')
const expandedMeasure = ref<number | null>(null)
const expandedPlacement = ref<Placement>('top')
const rootRef = ref<HTMLElement | null>(null)

const COMMENT_BOX_HEIGHT = 280
const VIEWPORT_MARGIN = 24

// [성능 최적화] 마우스 위치에서 셀 위치를 동적으로 계산 (수만 개 div 제거)
const activeCellLocation = ref<number | null>(null)
const activeCellLeft = ref(0)

function calcCellFromMouseX(clientX: number) {
  if (!rootRef.value) return null
  const rect = rootRef.value.getBoundingClientRect()
  const x = clientX - rect.left
  const safeSubDivision = Math.max(1, props.subDivision)
  const subCellW = props.pixelPerBar / safeSubDivision
  const bar = Math.floor(x / props.pixelPerBar) + 1
  const sub = Math.floor((x % props.pixelPerBar) / subCellW)
  const location = bar + sub / safeSubDivision
  const left = (bar - 1) * props.pixelPerBar + sub * subCellW
  return { location, left }
}

function onOverlayMouseMove(e: MouseEvent) {
  const cell = calcCellFromMouseX(e.clientX)
  if (!cell) return
  activeCellLocation.value = cell.location
  activeCellLeft.value = cell.left
  emit('hover-measure', { trackId: props.trackId, measure: cell.location })
}

function onOverlayMouseLeave() {
  // 확장된 댓글 박스가 있으면 위치를 유지
  if (expandedMeasure.value !== null) return
  activeCellLocation.value = null
  emit('hover-measure', { trackId: null, measure: null })
}

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
  expandedMeasure.value = measure
  draftComment.value = ''

  if (event) {
    const triggerRect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const spaceAbove = triggerRect.top - VIEWPORT_MARGIN
    const spaceBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_MARGIN

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

onMounted(() => {
  document.addEventListener('mousedown', handleOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleOutsideClick)
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
</script>

<template>
  <div
    ref="rootRef"
    class="absolute left-0 top-0 z-0 h-full pointer-events-none"
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
        class="pointer-events-auto absolute top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-400 text-black shadow-md transition hover:scale-110"
        :class="cluster.items.length > 1
          ? 'grid min-h-6 min-w-6 place-items-center px-1.5 text-[11px] font-bold'
          : 'h-3 w-3'"
        :style="{ left: `${cluster.x}px` }"
        @click.stop="openCommentCluster(cluster, $event)"
      >
        <template v-if="cluster.items.length > 1">
          {{ cluster.items.length }}
        </template>
      </button>
    </div>

    <!-- [성능 최적화] 투명 오버레이 1개로 수만 개의 셀 div를 대체 -->
    <div
      class="absolute top-0 left-0 h-full pointer-events-auto z-0"
      :data-track-id="props.trackId"
      :style="{ width: `${props.timelineWidth}px` }"
      @mousemove="onOverlayMouseMove"
      @mouseleave="onOverlayMouseLeave"
      @pointerdown.stop="emit('track-pointerdown', $event)"
      @contextmenu.prevent.stop="emit('track-contextmenu', $event)"
    >
      <!-- hover된 마디 세로 강조선 -->
      <div
        v-if="activeCellLocation !== null"
        class="pointer-events-none absolute inset-y-0 w-px bg-primary"
        :style="{ left: `${activeCellLeft}px` }"
      />

      <!-- 댓글 없는 경우: hover 시 댓글 추가 버튼 -->
      <button
        v-if="activeCellLocation !== null && !hasComment(activeCellLocation) && !isExpanded(activeCellLocation)"
        type="button"
        class="pointer-events-auto absolute top-3 z-40 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-border bg-background/95 text-foreground shadow-md transition hover:border-primary hover:text-primary"
        :style="{ left: `${activeCellLeft}px` }"
        @click.stop="openCommentBox(activeCellLocation, $event)"
      >
        <SmilePlus class="h-4 w-4" />
      </button>

      <!-- 댓글 있는 경우: hover 시 preview -->
      <button
        v-if="activeCellLocation !== null && hasComment(activeCellLocation) && !isExpanded(activeCellLocation)"
        type="button"
        class="pointer-events-auto absolute top-3 z-40 w-[240px] -translate-x-1/2 rounded-xl border border-white/10 bg-[#353535] p-3 text-left shadow-xl transition hover:border-primary/60"
        :style="{ left: `${activeCellLeft}px` }"
        @click.stop="openCommentBox(activeCellLocation, $event)"
      >
        <div class="mb-1 text-xs font-medium text-[#b5b7c4]">
          {{ getPreviewComment(activeCellLocation)?.author }}
        </div>
        <p class="line-clamp-2 text-sm text-white">
          {{ getPreviewComment(activeCellLocation)?.content }}
        </p>
      </button>

      <!-- 확장 댓글 박스 -->
      <div
        v-if="activeCellLocation !== null && isExpanded(activeCellLocation)"
        class="pointer-events-auto absolute z-[1200] w-[320px] -translate-x-1/2 rounded-2xl border border-white/15 bg-[#353535] p-4 shadow-2xl"
        :class="expandedPlacement === 'top'
          ? 'bottom-[calc(100%-8px)]'
          : 'top-[calc(100%-8px)]'"
        :style="{ left: `${activeCellLeft}px` }"
        @click.stop
      >
        <div class="mb-4 flex items-center justify-end gap-2">
          <button
            v-if="getCommentGroup(activeCellLocation)"
            type="button"
            class="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-[#cdd2dc] transition hover:bg-white/5 hover:text-white"
            @click.stop="emit('resolve-comment', {
              trackId,
              measure: activeCellLocation,
            })"
          >
            <Check class="h-5 w-5" />
          </button>

          <button
            type="button"
            class="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-[#cdd2dc] transition hover:bg-white/5 hover:text-white"
            @click.stop="closeCommentBox"
          >
            <X class="h-5 w-5" />
          </button>
        </div>

        <template v-if="getCommentGroup(activeCellLocation)">
          <div
            v-for="comment in getCommentGroup(activeCellLocation)?.comments"
            :key="comment.id"
            class="mb-4 flex gap-3 last:mb-0"
            :class="getCommentGroup(activeCellLocation)?.resolved ? 'opacity-50' : ''"
          >
            <div
              class="mt-1 h-6 w-6 shrink-0 rounded-full"
              :style="{ backgroundColor: comment.color }"
            />

            <div class="min-w-0 flex-1">
              <div class="mb-1 flex items-start justify-between gap-2">
  <div class="flex min-w-0 items-center gap-2">
    <div class="truncate text-sm font-medium text-[#b5b7c4]">
      {{ comment.author }}
    </div>

    <span
      v-if="getCommentGroup(activeCellLocation)?.resolved"
      class="shrink-0 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] text-green-400"
    >
      해결됨
    </span>
  </div>

  <button
    type="button"
    class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#8f93a5] transition hover:bg-white/5 hover:text-red-400"
    @click.stop="requestDeleteComment(comment.id)"
  >
    <Trash2 class="h-4 w-4" />
  </button>
</div>

              <div
                v-if="comment.mention"
                class="mb-1 text-[15px] font-semibold text-[#ff33b8]"
              >
                {{ comment.mention }}
              </div>

              <p class="text-[15px] leading-relaxed text-white">
                {{ comment.content }}
              </p>
            </div>
          </div>
        </template>

        <div
          class="mt-4 flex gap-3"
          :class="getCommentGroup(activeCellLocation) ? 'border-t border-white/10 pt-4' : ''"
        >
          <div class="mt-1 h-6 w-6 shrink-0 rounded-full bg-fuchsia-500" />

          <div class="flex-1">
            <div class="flex items-center rounded-2xl border border-white/10 bg-[#313131] pl-4 pr-2">
              <input
                v-model="draftComment"
                type="text"
                placeholder="댓글 추가"
                class="h-12 w-full bg-transparent text-[15px] text-white placeholder:text-[#a6a8b3] focus:outline-none"
                @keydown.enter="submitComment(activeCellLocation!)"
              >

              <button
                type="button"
                class="grid h-10 w-10 place-items-center rounded-full text-[#8f93a5] transition hover:text-white"
                @click="submitComment(activeCellLocation!)"
              >
                <ArrowUp class="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>