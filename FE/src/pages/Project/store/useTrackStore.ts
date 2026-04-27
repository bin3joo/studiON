//API로 받아온 데이터를 가공해서 보관하는 창고
//데이터 창고 피니아
import { defineStore } from 'pinia';
//화면이 바뀌아도 자동으로 다시그리게 함 반응형
import { ref } from 'vue';
//백엔드 통신 담당
import { projectApi } from '../api/project.api';
//트랙과 클립의 타입
import type { TrackUIState, ClipUIState } from '../types';
//페이지 어디든 사용가능하도록 useTrackStore로 export 고유 ID는 track
export const useTrackStore = defineStore('track', () => {
    // ==========================================
    // 1. 상태(State) 선언
    // ==========================================
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

    // ==========================================
    // 2. 액션(Action) 선언(데이터 패칭 및 가공)
    // ==========================================
    // 비동기 함수를 선언 ref 반응형
    const fetchProject = async (projectId: number) => {
        // 통신 중 인터넷이 끊기거나 에러가 나더라도 앱이 터지지 않게 안저망을 치는 구문
        try {
            // 백엔드에서 프로젝트 정보를 가져옴 await 백엔드의 db에서 가져올때까지 기다림
            const data = await projectApi.getProjectDetail(projectId);

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

    // ==========================================
    // 3. 내보내기 (Return)
    // ==========================================
    return { trackList, projectInfo, fetchProject };
});