import { computed, ref } from 'vue'
import { useTrackStore } from '../store/useTrackStore'
import type { TrackEqBandState } from '../types'
import {
  startAiWorkflow,
  getAiWorkflowStatus,
  sendAiWorkflowFeedback,
  type AiAnalysisRegion,
  type AiIssueMarker,
  type AiIssueUiMode,
  type AiSuggestionAction,
  type AiSuggestionIssue,
  type AiSuggestionPayload,
  type ProjectSnapshotRequest,
} from '../api/projectAi.api'
import {
  getMasterLimiter,
  saveMasterLimiterDraft,
} from '../api/projectLimiter.api'
import { trackEvent } from '@/shared/utils/analytics'

const TIMELINE_TRACK_HEADER_WIDTH = 266

type AiIssueKind = 'BAND_OVERLAP' | 'CLIPPING' | 'HARSHNESS'
type AiIssueTargetType = 'TIMELINE' | 'MASTER_TRACK' | 'TRACK'

type AiAnalysisItem = {
  id: string | number
  issueType: string
  kind: AiIssueKind
  uiMode: AiIssueUiMode

  targetType: AiIssueTargetType
  targetTrackId: number | null

  startPercent: number
  endPercent: number
  startPx: number
  endPx: number

  barStart: number
  barEnd: number

  title: string
  summary: string
  explanation: string | null
  bullets: string[]

  bandLowHz: number | null
  bandHighHz: number | null

  recommendedGainReductionDb: number | null

  previewBands: TrackEqBandState[]
  actions: AiSuggestionAction[]
  markers: AiIssueMarker[]
}

export function useProjectAiWorkflow(projectId: number) {
  const trackStore = useTrackStore()

  const aiAnalyzing = ref(false)

  const aiAnalysisItems = ref<AiAnalysisItem[]>([])
  const activeAiAnalysisIndex = ref(0)

  const activeAiAnalysis = computed(() => {
    return aiAnalysisItems.value[activeAiAnalysisIndex.value] ?? null
  })

  // 기존 ProjectPage / Overlay 호환용
  const aiConflict = computed(() => activeAiAnalysis.value)

  const aiBeforeBands = ref<TrackEqBandState[]>([])
  const aiAfterBands = ref<TrackEqBandState[]>([])
  const currentAiJobId = ref<number | null>(null)
  const selectedAiRegionId = ref<number | null>(null)

  const selectedEqTrack = computed(() => {
  if (trackStore.selectedTarget?.type === 'MASTER') {
    return trackStore.masterTrack
  }

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
    const suggestionPayload = getSuggestionPayload(result.projections)

    const status = result.job.status?.toLowerCase()
    const phase = result.job.phase?.toLowerCase()
    const hasSuggestionIssues = Boolean(suggestionPayload?.issues?.length)

   // console.log('[AI poll]', {
    //   try: i + 1,
    //   status: result.job.status,
    //   phase: result.job.phase,
    //   progress: result.job.progress,
    //   regionsLength: regions.length,
    //   hasSuggestionIssues,
    //   projectionKeys: Object.keys(result.projections ?? {}),
    // })

    if (status === 'failed') {
      throw new Error(result.job.error_message ?? 'AI 분석에 실패했습니다.')
    }

    if (
      status === 'completed' ||
      status === 'waiting_user' ||
      status === 'waiting_user_plan_input' ||
      phase === 'completed' ||
      phase === 'waiting_user' ||
      phase === 'waiting_for_user_plan_input' ||
      result.job.progress >= 100 ||
      regions.length > 0 ||
      hasSuggestionIssues
    ) {
      return result
    }

    await sleep(2000)
  }

  throw new Error('AI 분석 결과를 가져오지 못했습니다.')
}

async function pollAiFeedbackResult(jobId: number) {
  const maxTry = 60

  for (let i = 0; i < maxTry; i += 1) {
    const result = await getAiWorkflowStatus(jobId)

    const status = result.job.status?.toLowerCase()
    const phase = result.job.phase?.toLowerCase()
    const hasSuggestion = hasAiEqSuggestion(result)

    if (import.meta.env.DEV) {
      // console.debug('[AI feedback poll]', {
      //   try: i + 1,
      //   status: result.job.status,
      //   phase: result.job.phase,
      //   progress: result.job.progress,
      //   hasSuggestion,
      //   projectionKeys: Object.keys(result.projections ?? {}),
      // })
    }

    if (status === 'failed') {
      const revisionNotes =
        (result.projections as any)?.plan_state?.revision_notes

      if (import.meta.env.DEV) {
        // console.error('[AI feedback failed]', {
        //   jobId,
        //   job: result.job,
        //   planState: (result.projections as any)?.plan_state,
        //   revisionNotes,
        //   projections: result.projections,
        // })
      }

      throw new Error('AI 수정안 생성에 실패했습니다.')
    }

    if (hasSuggestion) {
      return result
    }

    // 수정안 없이 completed면 더 기다려도 의미 없을 가능성이 높음
    if (
      status === 'completed' ||
      phase === 'completed' ||
      result.job.progress >= 100
    ) {
      return result
    }

    await sleep(2000)
  }

  throw new Error('AI 수정안을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.')
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

  function mapRegionToAnalysisItem(
  region: AiAnalysisRegion,
  durationMs: number,
): AiAnalysisItem {
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

  const kind = mapIssueTypeToKind(region.issue_type)
  const involvedTrackIds = region.involved_track_ids ?? []

  let targetType: AiIssueTargetType = 'TIMELINE'
  let targetTrackId: number | null = null

  if (kind === 'BAND_OVERLAP') {
    targetType = 'TIMELINE'
    targetTrackId =
      involvedTrackIds[0] ??
      region.track_id ??
      region.secondary_track_id ??
      null
  }

  if (kind === 'CLIPPING') {
    targetType = 'MASTER_TRACK'
    targetTrackId = null
  }

  if (kind === 'HARSHNESS') {
    targetType = 'TRACK'
    targetTrackId =
      region.track_id ??
      involvedTrackIds[0] ??
      null
  }

  const titlePrefix =
    kind === 'BAND_OVERLAP'
      ? '대역 중복'
      : kind === 'CLIPPING'
        ? '클리핑'
        : '하쉬니스'

  const regionId =
    region.id ??
    (region as any).region_id ??
    `${kind}-${startMs}-${endMs}`

  const uiMode: AiIssueUiMode =
    kind === 'CLIPPING'
      ? 'master_trim'
      : kind === 'HARSHNESS'
        ? 'marker_only'
        : 'eq_ai'

    const bullets =
    kind === 'CLIPPING'
      ? [
          region.track_id
            ? `클리핑 감지 트랙: ${region.track_id}`
            : '클리핑 감지 트랙 정보를 확인 중입니다.',
          region.affected_clip_ids?.length
            ? `영향을 받은 클립: ${region.affected_clip_ids.join(', ')}`
            : '영향을 받은 클립 정보를 확인 중입니다.',
          region.contributing_track_ids?.length
            ? `기여 트랙: ${region.contributing_track_ids.join(', ')}`
            : '기여 트랙 정보를 확인 중입니다.',
        ]
      : [
          region.issue_type ? `문제 유형: ${region.issue_type}` : '문제 유형을 확인 중입니다.',
          region.band_low_hz && region.band_high_hz
            ? `${region.band_low_hz}Hz~${region.band_high_hz}Hz 대역에서 문제가 감지됐어요.`
            : '주파수 대역 정보가 없습니다.',
          involvedTrackIds.length > 0
            ? `관련 트랙: ${involvedTrackIds.join(', ')}`
            : '관련 트랙 정보를 확인 중입니다.',
        ]

  return {
    id: regionId,
    issueType: region.issue_type ?? '',
    kind,
    uiMode,

    targetType,
    targetTrackId,

    startPercent,
    endPercent,
    startPx,
    endPx,

    barStart,
    barEnd,

    title: `${titlePrefix} · ${barStart}마디에서 ${barEnd}마디 사이`,
    summary: region.analysis_summary ?? 'AI가 문제가 발생한 구간을 감지했어요.',
    explanation: null,
    bullets,

    bandLowHz: region.band_low_hz,
    bandHighHz: region.band_high_hz,

    recommendedGainReductionDb: kind === 'CLIPPING' ? -3 : null,

    previewBands: [],
    actions: [],
    markers: [],
  }
}

function getSuggestionPayload(projections: any): AiSuggestionPayload | null {
  return (
    projections?.suggestion_payload ??
    projections?.suggestionPayload ??
    projections?.suggestion_group?.suggestion_payload ??
    projections?.suggestionGroup?.suggestionPayload ??
    projections?.suggestionGroups?.[0]?.suggestion_payload ??
    projections?.suggestionGroups?.[0]?.suggestionPayload ??
    null
  )
}

function isBandOverlapIssue(issue: AiSuggestionIssue) {
  return issue.issueType === 'band_overlap' && issue.uiMode === 'eq_ai'
}

function mapPreviewBandsToEqBands(previewBands: any[] = []): TrackEqBandState[] {
  return previewBands.map((band, index) => ({
    bandOrder: band.band_order ?? band.bandOrder ?? index + 1,
    frequencyHz: band.frequency_hz ?? band.frequencyHz ?? 500,
    gainDeltaDb: band.gain_delta_db ?? band.gainDeltaDb ?? 0,
    q: band.q ?? 1,
    eqTypeCode: band.eq_type_code ?? band.eqTypeCode ?? 1,
  })) as TrackEqBandState[]
}

function mapBandOverlapIssueToAnalysisItem(
  issue: AiSuggestionIssue,
  durationMs: number,
): AiAnalysisItem {
  const startMs = issue.startMs ?? 0
  const endMs = issue.endMs ?? startMs + 1

  const msPerBar = getMsPerBar()

  const barStart = Math.floor(startMs / msPerBar) + 1
  const barEnd = Math.max(barStart, Math.ceil(endMs / msPerBar))

  const startBarFloat = startMs / msPerBar
  const endBarFloat = Math.max(endMs / msPerBar, startBarFloat + 0.25)

  const startPx = TIMELINE_TRACK_HEADER_WIDTH + startBarFloat * trackStore.pixelPerBar
  const endPx = TIMELINE_TRACK_HEADER_WIDTH + endBarFloat * trackStore.pixelPerBar

  const startPercent = Math.max(0, Math.min(100, (startMs / durationMs) * 100))
  const endPercent = Math.max(
    startPercent + 0.5,
    Math.min(100, (endMs / durationMs) * 100),
  )

  const firstAction = issue.actions?.[0]

  const bandLowHz = firstAction?.bandLowHz ?? null
  const bandHighHz = firstAction?.bandHighHz ?? null

  const targetTrackId =
    issue.trackId ??
    firstAction?.targetTrackId ??
    null

  const previewBands = mapPreviewBandsToEqBands(issue.previewBands)

  return {
    id: issue.issueId,
    issueType: issue.issueType,
    kind: 'BAND_OVERLAP',
    uiMode: issue.uiMode,

    targetType: targetTrackId ? 'TRACK' : 'TIMELINE',
    targetTrackId,

    startPercent,
    endPercent,
    startPx,
    endPx,

    barStart,
    barEnd,

    title: `대역 중복 · ${barStart}마디에서 ${barEnd}마디 사이`,
    summary: issue.summary ?? 'AI가 대역 중복 가능성이 있는 구간을 감지했어요.',
    explanation: issue.explanation ?? null,
    bullets: [
      '문제 유형: band_overlap',
      bandLowHz && bandHighHz
        ? `${bandLowHz}Hz~${bandHighHz}Hz 대역에서 충돌이 감지됐어요.`
        : '주파수 대역 정보가 없습니다.',
      targetTrackId
        ? `관련 트랙: ${targetTrackId}`
        : '관련 트랙 정보를 확인 중입니다.',
    ],

    bandLowHz,
    bandHighHz,

    recommendedGainReductionDb: null,

    previewBands,
    actions: issue.actions ?? [],
    markers: issue.markers ?? [],
  }
}

function mapSuggestionIssueToAnalysisItem(
  issue: AiSuggestionIssue,
  durationMs: number,
): AiAnalysisItem {
  const startMs = issue.startMs ?? 0
  const endMs = issue.endMs ?? startMs + 1
  const msPerBar = getMsPerBar()

  const barStart = Math.floor(startMs / msPerBar) + 1
  const barEnd = Math.max(barStart, Math.ceil(endMs / msPerBar))

  const startBarFloat = startMs / msPerBar
  const endBarFloat = Math.max(endMs / msPerBar, startBarFloat + 0.25)

  const startPx = TIMELINE_TRACK_HEADER_WIDTH + startBarFloat * trackStore.pixelPerBar
  const endPx = TIMELINE_TRACK_HEADER_WIDTH + endBarFloat * trackStore.pixelPerBar

  const startPercent = Math.max(0, Math.min(100, (startMs / durationMs) * 100))
  const endPercent = Math.max(
    startPercent + 0.5,
    Math.min(100, (endMs / durationMs) * 100),
  )

  const kind = mapIssueTypeToKind(issue.issueType)
  const trimAction = issue.actions?.find(action =>
    action.type === 'apply_master_gain_trim'
  )

  const targetType: AiIssueTargetType =
    issue.uiMode === 'master_trim'
      ? 'MASTER_TRACK'
      : issue.trackId
        ? 'TRACK'
        : 'TIMELINE'

  const targetTrackId =
    targetType === 'MASTER_TRACK'
      ? null
      : issue.trackId ?? null

  return {
    id: issue.issueId,
    issueType: issue.issueType,
    kind,
    uiMode: issue.uiMode,

    targetType,
    targetTrackId,

    startPercent,
    endPercent,
    startPx,
    endPx,

    barStart,
    barEnd,

    title:
      kind === 'CLIPPING'
        ? `클리핑 · ${barStart}마디에서 ${barEnd}마디 사이`
        : `AI 분석 · ${barStart}마디에서 ${barEnd}마디 사이`,
    summary: issue.summary ?? 'AI가 문제가 발생한 구간을 감지했어요.',
    explanation: issue.explanation ?? null,
    bullets:
      kind === 'CLIPPING'
        ? [
            trimAction?.recommendedReductionDb != null
              ? `권장 감소량: ${trimAction.recommendedReductionDb}dB`
              : '권장 감소량 정보를 확인 중입니다.',
            trimAction?.currentTruePeakDbtp != null
              ? `현재 True Peak: ${trimAction.currentTruePeakDbtp} dBTP`
              : '현재 True Peak 정보를 확인 중입니다.',
            trimAction?.targetCeilingDbtp != null
              ? `목표 Ceiling: ${trimAction.targetCeilingDbtp} dBTP`
              : '목표 Ceiling 정보를 확인 중입니다.',
          ]
        : [
            `문제 유형: ${issue.issueType}`,
          ],

    bandLowHz: null,
    bandHighHz: null,

    recommendedGainReductionDb:
      trimAction?.recommendedReductionDb ?? null,

    previewBands: mapPreviewBandsToEqBands(issue.previewBands),
    actions: issue.actions ?? [],
    markers: issue.markers ?? [],
  }
}

function mapSuggestionPayloadToAnalysisItems(
  payload: AiSuggestionPayload,
  durationMs: number,
): AiAnalysisItem[] {
  const issueMap = new Map(
    payload.issues.map(issue => [issue.issueId, issue]),
  )

  const orderedIssues =
    payload.navigationOrder?.length
      ? payload.navigationOrder
          .map(issueId => issueMap.get(issueId))
          .filter((issue): issue is AiSuggestionIssue => Boolean(issue))
      : payload.issues

  return orderedIssues.map(issue =>
    mapSuggestionIssueToAnalysisItem(issue, durationMs),
  )
}

function mapBandOverlapPayloadToAnalysisItems(
  payload: AiSuggestionPayload,
  durationMs: number,
): AiAnalysisItem[] {
  const issueMap = new Map(
    payload.issues.map(issue => [issue.issueId, issue]),
  )

  const orderedIssues =
    payload.navigationOrder?.length
      ? payload.navigationOrder
          .map(issueId => issueMap.get(issueId))
          .filter((issue): issue is AiSuggestionIssue => Boolean(issue))
      : payload.issues

  return orderedIssues
    .filter(isBandOverlapIssue)
    .map(issue => mapBandOverlapIssueToAnalysisItem(issue, durationMs))
}

function syncAiPreviewBandsFromActiveItem() {
  const item = activeAiAnalysis.value

  aiAfterBands.value = item?.previewBands ?? []
}

  function mapIssueTypeToKind(issueType: string | null): AiIssueKind {
  const normalized = issueType?.toLowerCase() ?? ''

  if (
    normalized.includes('clipping') ||
    normalized.includes('clip')
  ) {
    return 'CLIPPING'
  }

  if (
    normalized.includes('harshness') ||
    normalized.includes('harsh') ||
    normalized.includes('high_band') ||
    normalized.includes('sibilance') ||
    normalized.includes('sibilant')
  ) {
    return 'HARSHNESS'
  }

  if (
    normalized.includes('band_overlap') ||
    normalized.includes('overlap') ||
    normalized.includes('masking')
  ) {
    return 'BAND_OVERLAP'
  }

  return 'BAND_OVERLAP'
}

function mapAiSuggestionToEqBands(statusResult: any): TrackEqBandState[] {
  const suggestionBands =
    statusResult.projections?.suggestion_group?.eq_bands ??
    statusResult.projections?.suggestionGroup?.eqBands ??
    statusResult.projections?.plan_state?.eq_bands ??
    statusResult.projections?.planState?.eqBands ??
    statusResult.projections?.suggestion_payload?.issues?.flatMap((issue: any) =>
      issue.previewBands ?? [],
    ) ??
    statusResult.projections?.suggestionPayload?.issues?.flatMap((issue: any) =>
      issue.previewBands ?? [],
    ) ??
    []

  if (!Array.isArray(suggestionBands) || suggestionBands.length === 0) {
    return []
  }

  return suggestionBands
    .map((band: any, index: number) => ({
      bandOrder: Number(band.band_order ?? band.bandOrder ?? index + 1),
      frequencyHz: Number(band.frequency_hz ?? band.frequencyHz ?? band.freq_hz ?? 500),
      gainDeltaDb: Number(band.gain_delta_db ?? band.gainDeltaDb ?? band.gain_db ?? 0),
      q: Number(band.q ?? band.q_factor ?? band.qFactor ?? 1),
      eqTypeCode: Number(band.eq_type_code ?? band.eqTypeCode ?? 1),
    }))
    .filter(band =>
      Number.isFinite(band.frequencyHz) &&
      Number.isFinite(band.gainDeltaDb) &&
      Number.isFinite(band.q) &&
      Number.isFinite(band.eqTypeCode),
    ) as TrackEqBandState[]
}

function hasAiEqSuggestion(statusResult: any) {
  return mapAiSuggestionToEqBands(statusResult).length > 0
}

  async function runAiAnalysis() {
  if (aiAnalyzing.value) return

  try {
    aiAnalyzing.value = true
    aiAnalysisItems.value = []
    activeAiAnalysisIndex.value = 0
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
    const suggestionPayload = getSuggestionPayload(statusResult.projections)
    const regions = statusResult.projections.analysis_regions ?? []

    const regionItems = regions.map(region =>
      mapRegionToAnalysisItem(region, snapshot.duration_ms),
    )

    const suggestionItems = suggestionPayload
  ? mapSuggestionPayloadToAnalysisItems(
      suggestionPayload,
      snapshot.duration_ms,
    )
  : []

if (suggestionItems.length > 0) {
  aiAnalysisItems.value = suggestionItems
} else if (regionItems.length > 0) {
  aiAnalysisItems.value = regionItems
} else {
  alert('AI가 감지한 문제 구간이 없습니다.')
  return
}

activeAiAnalysisIndex.value = 0

syncSelectedRegionIdFromActiveItem()
applyActiveAiAnalysisSelection()
syncAiPreviewBandsFromActiveItem()

trackEvent('ai_analysis_completed', {
      project_id: projectId,
      issue_count: aiAnalysisItems.value.length,
    })
  } catch (error) {
   // console.error(error)

   trackEvent('ai_analysis_failed', {
    project_id: projectId,
    reason: 'server_error',
  })

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
   // console.log('AI EQ 적용')
  }

function handleCancelAiEq() {
  aiAnalysisItems.value = []
  activeAiAnalysisIndex.value = 0
  selectedAiRegionId.value = null
  currentAiJobId.value = null
  aiBeforeBands.value = []
  aiAfterBands.value = []
}

function getActiveClippingTrimAction() {
  const item = activeAiAnalysis.value

  if (!item || item.kind !== 'CLIPPING') return null

  return item.actions.find(action =>
    action.type === 'apply_master_gain_trim'
  ) ?? null
}

async function handleApplyClippingIssue() {
  const item = activeAiAnalysis.value

  if (!item || item.kind !== 'CLIPPING') return

  const action = getActiveClippingTrimAction()

if (!action || action.recommendedReductionDb == null) {
  alert('클리핑 적용값이 없습니다.')
  return
}
const clippingAction = action
  const recommendedReductionDb = action?.recommendedReductionDb

  if (recommendedReductionDb == null) {
    alert('클리핑 적용값이 없습니다.')
    return
  }

  try {
    aiAnalyzing.value = true

    const currentLimiter = await getMasterLimiter(projectId)

    await saveMasterLimiterDraft(projectId, {
      isEnabled: true,
      thresholdDb: currentLimiter.thresholdDb,
      ceilingDbfs: clippingAction.targetCeilingDbtp ?? currentLimiter.ceilingDbfs,
      attackMs: currentLimiter.attackMs,
      releaseMs: currentLimiter.releaseMs,

      // 핵심: 마스터 입력 게인을 권장 감소량만큼 낮춤
      inputGainDb: currentLimiter.inputGainDb - Math.abs(recommendedReductionDb),

      // makeup은 기존값 유지
      makeupGainDb: currentLimiter.makeupGainDb,

      jobId: currentAiJobId.value,
      suggestionActionId: null,
      appliedSuggestionId: null,
      sourceType: 'AI_SUGGESTION',
    })

    goNextAiAnalysis()
  } catch (error) {
   // console.error('[AI clipping apply failed]', error)
    alert('클리핑 적용 중 오류가 발생했습니다.')
  } finally {
    aiAnalyzing.value = false
  }
}

function handleDismissClippingIssue() {
  const item = activeAiAnalysis.value

  if (import.meta.env.DEV) {
   // console.debug('[AI clipping dismiss]', item)
  }

  goNextAiAnalysis()
}

function findPreserveClipIdFromSelectedTrack(selectedTrackIds: number[]) {
  const item = activeAiAnalysis.value

  if (!item) return null

  const selectedTrackId =
    selectedTrackIds[0] ??
    item.targetTrackId ??
    null

  if (!selectedTrackId) return null

  const targetTrack = trackStore.trackList.find(track =>
    Number(track.trackId) === Number(selectedTrackId),
  )

  if (!targetTrack) return null

  const issueStartBar = Math.max(0, item.barStart - 1)
  const issueEndBar = Math.max(issueStartBar + 0.25, item.barEnd)

  const overlappingClip = targetTrack.clips.find(clip => {
    const clipStartBar = Number(clip.start)
    const clipEndBar = clipStartBar + Number(clip.duration)

    return clipStartBar < issueEndBar && clipEndBar > issueStartBar
  })

  if (!overlappingClip) return null

  const clipId = Number(overlappingClip.clipId)

  return Number.isNaN(clipId) ? null : clipId
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

const item = activeAiAnalysis.value
const preserveClipId = findPreserveClipIdFromSelectedTrack(payload.selectedTrackIds)

if (preserveClipId==null) {
  alert('선택한 트랙에서 AI 분석 구간과 겹치는 클립을 찾지 못했습니다.')
  return
}

await sendAiWorkflowFeedback(currentAiJobId.value, {
  project_id: projectId,
  issue_id: item ? String(item.id) : null,
  action_type: null,
  action_payload: {
    selected_track_ids: payload.selectedTrackIds,
    preserve_clip_id: preserveClipId,
  },
  selected_region_id: selectedAiRegionId.value,
  preserve_clip_id: preserveClipId,
  user_feedback_message: `${selectedTrackText}${payload.message}`.trim(),
  user_decision: 'RESUME',
})

    const statusResult = await pollAiFeedbackResult(currentAiJobId.value)

if (import.meta.env.DEV) {
 // console.debug('[AI feedback result]', statusResult)
}

const nextBands = mapAiSuggestionToEqBands(statusResult)

if (nextBands.length === 0) {
  alert('AI 수정안이 아직 생성되지 않았습니다. 잠시 후 다시 시도해주세요.')
  return
}

aiAfterBands.value = nextBands
  } catch (error) {
   // console.error(error)
    alert(error instanceof Error ? error.message : 'AI 수정 요청 중 오류가 발생했습니다.')
  } finally {
    aiAnalyzing.value = false
  }
}

function syncSelectedRegionIdFromActiveItem() {
  const item = activeAiAnalysis.value

  if (!item) {
    selectedAiRegionId.value = null
    return
  }

  const numericRegionId = Number(item.id)

  selectedAiRegionId.value = Number.isNaN(numericRegionId)
    ? null
    : numericRegionId
}

function applyActiveAiAnalysisSelection() {
  const item = activeAiAnalysis.value

  if (!item) return

  if (item.kind === 'CLIPPING') {
    trackStore.selectMasterTrack?.()
    return
  }

  if (item.targetTrackId) {
    trackStore.selectTrack?.(item.targetTrackId)
  }
}

function resetAiEqSuggestionOnNavigation() {
  aiAfterBands.value = []
}

function goNextAiAnalysis() {
  if (aiAnalysisItems.value.length === 0) return

  activeAiAnalysisIndex.value =
    (activeAiAnalysisIndex.value + 1) % aiAnalysisItems.value.length

  syncSelectedRegionIdFromActiveItem()
  resetAiEqSuggestionOnNavigation()
  applyActiveAiAnalysisSelection()
  syncAiPreviewBandsFromActiveItem()
}

function goPrevAiAnalysis() {
  if (aiAnalysisItems.value.length === 0) return

  activeAiAnalysisIndex.value =
    activeAiAnalysisIndex.value === 0
      ? aiAnalysisItems.value.length - 1
      : activeAiAnalysisIndex.value - 1

  syncSelectedRegionIdFromActiveItem()
  resetAiEqSuggestionOnNavigation()
  applyActiveAiAnalysisSelection()
  syncAiPreviewBandsFromActiveItem()
}

const activeAiAnalysisCurrentIndex = computed(() => {
  return activeAiAnalysisIndex.value
})

const aiAnalysisTotalCount = computed(() => {
  return aiAnalysisItems.value.length
})

const shouldShowAiEqRevisionPanel = computed(() => {
  return activeAiAnalysis.value?.uiMode === 'eq_ai'
})

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
    handleApplyClippingIssue,
    handleDismissClippingIssue,
    aiAnalysisItems,
    activeAiAnalysis,
    activeAiAnalysisCurrentIndex,
    aiAnalysisTotalCount,
    shouldShowAiEqRevisionPanel,
    goNextAiAnalysis,
    goPrevAiAnalysis,
  }
}

