//API�?받아???�이?��? 가공해??보�??�는 창고
//?�이??창고 ?�니??
import { defineStore } from 'pinia';
//?�면??바뀌아???�동?�로 ?�시그리�???반응??
import { ref, computed, watch, nextTick } from 'vue';
//?�랙�??�립???�??
import type { TrackUIState, ClipUIState, TrackEqState, TrackEqBandState, } from '../types';
//?�원 처리�??�한 lib
import * as Tone from 'tone';
import { socketService } from '../../../core/services/socket.service';
import { projectApi } from '../api/project.api'
import type { TrackEqBandSummary } from '../api/project.api'
import axios from 'axios'

//?�이지 ?�디???�용가?�하?�록 useTrackStore�?export 고유 ID??track
export const useTrackStore = defineStore('track', () => {
    // ==========================================
    // 1. ?�태(State) ?�언
    // ==========================================

    //?�디??객체 보�???만들�??�수 ?�바?�크립트 객체 보�??�이�??�문??ref�??�용?��? ?�는??
    //?�원 ?�일???�이?��? 브라?��? 메모리에 ?�려???�?�밍??맞춰 ?�피커로 ?�생
    // [?�심] Tone.Channel?� ?��? Solo?�PanVol ?�드 체인?�서 모노 ?�운믹스가 발생?�여 ?�닝??불�??�합?�다.
    // ?�라??Tone.Volume(볼륨/뮤트 ?�담) + Tone.Panner(?�닝 ?�담)�??�전??분리?�니??
    // ?�호 ?�름: Player ??Tone.Volume ??Tone.Panner ??masterPanner ??Destination
    const trackVolumes = new Map<number, Tone.Volume>();   // ?�랙�?볼륨/뮤트 ?�드
    const trackPanners = new Map<number, Tone.Panner>();   // ?�랙�??�닝 ?�드
    const clipPlayers = new Map<number, Tone.Player>(); //?�립�??�디???�레?�어
    const myLockedClips = new Set<number>(); // ?��? 직접 ?�근(?�집 중인) ?�립 ID 목록
    const pendingDuplicateOriginalClipIds = new Set<number>(); // ?��? 복제???�립???�본 ID 목록 (백엔??강제 ???�제??
    const cutClipsMap = new Map<number, ClipUIState>(); // ?�른 ?�용?��? ?�라?�기 ???�립 ?�시 보�???(붙여?�기 ?�신??

    type TrackEqNode = {
        bandOrder: number
        filter: Tone.Filter
    }

    const trackEqNodes = new Map<number, TrackEqNode[]>()
    const trackAnalyzers = new Map<number, Tone.FFT>()

    const MAX_EQ_BANDS = 5

    const createDefaultTrackEq = (): TrackEqState => ({
        bands: [],
    })

    function mapEqTypeToCode(eqType: TrackEqBandSummary['eqType']) {
        switch (eqType) {
            case 'LOW_SHELF':
                return 2
            case 'HIGH_SHELF':
                return 3
            case 'BELL':
            default:
                return 1
        }
    }

    function mapSourceTypeToCode(sourceType: TrackEqBandSummary['sourceType']) {
        switch (sourceType) {
            case 'SYSTEM':
                return 2
            case 'AI_CONFIRM':
                return 3
            case 'AI_APPLIED':
                return 4
            case 'USER_MANUAL':
            default:
                return 1
        }
    }

    function mapTrackEqBandSummaryToState(band: TrackEqBandSummary): TrackEqBandState {
        return {
            id: band.trackEqBandId,
            bandOrder: band.bandOrder,
            eqTypeCode: mapEqTypeToCode(band.eqType),
            frequencyHz: band.frequencyHz,
            q: band.q,
            gainDeltaDb: band.gainDeltaDb,
            sourceTypeCode: mapSourceTypeToCode(band.sourceType),
            jobId: band.jobId,
            suggestionActionId: band.suggestionActionId,
            appliedSuggestionId: band.appliedSuggestionId,
        }
    }

    // [최적?? ?�역 AudioBuffer 캐시: URL ????번만 fetch+decode ?�여 ?�생�?Tone.Player)?� ?�형(WaveformWebGL) 모두 공유
    // ?? cdnUrl 문자?? �? ?�코???�료??AudioBuffer
    const audioBufferCache = new Map<string, AudioBuffer>();
    // 진행 중인 ?�코??Promise�?보�??�여 ?�시??같�? URL???�러 �??�코?�하??것을 방�?
    const audioBufferPending = new Map<string, Promise<AudioBuffer>>();

    // URL???�??AudioBuffer�???번만 ?�코?�하??캐시???�?�하�?반환?�는 ?�수
    const fetchAndCacheAudioBuffer = async (url: string): Promise<AudioBuffer> => {
        // ?��? 캐시???�으�?즉시 반환
        const cached = audioBufferCache.get(url);
        if (cached) return cached;

        // ?�른 곳에???��? ?�코??중이�?같�? Promise�?공유 (중복 ?�청 방�?)
        const pending = audioBufferPending.get(url);
        if (pending) return pending;

        // 최초 ?�청: fetch ??decode ??캐시 ?�??
        const promise = (async () => {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioCtx = Tone.getContext().rawContext as AudioContext;
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

            // [최적?? Web Audio API 버퍼 ?�당 병목(JIT Compile Freeze) ?�전 ?�거
            // 거�???AudioBuffer가 처음 ?�당????브라?��?가 멈추???�상??막기 ?�해
            // ?�디???�운로드 직후 백그?�운?�에????�?�??�생??강제?�여 캐싱???�도?�니??
            try {
                const warmupSource = audioCtx.createBufferSource();
                warmupSource.buffer = audioBuffer;
                const dummyGain = audioCtx.createGain();
                dummyGain.gain.value = 0; // 무음 처리
                warmupSource.connect(dummyGain);
                dummyGain.connect(audioCtx.destination);

                warmupSource.start(0, 0, 0.001);

                // ?�업 ?�드가 JIT 컴파?�을 충분???�료?????�도�?메모�??�제�???��?�다
                setTimeout(() => {
                    try {
                        warmupSource.disconnect();
                        dummyGain.disconnect();
                    } catch (e) { /* ignore */ }
                }, 5000);
            } catch (e) {
                // 무시
            }

            audioBufferCache.set(url, audioBuffer);
            audioBufferPending.delete(url);
            return audioBuffer;
        })();

        audioBufferPending.set(url, promise);
        return promise;
    };

    // ?��?(WaveformWebGL ???�서 캐시???�근?????�도�?getter ?�수 ?�공
    const getAudioBufferCache = () => audioBufferCache;

    // ?�생�??�동 ?�크롤용 ?�?�라??컨테?�너 DOM 참조 (ProjectPage?�서 ?�달받음)
    let timelineContainer: HTMLElement | null = null;
    let cachedScrollLeft = 0;
    let cachedClientWidth = 0;

    const isAutoScrollActive = ref(true); // ?�동 ?�크�????�동 ?�크�??�시 ?��???
    const workspaceZoom = ref(0.75); // ?�?�라???�크?�페?�스 배율 (기본 90%)

    const setTimelineContainer = (el: HTMLElement | null) => {
        if (timelineContainer) {
            timelineContainer.removeEventListener('scroll', handleScroll);
        }
        timelineContainer = el;
        if (el) {
            cachedScrollLeft = el.scrollLeft;
            cachedClientWidth = el.clientWidth;
            el.addEventListener('scroll', handleScroll, { passive: true });
        }
    };

    const handleScroll = () => {
        // [최적?? ?�생 중이?�라???�동 ?�크롤이 비활?�화(?�용???�동 조작) ?�태�??�크롤을 ?�기?�합?�다.
        if (timelineContainer && (!isPlaying.value || !isAutoScrollActive.value)) {
            cachedScrollLeft = timelineContainer.scrollLeft;
        }
    };

    // [Tone.js 버그 ?�스]
    // Tone.js??Player.sync()??Transport???�해 중간 지?�에???�생???�작(Seek)????
    // playbackRate�?고려?��? ?�고 ?�프?�을 계산?�는 버그가 ?�습?�다.
    // ?��? ?�결?�기 ?�해 _start ?��? 메서?��? 몽키?�칭?�여 ?�프?�과 ?��? ?�생 ?�간??보정?�니??
    const patchTonePlayerForSync = (player: any) => {
        if (player._isPatchedForSync) return;
        player._isPatchedForSync = true;
        const origStart = player._start.bind(player);

        player._start = function (startTime: number, passedOffset: number, passedDuration?: number) {
            const originalOffset = this.customOriginalOffset || 0;
            const startOffsetTransport = passedOffset - originalOffset;

            let correctedOffset = passedOffset;
            let correctedDuration = passedDuration;

            // playbackRate가 Tone.Param 객체?????�으므�?값을 ?�전?�게 추출
            const actualRate = (this.playbackRate && typeof this.playbackRate === 'object' && 'value' in this.playbackRate)
                ? (this.playbackRate as any).value
                : this.playbackRate;

            // startOffsetTransport가 0보다 ?�다??것�? 처음부?��? ?�니??중간부??Seek) ?�작?�다???��?
            if (startOffsetTransport > 0.001 && actualRate !== 1) {
                // Transport???�동 ?�간만큼 ?�디??버퍼??진행?�어???��?�?playbackRate�?곱해줍니??
                correctedOffset = originalOffset + (startOffsetTransport * actualRate);
                if (passedDuration !== undefined) {
                    const originalDuration = this.customSourceAudioSec || passedDuration;
                    correctedDuration = originalDuration - (startOffsetTransport * actualRate);
                }
            }

            origStart(startTime, correctedOffset, correctedDuration !== undefined ? Math.max(0, correctedDuration) : undefined);
        };
    };

    //[1-1] 백엔???�동 ?�이??
    const trackList = ref<TrackUIState[]>([]); //?�랙?�을 ?�을 배열
    //<trackUIstate[]>�?UI???�랙?�이?�만 ?�어?�수 ?�음???�언 ref?��?�?추�? ??��???�면??반응??

    const projectInfo = ref({ //?�로?�트???�반?�인 ?�보�??��? 객체 
        projectId: 0,
        name: '?�로?�트',
        tempo: 120.0,
        rootNote: 'C',
        mode: 'major',
        timeSigNumerator: 4,
        timeSigDenominator: 4,
        totalBarCount: 32
    });

    const projectMembers = ref<{ userId: number; nickname: string; profileImageUrl: string | null; }[]>([]);
    const currentTotalSizeBytes = ref<number>(0);

    //[1-2] ?�?�라??UI ?�용 ?�태 (?�론?�에???�면 그릴 ?�만 ?�는 변?�들)
    const isPlaying = ref(false); //?�생중인지 ?�닌지
    const manualLatencyOffset = ref(0.15); // ?�용???�동 ?�이?�시 보정�?(�??�위, ?? 0.1 = 100ms 추�? 지??

    //?�로?�트 BPM ?�정 �?Tone.js ?�기??
    const bpm = ref(120);
    Tone.getTransport().bpm.value = 120; // Transport ?��? ?�계????�� 고정 (playbackRate�??�도 조절)
    // 메인 ?�레??블로?????�벤???�킵 방�?�??�한 ?��?줄링 ?�유?�간 ?�향 조정
    Tone.getContext().lookAhead = 0.2;
    // transport??�?그라?�드???�디???�계 ??��???? ?�기 tempo�?조정?�면 ?�체 ?�의 빠르기�? 바�?

    // 마스???�랙??믹서 채널 ?�성 (모노 ?�운믹스 ?��? 방�?: 강제 ?�테?�오)
    const masterPanner = new Tone.Panner(0).toDestination();
    const masterVolume = new Tone.Volume(0).connect(masterPanner);

    // ?�테?�오 보존???�한 강력??Web Audio API ?�션 ?�용
    masterVolume.channelCount = 2;
    masterVolume.channelCountMode = "explicit";
    masterPanner.channelCount = 2;
    masterPanner.channelCountMode = "explicit";

    //bpm??변경될?�마???�체 ?�립???�스케줄링 (Transport BPM?� 고정, playbackRate만으�??�도 ?�어)
    watch(bpm, (newBpm) => {
        // Transport BPM?� 변경하지 ?�음 ??playbackRate?� ?�중 ?�용?�어 ?�생 길이가 ?�긋?�는 것을 방�?

        // BPM??바뀌면 secondsPerBar가 바뀌�?�?모든 ?�립???�생 ?��?줄을 ??기�??�로 ?�등�?
        // ?�생 중이�??�시?��? ???�스케�????�동 ?�개?�여 ?�?�밍 꼬임 방�?
        const wasPlaying = isPlaying.value;
        if (wasPlaying) {
            Tone.getTransport().pause();
        }

        // ?�재 ?�생 ?�치(마디)�?보존?�여 ?�스케�???같�? 마디?�서 ?�개
        // Tone.getTransport().seconds???�날 BPM 기�????�간?�고 secondsPerBar????BPM 기�??��?�?
        // ?��? ?�누�??�치가 ?�곡?? ?�???��? ?�확??마디�?가리키??playheadPosition.value�??�용??
        const currentBar = playheadPosition.value;

        resyncAllClips();

        // 메트로놈??켜져 ?�으�???BPM 간격?�로 ?�시??
        if (isMetronomeActive.value) {
            applyMetronomeState(true);
        }

        if (wasPlaying) {
            const newOffsetTime = currentBar * secondsPerBar.value;
            Tone.getTransport().start("+0.05", newOffsetTime);
        }
    })

    // ==========================================
    // BPM (Tempo) 변�?
    // ==========================================
    const changeBpm = (newBpm: number) => {
        // ?�효??검??(PlayController??로직�??�일)
        if (isNaN(newBpm) || newBpm < 30 || newBpm > 300) return;

        // 로컬 값과 같으�?무시
        if (bpm.value === newBpm) return;

        // 로컬 즉시 ?�용 (Optimistic UI)
        // bpm.value가 변경되�??�의 watch(bpm)가 ?�리거되???�동?�로 ?�립???�스케줄링?�니??
        bpm.value = newBpm;
        projectInfo.value.tempo = newBpm;

        // 백엔?�에 BPM 변�??�청 ?�송 ??브로?�캐?�트�??�른 ?�용?�에�??�파
        socketService.publish('PROJECT_BPM', {
            projectId: projectInfo.value.projectId,
            tempo: newBpm
        });
    };

    // ==========================================
    // ??Key) 변�?
    // ==========================================
    // UI(문자?? -> 백엔??Enum)
    const rootNoteToEnum: Record<string, string> = {
        "C": "C",
        "Db": "C_SHARP",
        "D": "D",
        "Eb": "E_FLAT",
        "E": "E",
        "F": "F",
        "F#": "F_SHARP",
        "G": "G",
        "Ab": "A_FLAT",
        "A": "A",
        "Bb": "B_FLAT",
        "B": "B"
    };

    // 백엔??Enum) -> UI(문자??
    const enumToRootNote: Record<string, string> = {
        "C": "C",
        "C_SHARP": "Db",
        "D": "D",
        "E_FLAT": "Eb",
        "E": "E",
        "F": "F",
        "F_SHARP": "F#",
        "G": "G",
        "A_FLAT": "Ab",
        "A": "A",
        "B_FLAT": "Bb",
        "B": "B"
    };

    // 반음 ?�덱??매핑 (C=0 ~ B=11)
    const NOTE_TO_SEMITONE: Record<string, number> = {
        "C": 0, "Db": 1, "D": 2, "Eb": 3,
        "E": 4, "F": 5, "F#": 6, "G": 7,
        "Ab": 8, "A": 9, "Bb": 10, "B": 11
    };

    // ?????�이??최단 반음 차이 계산 (?? C?�D = +2, C?�A = -3)
    const getSemitoneDiff = (fromNote: string, toNote: string): number => {
        const from = NOTE_TO_SEMITONE[fromNote] ?? 0;
        const to = NOTE_TO_SEMITONE[toNote] ?? 0;
        let diff = to - from;
        if (diff > 6) diff -= 12;
        if (diff < -6) diff += 12;
        return diff;
    };

    const changeKey = (rootNote: string, mode: string) => {
        const oldNote = projectInfo.value.rootNote;
        if (oldNote === rootNote && projectInfo.value.mode === mode) return;

        // 로컬 즉시 ?�용 (Optimistic UI)
        projectInfo.value.rootNote = rootNote;
        projectInfo.value.mode = mode;

        // 백엔?�로 보낼 ?�는 Enum 규격??맞춰??변??
        const rootNoteEnum = rootNoteToEnum[rootNote] || rootNote;

        socketService.publish('PROJECT_KEY', {
            projectId: projectInfo.value.projectId,
            rootNote: rootNoteEnum,
            mode
        });
    };

    // ==========================================
    // 박자(Time Signature) 변�?
    // ==========================================
    // ?�용?�는 박자 조합 (10가지)
    const ALLOWED_TIME_SIGNATURES: [number, number][] = [
        [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4],
        [3, 8], [6, 8], [9, 8], [12, 8]
    ];

    // 박자 변�????��? ?�용 로직 (로컬 즉시 ?�용 + ?�격 브로?�캐?�트 ?�신 공용)
    // DAW ?��?: ?�립??마디 ?�치(?�자)??그�?�??��?, secondsPerBar�?바�?
    const applyTimeSignatureChange = (newNumerator: number, newDenominator: number) => {
        const oldNumerator = projectInfo.value.timeSigNumerator;
        const oldDenominator = projectInfo.value.timeSigDenominator;

        // ?��? 같�? 값이�?무시 (브로?�캐?�트 ?�기 ?�신 차단)
        if (oldNumerator === newNumerator && oldDenominator === newDenominator) return;

        // ?�생 중이�??�시?��?
        const wasPlaying = isPlaying.value;
        if (wasPlaying) {
            Tone.getTransport().pause();
        }

        // projectInfo 갱신 ??secondsPerBar computed ?�동 ?�계??
        projectInfo.value.timeSigNumerator = newNumerator;
        projectInfo.value.timeSigDenominator = newDenominator;

        // ?�립??마디 ?�치(start, duration)??그�?�??��?
        // secondsPerBar가 바뀌었?��?�??�디???��?줄만 ?�등�?
        resyncAllClips();

        // 메트로놈 ?�시??(박자 ?�턴??바뀌었?��?�?
        if (isMetronomeActive.value) {
            applyMetronomeState(true);
        }

        // ?�생 중이?�으�??�재 ?�생�??�치?�서 ?�개
        if (wasPlaying) {
            const newOffsetTime = playheadPosition.value * secondsPerBar.value;
            Tone.getTransport().start("+0.05", newOffsetTime);
        }
    };

    // ?�용???�션: 박자 변�??�청 (UI ???�켓 발행)
    const changeTimeSignature = (numerator: number, denominator: number) => {
        // ?�용 조합 검�?
        const isAllowed = ALLOWED_TIME_SIGNATURES.some(
            ([n, d]) => n === numerator && d === denominator
        );
        if (!isAllowed) return;

        // 로컬 즉시 ?�용 (Optimistic UI)
        applyTimeSignatureChange(numerator, denominator);

        // 백엔?�에 박자 변�??�청 ?�송 ??브로?�캐?�트�??�른 ?�용?�에�??�파
        socketService.publish('PROJECT_TIME_SIGNATURE', {
            projectId: projectInfo.value.projectId,
            timeSigNumerator: numerator,
            timeSigDenominator: denominator
        });
    };


    type SelectedTarget =
        | { type: 'TRACK'; trackId: number }
        | { type: 'MASTER' }
        | null
    const selectedTarget = ref<SelectedTarget>(null)
    // ?�재 ?�택???�립�??�당 ?�랙 ID
    const selectedClip = ref<ClipUIState | null>(null);
    const selectedTrackId = ref<number | null>(null);


    function selectMasterTrack() {
        if (selectedClip.value) {
            selectedClip.value.isSelected = false
            selectedClip.value = null
        }

        selectedTrackId.value = null
        selectedTarget.value = {
            type: 'MASTER',
        }

        trackList.value.forEach(t => {
            t.isSelected = false
        })

        masterTrack.value.isSelected = true
    }

    // ?�립 ?�택 ?�수
    const selectClip = (clip: ClipUIState, trackId: number) => {
        if (selectedClip.value) {
            selectedClip.value.isSelected = false
        }

        clip.isSelected = true
        selectedClip.value = clip
        selectedTrackId.value = trackId
        selectedTarget.value = {
            type: 'TRACK',
            trackId,
        }

        trackList.value.forEach(t => {
            t.isSelected = false
        })

        masterTrack.value.isSelected = false
    }

    // ?�랙 ?�택 ?�수 (?�립 ?�택?� ?�제??
    const selectTrack = (trackId: number) => {
        if (trackId === 999999) {
            selectMasterTrack()
            return
        }

        if (selectedClip.value) {
            selectedClip.value.isSelected = false
            selectedClip.value = null
        }

        selectedTrackId.value = trackId
        selectedTarget.value = {
            type: 'TRACK',
            trackId,
        }

        trackList.value.forEach(t => {
            t.isSelected = t.trackId === trackId
        })

        masterTrack.value.isSelected = false
    }

    //  �?공간 ?�릭 ???�택 ?�제 ?�수
    const deselectAll = () => {
        if (selectedClip.value) selectedClip.value.isSelected = false

        selectedClip.value = null
        selectedTrackId.value = null
        selectedTarget.value = null

        trackList.value.forEach(t => {
            t.isSelected = false
        })

        masterTrack.value.isSelected = false
    }
    //1마디??걸리???�간 계산 (박자??분모�?반영?�여 6/8박자 ?�에?�도 ?�확??마디 길이 보장)
    const secondsPerBar = computed(() => (projectInfo.value.timeSigNumerator * (4 / (projectInfo.value.timeSigDenominator || 4)) * 60) / bpm.value);

    // ==========================================
    // 구간 반복 (Loop)
    // ==========================================
    const isLoopActive = ref(false);
    const loopStartBar = ref(0);
    const loopEndBar = ref(4);

    watch([isLoopActive, loopStartBar, loopEndBar, bpm], () => {
        if (isLoopActive.value) {
            Tone.getTransport().setLoopPoints(
                loopStartBar.value * secondsPerBar.value,
                loopEndBar.value * secondsPerBar.value
            );
            Tone.getTransport().loop = true;
        } else {
            Tone.getTransport().loop = false;
        }
    });

    // ==========================================
    // 메트로놈 (Metronome / Click Track)
    // ==========================================
    const isMetronomeActive = ref(false);
    let clickSynth: Tone.Synth | null = null;
    let metronomeEventId: number | null = null;

    const applyMetronomeState = (active: boolean) => {
        // 기존 메트로놈 비활?�화 ???��?줄링 ?�제 (?�중 ?��?�?방�?)
        if (metronomeEventId !== null) {
            Tone.getTransport().clear(metronomeEventId);
            metronomeEventId = null;
        }

        if (active) {
            // Synth가 ?�으�??�성 ??toDestination()?�로 마스??볼륨 무�??�게 ??�� 출력
            if (!clickSynth) {
                clickSynth = new Tone.Synth({
                    oscillator: { type: "square" },
                    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 }
                }).toDestination();
            }

            const denom = projectInfo.value.timeSigDenominator || 4;
            const numerator = projectInfo.value.timeSigNumerator || 4;
            // Transport BPM??고정?��?�? 메트로놈 간격??�??�위�?직접 계산?�니??
            const beatIntervalSec = (denom === 8) ? (60 / bpm.value / 2) : (60 / bpm.value);

            metronomeEventId = Tone.getTransport().scheduleRepeat((time) => {
                // time?� AudioContext???�드?�어 ?�간?�고, Transport ?��? ?�간?� 별도�?계산?�야 ?�니??
                // ?�드?�어 ?�약 ?�간(time)�??�재 ?�간(Tone.now())??차이(Lookahead)�?Transport.seconds???�해 ?�확???�약 ?�점(�???구합?�다.
                const transportTimeSec = Tone.getTransport().seconds + Math.max(0, time - Tone.now());

                // ?�재 ?�생 ?�치가 �?번째 박자?��? 계산 (반올�?처리�??��?줄링 ?�차 보정)
                const absoluteBeat = Math.round(transportTimeSec / beatIntervalSec);
                const currentBeat = absoluteBeat % numerator;

                // �?박자??'??C6)', ?�머지??'??C5)' ?�리
                const note = currentBeat === 0 ? "C6" : "C5";
                clickSynth!.triggerAttackRelease(note, "64n", time, 0.5);
            }, beatIntervalSec, 0);
        }
    };

    watch(isMetronomeActive, applyMetronomeState);

    let animationFrameId = 0; //requestAnimationFrame ?�행 ID (취소�??�해 ?�요)
    const playheadPosition = ref(0); //?�재 ?�생 ?�치(마디 ?�위)
    const zoomlevel = ref(1) //가�??��?/축소 배율 (기본 1�?

    // ==========================================
    // 가�?가???�크�?(?�평 뷰포?? ?�태
    // ==========================================
    const viewportLeft = ref(0);
    const viewportRight = ref(2000); // 초기 ?�더링을 ?�해 기본�??�공

    //복사/?�라?�기 ???�립 ?�이?��? 보�????�립보드
    const clipboardClip = ref<ClipUIState | null>(null);
    const clipboardTrackId = ref<number | null>(null);
    const isCutAction = ref(false);
    const uploadingTrackId = ref<number | null>(null);
    const uploadingBar = ref<number | null>(null); //?�재 보�????�이?��? '?�라?�기'�??�어?�는지 ?��?

    // ?�토???��???변?��? ?��? ?�수 ?�언
    const isCommentMode = ref(false);
    const toggleCommentMode = () => {
        isCommentMode.value = !isCommentMode.value;
    };

    interface HistoryCommand {
        undo: () => void;
        redo: () => void;
    }
    const undoStack = ref<HistoryCommand[]>([]);
    const redoStack = ref<HistoryCommand[]>([]);
    const MAX_HISTORY = 30;

    const pushCommand = (cmd: HistoryCommand) => {
        undoStack.value.push(cmd);
        if (undoStack.value.length > MAX_HISTORY) {
            undoStack.value.shift();
        }
        redoStack.value = [];
    };

    // ==========================================
    // 2. 계산???�태(Getters) - ?�?�라???��? 계산�?
    // ==========================================

    //1마디???��? ?�비 (기본 120px * �?배율)
    //?�면?�서 ?�립 길이???�생�??�치�?px�?바�????�용
    const pixelPerBar = computed(() => 120 * zoomlevel.value);

    // ?�면 ?�비(최�? 4000px 기�?)�?채우�??�해 ?�요??최소 마디 ??계산
    const displayBarCount = computed(() => {
        const minRequiredBars = Math.ceil(4000 / pixelPerBar.value);
        return Math.max(projectInfo.value.totalBarCount, minRequiredBars);
    });

    //?�체 ?�?�라?�의 가�??��? 길이(?�면???�시??마디 ??* 1마디 ?��?)
    const totalTimelineWidth = computed(() => displayBarCount.value * pixelPerBar.value);

    //?�크�?축소 ?�때 ?�자�??�시??마디 간격 계산 (1,4,8)
    const barNumberStep = computed(() => {
        if (zoomlevel.value <= 0.15) return 32; // 매우 많이 축소?�때 1, 33, 65 ... (100마디 보기 ?�??
        if (zoomlevel.value <= 0.3) return 16;  // ??축소?�때 1, 17, 33 ...
        if (zoomlevel.value <= 0.5) return 8;   // 많이 축소?�때 1, 9, 17 ...
        if (zoomlevel.value < 1.0) return 4; //?�간 축소?�때 1, 5, 9 ...
        return 1; //기본 1칸씩
    })

    // ?�크�??��? ??1마디�?�?칸으�?쪼갤 것인가 (박자???�라 ?�적 계산)
    // ?? 4/4 ??4,8,16  |  3/4 ??3,6,12  |  6/8 ??6,12,24
    const subDivision = computed(() => {
        const numerator = projectInfo.value.timeSigNumerator || 4;
        if (zoomlevel.value >= 2.5) return numerator * 4; // ?�주 많이 ?��?: 16분음?�급 ?��? 분할
        if (zoomlevel.value >= 1.5) return numerator * 2; // 많이 ?��?: 8분음?�급 분할
        if (zoomlevel.value >= 1.0) return numerator;     // 기본: 비트(박자 분자) ?�위 분할
        return 1; // 축소 ??분할 ?�음
    })

    // ?�?�라???�동 ?�장 ?�퍼 ?�수
    const checkAndExpandTimeline = (endBar: number) => {
        const currentTotalBars = projectInfo.value.totalBarCount;
        // ?�립???��?분이 ?�체 ?�?�라?�의 90% 지?�을 ?�어가거나 ?�예 ?�고 ?�갔????
        if (endBar > currentTotalBars * 0.9) {
            // 기본 50마디�??�려주되, 만약 ?�립???�무 길어??50마디로도 부족하�?�??�립 길이??맞춰???�넉?�게 ?�려줍니??
            const extendAmount = Math.max(50, Math.ceil(endBar - currentTotalBars) + 10);
            projectInfo.value.totalBarCount += extendAmount;
            // console.log(`?�?�라?�이 ?�동?�로 ${projectInfo.value.totalBarCount}마디�??�장?�었?�니??`);
        }
    };

    function clampNumber(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value))
    }

    function clampFrequency(frequencyHz: number) {
        return Math.round(clampNumber(frequencyHz, 20, 20000))
    }

    function clampGain(gainDeltaDb: number) {
        return Math.round(clampNumber(gainDeltaDb, -12, 12) * 10) / 10
    }

    function clampQ(q: number) {
        return Math.round(clampNumber(q, 0.1, 10) * 100) / 100
    }

    function getTrackEq(track: TrackUIState): TrackEqState {
        return {
            bands: track.eq?.bands ?? [],
        }
    }

    function createToneFilterFromBand(band: TrackEqBandState) {
        const type =
            band.eqTypeCode === 2
                ? 'lowshelf'
                : band.eqTypeCode === 3
                    ? 'highshelf'
                    : 'peaking'

        const filter = new Tone.Filter({
            type,
            frequency: band.frequencyHz,
            Q: band.q,
            gain: band.gainDeltaDb,
        })

        filter.channelCount = 2
        filter.channelCountMode = 'explicit'

        return filter
    }

    function disposeTrackEqNodes(trackId: number) {
        const nodes = trackEqNodes.get(trackId)

        if (!nodes) return

        nodes.forEach(node => {
            node.filter.dispose()
        })

        trackEqNodes.delete(trackId)
    }

    function disposeTrackAnalyzer(trackId: number) {
        const analyzer = trackAnalyzers.get(trackId)

        if (!analyzer) return

        analyzer.dispose()
        trackAnalyzers.delete(trackId)
    }

    function createTrackEqNodes(track: TrackUIState, customBands?: TrackEqBandState[]): TrackEqNode[] {
        disposeTrackEqNodes(track.trackId)

        const bands = customBands ?? getTrackEq(track).bands;

        const nodes = bands.map(band => ({
            bandOrder: band.bandOrder,
            filter: createToneFilterFromBand(band),
        }))

        trackEqNodes.set(track.trackId, nodes)

        return nodes
    }

    function getTrackInputNode(trackId: number) {
        const eqNodes = trackEqNodes.get(trackId) ?? []
        const analyzer = trackAnalyzers.get(trackId)
        const volume = trackVolumes.get(trackId)

        if (!volume) return null

        if (eqNodes.length > 0) {
            return eqNodes[0].filter
        }

        if (analyzer) {
            return analyzer
        }

        return volume
    }

    function connectPlayerToTrack(
        player: Tone.Player,
        trackId: number,
    ) {
        const inputNode = getTrackInputNode(trackId)

        if (!inputNode) return

        player.disconnect()
        player.connect(inputNode)
    }

    function reconnectTrackPlayers(trackId: number) {
        const track = trackList.value.find(track => track.trackId === trackId)
        if (!track) return

        const inputNode = getTrackInputNode(trackId)
        if (!inputNode) return

        track.clips.forEach(clip => {
            const player = clipPlayers.get(clip.clipId)
            if (!player) return

            player.disconnect()
            player.connect(inputNode)
        })
    }

    function rebuildTrackEqChain(trackId: number, customBands?: TrackEqBandState[]) {
        const track = trackList.value.find(track => track.trackId === trackId)
        const volume = trackVolumes.get(trackId)

        if (!track || !volume) return

        disposeTrackEqNodes(trackId)
        disposeTrackAnalyzer(trackId)
        const eqNodes = createTrackEqNodes(track, customBands)
        const analyzer = new Tone.FFT(2048)

        trackAnalyzers.set(trackId, analyzer)

        if (eqNodes.length > 0) {
            for (let i = 0; i < eqNodes.length - 1; i += 1) {
                eqNodes[i].filter.connect(eqNodes[i + 1].filter)
            }

            eqNodes[eqNodes.length - 1].filter.connect(analyzer)
            analyzer.connect(volume)
        }
        else {
            analyzer.connect(volume)
        }

        reconnectTrackPlayers(trackId)
    }

    function disposeClipAudio(clipId: number) {
        const player = clipPlayers.get(clipId)

        if (player) {
            player.unsync().stop().dispose()
            clipPlayers.delete(clipId)
        }
    }

    function disposeTrackAudioChain(trackId: number) {
        disposeTrackEqNodes(trackId)
        disposeTrackAnalyzer(trackId)
    }

    // ==========================================
    // ?�� ?�소�??�신 (Subscribe) 처리부
    // ==========================================
    // 백엔??명세??맞추???�벤??�?`CLIP_PASTE_SUCCESS` ?????�정?�여 ?�용


    // --------------------- ?�랙 관??(?�켓) ---------------------    
    socketService.subscribePersistent('TRACK_ADD', (data) => {
        // ?��? 그려?�있?�면 무시 (Optimistic UI 중복 방�?)
        if (trackList.value.some(t => t.trackId === data.trackId)) return;

        const newTrack: TrackUIState = {
            trackId: data.trackId,
            name: data.name,
            type: data.type.toLowerCase(),
            preTrackId: data.preTrackId,
            postTrackId: data.postTrackId,
            isMuted: data.isMuted,
            isSoloed: data.isSoloed,
            volume: data.volume,
            pan: data.pan,
            clips: [],
            height: 100,
            isSelected: false,
            eq: createDefaultTrackEq(),
        };
        trackList.value.push(newTrack);

        const panner = new Tone.Panner(newTrack.pan / 100).connect(masterVolume);
        const vol = new Tone.Volume(newTrack.volume).connect(panner);
        panner.channelCount = 2; panner.channelCountMode = "explicit";
        vol.channelCount = 2; vol.channelCountMode = "explicit";

        trackVolumes.set(newTrack.trackId, vol);
        trackPanners.set(newTrack.trackId, panner);

        rebuildTrackEqChain(newTrack.trackId);

        if (pendingTrackAddCount.value > 0) {
            pendingTrackAddCount.value--;
            const createdTrackId = data.trackId;
            pushCommand({
                undo: () => {
                    // ?�랙 추�? 취소: ?�성???�랙???�시 지?�
                    socketService.publish('TRACK_DELETE', {
                        projectId: projectInfo.value.projectId,
                        trackId: createdTrackId
                    });
                },
                redo: () => {
                    alert("취소???�랙?� '???�랙 추�?' 버튼?�로 ?�시 만들??주세??");
                }
            });
        }
    });

    socketService.subscribePersistent('TRACK_DELETE', (data) => {
        const index = trackList.value.findIndex(t => t.trackId === data.trackId);
        if (index !== -1) {
            // ?�� 보완: ?�랙??지?�기 ?�에, ?�랙 ?�에 ?�던 모든 ?�립???�디??메모리�? ?�전 ?�제!
            trackList.value[index].clips.forEach(clip => {
                disposeClipAudio(clip.clipId);
            });

            disposeTrackAudioChain(data.trackId);

            trackList.value.splice(index, 1);
            trackVolumes.get(data.trackId)?.dispose(); trackVolumes.delete(data.trackId);
            trackPanners.get(data.trackId)?.dispose(); trackPanners.delete(data.trackId);
        }
        if (selectedTrackId.value === data.trackId) deselectAll();
    });

    socketService.subscribePersistent('TRACK_REORDER', (data) => {
        const { trackId, preTrackId, postTrackId } = data;
        const trackIndex = trackList.value.findIndex(t => t.trackId === trackId);
        if (trackIndex === -1) return;

        const [track] = trackList.value.splice(trackIndex, 1);

        let newIndex = 0;
        if (preTrackId) {
            const preIndex = trackList.value.findIndex(t => t.trackId === preTrackId);
            if (preIndex !== -1) newIndex = preIndex + 1;
        } else if (postTrackId) {
            const postIndex = trackList.value.findIndex(t => t.trackId === postTrackId);
            if (postIndex !== -1) newIndex = postIndex;
        }

        trackList.value.splice(newIndex, 0, track);
    });

    socketService.subscribePersistent('TRACK_RENAME', (data) => {
        const track = trackList.value.find(t => t.trackId === data.trackId);
        if (track) track.name = data.name;
    });

    socketService.subscribePersistent('TRACK_MUTE_CHANGE', (data) => {
        const track = trackList.value.find(t => t.trackId === data.trackId);
        if (track) { track.isMuted = data.isMuted; syncEffectiveMuteStates(); }
    });

    socketService.subscribePersistent('TRACK_SOLO_CHANGE', (data) => {
        const track = trackList.value.find(t => t.trackId === data.trackId);
        if (track) { track.isSoloed = data.isSoloed; syncEffectiveMuteStates(); }
    });

    socketService.subscribePersistent('TRACK_VOLUME_CHANGE', (data) => {
        const track = trackList.value.find(t => t.trackId === data.trackId);
        if (track) {
            track.volume = data.volume;
            const vol = trackVolumes.get(data.trackId);
            if (vol) vol.volume.value = data.volume;
        }
    });

    socketService.subscribePersistent('TRACK_PAN_CHANGE', (data) => {
        const track = trackList.value.find(t => t.trackId === data.trackId);
        if (track) {
            track.pan = data.pan;
            const panner = trackPanners.get(data.trackId);
            if (panner) panner.pan.value = data.pan / 100;
        }
    });

    // --------------------- ?�러 ?�신 (?�켓) ---------------------
    socketService.subscribePersistent('ERROR', (data: any) => {
        if (data && data.message) {
            alert(data.message);
        } else {
            alert("처리 �??�류가 발생?�습?�다.");
        }
    });

    // --------------------- 박자 변�??�신 (?�켓) ---------------------
    socketService.subscribePersistent('MODIFIED_PROJECT_TIME_SIGNATURE', (data: any) => {
        const newNum = data.timeSigNumerator;
        const newDenom = data.timeSigDenominator;

        // ?��? 같�? 값이�?(?��? 보낸 ?�청??브로?�캐?�트 ?�답) ?�킵
        if (projectInfo.value.timeSigNumerator === newNum &&
            projectInfo.value.timeSigDenominator === newDenom) return;

        // ?�른 ?�용?��? 변경한 박자�?로컬???�용
        applyTimeSignatureChange(newNum, newDenom);
    });

    // --------------------- BPM 변�??�신 (?�켓) ---------------------
    socketService.subscribePersistent('MODIFIED_PROJECT_BPM', (data: any) => {
        const newBpm = data.tempo;

        // ?��? 같�? 값이�?(?��? 보낸 ?�청??브로?�캐?�트 ?�답) ?�킵
        if (bpm.value === newBpm) return;

        // ?�른 ?�용?��? 변경한 BPM??로컬???�용
        // 변�???watch(bpm)???�리거되???�동 ?�스케줄링??
        bpm.value = newBpm;
        projectInfo.value.tempo = newBpm;
    });

    // --------------------- ??Key) 변�??�신 (?�켓) ---------------------
    socketService.subscribePersistent('MODIFIED_PROJECT_KEY', (data: any) => {
        // ?�버?�서 ??Enum 문자?�을 ?�시 ?�론?�엔???�기법으�?변??
        const newNote = enumToRootNote[data.rootNote] || data.rootNote;
        const newMode = data.mode;

        // ?��? 같�? 값이�?(?��? 보낸 ?�청??브로?�캐?�트 ?�답) ?�킵
        if (projectInfo.value.rootNote === newNote && projectInfo.value.mode === newMode) return;

        // ?�른 ?�용?��? 변경한 ?��? 로컬???�용
        projectInfo.value.rootNote = newNote;
        projectInfo.value.mode = newMode;
    });

    // --------------------- ?�립 관??(?�켓) ---------------------
    socketService.subscribePersistent('CLIP_LOCK', (data) => {
        // ?��? 직접 ?�근 ?�립?�면 ???�면?�서???�금 ?�시�??��? ?�는??(?�기 ?�신 차단 방�?)
        if (myLockedClips.has(data.clipId)) return;

        const track = trackList.value.find(t => t.clips.some(c => c.clipId === data.clipId));
        if (track) {
            const clip = track.clips.find(c => c.clipId === data.clipId);
            if (clip) {
                clip.isLocked = data.isLocked; // ?�른 ?�람???�근 경우?�만 ?�물??찰칵!
            }
        }
    });

    //1.?�규 ?�립 ?�로???�료 ?�신
    // 1. ?�규 ?�립 ?�로???�료 ?�신
    socketService.subscribePersistent('CLIP_CREATE', async (data) => {
        // ?�로??중이???�립??백엔?�에???�성?�어 ?�아?�다�?고스???�립 ?�제
        let isInitiator = false;
        if (uploadingTrackId.value === data.trackId) {
            isInitiator = true;
            uploadingTrackId.value = null;
            uploadingBar.value = null;
        }

        const track = trackList.value.find(t => t.trackId === data.trackId);
        if (!track) return;

        // 1. ?�면???�선 �??�립 블록(?�리 ?�는 껍데�? ?�더�?
        const newClip: ClipUIState = {
            clipId: data.clipId,
            start: data.startBar,
            duration: data.duration,
            audioStartMs: data.audioStartMs,
            audioDurationMs: data.audioDurationMs,
            color: data.color,
            audio: {
                audioMetadataId: data.audioMetadataId,
                originalName: "?�디??로딩 �?..",
                cdnUrl: "",
                durationMs: data.audioDurationMs,
            },
            isSelected: false,
            isDragging: false,
            isLocked: false
        };
        track.clips.push(newClip);
        checkAndExpandTimeline(newClip.start + newClip.duration);
        // 2. 백그?�운?�에???�디???�세 ?�보(URL) 조회 API 비동�??�출
        try {
            const audioInfo = await projectApi.getAudioDetail(projectInfo.value.projectId, data.audioMetadataId);

            // [최적?? ?�로??본인??미리 캐싱?�둔 로컬 blobUrl??AudioBuffer�?CDN URL ?�로 ?�전
            // ??loadClipPlayer?� WaveformWebGL 모두 추�? ?�트?�크 ?�청 ?�이 즉시 ?�용 가??
            if (data._localBlobUrl && audioBufferCache.has(data._localBlobUrl)) {
                const localBuffer = audioBufferCache.get(data._localBlobUrl)!;
                audioBufferCache.set(audioInfo.audioUrl, localBuffer);
                // ???�상 ?�요 ?�는 blobUrl ???�거 �?메모�??�제
                audioBufferCache.delete(data._localBlobUrl);
                URL.revokeObjectURL(data._localBlobUrl);
                // console.log(`[CLIP_CREATE 최적?? 로컬 AudioBuffer ??CDN URL ?�로 ?�전 ?�료 (?�트?�크 ?�운로드 ?�략)`);
            }

            // 3. Vue 반응???�보: 배열 ?�의 ?�제 반응??객체�??�시 찾아??audio�??�째�?교체
            const reactiveClip = track.clips.find(c => c.clipId === data.clipId);
            if (reactiveClip) {
                reactiveClip.audio = {
                    audioMetadataId: data.audioMetadataId,
                    cdnUrl: audioInfo.audioUrl,
                    originalName: audioInfo.originalName,
                    durationMs: data.audioDurationMs,
                };

                // [?�복] ?�디??Culling ???�코??부?�로 ?�한 ?��???발생?�여 미리 로딩
                loadClipPlayer(reactiveClip, data.trackId);
                // console.log(`[CLIP_CREATE] 백그?�운???�디??로딩 ?�약 ?�료 (ID: ${reactiveClip.clipId})`);

                // 겹침 방�? (?�로?�한 ?�사?�만 ?�버??반영)
                resolveClipOverlap(reactiveClip, track, isInitiator);

                if (isInitiator) {
                    const newClipId = data.clipId;
                    const targetTrackId = data.trackId;
                    pushCommand({
                        undo: () => {
                            // ?�디???�로??취소: 방금 ?�성???�립 ??��
                            lockClip(newClipId, targetTrackId);
                            setTimeout(() => {
                                socketService.publish('CLIP_DELETE', {
                                    projectId: projectInfo.value.projectId,
                                    clipId: newClipId
                                });
                                setTimeout(() => unlockClip(newClipId, targetTrackId), 100);
                            }, 100);
                        },
                        redo: () => {
                            // ?�디???�로??리두??지?�하지 ?�음 (?�일 ?�업로드 ?�요?��?�?
                            alert("?�로??취소???�립?� ?�시 복구?????�습?�다.");
                        }
                    });
                }
            }
        } catch (error) {
            // console.error(`[CLIP_CREATE] ?�디???�세 ?�보(URL) 조회 ?�패:`, error);
            const failedClip = track.clips.find(c => c.clipId === data.clipId);
            if (failedClip && failedClip.audio) {
                failedClip.audio = { ...failedClip.audio, originalName: "?�디??로딩 ?�패" };
            }
        }
    });

    socketService.subscribePersistent('CLIP_MOVE', (data) => {
        let targetClip: ClipUIState | null = null;
        let sourceTrack: TrackUIState | null = null;

        for (const track of trackList.value) {
            const clip = track.clips.find(c => c.clipId === data.clipId);
            if (clip) {
                targetClip = clip;
                sourceTrack = track;
                break;
            }
        }

        if (!targetClip || !sourceTrack) return;

        if (
            targetClip.start === data.after.startBar &&
            sourceTrack.trackId === data.after.trackId
        ) {
            return;
        }

        if (sourceTrack.trackId !== data.after.trackId) {
            const targetTrack = trackList.value.find(t => t.trackId === data.after.trackId);
            if (!targetTrack) return;

            const clipIndex = sourceTrack.clips.findIndex(c => c.clipId === data.clipId);
            if (clipIndex !== -1) {
                sourceTrack.clips.splice(clipIndex, 1);
            }

            targetTrack.clips.push(targetClip);

            const player = clipPlayers.get(data.clipId);

            if (player) {
                connectPlayerToTrack(
                    player,
                    data.after.trackId,
                );
            }
        }

        targetClip.start = data.after.startBar;
        resyncClip(targetClip.clipId, targetClip.start);
    });

    socketService.subscribePersistent('CLIP_RESIZE', (data) => {
        for (const t of trackList.value) {
            const clip = t.clips.find(c => c.clipId === data.clipId);
            if (clip) {
                const beforeStart = data.before.startBar;
                const beforeDuration = data.before.length;
                const afterStart = data.after.startBar;
                const afterDuration = data.after.length;

                // console.log(`[CLIP_RESIZE ?�신] clipId: ${data.clipId}`);
                // console.log(`  - before: start=${beforeStart}, duration=${beforeDuration}`);
                // console.log(`  - after: start=${afterStart}, duration=${afterDuration}`);
                // console.log(`  - ?�재 로컬 ?�태: start=${clip.start}, duration=${clip.duration}`);

                // ?��? 보낸 리사?�즈 ?�청?�라 ?��? 로컬 ?�태가 갱신?�어 ?�다�??�중 ?�용(?�형 밀�??�상) 방�?
                if (Math.abs(clip.start - afterStart) < 0.0001 && Math.abs(clip.duration - afterDuration) < 0.0001) {
                    // console.log(`  => (?�킵) ?��? 로컬 ?�태가 최신?�니??(?��? 보낸 ?�청).`);
                    break;
                }

                // 백엔?��? ?�일??공식?�로 ?�론?�에??계산?�여 ?�기??
                const msPerBar = clip.audioDurationMs / clip.duration;
                const newAudioStartMs = Math.round(clip.audioStartMs + (afterStart - beforeStart) * msPerBar);
                const newAudioDurationMs = Math.round(afterDuration * msPerBar);

                // console.log(`  => (?�용) ?�디??갱신: audioStartMs ${clip.audioStartMs} -> ${newAudioStartMs}, audioDurationMs ${clip.audioDurationMs} -> ${newAudioDurationMs}`);

                clip.start = afterStart;
                clip.duration = afterDuration;
                clip.audioStartMs = newAudioStartMs;
                clip.audioDurationMs = newAudioDurationMs;

                resyncClip(clip.clipId, clip.start);
                break; // 찾았?�니 ?�출
            }
        }
    });

    // 겹침 방�? �??�동 ?�로 밀?�내�??�틸리티 ?�수
    const resolveClipOverlap = (clip: ClipUIState, track: TrackUIState, isInitiator: boolean) => {
        let hasOverlap = true;
        let safetyCounter = 0;
        const epsilon = 0.001;

        let resolvedStart = clip.start;
        const duration = clip.duration;

        while (hasOverlap && safetyCounter < 100) {
            hasOverlap = false;
            safetyCounter++;
            for (const existingClip of track.clips) {
                if (existingClip.clipId === clip.clipId) continue; // ?�기 ?�신 건너?�기

                const existingStart = existingClip.start;
                const existingEnd = existingClip.start + existingClip.duration;
                const desiredEnd = resolvedStart + duration;

                if (resolvedStart < existingEnd - epsilon && desiredEnd > existingStart + epsilon) {
                    hasOverlap = true;
                    resolvedStart = existingEnd; // 겹치�??�당 ?�립??�??�로 밀?�냄
                    break; // 처음부???�시 겹침 ?��? 검??
                }
            }
        }

        if (resolvedStart !== clip.start) {
            clip.start = resolvedStart;
            // ?��? 복제/?�성??지?�한 ?�사?�라�?백엔?�에???�치 ?�동???�기?�합?�다.
            if (isInitiator) {
                // console.log(`[Overlap Resolution] ?�립 겹침 감�??? ?�버�??�동 ?�청 ?�송 (???�치: ${resolvedStart})`);
                confirmMoveClip(clip.clipId, track.trackId, resolvedStart);
            }
        }
    };

    socketService.subscribePersistent('CLIP_DELETE', (data) => {
        for (const t of trackList.value) {
            const index = t.clips.findIndex(c => c.clipId === data.clipId);
            if (index !== -1) {
                t.clips.splice(index, 1);
                break; // 찾았?�니 ?�출
            }
        }
        disposeClipAudio(data.clipId);
    });

    socketService.subscribePersistent('CLIP_CUT', (data) => {
        // ?�라?�기???�면????�� 로직?� ?�일
        for (const t of trackList.value) {
            const index = t.clips.findIndex(c => c.clipId === data.clipId);
            if (index !== -1) {
                // ?�라???�본 ?�립??지?�기 ?�에 ?�시 보�??�에 깊�? 복사�??�??(?�른 ?��?가 붙여?�을 ???�본 ?�이?��? 참조?�기 ?�함)
                cutClipsMap.set(data.clipId, JSON.parse(JSON.stringify(t.clips[index])));
                t.clips.splice(index, 1);
                break;
            }
        }
        disposeClipAudio(data.clipId);
    });

    // 2. ?�립 붙여?�기 ?�신 (가??중요: sourceClipId�??�한 복제)
    socketService.subscribePersistent('CLIP_PASTE', (data) => {
        // 백엔?�에??'?�떤 ?�립??복사?�는지(sourceClipId)'�??�려�?
        let originalClip: ClipUIState | null = null;
        for (const t of trackList.value) {
            const found = t.clips.find(c => c.clipId === data.sourceClipId);
            if (found) { originalClip = found; break; }
        }
        // ?�라?�기(Cut)??경우 ?�면?�서 ?��? ??��?�었?��?�???로컬 ?�립보드?�서 찾습?�다.
        if (!originalClip && clipboardClip.value && clipboardClip.value.clipId === data.sourceClipId) {
            originalClip = clipboardClip.value;
        }
        // ?��? ?�른�??�니�??�른 ?�람???�른 ?�립?�라�? ?�시 보�???cutClipsMap)?�서 찾습?�다.
        if (!originalClip && cutClipsMap.has(data.sourceClipId)) {
            originalClip = cutClipsMap.get(data.sourceClipId) || null;
        }

        if (!originalClip) {
            // console.error(`[?�러] 붙여?�기 ???�본 ?�립(ID: ${data.sourceClipId})???�면?�서 찾을 ???�습?�다!`);
            return;
        }

        const targetTrack = trackList.value.find(t => t.trackId === data.targetTrackId);
        if (!targetTrack) return;

        // ?�본 ?�립???�벽?�게 복제(Deep Copy)???? 백엔?��? 지?�해준 ?�치?� ID�?변�?
        const pastedClip: ClipUIState = {
            ...JSON.parse(JSON.stringify(originalClip)),
            clipId: data.clipId,
            start: data.targetStartBar,
            audio: originalClip.audio ? { ...originalClip.audio } : undefined,
            isSelected: false,
            isDragging: false,
            isLocked: false
        };
        targetTrack.clips.push(pastedClip);
        checkAndExpandTimeline(pastedClip.start + pastedClip.duration);
        // [?�복] ?�디???�레?�어 미리 로드 (?��? 방�?)
        loadClipPlayer(pastedClip, data.targetTrackId);

        let isInitiator = false;
        if (pendingPasteCount.value > 0) {
            pendingPasteCount.value--;
            isInitiator = true;
        }
        resolveClipOverlap(pastedClip, targetTrack, isInitiator);

        // ?�면 ?�더링이 무사???�난 ???�라?�기 ?�립보드 비우�?
        if (isCutAction.value) {
            clipboardClip.value = null;
            isCutAction.value = false;
        }

        if (isInitiator) {
            const newClipId = data.clipId;
            const targetTrackId = data.targetTrackId;
            pushCommand({
                undo: () => {
                    // 붙여?�기 취소: 방금 붙여?��? ?�립 ??��
                    lockClip(newClipId, targetTrackId);
                    setTimeout(() => {
                        socketService.publish('CLIP_DELETE', {
                            projectId: projectInfo.value.projectId,
                            clipId: newClipId
                        });
                        setTimeout(() => unlockClip(newClipId, targetTrackId), 100);
                    }, 100);
                },
                redo: () => {
                    // 붙여?�기 리두: ?�래 붙여?�기 로직 ?�실??(?�의???�림 ?�공)
                    alert("?�돌�??�립?� ?�립보드?�서 ?�시 붙여?�기(Ctrl+V) ?�주?�요.");
                }
            });
        }
    });

    // ?��? 복제/붙여?�기 ?�청??건인지 ?�인?�기 ?�한 로컬 ?�태
    const pendingPasteCount = ref(0);

    // 3. ?�립 복제 ?�신
    socketService.subscribePersistent('CLIP_DUPLICATE', (data) => {
        let originalClip: ClipUIState | null = null;
        for (const t of trackList.value) {
            const found = t.clips.find(c => c.clipId === data.clipId);
            if (found) { originalClip = found; break; }
        }
        if (!originalClip) return;
        const targetTrack = trackList.value.find(t => t.trackId === data.targetTrackId);
        if (!targetTrack) return;
        const duplicatedClip: ClipUIState = {
            ...JSON.parse(JSON.stringify(originalClip)),
            clipId: data.newClipId,
            start: data.targetStartBar,
            audio: originalClip.audio ? { ...originalClip.audio } : undefined,
            isSelected: false,
            isDragging: false,
            isLocked: false
        };
        targetTrack.clips.push(duplicatedClip);
        checkAndExpandTimeline(duplicatedClip.start + duplicatedClip.duration);
        // [?�복] ?�디???�레?�어 미리 로드 (?��? 방�?)
        loadClipPlayer(duplicatedClip, data.targetTrackId);

        // ?��? 복제 ?�청??보낸 ?�립?�라�?백엔?��? ???�립??강제�?�??�을 ?�제
        const isInitiator = pendingDuplicateOriginalClipIds.has(data.clipId);
        if (isInitiator) {
            pendingDuplicateOriginalClipIds.delete(data.clipId);
            // ?�켓 ?�신???�해 ???�립(newClipId)???�금??즉시 ?�제 ?�청
            socketService.publish('CLIP_LOCK', {
                projectId: projectInfo.value.projectId,
                clipId: data.newClipId,
                isLocked: false
            });

            const newClipId = data.newClipId;
            const targetTrackId = data.targetTrackId;
            pushCommand({
                undo: () => {
                    // 복제 취소: 방금 복제???�립 ??��
                    lockClip(newClipId, targetTrackId);
                    setTimeout(() => {
                        socketService.publish('CLIP_DELETE', {
                            projectId: projectInfo.value.projectId,
                            clipId: newClipId
                        });
                        setTimeout(() => unlockClip(newClipId, targetTrackId), 100);
                    }, 100);
                },
                redo: () => {
                    // 복제 리두??지?�하지 ?�음
                    alert("?�돌�??�립?� ?�시 복제(Alt+Drag) ?�주?�요.");
                }
            });
        }

        // 겹침 방�?: ?�성???�립??기존 ?�립�?겹치�??�나???�치 바로 ?�로 밀?�냅?�다.
        resolveClipOverlap(duplicatedClip, targetTrack, isInitiator);
    });
    // 4. ?�립 분할 ?�신
    socketService.subscribePersistent('CLIP_SPLIT', async (data) => {
        let targetTrack: TrackUIState | null = null;
        let originalClip: ClipUIState | null = null;

        for (const t of trackList.value) {
            const found = t.clips.find(c => c.clipId === data.clipId);
            if (found) { originalClip = found; targetTrack = t; break; }
        }

        const isInitiator = pendingSplitOriginalClipIds.has(data.clipId);

        // 분할 ?�답???�으므�??��?목록?�서 ?�거
        pendingSplitOriginalClipIds.delete(data.clipId);

        if (!originalClip || !targetTrack) return;

        // ?�본 ?�립??분할 ???�태 백업 (?�두??
        const origDuration = originalClip.duration;
        const origAudioDurationMs = originalClip.audioDurationMs;

        // ?�생 중이?�다�?멈추�??�전?�게 쪼개�?진행
        const wasPlaying = isPlaying.value;
        let pausedAtSeconds = 0;
        if (wasPlaying) {
            pausedAtSeconds = Tone.getTransport().seconds;
            Tone.getTransport().pause();
            isPlaying.value = false;
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (scrollRAFId) cancelAnimationFrame(scrollRAFId);
        }

        const splitOffsetBars = data.splitBar - originalClip.start;
        const splitOffsetMs = splitOffsetBars * (originalClip.audioDurationMs / originalClip.duration);
        // 백엔??명세??맞춰???�른�????�립 ?�성
        // 주의: JSON.parse(stringify) 과정?�서 audio 객체??참조 무결?�이 깨�?거나 값이 ?�실?????�으므�?명시???��? 복사본을 ?�당?�니??
        const rightClip: ClipUIState = {
            ...JSON.parse(JSON.stringify(originalClip)),
            clipId: data.newClipId,
            start: data.splitBar,
            duration: data.newClipDuration,
            audioStartMs: originalClip.audioStartMs + splitOffsetMs,
            audioDurationMs: Math.max(0, originalClip.audioDurationMs - splitOffsetMs),
            audio: originalClip.audio ? { ...originalClip.audio } : undefined,
            isLocked: false,     // 분할�??�로 ?�긴 ?�립?� ?�금 ?�제 ?�태�?초기??
            isDragging: false,
            isSelected: false
        };
        // ?�쪽 ?�본 ?�립 길이 ?�정
        originalClip.duration = data.originalDuration;
        originalClip.audioDurationMs = splitOffsetMs;
        targetTrack.clips.push(rightClip);
        // ?�쪽 ?�립 ?�디???�설??(resyncClip ?��? 로직???�작)
        resyncClip(originalClip.clipId, originalClip.start);

        // [?�복] ?�디???�레?�어 미리 로드
        loadClipPlayer(rightClip, targetTrack.trackId);

        // 분할 ?�업 ?�료 ???�생 ?�개
        if (wasPlaying) {
            Tone.getTransport().start("+0.05", pausedAtSeconds);
            isPlaying.value = true;
            updatePlayheadLoop();
            scrollAnimationLoop();
        }

        // ?��? ?�청??분할??경우?�만 ?�두 ?�택???�록
        if (isInitiator) {
            const origClipId = originalClip.clipId;
            const newClipId = data.newClipId;
            const trackId = targetTrack.trackId;

            pushCommand({
                undo: () => {
                    // ?�로 ?�긴 조각(?�른�? ??��
                    lockClip(newClipId, trackId);
                    setTimeout(() => {
                        socketService.publish('CLIP_DELETE', {
                            projectId: projectInfo.value.projectId,
                            clipId: newClipId
                        });
                        setTimeout(() => unlockClip(newClipId, trackId), 100);
                    }, 100);

                    // ?�본 ?�립(?�쪽) 길이 ?�복 (리사?�즈)
                    lockClip(origClipId, trackId);
                    const clipToRestore = targetTrack?.clips.find(c => c.clipId === origClipId);
                    if (clipToRestore) {
                        clipToRestore.duration = origDuration;
                        clipToRestore.audioDurationMs = origAudioDurationMs;
                        resyncClip(origClipId, clipToRestore.start);
                        setTimeout(() => {
                            socketService.publish('CLIP_RESIZE', {
                                projectId: projectInfo.value.projectId,
                                clipId: origClipId,
                                startBar: clipToRestore.start,
                                length: origDuration
                            });
                            setTimeout(() => unlockClip(origClipId, trackId), 100);
                        }, 100);
                    }
                },
                redo: () => {
                    // ?�시 분할 ?�행 (?? ??ID가 부?�될 것이므�??�벽??리두???�님. ?�재???�의???�출)
                    lockClip(origClipId, trackId);
                    setTimeout(() => {
                        socketService.publish('CLIP_SPLIT', {
                            projectId: projectInfo.value.projectId,
                            clipId: origClipId,
                            splitBar: data.splitBar
                        });
                        setTimeout(() => unlockClip(origClipId, trackId), 100);
                    }, 100);
                }
            });
        }
    });
    // 5. ?�립 복사 �??�라?�기 ?�답 
    socketService.subscribePersistent('CLIP_COPY', (data) => {
        // console.log(`[?�신] 백엔???�립보드??복사 ?�료 (clipId: ${data.clipId})`);
    });

    // ==========================================
    // 3. ?�션(Action) ?�언 (?�소�?발신 �?UI ?�더�?
    // ==========================================

    // ?�제 ?�디???�일 ?�로??& ?�립 추�? Action
    const uploadAndAddAudioClip = async (file: File, trackId: number, startBar: number) => {
        // console.log(`========== [Upload & Add Clip Start (Pessimistic UI)] ==========`);
        uploadingTrackId.value = trackId;
        uploadingBar.value = startBar;

        // 1. 로컬 ?�일??AudioBuffer�??�코??(길이 측정 + 캐시 ?�전 ?�재�???번에 처리)
        //    ??기존?�는 Tone.Player�??�시 로드 ??dispose?��?�? ?�제??AudioBuffer�?캐시??보�??�여
        //      CLIP_CREATE ?�신 ???�트?�크 ?�복 ?�이 즉시 ?�생/?�형 ?�시가 가?�합?�다.
        const localBlobUrl = URL.createObjectURL(file);
        let durationMs: number;
        try {
            const localBuffer = await fetchAndCacheAudioBuffer(localBlobUrl);
            durationMs = Math.round(localBuffer.duration * 1000);
        } catch (e) {
            // console.error(`[Upload] 로컬 ?�일 ?�코???�패:`, e);
            URL.revokeObjectURL(localBlobUrl);
            uploadingTrackId.value = null;
            uploadingBar.value = null;
            return;
        }
        // ?�️ revokeObjectURL?� ?��? ?�습?�다. 캐시??blobUrl ?�로 보�??�어 ?�으므�?
        //    CLIP_CREATE?�서 CDN URL???�착?�면 그때 blobUrl 캐시�?CDN URL ?�로 ?�전?�니??

        // 2. ?�일 ?�?�에 ?�른 MIME ?�??�??�맷???�정
        const mimeType = file.type.includes('wav') ? 'WAV' : 'MPEG';

        try {
            // 3. 백엔??API�??�해 S3 Presigned URL(?�켓) 발급
            const uploadTicket = await projectApi.getAudioUploadUrl(projectInfo.value.projectId, {
                originalName: file.name,
                mimeType: mimeType,
                sizeBytes: file.size
            });
            // 4. 발급받�? Presigned URL???�용?�여 S3�?직접 ?�일 ?�송 (PUT)
            await axios.put(uploadTicket.uploadUrl, file, {
                headers: {
                    'Content-Type': file.type
                }
            });

            // console.log(`[Upload] S3 ?�일 ?�로???�료 (objectKey: ${uploadTicket.objectKey})`);
            // 5. ?�소켓으�??�립 ?�성(CLIP_CREATE) 브로?�캐?�트 ?�청 (?�재 ?�의??백엔???�펙)
            socketService.publish('CLIP_CREATE', {
                projectId: projectInfo.value.projectId,
                trackId: trackId,
                startBar: startBar,
                color: "#" + Math.floor(Math.random() * 16777215).toString(16),
                objectKey: uploadTicket.objectKey,
                originalName: file.name,
                storedName: uploadTicket.storedName,
                mimeType: mimeType,
                sizeBytes: file.size,
                durationMs: durationMs,
                // [최적?? ?�로??본인??CLIP_CREATE ?�신부?�서 CDN URL ?�???�용??로컬 blob URL
                _localBlobUrl: localBlobUrl
            });

            // console.log(`[Upload] 백엔?�로 CLIP_CREATE 발신 ?�료. ?�더링�? 브로?�캐?�트 ?�신 ??진행?�니??`);
            // ?�론?�엔??로직 종료 (?�더링�? ?�신부?�서 ?�괄 처리)
        } catch (error) {
            // console.error(`[Upload Error] ?�로???�는 ?�립 ?�성 ?�청 ?�패:`, error);
            URL.revokeObjectURL(localBlobUrl);
            alert("?�일 ?�로?�에 ?�패?�습?�다.");
            uploadingTrackId.value = null;
            uploadingBar.value = null;
        }
    };
    // 1. 복사
    const copyClip = (clip: ClipUIState) => {
        // ?�론???�립보드 ?�??
        clipboardClip.value = JSON.parse(JSON.stringify(clip));
        isCutAction.value = false;
        // ?�버 ?�립보드 ?�기??
        socketService.publish('CLIP_COPY', {
            projectId: projectInfo.value.projectId,
            clipId: clip.clipId
        });
    };

    // ?�라?�기
    const cutClip = (clip: ClipUIState, trackId: number) => {
        clipboardClip.value = { ...JSON.parse(JSON.stringify(clip)), clipId: clip.clipId };
        clipboardTrackId.value = trackId;
        isCutAction.value = true;
        // Lock ???�션 ??Unlock (백엔?��? Lock ?�유�?검증함)
        lockClip(clip.clipId, trackId);
        setTimeout(() => {
            socketService.publish('CLIP_CUT', {
                projectId: projectInfo.value.projectId,
                clipId: clip.clipId
            });
            setTimeout(() => unlockClip(clip.clipId, trackId), 100);
        }, 100);

        pushCommand({
            undo: () => {
                alert("?�라???�립?� ?�돌�????�습?�다.");
            },
            redo: () => {
                // do nothing
            }
        });
    };


    // 3. 붙여?�기
    const pasteClip = async (targetTrackId: number, startBar: number) => {
        // ?�수 ?�작?�자마자 ?�재 ?�립보드 ?�이?��? ?�반 변?�에 ?�전?�게 빼두�?
        const clipDataToPaste = clipboardClip.value;
        if (!clipDataToPaste) return;

        const targetTrack = trackList.value.find(t => t.trackId === targetTrackId);
        if (!targetTrack) return;

        // 1. 겹침 방�? 계산 (기존�??�일?�게 ?�론?�에??최적???�치�?미리 찾아??
        let resolvedStart = startBar;
        const duration = clipDataToPaste.duration;
        let hasOverlap = true;
        const epsilon = 0.001;
        let safetyCounter = 0;

        const isSpaceClear = (targetStart: number, dur: number) => {
            if (targetStart < 0) return false;
            const targetEnd = targetStart + dur;
            for (const c of targetTrack.clips) {
                if (targetStart < c.start + c.duration - epsilon && targetEnd > c.start + epsilon) {
                    return false;
                }
            }
            return true;
        };

        while (hasOverlap && safetyCounter < 100) {
            hasOverlap = false;
            safetyCounter++;
            for (const clip of targetTrack.clips) {
                const existingStart = clip.start;
                const existingEnd = clip.start + clip.duration;
                const desiredEnd = resolvedStart + duration;

                if (resolvedStart < existingEnd - epsilon && desiredEnd > existingStart + epsilon) {
                    hasOverlap = true;
                    const dropCenter = resolvedStart + (duration / 2);
                    const existingCenter = existingStart + (clip.duration / 2);
                    let placedFront = false;

                    if (dropCenter <= existingCenter) {
                        const proposedStart = existingStart - duration;
                        if (isSpaceClear(proposedStart, duration)) {
                            resolvedStart = proposedStart;
                            placedFront = true;
                        }
                    }
                    if (!placedFront) {
                        resolvedStart = existingEnd;
                    }
                    break;
                }
            }
        }

        // console.log(`[?�신] 백엔?�에 붙여?�기(CLIP_PASTE) ?�청 ?�송`);
        pendingPasteCount.value++;
        socketService.publish('CLIP_PASTE', {
            projectId: projectInfo.value.projectId,
            targetTrackId: targetTrackId,
            targetStartBar: resolvedStart
        });

        // 3. 붙여?�기 ?�료 ???�상 ?�거 (초기??
        if (isCutAction.value) {
            isCutAction.value = false;
            clipboardClip.value = null;
            clipboardTrackId.value = null;
        }
    };

    // ??��
    const deleteClip = (clipId: number, trackId: number) => {
        // console.log(`[?�신] 백엔?�에 ?�립 ??��(CLIP_DELETE) ?�청 ?�송`);
        // Lock ???�션 ??Unlock (백엔?��? Lock ?�유�?검증함)
        lockClip(clipId, trackId);
        setTimeout(() => {
            socketService.publish('CLIP_DELETE', {
                projectId: projectInfo.value.projectId,
                clipId: clipId
            });
            setTimeout(() => unlockClip(clipId, trackId), 100);
        }, 100);

        pushCommand({
            undo: () => {
                alert("??��???�립?� ?�돌�????�습?�다.");
            },
            redo: () => {
                // do nothing
            }
        });
    };

    // 4. ?�립 복제 (Duplicate)
    const duplicateClip = (clip: ClipUIState, trackId: number) => {
        // console.log(`[?�신] 백엔?�에 ?�립 복제(CLIP_DUPLICATE) ?�청 ?�송`);
        // Lock ???�션 ??Unlock (백엔?��? Lock ?�유�?검증함)
        lockClip(clip.clipId, trackId);
        pendingDuplicateOriginalClipIds.add(clip.clipId);
        socketService.publish('CLIP_DUPLICATE', {
            projectId: projectInfo.value.projectId,
            clipId: clip.clipId
        });
        unlockClip(clip.clipId, trackId);
    };
    // ?�버 ?�답 ?��?중인 ?�립 ID 목록 (?�트?�크 지?????�속 분할 방�???
    const pendingSplitOriginalClipIds = new Set<number>();

    let lastSplitTime = 0;

    // 5. ?�립 분할 (Split)
    const splitClip = async (clipId: number, trackId: number) => {
        const now = Date.now();
        if (now - lastSplitTime < 500) {
            // console.warn("분할 ?�청???�무 빠릅?�다. (?�속 ?�력 방�?)");
            return;
        }

        if (pendingSplitOriginalClipIds.has(clipId)) {
            // console.warn("?�전 분할 ?�청??처리 중입?�다. (?�트?�크 ?��?");
            return;
        }

        lastSplitTime = now;
        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track) return;

        const clipIndex = track.clips.findIndex(c => c.clipId === clipId);
        const originalClip = track.clips[clipIndex];
        if (!originalClip) return;

        const currentBar = playheadPosition.value;

        const EPSILON = 0.0001; // 부?�소?�점 ?�차 방어
        if (currentBar <= originalClip.start + EPSILON || currentBar >= originalClip.start + originalClip.duration - EPSILON) {
            alert("?�생�?Playhead)가 ?�립 ?�에 ?�어??분할?????�습?�다.");
            return;
        }

        // console.log(`[?�신] ?�립 분할(CLIP_SPLIT) ?�청 ?�송`);
        // Lock ???�션 ??Unlock (백엔?��? Lock ?�유�?검증함)
        lockClip(clipId, trackId);
        pendingSplitOriginalClipIds.add(clipId);
        socketService.publish('CLIP_SPLIT', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            splitBar: currentBar
        });
        unlockClip(clipId, trackId);
    };

    // 6. ?�립 길이 조절 (Resize / Trim)
    const resizeClip = (clipId: number, trackId: number, newStart: number, newDuration: number, trimLeftBars: number, origStart?: number, origDuration?: number, origAudioStartMs?: number) => {
        // console.log(`[?�신] ?�립 리사?�즈(CLIP_RESIZE) ?�청 ?�송`);
        socketService.publish('CLIP_RESIZE', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            startBar: newStart,
            length: newDuration
        });

        if (origStart !== undefined && origDuration !== undefined && origAudioStartMs !== undefined) {
            // 리사?�즈 ?�점???�립?�서 ?�본 ?�디??비율(ms/bar)??캡처
            // BPM???�중??바뀌어????비율?� ??�� ?�본 ?�디?�의 물리??비율???��?
            const clip = trackList.value.flatMap(t => t.clips).find(c => c.clipId === clipId);
            const capturedMsPerBar = clip ? clip.audioDurationMs / clip.duration : origDuration > 0 ? (origDuration * 2000 / origDuration) : 2000;

            pushCommand({
                undo: () => {
                    const track = trackList.value.find(t => t.trackId === trackId);
                    const clip = track?.clips.find(c => c.clipId === clipId);
                    if (clip) {
                        lockClip(clipId, trackId);
                        clip.start = origStart;
                        clip.duration = origDuration;
                        clip.audioStartMs = origAudioStartMs;
                        clip.audioDurationMs = origDuration * capturedMsPerBar;
                        resyncClip(clipId, origStart);
                        setTimeout(() => {
                            socketService.publish('CLIP_RESIZE', {
                                projectId: projectInfo.value.projectId,
                                clipId: clipId,
                                startBar: origStart,
                                length: origDuration
                            });
                            setTimeout(() => unlockClip(clipId, trackId), 100);
                        }, 100);
                    }
                },
                redo: () => {
                    const track = trackList.value.find(t => t.trackId === trackId);
                    const clip = track?.clips.find(c => c.clipId === clipId);
                    if (clip) {
                        lockClip(clipId, trackId);
                        clip.start = newStart;
                        clip.duration = newDuration;
                        clip.audioStartMs = origAudioStartMs + trimLeftBars * capturedMsPerBar;
                        clip.audioDurationMs = newDuration * capturedMsPerBar;
                        resyncClip(clipId, newStart);
                        setTimeout(() => {
                            socketService.publish('CLIP_RESIZE', {
                                projectId: projectInfo.value.projectId,
                                clipId: clipId,
                                startBar: newStart,
                                length: newDuration
                            });
                            setTimeout(() => unlockClip(clipId, trackId), 100);
                        }, 100);
                    }
                }
            });
        }
    };

    // ==========================================
    // ?�랙 관???�션
    // ==========================================
    //마스???�랙 (?�정 불�?, 고정 ?�더�?
    const masterTrack = ref<TrackUIState>({
        trackId: 999999,
        name: "마스???�랙",
        type: "AUDIO",
        preTrackId: null,
        postTrackId: null,
        volume: 0,
        pan: 0,
        isMuted: false,
        isSoloed: false,
        clips: [],
        height: 100,
        isSelected: false,
        eq: createDefaultTrackEq(),
    });

    // ?�반 ?�랙??변?��? ?�길 ?�마??마스???�랙???�시�?병합!
    // [최적?? JSON.parse(JSON.stringify())�??�거?�고 ?�요???�성�??��? 복사?�니??
    // 기존 방식?� 300�??�랙???�립??모두 직렬?�→??��?�화?�면??메인 ?�레?��? ?�십ms 블로?�했?�니??
    watch(() => trackList.value, (newTrackList) => {
        const mergedClips: ClipUIState[] = [];

        newTrackList.forEach(track => {
            track.clips.forEach(clip => {
                mergedClips.push({
                    clipId: clip.clipId + 9000000,
                    start: clip.start,
                    duration: clip.duration,
                    audioStartMs: clip.audioStartMs,
                    audioDurationMs: clip.audioDurationMs,
                    color: '#4b4b4b',
                    audio: clip.audio ? { ...clip.audio } : undefined as any,
                    isSelected: false,
                    isDragging: false,
                    isLocked: false,
                });
            });
        });

        masterTrack.value.clips = mergedClips;
    }, { deep: true, immediate: true });

    // ?�랙 추�? ?�청 로컬 ?�태
    const pendingTrackAddCount = ref(0);

    //?�로???�랙 추�? ?�션
    const addTrack = () => {
        const newTrackName = `?�랙 ${trackList.value.length + 1}`;
        //  console.log(`[?�신] ?�랙 추�?(TRACK_ADD) ?�청 ?�송`);

        pendingTrackAddCount.value++;
        socketService.publish('TRACK_ADD', {
            projectId: projectInfo.value.projectId,
            name: newTrackName,
            type: "audio"
        });
    };

    // ==========================================
    // ?�디??출력 ?�태 ?�기??(Solo / Mute ?�합 관�?
    // ==========================================
    const syncEffectiveMuteStates = () => {
        const isAnySoloed = trackList.value.some(t => t.isSoloed);

        trackList.value.forEach(t => {
            const vol = trackVolumes.get(t.trackId);
            if (vol) {
                if (isAnySoloed) {
                    // ?�로 모드???? ?�재 ?�랙???�로가 ?�니거나, ?��? ?�로?�라??명시?�으�??�소거된 ?�태�??�리�??�니??
                    vol.mute = !t.isSoloed || t.isMuted;
                } else {
                    // ?�로 모드가 ?�닐 ?? ?�랙???�소�??�태�?그�?�??�릅?�다.
                    vol.mute = t.isMuted;
                }
            }
        });
    };

    // ?�랙 ?�소�?Mute) ?��?
    const toggleTrackMute = (trackId: number) => {
        if (trackId === 999999) return;
        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track) return;

        track.isMuted = !track.isMuted;
        syncEffectiveMuteStates();

        socketService.publish('TRACK_MUTE_CHANGE', {
            projectId: projectInfo.value.projectId,
            trackId: trackId,
            isMuted: track.isMuted
        });
    };

    // ?�랙 ?�로(Solo) ?��?
    const toggleTrackSolo = (trackId: number) => {
        if (trackId === 999999) return;
        const targetTrack = trackList.value.find(t => t.trackId === trackId);
        if (!targetTrack) return;

        const isTurningOn = !targetTrack.isSoloed;

        if (isTurningOn) {
            trackList.value.forEach(t => {
                if (t.trackId !== trackId && t.isSoloed) {
                    t.isSoloed = false;
                    // solo ?�태 변경�? syncEffectiveMuteStates?�서 mute�??�괄 처리
                    socketService.publish('TRACK_SOLO_CHANGE', {
                        projectId: projectInfo.value.projectId,
                        trackId: t.trackId,
                        isSoloed: false
                    });
                }
            });
        }

        targetTrack.isSoloed = isTurningOn;

        syncEffectiveMuteStates();

        socketService.publish('TRACK_SOLO_CHANGE', {
            projectId: projectInfo.value.projectId,
            trackId: trackId,
            isSoloed: targetTrack.isSoloed
        });
    };

    // ?�랙 볼륨 조절 (-60dB ~ 6dB)
    const setTrackVolume = (trackId: number, volume: number, emitSocket: boolean = true) => {
        if (trackId === 999999) {
            masterTrack.value.volume = volume;
            masterVolume.volume.value = volume;
            return;
        }

        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track) return;

        track.volume = volume;
        const vol = trackVolumes.get(trackId);
        if (vol) vol.volume.value = volume;

        if (emitSocket) {
            socketService.publish('TRACK_VOLUME_CHANGE', {
                projectId: projectInfo.value.projectId,
                trackId: trackId,
                volume: volume
            });
        }
    };

    // 볼륨 UI 0dB 매핑 (80% 지?�에 ?�치)
    const getVolumePercent = (vol: number) => {
        if (vol <= 0) {
            return ((vol + 60) / 60) * 80;
        } else {
            return 80 + (vol / 6) * 20;
        }
    };

    const getVolumeFromPercent = (percent: number) => {
        if (percent <= 80) {
            return (percent / 80) * 60 - 60;
        } else {
            return ((percent - 80) / 20) * 6;
        }
    };

    // ?�랙 ?�닝 조절 (-100 ~ 100)
    const setTrackPan = (trackId: number, pan: number, emitSocket: boolean = true) => {
        // console.log(`[?�닝 ?�버�? setTrackPan ?�출! trackId=${trackId}, pan=${pan}`);
        if (trackId === 999999) {
            masterTrack.value.pan = pan;
            masterPanner.pan.value = pan / 100;
            // console.log(`[?�닝 ?�버�? 마스???�너 ?�용 ?�료: masterPanner.pan.value=${masterPanner.pan.value}`);
            return;
        }

        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track) {
            //  console.error(`[?�닝 ?�버�? ?�랙??찾을 ???�음! trackId=${trackId}`);
            return;
        }

        track.pan = pan;
        const panner = trackPanners.get(trackId);
        if (panner) {
            panner.pan.value = pan / 100;
            //  console.log(`[?�닝 ?�버�? ?�랙 ${trackId} ?�너 ?�용 ?�료: panner.pan.value=${panner.pan.value}`);
        } else {
            // console.error(`[?�닝 ?�버�? ?�랙 ${trackId}??panner�?trackPanners Map?�서 찾을 ???�음!`);
            // console.log(`[?�닝 ?�버�? ?�재 trackPanners ??목록:`, [...trackPanners.keys()]);
            // console.log(`[?�닝 ?�버�? ?�재 trackVolumes ??목록:`, [...trackVolumes.keys()]);
        }

        if (emitSocket) {
            socketService.publish('TRACK_PAN_CHANGE', {
                projectId: projectInfo.value.projectId,
                trackId: trackId,
                pan: pan
            });
        }
    };

    //?�랙 ??�� 기능
    const deleteTrack = (trackId: number) => {
        if (trackId === 999999) return;
        // console.log(`[?�신] 백엔?�에 ?�랙 ??��(TRACK_DELETE) ?�청 ?�송`);

        socketService.publish('TRACK_DELETE', {
            projectId: projectInfo.value.projectId,
            trackId: trackId
        });

        pushCommand({
            undo: () => {
                alert("?�랙 ??��???�돌�????�습?�다.");
            },
            redo: () => { }
        });
    };

    // ?�랙 ?�름 변�?로직
    const renameTrack = (trackId: number, newName: string) => {
        if (trackId === 999999) return;
        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track || track.name === newName) return;

        track.name = newName; // UI 즉각 반영

        //  console.log(`[?�신] 백엔?�에 ?�랙 ?�름 변�?TRACK_RENAME) ?�청 ?�송`);
        socketService.publish('TRACK_RENAME', {
            projectId: projectInfo.value.projectId,
            trackId: trackId,
            name: newName
        });
    };

    // ?�랙 ?�서 변�?로직
    const reorderTrack = (draggedTrackId: number, targetIndex: number) => {
        if (draggedTrackId === 999999) return;

        const draggedIndex = trackList.value.findIndex(t => t.trackId === draggedTrackId);
        if (draggedIndex === -1 || draggedIndex === targetIndex) return;

        const [track] = trackList.value.splice(draggedIndex, 1);
        trackList.value.splice(targetIndex, 0, track);

        const preTrackId = targetIndex > 0 ? trackList.value[targetIndex - 1].trackId : null;
        const postTrackId = targetIndex < trackList.value.length - 1 ? trackList.value[targetIndex + 1].trackId : null;

        //  console.log(`[?�신] 백엔?�에 ?�랙 ?�서 변�?TRACK_REORDER) ?�청 ?�송`);
        socketService.publish('TRACK_REORDER', {
            projectId: projectInfo.value.projectId,
            trackId: draggedTrackId,
            preTrackId: preTrackId,
            postTrackId: postTrackId
        });
    };

    // ==========================================
    // 3. ?�션(Action) ?�언(?�이???�칭 �?가�?
    // ==========================================

    // ?�래�????�롭 종료 ???�버 ?�정 ?�신
    const confirmMoveClip = (clipId: number, targetTrackId: number, targetStartBar: number, origTrackId?: number, origStartBar?: number) => {
        // console.log(`[?�신] 백엔?�에 ?�립 ?�동(CLIP_MOVE) ?�청 ?�송`);

        socketService.publish('CLIP_MOVE', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            targetTrackId: targetTrackId,
            targetStartBar: targetStartBar
        });

        if (origTrackId !== undefined && origStartBar !== undefined) {
            pushCommand({
                undo: () => {
                    const targetTrack = trackList.value.find(t => t.trackId === targetTrackId);
                    if (!targetTrack) return;
                    const clip = targetTrack.clips.find(c => c.clipId === clipId);
                    if (clip) {
                        lockClip(clipId, origTrackId);
                        moveClipToTrack(clipId, targetTrackId, origTrackId);
                        clip.start = origStartBar;
                        resyncClip(clipId, origStartBar);
                        setTimeout(() => {
                            socketService.publish('CLIP_MOVE', {
                                projectId: projectInfo.value.projectId,
                                clipId: clipId,
                                targetTrackId: origTrackId,
                                targetStartBar: origStartBar
                            });
                            setTimeout(() => unlockClip(clipId, origTrackId), 100);
                        }, 100);
                    }
                },
                redo: () => {
                    const origTrack = trackList.value.find(t => t.trackId === origTrackId);
                    if (!origTrack) return;
                    const clip = origTrack.clips.find(c => c.clipId === clipId);
                    if (clip) {
                        lockClip(clipId, targetTrackId);
                        moveClipToTrack(clipId, origTrackId, targetTrackId);
                        clip.start = targetStartBar;
                        resyncClip(clipId, targetStartBar);
                        setTimeout(() => {
                            socketService.publish('CLIP_MOVE', {
                                projectId: projectInfo.value.projectId,
                                clipId: clipId,
                                targetTrackId: targetTrackId,
                                targetStartBar: targetStartBar
                            });
                            setTimeout(() => unlockClip(clipId, targetTrackId), 100);
                        }, 100);
                    }
                }
            });
        }
    };

    //?�립???�른 ?�랙?�로 ?�동?�키???�수 (?�론???�더�?지?�, ?�수 ?�신 ?�리거로 ?�용 가??
    const moveClipToTrack = (clipId: number, fromTrackId: number, toTrackId: number) => {
        if (fromTrackId === toTrackId) return;
        // ?�제 ?�면 즉시 반영 로직?� ?�고, ?�요?�다�?백엔??publish�??�임?�니??
        // ?�래�??�벤?�는 confirmMoveClip?�서 처리?��?�?비워?�니??
    };
    // ?�버그용 변??(로그 ??�� 방�???
    let debugLoopCount = 0;

    let lastTransportSeconds = 0;
    let playbackStartTransportSec = 0;

    //?�생 ?�태 ?��? ?�수
    const togglePlay = () => {
        try {
            if (!isPlaying.value) {
                const offsetTime = playheadPosition.value * secondsPerBar.value;
                playbackStartTransportSec = offsetTime;

                if (!isNaN(offsetTime) && isFinite(offsetTime)) {
                    Tone.getTransport().start("+0.05", offsetTime);
                } else {
                    Tone.getTransport().start("+0.05");
                }

                isAutoScrollActive.value = true;
                isPlaying.value = true;
                updatePlayheadLoop();
                scrollAnimationLoop();
            } else {
                Tone.getTransport().pause();

                // Tone.js 버그 보완: ?�립 ?�작 지?�에???�확???�시?��? ?? 
                // ?��?줄링 ?�약(+0.05) �?lookAhead�??�해 ?��? Web Audio API??
                // ?�약???�디???�드가 멈추지 ?�는 ?�상(고스???�생)??강제�??��??�킵?�다.
                clipPlayers.forEach(player => {
                    if (player.state === "started") {
                        player.stop();
                    }
                });

                isAutoScrollActive.value = true;
                isPlaying.value = false;
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
                if (scrollRAFId) cancelAnimationFrame(scrollRAFId);
                // ?�시?��? ???�각???�치�??��??�기 ?�해 강제 보정???��? ?�습?�다.
                // playheadPosition.value???��? updatePlayheadLoop???�해 ?�각??지??latency)??반영???�태?�니??
            }
        } catch (e) {
            // console.error("?�생 ?�러:", e);
        }
    };

    // ?�일 ?�립 ?�디???�레?�어 로딩 ?�수 (?�적 Culling ?�??미리 로드?�여 ??방�?)
    // [최적??& EQ병합] 캐시??AudioBuffer�?직접 주입?�여 중복 ?�트?�크 ?�운로드+?�코?�을 ?�전 ?�거?�고, EQ ?�드 체인 ?�결
    const loadClipPlayer = async (clip: ClipUIState, trackId: number) => {
        if (!clip.audio?.cdnUrl) return;

        if (!clipPlayers.has(clip.clipId)) {
            try {
                // 1. 최적?? 캐시?�서 AudioBuffer�?가?�오거나, ?�으�???번만 fetch+decode
                const audioBuffer = await fetchAndCacheAudioBuffer(clip.audio.cdnUrl);

                // await ???�른 곳에???��? ?�록?�을 ???�으므�?중복 체크
                if (clipPlayers.has(clip.clipId)) return;

                // 2. 최적?? 버퍼�?주입?�여 Player ?�성 (?�트?�크 ?�운로드 �??�코??X)
                const newPlayer = new Tone.Player(audioBuffer);
                newPlayer.fadeIn = 0;
                newPlayer.fadeOut = 0;

                // 3. EQ 체인 ?�결
                connectPlayerToTrack(newPlayer, trackId);

                // Tone.js sync ?�생 ?�프??버그 ?�치 ?�용
                patchTonePlayerForSync(newPlayer);

                clipPlayers.set(clip.clipId, newPlayer);

                const exactStartTimeSec = clip.start * secondsPerBar.value;
                const audioOffsetSec = clip.audioStartMs / 1000;
                const visualDurationSec = clip.duration * secondsPerBar.value;
                const sourceAudioSec = clip.audioDurationMs / 1000;

                // ?�치?�서 ?�용???�본 ?�프?�과 길이�??�??
                (newPlayer as any).customOriginalOffset = audioOffsetSec;
                (newPlayer as any).customSourceAudioSec = sourceAudioSec;

                newPlayer.playbackRate = visualDurationSec > 0 ? sourceAudioSec / visualDurationSec : 1;
                // Tone.js???��??�으�?duration/playbackRate�??�제 ?�생 길이�?계산?��?�?
                // sourceAudioSec�??�기�??�확??visualDurationSec 만큼 ?�생 ???��?
                newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, sourceAudioSec);
                // Transport???�태 관리�? ?�해 ?�각???��??�에 명시?�으�?stop???�록 (?�립 밖으�??�생?�드 ?�동 ??고스???�생 방�?)
                newPlayer.sync().stop(exactStartTimeSec + visualDurationSec);
            } catch (e) {
                // console.error("[Audio Load Error]:", e);
                disposeClipAudio(clip.clipId); // EQ 기능???�전 ?�제 ?�수 ?�용
            }
        }
    };

    // [?�능 최적?? ?�생�?UI ?�데?�트 루프
    // Vue 반응??ref) ?�??DOM??직접 조작?�여 초당 1,300???�상??Vue re-render�??�천 차단
    let lastReactiveUpdate = 0; // PlayController ?�스?�레?�용 마�?�?갱신 ?�각
    const REACTIVE_UPDATE_INTERVAL = 250; // PlayController(마디/박자 ?�시)??250ms마다�?갱신 (4fps)

    // ?�용?��? ?�?�라???�크?�빙(?�래�??�로 ?�생바�? ??�� ?? ?��? ?�태?�면 즉시 DOM ?�치 ?�기??
    watch(playheadPosition, (newBar) => {
        if (!isPlaying.value) {
            const px = newBar * pixelPerBar.value;
            document.documentElement.style.setProperty('--playhead-px', `${px}px`);

            // updatePlayheadLoop??stopPlay?�서 ?�라??transform????��?�웠�??�문??
            // ?�기?�도 직접 .playhead-line??transform??갱신??주어???�니??
            const playheadEls = document.querySelectorAll('.playhead-line') as NodeListOf<HTMLElement>;
            for (let i = 0; i < playheadEls.length; i++) {
                playheadEls[i].style.transform = `translate3d(calc(${px}px - 50%), 0, 0)`;
            }

            // ?��? ?�태 ?�크?�빙 ??진행 ?�버?�이 갱신
            const clipEls = document.querySelectorAll('.clip-container') as NodeListOf<HTMLElement>;
            for (let i = 0; i < clipEls.length; i++) {
                const clipEl = clipEls[i];
                const clipLeft = parseFloat(clipEl.style.left) || 0;
                const clipWidth = parseFloat(clipEl.style.width) || 0;
                if (clipWidth <= 0) continue;
                const progressPx = Math.max(0, Math.min(px - clipLeft, clipWidth));
                clipEl.style.setProperty('--progress-px', `${progressPx}px`);
            }
        }
    });

    let lastFrameTime = performance.now();
    let loopFrameCount = 0;
    // [최적?? ?�크�?목표값을 별도 변?�에 기록?�고, ?�크�??�기???�립 루프?�서 처리
    let pendingScrollLeft = -1;
    let scrollRAFId = 0;

    // ?�크�??�기 ?�용 ?�립 루프 (?�생�??�더�?루프?� ?�전 분리)
    // scrollLeft = value ?�출??브라?��? Layout Reflow�?강제 ?�리거하??
    // ?�생�??�니메이?�을 30~40ms??멈추�?만드??것을 방�??�니??
    const scrollAnimationLoop = () => {
        if (!isPlaying.value) return;
        if (pendingScrollLeft >= 0 && timelineContainer) {
            timelineContainer.scrollLeft = pendingScrollLeft;
            pendingScrollLeft = -1;
        }
        scrollRAFId = requestAnimationFrame(scrollAnimationLoop);
    };

    // Long Task ?�집 배열
    const longTasks: any[] = [];
    if (typeof window !== 'undefined' && window.PerformanceObserver) {
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    longTasks.push(entry);
                    if (longTasks.length > 50) longTasks.shift(); // 메모�??�수 방�?
                }
            });
            observer.observe({ entryTypes: ['longtask'] });
        } catch (e) {
            //  console.error("Long Task Observer 초기???�패", e);
        }
    }

    const updatePlayheadLoop = () => {
        if (!isPlaying.value) return;

        loopFrameCount++;
        const loopStart = performance.now();
        const timeSinceLastFrame = loopStart - lastFrameTime;
        lastFrameTime = loopStart;

        // ?�레???�랍 감�? (30ms ?�상 지?�되�?멈칫거림?�로 간주)
        if (timeSinceLastFrame > 30 && loopFrameCount > 10) {
            // console.warn(`?�� [?�레???�랍 감�?] 루프 지???�간: ${timeSinceLastFrame.toFixed(2)}ms`);

            // Long Task API�??�해 직전??메인 ?�레?��? 막�? ?�인??분석
            if (longTasks.length > 0) {
                const lastTask = longTasks[longTasks.length - 1];
                //                 console.warn(`?�� [?�인 분석] 최근 Long Task 발견: 
                // - ?�요 ?�간: ${lastTask.duration.toFixed(2)}ms
                // - ?�인(name): ${lastTask.name}
                // - 발생 ?�점: ${lastTask.startTime.toFixed(2)}
                // - 기여 ?�인:`, lastTask.attribution ? lastTask.attribution.map((a: any) => a.name + ' (' + a.containerType + ')').join(', ') : '?�음');
            }
        }

        const currentSeconds = Tone.getTransport().seconds;

        // Seek 감�? (?�?�라???�릭 ?�으�?Transport ?�간???�게 ?�프?�을 ??
        if (Math.abs(currentSeconds - lastTransportSeconds) > 0.5) {
            playbackStartTransportSec = currentSeconds;
        }
        lastTransportSeconds = currentSeconds;

        let hardwareLatency = 0;
        if (Tone.context && Tone.context.rawContext) {
            const raw = Tone.context.rawContext as any;
            hardwareLatency = (raw.outputLatency || 0) + (raw.baseLatency || 0);
        }

        // 브라?��? API가 지???�간??0 ?�는 비정?�적?�로 ?�게 반환?�는 경우(Windows Chrome ??�??�비해
        // 최소 60ms(0.06�???기본 물리??출력 지??Fallback)??보정?�니??
        if (hardwareLatency < 0.03) {
            hardwareLatency = 0.06;
        }

        // ?�용?��? ?�정???�동 보정�??�산
        hardwareLatency += manualLatencyOffset.value;

        // ?�이?�시 보정: 출력 지???�간만큼 ?�생바�? ?�로 ??��?�다.
        // 처음 ?�작 ?�치보다 ?�생바�? ?�로 ?�프?�는 것을 방�??�기 ?�해 ?�한값을 ?�정?�니??
        const compensatedSeconds = Math.max(playbackStartTransportSec, currentSeconds - hardwareLatency);

        const currentPositionBar = compensatedSeconds / secondsPerBar.value;
        const px = currentPositionBar * pixelPerBar.value;

        // [최적?? ?�역 CSS 변??--playhead-px)�?:root???�정?�면 브라?��? ?�체??Style Recalculation??발생?�여 ?�레???�랍???�깁?�다.
        // ?�재 가???�크롤이 ?�용?�어 DOM ?�드가 극소?�이므�? 직접 주입?�는 것이 100�?빠릅?�다.
        const playheadEls = document.getElementsByClassName('playhead-line') as HTMLCollectionOf<HTMLElement>;
        for (let i = 0; i < playheadEls.length; i++) {
            playheadEls[i].style.transform = `translate3d(calc(${px}px - 50%), 0, 0)`;
        }

        const clipEls = document.getElementsByClassName('clip-container') as HTMLCollectionOf<HTMLElement>;
        for (let i = 0; i < clipEls.length; i++) {
            clipEls[i].style.setProperty('--playhead-px', `${px}px`);
        }

        // 1-1. ?�크�??�치 계산�??�행 (DOM ?�기??scrollAnimationLoop?�서 분리 처리)
        if (cachedClientWidth > 0 && isAutoScrollActive.value) {
            const relativeX = px - cachedScrollLeft;
            const threshold = cachedClientWidth * 0.7;
            if (relativeX > threshold) {
                const targetScrollLeft = px - threshold;
                const lerpFactor = 0.12;
                cachedScrollLeft = cachedScrollLeft + (targetScrollLeft - cachedScrollLeft) * lerpFactor;
                pendingScrollLeft = cachedScrollLeft;
            }
        }

        // 2. DOM 직접 ?�데?�트 (Vue 반응???�더�??�톰 방�?)
        const now = performance.now();
        if (now - lastReactiveUpdate > REACTIVE_UPDATE_INTERVAL) {
            playheadPosition.value = currentPositionBar; // ?��? ???�른 ?�존?�을 ?�해 값�? 갱신?�둠
            lastReactiveUpdate = now;

            // DOM??직접 찾아 ?�스?�만 교체 (Vue 컴포?�트 ?�더 ?�이???�회)
            const barTextEl = document.getElementById('playhead-bar-text');
            const beatTextEl = document.getElementById('playhead-beat-text');
            const displayEl = document.getElementById('playhead-position-display');

            if (barTextEl && beatTextEl && projectInfo.value) {
                const numerator = projectInfo.value.timeSigNumerator || 4;
                const bar = Math.floor(currentPositionBar) + 1;
                const beat = Math.floor((currentPositionBar % 1) * numerator) + 1;

                barTextEl.textContent = String(bar).padStart(2, '0');
                beatTextEl.textContent = String(beat);

                if (displayEl) {
                    const total = String(projectInfo.value.totalBarCount).padStart(2, '0');
                    displayEl.setAttribute('aria-label', `?�재 ?�생 ?�치: ${barTextEl.textContent}마디 ${beat}박자, ?�체 ${total}마디`);
                }
            }
        }

        // ?�재 루프 ?�행??걸린 ?�간 측정
        const totalLoopTime = performance.now() - loopStart;
        if (totalLoopTime > 15) {
            // console.error(`?�� [루프 ?�체 병목] updatePlayheadLoop ?�행??${totalLoopTime.toFixed(2)}ms ?�요!`);
        }

        if (currentPositionBar >= projectInfo.value.totalBarCount) {
            // console.log("?�️ [?�생 종료] ?�까지 ?�달?�여 ?��??�니??");
            stopPlay();
            return;
        }

        animationFrameId = requestAnimationFrame(updatePlayheadLoop);
    }

    // ?�전 ?��? (처음?�로 ?�돌�?
    const stopPlay = () => {
        Tone.getTransport().stop();
        isAutoScrollActive.value = true;
        isPlaying.value = false;
        playheadPosition.value = 0;
        cancelAnimationFrame(animationFrameId);
        if (scrollRAFId) cancelAnimationFrame(scrollRAFId);
        // DOM 직접 조작: ?�생바�? 처음 ?�치�?리셋
        const playheadEls = document.querySelectorAll('.playhead-line') as NodeListOf<HTMLElement>;
        for (let i = 0; i < playheadEls.length; i++) {
            playheadEls[i].style.transform = `translate3d(calc(0px - 50%), 0, 0)`;
        }
        // ?�생�??�버?�이??모두 리셋
        const clipEls = document.querySelectorAll('.clip-container') as NodeListOf<HTMLElement>;
        for (let i = 0; i < clipEls.length; i++) {
            clipEls[i].style.setProperty('--progress-px', `0px`);
        }

        // ?�?�라???�크�??�치�?�?처음(0)?�로 부?�럽�?복�?
        if (timelineContainer) {
            timelineContainer.scrollTo({ left: 0, behavior: 'smooth' });
        }
    };

    //마우????방향???�라 �?배율??조절?�는 ?�수
    const updateZoom = (deltaY: number) => {
        const zoomStep = 0.1; //??�??�을 굴릴 ??변?�는 배율(10%)

        if (deltaY > 0) {
            zoomlevel.value = Math.max(0.1, zoomlevel.value - zoomStep);
        } else {
            zoomlevel.value = Math.min(3, zoomlevel.value + zoomStep);
        }
    }

    //?�디???�일 로딩 �?Transport 조절 ?�수
    const setupAudioEngine = async (tracks: TrackUIState[]) => {
        // console.log("========== [Audio Engine Setup Start] ==========");

        for (const track of tracks) {
            if (!trackVolumes.has(track.trackId)) {
                const panner = new Tone.Panner(track.pan / 100).connect(masterVolume);
                const vol = new Tone.Volume(track.volume).connect(panner);

                panner.channelCount = 2;
                panner.channelCountMode = "explicit";
                vol.channelCount = 2;
                vol.channelCountMode = "explicit";

                trackVolumes.set(track.trackId, vol);
                trackPanners.set(track.trackId, panner);
                // console.log(`[Setup] ?�랙 ${track.trackId} ('${track.name}') 믹서 ?�드 ?�성 ?�료. vol:`, vol, "panner:", panner);
            }

            rebuildTrackEqChain(track.trackId);
        }

        for (const track of tracks) {
            const vol = trackVolumes.get(track.trackId);
            if (!vol) continue;

            for (const clip of track.clips) {
                if (!clip.audio?.cdnUrl) {
                    // console.warn(`[Setup ?�️] ?�립 ${clip.clipId}???�디??URL???�어 로딩 건너?�.`);
                    continue;
                }
                //  console.log(`[Setup] ?�립 ${clip.clipId} ?�디??로딩 ?�도 �?..`);
                try {
                    // [최적?? 캐시?�서 AudioBuffer�?가?�오거나 ??번만 fetch+decode
                    const audioBuffer = await fetchAndCacheAudioBuffer(clip.audio.cdnUrl);

                    // 버퍼�??�용??Player ?�성 (?�트?�크 ?�운로드 X)
                    const player = new Tone.Player(audioBuffer);
                    player.fadeIn = 0;
                    player.fadeOut = 0;

                    // EQ ?�드�?체인?�로 ?�결
                    connectPlayerToTrack(
                        player,
                        track.trackId,
                    );

                    patchTonePlayerForSync(player);

                    // console.log(`[Setup] ?�립 ${clip.clipId} ?�디??로드 ?�공. (버퍼길이: ${player.buffer.duration.toFixed(2)}�?`);

                    const exactStartTimeSec = clip.start * secondsPerBar.value;
                    const audioOffsetSec = (clip.audioStartMs || 0) / 1000;
                    const visualDurationSec = clip.duration * secondsPerBar.value;
                    const sourceAudioSec = clip.audioDurationMs / 1000;

                    (player as any).customOriginalOffset = audioOffsetSec;
                    (player as any).customSourceAudioSec = sourceAudioSec;

                    player.playbackRate = visualDurationSec > 0 ? sourceAudioSec / visualDurationSec : 1;
                    player.sync().start(exactStartTimeSec, audioOffsetSec, sourceAudioSec);
                    player.sync().stop(exactStartTimeSec + visualDurationSec);
                    clipPlayers.set(clip.clipId, player);
                } catch (error) {
                    // console.error(`[Setup ?��] ?�립 ${clip.clipId} 로드 ?�패:`, error);
                    disposeClipAudio(clip.clipId);
                }
            }
        }
        // console.log("========== [Audio Engine Setup End] ==========");
    }

    // ?�로?�트 진입 ??기존 ?�디???�원 ?�벽 초기??(?�령 ?�디?? 중복 ?��?줄링 ?�수 방�?)
    const disposeAllAudio = () => {
        // console.log("========== [Audio Engine Cleanup Start] ==========");
        clipPlayers.forEach((player, clipId) => {
            player.unsync();
            player.dispose();
            // console.log(`[Dispose] ?�령 ?�립 방�?: ?�립 ${clipId} ?�디???�원 ?�제 ?�료`);
        });
        clipPlayers.clear();

        // ?�랙 볼륨/?�너 ?�드???�께 초기?�하??메모�??�수 ?�벽 차단
        trackVolumes.forEach(vol => vol.dispose());
        trackVolumes.clear();

        trackPanners.forEach(panner => panner.dispose());
        trackPanners.clear();

        // EQ/분석 ?�드 ?�리
        trackEqNodes.forEach(nodes => nodes.forEach(node => node.filter.dispose()));
        trackEqNodes.clear();
        trackAnalyzers.forEach(analyzer => analyzer.dispose());
        trackAnalyzers.clear();

        // console.log("========== [Audio Engine Cleanup End] ==========");
    };

    //?�립 ?�치가 변경되?�을 ???�디???�진 ?��?줄을 ?�설???�는 ?�수
    const resyncClip = (clipId: number, newStartBar: number) => {
        // console.log(`  ?��? [Resync] ?�립 ID ${clipId} ?�동기화 ?�작 (???�치: ${newStartBar}마디)`);

        const player = clipPlayers.get(clipId);
        if (!player) {
            // console.error(`  ?��? [Resync ?��] ?�립 ID ${clipId}???�디???�레?�어�?찾을 ???�습?�다! (?�령 ?�립)`);
            return;
        }

        let targetClip: ClipUIState | null = null;
        for (const track of trackList.value) {
            const found = track.clips.find(c => c.clipId === clipId);
            if (found) {
                targetClip = found;
                break;
            }
        }

        if (!targetClip) {
            // console.error(`  ?��? [Resync ?��] ?�랙 리스?�에???�립 ?�이?��? 찾을 ???�습?�다!`);
            return;
        }

        player.unsync();
        player.stop();

        const exactStartTimeSec = newStartBar * secondsPerBar.value;
        const audioOffsetSec = (targetClip.audioStartMs || 0) / 1000;
        const visualDurationSec = targetClip.duration * secondsPerBar.value;
        const sourceAudioSec = targetClip.audioDurationMs / 1000;

        (player as any).customOriginalOffset = audioOffsetSec;
        (player as any).customSourceAudioSec = sourceAudioSec;

        const rate = visualDurationSec > 0 ? sourceAudioSec / visualDurationSec : 1;
        player.playbackRate = rate;

        if (visualDurationSec > 0) {
            player.sync().start(exactStartTimeSec, audioOffsetSec, sourceAudioSec);
            player.sync().stop(exactStartTimeSec + visualDurationSec);
            //  console.log(`  ?��? [Resync] ?��?줄링 ?�록 ?�료! (?�태: ?�상)`);
        } else {
            //  console.error(`  ?��? [Resync ?��] ?�생 길이(safeDurationSec)가 0 ?�하?�니?? ?��?줄링 ?�패.`);
        }
    };

    // ==========================================
    // BPM 변�????�체 ?�립 ?�스케줄링
    // ==========================================
    // BPM??바뀌면 secondsPerBar가 바뀌�?�? ?��? player.sync().start()�??�록??
    // ?�생 길이(�?가 ??BPM 기�??�라 불일치�? 발생?�니??
    // ???�수??모든 clipPlayer�?unsync?�재계산?�재?�록?�여 ?�기?�합?�다.
    const resyncAllClips = () => {
        for (const [clipId, player] of clipPlayers) {
            // ?�립 ?�이?��? trackList?�서 ??��??
            let targetClip: ClipUIState | null = null;
            for (const track of trackList.value) {
                const found = track.clips.find(c => c.clipId === clipId);
                if (found) {
                    targetClip = found;
                    break;
                }
            }

            if (!targetClip) continue;

            // 기존 ?��?�??�제
            player.unsync();
            player.stop();

            // ??secondsPerBar 기�??�로 ?�계??
            const exactStartTimeSec = targetClip.start * secondsPerBar.value;
            const audioOffsetSec = (targetClip.audioStartMs || 0) / 1000;
            const visualDurationSec = targetClip.duration * secondsPerBar.value;
            // BPM???�른 ?�생 ?�도 조절
            const sourceAudioSec = targetClip.audioDurationMs / 1000;

            (player as any).customOriginalOffset = audioOffsetSec;
            (player as any).customSourceAudioSec = sourceAudioSec;

            const rate = visualDurationSec > 0 ? sourceAudioSec / visualDurationSec : 1;
            player.playbackRate = rate;

            console.log(`[resyncAll] clipId=${clipId}, rate=${rate.toFixed(3)}, visualDur=${visualDurationSec.toFixed(2)}s, sourceDur=${sourceAudioSec.toFixed(2)}s`);

            if (visualDurationSec > 0) {
                player.sync().start(exactStartTimeSec, audioOffsetSec, sourceAudioSec);
                player.sync().stop(exactStartTimeSec + visualDurationSec);
            }
        }
    };

    const addTrackEqBand = (
        trackId: number,
        payload: {
            frequencyHz: number
            gainDeltaDb: number
        },
    ) => {
        const track = trackList.value.find(track => track.trackId === trackId)
        if (!track) return

        const currentBands = track.eq?.bands ?? []

        if (currentBands.length >= MAX_EQ_BANDS) {
            //  console.warn('EQ 밴드??최�? 5개까지�?추�??????�습?�다.')
            return
        }

        const nextBandOrder =
            currentBands.length > 0
                ? Math.max(...currentBands.map(band => band.bandOrder)) + 1
                : 1

        const nextBand: TrackEqBandState = {
            bandOrder: nextBandOrder,
            eqTypeCode: 1,
            frequencyHz: clampFrequency(payload.frequencyHz),
            q: 1,
            gainDeltaDb: clampGain(payload.gainDeltaDb),
            sourceTypeCode: 2,
            jobId: null,
            suggestionActionId: null,
            appliedSuggestionId: null,
        }

        track.eq = {
            bands: [
                ...currentBands,
                nextBand,
            ],
        }

        rebuildTrackEqChain(trackId)
    }

    const updateTrackEqBand = (
        trackId: number,
        bandOrder: number,
        patch: Partial<TrackEqBandState>,
    ) => {
        const track = trackList.value.find(track => track.trackId === trackId)
        if (!track?.eq) return

        const nextBands = track.eq.bands.map((band): TrackEqBandState => {
            if (band.bandOrder !== bandOrder) return band

            return {
                ...band,
                ...patch,
                frequencyHz: patch.frequencyHz !== undefined
                    ? clampFrequency(patch.frequencyHz)
                    : band.frequencyHz,
                gainDeltaDb: patch.gainDeltaDb !== undefined
                    ? clampGain(patch.gainDeltaDb)
                    : band.gainDeltaDb,
                q: patch.q !== undefined
                    ? clampQ(patch.q)
                    : band.q,
            }
        })

        const updatedBand = nextBands.find(band => band.bandOrder === bandOrder)

        if (!updatedBand) return

        track.eq = {
            bands: nextBands,
        }

        const nodes = trackEqNodes.get(trackId)
        const targetNode = nodes?.find(node => node.bandOrder === bandOrder)

        if (targetNode) {
            targetNode.filter.frequency.rampTo(updatedBand.frequencyHz, 0.03)
            targetNode.filter.gain.rampTo(updatedBand.gainDeltaDb, 0.03)
            targetNode.filter.Q.value = updatedBand.q
        }
        else {
            rebuildTrackEqChain(trackId)
        }
    }

    const removeTrackEqBand = (
        trackId: number,
        bandOrder: number,
    ) => {
        const track = trackList.value.find(track => track.trackId === trackId)
        if (!track?.eq) return

        const nextBands = track.eq.bands
            .filter(band => band.bandOrder !== bandOrder)
            .map((band, index) => ({
                ...band,
                bandOrder: index + 1,
            }))

        track.eq = {
            bands: nextBands,
        }

        rebuildTrackEqChain(trackId)
    }

    const getTrackSpectrum = (trackId: number): number[] => {
        const analyzer = trackAnalyzers.get(trackId)

        if (!analyzer) return []

        const values = analyzer.getValue()

        return Array.from(values).map(value => {
            if (typeof value !== 'number') return -100
            if (!Number.isFinite(value)) return -100
            return value
        })
    }

    // 비동�??�수�??�언 ref 반응??
    const isLoading = ref(true);
    const fetchProject = async (projectId: number) => {
        try {
            isLoading.value = true;
            // ???�로?�트 방에 ?�어????기존 ?�디???�진??찌꺼�??�령 ?�레?�어)�?모두 ?�기
            disposeAllAudio();

            // 기존 ?�태(?�랙 목록, ?�로?�트 ?�보 ??�?초기?�하??
            // ???�로?�트 ?�더�??�에 ?�전 ?�로?�트???�여 ?�랙???�시?�는 버그(Race Condition)�??�벽??차단?�니??
            trackList.value = [];
            projectInfo.value = {
                projectId: projectId,
                name: '?�로?�트',
                tempo: 120.0,
                rootNote: 'C',
                mode: 'major',
                timeSigNumerator: 4,
                timeSigDenominator: 4,
                totalBarCount: 100
            };
            projectMembers.value = [];
            currentTotalSizeBytes.value = 0;
            bpm.value = 120;

            // 백엔???�결 ???�제 ?�신 로직?�로 복구 ?�요 
            const data = await projectApi.getProjectDetail(projectId);

            // console.log('[fetchProject] data:', data)
            // console.log('[fetchProject] data.name:', data.name)

            if (data) {
                const MIN_TOTAL_BAR_COUNT = 100
                projectInfo.value = {
                    projectId: data.projectId,
                    name: data.name ?? '?�로?�트',
                    tempo: data.tempo ?? 120,
                    rootNote: enumToRootNote[data.rootNote] || data.rootNote || 'C',
                    mode: data.mode ?? 'MAJOR',
                    timeSigNumerator: data.timeSigNumerator ?? 4,
                    timeSigDenominator: data.timeSigDenominator ?? 4,

                    // ?�심: 백엔?��? 0???�려줘도 ?�면 ?�업 ?�역?� 최소 100마디 ?�보
                    totalBarCount: Math.max(data.totalBarCount ?? 0, MIN_TOTAL_BAR_COUNT),
                }
                projectMembers.value = data.members || [];
                currentTotalSizeBytes.value = data.currentTotalSizeBytes || 0;
                bpm.value = data.tempo;

                const eqBandsByTrackId = new Map<number, TrackEqBandState[]>()

                try {
                    const trackEqs = await projectApi.getProjectTrackEqs(projectId)

                    await Promise.all(
                        trackEqs.map(async (trackEq) => {
                            const bands = await projectApi.getTrackEqBands(trackEq.trackEqId)

                            eqBandsByTrackId.set(
                                Number(trackEq.trackId),
                                [...bands]
                                    .sort((a, b) => a.bandOrder - b.bandOrder)
                                    .map(mapTrackEqBandSummaryToState),
                            )
                        }),
                    )
                } catch (eqError) {
                    console.error('[EQ bands fetch failed]', eqError)
                }

                trackList.value = data.tracks.map((track): TrackUIState => ({
                    ...track,
                    eq: {
                        bands: eqBandsByTrackId.get(Number(track.trackId)) ?? [],
                    },
                    height: 100,
                    isSelected: false,
                    clips: track.clips.map((clip): ClipUIState => ({
                        ...clip,
                        isSelected: false,
                        isDragging: false,
                        isLocked: false,
                    }))
                }));

                let maxClipEnd = 0;
                trackList.value.forEach(track => {
                    track.clips.forEach(clip => {
                        const clipEnd = clip.start + clip.duration;
                        if (clipEnd > maxClipEnd) {
                            maxClipEnd = clipEnd;
                        }
                    });
                });

                checkAndExpandTimeline(maxClipEnd);

                // nextTick???�용??DOM ?�데?�트�?보장?????�디???�진???�정?�여 ?�더�?꼬임??방�?
                await nextTick();
                try {
                    setupAudioEngine(trackList.value);
                } catch (audioError) {
                    console.warn('[AudioEngine] setupAudioEngine failed, but track loaded.', audioError);
                }
            }
        } catch (error) {
            //  console.error("?�로?�트 로딩 ?�패:", error);
        } finally {
            isLoading.value = false;
        }
    };

    // 1. ?��? ?�립???�았?????�버??Lock ?�청
    const lockClip = (clipId: number, trackId: number) => {
        myLockedClips.add(clipId); // ?��? ?�근 목록???�록 (브로?�캐?�트 ?�기차단??
        socketService.publish('CLIP_LOCK', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            isLocked: true // ?��?�?
        });
    };

    // 2. ?��? ?�립?�서 마우?��? ?�을 ???�버??Unlock ?�청
    const unlockClip = (clipId: number, trackId: number) => {
        myLockedClips.delete(clipId); // ?��? ?�근 목록?�서 ?�거
        socketService.publish('CLIP_LOCK', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            isLocked: false // ?�?�줘!
        });
    };

    const undo = () => {
        const cmd = undoStack.value.pop();
        if (cmd) {
            if (isPlaying.value) { togglePlay(); }
            cmd.undo();
            redoStack.value.push(cmd);
        }
    };

    const redo = () => {
        const cmd = redoStack.value.pop();
        if (cmd) {
            if (isPlaying.value) { togglePlay(); }
            cmd.redo();
            undoStack.value.push(cmd);
        }
    };

    // ==========================================
    // 3. ?�보?�기 (Return)
    // ==========================================
    return {
        undoStack,
        redoStack,
        pushCommand,
        undo,
        redo,
        // State
        trackList,
        projectInfo,
        isPlaying,
        playheadPosition,
        zoomlevel,
        bpm,
        secondsPerBar,
        isCommentMode,
        toggleCommentMode,

        // 구간 반복 �?메트로놈
        isLoopActive,
        loopStartBar,
        loopEndBar,
        isMetronomeActive,

        // Getters
        pixelPerBar,
        totalTimelineWidth,
        subDivision,
        displayBarCount,
        barNumberStep,
        manualLatencyOffset,

        // Actions
        fetchProject,
        isLoading,
        togglePlay,
        updateZoom,
        moveClipToTrack,
        stopPlay,
        updatePlayheadLoop,
        resyncClip,
        selectedClip,
        selectedTrackId,
        selectClip,
        selectedTarget,
        selectMasterTrack,
        deselectAll,

        // ?�립보드
        viewportLeft,
        viewportRight,
        clipboardClip,
        clipboardTrackId,
        isCutAction,
        copyClip,
        cutClip,
        pasteClip,
        deleteClip,
        duplicateClip,
        splitClip,
        resizeClip,
        confirmMoveClip,
        masterTrack,
        addTrack,
        deleteTrack,

        //?�랙 ?�택 기능
        selectTrack,

        //?�디???�로??추�?
        uploadingTrackId,
        uploadingBar,
        uploadAndAddAudioClip,

        //?�랙 ?�집?�기
        toggleTrackMute,
        toggleTrackSolo,
        setTrackVolume,
        setTrackPan,
        getVolumePercent,
        getVolumeFromPercent,
        renameTrack,
        reorderTrack,
        lockClip,
        unlockClip,
        setTimelineContainer,

        // 박자 변�?
        changeTimeSignature,

        // BPM 변�?
        changeBpm,

        // ??Key) 변�?
        changeKey,

        // [최적?? ?�형 컴포?�트(WaveformWebGL)가 ?�토??캐시???�근?�기 ?�한 ?�터?�이??
        getAudioBufferCache,
        projectMembers,
        currentTotalSizeBytes,
        fetchAndCacheAudioBuffer,
        isAutoScrollActive,

        addTrackEqBand,
        updateTrackEqBand,
        removeTrackEqBand,
        getTrackSpectrum,
        workspaceZoom,
        rebuildTrackEqChain
    };
});


