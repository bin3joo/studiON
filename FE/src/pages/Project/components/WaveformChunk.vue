<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useTrackStore } from '../store/useTrackStore';
import type { ClipUIState } from '../types';

const props = defineProps<{
  clip: ClipUIState;
  chunkLeft: number;
  chunkWidth: number;
  audioData: { channelData: Float32Array; sampleRate: number };
}>();

const trackStore = useTrackStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);

let worker: Worker | null = null;
let observer: IntersectionObserver | null = null;
let isVisible = false;

const renderWaveform = () => {
  if (!canvasRef.value || !worker || !isVisible) return;
  if (props.chunkWidth <= 0) return;

  const secondsPerPixel = trackStore.secondsPerBar / trackStore.pixelPerBar;
  const samplesPerPixel = secondsPerPixel * props.audioData.sampleRate;

  // 1. 전체 오디오에서의 시작점(오프셋) 계산
  const baseOffsetSec = props.clip.audioStartMs / 1000;
  // 2. 이 청크가 담당하는 추가적인 시작점(픽셀 기반) 계산
  const chunkOffsetSec = props.chunkLeft * secondsPerPixel;
  
  const startSampleOffset = (baseOffsetSec + chunkOffsetSec) * props.audioData.sampleRate;

  const totalSamples = props.audioData.channelData.length;
  if (startSampleOffset >= totalSamples) {
    return; // 이 청크는 그릴 데이터가 없음
  }

  worker.postMessage({
    channelData: props.audioData.channelData,
    color: '#D4CED2',
    width: props.chunkWidth,
    height: 100,
    samplesPerPixel: samplesPerPixel,
    startSampleOffset: startSampleOffset
  });
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    renderWaveform();
  }
};

// 줌이나 데이터가 변경될 때 다시 그리기
watch(
  () => [trackStore.pixelPerBar, props.clip.duration, props.chunkWidth],
  () => {
    renderWaveform();
  }
);

onMounted(async () => {
  await nextTick();
  if (!canvasRef.value) return;

  const workerUrl = new URL('../../../core/workers/waveform.worker.ts', import.meta.url).href;
  worker = new Worker(workerUrl, { type: 'module' });

  // 캔버스 제어권 워커로 이전
  const offscreenCanvas = canvasRef.value.transferControlToOffscreen();
  worker.postMessage({ canvas: offscreenCanvas }, [offscreenCanvas]);

  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      isVisible = entry.isIntersecting;
      if (isVisible) {
        renderWaveform();
      }
    });
  }, {
    root: document.querySelector('.custom-scrollbar'), // 스크롤 가능한 가장 가까운 조상
    rootMargin: '300px', // 좌우로 여유를 주어 스크롤 전 미리 렌더링
    threshold: 0
  });

  observer.observe(canvasRef.value);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  observer?.disconnect();
  worker?.terminate();
});
</script>

<template>
  <canvas 
    ref="canvasRef"
    class="absolute top-0 h-full"
    :style="{ left: `${chunkLeft}px`, width: `${chunkWidth}px` }"
  ></canvas>
</template>

<style scoped>
@keyframes smoothAppear {
  0% { opacity: 0; }
  100% { opacity: 0.6; }
}
canvas {
  animation: smoothAppear 0.15s ease-out forwards;
}
</style>
