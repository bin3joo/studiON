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
    const isCutAction = ref(false); //현재 보관된 데이터가 '잘라내기'로 들어왔는지 여부

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
    // 백엔드 명세에 맞추어 이벤트 명(`CLIP_PASTE_SUCCESS` 등)을 수정하여 사용하세요.

    socketService.subscribe('CLIP_LOCK', (data) => {
        const track = trackList.value.find(t => t.clips.some(c => c.clipId === data.clipId));
        if (track) {
            const clip = track.clips.find(c => c.clipId === data.clipId);
            if (clip) {
                clip.isLocked = data.isLocked; // 내 화면에도 자물쇠 찰칵!
            }
        }
    });

    // 예시: 붙여넣기 완료 후 진짜 ID 교체
    // socketService.subscribe('CLIP_PASTE_SUCCESS', (data) => {
    //     const track = trackList.value.find(t => t.trackId === data.targetTrackId);
    //     if (!track) return;
    //     const clip = track.clips.find(c => c.clipId === data.tempClipId); 
    //     if (clip) {
    //         clip.clipId = data.realClipId; // 임시 ID를 진짜 백엔드 ID로 교체
    //         // Map에 저장된 오디오 플레이어도 새 ID로 갱신해야 할 수 있음
    //     }
    // });


    // ==========================================
    // 3. 액션(Action) 선언 (웹소켓 발신 및 UI 렌더링)
    // ==========================================

    // 실제 오디오 파일 업로드 & 클립 추가 Action
    const uploadAndAddAudioClip = async (file: File, trackId: number, startBar: number) => {
        console.log(`\n========== [Upload & Add Clip Start] ==========`);
        console.log(`[Upload] 파일명: ${file.name}, 타겟 트랙: ${trackId}, 시작 마디: ${startBar}`);
        try {
            // 1. 임시 Blob URL 생성
            const cdnUrl = URL.createObjectURL(file);
            console.log(`[Upload] 1. Blob URL 생성 완료: ${cdnUrl}`);

            // 2. Tone.Player를 먼저 생성하여 오디오를 완벽히 디코딩하고 메모리에 올립니다.
            const newPlayer = new Tone.Player();
            console.log(`[Upload] 2. Tone.Player 생성 및 오디오 로드 시작...`);
            await newPlayer.load(cdnUrl);
            console.log(`[Upload] 3. 오디오 로드 완료! 버퍼 길이: ${newPlayer.buffer.duration}초`);

            // 3. 연속 업로드 시 브라우저 오디오 정책으로 인해 엔진이 멈추는 현상 방어
            if (Tone.getContext().state !== 'running') {
                await Tone.getContext().resume();
                console.log(`[Upload] 4. AudioContext 상태 복구됨`);
            }

            // 4. Tone.js가 디코딩한 버퍼에서 100% 정확한 오디오 길이를 추출합니다.
            const durationMs = newPlayer.buffer.duration * 1000;
            const tempAudioMetadataId = Date.now(); // 백엔드 업로드 후 실제 ID로 변경 필요

            const metaData = {
                audioMetadataId: tempAudioMetadataId,
                cdnUrl: cdnUrl,
                originalName: file.name,
                durationMs: durationMs
            };

            // 5. 정확한 길이를 마디(Bar) 단위로 변환 후 서버에 전송
            const durationBar = (durationMs / 1000) / secondsPerBar.value;
            console.log(`[Upload] 5. 마디 변환 완료: ${durationBar}마디`);

            const tempClipId = Date.now() + Math.floor(Math.random() * 1000); // 프론트 임시 ID 발급 (Optimistic UI)

            console.log(`[Upload] 6. 서버에 추가 이벤트 전송 중...`);
            socketService.publish('AUDIO_CLIP_ADD', {
                tempClipId: tempClipId, // 백엔드가 이 값을 참고해서 나중에 진짜 ID와 매핑해 주면 좋습니다.
                trackId: trackId,
                audioMetadataId: tempAudioMetadataId,
                start: startBar,
                duration: durationBar
            });

            // 6. UI 즉각 반영 (Optimistic UI) 및 믹서(채널) 연결
            const targetTrack = trackList.value.find(t => t.trackId === trackId);
            if (targetTrack) {
                const newClip: ClipUIState = {
                    clipId: tempClipId,
                    start: startBar,
                    duration: durationBar,
                    audioStartMs: 0,
                    audioDurationMs: durationMs,
                    color: "#" + Math.floor(Math.random() * 16777215).toString(16),
                    audio: metaData,
                    isSelected: false,
                    isDragging: false
                };

                targetTrack.clips.push(newClip);
                checkAndExpandTimeline(newClip.start + newClip.duration);

                const targetVol = trackVolumes.get(trackId);
                console.log(`[패닝 디버그] 업로드 - trackId=${trackId}, targetVol 존재=${!!targetVol}, trackVolumes 키:`, [...trackVolumes.keys()], 'trackPanners 키:', [...trackPanners.keys()]);
                if (targetVol) {
                    console.log(`[Upload] 7. Player를 트랙 볼륨 노드에 연결합니다.`);
                    newPlayer.connect(targetVol);
                    clipPlayers.set(newClip.clipId, newPlayer);

                    resyncClip(newClip.clipId, newClip.start);
                    console.log(`[Upload] 8. 🚀 업로드 및 스케줄링 완벽 종료! (임시 클립 ID: ${newClip.clipId})`);
                } else {
                    console.error(`[Upload 🚨] 타겟 트랙 채널을 찾을 수 없습니다!`);
                    newPlayer.dispose();
                }
            } else {
                console.error(`[Upload 🚨] 트랙 리스트에서 타겟 트랙을 찾을 수 없습니다!`);
                newPlayer.dispose();
            }
        } catch (error) {
            console.error(`[디버그 - 3번 케이스: Tone.js 디코딩 실패] 에러 발생:`, error);
            console.warn(`[힌트] 24-bit 정수형이나 ADPCM 등 브라우저 Web Audio API가 지원하지 않는 압축 포맷의 WAV 파일일 확률이 높습니다.`);
            alert("오디오 파일을 불러오는 데 실패했습니다. (브라우저가 지원하지 않는 특수 포맷일 수 있습니다)");
        }
        console.log(`========== [Upload & Add Clip End] ==========\n`);
    };

    // 1. 복사
    const copyClip = (clip: ClipUIState) => {
        // 깊은 복사(Deep Copy)를 통해 원본과의 참조를 완전히 끊어줍니다.
        clipboardClip.value = JSON.parse(JSON.stringify(clip));
        isCutAction.value = false;
    };

    // 2. 잘라내기
    const cutClip = (clip: ClipUIState, trackId: number) => {
        console.log(`[통신] 백엔드에 오려두기(CLIP_CUT) 요청 전송`);

        socketService.publish('CLIP_CUT', {
            projectId: projectInfo.value.projectId,
            clipId: clip.clipId
        });

        // 클립보드에 담고 화면에서 삭제
        const clonedData = JSON.parse(JSON.stringify(clip));
        clipboardClip.value = {
            ...clonedData,
            clipId: clip.clipId // 오려두기는 원본 ID를 그대로 유지
        };

        isCutAction.value = true;
        deleteClip(clip.clipId, trackId);
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

        const tempClipId = Date.now() + Math.floor(Math.random() * 1000);

        socketService.publish('CLIP_PASTE', {
            projectId: projectInfo.value.projectId,
            originalClipId: clipDataToPaste.clipId,
            tempClipId: tempClipId,
            targetTrackId: targetTrackId,
            targetStartBar: resolvedStart
        });

        // 화면에 임시 클립 즉시 생성 (Optimistic UI)
        const newClip: ClipUIState = {
            ...clipDataToPaste,
            clipId: tempClipId,
            start: resolvedStart,
            isSelected: false,
            isDragging: false
        };

        checkAndExpandTimeline(resolvedStart + newClip.duration);
        targetTrack.clips.push(newClip);

        // 오디오 플레이어 복제 및 생성
        const targetVol = trackVolumes.get(targetTrackId);
        if (targetVol && newClip.audio?.cdnUrl) {
            const newPlayer = new Tone.Player().connect(targetVol);
            newPlayer.load(newClip.audio.cdnUrl).then(() => {
                if (Tone.getContext().state !== 'running') Tone.getContext().resume();

                const exactStartTimeSec = newClip.start * secondsPerBar.value;
                const audioOffsetSec = (newClip.audioStartMs || 0) / 1000;

                const maxDuration = newPlayer.buffer.duration - audioOffsetSec;
                const requestedDuration = newClip.duration * secondsPerBar.value;
                let safeDurationSec = requestedDuration;
                if (safeDurationSec > maxDuration) safeDurationSec = maxDuration;
                if (safeDurationSec < 0.01) safeDurationSec = 0.01;

                if (safeDurationSec > 0) {
                    newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, safeDurationSec);
                }
                clipPlayers.set(newClip.clipId, newPlayer);
            }).catch(e => console.error("오디오 로드 에러", e));
        }

        // 잘라내기 처리
        if (isCutAction.value) {
            clipboardClip.value = null;
            isCutAction.value = false;
        }
    };

    // 삭제
    const deleteClip = (clipId: number, trackId: number) => {
        console.log(`[통신] 백엔드에 클립 삭제(CLIP_DELETE) 요청 전송`);

        socketService.publish('CLIP_DELETE', {
            projectId: projectInfo.value.projectId,
            clipId: clipId
        });

        // 프론트엔드 UI 즉각 삭제
        const track = trackList.value.find(t => t.trackId === trackId);
        if (track) {
            const index = track.clips.findIndex(c => c.clipId === clipId);
            if (index !== -1) track.clips.splice(index, 1);
        }

        // 오디오 엔진에서 플레이어 정지 및 메모리 삭제! (유령 소리 방지)
        const player = clipPlayers.get(clipId);
        if (player) {
            player.unsync(); // 예약된 재생 스케줄 취소
            player.stop();   // 현재 재생 중이면 즉시 멈춤
            player.dispose(); // 오디오 객체 파괴 (메모리 완전 해제)
            clipPlayers.delete(clipId); // Map에서도 삭제
            console.log(`클립 ${clipId} 오디오 삭제 완료`);
        }
    };

    // 4. 클립 복제 (Duplicate - Pessimistic UI)
    const duplicateClip = (clip: ClipUIState, trackId: number) => {
        console.log(`[통신] 백엔드에 클립 복제(CLIP_DUPLICATE) 요청 전송`);

        socketService.publish('CLIP_DUPLICATE', {
            projectId: projectInfo.value.projectId,
            clipId: clip.clipId
        });

        // 주의: 복제 위치를 백엔드에서 계산해준다면, 이 시점에서 화면을 그리지 않고 
        // socketService.subscribe('CLIP_DUPLICATE_SUCCESS') 부분에서 화면 렌더링 로직을 수행해야 합니다.
        // 현재는 임시 UI 반영을 위해 본래 로직의 뼈대를 유지합니다.
        const tempClipId = Date.now();
        const targetTrack = trackList.value.find(t => t.trackId === trackId);
        if (!targetTrack) return;

        const duplicatedClip: ClipUIState = {
            ...JSON.parse(JSON.stringify(clip)),
            clipId: tempClipId,
            start: clip.start + clip.duration, // 프론트 임의 계산 위치
            isSelected: false,
            isDragging: false
        };

        checkAndExpandTimeline(duplicatedClip.start + duplicatedClip.duration);
        targetTrack.clips.push(duplicatedClip);

        const targetVol = trackVolumes.get(trackId);
        if (targetVol && duplicatedClip.audio?.cdnUrl) {
            const newPlayer = new Tone.Player().connect(targetVol);
            newPlayer.load(duplicatedClip.audio.cdnUrl).then(() => {
                const exactStartTimeSec = duplicatedClip.start * secondsPerBar.value;
                const audioOffsetSec = (clip.audioStartMs || 0) / 1000;
                const audioDurationSec = clip.duration * secondsPerBar.value;

                newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, audioDurationSec);
                clipPlayers.set(duplicatedClip.clipId, newPlayer);
            });
        }
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

        try {
            const tempNewClipId = Date.now();
            socketService.publish('CLIP_SPLIT', {
                projectId: projectInfo.value.projectId,
                clipId: clipId,
                splitBar: currentBar,
                tempClipId: tempNewClipId
            });

            // 1. 재생 상태 캡처 및 Transport 정지
            const wasPlaying = isPlaying.value;
            if (wasPlaying) {
                Tone.getTransport().pause();
                isPlaying.value = false;
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
            }

            const splitOffsetBars = currentBar - originalClip.start;
            const splitOffsetMs = splitOffsetBars * secondsPerBar.value * 1000;

            const rightClipDuration = originalClip.duration - splitOffsetBars;
            const rightAudioStartMs = originalClip.audioStartMs + splitOffsetMs;

            // 오른쪽 클립 정보 세팅
            const rightClip: ClipUIState = {
                ...JSON.parse(JSON.stringify(originalClip)),
                clipId: tempNewClipId,
                start: currentBar,
                duration: rightClipDuration,
                audioStartMs: rightAudioStartMs,
                audioDurationMs: Math.max(0, originalClip.audioDurationMs - splitOffsetMs)
            };

            // 왼쪽 클립(원본) 정보 수정
            originalClip.duration = splitOffsetBars;
            originalClip.audioDurationMs = splitOffsetMs;

            track.clips.push(rightClip);

            // 2. 왼쪽 클립 안전하게 재설정
            resyncClip(originalClip.clipId, originalClip.start);

            // 3. 오른쪽 클립 동기(await) 로딩 및 스케줄링
            const targetVol = trackVolumes.get(trackId);
            if (targetVol && rightClip.audio?.cdnUrl) {
                const newPlayer = new Tone.Player().connect(targetVol);
                await newPlayer.load(rightClip.audio.cdnUrl);

                if (Tone.getContext().state !== 'running') Tone.getContext().resume();

                const exactStartTimeSec = rightClip.start * secondsPerBar.value;
                const audioOffsetSec = rightClip.audioStartMs / 1000;

                const maxDuration = newPlayer.buffer.duration - audioOffsetSec;
                const safeDurationSec = Math.max(0.01, Math.min(rightClip.duration * secondsPerBar.value, maxDuration));

                if (safeDurationSec > 0) {
                    newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, safeDurationSec);
                }
                clipPlayers.set(rightClip.clipId, newPlayer);
            }

            // 4. 모든 작업이 끝난 후 한 번만 재개!
            if (wasPlaying) {
                const currentOffset = playheadPosition.value * secondsPerBar.value;
                Tone.getTransport().start("+0.01", currentOffset);
                isPlaying.value = true;
                updatePlayheadLoop();
            }

        } catch (e) {
            console.error("분할 실패", e);
        }
    };

    // 6. 클립 길이 조절 (Resize / Trim)
    const resizeClip = (clipId: number, trackId: number, newStart: number, newDuration: number, trimLeftBars: number) => {
        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track) return;
        const clip = track.clips.find(c => c.clipId === clipId);
        if (!clip) return;

        console.log(`[통신] 클립 리사이즈(CLIP_RESIZE) 요청 전송`);

        socketService.publish('CLIP_RESIZE', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            startBar: newStart,
            length: newDuration
        });

        // 오디오 실제 데이터 시작점(Trim) 계산
        if (trimLeftBars !== 0) {
            clip.audioStartMs += (trimLeftBars * secondsPerBar.value * 1000);
        }

        // 프론트에서 먼저 최종 상태 확정 (Optimistic UI)
        clip.start = newStart;
        clip.duration = newDuration;

        // 오디오 재생 위치 재동기화
        resyncClip(clip.clipId, clip.start);
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
        const tempTrackId = Date.now();

        console.log(`[통신] 트랙 추가(TRACK_ADD) 요청 전송`);

        socketService.publish('TRACK_ADD', {
            projectId: projectInfo.value.projectId,
            name: newTrackName,
            tempTrackId: tempTrackId
        });

        const newTrack: TrackUIState = {
            trackId: tempTrackId, // 백엔드 응답 시 진짜 ID로 변경 필요
            name: newTrackName,
            type: "audio",
            preTrackId: null,
            postTrackId: null,
            isMuted: false,
            isSoloed: false,
            volume: 0,
            pan: 0,
            clips: [],
            height: 100,
            isSelected: false
        }
        trackList.value.push(newTrack);

        // 1. 새 트랙의 볼륨 노드 + 패너 생성 (테스트 완료: 마스터 볼륨으로 안전하게 연결)
        const panner = new Tone.Panner(newTrack.pan / 100).connect(masterVolume);
        const vol = new Tone.Volume(newTrack.volume).connect(panner);
        
        // 개별 트랙 노드들도 스테레오 강제 유지
        panner.channelCount = 2;
        panner.channelCountMode = "explicit";
        vol.channelCount = 2;
        vol.channelCountMode = "explicit";
        // 2. 생성한 노드를 보관함(Map)에 반드시 저장
        trackVolumes.set(newTrack.trackId, vol);
        trackPanners.set(newTrack.trackId, panner);
        console.log(`[패닝 디버그] addTrack - 트랙 ${newTrack.trackId} 노드 생성 완료. vol:`, vol, "panner:", panner);
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

        const index = trackList.value.findIndex(t => t.trackId === trackId);
        if (index !== -1) {
            trackList.value[index].clips.forEach(clip => {
                const player = clipPlayers.get(clip.clipId);
                if (player) {
                    player.unsync().stop().dispose();
                    clipPlayers.delete(clip.clipId);
                }
            });

            const vol = trackVolumes.get(trackId);
            if (vol) vol.dispose();
            trackVolumes.delete(trackId);
            
            const panner = trackPanners.get(trackId);
            if (panner) panner.dispose();
            trackPanners.delete(trackId);

            trackList.value.splice(index, 1);
        }
        if (selectedTrackId.value === trackId) deselectAll();
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

        resyncClip(clipId, targetStartBar);
    };

    //클립을 다른 트랙으로 이동시키는 함수
    const moveClipToTrack = (clipId: number, fromTrackId: number, toTrackId: number) => {
        if (fromTrackId === toTrackId) return;

        const fromTrack = trackList.value.find(t => t.trackId === fromTrackId);
        const toTrack = trackList.value.find(t => t.trackId === toTrackId);

        if (!fromTrack || !toTrack) return;

        const clipIndex = fromTrack.clips.findIndex(c => c.clipId === clipId);
        if (clipIndex !== -1) {
            const [clip] = fromTrack.clips.splice(clipIndex, 1);
            toTrack.clips.push(clip);

            const player = clipPlayers.get(clipId);
            let toVol = trackVolumes.get(toTrackId);

            if (!toVol) {
                const panner = new Tone.Panner(toTrack.pan / 100).connect(masterVolume);
                toVol = new Tone.Volume(toTrack.volume).connect(panner);
                panner.channelCount = 2;
                panner.channelCountMode = "explicit";
                toVol.channelCount = 2;
                toVol.channelCountMode = "explicit";
                
                trackVolumes.set(toTrackId, toVol);
                trackPanners.set(toTrackId, panner);
            }

            if (player) {
                player.disconnect();
                player.connect(toVol);
            }
        }
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
        socketService.publish('CLIP_LOCK', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            isLocked: true // 잠가줘!
        });
    };

    // 2. 내가 클립에서 마우스를 뗐을 때 서버에 Unlock 요청
    const unlockClip = (clipId: number, trackId: number) => {
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