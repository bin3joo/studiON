package com.salmon.studion.global.auth.filter;

import com.salmon.studion.global.auth.JwtTokenProvider;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    // JWT 생성, 파싱, 검증 담당
    private final JwtTokenProvider jwtTokenProvider;

    // TMP 토큰으로 접근 허용할 유일한 API 경로
    // 신규 OAuth 유저가 온보딩 완료할 때에만 TMP 토큰 사용할 수 있도록 제한
    // ?: 근데 온보딩 시작할 때에만 TMP 토큰 사용할 수 있도록 해야하는거 아닌가?
    private static final String ONBOARDING_URI = "/api/v1/auth/onboarding";
    private static final String TOKEN_TYPE_TMP = "TMP";
    private static final String TOKEN_TYPE_ACCESS = "ACCESS";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        // 클라이언트가 보낸 Authorization 헤더 읽음
        // 보통 JWT => "Authorization: Bearer {token}" 형태로 전달됨
        String header = request.getHeader("Authorization");

        // Authorization 헤더 없거나 Bearer 토큰 형식 아니면 이 필터에서 인증 처리 안하고 다음 필터로 넘김
        // 토큰이 필수인지 여부는 SecurityConfig의 permitAll/authenticated 설정에서 결정
        if(header == null || !header.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        // "Bearer " 이후의 실제 JWT 문자열만 잘라냄
        String token = header.substring(7);  // "Bearer " 이후

        try {
            // 토큰에서 userId 꺼냄
            Integer userId = jwtTokenProvider.getUserIdFromToken(token);
            String tokenType = jwtTokenProvider.getTokenType(token);

            // 현재 요청 URI 가져옴
            // TMP 토큰이 온보딩 API에만 사용되었는지 확인 위함
            String requestUri = request.getRequestURI();

            // 토큰 타입이 TMP인지 확인
            if(TOKEN_TYPE_TMP.equals(tokenType)) {
                // TMP 토큰이지만 온보딩 페이지가 아니라 다른 곳으로 접근 => TMP 토큰으로는 다른 페이지 이동 불가
                if(!ONBOARDING_URI.equals(requestUri)) {
                    response.sendError(HttpServletResponse.SC_FORBIDDEN, "포지션을 입력해주세요.");
                    return;
                }
            // 토큰 타입이 TMP도 아니고 ACCESS도 아닌 경우
            } else if (!TOKEN_TYPE_ACCESS.equals(tokenType)) {
                // 잘못된 토큰 타입 => 아무데도 접근 불가
                response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "잘못된 토큰 타입입니다.");
                return;
            }

            // Spring SecurityContext에 인증 객체 등록
            // principal에 userId 넣고
            // credentials는 JWT 인증에서 별도 필요 없으므로 null
            // authorities는 현재 코드 상 권한/역할 하지 않으므로 빈 리스트
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(userId, null, List.of());

            // 이후 컨트롤러나 다른 필터에서 인증된 사용자로 인식할 수 있도록 SecurityContextHolder에 Authentication 저장
            SecurityContextHolder.getContext().setAuthentication(authentication);

            // 여기까지 왔으면 아래 둘 중 하나
            // 1. TMP 토큰이고 요청 URI가 /api/auth/onboarding
            // 2. ACCESS 토큰

        } catch (JwtException e) {
            // JWT 자체가 유효하지 않은 경우
            // 만료됨, 서명 불일치, 파싱 불가, 변조 등
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "유효하지 않은 토큰입니다.");
            return;
        } catch (IllegalArgumentException e) {
            // 토큰은 파싱됐지만 타입이 허용되지 않은 경우
            // REFRESH 토큰으로 API 접근 등
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "잘못된 토큰 타입입니다.");
        }

        filterChain.doFilter(request, response);
    }
}
