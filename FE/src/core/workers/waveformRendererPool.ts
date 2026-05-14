/**
 * 파형 렌더러 Worker Pool — 싱글톤
 *
 * 목적: 브라우저의 OffscreenCanvas(또는 WebGL 컨텍스트) 개수 제한(8~16개)을 회피하고,
 * Worker를 매번 생성/파괴하지 않아 메모리 누수를 차단합니다.
 *
 * 동작 원리:
 *   1. Worker를 최대 MAX_WORKERS(4)개만 생성하고, 각각 내부에 OffscreenCanvas 1개를 소유합니다.
 *   2. 컴포넌트가 렌더 요청을 보내면 큐에 넣고, 유휴 Worker에 배정합니다.
 *   3. Worker는 그린 결과를 ImageBitmap으로 반환 → 컴포넌트가 일반 canvas에 drawImage()로 표시합니다.
 *   4. Worker 재사용으로 인해 OffscreenCanvas 수가 항상 4개 이하로 고정됩니다.
 */

import WaveformWorker from './waveform.worker.ts?worker';

// 렌더 요청 데이터 타입
export interface WaveformRenderRequest {
  audioKey: string;
  color: string;
  width: number;
  height: number;
  samplesPerPixel: number;
  startSampleOffset: number;
  channelIndex: number;
}

// 렌더 결과 타입
export interface WaveformRenderResult {
  bitmap: ImageBitmap;
}

// 내부 큐 항목
interface QueueItem {
  request: WaveformRenderRequest;
  requestId: number;
  resolve: (result: WaveformRenderResult | null) => void;
}

// Worker 래퍼
interface PooledWorker {
  worker: Worker;
  busy: boolean;
  currentRequestId: number | null;
}

const MAX_WORKERS = 4;

class WaveformRendererPool {
  private workers: PooledWorker[] = [];
  private queue: QueueItem[] = [];
  private nextRequestId = 0;
  private initialized = false;

  /**
   * Pool 초기화 — 최초 호출 시에만 Worker를 생성합니다.
   */
  private ensureInitialized() {
    if (this.initialized) return;
    this.initialized = true;

    for (let i = 0; i < MAX_WORKERS; i++) {
      const worker = new WaveformWorker();

      // 각 Worker에 초기화 메시지를 보내 내부 OffscreenCanvas를 생성하도록 지시
      worker.postMessage({ type: 'init' });

      const pooledWorker: PooledWorker = {
        worker,
        busy: false,
        currentRequestId: null,
      };

      // Worker가 결과를 반환했을 때의 콜백
      worker.onmessage = (e: MessageEvent) => {
        const { bitmap, requestId } = e.data;
        pooledWorker.busy = false;
        pooledWorker.currentRequestId = null;

        // 결과를 기다리고 있는 resolve 호출은 requestRender에서 직접 처리
        // → onmessage에서는 _pendingResolves에서 찾아 호출
        const pendingResolve = this._pendingResolves.get(requestId);
        if (pendingResolve) {
          this._pendingResolves.delete(requestId);
          if (bitmap) {
            pendingResolve({ bitmap });
          } else {
            pendingResolve(null);
          }
        }

        // 큐에 대기 중인 다음 작업 처리
        this.processQueue();
      };

      this.workers.push(pooledWorker);
    }
  }

  // requestId → resolve 매핑 (Worker onmessage에서 올바른 Promise를 찾기 위함)
  private _pendingResolves = new Map<number, (result: WaveformRenderResult | null) => void>();

  /**
   * 오디오 데이터 전체를 워커 풀의 모든 워커에게 한 번 전송하여 캐싱합니다.
   * 메인 스레드 블로킹을 막는 Zero-Copy 렌더링을 위한 핵심입니다.
   */
  broadcastCacheAudio(audioKey: string, channels: Float32Array[]) {
    this.ensureInitialized();
    for (const pw of this.workers) {
      pw.worker.postMessage({
        type: 'cache',
        audioKey,
        channels,
      });
    }
  }

  /**
   * 파형 렌더링을 요청합니다.
   * @returns Promise<WaveformRenderResult | null> — ImageBitmap을 담은 결과 또는 null(취소됨)
   */
  requestRender(request: WaveformRenderRequest): { promise: Promise<WaveformRenderResult | null>; requestId: number } {
    this.ensureInitialized();

    const requestId = this.nextRequestId++;

    const promise = new Promise<WaveformRenderResult | null>((resolve) => {
      this.queue.push({ request, requestId, resolve });
      this.processQueue();
    });

    return { promise, requestId };
  }

  /**
   * 특정 요청을 취소합니다. 큐에서 제거하거나, 이미 실행 중이면 결과를 무시합니다.
   */
  cancelRequest(requestId: number) {
    // 큐에서 제거
    const queueIndex = this.queue.findIndex((item) => item.requestId === requestId);
    if (queueIndex !== -1) {
      const removed = this.queue.splice(queueIndex, 1)[0];
      removed.resolve(null);
      return;
    }

    // 이미 실행 중이라면 pending resolve를 제거하여 결과를 무시
    if (this._pendingResolves.has(requestId)) {
      this._pendingResolves.delete(requestId);
    }
  }

  /**
   * 큐에서 다음 작업을 꺼내 유휴 Worker에 배정합니다.
   */
  private processQueue() {
    while (this.queue.length > 0) {
      const idleWorker = this.workers.find((w) => !w.busy);
      if (!idleWorker) break; // 모든 Worker가 바쁨 → 대기

      const item = this.queue.shift()!;
      idleWorker.busy = true;
      idleWorker.currentRequestId = item.requestId;

      // resolve를 보관해 두고, Worker onmessage에서 호출
      this._pendingResolves.set(item.requestId, item.resolve);

      // [최적화 핵심] 메인 스레드 블로킹 원천 차단
      // 기존처럼 Float32Array.slice()를 호출해 동기적으로 메모리를 할당/복사하지 않습니다.
      // 렌더링 시에는 워커 내부에 캐시된 데이터에 대한 접근 좌표(Offset)만 JSON으로 전송합니다.
      idleWorker.worker.postMessage({
        type: 'render',
        requestId: item.requestId,
        audioKey: item.request.audioKey,
        color: item.request.color,
        width: item.request.width,
        height: item.request.height,
        samplesPerPixel: item.request.samplesPerPixel,
        startSampleOffset: item.request.startSampleOffset,
        channelIndex: item.request.channelIndex,
      });
    }
  }

  /**
   * 전체 Pool 해제 (페이지 언마운트 시 호출)
   */
  dispose() {
    for (const pw of this.workers) {
      pw.worker.terminate();
    }
    this.workers = [];
    this.queue = [];
    this._pendingResolves.clear();
    this.initialized = false;
  }
}

// 싱글톤 인스턴스 내보내기
export const waveformRendererPool = new WaveformRendererPool();
