<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Play, Sparkles, Wand2 } from 'lucide-vue-next'
import type { TrackUIState, ClipUIState, ClipEqBandState } from '../types'
import EqGraph from './EqGraph.vue'
import { useTrackStore } from '../store/useTrackStore'

const props = defineProps<{
  selectedTrack: TrackUIState | null
  selectedClip: ClipUIState | null
  aiAnalyzing: boolean
  aiAnalyzed: boolean
}>()

const trackStore = useTrackStore()
const spectrumData = ref<number[]>([])
let spectrumRafId: number | null = null

const currentBands = computed(() => {
  return props.selectedClip?.eq?.bands ?? []
})

const emit = defineEmits<{
  'apply-ai-eq': []
  'cancel-ai-eq': []
  'add-eq-band': [payload: {
    frequencyHz: number
    gainDeltaDb: number
  }]
  'update-eq-band': [payload: {
    bandOrder: number
    patch: Partial<ClipEqBandState>
  }]
}>()

const freqLabels = ['20', '50', '100', '200', '500', '1K', '2K', '5K', '10K', '20K']
const dbLabels = ['+12', '+8', '+6', '+3', '0', '-3', '-6', '-9', '-12']

function updateSpectrum() {
  if (props.selectedClip) {
    spectrumData.value = trackStore.getClipSpectrum(props.selectedClip.clipId)
  } else {
    spectrumData.value = []
  }

  spectrumRafId = requestAnimationFrame(updateSpectrum)
}

onMounted(() => {
  spectrumRafId = requestAnimationFrame(updateSpectrum)
})

onUnmounted(() => {
  if (spectrumRafId !== null) {
    cancelAnimationFrame(spectrumRafId)
  }
})

watch(
  () => props.selectedClip?.clipId,
  () => {
    spectrumData.value = []
  },
)
</script>

<template>
  <section
    class="shrink-0 border-t border-white/10 bg-[#202020] shadow-[0_-18px_30px_rgba(0,0,0,0.45)]"
  >
    <!-- 상단 헤더 -->
    <div class="flex h-12 items-center gap-3 border-b border-white/10 px-5">
      <Sparkles
        class="h-4 w-4 text-[#FF8F1A]"
        :class="{ 'animate-pulse': aiAnalyzing }"
      />

      <span class="text-sm font-bold tracking-[0.18em] text-white">
        EQ
      </span>

      <span class="font-mono text-[11px] tracking-widest text-gray-400">
        {{ selectedClip ? selectedTrack?.name : '클립을 선택하세요' }}
    </span>

      <span
        v-if="selectedClip"
        class="ml-2 max-w-[280px] truncate rounded border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-gray-400"
      >
        {{ selectedClip.audio?.originalName ?? 'Audio Clip' }}
      </span>
    </div>

<!-- 클립 미선택: 빈 EQ 상태 -->
<div
  v-if="!selectedClip"
  class="flex h-[260px] items-center justify-center bg-[#242424]"
>
  <div class="text-center">
    <div class="mb-2 text-sm font-semibold tracking-[0.18em] text-gray-400">
      NO CLIP SELECTED
    </div>
    <div class="text-xs text-gray-500">
      EQ를 조절할 클립을 선택하세요.
    </div>
  </div>
</div>

<!-- 클립 선택 + AI 분석 전: 단일 EQ -->
<div v-else-if="!aiAnalyzed" class="h-[260px]">
  <EqGraph
  title="현재"
  :freq-labels="freqLabels"
  :db-labels="dbLabels"
  :bands="currentBands"
  :spectrum-data="spectrumData"
  :interactive="!!selectedClip"
  @add-band="emit('add-eq-band', $event)"
  @update-band="emit('update-eq-band', $event)"
/>
</div>

<!-- 클립 선택 + AI 분석 후: 이전 / 이후 2분할 -->
<div v-else>
  <div class="grid grid-cols-2 border-b border-white/10">
    <div class="flex h-11 items-center gap-3 border-r border-white/10 px-5">
      <span class="text-xs font-bold tracking-[0.28em] text-gray-400">
        이전
      </span>

      <button
        class="grid h-7 w-7 place-items-center rounded-full border border-white/15 text-white transition hover:border-[#FF8F1A] hover:text-[#FF8F1A]"
      >
        <Play class="h-3 w-3 fill-current" />
      </button>
    </div>

    <div class="flex h-11 items-center gap-3 px-5">
      <span class="text-xs font-bold tracking-[0.28em] text-gray-400">
        이후
      </span>

      <button
        class="grid h-7 w-7 place-items-center rounded-full border border-white/15 text-white transition hover:border-[#FF8F1A] hover:text-[#FF8F1A]"
      >
        <Play class="h-3 w-3 fill-current" />
      </button>

      <div class="ml-auto flex items-center gap-2">
        <button
          class="inline-flex items-center gap-1.5 rounded-full bg-[#FF8F1A] px-3 py-1.5 text-[11px] font-bold text-black transition hover:brightness-110 disabled:opacity-40"
          :disabled="aiAnalyzing"
          @click="emit('apply-ai-eq')"
        >
          <Wand2 class="h-3.5 w-3.5" />
          AI 적용
        </button>

        <button
          class="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold text-gray-300 transition hover:border-white/30 hover:text-white"
          @click="emit('cancel-ai-eq')"
        >
          취소
        </button>
      </div>
    </div>
  </div>

  <div class="grid h-[260px] grid-cols-2 bg-white/10 gap-px">
    <EqGraph
  title="Before"
  :freq-labels="freqLabels"
  :db-labels="dbLabels"
  :bands="[]"
  :spectrum-data="[]"
  :interactive="false"
/>

<EqGraph
  title="After"
  :freq-labels="freqLabels"
  :db-labels="dbLabels"
  :bands="currentBands"
  :spectrum-data="spectrumData"
  :after="true"
  :loading="aiAnalyzing"
  :interactive="!!selectedClip"
  @add-band="emit('add-eq-band', $event)"
  @update-band="emit('update-eq-band', $event)"
/>
  </div>
</div>
  </section>
</template>
