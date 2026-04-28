<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { SmilePlus, ArrowUp, X, Check } from 'lucide-vue-next'
import type { TrackMeasureCommentGroup } from '../types/comment.types'

interface TrackItem {
  id: string
  name: string
}

type Placement = 'top' | 'bottom'

const props = defineProps<{
  tracks: TrackItem[]
  hoveredMeasure: number | null
  hoveredTrackId: string | null
  commentedGroups: TrackMeasureCommentGroup[]
}>()

const emit = defineEmits<{
  (e: 'hover-measure', payload: { trackId: string | null, measure: number | null }): void
  (e: 'submit-inline-comment', payload: {
    trackId: string
    trackName: string
    measure: number
    content: string
  }): void
  (e: 'resolve-comment', payload: {
    trackId: string
    measure: number
  }): void
}>()

const measures = Array.from({ length: 16 }, (_, index) => index + 1)
const draftComment = ref('')
const expandedTrackId = ref<string | null>(null)
const expandedMeasure = ref<number | null>(null)
const expandedPlacement = ref<Placement>('top')
const rootRef = ref<HTMLElement | null>(null)

const COMMENT_BOX_HEIGHT = 280
const VIEWPORT_MARGIN = 24

function hasComment(trackId: string, measure: number) {
  return props.commentedGroups.some(
    group => group.trackId === trackId && group.measure === measure,
  )
}

function getCommentGroup(trackId: string, measure: number) {
  return props.commentedGroups.find(
    group => group.trackId === trackId && group.measure === measure,
  ) ?? null
}

function getPreviewComment(trackId: string, measure: number) {
  return getCommentGroup(trackId, measure)?.comments?.[0] ?? null
}

function isActiveHover(trackId: string, measure: number) {
  return props.hoveredTrackId === trackId && props.hoveredMeasure === measure
}

function isExpanded(trackId: string, measure: number) {
  return expandedTrackId.value === trackId && expandedMeasure.value === measure
}

async function openCommentBox(trackId: string, measure: number, event?: MouseEvent) {
  expandedTrackId.value = trackId
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
  expandedTrackId.value = null
  expandedMeasure.value = null
  draftComment.value = ''
}

function submitComment(trackId: string, trackName: string, measure: number) {
  const trimmed = draftComment.value.trim()

  if (!trimmed)
    return

  emit('submit-inline-comment', {
    trackId,
    trackName,
    measure,
    content: trimmed,
  })

  draftComment.value = ''
}

function handleOutsideClick(event: MouseEvent) {
  if (!rootRef.value)
    return

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
</script>

<template>
  <div
    ref="rootRef"
    class="rounded-2xl border border-border bg-card px-4 py-4"
  >
    <div class="mb-4 text-sm font-semibold text-foreground">
      Timeline
    </div>

    <div class="overflow-visible rounded-xl border border-border bg-[#1f1f1f]">
      <!-- ruler -->
      <div class="relative h-10 border-b border-border">
        <div class="absolute inset-0 flex">
          <div
            v-for="measure in measures"
            :key="`ruler-${measure}`"
            class="relative flex-1"
          >
            <div class="absolute bottom-0 left-1/2 h-full w-px -translate-x-1/2 bg-white/15" />
            <div class="absolute left-1/2 top-2 -translate-x-1/2 text-xs text-muted-foreground">
              {{ measure }}
            </div>
          </div>
        </div>
      </div>

      <!-- lanes -->
      <div>
        <div
          v-for="track in tracks"
          :key="track.id"
          class="relative h-[110px] border-b border-border last:border-b-0 overflow-visible"
        >
          <div class="absolute inset-0 flex">
            <div
              v-for="measure in measures"
              :key="`${track.id}-${measure}`"
              class="relative flex-1"
              @mouseenter="emit('hover-measure', { trackId: track.id, measure })"
              @mouseleave="emit('hover-measure', { trackId: null, measure: null })"
            >
              <!-- 세로선 -->
              <div
                class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-all"
                :class="isActiveHover(track.id, measure) ? 'bg-primary' : 'bg-white/10'"
              />

              <!-- 기존 댓글 마커 -->
              <button
                v-if="hasComment(track.id, measure)"
                type="button"
                class="absolute left-1/2 top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-400 transition hover:scale-110"
                @click.stop="openCommentBox(track.id, measure, $event)"
              />

              <!-- 댓글 없는 경우: hover 시 진입 버튼 -->
              <button
                v-if="isActiveHover(track.id, measure) && !hasComment(track.id, measure) && !isExpanded(track.id, measure)"
                type="button"
                class="absolute left-1/2 top-3 z-20 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-border bg-background/95 text-foreground shadow-md transition hover:border-primary hover:text-primary"
                @click.stop="openCommentBox(track.id, measure, $event)"
              >
                <SmilePlus class="h-4 w-4" />
              </button>

              <!-- 댓글 있는 경우: hover 시 첫 댓글 preview -->
              <button
                v-if="isActiveHover(track.id, measure) && hasComment(track.id, measure) && !isExpanded(track.id, measure)"
                type="button"
                class="absolute left-1/2 top-3 z-20 w-[240px] -translate-x-1/2 rounded-xl border border-white/10 bg-[#353535] p-3 text-left shadow-xl transition hover:border-primary/60"
                @click.stop="openCommentBox(track.id, measure, $event)"
              >
                <div class="mb-1 text-xs font-medium text-[#b5b7c4]">
                  {{ getPreviewComment(track.id, measure)?.author }}
                </div>
                <p class="line-clamp-2 text-sm text-white">
                  {{ getPreviewComment(track.id, measure)?.content }}
                </p>
              </button>

              <!-- 확장 댓글 영역 -->
              <div
                v-if="isExpanded(track.id, measure)"
                class="absolute left-1/2 z-[100] w-[320px] -translate-x-1/2 rounded-2xl border border-white/15 bg-[#353535] p-4 shadow-2xl"
                :class="expandedPlacement === 'top'
                  ? 'bottom-[calc(100%-8px)]'
                  : 'top-[calc(100%-8px)]'"
                @click.stop
              >
                <!-- 상단 액션 -->
                <div class="mb-4 flex items-center justify-end gap-2">
                  <button
                    v-if="getCommentGroup(track.id, measure)"
                    type="button"
                    class="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-[#cdd2dc] transition hover:bg-white/5 hover:text-white"
                    @click.stop="emit('resolve-comment', {
                      trackId: track.id,
                      measure,
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

                <!-- 기존 댓글 -->
                <template v-if="getCommentGroup(track.id, measure)">
                  <div
                    v-for="comment in getCommentGroup(track.id, measure)?.comments"
                    :key="comment.id"
                    class="mb-4 flex gap-3 last:mb-0"
                    :class="getCommentGroup(track.id, measure)?.resolved ? 'opacity-50' : ''"
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
                          v-if="getCommentGroup(track.id, measure)?.resolved"
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

                <!-- 입력 -->
                <div
                  class="mt-4 flex gap-3"
                  :class="getCommentGroup(track.id, measure) ? 'border-t border-white/10 pt-4' : ''"
                >
                  <div class="mt-1 h-6 w-6 shrink-0 rounded-full bg-fuchsia-500" />

                  <div class="flex-1">
                    <div class="flex items-center rounded-2xl border border-white/10 bg-[#313131] pl-4 pr-2">
                      <input
                        v-model="draftComment"
                        type="text"
                        placeholder="댓글 추가"
                        class="h-12 w-full bg-transparent text-[15px] text-white placeholder:text-[#a6a8b3] focus:outline-none"
                        @keydown.enter="submitComment(track.id, track.name, measure)"
                      >

                      <button
                        type="button"
                        class="grid h-10 w-10 place-items-center rounded-full text-[#8f93a5] transition hover:text-white"
                        @click="submitComment(track.id, track.name, measure)"
                      >
                        <ArrowUp class="h-6 w-6" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>