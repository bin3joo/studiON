<script setup lang="ts">
import InviteCodeButton from './InviteCodeButton.vue'

defineProps<{
  title?: string
}>()

defineEmits<{
  openInviteCodeModal: []
}>()
</script>

<template>
  <header class="flex items-center justify-between gap-4 border-b border-border pb-4">
    <div class="space-y-1">
      <p class="text-sm text-muted-foreground">
        Project
      </p>
      <h1 class="text-2xl font-semibold">
        {{ title ?? '프로젝트' }}
      </h1>
    </div>

    <InviteCodeButton @click="$emit('openInviteCodeModal')" />
  </header>
</template>
