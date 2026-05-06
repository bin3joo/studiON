package com.salmon.studion.domain.comment.dto.websocket;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public abstract class CommentRequest {
    private Integer projectId;

    public abstract void validate();
}
