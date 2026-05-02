<!--일반 script블록에서 캐시가 전역에서 살아있게 함-->
<script lang="ts">
// 전역 캐시(Cache) 생성. 컴포넌트가 파괴되어도 메모리에 오디오가 남아서 파형이 그대로 나옴
const audioCache = new Map<string, { channelData: Float32Array, sampleRate: number }>();
</script>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useTrackStore } from '../store/useTrackStore';
import type { ClipUIState } from '../types'; // 경로가 다르면 수정해주세요

//부모로부터 클립정보(props)를 넘겨받는다.
const props = defineProps<{ 
  clip: ClipUIState;
}>();
//타임라인의 확대 축소 배율을 알기 위해 피니아 스토어를 가져옴
const trackStore = useTrackStore();
//캔버스를 화면에 띄울 통로 역할을 하는 변수 화면에 렌더링 될 요소
const canvasRef = ref<HTMLCanvasElement | null>(null);
//워커
let worker: Worker | null = null; 

onMounted(async () => {
  if (!canvasRef.value || !props.clip.audio?.cdnUrl) return;

  const canvas = canvasRef.value;
  
  // 실제 UI 상의 클립 픽셀 너비로 정확히 맞춤
  const width = Math.floor(props.clip.duration * trackStore.pixelPerBar);
  const height = 100;

  canvas.width = width;
  canvas.height = height;
    //화면(UI)이 버벅거리지 않도록 캔버스의 제어권(offscreen)을 때어네 워커에게 넘김. 즉 본체는 뷰에서 두고 그리기만 전담하는 직원을 고용하는 것.
  const offscreen = canvas.transferControlToOffscreen();
  //직원 고용
  const workerUrl = new URL('@/core/workers/waveform.worker.ts', import.meta.url).href;
  worker = new Worker(workerUrl, { type: 'module' });

  try {
    //처음 렌더링 하는 클립이라면 오디오를 다운로드(fetch)하고 디코딩(decoding)하여 파형(channelData)으로 변환
    //이미 한번 렌더링했던 클립이라면 캐시에서 바로 꺼내 쓴다. 
    const audioUrl = props.clip.audio.cdnUrl;

    //전역 캐시를 사용
    let cached = audioCache.get(audioUrl);

    // 캐시에 없으면 다운로드 및 디코딩 실행 후 저장
    if (!cached) {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      cached = {
        channelData: audioBuffer.getChannelData(0),
        sampleRate: audioBuffer.sampleRate
      };
      audioCache.set(audioUrl, cached); // 캐시에 저장

      if(audioCtx.state !== 'closed') audioCtx.close();
    }

    // 1픽셀에 해당하는 오디오 샘플 개수를 정확히 계산 (스토어 정보 연동)
    const secondsPerPixel = trackStore.secondsPerBar / trackStore.pixelPerBar;
    const samplesPerPixel = secondsPerPixel * cached.sampleRate;
    const startSampleOffset = (props.clip.audioStartMs / 1000) * cached.sampleRate;

    //직원에게 레시피를 건네주고 그리기를 명령
    //워커에게 보내주는거
    worker.postMessage(
      {
        channelData: cached.channelData, 
        color: '#D4CED2',
        canvas: offscreen,
        width: width,
        height: height,
        samplesPerPixel: samplesPerPixel,      // 워커로 전송
        startSampleOffset: startSampleOffset   // 워커로 전송
      },
      [offscreen] 
    );

  } catch (error) {
     console.error("오디오 디코딩 실패:", error);
  }
});

//클립이 삭제되거나 다른 트랙으로 이동할때 뒤에서 일하는 워커를 해제해서 불필요한 메모리 누수와 브라우저 과부하를 막는다.
onUnmounted(() => {
  worker?.terminate();
});
</script>

<template>
  <canvas ref="canvasRef"
  class="pointer-events-none absolute inset-0 h-full w-full opacity-60 mix-blend-multiply"
  ></canvas>
</template>

<style scoped>
/* 믹스블렌드 확인받을 것! */
@keyframes smoothAppear {
  0% { opacity: 0; }
  100% { opacity: 0.6; } /* 기존 Tailwind 클래스인 opacity-60에 맞춤 */
}

canvas {
  /* 0.15초 동안 부드럽게 나타나도록 애니메이션 적용 */
  animation: smoothAppear 0.15s ease-out forwards;
}
</style>
