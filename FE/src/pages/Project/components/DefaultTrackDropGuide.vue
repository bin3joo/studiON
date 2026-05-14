<script setup lang="ts">
import { UploadCloud } from 'lucide-vue-next'

defineEmits<{
  browse: []
}>()
</script>

<template>
  <div
    class="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-lg border border-dashed border-red-400/80"
  >
    <div
      class="pointer-events-auto flex h-[160px] w-[360px] flex-col items-center justify-center rounded-md border border-dashed border-emerald-400/90 bg-emerald-400/15 text-emerald-100"
    >
      <UploadCloud class="mb-3 h-8 w-8 text-emerald-200/80" />

      <p class="text-sm font-semibold text-emerald-100">
        Drag&Drop files here
      </p>

      <p class="my-2 text-xs text-emerald-100/60">
        or
      </p>

      <button
        type="button"
        class="rounded border border-cyan-400 px-4 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-400/10"
        @click="$emit('browse')"
      >
        Browse Files
      </button>
    </div>
  </div>
</template>