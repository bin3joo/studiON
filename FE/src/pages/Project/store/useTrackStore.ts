//API로 받아온 데이터를 가공해서 보관하는 창고
//데이터 창고 피니아
import { defineStore } from 'pinia';
//화면이 바뀌아도 자동으로 다시그리게 함 반응형
import { ref, computed, watch } from 'vue';
//트랙과 클립의 타입
import type { TrackUIState, ClipUIState } from '../types';
//음원 처리를 위한 lib
import * as Tone from 'tone';
import { socketService } from '../../../core/services/socket.service';
import { projectApi } from '../api/project.api'
import axios from 'axios'

//페이지 어디든 사용가능하도록 useTrackStore로 export 고유 ID는 track
export const useTrackStore = defineStore('track', () => {
    // ==========================================
    // 1. 상태(State) 선언
    // ==========================================

    //오디오 객체 보관함 만들기 순수 자바스크립트 객체 보관용이기 때문에 ref를 사용하지 않는다.
    //음원 파일의 데이터를 브라우저 메모리에 올려서 타이밍에 맞춰 스피커로 재생
    // [핵심] Tone.Channel은 내부 Solo→PanVol 노드 체인에서 모노 다운믹스가 발생하여 패닝이 불가능합니다.
    // 따라서 Tone.Volume(볼륨/뮤트 전담) + Tone.Panner(패닝 전담)로 완전히 분리합니다.
    // 신호 흐름: Player → Tone.Volume → Tone.Panner → masterPanner → Destination
    const trackVolumes = new Map<number, Tone.Volume>();   // 트랙별 볼륨/뮤트 노드
    const trackPanners = new Map<number, Tone.Panner>();   // 트랙별 패닝 노드
    const clipPlayers = new Map<number, Tone.Player>(); //클립별 오디오 플레이어
    const myLockedClips = new Set<number>(); // 내가 직접 잠근(편집 중인) 클립 ID 목록

    //[1-1] 백엔드 연동 데이터
    const trackList = ref<TrackUIState[]>([]); //트랙들을 담을 배열
    //<trackUIstate[]>로 UI용 트랙데이터만 들어올수 있음을 선언 ref이므로 추가 삭제시 화면이 반응함 

    const projectInfo = ref({ //프로젝트의 전반적인 정보를 담은 객체 
        projectId: 0,
        name: '프로젝트',
        tempo: 120.0,
        rootNote: 'C',
        mode: 'major',
        timeSigNumerator: 4,
        timeSigDenominator: 4,
        totalBarCount: 32
    });

    //[1-2] 타임라인 UI 전용 상태 (프론트에서 화면 그릴 때만 쓰는 변수들)
    const isPlaying = ref(false); //재생중인지 아닌지
    //프로젝트 BPM 설정 및 Tone.js 동기화
    const bpm = ref(120);
    Tone.getTransport().bpm.value = bpm.value;
    // transport는 백 그라운드의 오디오 시계 역할을 함. 여기 tempo를 조정하면 전체 앱의 빠르기가 바뀜.

    // 마스터 트랙의 믹서 채널 생성 (모노 다운믹스 절대 방지: 강제 스테레오)
    const masterPanner = new Tone.Panner(0).toDestination();
    const masterVolume = new Tone.Volume(0).connect(masterPanner);

    // 스테레오 보존을 위한 강력한 Web Audio API 옵션 적용
    masterVolume.channelCount = 2;
    masterVolume.channelCountMode = "explicit";
    masterPanner.channelCount = 2;
    masterPanner.channelCountMode = "explicit";

    //bpm이 변경될때마다 Tone.js Transport의 템포도 함께 업데이트
    watch(bpm, (newBpm) => {
        Tone.getTransport().bpm.value = newBpm;
    })



    // 현재 선택된 클립과 해당 트랙 ID
    const selectedClip = ref<ClipUIState | null>(null);
    const selectedTrackId = ref<number | null>(null);

    // 클립 선택 함수
    const selectClip = (clip: ClipUIState, trackId: number) => {
        // 기존 선택된 클립이 있으면 해제
        if (selectedClip.value) {
            selectedClip.value.isSelected = false;
        }
        clip.isSelected = true;
        selectedClip.value = clip;
        selectedTrackId.value = trackId;
        // 클립 선택 시 트랙의 시각적 선택 상태는 해제
        trackList.value.forEach(t => t.isSelected = false);
    };

    // 트랙 선택 함수 (클립 선택은 해제됨)
    const selectTrack = (trackId: number) => {
        if (trackId === 999999) return; // 마스터 트랙은 선택/삭제 방지
        if (selectedClip.value) {
            selectedClip.value.isSelected = false;
            selectedClip.value = null;
        }
        selectedTrackId.value = trackId;
        trackList.value.forEach(t => t.isSelected = (t.trackId === trackId));
    };

    //  빈 공간 클릭 시 선택 해제 함수
    const deselectAll = () => {
        if (selectedClip.value) selectedClip.value.isSelected = false;
        selectedClip.value = null;
        selectedTrackId.value = null;
        trackList.value.forEach(t => t.isSelected = false);
    };
    //1마디당 걸리는 시간 계산
    const secondsPerBar = computed(() => (4 * 60) / bpm.value); // 4/4박자 기준 1마디는 4분음표 4개로 구성 => (60초 * 4) / bpm
    let animationFrameId = 0; //requestAnimationFrame 실행 ID (취소를 위해 필요)
    const playheadPosition = ref(0); //현재 재생 위치(마디 단위)
    const zoomlevel = ref(1) //가로 확대/축소 배율 (기본 1배)

    //복사/잘라내기 한 클립 데이터를 보관할 클립보드
    const clipboardClip = ref<ClipUIState | null>(null);
    const isCutAction = ref(false);
    const uploadingTrackId = ref<number | null>(null);
    const uploadingBar = ref<number | null>(null); //현재 보관된 데이터가 '잘라내기'로 들어왔는지 여부

    // 스토어 내부에 변수와 토글 함수 선언
    const isCommentMode = ref(false);
    const toggleCommentMode = () => {
        isCommentMode.value = !isCommentMode.value;
    };

    // ==========================================
    // 2. 계산된 상태(Getters) - 타임라인 픽셀 계산기
    // ==========================================

    //1마디당 픽셀 너비 (기본 120px * 줌 배율)
    //화면에서 클립 길이나 재생바 위치를 px로 바꿀때 사용
    const pixelPerBar = computed(() => 120 * zoomlevel.value);

    //전체 타임라인의 가로 픽셀 길이(총 마디 수 * 1마디 픽셀)
    const totalTimelineWidth = computed(() => projectInfo.value.totalBarCount * pixelPerBar.value);

    //스크롤 축소 할때 숫자를 표시할 마디 간격 계산 (1,4,8)
    const barNumberStep = computed(() => {
        if (zoomlevel.value <= 0.5) return 8; //많이 축소할때 1, 9 ,17 ...
        if (zoomlevel.value < 1.0) return 4; //약간 축소할때 1, 5, 9 ...
        return 1; //기본 1칸씩
    })

    //스크롤 확대 할떄 : 1마디를 몇 칸으로 쪼갤 것인가 (4분 8분 16분 음표)
    const subDivision = computed(() => {
        if (zoomlevel.value >= 2.5) return 16; //아주 많이 확대 : 16분음표 단위
        if (zoomlevel.value >= 1.5) return 8; //많이 확대 : 8분음표 단위
        if (zoomlevel.value >= 1.0) return 4; //기본 4분음표 단위
        return 1; //안쪼갬
    })

    // 타임라인 자동 확장 헬퍼 함수
    const checkAndExpandTimeline = (endBar: number) => {
        const currentTotalBars = projectInfo.value.totalBarCount;
        // 클립의 끝부분이 전체 타임라인의 90% 지점을 넘어가거나 아예 뚫고 나갔을 때
        if (endBar > currentTotalBars * 0.9) {
            // 기본 50마디를 늘려주되, 만약 클립이 너무 길어서 50마디로도 부족하면 그 클립 길이에 맞춰서 넉넉하게 늘려줍니다.
            const extendAmount = Math.max(50, Math.ceil(endBar - currentTotalBars) + 10);
            projectInfo.value.totalBarCount += extendAmount;
            console.log(`타임라인이 자동으로 ${projectInfo.value.totalBarCount}마디로 확장되었습니다.`);
        }
    };

    // ==========================================
    // 🌐 웹소켓 수신 (Subscribe) 처리부
    // ==========================================
    // 백엔드 명세에 맞추어 이벤트 명(`CLIP_PASTE_SUCCESS` 등)을 수정하여 사용


    // --------------------- 트랙 관련 (소켓) ---------------------    
    socketService.subscribe('TRACK_ADD', (data) => {
        // 이미 그려져있으면 무시 (Optimistic UI 중복 방지)
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
            isSelected: false
        };
        trackList.value.push(newTrack);

        const panner = new Tone.Panner(newTrack.pan / 100).connect(masterVolume);
        const vol = new Tone.Volume(newTrack.volume).connect(panner);
        panner.channelCount = 2; panner.channelCountMode = "explicit";
        vol.channelCount = 2; vol.channelCountMode = "explicit";

        trackVolumes.set(newTrack.trackId, vol);
        trackPanners.set(newTrack.trackId, panner);
    });

    socketService.subscribe('TRACK_DELETE', (data) => {
        const index = trackList.value.findIndex(t => t.trackId === data.trackId);
        if (index !== -1) {
            // 🚨 보완: 트랙을 지우기 전에, 트랙 안에 있던 모든 클립의 오디오 메모리를 완전 해제!
            trackList.value[index].clips.forEach(clip => {
                const player = clipPlayers.get(clip.clipId);
                if (player) {
                    player.unsync().stop().dispose();
                    clipPlayers.delete(clip.clipId);
                }
            });

            // 트랙 삭제 및 믹서 노드 해제
            trackList.value.splice(index, 1);
            trackVolumes.get(data.trackId)?.dispose(); trackVolumes.delete(data.trackId);
            trackPanners.get(data.trackId)?.dispose(); trackPanners.delete(data.trackId);
        }
        if (selectedTrackId.value === data.trackId) deselectAll();
    });

    socketService.subscribe('TRACK_RENAME', (data) => {
        const track = trackList.value.find(t => t.trackId === data.trackId);
        if (track) track.name = data.name;
    });

    socketService.subscribe('TRACK_MUTE_CHANGE', (data) => {
        const track = trackList.value.find(t => t.trackId === data.trackId);
        if (track) { track.isMuted = data.isMuted; syncEffectiveMuteStates(); }
    });

    socketService.subscribe('TRACK_SOLO_CHANGE', (data) => {
        const track = trackList.value.find(t => t.trackId === data.trackId);
        if (track) { track.isSoloed = data.isSoloed; syncEffectiveMuteStates(); }
    });

    socketService.subscribe('TRACK_VOLUME_CHANGE', (data) => {
        const track = trackList.value.find(t => t.trackId === data.trackId);
        if (track) {
            track.volume = data.volume;
            const vol = trackVolumes.get(data.trackId);
            if (vol) vol.volume.value = data.volume;
        }
    });

    socketService.subscribe('TRACK_PAN_CHANGE', (data) => {
        const track = trackList.value.find(t => t.trackId === data.trackId);
        if (track) {
            track.pan = data.pan;
            const panner = trackPanners.get(data.trackId);
            if (panner) panner.pan.value = data.pan / 100;
        }
    });

    // --------------------- 에러 수신 (소켓) ---------------------
    socketService.subscribe('ERROR', (data: any) => {
        if (data && data.message) {
            alert(data.message);
        } else {
            alert("처리 중 오류가 발생했습니다.");
        }
    });

    // --------------------- 클립 관련 (소켓) ---------------------
    socketService.subscribe('CLIP_LOCK', (data) => {
        // 내가 직접 잠근 클립이면 내 화면에서는 잠금 표시를 하지 않는다 (자기 자신 차단 방지)
        if (myLockedClips.has(data.clipId)) return;

        const track = trackList.value.find(t => t.clips.some(c => c.clipId === data.clipId));
        if (track) {
            const clip = track.clips.find(c => c.clipId === data.clipId);
            if (clip) {
                clip.isLocked = data.isLocked; // 다른 사람이 잠근 경우에만 자물쇠 찰칵!
            }
        }
    });

    //1.신규 클립 업로드 완료 수신
    // 1. 신규 클립 업로드 완료 수신
    socketService.subscribe('CLIP_CREATE', async (data) => {
        // 업로드 중이던 클립이 백엔드에서 생성되어 돌아왔다면 고스트 클립 해제
        if (uploadingTrackId.value === data.trackId) {
            uploadingTrackId.value = null;
            uploadingBar.value = null;
        }

        const track = trackList.value.find(t => t.trackId === data.trackId);
        if (!track) return;

        // 1. 화면에 우선 빈 클립 블록(소리 없는 껍데기) 렌더링
        const newClip: ClipUIState = {
            clipId: data.clipId,
            start: data.startBar,
            duration: data.duration,
            audioStartMs: data.audioStartMs,
            audioDurationMs: data.audioDurationMs,
            color: data.color,
            audio: {
                audioMetadataId: data.audioMetadataId,
                originalName: "오디오 로딩 중...", // URL 받아오기 전 임시 텍스트
                cdnUrl: "", // URL을 아직 모르므로 비워둠
                durationMs: data.audioDurationMs,
            },
            isSelected: false,
            isDragging: false
        };
        track.clips.push(newClip);
        checkAndExpandTimeline(newClip.start + newClip.duration);
        // 2. 백그라운드에서 오디오 상세 정보(URL) 조회 API 비동기 호출
        try {
            const audioInfo = await projectApi.getAudioDetail(projectInfo.value.projectId, data.audioMetadataId);

            // 3. Vue 반응성 확보: 배열 안의 실제 반응형 객체를 다시 찾아서 audio를 통째로 교체
            const reactiveClip = track.clips.find(c => c.clipId === data.clipId);
            if (reactiveClip) {
                reactiveClip.audio = {
                    audioMetadataId: data.audioMetadataId,
                    cdnUrl: audioInfo.audioUrl,
                    originalName: audioInfo.originalName,
                    durationMs: data.audioDurationMs,
                };

                // 4. 오디오 플레이어 노드 생성 및 버퍼 로딩
                const targetVol = trackVolumes.get(data.trackId);
                if (targetVol) {
                    const newPlayer = new Tone.Player().connect(targetVol);
                    await newPlayer.load(audioInfo.audioUrl);

                    const exactStartTimeSec = reactiveClip.start * secondsPerBar.value;
                    const audioOffsetSec = reactiveClip.audioStartMs / 1000;
                    newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, reactiveClip.duration * secondsPerBar.value);

                    clipPlayers.set(reactiveClip.clipId, newPlayer);
                    console.log(`[CLIP_CREATE] 백그라운드 오디오 로딩 및 동기화 완료 (ID: ${reactiveClip.clipId})`);
                }
            }
        } catch (error) {
            console.error(`[CLIP_CREATE] 오디오 상세 정보(URL) 조회 실패:`, error);
            const failedClip = track.clips.find(c => c.clipId === data.clipId);
            if (failedClip && failedClip.audio) {
                failedClip.audio = { ...failedClip.audio, originalName: "오디오 로딩 실패" };
            }
        }
    });

    socketService.subscribe('CLIP_MOVE', (data) => {
        let targetClip: ClipUIState | null = null;
        let sourceTrack: TrackUIState | null = null;

        // 🌟 보완: forEach 대신 for...of 적용 (클립 찾으면 즉시 루프 탈출하여 성능 최적화)
        for (const track of trackList.value) {
            const clip = track.clips.find(c => c.clipId === data.clipId);
            if (clip) {
                targetClip = clip;
                sourceTrack = track;
                break;
            }
        }

        if (!targetClip || !sourceTrack) return;
        if (targetClip.start === data.after.startBar && sourceTrack.trackId === data.after.trackId) return; // 변동 없으면 무시

        if (sourceTrack.trackId !== data.after.trackId) {
            const targetTrack = trackList.value.find(t => t.trackId === data.after.trackId);
            if (targetTrack) {
                const clipIndex = sourceTrack.clips.findIndex(c => c.clipId === data.clipId);
                if (clipIndex !== -1) sourceTrack.clips.splice(clipIndex, 1);

                targetTrack.clips.push(targetClip);

                const newVolNode = trackVolumes.get(data.after.trackId);
                const player = clipPlayers.get(data.clipId);
                if (newVolNode && player) { player.disconnect(); player.connect(newVolNode); }
            }
        }

        targetClip.start = data.after.startBar;
        resyncClip(targetClip.clipId, targetClip.start);
    });

    socketService.subscribe('CLIP_RESIZE', (data) => {
        for (const t of trackList.value) {
            const clip = t.clips.find(c => c.clipId === data.clipId);
            if (clip) {
                clip.start = data.after.startBar;
                clip.duration = data.after.length;
                // 🚨 보완: 왼쪽을 잘랐다면 실제 오디오 시작점(Trim)도 갱신해야 합니다.
                if (data.after.audioStartMs !== undefined) {
                    clip.audioStartMs = data.after.audioStartMs;
                }
                resyncClip(clip.clipId, clip.start);
                break; // 찾았으니 탈출
            }
        }
    });

    socketService.subscribe('CLIP_DELETE', (data) => {
        for (const t of trackList.value) {
            const index = t.clips.findIndex(c => c.clipId === data.clipId);
            if (index !== -1) {
                t.clips.splice(index, 1);
                break; // 찾았으니 탈출
            }
        }
        const player = clipPlayers.get(data.clipId);
        if (player) { player.unsync().stop().dispose(); clipPlayers.delete(data.clipId); }
    });

    socketService.subscribe('CLIP_CUT', (data) => {
        // 잘라내기도 화면상 삭제 로직은 동일
        for (const t of trackList.value) {
            const index = t.clips.findIndex(c => c.clipId === data.clipId);
            if (index !== -1) {
                t.clips.splice(index, 1);
                break;
            }
        }
        const player = clipPlayers.get(data.clipId);
        if (player) { player.unsync().stop().dispose(); clipPlayers.delete(data.clipId); }
    });

    // 2. 클립 붙여넣기 수신 (가장 중요: sourceClipId를 통한 복제)
    socketService.subscribe('CLIP_PASTE', (data) => {
        // 백엔드에서 '어떤 클립을 복사했는지(sourceClipId)'를 알려줌!
        let originalClip: ClipUIState | null = null;
        for (const t of trackList.value) {
            const found = t.clips.find(c => c.clipId === data.sourceClipId);
            if (found) { originalClip = found; break; }
        }
        // 잘라내기(Cut)의 경우 화면에서 이미 삭제되었으므로 로컬 클립보드에서 찾습니다.
        if (!originalClip && clipboardClip.value && clipboardClip.value.clipId === data.sourceClipId) {
            originalClip = clipboardClip.value;
        }

        if (!originalClip) {
            console.error(`[에러] 붙여넣기 할 원본 클립(ID: ${data.sourceClipId})을 화면에서 찾을 수 없습니다!`);
            return;
        }
        const targetTrack = trackList.value.find(t => t.trackId === data.targetTrackId);
        if (!targetTrack) return;
        // 원본 클립을 완벽하게 복제(Deep Copy)한 뒤, 백엔드가 지정해준 위치와 ID만 변경
        const pastedClip: ClipUIState = {
            ...JSON.parse(JSON.stringify(originalClip)),
            clipId: data.clipId,
            start: data.targetStartBar,
            isSelected: false,
            isDragging: false
        };
        targetTrack.clips.push(pastedClip);
        checkAndExpandTimeline(pastedClip.start + pastedClip.duration);
        // 오디오 플레이어 복제 및 스케줄링
        const targetVol = trackVolumes.get(data.targetTrackId);
        if (targetVol && pastedClip.audio?.cdnUrl) {
            const newPlayer = new Tone.Player().connect(targetVol);
            newPlayer.load(pastedClip.audio.cdnUrl).then(() => {
                const exactStartTimeSec = pastedClip.start * secondsPerBar.value;
                const audioOffsetSec = pastedClip.audioStartMs / 1000;
                newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, pastedClip.duration * secondsPerBar.value);
                clipPlayers.set(pastedClip.clipId, newPlayer);
            });
        }
    });
    // 3. 클립 복제 수신
    socketService.subscribe('CLIP_DUPLICATE', (data) => {
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
            isSelected: false,
            isDragging: false
        };
        targetTrack.clips.push(duplicatedClip);
        checkAndExpandTimeline(duplicatedClip.start + duplicatedClip.duration);
        // 오디오 엔진 연결
        const targetVol = trackVolumes.get(data.targetTrackId);
        if (targetVol && duplicatedClip.audio?.cdnUrl) {
            const newPlayer = new Tone.Player().connect(targetVol);
            newPlayer.load(duplicatedClip.audio.cdnUrl).then(() => {
                const exactStartTimeSec = duplicatedClip.start * secondsPerBar.value;
                const audioOffsetSec = duplicatedClip.audioStartMs / 1000;
                newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, duplicatedClip.duration * secondsPerBar.value);
                clipPlayers.set(duplicatedClip.clipId, newPlayer);
            });
        }
    });
    // 4. 클립 분할 수신
    socketService.subscribe('CLIP_SPLIT', async (data) => {
        let targetTrack: TrackUIState | null = null;
        let originalClip: ClipUIState | null = null;

        for (const t of trackList.value) {
            const found = t.clips.find(c => c.clipId === data.clipId);
            if (found) { originalClip = found; targetTrack = t; break; }
        }
        if (!originalClip || !targetTrack) return;
        // 재생 중이었다면 멈추고 안전하게 쪼개기 진행
        const wasPlaying = isPlaying.value;
        if (wasPlaying) {
            Tone.getTransport().pause();
            isPlaying.value = false;
        }
        const splitOffsetBars = data.splitBar - originalClip.start;
        const splitOffsetMs = splitOffsetBars * secondsPerBar.value * 1000;
        // 백엔드 명세에 맞춰서 오른쪽 새 클립 생성
        const rightClip: ClipUIState = {
            ...JSON.parse(JSON.stringify(originalClip)),
            clipId: data.newClipId,
            start: data.splitBar,
            duration: data.newClipDuration,
            audioStartMs: originalClip.audioStartMs + splitOffsetMs,
            audioDurationMs: Math.max(0, originalClip.audioDurationMs - splitOffsetMs),
            isLocked: false,     // 분할로 새로 생긴 클립은 잠금 해제 상태로 초기화
            isDragging: false,
            isSelected: false
        };
        // 왼쪽 원본 클립 길이 수정
        originalClip.duration = data.originalDuration;
        originalClip.audioDurationMs = splitOffsetMs;
        targetTrack.clips.push(rightClip);
        // 왼쪽 클립 오디오 재설정
        resyncClip(originalClip.clipId, originalClip.start);
        // 오른쪽 새 클립 오디오 셋팅
        const targetVol = trackVolumes.get(targetTrack.trackId);
        if (targetVol && rightClip.audio?.cdnUrl) {
            const newPlayer = new Tone.Player().connect(targetVol);
            await newPlayer.load(rightClip.audio.cdnUrl);

            const exactStartTimeSec = rightClip.start * secondsPerBar.value;
            const audioOffsetSec = rightClip.audioStartMs / 1000;
            newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, rightClip.duration * secondsPerBar.value);
            clipPlayers.set(rightClip.clipId, newPlayer);
        }
        // 분할 작업 완료 후 재생 재개
        if (wasPlaying) {
            const currentOffset = playheadPosition.value * secondsPerBar.value;
            Tone.getTransport().start("+0.01", currentOffset);
            isPlaying.value = true;
            updatePlayheadLoop();
        }
    });
    // 5. 클립 복사 및 잘라내기 응답 
    socketService.subscribe('CLIP_COPY', (data) => {
        console.log(`[통신] 백엔드 클립보드에 복사 완료 (clipId: ${data.clipId})`);
    });
    socketService.subscribe('CLIP_CUT', (data) => {
        // 잘라내기는 삭제와 완전히 동일하게 화면에서 지우고 오디오를 해제합니다.
        for (const t of trackList.value) {
            const index = t.clips.findIndex(c => c.clipId === data.clipId);
            if (index !== -1) { t.clips.splice(index, 1); break; }
        }
        const player = clipPlayers.get(data.clipId);
        if (player) { player.unsync().stop().dispose(); clipPlayers.delete(data.clipId); }
    });

    // ==========================================
    // 3. 액션(Action) 선언 (웹소켓 발신 및 UI 렌더링)
    // ==========================================

    // 실제 오디오 파일 업로드 & 클립 추가 Action
    const uploadAndAddAudioClip = async (file: File, trackId: number, startBar: number) => {
        console.log(`========== [Upload & Add Clip Start (Pessimistic UI)] ==========`);
        uploadingTrackId.value = trackId;
        uploadingBar.value = startBar;

        // 1. 오디오 파일을 Tone.Player로 임시 로드하여 길이(Duration) 측정
        const tempUrl = URL.createObjectURL(file);
        const tempPlayer = new Tone.Player();
        await tempPlayer.load(tempUrl);
        const durationMs = Math.round(tempPlayer.buffer.duration * 1000);
        tempPlayer.dispose();
        URL.revokeObjectURL(tempUrl);

        // 2. 파일 타입에 따른 MIME 타입 및 포맷팅 설정
        const mimeType = file.type.includes('wav') ? 'WAV' : 'MPEG';

        try {
            // 3. 백엔드 API를 통해 S3 Presigned URL(티켓) 발급
            const uploadTicket = await projectApi.getAudioUploadUrl(projectInfo.value.projectId, {
                originalName: file.name,
                mimeType: mimeType,
                sizeBytes: file.size
            });
            // 4. 발급받은 Presigned URL을 사용하여 S3로 직접 파일 전송 (PUT)
            await axios.put(uploadTicket.uploadUrl, file, {
                headers: {
                    'Content-Type': file.type
                }
            });

            console.log(`[Upload] S3 파일 업로드 완료 (objectKey: ${uploadTicket.objectKey})`);
            // 5. 웹소켓으로 클립 생성(CLIP_CREATE) 브로드캐스트 요청 (현재 합의된 백엔드 스펙)
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
                durationMs: durationMs
            });

            console.log(`[Upload] 백엔드로 CLIP_CREATE 발신 완료. 렌더링은 브로드캐스트 수신 후 진행됩니다.`);
            // 프론트엔드 로직 종료 (렌더링은 수신부에서 일괄 처리)
        } catch (error) {
            console.error(`[Upload Error] 업로드 또는 클립 생성 요청 실패:`, error);
            alert("파일 업로드에 실패했습니다.");
        }
    };
    // 1. 복사
    const copyClip = (clip: ClipUIState) => {
        // 프론트 클립보드 저장
        clipboardClip.value = JSON.parse(JSON.stringify(clip));
        isCutAction.value = false;
        // 서버 클립보드 동기화
        socketService.publish('CLIP_COPY', {
            projectId: projectInfo.value.projectId,
            clipId: clip.clipId
        });
    };

    // 잘라내기
    const cutClip = (clip: ClipUIState, trackId: number) => {
        clipboardClip.value = { ...JSON.parse(JSON.stringify(clip)), clipId: clip.clipId };
        isCutAction.value = true;
        // Lock → 액션 → Unlock (백엔드가 Lock 소유를 검증함)
        lockClip(clip.clipId, trackId);
        socketService.publish('CLIP_CUT', {
            projectId: projectInfo.value.projectId,
            clipId: clip.clipId
        });
        unlockClip(clip.clipId, trackId);
    };


    // 3. 붙여넣기
    const pasteClip = async (targetTrackId: number, startBar: number) => {
        // 함수 시작하자마자 현재 클립보드 데이터를 일반 변수에 안전하게 빼두기
        const clipDataToPaste = clipboardClip.value;
        if (!clipDataToPaste) return;

        const targetTrack = trackList.value.find(t => t.trackId === targetTrackId);
        if (!targetTrack) return;

        // 1. 겹침 방지 계산 (기존과 동일하게 프론트에서 최적의 위치를 미리 찾아둠)
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

        console.log(`[통신] 백엔드에 붙여넣기(CLIP_PASTE) 요청 전송`);
        socketService.publish('CLIP_PASTE', {
            projectId: projectInfo.value.projectId,
            targetTrackId: targetTrackId,
            targetStartBar: resolvedStart
        });

        // 잘라내기 처리
        if (isCutAction.value) {
            clipboardClip.value = null;
            isCutAction.value = false;
        }
    };

    // 삭제
    const deleteClip = (clipId: number, trackId: number) => {
        console.log(`[통신] 백엔드에 클립 삭제(CLIP_DELETE) 요청 전송`);
        // Lock → 액션 → Unlock (백엔드가 Lock 소유를 검증함)
        lockClip(clipId, trackId);
        socketService.publish('CLIP_DELETE', {
            projectId: projectInfo.value.projectId,
            clipId: clipId
        });
        unlockClip(clipId, trackId);
    };

    // 4. 클립 복제 (Duplicate)
    const duplicateClip = (clip: ClipUIState, trackId: number) => {
        console.log(`[통신] 백엔드에 클립 복제(CLIP_DUPLICATE) 요청 전송`);
        // Lock → 액션 → Unlock (백엔드가 Lock 소유를 검증함)
        lockClip(clip.clipId, trackId);
        socketService.publish('CLIP_DUPLICATE', {
            projectId: projectInfo.value.projectId,
            clipId: clip.clipId
        });
        unlockClip(clip.clipId, trackId);
    };

    // 5. 클립 분할 (Split)
    const splitClip = async (clipId: number, trackId: number) => {
        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track) return;

        const clipIndex = track.clips.findIndex(c => c.clipId === clipId);
        const originalClip = track.clips[clipIndex];
        if (!originalClip) return;

        const currentBar = playheadPosition.value;

        if (currentBar <= originalClip.start || currentBar >= originalClip.start + originalClip.duration) {
            alert("재생바(Playhead)가 클립 위에 있어야 분할할 수 있습니다.");
            return;
        }

        console.log(`[통신] 클립 분할(CLIP_SPLIT) 요청 전송`);
        // Lock → 액션 → Unlock (백엔드가 Lock 소유를 검증함)
        lockClip(clipId, trackId);
        socketService.publish('CLIP_SPLIT', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            splitBar: currentBar
        });
        unlockClip(clipId, trackId);
    };

    // 6. 클립 길이 조절 (Resize / Trim)
    const resizeClip = (clipId: number, trackId: number, newStart: number, newDuration: number, trimLeftBars: number) => {
        console.log(`[통신] 클립 리사이즈(CLIP_RESIZE) 요청 전송`);
        socketService.publish('CLIP_RESIZE', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            startBar: newStart,
            length: newDuration
        });
    };

    // ==========================================
    // 트랙 관련 액션
    // ==========================================
    //마스터 트랙 (수정 불가, 고정 렌더링)
    const masterTrack = ref<TrackUIState>({
        trackId: 999999,
        name: "마스터 트랙",
        type: "AUDIO",
        preTrackId: null,
        postTrackId: null,
        volume: 0,
        pan: 0,
        isMuted: false,
        isSoloed: false,
        clips: [],
        height: 100,
        isSelected: false
    });

    // 일반 트랙에 변화가 생길 때마다 마스터 트랙에 실시간 병합!
    watch(() => trackList.value, (newTrackList) => {
        const mergedClips: ClipUIState[] = [];

        newTrackList.forEach(track => {
            track.clips.forEach(clip => {
                mergedClips.push({
                    ...JSON.parse(JSON.stringify(clip)),
                    clipId: clip.clipId + 9000000,
                    color: '#4b4b4b',
                    isSelected: false,
                    isDragging: false
                });
            });
        });

        masterTrack.value.clips = mergedClips;
    }, { deep: true, immediate: true });

    //새로운 트랙 추가 액션
    const addTrack = () => {
        const newTrackName = `트랙 ${trackList.value.length + 1}`;
        console.log(`[통신] 트랙 추가(TRACK_ADD) 요청 전송`);

        socketService.publish('TRACK_ADD', {
            projectId: projectInfo.value.projectId,
            name: newTrackName,
            type: "audio"
        });
    };

    // ==========================================
    // 오디오 출력 상태 동기화 (Solo / Mute 통합 관리)
    // ==========================================
    const syncEffectiveMuteStates = () => {
        const isAnySoloed = trackList.value.some(t => t.isSoloed);

        trackList.value.forEach(t => {
            const vol = trackVolumes.get(t.trackId);
            if (vol) {
                if (isAnySoloed) {
                    vol.mute = !t.isSoloed;
                } else {
                    vol.mute = t.isMuted;
                }
            }
        });
    };

    // 트랙 음소거(Mute) 토글
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

    // 트랙 솔로(Solo) 토글
    const toggleTrackSolo = (trackId: number) => {
        if (trackId === 999999) return;
        const targetTrack = trackList.value.find(t => t.trackId === trackId);
        if (!targetTrack) return;

        const isTurningOn = !targetTrack.isSoloed;

        if (isTurningOn) {
            trackList.value.forEach(t => {
                if (t.trackId !== trackId && t.isSoloed) {
                    t.isSoloed = false;
                    // solo 상태 변경은 syncEffectiveMuteStates에서 mute로 일괄 처리
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

    // 트랙 볼륨 조절 (-60dB ~ 6dB)
    const setTrackVolume = (trackId: number, volume: number) => {
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

        socketService.publish('TRACK_VOLUME_CHANGE', {
            projectId: projectInfo.value.projectId,
            trackId: trackId,
            volume: volume
        });
    };

    // 볼륨 UI 정중앙(0dB) 비선형 매핑 로직
    const getVolumePercent = (vol: number) => {
        if (vol <= 0) {
            return ((vol + 60) / 60) * 50;
        } else {
            return 50 + (vol / 6) * 50;
        }
    };

    const getVolumeFromPercent = (percent: number) => {
        if (percent <= 50) {
            return (percent / 50) * 60 - 60;
        } else {
            return ((percent - 50) / 50) * 6;
        }
    };

    // 트랙 패닝 조절 (-100 ~ 100)
    const setTrackPan = (trackId: number, pan: number) => {
        console.log(`[패닝 디버그] setTrackPan 호출! trackId=${trackId}, pan=${pan}`);
        if (trackId === 999999) {
            masterTrack.value.pan = pan;
            masterPanner.pan.value = pan / 100;
            console.log(`[패닝 디버그] 마스터 패너 적용 완료: masterPanner.pan.value=${masterPanner.pan.value}`);
            return;
        }

        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track) {
            console.error(`[패닝 디버그] 트랙을 찾을 수 없음! trackId=${trackId}`);
            return;
        }

        track.pan = pan;
        const panner = trackPanners.get(trackId);
        if (panner) {
            panner.pan.value = pan / 100;
            console.log(`[패닝 디버그] 트랙 ${trackId} 패너 적용 완료: panner.pan.value=${panner.pan.value}`);
        } else {
            console.error(`[패닝 디버그] 트랙 ${trackId}의 panner를 trackPanners Map에서 찾을 수 없음!`);
            console.log(`[패닝 디버그] 현재 trackPanners 키 목록:`, [...trackPanners.keys()]);
            console.log(`[패닝 디버그] 현재 trackVolumes 키 목록:`, [...trackVolumes.keys()]);
        }

        socketService.publish('TRACK_PAN_CHANGE', {
            projectId: projectInfo.value.projectId,
            trackId: trackId,
            pan: pan
        });
    };

    //트랙 삭제 기능
    const deleteTrack = (trackId: number) => {
        if (trackId === 999999) return;
        console.log(`[통신] 백엔드에 트랙 삭제(TRACK_DELETE) 요청 전송`);

        socketService.publish('TRACK_DELETE', {
            projectId: projectInfo.value.projectId,
            trackId: trackId
        });
    };

    // 트랙 이름 변경 로직
    const renameTrack = (trackId: number, newName: string) => {
        if (trackId === 999999) return;
        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track || track.name === newName) return;

        track.name = newName; // UI 즉각 반영

        console.log(`[통신] 백엔드에 트랙 이름 변경(TRACK_RENAME) 요청 전송`);
        socketService.publish('TRACK_RENAME', {
            projectId: projectInfo.value.projectId,
            trackId: trackId,
            name: newName
        });
    };

    // 트랙 순서 변경 로직
    const reorderTrack = (draggedTrackId: number, targetIndex: number) => {
        if (draggedTrackId === 999999) return;

        const draggedIndex = trackList.value.findIndex(t => t.trackId === draggedTrackId);
        if (draggedIndex === -1 || draggedIndex === targetIndex) return;

        const [track] = trackList.value.splice(draggedIndex, 1);
        trackList.value.splice(targetIndex, 0, track);

        const preTrackId = targetIndex > 0 ? trackList.value[targetIndex - 1].trackId : null;
        const postTrackId = targetIndex < trackList.value.length - 1 ? trackList.value[targetIndex + 1].trackId : null;

        console.log(`[통신] 백엔드에 트랙 순서 변경(TRACK_REORDER) 요청 전송`);
        socketService.publish('TRACK_REORDER', {
            projectId: projectInfo.value.projectId,
            trackId: draggedTrackId,
            preTrackId: preTrackId,
            postTrackId: postTrackId
        });
    };

    // ==========================================
    // 3. 액션(Action) 선언(데이터 패칭 및 가공)
    // ==========================================

    // 드래그 앤 드롭 종료 시 서버 확정 통신
    const confirmMoveClip = (clipId: number, targetTrackId: number, targetStartBar: number) => {
        console.log(`[통신] 백엔드에 클립 이동(CLIP_MOVE) 요청 전송`);

        socketService.publish('CLIP_MOVE', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            targetTrackId: targetTrackId,
            targetStartBar: targetStartBar
        });
    };

    //클립을 다른 트랙으로 이동시키는 함수 (프론트 렌더링 지움, 순수 통신 트리거로 활용 가능)
    const moveClipToTrack = (clipId: number, fromTrackId: number, toTrackId: number) => {
        if (fromTrackId === toTrackId) return;
        // 이제 화면 즉시 반영 로직은 없고, 필요하다면 백엔드 publish를 위임합니다.
        // 드래그 이벤트는 confirmMoveClip에서 처리되므로 비워둡니다.
    };
    // 디버그용 변수 (로그 폭탄 방지용)
    let debugLoopCount = 0;

    //재생 상태 토글 함수
    const togglePlay = () => {
        try {
            if (!isPlaying.value) {
                const offsetTime = playheadPosition.value * secondsPerBar.value;

                if (!isNaN(offsetTime) && isFinite(offsetTime)) {
                    Tone.getTransport().start("+0.01", offsetTime);
                } else {
                    Tone.getTransport().start("+0.01");
                }

                isPlaying.value = true;
                updatePlayheadLoop();
            } else {
                Tone.getTransport().pause();
                isPlaying.value = false;
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
            }
        } catch (e) {
            console.error("재생 에러:", e);
        }
    };

    // 시간 재생바 UI 업데이트 루프 (루프 감시 로그 추가)
    const updatePlayheadLoop = () => {
        if (!isPlaying.value) return;

        playheadPosition.value = Tone.getTransport().seconds / secondsPerBar.value;

        if (debugLoopCount < 5) {
            console.log(`🔄 [루프 확인 ${debugLoopCount + 1}/5] 시계가 흐르고 있나요? -> Transport 초: ${Tone.getTransport().seconds.toFixed(4)}, 재생바 마디: ${playheadPosition.value.toFixed(4)}`);
            debugLoopCount++;
        }

        if (playheadPosition.value >= projectInfo.value.totalBarCount) {
            console.log("⏹️ [재생 종료] 끝까지 도달하여 정지합니다.");
            stopPlay();
            return;
        }
        animationFrameId = requestAnimationFrame(updatePlayheadLoop);
    }

    // 완전 정지 (처음으로 되돌림)
    const stopPlay = () => {
        Tone.getTransport().stop();
        isPlaying.value = false;
        playheadPosition.value = 0;
        cancelAnimationFrame(animationFrameId);
    };

    //마우스 휠 방향에 따라 줌 배율을 조절하는 함수
    const updateZoom = (deltaY: number) => {
        const zoomStep = 0.1; //한 번 휠을 굴릴 때 변하는 배율(10%)

        if (deltaY > 0) {
            zoomlevel.value = Math.max(0.5, zoomlevel.value - zoomStep);
        } else {
            zoomlevel.value = Math.min(3, zoomlevel.value + zoomStep);
        }
    }

    //오디오 파일 로딩 및 Transport 조절 함수
    const setupAudioEngine = async (tracks: TrackUIState[]) => {
        console.log("========== [Audio Engine Setup Start] ==========");

        for (const track of tracks) {
            if (!trackVolumes.has(track.trackId)) {
                // 테스트 완료: 마스터 볼륨으로 안전하게 연결
                const panner = new Tone.Panner(track.pan / 100).connect(masterVolume);
                const vol = new Tone.Volume(track.volume).connect(panner);

                panner.channelCount = 2;
                panner.channelCountMode = "explicit";
                vol.channelCount = 2;
                vol.channelCountMode = "explicit";

                trackVolumes.set(track.trackId, vol);
                trackPanners.set(track.trackId, panner);
                console.log(`[Setup] 트랙 ${track.trackId} ('${track.name}') 믹서 노드 생성 완료. vol:`, vol, "panner:", panner);
            }
        }

        for (const track of tracks) {
            const vol = trackVolumes.get(track.trackId);
            if (!vol) continue;

            for (const clip of track.clips) {
                if (!clip.audio?.cdnUrl) {
                    console.warn(`[Setup ⚠️] 클립 ${clip.clipId}에 오디오 URL이 없어 로딩 건너뜀.`);
                    continue;
                }

                console.log(`[Setup] 클립 ${clip.clipId} 오디오 로딩 시도 중...`);
                const player = new Tone.Player().connect(vol);

                try {
                    await player.load(clip.audio.cdnUrl);
                    console.log(`[Setup] 클립 ${clip.clipId} 오디오 로드 성공. (버퍼길이: ${player.buffer.duration.toFixed(2)}초)`);

                    const exactStartTimeSec = clip.start * secondsPerBar.value;
                    const audioOffsetSec = (clip.audioStartMs || 0) / 1000;
                    const audioDurationSec = clip.duration * secondsPerBar.value;

                    player.sync().start(exactStartTimeSec, audioOffsetSec, audioDurationSec);
                    clipPlayers.set(clip.clipId, player);
                } catch (error) {
                    console.error(`[Setup 🚨] 클립 ${clip.clipId} 로드 실패:`, error);
                }
            }
        }
        console.log("========== [Audio Engine Setup End] ==========");
    }

    //클립 위치가 변경되었을 때 오디오 엔진 스케줄을 재설정 하는 함수
    const resyncClip = (clipId: number, newStartBar: number) => {
        console.log(`  └─ [Resync] 클립 ID ${clipId} 재동기화 시작 (새 위치: ${newStartBar}마디)`);

        const player = clipPlayers.get(clipId);
        if (!player) {
            console.error(`  └─ [Resync 🚨] 클립 ID ${clipId}의 오디오 플레이어를 찾을 수 없습니다! (유령 클립)`);
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
            console.error(`  └─ [Resync 🚨] 트랙 리스트에서 클립 데이터를 찾을 수 없습니다!`);
            return;
        }

        const wasPlaying = isPlaying.value;
        if (wasPlaying) Tone.getTransport().pause();

        player.unsync();
        player.stop();

        const exactStartTimeSec = newStartBar * secondsPerBar.value;
        const audioOffsetSec = (targetClip.audioStartMs || 0) / 1000;
        const maxDuration = player.buffer.duration - audioOffsetSec;
        const requestedDuration = targetClip.duration * secondsPerBar.value;

        const safeDurationSec = Math.max(0.01, Math.min(requestedDuration, maxDuration));

        console.log(`  └─ [Resync] 타임라인 스케줄링 -> 시작: ${exactStartTimeSec.toFixed(2)}초, Offset: ${audioOffsetSec.toFixed(2)}초, 재생길이: ${safeDurationSec.toFixed(2)}초`);

        if (safeDurationSec > 0) {
            player.sync().start(exactStartTimeSec, audioOffsetSec, safeDurationSec);
            console.log(`  └─ [Resync] 스케줄링 등록 완료! (상태: 정상)`);
        } else {
            console.error(`  └─ [Resync 🚨] 재생 길이(safeDurationSec)가 0 이하입니다! 스케줄링 실패.`);
        }

        if (wasPlaying) {
            const currentOffset = playheadPosition.value * secondsPerBar.value;
            Tone.getTransport().start("+0.01", currentOffset);
        }
    };

    // 비동기 함수를 선언 ref 반응형
    const fetchProject = async (projectId: number) => {
        try {
            // 백엔드 연결 시 실제 통신 로직으로 복구 필요 
            const data = await projectApi.getProjectDetail(projectId);

            console.log('[fetchProject] data:', data)
            console.log('[fetchProject] data.name:', data.name)

            if (data) {
                const MIN_TOTAL_BAR_COUNT = 100
                projectInfo.value = {
                    projectId: data.projectId,
                    name: data.name ?? '프로젝트',
                    tempo: data.tempo ?? 120,
                    rootNote: data.rootNote ?? 'C',
                    mode: data.projectMode ?? 'MAJOR',
                    timeSigNumerator: data.timeSigNumerator ?? 4,
                    timeSigDenominator: data.timeSigDenominator ?? 4,

                    // 핵심: 백엔드가 0을 내려줘도 화면 작업 영역은 최소 100마디 확보
                    totalBarCount: Math.max(data.totalBarCount ?? 0, MIN_TOTAL_BAR_COUNT),
                }
                bpm.value = data.tempo;

                trackList.value = data.tracks.map((track): TrackUIState => ({
                    ...track,
                    height: 100,
                    isSelected: false,
                    clips: track.clips.map((clip): ClipUIState => ({
                        ...clip,
                        isSelected: false,
                        isDragging: false
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
                setupAudioEngine(trackList.value);
            }
        } catch (error) {
            console.error("프로젝트 로딩 실패:", error);
        }
    };

    // 1. 내가 클립을 잡았을 때 서버에 Lock 요청
    const lockClip = (clipId: number, trackId: number) => {
        myLockedClips.add(clipId); // 내가 잠근 목록에 등록 (브로드캐스트 자기차단용)
        socketService.publish('CLIP_LOCK', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            isLocked: true // 잠가줘!
        });
    };

    // 2. 내가 클립에서 마우스를 뗐을 때 서버에 Unlock 요청
    const unlockClip = (clipId: number, trackId: number) => {
        myLockedClips.delete(clipId); // 내가 잠근 목록에서 제거
        socketService.publish('CLIP_LOCK', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            isLocked: false // 풀어줘!
        });
    };

    // ==========================================
    // 3. 내보내기 (Return)
    // ==========================================
    return {
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

        // Getters
        pixelPerBar,
        totalTimelineWidth,
        subDivision,
        barNumberStep,

        // Actions
        fetchProject,
        togglePlay,
        updateZoom,
        moveClipToTrack,
        stopPlay,
        updatePlayheadLoop,
        resyncClip,
        selectedClip,
        selectedTrackId,
        selectClip,
        deselectAll,

        // 클립보드
        clipboardClip,
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

        //트랙 선택 기능
        selectTrack,

        //오디오 업로드 추가
        uploadingTrackId,
        uploadingBar,
        uploadAndAddAudioClip,

        //트랙 편집하기
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
    };
});