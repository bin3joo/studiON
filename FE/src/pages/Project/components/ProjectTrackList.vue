<script setup lang="ts">
defineProps<{
  tracks: string[]
}>()
</script>

<template>
  <aside class="rounded-2xl border border-border bg-card px-4 py-4">
    <div class="mb-4 text-sm font-semibold text-foreground">
      TrackList
    </div>

    <div class="h-10 border-b border-border" />

    <div class="space-y-0">
      <div
        v-for="track in tracks"
        :key="track"
        class="flex h-[72px] items-center border-b border-border px-3 text-sm text-foreground"
      >
        {{ track }}
      </div>
    </div>
  </aside>
</template>