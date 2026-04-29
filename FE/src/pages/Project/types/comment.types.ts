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