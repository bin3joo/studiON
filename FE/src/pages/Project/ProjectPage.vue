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
import type { TrackEqBandState } from './types'
import { AlertTriangle } from 'lucide-vue-next';
import { projectApi } from './api/project.api';
import { useProjectSave } from './composables/useProjectSave';
import { useCommentStore } from './store/useCommentStore'
import ExportModal from './components/ExportModal.vue';
import { useProjectAiWorkflow } from './composables/useProjectAiWorkflow'
import { useProjectCollaboration } from './composables/useProjectCollaboration'
import ProjectGuideOverlay from '@/pages/Project/components/ProjectGuideOverlay.vue'

type SidePanelType = 'comments' | 'history' | 'ai' | null

const route = useRoute()
const projectId = route.params.projectId as string
const trackStore = useTrackStore() // 트랙 리스트 정보 사용 준비
const collabStore = useCollabStore(); //공동 작업 스토어 사용
const authStore = useAuthStore(); // Auth 스토어 사용 준비
const commentStore = useCommentStore(); // 코멘트 전역 상태 사용

// 현재 내 정보 (토큰에서 추출)
const currentUserId = computed(() => {
  if (!authStore.accessToken) return null
  try {
    const payload = JSON.parse(atob(authStore.accessToken.split('.')[1]))
    return payload.userId || payload.memberId || null
  } catch(e) {
    return null
  }
})

const {
  onlineUsers,
  projectName,
  syncProjectNameFromStore,
  registerProjectSocketHandlers,
  connectProjectSocket,
  disconnectProjectSocket,
  handleRename,
} = useProjectCollaboration(Number(projectId))

const { lastSavedTime, handleSave } = useProjectSave(Number(projectId));
const TIMELINE_TRACK_HEADER_WIDTH = 266

//휠 이벤트를 적용할 컨테이너
const timelineContainerRef = ref<HTMLElement | null>(null)
const masterTrackWrapperRef = ref<HTMLElement | null>(null)

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

let scrollRafId: number | null = null;
const handleHorizontalScroll = (e: Event) => {
  if (scrollRafId) return;
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null;
    const target = e.target as HTMLElement;
    if (target) {
      trackStore.viewportLeft = target.scrollLeft;
      trackStore.viewportRight = target.scrollLeft + target.clientWidth;
    }
  });
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
      case 'KeyS': // 저장
        e.preventDefault();
        handleSave();
        break;

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
        } else if (trackStore.selectedTrackId) {
          // 2. 선택된 클립이 없다면, 선택된 트랙이 있는지 확인하고 해당 트랙의 클립만 분할
          const track = trackStore.trackList.find(t => t.trackId === trackStore.selectedTrackId);
          if (track) {
            const clipUnderPlayhead = track.clips.find(c => 
              currentBar > c.start && currentBar < c.start + c.duration
            );
            if (clipUnderPlayhead) {
              trackStore.splitClip(clipUnderPlayhead.clipId, track.trackId);
            } else {
              alert("선택한 트랙의 재생바 위치에 자를 수 있는 오디오 클립이 없습니다.");
            }
          }
        } else {
          // 3. 아무것도 선택되지 않은 경우 분할 취소
          alert("분할할 클립이나 트랙을 선택해 주세요.");
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

    syncProjectNameFromStore()
    registerProjectSocketHandlers()

    socketService.subscribe('COMMENT_ADDED', applyCommentAdded)
    socketService.subscribe('COMMENT_DELETED', applyCommentDeleted)
    socketService.subscribe('COMMENT_STATUS_CHANGED', applyCommentStatusChanged)
    socketService.subscribe('ERROR', handleSocketError)
  
    connectProjectSocket()
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

await nextTick()

const hasSeenGuide =
  localStorage.getItem(PROJECT_GUIDE_STORAGE_KEY) === 'true'

if (FORCE_SHOW_PROJECT_GUIDE || !hasSeenGuide) {
  isProjectGuideOpen.value = true
}

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
  disconnectProjectSocket()
  // 프로젝트 페이지를 벗어날 때 오디오 재생 즉시 중지
  trackStore.stopPlay();
})


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

  // 코멘트 스토어 동기화
  if (projectId) {
    commentStore.fetchComments(Number(projectId));
  }
  
  // 내가 작성한 코멘트가 아니라면 알림 점 표시
  if (data.author.userId !== currentUserId.value) {
    commentStore.setHasNewComment(true)
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

  if (projectId) {
    commentStore.fetchComments(Number(projectId));
  }
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

  if (projectId) {
    commentStore.fetchComments(Number(projectId));
  }
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

const isExportModalOpen = ref(false)

function handleExport() {
  isExportModalOpen.value = true
}

function handleSaveVersion() {
  console.log('버전 저장')
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
  commentStore.setHasNewComment(false)
  activeSidePanel.value = 'comments'
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

function handlePanelResolveComment(commentId: number) {
  socketService.publish('COMMENT_STATUS_CHANGE', {
    commentId,
  })
}

function handlePanelAddReply(parentCommentId: number, content: string) {
  const parent = commentStore.comments.find(c => c.commentId === parentCommentId);
  if (!parent) return;

  socketService.publish('COMMENT_ADD', {
    trackId: parent.trackId,
    parentCommentId,
    content: content.trim(),
    location: parent.location,
    mentionedUserIds: [],
  })
}

const {
  aiAnalyzing,
  aiConflict,
  activeAiAnalysisCurrentIndex,
  aiAnalysisTotalCount,
  shouldShowAiEqRevisionPanel,
  aiBeforeBands,
  aiAfterBands,
  selectedEqTrack,
  runAiAnalysis,
  handleApplyAiEq,
  handleCancelAiEq,
  handleRequestAiEqRevision,
  goNextAiAnalysis,
  goPrevAiAnalysis,
} = useProjectAiWorkflow(Number(projectId))

function handleAddEqBand(payload: {
  frequencyHz: number
  gainDeltaDb: number
}) {
  if (!trackStore.selectedTrackId) return

  trackStore.addTrackEqBand(
    trackStore.selectedTrackId,
    payload,
  )
}

function handleUpdateEqBand(payload: {
  bandOrder: number
  patch: Partial<TrackEqBandState>
}) {
  if (!trackStore.selectedTrackId) return

  trackStore.updateTrackEqBand(
    trackStore.selectedTrackId,
    payload.bandOrder,
    payload.patch,
  )
}

function handleRemoveEqBand(payload: {
  bandOrder: number
}) {
  if (!trackStore.selectedTrackId) return

  trackStore.removeTrackEqBand(
    trackStore.selectedTrackId,
    payload.bandOrder,
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
  } else if (trackStore.selectedTrackId) {
    const track = trackStore.trackList.find(t => t.trackId === trackStore.selectedTrackId);
    if (track) {
      const clipUnderPlayhead = track.clips.find(c => 
        currentBar > c.start && currentBar < c.start + c.duration
      );
      if (clipUnderPlayhead) {
        trackStore.splitClip(clipUnderPlayhead.clipId, track.trackId);
      } else {
        alert("선택한 트랙의 재생바 위치에 자를 수 있는 오디오 클립이 없습니다.");
      }
    }
  } else {
    alert("분할할 클립이나 트랙을 선택해 주세요.");
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

// 전역 파일 드래그 앤 드롭 에러 방지 처리
const isInvalidDropModalOpen = ref(false);

const onGlobalDragOver = (e: DragEvent) => {
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'; // 드롭 이벤트를 발생시키기 위해 copy로 설정
  }
};

const onGlobalDrop = (e: DragEvent) => {
  // 브라우저의 기본 파일 열기 동작 차단
  
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    // 트랙 내부의 이벤트 리스너(stopPropagation)를 거치지 않고 여기까지 올라온 이벤트는
    // 빈 공간이나 헤더 등에 드롭한 잘못된 위치의 드롭임.
    isInvalidDropModalOpen.value = true;
  }
};

// 스크롤바 클릭 시 트랙 선택 취소(deselect) 방지 로직
function handleBackgroundPointerDown(e: PointerEvent) {
  const target = e.currentTarget as HTMLElement;
  
  if (e.target === target) {
    const rect = target.getBoundingClientRect();
    // 스크롤바 영역(컨텐츠 너비/높이를 넘어선 부분) 클릭인지 판별
    const isScrollbarClick = 
      e.clientX >= rect.left + target.clientWidth ||
      e.clientY >= rect.top + target.clientHeight;
      
    if (isScrollbarClick) {
      return; // 스크롤바를 누른 경우 선택 해제 무시
    }
  }
  
  trackStore.deselectAll();
}

type AiBubblePosition =
  | {
      mode: 'absolute'
      top: number
    }
  | {
      mode: 'fixed'
      left: number
      bottom: number
    }

function getElementContentTop(container: HTMLElement, targetEl: HTMLElement) {
  const containerRect = container.getBoundingClientRect()
  const targetRect = targetEl.getBoundingClientRect()

  return targetRect.top - containerRect.top + container.scrollTop
}

function getAiBubblePosition(conflict: any): AiBubblePosition {
  const container = timelineContainerRef.value

  if (!container || !conflict) {
    return {
      mode: 'absolute',
      top: 12,
    }
  }

  if (conflict.kind === 'CLIPPING') {
    const containerRect = container.getBoundingClientRect()
    const masterRect = masterTrackWrapperRef.value?.getBoundingClientRect()

    const left = Math.min(
      Math.max(
        containerRect.left + conflict.endPx - container.scrollLeft + 8,
        containerRect.left + 280,
      ),
      window.innerWidth - 390,
    )

    return {
      mode: 'fixed',
      left,
      bottom: Math.max(
        0,
        window.innerHeight - (masterRect?.bottom ?? window.innerHeight),
      ),
    }
  }

  if (conflict.kind === 'BAND_OVERLAP') {
    return {
      mode: 'absolute',
      top: 12,
    }
  }

  if (conflict.kind === 'HARSHNESS' && conflict.targetTrackId) {
    const targetEl = container.querySelector(
      `[data-track-id="${conflict.targetTrackId}"]`,
    ) as HTMLElement | null

    if (!targetEl) {
      return {
        mode: 'absolute',
        top: 12,
      }
    }

    const contentTop = getElementContentTop(container, targetEl)

    return {
      mode: 'absolute',
      top: Math.max(12, contentTop - 34 - 20),
    }
  }

  return {
    mode: 'absolute',
    top: 12,
  }
}

function scrollToAiConflict(conflict: any) {
  const container = timelineContainerRef.value
  if (!container || !conflict) return

  // 스크롤은 하쉬니스만 한다.
  if (conflict.kind !== 'HARSHNESS') return
  if (!conflict.targetTrackId) return

  const targetEl = container.querySelector(
    `[data-track-id="${conflict.targetTrackId}"]`,
  ) as HTMLElement | null

  if (!targetEl) {
    console.warn('[AI scroll] target track element not found', conflict.targetTrackId)
    return
  }

  const contentTop = getElementContentTop(container, targetEl)

  container.scrollTo({
    top: Math.max(0, contentTop - 80),
    behavior: 'smooth',
  })
}

async function handleNextAiAnalysis() {
  goNextAiAnalysis()
  await nextTick()

  if (aiConflict.value) {
    scrollToAiConflict(aiConflict.value)
  }
}

async function handlePrevAiAnalysis() {
  goPrevAiAnalysis()
  await nextTick()

  if (aiConflict.value) {
    scrollToAiConflict(aiConflict.value)
  }
}

const aiBubblePosition = computed<AiBubblePosition>(() => {
  if (!aiConflict.value) {
    return {
      mode: 'absolute',
      top: 12,
    }
  }

  return getAiBubblePosition(aiConflict.value)
})

const PROJECT_GUIDE_STORAGE_KEY = 'studion-project-guide-seen'

const FORCE_SHOW_PROJECT_GUIDE =
  import.meta.env.VITE_FORCE_PROJECT_GUIDE === 'true'

const isProjectGuideOpen = ref(false)

const projectGuideSteps = [
  {
    selector: '[data-guide="version-save"]',
    title: '버전 저장',
    description: '현재 작업 상태를 새 버전으로 저장해 변경 이력을 관리할 수 있어요.',
  },
  {
    selector: '[data-guide="comment"]',
    title: '코멘트',
    description: '프로젝트에 남겨진 코멘트를 확인하고 팀원과 피드백을 주고받을 수 있어요.',
  },
  {
    selector: '[data-guide="ai-analysis"]',
    title: 'AI 분석',
    description: 'AI가 오디오를 분석해 충돌 구간과 개선 포인트를 알려줘요.',
  },
]

function closeProjectGuide(doNotShowAgain: boolean) {
  if (doNotShowAgain) {
    localStorage.setItem(PROJECT_GUIDE_STORAGE_KEY, 'true')
  }

  isProjectGuideOpen.value = false
}
</script>

<template>
  <!--플랙스, 플랙스 콜 -> 내용물을 위에서 아래로 쌓음, h-screen -> 화면 전체 높이, overflow-hidden -> 넘치는 부분 숨김, bg-background -> 배경색, text-foreground -> 글자색 -->
  
  <div 
    class="flex h-screen flex-col overflow-hidden bg-background text-foreground"
    @dragover.prevent="onGlobalDragOver"
    @drop.prevent="onGlobalDrop"
  >
    <ExportModal 
      :is-open="isExportModalOpen"
      :project-name="projectName"
      @close="isExportModalOpen = false"
    />
    <ProjectHeader
  :project-name="projectName"
  :online-users="onlineUsers"
  :last-saved-at="lastSavedTime"
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
    <main class="relative flex flex-1 flex-col overflow-hidden bg-[#131313]">

      <div class="relative flex-1 flex flex-col min-h-0 overflow-hidden">
        <div 
          ref="timelineContainerRef" 
          class="flex-1 overflow-x-scroll overflow-y-auto relative flex flex-col custom-scrollbar bg-[#131313]"
        @pointerdown.stop="handleBackgroundPointerDown"
        @scroll="handleHorizontalScroll"
      >
        <!-- 눈금자 -->
        <div class="sticky top-0 z-40 w-max min-w-full bg-[#1c1c1c] border-b border-white/5" style="will-change: transform;">
          <TimelineRuler />
        </div>
     
        <AiConflictOverlay
          v-if="aiConflict"
          :conflict="aiConflict"
          :bubble-position="aiBubblePosition"
          :current-index="activeAiAnalysisCurrentIndex"
          :total-count="aiAnalysisTotalCount"
          @next="handleNextAiAnalysis"
          @prev="handlePrevAiAnalysis"
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
  <div
  ref="masterTrackWrapperRef"
  class="mt-auto shrink-0 sticky bottom-0 z-70 w-max min-w-full shadow-[0_-16px_24px_rgba(0,0,0,0.5)] bg-[#1c1c1c]"
  style="will-change: transform;"
>
        <!-- 마스터 트랙 -->
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
      </div>
      <ProjectEqPanel
        :selected-track="selectedEqTrack"
        :ai-analyzing="aiAnalyzing"
        :ai-analyzed="shouldShowAiEqRevisionPanel"
        :ai-before-bands="aiBeforeBands"
        :ai-after-bands="aiAfterBands"
        @apply-ai-eq="handleApplyAiEq"
        @cancel-ai-eq="handleCancelAiEq"
        @request-ai-eq-revision="handleRequestAiEqRevision"
        @add-eq-band="handleAddEqBand"
        @update-eq-band="handleUpdateEqBand"
        @remove-eq-band="handleRemoveEqBand"
      />
    <!-- <ProjectPlaybar @open-ai-panel="handleOpenAiPanel" /> -->
    
    <ProjectSidePanel
      class="z-[200]"
      :open="activeSidePanel !== null"
      :type="activeSidePanel"
      @close="handleCloseSidePanel"
      @resolve-comment="handlePanelResolveComment"
      @add-reply="handlePanelAddReply"
    />
    </main>

    <!-- 협업자 커서 렌더링 -->
    <RemoteCursors />
    <InviteCodeModal
      :open="isInviteModalOpen"
  :project-id="projectId"
  :project-name="projectName"
  @close="isInviteModalOpen = false"
    />

    <!-- 잘못된 파일 드롭 안내 모달 -->
    <div v-if="isInvalidDropModalOpen" class="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div class="flex flex-col items-center gap-4 rounded-xl bg-[#1E1E21] p-6 shadow-2xl border border-white/10 w-[320px]">
        <div class="rounded-full bg-red-500/20 p-3">
          <AlertTriangle class="h-6 w-6 text-red-400" />
        </div>
        <div class="text-center">
          <h3 class="text-base font-semibold text-white">잘못된 드롭 위치</h3>
          <p class="mt-2 text-sm text-gray-400">오디오 파일은 타임라인의 <span class="text-primary font-bold">트랙 작업 영역</span> 위에 드래그 앤 드롭해 주세요.</p>
        </div>
        <button @click="isInvalidDropModalOpen = false" class="mt-4 w-full rounded-md bg-primary py-2 text-sm font-semibold text-black hover:bg-primary/80 transition-colors">
          확인
        </button>
      </div>
    </div>
  </div>

  <ProjectGuideOverlay
  :steps="projectGuideSteps"
  :open="isProjectGuideOpen"
  @close="closeProjectGuide"
/>
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
