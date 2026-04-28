package com.salmon.studion.domain.project.facade;

import com.salmon.studion.domain.auth.entity.User;
import com.salmon.studion.domain.project.dto.request.ProjectCreateRequest;
import com.salmon.studion.domain.project.dto.response.ProjectCreateResponse;
import com.salmon.studion.domain.project.entity.Project;
import com.salmon.studion.domain.project.service.MasterTrackService;
import com.salmon.studion.domain.project.service.ProjectMemberService;
import com.salmon.studion.domain.project.service.ProjectService;
import com.salmon.studion.domain.track.entity.MasterTrack;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
public class ProjectFacade {

    private final ProjectService projectService;
    private final ProjectMemberService projectMemberService;
    private final MasterTrackService masterTrackService;
    // TODO: UserService 구현되면 주석 해제하기
//    private final UserService userService;

    @Transactional
    public ProjectCreateResponse createProject(ProjectCreateRequest projectCreateRequest, Integer userId) {
        Project project = projectService.createProject(projectCreateRequest);
        MasterTrack masterTrack = masterTrackService.createMasterTrack(project);

        //TODO: User 구현되면 교체하기
        User user = null;
        //User user = userService.getUserByUserId(userId);

        projectMemberService.createProjectMember(project, user);

        return ProjectCreateResponse.builder()
                .project(new ProjectCreateResponse.ProjectInfo(
                        project.getId(),
                        project.getName(),
                        project.getRootNote(),
                        project.getMode(),
                        project.getTempo(),
                        project.getTimeSigNumerator(),
                        project.getTimeSigDenominator(),
                        project.getTotalBarCount(),
                        project.getTotalPlayTimeMs()
                ))
                .masterTrack(new ProjectCreateResponse.MasterTrackInfo(
                        masterTrack.getId(),
                        masterTrack.getIsSoloed(),
                        masterTrack.getIsMuted(),
                        masterTrack.getVolume(),
                        masterTrack.getPan()
                ))
                .build();
    }

}
