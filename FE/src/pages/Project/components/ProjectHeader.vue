<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { OnlineUser } from '../types/projectSocket.types'
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

interface Props {
  projectName: string
  lastSavedAt?: string
  onlineUsers?: OnlineUser[]
  canUndo?: boolean
  canRedo?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  lastSavedAt: '13:24',
  onlineUsers: () => [],
  canUndo: true,
  canRedo: true,
})

const emit = defineEmits<{
  (e: 'rename', name: string): void
  (e: 'export'): void
  (e: 'save-version'): void
  (e: 'save'): void
  (e: 'undo'): void
  (e: 'redo'): void
  (e: 'open-invite'): void
  (e: 'open-comments'): void
  (e: 'open-history'): void
}>()

const visibleOnlineUsers = computed(() => props.onlineUsers.slice(0, 3))
const hiddenOnlineUserCount = computed(() => Math.max(props.onlineUsers.length - 3, 0))

const isEditingProjectName = ref(false)
const editingProjectName = ref('')
const projectNameInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.projectName,
  (newName) => {
    if (!isEditingProjectName.value) {
      editingProjectName.value = newName || ''
    }
  },
  { immediate: true },
)

async function startProjectNameEdit() {
  isEditingProjectName.value = true
  editingProjectName.value = props.projectName || ''

  await nextTick()

  projectNameInputRef.value?.focus()
  projectNameInputRef.value?.select()
}

function submitProjectNameEdit() {
  const trimmedName = editingProjectName.value.trim()

  if (!trimmedName) {
    editingProjectName.value = props.projectName || ''
    isEditingProjectName.value = false
    return
  }

  if (trimmedName !== props.projectName) {
    emit('rename', trimmedName)
  }

  isEditingProjectName.value = false
}

function cancelProjectNameEdit() {
  editingProjectName.value = props.projectName || ''
  isEditingProjectName.value = false
}
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

      <div class="flex min-w-0 items-center gap-2">
  <template v-if="!isEditingProjectName">
    <span class="truncate text-sm font-semibold text-foreground">
      {{ projectName }}
    </span>

    <button
      type="button"
      class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground"
      @click="startProjectNameEdit"
    >
      <Pencil class="h-3.5 w-3.5" />
    </button>
  </template>

  <template v-else>
    <input
      ref="projectNameInputRef"
      v-model="editingProjectName"
      type="text"
      class="h-7 w-[160px] rounded-md border border-border bg-background px-2 text-sm font-semibold text-foreground outline-none transition focus:border-primary"
      @keydown.enter.prevent="submitProjectNameEdit"
      @keydown.esc.prevent="cancelProjectNameEdit"
      @blur="submitProjectNameEdit"
    >
  </template>
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
    v-for="user in visibleOnlineUsers"
    :key="user.userId"
    class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-foreground"
    :title="user.nickname"
  >
    <img
      v-if="user.profileImageUrl"
      :src="user.profileImageUrl"
      :alt="user.nickname"
      class="h-full w-full object-cover"
    >

    <span v-else>
      {{ user.nickname.charAt(0) }}
    </span>
  </div>

  <div
    v-if="hiddenOnlineUserCount > 0"
    class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground"
  >
    +{{ hiddenOnlineUserCount }}
  </div>
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