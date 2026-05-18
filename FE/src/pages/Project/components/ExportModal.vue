<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, Loader2, Download } from 'lucide-vue-next'
import { useAudioExport } from '../composables/useAudioExport'
import { useTrackStore } from '../store/useTrackStore'

const props = defineProps<{
  isOpen: boolean
  projectName: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const isExporting = ref(false)
const errorMessage = ref('')
const { exportMasterAudio } = useAudioExport()
const trackStore = useTrackStore()

const expectedSizeMB = computed(() => {
  const tracks = trackStore.trackList

  let maxDurationBar = 0
  tracks.forEach((track) => {
    track.clips.forEach((clip) => {
      const end = clip.start + clip.duration
      if (end > maxDurationBar) maxDurationBar = end
    })
  })

  if (maxDurationBar === 0) return '0.00'

  const secondsPerBar = trackStore.secondsPerBar
  // 여유 공간(Reverb/Delay Tail 등) 1초 반영
  const renderDurationSec = maxDurationBar * secondsPerBar + 1.0
  const sampleRate = 48000
  const channels = 2 // 스테레오 고정
  const bytesPerSample = 3 // 24-bit

  const dataSize = renderDurationSec * sampleRate * channels * bytesPerSample
  const totalSize = 44 + dataSize // WAV 헤더 44바이트

  return (totalSize / (1024 * 1024)).toFixed(2)
})

async function handleExport() {
  errorMessage.value = ''
  const suggestedFilename = `${props.projectName || 'project'}_master.wav`
  let fileHandle: any = null

  try {
    // File System Access API (브라우저 보안상 클릭 즉시 호출해야 함)
    if ('showSaveFilePicker' in window) {
      try {
        fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: suggestedFilename,
          types: [{
            description: 'WAV Audio File',
            accept: { 'audio/wav': ['.wav'] },
          }],
        })
      } catch (err: any) {
        // AbortError is thrown if user cancels the picker, ignore it
        if (err.name === 'AbortError') return
        throw err
      }
    }

    isExporting.value = true

    // 무거운 믹스다운 비동기 작업 수행 (스테레오 고정: false 파라미터 전달)
    const blob = await exportMasterAudio(false)
    
    if (fileHandle) {
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
      
      emit('close')
    } else {
      // Fallback for browsers that don't support showSaveFilePicker (e.g. Firefox)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = suggestedFilename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      emit('close')
    }
  } catch (error: any) {
   // console.error('Export Failed:', error)
    errorMessage.value = error.message || '오디오 내보내기에 실패했습니다.'
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[999] grid place-items-center bg-black/40 px-4 backdrop-blur-md animate-fade-in"
    @click.self="!isExporting && emit('close')"
  >
    <div class="relative w-full max-w-md rounded-2xl border border-white/10 bg-card p-7 shadow-2xl transition-all">
      <div class="mb-6 flex items-center justify-between">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <Download class="w-5 h-5 text-zinc-300" />
          오디오 다운로드
        </h2>
        <button
          v-if="!isExporting"
          @click="emit('close')"
          class="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <div class="mb-6 space-y-4">
        <p class="text-sm text-zinc-400">
          현재 프로젝트의 모든 트랙과 클립을 믹스다운하여 
          <br>
          고해상도 오디오 파일로 추출합니다.
        </p>
        
        <div class="rounded-xl border border-white/5 bg-black/40 p-4">
          <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            출력 설정
          </h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-zinc-400">포맷</span>
              <span class="text-sm font-medium text-white">WAV</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-zinc-400">채널 모드</span>
              <span class="text-sm font-medium text-white">스테레오 (고정)</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-zinc-400">샘플레이트</span>
              <span class="text-sm font-medium text-white">48000 Hz</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-zinc-400">비트뎁스</span>
              <span class="text-sm font-medium text-white">24 bit</span>
            </div>
            <div class="flex items-center justify-between mt-2 pt-3 border-t border-white/10">
              <span class="text-sm font-medium text-zinc-300">용량</span>
              <span class="text-sm font-bold text-white">{{ expectedSizeMB }} MB</span>
            </div>
          </div>
        </div>
        
        <div v-if="errorMessage" class="rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
          {{ errorMessage }}
        </div>
      </div>

      <div class="flex justify-center mt-2">
        <button
          @click="handleExport"
          :disabled="isExporting"
          class="flex items-center justify-center gap-2 rounded-lg bg-zinc-200 px-8 py-3 text-sm font-medium text-black transition-all hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500 w-full shadow-lg shadow-black/20"
        >
          <template v-if="isExporting">
            <Loader2 class="h-4 w-4 animate-spin" />
            <span>믹스다운 처리 중...</span>
          </template>
          <template v-else>
            <span>저장 위치 선택 및 다운로드</span>
          </template>
        </button>
      </div>
    </div>
  </div>
</template>
