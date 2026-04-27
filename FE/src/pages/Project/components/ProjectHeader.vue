<script setup lang="ts">
import { RouterLink } from 'vue-router'
import {
  Camera,
  Download,
  History,
  Pencil,
  Redo2,
  Save,
  Undo2,
  UserPlus,
  MessageSquare,
} from 'lucide-vue-next'
import logoLight from '@/assets/logo_light.png'
import logoDark from '@/assets/logo_dark.png'

interface Collaborator {
  id: string
  name: string
  color: string
}

interface Props {
  projectName: string
  lastSavedAt?: string
  collaborators?: Collaborator[]
  canUndo?: boolean
  canRedo?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  lastSavedAt: '13:24',
  collaborators: () => [
    { id: '1', name: 'A', color: '#d946ef' },
    { id: '2', name: 'B', color: '#3b82f6' },
    { id: '3', name: 'C', color: '#4ade80' },
  ],
  canUndo: true,
  canRedo: true,
})

const emit = defineEmits<{
  (e: 'rename'): void
  (e: 'export'): void
  (e: 'save-version'): void
  (e: 'save'): void
  (e: 'undo'): void
  (e: 'redo'): void
  (e: 'open-invite'): void
  (e: 'open-comments'): void
  (e: 'open-history'): void
}>()
</script>

<template>
  <header class="flex h-[68px] w-full items-center justify-between border-b border-border bg-background px-4">
    <!-- 왼쪽 -->
    <div class="flex min-w-0 items-center gap-4">
      <RouterLink
        to="/dashboard"
        class="inline-flex items-center gap-4"
      >
        <div class="shrink-0">
          <img
            :src="logoLight"
            alt="StudiON"
            class="h-8 w-auto dark:hidden"
          >
          <img
            :src="logoDark"
            alt="StudiON"
            class="hidden h-8 w-auto dark:block"
          >
        </div>
      </RouterLink>

      <div class="hidden h-7 w-px bg-border md:block" />

      <div class="flex items-center gap-2 min-w-0">
        <span class="truncate text-sm font-semibold text-foreground">
          {{ projectName }}
        </span>

        <button
          type="button"
          class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground"
          @click="emit('rename')"
        >
          <Pencil class="h-3.5 w-3.5" />
        </button>
      </div>

      <button
        type="button"
        class="ml-2 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        @click="emit('export')"
      >
        <Download class="h-4 w-4" />
        <span>내보내기</span>
      </button>
    </div>

    <!-- 가운데 -->
    <div class="hidden items-center gap-2 lg:flex">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        @click="emit('save-version')"
      >
        <Camera class="h-4 w-4" />
        <span>버전 저장</span>
      </button>

      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        @click="emit('save')"
      >
        <Save class="h-4 w-4" />
        <span>저장</span>
        <span class="text-muted-foreground">마지막 저장 시간 {{ lastSavedAt }}</span>
      </button>

      <button
        type="button"
        class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canUndo"
        @click="emit('undo')"
      >
        <Undo2 class="h-4 w-4" />
      </button>

      <button
        type="button"
        class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canRedo"
        @click="emit('redo')"
      >
        <Redo2 class="h-4 w-4" />
      </button>
    </div>

    <!-- 오른쪽 -->
    <div class="flex items-center gap-3">
      <div class="hidden items-center -space-x-2 md:flex">
        <div
          v-for="member in collaborators"
          :key="member.id"
          class="h-7 w-7 rounded-full border-2 border-background"
          :style="{ backgroundColor: member.color }"
          :title="member.name"
        />
      </div>

      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        @click="emit('open-invite')"
      >
        <UserPlus class="h-4 w-4" />
        <span class="hidden sm:inline">초대코드 생성</span>
      </button>

      <button
        type="button"
        class="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground transition hover:bg-muted"
        @click="emit('open-comments')"
      >
        <MessageSquare class="h-4 w-4" />
        <span class="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
      </button>

      <button
        type="button"
        class="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground transition hover:bg-muted"
        @click="emit('open-history')"
      >
        <History class="h-4 w-4" />
        <span class="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
      </button>
    </div>
  </header>
</template>