package com.salmon.studion.domain.auth.controller;

import com.salmon.studion.domain.auth.dto.request.OnboardingRequest;
import com.salmon.studion.domain.auth.dto.response.TokenResponse;
import com.salmon.studion.domain.auth.entity.PositionDetail;
import com.salmon.studion.domain.auth.entity.PositionGroup;
import com.salmon.studion.domain.auth.service.UserService;
import com.salmon.studion.global.auth.JwtTokenProvider;
import com.salmon.studion.global.common.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class UserController {

    private final JwtTokenProvider jwtTokenProvider;
    private final UserService userService;

    // 포지션 목록 조회
    @GetMapping("/positions/groups")
    public ResponseEntity<ApiResponse<List<PositionGroup>>> getPositionGroups() {
        return ResponseEntity.ok(ApiResponse.success(userService.getPositionGroups()));
    }

    // 선택한 그룹의 포지션 상세 목록 조회
    @GetMapping("/positions")
    public ResponseEntity<ApiResponse<List<PositionDetail>>> getPositions(
            @RequestParam Integer groupCode
    ) {
        return ResponseEntity.ok(ApiResponse.success(userService.getPositionsByGroup(groupCode)));
    }

    // 온보딩 완료 (tmp token -> access token + refresh token 교환)
    @PostMapping("/onboarding")
    public ResponseEntity<ApiResponse<TokenResponse>> completeOnboarding(
            @RequestHeader("Authorization") String authorization,
            Authentication authentication, // SecurityContext에서 자동 주입
            @RequestBody @Valid OnboardingRequest request
            ) {
        String tmpToken = authorization.substring(7);
        Integer userId = (Integer) authentication.getPrincipal();

        // 포지션 저장 + redis tmp token 삭제
        userService.completeOnboarding(userId, tmpToken, request);

        // 정식 토큰 발급
        TokenResponse response = TokenResponse.builder()
                .isNewUser(false)
                .accessToken(jwtTokenProvider.generateAccessToken(userId))
                .refreshToken(jwtTokenProvider.generateRefreshToken(userId))
                .tmpToken(null)
                .build();

        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
