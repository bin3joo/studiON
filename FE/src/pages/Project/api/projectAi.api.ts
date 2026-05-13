import { axiosInstance } from '@/shared/api/axiosInstance'

export interface ApiResponse<T> {
  isSuccess: boolean
  code: string
  message: string
  data: T
}

export interface AiJobStartRequest {
  project_id: number
  issue_types: string[]
  validator_mode: string
  critic_mode: string
  project_snapshot: ProjectSnapshotRequest
}

export interface ProjectSnapshotRequest {
  duration_ms: number
  bpm: number
  numerator: number
  denominator: number
  tracks: ProjectTrackRequest[]
  clips: ProjectClipRequest[]
}

export interface ProjectTrackRequest {
  track_id: number
  name: string
}

export interface ProjectClipRequest {
  clip_id: number
  track_id: number
  start_ms: number
  end_ms: number
  audio_metadata_id: number
  audio_start_ms: number
  audio_duration_ms: number
}

export interface AiJobStartResponse {
  job: {
    job_id: number
    project_id: number
    dispatch_type: string
    status: string
    queue_name: string
  }
}

export interface AiWorkflowStatusResponse {
  job: {
    id: number
    project_id: number
    status: string
    phase: string
    current_node: string | null
    progress: number
    timeline_snapshot_id: string | null
    requested_by: number | null
    started_at: string | null
    completed_at: string | null
    error_code: string | null
    error_message: string | null
  }
  projections: {
    analysis_regions?: AiAnalysisRegion[]
    [key: string]: unknown
  }
}

export interface AiAnalysisRegion {
  id: string
  job_id: number
  issue_type: string | null
  start_ms: number | null
  end_ms: number | null
  measure_start: number | null
  measure_end: number | null
  severity: string
  analysis_summary: string | null
  track_id: number | null
  secondary_track_id: number | null
  band_low_hz: number | null
  band_high_hz: number | null
  involved_track_ids: number[]
  affected_clip_ids: number[]
}

export async function startAiWorkflow(payload: AiJobStartRequest) {
  const response = await axiosInstance.post<ApiResponse<AiJobStartResponse>>(
    '/api/v1/ai/workflow/jobs/start',
    payload,
    {
      timeout: 30000,
    },
  )

  return response.data.data
}

export async function getAiWorkflowStatus(jobId: number) {
  const response = await axiosInstance.get<ApiResponse<AiWorkflowStatusResponse>>(
    `/api/v1/ai/workflow/jobs/${jobId}`,
    {
      timeout: 30000,
    },
  )

  return response.data.data
}

export interface AiWorkflowJobResponse {
  job_id: number
  project_id: number
  dispatch_type: string
  status: string
  queue_name: string
}

export interface AiUserFeedbackRequest {
  project_id: number
  selected_region_id?: number | null
  preserve_clip_id?: number | null
  user_feedback_message?: string | null
  user_decision: 'CONFIRM' | 'CANCEL' | 'RESUME'
}

export async function sendAiWorkflowFeedback(
  jobId: number,
  request: AiUserFeedbackRequest,
): Promise<AiWorkflowJobResponse> {
  const response = await axiosInstance.post<ApiResponse<AiWorkflowJobResponse>>(
    `/api/v1/ai/workflow/jobs/${jobId}/feedback`,
    request,
    {
      timeout: 30000,
    },
  )

  return response.data.data
}