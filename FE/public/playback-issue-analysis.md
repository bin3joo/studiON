# 🔍 재생 기능 오류 분석 보고서

> **작성일:** 2026-05-04  
> **분석 대상:** FE/src/pages/Project 내 오디오 재생 관련 코드  
> **Tone.js 버전:** 15.1.22  
> **현상:** 스페이스바 또는 재생 버튼을 눌러도 실제 오디오가 재생되지 않고, 재생바(Playhead)가 이동하지 않음

---

## 📋 현상 요약

| 항목 | 상태 |
|------|------|
| 스페이스바 키 입력 감지 | ✅ 정상 |
| 재생 버튼 클릭 감지 | ✅ 정상 |
| `togglePlay()` 함수 호출 | ✅ 정상 |
| `Tone.start()` 호출 | ✅ 정상 |
| `AudioContext.state` | ✅ `running` |
| `Transport.start()` 호출 | ✅ 정상 (에러 없음) |
| `Transport.seconds` 값 진행 | ❌ **0.0000초에 머물러 있음** |
| 재생바 UI 이동 | ❌ **위치 변화 없음** |
| 오디오 출력(소리) | ❌ **무음** |

---

## 🧪 테스트 결과 상세

### 콘솔 로그 관찰

재생 버튼 클릭 후 콘솔에 아래 로그가 순차적으로 출력됩니다:

```
====================================
⌨️ [입력 감지] 스페이스바가 눌렸습니다!
⌨️ [스토어 호출 전] trackStore.togglePlay() 실행 준비...
⌨️ [스토어 호출 끝] 함수 실행이 넘어갔습니다.
▶️ [1단계] togglePlay 함수 진입 완료!
▶️ [2단계] 오디오 엔진 기상 완료! 현재 상태: running
▶️ [3단계] 재생 로직 시작!
▶️ [4단계] 시스템 현재 시간: X.XXX. Transport 시작 명령!
🔄 [루프 확인 1/5] Transport 초: 0.0000, 재생바 마디: 0.0000
🔄 [루프 확인 2/5] Transport 초: 0.0000, 재생바 마디: 0.0000
🔄 [루프 확인 3/5] Transport 초: 0.0000, 재생바 마디: 0.0000
🔄 [루프 확인 4/5] Transport 초: 0.0000, 재생바 마디: 0.0000
🔄 [루프 확인 5/5] Transport 초: 0.0000, 재생바 마디: 0.0000
```

> **핵심 관찰**: `AudioContext.state`는 `running`이지만, `Transport.seconds`가 0에서 전혀 진행되지 않습니다.

---

## 🔎 발견된 문제점 (총 5건)

### 🐛 문제 1 (핵심): `Tone.now()` 값을 Transport.start()에 직접 전달하는 문제

**파일:** `useTrackStore.ts` — 757번째 줄

```typescript
const now = Tone.now();
Tone.getTransport().start(now + 0.05);
```

**문제 상세:**  
`Tone.getTransport().start(time)` 메서드의 `time` 파라미터는 **절대적인 AudioContext 시계 시간**입니다. `Tone.now()`는 현재 AudioContext 시간을 반환하지만, **AudioContext가 방금 `resume()`된 직후에는 내부 시계가 아직 완전히 안정화되지 않을 수 있습니다.**

Tone.js v15에서 Transport 내부 구현을 보면, `start(time)` 호출 시:
```javascript
// Transport.js 278~288행
start(time, offset) {
    this.context.resume();
    let offsetTicks;
    if (isDefined(offset)) {
        offsetTicks = this.toTicks(offset);
    }
    this._clock.start(time, offsetTicks);
    return this;
}
```

내부 Clock이 정밀 시간 기반으로 스케줄링되기 때문에, `AudioContext.resume()` 직후 바로 `now + 0.05`를 전달하면 **이미 지나간 시간이거나 Clock이 아직 갱신되지 않은 시간**으로 인식되어 시계가 흐르지 않을 수 있습니다.

**기존에 동작했을 때 차이점 추정:**  
- 이전에는 `Tone.start()` → 사용자 상호작용 → `Transport.start("+0.05")` (상대 시간 문자열) 방식이었을 가능성
- Tone.js 업데이트 또는 브라우저 업데이트로 인해 시간 해석 방식이 미묘하게 바뀜

---

### 🐛 문제 2: `AudioContext` 잠금 해제 이벤트 리스너 제거 불일치

**파일:** `ProjectPage.vue` — 225~226행 vs 431~432행

**등록 시 (`onMounted`):**
```typescript
window.addEventListener('pointerdown', unlockAudioEngine, {capture: true});
window.addEventListener('keydown', unlockAudioEngine, {capture: true});
```

**해제 시 (`unlockAudioEngine` 내부):**
```typescript
window.removeEventListener('pointerdown', unlockAudioEngine);
window.removeEventListener('keydown', unlockAudioEngine);
```

**문제 상세:**  
`addEventListener`와 `removeEventListener`는 **`capture` 플래그가 일치해야** 동일한 리스너로 인식합니다. 등록 시에는 `{capture: true}`를 전달했지만, 해제 시에는 이 옵션을 누락하여 **리스너가 실제로 제거되지 않습니다.**

이로 인해:
1. `unlockAudioEngine`이 매 클릭/키보드 이벤트마다 중복 호출됨
2. 매번 `Tone.start()`가 불필요하게 호출됨
3. 이것이 `Transport`의 내부 Clock 상태에 간섭할 가능성 있음

---

### 🐛 문제 3: `WaveformWebGL.vue`에서 별도 AudioContext 생성

**파일:** `WaveformWebGL.vue` — 41~51행

```typescript
const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
const audioCtx = new AudioContextClass();
const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
// ...
if(audioCtx.state !== 'closed') audioCtx.close();
```

**문제 상세:**  
오디오 파일 디코딩을 위해 매번 새로운 `AudioContext`를 생성하고 있습니다. 브라우저는 동시에 생성 가능한 AudioContext 수에 제한을 두고 있으며(Chrome 기준 약 6개), 이를 초과하면 경고가 발생하고 기존 컨텍스트에 영향을 줄 수 있습니다.

특히:
- `audioCtx.close()`가 비동기적으로 처리되므로, 여러 클립이 동시에 파형을 렌더링하면 다수의 AudioContext가 순간적으로 존재
- Tone.js의 전역 AudioContext와 자원 경쟁 발생 가능
- **이것이 Tone.js의 AudioContext를 `suspended`로 되돌리거나 시간 진행을 방해할 수 있음**

---

### 🐛 문제 4: `togglePlay()`의 async/await 체인에서 발생 가능한 타이밍 문제

**파일:** `useTrackStore.ts` — 726~771행

```typescript
const togglePlay = async () => {
    // ...
    const rawContext = Tone.getContext().rawContext;
    if (rawContext && rawContext.state !== 'running') {
        await rawContext.resume();     // ← await 1
    }
    if (Tone.getContext().state !== 'running') {
        await Tone.start();            // ← await 2
    }
    // ...
    const now = Tone.now();            // ← 이 시점에서의 now 값
    Tone.getTransport().start(now + 0.05);
    isPlaying.value = true;
    updatePlayheadLoop();
};
```

**문제 상세:**  
`togglePlay()`가 `async` 함수이지만, 호출하는 측(`ProjectPage.vue`의 `handleKeyDown`)에서는 `await` 없이 호출합니다:

```typescript
// ProjectPage.vue 77행
trackStore.togglePlay();  // await 없음!
```

`async` 함수 내부에서 `await rawContext.resume()` / `await Tone.start()`가 실행되면, 이후 코드(`Transport.start()`)는 마이크로태스크 큐에서 실행됩니다. 이때:
1. 사용자 제스처(User Gesture) 컨텍스트가 이미 소멸되었을 수 있음
2. 브라우저가 "사용자 상호작용 없이 오디오를 시작하려 한다"고 판단할 수 있음
3. 결과적으로 `Transport.start()`가 호출되어도 내부적으로 시계가 진행되지 않음

---

### 🐛 문제 5: `handlePlay` 함수의 조건 분기 로직

**파일:** `PlayController.vue` — 41~46행

```typescript
const handlePlay = () => {
  if(!trackStore.isPlaying) trackStore.togglePlay();
};
const handlePause = () => {
  if(trackStore.isPlaying) trackStore.togglePlay();
};
```

**문제 자체는 아님** — 하지만 만약 `togglePlay()` 내부에서 `isPlaying = true`로 설정한 후 실제 재생이 시작되기 전에 에러가 발생하면, **상태 불일치**가 발생합니다:
- `isPlaying = true` (UI는 "재생 중"으로 표시)
- 실제 Transport는 시작되지 않음
- 이후 재생 버튼을 다시 눌러도 `isPlaying`이 이미 `true`이므로 `handlePlay()`가 동작하지 않음
- 일시정지 버튼을 눌러야만 `togglePlay()`가 다시 호출되어 상태가 리셋됨

---

## 📊 원인 종합 분석

```
┌─────────────────────────────────────────────────────────┐
│              사용자: 스페이스바 / 재생 버튼 클릭          │
└──────────────────────┬──────────────────────────────────┘
                       │
           ┌───────────▼───────────┐
           │ handleKeyDown 감지 ✅  │
           │ togglePlay() 호출    │
           └───────────┬───────────┘
                       │
           ┌───────────▼───────────┐
           │ await rawContext.resume()  │
           │ await Tone.start()         │  ← 여기서 User Gesture 컨텍스트 소멸 가능
           └───────────┬───────────┘
                       │
           ┌───────────▼────────────────┐
           │ Tone.now() 값 캡처         │
           │ Transport.start(now + 0.05) │  ← 시간 값이 이미 무효할 수 있음
           └───────────┬────────────────┘
                       │
           ┌───────────▼───────────┐
           │ Transport.seconds 확인  │
           │ → 항상 0.0000초        │  ← ❌ 시계가 흐르지 않음
           └───────────┬───────────┘
                       │
           ┌───────────▼───────────┐
           │ updatePlayheadLoop()   │
           │ 0 / secondsPerBar = 0  │  ← 재생바 제자리
           └───────────────────────┘
```

---

## 💡 수정 방향 제안

### 1. Transport.start()에 상대 시간 문자열 사용 (가장 우선)

```typescript
// Before (현재)
const now = Tone.now();
Tone.getTransport().start(now + 0.05);

// After (권장)
Tone.getTransport().start("+0.05");
```

Tone.js는 `"+0.05"` 같은 상대 시간 문자열을 지원하며, 이 경우 내부적으로 현재 시점을 기준으로 정확한 스케줄링을 수행합니다. 절대 시간(`Tone.now()`)을 직접 사용하는 것보다 안정적입니다.

### 2. unlockAudioEngine 이벤트 리스너 제거 시 capture 옵션 일치

```typescript
// Before (현재)
window.removeEventListener('pointerdown', unlockAudioEngine);
window.removeEventListener('keydown', unlockAudioEngine);

// After (권장)
window.removeEventListener('pointerdown', unlockAudioEngine, {capture: true});
window.removeEventListener('keydown', unlockAudioEngine, {capture: true});
```

### 3. WaveformWebGL.vue의 AudioContext를 Tone.js의 Context로 교체

```typescript
// Before (현재) — 매번 새 AudioContext 생성
const audioCtx = new AudioContextClass();
const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

// After (권장) — Tone.js의 기존 AudioContext 재사용
const audioBuffer = await Tone.getContext().rawContext.decodeAudioData(arrayBuffer);
```

### 4. Tone.start()를 사용자 이벤트 핸들러 최상위에서 동기적으로 처리

```typescript
// Before (현재) — async 함수 내부에서 await 후 Transport.start()
const togglePlay = async () => {
    await Tone.start();
    // ... Transport.start() ...
};

// After (권장) — 이벤트 핸들러에서 바로 Tone.start() 호출
const handleKeyDown = async (e: KeyboardEvent) => {
    if (e.code === 'Space') {
        e.preventDefault();
        await Tone.start();           // ← 사용자 제스처 직후 바로 호출
        trackStore.togglePlay();       // ← 나머지 로직
    }
};
```

### 5. isPlaying 상태를 Transport 실제 상태와 동기화

```typescript
// Transport.start() 호출 후 실제 상태를 확인
Tone.getTransport().start("+0.05");

// 약간의 딜레이 후 실제 상태 확인
setTimeout(() => {
    const actualState = Tone.getTransport().state;
    if (actualState !== "started") {
        console.error("Transport 시작 실패! 상태:", actualState);
        isPlaying.value = false;
    }
}, 100);
```

---

## 🗂 관련 파일 목록

| 파일 | 역할 | 관련 문제 |
|------|------|-----------|
| `useTrackStore.ts` | 재생 로직 핵심 (`togglePlay`, `updatePlayheadLoop`) | 문제 1, 4 |
| `ProjectPage.vue` | 키보드 이벤트 및 오디오 잠금 해제 | 문제 2, 4 |
| `PlayController.vue` | 재생/정지 버튼 UI 및 클릭 핸들러 | 문제 5 |
| `WaveformWebGL.vue` | 파형 렌더링 (별도 AudioContext) | 문제 3 |
| `TimelineRuler.vue` | 재생바 드래그 및 클릭 이동 | (직접 관련 없음) |
| `TrackItem.vue` | 클립 드래그/드롭/리사이즈 | (직접 관련 없음) |

---

## 📌 결론

**가장 유력한 원인:** `togglePlay()` 함수 내에서 `await`에 의한 User Gesture 컨텍스트 소멸 + `Tone.now()`를 절대 시간으로 전달하는 방식이 Tone.js v15 + 최신 브라우저 조합에서 Transport의 내부 Clock 시작에 실패하는 것으로 판단됩니다.

**추가 악화 요인:** `WaveformWebGL.vue`의 다중 AudioContext 생성이 전역 오디오 리소스에 간섭할 수 있으며, `unlockAudioEngine` 리스너의 중복 호출이 상태를 불안정하게 만들 수 있습니다.

**즉시 테스트 가능한 수정:**  
`useTrackStore.ts`의 757행에서 `Tone.getTransport().start(now + 0.05)`를 `Tone.getTransport().start("+0.05")`로 변경하면 재생이 복원될 가능성이 높습니다.
