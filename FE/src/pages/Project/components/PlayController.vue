<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTrackStore } from '../store/useTrackStore';
import { Play, Pause, Square, Sparkles, ChevronDown } from 'lucide-vue-next';

const trackStore = useTrackStore();

// 1. 마디(Bar)와 박자(Beat) 변환 로직
const formattedPosition = computed(() => {
  const pos = trackStore.playheadPosition;
  const numerator = trackStore.projectInfo.timeSigNumerator || 4;
  
  const bar = Math.floor(pos) + 1; 
  const beat = Math.floor((pos % 1) * numerator) + 1;
  
  return {
    bar: String(bar).padStart(2, '0'),
    beat: beat,
    total: String(trackStore.projectInfo.totalBarCount).padStart(2, '0')
  };
});

// 2. 키(Key) 관련 상태 및 배열
const isKeyPickerOpen = ref(false);

const NATURAL_NOTES = ["C", "D", "E", "F", "G", "A", "B"];
const SHARP_FLAT_ROW = ["Db", "Eb", null, "F#", "Ab", "Bb"];

const displayKey = computed(() => {
  const note = trackStore.projectInfo.rootNote || 'C';
  const mode = (trackStore.projectInfo.mode || 'MAJOR').toLowerCase() === 'minor' ? 'min' : 'Maj';
  return `${note} ${mode}`;
});

const handleKeyChange = (newNote: string, newMode: string) => {
  trackStore.projectInfo.rootNote = newNote;
  trackStore.projectInfo.mode = newMode;
};

// 3. 재생 제어 함수
const handlePlay = () => trackStore.isPlaying = true;
const handlePause = () => trackStore.isPlaying = false;
const handleStop = () => {
  trackStore.isPlaying = false;
  trackStore.playheadPosition = 0;
};
</script>

<template>
  <nav 
    aria-label="트랜스포트 컨트롤 및 프로젝트 정보 바"
    class="relative flex h-12 w-full items-center justify-between border-b border-border bg-[#151515] px-4 md:px-6 select-none"
  >
    <div class="flex items-center">
      <div 
        :aria-label="`현재 재생 위치: ${formattedPosition.bar}마디 ${formattedPosition.beat}박자, 전체 ${formattedPosition.total}마디`"
        class="flex h-8 items-center gap-2 rounded border border-white/5 bg-white/5 px-3 font-mono text-sm"
      >
        <span class="text-[10px] uppercase tracking-wider text-muted-foreground" aria-hidden="true">마디</span>
        <span class="tabular-nums text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]">
          {{ formattedPosition.bar }}<span class="text-muted-foreground">.</span>{{ formattedPosition.beat }}
        </span>
        <span class="text-muted-foreground" aria-hidden="true">/</span>
        <span class="tabular-nums text-muted-foreground">{{ formattedPosition.total }}</span>
      </div>
    </div>

    <div class="absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5" role="group" aria-label="재생 컨트롤">
      <button 
        :aria-label="trackStore.isPlaying ? '현재 재생 중' : '재생 시작'"
        :class="[
          'grid h-8 w-10 place-items-center rounded border transition',
          trackStore.isPlaying 
            ? 'border-primary bg-primary/20 text-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]' 
            : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
        ]"
        @click="handlePlay"
      >
        <Play class="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      </button>

      <button 
        aria-label="일시정지" 
        class="grid h-8 w-10 place-items-center rounded border border-white/10 bg-white/5 text-white transition hover:bg-white/10 active:scale-95" 
        @click="handlePause"
      >
        <Pause class="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      </button>

      <button 
        aria-label="정지 및 재생바 초기화" 
        class="grid h-8 w-10 place-items-center rounded border border-white/10 bg-white/5 text-white transition hover:bg-white/10 active:scale-95" 
        @click="handleStop"
      >
        <Square class="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      </button>
    </div>

    <div class="flex items-center gap-2">
      <button 
        aria-label="AI 믹스 분석 실행"
        class="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-transparent px-3.5 text-[10px] font-medium uppercase tracking-[0.2em] text-white transition hover:border-white/30 hover:bg-white/5"
      >
        <Sparkles class="h-3.5 w-3.5" aria-hidden="true" />
        <span>AI 분석</span>
      </button>

      <div 
        :aria-label="`현재 템포: ${trackStore.projectInfo.tempo.toFixed(2)} BPM`"
        class="flex h-8 items-center gap-2 rounded border border-white/5 bg-white/5 px-2.5"
      >
        <span class="font-mono text-[9px] uppercase tracking-widest text-muted-foreground" aria-hidden="true">BPM</span>
        <span class="font-display text-xs tracking-wider text-white tabular-nums">
          {{ trackStore.projectInfo.tempo.toFixed(2) }}
        </span>
      </div>

      <div 
        :aria-label="`현재 박자: ${trackStore.projectInfo.timeSigNumerator}분의 ${trackStore.projectInfo.timeSigDenominator}박자`"
        class="flex h-8 items-center gap-2 rounded border border-white/5 bg-white/5 px-2.5"
      >
        <span class="font-mono text-[9px] uppercase tracking-widest text-muted-foreground" aria-hidden="true">박자</span>
        <div class="flex items-center gap-1 font-display text-xs tracking-wider text-white tabular-nums">
          <span>{{ trackStore.projectInfo.timeSigNumerator }}</span>
          <span class="text-muted-foreground">/</span>
          <span>{{ trackStore.projectInfo.timeSigDenominator }}</span>
        </div>
      </div>

      <div class="relative">
        <button 
          :aria-label="`현재 키: ${displayKey}. 클릭하여 변경`"
          :aria-expanded="isKeyPickerOpen"
          class="flex h-8 items-center gap-2 rounded border border-white/5 bg-white/5 px-2.5 transition-colors hover:border-white/20"
          @click="isKeyPickerOpen = !isKeyPickerOpen"
        >
          <span class="font-mono text-[9px] uppercase tracking-widest text-muted-foreground" aria-hidden="true">키</span>
          <span class="font-display text-xs tracking-wider text-white">{{ displayKey }}</span>
          <ChevronDown class="h-3 w-3 text-muted-foreground transition-transform" :class="isKeyPickerOpen ? 'rotate-180' : ''" aria-hidden="true" />
        </button>

        <div 
          v-if="isKeyPickerOpen" 
          role="dialog"
          aria-label="키 및 스케일 선택창"
          class="absolute right-0 top-full mt-2 z-50 min-w-[280px] rounded-md border border-border bg-[#1c1c1c] p-5 shadow-xl shadow-black/50"
        >
          <div class="fixed inset-0 z-[-1]" @click="isKeyPickerOpen = false"></div>

          <div class="mb-4 flex gap-2" role="group" aria-label="음계 모드 선택">
            <button
              v-for="mode in ['MAJOR', 'MINOR']" 
              :key="mode"
              :aria-label="mode === 'MAJOR' ? '장조(Major) 적용' : '단조(Minor) 적용'"
              :aria-pressed="trackStore.projectInfo.mode === mode"
              :class="[
                'flex h-10 flex-1 items-center justify-center rounded-md border font-display text-sm tracking-wider transition-colors',
                trackStore.projectInfo.mode === mode
                  ? 'border-primary bg-primary/10 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.4)]'
                  : 'border-border bg-secondary/40 text-foreground hover:border-primary/60'
              ]"
              @click="handleKeyChange(trackStore.projectInfo.rootNote, mode)"
            >
              {{ mode === 'MAJOR' ? 'Major' : 'Minor' }}
            </button>
          </div>

          <div class="mb-1.5 grid grid-cols-7 gap-1.5" role="group" aria-label="반음계 선택">
            <template v-for="(note, i) in SHARP_FLAT_ROW" :key="i">
              <div v-if="note === null" aria-hidden="true" class="translate-x-[calc(50%+0.1875rem)]"></div>
              <button
                v-else
                :aria-label="`으뜸음 ${note} 적용`"
                :aria-pressed="trackStore.projectInfo.rootNote === note"
                :class="[
                  'translate-x-[calc(50%+0.1875rem)] flex h-8 items-center justify-center rounded-md border font-display text-sm transition-colors',
                  trackStore.projectInfo.rootNote === note
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-secondary/40 text-foreground hover:border-primary/60'
                ]"
                @click="handleKeyChange(note, trackStore.projectInfo.mode)"
              >
                {{ note.charAt(0) }}<sup class="text-[10px]" aria-hidden="true">{{ note.charAt(1) }}</sup>
              </button>
            </template>
          </div>

          <div class="grid grid-cols-7 gap-1.5" role="group" aria-label="자연음계 선택">
            <button
              v-for="note in NATURAL_NOTES" 
              :key="note"
              :aria-label="`으뜸음 ${note} 적용`"
              :aria-pressed="trackStore.projectInfo.rootNote === note"
              :class="[
                'flex h-10 items-center justify-center rounded-md border font-display text-sm transition-colors',
                trackStore.projectInfo.rootNote === note
                  ? 'border-primary bg-primary/10 text-primary shadow-[0_0_10px_hsl(var(--primary)/0.4)]'
                  : 'border-border bg-secondary/40 text-foreground hover:border-primary/60'
              ]"
              @click="handleKeyChange(note, trackStore.projectInfo.mode)"
            >
              {{ note }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
</style>