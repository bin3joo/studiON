<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import type { TrackMeasureCommentGroup, TimelineComment } from './types/comment.types'
import {useTrackStore} from './store/useTrackStore' //트랙 상태 저장소
import ProjectHeader from './components/ProjectHeader.vue'
import TrackList from './components/TrackList.vue' //트랙 리스트 컴포넌트
import InviteCodeModal from './components/InviteCodeModal.vue'
import ProjectPlaybar from './components/ProjectPlaybar.vue'
import ProjectEditSection from './components/ProjectEditSection.vue'
import ProjectAiSection from './components/ProjectAiSection.vue'
import ProjectSidePanel from './components/ProjectSidePanel.vue'
import TimelineRuler from './components/TimelineRuler.vue' //타임라인 눈금자
import PlayController from './components/PlayController.vue' //재생 컨트롤러
import * as Tone from 'tone' //오디오 엔진

type SidePanelType = 'comments' | 'history' | 'ai' | null


const route = useRoute()
const projectId = route.params.projectId as string
const projectName = computed(() => {
  const name = route.query.name
  return typeof name === 'string' && name.trim().length > 0
    ? name
    : '프로젝트'
})
const trackStore = useTrackStore() // 트랙 리스트 정보 사용 준비

//휠 이벤트를 적용할 컨테이너
const timelineContainerRef = ref<HTMLElement | null>(null)

//휠할때 마우스가 가르키는 위치에서 휠되게 
const handleWheel = (e: WheelEvent) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    
    const container = timelineContainerRef.value;
    if (!container) return;

    // 1. 마우스의 현재 컨테이너 내 상대적 픽셀 위치 구하기
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // 2. 줌 전의 스크롤 위치와 마디당 픽셀 확인
    const oldScrollLeft = container.scrollLeft;
    const oldPixelPerBar = trackStore.pixelPerBar;

    // 3. 현재 마우스가 가리키고 있는 '음악적 위치(마디)' 계산
    // 예: (스크롤 500px + 마우스 200px) / 마디당 120px = 5.83마디 지점
    const mouseBarPos = (oldScrollLeft + mouseX) / oldPixelPerBar;

    // 4. 줌 레벨 변경 (스토어 업데이트)
    trackStore.updateZoom(e.deltaY);

    // 5. 변경된 줌 배율이 적용된 후의 마디당 픽셀 확인
    const newPixelPerBar = trackStore.pixelPerBar;

    // 6. 새로운 스크롤 위치 계산
    // (마우스가 가리키던 마디 지점 * 새로운 픽셀 단위) - 마우스의 화면상 픽셀 위치
    const newScrollLeft = (mouseBarPos * newPixelPerBar) - mouseX;

    // 7. 계산된 스크롤 위치를 적용하여 마우스 위치 고정
    container.scrollLeft = newScrollLeft;
  }
};

//스페이스바 단축키 핸들러
const handleKeyDown = (e: KeyboardEvent) => {
  if(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return;
  }
  if(e.code === 'Space'){
    e.preventDefault();
    trackStore.togglePlay();
  }
}
//사용자가 기존에 사용하던 테마 임시 저장
let previousTheme = '';


// 프로젝트 시작 시 트랙 정보 불러오기
onMounted(async () => {
  //페이지 진입 시 무조건 다크 모드로 강제 전환
  const rootElement = document.documentElement;
  // 사용자가 원래 쓰고 있던 테마가 라이트 모드(클래스에 'dark'가 없음)인지 확인
  if (!rootElement.classList.contains('dark')) {
      previousTheme = 'light';
      rootElement.classList.add('dark'); // 강제로 다크 모드 켜기
  } else {
      previousTheme = 'dark';
  }
  

  //id가 존재할 때만 트랙 정보 불러오기
  if(projectId){
    await trackStore.fetchProject(Number(projectId))
  }
  //키보드 이벤트 리스너 등록
  window.addEventListener('keydown', handleKeyDown);

//브라우저 기본 줌을 막기 위해 수동으로 이벤트 리스너 등록
if(timelineContainerRef.value) {
  timelineContainerRef.value.addEventListener('wheel', handleWheel, {passive: false}) 
  }

  //사용자가 화면을 클릭 혹은 키를누르는 순간 오디오 제한 해제
  window.addEventListener('pointerdown', unlockAudioEngine);
  window.addEventListener('keydown', unlockAudioEngine);
})

onUnmounted(()=>{
  //키보드 이벤트 제거
  window.removeEventListener('keydown',handleKeyDown);
  //오디오 제한 해제 리스너 제거
  window.removeEventListener('pointerdown', unlockAudioEngine);
  window.removeEventListener('keydown', unlockAudioEngine);
})

const isInviteModalOpen = ref(false)
const activeSidePanel = ref<SidePanelType>(null)

const hoveredMeasure = ref<number | null>(null)
const hoveredTrackId = ref<string | null>(null)

const commentGroups = ref<TrackMeasureCommentGroup[]>([
  {
    trackId: 'track-1',
    trackName: '트랙 1',
    measure: 6,
    resolved: false,
    comments: [
      {
        id: 'c1',
        author: '협업자',
        mention: '@사용자1',
        content: '리버브 너무 길어요. 줄여보면 어떨까요?',
        color: '#e6c93e',
      },
    ],
  },
  {
    trackId: 'track-2',
    trackName: '딥 베이스 라인',
    measure: 10,
    resolved: false,
    comments: [
      {
        id: 'c2',
        author: '협업자',
        content: '리버브 너무 길어요. 줄여보면 어떨까요?',
        color: '#e6c93e',
      },
      {
        id: 'c3',
        author: '협업자',
        content: '싫으면 마세요.',
        color: '#e6c93e',
      },
    ],
  },
])

function handleRename() {
  console.log('프로젝트 이름 수정')
}

function handleExport() {
  console.log('내보내기')
}

function handleSaveVersion() {
  console.log('버전 저장')
}

function handleSave() {
  console.log('저장')
}

function handleUndo() {
  console.log('undo')
}

function handleRedo() {
  console.log('redo')
}

function handleOpenInvite() {
  isInviteModalOpen.value = true
}

function handleCloseInvite() {
  isInviteModalOpen.value = false
}

function handleOpenHistory() {
  activeSidePanel.value = 'history'
}

function handleOpenComments() {
  activeSidePanel.value = 'comments'
}

function handleOpenAiPanel() {
  activeSidePanel.value = 'ai'
}

function handleCloseSidePanel() {
  activeSidePanel.value = null
}

function handleHoverMeasure(payload: { trackId: string | null, measure: number | null }) {
  hoveredTrackId.value = payload.trackId
  hoveredMeasure.value = payload.measure
}

function handleSubmitInlineComment(payload: {
  trackId: string
  trackName: string
  measure: number
  content: string
}) {
  const trimmed = payload.content.trim()

  if (!trimmed)
    return

  const target = commentGroups.value.find(group =>
    group.trackId === payload.trackId && group.measure === payload.measure,
  )

  const newComment: TimelineComment = {
    id: crypto.randomUUID(),
    author: '사용자',
    content: trimmed,
    color: '#d93ce6',
  }

  if (target) {
    target.comments.push(newComment)
    target.resolved = false
  }
  else {
    commentGroups.value.push({
      trackId: payload.trackId,
      trackName: payload.trackName,
      measure: payload.measure,
      resolved: false,
      comments: [newComment],
    })
  }
}

function handleResolveComment(payload: {
  trackId: string
  measure: number
}) {
  const targetGroup = commentGroups.value.find(group =>
    group.trackId === payload.trackId && group.measure === payload.measure,
  )

  if (targetGroup) {
    targetGroup.resolved = !targetGroup.resolved
  }
}


//브라우저 오디오 제한 강제 해제
const unlockAudioEngine = async () => {
  if(Tone.getContext().state !== 'running') {
    await Tone.start();
    console.log('브라우저 오디오 제한 해제 완료')
  }

  //한번 풀렸으면 더 이상 이벤트 감지 필요 없으므로 리스너 삭제
  window.removeEventListener('pointerdown', unlockAudioEngine);
  window.removeEventListener('keydown', unlockAudioEngine);
}

</script>

<template>
  <!--플랙스, 플랙스 콜 -> 내용물을 위에서 아래로 쌓음, h-screen -> 화면 전체 높이, overflow-hidden -> 넘치는 부분 숨김, bg-background -> 배경색, text-foreground -> 글자색 -->
  <div class="flex h-screen flex-col overflow-hidden bg-background text-foreground" >
    <ProjectHeader
      :project-name="projectName"
      last-saved-at="13:24"
      @rename="handleRename"
      @export="handleExport"
      @save-version="handleSaveVersion"
      @save="handleSave"
      @undo="handleUndo"
      @redo="handleRedo"
      @open-invite="handleOpenInvite"
      @open-comments="handleOpenComments"
      @open-history="handleOpenHistory"
    />
    <!-- 재생 컨트롤러 컴포넌트 추가 -->
    <PlayController />
    <!-- flex-1 -> 남은 공간 차지, flex-col -> 위에서 아래로 쌓음, overflow-hidden -> 넘치는 부분 숨김, bg-muted/10 -> 배경색+투명도 -->
    <main class="flex flex-1 flex-col overflow-hidden bg-muted/10">
      <!-- flex-1 -> 남은 공간 차지, overflow-auto -> 넘치는 부분 스크롤 -->
      <div ref="timelineContainerRef" class="flex-1 overflow-auto relative flex flex-col">
        <!--눈금자 컴포넌트 추가 -->
        <TimelineRuler />
        <!--트랙리스트-->
        <TrackList />
      </div>

    <!-- <ProjectPlaybar @open-ai-panel="handleOpenAiPanel" />

    <section class="px-6 py-4">
      <div class="relative">
        <ProjectEditSection
          :hovered-measure="hoveredMeasure"
          :hovered-track-id="hoveredTrackId"
          :commented-groups="commentGroups"
          @hover-measure="handleHoverMeasure"
          @submit-inline-comment="handleSubmitInlineComment"
          @resolve-comment="handleResolveComment"
        />

        <ProjectSidePanel
          :open="activeSidePanel !== null"
          :type="activeSidePanel"
          @close="handleCloseSidePanel"
        />
      </div>
    </section>

    <ProjectAiSection /> -->
    </main>


    <InviteCodeModal
      :open="isInviteModalOpen"
      :project-id="projectId"
      @close="handleCloseInvite"
    />
  </div>
</template>