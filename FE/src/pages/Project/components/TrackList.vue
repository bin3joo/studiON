<!--스토어에서 트랙 목록을 가져와서 세로로 나열하는 역할을 수행한다.-->
<script setup lang="ts">
import {useTrackStore} from '../store/useTrackStore'
import TrackItem from './TrackItem.vue'

//1.스토어에서 트랙 데이터를 꺼내옴
const trackStore = useTrackStore();

</script>

<template>
  <section aria-label="트랙 리스트 영역" class="flex flex-col bg-background">
    
    <!--일반 트랙 목록 렌더링-->
    <div 
      v-if="trackStore.trackList.length > 0" 
      aria-label="트랙 목록" 
      class="flex flex-col"
    >
      <TrackItem
        v-for="track in trackStore.trackList"
        :key="track.trackId"
        :track="track"
        :is-master="false"
      />
    </div>
    
    <div 
      v-else 
      aria-label="빈 트랙 안내"
      class="flex h-32 items-center justify-center border-b border-border bg-muted/20 text-sm text-muted-foreground"
    >
      프로젝트에 생성된 트랙이 없습니다. + 버튼을 눌러 트랙을 추가하세요.
    </div>

    <!--트랙 추가 버튼-->
    <div class="flex border-b border-border group w-max min-w-full h-[100px]">
      <div class="sticky left-0 z-20 flex w-[224px] shrink-0 items-center justify-center border-r border-border bg-[#1c1c1c]">
        <button 
          @click="trackStore.addTrack" 
          class="flex items-center gap-2 rounded-md border border-white/20 px-6 py-2.5 text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/10 hover:border-white/40 transition-all duration-200"
        >
          + 트랙 추가
        </button>
      </div>
      <!-- 빈 타임라인 배경 -->
      <div class="relative flex-1 bg-transparent pointer-events-none"></div>
    </div>
    
  </section>
</template>

<style scoped>

</style>