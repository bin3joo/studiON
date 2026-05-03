<script setup lang="ts">
import {ref} from 'vue';
import type { TrackUIState, ClipUIState } from '../types';
import { Pencil, VolumeX } from 'lucide-vue-next';
import { useTrackStore } from '../store/useTrackStore'; //트랙스토얼를 임포트해서 타임라인 길이를 맞춘다.
import WaveformWebGL from './WaveformWebGL.vue'; //파형 컴포넌트 불러오기
import {UploadIcon, ScissorsIcon, ClipboardIcon, TrashIcon, CopyIcon, CopyPlusIcon} from 'lucide-vue-next';

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

//오토스크롤 위한 추가 변수들
const startScrollLeft = ref(0); //드래그 시작 시점의 스크롤 위치
let scrollContainer: HTMLElement | null = null; //스크롤되는 부모 요소
let currentClientX = 0; //현재 마우스 X 좌표 (루프에서 감시용)
let autoScrollRafId: number | null = null; // 오토스크롤 애니메이션 ID

//클립 위치 계산 함수(마우스 이동 + 스크롤 이동 동시 반영)
function updateClipPosition() {
  if(!activeClip.value || !scrollContainer) return;

  const currentScrollLeft = (scrollContainer as HTMLElement).scrollLeft; //현재 스크롤량 가져오기

  const deltaX = (currentClientX - startMouseX.value) + (currentScrollLeft - startScrollLeft.value); //이동거리 계산
  const deltaBar = deltaX / trackStore.pixelPerBar; //이동 거리를 마디 단위로 변환
  let newStart = startClipBar.value + deltaBar; //새로운 시작점 계산

  //0마디 이전으로 뚫고 나가지 못하게 막기
  newStart = Math.max(0, newStart);
  //클립 이동시 자동처럼 붙는 기능
  const snapResolution = trackStore.subDivision; //스냅 해상도
  newStart = Math.round(newStart * snapResolution) / snapResolution; 
  
  activeClip.value.start = newStart; 
  
  //드래그가 끝나도 화면이 잘리지 않도록 필요하면 트랙을 늘리는 로직
  const clipEnd = newStart + activeClip.value.duration; 
  const currentTotalBars = trackStore.projectInfo.totalBarCount; 
  
  if(clipEnd > currentTotalBars * 0.9) { 
    trackStore.projectInfo.totalBarCount += 50; 
  }
}
  
  //마우스를 누르고 있을때 백 그라운드에서 돌아가는 오토 스크롤 엔진
 //마우스를 누르고 있을때 백 그라운드에서 돌아가는 오토 스크롤 엔진
function autoScrollLoop() {
  if(!activeClip.value || !scrollContainer) return; //조건이 맞지 않으면 함수 종료
  
  const EDGE_THRESHOLD = 80; //가장자리에서 80px안쪽으로 들어오면 자동 스크롤 시작
  const SCROLL_SPEED = 15; //한 프레임당 15px씩 밀어내기
  let scrolled = false; 

  //1. 오른화면 끝 도달
  if(currentClientX > window.innerWidth - EDGE_THRESHOLD){
    (scrollContainer as HTMLElement).scrollLeft += SCROLL_SPEED; 
    scrolled = true;
  }

  //2. 왼화면 끝 도달 (왼쪽 컨트롤 패널 224px 고려)
  if(currentClientX < 224 + EDGE_THRESHOLD){
    (scrollContainer as HTMLElement).scrollLeft -= SCROLL_SPEED; 
    scrolled = true;
  }

  // 스크롤이 발생했다면, 마우스가 가만히 있어도 클립 위치를 갱신해야 함
  if (scrolled) {
    updateClipPosition(); 
  }

  // 드래그 중이면 끊임없이 다음 프레임 예약
  autoScrollRafId = requestAnimationFrame(autoScrollLoop);
}

// ==========================================
// 3. 마우스 조작 이벤트 핸들러
// ==========================================
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

  // 가장 가까운 스크롤 영역('.overflow-auto')을 찾아 오토 스크롤 셋팅
  scrollContainer = (e.currentTarget as HTMLElement).closest('.overflow-auto');
  startScrollLeft.value = scrollContainer ? scrollContainer.scrollLeft : 0;
  currentClientX = e.clientX; // 좌표 초기화

  // 오토 스크롤 엔진 가동
  if (autoScrollRafId) cancelAnimationFrame(autoScrollRafId);
  autoScrollRafId = requestAnimationFrame(autoScrollLoop);

  //마우스가 브라우저를 벗어나도 이벤트를 놓지지 않도록 잡음
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
};

  //2.클립을 잡고 움직일때
  const onClipPointerMove = (e: PointerEvent) => {
    if(!activeClip.value || !activeClip.value.isDragging) return;

    //1. 엔진이 알 수 있게 마우스 좌표 최신화
    currentClientX = e.clientX;
    dragoffsetY.value = e.clientY - startMouseY.value; //2. 세로 이동값 계산


    //2. 업데이트 클립으로 위치 갱신
    updateClipPosition();
  };

  //3.클립을 놓았을때 (Pointer Up)
  const onClipPointerUp = (e: PointerEvent) => {
    const currentClip = activeClip.value as ClipUIState;//변수의 타입을 CLIPUIState로 확정
    if(!activeClip.value) return;

    //오토 스크롤 엔진 종료
    if(autoScrollRafId) {
      cancelAnimationFrame(autoScrollRafId);
      autoScrollRafId = null;
    }
    //트랙간 이동 -> 마우스 커서 위치에 있는 모든 DOM요소를 뚫고 지나가서 실제 위에 있는 요소 찾기
    const elementsUnderMouse = document.elementsFromPoint(e.clientX, e.clientY);
    //검사된 요소 중 'data-track-id'속성을 가진 트랙 박스를 찾는다 (트랙이라고 선언된 녀석 찾기)
    const targetTrackEl = elementsUnderMouse.find((el) => el.hasAttribute('data-track-id'));

    let finalTrackId = props.track.trackId; //기본은 현재 트랙 
    //만약 해당 요소를 찾았다면,
    if(targetTrackEl) {
      const targetTrackId = Number(targetTrackEl.getAttribute('data-track-id'));
      //놓은 곳이 현재 트랙이 아니라 다른 트랙이라면 이사를 실행한다.
      if(targetTrackId && targetTrackId !== props.track.trackId) {
        trackStore.moveClipToTrack(activeClip.value.clipId, props.track.trackId, targetTrackId);
        finalTrackId = targetTrackId; // 이사간 트랙 아이디
      }
    }

    //겹침 방지로직
    const finalTrack = trackStore.trackList.find(t => t.trackId === finalTrackId);
    if (finalTrack) {
      let hasOverlap = true;
      const epsilon = 0.001; // 미세한 소수점 오차로 인한 무한루프 방지
      let safetyCounter = 0; // 무한 루프 방지용

    //  현재 짚은 위치의 앞에 들어갈 수 있는지 빈 공간을 미리 검사하는 헬퍼 함수
      const isSpaceClear = (targetStart: number, duration: number) => {
        if (targetStart < 0) return false; // 0마디 이전은 벽이므로 공간 없음
        const targetEnd = targetStart + duration;
        
        for (const c of finalTrack.clips) {
          if (c.clipId === currentClip.clipId) continue;
          if (targetStart < c.start + c.duration - epsilon && targetEnd > c.start + epsilon) {
            return false; // 다른 클립에 부딪히면 좁은 것
          }
        }
        return true; // 안전한 빈 공간
      };

      // 겹치는 클립이 없을 때까지 계속 뒤로 밀어냅니다. (연쇄 밀어내기 지원)
      while (hasOverlap && safetyCounter < 100) {
        hasOverlap = false;
        safetyCounter++;
        
        for (const otherClip of finalTrack.clips) {
          // 자기 자신은 비교 대상에서 제외
          if (otherClip.clipId === activeClip.value.clipId) continue;

          const existingStart = otherClip.start;
          const existingEnd = otherClip.start + otherClip.duration;
          
          const activeStart = activeClip.value.start;
          const activeEnd = activeClip.value.start + activeClip.value.duration;
          const activeDuration = activeClip.value.duration;

          // 겹침 판별 공식: (A의 시작 < B의 끝) && (A의 끝 > B의 시작)
          if (activeStart < existingEnd - epsilon && activeEnd > existingStart + epsilon) {
            hasOverlap = true;

            // 마우스를 놓은 위치(클립의 중심점)와 기존 클립의 중심점을 비교
            const dropCenter = activeStart + (activeDuration / 2);
            const existingCenter = existingStart + (otherClip.duration / 2);

            let placedFront = false;

            // 1. 기존 클립의 '앞쪽' 절반에 놓았을 경우
            if (dropCenter <= existingCenter) {
              const proposedStart = existingStart - activeDuration;
              
              // 바로 앞에 끼워 넣을 공간이 충분한지 검사!
              if (isSpaceClear(proposedStart, activeDuration)) {
                activeClip.value.start = proposedStart; // 쏙! 앞으로 당겨짐
                placedFront = true;
              }
            }

            // 2. '뒤쪽'에 놓았거나, 앞쪽에 놓고 싶었지만 다른 클립이 가로막고 있는 경우
            if (!placedFront) {
              activeClip.value.start = existingEnd; // 안전하게 뒤로 밀어냄
            }
            break;
          }
        }
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
      console.warn("releasePointerCapture 오류 발생", err);
    }

    //드래그가 끝나면 드래그 상태를 복원하여 이후의 이벤트가 정상적으로 작동하도록 함
    (e.currentTarget as HTMLElement).onpointerup = null;
    (e.currentTarget as HTMLElement).onpointermove = null;
  };

 // ==========================================
// 우클릭 컨텍스트 메뉴 상태 관리
// ==========================================
const menuState = ref({
  isOpen: false,
  x: 0,
  y: 0,
  type: 'track' as 'track' | 'clip',
  targetTrackId: -1,
  targetClip: null as ClipUIState | null,
  targetBar: 0 // 마우스 커서가 가리키고 있는 타임라인 마디 위치
});

// 1. 트랙(빈 공간) 우클릭
const onTrackRightClick = (e: MouseEvent, trackId: number) => {
  // 현재 스크롤 위치와 왼쪽 패널 너비(224px)를 계산하여, 마우스가 위치한 '마디(Bar)'를 역산
  const scrollContainer = document.querySelector('.overflow-auto') as HTMLElement;
  const scrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
  
  // 마우스 X좌표 - 패널너비 + 스크롤량 = 타임라인 내부의 절대 픽셀 좌표
  const absoluteX = e.clientX - 224 + scrollLeft; 
  
  // 스냅 해상도(subDivision)에 맞춰서 위치 보정
  let targetBar = absoluteX / trackStore.pixelPerBar;
  const snap = trackStore.subDivision;
  targetBar = Math.max(0, Math.round(targetBar * snap) / snap);

  menuState.value = {
    isOpen: true,
    x: e.clientX,
    y: e.clientY,
    type: 'track',
    targetTrackId: trackId,
    targetClip: null,
    targetBar: targetBar
  };
};

// 2. 클립 우클릭
const onClipRightClick = (e: MouseEvent, clip: ClipUIState, trackId: number) => {
  menuState.value = {
    isOpen: true,
    x: e.clientX,
    y: e.clientY,
    type: 'clip',
    targetTrackId: trackId,
    targetClip: clip,
    targetBar: clip.start
  };
};

// 메뉴 닫기
const closeMenu = () => {
  menuState.value.isOpen = false;
};

// ==========================================
// 메뉴 실행 액션들
// ==========================================

// 복제
const handleDuplicate = () => {
  if (menuState.value.targetClip) {
    trackStore.duplicateClip(menuState.value.targetClip, menuState.value.targetTrackId);
  }
  closeMenu();
};

//복사
const handleCopy = () => {
  if (menuState.value.targetClip) trackStore.copyClip(menuState.value.targetClip);
  closeMenu();
};

//자르기
const handleCut = () => {
  if (menuState.value.targetClip) trackStore.cutClip(menuState.value.targetClip, menuState.value.targetTrackId);
  closeMenu();
};

//붙여넣기
const handlePaste = () => {
  if (trackStore.clipboardClip) {
    trackStore.pasteClip(menuState.value.targetTrackId, menuState.value.targetBar);
  }
  closeMenu();
};

//삭제
const handleDelete = () => {
  if (menuState.value.targetClip) trackStore.deleteClip(menuState.value.targetClip.clipId, menuState.value.targetTrackId);
  closeMenu();
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
    <!--타임라인 우측 작업 영역-->
    <div 
      aria-label="오디오 클립 작업 영역" 
      class="relative shrink-0 select-none bg-transparent py-1.5 touch-none"
      :style="{ width: `${trackStore.totalTimelineWidth}px` }"
      @wheel.ctrl.prevent="trackStore.updateZoom($event.deltaY)"
    >
      <div class="relative h-full border-y border-r border-white/5 bg-card shadow-inner">
      
      <!--트랙 빈 공간 우클릭 감지용 투명 레이어 가장 바닥에 깔림 z-0-->
      <div 
          class="absolute inset-0 z-0 cursor-context-menu"
          @contextmenu.prevent.stop="onTrackRightClick($event, track.trackId)"
        ></div>

      <!--마디 세로줄 렌더링-->
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
        
        <!--실제 클립 렌더링 및  클립 전용 우클릭 이벤트(z-10)-->
        <div 
          v-for="clip in track.clips" 
          :key="`${clip.clipId}-${clip.start}`"
          :aria-label="`오디오 클립: ${clip.audio?.originalName || track.name}`"
          class="absolute inset-y-1 z-10 cursor-grab rounded-md border-2 active:cursor-grabbing"
          :class="[clip.isDragging? 'opacity-80 brightness-125 shadow-2xl z-50!': 'transition duration-200']"
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
          @contextmenu.prevent.stop="onClipRightClick($event, clip, track.trackId)"
        >
          <div 
            aria-hidden="true"
            class="absolute inset-x-0 top-0 truncate px-2 py-0.5 text-[10px] font-semibold pointer-events-none"
            :style="{ color: clip.color }"
          >
            {{ clip.audio?.originalName || track.name }}
          </div>

          <!--GPU 파형 컴포넌트-->
          <WaveformWebGL 
            v-if="clip.audio?.cdnUrl" 
            :key="`wave-${clip.clipId}-${clip.start}`"
            :clip="clip"
          />

        </div>

      </div> 

      <!--재생바-->
      <div 
        class="pointer-events-none absolute top-0 -bottom-px z-10 w-px bg-primary"
        :style="{ 
            left: `${trackStore.playheadPosition * trackStore.pixelPerBar}px`,
            transform: 'translateX(-50%)',
            boxShadow: '0 0 8px hsl(var(--primary) / 0.8)'
        }"
      ></div>

    </div>
    </div>

    <!-- ========================================== -->
  <!-- 우클릭 컨텍스트 메뉴 UI (화면 최상단에 렌더링) -->
  <!-- ========================================== -->
  <Teleport to="body">
    <!-- 배경 클릭 시 메뉴 닫기용 투명 오버레이 -->
    <div 
      v-if="menuState.isOpen" 
      class="fixed inset-0 z-9998" 
      @mousedown="closeMenu" 
      @contextmenu.prevent.stop="closeMenu"
    ></div>

    <!-- 메뉴 본체 -->
    <div 
      v-if="menuState.isOpen"
      class="fixed z-9999 w-56 rounded-md border border-[#393C45] bg-[#1E1E21] py-1.5 shadow-2xl text-[13px] text-[#D4CED2]"
      :style="{ top: `${menuState.y}px`, left: `${menuState.x}px` }"
    >
      <!-- 트랙 우클릭 시에만 보여줄 메뉴 (클립 우클릭 시엔 비활성화/숨김) -->
      <template v-if="menuState.type === 'track'">
        <button class="flex w-full items-center justify-between px-4 py-1.5 hover:bg-white/10">
          <span class="flex items-center gap-2"><UploadIcon class="h-4 w-4" /> 오디오 불러오기</span>
          <span class="text-[10px] text-gray-500">⌘I</span>
        </button>
        <div class="my-1 h-px w-full bg-[#393C45]"></div>
      </template>

      <!-- 클립 우클릭 시 활성화되는 메뉴들 -->
      <button
        @click="handleDuplicate"
        class="flex w-full items-center justify-between px-4 py-1.5"
        :class="menuState.type === 'clip' ? 'hover:bg-white/10' : 'opacity-40 cursor-not-allowed'"
        :disabled="menuState.type !== 'clip'"
      >
        <span class="flex items-center gap-2"><CopyPlusIcon class="h-4 w-4" /> 클립 복제</span>
        <span class="text-[10px] text-gray-500">⌘D</span>
      </button>

      <div class="my-1 h-px w-full bg-[#393C45]"></div>

      <button 
        @click="handleCopy"
        class="flex w-full items-center justify-between px-4 py-1.5"
        :class="menuState.type === 'clip' ? 'hover:bg-white/10' : 'opacity-40 cursor-not-allowed'"
        :disabled="menuState.type !== 'clip'"
      >
        <span class="flex items-center gap-2"><CopyIcon class="h-4 w-4" /> 복사</span>
        <span class="text-[10px] text-gray-500">⌘C</span>
      </button>

      <button 
        @click="handleCut"
        class="flex w-full items-center justify-between px-4 py-1.5"
        :class="menuState.type === 'clip' ? 'hover:bg-white/10' : 'opacity-40 cursor-not-allowed'"
        :disabled="menuState.type !== 'clip'"
      >
        <span class="flex items-center gap-2"><ScissorsIcon class="h-4 w-4" /> 잘라내기</span>
        <span class="text-[10px] text-gray-500">⌘X</span>
      </button>

      <!-- 붙여넣기는 클립보드에 데이터가 있을 때만 활성화 -->
      <button 
        @click="handlePaste"
        class="flex w-full items-center justify-between px-4 py-1.5"
        :class="trackStore.clipboardClip ? 'hover:bg-white/10' : 'opacity-40 cursor-not-allowed'"
        :disabled="!trackStore.clipboardClip"
      >
        <span class="flex items-center gap-2"><ClipboardIcon class="h-4 w-4" /> 붙여넣기</span>
        <span class="text-[10px] text-gray-500">⌘V</span>
      </button>

      <div class="my-1 h-px w-full bg-[#393C45]"></div>

      <button 
        @click="handleDelete"
        class="flex w-full items-center justify-between px-4 py-1.5"
        :class="menuState.type === 'clip' ? 'hover:bg-red-500/20 text-red-400' : 'opacity-40 cursor-not-allowed'"
        :disabled="menuState.type !== 'clip'"
      >
        <span class="flex items-center gap-2"><TrashIcon class="h-4 w-4" /> 삭제</span>
        <span class="text-[10px] text-gray-500">DEL</span>
      </button>
    </div>
  </Teleport>

</template>
<style scoped>
</style>