package com.salmon.studion.domain.comment.facade;

import com.salmon.studion.domain.auth.entity.User;
import com.salmon.studion.domain.auth.service.UserService;
import com.salmon.studion.domain.comment.dto.response.CommentsGetResponse;
import com.salmon.studion.domain.comment.dto.websocket.*;
import com.salmon.studion.domain.comment.entity.Comment;
import com.salmon.studion.domain.comment.entity.CommentMention;
import com.salmon.studion.domain.comment.service.CommentMentionService;
import com.salmon.studion.domain.comment.service.CommentService;
import com.salmon.studion.domain.project.service.ProjectMemberService;
import com.salmon.studion.domain.track.entity.Track;
import com.salmon.studion.domain.track.service.TrackService;
import com.salmon.studion.global.auth.CustomOAuth2User;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Component
@RequiredArgsConstructor
public class CommentFacade {

    private final CommentService commentService;
    private final CommentMentionService commentMentionService;
    private final ProjectMemberService projectMemberService;
    private final TrackService trackService;
    private final UserService userService;

    @Transactional
    public CommentCreateResponse createComment(CommentCreateRequest request, Integer userId) {
        request.validate();
        projectMemberService.validateProjectMember(request.getProjectId(), userId);

        Track track = trackService.getTrackInProjectId(request.getProjectId(), request.getTrackId());

        validateParentComment(request.getParentCommentId(), request.getProjectId(), request.getTrackId());

        User user = userService.getUserByUserId(userId);

        List<Integer> mentionedUserIds = normalizeMentionIds(request.getMentionedUserIds());
        List<User> mentionedUsers = validateAndLoadMentionUsers(request.getProjectId(), mentionedUserIds);

        Comment comment = commentService.createComment(track, user, request.getParentCommentId(), request.getContent(), request.getLocation());

        commentMentionService.createCommentMention(comment, mentionedUsers);

        return CommentCreateResponse.of(request.getProjectId(), comment, mentionedUsers);
    }

    @Transactional(readOnly = true)
    public CommentsGetResponse getComments(Integer projectId, Boolean isResolved, Integer trackId, boolean mentionedMe, Integer userId) {
        projectMemberService.validateProjectMember(projectId, userId);

        if (trackId != null) {
            trackService.getTrackInProjectId(projectId, trackId);
        }

        List<Comment> comments = commentService.getComments(projectId, trackId, isResolved, mentionedMe, userId);

        if (comments.isEmpty()) {
            return CommentsGetResponse.from(List.of());
        }

        List<Integer> commentsIds = comments.stream().map(Comment::getId).toList();
        Map<Integer, List<CommentMention>> mentionsByCommentId = commentMentionService.getMentionsByCommentIds(commentsIds);

        return buildResponse(comments, mentionsByCommentId);

    }

    @Transactional
    public CommentDeleteResponse deleteComment(CommentDeleteRequest request, Integer userId) {
        request.validate();
        projectMemberService.validateProjectMember(request.getProjectId(), userId);

        Comment comment = commentService.getCommentByProjectId(request.getCommentId(), request.getProjectId());
        validateCommentOwner(comment, userId);

        commentService.deleteComment(comment);
        commentMentionService.deleteAllByCommentId(comment.getId());

        return CommentDeleteResponse.of(request.getProjectId(), comment);
    }

    @Transactional
    public CommentStatusChangeResponse changeStatus(CommentStatusChangeRequest request, Integer userId) {
        request.validate();
        projectMemberService.validateProjectMember(request.getProjectId(), userId);

        Comment comment = commentService.getCommentByProjectId(request.getCommentId(), request.getProjectId());

        return CommentStatusChangeResponse.of(request.getProjectId(), commentService.changeResolved(comment));
    }

    private void validateParentComment(Integer parentCommentId, Integer projectId, Integer trackId) {
        if (parentCommentId == null) {
            return;
        }

        Comment parentComment = commentService.getCommentByProjectId(parentCommentId, projectId);
        if (!parentComment.getTrack().getId().equals(trackId)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }

    private void validateCommentOwner(Comment comment, Integer userId) {
        if (!comment.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.COMMENT_ACCESS_DENIED);
        }
    }

    private List<Integer> normalizeMentionIds(List<Integer> mentionedUserIds) {
        if (mentionedUserIds == null || mentionedUserIds.isEmpty()) {
            return List.of();
        }

        Set<Integer> uniqueIds = new LinkedHashSet<>(mentionedUserIds);
        uniqueIds.remove(null);
        return uniqueIds.stream().toList();
    }

    private List<User> validateAndLoadMentionUsers(Integer projectId, List<Integer> mentionedUserIds) {
        if (mentionedUserIds.isEmpty()) {
            return List.of();
        }

        List<Integer> memberUserIds = projectMemberService.getProjectMemberUserIds(projectId, mentionedUserIds);
        if (memberUserIds.size() != mentionedUserIds.size()) {
            throw new BusinessException(ErrorCode.COMMENT_ACCESS_DENIED, "프로젝트 멤버만 멘션할 수 있습니다.");
        }

        List<User> users = userService.getUsersByIds(mentionedUserIds);
        if (users.size() != mentionedUserIds.size()) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }

        return users;
    }

    private CommentsGetResponse buildResponse(List<Comment> comments, Map<Integer, List<CommentMention>> mentionsByCommentId) {
        Map<Integer, List<CommentsGetResponse.CommentDto>> repliesByParentId = new HashMap<>();
        for (Comment c : comments) {
            if (c.getParentCommentId() != null) {
                repliesByParentId
                        .computeIfAbsent(c.getParentCommentId(), k -> new ArrayList<>())
                        .add(toDto(c, mentionsByCommentId, List.of()));
            }
        }

        List<CommentsGetResponse.CommentDto> rootComments = comments.stream()
                .filter(c -> c.getParentCommentId() == null)
                .map(c -> toDto(c, mentionsByCommentId, repliesByParentId.getOrDefault(c.getId(), List.of())))
                .toList();

        return CommentsGetResponse.from(rootComments);
    }

    private CommentsGetResponse.CommentDto toDto(
            Comment comment,
            Map<Integer, List<CommentMention>> mentionsByCommentId,
            List<CommentsGetResponse.CommentDto> replies
    ) {
        List<CommentsGetResponse.UserSummary> mentionedUsers = mentionsByCommentId.getOrDefault(comment.getId(), List.of()).stream()
                .map(CommentsGetResponse.UserSummary::from)
                .toList();
        return CommentsGetResponse.CommentDto.of(comment, mentionedUsers, replies);
    }

}
