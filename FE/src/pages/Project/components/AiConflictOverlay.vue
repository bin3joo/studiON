<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  conflict: {
    startPercent: number
    endPercent: number
    barStart: number
    barEnd: number
    title: string
    summary: string
    bullets: string[]
  }
}>()

const open = ref(true)

const close = () => {
  open.value = false
}
</script>

<template>
  <div
    class="pointer-events-none absolute bottom-0 top-7 z-20"
    :style="{
      left: `${props.conflict.startPercent}%`,
      width: `${props.conflict.endPercent - props.conflict.startPercent}%`,
    }"
  >
    <div
      class="absolute inset-0 border-x border-red-400/80 bg-red-500/20 shadow-[0_0_24px_rgba(239,68,68,0.35)]"
    />

    <div class="pointer-events-auto absolute left-full top-1 ml-2">
      <button
        type="button"
        class="grid h-7 w-7 place-items-center rounded-full bg-fuchsia-500 text-white shadow-[0_0_16px_rgba(217,70,239,0.8)]"
        @click="open = !open"
      >
        ✨
      </button>

      <div
        v-if="open"
        class="absolute left-10 top-0 w-[360px] rounded-lg border border-fuchsia-400/60 bg-[#202025]/95 text-white shadow-[0_0_28px_rgba(217,70,239,0.35)] backdrop-blur"
      >
        <div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300">
            <span>✨</span>
            <span>AI Analysis</span>
          </div>

          <button
            type="button"
            class="text-sm text-white/50 hover:text-white"
            @click="close"
          >
            ×
          </button>
        </div>

        <div class="space-y-3 px-4 py-4">
          <div class="text-base font-semibold">
            {{ props.conflict.title }}
          </div>

          <p class="text-sm text-white/60">
            {{ props.conflict.summary }}
          </p>

          <ul class="space-y-2 border-t border-white/10 pt-3 text-sm leading-relaxed text-white/80">
            <li
              v-for="(bullet, index) in props.conflict.bullets"
              :key="index"
              class="flex gap-2"
            >
              <span class="text-fuchsia-300">›</span>
              <span>{{ bullet }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>