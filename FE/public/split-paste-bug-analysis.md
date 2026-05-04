# 🔍 클립 분할/붙여넣기 버그 분석 보고서

> **작성일:** 2026-05-04  
> **분석 대상:** `useTrackStore.ts` (splitClip, pasteClip, resyncClip), `WaveformWebGL.vue`

---

## 버그 1: 재생 중 Ctrl+E 분할 시 소리가 나지 않음

### 현상
- 재생 중 Ctrl+E로 클립을 분할하면, 분할 후 양쪽 클립 모두 소리가 나지 않음
- 재생바(Playhead)는 움직이지만 오디오 출력 없음

### 원인 분석 (3가지 복합 원인)

#### 원인 1-1: `resyncClip`과 `splitClip`에서 Transport를 이중으로 pause/start

`splitClip` (535~536행):
```typescript
const wasPlaying = isPlaying.value;
if (wasPlaying) Tone.getTransport().pause();  // ← 1차 pause
```

`resyncClip` (539행에서 호출, 내부 862~863행):
```typescript
if (wasPlaying) {
    Tone.getTransport().pause();  // ← 2차 pause (이미 paused인데 또 호출)
}
```

그리고 `resyncClip` 내부(888~890행)에서:
```typescript
if (wasPlaying) {
    Tone.getTransport().start("+0.01", currentOffset);  // ← resync가 먼저 start
}
```

**문제:** `splitClip`에서 이미 pause했는데 `resyncClip` 내부에서 `isPlaying.value`를 다시 확인합니다. `splitClip`에서는 `isPlaying.value`를 변경하지 않으므로, `resyncClip`이 **자체적으로 Transport를 start**합니다. 그 직후 `splitClip`의 `.then()` 콜백(560~564행)에서도 다시 start합니다.

결과: **Transport가 두 번 start되면서 내부 Clock 오프셋이 꼬임** → 스케줄된 클립들의 재생 시점이 어긋남

#### 원인 1-2: 오른쪽 클립 Player가 비동기 `.load().then()` 안에서만 스케줄됨

```typescript
const newPlayer = new Tone.Player().connect(targetChannel);
newPlayer.load("/test2.mp3").then(() => {  // ← 비동기! 수백ms 소요
    // ...
    newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, safeDurationSec);
    // ...
    if (wasPlaying) {
        Tone.getTransport().start("+0.01", currentOffset);  // ← 여기서 재개
    }
});
```

**문제:** `.load()`는 네트워크에서 파일을 다시 가져오는 비동기 작업입니다. 이 콜백이 실행되기 전에 `resyncClip`이 이미 Transport를 재개했기 때문에:
1. 왼쪽 클립: `resyncClip`에 의해 재스케줄됨 → Transport가 start됨 → 소리 나야 하지만…
2. `.then()` 콜백이 나중에 실행되면서 **Transport를 다시 stop → start** 함
3. 이 시점에서 왼쪽 클립의 스케줄이 리셋되어 소리가 안 남

#### 원인 1-3: `isPlaying` 상태와 `updatePlayheadLoop` 동기화 문제

`splitClip`에서 Transport를 pause하지만 `isPlaying.value`는 `true`로 유지됩니다.  
`updatePlayheadLoop`는 `isPlaying.value`를 보고 계속 루프를 돌지만, Transport가 pause 상태이므로 `Transport.seconds`가 멈춰있고, 나중에 `.then()` 콜백에서 Transport를 다시 start할 때 `updatePlayheadLoop`가 이미 죽어 있을 수 있습니다.

### 해결 방안

```typescript
// splitClip 내부 수정 방향
const splitClip = async (clipId: number, trackId: number) => {
    // ... (기존 검증 로직)

    // 1. 재생 상태 캡처 및 Transport 정지 (한 곳에서만!)
    const wasPlaying = isPlaying.value;
    if (wasPlaying) {
        Tone.getTransport().pause();
        isPlaying.value = false;              // ← 상태도 함께 변경
        cancelAnimationFrame(animationFrameId); // ← 루프도 중단
    }

    // 2. 왼쪽 클립 resync — 이때 resyncClip 내부에서 isPlaying=false이므로
    //    Transport를 자체적으로 pause/start하지 않음
    resyncClip(originalClip.clipId, originalClip.start);

    // 3. 오른쪽 클립 Player 생성
    const targetChannel = trackChannels.get(trackId);
    if (targetChannel && rightClip.audio?.cdnUrl) {
        const newPlayer = new Tone.Player().connect(targetChannel);
        await newPlayer.load("/test2.mp3");  // ← await로 완료 대기!

        const exactStartTimeSec = rightClip.start * secondsPerBar.value;
        const audioOffsetSec = rightClip.audioStartMs / 1000;
        const maxDuration = newPlayer.buffer.duration - audioOffsetSec;
        const safeDurationSec = Math.min(
            rightClip.duration * secondsPerBar.value, maxDuration
        );

        if (safeDurationSec > 0) {
            newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, safeDurationSec);
        }
        clipPlayers.set(rightClip.clipId, newPlayer);
    }

    // 4. 모든 스케줄링 완료 후 한 번만 재개
    if (wasPlaying) {
        const currentOffset = playheadPosition.value * secondsPerBar.value;
        Tone.getTransport().start("+0.01", currentOffset);
        isPlaying.value = true;
        updatePlayheadLoop();
    }
};
```

핵심 변경사항:
1. `.load().then()` 대신 `await newPlayer.load()`로 동기화
2. Transport pause/start를 `splitClip` 한 곳에서만 관리
3. `isPlaying`을 즉시 `false`로 바꿔서 `resyncClip` 내부에서 중복 pause/start 방지
4. 모든 스케줄링 완료 후 단 1회만 Transport 재개

---

## 버그 2: 분할/붙여넣기 반복 시 파형이 사라지는 클립 발생

### 현상
- 클립을 여러 번 분할하거나, 분할 후 복사→붙여넣기를 반복하면 일부 클립의 파형(Waveform)이 렌더링되지 않음
- 클립 박스는 보이지만 내부 파형이 비어있음

### 원인 분석 (3가지 원인)

#### 원인 2-1: `OffscreenCanvas.transferControlToOffscreen()`의 1회성 특성

`WaveformWebGL.vue` (93~95행):
```typescript
const offscreenCanvas = canvasRef.value.transferControlToOffscreen();
worker.postMessage({ canvas: offscreenCanvas }, [offscreenCanvas]);
```

**`transferControlToOffscreen()`는 한 Canvas 요소에 대해 단 1번만 호출 가능합니다.**

Vue의 반응형 시스템에서 `v-for`로 렌더링된 클립이 분할/붙여넣기로 추가·제거되면, Vue는 DOM을 재활용(reuse)하거나 재마운트합니다. `:key="clip.clipId"`로 고유 키를 사용하고 있지만, 다음 경우에 문제 발생:

1. **분할 시**: `track.clips.push(rightClip)` → Vue가 새 DOM 요소 생성 → `WaveformWebGL`이 마운트 → `transferControlToOffscreen()` 정상 호출 ✅
2. **붙여넣기 반복 시**: 같은 `cdnUrl`을 가진 클립이 계속 추가됨 → 각각 새 Worker 생성 → 각각 `transferControlToOffscreen()` 호출 → **정상이어야 하지만...**

문제는 **분할된 클립이 먼저 제거되었다가 다시 추가되는 과정**에서 발생합니다. Vue가 컴포넌트를 unmount→remount 하면:
- `onUnmounted`에서 `worker?.terminate()` 호출 ✅
- 새로운 `onMounted`에서 새 worker 생성 + 새 `transferControlToOffscreen()` ✅
- **그러나 canvas DOM 요소 자체가 Vue에 의해 재활용되면**, 이미 한번 transfer된 canvas에 또 transfer를 시도 → **에러 발생 → 파형 렌더링 실패**

#### 원인 2-2: `audioCache`의 URL 기반 캐싱과 분할 클립의 `audioStartMs` 불일치

`WaveformWebGL.vue` (2행, 36~49행):
```typescript
const audioCache = new Map<string, { channelData: Float32Array, sampleRate: number }>();

// ...
const audioUrl = props.clip.audio.cdnUrl;
let cached = audioCache.get(audioUrl);
```

`audioCache`는 **모듈 레벨 전역 변수**이므로 모든 `WaveformWebGL` 인스턴스가 공유합니다. 캐시 키는 `cdnUrl`(예: `/test2.mp3`)입니다.

분할/복사/붙여넣기로 만들어진 모든 클립은 **동일한 `cdnUrl`**을 공유하므로 캐시 히트됩니다. 이 자체는 정상이지만, 문제는 `renderWaveform`에서의 계산입니다:

```typescript
const startSampleOffset = (props.clip.audioStartMs / 1000) * cached.sampleRate;
```

분할된 오른쪽 클립의 `audioStartMs`가 매우 클 때(예: 원본의 60% 지점), `startSampleOffset`이 `channelData.length`를 초과하면 **워커에서 `for` 루프가 즉시 `break`되어 아무것도 그리지 않습니다.**

워커 코드 (54~55행):
```typescript
const start = Math.floor(startSampleOffset + x * samplesPerPixel);
if (start >= channelData.length) break;  // ← 이 조건에서 즉시 탈출
```

이것은 `audioStartMs` 값이 원본 오디오 길이를 초과하는 경우 발생하며, 분할을 여러 번 반복하면 **누적된 `audioStartMs` 오류**로 인해 발생 가능합니다.

#### 원인 2-3: `pasteClip`에서 `clipDataToPaste`의 오래된 데이터 사용

`pasteClip` (376~382행):
```typescript
const newClip: ClipUIState = {
    ...clipDataToPaste,         // ← 원본 클립보드 데이터 전체를 스프레드
    clipId: response.clip_id,
    start: response.target_start_bar,
    isSelected: false,
    isDragging: false
};
```

**문제:** `clipDataToPaste`에 포함된 `audio` 객체는 **원본 클립의 참조**를 그대로 유지합니다. `JSON.parse(JSON.stringify(clip))`으로 깊은 복사를 했지만 (`copyClip` 278행), 복사 시점의 `audioStartMs`와 `audioDurationMs`가 고정됩니다.

분할 후 복사한 클립의 `audioStartMs`가 이미 높은 값인 상태에서 이것을 다시 붙여넣기하면:
- `newClip.audioStartMs`가 원본 오디오 길이에 비해 과도하게 큰 값이 됨
- `WaveformWebGL`에서 `startSampleOffset`이 `channelData.length`를 초과 → 파형 없음

또한 `pasteClip`의 오디오 스케줄링(392~396행)에서:
```typescript
const audioOffsetSec = (clipDataToPaste.audioStartMs || 0) / 1000;
const audioDurationSec = clipDataToPaste.duration * secondsPerBar.value;
```

여기서 `clipDataToPaste.duration`은 **분할되어 짧아진 클립의 길이**이지만, 오디오 파일 자체의 남은 길이와 비교하지 않습니다. 그래서 `buffer.duration - audioOffsetSec`보다 큰 duration을 요청하면 Tone.js가 묵묵히 무시하거나 에러가 발생할 수 있습니다.

### 해결 방안

#### 2-1 수정: Canvas 재활용 방어

```typescript
// WaveformWebGL.vue onMounted 내부
onMounted(async () => {
  await nextTick();
  if (!canvasRef.value || !props.clip.audio?.cdnUrl) return;

  const workerUrl = new URL('@/core/workers/waveform.worker.ts', import.meta.url).href;
  worker = new Worker(workerUrl, { type: 'module' });

  try {
    const offscreenCanvas = canvasRef.value.transferControlToOffscreen();
    worker.postMessage({ canvas: offscreenCanvas }, [offscreenCanvas]);
  } catch (e) {
    // 이미 transfer된 canvas인 경우 — 새 canvas 요소를 강제 생성
    console.warn('Canvas transfer 실패, 새 canvas 생성:', e);
    const newCanvas = document.createElement('canvas');
    canvasRef.value.replaceWith(newCanvas);
    canvasRef.value = newCanvas;  // ← ref 갱신 불가하므로 다른 방법 필요
    // 대안: 컴포넌트 key에 랜덤값을 추가하여 강제 재마운트
    return;
  }
  // ...
});
```

**더 나은 방법:** `TrackItem.vue`에서 WaveformWebGL의 `:key`에 타임스탬프를 추가:

```html
<WaveformWebGL
  v-if="clip.audio?.cdnUrl"
  :key="`${clip.clipId}-${clip.duration}-${clip.audioStartMs}`"
  :clip="clip"
/>
```

이렇게 하면 분할/리사이즈로 `duration`이나 `audioStartMs`가 바뀔 때 Vue가 컴포넌트를 완전히 재생성합니다.

#### 2-2 수정: `audioStartMs` 범위 검증 추가

```typescript
// WaveformWebGL.vue renderWaveform 내부
const totalAudioDurationSec = cached.channelData.length / cached.sampleRate;
const clipAudioStartSec = props.clip.audioStartMs / 1000;

// 오디오 데이터 범위를 벗어나면 렌더링 건너뛰기
if (clipAudioStartSec >= totalAudioDurationSec) {
    console.warn(`파형 렌더링 건너뛰기: audioStartMs(${props.clip.audioStartMs})가 오디오 길이를 초과`);
    return;
}

const startSampleOffset = clipAudioStartSec * cached.sampleRate;
```

#### 2-3 수정: `pasteClip`에서 안전한 duration 계산

```typescript
// pasteClip 내부, 오디오 플레이어 설정 시
const targetChannel = trackChannels.get(targetTrackId);
if (targetChannel && newClip.audio?.cdnUrl) {
    const newPlayer = new Tone.Player().connect(targetChannel);
    newPlayer.load("/test2.mp3").then(() => {
        const exactStartTimeSec = newClip.start * secondsPerBar.value;
        const audioOffsetSec = (newClip.audioStartMs || 0) / 1000;

        // 버퍼 길이를 초과하지 않도록 안전 장치 추가
        const maxDuration = newPlayer.buffer.duration - audioOffsetSec;
        const requestedDuration = newClip.duration * secondsPerBar.value;
        const safeDurationSec = Math.min(requestedDuration, maxDuration);

        if (safeDurationSec > 0) {
            newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, safeDurationSec);
        }
        clipPlayers.set(newClip.clipId, newPlayer);
    });
}
```

---

## 관련 파일 요약

| 파일 | 관련 버그 | 핵심 문제 |
|------|-----------|-----------|
| `useTrackStore.ts` — `splitClip` | 버그 1, 2 | Transport 이중 pause/start, `.then()` 비동기 타이밍 |
| `useTrackStore.ts` — `resyncClip` | 버그 1 | `isPlaying` 기반 자체 pause/start가 splitClip과 충돌 |
| `useTrackStore.ts` — `pasteClip` | 버그 2 | duration 안전 검증 누락, `audioStartMs` 초과 가능 |
| `WaveformWebGL.vue` | 버그 2 | `transferControlToOffscreen()` 1회성 제약, `startSampleOffset` 범위 초과 |
| `waveform.worker.ts` | 버그 2 | `start >= channelData.length`일 때 무조건 break (조용한 실패) |
| `TrackItem.vue` | 버그 2 | WaveformWebGL `:key`가 `clipId`만 사용 → 속성 변경 시 재마운트 안 됨 |

---

## 우선순위 정리

| 순위 | 수정 사항 | 난이도 | 효과 |
|------|-----------|--------|------|
| 1 | `splitClip` 내 `.load()` → `await` 전환 + Transport 제어 일원화 | 중 | 버그 1 해결 |
| 2 | `pasteClip`에 `safeDurationSec` 안전 계산 추가 | 하 | 버그 2 부분 해결 |
| 3 | `WaveformWebGL`의 `:key`에 `duration`과 `audioStartMs` 포함 | 하 | 버그 2 해결 |
| 4 | `renderWaveform`에 `audioStartMs` 범위 검증 추가 | 하 | 버그 2 방어 |
