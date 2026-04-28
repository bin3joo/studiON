<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import type { TrackMeasureCommentGroup, TimelineComment } from './types/comment.types'
import ProjectHeader from './components/ProjectHeader.vue'
import InviteCodeModal from './components/InviteCodeModal.vue'
import ProjectPlaybar from './components/ProjectPlaybar.vue'
import ProjectEditSection from './components/ProjectEditSection.vue'
import ProjectAiSection from './components/ProjectAiSection.vue'
import ProjectSidePanel from './components/ProjectSidePanel.vue'

type SidePanelType = 'comments' | 'history' | 'ai' | null

const route = useRoute()
const projectId = route.params.projectId as string

const isInviteModalOpen = ref(false)
const activeSidePanel = ref<SidePanelType>(null)

const hoveredMeasure = ref<number | null>(null)
const hoveredTrackId = ref<string | null>(null)

const commentGroups = ref<TrackMeasureCommentGroup[]>([
  {
    trackId: 'track-1',
    trackName: '트랙 1',
    measure: 6,
    resolved: false,
    comments: [
      {
        id: 'c1',
        author: '협업자',
        mention: '@사용자1',
        content: '리버브 너무 길어요. 줄여보면 어떨까요?',
        color: '#e6c93e',
      },
    ],
  },
  {
    trackId: 'track-2',
    trackName: '딥 베이스 라인',
    measure: 10,
    resolved: false,
    comments: [
      {
        id: 'c2',
        author: '협업자',
        content: '리버브 너무 길어요. 줄여보면 어떨까요?',
        color: '#e6c93e',
      },
      {
        id: 'c3',
        author: '협업자',
        content: '싫으면 마세요.',
        color: '#e6c93e',
      },
    ],
  },
])

function handleRename() {
  console.log('프로젝트 이름 수정')
}

function handleExport() {
  console.log('내보내기')
}

function handleSaveVersion() {
  console.log('버전 저장')
}

function handleSave() {
  console.log('저장')
}

function handleUndo() {
  console.log('undo')
}

function handleRedo() {
  console.log('redo')
}

function handleOpenInvite() {
  isInviteModalOpen.value = true
}

function handleCloseInvite() {
  isInviteModalOpen.value = false
}

function handleOpenHistory() {
  activeSidePanel.value = 'history'
}

function handleOpenComments() {
  activeSidePanel.value = 'comments'
}

function handleOpenAiPanel() {
  activeSidePanel.value = 'ai'
}

function handleCloseSidePanel() {
  activeSidePanel.value = null
}

function handleHoverMeasure(payload: { trackId: string | null, measure: number | null }) {
  hoveredTrackId.value = payload.trackId
  hoveredMeasure.value = payload.measure
}

function handleSubmitInlineComment(payload: {
  trackId: string
  trackName: string
  measure: number
  content: string
}) {
  const trimmed = payload.content.trim()

  if (!trimmed)
    return

  const target = commentGroups.value.find(group =>
    group.trackId === payload.trackId && group.measure === payload.measure,
  )

  const newComment: TimelineComment = {
    id: crypto.randomUUID(),
    author: '사용자',
    content: trimmed,
    color: '#d93ce6',
  }

  if (target) {
    target.comments.push(newComment)
    target.resolved = false
  }
  else {
    commentGroups.value.push({
      trackId: payload.trackId,
      trackName: payload.trackName,
      measure: payload.measure,
      resolved: false,
      comments: [newComment],
    })
  }
}

function handleResolveComment(payload: {
  trackId: string
  measure: number
}) {
  const targetGroup = commentGroups.value.find(group =>
    group.trackId === payload.trackId && group.measure === payload.measure,
  )

  if (targetGroup) {
    targetGroup.resolved = !targetGroup.resolved
  }
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <ProjectHeader
      :project-name="`프로젝트 ${projectId}`"
      last-saved-at="13:24"
      @rename="handleRename"
      @export="handleExport"
      @save-version="handleSaveVersion"
      @save="handleSave"
      @undo="handleUndo"
      @redo="handleRedo"
      @open-invite="handleOpenInvite"
      @open-comments="handleOpenComments"
      @open-history="handleOpenHistory"
    />

    <ProjectPlaybar @open-ai-panel="handleOpenAiPanel" />

    <section class="px-6 py-4">
      <div class="relative">
        <ProjectEditSection
          :hovered-measure="hoveredMeasure"
          :hovered-track-id="hoveredTrackId"
          :commented-groups="commentGroups"
          @hover-measure="handleHoverMeasure"
          @submit-inline-comment="handleSubmitInlineComment"
          @resolve-comment="handleResolveComment"
        />

        <ProjectSidePanel
          :open="activeSidePanel !== null"
          :type="activeSidePanel"
          @close="handleCloseSidePanel"
        />
      </div>
    </section>

    <ProjectAiSection />

    <InviteCodeModal
      :open="isInviteModalOpen"
      :project-id="projectId"
      @close="handleCloseInvite"
    />
  </div>
</template>