package com.salmon.studion.global.infrastructure.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.salmon.studion.domain.track.dto.request.TrackAddRequest;
import com.salmon.studion.domain.track.dto.request.TrackRemoveRequest;
import com.salmon.studion.domain.track.dto.request.TrackRenameRequest;
import com.salmon.studion.domain.track.dto.request.TrackReorderRequest;
import com.salmon.studion.domain.track.dto.request.TrackSoloRequest;
import com.salmon.studion.domain.track.service.TrackService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class TrackEventHandler {

    private final WebSocketMessageSender webSocketMessageSender;
    private final ObjectMapper objectMapper;
    private final TrackService trackService;

    public void handleTrackEvent(WebSocketSession session, Integer projectId, String event, WsMessage<Map> raw) throws IOException {
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
            case "TRACK_RENAME":
                TrackRenameRequest renameRequest = objectMapper.convertValue(raw.getPayload(), TrackRenameRequest.class);
                response = trackService.renameTrack(renameRequest, userId);
                break;
            case "TRACK_SOLO_CHANGE":
                TrackSoloRequest soloRequest = objectMapper.convertValue(raw.getPayload(), TrackSoloRequest.class);
                response = trackService.soloTrack(soloRequest);
                break;
            default:
                webSocketMessageSender.sendError(session, 400, "지원하지 않는 이벤트입니다.");
                return;
        }
        webSocketMessageSender.broadcast(projectId, event, response);
    }

}
