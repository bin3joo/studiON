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
//백엔드 통신
import { projectApi } from '../api/project.api';


//페이지 어디든 사용가능하도록 useTrackStore로 export 고유 ID는 track
export const useTrackStore = defineStore('track', () => {
    // ==========================================
    // 1. 상태(State) 선언
    // ==========================================

    //오디오 객체 보관함 만들기 순수 자바스크립트 객체 보관용이기 때문에 ref를 사용하지 않는다.
    //음원 파일의 데이터를 브라우저 메모리에 올려서 타이밍에 맞춰 스피커로 재생
    const trackChannels = new Map<number, Tone.Channel>();  //트랙별 믹서(볼륨/팬)
    const clipPlayers = new Map<number, Tone.Player>(); //클립별 오디오 플레이어

    //[1-1] 백엔드 연동 데이터
    const trackList = ref<TrackUIState[]>([]); //트랙들ㅇ르 담을 배열
    //<trackUIstate[]>로 UI용 트랙데이터만 들어올수 있음을 선언 ref이므로 추가 삭제시 화면이 반응함 

    const projectInfo = ref({ //프로젝트의 전반적인 정보를 담은 객체 
        projectId: 0,
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

    //마스터 트랙의 패닝을 제어하기 위한 글로벌 마스터 패너 생성
    const masterPanner = new Tone.Panner(0).toDestination();

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


    // 실제 오디오 파일 업로드 & 클립 추가 Action
    const uploadAndAddAudioClip = async (file: File, trackId: number, startBar: number) => {
        try {
            // 1. 향후 실제 S3 업로드 로직(Presigned URL 등)이 들어갈 자리
            // 현재는 UI 처리를 위해 로컬 Blob 사용 (유지)
            const cdnUrl = URL.createObjectURL(file);

            // 2. Tone.Player를 생성하여 오디오를 완벽히 디코딩하고 메모리에 올림
            const newPlayer = new Tone.Player();
            await newPlayer.load(cdnUrl);

            // 3. 브라우저 오디오 정책 방어 (사용자 상호작용 없이 오디오 재생 방지 풀기)
            if (Tone.getContext().state !== 'running') {
                await Tone.getContext().resume();
            }

            // 4. 정확한 길이 추출 및 마디(Bar) 단위 변환
            const durationMs = newPlayer.buffer.duration * 1000;
            const durationBar = (durationMs / 1000) / secondsPerBar.value;

            // 5. Mock 통신 대기 삭제 -> 임시 ID/랜덤 색상 발급 및 서버에 알림 (Publish)
            const tempMetadataId = Date.now();
            const tempClipId = Date.now() + Math.floor(Math.random() * 1000);
            const randomColor = "#" + Math.floor(Math.random() * 16777215).toString(16);

            socketService.publish('AUDIO_CLIP_ADD', {
                projectId: projectInfo.value.projectId,
                trackId: trackId,
                audioMetadataId: tempMetadataId, // 백엔드 명세에 맞춤
                start: startBar,
                duration: durationBar
            });

            // 6. UI 즉시 반영 (낙관적 UI) 및 믹서 연결
            const targetTrack = trackList.value.find(t => t.trackId === trackId);
            if (targetTrack) {
                const newClip: ClipUIState = {
                    clipId: tempClipId,
                    start: startBar,
                    duration: durationBar,
                    audioStartMs: 0,
                    audioDurationMs: durationMs,
                    color: randomColor,
                    audio: {
                        audioMetadataId: tempMetadataId,
                        cdnUrl: cdnUrl,
                        originalName: file.name,
                        durationMs: durationMs
                    },
                    isSelected: false,
                    isDragging: false
                };

                targetTrack.clips.push(newClip);
                checkAndExpandTimeline(newClip.start + newClip.duration);

                const targetChannel = trackChannels.get(trackId);
                if (targetChannel) {
                    newPlayer.connect(targetChannel);
                    clipPlayers.set(newClip.clipId, newPlayer);
                    resyncClip(newClip.clipId, newClip.start);
                } else {
                    console.error(`[Upload ] 타겟 트랙 채널을 찾을 수 없습니다!`);
                    newPlayer.dispose();
                }
            } else {
                console.error(`[Upload ] 트랙 리스트에서 타겟 트랙을 찾을 수 없습니다!`);
                newPlayer.dispose();
            }
        } catch (error) {
            console.error(`[Upload ] 에러 발생:`, error);
            alert("오디오 파일을 불러오는 데 실패했습니다.");
        }
    };


    // 1. 복사
    const copyClip = (clip: ClipUIState) => {
        // 깊은 복사(Deep Copy)를 통해 원본과의 참조를 완전히 끊어줍니다.
        clipboardClip.value = JSON.parse(JSON.stringify(clip));
        isCutAction.value = false;
    };

    // 2. 잘라내기
    const cutClip = async (clip: ClipUIState, trackId: number) => {
        socketService.publish('CLIP_CUT', { projectId: projectInfo.value.projectId, clipId: clip.clipId });
        clipboardClip.value = { ...JSON.parse(JSON.stringify(clip)), clipId: clip.clipId };
        isCutAction.value = true;
        deleteClip(clip.clipId, trackId);
    };

    // 3. 붙여넣기
    const pasteClip = async (targetTrackId: number, startBar: number) => {
        // 함수 시작하자마자 현재 클립보드 데이터를 일반 변수에 안전하게 빼두기
        const clipDataToPaste = clipboardClip.value;

        // clipDataToPaste를 검사
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
        const tempClipId = Date.now() + Math.floor(Math.random() * 1000);  // 낙관적 UI를 위한 임시 ID
        console.log(`[통신] 백엔드에 붙여넣기(CLIP_PASTE) 요청 전송 중...`);

        // 서버로 붙여넣기 이벤트 쏘기 (프론트가 계산한 안전한 위치 resolvedStart 전송)
        socketService.publish('CLIP_PASTE', {
            projectId: projectInfo.value.projectId,
            targetTrackId: targetTrackId,
            targetStartBar: resolvedStart
        });

        // 화면에 즉시 그리기 (낙관적 UI)
        const newClip: ClipUIState = {
            ...clipDataToPaste,
            clipId: tempClipId,
            start: resolvedStart,
            isSelected: false,
            isDragging: false
        };

        checkAndExpandTimeline(resolvedStart + newClip.duration);
        targetTrack.clips.push(newClip);

        // 오디오 스케줄링
        const targetChannel = trackChannels.get(targetTrackId);
        if (targetChannel && newClip.audio?.cdnUrl) {
            const newPlayer = new Tone.Player().connect(targetChannel);
            newPlayer.load(newClip.audio.cdnUrl).then(() => {
                if (Tone.getContext().state !== 'running') Tone.getContext().resume();
                const exactStartTimeSec = newClip.start * secondsPerBar.value;
                const audioOffsetSec = (newClip.audioStartMs || 0) / 1000;
                newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, newClip.duration * secondsPerBar.value);
                clipPlayers.set(newClip.clipId, newPlayer);
            });
        }

        // 잘라내기 후 붙여넣기였다면 클립보드 비우기
        if (isCutAction.value) {
            clipboardClip.value = null;
            isCutAction.value = false;
        }
    };


    // 삭제
    const deleteClip = (clipId: number, trackId: number) => {
        // 1. 서버로 삭제 이벤트 쏘기 (기다리지 않음!)
        socketService.publish('CLIP_DELETE', {
            projectId: projectInfo.value.projectId,
            clipId: clipId
        });

        // 2. 화면에서 즉시 클립 지우기 (낙관적 UI)
        const track = trackList.value.find(t => t.trackId === trackId);
        if (track) {
            const index = track.clips.findIndex(c => c.clipId === clipId);
            if (index !== -1) track.clips.splice(index, 1);
        }

        // 3. 오디오 엔진에서 플레이어 정지 및 메모리 삭제! (유령 소리 방지)
        const player = clipPlayers.get(clipId);
        if (player) {
            player.unsync();  // 예약된 재생 스케줄 취소
            player.stop();    // 현재 재생 중이면 즉시 멈춤
            player.dispose(); // 오디오 객체 파괴 (메모리 완전 해제)
            clipPlayers.delete(clipId); // Map에서도 삭제
            console.log(`클립 ${clipId} 오디오 삭제 완료`);
        }
    };


    // 4. 클립 복제 (Duplicate - Pessimistic UI)
    const duplicateClip = (clip: ClipUIState, trackId: number) => {
        // 1. 서버로 복제 이벤트 쏘기 (기다리지 않음!)
        socketService.publish('CLIP_DUPLICATE', {
            projectId: projectInfo.value.projectId,
            clipId: clip.clipId
        });

        //2. 화면에 즉시 그리기 (낙관적 UI)
        const targetTrack = trackList.value.find(t => t.trackId === trackId);
        if (!targetTrack) return;

        // 원본 클립의 바로 뒤에 붙이도록 임시 위치와 임시 ID 발급
        const duplicatedClip: ClipUIState = {
            ...JSON.parse(JSON.stringify(clip)),
            clipId: Date.now() + Math.floor(Math.random() * 1000), // 임시 ID
            start: clip.start + clip.duration, // 원본 클립 끝나는 지점에 바로 이어 붙임
            isSelected: false,
            isDragging: false
        };

        checkAndExpandTimeline(duplicatedClip.start + duplicatedClip.duration);
        targetTrack.clips.push(duplicatedClip);

        //3. 오디오 엔진에 새 클립 로딩 및 스케줄링 등록
        const targetChannel = trackChannels.get(trackId);
        if (targetChannel && duplicatedClip.audio?.cdnUrl) {
            const newPlayer = new Tone.Player().connect(targetChannel);
            newPlayer.load(duplicatedClip.audio.cdnUrl).then(() => {
                if (Tone.getContext().state !== 'running') Tone.getContext().resume();

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

        //1. 서버로 분할 이벤트 쏘기 (기다리지 않음!)
        socketService.publish('CLIP_SPLIT', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            splitBar: currentBar
        });

        // 2. 재생 상태 캡처 및 Transport 정지 (한 곳에서만 제어)
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

        // 3. 오른쪽 클립 정보 세팅 (서버 응답 대신 임시 ID 발급)
        const rightClip: ClipUIState = {
            ...JSON.parse(JSON.stringify(originalClip)),
            clipId: Date.now() + Math.floor(Math.random() * 1000), // 임시 ID
            start: currentBar,
            duration: rightClipDuration,
            audioStartMs: rightAudioStartMs,
            audioDurationMs: Math.max(0, originalClip.audioDurationMs - splitOffsetMs)
        };

        // 왼쪽 클립(원본) 정보 수정 및 화면 갱신
        originalClip.duration = splitOffsetBars;
        originalClip.audioDurationMs = splitOffsetMs;

        track.clips.push(rightClip);

        // 4. 왼쪽 클립 안전하게 재설정 (내부적으로 pause/start 안 됨)
        resyncClip(originalClip.clipId, originalClip.start);

        // 5. 오른쪽 클립 동기(await) 로딩 및 스케줄링
        const targetChannel = trackChannels.get(trackId);
        if (targetChannel && rightClip.audio?.cdnUrl) {
            const newPlayer = new Tone.Player().connect(targetChannel);
            await newPlayer.load(rightClip.audio.cdnUrl); // 동기 대기!

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

        //6. 모든 작업이 끝난 후 한 번만 재개!
        if (wasPlaying) {
            const currentOffset = playheadPosition.value * secondsPerBar.value;
            Tone.getTransport().start("+0.01", currentOffset);
            isPlaying.value = true;
            updatePlayheadLoop();
        }
    };

    // 6. 클립 길이 조절 (Resize / Trim)
    // UI에서 임시로 조절해둔 값을 서버에 컨펌받고 오디오를 재조정합니다.
    const resizeClip = (clipId: number, trackId: number, newStart: number, newDuration: number, trimLeftBars: number) => {
        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track) return;
        const clip = track.clips.find(c => c.clipId === clipId);
        if (!clip) return;

        // 1. 서버로 리사이즈 이벤트 쏘기 (기다리지 않음!)
        socketService.publish('CLIP_RESIZE', {
            projectId: projectInfo.value.projectId,
            clipId: clipId,
            startBar: newStart,
            length: newDuration
        });

        // 2. 오디오 실제 데이터 시작점(Trim) 계산
        // 왼쪽을 줄였으면, 오디오 원본에서도 그만큼 늦게 시작해야 함!
        if (trimLeftBars !== 0) {
            clip.audioStartMs += (trimLeftBars * secondsPerBar.value * 1000);
        }

        // 3. 최종 상태 확정 (서버 응답을 기다리지 않고 인자로 받은 새 값을 즉시 적용)
        clip.start = newStart;
        clip.duration = newDuration;

        // 4. 오디오 재생 위치 재동기화
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
                    ...JSON.parse(JSON.stringify(clip)), // 깊은 복사로 원본과 참조 분리
                    // 렌더링 성능(프리징) 방지를 위해 기존 ID를 기반으로 고정된 새 ID 부여
                    clipId: clip.clipId + 9000000,
                    // 여러 트랙이 겹쳤을 때 보기 좋도록 마스터 트랙 클립 색상을 차분한 회색으로 통일
                    color: '#4b4b4b',
                    isSelected: false,
                    isDragging: false
                });
            });
        });

        masterTrack.value.clips = mergedClips;
    }, { deep: true, immediate: true }); // deep:true로 클립 이동/길이 변화까지 모두 감지

    //새로운 트랙 추가 액션
    const addTrack = async () => {
        const newTrackName = `트랙 ${trackList.value.length + 1}`;
        const tempTrackId = Date.now(); // 💡 임시 ID 사용

        // 서버 알림
        socketService.publish('TRACK_ADD', { projectId: projectInfo.value.projectId, name: newTrackName, type: "audio" });

        // 화면 즉시 반영
        const newTrack: TrackUIState = {
            trackId: tempTrackId, name: newTrackName, type: "audio", preTrackId: null, postTrackId: null,
            isMuted: false, isSoloed: false, volume: 0, pan: 0, clips: [], height: 100, isSelected: false
        }
        trackList.value.push(newTrack);

        const channel = new Tone.Channel(newTrack.volume, newTrack.pan).connect(masterPanner);
        trackChannels.set(newTrack.trackId, channel);
    };

    // ==========================================
    // 오디오 출력 상태 동기화 (Solo / Mute 통합 관리)
    // ==========================================
    const syncEffectiveMuteStates = () => {
        // 프로젝트 전체에 솔로가 켜진 트랙이 단 하나라도 있는지 검사합니다.
        const isAnySoloed = trackList.value.some(t => t.isSoloed);

        trackList.value.forEach(t => {
            const channel = trackChannels.get(t.trackId);
            if (channel) {
                if (isAnySoloed) {
                    // 1. 누군가 솔로를 켰다면 -> 솔로가 안 켜진 트랙은 무조건 뮤트!
                    channel.mute = !t.isSoloed;
                } else {
                    // 2. 솔로가 아무도 안 켜져 있다면 -> 각자의 뮤트 버튼 상태를 존중
                    channel.mute = t.isMuted;
                }
            }
        });
    };

    // 트랙 음소거(Mute) 토글
    const toggleTrackMute = async (trackId: number) => {
        if (trackId === 999999) return; // 마스터 트랙 제외
        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track) return;

        track.isMuted = !track.isMuted;

        // 변경된 상태를 기준으로 전체 트랙 오디오 실제 출력 재계산
        syncEffectiveMuteStates();

        socketService.publish('TRACK_MUTE_CHANGE', { projectId: projectInfo.value.projectId, trackId, isMuted: track.isMuted });
    };

    // 트랙 솔로(Solo) 토글
    const toggleTrackSolo = async (trackId: number) => {
        if (trackId === 999999) return; // 마스터 트랙 제외
        const targetTrack = trackList.value.find(t => t.trackId === trackId);
        if (!targetTrack) return;

        const isTurningOn = !targetTrack.isSoloed; // 솔로를 키는 상황인지 판별

        // 1. 솔로를 켜는 상황이라면, 다른 모든 트랙의 솔로 상태를 강제로 끈다.
        if (isTurningOn) {
            trackList.value.forEach(t => {
                if (t.trackId !== trackId && t.isSoloed) {
                    t.isSoloed = false; // UI 상태 해제
                    const channel = trackChannels.get(t.trackId);
                    if (channel) channel.solo = false; // 오디오 엔진 솔로 해제

                    // 서버에도 다른 트랙들의 솔로가 꺼졌음을 알림
                    socketService.publish('TRACK_SOLO_CHANGE', { projectId: projectInfo.value.projectId, trackId: t.trackId, isSoloed: false });
                }
            });
        }

        // 2. 내가 클릭한 트랙의 상태를 토글
        targetTrack.isSoloed = isTurningOn;
        const channel = trackChannels.get(trackId);
        if (channel) channel.solo = targetTrack.isSoloed;

        // 3. 전체 뮤트 상태 재계산 (방금 켠 솔로 트랙만 소리가 나고 나머지는 강제 뮤트됨)
        syncEffectiveMuteStates();

        // 4. 클릭한 트랙의 서버 통신 진행
        socketService.publish('TRACK_SOLO_CHANGE', { projectId: projectInfo.value.projectId, trackId, isSoloed: targetTrack.isSoloed });
    };

    // 트랙 볼륨 조절 (-60dB ~ 6dB)
    const setTrackVolume = (trackId: number, volume: number) => {
        if (trackId === 999999) {
            masterTrack.value.volume = volume;
            Tone.getDestination().volume.value = volume; // 글로벌 마스터 볼륨 조절
            return;
        }

        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track) return;

        track.volume = volume;
        const channel = trackChannels.get(trackId);
        if (channel) channel.volume.value = volume;

        socketService.publish('TRACK_VOLUME_CHANGE', { projectId: projectInfo.value.projectId, trackId, volume });
    };

    // ==========================================
    // 볼륨 UI 정중앙(0dB) 비선형 매핑 로직
    // ==========================================
    // 1. 실제 볼륨(dB) -> 화면 슬라이더 위치(%)
    const getVolumePercent = (vol: number) => {
        if (vol <= 0) {
            return ((vol + 60) / 60) * 50; // -60~0dB 구간을 0~50% 영역에 그림
        } else {
            return 50 + (vol / 6) * 50;    // 0~6dB 구간을 50~100% 영역에 그림
        }
    };

    // 2. 화면 슬라이더 위치(%) -> 실제 볼륨(dB)
    const getVolumeFromPercent = (percent: number) => {
        if (percent <= 50) {
            return (percent / 50) * 60 - 60; // 0~50% 클릭 시 -60~0dB 로 변환
        } else {
            return ((percent - 50) / 50) * 6; // 50~100% 클릭 시 0~6dB 로 변환
        }
    };

    // 트랙 패닝 조절 (-100 ~ 100)
    const setTrackPan = (trackId: number, pan: number) => {
        if (trackId === 999999) {
            masterTrack.value.pan = pan;
            masterPanner.pan.value = pan / 100; // 글로벌 마스터 패닝 조절
            return;
        }

        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track) return;

        track.pan = pan;
        const channel = trackChannels.get(trackId);
        if (channel) channel.pan.value = pan / 100;

        socketService.publish('TRACK_PAN_CHANGE', { projectId: projectInfo.value.projectId, trackId, pan });
    };

    //트랙 삭제 기능
    const deleteTrack = async (trackId: number) => {
        if (trackId === 999999) return; // 마스터 트랙 삭제 방지
        console.log(`[통신] 백엔드에 트랙 삭제(TRACK_DELETE) 요청 중...`);

        const index = trackList.value.findIndex(t => t.trackId === trackId);
        if (index !== -1) {
            // 트랙 내 모든 클립의 오디오 플레이어 정지 및 메모리 해제
            trackList.value[index].clips.forEach(clip => {
                const player = clipPlayers.get(clip.clipId);
                if (player) {
                    player.unsync().stop().dispose();
                    clipPlayers.delete(clip.clipId);
                }
            });

            // 트랙 믹서 채널 해제
            const channel = trackChannels.get(trackId);
            if (channel) channel.dispose();
            trackChannels.delete(trackId);

            trackList.value.splice(index, 1); // 트랙 제거
        }
        if (selectedTrackId.value === trackId) deselectAll();
        console.log(`[통신 성공] 트랙 삭제 완료: ${trackId}`);

    };

    // 트랙 이름 변경 로직
    const renameTrack = async (trackId: number, newName: string) => {
        if (trackId === 999999) return; // 마스터 트랙은 변경 불가
        const track = trackList.value.find(t => t.trackId === trackId);
        if (!track || track.name === newName) return;

        track.name = newName;
        socketService.publish('TRACK_RENAME', { projectId: projectInfo.value.projectId, trackId, name: newName });
    };

    // 트랙 순서 변경 로직
    const reorderTrack = async (draggedTrackId: number, targetIndex: number) => {
        if (draggedTrackId === 999999) return; // 마스터 트랙은 이동 불가

        const draggedIndex = trackList.value.findIndex(t => t.trackId === draggedTrackId);
        if (draggedIndex === -1 || draggedIndex === targetIndex) return;

        // 1. 배열에서 트랙을 빼내서 새 위치에 삽입 (UI 즉각 반영)
        const [track] = trackList.value.splice(draggedIndex, 1);
        trackList.value.splice(targetIndex, 0, track);

        // 2. 서버 통신을 위한 preTrackId, postTrackId 계산
        const preTrackId = targetIndex > 0 ? trackList.value[targetIndex - 1].trackId : null;
        const postTrackId = targetIndex < trackList.value.length - 1 ? trackList.value[targetIndex + 1].trackId : null;

        socketService.publish('TRACK_REORDER', {
            projectId: projectInfo.value.projectId, trackId: draggedTrackId, targetPreTrackId: preTrackId, targetPostTrackId: postTrackId
        });
    };

    // ==========================================
    // 3. 액션(Action) 선언(데이터 패칭 및 가공)
    // ==========================================


    // 드래그 앤 드롭 종료 시 서버 확정 통신
    const confirmMoveClip = async (clipId: number, targetTrackId: number, targetStartBar: number) => {
        socketService.publish('CLIP_MOVE', { projectId: projectInfo.value.projectId, clipId, targetTrackId, targetStartBar });
        resyncClip(clipId, targetStartBar);
    };

    //클립을 다른 트랙으로 이동시키는 함수
    const moveClipToTrack = (clipId: number, fromTrackId: number, toTrackId: number) => {
        if (fromTrackId === toTrackId) return; //같은 트랙이면 취소

        const fromTrack = trackList.value.find(t => t.trackId === fromTrackId);
        const toTrack = trackList.value.find(t => t.trackId === toTrackId);

        if (!fromTrack || !toTrack) return;

        // 기존 트랙에서 클립을 찾아내 빼낸다.
        const clipIndex = fromTrack.clips.findIndex(c => c.clipId === clipId);
        if (clipIndex !== -1) {
            const [clip] = fromTrack.clips.splice(clipIndex, 1);
            toTrack.clips.push(clip);

            // 오디오 Player를 새 트랙의 Channel에 재연결
            const player = clipPlayers.get(clipId);
            let toChannel = trackChannels.get(toTrackId);

            // 대상 트랙에 Channel이 없으면 새로 생성
            if (!toChannel) {
                toChannel = new Tone.Channel(toTrack.volume, toTrack.pan).connect(masterPanner);
                trackChannels.set(toTrackId, toChannel);
            }

            if (player) {
                player.disconnect(); // 이전 트랙 Channel과의 연결 해제
                player.connect(toChannel); // 새 트랙 Channel에 재연결
            }
        }
    };
    // 디버그용 변수 (로그 폭탄 방지용)
    let debugLoopCount = 0;

    //재생 상태 토글 함수
    const togglePlay = () => { // async 제거 (더 이상 여기서 대기하지 않음)
        try {
            if (!isPlaying.value) {
                const offsetTime = playheadPosition.value * secondsPerBar.value;

                // 절대 시간(Tone.now()) 대신 상대 시간("+0.01")과 오프셋을 결합하여 스케줄링
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

        if (playheadPosition.value >= projectInfo.value.totalBarCount) {
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
            //휠을 아래루 굴림: 축소(최소 0.5배)
            zoomlevel.value = Math.max(0.5, zoomlevel.value - zoomStep);
        } else {
            //휠을 위로 굴림: 확대(최대 3배)
            zoomlevel.value = Math.min(3, zoomlevel.value + zoomStep);
        }
    }

    //오디오 파일 로딩 및 Transport 조절 함수
    const setupAudioEngine = async (tracks: TrackUIState[]) => {
        console.log("========== [Audio Engine Setup Start] ==========");

        // 1. 모든 트랙의 믹서 채널(Tone.Channel)을 무조건 먼저 생성합니다. (클립 유무 상관없음)
        for (const track of tracks) {
            if (!trackChannels.has(track.trackId)) {
                const channel = new Tone.Channel(track.volume, track.pan).connect(masterPanner);
                trackChannels.set(track.trackId, channel);
                console.log(`[Setup] 트랙 ${track.trackId} ('${track.name}') 믹서 채널 생성 완료.`);
            }
        }

        // 2. 각 트랙의 클립 오디오를 로드하고 스케줄링합니다.
        for (const track of tracks) {
            const channel = trackChannels.get(track.trackId);
            if (!channel) continue;

            for (const clip of track.clips) {
                if (!clip.audio?.cdnUrl) {
                    console.warn(`[Setup ⚠️] 클립 ${clip.clipId}에 오디오 URL이 없어 로딩 건너뜀.`);
                    continue;
                }

                console.log(`[Setup] 클립 ${clip.clipId} 오디오 로딩 시도 중...`);
                const player = new Tone.Player().connect(channel);

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
            // 실제 백엔드 API 호출!
            const data = await projectApi.getProjectDetail(projectId);

            if (data) {
                projectInfo.value = {
                    projectId: data.projectId,
                    tempo: data.tempo,
                    rootNote: data.rootNote,
                    mode: data.projectMode, // API 명세 기준 (projectMode)
                    timeSigNumerator: data.timeSigNumerator,
                    timeSigDenominator: data.timeSigDenominator,
                    totalBarCount: data.totalBarCount
                };

                bpm.value = data.tempo;

                trackList.value = data.tracks.map((track): TrackUIState => ({
                    ...track, height: 100, isSelected: false,
                    clips: track.clips.map((clip): ClipUIState => ({
                        ...clip, isSelected: false, isDragging: false, isLocked: false
                    }))
                }));

                let maxClipEnd = 0;
                trackList.value.forEach(track => {
                    track.clips.forEach(clip => {
                        const clipEnd = clip.start + clip.duration;
                        if (clipEnd > maxClipEnd) maxClipEnd = clipEnd;
                    });
                });

                checkAndExpandTimeline(maxClipEnd);
                setupAudioEngine(trackList.value);

                // 마스터 트랙 정보 초기 셋팅 (API 응답 데이터에 있을 경우)
                if ((data as any).masterTrack) {
                    masterTrack.value.volume = (data as any).masterTrack.volume;
                    masterTrack.value.pan = (data as any).masterTrack.pan;
                    Tone.getDestination().volume.value = masterTrack.value.volume;
                    masterPanner.pan.value = masterTrack.value.pan / 100;
                }
            }
        } catch (error) {
            console.error("프로젝트 로딩 실패:", error);
        }
    };

    socketService.subscribe('CLIP_LOCK', (data) => {
        // 서버(혹은 가상 서버)에서 누군가 클립을 잠갔다는 알림이 옴!
        // 내 화면의 클립 자물쇠를 그에 맞게 업데이트!
        const track = trackList.value.find(t => t.clips.some(c => c.clipId === data.clipId));
        if (track) {
            const clip = track.clips.find(c => c.clipId === data.clipId);
            if (clip) {
                clip.isLocked = data.isLocked; // 내 화면에도 자물쇠 찰칵!
            }
        }
    });

    // 2. 내가 액션을 했을 때 서버로 쏘기
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