package com.salmon.studion.domain.auth.controller;

import com.salmon.studion.domain.auth.dto.response.TokenResponse;
import com.salmon.studion.global.auth.CustomOAuth2User;
import com.salmon.studion.global.common.response.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    @GetMapping("/login/google")
    public ResponseEntity<ApiResponse<TokenResponse>> oauth2Success(Authentication authentication) {
        // principal: 인증된 사용자 객체
        CustomOAuth2User principal = (CustomOAuth2User) authentication.getPrincipal();

        TokenResponse tokenResponse;

        if(principal.isNewUser()) {
            tokenResponse = TokenResponse.builder()
                    .isNewUser(true)
                    .accessToken(null)
                    .refreshToken(null)
                    .tmpToken("tmpToken")
                    .build();
        } else {
            tokenResponse = TokenResponse.builder()
                    .isNewUser(false)
                    .accessToken("accessToken")
                    .refreshToken("refreshToken")
                    .tmpToken(null)
                    .build();
        }

        return ResponseEntity.ok(ApiResponse.success(tokenResponse));
    }
}
