import { ref } from 'vue'
import {
  sendAddComment,
  sendCompleteComment,
} from '../api/comment.ws'
import type {
  AddCommentPayload,
  AddCommentResponse,
  CompleteCommentPayload,
  CompleteCommentResponse,
  SocketErrorResponse,
} from '../types/comment.types'

const COMMENT_SOCKET_EVENT = {
  COMMENT_ADD: 'COMMENT_ADD',
  COMMENT_COMPLETE: 'COMMENT_COMPLETE',
  ERROR: 'ERROR',
} as const

interface SocketMessage {
  event: string
  data: unknown
}

interface StompClientLike {
  connected: boolean
  publish: (params: {
    destination: string
    body: string
  }) => void
}

export function useTrackComments(stompClient: StompClientLike) {
  const comments = ref<AddCommentResponse[]>([])
  const errorMessage = ref<string | null>(null)

  function addComment(payload: AddCommentPayload) {
    errorMessage.value = null
    sendAddComment(stompClient, payload)
  }

  function completeComment(payload: CompleteCommentPayload) {
    errorMessage.value = null
    sendCompleteComment(stompClient, payload)
  }

  function handleCommentAdd(data: AddCommentResponse) {
    comments.value.push(data)
  }

  function handleCommentComplete(data: CompleteCommentResponse) {
    const targetComment = comments.value.find(
      comment => comment.commentId === data.commentId,
    )

    if (!targetComment) return

    targetComment.isResolved = data.isResolved
  }

  function handleSocketError(data: SocketErrorResponse) {
    errorMessage.value = data.message
  }

  function handleSocketMessage(message: SocketMessage) {
    switch (message.event) {
      case COMMENT_SOCKET_EVENT.COMMENT_ADD:
        handleCommentAdd(message.data as AddCommentResponse)
        break

      case COMMENT_SOCKET_EVENT.COMMENT_COMPLETE:
        handleCommentComplete(message.data as CompleteCommentResponse)
        break

      case COMMENT_SOCKET_EVENT.ERROR:
        handleSocketError(message.data as SocketErrorResponse)
        break

      default:
        console.warn('[Comment Socket] 알 수 없는 이벤트:', message.event)
        break
    }
  }

  return {
    comments,
    errorMessage,
    addComment,
    completeComment,
    handleSocketMessage,
  }
}