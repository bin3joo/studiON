<script setup lang="ts">
import {ref} from 'vue';
import type { TrackUIState, ClipUIState } from '../types';
import { Pencil, VolumeX } from 'lucide-vue-next';
import { useTrackStore } from '../store/useTrackStore'; //트랙스토얼를 임포트해서 타임라인 길이를 맞춘다.

// 트랙리스트로부터 트랙 1개의 데이터를 전달받음
const props = defineProps<{
  track: TrackUIState
}>();

//스토어 사용
const trackStore = useTrackStore();

// ==========================================
// 클립 드래그 앤 드롭 로직
// ==========================================
const activeClip = ref<ClipUIState | null>(null); //현재 드래그 중인 클립 상태
const startMouseX = ref(0); //클립 드래그를 시작했을때 마우스 x 좌표
const startClipBar = ref(0); //클립 드래그를 시작했을때 클립의 시작 바 위치

//세로 이동을 위한 변수
const startMouseY = ref(0); //클립을 잡기 직전 마우스 y 좌표
const dragoffsetY = ref(0); //클립을 잡고 움직이기 시작한 지점으로부터 현재 마우스가 얼마나 아래/위에 있는지를 픽셀로 저장한 값

//1.클립을 쥐었을 때 (Pointer Down)
const onClipPointerDown = (e: PointerEvent, clip: ClipUIState) => {
  if(e.button !== 0) return; // 좌클릭만 허용하기
  e.stopPropagation(); //이벤트를 부모로 전달 안하기 (트랙의 빈 공간 클릭 방지)

  activeClip.value = clip; //현재 드래그하는 클립 상태로 저장
  startMouseX.value = e.clientX; //드래그 시작점의 x좌표 기록
  startMouseY.value = e.clientY; //드래그 시작점의 y좌표 기록
  
  startClipBar.value = clip.start; //드래그 시작점의 바 위치 기록
  dragoffsetY.value = 0; //차이 초기화
  clip.isDragging = true; // 시각적으로 피드백을 주기 위한 상태 변경

  //마우스가 브라우저를 벗어나도 이벤트를 놓지지 않도록 잡음
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
};
  //2.클립을 잡고 움직일때
  const onClipPointerMove = (e: PointerEvent) => {
    if(!activeClip.value || !activeClip.value.isDragging) return;

    //움직인 마우스 픽셀을 마디단위로 변환
    const deltaX = e.clientX - startMouseX.value;
    const deltaBar = deltaX / trackStore.pixelPerBar;

    let newStart = startClipBar.value + deltaBar;

    //0마디 이전으로 뚫고 나가지 못하게 막기
    newStart = Math.max(0, newStart); //0이하로는 내려가지마!

    //현재 줌 레벨에 따라 보이는 눈금에 맞춰서 반올림하여 자석처럼 붙게하기
    const snapResolution = trackStore.subDivision;
    newStart = Math.round(newStart * snapResolution) / snapResolution;

    //마우스가 위아래로 움직인 픽셀만큼 화면에 반영하기 위해 기록
    dragoffsetY.value = e.clientY - startMouseY.value;

    //클립위치 실시간 업데이트(Vue반응성에 의해 화면이 즉시 이동한다.)
    activeClip.value.start = newStart;

    //클립의 끝부분이 전체 타임라인의 90%를 넘어가면 트랙을 50마디씩 늘린다.
    const clipEnd = newStart + activeClip.value.duration;
    const currentTotalBars = trackStore.projectInfo.totalBarCount;

    if(clipEnd > currentTotalBars * 0.9) {
      trackStore.projectInfo.totalBarCount += 50;

    }
  };

  //3.클립을 놓았을때 (Pointer Up)
  const onClipPointerUp = (e: PointerEvent) => {
    if(!activeClip.value) return;

    //트랙간 이동 -> 마우스 커서 위치에 있는 모든 DOM요소를 뚫고 지나가서 실제 위에 있는 요소 찾기
    const elementsUnderMouse = document.elementsFromPoint(e.clientX, e.clientY);
    //검사된 요소 중 'data-track-id'속성을 가진 트랙 박스를 찾는다 (트랙이라고 선언된 녀석 찾기)
    const targetTrackEl = elementsUnderMouse.find((el) => el.hasAttribute('data-track-id'));
    //만약 해당 요소를 찾았다면,
    if(targetTrackEl) {
      const targetTrackId = Number(targetTrackEl.getAttribute('data-track-id'));
      //놓은 곳이 현재 트랙이 아니라 다른 트랙이라면 이사를 실행한다.
      if(targetTrackId && targetTrackId !== props.track.trackId) {
        trackStore.moveClipToTrack(activeClip.value.clipId, props.track.trackId, targetTrackId);

      }
    }

    console.log(`\n========================================`);
    console.log(`[UI 드래그 종료] 클립 ID: ${activeClip.value.clipId}`);
    console.log(`[UI 드래그 종료] 드롭된 마디 위치: ${activeClip.value.start}m`);
    console.log(`========================================`);

    //드래그 끝난 시점의 최종 마디 위치를 스토어에 알려서 오디오를 재배치
    trackStore.resyncClip(activeClip.value.clipId, activeClip.value.start);
    

    activeClip.value.isDragging = false; //드래그 끝
    activeClip.value = null; //클립 해제
    dragoffsetY.value = 0; //세로 이동값 초기화

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch(err) {
      console.warn("Pointer release failed", err);
    }

    //드래그가 끝나면 드래그 상태를 복원하여 이후의 이벤트가 정상적으로 작동하도록 함
    (e.currentTarget as HTMLElement).onpointerup = null;
    (e.currentTarget as HTMLElement).onpointermove = null;
  };

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
    class="flex border-b border-border group w-max min-w-full" 
    :data-track-id="track.trackId" 
    :class="{ 'relative z-50': track.clips.some(c => c.isDragging) }"
  >
    <div 
      :aria-label="`${track.name} 컨트롤 패널`"
      class="sticky left-0 z-20 flex shrink-0 flex-col gap-1.5 border-r border-border bg-[#1c1c1c] py-2 px-3 transition-colors group-hover:bg-[#282828]"
      :style="{ 
        width: '224px', 
        borderLeft: `4px solid ${track.color || '#FF3DCB'}` 
      }"
    >
    <!--빈틈 막는거-->
    <div class="absolute top-0 -bottom-px left-0 -right-px -z-10 bg-inherit pointer-events-none"></div>
      <div class="sticky left-0 z-20 w-[224px] shrink-0 border-r border-border bg-card"></div>
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
      class="relative shrink-0 select-none bg-transparent py-1.5 touch-none"
      :style="{ width: `${trackStore.totalTimelineWidth}px` }"
    >
      <div class="relative h-full border-y border-r border-white/5 bg-card shadow-inner">
        
        <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-0">
          <div 
            v-for="bar in trackStore.projectInfo.totalBarCount" 
            :key="bar"
            class="absolute top-0 bottom-0 border-l"
            :style="{
              left: `${(bar - 1) * trackStore.pixelPerBar}px`,
              borderColor: (bar - 1) % 4 === 0 ? '#505567' : '#393C45', // 4마디 단위 밝은 선 유지
            }"
          >
            <template v-if="trackStore.subDivision > 1">
              <div
                v-for="sub in trackStore.subDivision - 1"
                :key="sub"
                class="absolute top-0 bottom-0 border-l border-white/5"
                :style="{ left: `${(sub * trackStore.pixelPerBar) / trackStore.subDivision}px` }"
              ></div>
            </template>
          </div>
        </div>
        
        <div 
          v-for="clip in track.clips" 
          :key="clip.clipId"
          :aria-label="`오디오 클립: ${clip.audio?.originalName || track.name}`"
          class="absolute inset-y-1 z-10 cursor-grab rounded-md border-2 active:cursor-grabbing"
          :class="[clip.isDragging? 'opacity-80 scale-[1.01] z-50!': 'transition duration-200']"
          :style="{ 
            left: `${clip.start * trackStore.pixelPerBar}px`,
            width: `${clip.duration * trackStore.pixelPerBar}px`,
            borderColor: `${clip.color}80`, 
            backgroundColor: `${clip.color}33`, 
            boxShadow: clip.isDragging ? '0 8px 16px rgba(0,0,0,0.6)' : '0 2px 8px rgba(0,0,0,0.4)',
            transform: clip.isDragging ? `translateY(${dragoffsetY}px)` : 'none'
          }"
          @pointerdown="onClipPointerDown($event, clip)"
          @pointermove="onClipPointerMove"
          @pointerup="onClipPointerUp"
          @pointercancel="onClipPointerUp"
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
      <div 
        class="pointer-events-none absolute top-0 -bottom-px z-10 w-px bg-primary"
        :class="[
            { 'transition-[left] duration-150 ease-out': !trackStore.isPlaying }
        ]"
        :style="{ 
            left: `${trackStore.playheadPosition * trackStore.pixelPerBar}px`,
            transform: 'translateX(-50%)',
            boxShadow: '0 0 8px hsl(var(--primary) / 0.8)'
        }"
      ></div>

    </div>
    </div>
</template>
<style scoped>
</style>