package com.salmon.studion.domain.eq.service;

import com.salmon.studion.domain.eq.dto.response.TrackEqListResponse;
import com.salmon.studion.domain.eq.entity.TrackEq;
import com.salmon.studion.domain.eq.repository.TrackEqRepository;
import com.salmon.studion.domain.project.service.ProjectMemberService;
import com.salmon.studion.domain.project.service.ProjectService;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class TrackEqService {

    private final TrackEqRepository trackEqRepository;
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

    public void createIfAbsent(Integer trackId, Integer projectId) {
        if (trackEqRepository.existsByTrackId(trackId)) {
            return;
        }

        TrackEq trackEq = TrackEq.create(trackId, projectId);
        trackEqRepository.save(trackEq);
    }
}
