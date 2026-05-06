package com.salmon.studion.domain.comment.dto.websocket;

import com.salmon.studion.domain.comment.entity.Comment;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record CommentCreateResponse(
        Integer commentId,
        Integer trackId,
        Integer userId,
        String nickname,
        String profileImgUrl,
        Integer parentCommentId,
        String content,
        BigDecimal location,    // 댓글이 달린 마디 위치
        Boolean isResolved,
        List<Integer> mentionedUserIds,
        LocalDateTime createdAt
) {
    public static CommentCreateResponse of(Comment comment, List<Integer> mentionedUserIds) {
        return new CommentCreateResponse(
                comment.getId(),
                comment.getTrack().getId(),
                comment.getUser().getId(),
                comment.getUser().getNickname(),
                comment.getUser().getProfileImgUrl(),
                comment.getParentCommentId(),
                comment.getContent(),
                comment.getLocation(),
                comment.getIsResolved(),
                mentionedUserIds,
                comment.getCreatedAt()
        );
    }
}