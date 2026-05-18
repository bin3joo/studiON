import { computed, ref } from 'vue'
import { useTrackStore } from '../store/useTrackStore'
import type { EqTypeCode, TrackEqBandState } from '../types'
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
  lockMasterLimiter,
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

  jobId: number | null
  regionId: number | null
  startMs: number
  endMs: number

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
  const activeAiAnalysisId = ref<string | number | null>(null)

  // 개발 환경 테스트용 Mock 데이터 주입 함수 (콘솔에서 window.testAi() 로 실행 가능)
  ;(window as any).testAi = () => {
    aiAnalysisItems.value = [
      {
        id: 'mock-1',
        issueType: 'clipping',
        kind: 'CLIPPING',
        uiMode: 'master_trim' as any,
        jobId: null,
        regionId: null,
        startMs: 2000,
        endMs: 6000,
        targetType: 'MASTER_TRACK',
        targetTrackId: null,
        startPercent: 10,
        endPercent: 30,
        startPx: 0,
        endPx: 0,
        barStart: 2,
        barEnd: 4,
        title: '[테스트] 클리핑 마커 1',
        summary: '첫 번째 문제 구간입니다. ✨ 버튼을 눌러 확인하세요.',
        bullets: ['시작: 2.0초', '끝: 6.0초'],
        recommendedGainReductionDb: -3.0,
        actions: [],
        markers: []
      } as any,
      {
        id: 'mock-2',
        issueType: 'harshness',
        kind: 'HARSHNESS',
        uiMode: 'marker_only' as any,
        jobId: null,
        regionId: null,
        startMs: 12000,
        endMs: 16000,
        targetType: 'TRACK',
        targetTrackId: 1,
        startPercent: 40,
        endPercent: 50,
        startPx: 0,
        endPx: 0,
        barStart: 6,
        barEnd: 8,
        title: '[테스트] 하쉬니스 마커 2',
        summary: '두 번째 문제 구간입니다. 다른 위치에 마커가 생깁니다.',
        bullets: ['고음역대 쏘는 소리 감지'],
        recommendedGainReductionDb: null,
        actions: [],
        markers: []
      } as any,
      {
        id: 'mock-3',
        issueType: 'band_overlap',
        kind: 'BAND_OVERLAP',
        uiMode: 'eq_ai' as any,
        jobId: null,
        regionId: null,
        startMs: 24000,
        endMs: 28000,
        targetType: 'TIMELINE',
        targetTrackId: 2,
        startPercent: 70,
        endPercent: 80,
        startPx: 0,
        endPx: 0,
        barStart: 12,
        barEnd: 14,
        title: '[테스트] 대역 중복 마커 3',
        summary: '세 번째 문제 구간입니다.',
        bullets: ['보컬과 베이스 대역이 충돌합니다.'],
        recommendedGainReductionDb: null,
        actions: [],
        markers: []
      } as any
    ];
    activeAiAnalysisId.value = 'mock-1';
  }

  const activeAiAnalysis = computed(() => {
    return aiAnalysisItems.value.find(item => item.id === activeAiAnalysisId.value) ?? null
  })

  // 기존 ProjectPage / Overlay 호환용
  const aiConflict = computed(() => activeAiAnalysis.value)

  const aiBeforeBands = ref<TrackEqBandState[]>([])
  const aiAfterBands = ref<TrackEqBandState[]>([])
  const currentAiJobId = ref<number | null>(null)
  const selectedAiRegionId = ref<number | null>(null)

  const appliedClippingIssueIds = ref<Set<string | number>>(new Set())
  const appliedClippingInfoMap = ref<
  Map<string | number, {
    reductionDb: number
    inputGainDb: number
    ceilingDbfs: number
  }>
>(new Map())

const appliedAiEqIssueIds = ref<Set<string | number>>(new Set())

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

    if (status === 'failed') {
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

  function getClippingTrimValues(source: any) {
  const recommendedReductionDb =
    source.estimated_gain_reduction_db ??
    source.estimatedGainReductionDb ??
    source.recommended_reduction_db ??
    source.recommendedReductionDb ??
    null

  const currentTruePeakDbtp =
    source.current_true_peak_dbtp ??
    source.currentTruePeakDbtp ??
    null

  const targetCeilingDbtp =
    source.target_ceiling_dbtp ??
    source.targetCeilingDbtp ??
    null

  return {
    recommendedReductionDb:
      recommendedReductionDb == null ? null : Number(recommendedReductionDb),
    currentTruePeakDbtp:
      currentTruePeakDbtp == null ? null : Number(currentTruePeakDbtp),
    targetCeilingDbtp:
      targetCeilingDbtp == null ? null : Number(targetCeilingDbtp),
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
  const involvedTrackNamesText = formatTrackNames(involvedTrackIds)
  const clippingTrackName = getTrackDisplayName(region.track_id)

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
          clippingTrackName
            ? `클리핑 감지 트랙: ${clippingTrackName}`
            : '클리핑 감지 트랙 정보를 확인 중입니다.',
          region.estimated_gain_reduction_db != null
            ? `권장 감소량: ${region.estimated_gain_reduction_db.toFixed(2)}dB`
            : '권장 감소량 정보를 확인 중입니다.',
          region.current_true_peak_dbtp != null
            ? `현재 True Peak: ${region.current_true_peak_dbtp.toFixed(2)} dBTP`
            : '현재 True Peak 정보를 확인 중입니다.',
          region.target_ceiling_dbtp != null
            ? `목표 Ceiling: ${region.target_ceiling_dbtp.toFixed(1)} dBTP`
            : '목표 Ceiling 정보를 확인 중입니다.',
        ]
      : [
          region.issue_type ? `문제 유형: ${region.issue_type}` : '문제 유형을 확인 중입니다.',
          region.band_low_hz && region.band_high_hz
            ? `${region.band_low_hz}Hz~${region.band_high_hz}Hz 대역에서 문제가 감지됐어요.`
            : '주파수 대역 정보가 없습니다.',
          involvedTrackNamesText
            ? `관련 트랙: ${involvedTrackNamesText}`
            : '관련 트랙 정보를 확인 중입니다.',
        ]

  const clippingTrimValues = getClippingTrimValues(region)

  const clippingAction =
    kind === 'CLIPPING' &&
    clippingTrimValues.recommendedReductionDb != null
      ? ({
          type: 'apply_master_gain_trim',
          targetScope: 'MASTER',
          targetTrackId: null,
          startMs,
          endMs,
          recommendedReductionDb: clippingTrimValues.recommendedReductionDb,
          currentTruePeakDbtp: clippingTrimValues.currentTruePeakDbtp,
          targetCeilingDbtp: clippingTrimValues.targetCeilingDbtp ?? -1,
        } as AiSuggestionAction)
      : null

  const regionMarkers =
    kind === 'HARSHNESS'
      ? [{
          trackId: targetTrackId,
          centerHz: region.center_hz ?? null,
          bandLowHz: region.band_low_hz ?? null,
          bandHighHz: region.band_high_hz ?? null,
        }]
      : []

  return {
    id: regionId,
    issueType: region.issue_type ?? '',
    kind,
    uiMode,

    jobId: Number(region.job_id ?? currentAiJobId.value ?? null),
    regionId: Number(regionId),
    startMs,
    endMs,

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

    recommendedGainReductionDb:
      clippingAction?.recommendedReductionDb ?? null,

    previewBands: [],
    actions: clippingAction ? [clippingAction] : [],
    markers: regionMarkers,
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

function mapPreviewBandsToEqBands(previewBands: any[] = []): TrackEqBandState[] {
  return previewBands.map((band, index) => ({
    bandOrder: band.band_order ?? band.bandOrder ?? index + 1,
    frequencyHz: band.frequency_hz ?? band.frequencyHz ?? 500,
    gainDeltaDb: band.gain_delta_db ?? band.gainDeltaDb ?? 0,
    q: band.q ?? 1,
    eqTypeCode: band.eq_type_code ?? band.eqTypeCode ?? 1,
  })) as TrackEqBandState[]
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

  const existingTrimAction = issue.actions?.find(action =>
    action.type === 'apply_master_gain_trim'
  )

  const issueTrimValues = getClippingTrimValues(issue)

  const trimAction =
    existingTrimAction ??
    (
      kind === 'CLIPPING' &&
      issueTrimValues.recommendedReductionDb != null
        ? ({
            type: 'apply_master_gain_trim',
            targetScope: 'MASTER',
            targetTrackId: null,
            startMs,
            endMs,
            recommendedReductionDb: issueTrimValues.recommendedReductionDb,
            currentTruePeakDbtp: issueTrimValues.currentTruePeakDbtp,
            targetCeilingDbtp: issueTrimValues.targetCeilingDbtp ?? -1,
          } as AiSuggestionAction)
        : null
    )

  const firstMarker = issue.markers?.[0] ?? null
  const markerBandLowHz = firstMarker?.bandLowHz ?? null
  const markerBandHighHz = firstMarker?.bandHighHz ?? null
  const markerCenterHz = firstMarker?.centerHz ?? null

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

  const bullets =
    kind === 'HARSHNESS'
      ? [
          `문제 유형: ${issue.issueType}`,
          markerCenterHz != null
            ? `중심 주파수: ${markerCenterHz}Hz`
            : '중심 주파수 정보가 없습니다.',
          markerBandLowHz != null && markerBandHighHz != null
            ? `감지 대역: ${markerBandLowHz}Hz~${markerBandHighHz}Hz`
            : '감지 대역 정보가 없습니다.',
        ]
      : kind === 'CLIPPING'
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
          ]

  return {
    id: issue.issueId,
    issueType: issue.issueType,
    kind,
    uiMode: issue.uiMode,

    jobId: currentAiJobId.value,
    regionId: Number(issue.issueId),
    startMs,
    endMs,

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
        : kind === 'HARSHNESS'
          ? `하쉬니스 · ${barStart}마디에서 ${barEnd}마디 사이`
          : `AI 분석 · ${barStart}마디에서 ${barEnd}마디 사이`,

    summary: issue.summary ?? 'AI가 문제가 발생한 구간을 감지했어요.',
    explanation: issue.explanation ?? null,
    bullets,

    bandLowHz: markerBandLowHz,
    bandHighHz: markerBandHighHz,

    recommendedGainReductionDb:
      trimAction?.recommendedReductionDb ?? null,

    previewBands: mapPreviewBandsToEqBands(issue.previewBands),
    actions: trimAction
      ? [
          ...(issue.actions ?? []).filter(action =>
            action.type !== 'apply_master_gain_trim'
          ),
          trimAction,
        ]
      : issue.actions ?? [],

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

function getFeedbackStatusResult(response: any) {
  return response?.data?.data ?? response?.data ?? response
}

function getPreviewBandSpecs(statusResult: any) {
  const projections = statusResult?.projections ?? {}

  return (
    projections.preview_render?.preview_band_specs ??
    projections.previewRender?.previewBandSpecs ??
    projections.preview?.preview_band_specs ??
    projections.preview?.previewBandSpecs ??
    []
  )
}

function getPreviewActionTrackId(statusResult: any) {
  const projections = statusResult?.projections ?? {}

  return (
    projections.preview_render?.preview_action_track ??
    projections.previewRender?.previewActionTrack ??
    projections.preview?.preview_action_track ??
    projections.preview?.previewActionTrack ??
    null
  )
}

function mapPreviewBandSpecsToEqBands(previewBandSpecs: any[]): TrackEqBandState[] {
  return previewBandSpecs
    .map((band, index): TrackEqBandState | null => {
      const frequencyHz = Number(band.frequencyHz ?? band.frequency_hz)
      const gainDeltaDb = Number(band.gainDeltaDb ?? band.gain_delta_db)
      const q = Number(band.q ?? 1)
      const rawEqTypeCode = Number(band.eqTypeCode ?? band.eq_type_code ?? 1)
      const eqTypeCode: EqTypeCode =
        rawEqTypeCode === 2 || rawEqTypeCode === 3 ? rawEqTypeCode : 1

      if (!Number.isFinite(frequencyHz) || !Number.isFinite(gainDeltaDb)) {
        return null
      }

      return {
        bandOrder: Number(band.bandOrder ?? band.band_order ?? index + 1),
        eqTypeCode,
        frequencyHz,
        q: Number.isFinite(q) ? q : 1,
        gainDeltaDb,
        sourceTypeCode: 1,
      } satisfies TrackEqBandState
    })
    .filter((band): band is TrackEqBandState => band !== null)
}

function applyPreviewBandsToActiveIssue(previewBands: TrackEqBandState[]) {
  const item = activeAiAnalysis.value
  if (!item) return

  aiAnalysisItems.value = aiAnalysisItems.value.map(analysisItem => {
    if (analysisItem.id !== item.id) return analysisItem

    return {
      ...analysisItem,
      previewBands,
    }
  })

  aiAfterBands.value = previewBands
}

function mapAiSuggestionToEqBands(statusResult: any): TrackEqBandState[] {
  const previewBandSpecs = getPreviewBandSpecs(statusResult)

  if (!Array.isArray(previewBandSpecs) || previewBandSpecs.length === 0) {
    return []
  }

  return mapPreviewBandSpecsToEqBands(previewBandSpecs)
}

function hasAiEqSuggestion(statusResult: any) {
  return mapAiSuggestionToEqBands(statusResult).length > 0
}

  async function runAiAnalysis() {
  if (aiAnalyzing.value) return

  try {
    aiAnalyzing.value = true
    aiAnalysisItems.value = []
    activeAiAnalysisId.value = null
    aiAfterBands.value = []
    currentAiJobId.value = null
    selectedAiRegionId.value = null
    appliedClippingIssueIds.value = new Set()
    appliedClippingInfoMap.value = new Map()
    appliedAiEqIssueIds.value = new Set()

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

const suggestionNonClippingItems = suggestionItems.filter(item =>
  item.kind !== 'CLIPPING'
)

const actionableSuggestionClippingItems = suggestionItems.filter(item =>
  isActionableClippingItem(item)
)

const actionableRegionClippingItems = regionItems.filter(item =>
  isActionableClippingItem(item)
)

const mergedItems =
  suggestionItems.length > 0
    ? [
        ...suggestionNonClippingItems,
        ...actionableSuggestionClippingItems,
        ...actionableRegionClippingItems,
      ]
    : regionItems

if (mergedItems.length > 0) {
  aiAnalysisItems.value = mergedItems
} else {
  alert('AI가 감지한 문제 구간이 없습니다.')
  return
}

activeAiAnalysisId.value = mergedItems.length > 0 ? mergedItems[0].id : null

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
  const item = activeAiAnalysis.value

  if (!item) {
    alert('적용할 AI 분석 결과가 없습니다.')
    return
  }

  if (item.kind !== 'BAND_OVERLAP') {
    alert('EQ 적용은 대역 중복 이슈에서만 사용할 수 있습니다.')
    return
  }

  if (appliedAiEqIssueIds.value.has(item.id)) {
    alert('이미 적용된 AI EQ입니다.')
    return
  }

  const previewBands = item.previewBands.length > 0
    ? item.previewBands
    : aiAfterBands.value

  if (previewBands.length === 0) {
    alert('적용할 AI EQ가 없습니다.')
    return
  }

  const targetTrackId =
    selectedEqTrack.value?.trackId ??
    trackStore.selectedTrackId ??
    item.targetTrackId

  if (!targetTrackId) {
    alert('AI EQ를 적용할 트랙을 찾지 못했습니다.')
    return
  }

  previewBands.forEach(band => {
    trackStore.addTrackEqBand(targetTrackId, {
      frequencyHz: band.frequencyHz,
      gainDeltaDb: band.gainDeltaDb,
    })
  })

  appliedAiEqIssueIds.value = new Set([
    ...appliedAiEqIssueIds.value,
    item.id,
  ])

  const appliedTrack = trackStore.trackList.find(track =>
    Number(track.trackId) === Number(targetTrackId)
  )

  aiBeforeBands.value = appliedTrack?.eq?.bands
    ? appliedTrack.eq.bands.map(band => ({ ...band }))
    : []

  alert('AI EQ가 현재 트랙에 추가되었습니다.')
}

function handleCancelAiEq() {
  aiAnalysisItems.value = []
  activeAiAnalysisId.value = null
  selectedAiRegionId.value = null
  currentAiJobId.value = null
  aiBeforeBands.value = []
  aiAfterBands.value = []
  appliedAiEqIssueIds.value = new Set()
}

function isActionableClippingItem(item: AiAnalysisItem) {
  if (item.kind !== 'CLIPPING') return false

  return (
    item.recommendedGainReductionDb != null ||
    item.actions.some(action =>
      action.type === 'apply_master_gain_trim' &&
      action.recommendedReductionDb != null
    )
  )
}

function getActiveClippingTrimAction(item: AiAnalysisItem): AiSuggestionAction | null {
  if (!item || item.kind !== 'CLIPPING') return null

  const action = item.actions.find(action =>
    action.type === 'apply_master_gain_trim'
  )

  if (action) return action

  if (item.recommendedGainReductionDb == null) return null

  return {
    type: 'apply_master_gain_trim',
    targetScope: 'MASTER',
    targetTrackId: null,
    recommendedReductionDb: item.recommendedGainReductionDb,
    targetCeilingDbtp: -1,
  }
}

async function handleApplyClippingIssue(item: AiAnalysisItem) {
  if (aiAnalyzing.value) return

  if (!item || item.kind !== 'CLIPPING') return

  if (appliedClippingIssueIds.value.has(item.id)) {
    alert('이미 적용된 클리핑 이슈입니다.')
    return
  }

  const action = getActiveClippingTrimAction(item)

  if (!action || action.recommendedReductionDb == null) {
    alert('클리핑 적용값이 없습니다.')
    return
  }

  const clippingAction = action
  const recommendedReductionDb = Number(clippingAction.recommendedReductionDb)

  let locked = false

  try {
    aiAnalyzing.value = true

    await lockMasterLimiter(projectId, true)
    locked = true

    const currentLimiter = await getMasterLimiter(projectId)

    const savedLimiter = await saveMasterLimiterDraft(projectId, {
  isEnabled: true,
  thresholdDb: currentLimiter.thresholdDb,
  ceilingDbfs: clippingAction.targetCeilingDbtp ?? currentLimiter.ceilingDbfs,
  attackMs: currentLimiter.attackMs,
  releaseMs: currentLimiter.releaseMs,
  inputGainDb: currentLimiter.inputGainDb - Math.abs(recommendedReductionDb),
  makeupGainDb: currentLimiter.makeupGainDb,
  jobId: currentAiJobId.value,
  suggestionActionId: null,
  appliedSuggestionId: null,
  sourceType: 'AI_SUGGESTION',
})

    appliedClippingIssueIds.value = new Set([
      ...appliedClippingIssueIds.value,
      item.id,
    ])

    appliedClippingInfoMap.value = new Map([
  ...appliedClippingInfoMap.value,
  [
    item.id,
    {
      reductionDb: Math.abs(recommendedReductionDb),
      inputGainDb: savedLimiter.inputGainDb,
      ceilingDbfs: savedLimiter.ceilingDbfs,
    },
  ],
])

   // goNextAiAnalysis()
  } catch (error: any) {
    console.error('[AI clipping apply failed]', {
      status: error?.response?.status,
      data: error?.response?.data,
      error,
    })

    alert(error?.response?.data?.message ?? '클리핑 적용 중 오류가 발생했습니다.')
  } finally {
    if (locked) {
      try {
        await lockMasterLimiter(projectId, false)
      } catch (unlockError) {
        console.error('[AI clipping unlock failed]', unlockError)
      }
    }

    aiAnalyzing.value = false
  }
}

function handleDismissClippingIssue(item: AiAnalysisItem) {

  if (import.meta.env.DEV) {
   // console.debug('[AI clipping dismiss]', item)
  }

  activeAiAnalysisId.value = null
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
  if (aiAnalyzing.value) return

  const item = activeAiAnalysis.value
  if (!item) return

  const jobId = item.jobId ?? currentAiJobId.value

  if (!jobId) {
    alert('AI 분석 작업 정보가 없습니다. 먼저 AI 분석을 실행해주세요.')
    return
  }

  const preserveClipId = findPreserveClipIdFromSelectedTrack(payload.selectedTrackIds)

  if (preserveClipId == null) {
    alert('선택한 트랙에서 AI 분석 구간과 겹치는 클립을 찾지 못했습니다.')
    return
  }

  const selectedTrackNamesText = formatTrackNames(payload.selectedTrackIds)

  const selectedTrackText =
    selectedTrackNamesText
      ? `선택한 트랙: ${selectedTrackNamesText}. `
      : ''

  try {
    aiAnalyzing.value = true

    await sendAiWorkflowFeedback(jobId, {
      project_id: projectId,
      issue_id: String(item.id),
      action_type: 'preserve_clip',
      action_payload: {
        selected_track_ids: payload.selectedTrackIds,
        preserve_clip_id: preserveClipId,
      },
      selected_region_id: item.regionId ?? selectedAiRegionId.value,
      preserve_clip_id: preserveClipId,
      user_feedback_message: `${selectedTrackText}${payload.message}`.trim(),
      user_decision: 'RESUME',
    })

    const statusResult = await pollAiFeedbackResult(jobId)

    const nextBands = mapAiSuggestionToEqBands(statusResult)

    if (nextBands.length === 0) {
      alert('AI 수정안이 아직 생성되지 않았습니다. 잠시 후 다시 시도해주세요.')
      return
    }

    const previewActionTrackId = getPreviewActionTrackId(statusResult)

    if (previewActionTrackId != null) {
      trackStore.selectTrack?.(Number(previewActionTrackId))
    }

    applyPreviewBandsToActiveIssue(nextBands)
  } catch (error) {
    console.error('[AI 수정 요청 실패]', error)
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

function setActiveAiAnalysis(id: string | number) {
  activeAiAnalysisId.value = id
  syncSelectedRegionIdFromActiveItem()
  resetAiEqSuggestionOnNavigation()
  applyActiveAiAnalysisSelection()
  syncAiPreviewBandsFromActiveItem()
}

function getClippingAppliedInfo(item: AiAnalysisItem) {
  if (!item || item.kind !== 'CLIPPING') return null
  return appliedClippingInfoMap.value.get(item.id) ?? null
}

function checkIsClippingApplied(item: AiAnalysisItem) {
  if (!item || item.kind !== 'CLIPPING') return false
  return appliedClippingIssueIds.value.has(item.id)
}

const activeAiMarkers = computed(() => {
  return activeAiAnalysis.value?.markers ?? []
})

const activeAiUiMode = computed(() => {
  return activeAiAnalysis.value?.uiMode ?? null
})

const isActiveAiMarkerOnly = computed(() => {
  return activeAiAnalysis.value?.uiMode === 'marker_only'
})

function getTrackDisplayName(trackId: number | null | undefined) {
  if (trackId == null) return null

  const numericTrackId = Number(trackId)

  if (Number.isNaN(numericTrackId)) return null

  if (trackStore.masterTrack?.trackId === numericTrackId) {
    return trackStore.masterTrack.name
  }

  const track = trackStore.trackList.find(track =>
    Number(track.trackId) === numericTrackId
  )

  if (track?.name) {
    return track.name
  }

  return `트랙 ${numericTrackId}`
}

function getTrackDisplayNames(trackIds: Array<number | null | undefined>) {
  return trackIds
    .map(trackId => getTrackDisplayName(trackId))
    .filter((name): name is string => Boolean(name))
}

function formatTrackNames(trackIds: Array<number | null | undefined>) {
  const names = getTrackDisplayNames(trackIds)

  return names.length > 0
    ? names.join(', ')
    : null
}

  const shouldShowAiEqRevisionPanel = computed(() => {
    const item = activeAiAnalysis.value

    if (!item) return false

    return item.uiMode === 'eq_ai' || item.markers.length > 0
  })

  return {
    activeAiMarkers,
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
    setActiveAiAnalysis,
    aiAnalysisItems,
    activeAiAnalysis,
    shouldShowAiEqRevisionPanel,
    checkIsClippingApplied,
    getClippingAppliedInfo,
    activeAiUiMode,
    isActiveAiMarkerOnly,
  }
}
