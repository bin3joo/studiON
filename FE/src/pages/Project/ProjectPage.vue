<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {useTrackStore} from './store/useTrackStore' //트랙 상태 저장소
import ProjectHeader from './components/ProjectHeader.vue'
import TrackList from './components/TrackList.vue' //트랙 리스트 컴포넌트
import InviteCodeModal from './components/InviteCodeModal.vue'


const route = useRoute()
const projectId = route.params.projectId as string
const trackStore = useTrackStore() // 트랙 리스트 정보 사용 준비

// 프로젝트 시작 시 트랙 정보 불러오기
onMounted(async () => {
  //id가 존재할 때만 트랙 정보 불러오기
  if(projectId){
    await trackStore.fetchProject(Number(projectId))
  }
})

const isInviteModalOpen = ref(false)

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

function handleOpenComments() {
  console.log('코멘트 열기')
}

function handleOpenHistory() {
  console.log('버전 기록 열기')
}


</script>

<template>
  <!--플랙스, 플랙스 콜 -> 내용물을 위에서 아래로 쌓음, h-screen -> 화면 전체 높이, overflow-hidden -> 넘치는 부분 숨김, bg-background -> 배경색, text-foreground -> 글자색 -->
  <div class="flex h-screen flex-col overflow-hidden bg-background text-foreground">
    <ProjectHeader
      :project-name="`프로젝트 ${projectId}`"
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
    <!-- flex-1 -> 남은 공간 차지, flex-col -> 위에서 아래로 쌓음, overflow-hidden -> 넘치는 부분 숨김, bg-muted/10 -> 배경색+투명도 -->
    <main class="flex flex-1 flex-col overflow-hidden bg-muted/10">
      <!-- flex-1 -> 남은 공간 차지, overflow-auto -> 넘치는 부분 스크롤 -->
      <div class="flex-1 overflow-auto">
       <!--트랙리스트-->
       <TrackList />
      </div>

    </main>

    <InviteCodeModal
      :open="isInviteModalOpen"
      :project-id="projectId"
      @close="handleCloseInvite"
    />
  </div>
</template>