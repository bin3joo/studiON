package com.salmon.studion.global.infrastructure.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.salmon.studion.domain.track.dto.request.TrackAddRequest;
import com.salmon.studion.domain.track.dto.request.TrackRemoveRequest;
import com.salmon.studion.domain.track.dto.request.TrackReorderRequest;
import com.salmon.studion.domain.track.service.TrackService;
import com.salmon.studion.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class ProjectWebSocketHandler extends TextWebSocketHandler {

    private final ProjectSessionManager sessionManager;
    private final ObjectMapper objectMapper;
    private final TrackService trackService;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        Integer projectId = extractProjectId(session);
        sessionManager.register(projectId, session);
        log.info("[WS 연결 성공]: session_id={}, project_id={}", session.getId(), projectId);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        try {
            handleTrackEvent(session, message.getPayload());
        } catch (BusinessException e) {
            sendError(session, e.getErrorCode().getStatus().value(), e.getMessage());
        } catch (Exception e) {
            sendError(session, 500, "서버 오류가 발생했습니다.");
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Integer projectId = extractProjectId(session);
        sessionManager.remove(projectId, session);
        log.info("[WS 연결 종료]: session_id={}, project_id={}", session.getId(), projectId);
    }

    private void handleTrackEvent(WebSocketSession session, String payload) throws IOException{
        WsMessage<Map> raw = objectMapper.readValue(payload, objectMapper.getTypeFactory()
                .constructParametricType(WsMessage.class, Map.class));
        String event = raw.getEvent();

        // TODO: 인증 구현 후 SecurityContext에서 userId 추출
        Integer userId = 0;

        Object response = null;
        switch (event){
            case "TRACK_ADD":
                TrackAddRequest addRequest = objectMapper.convertValue(raw.getPayload(), TrackAddRequest.class);
                response = trackService.addTrack(addRequest, userId);
                break;
            case "TRACK_DELETE":
                TrackRemoveRequest removeRequest = objectMapper.convertValue(raw.getPayload(), TrackRemoveRequest.class);
                response = trackService.removeTrack(removeRequest, userId);
                break;
            case "TRACK_REORDER":
                TrackReorderRequest reorderRequest = objectMapper.convertValue(raw.getPayload(), TrackReorderRequest.class);
                response = trackService.reorderTrack(reorderRequest, userId);
                break;
            default:
                sendError(session, 400, "지원하지 않는 이벤트입니다.");
        }
        broadcast(extractProjectId(session), event, response);
    }

    private void broadcast(Integer projectId, String event, Object payload) throws IOException {
        String message = objectMapper.writeValueAsString(Map.of("event", event, "payload", payload));
        for (WebSocketSession s : sessionManager.getSessions(projectId)) {
            if (s.isOpen()) {
                s.sendMessage(new TextMessage(message));
            }
        }
    }

    private void sendError(WebSocketSession session, int code, String message) throws IOException {
        String payload = objectMapper.writeValueAsString(
                Map.of("event", "ERROR", "payload", new WsErrorResponse(code, message))
        );
        if (session.isOpen()) {
            session.sendMessage(new TextMessage(payload));
        }
    }

    private Integer extractProjectId(WebSocketSession session) {
        String path = session.getUri().getPath();
        return Integer.parseInt(path.split("/")[3]);
    }
}
