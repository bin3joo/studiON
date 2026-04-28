<script setup lang="ts">
import type { TrackUIState } from '../types';
import { Pencil, VolumeX } from 'lucide-vue-next';
import { useTrackStore } from '../store/useTrackStore'; //트랙스토얼를 임포트해서 타임라인 길이를 맞춘다.

// 트랙리스트로부터 트랙 1개의 데이터를 전달받음
defineProps<{
  track: TrackUIState
}>();

//스토어 사용
const trackStore = useTrackStore();

</script>

<template>
  <!--flex: 하위 요소 나란히 배치 // group: 상태 공유기 ,트랙 전체 그룹에 마우스를 올렸을떄 컨트롤 패널 색상 변경-->
  <!--sticky left-0 z-20: 스크롤 시 가장 위에 고정, 컨트롤 패널의 왼쪽을 고정-->
  <!-- shrink-0 : 줄어들지 않게 고정-->
   <!--min-w-0으로 텍스트가 늘어나는 걸 막고 글자를 잘라줌(truncate)-->
   <!--relative: 기준점, 부모 슬라이더의 회색 배경 우측-->
   <!--absolute: 자식, 기준점 안에서 자유롭게 공중부양, 트랙의 시작점, 슬라이더의 회색 배경 좌측-->
   <!--inset-0, inset-y, : absolute를 쓸때 상하좌우를 채움-->
   <!--flex-1 : 남은 공간을 모두 차지-->
   <!--border-border 테두리를 보더에 지정된 색으로 칠해라-->
  <div 
    :aria-label="`트랙: ${track.name}`" 
    
    class="flex border-b border-border group" 
  >

    
    <div 
      :aria-label="`${track.name} 컨트롤 패널`"
      class="sticky left-0 z-20 flex shrink-0 flex-col gap-1.5 border-r border-border bg-[#1c1c1c] py-2 px-3 transition-colors group-hover:bg-white/5"
      :style="{ 
        width: '224px', 
        borderLeft: `4px solid ${track.color || '#FF3DCB'}` 
      }"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-1.5">
          <span class="truncate text-sm font-bold tracking-wide text-white">
            {{ track.name }}
          </span>
          <button aria-label="트랙 이름 수정" class="shrink-0 text-muted-foreground transition hover:text-white">
            <Pencil class="h-3 w-3" />
          </button>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <button aria-label="음소거 토글" class="grid h-6 w-7 place-items-center rounded border border-white/30 bg-white/10 text-white transition hover:bg-white/20">
            <VolumeX class="h-3.5 w-3.5" />
          </button>
          <button aria-label="솔로 토글" class="grid h-6 w-7 place-items-center rounded border border-transparent bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-white">
            <span class="text-[10px] font-bold">S</span>
          </button>
        </div>
      </div>

      <div class="mt-auto flex flex-col gap-2">
        
        <div aria-label="볼륨 조절" class="flex items-center gap-2">
          <span aria-hidden="true" class="w-7 shrink-0 font-mono text-[9px] tracking-widest text-muted-foreground">VOL</span>
          <div class="relative h-1.5 flex-1 rounded-full bg-black/60">
            <div class="absolute inset-y-0 left-0 rounded-full bg-[#ff9800] shadow-[0_0_8px_#ff9800]" style="width: 50%"></div>
            <div class="absolute top-1/2 -mt-2 ml-[50%] h-4 w-4 -translate-x-1/2 rounded-full border-2 border-[#ff9800] bg-[#1c1c1c]"></div>
          </div>
          <div aria-label="현재 볼륨 수치" class="flex w-10 shrink-0 items-center justify-center rounded-[4px] border border-white/20 bg-black/20 py-0.5">
            <span class="font-mono text-[10px] tabular-nums text-white">
              {{ (track.volume || 0).toFixed(1) }}
            </span>
          </div>
        </div>

        <div aria-label="패닝 조절" class="flex items-center gap-2">
          <span aria-hidden="true" class="w-7 shrink-0 font-mono text-[9px] tracking-widest text-muted-foreground">PAN</span>
          <div class="relative h-1.5 flex-1 rounded-full bg-black/60">
            <div 
              class="absolute inset-y-0 rounded-full bg-[#d4d4d4] shadow-[0_0_8px_rgba(255,255,255,0.4)]" 
              :style="{
                left: (track.pan || 0) < 0 ? `${50 + (track.pan || 0) / 2}%` : '50%',
                width: `${Math.abs(track.pan || 0) / 2}%`
              }"
            ></div>
            <div 
              class="absolute top-1/2 -mt-2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-gray-300 bg-[#1c1c1c]"
              :style="{ left: `${50 + (track.pan || 0) / 2}%` }"
            ></div>
          </div>
          <div aria-label="현재 패닝 수치" class="flex w-10 shrink-0 items-center justify-center rounded-[4px] border border-white/20 bg-black/20 py-0.5">
            <span class="font-mono text-[10px] tabular-nums text-white">
              {{ track.pan === 0 ? 'C' : (track.pan || 0) }}
            </span>
          </div>
        </div>

      </div>
    </div> 
    <div 
      aria-label="오디오 클립 작업 영역" 
      class="relative flex-1 select-none bg-transparent py-1.5 touch-none overflow-hidden"
    >
      <div 
        class="relative h-full border-y border-r border-white/5 bg-card shadow-inner"
        :style="{ width: `${trackStore.totalTimelineWidth}px` }"
      >
        
        <div aria-hidden="true" class="pointer-events-none absolute inset-0">
          <div 
            v-for="bar in trackStore.projectInfo.totalBarCount" 
            :key="bar"
            class="absolute top-0 bottom-0 border-l"
            :style="{
              left: `${(bar - 1) * trackStore.pixelPerBar}px`, // 픽셀 기반 절대 좌표
              borderColor: (bar - 1) % 4 === 0 ? 'hsl(225 15% 45% / 0.4)' : 'hsl(228 12% 32% / 0.15)',
            }"
          ></div>
        </div>

        <div 
          v-for="clip in track.clips" 
          :key="clip.clipId"
          :aria-label="`오디오 클립: ${clip.audio?.originalName || track.name}`"
          class="absolute inset-y-1 cursor-grab rounded-md border-2 transition active:cursor-grabbing"
          :style="{ 
            left: `${clip.start * trackStore.pixelPerBar}px`, // % 대신 픽셀 곱하기
            width: `${clip.duration * trackStore.pixelPerBar}px`, // % 대신 픽셀 곱하기
            borderColor: `${clip.color}80`, 
            backgroundColor: `${clip.color}33`, 
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
          }"
        >
          <div 
            aria-hidden="true"
            class="absolute inset-x-0 top-0 truncate px-2 py-0.5 text-[10px] font-semibold pointer-events-none"
            :style="{ color: clip.color }"
          >
            {{ clip.audio?.originalName || track.name }}
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<style scoped>
</style>