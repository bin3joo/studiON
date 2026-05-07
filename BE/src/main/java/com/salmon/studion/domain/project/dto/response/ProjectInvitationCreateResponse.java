package com.salmon.studion.domain.project.dto.response;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ProjectInvitationCreateResponse {
    private Integer projectId;
    private String inviteCode;
    private LocalDateTime expiresAt;

    public static ProjectInvitationCreateResponse of(
            Integer projectId,
            String inviteCode,
            LocalDateTime expiresAt
    ) {
        return new ProjectInvitationCreateResponse(projectId, inviteCode, expiresAt);
    }
}
