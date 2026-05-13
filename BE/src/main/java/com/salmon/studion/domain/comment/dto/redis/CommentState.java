package com.salmon.studion.domain.comment.dto.redis;

import com.salmon.studion.domain.comment.entity.Comment;
import com.salmon.studion.global.common.enums.CommentDeleteReason;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Getter
@AllArgsConstructor
@NoArgsConstructor
public class CommentState {
    private Integer commentId;
    private Integer projectId;
    private Integer trackId;
    private Integer userId;
    private Integer parentCommentId;
    private String content;
    private BigDecimal location;
    private Boolean isResolved;
    private List<Integer> mentionedUserIds;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Boolean deleted;
    private LocalDateTime deletedAt;
    private CommentDeleteReason deleteReason;

    public static CommentState markDeleted(
            CommentState commentState,
            CommentDeleteReason deleteReason,
            LocalDateTime deletedAt
    ) {
        return new CommentState(
                commentState.getCommentId(),
                commentState.getProjectId(),
                commentState.getTrackId(),
                commentState.getUserId(),
                commentState.getParentCommentId(),
                commentState.getContent(),
                commentState.getLocation(),
                commentState.getIsResolved(),
                commentState.getMentionedUserIds(),
                commentState.getCreatedAt(),
                commentState.getUpdatedAt(),
                true,
                deletedAt,
                deleteReason
        );
    }

    public static CommentState from(
            Comment comment,
            Integer projectId,
            List<Integer> mentionedUserIds
    ) {
        return new CommentState(
                comment.getId(),
                projectId,
                comment.getTrack().getId(),
                comment.getUser().getId(),
                comment.getParentCommentId(),
                comment.getContent(),
                comment.getLocation(),
                comment.getIsResolved(),
                mentionedUserIds,
                comment.getCreatedAt(),
                comment.getUpdatedAt(),
                false,
                comment.getDeletedAt(),
                null
        );
    }
}
