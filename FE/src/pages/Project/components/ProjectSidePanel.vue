<script setup lang="ts">
type PanelType = 'comments' | 'history' | 'ai'

defineProps<{
  open: boolean
  type: PanelType | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const panelTitleMap: Record<PanelType, string> = {
  comments: '댓글 목록',
  history: '버전 기록',
  ai: 'AI 기능',
}
</script>

<template>
  <aside
    v-if="open && type"
    class="absolute inset-y-0 right-0 z-30 w-[320px] border-l border-border bg-card shadow-2xl"
  >
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between border-b border-border px-4 py-4">
        <div class="text-sm font-semibold text-foreground">
          {{ panelTitleMap[type] }}
        </div>

        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="flex-1 p-4">
        <div
          class="flex h-full min-h-[260px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground"
        >
          <template v-if="type === 'comments'">
            댓글 목록 영역
          </template>
          <template v-else-if="type === 'history'">
            버전 기록 영역
          </template>
        </div>
      </div>
    </div>
  </aside>
</template>