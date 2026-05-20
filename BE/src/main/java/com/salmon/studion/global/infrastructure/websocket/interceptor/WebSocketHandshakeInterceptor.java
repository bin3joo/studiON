package com.salmon.studion.global.infrastructure.websocket.interceptor;

import com.salmon.studion.domain.project.service.ProjectMemberService;
import com.salmon.studion.global.auth.JwtTokenProvider;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import com.salmon.studion.global.infrastructure.websocket.util.WebSocketSessionUtils;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class WebSocketHandshakeInterceptor implements HandshakeInterceptor {

    private static final String ACCESS_TOKEN_COOKIE = "ACCESS_TOKEN";

    private final JwtTokenProvider jwtTokenProvider;
    private final ProjectMemberService projectMemberService;

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes
    ) {
        try {
            Integer projectId = WebSocketSessionUtils.extractProjectId(request.getURI());
            Integer userId = authenticate(request);

            projectMemberService.validateProjectMember(projectId, userId);

            attributes.put(WebSocketSessionUtils.PROJECT_ID_ATTRIBUTE, projectId);
            attributes.put(WebSocketSessionUtils.USER_ID_ATTRIBUTE, userId);

            log.info("WS userId={}", userId);
            return true;
        } catch (BusinessException e) {
            response.setStatusCode(e.getErrorCode().getStatus());
            return false;
        } catch (JwtException | IllegalArgumentException e) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        } catch (Exception e) {
            response.setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR);
            return false;
        }
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Exception exception
    ) {
    }

    private Integer authenticate(ServerHttpRequest request) {
        String token = resolveToken(request);
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }

        jwtTokenProvider.validateTokenType(token, "ACCESS");
        return jwtTokenProvider.getUserIdFromToken(token);
    }

    private String resolveToken(ServerHttpRequest request) {
        List<String> cookieHeaders = request.getHeaders().get(HttpHeaders.COOKIE);
        if (cookieHeaders == null || cookieHeaders.isEmpty()) {
            return null;
        }

        for (String cookieHeader : cookieHeaders) {
            String[] cookies = cookieHeader.split(";");
            for (String cookie : cookies) {
                String[] parts = cookie.trim().split("=", 2);
                if (parts.length == 2 && ACCESS_TOKEN_COOKIE.equals(parts[0])) {
                    return parts[1];
                }
            }
        }

        return null;
    }
}
