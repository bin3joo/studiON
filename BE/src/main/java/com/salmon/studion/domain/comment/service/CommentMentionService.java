package com.salmon.studion.domain.comment.service;

import com.salmon.studion.domain.auth.entity.User;
import com.salmon.studion.domain.comment.entity.Comment;
import com.salmon.studion.domain.comment.entity.CommentMention;
import com.salmon.studion.domain.comment.repository.CommentMentionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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

    @Transactional(readOnly = true)
    public Map<Integer, List<CommentMention>> getMentionsByCommentIds(List<Integer> commentIds) {
        if (commentIds.isEmpty()) {
            return Map.of();
        }
        return commentMentionRepository.findAllByCommentIds(commentIds).stream()
                .collect(Collectors.groupingBy(cm -> cm.getComment().getId()));
   }

    @Transactional
    public void deleteAllByCommentId(Integer commentId) {
        commentMentionRepository.deleteAllByComment_Id(commentId);
    }
}
