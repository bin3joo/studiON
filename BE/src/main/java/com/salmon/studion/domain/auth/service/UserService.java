package com.salmon.studion.domain.auth.service;

import com.salmon.studion.domain.auth.dto.request.OnboardingRequest;
import com.salmon.studion.domain.auth.entity.PositionDetail;
import com.salmon.studion.domain.auth.entity.PositionGroup;
import com.salmon.studion.domain.auth.entity.User;
import com.salmon.studion.domain.auth.entity.UserPosition;
import com.salmon.studion.domain.auth.repository.PositionDetailRepository;
import com.salmon.studion.domain.auth.repository.PositionGroupRepository;
import com.salmon.studion.domain.auth.repository.UserPositionRepository;
import com.salmon.studion.domain.auth.repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import com.salmon.studion.global.common.response.ErrorCode;
import com.salmon.studion.global.exception.BusinessException;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@RequiredArgsConstructor
public class UserService {

    private final StringRedisTemplate redisTemplate;
    private final UserPositionRepository userPositionRepository;
    private final UserRepository userRepository;
    private final PositionDetailRepository positionDetailRepository;
    private final PositionGroupRepository positionGroupRepository;

    // 모든 포지션 그룹 조회
    public List<PositionGroup> getPositionGroups() {
        return positionGroupRepository.findAllByOrderByOrderAsc();
    }

    // 특정 그룹의 포지션 상세 목록 조회
    public List<PositionDetail> getPositionsByGroup(Integer groupCode) {
        if(!positionGroupRepository.existsById(groupCode)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "존재하지 않는 그룹 코드입니다: " + groupCode);
        }
        return positionDetailRepository.findByPositionGroup_CodeOrderByOrderAsc(groupCode);
    }

    @Transactional
    public void completeOnboarding(Integer userId, String tmpToken, OnboardingRequest request) {

        // 1. Redis 저장값과 대조 (토큰 재사용 방지)
        // 토큰 파싱/타입 검증 => JwtAuthenticationFilter에서 이미 처리
        String storedToken = redisTemplate.opsForValue().get("tmp:" + userId);
        if(storedToken == null || !storedToken.equals(tmpToken)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "이미 사용되었거나 만료된 임시 토큰입니다.");
        }

        // 2. 유저 조회
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."));

        // 3. 포지션 저장
        List<Integer> positionCodes = request.getPositionCodes();

        positionCodes.forEach(code -> {
            PositionDetail positionDetail = positionDetailRepository.findById(code)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "존재하지 않는 포지션 코드입니다.: " + code));

            userPositionRepository.save(UserPosition.of(user, positionDetail));
        });

        // 4. tmp token Redis에서 삭제 (재사용 불가)
        redisTemplate.delete("tmp:" + userId);
    }

    public User getUserByUserId(Integer userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
    }
}
