package com.salmon.studion.global.infrastructure.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.salmon.studion.domain.clip.dto.request.ClipLockRequest;
import com.salmon.studion.domain.clip.dto.request.ClipMoveRequest;
import com.salmon.studion.domain.clip.dto.request.ClipResizeRequest;
import com.salmon.studion.domain.clip.service.ClipService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class ClipEventHandler {
    private final WebSocketMessageSender webSocketMessageSender;
    private final ObjectMapper objectMapper;
    private final ClipService clipService;

    public void handleClipEvent(WebSocketSession session, Integer projectId, String event, WsMessage<Map> raw) throws IOException {
        Integer userId = 0;

        Object response = null;
        switch (event){
            case "CLIP_LOCK":
                ClipLockRequest lockRequest = objectMapper.convertValue(raw.getPayload(), ClipLockRequest.class);
                response = clipService.lockClip(lockRequest, userId);
                break;
            case "CLIP_MOVE":
                ClipMoveRequest moveRequest = objectMapper.convertValue(raw.getPayload(), ClipMoveRequest.class);
                response = clipService.moveClip(moveRequest, userId);
                break;
            case "CLIP_RESIZE":
                ClipResizeRequest resizeRequest = objectMapper.convertValue(raw.getPayload(), ClipResizeRequest.class);
                response = clipService.resizeClip(resizeRequest, userId);
                break;
            case "CLIP_SPLIT":
                break;
            case "CLIP_DUPLICATE":
                break;
            case "CLIP_PASTE":
                break;
            case "CLIP_DELETE":
                break;
            default:
                webSocketMessageSender.sendError(session, 400, "지원하지 않는 이벤트입니다.");
                return;
        }
        webSocketMessageSender.broadcast(projectId, event, response);

    }

}
