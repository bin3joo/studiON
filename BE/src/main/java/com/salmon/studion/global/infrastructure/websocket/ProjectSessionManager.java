package com.salmon.studion.global.infrastructure.websocket;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;

@Component
public class ProjectSessionManager {

    private final Map<Integer, Set<WebSocketSession>> projectSessions = new ConcurrentHashMap<>();

    public void register(Integer projectId, WebSocketSession session) {
        projectSessions.computeIfAbsent(projectId, k -> ConcurrentHashMap.newKeySet()).add(session);
    }

    public void remove(Integer projectId, WebSocketSession session) {
        Set<WebSocketSession> sessions = projectSessions.get(projectId);
        if (sessions != null) {
            sessions.remove(session);
            if (sessions.isEmpty()) {
                projectSessions.remove(projectId);
            }
        }
    }

    public Set<WebSocketSession> getSessions(Integer projectId) {
        return projectSessions.getOrDefault(projectId, Set.of());
    }
}
