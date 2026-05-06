<script lang="ts">
const audioCache = new Map<string, { channelData: Float32Array, sampleRate: number }>();
</script>

<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue';
import { useTrackStore } from '../store/useTrackStore';
import type { ClipUIState } from '../types';
import * as Tone from 'tone';
import WaveformChunk from './WaveformChunk.vue';

const props = defineProps<{ 
  clip: ClipUIState;
}>();

const trackStore = useTrackStore();

// 오디오 데이터를 담을 반응형 변수 (shallowRef로 대용량 데이터 성능 최적화)
const audioData = shallowRef<{ channelData: Float32Array, sampleRate: number } | null>(null);

// 브라우저 렌더링 한계치를 피하기 위한 최대 캔버스 너비 (안전하게 8000픽셀로 설정)
const MAX_CANVAS_WIDTH = 8000;

// 전체 길이를 바탕으로 청크 조각들을 계산
const chunks = computed(() => {
  if (!audioData.value) return [];
  
  const totalWidth = Math.floor(props.clip.duration * trackStore.pixelPerBar);
  if (totalWidth <= 0) return [];
  
  const numChunks = Math.ceil(totalWidth / MAX_CANVAS_WIDTH);
  
  return Array.from({ length: numChunks }, (_, i) => {
    const isLast = i === numChunks - 1;
    const chunkWidth = isLast ? (totalWidth % MAX_CANVAS_WIDTH || MAX_CANVAS_WIDTH) : MAX_CANVAS_WIDTH;
    return {
      id: `${props.clip.clipId}-${i}`, // 고유 식별자
      left: i * MAX_CANVAS_WIDTH,
      width: chunkWidth
    };
  });
});

const loadAudioData = async () => {
  if (!props.clip.audio?.cdnUrl) return;
  const audioUrl = props.clip.audio.cdnUrl;
  
  let cached = audioCache.get(audioUrl);
  
  if (!cached) {
    try {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = Tone.getContext().rawContext as AudioContext;
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      cached = {
        channelData: new Float32Array(audioBuffer.getChannelData(0)),
        sampleRate: audioBuffer.sampleRate
      };
      audioCache.set(audioUrl, cached);
    } catch (error) {
      console.error("[Waveform] 오디오 데이터 로드 실패:", error);
      return;
    }
  }
  
  audioData.value = cached;
};

onMounted(() => {
  loadAudioData();
});
</script>

<template>
  <div class="pointer-events-none absolute inset-0 h-full w-full opacity-60 mix-blend-screen">
    <template v-if="audioData">
      <WaveformChunk
        v-for="chunk in chunks"
        :key="chunk.id"
        :clip="clip"
        :audio-data="audioData"
        :chunk-left="chunk.left"
        :chunk-width="chunk.width"
      />
    </template>
  </div>
</template>