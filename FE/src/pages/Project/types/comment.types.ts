export interface TimelineComment {
  id: string
  author: string
  mention?: string
  content: string
  color: string
}

export interface TrackMeasureCommentGroup {
  trackId: string
  trackName: string
  measure: number
  resolved?: boolean
  comments: TimelineComment[]
}

export interface MentionedUser {
  userId: number
  nickname: string
}

export interface CommentCreatedBy {
  userId: number
  nickname: string
}

export interface AddCommentPayload {
  projectId: number
  trackId: number
  content: string
  location: number
  mentionedUserIds: number[]
}

export interface AddCommentResponse {
  commentId: number
  trackId: number
  content: string
  location: number
  isResolved: boolean
  mentionedUsers: MentionedUser[]
  createdBy: CommentCreatedBy
}

export interface CompleteCommentPayload {
  projectId: number
  commentId: number
  isResolved: boolean
}

export interface CompleteCommentResponse {
  commentId: number
  isResolved: boolean
}

export interface SocketErrorResponse {
  code: number
  message: string
}