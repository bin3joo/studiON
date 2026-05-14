import { defineStore } from 'pinia'
import { ref } from 'vue'
import { projectApi } from '../api/project.api'
import type { CommentDto } from '../types/comment.types'

export const useCommentStore = defineStore('commentStore', () => {
  const comments = ref<CommentDto[]>([])
  const isLoading = ref(false)
  
  // 패널 필터 상태
  const isResolvedFilter = ref(false)
  const selectedTrackId = ref<number | undefined>(undefined)
  
  // 알림 (빨간 점) 상태
  const hasNewComment = ref(false)
  
  const setHasNewComment = (val: boolean) => {
    hasNewComment.value = val
  }

  const fetchComments = async (projectId: number) => {
    try {
      isLoading.value = true
      const response = await projectApi.getComments(projectId, {
        isResolved: isResolvedFilter.value,
        trackId: selectedTrackId.value,
      })
      comments.value = response
    } catch (error) {
     // console.error('코멘트 목록 조회 실패:', error)
    } finally {
      isLoading.value = false
    }
  }

  return {
    comments,
    isLoading,
    isResolvedFilter,
    selectedTrackId,
    hasNewComment,
    setHasNewComment,
    fetchComments,
  }
})
