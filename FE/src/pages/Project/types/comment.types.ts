export interface TimelineComment {
  id: string
  author: string
  mention?: string
  content: string
  color: string
  profileImageUrl?: string | null
}

export interface TrackMeasureCommentGroup {
  trackId: string
  trackName: string
  measure: number
  resolved?: boolean
  comments: TimelineComment[]
}

export interface CommentUser {
  userId: number
  nickname: string
  profileImgUrl: string | null
}

export interface AddCommentPayload {
  trackId: number
  parentCommentId: number | null
  content: string
  location: number
  mentionedUserIds: number[]
}

export interface CommentAddedResponse {
  projectId: number
  trackId: number
  commentId: number
  parentCommentId: number | null
  content: string
  location: number
  isResolved: boolean
  author: CommentUser
  mentionedUsers: CommentUser[]
  createdAt: string
}

export interface DeleteCommentPayload {
  commentId: number
}

export interface CommentDeletedResponse {
  projectId: number
  trackId: number
  commentId: number
  parentCommentId: number | null
}

export interface ChangeCommentStatusPayload {
  commentId: number
}

export interface CommentStatusChangedResponse {
  projectId: number
  trackId: number
  commentId: number
  parentCommentId: number | null
  isResolved: boolean
  updatedAt: string
}

export interface SocketErrorResponse {
  code: number
  message: string
}