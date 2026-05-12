package com.salmon.studion.domain.project.service;

import com.salmon.studion.domain.clip.service.ClipService;
import com.salmon.studion.domain.eq.service.TrackEqService;
import com.salmon.studion.domain.project.dto.response.ProjectSnapshotSaveResponse;
import com.salmon.studion.domain.track.entity.Track;
import com.salmon.studion.domain.track.service.TrackService;
import com.salmon.studion.global.common.enums.ProjectSaveTrigger;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectSnapshotService {

    private final ProjectService projectService;
    private final TrackService trackService;
    private final ClipService clipService;
    private final TrackEqService trackEqService;
    private final ProjectStatisticsService projectStatisticsService;

    /*
        DB 작업만 수행
        1. track upsert - 신규/수정 track을 반영
        2. clip delete - 삭제된 clip을 제거 (Redis 키는 유지)
        3. clip upsert - 신규/수정 clip을 반영
        4. track delete - 삭제된 track을 제거 (Redis 키는 유지)
        5. eq 동기화 - 활성 track 기준으로 track_eq를 MySQL과 맞춤
        6. 통계 갱신 - 프로젝트 통계값 재계산 및 lastUpdateAt 갱신
     */
    @Transactional
    public ProjectSnapshotSaveResponse save(Integer projectId, ProjectSaveTrigger trigger) {
        projectService.getProjectOrThrow(projectId);

        log.info("[프로젝트 스냅샷 생성 시작] - projectId={} trigger={}", projectId, trigger);

        trackService.upsertTracksFromRedis(projectId);
        clipService.deleteRemovedClipsFromMysql(projectId);
        clipService.upsertClipsFromRedis(projectId);
        trackService.deleteRemovedTracksFromMysql(projectId);

        List<Track> persistedTracks = trackService.getTracksByProjectId(projectId);
        List<Integer> trackIds = persistedTracks.stream().map(Track::getId).toList();

        trackEqService.synchronizeWithTrackIds(projectId, trackIds);
        projectStatisticsService.refresh(projectId);

        log.info("[프로젝트 스냅샷 생성 완료] - projectId={} trigger={}", projectId, trigger);

        return ProjectSnapshotSaveResponse.of(projectId, trigger);
    }
}
