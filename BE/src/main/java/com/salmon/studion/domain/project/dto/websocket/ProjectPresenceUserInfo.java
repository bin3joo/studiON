package com.salmon.studion.domain.project.dto.websocket;

import com.salmon.studion.domain.auth.entity.User;

import java.time.LocalDateTime;

public record ProjectPresenceUserInfo(
        Integer userId,
        String nickname,
        String profileImageUrl,
        LocalDateTime joinedAt
) {

    public static ProjectPresenceUserInfo from(User user, LocalDateTime joinedAt) {
        return new ProjectPresenceUserInfo(
                user.getId(),
                user.getNickname(),
                user.getProfileImgUrl(),
                joinedAt
        );
    }

    public ProjectOnlineUserResponse toOnlineUserResponse() {
        return new ProjectOnlineUserResponse(userId, nickname, profileImageUrl);
    }
}
