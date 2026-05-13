package com.salmon.studion.domain.comment.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salmon.studion.domain.comment.dto.redis.CommentState;
import com.salmon.studion.domain.comment.entity.Comment;
import com.salmon.studion.domain.comment.entity.CommentMention;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Repository
@RequiredArgsConstructor
public class CommentRedisRepository {

    private static final String COMMENTS_KEY = "project:%d:comments";
    private static final String DELETED_COMMENTS_KEY = "project:%d:deleted_comments";
    private static final String COMMENT_ID_SEQ_KEY = "global:comment:id_seq";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final CommentRepository commentRepository;
    private final CommentMentionRepository commentMentionRepository;

    /**
     * 다음 코멘트의 ID를 발급
     * @return
     */
    public Integer nextCommentId() {
        initializeCommentIdSequenceIfNeeded();

        Long nextId = redisTemplate.opsForValue().increment(COMMENT_ID_SEQ_KEY);
        if (nextId == null) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Next Comment Id 발급중 에러 발생");
        }

        return nextId.intValue();
    }

    /**
     * comment 1개를 Redis에 저장
     * @param commentState
     */
    public void save(CommentState commentState) {
        try {
            redisTemplate.opsForHash().put(
                    commentsKey(commentState.getProjectId()),
                    String.valueOf(commentState.getCommentId()),
                    objectMapper.writeValueAsString(commentState)
            );
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Comment를 Redis에 저장중 에러 발생");
        }
    }

    /**
     * comment 여러 개를 Redis에 저장
     * @param commentStateList
     */
    public void saveAll(List<CommentState> commentStateList) {
        commentStateList.forEach(this::save);
    }

    /**
     * comment 1개를 Redis에서 조회
     * @param projectId
     * @param commentId
     * @return
     */
    public Optional<CommentState> findByProjectIdAndCommentId(Integer projectId, Integer commentId) {
        String json = (String) redisTemplate.opsForHash().get(commentsKey(projectId), String.valueOf(commentId));

        if (json == null) {
            return Optional.empty();
        }
        return Optional.of(readCommentState(json));
    }

    /**
     * comment 1개 조회 (fallback 조회)
     * @param projectId
     * @param commentId
     * @return
     */
    public CommentState getOrLoad(Integer projectId, Integer commentId) {
        return findByProjectIdAndCommentId(projectId, commentId)
                .orElseGet(() -> loadSingleFromMysql(projectId, commentId));
    }

    /**
     * comment 여러 개를 Redis에서 조회
     * @param projectId
     * @return
     */
    public List<CommentState> findAllByProjectId(Integer projectId) {
        Map<Object, Object> entries = redisTemplate.opsForHash().entries(commentsKey(projectId));

        if (entries.isEmpty()) {
            return List.of();
        }

        return entries.values().stream()
                .map(String.class::cast)
                .map(this::readCommentState)
                .sorted(defaultOrder())
                .toList();
    }

    /**
     * comment 여러 개 조회 (fallback 조회)
     * @param projectId
     * @return
     */
    public List<CommentState> findAllOrLoadByProjectId(Integer projectId) {
        List<CommentState> cached = findAllByProjectId(projectId);
        if (!cached.isEmpty()) {
            return cached;
        }

        List<Comment> comments = commentRepository.findAllByProjectId(projectId);
        if (comments.isEmpty()) {
            return List.of();
        }

        Map<Integer, List<Integer>> mentionUserIdsByCommentId = loadMentionUserIdsByCommentIds(
                comments.stream().map(Comment::getId).toList()
        );

        List<CommentState> states = comments.stream()
                .map(comment -> CommentState.from(
                        comment,
                        projectId,
                        mentionUserIdsByCommentId.getOrDefault(comment.getId(), List.of())
                ))
                .sorted(defaultOrder())
                .toList();

        saveAll(states);
        return states;
    }

    /**
     * MySQL에서 comment를 1개 조회한 뒤 state로 변환
     * @param projectId
     * @param commentId
     * @return
     */
    private CommentState loadSingleFromMysql(Integer projectId, Integer commentId) {
        Comment comment = commentRepository.findByIdAndProjectId(commentId, projectId)
                .orElseThrow(() -> new BusinessException(ErrorCode.COMMENT_NOT_FOUND));

        Map<Integer, List<Integer>> mentionUserIdsByCommentId = loadMentionUserIdsByCommentIds(List.of(comment.getId()));

        CommentState commentState = CommentState.from(
                comment,
                projectId,
                mentionUserIdsByCommentId.getOrDefault(comment.getId(), List.of())
        );

        save(commentState);

        return commentState;
    }

    /**
     * comment Id 목록을 기준으로 멘션된 User Id Map 생성
     * @param commentIds
     * @return
     */
    private Map<Integer, List<Integer>> loadMentionUserIdsByCommentIds(List<Integer> commentIds) {
        if (commentIds.isEmpty()) {
            return Map.of();
        }

        List<CommentMention> mentions = commentMentionRepository.findAllByCommentIds(commentIds);

        return mentions.stream()
                .collect(Collectors.groupingBy(
                                mention -> mention.getComment().getId(),
                                Collectors.mapping(mention -> mention.getUser().getId(), Collectors.toList())
                        )
                );
    }



    /**
     * Redis 시퀀스가 없는 경우, MySQL max id 기준으로 초기화
     */
    private void initializeCommentIdSequenceIfNeeded() {
        Boolean exists = redisTemplate.hasKey(COMMENT_ID_SEQ_KEY);
        if (Boolean.TRUE.equals(exists)) {
            return;
        }

        Integer maxId = commentRepository.findMaxId();
        redisTemplate.opsForValue().set(COMMENT_ID_SEQ_KEY, String.valueOf(maxId == null ? 0 : maxId));
    }

    /**
     * Redis JSON 문자열을 CommentState로 역직렬화
     * @param json
     * @return
     */
    private CommentState readCommentState(String json) {
        try {
            return objectMapper.readValue(json, CommentState.class);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Redis에 저장된 코멘트를 역직렬화하던 중 에러 발생");
        }
    }

    /**
     * comment 정렬 기준 생성
     * @return
     */
    private Comparator<CommentState> defaultOrder() {
        return Comparator
                .comparing(CommentState::getTrackId, Comparator.nullsLast(Integer::compareTo))
                .thenComparing(CommentState::getLocation, Comparator.nullsLast(java.math.BigDecimal::compareTo))
                .thenComparing(CommentState::getCreatedAt, Comparator.nullsLast(LocalDateTime::compareTo))
                .thenComparing(CommentState::getCommentId, Comparator.nullsLast(Integer::compareTo));
    }

    /**
     * Redis hash Key 생성 (Project Comment Hash Key)
     * @param projectId
     * @return
     */
    private String commentsKey(Integer projectId) {
        return COMMENTS_KEY.formatted(projectId);
    }

    /**
     * Redis set Key 생성 (Project Comment Deleted Set Key)
     * @param projectId
     * @return
     */
    private String deletedCommentsKey(Integer projectId) {
        return DELETED_COMMENTS_KEY.formatted(projectId);
    }
}
