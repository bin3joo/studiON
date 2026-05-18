<script setup lang="ts">
import { ref } from 'vue'
import type { CommentDto } from '../types/comment.types'
import { Check, ArrowUpCircle, CornerDownRight } from 'lucide-vue-next'

const props = defineProps<{
  comment: CommentDto
  trackName: string
}>()

const emit = defineEmits<{
  (e: 'resolve', commentId: number): void
  (e: 'add-reply', parentCommentId: number, content: string): void
}>()

const replyContent = ref('')

const handleSubmitReply = () => {
  if (!replyContent.value.trim()) return
  emit('add-reply', props.comment.commentId, replyContent.value)
  replyContent.value = ''
}

const highlightMentions = (text: string) => {
  if (!text) return ''
  // @어쩌고 형식의 텍스트를 핑크색으로 하이라이트
  return text.replace(/(@[^\s]+)/g, '<span class="text-pink-500">$1</span>')
}
</script>

<template>
  <div class="mb-4 rounded-xl border border-white/10 bg-[#262626] p-4 text-sm text-gray-200">
    <!-- Header -->
    <div v-if="comment.author" class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <img v-if="comment.author.profileImgUrl" :src="comment.author.profileImgUrl" class="h-6 w-6 rounded-full object-cover" />
        <div v-else class="h-6 w-6 rounded-full bg-yellow-500"></div>
        <span class="font-medium text-white">{{ comment.author.nickname }}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-gray-400">{{ trackName }} &middot; {{ comment.location }}마디</span>
        <button 
          @click="emit('resolve', comment.commentId)"
          class="flex h-6 w-6 items-center justify-center rounded border border-white/20 bg-transparent text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <Check class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="mb-5 text-sm leading-relaxed" v-html="highlightMentions(comment.content)"></div>

    <!-- Replies -->
    <div class="mb-3 text-xs text-gray-400">댓글</div>
    <div v-if="comment.replies && comment.replies.length > 0" class="mb-4 flex flex-col gap-4">
      <div v-for="reply in comment.replies" :key="reply.commentId" class="flex flex-col gap-1">
        <div v-if="reply.author" class="flex items-center gap-2">
          <CornerDownRight class="h-3.5 w-3.5 shrink-0 text-gray-500" />
          <img v-if="reply.author.profileImgUrl" :src="reply.author.profileImgUrl" class="h-5 w-5 rounded-full object-cover" />
          <div v-else class="h-5 w-5 rounded-full bg-blue-500"></div>
          <span class="font-medium text-white text-xs">{{ reply.author.nickname }}</span>
        </div>
        <div class="text-sm pl-11 leading-relaxed" v-html="highlightMentions(reply.content)"></div>
      </div>
    </div>

    <!-- Input -->
    <div class="relative flex items-center gap-2">
      <!-- 현재 사용자 아바타 플레이스홀더 (이미지에서는 초록색 원) -->
      <div class="h-5 w-5 shrink-0 rounded-full bg-green-500"></div>
      <div class="relative flex-1">
        <input
          v-model="replyContent"
          @keyup.enter="handleSubmitReply"
          type="text"
          placeholder="댓글 추가"
          class="w-full rounded-md border border-white/10 bg-[#1c1c1c] py-1.5 pl-3 pr-8 text-xs text-white placeholder-gray-500 focus:border-white/30 focus:outline-none"
        />
        <button 
          @click="handleSubmitReply"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 transition hover:text-white"
        >
          <ArrowUpCircle class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>
