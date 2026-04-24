<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import ProjectHeader from './components/ProjectHeader.vue'
import InviteCodeModal from './components/InviteCodeModal.vue'

const route = useRoute()
const projectId = route.params.projectId as string

const isInviteModalOpen = ref(false)

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

function handleOpenComments() {
  console.log('코멘트 열기')
}

function handleOpenHistory() {
  console.log('버전 기록 열기')
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

    <main class="p-6">
      프로젝트 본문
    </main>

    <InviteCodeModal
      :open="isInviteModalOpen"
      :project-id="projectId"
      @close="handleCloseInvite"
    />
  </div>
</template>