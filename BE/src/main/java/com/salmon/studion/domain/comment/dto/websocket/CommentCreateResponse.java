package com.salmon.studion.domain.comment.dto.websocket;

import com.salmon.studion.domain.auth.entity.User;
import com.salmon.studion.domain.comment.entity.Comment;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record CommentCreateResponse(
        Integer projectId,
        Integer trackId,
        Integer commentId,
        Integer parentCommentId,
        String content,
        BigDecimal location,    // 댓글이 달린 마디 위치
        Boolean isResolved,

        UserSummary author,
        List<UserSummary> mentionedUsers,
        LocalDateTime createdAt
) {
    public record UserSummary(
            Integer userId,
            String nickname,
            String profileImgUrl
    ) {
        public static UserSummary from(User user) {
            return new UserSummary(
                    user.getId(),
                    user.getNickname(),
                    user.getProfileImgUrl());
        }
    }

    public static CommentCreateResponse of(Integer projectId, Comment comment, List<User> mentionedUsers) {
        return new CommentCreateResponse(
                projectId,
                comment.getTrack().getId(),
                comment.getId(),
                comment.getParentCommentId(),
                comment.getContent(),
                comment.getLocation(),
                comment.getIsResolved(),
                UserSummary.from(comment.getUser()),
                mentionedUsers.stream()
                        .map(UserSummary::from)
                        .toList(),
                comment.getCreatedAt()
        );
    }
}