<script setup lang="ts">
const emit = defineEmits<{
  (e: 'open-ai-panel'): void
}>()
</script>

<template>
  <section class="border-b border-border px-6 py-4">
    <div class="flex items-center justify-between rounded-2xl border border-dashed border-border px-4 py-6">
      <div class="text-sm text-muted-foreground">
        Playbar 영역
      </div>

      <button
        type="button"
        class="rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
      >
        AI 분석
      </button>
    </div>
  </section>
</template>