//API로 받아온 데이터를 가공해서 보관하는 창고
//데이터 창고 피니아
import { defineStore } from 'pinia';
//화면이 바뀌아도 자동으로 다시그리게 함 반응형
import { ref, computed, watch } from 'vue';
//백엔드 통신 담당
// import { projectApi } from '../api/project.api';
//트랙과 클립의 타입
import type { TrackUIState, ClipUIState } from '../types';
//음원 처리를 위한 lib
import * as Tone from 'tone';


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
    Tone.getTransport().bpm.value = bpm.value; // transport는 백 그라운드의 오디오 시계 역할을 함. 여기 tempo를 조정하면 전체 앱의 빠르기가 바뀜.

    //bpm이 변경될때마다 Tone.js Transport의 템포도 함께 업데이트
    watch(bpm, (newBpm) => {
        Tone.getTransport().bpm.value = newBpm;
    })
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
// 가짜 백엔드 서버 통신 모듈 (명세서에 맞게 구현)
    const mockServerAPI = {
        // 1. 붙여넣기(CLIP_PASTE) 통신 흉내
        emitPaste: async (projectId: number, targetTrackId: number, targetStartBar: number) => {
            return new Promise<any>((resolve) => {
                setTimeout(() => {
                    resolve({
                        event: "CLIP_PASTE",
                        project_id: projectId,
                        clip_id: Math.floor(Math.random() * 10000) + 1, // 서버의 DB가 발급한 진짜 ID
                        user_id: 1,
                        target_track_id: targetTrackId,
                        target_start_bar: targetStartBar
                    });
                }, 300); // 인터넷 딜레이 0.3초 체험
            });
        },
        // 2. 복제(CLIP_DUPLICATE) 통신 흉내
        emitDuplicate: async (projectId: number, originalClipId: number, targetTrackId: number, targetStartBar: number) => {
            return new Promise<any>((resolve) => {
                setTimeout(() => {
                    resolve({
                        event: "CLIP_DUPLICATE",
                        project_id: projectId,
                        clip_id: originalClipId,
                        new_clip_id: Math.floor(Math.random() * 10000) + 1, // 복제된 새 클립의 진짜 ID
                        target_track_id: targetTrackId,
                        target_start_bar: targetStartBar
                    });
                }, 300);
            });
        },


    // 3. 분할(CLIP_SPLIT) 통신 흉내[cite: 39]
        emitSplit: async (projectId: number, clipId: number, splitBar: number) => {
            return new Promise<any>((resolve) => {
                setTimeout(() => {
                    resolve({
                        event: "CLIP_SPLIT",
                        project_id: projectId,
                        originalClipId: clipId,
                        newClipId: Math.floor(Math.random() * 10000) + 1, // 백엔드가 발급한 새 클립 ID
                        splitBar: splitBar
                    });
                }, 300);
            });
        },

        // 4. 리사이징(CLIP_RESIZE) 통신 흉내[cite: 38]
        emitResize: async (projectId: number, clipId: number, startBar: number, length: number) => {
            return new Promise<any>((resolve) => {
                setTimeout(() => {
                    resolve({
                        event: "CLIP_RESIZE",
                        project_id: projectId,
                        clipId: clipId,
                        after: {
                            startBar: startBar,
                            length: length
                        }
                    });
                }, 300);
            });
        }
    };

   // 1. 복사
const copyClip = (clip: ClipUIState) => {
    // 깊은 복사(Deep Copy)를 통해 원본과의 참조를 완전히 끊어줍니다.
    clipboardClip.value = JSON.parse(JSON.stringify(clip));
    isCutAction.value = false;
};

// 2. 잘라내기
const cutClip = (clip: ClipUIState, trackId: number) => {
    const generatedId = () => Math.floor(Math.random() * 4294967296);
    
    // 깊은 복사 + 새로운 고유 ID 부여
    const clonedData = JSON.parse(JSON.stringify(clip));
    clipboardClip.value = {
        ...clonedData,
        clipId: generatedId() 
    };
    
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
        console.log(`[통신] 백엔드에 붙여넣기(CLIP_PASTE) 요청 전송 중...`);

        try {
            // 서버에 요청을 보내고 진짜 ID가 올 때까지 기다림 (await)
            const response = await mockServerAPI.emitPaste(projectInfo.value.projectId, targetTrackId, resolvedStart);

            console.log(`[통신 성공] 백엔드가 진짜 ID를 줬습니다!: ${response.clip_id}`);

            // 응답이 오면, 화면에 클립을 그려줌.
            const newClip: ClipUIState = {
                ...clipDataToPaste,               
                clipId: response.clip_id,            // 임시 ID 버리고 백엔드가 준 진짜 ID 사용
                start: response.target_start_bar,    // 백엔드가 확정해 준 위치 사용
                isSelected: false,
                isDragging: false
            };

            checkAndExpandTimeline(response.target_start_bar + newClip.duration);
            targetTrack.clips.push(newClip); 

            // 4. 오디오 플레이어 진짜 ID로 생성
            const targetChannel = trackChannels.get(targetTrackId);
            if (targetChannel && newClip.audio?.cdnUrl) {
                const newPlayer = new Tone.Player().connect(targetChannel);
                newPlayer.load("/test.mp3").then(() => {
                    const exactStartTimeSec = newClip.start * secondsPerBar.value;
                    const audioOffsetSec = (clipDataToPaste.audioStartMs || 0) / 1000;
                    const audioDurationSec = clipDataToPaste.duration * secondsPerBar.value;

                    newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, audioDurationSec);
                    clipPlayers.set(newClip.clipId, newPlayer); // ID(Key)로 안전하게 저장
                });
            }
        } catch (error) {
            console.error("통신 실패! 화면에 그리지 않습니다.", error);
        }

        // 잘라내기 처리
        if (isCutAction.value) {
            clipboardClip.value = null;
            isCutAction.value = false;
        }
    };

// 백엔드에서 성공 응답이 왔을 때 실행할 리스너 함수
// socket.on('CLIP_PASTE_SUCCESS', (response) => {
//     const track = trackList.value.find(t => t.trackId === response.targetTrackId);
//     const clip = track.clips.find(c => c.clipId === tempClipId); // tempClipId로 임시 클립 찾기
//     if (clip) {
//         clip.clipId = response.clipId; // 진짜 백엔드 ID로 교체
//     }
// });

// 삭제
const deleteClip = (clipId: number, trackId: number) => {
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
const duplicateClip = async (clip: ClipUIState, trackId: number) => {
    const targetTrack = trackList.value.find(t => t.trackId === trackId);
    if (!targetTrack) return;

    let resolvedStart = clip.start + clip.duration;
    const duration = clip.duration;
    let hasOverlap = true;
    const epsilon = 0.001;
    let safetyCounter = 0;

    while (hasOverlap && safetyCounter < 100) {
        hasOverlap = false;
        safetyCounter++;
        for (const existingClip of targetTrack.clips) {
            const existingStart = existingClip.start;
            const existingEnd = existingClip.start + existingClip.duration;
            const desiredEnd = resolvedStart + duration;
            if (resolvedStart < existingEnd - epsilon && desiredEnd > existingStart + epsilon) {
                hasOverlap = true;
                resolvedStart = existingEnd; 
                break;
            }
        }
    }

    console.log(`[통신] 백엔드에 클립 복제(CLIP_DUPLICATE) 요청 전송 중...`);

    try {
        // 복제 통신 대기!
        const response = await mockServerAPI.emitDuplicate(projectInfo.value.projectId, clip.clipId, trackId, resolvedStart);
        
        console.log(`[통신 성공] 복제된 새 클립의 진짜 ID: ${response.new_clip_id}`);

        const duplicatedClip: ClipUIState = {
            ...JSON.parse(JSON.stringify(clip)), 
            clipId: response.new_clip_id,        // 백엔드 진짜 ID!
            start: response.target_start_bar,
            isSelected: false,
            isDragging: false
        };

        checkAndExpandTimeline(response.target_start_bar + duplicatedClip.duration);
        targetTrack.clips.push(duplicatedClip);

        const targetChannel = trackChannels.get(trackId);
        if (targetChannel && duplicatedClip.audio?.cdnUrl) {
            const newPlayer = new Tone.Player().connect(targetChannel);
            newPlayer.load("/test.mp3").then(() => {
                const exactStartTimeSec = duplicatedClip.start * secondsPerBar.value;
                const audioOffsetSec = (clip.audioStartMs || 0) / 1000;
const audioDurationSec = clip.duration * secondsPerBar.value;

newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, audioDurationSec);
                clipPlayers.set(duplicatedClip.clipId, newPlayer); // 진짜 ID로 저장
            });
        }
    } catch (error) {
        console.error("복제 통신 실패!", error);
    }
};
// 5. 클립 분할 (Split)
const splitClip = async (clipId: number, trackId: number) => {
    const track = trackList.value.find(t => t.trackId === trackId);
    if (!track) return;

    const clipIndex = track.clips.findIndex(c => c.clipId === clipId);
    const originalClip = track.clips[clipIndex];
    if (!originalClip) return;

    const currentBar = playheadPosition.value; // 현재 재생바 위치 기준

    // 재생바가 클립 영역 안에 있는지 검사
    if (currentBar <= originalClip.start || currentBar >= originalClip.start + originalClip.duration) {
        alert("재생바(Playhead)가 클립 위에 있어야 분할할 수 있습니다.");
        return;
    }

    console.log(`[통신] 클립 분할(CLIP_SPLIT) 요청 중...`);

    try {
        const response = await mockServerAPI.emitSplit(projectInfo.value.projectId, clipId, currentBar);
        console.log(`[통신 성공] 새 클립 ID 발급됨: ${response.newClipId}`);

        // 분할 기준점 계산
        const splitOffsetBars = currentBar - originalClip.start;
        const splitOffsetMs = splitOffsetBars * secondsPerBar.value * 1000;

        // 1. 오른쪽 클립 (새로 생성됨)
        const rightClip: ClipUIState = {
            ...JSON.parse(JSON.stringify(originalClip)),
            clipId: response.newClipId,
            start: currentBar,
            duration: originalClip.duration - splitOffsetBars,
            audioStartMs: originalClip.audioStartMs + splitOffsetMs, // 오디오 시작점 뒤로 밀림
            audioDurationMs: originalClip.audioDurationMs - splitOffsetMs
        };

        // 2. 왼쪽 클립 (원본 수정)
        originalClip.duration = splitOffsetBars;
        originalClip.audioDurationMs = splitOffsetMs;

        // 화면 갱신
        track.clips.push(rightClip);

        // 오디오 엔진 재설정 (왼쪽 갱신, 오른쪽 새로 생성)
        resyncClip(originalClip.clipId, originalClip.start);
        
        const targetChannel = trackChannels.get(trackId);
        if (targetChannel && rightClip.audio?.cdnUrl) {
            const newPlayer = new Tone.Player().connect(targetChannel);
            newPlayer.load("/test.mp3").then(() => {
                const exactStartTimeSec = rightClip.start * secondsPerBar.value;
               const audioOffsetSec = (rightClip.audioStartMs || 0) / 1000;
                const audioDurationSec = rightClip.duration * secondsPerBar.value;

                newPlayer.sync().start(exactStartTimeSec, audioOffsetSec, audioDurationSec);
                clipPlayers.set(rightClip.clipId, newPlayer);
            });
        }
    } catch (e) {
        console.error("분할 실패", e);
    }
};

// 6. 클립 길이 조절 (Resize / Trim)
// UI에서 임시로 조절해둔 값을 서버에 컨펌받고 오디오를 재조정합니다.
const resizeClip = async (clipId: number, trackId: number, newStart: number, newDuration: number, trimLeftBars: number) => {
    const track = trackList.value.find(t => t.trackId === trackId);
    if (!track) return;
    const clip = track.clips.find(c => c.clipId === clipId);
    if (!clip) return;

    console.log(`[통신] 클립 리사이즈(CLIP_RESIZE) 요청 중...`);

    try {
        const response = await mockServerAPI.emitResize(projectInfo.value.projectId, clipId, newStart, newDuration);
        console.log(`[통신 성공] 리사이즈 완료!`);

        // 오디오 실제 데이터 시작점(Trim) 계산
        // 왼쪽을 줄였으면, 오디오 원본에서도 그만큼 늦게 시작해야 함!
        if (trimLeftBars !== 0) {
            clip.audioStartMs += (trimLeftBars * secondsPerBar.value * 1000);
        }
        
        // 최종 상태 확정
        clip.start = response.after.startBar;
        clip.duration = response.after.length;

        // 오디오 재생 위치 재동기화
        resyncClip(clip.clipId, clip.start);
        
    } catch (e) {
        console.error("리사이즈 실패", e);
    }
};

    // ==========================================
    // 3. 액션(Action) 선언(데이터 패칭 및 가공)
    // ==========================================

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
            //vue의 반응성으로 즉시 이동
            toTrack.clips.push(clip);
        }
    };

    //재생 상태 토글 함수
    const togglePlay = async () => {
        //첫 클릭 시 오디오 컨텍스트 시작
        if (Tone.getContext().state !== 'running') {
            await Tone.start();
        }

        if (!isPlaying.value) {
            // 정지 상태일 때 -> 재생 시작
            // 1. 현재 재생바 위치를 Tone.js 시간으로 변환하여 세팅
            Tone.getTransport().seconds = playheadPosition.value * secondsPerBar.value;
            // 2. 오디오 엔진 재생 시작
            Tone.getTransport().start("+0.05");
            isPlaying.value = true;
            // 3. UI 업데이트 루프 시작
            updatePlayheadLoop();
        } else {
            //  재생 중일 때 -> 일시정지
            Tone.getTransport().pause();
            isPlaying.value = false;
            cancelAnimationFrame(animationFrameId);
        }
    };

    //실시간 재생바 UI 업데이트 루프
    const updatePlayheadLoop = () => {
        if (!isPlaying.value) return; //재생중이 아닐때는 루프 멈춤
        //정밀한 현재 시간 가져오기
        playheadPosition.value = Tone.getTransport().seconds / secondsPerBar.value;
        //재생바 프로젝트 전체 길이에 도달하면 자동 정지
        if (playheadPosition.value >= projectInfo.value.totalBarCount) {
            stopPlay();
            return;
        }
        //모니터 주사율에 맞춰 부드럽게 반복
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
        //테스트용 드럼 루프 파일 (CORS 허용)
        const sampleUrl = "/test.mp3";

        for (const track of tracks) {
            //1.트랙 믹서 채널 생성 및 마스터 스피커(Destination)에 연결
            const channel = new Tone.Channel(track.volume, track.pan).toDestination();
            trackChannels.set(track.trackId, channel);

            for (const clip of track.clips) {
                //2. 오디오 플레이어 생성 및 버퍼 다운로드 시작
                //clip.audio.url을 넣어야 하지만 지금은 샘플 유알엘 사용
                const player = new Tone.Player().connect(channel);

                //파일이 브라우저 메모리에 완벽히 올라갈 때까지 대기
                await player.load(sampleUrl);
                console.log(`클립${clip.clipId} 로딩 완료`);

                //3. 정확한 초 계산
                const exactStartTimeSec = clip.start * secondsPerBar.value;
                const audioOffsetSec = (clip.audioStartMs || 0) / 1000;
                const audioDurationSec = clip.duration * secondsPerBar.value;

                player.sync().start(exactStartTimeSec, audioOffsetSec, audioDurationSec);

                //단일 클립 재생/정지용 플레이어 저장
                clipPlayers.set(clip.clipId, player);
            }
        }
    }

    //클립 위치가 변경되었을 때 오디오 엔진 스케줄을 재설정 하는 함수
    const resyncClip = (clipId: number, newStartBar: number) => {
       // 1. 해당 클립의 플레이어와 데이터를 모두 찾습니다.
    const player = clipPlayers.get(clipId);
    
    // 전체 트랙을 뒤져서 이 클립의 최신 정보(audioStartMs, duration)를 가져옵니다.
    let targetClip: ClipUIState | null = null;
    for (const track of trackList.value) {
        const found = track.clips.find(c => c.clipId === clipId);
        if (found) {
            targetClip = found;
            break;
        }
    }

    if (player && targetClip) {
        const wasPlaying = isPlaying.value;

        // 재생 중이라면 잠깐 멈춤
        if (wasPlaying) {
            Tone.getTransport().pause();
        }

        // 기존 예약 완전 해제 및 즉시 정지
        player.unsync();
        player.stop();

        // 1. 언제 재생을 시작할 것인가? (타임라인 상의 위치)
        const exactStartTimeSec = newStartBar * secondsPerBar.value;

        // 2. 파일의 어디서부터 재생할 것인가? (Offset)
        // ms 단위를 초(sec) 단위로 변환해서 넣어줍니다.
        const audioOffsetSec = (targetClip.audioStartMs || 0) / 1000;

        // 3. 얼마나 길게 재생할 것인가? (Duration)
        const audioDurationSec = targetClip.duration * secondsPerBar.value;

        // Tone.js에게 3가지 정보를 모두 넘겨서 예약
        // 파라미터 순서: start(time, offset, duration)
        player.sync().start(exactStartTimeSec, audioOffsetSec, audioDurationSec);

        console.log(`🎵 클립 ${clipId} 오디오 재설정 완료:
            - 타임라인 시작: ${exactStartTimeSec.toFixed(2)}초
            - 파일 재생 위치(Offset): ${audioOffsetSec.toFixed(2)}초부터
            - 재생 길이(Duration): ${audioDurationSec.toFixed(2)}초 동안`);

        // 재생 중이었다면 다시 시계 돌리기
        if (wasPlaying) {
            Tone.getTransport().start("+0.05");
        }
    }
};
    // 비동기 함수를 선언 ref 반응형
    const fetchProject = async (projectId: number) => {
        // 통신 중 인터넷이 끊기거나 에러가 나더라도 앱이 터지지 않게 안저망을 치는 구문
        try {
            // 백엔드에서 프로젝트 정보를 가져옴 await 백엔드의 db에서 가져올때까지 기다림
            // const data = await projectApi.getProjectDetail(projectId);

            // 1. 임시 가짜 데이터(타입스크립트 완벽 호환)
            const data = {
                projectId: projectId, // 파라미터로 받은 id 재사용 (에러 8, 9번 해결용)
                tempo: 120,
                rootNote: 'C',
                mode: 'MAJOR',
                timeSigNumerator: 4,
                timeSigDenominator: 4,
                totalBarCount: 100, //타임라인 길이 100마디 
                tracks: [
                    {
                        trackId: 1,
                        name: "보컬 메인",
                        volume: 0,
                        type: "AUDIO", // 트랙 타입 (예상)
                        preTrackId: null, // 이전 트랙 ID
                        postTrackId: null, // 다음 트랙 ID
                        isMuted: false,
                        isSoloed: false,
                        pan: 0,
                        clips: [
                            {
                                clipId: 1,
                                start: 1,
                                duration: 120,
                                color: "#FF3DCB",
                                audioStartMs: 0,
                                audioDurationMs: 200000,
                                audio: {
                                    audioMetadataId: 1,
                                    cdnUrl: "/test.mp3",
                                    originalName: "test.mp3",
                                    durationMs: 200000
                                }
                            }
                        ]
                    },
                    {
                        trackId: 2,
                        name: "드럼 비트",
                        volume: -5,
                        type: "AUDIO",
                        preTrackId: 1,
                        postTrackId: null,
                        isMuted: false,
                        isSoloed: false,
                        pan: 0,
                        clips: []
                    }
                ]
            };//테스트 목데이터

            if (data) {
                // 프로젝트 메타데이터 저장
                projectInfo.value = {
                    projectId: data.projectId,
                    tempo: data.tempo,
                    rootNote: data.rootNote,
                    mode: data.mode,
                    timeSigNumerator: data.timeSigNumerator,
                    timeSigDenominator: data.timeSigDenominator,
                    totalBarCount: data.totalBarCount
                };
                //실제 오디오 엔진과 동기화된 bpm 변수에도 값을 넣어줌
                bpm.value = data.tempo;

                // 백엔드가 준 순수한 트랙 배열을 .map을 사용해 하나씩 순회
                trackList.value = data.tracks.map((track): TrackUIState => ({
                    //원본 트랙을 그대로 복사한 후 화면을 그리는데 필요한 껍데기를 덧붙여 TrackUIState 타입으로 변환
                    ...track,
                    height: 100,
                    isSelected: false,
                    clips: track.clips.map((clip): ClipUIState => ({
                        ...clip,
                        isSelected: false,
                        isDragging: false
                    }))
                }));

                //데이터 세팅 이후에 오디오 로딩 및 스케줄링 시작
                setupAudioEngine(trackList.value);
            }
        } catch (error) {
            console.error("프로젝트 로딩 실패:", error);
        }
    };

    // 실제 프로젝트 상세 호출 코드
    //     const fetchProject = async (projectId: number) => {
    //   try {
    //     const data = await projectApi.getProjectDetail(projectId)

    //     projectInfo.value = {
    //       projectId: data.projectId,
    //       tempo: data.tempo,
    //       rootNote: data.rootNote,
    //       mode: data.projectMode,
    //       timeSigNumerator: data.timeSigNumerator,
    //       timeSigDenominator: data.timeSigDenominator,
    //       totalBarCount: data.totalBarCount,
    //     }

    //     trackList.value = data.tracks.map((track): TrackUIState => ({
    //       ...track,
    //       height: 100,
    //       isSelected: false,
    //       clips: track.clips.map((clip): ClipUIState => ({
    //         ...clip,
    //         isSelected: false,
    //         isDragging: false,
    //       })),
    //     }))
    //   }
    //   catch (error) {
    //     console.error('프로젝트 로딩 실패:', error)
    //   }
    // }

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
        
        // 클립보드
        clipboardClip,
        copyClip,
        cutClip,
        pasteClip,
        deleteClip,
        duplicateClip,
        splitClip,
        resizeClip,
    };
});