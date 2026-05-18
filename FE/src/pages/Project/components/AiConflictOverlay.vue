<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount, type StyleValue } from 'vue'
import { ChevronUp, ChevronDown, Sparkles, Minus } from 'lucide-vue-next'
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
    targetTrackId?: string | number | null
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

const buttonRef = ref<HTMLElement | null>(null)
const popupStyle = ref<{ top: string; left: string; transform?: string }>({ top: '0px', left: '0px' })
let rafId: number | null = null

const updatePopupPosition = () => {
  if (!open.value || !buttonRef.value) return
  
  const rect = buttonRef.value.getBoundingClientRect()
  
  // 기본적으로 버튼 바로 아래(top + height + margin)에 배치
  let top = rect.bottom + 10
  let left = rect.left + rect.width / 2 // 중앙 정렬 기준점
  let transform = 'translateX(-50%)'

  // 왼쪽 화면 밖으로 나가지 않도록 조정 (트랙 헤더 224px 고려)
  if (left < 256 + 180) { // 180은 팝업 넓이(360px)의 절반
    left = rect.left
    transform = 'translateX(-16px)'
  }

  popupStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    transform
  }
  
  rafId = requestAnimationFrame(updatePopupPosition)
}

watch(open, (newVal) => {
  if (newVal) {
    updatePopupPosition()
  } else {
    if (rafId) cancelAnimationFrame(rafId)
  }
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
})

const close = () => {
  open.value = false
}

const isMinimized = ref(false)
const toggleMinimize = () => {
  isMinimized.value = !isMinimized.value
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


const TIMELINE_TRACK_HEADER_WIDTH = 256

const dynamicStartPx = computed(() => {
  const startBarFloat = props.conflict.startMs / (trackStore.secondsPerBar * 1000)
  return TIMELINE_TRACK_HEADER_WIDTH + (startBarFloat * trackStore.pixelPerBar)
})

const trackIndex = computed(() => {
  if (!props.conflict.targetTrackId) return 0
  const index = trackStore.trackList.findIndex(t => String(t.trackId) === String(props.conflict.targetTrackId))
  return index >= 0 ? index : 0
})

const bubbleWrapperStyle = computed<StyleValue>(() => {
  const topOffset = (trackIndex.value * 100) + 12
  return {
    position: 'absolute',
    top: `${topOffset}px`,
    left: '12px',
  }
})

const dynamicWidthPx = computed(() => {
  const startBarFloat = props.conflict.startMs / (trackStore.secondsPerBar * 1000)
  const endBarFloat = Math.max(props.conflict.endMs / (trackStore.secondsPerBar * 1000), startBarFloat + 0.25)
  return Math.max((endBarFloat - startBarFloat) * trackStore.pixelPerBar, 8)
})


</script>

<template>
  <div
    class="pointer-events-none absolute top-0 bottom-0 z-60"
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
        ref="buttonRef"
        type="button"
        class="relative z-1000 grid h-8 w-8 place-items-center rounded-full bg-[conic-gradient(from_180deg,#8B5CF6,#38BDF8,#22C55E,#F59E0B,#EC4899,#8B5CF6)] shadow-lg hover:scale-105 transition-transform"
        @click="toggleOpen"
      >
        <span class="absolute h-7 w-7 rounded-full bg-[#171717]" />
        <Sparkles class="relative z-10 h-4 w-4 text-white" aria-hidden="true" />
      </button>

      <Teleport to="body">
        <div
          v-if="open"
          class="fixed z-9999 w-[360px] rounded-lg p-px shadow-2xl backdrop-blur-md"
          :style="popupStyle"
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
                class="ml-2 text-sm text-white/50 hover:text-white transition"
                @click.stop="toggleMinimize"
                title="최소화"
              >
                <Minus class="w-4 h-4" />
              </button>

              <button
                type="button"
                class="ml-1 text-sm text-white/50 hover:text-white transition"
                @click.stop="close"
                title="닫기"
              >
                ×
              </button>
            </div>
          </div>

          <div v-show="!isMinimized" class="space-y-3 px-4 py-4">
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
    </Teleport>
  </div>
</div>
</template>