<script setup lang="ts">
import { ref } from 'vue'
import { X, Loader2, Download } from 'lucide-vue-next'
import { useAudioExport } from '../composables/useAudioExport'

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

async function handleExport() {
  isExporting.value = true
  errorMessage.value = ''
  
  try {
    const blob = await exportMasterAudio()
    
    // File System Access API
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `${props.projectName || 'project'}_master.wav`,
          types: [{
            description: 'WAV Audio File',
            accept: { 'audio/wav': ['.wav'] },
          }],
        })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
        
        emit('close')
      } catch (err: any) {
        // AbortError is thrown if user cancels the picker, ignore it
        if (err.name !== 'AbortError') {
          throw err
        }
      }
    } else {
      // Fallback for browsers that don't support showSaveFilePicker (e.g. Firefox)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${props.projectName || 'project'}_master.wav`
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
    class="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    @click.self="!isExporting && emit('close')"
  >
    <div class="w-[480px] rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/50 overflow-hidden relative">
      <div class="mb-6 flex items-center justify-between">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <Download class="w-5 h-5 text-indigo-400" />
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
            출력 설정 (스튜디오 표준)
          </h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-zinc-400">포맷</span>
              <span class="text-sm font-medium text-white">WAV</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-zinc-400">샘플레이트</span>
              <span class="text-sm font-medium text-white">48000 Hz</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-zinc-400">비트뎁스</span>
              <span class="text-sm font-medium text-white">24 bit</span>
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
          class="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-8 py-3 text-sm font-medium text-white transition-all hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:text-white/70 w-full shadow-lg shadow-indigo-900/20"
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
