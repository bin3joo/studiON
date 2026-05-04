package com.salmon.studion.global.auth.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.salmon.studion.global.auth.CustomOAuth2User;
import com.salmon.studion.global.auth.JwtTokenProvider;
import com.salmon.studion.global.auth.PendingOAuthUserInfo;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
@RequiredArgsConstructor
public class OAuth2SuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final JwtTokenProvider jwtTokenProvider;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Value("${spring.jwt.refresh-expiration}")
    private long refreshExpiration;

    @Value("${spring.jwt.tmp-expiration}")
    private long tmpExpiration;

    @Override
    public void onAuthenticationSuccess(
            /*
                Spring Security가 자동으로 넣어주는 값
                request: 지금 들어온 로그인 성공 요청
                response: 프론트로 보낼 응답
                authentication: 로그인 성공한 사용자 정보
             */
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication
    ) throws IOException {
        CustomOAuth2User oAuth2User = (CustomOAuth2User) authentication.getPrincipal();

        // 이동할 url
//        String redirectUrl;

        // 새로 회원가입하는 사람인 경우
        if(oAuth2User.isNewUser()) {
            String onboardingSessionId = UUID.randomUUID().toString();
            String tmpToken = jwtTokenProvider.generateTmpToken(onboardingSessionId);  // tmp token 발급

            PendingOAuthUserInfo pendingOAuthUserInfo = oAuth2User.getPendingOAuthUserInfo();

            // 온보딩 완료 전까지 필요한 OAuth 사용자 정보를 Redis에 임시 저장
            redisTemplate.opsForValue().set(
                    "onboarding:" + onboardingSessionId,   // key: "onboarding:123" 형태
                    objectMapper.writeValueAsString(pendingOAuthUserInfo),              // value: JWT 토큰 문자열
                    tmpExpiration,         // TTL 시간값
                    TimeUnit.MILLISECONDS  // TTL 단위 (밀리초)
            );

            String encodedTmpToken = URLEncoder.encode(tmpToken, StandardCharsets.UTF_8);
            response.sendRedirect(frontendUrl + "/onboarding/profile-setup?tmpToken=" + encodedTmpToken);

        // 기존 회원
        } else {
            Integer userId = oAuth2User.getUserId();

            String accessToken = jwtTokenProvider.generateAccessToken(userId);
            String refreshToken = jwtTokenProvider.generateRefreshToken(userId);

            redisTemplate.opsForValue().set(
                    "refresh:" + userId,
                    refreshToken,
                    refreshExpiration,
                    TimeUnit.MILLISECONDS
            );

            // TODO: 토큰 전달 방식 수정 필요
            response.sendRedirect(frontendUrl + "/auth/callback"
                + "?accessToken=" + accessToken
                + "&refreshToken=" + refreshToken);

        }
    }
}
