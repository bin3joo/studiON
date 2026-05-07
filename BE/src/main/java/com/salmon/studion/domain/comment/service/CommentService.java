package com.salmon.studion.domain.comment.service;

import com.salmon.studion.domain.auth.entity.User;
import com.salmon.studion.domain.comment.entity.Comment;
import com.salmon.studion.domain.comment.repository.CommentRepository;
import com.salmon.studion.domain.track.entity.Track;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Service
@RequiredArgsConstructor
public class CommentService {

    private final CommentRepository commentRepository;

    @Transactional
    public Comment createComment(Track track, User user, Integer parentCommentId, String content, BigDecimal location) {
        Comment comment = Comment.create(track, user, parentCommentId, content, location);
        return commentRepository.save(comment);
    }

    @Transactional
    public Comment getCommentByProjectId(Integer commentId, Integer projectId) {
        return commentRepository.findByIdAndProjectId(commentId, projectId)
                .orElseThrow(() -> new BusinessException(ErrorCode.COMMENT_NOT_FOUND));
    }

    @Transactional
    public Comment changeResolved(Comment comment) {
        comment.updateIsResolved();
        return commentRepository.save(comment);
    }

    @Transactional
    public void deleteComment(Comment comment) {
        commentRepository.delete(comment);
    }

    @Transactional(readOnly = true)
    public boolean hasActiveChildren(Integer commentId) {
        return commentRepository.existsByParentCommentIdAndDeletedAtIsNull(commentId);
    }

}
