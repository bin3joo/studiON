<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import InviteCodeModal from './components/InviteCodeModal.vue'
import ProjectHeader from './components/ProjectHeader.vue'
import ProjectLayout from './ProjectLayout.vue'
import type { ProjectId } from './types/project.types'

interface Props {
  projectId?: ProjectId
}

const props = defineProps<Props>()
const route = useRoute()
const isInviteCodeModalOpen = ref(false)

const resolvedProjectId = computed<ProjectId>(() => {
  const routeProjectId = route.params.projectId

  if (typeof routeProjectId === 'string' && routeProjectId.length > 0) {
    return routeProjectId
  }

  if (props.projectId !== undefined) {
    return props.projectId
  }

  if (typeof window === 'undefined') {
    return '1'
  }

  const pathSegments = window.location.pathname.split('/').filter(Boolean)
  return pathSegments.at(-1) ?? '1'
})
</script>

<template>
  <ProjectLayout>
    <ProjectHeader @open-invite-code-modal="isInviteCodeModalOpen = true" />

    <div class="mt-6 rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
      <p>프로젝트 페이지 본문 영역</p>
      <p class="mt-2">projectId: {{ resolvedProjectId }}</p>
    </div>

    <InviteCodeModal
      :open="isInviteCodeModalOpen"
      :project-id="resolvedProjectId"
      @close="isInviteCodeModalOpen = false"
    />
  </ProjectLayout>
</template>
