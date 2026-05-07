package com.salmon.studion.domain.comment.dto.websocket;

import com.salmon.studion.domain.comment.entity.Comment;

public record CommentDeleteResponse (
        Integer projectId,
        Integer trackId,
        Integer commentId,
        Integer parentCommentId
) {
    public static CommentDeleteResponse of(Integer projectId, Comment comment) {
        return new CommentDeleteResponse(
                projectId,
                comment.getTrack().getId(),
                comment.getId(),
                comment.getParentCommentId()
        );
    }
}
