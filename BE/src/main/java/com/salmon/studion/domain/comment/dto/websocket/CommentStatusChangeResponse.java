package com.salmon.studion.domain.comment.dto.websocket;

import com.salmon.studion.domain.comment.entity.Comment;

import java.time.LocalDateTime;

public record CommentStatusChangeResponse(
        Integer projectId,
        Integer trackId,
        Integer commentId,
        Integer parentCommentId,
        Boolean isResolved,
        LocalDateTime updatedAt
) {
    public static CommentStatusChangeResponse of(Integer projectId, Comment comment) {
        return new CommentStatusChangeResponse(
                projectId,
                comment.getTrack().getId(),
                comment.getId(),
                comment.getParentCommentId(),
                comment.getIsResolved(),
                comment.getUpdatedAt()
        );
    }
}
