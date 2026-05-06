package com.salmon.studion.global.infrastructure.websocket.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.salmon.studion.domain.clip.dto.request.ClipCopyRequest;
import com.salmon.studion.domain.clip.dto.request.ClipCutRequest;
import com.salmon.studion.domain.clip.dto.request.ClipDeleteRequest;
import com.salmon.studion.domain.clip.dto.request.ClipPasteRequest;
import com.salmon.studion.domain.clip.dto.request.ClipDuplicateRequest;
import com.salmon.studion.domain.clip.dto.request.ClipLockRequest;
import com.salmon.studion.domain.clip.dto.request.ClipMoveRequest;
import com.salmon.studion.domain.clip.dto.request.ClipResizeRequest;
import com.salmon.studion.domain.clip.dto.request.ClipSplitRequest;
import com.salmon.studion.domain.clip.service.ClipService;
import com.salmon.studion.global.infrastructure.websocket.WebSocketMessageSender;
import com.salmon.studion.global.infrastructure.websocket.common.WsMessage;
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
        // TODO: 인증 구현 후 SecurityContext에서 userId 추출
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
                ClipSplitRequest splitRequest = objectMapper.convertValue(raw.getPayload(), ClipSplitRequest.class);
                response = clipService.splitClip(splitRequest, userId);
                break;
            case "CLIP_DUPLICATE":
                ClipDuplicateRequest duplicateRequest = objectMapper.convertValue(raw.getPayload(), ClipDuplicateRequest.class);
                response = clipService.duplicateClip(duplicateRequest, userId);
                break;
            case "CLIP_CUT":
                ClipCutRequest cutRequest = objectMapper.convertValue(raw.getPayload(), ClipCutRequest.class);
                response = clipService.cutClip(cutRequest, userId);
                break;
            case "CLIP_COPY":
                ClipCopyRequest copyRequest = objectMapper.convertValue(raw.getPayload(), ClipCopyRequest.class);
                response = clipService.copyClip(copyRequest, userId);
                webSocketMessageSender.sendToSession(session, event, response);
                return;
            case "CLIP_PASTE":
                ClipPasteRequest pasteRequest = objectMapper.convertValue(raw.getPayload(), ClipPasteRequest.class);
                response = clipService.pasteClip(pasteRequest, userId);
                break;
            case "CLIP_DELETE":
                ClipDeleteRequest deleteRequest = objectMapper.convertValue(raw.getPayload(), ClipDeleteRequest.class);
                response = clipService.deleteClip(deleteRequest, userId);
                break;
            default:
                webSocketMessageSender.sendError(session, 400, "지원하지 않는 이벤트입니다.");
                return;
        }
        webSocketMessageSender.broadcast(projectId, event, response);

    }

}
