<script setup lang="ts">
import { useTrackStore } from '../store/useTrackStore';

// 트랙 스토어에서 타임라인 상태와 픽셀 계산 사용
const trackStore = useTrackStore();
</script>

<template>
  <div 
    aria-label="타임라인 눈금자 및 재생 바 영역"
    class="sticky top-0 z-40 flex h-7 border-b border-border bg-card select-none"
  >
    <div 
      aria-label="트랙 헤더 정렬 공간"
      class="sticky left-0 z-20 w-[224px] shrink-0 border-r border-border bg-card"
    ></div>

    <div 
      aria-label="시간 축 탐색 영역"
      class="relative flex-1 cursor-pointer overflow-hidden touch-none"
    >
      
      <div 
        class="relative h-full"
        :style="{ width: `${trackStore.totalTimelineWidth}px` }"
      >
        <div 
          v-for="bar in trackStore.projectInfo.totalBarCount" 
          :key="bar"
          class="absolute top-0 bottom-0 border-l border-white/5"
          :style="{ left: `${(bar - 1) * trackStore.pixelPerBar}px` }"
        >
          <span 
            v-if="(bar - 1) % 4 === 0" 
            class="absolute left-1.5 bottom-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
          >
            {{ bar - 1 }}
          </span>
        </div>

        <div 
          aria-label="현재 재생 위치 표시 바"
          class="absolute top-0 z-50 flex flex-col items-center pointer-events-none"
          :style="{ 
            left: `${trackStore.playheadPosition * trackStore.pixelPerBar}px`,
            transform: 'translateX(-50%)' // 선의 굵기가 중앙을 기준으로 정렬되도록 보정
          }"
        >
        <!--h-2000px -> 길이 제한 해제-->
          <div 
            class="h-2000px w-px bg-primary"
            style="box-shadow: 0 0 8px hsl(var(--primary) / 0.8);"
          ></div>
        </div>

      </div>
    </div>
  </div>
</template>