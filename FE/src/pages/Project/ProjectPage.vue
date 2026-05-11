<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { TrackMeasureCommentGroup, TimelineComment } from './types/comment.types'
import {useTrackStore} from './store/useTrackStore' //트랙 상태 저장소
import ProjectHeader from './components/ProjectHeader.vue'
import TrackList from './components/TrackList.vue' //트랙 리스트 컴포넌트
import InviteCodeModal from './components/InviteCodeModal.vue'
import ProjectSidePanel from './components/ProjectSidePanel.vue'
import TimelineRuler from './components/TimelineRuler.vue' //타임라인 눈금자
import PlayController from './components/PlayController.vue' //재생 컨트롤러
import * as Tone from 'tone' //오디오 엔진
import AiConflictOverlay from './components/AiConflictOverlay.vue'
import TrackItem from './components/TrackItem.vue'//트랙 아이템 마스터 트랙 렌더링용 
import RemoteCursors from './components/RemoteCursors.vue' //커서 컴포넌트
import { useCollabStore } from './store/useCollabStore';//공동 작업 스토어 
import {socketService} from '../../core/services/socket.service'; //웹 소켓 서비스
import {useAuthStore} from '@/pages/Onboarding/stores/auth.store';
import ProjectEqPanel from './components/ProjectEqPanel.vue'
import type { ClipEqBandState } from './types'

type SidePanelType = 'comments' | 'history' | 'ai' | null

const route = useRoute()
const projectId = route.params.projectId as string
const trackStore = useTrackStore() // 트랙 리스트 정보 사용 준비
const collabStore = useCollabStore(); //공동 작업 스토어 사용
const authStore = useAuthStore(); // Auth 스토어 사용 준비

//휠 이벤트를 적용할 컨테이너
const timelineContainerRef = ref<HTMLElement | null>(null)

// 재생바 자동 스크롤: 스토어의 RAF 루프에서 직접 컨테이너를 조작하도록 컨테이너 참조를 전달
watch(timelineContainerRef, (el) => {
  trackStore.setTimelineContainer(el);
}, { immediate: true });


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
const handleKeyDown = async (e: KeyboardEvent) => { // async 추가
  // 입력창(input, textarea)에 포커스가 있을 때는 단축키를 무시해야 합니다. (이름/볼륨 수정 중 스페이스바 띄어쓰기 보호)
  if ((e.target instanceof HTMLInputElement && e.target.type !== 'range') || e.target instanceof HTMLTextAreaElement) return;

  // 대소문자 상관없이 순수하게 C키만 눌렀을 때 코멘트 모드 전환
  if(e.code === 'KeyC' && !e.ctrlKey && !e.metaKey) {
    trackStore.toggleCommentMode();
    return;
  }

  // 스페이스바 처리
  if(e.code === 'Space' || e.key === ' '){
    e.preventDefault(); // 여기서 브라우저 기본 스크롤 동작을 완벽히 차단.
    await Tone.start(); 
    trackStore.togglePlay();
    return; // 실행 후 바로 종료
  }

// 삭제 (Delete / Backspace)
  if (e.code === 'Delete' || e.code === 'Backspace') {
    e.preventDefault();
    if (trackStore.selectedClip && trackStore.selectedTrackId) {
      trackStore.deleteClip(trackStore.selectedClip.clipId, trackStore.selectedTrackId);
      trackStore.deselectAll(); // 지운 후 선택 해제
    } else if (trackStore.selectedTrackId && !trackStore.selectedClip) {
      // 클립 없이 트랙만 선택된 경우 트랙 자체를 삭제
      trackStore.deleteTrack(trackStore.selectedTrackId);
    }
    return;
  }
  // Shift + T: 트랙 추가 단축키
  if (e.shiftKey && e.code === 'KeyT') {
    e.preventDefault();
    trackStore.addTrack();
    return;
  }

  // Ctrl 키(또는 Mac의 Cmd 키)와 함께 누른 경우
  if (e.ctrlKey || e.metaKey) {
    switch (e.code) {
      case 'KeyC': // 복사
        e.preventDefault();
        if (trackStore.selectedClip) {
          trackStore.copyClip(trackStore.selectedClip);
        }
        break;
        
      case 'KeyD': // 복제
        e.preventDefault();
        if (trackStore.selectedClip && trackStore.selectedTrackId) {
          trackStore.duplicateClip(trackStore.selectedClip, trackStore.selectedTrackId);
        }
        break;
        
      case 'KeyX': // 잘라내기
        e.preventDefault();
        if (trackStore.selectedClip && trackStore.selectedTrackId) {
          trackStore.cutClip(trackStore.selectedClip, trackStore.selectedTrackId);
          trackStore.deselectAll();
        }
        break;
        
      case 'KeyV': // 붙여넣기
        e.preventDefault();
        // 붙여넣기는 '현재 선택된 트랙'의 '현재 재생바 위치'에 붙여넣기 된다.
        // 클립을 선택한 상태라면 그 트랙에, 아니면 1번 트랙을 기본으로 넣기
      if (trackStore.clipboardClip) {
          // 1. 기본 타겟: 선택된 트랙 또는 1번 트랙
          let targetTrackId = trackStore.selectedTrackId || trackStore.trackList[0]?.trackId;

          // 2. 마우스가 위치한 곳의 트랙 ID 감지
          const elementsUnderMouse = document.elementsFromPoint(currentMouseX, currentMouseY);
          const targetTrackEl = elementsUnderMouse.find((el) => el.hasAttribute('data-track-id'));

          if (targetTrackEl) {
            targetTrackId = Number(targetTrackEl.getAttribute('data-track-id'));
          }

          if (targetTrackId) {
            //3. 마우스 X 좌표를 마디(Bar) 단위로 역산
            let targetBar = trackStore.playheadPosition; // 혹시라도 마우스 위치 계산에 실패하면 재생바로 폴백(Fallback)

            if (timelineContainerRef.value) {
              const scrollLeft = timelineContainerRef.value.scrollLeft;
              
              // 현재 마우스 X 좌표에서 왼쪽 컨트롤 패널 너비(224px)를 빼고, 스크롤된 양을 더함 = 절대 픽셀 위치
              const absoluteX = currentMouseX - 224 + scrollLeft; 
              
              // 픽셀을 마디(Bar)로 변환
              let calculatedBar = absoluteX / trackStore.pixelPerBar;
              
              // 현재 스냅(1/4 박자, 1/8 박자 등) 설정에 맞춰서 깔끔하게 자석처럼 붙게 반올림
              const snap = trackStore.subDivision;
              targetBar = Math.max(0, Math.round(calculatedBar * snap) / snap); // 0마디 이하 뚫고 나가지 않게 방지
            }

            // 계산된 최종 위치(targetBar)에 붙여넣기 실행!
            trackStore.pasteClip(targetTrackId, targetBar);
          }
        }
        break;
        
      case 'KeyE': //  분할(Split)
        e.preventDefault();
        const currentBar = trackStore.playheadPosition;

        if (trackStore.selectedClip && trackStore.selectedTrackId) {
          // 1. 선택된 클립이 명확히 있으면 그 클립만 안전하게 분할
          trackStore.splitClip(trackStore.selectedClip.clipId, trackStore.selectedTrackId);
        } else {
          // 2. 선택된 클립이 없다면? -> 재생바(Playhead) 선에 닿아있는 모든 트랙의 클립을 동시 분할
          let hasSplit = false;
          
          trackStore.trackList.forEach(track => {
            const clipUnderPlayhead = track.clips.find(c => 
              currentBar > c.start && currentBar < c.start + c.duration
            );
            
            // 재생바 아래에 깔린 클립이 발견되면 즉시 분할 스토어 액션 호출
            if (clipUnderPlayhead) {
              trackStore.splitClip(clipUnderPlayhead.clipId, track.trackId);
              hasSplit = true;
            }
          });

          if (!hasSplit) {
            console.log("재생바가 위치한 곳에 자를 수 있는 오디오 클립이 없습니다.");
          }
        }
        break;
      }
    }

  // Shift 키와 함께 누른 경우
  if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    switch (e.code) {
      case 'KeyT': // 트랙 추가
        e.preventDefault();
        trackStore.addTrack();
        break;
    }
  }
};
//사용자가 기존에 사용하던 테마 임시 저장
let previousTheme = '';

//  현재 마우스 좌표를 기억하는 변수
let currentMouseX = 0;
let currentMouseY = 0;

const updateMousePos = (e: MouseEvent) => {
  currentMouseX = e.clientX;
  currentMouseY = e.clientY;

  // 내 마우스 좌표를 서버로 계속 쏘기
 // collabStore.sendMyCursor(e.clientX, e.clientY);
};



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

    projectName.value = trackStore.projectInfo.name

    socketService.subscribe('PROJECT_ONLINE_USERS', (payload) => {
    onlineUsers.value = payload.users
  })

  socketService.subscribe('USER_JOINED_PROJECT', (payload) => {
    onlineUsers.value = [
      ...onlineUsers.value.filter(user => user.userId !== payload.user.userId),
      payload.user,
    ]
  })

  socketService.subscribe('USER_LEFT_PROJECT', (payload) => {
  console.log('[ProjectPage] USER_LEFT_PROJECT 수신:', payload)

  onlineUsers.value = onlineUsers.value.filter(
    user => user.userId !== payload.userId
  )
})

  socketService.subscribe('PROJECT_RENAMED', (payload) => {
    projectName.value = payload.name
    trackStore.projectInfo.name = payload.name
  })

    socketService.subscribe('COMMENT_ADDED', applyCommentAdded)
    socketService.subscribe('COMMENT_DELETED', applyCommentDeleted)
    socketService.subscribe('COMMENT_STATUS_CHANGED', applyCommentStatusChanged)
    socketService.subscribe('ERROR', handleSocketError)
  
    // 토큰이 이미 있으면 바로 연결 (문자열인 projectId를 Number로 변환!)
    if (authStore.accessToken) {
      socketService.connect(Number(projectId)); 
    } else {
      // 토큰이 아직 복구되지 않았다면, 토큰이 들어오는 순간을 기다렸다가 연결
      const unwatch = watch(() => authStore.accessToken, (newToken) => {
        if (newToken) {
          socketService.connect(Number(projectId)); // 여기도 Number() 추가!
          unwatch(); // 한 번 연결했으면 감시 종료
        }
      });
    }
  }
  
  //키보드 이벤트 리스너 등록 (캡처링 단계에서 가로채서 버튼 클릭 등 방지)
  window.addEventListener('keydown', handleKeyDown, { capture: true });
  //  마우스 이동 감지
  window.addEventListener('mousemove', updateMousePos);

//브라우저 기본 줌을 막기 위해 수동으로 이벤트 리스너 등록
if(timelineContainerRef.value) {
  timelineContainerRef.value.addEventListener('wheel', handleWheel, {passive: false}) 
  }

  //사용자가 화면을 클릭 혹은 키를누르는 순간 오디오 제한 해제
  window.addEventListener('pointerdown', unlockAudioEngine, {capture: true});
  window.addEventListener('keydown', unlockAudioEngine, {capture: true});

})

onUnmounted(()=>{
  //키보드 이벤트 제거
  window.removeEventListener('keydown', handleKeyDown, { capture: true });
  // 마우스 감지해제
  window.removeEventListener('mousemove', updateMousePos);
  //오디오 제한 해제 리스너 제거
  window.removeEventListener('pointerdown', unlockAudioEngine, {capture: true});
  window.removeEventListener('keydown', unlockAudioEngine, {capture: true});
  // 웹소켓 연결 해제
  socketService.disconnect();
  // 프로젝트 페이지를 벗어날 때 오디오 재생 즉시 중지
  trackStore.stopPlay();
})

interface OnlineUser {
  userId: number
  nickname: string
  profileImageUrl: string | null
}

const onlineUsers = ref<OnlineUser[]>([])
const projectName = ref('프로젝트')
const isInviteModalOpen = ref(false)
const activeSidePanel = ref<SidePanelType>(null)

function parseTrackId(trackId: string) {
  const parsed = Number(trackId)

  if (!Number.isNaN(parsed)) {
    return parsed
  }

  const matched = trackId.match(/\d+/)
  return matched ? Number(matched[0]) : 0
}

const hoveredMeasure = ref<number | null>(null)
const hoveredTrackId = ref<string | null>(null)

  function applyCommentAdded(data: {
  projectId: number
  trackId: number
  commentId: number
  parentCommentId: number | null
  content: string
  location: number
  isResolved: boolean
  author: {
    userId: number
    nickname: string
    profileImgUrl: string | null
  }
  mentionedUsers: {
    userId: number
    nickname: string
    profileImgUrl: string | null
  }[]
  createdAt: string
}) {
  const trackId = String(data.trackId)

  const target = commentGroups.value.find(group =>
    group.trackId === trackId && group.measure === data.location,
  )

  const newComment: TimelineComment = {
    id: String(data.commentId),
    author: data.author.nickname,
    content: data.content,
    color: '#d93ce6',
    profileImageUrl: data.author.profileImgUrl,
  }

  if (target) {
    target.comments.push(newComment)
    target.resolved = data.isResolved
  }
  else {
    commentGroups.value.push({
      trackId,
      trackName: findTrackName(trackId),
      measure: data.location,
      resolved: data.isResolved,
      comments: [newComment],
    })
  }
}

function findTrackName(trackId: string) {
  const numericTrackId = Number(trackId)

  if (trackStore.masterTrack.trackId === numericTrackId) {
    return trackStore.masterTrack.name
  }

  return trackStore.trackList.find(track =>
    track.trackId === numericTrackId
  )?.name ?? `트랙 ${trackId}`
}

function applyCommentDeleted(data: {
  projectId: number
  trackId: number
  commentId: number
  parentCommentId: number | null
}) {
  const trackId = String(data.trackId)
  const commentId = String(data.commentId)

  commentGroups.value = commentGroups.value
    .map(group => {
      if (group.trackId !== trackId) return group

      return {
        ...group,
        comments: group.comments.filter(comment => comment.id !== commentId),
      }
    })
    .filter(group => group.comments.length > 0)
}

function applyCommentStatusChanged(data: {
  projectId: number
  trackId: number
  commentId: number
  parentCommentId: number | null
  isResolved: boolean
  updatedAt: string
}) {
  const trackId = String(data.trackId)
  const commentId = String(data.commentId)

  const targetGroup = commentGroups.value.find(group =>
    group.trackId === trackId &&
    group.comments.some(comment => comment.id === commentId),
  )

  if (!targetGroup) return

  targetGroup.resolved = data.isResolved
}

function handleSocketError(error: {
  code: number
  message: string
}) {
  console.error('[댓글 웹소켓 에러]', error)
}

function handleResolveComment(payload: {
  trackId: string
  measure: number
}) {
  const targetGroup = commentGroups.value.find(group =>
    group.trackId === payload.trackId && group.measure === payload.measure,
  )

  const firstComment = targetGroup?.comments[0]

  if (!firstComment) return

  socketService.publish('COMMENT_STATUS_CHANGE', {
    commentId: Number(firstComment.id),
  })
}

function handleDeleteComment(payload: {
  commentId: number
}) {
  socketService.publish('COMMENT_DELETE', {
    commentId: payload.commentId,
  })
}

const commentGroups = ref<TrackMeasureCommentGroup[]>([])

function handleRename(nextName: string) {
  const trimmedName = nextName.trim()

  if (!trimmedName) return
  if (trimmedName === projectName.value) return

  socketService.publish('PROJECT_RENAME', {
    name: trimmedName,
  })
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
 // console.log('호버 이벤트 수신:', payload)

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

  if (!trimmed) return

  const trackId = parseTrackId(payload.trackId)

  console.log('[댓글 등록 직전]', {
    originalTrackId: payload.trackId,
    parsedTrackId: trackId,
    trackName: payload.trackName,
    measure: payload.measure,
  })

  socketService.publish('COMMENT_ADD', {
    trackId,
    parentCommentId: null,
    content: trimmed,
    location: payload.measure,
    mentionedUserIds: [],
  })
}

const aiAnalyzing = ref(false)

const aiConflict = ref<null | {
  startPercent: number
  endPercent: number
  barStart: number
  barEnd: number
  title: string
  summary: string
  bullets: string[]
}>(null)

const runAiAnalysis = () => {
  if (aiAnalyzing.value) return

  aiAnalyzing.value = true
  aiConflict.value = null

  setTimeout(() => {
    aiConflict.value = {
      startPercent: 18.3,
      endPercent: 23.3,
      barStart: 12,
      barEnd: 14,
      title: '12마디에서 14마디 사이',
      summary: '중음역대에서 충돌이 발생해요.',
      bullets: [
        '트랙을 선택해 충돌 구간을 확인해보세요.',
        '리드 신스 1과 리듬 기타 L의 200Hz~800Hz 대역이 겹쳐요.',
        '각 트랙 EQ에서 -3dB 정도 컷을 제안합니다.',
      ],
    }

    aiAnalyzing.value = false
  }, 1200)
}

const selectedEqTrack = computed(() => {
  const selectedTrackId = trackStore.selectedTrackId

  if (!selectedTrackId) return null

  return trackStore.trackList.find(track =>
    track.trackId === selectedTrackId
  ) ?? null
})

function handleApplyAiEq() {
  console.log('AI EQ 적용')
}

function handleCancelAiEq() {
  aiConflict.value = null
}

function handleAddEqBand(payload: {
  frequencyHz: number
  gainDeltaDb: number
}) {
  if (!trackStore.selectedClip || !trackStore.selectedTrackId) return

  trackStore.addClipEqBand(
    trackStore.selectedTrackId,
    trackStore.selectedClip.clipId,
    payload,
  )
}

function handleUpdateEqBand(payload: {
  bandOrder: number
  patch: Partial<ClipEqBandState>
}) {
  if (!trackStore.selectedClip || !trackStore.selectedTrackId) return

  trackStore.updateClipEqBand(
    trackStore.selectedTrackId,
    trackStore.selectedClip.clipId,
    payload.bandOrder,
    payload.patch,
  )
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

// 툴바 액션 핸들러
function handleActionCopy() {
  if (trackStore.selectedClip) {
    trackStore.copyClip(trackStore.selectedClip);
  }
}

function handleActionCut() {
  if (trackStore.selectedClip && trackStore.selectedTrackId) {
    trackStore.cutClip(trackStore.selectedClip, trackStore.selectedTrackId);
    trackStore.deselectAll();
  }
}

function handleActionPaste() {
  if (trackStore.clipboardClip) {
    let targetTrackId = trackStore.selectedTrackId || trackStore.trackList[0]?.trackId;
    let targetBar = trackStore.playheadPosition;

    if (targetTrackId) {
      trackStore.pasteClip(targetTrackId, targetBar);
    }
  }
}

function handleActionDuplicate() {
  if (trackStore.selectedClip && trackStore.selectedTrackId) {
    trackStore.duplicateClip(trackStore.selectedClip, trackStore.selectedTrackId);
  }
}

function handleActionSplit() {
  const currentBar = trackStore.playheadPosition;

  if (trackStore.selectedClip && trackStore.selectedTrackId) {
    trackStore.splitClip(trackStore.selectedClip.clipId, trackStore.selectedTrackId);
  } else {
    let hasSplit = false;
    trackStore.trackList.forEach(track => {
      const clipUnderPlayhead = track.clips.find(c => 
        currentBar > c.start && currentBar < c.start + c.duration
      );
      if (clipUnderPlayhead) {
        trackStore.splitClip(clipUnderPlayhead.clipId, track.trackId);
        hasSplit = true;
      }
    });

    if (!hasSplit) {
      console.log("재생바가 위치한 곳에 자를 수 있는 오디오 클립이 없습니다.");
    }
  }
}

function handleActionDelete() {
  if (trackStore.selectedClip && trackStore.selectedTrackId) {
    trackStore.deleteClip(trackStore.selectedClip.clipId, trackStore.selectedTrackId);
    trackStore.deselectAll();
  } else if (trackStore.selectedTrackId) {
    trackStore.deleteTrack(trackStore.selectedTrackId);
  }
}

function handleActionAddTrack() {
  trackStore.addTrack();
}

</script>

<template>
  <!--플랙스, 플랙스 콜 -> 내용물을 위에서 아래로 쌓음, h-screen -> 화면 전체 높이, overflow-hidden -> 넘치는 부분 숨김, bg-background -> 배경색, text-foreground -> 글자색 -->
  
  <div class="flex h-screen flex-col overflow-hidden bg-background text-foreground" >
    <ProjectHeader
  :project-name="projectName"
  :online-users="onlineUsers"
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
    <PlayController
      :ai-analyzing="aiAnalyzing"
      @run-ai-analysis="runAiAnalysis"
      @action-copy="handleActionCopy"
      @action-cut="handleActionCut"
      @action-paste="handleActionPaste"
      @action-duplicate="handleActionDuplicate"
      @action-split="handleActionSplit"
      @action-delete="handleActionDelete"
      @action-add-track="handleActionAddTrack"
    />
    <!-- flex-1 -> 남은 공간 차지, flex-col -> 위에서 아래로 쌓음, overflow-hidden -> 넘치는 부분 숨김, bg-muted/10 -> 배경색+투명도 -->
    <main class="flex flex-1 flex-col overflow-hidden bg-muted/10">

      <div 
        ref="timelineContainerRef" 
        class="flex-1 overflow-x-scroll overflow-y-auto relative flex flex-col custom-scrollbar"
        @pointerdown="trackStore.deselectAll()"
      >
        <!-- 눈금자 -->
        <div class="sticky top-0 z-40 w-max min-w-full bg-[#1c1c1c] border-b border-white/5">
          <TimelineRuler />
        </div>

        <AiConflictOverlay
    v-if="aiConflict"
    :conflict="aiConflict"
  />

        <!--  [세로 스크롤] -->
        <div class="w-max min-w-full pb-4 flex-1">
  <TrackList
    :hovered-measure="hoveredMeasure"
    :hovered-track-id="hoveredTrackId"
    :commented-groups="commentGroups"
    @hover-measure="handleHoverMeasure"
    @submit-inline-comment="handleSubmitInlineComment"
    @resolve-comment="handleResolveComment"
    @delete-comment="handleDeleteComment"
  />
</div>

        <!-- 마스터 트랙 -->
        <div class="mt-auto shrink-0 sticky bottom-0 z-70 w-max min-w-full shadow-[0_-16px_24px_rgba(0,0,0,0.5)] bg-[#1c1c1c]">
          <TrackItem
  :track="trackStore.masterTrack"
  :is-master="true"
  :hovered-measure="hoveredMeasure"
  :hovered-track-id="hoveredTrackId"
  :commented-groups="commentGroups"
  @hover-measure="handleHoverMeasure"
  @submit-inline-comment="handleSubmitInlineComment"
  @resolve-comment="handleResolveComment"
  @delete-comment="handleDeleteComment"
/>
        </div>
        
      </div>
      <ProjectEqPanel
  :selected-track="selectedEqTrack"
  :selected-clip="trackStore.selectedClip"
  :ai-analyzing="aiAnalyzing"
  :ai-analyzed="!!aiConflict"
  @apply-ai-eq="handleApplyAiEq"
  @cancel-ai-eq="handleCancelAiEq"
  @add-eq-band="handleAddEqBand"
  @update-eq-band="handleUpdateEqBand"
/>
    <!-- <ProjectPlaybar @open-ai-panel="handleOpenAiPanel" />

    <section class="px-6 py-4">
      <div class="relative">
        
        <ProjectSidePanel
          :open="activeSidePanel !== null"
          :type="activeSidePanel"
          @close="handleCloseSidePanel"
        />
      </div>
    </section>
 -->
    </main>

    <!-- 협업자 커서 렌더링 -->
    <RemoteCursors />
    <InviteCodeModal
      :open="isInviteModalOpen"
  :project-id="projectId"
  :project-name="projectName"
  @close="isInviteModalOpen = false"
    />
  </div>
</template>

<style scoped>
/*  1. 핵심: 세로 스크롤바는 두께 0으로 완벽 삭제, 가로는 12px 유지 */
.custom-scrollbar::-webkit-scrollbar {
  width: 0px !important;  /* 세로 스크롤바 공간 자체를 할당하지 않음! */
  height: 12px !important; /* 가로 스크롤바는 두께 유지 */
}

/* 2. 가로 스크롤바 배경(트랙) */
.custom-scrollbar::-webkit-scrollbar-track:horizontal {
  background: #131313;
  border-radius: 8px;
}

/* 3. 가로 스크롤바 손잡이(썸) */
.custom-scrollbar::-webkit-scrollbar-thumb:horizontal {
  background-color: #FF8F1A;
  border-radius: 8px;
  border: 3px solid #131313; /* 배경색으로 테두리를 깎아서 얇게 만듦 */
}

/* 4. 마우스 올렸을 때 살짝 밝아짐 */
.custom-scrollbar::-webkit-scrollbar-thumb:horizontal:hover {
  background-color: #ff9f3b;
}

/* 파이어폭스(Firefox) 대응 - 파이어폭스는 0px 조절이 안되어서 얇게 렌더링 */
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: #FF8F1A #131313;
}
</style>
