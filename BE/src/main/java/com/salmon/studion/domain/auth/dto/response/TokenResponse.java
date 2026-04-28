package com.salmon.studion.domain.auth.dto.response;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class TokenResponse {

    private boolean isNewUser;
    private String accessToken;
    private String refreshToken;
    // 진짜 회원가입 완료 전에 포지션 입력 창 넘어갈 때 발급하는 토큰
    private String tmpToken;
}
