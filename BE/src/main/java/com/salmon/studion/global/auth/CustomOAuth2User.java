package com.salmon.studion.global.auth;

import com.salmon.studion.domain.auth.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.util.Collection;
import java.util.List;
import java.util.Map;

@RequiredArgsConstructor
public class CustomOAuth2User implements OAuth2User {

    private final User user;
    private final Map<String, Object> attributes;
    private final boolean isNewUser;

    public boolean isNewUser() {
        return isNewUser;
    }

    // 이게 진짜 userId 받아오는거
    public Integer getUserId() {
        return user.getId();
    }

    @Override
    public Map<String, Object> getAttributes() {
        return attributes;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of();
    }

    // Spring Security가 principal 식별할 때 쓰는 이름 => userId로 사용자 식별
    @Override
    public String getName() {
        return String.valueOf(user.getId());
    }
}
