<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, KeyRound, X } from 'lucide-vue-next'
import { Button } from '@/shared/ui/button'
import { joinProject } from '@/pages/Project/api/project.api'
import type { JoinProjectResponse, ProjectId } from '@/pages/Project/types/project.types'

const router = useRouter()
const isInputMode = ref(false)
const inviteCode = ref('')
const errorMessage = ref('')
const isLoading = ref(false)
const inviteInputRef = ref<HTMLInputElement | null>(null)

function resetState() {
  isInputMode.value = false
  inviteCode.value = ''
  errorMessage.value = ''
  isLoading.value = false
}

async function openInputMode() {
  isInputMode.value = true
  inviteCode.value = ''
  errorMessage.value = ''
  await nextTick()
  inviteInputRef.value?.focus()
}

function extractProjectId(response: JoinProjectResponse): ProjectId | null {
  return response.data?.projectId
    ?? response.data?.id
    ?? response.projectId
    ?? response.id
    ?? null
}

async function confirmInviteCode() {
  const trimmedInviteCode = inviteCode.value.trim()

  errorMessage.value = ''

  if (!trimmedInviteCode) {
    errorMessage.value = '초대코드를 입력해주세요.'
    return
  }

  isLoading.value = true

  try {
    const response = await joinProject({ inviteCode: trimmedInviteCode })
    const projectId = extractProjectId(response)

    if (!projectId) {
      throw new Error('참여할 프로젝트 정보를 찾을 수 없습니다.')
    }

    resetState()
    await router.push(`/project/${projectId}`)
  }
  catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : '초대코드 확인 중 오류가 발생했습니다.'
  }
  finally {
    isLoading.value = false
  }
}

function cancelInputMode() {
  resetState()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    void confirmInviteCode()
    return
  }

  if (event.key === 'Escape') {
    cancelInputMode()
  }
}
</script>

<template>
  <div class="relative flex flex-col items-end">
    <div
      class="flex items-center overflow-hidden rounded-full border bg-secondary/40 transition-all duration-300 ease-out"
      :class="isInputMode
        ? [
          'h-10 w-[280px] px-4 md:w-[340px]',
          errorMessage
            ? 'border-destructive animate-shake'
            : 'border-primary/40',
        ]
        : 'w-auto border-border hover:border-primary/60'"
    >
      <button
        v-if="!isInputMode"
        type="button"
        class="inline-flex h-10 items-center gap-1.5 px-4 text-[10px] font-medium uppercase tracking-[0.2em] text-primary transition md:text-xs"
        @click="openInputMode"
      >
        <KeyRound class="h-3.5 w-3.5" />
        <span class="hidden sm:inline">초대코드 입력</span>
      </button>

      <div
        v-else
        class="flex w-full items-center gap-2 animate-fade-in"
      >
        <KeyRound
          class="h-3.5 w-3.5 shrink-0"
          :class="errorMessage ? 'text-destructive' : 'text-primary'"
        />

        <input
          ref="inviteInputRef"
          v-model="inviteCode"
          type="text"
          placeholder="STU-XXXX"
          :disabled="isLoading"
          maxlength="20"
          spellcheck="false"
          class="w-full min-w-0 bg-transparent text-xs uppercase tracking-[0.2em] text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
          @keydown="handleKeydown"
          @input="errorMessage = ''"
        >

        <Button
          type="button"
          :disabled="isLoading"
          class="rounded-full border border-border bg-background/40 px-2.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground transition hover:border-primary/60 hover:text-primary disabled:opacity-40"
          @click="confirmInviteCode"
        >
          <template v-if="isLoading">
            ...
          </template>
          <template v-else>
            <Check class="h-3 w-3" />
          </template>
        </Button>

        <Button
          type="button"
          variant="ghost"
          :disabled="isLoading"
          class="grid h-5 w-5 place-items-center rounded-full p-0 text-muted-foreground transition hover:text-foreground"
          @click="cancelInputMode"
        >
          <X class="h-3 w-3" />
        </Button>
      </div>
    </div>

    <p
      v-if="errorMessage"
      class="absolute -bottom-6 right-0 text-[11px] tracking-wide text-destructive animate-fade-in"
    >
      {{ errorMessage }}
    </p>
  </div>
</template>