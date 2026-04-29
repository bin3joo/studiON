package com.salmon.studion.global.auth;

import com.salmon.studion.domain.auth.entity.User;
import com.salmon.studion.domain.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CustomOAuth2UserService implements OAuth2UserService<OAuth2UserRequest, OAuth2User> {

    private final UserRepository userRepository;

    @Override
    public OAuth2User loadUser(OAuth2UserRequest userRequest) {
        OAuth2User oAuth2User = new DefaultOAuth2UserService().loadUser(userRequest);

        System.out.println("Google attributes = " + oAuth2User.getAttributes());

        String provider = userRequest.getClientRegistration().getRegistrationId();
        String providerId = oAuth2User.getAttribute("sub");
        String email = oAuth2User.getAttribute("email");
        String profileImgUrl = oAuth2User.getAttribute("picture");
        String nickname = oAuth2User.getAttribute("name");

        // 로그인 한 유저가 이미 가입했는지 확인 후 없으면 새로 DB에 추가
        Optional<User> optionalUser = userRepository.findByProviderAndProviderId(provider, providerId);

        boolean isNewUser = optionalUser.isEmpty();

        User user = optionalUser
                .map(existingUser -> {
                    existingUser.updateLastLoginAt();
                    return existingUser;
                })
                .orElseGet(() -> userRepository.save(
                        User.builder()
                                .email(email)
                                .provider(provider)
                                .providerId(providerId)
                                .profileImgUrl(profileImgUrl)
                                .nickname(nickname)
                                .build()
                ));

        return new CustomOAuth2User(user, oAuth2User.getAttributes(), isNewUser);
    }
}
