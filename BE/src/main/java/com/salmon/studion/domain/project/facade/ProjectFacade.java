package com.salmon.studion.domain.project.facade;

import com.salmon.studion.domain.auth.entity.User;
import com.salmon.studion.domain.project.dto.request.ProjectCreateRequest;
import com.salmon.studion.domain.project.dto.response.ProjectCreateResponse;
import com.salmon.studion.domain.project.dto.response.ProjectListResponse;
import com.salmon.studion.domain.project.entity.Project;
import com.salmon.studion.domain.project.entity.ProjectMember;
import com.salmon.studion.domain.project.service.MasterTrackService;
import com.salmon.studion.domain.project.service.ProjectMemberService;
import com.salmon.studion.domain.project.service.ProjectService;
import com.salmon.studion.domain.track.entity.MasterTrack;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class ProjectFacade {

    private final ProjectService projectService;
    private final ProjectMemberService projectMemberService;
    private final MasterTrackService masterTrackService;
    // TODO: UserService 구현되면 주석 해제하기
//    private final UserService userService;

    public ProjectListResponse getProjectList(Integer userId) {
        /*
            1. userId로 내가 참여한 projectId 목록 조회
            2. projectId 목록으로 프로젝트 정보 한 번에 조회
            3. projectId 목록으로 각 프로젝트의 멤버 + 유저 프로필 한 번에 조회
            4. projectId 기준으로 묶어서 Response 생성
         */
        List<Integer> projectIds = projectMemberService.getProjectIdsByUserId(userId);
        List<Project> projects = projectService.getProjectsByIds(projectIds);
        List<ProjectMember> members = projectMemberService.getMembersWithUserByProjectIds(projectIds);

        // projectId 기준으로 userId 묶기
        Map<Integer, List<ProjectMember>> membersByProjectId = members.stream()
                .collect(Collectors.groupingBy(pm -> pm.getProject().getId()));

        // 프로젝트 목록을 dto로 변환
        List<ProjectListResponse.ProjectSummary> projectSummaries = projects.stream()
                .map(project -> {
                    List<ProjectListResponse.MemberSummary> memberSummaries =
                            membersByProjectId.getOrDefault(project.getId(), List.of())
                                    .stream()
                                    .map(pm -> new ProjectListResponse.MemberSummary(
                                            pm.getUser().getId(),
                                            pm.getUser().getProfileImgUrl()
                                    ))
                                    .toList();

                    return new ProjectListResponse.ProjectSummary(
                            project.getId(),
                            project.getName(),
                            project.getTotalBarCount(),
                            project.getTotalPlayTimeMs(),
                            project.getTotalAudioSizeByte(),
                            project.getLastUpdateAt(),
                            memberSummaries
                    );
                })
                .toList();

        return new ProjectListResponse(projectSummaries);
    }

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
