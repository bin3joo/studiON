<script setup lang="ts">
import { ref, watch, computed, type StyleValue } from 'vue'

const props = defineProps<{
  conflict: {
    id?: string | number
    kind: 'BAND_OVERLAP' | 'CLIPPING' | 'HARSHNESS'
    startPercent: number
    endPercent: number
    startPx: number
    endPx: number
    barStart: number
    barEnd: number
    title: string
    summary: string
    bullets: string[]
    recommendedGainReductionDb: number | null
  }
  bubblePosition:
  | {
      mode: 'absolute'
      top: number
    }
  | {
      mode: 'fixed'
      left: number
      bottom: number
    }
  currentIndex: number
  totalCount: number
  isClippingApplied?: boolean
clippingAppliedInfo?: {
  reductionDb: number
  inputGainDb: number
  ceilingDbfs: number
} | null
}>()

const emit = defineEmits<{
  next: []
  prev: []
  applyClipping: []
  dismissClipping: []
}>()

const open = ref(true)

watch(
  () => props.conflict.id,
  () => {
    open.value = true
  },
)

const close = () => {
  open.value = false
}

const issueLabel = () => {
  if (props.conflict.kind === 'BAND_OVERLAP') return '대역 중복'
  if (props.conflict.kind === 'CLIPPING') return '클리핑'
  return '하쉬니스'
}

const bubbleWrapperStyle = computed<StyleValue>(() => {
  if (props.bubblePosition.mode === 'fixed') {
    return {
      position: 'fixed',
      left: `${props.bubblePosition.left}px`,
      bottom: `${props.bubblePosition.bottom}px`,
    }
  }

  return {
    position: 'absolute',
    left: '100%',
    marginLeft: '8px',
    top: `${props.bubblePosition.top}px`,
  }
})
</script>

<template>
  <div
    class="pointer-events-none absolute top-[34px] bottom-[0px] z-[999] rounded border border-purple-400/70 bg-purple-500/20 shadow-[0_0_24px_rgba(217,70,239,0.35)]"
    :style="{
      left: `${props.conflict.startPx}px`,
      width: `${Math.max(props.conflict.endPx - props.conflict.startPx, 8)}px`,
    }"
  >
    <div class="absolute inset-0 border-x border-red-400/80 bg-red-500/20" />

    <div
  class="pointer-events-auto"
  :style="bubbleWrapperStyle"
  @pointerdown.stop
>
      <button
        type="button"
        class="relative z-[1000] grid h-7 w-7 place-items-center rounded-full bg-fuchsia-500 text-white shadow-[0_0_16px_rgba(217,70,239,0.8)]"
        @click="open = !open"
      >
        ✨
      </button>

      <div
  v-if="open"
  class="absolute z-[1000] w-[360px] rounded-lg border border-fuchsia-400/60 bg-[#202025]/95 text-white shadow-[0_0_28px_rgba(217,70,239,0.35)] backdrop-blur"
  :class="props.conflict.kind === 'CLIPPING' ? 'left-10 bottom-0' : 'left-10 top-0'"
>
        <div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300">
            <span>✨</span>
            <span>AI Analysis</span>
          </div>

          <div class="flex items-center gap-2">
            <span class="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">
              {{ issueLabel() }}
            </span>

            <button
              type="button"
              class="text-sm text-white/50 hover:text-white"
              @click="close"
            >
              ×
            </button>
          </div>
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

          <div
  v-if="props.conflict.kind === 'CLIPPING'"
  class="space-y-3 border-t border-white/10 pt-3"
>
  <div
    v-if="props.isClippingApplied"
    class="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2"
  >
    <div class="text-xs font-bold text-emerald-300">
      적용 완료
    </div>

    <p class="mt-1 text-xs leading-relaxed text-white/65">
      마스터 리미터 draft에 클리핑 감소안이 반영됐어요.
    </p>

    <div
      v-if="props.clippingAppliedInfo"
      class="mt-2 space-y-1 text-[11px] text-white/50"
    >
      <div>
        감소량: {{ props.clippingAppliedInfo.reductionDb.toFixed(2) }}dB
      </div>
      <div>
        Input Gain: {{ props.clippingAppliedInfo.inputGainDb.toFixed(2) }}dB
      </div>
      <div>
        Ceiling: {{ props.clippingAppliedInfo.ceilingDbfs.toFixed(1) }}dBFS
      </div>
    </div>
  </div>

  <template v-else>
    <p class="text-xs leading-relaxed text-white/60">
      마스터 트랙에서 클리핑이 감지됐어요.
      AI는 약 {{ Math.abs(props.conflict.recommendedGainReductionDb ?? 0).toFixed(2) }}dB 감소를 제안합니다.
    </p>

    <div class="flex gap-2">
      <button
        type="button"
        :disabled="props.conflict.recommendedGainReductionDb == null"
        class="rounded-md bg-[#FF8F1A] px-3 py-1.5 text-xs font-bold text-black hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        @click="emit('applyClipping')"
      >
        적용하기
      </button>

      <button
        type="button"
        class="rounded-md border border-white/15 px-3 py-1.5 text-xs font-bold text-white/70 hover:border-white/30 hover:text-white"
        @click="emit('dismissClipping')"
      >
        건너뛰기
      </button>
    </div>
  </template>
</div>

          <div
            v-if="props.totalCount > 1"
            class="flex items-center justify-between border-t border-white/10 pt-3"
          >
            <button
              type="button"
              class="rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:border-white/30 hover:text-white"
              @click="emit('prev')"
            >
              이전
            </button>

            <span class="text-xs text-white/40">
              {{ props.currentIndex + 1 }} / {{ props.totalCount }}
            </span>

            <button
              type="button"
              class="rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:border-white/30 hover:text-white"
              @click="emit('next')"
            >
              다음
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>