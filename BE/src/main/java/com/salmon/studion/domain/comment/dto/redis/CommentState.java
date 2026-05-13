package com.salmon.studion.domain.comment.dto.redis;

import com.salmon.studion.global.common.enums.CommentDeleteReason;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Getter
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
}
