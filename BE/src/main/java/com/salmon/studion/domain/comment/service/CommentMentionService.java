package com.salmon.studion.domain.comment.service;

import com.salmon.studion.domain.auth.entity.User;
import com.salmon.studion.domain.comment.entity.Comment;
import com.salmon.studion.domain.comment.entity.CommentMention;
import com.salmon.studion.domain.comment.repository.CommentMentionRepository;
import com.salmon.studion.domain.comment.repository.CommentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CommentMentionService {

    private final CommentMentionRepository commentMentionRepository;

    @Transactional
    public void createCommentMention(Comment comment, List<User> mentionUsers) {
        if (mentionUsers == null || mentionUsers.isEmpty()) {
            return;
        }

        List<CommentMention> mentions = mentionUsers.stream()
                .map(user -> CommentMention.create(comment, user))
                .toList();

        commentMentionRepository.saveAll(mentions);
    }

    @Transactional(readOnly = true)
    public List<CommentMention> getCommentMentions(Integer commentId) {
        return commentMentionRepository.findAllByCommentId(commentId);
    }

    @Transactional
    public void deleteAllByCommentId(Integer commentId) {
        commentMentionRepository.deleteAllByComment_Id(commentId);
    }
}
