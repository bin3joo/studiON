package com.salmon.studion.domain.project.service;

import com.salmon.studion.domain.project.dto.response.ProjectInvitationAcceptResponse;
import com.salmon.studion.domain.project.dto.response.ProjectInvitationCreateResponse;
import com.salmon.studion.domain.project.repository.ProjectInviteRedisRepository;
import com.salmon.studion.domain.project.support.ProjectInviteCodeGenerator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ProjectInviteService {

    private final ProjectInviteRedisRepository projectInviteRedisRepository;
    private final ProjectInviteCodeGenerator projectInviteCodeGenerator;
//    private final ProjectInviteRateLimiter projectInviteRateLimiter;
//    private final ProjectInviteLockManager projectInviteLockManager;

    public ProjectInvitationCreateResponse createOrRefreshInvitation(Integer projectId, Integer userId) {
        return null;
    }


    public ProjectInvitationAcceptResponse acceptInvitation(String inviteCode, Integer userId) {
        return null;
    }
}
