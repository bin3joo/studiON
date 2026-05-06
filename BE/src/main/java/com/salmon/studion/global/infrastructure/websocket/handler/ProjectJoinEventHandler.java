package com.salmon.studion.global.infrastructure.websocket.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.salmon.studion.domain.auth.entity.User;
import com.salmon.studion.domain.auth.service.UserService;
import com.salmon.studion.domain.project.dto.websocket.ProjectJoinRequest;
import com.salmon.studion.domain.project.dto.websocket.ProjectOnlineUsersResponse;
import com.salmon.studion.domain.project.dto.websocket.ProjectPresenceRegistration;
import com.salmon.studion.domain.project.dto.websocket.ProjectUserJoinedResponse;
import com.salmon.studion.domain.project.service.ProjectMemberService;
import com.salmon.studion.domain.project.service.ProjectPresenceService;
import com.salmon.studion.global.common.enums.ProjectWebSocketEventType;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import com.salmon.studion.global.infrastructure.websocket.ProjectWebSocketBroadcaster;
import com.salmon.studion.global.infrastructure.websocket.WebSocketMessageSender;
import com.salmon.studion.global.infrastructure.websocket.common.WsMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class ProjectJoinEventHandler {

    private final ObjectMapper objectMapper;
    private final UserService userService;
    private final ProjectMemberService projectMemberService;
    private final ProjectPresenceService projectPresenceService;
    private final ProjectWebSocketBroadcaster projectWebSocketBroadcaster;
    private final WebSocketMessageSender webSocketMessageSender;

    public void handleProjectEvent(
            WebSocketSession session,
            Integer projectId,
            Integer userId,
            ProjectWebSocketEventType eventType,
            WsMessage<Map> raw
    ) throws IOException {
        if (eventType != ProjectWebSocketEventType.PROJECT_JOIN) {
            webSocketMessageSender.sendError(session, 400, "지원하지 않는 프로젝트 이벤트입니다.");
            return;
        }

        ProjectJoinRequest request = raw.getPayload() == null
                ? new ProjectJoinRequest(null)
                : objectMapper.convertValue(raw.getPayload(), ProjectJoinRequest.class);

        if (request.projectId() != null && !projectId.equals(request.projectId())) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST, "프로젝트 입장 요청 정보가 올바르지 않습니다.");
        }

        projectMemberService.validateProjectMember(projectId, userId);

        User user = userService.getUserByUserId(userId);
        ProjectPresenceRegistration registration = projectPresenceService.registerProjectUser(projectId, user);

        webSocketMessageSender.sendToSession(
                session,
                ProjectWebSocketEventType.PROJECT_ONLINE_USERS.name(),
                new ProjectOnlineUsersResponse(
                        projectId,
                        projectPresenceService.getOnlineUsers(projectId)
                )
        );

        if (registration.newlyJoined()) {
            projectWebSocketBroadcaster.broadcastToProjectExceptSession(
                    projectId,
                    session.getId(),
                    ProjectWebSocketEventType.USER_JOINED_PROJECT,
                    new ProjectUserJoinedResponse(
                            projectId,
                            registration.user().toOnlineUserResponse()
                    )
            );
        }
    }
}
