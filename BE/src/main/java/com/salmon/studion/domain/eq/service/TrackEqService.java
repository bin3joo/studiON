package com.salmon.studion.domain.eq.service;

import com.salmon.studion.domain.eq.dto.response.TrackEqListResponse;
import com.salmon.studion.domain.eq.entity.TrackEq;
import com.salmon.studion.domain.eq.repository.TrackEqBandRepository;
import com.salmon.studion.domain.eq.repository.TrackEqRepository;
import com.salmon.studion.domain.project.service.ProjectMemberService;
import com.salmon.studion.domain.project.service.ProjectService;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TrackEqService {

    private final TrackEqRepository trackEqRepository;
    private final TrackEqBandRepository trackEqBandRepository;
    private final ProjectService projectService;
    private final ProjectMemberService projectMemberService;

    public TrackEqListResponse getProjectTrackEqList(Integer projectId, Integer userId) {
        projectService.getProjectOrThrow(projectId);
        projectMemberService.validateProjectMember(projectId, userId);

        List<TrackEq> trackEqs = trackEqRepository.findByProjectId(projectId);

        return TrackEqListResponse.builder()
                .trackEqs(trackEqs.stream()
                        .map(trackEq -> new TrackEqListResponse.TrackEqSummary(
                                trackEq.getId(),
                                trackEq.getTrackId(),
                                trackEq.getProjectId()
                        ))
                        .toList())
                .build();
    }

    public TrackEq getTrackEqOrThrow(Integer trackEqId) {
        return trackEqRepository.findById(trackEqId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TRACK_EQ_NOT_FOUND));
    }

    @Transactional
    public void createIfAbsent(Integer trackId, Integer projectId) {
        if (trackEqRepository.existsByTrackId(trackId)) {
            return;
        }

        TrackEq trackEq = TrackEq.create(trackId, projectId);
        trackEqRepository.save(trackEq);
    }

    @Transactional
    public void deleteByTrackIdIfExists(Integer trackId) {
        trackEqRepository.findByTrackId(trackId).ifPresent(trackEq -> {
            trackEqBandRepository.deleteAllByTrackEq_Id(trackEq.getId());
            trackEqRepository.delete(trackEq);
        });
    }

    @Transactional
    public void synchronizeWithTrackIds(Integer projectId, List<Integer> activeTrackIds) {
        List<TrackEq> currentTrackEqs = trackEqRepository.findByProjectId(projectId);

        Set<Integer> activeTrackIdSet = Set.copyOf(activeTrackIds);
        Set<Integer> currentTrackIdSet = currentTrackEqs.stream()
                .map(TrackEq::getTrackId)
                .collect(Collectors.toSet());

        List<TrackEq> toCreate = activeTrackIds.stream()
                .filter(trackId -> !currentTrackIdSet.contains(trackId))
                .map(trackId -> TrackEq.create(trackId, projectId))
                .toList();

        if (!toCreate.isEmpty()) {
            trackEqRepository.saveAll(toCreate);
        }

        List<Integer> orphanTrackEqIds = currentTrackEqs.stream()
                .filter(trackEq -> !activeTrackIdSet.contains(trackEq.getTrackId()))
                .map(TrackEq::getId)
                .toList();

        if (!orphanTrackEqIds.isEmpty()) {
            trackEqBandRepository.deleteAllByTrackEq_IdIn(orphanTrackEqIds);
            trackEqRepository.deleteAllByIdInBatch(orphanTrackEqIds);
        }
    }
}
