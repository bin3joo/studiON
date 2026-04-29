<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Copy, KeyRound, RefreshCw, X } from 'lucide-vue-next'
import { createProjectInviteCode } from '@/pages/Project/api/project.api'

interface Props {
  open: boolean
  projectId: string
}

// ✅ 수정 포인트 1: data와 inviteCode 모두에 'null'이 들어올 수 있음을 명시합니다.
interface InviteResponse {
  data?: {
    inviteCode?: string | null;
  } | null;
  inviteCode?: string | null;
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const inviteCode = ref('')
const isLoading = ref(false)
const isCopied = ref(false)
const errorMessage = ref('')

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) {
      resetState()
      return
    }

    await generateInviteCode()
  },
  { immediate: true },
)

function resetState() {
  inviteCode.value = ''
  isLoading.value = false
  isCopied.value = false
  errorMessage.value = ''
}

function extractInviteCode(response: InviteResponse): string {
  return response?.data?.inviteCode ?? response?.inviteCode ?? '';
}

async function generateInviteCode() {
  isLoading.value = true
  errorMessage.value = ''
  isCopied.value = false

  try {
    // ✅ 수정 포인트 2: projectId(문자열)를 Number()로 감싸서 숫자로 변환해 줍니다.
    const response = await createProjectInviteCode(Number(props.projectId))
    const nextInviteCode = extractInviteCode(response)

    if (!nextInviteCode) {
      throw new Error('초대코드를 생성할 수 없습니다.')
    }

    inviteCode.value = nextInviteCode
  }
  catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : '초대코드 생성에 실패했습니다.'
  }
  finally {
    isLoading.value = false
  }
}

async function handleCopy() {
  if (!inviteCode.value || isLoading.value)
    return

  try {
    await navigator.clipboard.writeText(inviteCode.value)
    isCopied.value = true

    window.setTimeout(() => {
      isCopied.value = false
    }, 1500)
  }
  catch {
    errorMessage.value = '초대코드 복사에 실패했습니다.'
  }
}

function handleClose() {
  emit('close')
}

function handleComplete() {
  emit('close')
}

const displayedCode = computed(() => {
  if (isLoading.value)
    return '생성 중...'

  if (errorMessage.value)
    return 'ERROR'

  return inviteCode.value || '------'
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4"
    @click.self="handleClose"
  >
    <div class="relative w-full max-w-md rounded-2xl border border-[#ff9800] bg-[#222222] p-7 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
      <!-- 닫기 버튼 -->
      <button
        type="button"
        aria-label="닫기"
        class="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 text-[#aeb3c3] transition hover:bg-white/5 hover:text-white"
        @click="handleClose"
      >
        <X class="h-6 w-6" />
      </button>

      <!-- 헤더 -->
      <div class="mb-6 flex items-center gap-3">
        <div class="grid h-10 w-10 place-items-center rounded-lg text-white">
          <KeyRound class="h-5 w-5" />
        </div>
        <div>
          <h2 class="text-2xl font-extrabold tracking-tight text-white">
            코드생성
          </h2>
        </div>
      </div>

      <!-- 안내 문구 -->
      <div class="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span class="text-base font-medium text-[#9ca3af]">
          초대코드
        </span>
        <span class="text-2xl font-extrabold text-white">
          초대 코드는 5분 동안 유효합니다.
        </span>
      </div>

      <!-- 코드 박스 -->
      <div class="mb-6 rounded-xl border-2 border-[#9198aa] bg-[#262626] p-3">
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1 px-3 py-4">
            <div
              class="truncate text-2xl font-extrabold tracking-[0.28em]"
              :class="errorMessage ? 'text-red-400' : 'text-white'"
            >
              {{ displayedCode }}
            </div>

            <p
              v-if="errorMessage"
              class="mt-2 text-sm text-red-400"
            >
              {{ errorMessage }}
            </p>
          </div>

          <button
            type="button"
            class="grid h-12 w-12 shrink-0 place-items-center rounded-lg text-[#aeb3c3] transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="isLoading"
            @click="generateInviteCode"
          >
            <RefreshCw
              class="h-6 w-6"
              :class="isLoading ? 'animate-spin' : ''"
            />
          </button>

          <button
            type="button"
            class="grid h-12 w-12 shrink-0 place-items-center rounded-lg text-[#aeb3c3] transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="isLoading || !inviteCode"
            @click="handleCopy"
          >
            <Check
              v-if="isCopied"
              class="h-6 w-6 text-white"
            />
            <Copy
              v-else
              class="h-6 w-6"
            />
          </button>
        </div>
      </div>

      <!-- 완료 버튼 -->
      <div class="flex justify-center">
        <button
          type="button"
          class="inline-flex min-w-[152px] items-center justify-center rounded-full bg-white px-8 py-3 text-lg font-extrabold text-black transition hover:bg-white/90"
          @click="handleComplete"
        >
          완료
        </button>
      </div>
    </div>
  </div>
</template>