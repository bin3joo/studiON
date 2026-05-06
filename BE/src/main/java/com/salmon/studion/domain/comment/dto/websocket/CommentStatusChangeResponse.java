package com.salmon.studion.domain.comment.dto.websocket;

public record CommentStatusChangeResponse(
        Integer commentId,
        Boolean isResolved
) {
}
