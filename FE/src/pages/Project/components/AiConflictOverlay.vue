<script setup lang="ts">
import { ref, watch, computed, type StyleValue } from 'vue'
import { ChevronUp, ChevronDown, Sparkles } from 'lucide-vue-next'
import { useTrackStore } from '../store/useTrackStore'

const trackStore = useTrackStore()

const props = defineProps<{
  conflict: {
    id?: string | number
    kind: 'BAND_OVERLAP' | 'CLIPPING' | 'HARSHNESS'
    startPercent: number
    endPercent: number
    startPx: number
    endPx: number
    startMs: number
    endMs: number
    barStart: number
    barEnd: number
    title: string
    summary: string
    bullets: string[]
    recommendedGainReductionDb: number | null
  }
  bubblePosition: {
    mode: 'absolute'
    top: number
  }

  isClippingApplied?: boolean
clippingAppliedInfo?: {
  reductionDb: number
  inputGainDb: number
  ceilingDbfs: number
} | null
}>()

const emit = defineEmits<{
  open: []
  applyClipping: []
  dismissClipping: []
}>()

const open = ref(false)

watch(
  () => props.conflict.id,
  () => {
    open.value = true
  },
)

const close = () => {
  open.value = false
}

const toggleOpen = () => {
  open.value = !open.value
  if (open.value) {
    emit('open')
  }
}

const issueLabel = () => {
  if (props.conflict.kind === 'BAND_OVERLAP') return '대역 중복'
  if (props.conflict.kind === 'CLIPPING') return '클리핑'
  return '하쉬니스'
}

const bubbleWrapperStyle = computed<StyleValue>(() => {
  return {
    position: 'absolute',
    left: '0',
    marginLeft: '-16px',
    top: `${props.bubblePosition.top}px`,
  }
})

const TIMELINE_TRACK_HEADER_WIDTH = 256

const dynamicStartPx = computed(() => {
  const startBarFloat = props.conflict.startMs / (trackStore.secondsPerBar * 1000)
  return TIMELINE_TRACK_HEADER_WIDTH + (startBarFloat * trackStore.pixelPerBar)
})

const dynamicWidthPx = computed(() => {
  const startBarFloat = props.conflict.startMs / (trackStore.secondsPerBar * 1000)
  const endBarFloat = Math.max(props.conflict.endMs / (trackStore.secondsPerBar * 1000), startBarFloat + 0.25)
  return Math.max((endBarFloat - startBarFloat) * trackStore.pixelPerBar, 8)
})

const popupAlignmentClass = computed(() => {
  // 팝업 넓이(360px)의 절반(180px)을 고려하여, 왼쪽에 공간이 부족하면 왼쪽 정렬
  if (dynamicStartPx.value < TIMELINE_TRACK_HEADER_WIDTH + 180) {
    return 'left-0'
  }
  return 'left-1/2 -translate-x-1/2'
})
</script>

<template>
  <div
    class="pointer-events-none absolute top-[34px] bottom-0 z-50"
    :class="{ 'border-x border-red-500 bg-red-500/20': open }"
    :style="{
      left: `${dynamicStartPx}px`,
      width: `${dynamicWidthPx}px`,
    }"
  >
    <div
      class="pointer-events-auto"
  :style="bubbleWrapperStyle"
  @pointerdown.stop
>
      <button
        type="button"
        class="relative z-[1000] grid h-8 w-8 place-items-center rounded-full bg-[conic-gradient(from_180deg,#8B5CF6,#38BDF8,#22C55E,#F59E0B,#EC4899,#8B5CF6)] shadow-lg hover:scale-105 transition-transform"
        @click="toggleOpen"
      >
        <span class="absolute h-7 w-7 rounded-full bg-[#171717]" />
        <Sparkles class="relative z-10 h-4 w-4 text-white" aria-hidden="true" />
      </button>

      <div
        v-if="open"
        class="absolute z-50 w-[360px] rounded-lg p-px shadow-2xl backdrop-blur-md top-10"
        :class="popupAlignmentClass"
      >
        <div class="absolute inset-0 rounded-lg bg-[linear-gradient(135deg,#8B5CF6,#3B82F6,#06B6D4,#22C55E,#F59E0B,#EC4899)] opacity-80" />
        
        <div class="relative h-full w-full rounded-[7px] bg-[#171717]/95">
          <div class="flex items-center justify-between border-b border-white/10 px-4 py-3 rounded-t-[7px]">
            <div class="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-white">
              <span class="grid h-5 w-5 place-items-center rounded-full bg-[conic-gradient(from_180deg,#8B5CF6,#38BDF8,#22C55E,#F59E0B,#EC4899,#8B5CF6)]">
                <span class="absolute h-4 w-4 rounded-full bg-[#171717]" />
                <Sparkles class="relative z-10 h-3 w-3 text-white" aria-hidden="true" />
              </span>
              <span class="bg-[linear-gradient(90deg,#DDD6FE,#93C5FD,#67E8F9,#F9A8D4)] bg-clip-text text-transparent uppercase mt-0.5">
                AI ANALYSIS
              </span>
            </div>

            <div class="flex items-center gap-2">
              <span class="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">
                {{ issueLabel() }}
              </span>

              <button
                type="button"
                class="ml-1 text-sm text-white/50 hover:text-white transition"
                @click.stop="close"
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

        </div>
      </div>
      </div>
    </div>
  </div>
</template>