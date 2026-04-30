//API로 받아온 데이터를 가공해서 보관하는 창고
//데이터 창고 피니아
import { defineStore } from 'pinia';
//화면이 바뀌아도 자동으로 다시그리게 함 반응형
import { ref, computed, watch } from 'vue';
//백엔드 통신 담당
// import { projectApi } from '../api/project.api';
//트랙과 클립의 타입
import type { TrackUIState, ClipUIState } from '../types';
//페이지 어디든 사용가능하도록 useTrackStore로 export 고유 ID는 track
export const useTrackStore = defineStore('track', () => {
    // ==========================================
    // 1. 상태(State) 선언
    // ==========================================

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
    const playheadPosition = ref(0); //현재 재생 위치(마디 단위)
    const zoomlevel = ref(1) //가로 확대/축소 배율 (기본 1배)

    // ==========================================
    //  재생 애니메이션 엔진 (RequestAnimationFrame)
    // ==========================================
    //리퀘스트에니메이션 프레임 아이디
    let rafId: number | null = null;
    let lastTimestamp = 0;

    const animate = (timestamp: number) => {
        if (!isPlaying.value) return;

        //1. 프레임 간 시간 간격 계산(초단위)
        if (!lastTimestamp) lastTimestamp = timestamp;
        const dt = (timestamp - lastTimestamp) / 1000; //초 단위로 변환
        lastTimestamp = timestamp;

        //2. 초당 흐르는 마디 계산
        //(BPM / 60초) / 1마디 당 박자수
        const beatsPerSecond = projectInfo.value.tempo / 60;
        const barsPerSecond = beatsPerSecond / projectInfo.value.timeSigNumerator;

        //3. 현재 위치 업데이트
        const nextPosition = playheadPosition.value + (barsPerSecond * dt);

        //4. 프로젝트 끝에 도달하면 정지
        if (nextPosition >= projectInfo.value.totalBarCount) {
            isPlaying.value = false;
            playheadPosition.value = projectInfo.value.totalBarCount; //마지막에 딱 맞춘다.
            return;
        }
        //5. 위치 업데이트
        playheadPosition.value = nextPosition;
        //6. 화면에 그리기 요청
        rafId = requestAnimationFrame(animate);
    }

    //isPlaying 상태를 감시하여 애니메이션의 시작과 정지를 제어
    watch(isPlaying, (playing) => {
        if (playing) {
            // 재생 시작: 타이밍 초기화 후 루프 시작
            lastTimestamp = 0;
            rafId = requestAnimationFrame(animate);
        } else {
            // 재생 정지: 루프 종료 (rafId가 있으면 캔슬)
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        }
    })

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
    const togglePlay = () => {
        isPlaying.value = !isPlaying.value;
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
                                start: 10,
                                duration: 30,
                                color: "#FF3DCB",
                                audioStartMs: 0,
                                audioDurationMs: 15000,
                                audio: {
                                    audioMetadataId: 1,
                                    cdnUrl: "https://example.com/dummy.wav",
                                    originalName: "vocal_take1.wav",
                                    durationMs: 15000
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
    };
});