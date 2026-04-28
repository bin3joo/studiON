<script setup lang="ts">
import {ref} from 'vue';
import { useTrackStore } from '../store/useTrackStore';

// 트랙 스토어에서 타임라인 상태와 픽셀 계산 사용
const trackStore = useTrackStore();

//1.타임라인 넒이 영역을 가져오기 위한 Ref
const timelineCanvasRef = ref<HTMLElement | null>(null);

//드래그 중인지 상태를 추적
const isScrubbing = ref(false);

// 2. 마우스의 X 좌표를 '마디(Bar)' 단위로 변환해 스토어에 업데이트하는 함수
const updatePlayhead = (clientX: number) => {
  if(!timelineCanvasRef.value) return;

  //요소의 현재 화면상 위치와 크기를 가져옴
  const rect = timelineCanvasRef.value.getBoundingClientRect();

  //마우스의 절대 좌표에서 도화지의 왼쪽 시작점을 빼서 '도화지 내부의 X 픽셀을 구함'
  const xPositionPx = clientX - rect.left;

  //픽셀을 다시 마디로 전환(예 120px 위치 / 1 마디당 120px = 1마디)
  let newPositionBar = xPositionPx / trackStore.pixelPerBar;

  //재생바가 0마디 이전으로 가거나, 전체 마디 수를 뚤고 나가 않도록 가둔다. (clamp)
  newPositionBar = Math.max(0, Math.min(newPositionBar, trackStore.projectInfo.totalBarCount));

  //반응형으로 인해 재생바 UI가 즉시 이동 (스토어 업데이트)
  trackStore.playheadPosition = newPositionBar;

}

//마우스 조작 이벤트 헨들러
//마우스 왼쪽 버튼을 누르는 순간 단 한번 발생
const onPointerDown = (e: PointerEvent) => {
  //마우스 좌클릭(버튼 번호 0)일때만 작동하도록 방어
  //마우스 우클릭이나 휠을 방어
  if(e.button !== 0) return;
  //드래그모드 시작임
  isScrubbing.value = true;

  //브라우저 밖으로 마우스가 나가도 이벤트를 놓지지 않도록 요소를 묶어둔다.
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

  //클릭한 즉시 그 자리로 재생바가 이동된다.
  updatePlayhead(e.clientX);
};

//드래그 중 (마우스를 누른 채로 이동하는 동안 계속해서 발생)
const onPointerMove = (e: PointerEvent) => {
  //드래그 중(마우스 버튼을 누른 상태)이 아닐 때, 혹은 브라우저 밖으로 나갔다면 중지
  if(!isScrubbing.value || e.buttons === 0) {
    isScrubbing.value = false;
    return;
  }
  //실시간 동기화 재생바가 마우스를 따라다니게 함
  updatePlayhead(e.clientX);
};

//드래그 종료 시점
const onPointerUp = (e:PointerEvent) => {
  if(!isScrubbing.value) return;
  isScrubbing.value = false;

  try{
    //마우스 캡처 해제
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }catch(error){
    console.error(error);
  }
};


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
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      
      <div
        ref="timelineCanvasRef"
        class="relative h-full"
        :style="{ width: `${trackStore.totalTimelineWidth}px` }"
      >
        <div 
          v-for="bar in trackStore.projectInfo.totalBarCount" 
          :key="bar"
          class="absolute top-0 h-full border-l border-white/5"
          :style="{ left: `${(bar - 1) * trackStore.pixelPerBar}px` }"
        >
          <span 
            v-if="(bar - 1) % 4 === 0" 
            class="absolute left-1.5 bottom-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
          >
            {{ bar - 1 }}
          </span>
        </div>

        <div 
          aria-label="현재 재생 위치 표시 바"
          class="absolute top-0 bottom-0 z-50 w-3.5 pointer-events-none"
          :style="{ 
            left: `${trackStore.playheadPosition * trackStore.pixelPerBar}px`,
            transform: 'translateX(-50%)' 
          }"
        >
          <div class="absolute top-0 bottom-[10px] left-1/2 -translate-x-1/2 w-1px bg-white/20"></div>

          <div 
            class="absolute bottom-0 left-0 w-full h-2.5 bg-primary"
            style="
              clip-path: polygon(0% 0%, 100% 0%, 50% 100%); 
              filter: drop-shadow(0 0 6px hsl(var(--primary) / 0.8));
            "
          ></div>
          
        </div>

      </div>
    </div>
  </div>
</template>