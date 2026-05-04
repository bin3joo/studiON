<script lang="ts">
const audioCache = new Map<string, { channelData: Float32Array, sampleRate: number }>();
</script>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useTrackStore } from '../store/useTrackStore';
import type { ClipUIState } from '../types';
import * as Tone from 'tone';

const props = defineProps<{ 
  clip: ClipUIState;
}>();

const trackStore = useTrackStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);

let worker: Worker | null = null; 
let observer: IntersectionObserver | null = null; 
let isVisible = false; 

const renderWaveform = async () => {
    // offscreen 변수 체크 삭제 (워커 내부에서 관리하므로)
    if (!canvasRef.value || !props.clip.audio?.cdnUrl || !worker) return;

    if (!isVisible) return;

    const width = Math.floor(props.clip.duration * trackStore.pixelPerBar);
    const height = 100;

    if (width <= 0 || height <= 0) return;

    // 핵심 수정: 메인 스레드에서 canvasRef.width 조작 금지!
    // 대신 상위 div(TrackItem.vue)에서 크기를 잡아주므로 캔버스는 가만히 두면 됩니다.

    const audioUrl = props.clip.audio.cdnUrl;
    let cached = audioCache.get(audioUrl);

    if (!cached) {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
     const audioCtx = Tone.getContext().rawContext as AudioContext;
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    cached = {
      channelData: new Float32Array(audioBuffer.getChannelData(0)),
      sampleRate: audioBuffer.sampleRate
    };
    audioCache.set(audioUrl, cached);
    }

    const secondsPerPixel = trackStore.secondsPerBar / trackStore.pixelPerBar;
    const samplesPerPixel = secondsPerPixel * cached.sampleRate;
    const startSampleOffset = (props.clip.audioStartMs / 1000) * cached.sampleRate;

    // 워커에게 새 크기 정보와 함께 다시 그리라고 명령만 내림
    worker.postMessage({
        channelData: cached.channelData, 
        color: '#D4CED2',
        width: width,      //  워커 내부에서 이 값을 받아 캔버스 크기를 조절할 것임
        height: height,    // 
        samplesPerPixel: samplesPerPixel,      
        startSampleOffset: startSampleOffset   
    });
};

const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
        renderWaveform();
    }
};

//트랙의 줌레벨 감지
watch(() => trackStore.pixelPerBar, () => {
    renderWaveform();
});

//클립 자체의 길이, 잘린 지점 변경 감지 클립이나 오디오 시작점이 변하면 파형을 다시 그리도록 함
watch(
  () => [props.clip.duration, props.clip.audioStartMs],
  () => {
    renderWaveform();
  }
)

onMounted(async () => {
  await nextTick(); 
  if (!canvasRef.value || !props.clip.audio?.cdnUrl) return;

  const workerUrl = new URL('@/core/workers/waveform.worker.ts', import.meta.url).href;
  worker = new Worker(workerUrl, { type: 'module' });

  //  최초 1회만 제어권을 워커로 넘김 (offscreen 변수 저장 X)
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
    root: document.querySelector('.overflow-auto'), 
    rootMargin: '300px', 
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
  <canvas ref="canvasRef"
  class="pointer-events-none absolute inset-0 h-full w-full opacity-60 mix-blend-multiply"
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