<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useTrackStore } from '../store/useTrackStore';
import type { ClipUIState } from '../types';
import { waveformRendererPool } from '../../../core/workers/waveformRendererPool';

const props = defineProps<{
  clip: ClipUIState;
  chunkLeft: number;
  chunkWidth: number;
  audioData: { channelData: Float32Array; sampleRate: number };
}>();

const trackStore = useTrackStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);

let observer: IntersectionObserver | null = null;
let isVisible = false;
// 현재 진행 중인 렌더 요청 ID (줌/스크롤 변경 시 이전 요청을 취소하기 위함)
let currentRequestId: number | null = null;

const renderWaveform = async () => {
  if (!canvasRef.value || !isVisible) return;
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

  // 이전 요청이 진행 중이면 취소
  if (currentRequestId !== null) {
    waveformRendererPool.cancelRequest(currentRequestId);
    currentRequestId = null;
  }

  // Worker Pool에 렌더 요청
  const { promise, requestId } = waveformRendererPool.requestRender({
    channelData: props.audioData.channelData,
    color: '#D4CED2',
    width: props.chunkWidth,
    height: 100,
    samplesPerPixel,
    startSampleOffset,
  });

  currentRequestId = requestId;

  const result = await promise;

  // 요청이 취소되었거나 컴포넌트가 이미 언마운트된 경우
  if (!result || !canvasRef.value) return;
  // 요청 ID가 변경된 경우 (줌 변경 등으로 더 최신 요청이 들어온 경우) 결과 무시
  if (currentRequestId !== requestId) {
    result.bitmap.close(); // ImageBitmap 메모리 해제
    return;
  }

  currentRequestId = null;

  // 일반 canvas에 ImageBitmap 그리기
  const canvas = canvasRef.value;
  canvas.width = props.chunkWidth;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(result.bitmap, 0, 0);
  }
  // ImageBitmap 메모리 해제
  result.bitmap.close();
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

  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      isVisible = entry.isIntersecting;
      if (isVisible) {
        renderWaveform();
      }
    });
  }, {
    rootMargin: '500px 500px', // 좌우 스크롤을 대비하여 여유를 넉넉하게 줌
    threshold: 0
  });

  observer.observe(canvasRef.value);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  observer?.disconnect();
  // 진행 중인 렌더 요청 취소
  if (currentRequestId !== null) {
    waveformRendererPool.cancelRequest(currentRequestId);
    currentRequestId = null;
  }
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
