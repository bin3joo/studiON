<!--스토어에서 트랙 목록을 가져와서 세로로 나열하는 역할을 수행한다.-->
<script setup lang="ts">
import {useTrackStore} from '../store/useTrackStore'
import TrackItem from './TrackItem.vue'

//1.스토어에서 트랙 데이터를 꺼내옴
const trackStore = useTrackStore();

</script>

<template>
  <section aria-label="트랙 리스트 영역" class="flex flex-col bg-background">
    
    <div 
      v-if="trackStore.trackList.length > 0" 
      aria-label="트랙 목록" 
      class="flex flex-col"
    >
      <TrackItem
        v-for="track in trackStore.trackList"
        :key="track.trackId"
        :track="track"
      />
    </div>

    <div 
      v-else 
      aria-label="빈 트랙 안내"
      class="flex h-32 items-center justify-center border-b border-border bg-muted/20 text-sm text-muted-foreground"
    >
      프로젝트에 생성된 트랙이 없습니다. + 버튼을 눌러 트랙을 추가하세요.
    </div>

  </section>
</template>

<style scoped>

</style>