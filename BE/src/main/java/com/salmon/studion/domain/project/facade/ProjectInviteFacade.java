package com.salmon.studion.domain.project.facade;

import com.salmon.studion.domain.project.dto.response.ProjectInvitationAcceptResponse;
import com.salmon.studion.domain.project.dto.response.ProjectInvitationCreateResponse;
import com.salmon.studion.domain.project.service.ProjectInviteService;
import com.salmon.studion.domain.project.service.ProjectMemberService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ProjectInviteFacade {

    private final ProjectMemberService projectMemberService;
    private final ProjectInviteService projectInviteService;

    public ProjectInvitationCreateResponse createOrRefreshInvitation(Integer projectId, Integer userId) {
        projectMemberService.validateProjectMember(projectId, userId);

        return projectInviteService.createOrRefreshInvitation(projectId, userId);
    }

    public ProjectInvitationAcceptResponse acceptInvitation(String inviteCode, Integer userId) {
        return projectInviteService.acceptInvitation(inviteCode, userId);
    }
}
