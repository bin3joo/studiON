package com.salmon.studion.domain.project.dto.redis;

import java.time.LocalDateTime;

public record ProjectInviteRedisValue (
        Integer projectId,
        String inviteCode,
        Integer createdBy,
        LocalDateTime expiresAt
) {
    public boolean isExpired() {
        return expiresAt.isBefore(LocalDateTime.now());
    }
}