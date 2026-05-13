package com.salmon.studion.domain.comment.service;

import com.salmon.studion.domain.auth.entity.User;
import com.salmon.studion.domain.comment.dto.redis.CommentState;
import com.salmon.studion.domain.comment.repository.CommentRedisRepository;
import com.salmon.studion.domain.track.entity.Track;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CommentService {

    private final CommentRedisRepository commentRedisRepository;

    @Transactional
    public CommentState  createComment(
            Integer projectId,
            Track track,
            User user,
            Integer parentCommentId,
            String content,
            BigDecimal location,
            List<Integer> mentionedUserIds
    ) {
        Integer commentId = commentRedisRepository.nextCommentId();
        LocalDateTime now = LocalDateTime.now();

        CommentState commentState = CommentState.create(
                commentId,
                projectId,
                track.getId(),
                user.getId(),
                parentCommentId,
                content,
                location,
                mentionedUserIds,
                now
        );

        commentRedisRepository.save(commentState);
        return commentState;
    }

    @Transactional(readOnly = true)
    public CommentState getCommentByProjectId(Integer commentId, Integer projectId) {
        CommentState commentState = commentRedisRepository.getOrLoad(projectId, commentId);

        if (Boolean.TRUE.equals(commentState.getDeleted())) {
            throw new BusinessException(ErrorCode.COMMENT_NOT_FOUND);
        }

        return commentState;
    }

    @Transactional(readOnly = true)
    public List<CommentState> getComments(
            Integer projectId,
            Integer trackId,
            Boolean isResolved,
            boolean mentionedMe,
            Integer userId
    ) {
        return commentRedisRepository.findAllOrLoadByProjectId(projectId).stream()
                .filter(commentState -> !Boolean.TRUE.equals(commentState.getDeleted()))
                .filter(commentState -> trackId == null || trackId.equals(commentState.getTrackId()))
                .filter(commentState -> isResolved == null || isResolved.equals(commentState.getIsResolved()))
                .filter(commentState -> !mentionedMe
                        || commentState.getMentionedUserIds().stream().anyMatch(id -> id.equals(userId)))
                .toList();
    }

    @Transactional
    public CommentState changeResolved(CommentState commentState) {
        CommentState updatedState = CommentState.toggleResolved(commentState, LocalDateTime.now());

        commentRedisRepository.save(updatedState);
        return updatedState;
    }

    @Transactional
    public void deleteComment(Integer projectId, Integer commentId) {
        commentRedisRepository.markDeletedCascadeByParent(projectId, commentId, LocalDateTime.now());
    }

    @Transactional(readOnly = true)
    public boolean hasActiveChildren(Integer projectId, Integer commentId) {
        return commentRedisRepository.findAllOrLoadByProjectId(projectId).stream()
                .anyMatch(commentState ->
                        commentId.equals(commentState.getParentCommentId())
                                && !Boolean.TRUE.equals(commentState.getDeleted()));
    }

}
