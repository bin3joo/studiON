package com.salmon.studion.global.auth;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtTokenProvider {

    private final SecretKey secretKey;
    private final long accessTokenExpiration;
    private final long refreshTokenExpiration;
    private final long tmpTokenExpiration;

    public JwtTokenProvider(
            @Value("${spring.jwt.secret}") String secret,
            @Value("${spring.jwt.expiration}") long accessTokenExpiration,
            @Value("${spring.jwt.refresh-expiration}") long refreshTokenExpiration,
            @Value("${spring.jwt.tmp-expiration}") long tmpTokenExpiration
    ) {
        this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessTokenExpiration = accessTokenExpiration;
        this.refreshTokenExpiration = refreshTokenExpiration;
        this.tmpTokenExpiration = tmpTokenExpiration;
    }

    public String generateAccessToken(Integer userId) {
        return generateToken(userId, "ACCESS", accessTokenExpiration);
    }

    public String generateRefreshToken(Integer userId) {
        return generateToken(userId, "REFRESH", refreshTokenExpiration);
    }

    public String generateTmpToken(Integer userId) {
        return generateToken(userId, "TMP", tmpTokenExpiration);
    }

    private String generateToken(Integer userId, String tokenType, long expiration) {
        Date now = new Date();
        Date expiredAt = new Date(now.getTime() + expiration);

        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("tokenType", tokenType)
                .issuedAt(now)
                .expiration(expiredAt)
                .signWith(secretKey)
                .compact();
    }

    // 토큰에서 userId 받아오기
    public Integer getUserIdFromToken(String token) {
        String subject = Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .getSubject();

        return Integer.valueOf(subject);
    }

    // 토큰 타입 가져오기
    public String getTokenType(String token) {
        return Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .get("tokenType", String.class);
    }

    // 토큰 타입 검증
    public void validateTokenType(String token, String expectedType) {
        String tokenType = getTokenType(token);

        if(!expectedType.equals(tokenType)) {
            throw new IllegalArgumentException("잘못된 토큰 타입입니다.");
        }
    }


}
