<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import type { ClipEqBandState } from '../types'

const props = defineProps<{
  title: string
  freqLabels: string[]
  dbLabels: string[]
  bands: ClipEqBandState[]
  spectrumData?: number[]
  after?: boolean
  loading?: boolean
  interactive?: boolean
}>()

const emit = defineEmits<{
  'add-band': [payload: {
    frequencyHz: number
    gainDeltaDb: number
  }]
  'update-band': [payload: {
    bandOrder: number
    patch: Partial<ClipEqBandState>
  }]
}>()

const MIN_FREQ = 20
const MAX_FREQ = 20000
const MIN_GAIN_DB = -12
const MAX_GAIN_DB = 12
const GRAPH_WIDTH = 1000
const GRAPH_HEIGHT = 240
const MAX_BANDS = 5
const SPECTRUM_BAR_COUNT = 44

const graphRef = ref<HTMLElement | null>(null)
const activeBandOrder = ref<number | null>(null)

const centerY = computed(() => gainToY(0))

const sortedBands = computed(() => {
  return [...props.bands].sort((a, b) => a.frequencyHz - b.frequencyHz)
})

const spectrumBars = computed(() => {
  const values = props.spectrumData ?? []

  if (values.length === 0) {
    return Array.from({ length: SPECTRUM_BAR_COUNT }, () => 0)
  }

  return Array.from({ length: SPECTRUM_BAR_COUNT }, (_, index) => {
    const ratio = index / Math.max(1, SPECTRUM_BAR_COUNT - 1)

    const minLog = Math.log10(MIN_FREQ)
    const maxLog = Math.log10(MAX_FREQ)
    const frequency = Math.pow(10, minLog + ratio * (maxLog - minLog))

    // Tone.FFT(1024)는 dB 배열을 반환하며, 표시용으로 24kHz Nyquist를 기준으로 매핑합니다.
    const nyquist = 24000
    const fftIndex = Math.round((frequency / nyquist) * (values.length - 1))
    const safeIndex = clamp(fftIndex, 0, values.length - 1)

    const db = values[safeIndex] ?? -100
    const normalized = clamp((db + 100) / 80, 0, 1)

    return normalized
  })
})

const curvePath = computed(() => {
  const points = [
    { x: 0, y: centerY.value },
    ...sortedBands.value.map(band => ({
      x: frequencyToX(band.frequencyHz),
      y: gainToY(band.gainDeltaDb),
    })),
    { x: GRAPH_WIDTH, y: centerY.value },
  ]

  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  }

  let path = `M ${points[0].x} ${points[0].y}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }

  return path
})

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function frequencyToX(frequencyHz: number) {
  const clampedFreq = clamp(frequencyHz, MIN_FREQ, MAX_FREQ)

  const minLog = Math.log10(MIN_FREQ)
  const maxLog = Math.log10(MAX_FREQ)
  const valueLog = Math.log10(clampedFreq)

  return ((valueLog - minLog) / (maxLog - minLog)) * GRAPH_WIDTH
}

function xToFrequency(x: number, width: number) {
  const ratio = clamp(x / width, 0, 1)
  const minLog = Math.log10(MIN_FREQ)
  const maxLog = Math.log10(MAX_FREQ)

  return Math.round(
    Math.pow(10, minLog + ratio * (maxLog - minLog)),
  )
}

function gainToY(gainDb: number) {
  const clampedGain = clamp(gainDb, MIN_GAIN_DB, MAX_GAIN_DB)
  const ratio = (MAX_GAIN_DB - clampedGain) / (MAX_GAIN_DB - MIN_GAIN_DB)

  return ratio * GRAPH_HEIGHT
}

function yToGain(y: number, height: number) {
  const ratio = clamp(y / height, 0, 1)
  const gain = MAX_GAIN_DB - ratio * (MAX_GAIN_DB - MIN_GAIN_DB)

  return Math.round(gain * 10) / 10
}

function handleGraphPointerDown(e: PointerEvent) {
  if (!props.interactive) return
  if (props.bands.length >= MAX_BANDS) return

  const target = e.target as HTMLElement

  if (target.closest('[data-eq-handle="true"]')) return
  if (!graphRef.value) return

  e.preventDefault()
  e.stopPropagation()

  const rect = graphRef.value.getBoundingClientRect()
  const localX = e.clientX - rect.left
  const localY = e.clientY - rect.top

  emit('add-band', {
    frequencyHz: xToFrequency(localX, rect.width),
    gainDeltaDb: yToGain(localY, rect.height),
  })
}

function startDrag(e: PointerEvent, bandOrder: number) {
  if (!props.interactive) return

  e.preventDefault()
  e.stopPropagation()

  activeBandOrder.value = bandOrder
}

function onPointerMove(e: PointerEvent) {
  if (!activeBandOrder.value || !graphRef.value || !props.interactive) return

  const rect = graphRef.value.getBoundingClientRect()
  const localX = e.clientX - rect.left
  const localY = e.clientY - rect.top

  emit('update-band', {
    bandOrder: activeBandOrder.value,
    patch: {
      frequencyHz: xToFrequency(localX, rect.width),
      gainDeltaDb: yToGain(localY, rect.height),
    },
  })
}

function stopDrag() {
  activeBandOrder.value = null
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', stopDrag)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', stopDrag)
})
</script>

<template>
  <div class="relative h-full overflow-hidden bg-[#242424]">
    <!-- 그래프 그리드 영역 -->
    <div
      ref="graphRef"
      class="absolute inset-5 right-12 bottom-8 cursor-crosshair"
      @pointerdown="handleGraphPointerDown"
    >
      <!-- 세로선 -->
      <div class="pointer-events-none absolute inset-0 flex justify-between">
        <div
          v-for="label in freqLabels"
          :key="label"
          class="h-full border-l border-white/[0.06]"
        />
      </div>

      <!-- 가로선 -->
      <div class="pointer-events-none absolute inset-0 flex flex-col justify-between">
        <div
          v-for="label in dbLabels"
          :key="label"
          class="w-full border-t border-white/[0.06]"
        />
      </div>

      <!-- 하단 주파수 막대 느낌 -->
      <div class="pointer-events-none absolute bottom-0 left-0 right-0 flex h-16 items-end gap-1 opacity-35">
        <div
          v-for="(level, index) in spectrumBars"
          :key="index"
          class="flex-1 rounded-t bg-white/40 transition-[height] duration-75"
          :style="{ height: `${4 + level * 60}px` }"
        />
      </div>

      <!-- EQ 커브 + 핸들 -->
      <svg
        class="absolute inset-0 z-10 h-full w-full overflow-visible"
        :viewBox="`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`"
        preserveAspectRatio="none"
      >
        <!-- 0dB 기준선 -->
        <line
          :x1="0"
          :x2="GRAPH_WIDTH"
          :y1="centerY"
          :y2="centerY"
          stroke="#FFD84D"
          stroke-width="1.5"
          opacity="0.55"
          vector-effect="non-scaling-stroke"
        />

        <!-- EQ 조절 커브 -->
        <path
          :d="curvePath"
          fill="none"
          stroke="#FFD84D"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />

        <!-- 사용자 EQ 포인트 -->
        <circle
          v-for="band in sortedBands"
          :key="band.bandOrder"
          :cx="frequencyToX(band.frequencyHz)"
          :cy="gainToY(band.gainDeltaDb)"
          r="8"
          fill="#FFD84D"
          stroke="#242424"
          stroke-width="2"
          class="cursor-move"
          data-eq-handle="true"
          vector-effect="non-scaling-stroke"
          @pointerdown="startDrag($event, band.bandOrder)"
        />
      </svg>
    </div>

    <!-- 우측 dB 라벨 -->
    <div class="pointer-events-none absolute right-2 top-5 bottom-8 flex w-9 flex-col justify-between text-right font-mono text-[10px] text-gray-500">
      <span
        v-for="label in dbLabels"
        :key="label"
      >
        {{ label }}
      </span>
    </div>

    <!-- 하단 주파수 라벨 -->
    <div class="pointer-events-none absolute left-5 right-12 bottom-2 flex justify-between font-mono text-[10px] text-gray-500">
      <span
        v-for="label in freqLabels"
        :key="label"
      >
        {{ label }}
      </span>
    </div>

    <!-- 로딩 오버레이 -->
    <div
      v-if="loading"
      class="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div class="flex items-center gap-2 font-mono text-xs tracking-widest text-[#FF8F1A]">
        <Loader2 class="h-4 w-4 animate-spin" />
        분석 중...
      </div>
    </div>
  </div>
</template>
