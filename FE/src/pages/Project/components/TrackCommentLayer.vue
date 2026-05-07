<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import { SmilePlus, ArrowUp, X, Check } from 'lucide-vue-next'
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
}>()

const draftComment = ref('')
const expandedMeasure = ref<number | null>(null)
const expandedPlacement = ref<Placement>('top')
const rootRef = ref<HTMLElement | null>(null)

const COMMENT_BOX_HEIGHT = 280
const VIEWPORT_MARGIN = 24

interface CommentCell {
  key: string
  bar: number
  sub: number
  location: number
  left: number
  width: number
}

const commentCells = computed<CommentCell[]>(() => {
  const cells: CommentCell[] = []
  const safeSubDivision = Math.max(1, props.subDivision)

  for (let bar = 1; bar <= props.totalBarCount; bar += 1) {
    for (let sub = 0; sub < safeSubDivision; sub += 1) {
      const location = bar + sub / safeSubDivision

      cells.push({
        key: `${bar}-${sub}`,
        bar,
        sub,
        location,
        left: (bar - 1) * props.pixelPerBar + (sub * props.pixelPerBar) / safeSubDivision,
        width: props.pixelPerBar / safeSubDivision,
      })
    }
  }

  return cells
})

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

function isActiveHover(location: number) {
  return props.hoveredTrackId === props.trackId &&
    props.hoveredMeasure !== null &&
    isSameLocation(props.hoveredMeasure, location)
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

const subCellWidth = computed(() =>
  props.pixelPerBar / Math.max(1, props.subDivision),
)

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

  openCommentBox(firstItem.measure, event)
}
</script>

<template>
  <div
    ref="rootRef"
    class="absolute left-0 top-0 z-100 h-full pointer-events-none"
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
    <div
  v-for="cell in commentCells"
  :key="`${trackId}-${cell.key}-${pixelPerBar}-${subDivision}`"
  class="absolute top-0 h-full pointer-events-none"
  :class="isExpanded(cell.location) ? 'z-500' : 'z-10'"
  :style="{
    left: `${cell.left}px`,
    width: `${cell.width}px`,
  }"
>
      <!-- hover된 마디 세로 강조선 -->
      <div
        v-if="isActiveHover(cell.location)"
        class="pointer-events-none absolute inset-y-0 left-0 w-px bg-primary"
      />

      <!-- 댓글 없는 경우: hover 시 댓글 추가 버튼 -->
      <button
        v-if="isActiveHover(cell.location) && !hasComment(cell.location) && !isExpanded(cell.location)"
        type="button"
        class="pointer-events-auto absolute left-0 top-3 z-40 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-border bg-background/95 text-foreground shadow-md transition hover:border-primary hover:text-primary"
        @click.stop="openCommentBox(cell.location, $event)"
      >
        <SmilePlus class="h-4 w-4" />
      </button>

      <!-- 댓글 있는 경우: hover 시 preview -->
      <button
        v-if="isActiveHover(cell.location) && hasComment(cell.location) && !isExpanded(cell.location)"
        type="button"
        class="pointer-events-auto absolute left-0 top-3 z-40 w-[240px] -translate-x-1/2 rounded-xl border border-white/10 bg-[#353535] p-3 text-left shadow-xl transition hover:border-primary/60"
        @click.stop="openCommentBox(cell.location, $event)"
      >
        <div class="mb-1 text-xs font-medium text-[#b5b7c4]">
          {{ getPreviewComment(cell.location)?.author }}
        </div>
        <p class="line-clamp-2 text-sm text-white">
          {{ getPreviewComment(cell.location)?.content }}
        </p>
      </button>

      <!-- 확장 댓글 박스 -->
      <div
        v-if="isExpanded(cell.location)"
        class="pointer-events-auto absolute left-0 z-1200 w-[320px] -translate-x-1/2 rounded-2xl border border-white/15 bg-[#353535] p-4 shadow-2xl"
        :class="expandedPlacement === 'top'
          ? 'bottom-[calc(100%-8px)]'
          : 'top-[calc(100%-8px)]'"
        @click.stop
      >
        <div class="mb-4 flex items-center justify-end gap-2">
          <button
            v-if="getCommentGroup(cell.location)"
            type="button"
            class="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-[#cdd2dc] transition hover:bg-white/5 hover:text-white"
            @click.stop="emit('resolve-comment', {
              trackId,
              measure: cell.location,
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



        <template v-if="getCommentGroup(cell.location)">
          <div
            v-for="comment in getCommentGroup(cell.location)?.comments"
            :key="comment.id"
            class="mb-4 flex gap-3 last:mb-0"
            :class="getCommentGroup(cell.location)?.resolved ? 'opacity-50' : ''"
          >
            <div
              class="mt-1 h-6 w-6 shrink-0 rounded-full"
              :style="{ backgroundColor: comment.color }"
            />

            <div class="min-w-0 flex-1">
              <div class="mb-1 flex items-center gap-2">
                <div class="text-sm font-medium text-[#b5b7c4]">
                  {{ comment.author }}
                </div>

                <span
                  v-if="getCommentGroup(cell.location)?.resolved"
                  class="rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] text-green-400"
                >
                  해결됨
                </span>
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
          :class="getCommentGroup(cell.location) ? 'border-t border-white/10 pt-4' : ''"
        >
          <div class="mt-1 h-6 w-6 shrink-0 rounded-full bg-fuchsia-500" />

          <div class="flex-1">
            <div class="flex items-center rounded-2xl border border-white/10 bg-[#313131] pl-4 pr-2">
              <input
                v-model="draftComment"
                type="text"
                placeholder="댓글 추가"
                class="h-12 w-full bg-transparent text-[15px] text-white placeholder:text-[#a6a8b3] focus:outline-none"
                @keydown.enter="submitComment(cell.location)"
              >

              <button
                type="button"
                class="grid h-10 w-10 place-items-center rounded-full text-[#8f93a5] transition hover:text-white"
                @click="submitComment(cell.location)"
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