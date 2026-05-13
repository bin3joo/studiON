import { computed, ref } from 'vue'
import { useTrackStore } from '../store/useTrackStore'
import type { TrackEqBandState } from '../types'
import {
  startAiWorkflow,
  getAiWorkflowStatus,
  sendAiWorkflowFeedback,
  type AiAnalysisRegion,
  type ProjectSnapshotRequest,
} from '../api/projectAi.api'

const TIMELINE_TRACK_HEADER_WIDTH = 266

type AiConflictOverlayState = {
  startPercent: number
  endPercent: number
  startPx: number
  endPx: number
  barStart: number
  barEnd: number
  title: string
  summary: string
  bullets: string[]
}

type AiEqRevisionPayload = {
  selectedTrackIds: number[]
  message: string
}

export function useProjectAiWorkflow(projectId: number) {
  const trackStore = useTrackStore()

  const aiAnalyzing = ref(false)

  const aiConflict = ref<AiConflictOverlayState | null>(null)

  const aiBeforeBands = ref<TrackEqBandState[]>([])
  const aiAfterBands = ref<TrackEqBandState[]>([])
  const currentAiJobId = ref<number | null>(null)
  const selectedAiRegionId = ref<number | null>(null)

  const selectedEqTrack = computed(() => {
    const selectedTrackId = trackStore.selectedTrackId

    if (!selectedTrackId) return null

    return trackStore.trackList.find(track =>
      track.trackId === selectedTrackId
    ) ?? null
  })

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async function pollAiWorkflow(jobId: number) {
    const maxTry = 60

    for (let i = 0; i < maxTry; i += 1) {
      const result = await getAiWorkflowStatus(jobId)
      const regions = result.projections.analysis_regions ?? []

      if (result.job.status === 'FAILED') {
        throw new Error(result.job.error_message ?? 'AI 분석에 실패했습니다.')
      }

      if (
        result.job.status === 'COMPLETED' ||
        result.job.status === 'WAITING_USER' ||
        result.job.progress >= 100 ||
        regions.length > 0
      ) {
        return result
      }

      await sleep(2000)
    }

    throw new Error('AI 분석 결과를 가져오지 못했습니다.')
  }

  function getAudioMetadataId(clip: any): number | null {
    return (
      clip.audioMetadataId ??
      clip.audio_metadata_id ??
      clip.audio?.audioMetadataId ??
      clip.audio?.audio_metadata_id ??
      null
    )
  }

  function getAudioDurationMs(clip: any, fallbackDurationMs: number): number {
    return (
      clip.audioDurationMs ??
      clip.audio_duration_ms ??
      clip.audio?.durationMs ??
      clip.audio?.duration_ms ??
      clip.audio?.audioDurationMs ??
      fallbackDurationMs
    )
  }

  function getMsPerBar() {
    const info = trackStore.projectInfo

    const bpm = info.tempo || 120
    const numerator = info.timeSigNumerator || 4
    const denominator = info.timeSigDenominator || 4

    return (60000 / bpm) * numerator * (4 / denominator)
  }

  function buildProjectSnapshotFromStore(): ProjectSnapshotRequest {
    const info = trackStore.projectInfo

    const bpm = info.tempo || 120
    const numerator = info.timeSigNumerator || 4
    const denominator = info.timeSigDenominator || 4

    const msPerBar = (60000 / bpm) * numerator * (4 / denominator)

    const tracks = trackStore.trackList.map(track => ({
      track_id: Number(track.trackId),
      name: track.name ?? '',
    }))

    const clips = trackStore.trackList.flatMap(track =>
      track.clips
        .map(clip => {
          const anyClip = clip as any
          const audioMetadataId = getAudioMetadataId(anyClip)

          if (!audioMetadataId) {
            return null
          }

          const startMs = Math.round(clip.start * msPerBar)
          const endMs = Math.round((clip.start + clip.duration) * msPerBar)
          const clipDurationMs = Math.max(endMs - startMs, 1)

          return {
            clip_id: Number(clip.clipId),
            track_id: Number(track.trackId),
            start_ms: startMs,
            end_ms: Math.max(endMs, startMs + 1),
            audio_metadata_id: Number(audioMetadataId),
            audio_start_ms: Math.round(anyClip.audioStartMs ?? anyClip.audio_start_ms ?? 0),
            audio_duration_ms: Math.round(getAudioDurationMs(anyClip, clipDurationMs)),
          }
        })
        .filter((clip): clip is ProjectSnapshotRequest['clips'][number] => clip !== null),
    )

    const baseDurationMs = Math.round(info.totalBarCount * msPerBar)
    const durationMs = Math.max(
      baseDurationMs,
      ...clips.map(clip => clip.end_ms),
    )

    return {
      duration_ms: durationMs,
      bpm,
      numerator,
      denominator,
      tracks,
      clips,
    }
  }

  function mapRegionToOverlay(
    region: AiAnalysisRegion,
    durationMs: number,
  ): AiConflictOverlayState {
    const startMs = region.start_ms ?? 0
    const endMs = region.end_ms ?? startMs + 1

    const msPerBar = getMsPerBar()

    const barStart =
      region.measure_start ??
      Math.floor(startMs / msPerBar) + 1

    const barEnd =
      region.measure_end ??
      Math.ceil(endMs / msPerBar)

    const startBarFloat = startMs / msPerBar
    const endBarFloat = Math.max(endMs / msPerBar, startBarFloat + 0.25)

    const startPx = TIMELINE_TRACK_HEADER_WIDTH + startBarFloat * trackStore.pixelPerBar
    const endPx = TIMELINE_TRACK_HEADER_WIDTH + endBarFloat * trackStore.pixelPerBar

    const startPercent = Math.max(0, Math.min(100, (startMs / durationMs) * 100))
    const endPercent = Math.max(
      startPercent + 0.5,
      Math.min(100, (endMs / durationMs) * 100),
    )

    const involvedTrackIds = region.involved_track_ids ?? []

    return {
      startPercent,
      endPercent,
      startPx,
      endPx,
      barStart,
      barEnd,
      title: `${barStart}마디에서 ${barEnd}마디 사이`,
      summary: region.analysis_summary ?? 'AI가 충돌 가능성이 있는 구간을 감지했어요.',
      bullets: [
        region.issue_type ? `문제 유형: ${region.issue_type}` : '문제 유형을 확인 중입니다.',
        region.band_low_hz && region.band_high_hz
          ? `${region.band_low_hz}Hz~${region.band_high_hz}Hz 대역에서 충돌이 감지됐어요.`
          : '주파수 대역 정보가 없습니다.',
        involvedTrackIds.length > 0
          ? `관련 트랙: ${involvedTrackIds.join(', ')}`
          : '관련 트랙 정보를 확인 중입니다.',
      ],
    }
  }

  function createMockAiAfterBands(beforeBands: TrackEqBandState[]): TrackEqBandState[] {
    const copiedBands = beforeBands.map(band => ({ ...band }))

    const nextOrder =
      copiedBands.length > 0
        ? Math.max(...copiedBands.map(band => band.bandOrder)) + 1
        : 1

    return [
      ...copiedBands,
      {
        bandOrder: nextOrder,
        frequencyHz: 500,
        gainDeltaDb: -3,
      } as TrackEqBandState,
    ]
  }

  function mapAiSuggestionToEqBands(statusResult: any): TrackEqBandState[] {
  const suggestionBands =
    statusResult.projections?.suggestion_group?.eq_bands ??
    statusResult.projections?.suggestionGroup?.eqBands ??
    statusResult.projections?.plan_state?.eq_bands ??
    statusResult.projections?.planState?.eqBands ??
    []

  if (!Array.isArray(suggestionBands) || suggestionBands.length === 0) {
    return createMockAiAfterBands(aiBeforeBands.value)
  }

  return suggestionBands.map((band: any, index: number) => ({
    bandOrder: band.band_order ?? band.bandOrder ?? index + 1,
    frequencyHz: band.frequency_hz ?? band.frequencyHz ?? band.freq_hz ?? 500,
    gainDeltaDb: band.gain_delta_db ?? band.gainDeltaDb ?? band.gain_db ?? 0,
    q: band.q ?? band.q_factor ?? band.qFactor ?? 1,
    eqTypeCode: band.eq_type_code ?? band.eqTypeCode ?? 1,
  })) as TrackEqBandState[]
}

  async function runAiAnalysis() {
  if (aiAnalyzing.value) return

  try {
    aiAnalyzing.value = true
    aiConflict.value = null
    aiAfterBands.value = []
    currentAiJobId.value = null
    selectedAiRegionId.value = null

    const selectedTrack = selectedEqTrack.value

    aiBeforeBands.value = selectedTrack?.eq?.bands
      ? selectedTrack.eq.bands.map(band => ({ ...band }))
      : []

    const snapshot = buildProjectSnapshotFromStore()

    if (snapshot.tracks.length === 0) {
      alert('분석할 트랙이 없습니다.')
      return
    }

    if (snapshot.clips.length === 0) {
      alert('AI 분석을 하려면 먼저 저장된 오디오 클립이 필요합니다.')
      return
    }

    const startResult = await startAiWorkflow({
      project_id: projectId,
      issue_types: [
        'band_overlap',
        'track_clipping',
        'master_clipping',
        'sibilance',
        'high_band_harshness',
      ],
      validator_mode: 'PASS',
      critic_mode: 'PASS',
      project_snapshot: snapshot,
    })

    currentAiJobId.value = startResult.job.job_id

    const statusResult = await pollAiWorkflow(startResult.job.job_id)
    const regions = statusResult.projections.analysis_regions ?? []

    console.log('[AI regions]', regions)
    console.log('[AI snapshot duration]', snapshot.duration_ms)
    console.log('[AI project info]', trackStore.projectInfo)

    if (regions.length === 0) {
      alert('AI가 감지한 충돌 구간이 없습니다.')
      return
    }

    const firstRegion = regions[0] as any

    const numericRegionId = Number(firstRegion.id ?? firstRegion.region_id)
    selectedAiRegionId.value = Number.isNaN(numericRegionId)
      ? null
      : numericRegionId

    aiConflict.value = mapRegionToOverlay(firstRegion, snapshot.duration_ms)
  } catch (error) {
    console.error(error)

    if (
      error instanceof Error &&
      error.message.includes('timeout')
    ) {
      alert('AI 분석 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.')
      return
    }

    alert(error instanceof Error ? error.message : 'AI 분석 중 오류가 발생했습니다.')
  } finally {
    aiAnalyzing.value = false
  }
}

  function handleApplyAiEq() {
    console.log('AI EQ 적용')
  }

  function handleCancelAiEq() {
    aiConflict.value = null
    aiBeforeBands.value = []
    aiAfterBands.value = []
  }

  async function handleRequestAiEqRevision(payload: {
  selectedTrackIds: number[]
  message: string
}) {
  if (!currentAiJobId.value) {
    alert('AI 분석 작업 정보가 없습니다. 먼저 AI 분석을 실행해주세요.')
    return
  }

  try {
    aiAnalyzing.value = true

    const selectedTrackText =
      payload.selectedTrackIds.length > 0
        ? `선택한 트랙 ID: ${payload.selectedTrackIds.join(', ')}. `
        : ''

    await sendAiWorkflowFeedback(currentAiJobId.value, {
      project_id: projectId,
      selected_region_id: selectedAiRegionId.value,
      preserve_clip_id: null,
      user_feedback_message: `${selectedTrackText}${payload.message}`.trim(),
      user_decision: 'RESUME',
    })

    const statusResult = await pollAiWorkflow(currentAiJobId.value)

    console.log('[AI feedback result]', statusResult)

    aiAfterBands.value = mapAiSuggestionToEqBands(statusResult)
  } catch (error) {
    console.error(error)
    alert(error instanceof Error ? error.message : 'AI 수정 요청 중 오류가 발생했습니다.')
  } finally {
    aiAnalyzing.value = false
  }
}

  return {
    aiAnalyzing,
    aiConflict,
    aiBeforeBands,
    aiAfterBands,
    selectedEqTrack,
    runAiAnalysis,
    handleApplyAiEq,
    handleCancelAiEq,
    handleRequestAiEqRevision,
  }
}