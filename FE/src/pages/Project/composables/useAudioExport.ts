import * as Tone from 'tone'
import { useTrackStore } from '../store/useTrackStore'

/**
 * DataView에 문자열을 ASCII 값으로 기록하는 헬퍼 함수
 * WAV 헤더 작성 시 'RIFF', 'WAVE' 등의 청크 식별자를 기록할 때 사용됩니다.
 */
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

/**
 * Web Audio API의 32-bit Float AudioBuffer를 24-bit PCM 방식의 WAV 파일(Blob)로 인코딩합니다.
 * 백엔드 서버를 거치지 않고 브라우저 단에서 스튜디오 표준 규격(24-bit)으로 믹스다운을 수행합니다.
 * 
 * @param audioBuffer 믹스다운이 완료된 원본 AudioBuffer (32-bit Float 배열)
 * @param sampleRate 내보낼 샘플레이트 (기본: 48000Hz)
 * @param numChannels 오디오 채널 수 (스테레오의 경우 2)
 * @returns 24-bit WAV 형식으로 변환된 Blob 객체
 */
function encodeWAV24Bit(
  audioBuffer: AudioBuffer,
  sampleRate: number,
  numChannels: number,
): Blob {
  const left = audioBuffer.getChannelData(0)
  const right = numChannels > 1 ? audioBuffer.getChannelData(1) : left

  // 각 샘플은 24-bit(3 bytes)를 차지하므로, 바이트 단위 계산이 필요합니다.
  const numSamples = left.length
  const bitDepth = 24
  const bytesPerSample = bitDepth / 8 // 3바이트
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = numSamples * blockAlign

  // WAV 파일은 헤더(44바이트) + 실제 PCM 오디오 데이터로 구성됩니다.
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')

  // FMT sub-chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)

  // data sub-chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // 실제 오디오 샘플 데이터를 24-bit Little-endian 정수로 변환하여 DataView에 기록합니다.
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      // 스테레오일 경우 좌(0), 우(1) 채널 데이터를 교차(interleaved)하여 기록합니다.
      const sample = channel === 0 ? left[i] : right[i]
      
      // 노이즈나 클리핑(Clipping) 방지를 위해 값을 -1.0 ~ 1.0 범위로 제한(Clamp)합니다.
      const clamped = Math.max(-1, Math.min(1, sample))
      
      // 32-bit Float(-1.0 ~ 1.0)를 24-bit 정수 범위(-8,388,608 ~ 8,388,607)로 스케일링합니다.
      let val = clamped < 0 ? clamped * 0x800000 : clamped * 0x7fffff
      val = Math.round(val)

      // 24-bit 데이터는 3바이트로 쪼개서 Little-endian 방식으로 기록합니다.
      view.setUint8(offset, val & 0xff)
      view.setUint8(offset + 1, (val >> 8) & 0xff)
      view.setUint8(offset + 2, (val >> 16) & 0xff)
      offset += bytesPerSample
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * 프론트엔드 환경에서 모든 트랙과 클립을 조합하여 믹스다운된 오디오 파일을 추출하는 컴포저블
 */
export function useAudioExport() {
  const trackStore = useTrackStore()

  const exportMasterAudio = async (isMono: boolean = false): Promise<Blob> => {
    const tracks = trackStore.trackList

    // 가장 마지막 클립의 종료 지점(Max Duration) 계산
    let maxDurationBar = 0
    tracks.forEach((track) => {
      track.clips.forEach((clip) => {
        const end = clip.start + clip.duration
        if (end > maxDurationBar) maxDurationBar = end
      })
    })

    if (maxDurationBar === 0) {
      throw new Error('내보낼 오디오 클립이 없습니다.')
    }

    const secondsPerBar = trackStore.secondsPerBar
    // 여유 공간(Reverb/Delay Tail 등)을 위해 1초 추가
    const renderDurationSec = maxDurationBar * secondsPerBar + 1.0
    const sampleRate = 48000
    const channels = isMono ? 1 : 2

    // 트랙 중 하나라도 솔로(Solo)가 켜져 있는지 확인
    const isAnyTrackSoloed = tracks.some((t) => t.isSoloed)

    // Tone.Offline을 통해 가상 오디오 컨텍스트에서 렌더링
    const renderedBuffer = await Tone.Offline(async ({ transport }) => {
      const masterVolume = new Tone.Volume(0).toDestination()
      
      const offlinePlayers: Tone.Player[] = []

      for (const track of tracks) {
        // 뮤트 상태이거나, 다른 트랙이 솔로인데 현재 트랙이 솔로가 아니면 스킵
        if (track.isMuted) continue
        if (isAnyTrackSoloed && !track.isSoloed) continue

        // 볼륨과 패닝(Pan) 노드를 오프라인 컨텍스트 상에 새로 인스턴스화합니다.
        // 이는 실시간 렌더링에 쓰이는 기존 노드와 충돌하지 않도록 하기 위함입니다.
        const panner = new Tone.Panner(track.pan / 100).connect(masterVolume)
        const vol = new Tone.Volume(track.volume).connect(panner)

        panner.channelCount = 2
        panner.channelCountMode = 'explicit'
        vol.channelCount = 2
        vol.channelCountMode = 'explicit'

        let currentInput: Tone.ToneAudioNode = vol

        // EQ 복원
        const eqState = track.eq
        if (eqState && eqState.bands && eqState.bands.length > 0) {
          const eqNodes = eqState.bands.map((band) => {
            const type: BiquadFilterType =
              band.eqTypeCode === 2
                ? 'lowshelf'
                : band.eqTypeCode === 3
                  ? 'highshelf'
                  : 'peaking'

            return new Tone.Filter({
              type,
              frequency: band.frequencyHz,
              Q: band.q,
              gain: band.gainDeltaDb,
            })
          })

          for (let i = 0; i < eqNodes.length - 1; i++) {
            eqNodes[i].connect(eqNodes[i + 1])
          }
          eqNodes[eqNodes.length - 1].connect(vol)
          currentInput = eqNodes[0]
        }

        // 클립(오디오 소스) 복원 및 재생 스케줄링
        for (const clip of track.clips) {
          if (!clip.audio?.cdnUrl) continue

          // 메모리 누수 방지 및 로딩 속도 최적화를 위해 캐싱된 AudioBuffer를 즉시 재사용합니다.
          const audioBuffer = await trackStore.fetchAndCacheAudioBuffer(clip.audio.cdnUrl)

          // Tone.Offline 콜백 내부에서는 Global AudioContext가 임시로 OfflineAudioContext로 교체됩니다.
          // 따라서 여기서 생성된 Player는 자동으로 오프라인 렌더러에 종속되어 백그라운드 연산이 가능해집니다.
          const player = new Tone.Player(audioBuffer)
          player.connect(currentInput)

          // 클립의 시작 지점, 원본 오디오 내에서의 시작 오프셋, 그리고 재생 길이를 계산하여 Transport에 예약합니다.
          const exactStartTimeSec = clip.start * secondsPerBar
          const audioOffsetSec = (clip.audioStartMs || 0) / 1000
          const visualDurationSec = clip.duration * secondsPerBar
          // BPM에 따른 재생 속도 조절: 클립의 시각적 길이 안에 원본 오디오가 전부 들어맞도록
          const sourceAudioSec = clip.audioDurationMs / 1000
          player.playbackRate = visualDurationSec > 0 ? sourceAudioSec / visualDurationSec : 1

          player.sync().start(exactStartTimeSec, audioOffsetSec, sourceAudioSec)
          offlinePlayers.push(player)
        }
      }

      // Offline Transport 시작
      transport.start()
    }, renderDurationSec, channels, sampleRate)

    // 렌더링된 Float32 데이터를 24-bit WAV 포맷의 Blob으로 변환
    return encodeWAV24Bit(renderedBuffer.get() as AudioBuffer, sampleRate, channels)
  }

  return {
    exportMasterAudio,
  }
}
