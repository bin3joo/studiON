<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@/shared/ui/button'
import { createProjectInviteCode } from '../api/project.api'
import type { CreateInviteCodeResponse, ProjectId } from '../types/project.types'

interface Props {
  open: boolean
  projectId: ProjectId
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

const inviteCode = ref('')
const errorMessage = ref('')
const isLoading = ref(false)

const hasInviteCode = computed(() => inviteCode.value.length > 0)

function extractInviteCode(response: CreateInviteCodeResponse): string {
  return response.inviteCode
    ?? response.code
    ?? response.data?.inviteCode
    ?? response.data?.code
    ?? ''
}

async function handleGenerateInviteCode() {
  isLoading.value = true
  errorMessage.value = ''
  inviteCode.value = ''

  try {
    const response = await createProjectInviteCode(props.projectId)
    const generatedCode = extractInviteCode(response)

    if (!generatedCode) {
      throw new Error('응답에서 초대코드를 찾을 수 없습니다.')
    }

    inviteCode.value = generatedCode
  }
  catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : '초대코드 생성 중 문제가 발생했습니다.'
  }
  finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
      <div class="space-y-2">
        <h2 class="text-xl font-semibold">
          초대코드 생성
        </h2>
        <p class="text-sm text-muted-foreground">
          프로젝트 참여용 초대코드를 생성할 수 있습니다.
        </p>
      </div>

      <div class="mt-6 space-y-4">
        <Button
          type="button"
          class="w-full"
          :disabled="isLoading"
          @click="handleGenerateInviteCode"
        >
          {{ isLoading ? '생성 중...' : '초대코드 생성하기' }}
        </Button>

        <p
          v-if="errorMessage"
          class="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {{ errorMessage }}
        </p>

        <div class="rounded-md border border-border bg-muted/40 px-4 py-3">
          <p class="text-xs text-muted-foreground">
            생성된 초대코드
          </p>
          <p class="mt-2 font-mono text-lg font-semibold tracking-[0.2em]">
            {{ hasInviteCode ? inviteCode : '-' }}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          class="w-full"
          @click="emit('close')"
        >
          닫기
        </Button>
      </div>
    </div>
  </div>
</template>
