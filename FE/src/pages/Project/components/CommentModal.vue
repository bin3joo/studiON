<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowUp, X } from 'lucide-vue-next'
import type { TimelineComment } from '../types/comment.types'

const props = defineProps<{
  open: boolean
  trackName: string | null
  measure: number | null
  comments: TimelineComment[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', payload: { trackName: string | null, measure: number, content: string }): void
}>()

const content = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen)
      content.value = ''
  },
)

const hasComments = computed(() => props.comments.length > 0)

function handleClose() {
  emit('close')
}

function handleSubmit() {
  if (props.measure === null)
    return

  const trimmed = content.value.trim()

  if (!trimmed)
    return

  emit('submit', {
    trackName: props.trackName,
    measure: props.measure,
    content: trimmed,
  })

  content.value = ''
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="handleClose"
  >
    <div class="w-full max-w-[560px] rounded-2xl border border-white/15 bg-[#353535] p-5 shadow-2xl">
      <div class="mb-4 flex items-center justify-between">
        <div class="text-sm text-muted-foreground">
          {{ trackName }} · {{ measure }}마디 댓글
        </div>

        <button
          type="button"
          class="grid h-10 w-10 place-items-center rounded-xl border border-white/5 text-white/70 transition hover:bg-white/5 hover:text-white"
          @click="handleClose"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <div
        v-if="hasComments"
        class="mb-4 space-y-5"
      >
        <div
          v-for="comment in comments"
          :key="comment.id"
          class="flex gap-3"
        >
          <div
            class="mt-1 h-6 w-6 shrink-0 rounded-full"
            :style="{ backgroundColor: comment.color }"
          />

          <div class="min-w-0 flex-1">
            <div class="mb-1 text-sm font-medium text-[#b5b7c4]">
              {{ comment.author }}
            </div>

            <div
              v-if="comment.mention"
              class="mb-1 text-[15px] font-semibold text-[#ff33b8]"
            >
              {{ comment.mention }}
            </div>

            <p class="text-[15px] leading-relaxed text-white">
              {{ comment.content }}
            </p>
          </div>
        </div>
      </div>

      <div class="flex gap-3">
        <div class="mt-1 h-6 w-6 shrink-0 rounded-full bg-fuchsia-500" />

        <div class="flex-1">
          <div class="flex items-center rounded-2xl border border-white/10 bg-[#313131] pl-4 pr-2">
            <input
              v-model="content"
              type="text"
              placeholder="댓글 추가"
              class="h-14 w-full bg-transparent text-[15px] text-white placeholder:text-[#a6a8b3] focus:outline-none"
              @keydown.enter="handleSubmit"
            >

            <button
              type="button"
              class="grid h-11 w-11 place-items-center rounded-full text-[#8f93a5] transition hover:text-white"
              @click="handleSubmit"
            >
              <ArrowUp class="h-7 w-7" />
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="hasComments"
        class="mt-5 flex justify-end"
      >
        
      </div>
    </div>
  </div>
</template>