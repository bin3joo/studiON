package com.salmon.studion.domain.project.dto.response;

import java.time.LocalDateTime;

public class ProjectInvitationCreateResponse {
    private Integer projectId;
    private String inviteCode;
    private LocalDateTime expiresAt;
}
