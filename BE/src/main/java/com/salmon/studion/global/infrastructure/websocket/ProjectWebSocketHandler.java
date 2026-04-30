package com.salmon.studion.global.infrastructure.websocket;

import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;

@Slf4j
@Component
@RequiredArgsConstructor
public class ProjectWebSocketHandler extends TextWebSocketHandler {

    private final ProjectSessionManager sessionManager;
    private final TrackEventHandler trackEventHandler;
    private final WebSocketMessageSender webSocketMessageSender;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        Integer projectId = extractProjectId(session);
        sessionManager.register(projectId, session);
        log.info("[WS 연결 성공]: session_id={}, project_id={}", session.getId(), projectId);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        try {
            Integer projectId = extractProjectId(session);
            trackEventHandler.handleTrackEvent(session, message.getPayload(), projectId);
        } catch (BusinessException e) {
            webSocketMessageSender.sendError(session, e.getErrorCode().getStatus().value(), e.getMessage());
        } catch (Exception e) {
            log.error("[WS 처리 오류]", e);
            webSocketMessageSender.sendError(session, 500, "서버 오류가 발생했습니다.");
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Integer projectId = extractProjectId(session);
        sessionManager.remove(projectId, session);
        log.info("[WS 연결 종료]: session_id={}, project_id={}", session.getId(), projectId);
    }

    private Integer extractProjectId(WebSocketSession session) {
        String path = session.getUri().getPath();
        return Integer.parseInt(path.split("/")[3]);
    }
}
