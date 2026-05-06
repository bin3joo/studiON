import type {
  AddCommentPayload,
  CompleteCommentPayload,
} from '../types/comment.types'

const COMMENT_ADD_DESTINATION = '/app/comment/add'
const COMMENT_COMPLETE_DESTINATION = '/app/comment/complete'

interface StompClientLike {
  connected: boolean
  publish: (params: {
    destination: string
    body: string
  }) => void
}

export function sendAddComment(
  stompClient: StompClientLike,
  payload: AddCommentPayload,
) {
  if (!stompClient || !stompClient.connected) {
    throw new Error('웹소켓이 연결되어 있지 않습니다.')
  }

  stompClient.publish({
    destination: COMMENT_ADD_DESTINATION,
    body: JSON.stringify(payload),
  })
}

export function sendCompleteComment(
  stompClient: StompClientLike,
  payload: CompleteCommentPayload,
) {
  if (!stompClient || !stompClient.connected) {
    throw new Error('웹소켓이 연결되어 있지 않습니다.')
  }

  stompClient.publish({
    destination: COMMENT_COMPLETE_DESTINATION,
    body: JSON.stringify(payload),
  })
}