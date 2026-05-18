<script setup lang="ts">
import { ref, watch } from 'vue'
import { Camera, X, Check } from 'lucide-vue-next'
import { useAudioVersionStore } from '../store/useAudioVersionStore'

interface Props {
  open: boolean
  projectId: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const audioVersionStore = useAudioVersionStore()

const name = ref('')
const memo = ref('')
const isSaving = ref(false)
const showSuccess = ref(false)
const errorMessage = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      name.value = ''
      memo.value = ''
      isSaving.value = false
      showSuccess.value = false
      errorMessage.value = ''
    }
  }
)

async function handleSave() {
  const trimmedName = name.value.trim()
  const trimmedMemo = memo.value.trim()

  if (!trimmedName) {
    errorMessage.value = '버전 이름을 입력해주세요.'
    return
  }

  if (trimmedName.length > 50) {
    errorMessage.value = '버전 이름은 50자를 넘을 수 없습니다.'
    return
  }

  if (trimmedMemo.length > 255) {
    errorMessage.value = '메모는 255자를 넘을 수 없습니다.'
    return
  }

  isSaving.value = true
  errorMessage.value = ''

  const success = await audioVersionStore.saveVersion(props.projectId, {
    name: trimmedName,
    memo: trimmedMemo
  })

  isSaving.value = false

  if (success) {
    showSuccess.value = true
    setTimeout(() => {
      emit('close')
    }, 2000)
  } else {
    errorMessage.value = '버전 생성 요청에 실패했습니다.'
  }
}

function handleClose() {
  if (!isSaving.value) {
    emit('close')
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[9999] grid place-items-center bg-black/40 px-4 backdrop-blur-md animate-fade-in"
    @click.self="handleClose"
  >
    <div class="relative w-full max-w-md rounded-2xl border border-white/10 bg-card p-7 shadow-2xl transition-all">
      <button
        type="button"
        aria-label="닫기"
        class="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground transition hover:border-primary hover:text-primary"
        @click="handleClose"
        :disabled="isSaving"
      >
        <X class="h-3.5 w-3.5" />
      </button>

      <div class="mb-6 flex items-center gap-3">
        <div class="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary shadow-neon-sm">
          <Camera class="h-4 w-4" />
        </div>
        <div>
          <h2 class="font-display text-2xl font-extrabold tracking-tight text-foreground">
            버전 저장
          </h2>
        </div>
      </div>

      <div v-if="!showSuccess">
        <div class="space-y-4 mb-6">
          <div class="space-y-2">
            <label class="text-sm font-medium text-muted-foreground">버전 이름 <span class="text-primary">*</span></label>
            <input
              v-model="name"
              type="text"
              placeholder="예: 보컬 믹싱 완료"
              class="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
              :disabled="isSaving"
              maxlength="50"
            />
            <div class="text-right text-[10px] text-muted-foreground">{{ name.length }}/50</div>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-muted-foreground">메모 (선택사항)</label>
            <textarea
              v-model="memo"
              rows="3"
              placeholder="변경 사항이나 설명을 적어주세요."
              class="w-full resize-none rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
              :disabled="isSaving"
              maxlength="255"
            ></textarea>
            <div class="text-right text-[10px] text-muted-foreground">{{ memo.length }}/255</div>
          </div>
          
          <p v-if="errorMessage" class="text-sm text-destructive">{{ errorMessage }}</p>
        </div>

        <div class="flex justify-end gap-3">
          <button
            type="button"
            class="rounded-full border border-border bg-background px-6 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
            @click="handleClose"
            :disabled="isSaving"
          >
            취소
          </button>
          <button
            type="button"
            class="inline-flex min-w-[100px] items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-extrabold text-primary-foreground transition hover:shadow-neon disabled:cursor-not-allowed disabled:opacity-50"
            @click="handleSave"
            :disabled="isSaving"
          >
            <span v-if="isSaving" class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"></span>
            {{ isSaving ? '저장 중...' : '저장하기' }}
          </button>
        </div>
      </div>
      
      <!-- 성공 메시지 화면 -->
      <div v-else class="flex flex-col items-center justify-center py-8 text-center animate-fade-in">
        <div class="mb-4 grid h-16 w-16 place-items-center rounded-full bg-primary/20 text-primary">
          <Check class="h-8 w-8" />
        </div>
        <h3 class="mb-2 text-lg font-bold text-foreground">버전 생성이 시작되었습니다</h3>
        <p class="text-sm text-muted-foreground">
          백엔드 처리가 진행 중입니다.<br>잠시 후 버전 기록에서 확인하실 수 있습니다.
        </p>
      </div>
    </div>
  </div>
</template>
