<script setup lang="ts">
import type { TrackMeasureCommentGroup } from '../types/comment.types'
import ProjectTimeline from './ProjectTimeline.vue'
import ProjectTrackList from './ProjectTrackList.vue'

const trackNames = [
  { id: 'track-1', name: '트랙 1' },
  { id: 'track-2', name: '딥 베이스 라인' },
  { id: 'track-3', name: '리듬 기타' },
]

defineProps<{
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
</script>

<template>
  <div class="min-h-[360px]">
    <div class="grid h-full grid-cols-[220px_1fr] gap-4">
      <ProjectTrackList :tracks="trackNames.map(track => track.name)" />

      <ProjectTimeline
        :tracks="trackNames"
        :hovered-measure="hoveredMeasure"
        :hovered-track-id="hoveredTrackId"
        :commented-groups="commentedGroups"
        @hover-measure="emit('hover-measure', $event)"
        @submit-inline-comment="emit('submit-inline-comment', $event)"
        @resolve-comment="emit('resolve-comment', $event)"
      />
    </div>
  </div>
</template>